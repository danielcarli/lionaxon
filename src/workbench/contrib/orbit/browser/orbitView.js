/*---------------------------------------------------------------------------------------------
 *  LionAxon — Copyright (C) 2026 LionAxon Team.
 *  Created and conceived by Daniel Michelon De Carli.
 *  Licensed under the GNU General Public License v3.0 or later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/
// The 3D viewer: the current step seen from any angle. Dragging turns the model all the way round (and
// over, and under); the wheel zooms; the right button, the middle button or Space pans. The angle found
// can become the step's angle on the sheet, or be added to it: the step then shows its drawings side by
// side, still as one step with one caption.
// The model can be changed from here too: a click selects a shape (its numbers are in the properties), a
// drag that starts on a shape slides it on the ground, the round handle over a selected volume pulls its
// height, and Delete, duplicate, copy and paste work as in the axonometric. A drag that starts on the paper
// turns the view. Drawing new shapes stays in the axonometric and the plan. It draws with the sheet's renderer.
import { h, setChildren } from '../../../../base/browser/dom.js';
import { icon } from '../../../../base/browser/icons.js';
import { t, formatNumber } from '../../../../base/common/nls.js';
import { makeView, project, unproject } from '../../../../base/common/geometry/projection.js';
import { renderStep, padBox } from '../../../services/render/common/renderer.js';
import { getStyle } from '../../../services/render/common/styles.js';
import { stepAngles, normalizeAngle, sameAngle, isLine, ISO_EL, MAX_VIEWS } from '../../../services/model/common/model.js';
import { meters } from '../../../services/export/browser/exportService.js';
import { isTyping } from '../../drawing/browser/drawingView.js';
import { PickCycle } from '../../drawing/browser/pickCycle.js';

const NS = 'http://www.w3.org/2000/svg';
const r3 = (v) => Math.round(v * 1000) / 1000;
const DEG_PER_PX = 0.45;
const SEL = '#2f74e8';
const CLICK_PX = 4;       // a press that moves less than this is a click
const PREFS_KEY = 'lionaxon.orbit';
/** How the middle button turns and moves the view: 'rev' (drag pans, Shift orbits) or 'sketch' (the other way round). */
export const NAV_STYLES = ['rev', 'sketch'];
/** The handles of a shape, in its own frame: [name, side along the width (−1, 0, 1), side along the depth]. Sides first, then corners. */
const SIDES = [['e', 1, 0], ['w', -1, 0], ['n', 0, 1], ['s', 0, -1], ['ne', 1, 1], ['nw', -1, 1], ['se', 1, -1], ['sw', -1, -1]];
const isSphere = (o) => (o.type === 'volume' || o.type === 'cut') && o.shape === 'sphere';
/** The kinds of object whose width and depth are pulled by handles here. */
const SIZABLE = ['volume', 'cut', 'platform', 'slope', 'area'];
/** The faces of the view cube: the angle each one looks from, and the key of its name. */
const CUBE_FACES = [
  { n: [0, 0, 1], key: 'orbit.preset.top', el: 90 }, { n: [0, 0, -1], key: 'orbit.preset.below', el: -90 },
  { n: [0, -1, 0], key: 'opening.side.front', az: 270 }, { n: [1, 0, 0], key: 'opening.side.right', az: 0 },
  { n: [0, 1, 0], key: 'opening.side.back', az: 90 }, { n: [-1, 0, 0], key: 'opening.side.left', az: 180 },
];
const FLAT = 0.12;        // below this the ground (or the height) is seen too edge-on to drag on
const wrap360 = (a) => ((a % 360) + 360) % 360;
const clampEl = (e) => Math.max(-90, Math.min(90, e));
const fmtDeg = (v) => `${formatNumber(Math.round(v * 10) / 10, 1)}°`;

export class OrbitView {
  constructor(services) {
    this.s = services;
    this.doc = services.document;
    this.layout = services.layout;
    this.mode = 'orbit';
    this.angle = { az: 315, el: ISO_EL }; // what the viewer looks from now
    this.slot = 0;            // which of the step's angles the viewer started from (replaced by "use")
    this.cam = null;          // { dx, dy, scale }: offset of the screen centre from the projected site centre
    this.drag = null;
    this.spaceDown = false;
    this.loadedStep = null;   // the step whose angle was last taken

    this.svg = document.createElementNS(NS, 'svg');
    this.svg.setAttribute('xmlns', NS);
    this.bg = document.createElementNS(NS, 'rect');
    this.content = document.createElementNS(NS, 'g');
    this.overlay = document.createElementNS(NS, 'g');
    this.svg.append(this.bg, this.content, this.overlay);
    this.canvas = h('div.canvas.orbit-canvas', { 'data-tool': 'orbit' }, this.svg);
    this.toolbar = h('div.toolbar.orbit-toolbar');
    this.angles = h('div.orbit-angles', { role: 'listbox', 'aria-label': t('orbit.angles') });
    this.readout = h('div.orbit-readout', { 'aria-live': 'polite' });
    this.element = h('div.editor-view', { 'data-view': 'orbit' }, this.toolbar,
      h('div.canvas-wrap', this.canvas, this.angles, this.readout,
        h('div.canvas-corner',
          h('button.icon-button', { title: t('drawing.fit') + ' (F)', html: icon('fit', 16), onclick: () => this.fit() }))));

    this.cycle = new PickCycle(this); // Tab: the next object under the same spot
    // what the person chose for the viewer, kept between sessions: the way of the mouse, the tool of the left
    // button on the paper (orbit or pan), and whether labels are drawn (off: they hide the model while it turns)
    this.prefs = { nav: 'rev', tool: 'orbit', labels: false };
    try { const saved = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}'); if (NAV_STYLES.includes(saved.nav)) this.prefs.nav = saved.nav; if (saved.tool === 'pan') this.prefs.tool = 'pan'; this.prefs.labels = saved.labels === true; } catch { /* no storage */ }
    this.pivot = null;         // the point the view turns around, when it is not the middle of the site
    this.lastMiddle = 0;       // when the middle button was last pressed (twice in a row fits the drawing)
    this.cube = h('div.view-cube', { 'aria-label': t('orbit.cube') });
    this.canvas.append(this.cube);
    this.#bind();
    new ResizeObserver(() => { if (this.visible) this.#applyCamera(); }).observe(this.canvas);
    this.doc.onDidChange((e) => {
      if (e.kind === 'file' || e.kind === 'tabs') return;
      if (e.kind === 'selection') { if (this.visible) this.#renderSelection(); return; }
      // a new step (or diagram): look at it from its own angle
      if (e.kind === 'step' || e.kind === 'load') { this.loadedStep = null; if (e.kind === 'load') this.cam = null; }
      if (!this.visible) return;
      this.#takeStepAngle();
      this.render();
    });
    this.layout.onDidChange((what) => {
      if (what !== 'tab' || !this.visible) return;
      queueMicrotask(() => { if (!this.visible) return; this.#takeStepAngle(); if (this.cam) this.render(); else this.fit(); });
    });
  }

  get visible() { return this.layout.tab === this.mode; }
  get view() { return makeView(this.angle.az, this.angle.el); }
  get style() { return getStyle(this.doc.project.style); }
  /** The angles of the current step on the sheet, and whether they are its own (not the project's). */
  get stepAngles() { return stepAngles(this.doc.project, this.doc.step); }
  get ownAngles() { return this.doc.step.views?.length > 0; }

  #takeStepAngle() {
    if (this.loadedStep === this.doc.step.id) return;
    this.loadedStep = this.doc.step.id;
    this.slot = 0;
    this.angle = { ...this.stepAngles[0] };
    this.#renderToolbar();
  }

  /** Looks from an angle (degrees). */
  setAngle(az, el) {
    this.angle = normalizeAngle({ az: wrap360(az), el: clampEl(el) });
    this.#renderToolbar();
    this.#scheduleRender();
  }

  /** Turns the view by (dAz, dEl) degrees. */
  turn(dAz, dEl = 0) { this.setAngle(this.angle.az + dAz, this.angle.el + dEl); }

  // ---- camera

  /** The point the view turns around: the one set (the selection), else the middle of the site, at half the height of what is drawn. */
  #pivot() {
    if (this.pivot) return this.pivot;
    const p = this.doc.project;
    return [p.site.w / 2, p.site.d / 2, this.midZ || 0];
  }

  /** Turns around another point from now on, without moving what is on the screen (null: the middle of the site). */
  #setPivot(point) {
    if (!this.cam) { this.pivot = point; return; }
    const [x0, y0] = project(this.view, this.#pivot());
    this.pivot = point;
    const [x1, y1] = project(this.view, this.#pivot());
    this.cam.dx += x0 - x1;
    this.cam.dy += y0 - y1;
  }

  /** The middle of what is selected (its place on the ground and half its height), or null. */
  #selectionCentre() {
    const sel = this.doc.selected().filter((o) => Number.isFinite(o.x) && Number.isFinite(o.y));
    if (!sel.length) return null;
    const ext = sel.map((o) => this.s.views.axon.extentOf(o));
    const mid = (list) => (Math.min(...list) + Math.max(...list)) / 2;
    return [mid(sel.map((o) => o.x)), mid(sel.map((o) => o.y)), (Math.min(...ext.map((e) => e.z0)) + Math.max(...ext.map((e) => e.z1))) / 2];
  }

  #savePrefs() { try { localStorage.setItem(PREFS_KEY, JSON.stringify(this.prefs)); } catch { /* no storage */ } }

  /** The way of the middle button: 'rev' or 'sketch'. */
  setNav(nav) { if (NAV_STYLES.includes(nav)) { this.prefs.nav = nav; this.#savePrefs(); this.#renderToolbar(); } }
  /** What the left button does on the paper: 'orbit' or 'pan'. */
  setTool(tool) { this.prefs.tool = tool === 'pan' ? 'pan' : 'orbit'; this.canvas.dataset.tool = this.prefs.tool; this.#savePrefs(); this.#renderToolbar(); }
  /** Whether the labels are drawn in the viewer. */
  setLabels(on) { this.prefs.labels = !!on; this.#savePrefs(); this.#renderToolbar(); this.render(); }

  #centre() {
    const [X, Y] = project(this.view, this.#pivot());
    return [X + (this.cam?.dx || 0), Y + (this.cam?.dy || 0)];
  }

  #applyCamera() {
    const W = this.canvas.clientWidth, H = this.canvas.clientHeight;
    if (!W || !H || !this.cam) return;
    const [cx, cy] = this.#centre();
    const w = W / this.cam.scale, hh = H / this.cam.scale;
    const vb = [cx - w / 2, cy - hh / 2, w, hh];
    this.svg.setAttribute('viewBox', vb.map(r3).join(' '));
    for (const [k, v] of Object.entries({ x: vb[0], y: vb[1], width: vb[2], height: vb[3] })) this.bg.setAttribute(k, r3(v));
    this.bg.setAttribute('fill', this.style.paper);
  }

  fit() {
    const W = this.canvas.clientWidth, H = this.canvas.clientHeight;
    if (!W || !H) { this.cam = null; return; }
    this.#takeStepAngle();
    const box = padBox(this.#markup(1).bbox, 0.1);
    // the pivot sits at half the height of the model (read from a level side view): turning keeps it in place
    const side = renderStep(this.doc.project, this.doc.stepIndex, { view: makeView(0, 0), lw: 0.1 }).bbox;
    this.midZ = -(side[1] + side[3]) / 2;
    this.pivot = null;
    const [px, py] = project(this.view, this.#pivot());
    const scale = Math.min(W / (box[2] - box[0]), H / (box[3] - box[1]));
    this.cam = { dx: (box[0] + box[2]) / 2 - px, dy: (box[1] + box[3]) / 2 - py, scale };
    this.render();
  }

  zoomAt(factor, X, Y) {
    if (!this.cam) return;
    const s = Math.min(400, Math.max(0.3, this.cam.scale * factor));
    const k = this.cam.scale / s;
    const [cx, cy] = this.#centre();
    this.cam.dx += (X - cx) * (1 - k);
    this.cam.dy += (Y - cy) * (1 - k);
    this.cam.scale = s;
    this.#scheduleRender();
  }

  #scheduleRender() {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => { this.raf = 0; if (this.visible) this.render(); });
  }

  // ---- rendering

  #markup(scale) {
    return renderStep(this.doc.project, this.doc.stepIndex, { view: this.view, lw: 1.15 / scale, grid: true, ids: true, fmt: meters, labels: this.prefs.labels });
  }

  render() {
    if (!this.visible) return;
    if (!this.cam) { this.fit(); return; }
    const r = this.#markup(this.cam.scale);
    this.content.innerHTML = r.markup;
    this.#applyCamera();
    this.#renderSelection();
    this.#renderAngles();
  }

  // ---- selection and editing

  /** The selected volume whose height can be pulled from here, if it is the only thing selected. */
  #heightTarget() {
    const sel = this.doc.selected();
    const o = sel.length === 1 ? sel[0] : null;
    return o && o.type === 'volume' && o.shape !== 'sphere' && !o.locked && !o.hidden && Number.isFinite(o.h) ? o : null;
  }

  /** Where the height handle of a volume sits: over the middle of its top. */
  heightHandle(o = this.#heightTarget()) {
    if (!o || Math.abs(this.view.e2[2]) < FLAT) return null;
    const [X, Y] = this.#topOf(o);
    // a little above the top (below it, seen from below), so that the top itself can still be grabbed
    return [X, Y - Math.sign(this.view.e2[2]) * (22 / (this.cam?.scale || 1))];
  }

  #topOf(o) { return project(this.view, [o.x, o.y, this.s.views.axon.extentOf(o).z1]); }

  /** Marks what is selected, and draws the height handle of a single selected volume. */
  #renderSelection() {
    const scale = this.cam?.scale || 1;
    this.content.style.setProperty('--sel-w', String(r3(1.9 / scale)));
    for (const el of this.content.querySelectorAll('.orbit-sel')) el.classList.remove('orbit-sel');
    // the edges take the selection colour — not the seams between the facets of a round side, drawn in its fill
    const edge = (el) => { const k = el.getAttribute('stroke'); if (k && k !== 'none' && k !== el.getAttribute('fill')) el.classList.add('orbit-sel'); };
    for (const id of this.doc.selection) {
      for (const el of this.content.querySelectorAll(`[data-id="${CSS.escape(id)}"]`)) { edge(el); for (const c of el.querySelectorAll('[stroke]')) edge(c); }
    }
    const at = this.heightHandle();
    const from = at ? this.#topOf(this.#heightTarget()) : null;
    this.overlay.innerHTML = this.#sizeHandles(scale) + (at
      ? `<line x1="${r3(from[0])}" y1="${r3(from[1])}" x2="${r3(at[0])}" y2="${r3(at[1])}" stroke="${SEL}" stroke-width="${r3(1.4 / scale)}" pointer-events="none"/><circle data-handle="h" cx="${r3(at[0])}" cy="${r3(at[1])}" r="${r3(6 / scale)}" fill="#fff" stroke="${SEL}" stroke-width="${r3(1.8 / scale)}"><title>${t('prop.height')}</title></circle>`
      : '');
    this.cycle.mark();
  }

  /** The single selected shape whose width and depth are pulled from here. */
  #sizeTarget() {
    const sel = this.doc.selected();
    const o = sel.length === 1 ? sel[0] : null;
    return o && SIZABLE.includes(o.type) && o.shape !== 'poly' && !o.locked && !o.hidden && Number.isFinite(o.w) && Number.isFinite(o.d) ? o : null;
  }

  /** Where the handle of a side of a shape sits in the world: the middle of that side, at the top of the shape. */
  sizeHandleAt(o, side) {
    const [, sx, sy] = SIDES.find((x) => x[0] === side);
    const a = ((o.rot || 0) * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a);
    const lx = (sx * o.w) / 2, ly = (sy * (isSphere(o) ? o.w : o.d)) / 2;
    const ext = this.s.views.axon.extentOf(o);
    // at the top of the shape (the middle of a sphere: that is where it is widest)
    const z = isSphere(o) ? (ext.z0 + ext.z1) / 2 : o.type === 'platform' ? ext.top ?? ext.z1 : ext.z1;
    return [o.x + lx * c - ly * sn, o.y + lx * sn + ly * c, z];
  }

  /** The handles of the sides and corners of the selected shape (a sphere: its diameter; none seen level: the ground is a line then). */
  #sizeHandles(scale) {
    const o = this.#sizeTarget();
    if (!o || Math.abs(this.view.cam[2]) < FLAT) return '';
    const r = 4.2 / scale;
    return SIDES.filter(([, sx, sy]) => !isSphere(o) || sy === 0).map(([side]) => {
      const [X, Y] = project(this.view, this.sizeHandleAt(o, side));
      return `<rect data-handle="${side}" x="${r3(X - r)}" y="${r3(Y - r)}" width="${r3(2 * r)}" height="${r3(2 * r)}" rx="${r3(r * 0.25)}" fill="#fff" stroke="${SEL}" stroke-width="${r3(1.6 / scale)}"/>`;
    }).join('');
  }

  #hit(e) {
    const handle = e.target.closest?.('[data-handle]');
    if (handle) return { handle: handle.dataset.handle };
    const el = e.target.closest?.('[data-id]');
    const o = el ? this.doc.byId(el.dataset.id) : null;
    if (o?.locked) return { locked: o.id };
    return o ? { id: this.cycle.resolve(o.id) } : {};
  }

  /** The selected objects and the volumes standing on them, as they are now. */
  #group() {
    const ids = new Set(this.doc.selection);
    let grew = true;
    while (grew) {
      grew = false;
      for (const o of this.doc.objects) if (o.type === 'volume' && o.on && ids.has(o.on) && !ids.has(o.id)) { ids.add(o.id); grew = true; }
    }
    return new Map(this.doc.objects.filter((o) => ids.has(o.id) && !o.locked).map((o) => [o.id, structuredClone(o)]));
  }

  #snap(v, e, g = this.doc.project.grid) { return e.altKey ? Math.round(v * 100) / 100 : Math.round(v / g) * g; }

  /** A move of the mouse (in drawing units) as a move on the ground, in metres. */
  #groundDelta(dX, dY) {
    const v = this.view;
    // seen level, the ground is a line: only what goes sideways on the screen can be told
    if (Math.abs(v.cam[2]) < FLAT) return [dX * v.e1[0], dX * v.e1[1]];
    return unproject(v, dX, dY, 0);
  }

  /** Window coordinates of a point of the drawing — for the tests. */
  clientAt([X, Y]) {
    const r = this.svg.getBoundingClientRect();
    const vb = this.svg.viewBox.baseVal;
    return [r.left + ((X - vb.x) / vb.width) * r.width, r.top + ((Y - vb.y) / vb.height) * r.height];
  }

  toDrawing(e) {
    const r = this.svg.getBoundingClientRect();
    const vb = this.svg.viewBox.baseVal;
    return [vb.x + ((e.clientX - r.left) / r.width) * vb.width, vb.y + ((e.clientY - r.top) / r.height) * vb.height];
  }

  // ---- the toolbar: presets, the angle in numbers, and what to do with it

  #renderToolbar() {
    const a = this.angle;
    const preset = (key, run, active = false) => h('button.tool.tool-text', {
      class: active ? 'tool tool-text active' : 'tool tool-text', 'data-preset': key, title: t('orbit.preset.' + key + 'Tip'), onclick: run,
    }, t('orbit.preset.' + key));
    const nearestIso = 45 + 90 * Math.round((wrap360(a.az) - 45) / 90);
    const presets = h('div.tool-group', { role: 'group', 'aria-label': t('orbit.presets') },
      preset('iso', () => this.setAngle(nearestIso, ISO_EL), Math.abs(a.el - ISO_EL) < 0.01 && wrap360(a.az) % 90 === 45),
      preset('top', () => this.setAngle(a.az, 90), a.el === 90),
      preset('front', () => this.setAngle(270, 0), a.el === 0 && a.az === 270),
      preset('below', () => this.setAngle(a.az, -ISO_EL), a.el < 0));
    const turns = h('div.tool-group',
      h('button.tool', { title: t('orbit.turnLeft'), html: icon('rotateLeft', 17), onclick: () => this.turn(-15) }),
      h('button.tool', { title: t('orbit.turnRight'), html: icon('rotateRight', 17), onclick: () => this.turn(15) }));
    const field = (key, value, min, max, label) => h('label.orbit-field', { title: t('orbit.' + key + 'Tip') },
      h('span', label),
      h('input', {
        type: 'number', step: 1, min, max, value: String(Math.round(value * 10) / 10), 'data-key': key, 'aria-label': t('orbit.' + key + 'Tip'),
        onchange: (e) => { const v = Number(e.target.value); if (Number.isFinite(v)) this.setAngle(key === 'az' ? v : a.az, key === 'el' ? v : a.el); },
        onkeydown: (e) => { if (e.key === 'Enter') e.target.blur(); },
      }), h('span.unit', '°'));
    setChildren(this.toolbar, presets, h('span.sep'), turns, h('span.sep'),
      h('div.orbit-fields', field('az', a.az, 0, 359, t('orbit.az')), field('el', a.el, -90, 90, t('orbit.el'))),
      h('span.sep'),
      // what the left button does on the paper: orbit (O) or pan (H)
      h('div.tool-group', { role: 'radiogroup', 'aria-label': t('orbit.leftTool') },
        h('button.tool', { class: this.prefs.tool === 'orbit' ? 'tool active' : 'tool', role: 'radio', 'aria-checked': String(this.prefs.tool === 'orbit'), 'data-nav-tool': 'orbit', title: t('orbit.toolOrbit'), html: icon('orbit', 17), onclick: () => this.setTool('orbit') }),
        h('button.tool', { class: this.prefs.tool === 'pan' ? 'tool active' : 'tool', role: 'radio', 'aria-checked': String(this.prefs.tool === 'pan'), 'data-nav-tool': 'pan', title: t('orbit.toolPan'), html: icon('hand', 17), onclick: () => this.setTool('pan') })),
      h('label.orbit-nav', { title: t('orbit.navTip') }, h('span', t('orbit.nav')),
        h('select', { 'data-key': 'nav', 'aria-label': t('orbit.navTip'), onchange: (e) => this.setNav(e.target.value) },
          NAV_STYLES.map((n) => h('option', { value: n, selected: this.prefs.nav === n }, n === 'rev' ? 'Rev' : 'Sketch')))),
      h('button.tool', { class: this.prefs.labels ? 'tool active' : 'tool', 'data-action': 'labels', 'aria-pressed': String(this.prefs.labels), title: t('orbit.labelsTip'), html: icon('text', 17), onclick: () => this.setLabels(!this.prefs.labels) }),
      h('span.grow'),
      // the way to where new shapes are drawn (what can be done here is in the status bar)
      h('button.tool', { 'data-action': 'edit', title: t('orbit.editTip'), 'aria-label': t('orbit.edit'), html: icon('pencil', 17), onclick: () => this.layout.setTab('axon') }));
    this.#renderAngles();
    this.#renderCube();
    this.readout.textContent = `${t('orbit.az')} ${fmtDeg(a.az)} · ${t('orbit.el')} ${fmtDeg(a.el)}`;
  }

  /**
   * The view cube, in a corner: a small cube seen from where the model is seen. A click on a face looks straight
   * at that side, a click on a corner looks from that corner (isometric).
   */
  #renderCube() {
    const v = this.view, R = 23, C = 38;
    const P = (p) => { const [X, Y] = project(v, p); return [C + X * R, C + Y * R]; };
    const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    let faces = '', labels = '';
    for (const f of CUBE_FACES) {
      const facing = dot3(f.n, v.cam);
      if (facing < 0.04) continue;
      // the four corners of the face: the two other axes, at ±1
      const [u, w] = f.n[0] ? [[0, 1, 0], [0, 0, 1]] : f.n[1] ? [[1, 0, 0], [0, 0, 1]] : [[1, 0, 0], [0, 1, 0]];
      const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => P([f.n[0] + u[0] * a + w[0] * b, f.n[1] + u[1] * a + w[1] * b, f.n[2] + u[2] * a + w[2] * b]));
      const mid = P(f.n);
      const name = t(f.key);
      faces += `<polygon class="cube-face" data-face="${f.key}" points="${pts.map((q) => q.map(r3).join(',')).join(' ')}"><title>${name}</title></polygon>`;
      if (facing > 0.45) labels += `<text x="${r3(mid[0])}" y="${r3(mid[1])}" text-anchor="middle" dominant-baseline="central" font-size="${name.length > 6 ? 6.5 : 8}">${name.length > 9 ? name.slice(0, 8) + '…' : name}</text>`;
    }
    let corners = '';
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
      if (dot3([x, y, z], v.cam) < 0.35) continue;
      const [X, Y] = P([x, y, z]);
      corners += `<circle class="cube-corner" data-corner="${x},${y},${z}" cx="${r3(X)}" cy="${r3(Y)}" r="4.2"><title>${t('orbit.preset.iso')}</title></circle>`;
    }
    this.cube.innerHTML = `<svg viewBox="0 0 76 76" width="76" height="76">${faces}${labels}${corners}</svg>`;
  }

  /** A click on the view cube: a face (looked at straight) or a corner (isometric from it). */
  #cubeClick(e) {
    const face = e.target.closest?.('[data-face]'), corner = e.target.closest?.('[data-corner]');
    if (corner) {
      const [x, y, z] = corner.dataset.corner.split(',').map(Number);
      this.setAngle((Math.atan2(y, x) * 180) / Math.PI, z > 0 ? ISO_EL : -ISO_EL);
    } else if (face) {
      const f = CUBE_FACES.find((c) => c.key === face.dataset.face);
      // top and below keep the way the model is turned; the sides are looked at level
      if (f.el !== undefined) this.setAngle(this.angle.az, f.el); else this.setAngle(f.az, 0);
    }
  }

  /**
   * The angles of the step, as chips over the drawing (a click looks from it, × takes it out), and what to
   * do with the angle in view: use it for the step, or add it beside the others.
   */
  #renderAngles() {
    const a = this.angle;
    const own = this.ownAngles;
    const list = this.stepAngles;
    const same = list.some((x) => sameAngle(x, a));
    const use = h('button.orbit-action', {
      'data-action': 'use', title: t('orbit.useTip'), disabled: sameAngle(list[this.slot] || list[0], a),
      onclick: () => { this.s.commands.setStepAngle(this.slot, a); },
    }, h('span', { html: icon('check', 14) }), t('orbit.use'));
    const add = h('button.orbit-action', {
      'data-action': 'add', title: t('orbit.addTip'), disabled: same || list.length >= MAX_VIEWS,
      onclick: () => { this.slot = this.s.commands.addStepAngle(a); this.#renderAngles(); },
    }, h('span', { html: icon('duplicate', 14) }), t('orbit.add'));
    const reset = own ? h('button.orbit-action', {
      'data-action': 'reset', title: t('orbit.resetTip'),
      onclick: () => { this.s.commands.resetStepAngles(); this.loadedStep = null; this.#takeStepAngle(); this.render(); },
    }, t('orbit.reset')) : null;

    const chips = list.map((x, j) => h('div.orbit-chip', {
      class: sameAngle(x, this.angle) ? 'orbit-chip active' : 'orbit-chip', role: 'option', 'aria-selected': String(sameAngle(x, this.angle)), 'data-angle': j,
      title: t('orbit.lookFrom'),
      onclick: () => { this.slot = j; this.setAngle(x.az, x.el); },
    },
    h('span.orbit-chip-n', String(j + 1)),
    h('span', `${fmtDeg(x.az)} / ${fmtDeg(x.el)}`),
    own ? h('button.orbit-chip-x', {
      title: t('orbit.remove'), 'aria-label': t('orbit.remove'), html: icon('close', 11),
      onclick: (e) => { e.stopPropagation(); this.s.commands.removeStepAngle(j); this.slot = Math.max(0, Math.min(this.slot, this.stepAngles.length - 1)); },
    }) : null));
    setChildren(this.angles, h('span.orbit-angles-label', own ? t('orbit.stepAngles', { n: list.length }) : t('orbit.projectAngle')), chips,
      h('div.orbit-actions', use, add, reset));
  }

  // ---- mouse and keyboard

  #bind() {
    const svg = this.svg;
    svg.addEventListener('wheel', (e) => {
      e.preventDefault();
      const [X, Y] = this.toDrawing(e);
      this.zoomAt(Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015)), X, Y);
    }, { passive: false });
    svg.addEventListener('pointerdown', (e) => {
      if (!this.cam) return;
      if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
      try { svg.setPointerCapture(e.pointerId); } catch { /* a synthetic pointer */ }
      // which way the view goes: the middle button in 'rev' mode (drag pans, Shift orbits) or 'sketch' mode (drag orbits,
      // Shift pans); the right button pans (Shift orbits); the left button on the paper follows the
      // tool (orbit or pan), and pans with Space held
      let nav = null;
      if (e.button === 1) {
        if (performance.now() - this.lastMiddle < 380) { this.lastMiddle = 0; e.preventDefault(); this.fit(); return; }
        this.lastMiddle = performance.now();
        nav = (this.prefs.nav === 'sketch') !== e.shiftKey ? 'orbit' : 'pan';
      } else if (e.button === 2) nav = e.shiftKey ? 'orbit' : 'pan';
      else if (e.button === 0 && this.spaceDown) nav = 'pan';
      else if (e.button !== 0) return;
      const pan = nav !== null;
      e.preventDefault();
      const base = { sx: e.clientX, sy: e.clientY, az: this.angle.az, el: this.angle.el, dx: this.cam.dx, dy: this.cam.dy };
      if (!pan) this.cycle.setPoint(e);
      const hit = pan ? {} : this.#hit(e);
      if (hit.handle === 'h') {
        const o = this.#heightTarget();
        if (o) { this.drag = { ...base, kind: 'height', id: o.id, h0: o.h, moved: false }; this.canvas.classList.add('editing'); return; }
      } else if (hit.handle) {
        const o = this.#sizeTarget();
        if (o) { this.drag = { ...base, kind: 'size', id: o.id, side: hit.handle, start: structuredClone(o), moved: false }; this.canvas.classList.add('editing'); return; }
      }
      if (hit.id) {
        // a shape: select it (Shift adds or takes out); a drag from here slides the selection on the ground
        if (e.shiftKey) {
          const ids = new Set(this.doc.selection);
          if (ids.has(hit.id)) ids.delete(hit.id); else ids.add(hit.id);
          this.doc.select([...ids]);
        } else if (!this.doc.selection.has(hit.id)) this.doc.select([hit.id]);
        if (this.doc.selection.has(hit.id)) { this.drag = { ...base, kind: 'move', id: hit.id, start: this.#group(), moved: false }; this.canvas.classList.add('editing'); }
        return;
      }
      const kind = nav || this.prefs.tool;
      // the view turns around what is selected (else around the middle of the site)
      if (kind === 'orbit') this.#setPivot(this.#selectionCentre());
      this.drag = { ...base, dx: this.cam.dx, dy: this.cam.dy, kind, click: !nav, free: !!nav, lockedId: hit.locked || null };
      this.canvas.classList.add(kind === 'pan' ? 'panning' : 'orbiting');
    });
    svg.addEventListener('pointermove', (e) => this.#move(e));
    const end = () => { this.drag = null; this.canvas.classList.remove('panning', 'orbiting', 'editing'); };
    svg.addEventListener('pointerup', (e) => {
      const d = this.drag;
      if ((d?.kind === 'move' || d?.kind === 'height' || d?.kind === 'size') && d.moved) this.doc.end();
      // a click on the paper (not a drag): nothing is selected any more
      if (d?.click && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < CLICK_PX) {
        // a click on a locked shape selects it (to unlock it); a click on the paper clears the selection
        if (d.lockedId && this.doc.byId(d.lockedId)) this.doc.select([d.lockedId]);
        else if (this.doc.selection.size) this.doc.clearSelection();
      }
      end();
    });
    svg.addEventListener('pointercancel', () => { if (['move', 'height', 'size'].includes(this.drag?.kind) && this.drag.moved) this.doc.end(); end(); });
    svg.addEventListener('auxclick', (e) => e.preventDefault());
    this.cube.addEventListener('click', (e) => this.#cubeClick(e));
    svg.addEventListener('dblclick', (e) => { if (e.button === 0 && !this.#hit(e).id && !this.#hit(e).handle) this.fit(); });
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'Space' || isTyping(e) || !this.visible || document.querySelector('.cm-overlay')) return;
      e.preventDefault();
      this.spaceDown = true;
    });
    window.addEventListener('keyup', (e) => { if (e.code === 'Space') this.spaceDown = false; });
  }

  #move(e) {
    const d = this.drag;
    if (!d) { this.cycle.setHover(e); return; }
    const mx = e.clientX - d.sx, my = e.clientY - d.sy;
    if (d.kind === 'pan') {
      this.cam.dx = d.dx - mx / this.cam.scale;
      this.cam.dy = d.dy - my / this.cam.scale;
      this.#applyCamera();
      return;
    }
    if (d.kind === 'move') {
      if (!d.moved && Math.hypot(mx, my) < CLICK_PX) return;
      let [dx, dy] = this.#groundDelta(mx / this.cam.scale, my / this.cam.scale);
      dx = this.#snap(dx, e); dy = this.#snap(dy, e);
      if (!d.moved) { if (Math.hypot(dx, dy) < 1e-9) return; d.moved = true; this.doc.begin('object.move'); }
      this.doc.update((_p, step) => {
        for (const o of step.objects) {
          const s0 = d.start.get(o.id);
          if (!s0) continue;
          if (o.type === 'opening') { /* it stays on its wall */ } else if (isLine(o)) { o.x1 = r3(s0.x1 + dx); o.y1 = r3(s0.y1 + dy); o.x2 = r3(s0.x2 + dx); o.y2 = r3(s0.y2 + dy); }
          else { o.x = r3(s0.x + dx); o.y = r3(s0.y + dy); }
        }
      });
      return;
    }
    if (d.kind === 'size') {
      // each side pulled follows the mouse along its own direction; the opposite side stays where it is
      const [, sx, sy] = SIDES.find((x) => x[0] === d.side);
      const o0 = d.start;
      const a = ((o0.rot || 0) * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a);
      const [gx, gy] = this.#groundDelta(mx / this.cam.scale, my / this.cam.scale);
      const min = e.altKey ? 0.1 : Math.max(0.1, this.doc.project.grid);
      // how much the width and the depth grow (metres), and where that takes the middle
      const growW = sx ? Math.max(min, this.#snap(o0.w + sx * (gx * c + gy * sn), e)) - o0.w : 0;
      const growD = sy ? Math.max(min, this.#snap(o0.d + sy * (-gx * sn + gy * c), e)) - o0.d : 0;
      if (!d.moved) { if (Math.abs(growW) < 1e-9 && Math.abs(growD) < 1e-9) return; d.moved = true; this.doc.begin('object.resize'); }
      this.doc.update((_p, step) => {
        const o = step.objects.find((x) => x.id === d.id);
        if (!o) return;
        o.w = r3(o0.w + growW);
        o.d = r3(isSphere(o0) ? o.w : o0.d + growD);
        if (isSphere(o0) && o0.type === 'cut') o.h = o.w;
        const lx = (sx * growW) / 2, ly = (sy * growD) / 2;
        o.x = r3(o0.x + lx * c - ly * sn);
        o.y = r3(o0.y + lx * sn + ly * c);
      });
      return;
    }
    if (d.kind === 'height') {
      // up on the screen is up in the model (or down, seen from below)
      const hh = Math.max(0.5, this.#snap(d.h0 - my / this.cam.scale / this.view.e2[2], e, 0.5));
      if (!d.moved) { if (Math.abs(hh - d.h0) < 1e-9) return; d.moved = true; this.doc.begin('object.resize'); }
      this.doc.update((_p, step) => { const o = step.objects.find((x) => x.id === d.id); if (o) o.h = r3(hh); });
      return;
    }
    // drag right: the model turns to the right; drag down: it tips towards you (seen more from above)
    let az = d.az - mx * DEG_PER_PX, el = d.el + my * DEG_PER_PX;
    // Shift snaps to 15° with the left button (with the others it is what chose to orbit)
    if (e.shiftKey && !d.free) { az = Math.round(az / 15) * 15; el = Math.round(el / 15) * 15; }
    this.setAngle(az, el);
  }

  /** Keys of the viewer: arrows turn (15°, Shift 5°), F fits, I isometric, O orbit and H pan (the tool of the left button). */
  key(e) {
    const k = e.shiftKey ? 5 : 15;
    const turn = { ArrowLeft: [-k, 0], ArrowRight: [k, 0], ArrowUp: [0, k], ArrowDown: [0, -k] }[e.key];
    if (turn) { e.preventDefault(); this.turn(...turn); return; }
    const key = e.key.toLowerCase();
    if (key === 'f') this.fit();
    else if (key === 'o') this.setTool('orbit');
    else if (key === 'h') this.setTool('pan');
    else if (key === 'i') this.setAngle(45 + 90 * Math.round((wrap360(this.angle.az) - 45) / 90), ISO_EL);
  }
}

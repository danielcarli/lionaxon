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
    this.toolbar = h('div.toolbar');
    this.angles = h('div.orbit-angles', { role: 'listbox', 'aria-label': t('orbit.angles') });
    this.readout = h('div.orbit-readout', { 'aria-live': 'polite' });
    this.element = h('div.editor-view', { 'data-view': 'orbit' }, this.toolbar,
      h('div.canvas-wrap', this.canvas, this.angles, this.readout,
        h('div.canvas-corner',
          h('button.icon-button', { title: t('drawing.fit') + ' (F)', html: icon('fit', 16), onclick: () => this.fit() }))));

    this.cycle = new PickCycle(this); // Tab: the next object under the same spot
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

  /** The point the view turns around: the middle of the site, at half the height of what is drawn. */
  #pivot() {
    const p = this.doc.project;
    return [p.site.w / 2, p.site.d / 2, this.midZ || 0];
  }

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
    return renderStep(this.doc.project, this.doc.stepIndex, { view: this.view, lw: 1.15 / scale, grid: true, ids: true, fmt: meters });
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
    this.overlay.innerHTML = at
      ? `<line x1="${r3(from[0])}" y1="${r3(from[1])}" x2="${r3(at[0])}" y2="${r3(at[1])}" stroke="${SEL}" stroke-width="${r3(1.4 / scale)}" pointer-events="none"/><circle data-handle="h" cx="${r3(at[0])}" cy="${r3(at[1])}" r="${r3(6 / scale)}" fill="#fff" stroke="${SEL}" stroke-width="${r3(1.8 / scale)}"><title>${t('prop.height')}</title></circle>`
      : '';
    this.cycle.mark();
  }

  #hit(e) {
    if (e.target.closest?.('[data-handle]')) return { handle: 'h' };
    const el = e.target.closest?.('[data-id]');
    const o = el ? this.doc.byId(el.dataset.id) : null;
    return o && !o.locked ? { id: this.cycle.resolve(o.id) } : {};
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
      h('span.grow'),
      // the way to where new shapes are drawn (what can be done here is in the status bar)
      h('button.tool', { 'data-action': 'edit', title: t('orbit.editTip'), 'aria-label': t('orbit.edit'), html: icon('pencil', 17), onclick: () => this.layout.setTab('axon') }));
    this.#renderAngles();
    this.readout.textContent = `${t('orbit.az')} ${fmtDeg(a.az)} · ${t('orbit.el')} ${fmtDeg(a.el)}`;
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
      const pan = e.button === 1 || e.button === 2 || this.spaceDown;
      if (!pan && e.button !== 0) return;
      e.preventDefault();
      const base = { sx: e.clientX, sy: e.clientY, az: this.angle.az, el: this.angle.el, dx: this.cam.dx, dy: this.cam.dy };
      if (!pan) this.cycle.setPoint(e);
      const hit = pan ? {} : this.#hit(e);
      if (hit.handle) {
        const o = this.#heightTarget();
        if (o) { this.drag = { ...base, kind: 'height', id: o.id, h0: o.h, moved: false }; this.canvas.classList.add('editing'); return; }
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
      this.drag = { ...base, kind: pan ? 'pan' : 'orbit' };
      this.canvas.classList.add(pan ? 'panning' : 'orbiting');
    });
    svg.addEventListener('pointermove', (e) => this.#move(e));
    const end = () => { this.drag = null; this.canvas.classList.remove('panning', 'orbiting', 'editing'); };
    svg.addEventListener('pointerup', (e) => {
      const d = this.drag;
      if ((d?.kind === 'move' || d?.kind === 'height') && d.moved) this.doc.end();
      // a click on the paper (not a drag): nothing is selected any more
      if (d?.kind === 'orbit' && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < CLICK_PX && this.doc.selection.size) this.doc.clearSelection();
      end();
    });
    svg.addEventListener('pointercancel', () => { if ((this.drag?.kind === 'move' || this.drag?.kind === 'height') && this.drag.moved) this.doc.end(); end(); });
    svg.addEventListener('dblclick', (e) => { if (!this.#hit(e).id && !this.#hit(e).handle) this.fit(); });
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
          if (isLine(o)) { o.x1 = r3(s0.x1 + dx); o.y1 = r3(s0.y1 + dy); o.x2 = r3(s0.x2 + dx); o.y2 = r3(s0.y2 + dy); }
          else { o.x = r3(s0.x + dx); o.y = r3(s0.y + dy); }
        }
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
    if (e.shiftKey) { az = Math.round(az / 15) * 15; el = Math.round(el / 15) * 15; }
    this.setAngle(az, el);
  }

  /** Keys of the viewer: arrows turn (15°, Shift 5°), F fits, I isometric. */
  key(e) {
    const k = e.shiftKey ? 5 : 15;
    const turn = { ArrowLeft: [-k, 0], ArrowRight: [k, 0], ArrowUp: [0, k], ArrowDown: [0, -k] }[e.key];
    if (turn) { e.preventDefault(); this.turn(...turn); return; }
    const key = e.key.toLowerCase();
    if (key === 'f') this.fit();
    else if (key === 'i') this.setAngle(45 + 90 * Math.round((wrap360(this.angle.az) - 45) / 90), ISO_EL);
  }
}

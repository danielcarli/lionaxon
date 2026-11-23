/*---------------------------------------------------------------------------------------------
 *  LionAxon — Copyright (C) 2026 LionAxon Team.
 *  Created and conceived by Daniel Michelon De Carli.
 *  Licensed under the GNU General Public License v3.0 or later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/
// The drawing of the current step, in axonometry or in plan, and the tools that edit it:
//   select (move, handles for size, height, base and rotation), box (with its shape), cut, terrain
//   (platforms and slopes), arrow, person and label.
// New objects are drawn on the active reference plane (level); clicking on a roof or a platform draws on it.
// The elevation (a side view: front, right, back or left) shows the reference planes as level lines: a click
// with the plane tool makes a new plane at that height, a level line is dragged up or down to change its
// elevation, and an object dragged onto a level line is anchored to that plane.
// The drawing is the renderer's SVG (the same that is exported); selection, handles and previews are an
// overlay on top of it. Every change goes through the document service, by name.
import { h, setChildren } from '../../../../base/browser/dom.js';
import { icon } from '../../../../base/browser/icons.js';
import { t, formatNumber } from '../../../../base/common/nls.js';
import { makeView, planView, project, unproject, verticalScale } from '../../../../base/common/geometry/projection.js';
import { rectRing } from '../../../../base/common/geometry/polygon.js';
import { renderStep, padBox, arrowPoints, labelTextBox } from '../../../services/render/common/renderer.js';
import { footprintOf } from '../../../services/render/common/solids.js';
import { getStyle } from '../../../services/render/common/styles.js';
import {
  createVolume, createCut, createPlatform, createSlope, createArrow, createPerson, createLabel,
  baseOf, indexById, elevationOf, slopeEnds, heightOf, formatElevation, SHAPES, GROUND_LEVEL as GROUND, explodeOffsets, splitsFloors,
  createArea, createTree, createDim, isLine, polyFromWorld, polyWorld,
} from '../../../services/model/common/model.js';
import { meters } from '../../../services/export/browser/exportService.js';
import { showContextMenu } from '../../../browser/contextMenu.js';
import { parseNumber, toggleSwitch } from '../../../browser/widgets.js';

const SEL = '#2f74e8';
import { PickCycle } from './pickCycle.js';
import { facesOf, faceAt, alignDelta, ALIGNABLE } from './alignFaces.js';
const NS = 'http://www.w3.org/2000/svg';
const r3 = (v) => Math.round(v * 1000) / 1000;
const escHtml = (x) => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const FONT_UI = "'Plus Jakarta Sans', system-ui, sans-serif";

const TOOLS = ['select', 'align', 'box', 'cut', 'terrain', 'arrow', 'dim', 'person', 'tree', 'label'];
const TOOL_ICONS = { select: 'select', box: 'box', cut: 'cut', terrain: 'terrain', arrow: 'arrow', person: 'person', label: 'text', tree: 'tree', dim: 'dim', align: 'alignFaces' };
export const TOOL_KEYS = { select: 'V', box: 'B', cut: 'S', terrain: 'G', arrow: 'A', person: 'P', label: 'T', tree: 'E', dim: 'D' };
const SHAPE_ICONS = { box: 'box', cylinder: 'cylinder', sphere: 'sphere', cone: 'cone', pyramid: 'pyramid', poly: 'poly' };
const TERRAIN_ICONS = { platform: 'platform', slope: 'slope', area: 'area' };
const RECT_TYPES = new Set(['volume', 'cut', 'platform', 'slope', 'area']);
const isPoly = (o) => (o.type === 'volume' || o.type === 'cut') && o.shape === 'poly' && !!o.pts;
const CLOSE_PX = 10; // a click this near the first point closes the outline being drawn
const fmtZ = (z) => formatElevation(z, (n) => formatNumber(n, 2));
/** Elevations: the camera azimuth for each side of the site (the front is the bottom side of the plan). */
const FACINGS = { front: -90, right: 0, back: 90, left: 180 };
const LEVEL = '#2f74e8';
const GUIDE = '#e0409a';
const GUIDE_PX = 7; // how close (screen pixels) an edge must come to another object's edge to line up with it
const CLICK_PX = 4; // a press that moves less than this is a click, not a drag

/** Bounds in plan of a box-like object: [x0, y0, x1, y1]. */
function planBounds(o) {
  const ring = isPoly(o) ? footprintOf(o) : rectRing(o.x, o.y, o.w, o.shape === 'sphere' ? o.w : o.d, o.rot || 0);
  const xs = ring.map((p) => p[0]), ys = ring.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}
const SNAP_PX = 9; // how close (screen pixels) an object's base must come to a level line to be anchored to it

export class DrawingView {
  /** @param {'axon'|'plan'|'elev'} mode */
  constructor(services, mode) {
    this.s = services;
    this.doc = services.document;
    this.layout = services.layout;
    this.mode = mode;
    this.cam = null;           // { cx, cy, scale } — scale in screen pixels per drawing unit
    this.cams = new Map();     // the camera of each open diagram (tab id → cam)
    this.lastBox = null;
    this.showCuts = false;
    this.preview = null;       // shape being drawn by a tool
    this.drag = null;
    this.spaceDown = false;
    this.facing = 'front';     // elevation: the side of the site it is seen from
    this.elevTool = 'select';  // elevation: 'select' or 'level' (new reference plane)
    this.section = { on: false, pos: null }; // elevation: a section plane, `pos` metres behind the front of the site
    this.poly = null;          // an outline being drawn point by point: { tool, pts, z, level, lz, on, target, cursor }

    this.svg = document.createElementNS(NS, 'svg');
    this.svg.setAttribute('xmlns', NS);
    this.bg = document.createElementNS(NS, 'rect');
    this.content = document.createElementNS(NS, 'g');
    this.overlay = document.createElementNS(NS, 'g');
    this.overlay.setAttribute('class', 'ax-overlay');
    // elevation: the level lines answer the mouse under the drawing, so objects in front of a line win
    this.under = document.createElementNS(NS, 'g');
    this.svg.append(this.bg, this.under, this.content, this.overlay);
    this.canvas = h('div.canvas', { 'data-tool': this.layout.tool }, this.svg);
    this.badge = h('div.canvas-badge');
    this.toolbar = h('div.toolbar', { role: 'toolbar', 'aria-label': t('drawing.tools') });
    this.svg.setAttribute('role', 'img');
    this.svg.setAttribute('aria-label', t('tab.' + mode));
    this.zoomLabel = h('button.zoom-label', { title: t('zoom.reset'), 'data-zoom': 'label', onclick: () => this.fit() }, '100%');
    this.wrap = h('div.canvas-wrap', this.canvas, this.badge,
      h('div.canvas-corner',
        h('div.zoom-box', { role: 'group', 'aria-label': t('zoom.title') },
          h('button.icon-button', { title: t('zoom.out') + ' (Ctrl+−)', 'data-zoom': 'out', html: icon('minus', 14), onclick: () => this.zoomBy(1 / 1.25) }),
          this.zoomLabel,
          h('button.icon-button', { title: t('zoom.in') + ' (Ctrl++)', 'data-zoom': 'in', html: icon('plus', 14), onclick: () => this.zoomBy(1.25) })),
        h('button.icon-button', { title: t('drawing.fit') + ' (F)', html: icon('fit', 16), onclick: () => this.fit() })));
    this.element = h('div.editor-view', { 'data-view': mode }, this.toolbar, this.wrap);
    this.cycle = new PickCycle(this); // Tab: the next object under the same spot
    this.alignRef = null;      // align tool: the face picked to align to ({ id, face })
    this.alignHover = null;    // align tool: the face under the mouse
    this.guides = [];          // lines shown while an object being moved lines up with another
    this.listHover = null;     // the object under the mouse in the element list

    this.#renderToolbar();
    this.#bindPointer();
    new ResizeObserver(() => { if (this.visible) this.#applyCamera(true); }).observe(this.canvas);
    this.doc.onDidChange((e) => {
      if (e.kind === 'load' || e.kind === 'step') this.closeLabel?.(false);
      if (e.kind === 'load') {
        // each diagram keeps its own zoom and position
        if (e.prevTabId && e.prevTabId !== e.tabId) this.cams.set(e.prevTabId, this.cam && { ...this.cam, fit: this.fitScale });
        this.cam = this.cams.get(e.tabId) || null;
        this.fitScale = this.cam?.fit || null;
        this.preview = null;
      }
      if (e.kind === 'file' || e.kind === 'tabs') return;
      if (!e.live && e.kind !== 'step') this.#renderToolbar(); // undo state, levels, the active level
      if (!this.visible) { this.stale = true; return; }
      // the outlines of the cuts show while a cut is selected: a change of selection may add or remove them
      if (e.kind === 'selection' && !this.cutsBySelection && !this.doc.selected().some((o) => o.type === 'cut')) { this.#renderOverlay(); return; }
      this.render();
      if (e.kind === 'load' && !this.cam) this.fit();
    });
    this.layout.onDidChange((what) => {
      if (what === 'tab') this.closeLabel?.(true);
      if (what === 'tool') { this.canvas.dataset.tool = this.layout.tool; this.preview = null; this.poly = null; this.alignRef = null; this.alignHover = null; this.#renderToolbar(); if (this.visible) this.render(); }
      // after the editor has shown this view (its listener runs after this one), so it has a size
      if (what === 'tab') queueMicrotask(() => { if (this.visible) { this.render(); if (!this.cam) this.fit(); } });
      if (what === 'terrainMesh') { this.#renderToolbar(); if (this.visible) this.render(); else this.stale = true; }
    });
  }

  get visible() { return this.layout.tab === this.mode; }

  get view() {
    if (this.mode === 'elev') return makeView(FACINGS[this.facing], 0);
    return this.mode === 'plan' ? planView() : makeView(this.doc.project.view.az);
  }

  get elev() { return this.mode === 'elev'; }

  get style() { return getStyle(this.doc.project.style); }

  // ---- camera

  #applyCamera(keep = false) {
    const W = this.canvas.clientWidth, H = this.canvas.clientHeight;
    if (!W || !H) return;
    if (!this.cam) { this.fit(); return; }
    const w = W / this.cam.scale, hh = H / this.cam.scale;
    const vb = [this.cam.cx - w / 2, this.cam.cy - hh / 2, w, hh];
    this.svg.setAttribute('viewBox', vb.map(r3).join(' '));
    for (const [k, v] of Object.entries({ x: vb[0], y: vb[1], width: vb[2], height: vb[3] })) this.bg.setAttribute(k, r3(v));
    this.bg.setAttribute('fill', this.style.paper);
    // the zoom, with "fit" as 100%
    this.zoomLabel.textContent = `${Math.round((this.cam.scale / (this.fitScale || this.cam.scale)) * 100)}%`;
    if (!keep) return;
    this.render();
  }

  fit() {
    const W = this.canvas.clientWidth, H = this.canvas.clientHeight;
    if (!W || !H) { this.cam = null; return; }
    const box = padBox(this.lastBox || this.#renderMarkup(1).bbox, 0.08);
    let bw = box[2] - box[0], bh = box[3] - box[1];
    if (this.elev) {
      // the level heads (name and elevation) sit left of the lines, in screen pixels: room for them
      const k = Math.min(W / bw, H / bh);
      box[0] -= 150 / k;
      bw = box[2] - box[0];
    }
    this.cam = { cx: (box[0] + box[2]) / 2, cy: (box[1] + box[3]) / 2, scale: Math.min(W / bw, H / bh) };
    this.fitScale = this.cam.scale;
    this.#applyCamera();
    this.render();
  }

  zoomAt(factor, X, Y) {
    if (!this.cam) return;
    const s = Math.min(400, Math.max(0.5, this.cam.scale * factor));
    const k = this.cam.scale / s;
    this.cam.cx = X + (this.cam.cx - X) * k;
    this.cam.cy = Y + (this.cam.cy - Y) * k;
    this.cam.scale = s;
    this.#applyCamera();
    this.#scheduleRender();
  }

  /** Zooms in or out around the middle of the view. */
  zoomBy(factor) { if (this.cam) this.zoomAt(factor, this.cam.cx, this.cam.cy); }

  #scheduleRender() {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => { this.raf = 0; this.render(); });
  }

  /** Window coordinates (CSS pixels) of a world point — used by the tests to drive the mouse. */
  clientOf(p) { return this.clientAt(project(this.view, p)); }

  /** Window coordinates of a point of the drawing (e.g. a handle). */
  clientAt([X, Y]) {
    const r = this.svg.getBoundingClientRect();
    const vb = this.svg.viewBox.baseVal;
    return [r.left + ((X - vb.x) / vb.width) * r.width, r.top + ((Y - vb.y) / vb.height) * r.height];
  }

  /** Drawing coordinates of a pointer event. */
  toDrawing(e) {
    const r = this.svg.getBoundingClientRect();
    const vb = this.svg.viewBox.baseVal;
    return [vb.x + ((e.clientX - r.left) / r.width) * vb.width, vb.y + ((e.clientY - r.top) / r.height) * vb.height];
  }

  // ---- rendering

  get levels() { return this.doc.project.levels; }

  /** Height of a reference plane (the active one by default). */
  levelZ(id = this.doc.activeLevel) { return elevationOf(this.levels, id); }

  /**
   * The vertical extent of a box-like object, absolute: { z0, z1 } — and for slopes the heights at both ends.
   */
  extentOf(o, byId = indexById(this.doc.objects)) {
    // in an exploded step, as drawn: raised by its offset (and, floors apart, taller by the gaps)
    const step = this.doc.step;
    const off = step.explode?.on ? (explodeOffsets(step, this.levels).get(o.id) || 0) : 0;
    const extra = step.explode?.on && step.explode.floors && o.type === 'volume' && splitsFloors(o) ? (o.floors - 1) * step.explode.gap : 0;
    if (o.type === 'volume') { const z0 = baseOf(o, byId, this.levels) + off; return { z0, z1: z0 + heightOf(o) + extra }; }
    if (o.type === 'cut') { const z0 = this.levelZ(o.level) + o.z + off; return { z0, z1: z0 + Math.min(o.h, 500) }; }
    if (o.type === 'platform') { const top = this.levelZ(o.level) + o.z + off; return { z0: Math.min(off, top), z1: Math.max(off, top), top }; }
    if (o.type === 'slope') { const [zA, zB] = slopeEnds(o, this.levels); return { z0: Math.min(0, zA, zB) + off, z1: Math.max(zA, zB) + off, zA: zA + off, zB: zB + off }; }
    const z = this.levelZ(o.level) + (o.z || 0) + off;
    return { z0: z, z1: z };
  }

  /** The plane an object is moved on: its base (or its top, for a platform). */
  #anchorZ(o, byId) {
    const e = this.extentOf(o, byId);
    if (o.type === 'platform') return e.top;
    if (o.type === 'slope') return Math.min(e.zA, e.zB);
    return e.z0;
  }

  #renderMarkup(scale) {
    const sel = this.doc.selected();
    const tool = this.elev ? 'select' : this.layout.tool;
    const showCuts = this.showCuts || tool === 'cut' || sel.some((o) => o.type === 'cut');
    this.cutsBySelection = !this.showCuts && tool !== 'cut' && showCuts;
    const r = renderStep(this.doc.project, this.doc.stepIndex, {
      view: this.view, lw: 1.15 / scale, grid: true, editor: true, ids: true, showCuts, fmt: meters, terrainMesh: this.layout.terrainMesh,
      levelPlane: tool !== 'select' && !this.elev ? this.doc.activeLevel : null, fmtNum: (n) => formatNumber(n, 2),
      section: this.elev && this.section.on ? { pos: this.section.pos ?? undefined } : null,
    });
    this.sectionDepth = r.sectionDepth;
    if (this.elev) {
      // the level lines and their heads on the left
      const [x0, x1] = this.#levelSpan(r.bbox);
      const zs = this.levels.map((l) => l.z);
      r.bbox = [Math.min(r.bbox[0], x0 - 14), Math.min(r.bbox[1], -Math.max(...zs) - 3), Math.max(r.bbox[2], x1), Math.max(r.bbox[3], -Math.min(...zs) + 2)];
    }
    return r;
  }

  /** Elevation: how far the level lines run (screen X), a little beyond the site and the drawing. */
  #levelSpan(bbox = this.lastBox) {
    const xs = [[0, 0, 0], [this.doc.project.site.w, 0, 0], [this.doc.project.site.w, this.doc.project.site.d, 0], [0, this.doc.project.site.d, 0]].map((p) => project(this.view, p)[0]);
    const a = Math.min(...xs, bbox ? bbox[0] : Infinity), b = Math.max(...xs, bbox ? bbox[2] : -Infinity);
    const pad = (b - a) * 0.06 + 2;
    return [a - pad, b + pad];
  }

  /** Elevation: the level lines, with a head on the left (symbol, name, elevation). */
  #levelsMarkup(px) {
    const [x0, x1] = this.#levelSpan();
    const active = this.doc.activeLevel;
    const drag = this.drag?.kind === 'level' ? this.drag.id : null;
    let s = '', hits = '';
    for (const l of this.levels) {
      const y = -l.z;
      const on = l.id === active || l.id === drag;
      const color = on ? LEVEL : '#7d8590';
      const w = r3(px * (on ? 1.6 : 1.1));
      hits += `<path data-level="${l.id}" d="M${r3(x0)} ${r3(y)}H${r3(x1)}" stroke="transparent" stroke-width="${r3(px * 10)}" pointer-events="stroke" style="cursor:ns-resize"/>`;
      s += `<g class="level-line" data-level="${l.id}">`
        + `<path d="M${r3(x0)} ${r3(y)}H${r3(x1)}" stroke="${color}" stroke-width="${w}" stroke-dasharray="${r3(px * 10)} ${r3(px * 4)} ${r3(px * 2)} ${r3(px * 4)}" pointer-events="none"/>`
        // the level head: a small target (circle with a cross), then the name and the elevation
        + `<circle cx="${r3(x0)}" cy="${r3(y)}" r="${r3(px * 6)}" fill="${on ? LEVEL : '#fff'}" stroke="${color}" stroke-width="${w}" style="cursor:ns-resize"/>`
        + `<path d="M${r3(x0 - px * 6)} ${r3(y)}h${r3(px * 12)}M${r3(x0)} ${r3(y - px * 6)}v${r3(px * 12)}" stroke="${on ? '#fff' : color}" stroke-width="${r3(px)}" pointer-events="none"/>`
        // one line beside the head: the name, then the elevation (close planes do not run into each other)
        + `<text x="${r3(x0 - px * 10)}" y="${r3(y + px * 4)}" font-family="${FONT_UI}" font-size="${r3(px * 11.5)}" fill="${color}" text-anchor="end" pointer-events="none">`
        + `<tspan font-weight="650">${escHtml(l.name || t('level.ground'))}</tspan> ${escHtml(fmtZ(l.z))}</text>`
        + '</g>';
    }
    this.under.innerHTML = hits;
    if (this.preview?.kind === 'level') {
      const y = -this.preview.z;
      s += `<path d="M${r3(x0)} ${r3(y)}H${r3(x1)}" stroke="${LEVEL}" stroke-opacity="0.6" stroke-width="${r3(px * 1.4)}" stroke-dasharray="${r3(px * 6)} ${r3(px * 4)}" pointer-events="none"/>`
        + `<text x="${r3(x1)}" y="${r3(y - px * 5)}" font-family="${FONT_UI}" font-size="${r3(px * 11)}" fill="${LEVEL}" text-anchor="end" pointer-events="none">${escHtml(fmtZ(this.preview.z))}</text>`;
    }
    return s;
  }

  render() {
    this.stale = false;
    if (!this.cam) { this.lastBox = this.#renderMarkup(1).bbox; this.fit(); return; }
    const { markup, bbox } = this.#renderMarkup(this.cam.scale);
    this.lastBox = bbox;
    this.bg.setAttribute('fill', this.style.paper);
    this.content.innerHTML = markup;
    this.#renderOverlay();
  }

  /** See-through terrain: the piece under the mouse and the selected ones show their fill. */
  #markTerrain() {
    for (const el of this.content.querySelectorAll('.ax-terrain.hover, .ax-terrain.sel')) el.classList.remove('hover', 'sel');
    const mark = (id, cls) => { if (id) for (const el of this.content.querySelectorAll(`.ax-terrain[data-id="${CSS.escape(id)}"]`)) el.classList.add(cls); };
    mark(this.hoverId, 'hover');
    for (const id of this.doc.selection) mark(id, 'sel');
  }

  #renderOverlay() {
    if (!this.cam) return;
    const view = this.view;
    const px = 1 / this.cam.scale;
    const objs = this.doc.selected();
    const byId = indexById(this.doc.objects);
    let s = '';
    const P = (p) => project(view, p);
    // align tool: the face to align to (filled), and the face under the mouse
    if (this.layout.tool === 'align') {
      const facePath = (f) => 'M' + f.pts.map((q) => P(q).map(r3).join(' ')).join('L') + 'Z';
      if (this.alignHover && this.alignHover.face !== this.alignRef?.face) s += `<path class="align-hover" d="${facePath(this.alignHover.face)}" fill="${SEL}" fill-opacity="0.12" stroke="${SEL}" stroke-width="${r3(px * 1.4)}" stroke-dasharray="${r3(px * 5)} ${r3(px * 3)}" pointer-events="none"/>`;
      if (this.alignRef) s += `<path class="align-ref" d="${facePath(this.alignRef.face)}" fill="${SEL}" fill-opacity="0.3" stroke="${SEL}" stroke-width="${r3(px * 2.2)}" stroke-linejoin="round" pointer-events="none"/>`;
    }
    const line = (pts) => 'M' + pts.map((p) => `${r3(p[0])} ${r3(p[1])}`).join('L');
    // the object under the mouse in the element list: a lighter outline
    const hover = this.listHover && !this.doc.selection.has(this.listHover) ? byId.get(this.listHover) : null;
    let soft = false;
    const outline = (d) => `<path d="${d}" fill="${soft ? SEL : 'none'}" fill-opacity="0.08" stroke="${SEL}" stroke-opacity="${soft ? 0.7 : 1}" stroke-width="${r3(px * (soft ? 1.2 : 1.6))}" stroke-linejoin="round" pointer-events="none"/>`;
    for (const o of hover ? [...objs, hover] : objs) {
      soft = o === hover;
      if (o.type === 'slope') {
        const e = this.extentOf(o, byId);
        const ring = rectRing(o.x, o.y, o.w, o.d, o.rot); // corners: -w-d, +w-d, +w+d, -w+d
        const zs = [e.zA, e.zA, e.zB, e.zB];
        const hi = ring.map(([x, y], i) => P([x, y, zs[i]])), lo = ring.map(([x, y]) => P([x, y, e.z0]));
        let d = line(hi) + 'Z' + line(lo) + 'Z';
        for (let i = 0; i < 4; i++) d += line([lo[i], hi[i]]);
        s += outline(d);
      } else if (RECT_TYPES.has(o.type)) {
        const { z0, z1 } = this.extentOf(o, byId);
        const ring = (o.type === 'volume' || o.type === 'cut') && o.shape !== 'sphere' ? footprintOf(o) : rectRing(o.x, o.y, o.w, o.d, o.rot);
        const lo = ring.map(([x, y]) => P([x, y, z0])), hi = ring.map(([x, y]) => P([x, y, z1]));
        let d = line(lo) + 'Z' + line(hi) + 'Z';
        const every = ring.length > 12 ? Math.round(ring.length / 4) : 1;
        for (let i = 0; i < ring.length; i += every) d += line([lo[i], hi[i]]);
        s += outline(d);
      } else if (o.type === 'arrow') {
        const z = this.levelZ(o.level) + o.z;
        s += `<path d="${line(arrowPoints({ ...o, z }).map(P))}" fill="none" stroke="${SEL}" stroke-width="${r3(px * 1.6)}" stroke-dasharray="${r3(px * 5)} ${r3(px * 3)}" pointer-events="none"/>`;
      } else if (o.type === 'label') {
        // the box of the text: lightly filled, its far side (the one that is pulled) drawn heavier
        const b = this.#labelBox(o);
        const ex = r3(o.dx >= 0 ? b[2] : b[0]);
        s += `<rect class="label-frame" x="${r3(b[0])}" y="${r3(b[1])}" width="${r3(b[2] - b[0])}" height="${r3(b[3] - b[1])}" rx="${r3(px * 2)}" fill="${SEL}" fill-opacity="0.05" stroke="${SEL}" stroke-width="${r3(px * 1.2)}" pointer-events="none"/>`
          + `<path class="label-frame-side" d="M${ex} ${r3(b[1])}V${r3(b[3])}" stroke="${SEL}" stroke-width="${r3(px * 3)}" pointer-events="none"/>`
          // the whole side can be taken, not only its grip (only when the handles are shown)
          + (objs.length === 1 && !o.locked && (this.elev ? this.elevTool === 'select' : this.layout.tool === 'select')
            ? `<path class="handle handle-lw" data-handle="lw" d="M${ex} ${r3(b[1])}V${r3(b[3])}" stroke="transparent" stroke-width="${r3(px * 10)}"/>` : '');
      } else {
        const el = this.content.querySelector(`[data-id="${CSS.escape(o.id)}"]`);
        if (el) {
          const b = el.getBBox();
          s += `<rect x="${r3(b.x - px * 4)}" y="${r3(b.y - px * 4)}" width="${r3(b.width + px * 8)}" height="${r3(b.height + px * 8)}" rx="${r3(px * 3)}" fill="none" stroke="${SEL}" stroke-width="${r3(px * 1.4)}" pointer-events="none"/>`;
        }
      }
    }
    if (this.elev) s = this.#levelsMarkup(px) + s;
    else if (this.under.firstChild) this.under.innerHTML = '';
    // a locked object shows where it is, without the handles that would change it
    if (objs.length === 1 && !objs[0].locked && (this.elev ? this.elevTool === 'select' : this.layout.tool === 'select')) s += this.#handlesMarkup(objs[0], byId, px);
    if (this.preview) s += this.#previewMarkup(px);
    for (const [a, b] of this.guides) s += `<path d="${line([P(a), P(b)])}" stroke="${GUIDE}" stroke-width="${r3(px * 1.1)}" pointer-events="none"/>`;
    if (this.drag?.kind === 'marquee' && this.drag.box) {
      const [x0, y0, x1, y1] = this.drag.box;
      s += `<rect x="${r3(Math.min(x0, x1))}" y="${r3(Math.min(y0, y1))}" width="${r3(Math.abs(x1 - x0))}" height="${r3(Math.abs(y1 - y0))}" fill="${SEL}" fill-opacity="0.08" stroke="${SEL}" stroke-width="${r3(px)}" stroke-dasharray="${r3(px * 4)} ${r3(px * 3)}" pointer-events="none"/>`;
    }
    this.overlay.innerHTML = s;
    this.#markTerrain();
    this.cycle.mark();
  }

  /**
   * Handle positions (drawing coordinates) of one object:
   *   w± d± size · h height (top) · z base of a cut · h0 low end of a slope · rot rotation
   *   a1 a2 ends of an arrow · lt text of a label
   */
  handles(o, byId = indexById(this.doc.objects)) {
    const view = this.view;
    const out = [];
    if (RECT_TYPES.has(o.type)) {
      const e = this.extentOf(o, byId);
      const a = (o.rot * Math.PI) / 180, u = [Math.cos(a), Math.sin(a)], v = [-Math.sin(a), Math.cos(a)];
      const at = (k, m, z) => project(view, [o.x + u[0] * k + v[0] * m, o.y + u[1] * k + v[1] * m, z]);
      const sphere = (o.type === 'volume' || o.type === 'cut') && o.shape === 'sphere';
      // the plane the size handles sit on: the top (the middle of a sphere, the slant of a slope)
      const top = o.type === 'platform' ? e.top : o.type === 'slope' ? null : sphere ? (e.z0 + e.z1) / 2 : e.z1;
      const zAt = (m) => (top != null ? top : e.zA + ((m + o.d / 2) / o.d) * (e.zB - e.zA));
      if (isPoly(o)) {
        // an outline: a handle on each corner, and a smaller one in the middle of each side (drag it out for a new corner)
        const world = polyWorld(o);
        world.forEach((q, i) => {
          const r = world[(i + 1) % world.length];
          out.push({ id: 'p' + i, p: project(view, [q[0], q[1], e.z1]) }, { id: 'm' + i, p: project(view, [(q[0] + r[0]) / 2, (q[1] + r[1]) / 2, e.z1]) });
        });
      } else {
        out.push({ id: 'w+', p: at(o.w / 2, 0, zAt(0)) }, { id: 'w-', p: at(-o.w / 2, 0, zAt(0)) });
        if (!sphere) out.push({ id: 'd+', p: at(0, o.d / 2, zAt(o.d / 2)) }, { id: 'd-', p: at(0, -o.d / 2, zAt(-o.d / 2)) });
      }
      if (!view.plan) {
        if (o.type === 'slope') {
          out.push({ id: 'h', p: at(0, o.d / 2 - Math.min(1, o.d / 4), e.zB) }, { id: 'h0', p: at(0, -o.d / 2 + Math.min(1, o.d / 4), e.zA) });
        } else if (o.type === 'platform') {
          out.push({ id: 'h', p: at(0, 0, e.top) });
        } else if (o.type === 'area') {
          // flat: no height
        } else if (!sphere) {
          out.push({ id: 'h', p: at(0, 0, e.z1) });
          if (o.type === 'cut') out.push({ id: 'z', p: at(0, 0, e.z0) });
        } else if (o.type === 'cut') {
          out.push({ id: 'z', p: at(0, 0, e.z0) });
        } else {
          out.push({ id: 'h', p: at(0, 0, e.z1) });
        }
      }
      if (!sphere) {
        const k = 28 / this.cam.scale;
        const zr = zAt(-o.d / 2);
        out.push({ id: 'rot', p: at(0, -o.d / 2 - k, zr), from: at(0, -o.d / 2, zr) });
      }
    } else if (isLine(o)) {
      const z = this.levelZ(o.level) + o.z;
      out.push({ id: 'a1', p: project(view, [o.x1, o.y1, z]) }, { id: 'a2', p: project(view, [o.x2, o.y2, z]) });
    } else if (o.type === 'label') {
      const [ax, ay] = project(view, [o.x, o.y, this.levelZ(o.level) + o.z]);
      out.push({ id: 'lt', p: [ax + o.dx, ay + o.dy] });
      // the width of the text: the far side of the box around the text, a grip in the middle and its two
      // corners (drag them in and the text breaks into more lines)
      const b = this.#labelBox(o);
      const ex = o.dx >= 0 ? b[2] : b[0];
      out.push({ id: 'lw', p: [ex, (b[1] + b[3]) / 2] }, { id: 'lw1', p: [ex, b[1]] }, { id: 'lw2', p: [ex, b[3]] });
    }
    return out;
  }

  /**
   * The box around the text of a label as it is drawn (its lines measured, not the leader), with a margin
   * of a few pixels: what the selection outlines and what the width handles sit on.
   */
  #labelBox(o, pad = 5) {
    const px = 1 / (this.cam?.scale || 1);
    const el = this.content.querySelector(`[data-id="${CSS.escape(o.id)}"]`);
    let b = null;
    for (const tx of el ? el.querySelectorAll(':scope > text') : []) {
      if (tx.getAttribute('text-anchor') === 'middle') continue; // the mark at the point
      const r = tx.getBBox();
      b = b ? [Math.min(b[0], r.x), Math.min(b[1], r.y), Math.max(b[2], r.x + r.width), Math.max(b[3], r.y + r.height)] : [r.x, r.y, r.x + r.width, r.y + r.height];
    }
    if (!b) { // not drawn yet: the estimate of the renderer
      const [ax, ay] = project(this.view, [o.x, o.y, this.levelZ(o.level) + o.z]);
      const { w, h } = labelTextBox(o);
      const tx = ax + o.dx, y0 = o.note || o.wrap ? ay + o.dy - o.size * 0.625 : ay + o.dy - h / 2;
      b = o.dx >= 0 ? [tx, y0, tx + w, y0 + h] : [tx - w, y0, tx, y0 + h];
    }
    return [b[0] - pad * px, b[1] - pad * px, b[2] + pad * px, b[3] + pad * px];
  }

  #handlesMarkup(o, byId, px) {
    const list = this.handles(o, byId).filter((x) => !this.elev || ['h', 'h0', 'z', 'lt', 'lw', 'lw1', 'lw2'].includes(x.id));
    return list.map(({ id, p, from }) => {
      if (id === 'h' || id === 'h0' || id === 'z') {
        const r = 5.5;
        const fill = id === 'z' ? '#fff' : SEL, stroke = id === 'z' ? SEL : '#fff';
        return `<rect class="handle handle-h" data-handle="${id}" x="${r3(p[0] - r * px)}" y="${r3(p[1] - r * px)}" width="${r3(2 * r * px)}" height="${r3(2 * r * px)}" rx="${r3(px * 2)}" fill="${fill}" stroke="${stroke}" stroke-width="${r3(px * 1.5)}"/>`;
      }
      if (id === 'rot') {
        return `<path d="M${r3(from[0])} ${r3(from[1])}L${r3(p[0])} ${r3(p[1])}" stroke="${SEL}" stroke-width="${r3(px * 1.2)}" pointer-events="none"/>`
          + `<circle class="handle handle-rot" data-handle="rot" cx="${r3(p[0])}" cy="${r3(p[1])}" r="${r3(5.5 * px)}" fill="${SEL}" stroke="#fff" stroke-width="${r3(px * 1.5)}"/>`
          + `<path d="M${r3(p[0] - 2.6 * px)} ${r3(p[1] + 0.6 * px)}A${r3(2.6 * px)} ${r3(2.6 * px)} 0 1 1 ${r3(p[0] + 0.6 * px)} ${r3(p[1] + 2.6 * px)}" fill="none" stroke="#fff" stroke-width="${r3(px * 1.1)}" pointer-events="none"/>`;
      }
      if (id === 'lw') {
        // a grip on the far side of the box, pulled sideways: a bar with two arrows ↔ (what it does, at a glance)
        const tip = `<title>${t('label.wrapHandleTip')}</title>`;
        // the double arrow sits outside the box, beside the grip, so it never covers the text
        const sg = o.dx >= 0 ? 1 : -1, x0 = p[0] + sg * 9 * px, x1 = p[0] + sg * 23 * px, hh = 3.5 * px, ah = 3.5 * px * sg;
        return `<rect class="handle handle-lw" data-handle="lw" x="${r3(p[0] - 4 * px)}" y="${r3(p[1] - 11 * px)}" width="${r3(8 * px)}" height="${r3(22 * px)}" rx="${r3(3 * px)}" fill="${SEL}" stroke="#fff" stroke-width="${r3(px * 1.5)}">${tip}</rect>`
          + `<path class="lw-arrows" d="M${r3(x0)} ${r3(p[1])}H${r3(x1)}M${r3(x0 + ah)} ${r3(p[1] - hh)}L${r3(x0)} ${r3(p[1])}L${r3(x0 + ah)} ${r3(p[1] + hh)}M${r3(x1 - ah)} ${r3(p[1] - hh)}L${r3(x1)} ${r3(p[1])}L${r3(x1 - ah)} ${r3(p[1] + hh)}" fill="none" stroke="${SEL}" stroke-width="${r3(px * 1.5)}" stroke-linecap="round" stroke-linejoin="round" pointer-events="none"/>`;
      }
      if (id === 'lw1' || id === 'lw2') {
        return `<rect class="handle handle-lw" data-handle="${id}" x="${r3(p[0] - 4 * px)}" y="${r3(p[1] - 4 * px)}" width="${r3(8 * px)}" height="${r3(8 * px)}" fill="#fff" stroke="${SEL}" stroke-width="${r3(px * 1.6)}"><title>${t('label.wrapHandleTip')}</title></rect>`;
      }
      if (id[0] === 'm') return `<circle class="handle handle-mid" data-handle="${id}" cx="${r3(p[0])}" cy="${r3(p[1])}" r="${r3(3 * px)}" fill="${SEL}" fill-opacity="0.35" stroke="${SEL}" stroke-width="${r3(px)}"/>`;
      if (id[0] === 'p') return `<rect class="handle handle-pt" data-handle="${id}" x="${r3(p[0] - 4.5 * px)}" y="${r3(p[1] - 4.5 * px)}" width="${r3(9 * px)}" height="${r3(9 * px)}" fill="#fff" stroke="${SEL}" stroke-width="${r3(px * 1.6)}"/>`;
      const cls = id[0] === 'w' ? 'handle handle-w' : 'handle handle-d';
      return `<circle class="${cls}" data-handle="${id}" cx="${r3(p[0])}" cy="${r3(p[1])}" r="${r3(4.5 * px)}" fill="#fff" stroke="${SEL}" stroke-width="${r3(px * 1.6)}"/>`;
    }).join('');
  }

  #previewMarkup(px) {
    const view = this.view, pv = this.preview;
    const P = (p) => project(view, p);
    const line = (pts) => 'M' + pts.map((p) => `${r3(p[0])} ${r3(p[1])}`).join('L');
    if (pv.kind === 'box' || pv.kind === 'cut' || pv.kind === 'terrain') {
      const [x0, y0] = pv.a, [x1, y1] = pv.b;
      const ring = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
      const z0 = pv.z, z1 = pv.z + (pv.kind === 'terrain' ? 1 : 3);
      const lo = ring.map(([x, y]) => P([x, y, z0])), hi = ring.map(([x, y]) => P([x, y, z1]));
      let d = line(lo) + 'Z' + line(hi) + 'Z';
      for (let i = 0; i < 4; i++) d += line([lo[i], hi[i]]);
      const color = pv.kind === 'cut' ? '#d6405a' : pv.kind === 'terrain' ? '#3d8a5a' : SEL;
      return `<path d="${line(hi)}Z" fill="${color}" fill-opacity="0.1"/><path d="${d}" fill="none" stroke="${color}" stroke-width="${r3(px * 1.5)}" stroke-dasharray="${r3(px * 5)} ${r3(px * 3)}"/>`;
    }
    if (pv.kind === 'poly') {
      const pts = [...pv.pts, ...(pv.cursor ? [pv.cursor] : [])].map((q) => P([q[0], q[1], pv.z]));
      const color = pv.tool === 'cut' ? '#d6405a' : pv.tool === 'site' ? '#3d8a5a' : SEL;
      const first = pts[0];
      return (pts.length > 2 ? `<path d="${line(pts)}Z" fill="${color}" fill-opacity="0.08" stroke="none"/>` : '')
        + `<path d="${line(pts)}" fill="none" stroke="${color}" stroke-width="${r3(px * 1.6)}" stroke-dasharray="${r3(px * 5)} ${r3(px * 3)}"/>`
        + pts.slice(0, pv.pts.length).map((q) => `<circle cx="${r3(q[0])}" cy="${r3(q[1])}" r="${r3(px * 3.2)}" fill="#fff" stroke="${color}" stroke-width="${r3(px * 1.4)}"/>`).join('')
        + (pv.pts.length >= 3 ? `<circle cx="${r3(first[0])}" cy="${r3(first[1])}" r="${r3(px * 6.5)}" fill="none" stroke="${color}" stroke-width="${r3(px * 1.2)}"/>` : '');
    }
    if (pv.kind === 'arrow' || pv.kind === 'dim') {
      return `<path d="${line([P([...pv.a, pv.z]), P([...pv.b, pv.z])])}" stroke="${SEL}" stroke-width="${r3(px * 2)}" stroke-dasharray="${r3(px * 6)} ${r3(px * 4)}"/>`;
    }
    return '';
  }

  // ---- toolbar

  #renderToolbar() {
    if (this.elev) { this.#renderElevToolbar(); return; }
    const L = this.layout, doc = this.doc;
    const tools = h('div.tool-group', { role: 'toolbar', 'aria-label': t('drawing.tools') },
      TOOLS.map((id) => h('button.tool', {
        class: L.tool === id ? 'tool active' : 'tool', 'data-tool': id,
        title: `${t('tool.' + id)} (${TOOL_KEYS[id]})`, 'aria-label': t('tool.' + id),
        html: icon(id === 'box' ? SHAPE_ICONS[L.shape] : id === 'cut' && L.cutShape !== 'box' ? SHAPE_ICONS[L.cutShape] : id === 'terrain' ? TERRAIN_ICONS[L.terrainKind] : TOOL_ICONS[id], 18),
        onclick: () => L.setTool(id),
      })));
    // the options of the tool in use: the shape of the box, platform or slope
    let options = null;
    if (L.tool === 'box' || L.tool === 'cut') {
      const key = L.tool === 'box' ? 'shape' : 'cutShape';
      options = h('div.tool-group.tool-options', { role: 'radiogroup', 'aria-label': t('prop.shape') },
        SHAPES.map((sh) => h('button.tool', {
          class: L[key] === sh ? 'tool active' : 'tool', 'data-shape': sh, role: 'radio', 'aria-checked': String(L[key] === sh),
          title: t('shape.' + sh), 'aria-label': t('shape.' + sh), html: icon(SHAPE_ICONS[sh], 17),
          onclick: () => L.setToolOption(key, sh),
        })));
    } else if (L.tool === 'terrain') {
      options = h('div.tool-group.tool-options', { role: 'radiogroup', 'aria-label': t('tool.terrain') },
        ['platform', 'slope', 'area'].map((k) => h('button.tool', {
          class: L.terrainKind === k ? 'tool active' : 'tool', 'data-terrain': k, role: 'radio', 'aria-checked': String(L.terrainKind === k),
          title: t('terrain.' + k), 'aria-label': t('terrain.' + k), html: icon(TERRAIN_ICONS[k], 17),
          onclick: () => L.setToolOption('terrainKind', k),
        })));
    }
    // the reference plane new objects are drawn on
    const levels = doc.project.levels;
    const level = levels.length > 1 || levels[0]?.z ? h('label.level-pick', { title: t('level.activeHint') },
      h('span', { html: icon('levels', 15) }),
      h('select.level-select', { 'aria-label': t('level.active'), onchange: (e) => doc.setActiveLevel(e.target.value) },
        levels.map((l) => h('option', { value: l.id, selected: l.id === doc.activeLevel }, levelName(l))))) : null;
    const history = h('div.tool-group',
      h('button.tool', { title: t('drawing.undo') + ' (Ctrl+Z)', disabled: !doc.canUndo, html: icon('undo', 17), onclick: () => this.s.commands.undo() }),
      h('button.tool', { title: t('drawing.redo') + ' (Ctrl+Y)', disabled: !doc.canRedo, html: icon('redo', 17), onclick: () => this.s.commands.redo() }));
    const cuts = h('button.tool', {
      class: this.showCuts ? 'tool active' : 'tool', title: t('drawing.showCuts'), html: icon('cut', 17),
      onclick: () => { this.showCuts = !this.showCuts; this.#renderToolbar(); this.render(); },
    });
    const mesh = h('button.tool', {
      class: L.terrainMesh ? 'tool active' : 'tool', 'data-toggle': 'terrain-mesh', title: t('drawing.terrainMesh'), html: icon('terrain', 17),
      onclick: () => L.toggleTerrainMesh(),
    });
    const rotate = this.mode === 'axon' ? h('div.tool-group',
      h('button.tool', { title: t('drawing.rotateLeft'), html: icon('rotateLeft', 17), onclick: () => this.s.commands.rotateView(-1) }),
      h('button.tool', { title: t('drawing.rotateRight'), html: icon('rotateRight', 17), onclick: () => this.s.commands.rotateView(1) })) : null;
    // platforms and slopes that touch drawn as one terrain (a setting of the project, kept in the file)
    const joined = toggleSwitch(t('site.joined'), doc.project.site.joined,
      (v) => this.s.commands.setProject((p) => { p.site.joined = v; }, 'site.join'), { 'data-key': 'siteJoined', title: t('site.joinedTip') });
    joined.classList.add('toolbar-switch');
    setChildren(this.toolbar, tools, options ? h('span.sep') : null, options, h('span.sep'), joined, level ? h('span.sep') : null, level,
      h('span.sep'), history, h('span.sep'), h('div.tool-group', cuts, mesh), rotate ? h('span.sep') : null, rotate,
      h('span.grow'));
    this.#fitToolbar();
  }

  /**
   * When the toolbar is too narrow for everything, the switches show without their words (the tooltip says
   * them), so that no button is cut off and the toolbar keeps its one line (the drawing does not jump).
   */
  #fitToolbar() {
    const tb = this.toolbar;
    if (!tb.isConnected) return;
    tb.classList.remove('compact');
    if (tb.scrollWidth > tb.clientWidth + 1) tb.classList.add('compact');
    if (!this.toolbarWatch) {
      let last = tb.clientWidth;
      this.toolbarWatch = new ResizeObserver(() => { if (Math.abs(tb.clientWidth - last) > 2) { last = tb.clientWidth; this.#fitToolbar(); } });
      this.toolbarWatch.observe(tb);
    }
  }

  /** Elevation: select or new plane, the side it is seen from, undo, the active plane. */
  #renderElevToolbar() {
    const doc = this.doc;
    const tool = (id, ic, key) => h('button.tool', {
      class: this.elevTool === id ? 'tool active' : 'tool', 'data-elev-tool': id,
      title: t('elev.tool.' + id) + (key ? ` (${key})` : ''), 'aria-label': t('elev.tool.' + id), html: icon(ic, 18),
      onclick: () => this.setElevTool(id),
    });
    const facing = h('div.tool-group', { role: 'radiogroup', 'aria-label': t('elev.facing') },
      Object.keys(FACINGS).map((f) => h('button.tool.tool-text', {
        class: this.facing === f ? 'tool tool-text active' : 'tool tool-text', 'data-facing': f, role: 'radio', 'aria-checked': String(this.facing === f),
        title: t('elev.facingTip.' + f), onclick: () => { this.facing = f; this.cam = null; this.#renderToolbar(); this.render(); },
      }, t('elev.facing.' + f))));
    const history = h('div.tool-group',
      h('button.tool', { title: t('drawing.undo') + ' (Ctrl+Z)', disabled: !doc.canUndo, html: icon('undo', 17), onclick: () => this.s.commands.undo() }),
      h('button.tool', { title: t('drawing.redo') + ' (Ctrl+Y)', disabled: !doc.canRedo, html: icon('redo', 17), onclick: () => this.s.commands.redo() }));
    // a section: everything in front of the plane is taken away, and what it cuts is filled
    const depth = this.sectionDepth || Math.max(doc.project.site.w, doc.project.site.d);
    const section = h('div.tool-group',
      h('button.tool.tool-text', {
        class: this.section.on ? 'tool tool-text active' : 'tool tool-text', 'data-action': 'section', title: t('section.tip'), 'aria-pressed': String(this.section.on),
        onclick: () => this.setSection(!this.section.on),
      }, t('section.title')),
      this.section.on ? h('label.orbit-field', { title: t('section.posTip') },
        h('input', {
          type: 'range', min: 0, max: Math.round(depth * 2) / 2, step: 0.5, value: String(this.section.pos ?? depth / 2), 'data-key': 'section-pos', 'aria-label': t('section.posTip'),
          oninput: (e) => { this.section.pos = Number(e.target.value); this.sectionLabel.textContent = meters(this.section.pos); this.render(); },
        }),
        (this.sectionLabel = h('span.section-pos', meters(this.section.pos ?? depth / 2)))) : null);
    setChildren(this.toolbar, h('div.tool-group', tool('select', 'select', 'V'), tool('level', 'levels', 'N')), h('span.sep'), facing, h('span.sep'), section, h('span.sep'), history,
      h('span.grow'));
  }

  /** Shows or hides the outlines of the subtractions. */
  toggleShowCuts() {
    this.showCuts = !this.showCuts;
    this.#renderToolbar();
    if (this.visible) this.render(); else this.stale = true;
  }

  /** Elevation: turns the section on or off (at `pos` metres behind the front of the site). */
  setSection(on, pos = this.section.pos) {
    this.section = { on: !!on, pos };
    this.#renderToolbar();
    if (this.visible) { this.render(); this.#renderToolbar(); } else this.stale = true;
  }

  // ---- outlines drawn point by point (polygonal volumes and subtractions, the site)

  /** The tool in use draws an outline point by point. */
  get #polyTool() {
    const L = this.layout;
    if (L.tool === 'site') return 'site';
    if (L.tool === 'box' && L.shape === 'poly') return 'box';
    if (L.tool === 'cut' && L.cutShape === 'poly') return 'cut';
    return null;
  }

  /** Ends the outline being drawn: with three points or more it becomes the shape. */
  finishPoly() {
    const d = this.poly;
    this.poly = null;
    this.preview = null;
    if (!d || d.pts.length < 3) { this.#renderOverlay(); return false; }
    const zr = r3(d.z - d.lz);
    if (d.tool === 'site') {
      this.s.commands.setSiteOutline(d.pts);
      this.layout.setTool('select');
      this.cam = null;
      this.render();
      return true;
    }
    const geo = polyFromWorld(d.pts, 0);
    if (d.tool === 'box') this.#create(createVolume({ ...geo, shape: 'poly', h: 3, z: d.on ? 0 : zr, level: d.level, on: d.on }), {});
    else {
      this.#create(createCut({ ...geo, shape: 'poly', ...this.#cutHeight(d, zr), level: d.level, target: d.target }), {});
      this.showCuts = true;
      this.#renderToolbar();
    }
    return true;
  }

  /** A click while an outline is being drawn: one more point, or the end when it lands on the first. */
  #polyClick(e, tool, hit) {
    const doc = this.doc;
    if (!this.poly) {
      const level = doc.activeLevel, lz = this.levelZ(level);
      const target = hit.surface ? doc.byId(hit.surface) : null;
      const z = tool === 'site' ? 0 : hit.top != null ? hit.top : lz;
      this.poly = {
        tool, pts: [], z, level, lz,
        on: tool === 'box' && hit.top != null && target?.type === 'volume' ? target.id : null,
        target: tool === 'cut' && target?.type === 'volume' ? target.id : null,
      };
    }
    const d = this.poly;
    const p = this.#ground(e, d.z).map((v) => this.#snap(v, e));
    if (d.pts.length >= 3) {
      const [fx, fy] = this.clientAt(project(this.view, [d.pts[0][0], d.pts[0][1], d.z]));
      if (Math.hypot(e.clientX - fx, e.clientY - fy) <= CLOSE_PX) { this.finishPoly(); return; }
    }
    const last = d.pts[d.pts.length - 1];
    if (!last || Math.hypot(last[0] - p[0], last[1] - p[1]) > 1e-6) d.pts.push(p);
    this.preview = { kind: 'poly', tool: d.tool, pts: d.pts, z: d.z, cursor: p };
    this.badge.textContent = t('poly.count', { n: d.pts.length });
    this.#renderOverlay();
  }

  setElevTool(id) {
    this.elevTool = id;
    this.preview = null;
    this.canvas.dataset.tool = id === 'level' ? 'level' : 'select';
    this.layout.notify('hint');
    this.#renderToolbar();
    this.#renderOverlay();
  }

  // ---- pointer

  #hit(e) {
    const handle = e.target.closest?.('[data-handle]');
    if (handle) return { handle: handle.dataset.handle };
    const el = e.target.closest?.('[data-id]');
    if (!el) return {};
    const top = el.dataset.top != null ? Number(el.dataset.top) : null;
    // a locked object is not picked: the click goes through to the paper (but tools still draw on its top)
    if (this.doc.byId(el.dataset.id)?.locked) return { locked: el.dataset.id, top, surface: el.dataset.id };
    // picking with Tab: a press on the spot is a press on the object picked, even if another is in front
    return { id: this.cycle.resolve(el.dataset.id), top, surface: el.dataset.id };
  }

  /** Align tool: the face of an object under the mouse ({ id, face, locked }), or null. */
  #faceUnder(e) {
    if (this.mode !== 'axon' || !this.cam) return null;
    const hit = this.#hit(e);
    const id = hit.surface || hit.id || hit.locked;
    const o = id && this.doc.byId(id);
    if (!o || !ALIGNABLE.includes(o.type)) return null;
    const [X, Y] = this.toDrawing(e);
    const face = faceAt(facesOf(o, this.extentOf(o)), this.view, X, Y);
    return face ? { id: o.id, face, locked: !!o.locked } : null;
  }

  /** Align tool, a click: the first face is where to align to, the second one is brought to it. */
  #alignClick(e) {
    const hit = this.#faceUnder(e);
    if (!hit) { this.alignRef = null; this.#renderOverlay(); return; }
    if (!this.alignRef || hit.id === this.alignRef.id) { this.alignRef = hit; this.#renderOverlay(); return; }
    const delta = alignDelta(this.alignRef.face, hit.face);
    if (!delta) { this.s.notifications.warn(t('alignFaces.notParallel'), 5000); return; }
    const done = this.s.commands.alignFace(hit.id, delta);
    if (done !== true) { this.s.notifications.warn(t('alignFaces.' + done), 5000); return; }
    // the next pair starts from a new face
    this.alignRef = null;
    this.alignHover = null;
    this.#renderOverlay();
  }

  #snap(v, e, g = this.doc.project.grid) {
    return e.altKey ? Math.round(v * 100) / 100 : Math.round(v / g) * g;
  }

  #ground(e, z = 0) {
    const [X, Y] = this.toDrawing(e);
    return unproject(this.view, X, Y, z);
  }

  #bindPointer() {
    const svg = this.svg;
    svg.addEventListener('wheel', (e) => {
      e.preventDefault();
      const [X, Y] = this.toDrawing(e);
      this.zoomAt(Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015)), X, Y);
    }, { passive: false });
    svg.addEventListener('pointerdown', (e) => this.#down(e));
    svg.addEventListener('pointermove', (e) => this.#move(e));
    svg.addEventListener('pointerup', (e) => this.#up(e));
    svg.addEventListener('pointercancel', () => this.cancel());
    svg.addEventListener('dblclick', (e) => {
      if (this.poly) { this.finishPoly(); return; }
      // the press captured the pointer, so the event may name the drawing itself: look at what is under it
      const target = document.elementFromPoint(e.clientX, e.clientY) || e.target;
      const hd = target.closest?.('[data-handle]')?.dataset.handle;
      const one = this.doc.selected()[0];
      if (hd?.startsWith('lw') && one?.type === 'label') {
        // a double click on the side of the box: back to one line per line typed
        this.doc.run('label.wrap', (_p, step) => { const o = step.objects.find((x) => x.id === one.id); if (o) o.wrap = null; });
        return;
      }
      if (hd && hd[0] === 'p' && one && isPoly(one) && one.pts.length > 3) {
        // a double click on a corner takes it out
        const world = polyWorld(one).filter((_, i) => i !== Number(hd.slice(1)));
        this.doc.run('object.corner.remove', (_p, step) => { Object.assign(step.objects.find((x) => x.id === one.id), polyFromWorld(world, one.rot)); });
        return;
      }
      const { id } = this.#hit({ target });
      const o = id && this.doc.byId(id);
      if (o?.type === 'label') this.editLabel(o.id);
      else if (o) this.s.properties?.focus('name');
    });
    // Space: held while dragging, it pans; tapped, it turns the selection 90° (Shift: 15°) — also while an
    // object is being moved, so it can be turned on its way
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'Space' || isTyping(e) || !this.visible || document.querySelector('.cm-overlay')) return;
      e.preventDefault();
      if (e.repeat) return;
      this.spaceDown = true;
      this.spacePanned = false;
    });
    window.addEventListener('keyup', (e) => {
      if (e.code !== 'Space' || !this.visible) return;
      const tap = this.spaceDown && !this.spacePanned;
      this.spaceDown = false;
      if (!tap || isTyping(e) || document.querySelector('.cm-overlay')) return;
      e.preventDefault();
      this.rotateBySpace(e.shiftKey ? 15 : 90);
    });
  }

  /** Turns the selection (or what is being moved) by `deg`, around its centre. */
  rotateBySpace(deg) {
    const d = this.drag;
    if (d?.kind === 'move' && d.moved) {
      // turn the shapes being dragged: their starting state turns around the grabbed object's centre
      const pivot = [...d.start.values()].find((o) => RECT_TYPES.has(o.type));
      if (!pivot) return;
      const a = (deg * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a);
      for (const o of d.start.values()) {
        if (!RECT_TYPES.has(o.type)) continue;
        const rx = o.x - pivot.x, ry = o.y - pivot.y;
        o.x = r3(pivot.x + rx * c - ry * sn);
        o.y = r3(pivot.y + rx * sn + ry * c);
        o.rot = r3((((o.rot + deg) % 360) + 360) % 360);
      }
      if (this.lastMove) this.#move(this.lastMove);
      return;
    }
    if (d) return;
    this.s.commands.rotateSelection(deg);
  }

  #startPan(e, hit = null) {
    if (this.spaceDown) this.spacePanned = true;
    // the right button: a drag pans, a click opens the menu of what is under it
    this.drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, cx: this.cam.cx, cy: this.cam.cy, menu: e.button === 2 && !this.spaceDown ? hit || {} : null };
    this.canvas.classList.add('panning');
  }

  /** Dragging on the paper: a rectangle that selects what it touches (Shift adds to the selection). */
  #startMarquee(e) {
    const p = this.toDrawing(e);
    this.drag = { kind: 'marquee', sx: e.clientX, sy: e.clientY, p0: p, box: null, base: e.shiftKey ? new Set(this.doc.selection) : new Set() };
  }

  /** The ids of the objects drawn inside (or crossing) a rectangle of the window; locked ones are left out. */
  #idsIn(x0, y0, x1, y1) {
    const ids = new Set();
    for (const el of this.content.querySelectorAll('[data-id]')) {
      const id = el.dataset.id;
      if (ids.has(id) || this.doc.byId(id)?.locked) continue;
      const r = el.getBoundingClientRect();
      if (r.right >= x0 && r.left <= x1 && r.bottom >= y0 && r.top <= y1) ids.add(id);
    }
    return ids;
  }

  /** The menu of the right button, for the object under it (or for the paper). */
  #contextMenu(e, hit) {
    const doc = this.doc, cmd = this.s.commands;
    if (hit.id && !doc.selection.has(hit.id)) doc.select([hit.id]);
    else if (!hit.id) doc.clearSelection();
    const sel = doc.selected();
    const n = sel.length;
    const last = doc.stepIndex >= doc.project.steps.length - 1;
    const items = n ? [
      { label: t('edit.cut'), key: 'Ctrl+X', run: () => cmd.cutSelection() },
      { label: t('edit.copy'), key: 'Ctrl+C', run: () => cmd.copySelection() },
      { label: t('edit.paste'), key: 'Ctrl+V', run: () => cmd.paste(), disabled: !cmd.canPaste },
      { label: t('props.duplicate'), key: 'Ctrl+D', run: () => cmd.duplicateSelection() },
      { label: t('props.delete'), key: 'Delete', run: () => cmd.deleteSelection() },
      { sep: true },
      { label: t('menu.rotate90'), key: 'R', run: () => cmd.rotateSelection(90), disabled: !sel.some((o) => RECT_TYPES.has(o.type)) },
      n === 1 ? { label: t('edit.rename') + '…', key: 'F2', run: () => this.s.properties?.focus('name') } : null,
      { label: t('edit.lock'), key: 'Ctrl+L', run: () => cmd.setLocked(true) },
      { label: t('edit.hide'), key: 'Ctrl+H', run: () => cmd.setHidden(true) },
      n > 1 ? { sep: true } : null,
      n > 1 ? { label: t('align.left'), run: () => cmd.alignSelection('left') } : null,
      n > 1 ? { label: t('align.centerX'), run: () => cmd.alignSelection('centerX') } : null,
      n > 1 ? { label: t('align.top'), run: () => cmd.alignSelection('top') } : null,
      n > 1 ? { label: t('align.centerY'), run: () => cmd.alignSelection('centerY') } : null,
      { sep: true },
      { label: t('propagate.apply'), run: () => cmd.applyToFollowing(), disabled: last },
      { label: t('propagate.delete'), run: () => cmd.deleteInFollowing(), disabled: last, danger: true },
    ] : [
      hit.locked ? { label: t('edit.unlock'), run: () => cmd.setLocked(false, [hit.locked]) } : null,
      hit.locked ? { sep: true } : null,
      { label: t('edit.paste'), key: 'Ctrl+V', run: () => cmd.paste(), disabled: !cmd.canPaste },
      { label: t('menu.selectAll'), key: 'Ctrl+A', run: () => cmd.selectAll() },
      { label: t('edit.showAll'), run: () => cmd.showAll(), disabled: !doc.objects.some((o) => o.hidden || o.locked) },
      { sep: true },
      { label: t('drawing.fit'), key: 'F', run: () => this.fit() },
    ];
    showContextMenu(e.clientX, e.clientY, items);
  }

  /** The object under the mouse in the element list gets a light outline in the drawing. */
  setListHover(id) {
    if (id === this.listHover) return;
    this.listHover = id;
    if (this.visible) this.#renderOverlay();
  }

  /**
   * Typing a size for the selected shape: a small box over the drawing takes "width × depth × height" in
   * metres (one, two or three numbers) and applies it on Enter.
   */
  /**
   * The text of a label, written where it is drawn: a double click on the label (or Enter with it selected)
   * opens a box over it. Enter applies, Shift+Enter starts another line, Esc gives up.
   */
  editLabel(id = this.doc.selected()[0]?.id) {
    const o = id && this.doc.byId(id);
    if (!o || o.type !== 'label' || o.locked || this.labelBox || !this.visible) return false;
    const texts = [...this.content.querySelectorAll(`[data-id="${CSS.escape(id)}"] text, text[data-id="${CSS.escape(id)}"]`)];
    if (!texts.length) return false;
    if (!this.doc.selection.has(id) || this.doc.selection.size !== 1) this.doc.select([id]);
    // where the text is drawn, in the coordinates of the drawing area
    const wrap = this.wrap.getBoundingClientRect();
    const rects = texts.map((x) => x.getBoundingClientRect());
    const left = Math.min(...rects.map((r) => r.left)), right = Math.max(...rects.map((r) => r.right));
    const top = Math.min(...rects.map((r) => r.top)), bottom = Math.max(...rects.map((r) => r.bottom));
    // the lines as drawn (a text with a width breaks into more lines than were typed)
    const lines = Math.max(1, texts[0].querySelectorAll('tspan').length || String(o.text || '').split('\n').length);
    const fontPx = Math.max(11, Math.min(40, ((bottom - top) / lines) * 0.78));
    let done = false;
    const close = (apply) => {
      if (done) return;
      done = true;
      const value = area.value.replace(/\s+$/, '');
      this.labelBox?.remove();
      this.labelBox = null;
      this.closeLabel = null;
      if (apply && value && value !== o.text && this.doc.byId(id)) {
        if (!this.doc.selection.has(id) || this.doc.selection.size !== 1) this.doc.select([id]);
        this.s.commands.setProps({ text: value });
      }
    };
    const area = h('textarea', {
      'data-key': 'text', spellcheck: false, rows: lines, 'aria-label': t('label.text'), title: t('label.editTip'),
      style: { fontSize: `${r3(fontPx)}px`, textTransform: o.caps === false ? 'none' : 'uppercase' },
      onkeydown: (e) => {
        e.stopPropagation();
        if (e.key === 'Escape') { e.preventDefault(); close(false); }
        else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); close(true); }
      },
      oninput: () => { area.rows = Math.max(1, area.value.split('\n').length); },
      // leaving the box applies (change comes even when the window itself is not the active one)
      onblur: () => { if (performance.now() - opened < 250) { setTimeout(take, 0); return; } close(true); },
      onchange: () => close(true),
      onpointerdown: (e) => e.stopPropagation(),
    });
    area.value = o.text || '';
    this.labelBox = h('div.label-box', { style: { left: `${Math.round(left - wrap.left - 7)}px`, top: `${Math.round(top - wrap.top - 5)}px`, minWidth: `${Math.round(right - left + 30)}px`, ...(o.wrap ? { width: `${Math.round(right - left + 30)}px` } : {}) } }, area);
    this.closeLabel = close;
    this.wrap.append(this.labelBox);
    // the double click that opened the box may still take the focus away: take it back once
    const opened = performance.now();
    const take = () => { if (!done && document.activeElement !== area) { area.focus(); area.select(); } };
    take();
    setTimeout(take, 60);
    return true;
  }

  /**
   * The size of the selected shape typed on the drawing.
   */
  typeSize(first = '') {
    const [o] = this.doc.selected();
    if (this.doc.selection.size !== 1 || !RECT_TYPES.has(o.type) || this.sizeBox) return false;
    const sphere = o.shape === 'sphere';
    const flat = o.type === 'platform' || o.type === 'slope';
    const close = () => { this.sizeBox?.remove(); this.sizeBox = null; };
    const input = h('input', {
      type: 'text', inputMode: 'decimal', spellcheck: false, value: first, 'data-key': 'typed-size',
      placeholder: sphere ? 'Ø' : flat ? t('size.placeholder2') : t('size.placeholder3'), 'aria-label': t('size.title'),
      onkeydown: (e) => {
        e.stopPropagation();
        if (e.key === 'Escape') close();
        if (e.key !== 'Enter') return;
        const nums = input.value.split(/[x×*;\s]+/i).map(parseNumber).filter((v) => Number.isFinite(v) && v > 0);
        if (nums.length) {
          const props = sphere ? { w: nums[0], d: nums[0], ...(o.type === 'cut' ? { h: nums[0] } : {}) }
            : { w: nums[0], ...(nums[1] ? { d: nums[1] } : {}), ...(nums[2] && !flat ? { h: nums[2] } : {}) };
          this.s.commands.setProps(props);
        }
        close();
      },
      onblur: () => close(),
    });
    this.sizeBox = h('div.size-box', h('span', t('size.title')), input, h('span.unit', 'm'));
    this.wrap.append(this.sizeBox);
    input.focus();
    input.setSelectionRange(first.length, first.length);
    return true;
  }

  #down(e) {
    if (!this.cam) return;
    this.closeLabel?.(true); // a press on the drawing applies a label text being written
    // a click on the drawing ends any typing in the panels (and applies it)
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    this.svg.setPointerCapture(e.pointerId);
    if (e.button === 1 || e.button === 2 || this.spaceDown) { e.preventDefault(); this.#startPan(e, this.#hit(e)); return; }
    if (e.button !== 0) return;
    this.cycle.setPoint(e);
    if (this.elev) { this.#elevDown(e); return; }
    const tool = this.layout.tool;
    if (tool === 'align') { this.#alignClick(e); return; }
    const hit = this.#hit(e);
    const doc = this.doc;

    if (tool === 'select') {
      if (hit.handle) { this.#startHandle(e, hit.handle); return; }
      if (hit.id) {
        if (e.shiftKey || e.ctrlKey || e.metaKey) { doc.select([hit.id], { add: true }); return; }
        if (!doc.selection.has(hit.id)) doc.select([hit.id]);
        this.#startMove(e, hit.id);
        return;
      }
      if (!e.shiftKey) doc.clearSelection();
      this.#startMarquee(e);
      // a click (not a drag) on a locked object selects it, so that it can be unlocked; it still cannot be moved
      this.drag.lockedId = hit.locked || null;
      return;
    }

    const polyTool = this.#polyTool;
    if (polyTool) { this.#polyClick(e, polyTool, hit); return; }

    // drawing: on a roof or a platform that was clicked, otherwise on the active reference plane
    const level = doc.activeLevel;
    const lz = this.levelZ(level);
    const target = hit.surface ? doc.byId(hit.surface) : null;
    const z = hit.top != null ? hit.top : lz;
    const p = this.#ground(e, z).map((v) => this.#snap(v, e));
    if (tool === 'box' || tool === 'cut' || tool === 'terrain') {
      this.drag = {
        kind: 'draw', tool, z, level, lz,
        on: tool === 'box' && hit.top != null && target?.type === 'volume' ? target.id : null,
        target: tool === 'cut' && target?.type === 'volume' ? target.id : null,
        a: p,
      };
      this.preview = { kind: tool, a: p, b: p, z };
      this.#renderOverlay();
    } else if (tool === 'arrow' || tool === 'dim') {
      this.drag = { kind: 'draw', tool, z, level, lz, a: p };
      this.preview = { kind: tool, a: p, b: p, z };
      this.#renderOverlay();
    } else if (tool === 'tree') {
      const g = this.#ground(e, z).map((v) => this.#snap(v, e));
      this.#create(createTree({ x: r3(g[0]), y: r3(g[1]), z: r3(z - lz), level }), e);
    } else if (tool === 'person') {
      const g = this.#ground(e, z);
      this.#create(createPerson({ x: r3(g[0]), y: r3(g[1]), z: r3(z - lz), level }), e);
    } else if (tool === 'label') {
      const g = this.#ground(e, z);
      this.#create(createLabel({ x: r3(g[0]), y: r3(g[1]), z: r3(z - lz), level, text: t('label.default'), dx: 6, dy: -6 }), e);
      { const made = this.doc.objects.at(-1).id; setTimeout(() => this.editLabel(made), 0); }
    }
  }

  #create(obj, e) {
    this.doc.run('object.add', (_p, step) => { step.objects.push(obj); return [obj.id]; });
    if (!e.shiftKey) this.layout.setTool('select');
  }

  /** The selected objects and the volumes stacked on them, with their state before the drag. */
  #withStacked() {
    const doc = this.doc;
    const byId = indexById(doc.objects);
    const ids = new Set(doc.selection);
    let grew = true;
    while (grew) {
      grew = false;
      for (const o of doc.objects) if (o.type === 'volume' && o.on && ids.has(o.on) && !ids.has(o.id)) { ids.add(o.id); grew = true; }
    }
    return new Map([...ids].map((id) => [id, structuredClone(byId.get(id))]));
  }

  #startMove(e, id) {
    const byId = indexById(this.doc.objects);
    const o = byId.get(id);
    // the pointer slides on the plane of the object it grabbed, so it stays under the cursor
    const zp = o ? this.#anchorZ(o, byId) : 0;
    this.drag = { kind: 'move', id, zp, g0: this.#ground(e, zp), start: this.#withStacked(), moved: false };
  }

  #startHandle(e, handle) {
    let o = this.doc.selected()[0];
    if (!o) return;
    if (handle[0] === 'm' && isPoly(o)) {
      // the middle of a side: dragging it out makes a new corner there
      const world = polyWorld(o), i = Number(handle.slice(1)), q = world[i], r = world[(i + 1) % world.length];
      world.splice(i + 1, 0, [(q[0] + r[0]) / 2, (q[1] + r[1]) / 2]);
      o = { ...structuredClone(o), ...polyFromWorld(world, o.rot) };
      handle = 'p' + (i + 1);
    }
    const byId = indexById(this.doc.objects);
    const ext = RECT_TYPES.has(o.type) ? this.extentOf(o, byId) : null;
    // size and rotation handles slide on the plane they sit on
    const zp = !ext ? 0 : o.type === 'platform' ? ext.top : o.type === 'slope' ? (ext.zA + ext.zB) / 2
      : o.type === 'volume' && o.shape === 'sphere' ? (ext.z0 + ext.z1) / 2 : ext.z1;
    const g0 = this.#ground(e, zp);
    this.drag = {
      kind: 'handle', handle, zp, g0, y0: this.toDrawing(e)[1], start: structuredClone(o),
      a0: Math.atan2(g0[1] - o.y, g0[0] - o.x), group: handle === 'rot' ? this.#withStacked() : null,
    };
    if (handle.startsWith('lw') && o.type === 'label') {
      // the width is pulled on the text as drawn; the renderer breaks lines on its estimate of a letter's
      // width, so the measured box gives the factor between the two (the edge stays under the mouse)
      const b = this.#labelBox(o, 0);
      const est = labelTextBox(o).w - o.size * 0.4;
      this.drag.from = o.dx >= 0 ? b[0] : b[2];
      this.drag.k = est > 0 && b[2] - b[0] > 0 ? est / (b[2] - b[0]) : 1;
    }
    this.doc.begin(handle === 'rot' ? 'object.rotate' : 'object.resize');
  }

  #move(e) {
    this.lastMove = e;
    this.cycle.setHover(e);
    const d = this.drag;
    if (!d) {
      const el = e.target.closest?.('.ax-terrain[data-id]');
      const id = el ? el.dataset.id : null;
      if (id !== this.hoverId) { this.hoverId = id; this.#markTerrain(); }
      if (this.layout.tool === 'align') {
        const f = this.#faceUnder(e);
        const same = f?.id === this.alignHover?.id && f?.face.d === this.alignHover?.face.d && f?.face.n.join() === this.alignHover?.face.n.join();
        if (!same) { this.alignHover = f; this.#renderOverlay(); }
      }
    }
    if (!d && this.poly && this.cam) {
      const cur = this.#ground(e, this.poly.z).map((v) => this.#snap(v, e));
      this.preview = { kind: 'poly', tool: this.poly.tool, pts: this.poly.pts, z: this.poly.z, cursor: cur };
      const last = this.poly.pts[this.poly.pts.length - 1];
      const wr = this.wrap.getBoundingClientRect();
      this.badge.style.left = `${Math.min(wr.width - 150, e.clientX - wr.left + 16)}px`;
      this.badge.style.top = `${Math.min(wr.height - 34, e.clientY - wr.top + 18)}px`;
      this.badge.textContent = last ? meters(Math.hypot(cur[0] - last[0], cur[1] - last[1])) : '';
      this.#renderOverlay();
      return;
    }
    if (!d && this.elev && this.elevTool === 'level' && this.cam) {
      this.preview = { kind: 'level', z: this.#snapZ(-this.toDrawing(e)[1], e) };
      this.#renderOverlay();
      return;
    }
    if (!d) return;
    // the measures follow the pointer
    const wr = this.wrap.getBoundingClientRect();
    this.badge.style.left = `${Math.min(wr.width - 150, e.clientX - wr.left + 16)}px`;
    this.badge.style.top = `${Math.min(wr.height - 34, e.clientY - wr.top + 18)}px`;
    if (d.kind === 'marquee') {
      if (!d.box && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < CLICK_PX) return;
      d.box = [...d.p0, ...this.toDrawing(e)];
      const ids = this.#idsIn(Math.min(d.sx, e.clientX), Math.min(d.sy, e.clientY), Math.max(d.sx, e.clientX), Math.max(d.sy, e.clientY));
      this.doc.select([...new Set([...d.base, ...ids])]);
      this.#renderOverlay();
      return;
    }
    if (d.kind === 'pan') {
      if (d.menu && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) >= CLICK_PX) d.menu = null;
      const k = 1 / this.cam.scale;
      this.cam.cx = d.cx - (e.clientX - d.sx) * k;
      this.cam.cy = d.cy - (e.clientY - d.sy) * k;
      this.#applyCamera();
      return;
    }
    if (d.kind === 'move') {
      const g = this.#ground(e, d.zp);
      let dx = this.#snap(g[0] - d.g0[0], e), dy = this.#snap(g[1] - d.g0[1], e);
      [dx, dy] = this.#alignGuides(d, dx, dy, e);
      if (!d.moved) {
        if (Math.hypot(dx, dy) < 1e-9) return;
        d.moved = true;
        this.doc.begin('object.move');
      }
      this.doc.update((_p, step) => {
        for (const o of step.objects) {
          const s0 = d.start.get(o.id);
          if (!s0) continue;
          if (o.type === 'opening') { /* it stays on its wall */ } else if (isLine(o)) { o.x1 = r3(s0.x1 + dx); o.y1 = r3(s0.y1 + dy); o.x2 = r3(s0.x2 + dx); o.y2 = r3(s0.y2 + dy); }
          else { o.x = r3(s0.x + dx); o.y = r3(s0.y + dy); }
        }
      });
      this.badge.textContent = `Δ ${meters(dx)} · ${meters(dy)}`;
      return;
    }
    if (d.kind === 'handle') { this.#dragHandle(e, d); return; }
    if (d.kind === 'level' || d.kind === 'elevMove') { this.#elevMove(e, d); return; }
    if (d.kind === 'draw') {
      const b = this.#ground(e, d.z).map((v) => this.#snap(v, e));
      this.preview.b = b;
      const w = Math.abs(b[0] - d.a[0]), dd = Math.abs(b[1] - d.a[1]);
      this.badge.textContent = d.tool === 'arrow' || d.tool === 'dim' ? meters(Math.hypot(w, dd)) : `${formatNumber(w)} × ${formatNumber(dd)} m`;
      this.#renderOverlay();
    }
  }

  /**
   * While a shape is moved: when one of its edges or its centre comes close to an edge or the centre of
   * another shape, it lines up with it (Alt: off) and a guide shows the line. Returns the move, adjusted.
   */
  #alignGuides(d, dx, dy, e) {
    this.guides = [];
    const grabbed = d.start.get(d.id);
    if (!grabbed || !RECT_TYPES.has(grabbed.type) || this.elev) return [dx, dy];
    const others = this.doc.objects.filter((o) => RECT_TYPES.has(o.type) && !d.start.has(o.id) && !o.hidden && o.type !== 'cut');
    if (!others.length) return [dx, dy];
    const b0 = planBounds(grabbed);
    const tol = e.altKey ? 1e-6 : GUIDE_PX / this.cam.scale;
    const out = [dx, dy];
    for (const axis of [0, 1]) {
      const mine = [b0[axis], (b0[axis] + b0[axis + 2]) / 2, b0[axis + 2]].map((v) => v + out[axis]);
      let best = null;
      for (const o of others) {
        const b = planBounds(o);
        for (const v of [b[axis], (b[axis] + b[axis + 2]) / 2, b[axis + 2]]) for (const m of mine) {
          const diff = v - m;
          if (Math.abs(diff) <= tol && (!best || Math.abs(diff) < Math.abs(best.diff))) best = { diff, v, b };
        }
      }
      if (!best) continue;
      out[axis] = r3(out[axis] + best.diff);
      // the guide runs across both shapes, on the plane the shape is moved on
      const other = 1 - axis;
      const lo = Math.min(best.b[other], b0[other] + (other ? dy : dx)), hi = Math.max(best.b[other + 2], b0[other + 2] + (other ? dy : dx));
      this.guides.push(axis === 0 ? [[best.v, lo, d.zp], [best.v, hi, d.zp]] : [[lo, best.v, d.zp], [hi, best.v, d.zp]]);
    }
    return out;
  }

  #dragHandle(e, d) {
    const s0 = d.start, H = d.handle;
    const g = this.#ground(e, d.zp);
    const gx = g[0] - d.g0[0], gy = g[1] - d.g0[1];
    const dh = -(this.toDrawing(e)[1] - d.y0) / verticalScale(this.view);
    const half = (v) => (e.altKey ? r3(v) : Math.round(v * 2) / 2);
    this.doc.update((_p, step) => {
      const o = step.objects.find((x) => x.id === s0.id);
      if (!o) return;
      if (H === 'rot') {
        // rotation around the centre, 15° at a time (Alt: free); what is stacked on it turns with it
        const a = Math.atan2(g[1] - s0.y, g[0] - s0.x);
        let delta = ((a - d.a0) * 180) / Math.PI;
        const rot = e.altKey ? Math.round((s0.rot + delta) * 10) / 10 : Math.round((s0.rot + delta) / 15) * 15;
        delta = ((rot - s0.rot) * Math.PI) / 180;
        const c = Math.cos(delta), sn = Math.sin(delta);
        for (const x of step.objects) {
          const st = d.group.get(x.id);
          if (!st || !RECT_TYPES.has(x.type)) continue;
          const rx = st.x - s0.x, ry = st.y - s0.y;
          x.x = r3(s0.x + rx * c - ry * sn);
          x.y = r3(s0.y + rx * sn + ry * c);
          x.rot = r3((((st.rot + (delta * 180) / Math.PI) % 360) + 360) % 360);
        }
        this.badge.textContent = `${formatNumber(o.rot, 1)}°`;
      } else if (H[0] === 'p' && s0.pts) {
        // a corner of an outline goes where the pointer is (on the grid; Alt: free)
        const world = polyWorld(s0);
        world[Number(H.slice(1))] = this.#ground(e, d.zp).map((v) => this.#snap(v, e));
        Object.assign(o, polyFromWorld(world, s0.rot));
        this.badge.textContent = `${formatNumber(o.w)} × ${formatNumber(o.d)} m`;
      } else if (H === 'h') {
        if (o.type === 'platform') { o.z = r3(half(s0.z + dh)); this.badge.textContent = fmtZ(this.levelZ(o.level) + o.z); }
        else if (o.type === 'slope') { o.zTo = r3(half(s0.zTo + dh)); this.badge.textContent = fmtZ(slopeEnds(o, this.levels)[1]); }
        else if (o.type === 'volume' && o.shape === 'sphere') { o.w = o.d = Math.max(0.5, half(s0.w + dh)); this.badge.textContent = `Ø ${meters(o.w)}`; }
        else { o.h = Math.max(0.5, half(s0.h + dh)); this.badge.textContent = `${t('prop.height')} ${meters(o.h)}`; }
      } else if (H === 'h0') {
        o.zFrom = r3(half(s0.zFrom + dh));
        this.badge.textContent = fmtZ(slopeEnds(o, this.levels)[0]);
      } else if (H === 'z' && s0.shape === 'sphere') {
        o.z = r3(half(s0.z + dh));
        this.badge.textContent = `${t('prop.base')} ${fmtZ(this.levelZ(o.level) + o.z)}`;
      } else if (H === 'z') {
        // the base of a cut: its top stays where it is
        const top = s0.z + s0.h;
        o.z = r3(Math.min(top - 0.5, half(s0.z + dh)));
        o.h = r3(top - o.z);
        this.badge.textContent = `${t('prop.base')} ${fmtZ(this.levelZ(o.level) + o.z)}`;
      } else if (H[0] === 'w' || H[0] === 'd') {
        const a = (s0.rot * Math.PI) / 180;
        const axis = H[0] === 'w' ? [Math.cos(a), Math.sin(a)] : [-Math.sin(a), Math.cos(a)];
        const sign = H[1] === '+' ? 1 : -1;
        const key = H[0];
        const along = (gx * axis[0] + gy * axis[1]) * sign;
        const size = Math.max(0.5, this.#snap(s0[key] + along, e));
        const shift = ((size - s0[key]) / 2) * sign;
        o[key] = r3(size);
        if (o.shape === 'sphere') { o.d = o.w; if (o.type === 'cut') o.h = o.w; }
        o.x = r3(s0.x + axis[0] * shift);
        o.y = r3(s0.y + axis[1] * shift);
        this.badge.textContent = o.shape === 'sphere' ? `Ø ${meters(o.w)}` : `${formatNumber(o.w)} × ${formatNumber(o.d)} m`;
      } else if (H === 'a1' || H === 'a2') {
        const z = this.levelZ(s0.level) + s0.z;
        const p = this.#ground(e, z).map((v) => this.#snap(v, e));
        if (H === 'a1') { o.x1 = r3(p[0]); o.y1 = r3(p[1]); } else { o.x2 = r3(p[0]); o.y2 = r3(p[1]); }
      } else if (H.startsWith('lw')) {
        // the text breaks at the width pulled to (never narrower than two letters)
        const [X] = this.toDrawing(e);
        const width = (s0.dx >= 0 ? X - d.from : d.from - X) - 5 / this.cam.scale;
        o.wrap = r3(Math.max(s0.size * 2, width * (d.k || 1)));
        this.badge.textContent = `${t('label.wrap')}: ${formatNumber(o.wrap)} m`;
      } else if (H === 'lt') {
        const [X, Y] = this.toDrawing(e);
        const [ax, ay] = project(this.view, [s0.x, s0.y, this.levelZ(s0.level) + s0.z]);
        o.dx = r3(X - ax);
        o.dy = r3(Y - ay);
      }
    });
  }

  #up(e) {
    const d = this.drag;
    this.drag = null;
    this.canvas.classList.remove('panning');
    this.badge.textContent = '';
    if (!d) return;
    if (d.kind === 'pan') { if (d.menu) this.#contextMenu(e, d.menu); return; }
    if (d.kind === 'marquee') { if (!d.box && d.lockedId && this.doc.byId(d.lockedId)) this.doc.select([d.lockedId]); this.#renderOverlay(); return; }
    if (d.kind === 'move') { if (d.moved) this.doc.end(); if (this.guides.length) { this.guides = []; this.#renderOverlay(); } return; }
    if (d.kind === 'handle') { this.doc.end(); return; }
    if (d.kind === 'level') {
      if (d.moved) this.doc.end(); else this.doc.setActiveLevel(d.id);
      this.#renderOverlay();
      return;
    }
    if (d.kind === 'elevMove') { if (d.moved) this.doc.end(); this.#renderOverlay(); return; }
    if (d.kind === 'draw') {
      const a = d.a, b = this.preview?.b || a;
      this.preview = null;
      const g = this.doc.project.grid;
      const w = Math.abs(b[0] - a[0]), dd = Math.abs(b[1] - a[1]);
      const zr = r3(d.z - d.lz); // height on the active plane
      if (d.tool === 'arrow' || d.tool === 'dim') {
        const len = Math.hypot(w, dd);
        const end = len < g ? [a[0] + 8, a[1]] : b;
        const ends = { x1: a[0], y1: a[1], x2: end[0], y2: end[1], z: zr, level: d.level };
        this.#create(d.tool === 'dim' ? createDim(ends) : createArrow(ends), e);
        return;
      }
      const small = w < g * 0.99 || dd < g * 0.99;
      const size = { box: 8, cut: 4, terrain: 10 }[d.tool];
      const box = small ? { x: a[0], y: a[1], w: size, d: size } : { x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2, w, d: dd };
      if (d.tool === 'box') {
        const shape = this.layout.shape;
        const extra = shape === 'sphere' ? { w: Math.min(box.w, box.d), d: Math.min(box.w, box.d) } : shape === 'cone' || shape === 'pyramid' ? { h: 6 } : {};
        this.#create(createVolume({ ...box, h: 3, ...extra, shape, z: d.on ? 0 : zr, level: d.level, on: d.on }), e);
      } else if (d.tool === 'cut') {
        const shape = this.layout.cutShape;
        const round = shape === 'sphere' ? { w: Math.min(box.w, box.d), d: Math.min(box.w, box.d) } : {};
        const hz = this.#cutHeight(d, zr);
        // a sphere is as tall as it is wide: centred on the height the cut would have
        if (shape === 'sphere') { hz.z = r3(hz.z + Math.max(0, hz.h - round.w) / 2); hz.h = round.w; }
        this.#create(createCut({ ...box, ...round, ...hz, shape, level: d.level, target: d.target }), e);
        this.showCuts = true;
        this.#renderToolbar();
      } else {
        this.#create(this.#terrainObject(box, d, zr), e);
      }
    }
  }

  /**
   * Where a new cut starts and how tall it is: from the active plane up to the top of the volume it cuts
   * (all of the volume when that volume is below the plane); 6 m when it cuts what it crosses.
   */
  #cutHeight(d, zr) {
    if (!d.target) return { z: zr, h: 6 };
    const byId = indexById(this.doc.objects);
    const v = byId.get(d.target);
    const base = baseOf(v, byId, this.levels), top = base + heightOf(v);
    if (top - d.lz > 0.5) return { z: 0, h: r3(top - d.lz) };
    return { z: r3(base - d.lz), h: r3(heightOf(v)) };
  }

  /** A platform (raised 1 m on the ground, flat on any other plane) or a slope up to the next plane. */
  #terrainObject(box, d, zr) {
    if (this.layout.terrainKind === 'area') return createArea({ ...box, level: d.level, z: zr, kind: this.layout.areaKind || 'street' });
    if (this.layout.terrainKind === 'platform') {
      return createPlatform({ ...box, level: d.level, z: Math.abs(d.lz + zr) < 1e-6 ? 1 : zr });
    }
    const above = this.levels.filter((l) => l.z > d.lz + 1e-6).sort((p, q) => p.z - q.z)[0];
    return createSlope({ ...box, from: d.level, zFrom: zr, to: above ? above.id : d.level, zTo: above ? 0 : zr + 2 });
  }

  // ---- elevation

  /** Heights snap to half metres (Alt: centimetres). */
  #snapZ(z, e) { return e.altKey ? Math.round(z * 100) / 100 : Math.round(z * 2) / 2; }

  /** The level line within a few pixels of a height (screen), or null. */
  #levelNear(z, except = null) {
    const tol = SNAP_PX / this.cam.scale;
    let best = null;
    for (const l of this.levels) {
      if (l.id === except) continue;
      const dz = Math.abs(l.z - z);
      if (dz <= tol && (!best || dz < best.dz)) best = { level: l, dz };
    }
    return best?.level || null;
  }

  #elevDown(e) {
    const doc = this.doc;
    const z = -this.toDrawing(e)[1];
    if (this.elevTool === 'level') {
      // a new reference plane at this height, unless there is one there already
      const at = this.#snapZ(z, e);
      const near = this.levels.find((l) => Math.abs(l.z - at) < 1e-6);
      if (near) doc.setActiveLevel(near.id);
      else {
        const id = this.s.commands.addLevel();
        this.s.commands.setLevel(id, { z: at });
      }
      this.preview = null;
      if (!e.shiftKey) this.setElevTool('select');
      return;
    }
    const lineEl = e.target.closest?.('[data-level]');
    const hit = this.#hit(e);
    if (hit.handle) { this.#startHandle(e, hit.handle); return; }
    if (lineEl && !hit.id) {
      const l = this.levels.find((x) => x.id === lineEl.dataset.level);
      this.drag = { kind: 'level', id: l.id, z0: l.z, y0: this.toDrawing(e)[1], moved: false };
      this.#renderOverlay();
      return;
    }
    if (hit.id) {
      if (e.shiftKey || e.ctrlKey || e.metaKey) { doc.select([hit.id], { add: true }); return; }
      if (!doc.selection.has(hit.id)) doc.select([hit.id]);
      const byId = indexById(doc.objects);
      const o = byId.get(hit.id);
      const [X, Y] = this.toDrawing(e);
      this.drag = { kind: 'elevMove', id: o.id, X0: X, Y0: Y, base0: this.#anchorZ(o, byId), start: this.#withStacked(), moved: false };
      return;
    }
    if (!e.shiftKey) doc.clearSelection();
    this.#startMarquee(e);
  }

  #elevMove(e, d) {
    const [X, Y] = this.toDrawing(e);
    if (d.kind === 'level') {
      const z = this.#snapZ(d.z0 - (Y - d.y0), e);
      if (!d.moved) {
        if (Math.abs(z - d.z0) < 1e-9) return;
        d.moved = true;
        this.doc.begin('level.move');
      }
      this.doc.update((p) => { const l = p.levels.find((x) => x.id === d.id); if (l) l.z = z; });
      this.badge.textContent = `${levelName(this.levels.find((x) => x.id === d.id))}`;
      return;
    }
    // an object: sideways along the elevation, and up or down; near a level line its base snaps to it and
    // the object is anchored to that plane
    const view = this.view;
    const g = this.doc.project.grid;
    const along = e.altKey ? Math.round((X - d.X0) * 100) / 100 : Math.round((X - d.X0) / g) * g;
    const raw = d.base0 - (Y - d.Y0);
    const target = this.#levelNear(raw);
    const base = target ? target.z : this.#snapZ(raw, e);
    const dz = base - d.base0;
    if (!d.moved) {
      if (Math.abs(along) < 1e-9 && Math.abs(dz) < 1e-9) return;
      d.moved = true;
      this.doc.begin('object.move');
    }
    const levels = this.levels;
    this.doc.update((_p, step) => {
      for (const o of step.objects) {
        const s0 = d.start.get(o.id);
        if (!s0) continue;
        const dx = view.e1[0] * along, dy = view.e1[1] * along;
        if (o.type === 'opening') { /* it stays on its wall */ } else if (isLine(o)) { o.x1 = r3(s0.x1 + dx); o.y1 = r3(s0.y1 + dy); o.x2 = r3(s0.x2 + dx); o.y2 = r3(s0.y2 + dy); }
        else { o.x = r3(s0.x + dx); o.y = r3(s0.y + dy); }
        if (o.id !== d.id || Math.abs(dz) < 1e-9 || o.type === 'slope') continue;
        // the grabbed object changes height (what is stacked on it follows by itself)
        if (o.type === 'volume' && s0.on) o.on = null; // lifted off the volume below
        const lvl = target ? target.id : (s0.level || GROUND);
        o.level = lvl;
        o.z = r3(base - elevationOf(levels, lvl));
      }
    });
    this.badge.textContent = target ? t('elev.anchored', { name: levelName(target) }) : `${t('prop.base')} ${fmtZ(base)}`;
  }

  cancel() {
    const d = this.drag;
    this.drag = null;
    this.preview = null;
    this.poly = null;
    this.guides = [];
    this.canvas.classList.remove('panning');
    this.badge.textContent = '';
    if (d && (d.kind === 'handle' || ((d.kind === 'move' || d.kind === 'elevMove' || d.kind === 'level') && d.moved))) { this.doc.end(); this.s.commands.undo(); }
    this.#renderOverlay();
  }
}

/** How a level is named in lists: its name and its elevation. */
export const levelName = (l) => `${l.name || t('level.ground')} ${fmtZ(l.z)}`;

export const isTyping = (e) => {
  const el = e.target;
  return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
};

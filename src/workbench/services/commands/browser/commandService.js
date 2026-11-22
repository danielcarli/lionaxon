/*---------------------------------------------------------------------------------------------
 *  LionAxon — Copyright (C) 2026 LionAxon Team.
 *  Created and conceived by Daniel Michelon De Carli.
 *  Licensed under the GNU General Public License v3.0 or later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/
// Named commands: every action of the interface that changes the project or the files, in one place.
// Toolbar buttons, keyboard shortcuts, the panes and the tests all call these, so the list is also the
// base for a command palette and for agents later.
import { t } from '../../../../base/common/nls.js';
import { newId, clone, createCategory } from './commandHelpers.js';
import { GROUND_LEVEL, stepAngles, normalizeAngle, MAX_VIEWS, EXTRA_KEYS, baseOf, indexById, elevationOf, normalizeObject, createOpening, isLine, polyFromWorld, polyWorld } from '../../model/common/model.js';
import { rectRing } from '../../../../base/common/geometry/polygon.js';

const CATEGORY_COLORS = ['#e59aa6', '#8fa9cc', '#8aa346', '#e8b464', '#a68bc9', '#6fb3a8', '#d98a6c', '#9a948c'];

export class CommandService {
  constructor(services) {
    this.s = services;
    this.doc = services.document;
  }

  undo() { this.doc.undo(); }
  redo() { this.doc.redo(); }

  // ---- objects

  deleteSelection() {
    if (!this.doc.selection.size) return;
    const ids = new Set(this.doc.selection);
    // what is drawn on the walls of a deleted volume goes with it
    this.doc.run('object.delete', (_p, step) => { step.objects = step.objects.filter((o) => !ids.has(o.id) && !(o.type === 'opening' && ids.has(o.on))); return []; });
  }

  /** Draws a door, a window, an arch or a round opening in the middle of a wall of a box (the selected one). */
  addOpening(kind, side = 'front', volume = this.doc.selected()[0]) {
    if (!volume || volume.type !== 'volume' || volume.shape !== 'box') return null;
    const len = side === 'front' || side === 'back' ? volume.w : volume.d;
    const size = { door: [Math.min(1.2, len), Math.min(2.4, volume.h), 0], window: [Math.min(1.6, len), Math.min(1.4, volume.h), Math.min(1, volume.h / 3)], arch: [Math.min(2, len), Math.min(3, volume.h), 0], oculus: [Math.min(1.2, len), Math.min(1.2, volume.h), Math.max(0, volume.h - 1.8)] }[kind];
    if (!size) return null;
    const o = createOpening({ on: volume.id, side, kind, w: size[0], h: size[1], z: size[2] });
    this.doc.run('object.add', (_p, step) => { step.objects.push(o); return [o.id]; });
    return o.id;
  }

  duplicateSelection(offset = 2) {
    const picked = this.doc.selected();
    const pickedIds = new Set(picked.map((o) => o.id));
    // the openings of a duplicated volume are duplicated with it
    const sel = [...picked, ...this.doc.objects.filter((o) => o.type === 'opening' && pickedIds.has(o.on) && !pickedIds.has(o.id))];
    if (!sel.length) return;
    const g = this.doc.project.grid;
    const map = new Map(sel.map((o) => [o.id, newId(o.type[0])]));
    this.doc.run('object.duplicate', (_p, step) => {
      const copies = sel.map((o) => {
        const c = { ...clone(o), id: map.get(o.id) };
        if (c.type === 'opening') { /* it stays on its wall */ } else if (isLine(c)) { c.x1 += offset * g; c.x2 += offset * g; c.y1 -= offset * g; c.y2 -= offset * g; }
        else { c.x += offset * g; c.y -= offset * g; }
        if (c.type === 'volume' && c.on && map.has(c.on)) c.on = map.get(c.on);
        return c;
      });
      step.objects.push(...copies);
      return copies.map((c) => c.id);
    });
  }

  // ---- clipboard (kept by the app: it works from one step to another and between open diagrams)

  /** Copies the selection. Returns how many objects were copied. */
  copySelection() {
    const sel = this.doc.selected();
    if (!sel.length) return 0;
    const p = this.doc.project;
    const byId = indexById(this.doc.objects);
    clipboard = {
      from: `${this.doc.tab.id}/${this.doc.step.id}`, target: null, count: 0,
      // each object with the height of its base, so it lands at the same height where its plane does not exist
      objects: sel.map((o) => ({ ...clone(o), absZ: o.type === 'slope' ? null : baseOf(o, byId, p.levels) })),
      slopes: new Map(sel.filter((o) => o.type === 'slope').map((o) => [o.id, [elevationOf(p.levels, o.from) + o.zFrom, elevationOf(p.levels, o.to) + o.zTo]])),
      categories: p.categories.filter((c) => sel.some((o) => o.cat === c.id || o.color === c.id)).map(clone),
    };
    return sel.length;
  }

  cutSelection() {
    const n = this.copySelection();
    if (n) this.deleteSelection();
    return n;
  }

  get canPaste() { return !!clipboard?.objects.length; }

  /**
   * Pastes what was copied into the current step: in the same place when it comes from another step or
   * diagram, a little aside when pasted where it was copied. Categories that the diagram does not have
   * come along; a plane that does not exist becomes the ground, at the same height.
   */
  paste() {
    const clip = clipboard;
    if (!clip?.objects.length) return 0;
    const doc = this.doc;
    const target = `${doc.tab.id}/${doc.step.id}`;
    if (clip.target === target) clip.count++;
    else { clip.target = target; clip.count = target === clip.from ? 1 : 0; }
    const off = clip.count * 2 * doc.project.grid;
    const map = new Map(clip.objects.map((o) => [o.id, newId(o.type[0])]));
    doc.run('object.paste', (p, step) => {
      const levels = new Set(p.levels.map((l) => l.id));
      const ground = elevationOf(p.levels, GROUND_LEVEL);
      for (const c of clip.categories) if (!p.categories.some((x) => x.id === c.id)) p.categories.push(clone(c));
      const copies = [];
      for (const src of clip.objects) {
        const { absZ, ...rest } = clone(src);
        const c = normalizeObject({ ...rest, id: map.get(src.id) });
        if (c.type === 'opening') { /* it stays on its wall */ } else if (isLine(c)) { c.x1 = round(c.x1 + off); c.x2 = round(c.x2 + off); c.y1 = round(c.y1 - off); c.y2 = round(c.y2 - off); }
        else { c.x = round(c.x + off); c.y = round(c.y - off); }
        if (c.type === 'volume') {
          if (c.on && map.has(c.on)) c.on = map.get(c.on);
          else if (c.on && !step.objects.some((o) => o.id === c.on)) { c.on = null; c.z = round(absZ - elevationOf(p.levels, c.level)); }
        }
        if (c.type === 'cut' && c.target) c.target = map.get(c.target) || (step.objects.some((o) => o.id === c.target) ? c.target : null);
        if (c.type === 'slope') {
          const [zA, zB] = clip.slopes.get(src.id);
          if (c.from && !levels.has(c.from)) { c.from = GROUND_LEVEL; c.zFrom = round(zA - ground); }
          if (c.to && !levels.has(c.to)) { c.to = GROUND_LEVEL; c.zTo = round(zB - ground); }
        } else if (c.level && !levels.has(c.level)) {
          c.level = GROUND_LEVEL;
          if (!(c.type === 'volume' && c.on)) c.z = round(absZ - ground);
        }
        delete c.locked;
        copies.push(c);
      }
      step.objects.push(...copies);
      return copies.map((c) => c.id);
    });
    return clip.objects.length;
  }

  // ---- the same object in the steps that follow

  /**
   * Carries the selected objects, as they are now, to every step after this one: where the object exists
   * it is replaced; where it does not, it is added. Returns how many steps changed.
   */
  applyToFollowing(ids = [...this.doc.selection]) {
    const doc = this.doc;
    const from = doc.stepIndex;
    const sel = doc.objects.filter((o) => ids.includes(o.id));
    if (!sel.length || from >= doc.project.steps.length - 1) return 0;
    let steps = 0;
    doc.run('object.propagate', (p) => {
      for (let i = from + 1; i < p.steps.length; i++) {
        const st = p.steps[i];
        let touched = false;
        for (const o of sel) {
          const k = st.objects.findIndex((x) => x.id === o.id);
          if (k >= 0) { if (JSON.stringify(st.objects[k]) !== JSON.stringify(o)) { st.objects[k] = clone(o); touched = true; } }
          else { st.objects.push(clone(o)); touched = true; }
        }
        if (touched) steps++;
      }
    });
    this.s.notifications.info(steps ? t('propagate.done', { n: steps }) : t('propagate.none'), 6000, steps ? { label: t('drawing.undo'), run: () => this.undo() } : null);
    return steps;
  }

  /** Deletes the selected objects here and in every step after this one. */
  deleteInFollowing(ids = [...this.doc.selection]) {
    if (!ids.length) return;
    const set = new Set(ids);
    const from = this.doc.stepIndex;
    this.doc.run('object.deleteFollowing', (p) => {
      for (let i = from; i < p.steps.length; i++) p.steps[i].objects = p.steps[i].objects.filter((o) => !set.has(o.id));
      return [];
    });
  }

  /** Selects everything in the step that can be picked in the drawing (not locked, not hidden). */
  selectAll() { this.doc.select(this.doc.objects.filter((o) => !o.locked && !o.hidden).map((o) => o.id)); }

  // ---- lock, hide, align

  /** Locks or unlocks objects (the selection by default): a locked object is not picked or moved in the drawing. */
  setLocked(locked, ids = [...this.doc.selection]) { this.setProps({ locked: !!locked }, ids); if (locked) this.doc.clearSelection(); }
  setHidden(hidden, ids = [...this.doc.selection]) { this.setProps({ hidden: !!hidden }, ids); }

  /** Shows and unlocks everything in the step. */
  showAll() {
    if (!this.doc.objects.some((o) => o.hidden || o.locked)) return;
    this.doc.run('object.showAll', (_p, step) => { for (const o of step.objects) { delete o.hidden; delete o.locked; } });
  }

  /**
   * Lines the selected objects up in plan. `how`: 'left' | 'centerX' | 'right' (along X) or 'bottom' |
   * 'centerY' | 'top' (along Y), against the bounds of the whole selection.
   */
  alignSelection(how) {
    const sel = this.doc.selected().filter((o) => boundsOf(o));
    if (sel.length < 2) return;
    const axis = how === 'left' || how === 'right' || how === 'centerX' ? 0 : 1;
    const bs = new Map(sel.map((o) => [o.id, boundsOf(o)]));
    const lo = Math.min(...[...bs.values()].map((b) => b[axis])), hi = Math.max(...[...bs.values()].map((b) => b[axis + 2]));
    const target = (b) => (how === 'left' || how === 'bottom' ? lo - b[axis] : how === 'right' || how === 'top' ? hi - b[axis + 2] : (lo + hi) / 2 - (b[axis] + b[axis + 2]) / 2);
    this.#shift('object.align', new Map(sel.map((o) => [o.id, target(bs.get(o.id))])), axis);
  }

  /** Spreads three or more selected objects with equal gaps between them, along X ('x') or Y ('y'). */
  distributeSelection(along) {
    const axis = along === 'x' ? 0 : 1;
    const sel = this.doc.selected().filter((o) => boundsOf(o)).map((o) => ({ o, b: boundsOf(o) })).sort((p, q) => p.b[axis] - q.b[axis]);
    if (sel.length < 3) return;
    const total = sel.reduce((a, { b }) => a + b[axis + 2] - b[axis], 0);
    const gap = (sel[sel.length - 1].b[axis + 2] - sel[0].b[axis] - total) / (sel.length - 1);
    const moves = new Map();
    let at = sel[0].b[axis];
    for (const { o, b } of sel) { moves.set(o.id, at - b[axis]); at += b[axis + 2] - b[axis] + gap; }
    this.#shift('object.distribute', moves, axis);
  }

  /** Moves objects along one axis (what is stacked on them follows). */
  #shift(name, moves, axis) {
    this.doc.run(name, (_p, step) => {
      const done = new Set();
      for (const [id, dv] of moves) {
        if (Math.abs(dv) < 1e-9) continue;
        for (const sid of withStacked(step, [id])) {
          if (done.has(sid) || (sid !== id && moves.has(sid))) continue;
          done.add(sid);
          const o = step.objects.find((x) => x.id === sid);
          if (o.type === 'opening') { /* it stays on its wall */ } else if (isLine(o)) { if (axis) { o.y1 = round(o.y1 + dv); o.y2 = round(o.y2 + dv); } else { o.x1 = round(o.x1 + dv); o.x2 = round(o.x2 + dv); } }
          else if (axis) o.y = round(o.y + dv); else o.x = round(o.x + dv);
        }
      }
    });
  }

  /** Copies of the selected volume side by side along its width (or depth), with a gap. */
  duplicateSeries(count, gap, axis = 'w') {
    const [o] = this.doc.selected();
    if (!o || (o.type !== 'volume' && o.type !== 'cut') || count < 1) return;
    const a = (o.rot * Math.PI) / 180;
    const dir = axis === 'w' ? [Math.cos(a), Math.sin(a)] : [-Math.sin(a), Math.cos(a)];
    const step = (axis === 'w' ? o.w : o.d) + gap;
    this.doc.run('object.series', (_p, s) => {
      const ids = [o.id];
      for (let i = 1; i <= count; i++) {
        const c = { ...clone(o), id: newId(o.type[0]), x: round(o.x + dir[0] * step * i), y: round(o.y + dir[1] * step * i) };
        s.objects.push(c);
        ids.push(c.id);
      }
      return ids;
    });
  }

  nudge(dx, dy) {
    const sel = this.doc.selected();
    if (!sel.length) return;
    this.doc.run('object.nudge', (_p, step) => {
      const ids = withStacked(step, sel.map((o) => o.id));
      for (const o of step.objects) {
        if (!ids.has(o.id)) continue;
        if (o.type === 'opening') { /* it stays on its wall */ } else if (isLine(o)) { o.x1 = round(o.x1 + dx); o.x2 = round(o.x2 + dx); o.y1 = round(o.y1 + dy); o.y2 = round(o.y2 + dy); }
        else { o.x = round(o.x + dx); o.y = round(o.y + dy); }
      }
    });
  }

  /** Turns the selected volumes, cuts, platforms and slopes; what is stacked on them turns with them. */
  rotateSelection(deg) {
    const sel = this.doc.selected().filter((o) => ROTATABLE.has(o.type));
    if (!sel.length) return;
    this.doc.run('object.rotate', (_p, step) => {
      const byId = new Map(step.objects.map((o) => [o.id, o]));
      const done = new Set();
      const a = (deg * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a);
      for (const root of sel) {
        const r = byId.get(root.id);
        const cx = r.x, cy = r.y;
        for (const id of withStacked(step, [r.id])) {
          const o = byId.get(id);
          if (!o || done.has(id) || !ROTATABLE.has(o.type)) continue;
          done.add(id);
          const rx = o.x - cx, ry = o.y - cy;
          o.x = round(cx + rx * c - ry * sn);
          o.y = round(cy + rx * sn + ry * c);
          o.rot = round((((o.rot + deg) % 360) + 360) % 360);
        }
      }
    });
  }

  /** Changes fields of the selected objects (only the fields that exist on each type). */
  setProps(props, ids = [...this.doc.selection]) {
    const set = new Set(ids);
    this.doc.run('object.set', (_p, step) => {
      for (const o of step.objects) {
        if (!set.has(o.id)) continue;
        for (const [k, v] of Object.entries(props)) {
          // a roof is kept only when there is one
          if (k === 'roof' && o.type === 'volume') { if (v && v !== 'flat') { o.roof = v; o.roofH ??= 3; } else { delete o.roof; delete o.roofH; } continue; }
          if (k === 'roofH' && o.roof) { o.roofH = v; continue; }
          // what an object only carries when it has it: a colour of its own, the direction and colour of a roof,
          // the height where an arrow ends, the note and the mark of a label, the joints of a floor
          if (OPTIONAL[k]?.includes(o.type)) {
            const keep = k === 'z2' ? v !== null && v !== '' && Number.isFinite(Number(v)) && Number(v) !== o.z : k === 'roofDir' ? v === 'w' || v === 'd' : k === 'joints' ? Number(v) > 0 : !!v;
            if (!keep) delete o[k]; else o[k] = k === 'z2' || k === 'joints' ? Number(v) : v;
            continue;
          }
          if (EXTRA_KEYS.includes(k)) { if (v) o[k] = k === 'name' ? String(v).trim().slice(0, 80) : true; else delete o[k]; }
          else if (k in o && k !== 'id' && k !== 'type') o[k] = v;
        }
      }
    });
  }

  // ---- steps

  setStepProps(props) {
    this.doc.run('step.set', (_p, step) => { Object.assign(step, props); });
  }

  addStep() { this.doc.addStep(); }

  // ---- the angles a step is seen from on the sheet (set in the 3D viewer)

  /** The step is seen from `angle` (replacing its angle number `slot`; the first one by default). */
  setStepAngle(slot, angle) {
    this.doc.run('step.angle', (p, step) => {
      const list = step.views?.length ? step.views.slice() : [];
      if (!list.length) list.push(normalizeAngle(angle));
      else list[Math.max(0, Math.min(slot, list.length - 1))] = normalizeAngle(angle);
      step.views = list;
    });
  }

  /**
   * The same step, seen from one more angle: its drawings go side by side on the sheet, under one caption.
   * Returns the number of the new angle.
   */
  addStepAngle(angle) {
    const p = this.doc.project;
    const list = stepAngles(p, this.doc.step).map((a) => ({ ...a }));
    if (list.length >= MAX_VIEWS) { this.s.notifications.info(t('orbit.max', { n: MAX_VIEWS })); return list.length - 1; }
    list.push(normalizeAngle(angle));
    this.doc.run('step.angle.add', (_p, step) => { step.views = list.map(normalizeAngle); });
    return list.length - 1;
  }

  /** Takes one angle out of the step (with none left, the step goes back to the project's angle). */
  removeStepAngle(j) {
    this.doc.run('step.angle.remove', (_p, step) => { step.views = (step.views || []).filter((_, k) => k !== j); });
  }

  /** The step goes back to the project's angle. */
  resetStepAngles() {
    this.doc.run('step.angle.reset', (_p, step) => { step.views = []; });
  }

  /** Deletes a step. Nothing is asked: a notice offers to undo it. */
  async removeStep(i) {
    const doc = this.doc;
    if (doc.project.steps.length <= 1) { this.s.notifications.info(t('steps.lastOne')); return false; }
    const step = doc.project.steps[i];
    doc.removeStep(i);
    this.s.notifications.info(t('steps.removedNamed', { n: String(i + 1).padStart(2, '0'), title: step.title || t('steps.untitled') }), 9000, { label: t('drawing.undo'), run: () => this.undo() });
    return true;
  }

  // ---- project

  setProject(fn, name = 'project.set') { this.doc.run(name, (p) => { fn(p); }); }

  /** The site takes any outline (points in metres), or goes back to a rectangle (null). */
  setSiteOutline(pts) {
    this.doc.run('site.outline', (p) => {
      if (pts && pts.length >= 3) {
        const x0 = Math.min(...pts.map((q) => q[0])), y0 = Math.min(...pts.map((q) => q[1]));
        // the site starts at (0, 0): everything drawn moves with it
        if (Math.abs(x0) > 1e-9 || Math.abs(y0) > 1e-9) {
          for (const st of p.steps) for (const o of st.objects) {
            if (o.type === 'opening') { /* it stays on its wall */ } else if (isLine(o)) { o.x1 = round(o.x1 - x0); o.x2 = round(o.x2 - x0); o.y1 = round(o.y1 - y0); o.y2 = round(o.y2 - y0); }
            else { o.x = round(o.x - x0); o.y = round(o.y - y0); }
          }
          if (p.underlay) { p.underlay.x = round(p.underlay.x - x0); p.underlay.y = round(p.underlay.y - y0); }
        }
        p.site.pts = pts.map(([x, y]) => [round(x - x0), round(y - y0)]);
        p.site.w = Math.max(1, ...p.site.pts.map((q) => q[0]));
        p.site.d = Math.max(1, ...p.site.pts.map((q) => q[1]));
      } else delete p.site.pts;
    });
  }

  /** Asks for an image (a site plan, an aerial photo) and lays it under the drawing, as wide as the site. */
  async pickUnderlay() {
    const res = await this.s.host.project.pickImage?.();
    if (!res) return false;
    if (!res.ok) { this.s.notifications.warn(t('underlay.failed', { error: res.error || '' })); return false; }
    try {
      const { src, ratio } = await shrinkImage(res.dataUrl);
      const w = this.doc.project.site.w;
      this.doc.run('underlay.set', (p) => { p.underlay = { src, x: 0, y: 0, w, h: round(w * ratio), rot: 0, opacity: 0.6, sheet: false }; });
      return true;
    } catch (err) {
      this.s.notifications.warn(t('underlay.failed', { error: String(err.message || err) }));
      return false;
    }
  }

  async exportGif(opts) { return this.#exported(await this.s.export.exportGif(opts).catch((e) => ({ ok: false, error: String(e.message || e) }))); }

  // ---- reference planes (levels)

  /** Adds a reference plane above the highest one (3 m higher) and makes it the active one. */
  addLevel() {
    const levels = this.doc.project.levels;
    const top = Math.max(...levels.map((l) => l.z));
    const id = newId('L');
    this.doc.run('level.add', (p) => { p.levels.push({ id, name: t('level.defaultName', { n: p.levels.length }), z: round(top + 3) }); });
    this.doc.setActiveLevel(id);
    return id;
  }

  setLevel(id, props) {
    this.doc.run('level.set', (p) => {
      const l = p.levels.find((x) => x.id === id);
      if (l) Object.assign(l, props);
      p.levels.sort((a, b) => a.z - b.z);
    });
  }

  /**
   * Removes a reference plane. What was on it goes to the ground plane and stays where it was in height.
   * The ground plane itself cannot be removed.
   */
  removeLevel(id) {
    if (id === GROUND_LEVEL) return false;
    this.doc.run('level.remove', (p) => {
      const gone = p.levels.find((l) => l.id === id);
      if (!gone) return;
      const ground = p.levels.find((l) => l.id === GROUND_LEVEL);
      const dz = gone.z - (ground?.z ?? 0);
      for (const st of p.steps) {
        for (const o of st.objects) {
          if (o.level === id) { o.level = GROUND_LEVEL; o.z = round((o.z || 0) + dz); }
          if (o.type === 'slope') {
            if (o.from === id) { o.from = GROUND_LEVEL; o.zFrom = round(o.zFrom + dz); }
            if (o.to === id) { o.to = GROUND_LEVEL; o.zTo = round(o.zTo + dz); }
          }
        }
      }
      p.levels = p.levels.filter((l) => l.id !== id);
    });
    return true;
  }

  rotateView(dir) {
    this.doc.run('view.rotate', (p) => {
      const k = (((Math.round((p.view.az + 45) / 90) + dir) % 4) + 4) % 4;
      p.view.az = -45 + 90 * k;
    });
  }

  addCategory(name) {
    const p = this.doc.project;
    const color = CATEGORY_COLORS[p.categories.length % CATEGORY_COLORS.length];
    const cat = createCategory(name || t('categories.newName', { n: p.categories.length + 1 }), color);
    this.doc.run('category.add', (pp) => { pp.categories.push(cat); });
    return cat;
  }

  removeCategory(id) {
    this.doc.run('category.remove', (p) => {
      p.categories = p.categories.filter((c) => c.id !== id);
      for (const s of p.steps) {
        for (const o of s.objects) {
          if (o.type === 'volume' && o.cat === id) o.cat = null;
          if (o.type === 'arrow' && o.color === id) o.color = 'ink';
        }
      }
    });
  }

  // ---- files

  async newProject() {
    this.doc.newProject();
  }

  /**
   * Closes a diagram's tab. With unsaved changes, asks first: save (then close), don't save, or cancel.
   * Resolves true when the tab was closed.
   */
  async closeTab(i = this.doc.active) {
    const tab = this.doc.tabs[i];
    if (!tab) return false;
    if (tab.dirty) {
      if (i !== this.doc.active) this.doc.switchTo(i);
      const answer = await this.s.confirmation.askSave({ name: this.doc.nameOf(tab) || t('file.untitled') });
      if (answer === 'cancel') return false;
      if (answer === 'save' && !(await this.#saveTab(tab))) return false;
    }
    this.doc.closeTab(this.doc.tabs.indexOf(tab));
    return true;
  }

  /**
   * The window is about to close: each diagram with unsaved changes is shown and the person chooses.
   * Cancelling any of them keeps the window open. The session is written so that the tabs come back next
   * time (a diagram whose changes were thrown away comes back as it is on disk, or not at all).
   */
  async closeWindow() {
    if (this.closing) return;
    this.closing = true;
    try {
      const discard = new Set();
      const dirty = this.doc.tabs.filter((tb) => tb.dirty);
      for (let k = 0; k < dirty.length; k++) {
        const tab = dirty[k];
        this.doc.switchTo(this.doc.tabs.indexOf(tab));
        const answer = await this.s.confirmation.askSave({ name: this.doc.nameOf(tab) || t('file.untitled'), more: dirty.length - k - 1 });
        if (answer === 'cancel') return;
        if (answer === 'discard') discard.add(tab.id);
        else if (!(await this.#saveTab(tab))) return;
      }
      await this.doc.writeSession(discard);
      this.s.host.confirmClose?.();
    } finally {
      this.closing = false;
    }
  }

  async #saveTab(tab) {
    try {
      const res = await this.doc.save({ tab });
      if (res) this.s.notifications.info(t('file.saved', { name: res.name }));
      return !!res;
    } catch (err) {
      this.s.notifications.warn(t('file.saveFailed', { error: friendly(err) }));
      return false;
    }
  }

  nextTab(delta = 1) {
    const n = this.doc.tabs.length;
    if (n > 1) this.doc.switchTo((this.doc.active + delta + n) % n);
  }

  async open() {
    try { await this.doc.open(); } catch (err) { this.s.notifications.warn(t('file.openFailed', { error: friendly(err) })); }
  }

  async openPath(file) {
    try { await this.doc.openPath(file); } catch (err) { this.s.notifications.warn(t('file.openFailed', { error: friendly(err) })); }
  }

  async save(as = false) {
    try {
      const res = await this.doc.save({ as });
      if (res) this.s.notifications.info(t('file.saved', { name: res.name }));
      return res;
    } catch (err) {
      this.s.notifications.warn(t('file.saveFailed', { error: friendly(err) }));
      return null;
    }
  }

  async example(id = 'parti') {
    try { await this.doc.loadExample(id); } catch (err) { this.s.notifications.warn(t('file.openFailed', { error: friendly(err) })); }
  }

  async exportSheet(kind, opts) { return this.#exported(await this.s.export.exportSheet(kind, opts).catch((e) => ({ ok: false, error: String(e.message || e) }))); }
  async exportStep(kind) { return this.#exported(await this.s.export.exportStep(kind).catch((e) => ({ ok: false, error: String(e.message || e) }))); }

  #exported(res) {
    if (!res) return null;
    if (res.ok && res.pages > 1) this.s.notifications.info(t('export.donePages', { name: res.name, n: res.pages }));
    else if (res.ok) this.s.notifications.info(t('export.done', { name: res.name }));
    else this.s.notifications.warn(t('export.failed', { error: res.error || '' }));
    return res;
  }
}

const round = (v) => Math.round(v * 1000) / 1000;

/** An image as a JPEG data URL no larger than 2200 px on its longer side (so the file stays light). */
async function shrinkImage(dataUrl, max = 2200) {
  const img = new Image();
  await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = () => reject(new Error('image')); img.src = dataUrl; });
  const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * k));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * k));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return { src: canvas.toDataURL('image/jpeg', 0.86), ratio: img.naturalHeight / img.naturalWidth };
}
/** Fields kept only when set, and the kinds of object that may have them. */
const OPTIONAL = { color: ['volume'], roofColor: ['volume'], roofDir: ['volume'], z2: ['arrow'], note: ['label'], mark: ['label'], joints: ['area'] };

/** What was copied (shared by every open diagram). */
let clipboard = null;

/** Bounds in plan of an object: [x0, y0, x1, y1] (null for what has no place of its own). */
function boundsOf(o) {
  if (o.type === 'opening') return null;
  if (isLine(o)) return [Math.min(o.x1, o.x2), Math.min(o.y1, o.y2), Math.max(o.x1, o.x2), Math.max(o.y1, o.y2)];
  if (o.w == null) return o.x == null ? null : [o.x, o.y, o.x, o.y];
  const ring = rectRing(o.x, o.y, o.w, o.shape === 'sphere' ? o.w : o.d, o.rot || 0);
  const xs = ring.map((p) => p[0]), ys = ring.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}
const ROTATABLE = new Set(['volume', 'cut', 'platform', 'slope', 'area']);

/** The given ids and every volume stacked on them, all the way up. */
function withStacked(step, ids) {
  const out = new Set(ids);
  let grew = true;
  while (grew) {
    grew = false;
    for (const o of step.objects) if (o.type === 'volume' && o.on && out.has(o.on) && !out.has(o.id)) { out.add(o.id); grew = true; }
  }
  return out;
}
const friendly = (err) => {
  const m = String(err?.message || err);
  if (m === 'not-a-project') return t('file.notAProject');
  if (m === 'newer-schema') return t('file.newerSchema');
  if (/JSON/.test(m)) return t('file.notAProject');
  return m;
};

/*---------------------------------------------------------------------------------------------
 *  LionAxon — Copyright (C) 2026 LionAxon Team.
 *  Created and conceived by Daniel Michelon De Carli.
 *  Licensed under the GNU General Public License v3.0 or later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/
// Tab picks what is behind: when several objects are drawn over the same spot (one volume behind another
// in an elevation, a subtraction inside a volume), a click only reaches the one in front. Tab goes to the
// next one under that spot, Shift+Tab to the one before. While it does, the object picked takes an outline
// in another colour and everything else fades, so that it shows through whatever covers it; a press on the
// spot then grabs the object picked, not the one in front. It ends when the selection changes any other way.

/** The colour of the outline of an object picked with Tab. */
export const PICK = '#c026d3';

export class PickCycle {
  /** @param view what it works on: { canvas (the element that takes the classes), content (the drawing), doc } */
  constructor(view) {
    this.view = view;
    this.point = null;   // where the last press was, in window coordinates
    this.hover = null;   // where the mouse is over the drawing
    this.ids = [];       // the objects under the spot, the one in front first
    this.current = null; // the one picked
  }

  get active() { return this.current !== null; }

  setPoint(e) { this.point = [e.clientX, e.clientY]; }
  setHover(e) { this.hover = [e.clientX, e.clientY]; }

  /** The objects drawn under a point of the window, the one in front first; locked ones are left out. */
  under([x, y]) {
    const { content, doc } = this.view;
    const ids = [];
    for (const el of document.elementsFromPoint(x, y)) {
      if (!content.contains(el)) continue;
      const id = el.closest('[data-id]')?.dataset.id;
      if (!id || ids.includes(id)) continue;
      const o = doc.byId(id);
      if (o && !o.locked) ids.push(id);
    }
    return ids;
  }

  /** The middle of an object as drawn, in window coordinates. */
  #middleOf(id) {
    const el = this.view.content.querySelector(`[data-id="${CSS.escape(id)}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return [r.left + r.width / 2, r.top + r.height / 2];
  }

  /**
   * Picks the next object under the spot (dir 1) or the one before (dir -1). The spot is where the last
   * press was if the selected object is there, else the middle of the selected object, else the mouse.
   * Returns false when there is nothing else there.
   */
  next(dir = 1) {
    const { doc } = this.view;
    const sel = [...doc.selection];
    const only = sel.length === 1 ? sel[0] : null;
    if (!this.active || this.current !== only || !this.ids.every((id) => doc.byId(id))) {
      this.current = null;
      let ids = [];
      for (const p of [this.point, only && this.#middleOf(only), !only && this.hover]) {
        if (!p) continue;
        ids = this.under(p);
        if (!only ? ids.length : ids.includes(only)) break;
        ids = [];
      }
      if (ids.length < (only ? 2 : 1)) return false;
      this.ids = ids;
    }
    const n = this.ids.length;
    const i = this.ids.indexOf(only);
    this.current = this.ids[i < 0 ? 0 : (i + dir + n) % n];
    if (this.current === only) this.mark(); else doc.select([this.current]);
    return true;
  }

  /** While picking, a press on one of the objects of the spot is a press on the one picked. */
  resolve(id) { return this.active && this.ids.includes(id) ? this.current : id; }

  stop() {
    if (!this.active && !this.view.canvas.classList.contains('cycling')) return;
    this.current = null;
    this.ids = [];
    this.view.canvas.classList.remove('cycling');
    for (const el of this.view.content.querySelectorAll('.cycle-on')) el.classList.remove('cycle-on');
  }

  /** After each drawing: fades everything but the object picked — or ends, if the selection is another one. */
  mark() {
    const { doc, canvas, content } = this.view;
    if (!this.active) { if (canvas.classList.contains('cycling')) this.stop(); return; }
    if (doc.selection.size !== 1 || !doc.selection.has(this.current)) { this.stop(); return; }
    canvas.classList.add('cycling');
    for (const el of content.querySelectorAll('.cycle-on')) el.classList.remove('cycle-on');
    for (const el of content.querySelectorAll(`[data-id="${CSS.escape(this.current)}"]`)) el.classList.add('cycle-on');
  }
}

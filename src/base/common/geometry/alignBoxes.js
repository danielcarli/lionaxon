/*---------------------------------------------------------------------------------------------
 *  LionAxon — Copyright (C) 2026 LionAxon Team.
 *  Created and conceived by Daniel Michelon De Carli.
 *  Licensed under the GNU General Public License v3.0 or later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/
// Aligning and spreading boxes ([x0, y0, x1, y1]), as in the align panel of a drawing program: the
// moves each box takes, along one axis. Used for shapes in plan and for texts as drawn on the screen.

/** The axis an alignment works on: 0 for left, right and centres in X; 1 for the others. */
export const alignAxis = (how) => (how === 'left' || how === 'right' || how === 'centerX' ? 0 : 1);

/**
 * How far each box moves to line up with the others (on the outer edges of all of them, or on their
 * middle). `yDown`: the Y axis grows downwards (the screen), so 'top' is the smallest Y; else (a plan)
 * 'top' is the back, the largest Y. Returns the axis and a map id → the move.
 */
export function alignMoves(boxes, how, { yDown = false } = {}) {
  const axis = alignAxis(how);
  const list = [...boxes.values()];
  const lo = Math.min(...list.map((b) => b[axis])), hi = Math.max(...list.map((b) => b[axis + 2]));
  const low = how === 'left' || how === (yDown ? 'top' : 'bottom');
  const high = how === 'right' || how === (yDown ? 'bottom' : 'top');
  const moves = new Map();
  for (const [id, b] of boxes) moves.set(id, low ? lo - b[axis] : high ? hi - b[axis + 2] : (lo + hi) / 2 - (b[axis] + b[axis + 2]) / 2);
  return { axis, moves };
}

/**
 * How far each box moves so that three or more of them have equal gaps between them along the axis (the
 * first and the last stay). Returns a map id → the move, or null for fewer than three boxes.
 */
export function distributeMoves(boxes, axis) {
  const list = [...boxes].map(([id, b]) => ({ id, b })).sort((p, q) => p.b[axis] - q.b[axis] || p.b[axis + 2] - q.b[axis + 2]);
  if (list.length < 3) return null;
  const total = list.reduce((a, { b }) => a + b[axis + 2] - b[axis], 0);
  const gap = (list[list.length - 1].b[axis + 2] - list[0].b[axis] - total) / (list.length - 1);
  const moves = new Map();
  let at = list[0].b[axis];
  for (const { id, b } of list) { moves.set(id, at - b[axis]); at += b[axis + 2] - b[axis] + gap; }
  return moves;
}

/**
 * Smart guides: where a box being moved comes close (within `tol`) to the left, centre or right (top,
 * middle, bottom) of another box, it snaps to it. Returns the correction [cx, cy] and the guides, lines
 * [[x, y], [x, y]] across the boxes that now share that line.
 */
export function snapBox(box, others, tol) {
  const fix = [0, 0];
  const lines = [null, null];
  for (const axis of [0, 1]) {
    const mine = [box[axis], (box[axis] + box[axis + 2]) / 2, box[axis + 2]];
    let best = null;
    for (const ob of others) {
      for (const v of [ob[axis], (ob[axis] + ob[axis + 2]) / 2, ob[axis + 2]]) for (const m of mine) {
        const diff = v - m;
        if (Math.abs(diff) <= tol && (!best || Math.abs(diff) < Math.abs(best.diff) - 1e-9)) best = { diff, v };
      }
    }
    if (best) { fix[axis] = best.diff; lines[axis] = best.v; }
  }
  const moved = [box[0] + fix[0], box[1] + fix[1], box[2] + fix[0], box[3] + fix[1]];
  const guides = [];
  const eps = Math.max(tol * 1e-3, 1e-9);
  for (const axis of [0, 1]) {
    const v = lines[axis];
    if (v == null) continue;
    // the line runs across the box moved and every other box with an edge or its middle on it
    const on = [moved, ...others.filter((ob) => [ob[axis], (ob[axis] + ob[axis + 2]) / 2, ob[axis + 2]].some((x) => Math.abs(x - v) <= eps))];
    const other = 1 - axis;
    const lo = Math.min(...on.map((b) => b[other])), hi = Math.max(...on.map((b) => b[other + 2]));
    guides.push(axis === 0 ? [[v, lo], [v, hi]] : [[lo, v], [hi, v]]);
  }
  return { fix, guides };
}

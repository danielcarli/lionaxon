/*---------------------------------------------------------------------------------------------
 *  LionAxon — Copyright (C) 2026 LionAxon Team.
 *  Created and conceived by Daniel Michelon De Carli.
 *  Licensed under the GNU General Public License v3.0 or later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/
// 2D polygon helpers. A ring is [[x, y], ...] without the closing point; a polygon is [outer, ...holes];
// a multipolygon is [polygon, ...]. Boolean operations go through polygon-clipping (MIT), which uses the
// Martinez-Rueda-Feito algorithm; coordinates are rounded to 1 mm first so touching shapes stay clean.
import pc from '../../../vendor/polygon-clipping/polygon-clipping.mjs';

const Q = 1000; // 1 mm grid for boolean operations
const q = (v) => Math.round(v * Q) / Q;

export function rectRing(cx, cy, w, d, rotDeg = 0) {
  const a = (rotDeg * Math.PI) / 180;
  const c = Math.cos(a), s = Math.sin(a);
  const hw = w / 2, hd = d / 2;
  return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c]);
}

export function signedArea(ring) {
  let a = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % n];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

/** Outer rings counter-clockwise, holes clockwise: the solid is always on the left of every edge. */
export function orientPolygon(poly) {
  return poly.map((ring, i) => {
    const ccw = signedArea(ring) > 0;
    return (i === 0) === ccw ? ring : ring.slice().reverse();
  });
}

const close = (ring, k = Q) => { const r = (v) => Math.round(v * k) / k; return [...ring.map(([x, y]) => [r(x), r(y)]), [r(ring[0][0]), r(ring[0][1])]]; };
const toPc = (poly, k = Q) => poly.map((ring) => close(ring, k));

/**
 * A boolean operation of polygon-clipping that does not give up: its sweep line can fail on points a hair
 * apart (real building models have them), so it is tried again on a coarser grid (1 cm, then 5 cm) before
 * `fallback` is taken.
 */
function robust(op, mps, fallback) {
  for (const k of [Q, 100, 20]) {
    try { return fromPc(pc[op](...mps.map((m) => m.map((poly) => toPc(poly, k))))); } catch { /* a coarser grid */ }
  }
  return fallback();
}
const fromPc = (mp) => mp
  .map((poly) => poly.map((ring) => ring.slice(0, -1)).filter((r) => r.length >= 3))
  .filter((poly) => poly.length && Math.abs(signedArea(poly[0])) > 1e-6)
  .map(orientPolygon);

/** subject minus every clip polygon; all arguments and the result are multipolygons. */
export function difference(subject, clips) {
  if (!subject.length) return [];
  if (!clips.length) return subject.map(orientPolygon);
  return robust('difference', [subject, ...clips], () => subject.map(orientPolygon));
}

export function union(...mps) {
  const list = mps.filter((m) => m.length);
  if (!list.length) return [];
  return robust('union', list, () => list.flat().map(orientPolygon));
}

export function intersection(a, b) {
  if (!a.length || !b.length) return [];
  return robust('intersection', [a, b], () => []);
}

export function multiArea(mp) {
  return mp.reduce((s, poly) => s + poly.reduce((t, ring, i) => t + (i ? -1 : 1) * Math.abs(signedArea(ring)), 0), 0);
}

export function pointInRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function pointInPolygon(p, poly) {
  if (!pointInRing(p, poly[0])) return false;
  for (let i = 1; i < poly.length; i++) if (pointInRing(p, poly[i])) return false;
  return true;
}

export function bboxOf(points) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of points) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return [x0, y0, x1, y1];
}

export const bboxOverlap = (a, b, eps = 0) => a[0] < b[2] - eps && b[0] < a[2] - eps && a[1] < b[3] - eps && b[1] < a[3] - eps;

export function bboxUnion(a, b) {
  if (!a) return b;
  if (!b) return a;
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
}

/** Convex hull (monotone chain), counter-clockwise. */
export function convexHull(points) {
  const pts = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

/** Separating-axis test on two convex polygons: true only when they overlap by more than eps (touching is not overlapping). */
export function convexOverlap(a, b, eps = 1e-4) {
  if (a.length < 3 || b.length < 3) return false;
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const [x1, y1] = poly[i];
      const [x2, y2] = poly[(i + 1) % poly.length];
      let nx = y2 - y1, ny = x1 - x2;
      const len = Math.hypot(nx, ny);
      if (len < 1e-12) continue;
      nx /= len; ny /= len;
      let amin = Infinity, amax = -Infinity, bmin = Infinity, bmax = -Infinity;
      for (const [x, y] of a) { const p = x * nx + y * ny; if (p < amin) amin = p; if (p > amax) amax = p; }
      for (const [x, y] of b) { const p = x * nx + y * ny; if (p < bmin) bmin = p; if (p > bmax) bmax = p; }
      if (amax <= bmin + eps || bmax <= amin + eps) return false;
    }
  }
  return true;
}

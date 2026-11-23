/*---------------------------------------------------------------------------------------------
 *  LionAxon — Copyright (C) 2026 LionAxon Team.
 *  Created and conceived by Daniel Michelon De Carli.
 *  Licensed under the GNU General Public License v3.0 or later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/
// Terrain drawn as one piece (the site's "Join terrain" switch): platforms and slopes that touch are drawn
// as one terrain, not as boxes side by side.
//   - faces of the ground that lie in the same plane and touch (the tops of two platforms at the same
//     height, the fronts of two platforms in a row) become one face: the line between them goes;
//   - where two surfaces of the ground meet at an angle (a slope coming up to a plateau) the fold is not
//     drawn either, so the terrain reads as one surface; steps (a wall going down) stay drawn.
import { union } from '../../../../base/common/geometry/polygon.js';

const r6 = (v) => Math.round(v * 1e6) / 1e6;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** Two directions on a plane, to draw its faces flat (x, y for a level plane). */
function basisOf(n) {
  if (Math.abs(n[2]) > 0.999) return null;
  const u = norm(cross([0, 0, 1], n));
  return [u, norm(cross(n, u))];
}

/** The ground faces of a step, those of the platforms and slopes that touch joined into one terrain. */
export function joinTerrain(faces) {
  const out = [];
  const groups = new Map();
  for (const f of faces) {
    if (!f.obj || f.smooth || !f.rings?.length) { out.push(f); continue; }
    const c = dot(f.n, f.rings[0][0]);
    const key = `${f.n.map((v) => Math.round(v * 1000)).join(',')}|${Math.round(c * 1000)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ f, c });
  }
  for (const list of groups.values()) {
    if (list.length === 1) { out.push(list[0].f); continue; }
    const n = list[0].f.n, c = list[0].c, basis = basisOf(n);
    // flat on the plane, joined, and back in 3D
    const to2 = basis ? (p) => [dot(p, basis[0]), dot(p, basis[1])] : (p) => [p[0], p[1]];
    const origin = [n[0] * c, n[1] * c, n[2] * c];
    const to3 = basis
      ? ([a, b]) => [origin[0] + basis[0][0] * a + basis[1][0] * b, origin[1] + basis[0][1] * a + basis[1][1] * b, origin[2] + basis[0][2] * a + basis[1][2] * b].map(r6)
      : ([x, y]) => [x, y, r6((c - n[0] * x - n[1] * y) / n[2])];
    const area = (ring) => Math.abs(ring.reduce((s, p, i) => { const q = ring[(i + 1) % ring.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
    const joined = union(...list.map(({ f }) => [f.rings.map((r) => r.map(to2))]));
    // the object a joined face answers for (selection, sections): the one with the most of it
    const owner = list.reduce((a, b) => (area(b.f.rings[0].map(to2)) > area(a.f.rings[0].map(to2)) ? b : a)).f;
    for (const poly of joined) {
      const rings = poly.map((r) => r.map(to3));
      out.push({ ...owner, rings, lines: list.flatMap(({ f }) => f.lines || []), joined: true });
    }
  }
  foldsHidden(out);
  return out;
}

/** Marks the edges of the up-facing ground faces that lie on the edge of another up-facing one (the fold of the terrain): not drawn. */
function foldsHidden(faces) {
  const up = faces.filter((f) => f.obj && !f.smooth && f.n[2] > 0.05 && f.rings?.length);
  const segsOf = (f) => f.rings.flatMap((r) => r.map((p, i) => [p, r[(i + 1) % r.length]]));
  const all = up.map((f) => ({ f, segs: segsOf(f) }));
  const onSegment = (p, [a, b]) => {
    const ab = sub(b, a), ap = sub(p, a);
    const L = dot(ab, ab);
    if (L < 1e-12) return false;
    const t = dot(ap, ab) / L;
    if (t < -1e-6 || t > 1 + 1e-6) return false;
    const d = sub(ap, [ab[0] * t, ab[1] * t, ab[2] * t]);
    return Math.hypot(...d) < 2e-3;
  };
  for (const { f } of all) {
    if (f.rings.length > 1) continue; // a face with holes keeps all its edges (drawn the usual way)
    const pts = f.rings[0];
    let any = false;
    const edges = pts.map((p, i) => {
      const q = pts[(i + 1) % pts.length];
      const mid = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2];
      // on a side of another surface of the ground, and along it
      const shared = all.some((o) => o.f !== f && o.segs.some((s) => onSegment(mid, s) && Math.hypot(...cross(norm(sub(q, p)), norm(sub(s[1], s[0])))) < 1e-3));
      if (shared) any = true;
      return !shared;
    });
    if (any) { f.edges = edges; f.split = true; }
  }
}

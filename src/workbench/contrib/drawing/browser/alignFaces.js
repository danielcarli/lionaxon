/*---------------------------------------------------------------------------------------------
 *  LionAxon — Copyright (C) 2026 LionAxon Team.
 *  Created and conceived by Daniel Michelon De Carli.
 *  Licensed under the GNU General Public License v3.0 or later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/
// Aligning faces, as the Align tool of BIM programs does: the first click picks the face to align to, the
// second the face of another object, which then moves — straight along the normal — until the two faces lie in
// the same plane. Upright sides are aligned by moving on the ground, tops by changing the height of the base.
// This file is the geometry: the faces of an object, which one is under the mouse, how far to move.
import { project } from '../../../../base/common/geometry/projection.js';
import { rectRing, pointInRing } from '../../../../base/common/geometry/polygon.js';
import { footprintOf, isTrapezoid, trapezoidFaces } from '../../../services/render/common/solids.js';

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** The kinds of object that have faces to align (and can be moved to align them). */
export const ALIGNABLE = ['volume', 'cut', 'platform', 'slope', 'area'];

/**
 * The faces of an object in the world: its upright sides and its top. `ext` is its extent in height
 * ({ z0, z1, top? }, as drawn). Round shapes have a top only: a curved side lies in no plane.
 * Each face: { pts, n, d } with n·p = d on the face, and `side` (an upright one) or not (the top).
 */
export function facesOf(o, ext) {
  if (!ALIGNABLE.includes(o.type) || o.shape === 'sphere' || o.shape === 'cone' || o.shape === 'pyramid') return [];
  // a trapezoid: its upright faces and its level top (a leaning side or a sloping top lies in no level plane)
  if (isTrapezoid(o)) {
    return trapezoidFaces({ ...o, floors: 1 }, ext.z0).filter((f) => f.role === 'wall' || f.role === 'top')
      .map((f) => ({ pts: f.rings[0], n: f.n, d: dot(f.n, f.rings[0][0]), side: f.role === 'wall' }));
  }
  const ring = o.type === 'volume' || o.type === 'cut' ? footprintOf(o) : rectRing(o.x, o.y, o.w, o.d, o.rot || 0);
  const z0 = ext.z0, z1 = o.type === 'platform' ? ext.top ?? ext.z1 : ext.z1;
  const faces = [];
  const lo = Math.min(z0, z1), hi = Math.max(z0, z1);
  if (ring.length <= 12 && hi - lo > 1e-6) {
    const cx = ring.reduce((a, p) => a + p[0], 0) / ring.length, cy = ring.reduce((a, p) => a + p[1], 0) / ring.length;
    ring.forEach((a, i) => {
      const b = ring[(i + 1) % ring.length];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < 1e-6) return;
      let n = [(b[1] - a[1]) / len, -(b[0] - a[0]) / len, 0];
      // outwards: away from the middle of the outline (right for boxes and for the sides of most outlines)
      if (n[0] * ((a[0] + b[0]) / 2 - cx) + n[1] * ((a[1] + b[1]) / 2 - cy) < 0) n = [-n[0], -n[1], 0];
      const pts = [[a[0], a[1], lo], [b[0], b[1], lo], [b[0], b[1], hi], [a[0], a[1], hi]];
      faces.push({ pts, n, d: dot(n, pts[0]), side: true });
    });
  }
  // the top (a slope has none that is level)
  if (o.type !== 'slope') {
    const pts = ring.map(([x, y]) => [x, y, z1]);
    faces.push({ pts, n: [0, 0, 1], d: z1, side: false });
  }
  return faces;
}

/** The face seen under a point of the drawing (X, Y in drawing units): the nearest one that faces the eye. */
export function faceAt(faces, view, X, Y) {
  let best = null, depth = -Infinity;
  for (const f of faces) {
    if (dot(f.n, view.cam) <= 1e-6) continue;
    if (!pointInRing([X, Y], f.pts.map((p) => project(view, p)))) continue;
    const dp = f.pts.reduce((a, p) => a + dot(p, view.cam), 0) / f.pts.length;
    if (dp > depth) { depth = dp; best = f; }
  }
  return best;
}

/**
 * How far the object of `face` moves to bring it into the plane of `ref`: [dx, dy, dz], or null when the two
 * faces are not parallel. Faces that look the same way and faces that look at each other both count.
 */
export function alignDelta(ref, face) {
  const c = dot(ref.n, face.n);
  if (Math.abs(Math.abs(c) - 1) > 1e-4) return null;
  const gap = ref.d - dot(ref.n, face.pts[0]);
  const r = (v) => Math.round(v * 1000) / 1000;
  return [r(ref.n[0] * gap), r(ref.n[1] * gap), r(ref.n[2] * gap)];
}

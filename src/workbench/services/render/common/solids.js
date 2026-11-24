/*---------------------------------------------------------------------------------------------
 *  LionAxon — Copyright (C) 2026 LionAxon Team.
 *  Created and conceived by Daniel Michelon De Carli.
 *  Licensed under the GNU General Public License v3.0 or later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/
// Geometry of the solids, as plane faces in 3D (metres):
//   box and cylinder  footprints extruded between two heights, cut in height bands by the subtractions
//   cone and pyramid  a footprint and an apex
//   trapezoids        standing ('trapezoid'): the long side down, the sides leaning in to a narrower top;
//                     lying ('trapezoidLying'): the trapezoid lies on the ground, as the footprint, and its
//                     walls go straight up (an extruded footprint, like a box: subtractions cut it)
//   sphere            kept as a centre and a radius (drawn as a disc by the renderer)
//   ground            the site's slab (when it has a thickness), raised or sunk platforms, slopes
// A face: { role: 'top' | 'wall' | 'slant', rings: [outer, ...holes] (3D), n (outward unit normal), lines (floor
// lines), smooth? }. A smooth face (curved surfaces) carries `rim` (edges always drawn) and `seams` (edges
// drawn only where the neighbouring face turns away from the viewer: the silhouette).
import { rectRing, difference, union, signedArea, convexHull } from '../../../../base/common/geometry/polygon.js';

const EPS = 1e-6;
export const CURVE_SEGMENTS = 48;

export function ellipseRing(cx, cy, w, d, rotDeg = 0, n = CURVE_SEGMENTS) {
  const a = (rotDeg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const x = (w / 2) * Math.cos(t), y = (d / 2) * Math.sin(t);
    out.push([cx + x * c - y * s, cy + x * s + y * c]);
  }
  return out;
}

/** The footprint ring of a volume (or of a cut, a platform: anything with x, y, w, d, rot). */
export function footprintOf(o) {
  if (o.shape === 'poly' && o.pts) {
    const a = ((o.rot || 0) * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
    const ring = o.pts.map(([x, y]) => [o.x + x * c - y * s, o.y + x * s + y * c]);
    return signedArea(ring) < 0 ? ring.reverse() : ring; // counter-clockwise, like the other outlines
  }
  if (o.shape === 'trapezoidLying') {
    // the long side (w) at the front, the short one (`top`) at the back, centred
    const a = ((o.rot || 0) * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
    const W = o.w / 2, D = o.d / 2, T = Math.max(0, Math.min(o.w, o.top ?? o.w / 2)) / 2;
    const local = T > 1e-6 ? [[-W, -D], [W, -D], [T, D], [-T, D]] : [[-W, -D], [W, -D], [0, D]];
    return local.map(([x, y]) => [o.x + x * c - y * s, o.y + x * s + y * c]);
  }
  return o.shape === 'cylinder' || o.shape === 'cone' ? ellipseRing(o.x, o.y, o.w, o.d, o.rot) : rectRing(o.x, o.y, o.w, o.d, o.rot);
}

/** For curved footprints: where a point sits on the ellipse (its angle), or null when it is not on it. */
function ellipseInfo(o) {
  const a = (o.rot * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const A = o.w / 2, B = o.d / 2;
  const local = ([x, y]) => { const dx = x - o.x, dy = y - o.y; return [dx * c + dy * s, -dx * s + dy * c]; };
  return {
    angle(p) {
      const [lx, ly] = local(p);
      const r = (lx / A) ** 2 + (ly / B) ** 2;
      if (Math.abs(r - 1) > 0.002) return null;
      return Math.atan2(ly / B, lx / A);
    },
    /** outward horizontal normal of the ellipse at angle t */
    normal(t) {
      const nx = Math.cos(t) / A, ny = Math.sin(t) / B;
      const len = Math.hypot(nx, ny);
      const wx = nx / len, wy = ny / len;
      return [wx * c - wy * s, wx * s + wy * c, 0];
    },
  };
}

/**
 * A cut of any shape as the boxes and prisms the bands understand: a box or a cylinder is one prism; a cone,
 * a pyramid or a sphere is a stack of thin slices (each slice its own outline), so the hollow it leaves
 * narrows the way the shape does. Each piece keeps the outline it was made from (`curve`) so curved walls
 * are drawn smooth.
 */
export function expandCut(c) {
  const shape = c.shape || 'box';
  if (shape === 'box') return [c];
  if (shape === 'poly') return [{ ...c, ring: footprintOf(c) }];
  if (shape === 'cylinder') return [{ ...c, ring: ellipseRing(c.x, c.y, c.w, c.d, c.rot), curve: { x: c.x, y: c.y, w: c.w, d: c.d, rot: c.rot } }];
  if (shape === 'trapezoidLying') return [{ ...c, ring: footprintOf(c) }];
  if (shape === 'trapezoid') return trapezoidSlices(c);
  const h = shape === 'sphere' ? c.w : c.h;
  const n = Math.max(6, Math.min(16, Math.round(h / 0.5)));
  const out = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * h, b = ((k + 1) / n) * h, mid = (a + b) / 2;
    // how much of the full outline this slice keeps
    const f = shape === 'sphere' ? Math.sqrt(Math.max(0, 1 - ((mid - h / 2) / (h / 2)) ** 2)) : 1 - mid / h;
    if (f < 0.04) continue;
    const w = c.w * f, d = c.d * f;
    const ring = shape === 'pyramid' ? rectRing(c.x, c.y, w, d, c.rot) : ellipseRing(c.x, c.y, w, d, c.rot);
    out.push({ ...c, z: c.z + a, h: b - a, w, d, ring, curve: shape === 'pyramid' ? null : { x: c.x, y: c.y, w, d, rot: c.rot } });
  }
  return out;
}

/** A standing trapezoid: its own faces (its sides lean). A lying one is an extruded footprint, like a box. */
export const isTrapezoid = (o) => o?.shape === 'trapezoid';

/**
 * The corners of a standing trapezoid, in its own axes (x along the width, y along the depth, z up from its
 * base): four at the bottom and, above each of them, four at the top, `top` wide and centred.
 */
export function trapezoidCorners(o) {
  const W = o.w / 2, D = o.d / 2, H = o.h;
  const T = Math.max(0, Math.min(o.w, o.top ?? o.w / 2)) / 2;
  return { bottom: [[-W, -D, 0], [W, -D, 0], [W, D, 0], [-W, D, 0]], top: [[-T, -D, H], [T, -D, H], [T, D, H], [-T, D, H]] };
}

/** The height of the top of a standing trapezoid at a point of its own axes (x across the width), or null off its top. */
export function trapezoidTopAt(o, lx) {
  return Math.abs(lx) <= Math.max(0, Math.min(o.w, o.top ?? o.w / 2)) / 2 + 1e-9 ? o.h : null;
}

/**
 * The faces of a standing trapezoid on `base`: the bottom, the top, the two ends (the trapezoids, upright)
 * and the two leaning sides; an edge of no length is dropped, a face of no area too. Floor lines go across
 * the ends and the sides.
 */
export function trapezoidFaces(o, base) {
  const a = ((o.rot || 0) * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a);
  const W = ([lx, ly, lz]) => [o.x + lx * c - ly * sn, o.y + lx * sn + ly * c, base + lz];
  const { bottom, top } = trapezoidCorners(o);
  const B = bottom.map(W), T = top.map(W);
  const inside = [o.x, o.y, base + o.h / 3];
  const clean = (pts) => pts.filter((q, i, list) => { const r = list[(i + 1) % list.length]; return Math.hypot(q[0] - r[0], q[1] - r[1], q[2] - r[2]) > 1e-6; });
  const area = (pts) => {
    let x = 0, y = 0, z = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length];
      x += p[1] * q[2] - p[2] * q[1]; y += p[2] * q[0] - p[0] * q[2]; z += p[0] * q[1] - p[1] * q[0];
    }
    return Math.hypot(x, y, z) / 2;
  };
  const floorZ = [];
  for (let i = 1; i < (o.floors || 1); i++) floorZ.push(base + (i * o.h) / o.floors);
  // where a floor crosses a face: the two points where the plane z cuts its edges
  const across = (pts, z) => {
    const hit = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length];
      if ((p[2] - z) * (q[2] - z) < 0) { const t = (z - p[2]) / (q[2] - p[2]); hit.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, z]); }
    }
    return hit.length === 2 ? [hit] : [];
  };
  const out = [];
  const add = (pts, role, lines = false) => {
    const ring = clean(pts);
    if (ring.length < 3 || area(ring) < 1e-6) return;
    const n = normalOf(ring, inside);
    const r = role ?? (Math.abs(n[2]) < 1e-6 ? 'wall' : n[2] > 0.999999 ? 'top' : 'slant');
    out.push({ role: r, rings: [ring], n, lines: lines ? floorZ.flatMap((z) => across(ring, z)) : [] });
  };
  add([T[0], T[1], T[2], T[3]]);
  for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; add([B[i], B[j], T[j], T[i]], null, true); }
  add([B[3], B[2], B[1], B[0]], 'bottom');
  return out;
}

/** A standing trapezoid as a subtraction: thin slices that narrow the way its sides lean, as for a pyramid. */
function trapezoidSlices(c) {
  const n = Math.max(6, Math.min(24, Math.round(c.h / 0.4)));
  const top = Math.max(0, Math.min(c.w, c.top ?? c.w / 2));
  const out = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * c.h, b = ((k + 1) / n) * c.h, mid = (a + b) / 2;
    const w = c.w - (c.w - top) * (mid / c.h); // the width that reaches the middle of the slice
    if (w < 0.02) continue;
    out.push({ ...c, shape: 'box', z: c.z + a, h: b - a, w, ring: rectRing(c.x, c.y, w, c.d, c.rot), curve: null });
  }
  return out;
}

/** Height bands of an extruded footprint, each with what is left after the cuts that cover the whole band. */
export function extrusionBands(ring, base, height, cuts, targetId, reach) {
  const foot = [[ring]];
  const z0 = base, z1 = base + height;
  const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length, cy = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  const relevant = cuts.filter((c) => (c.target ? c.target === targetId : true)
    && c.z < z1 - EPS && c.z + c.h > z0 + EPS
    && Math.hypot(c.x - cx, c.y - cy) < reach + Math.hypot(c.w, c.d) / 2);
  const breaks = [...new Set([z0, z1, ...relevant.flatMap((c) => [c.z, c.z + c.h]).filter((z) => z > z0 + EPS && z < z1 - EPS)])].sort((a, b) => a - b);
  const bands = [];
  for (let k = 0; k < breaks.length - 1; k++) {
    const a = breaks[k], b = breaks[k + 1];
    const covering = relevant.filter((c) => c.z <= a + EPS && c.z + c.h >= b - EPS);
    const poly = covering.length ? difference(foot, covering.map((c) => [[c.ring || rectRing(c.x, c.y, c.w, c.d, c.rot)]])) : foot;
    bands.push({ a, b, poly });
  }
  return bands;
}

const keyPt = ([x, y]) => `${Math.round(x * 1000)},${Math.round(y * 1000)}`;

/**
 * Faces of an extruded footprint. `curve` (optional) tells which edges lie on a curved outline, so their
 * walls are drawn smooth. `floors` draws slab lines on the walls.
 */
export function extrusionFaces(ring, base, height, cuts, { id = null, floors = 1, curve = null } = {}) {
  const reach = Math.max(...ring.map(([x, y]) => Math.hypot(x - ring[0][0], y - ring[0][1])));
  // the outlines of curved cuts, so the walls they leave are smooth too
  const cutCurves = cuts.filter((c) => c.curve && (!c.target || c.target === id)).map((c) => ({ info: ellipseInfo(c.curve), r: Math.hypot(c.curve.w, c.curve.d) / 2 }));
  const bands = extrusionBands(ring, base, height, cuts, id, reach);
  const tops = [];
  const bottoms = []; // undersides, seen only from below (the 3D viewer)
  const walls = new Map();
  bands.forEach((band, k) => {
    const above = bands[k + 1];
    const exposed = above ? difference(band.poly, [above.poly]) : band.poly;
    for (const poly of exposed) tops.push(poly.map((r) => r.map(([x, y]) => [x, y, band.b])));
    const below = bands[k - 1];
    const under = below && Math.abs(below.b - band.a) < EPS ? difference(band.poly, [below.poly]) : band.poly;
    for (const poly of under) bottoms.push(poly.map((r) => r.map(([x, y]) => [x, y, band.a])));
    for (const poly of band.poly) {
      for (const r of poly) {
        for (let i = 0; i < r.length; i++) {
          const p = r[i], q = r[(i + 1) % r.length];
          const key = keyPt(p) + '|' + keyPt(q);
          const list = walls.get(key) || [];
          const last = list[list.length - 1];
          if (last && Math.abs(last.b - band.a) < EPS) last.b = band.b;
          else list.push({ p, q, a: band.a, b: band.b });
          walls.set(key, list);
        }
      }
    }
  });
  const floorZ = [];
  for (let i = 1; i < floors; i++) floorZ.push(base + (height * i) / floors);
  const out = [];
  for (const rings of tops) out.push({ role: 'top', rings, n: [0, 0, 1], lines: [] });
  for (const rings of bottoms) out.push({ role: 'bottom', rings, n: [0, 0, -1], lines: [] });
  for (const list of walls.values()) {
    for (const { p, q, a, b } of list) {
      const dx = q[0] - p[0], dy = q[1] - p[1];
      const len = Math.hypot(dx, dy);
      if (len < 1e-4) continue;
      const lines = floorZ.filter((z) => z > a + 1e-3 && z < b - 1e-3).map((z) => [[p[0], p[1], z], [q[0], q[1], z]]);
      const face = { role: 'wall', rings: [[[p[0], p[1], a], [q[0], q[1], a], [q[0], q[1], b], [p[0], p[1], b]]], n: [dy / len, -dx / len, 0], lines };
      // an edge of a curved outline — the volume's own, or the hollow of a curved cut — is drawn smooth
      // (straight edges stay sharp)
      for (const cv of [curve ? { info: curve, r: reach } : null, ...cutCurves]) {
        if (!cv || face.smooth) continue;
        const tp = cv.info.angle(p), tq = cv.info.angle(q);
        if (tp == null || tq == null || len >= (Math.PI * 2 * cv.r) / 12) continue;
        let dt = tq - tp;
        if (dt > Math.PI) dt -= 2 * Math.PI;
        if (dt < -Math.PI) dt += 2 * Math.PI;
        // on a hollow the wall faces inwards: the seam normals turn with it
        const flip = (n) => (n[0] * face.n[0] + n[1] * face.n[1] < 0 ? [-n[0], -n[1], -n[2]] : n);
        face.smooth = {
          rim: [[[p[0], p[1], a], [q[0], q[1], a]]],
          seams: [
            { edge: [[p[0], p[1], a], [p[0], p[1], b]], n: flip(cv.info.normal(tp - dt / 2)) },
            { edge: [[q[0], q[1], a], [q[0], q[1], b]], n: flip(cv.info.normal(tq + dt / 2)) },
          ],
        };
      }
      out.push(face);
    }
  }
  return out;
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (v) => { const l = Math.hypot(...v) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

/** Outward normal of a planar polygon (counter-clockwise seen from outside), pointing away from `inside`. */
function normalOf(pts, inside) {
  let n = [0, 0, 0];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    n = [n[0] + (a[1] - b[1]) * (a[2] + b[2]), n[1] + (a[2] - b[2]) * (a[0] + b[0]), n[2] + (a[0] - b[0]) * (a[1] + b[1])];
  }
  n = unit(n);
  const c = pts.reduce((s, p) => [s[0] + p[0] / pts.length, s[1] + p[1] / pts.length, s[2] + p[2] / pts.length], [0, 0, 0]);
  const toOut = sub(c, inside);
  if (n[0] * toOut[0] + n[1] * toOut[1] + n[2] * toOut[2] < 0) n = [-n[0], -n[1], -n[2]];
  return n;
}

/** Cone or pyramid: triangles from the footprint to the apex (and floor lines across them). */
export function apexFaces(o, base) {
  const ring = footprintOf(o);
  const apex = [o.x, o.y, base + o.h];
  const inside = [o.x, o.y, base + o.h / 3];
  const curve = o.shape === 'cone' ? ellipseInfo(o) : null;
  const floorF = [];
  for (let i = 1; i < o.floors; i++) floorF.push(i / o.floors);
  const out = [];
  for (let i = 0; i < ring.length; i++) {
    const p = [...ring[i], base], q = [...ring[(i + 1) % ring.length], base];
    const tri = [p, q, apex];
    const n = normalOf(tri, inside);
    const at = (pt, f) => [pt[0] + (apex[0] - pt[0]) * f, pt[1] + (apex[1] - pt[1]) * f, pt[2] + (apex[2] - pt[2]) * f];
    const face = { role: 'slant', rings: [tri], n, lines: floorF.map((f) => [at(p, f), at(q, f)]) };
    if (curve) {
      const step = (Math.PI * 2) / ring.length;
      const tp = (i / ring.length) * Math.PI * 2, tq = tp + step;
      const nb = (t) => { const m = curve.normal(t); const k = o.h / Math.hypot(o.w / 2, o.d / 2); return unit([m[0], m[1], 1 / k]); };
      face.smooth = { rim: [[p, q]], seams: [{ edge: [p, apex], n: nb(tp - step / 2) }, { edge: [q, apex], n: nb(tq + step / 2) }] };
    }
    out.push(face);
  }
  // the base, seen only from below
  out.push({ role: 'bottom', rings: [ring.map(([x, y]) => [x, y, base])], n: [0, 0, -1], lines: [] });
  return out;
}

/**
 * All the faces of a volume. A sphere is returned as { role: 'sphere', centre, r }.
 * `cuts` are resolved cuts ({ x, y, w, d, rot, z (absolute), h, target }).
 */
export function volumeFaces(v, base, cuts) {
  if (v.shape === 'sphere') return [{ role: 'sphere', centre: [v.x, v.y, base + v.w / 2], r: v.w / 2 }];
  if (v.shape === 'cone' || v.shape === 'pyramid') return apexFaces(v, base);
  if (v.shape === 'trapezoid') return trapezoidFaces(v, base);
  const curve = v.shape === 'cylinder' ? ellipseInfo(v) : null;
  const faces = extrusionFaces(footprintOf(v), base, v.h, cuts, { id: v.id, floors: v.floors, curve });
  if (v.shape !== 'box' || !v.roof || v.roof === 'flat') return faces;
  // a roof sits where the flat top was
  const top = base + v.h;
  return [...faces.filter((f) => !(f.role === 'top' && Math.abs(f.rings[0][0][2] - top) < EPS)), ...roofFaces(v, top)];
}

/**
 * The roof of a box, from the height of its walls: gable (two slopes and two gable ends), shed (one slope)
 * or hip (four slopes). The ridge runs along the longer side.
 */
export function roofFaces(v, z) {
  const a = (v.rot * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a);
  // the ridge follows the longer side, unless the direction was chosen
  const along = v.roofDir === 'w' ? true : v.roofDir === 'd' ? false : v.w >= v.d;
  const L = (along ? v.w : v.d) / 2, S = (along ? v.d : v.w) / 2, H = v.roofH || 3;
  // (l, s): along the ridge and across it; turned to the axes of the box, then to the world
  const P = (l, s, h) => { const lx = along ? l : -s, ly = along ? s : l; return [v.x + lx * c - ly * sn, v.y + lx * sn + ly * c, z + h]; };
  const inside = P(0, 0, H / 4);
  const face = (pts, role) => ({ role, rings: [pts], n: normalOf(pts, inside), lines: [] });
  if (v.roof === 'shed') {
    return [
      face([P(-L, -S, 0), P(L, -S, 0), P(L, S, H), P(-L, S, H)], 'slant'),
      face([P(L, S, 0), P(-L, S, 0), P(-L, S, H), P(L, S, H)], 'wall'),
      face([P(L, -S, 0), P(L, S, 0), P(L, S, H)], 'wall'),
      face([P(-L, S, 0), P(-L, -S, 0), P(-L, S, H)], 'wall'),
    ];
  }
  const R = v.roof === 'hip' ? Math.max(0, L - S) : L; // half the length of the ridge
  const out = [
    face([P(-L, -S, 0), P(L, -S, 0), P(R, 0, H), P(-R, 0, H)], 'slant'),
    face([P(L, S, 0), P(-L, S, 0), P(-R, 0, H), P(R, 0, H)], 'slant'),
    face([P(L, -S, 0), P(L, S, 0), P(R, 0, H)], v.roof === 'hip' ? 'slant' : 'wall'),
    face([P(-L, S, 0), P(-L, -S, 0), P(-R, 0, H)], v.roof === 'hip' ? 'slant' : 'wall'),
  ];
  return out.map((f) => ({ ...f, rings: [f.rings[0].filter((q, i, list) => { const r = list[(i + 1) % list.length]; return Math.hypot(q[0] - r[0], q[1] - r[1], q[2] - r[2]) > 1e-6; })] })).filter((f) => f.rings[0].length >= 3);
}

/**
 * The shadow of a volume on the ground (z = 0), as a multipolygon in plan. `k` is how far the shadow of a
 * point one metre up falls ([dx, dy]). Shadows on other volumes and on the terrain are not worked out.
 */
export function shadowOf(v, base, cuts, k) {
  const at = ([x, y], z) => [x + k[0] * z, y + k[1] * z];
  if (v.shape === 'sphere') {
    const r = v.w / 2;
    return [[ellipseRing(v.x + k[0] * (base + r), v.y + k[1] * (base + r), v.w, v.w, 0, 24)]];
  }
  const ring = footprintOf(v);
  if (v.shape === 'cone' || v.shape === 'pyramid') return [[convexHull([...ring.map((q) => at(q, base)), at([v.x, v.y], base + v.h)])]];
  if (v.shape === 'trapezoid') return [[convexHull(trapezoidFaces(v, base).flatMap((f) => f.rings[0]).map((q) => at(q, q[2])))]];
  const reach = Math.max(...ring.map(([x, y]) => Math.hypot(x - ring[0][0], y - ring[0][1])));
  const parts = [];
  for (const band of extrusionBands(ring, base, v.h + (v.roof && v.roof !== 'flat' ? (v.roofH || 0) / 2 : 0), cuts, v.id, reach)) {
    for (const poly of band.poly) {
      // a whole convex outline: the hull of its two ends; otherwise each wall casts its own strip
      if (poly.length === 1 && (v.shape === 'box' || v.shape === 'cylinder' || v.shape === 'trapezoidLying') && poly[0].length === ring.length) {
        parts.push([[convexHull([...poly[0].map((q) => at(q, band.a)), ...poly[0].map((q) => at(q, band.b))])]]);
        continue;
      }
      parts.push([poly.map((r) => r.map((q) => at(q, band.b)))]);
      for (const r of poly) {
        for (let i = 0; i < r.length; i++) {
          const p = r[i], q = r[(i + 1) % r.length];
          const quad = [at(p, band.a), at(q, band.a), at(q, band.b), at(p, band.b)];
          if (Math.abs(signedArea(quad)) > 1e-6) parts.push([[signedArea(quad) < 0 ? quad.reverse() : quad]]);
        }
      }
    }
  }
  return parts.length ? union(...parts) : [];
}

/** Kept for the tests and the older API: the bands of a box or cylinder volume. */
export function volumeBands(v, base, cuts) {
  const ring = footprintOf(v);
  return extrusionBands(ring, base, v.h, cuts, v.id, Math.hypot(v.w, v.d) / 2);
}

/**
 * A slope: ground rising along its local depth from `zA` (start) to `zB` (end), solid down to `bottom`.
 * Faces: the sloped top, the two ends and the two sides.
 */
export function slopeFaces(s, zA, zB, bottom) {
  const a = (s.rot * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a);
  const P = (lx, ly, z) => [s.x + lx * c - ly * sn, s.y + lx * sn + ly * c, z];
  const hw = s.w / 2, hd = s.d / 2;
  const inside = P(0, 0, (Math.min(zA, zB) + bottom) / 2);
  const faces = [];
  const add = (pts, role) => {
    const clean = pts.filter((p, i) => { const q = pts[(i + 1) % pts.length]; return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) > 1e-6; });
    if (clean.length < 3) return;
    faces.push({ role, rings: [clean], n: normalOf(clean, inside), lines: [] });
  };
  add([P(-hw, -hd, zA), P(hw, -hd, zA), P(hw, hd, zB), P(-hw, hd, zB)], 'slant');
  if (zA - bottom > 1e-6) add([P(-hw, -hd, bottom), P(hw, -hd, bottom), P(hw, -hd, zA), P(-hw, -hd, zA)], 'wall');
  if (zB - bottom > 1e-6) add([P(hw, hd, bottom), P(-hw, hd, bottom), P(-hw, hd, zB), P(hw, hd, zB)], 'wall');
  add([P(hw, -hd, bottom), P(hw, hd, bottom), P(hw, hd, zB), P(hw, -hd, zA)], 'wall');
  add([P(-hw, hd, bottom), P(-hw, -hd, bottom), P(-hw, -hd, zA), P(-hw, hd, zB)], 'wall');
  // the underside, seen only from below
  if (Math.max(zA, zB) - bottom > 1e-6) faces.push({ role: 'bottom', rings: [[P(-hw, -hd, bottom), P(-hw, hd, bottom), P(hw, hd, bottom), P(hw, -hd, bottom)]], n: [0, 0, -1], lines: [] });
  return faces;
}

/**
 * An opening drawn on a wall of a box: its outline in the world, a hair outside the wall, and the normal of
 * that wall. `base` is the height of the base of the box. Null when the volume is not a box.
 */
export function openingShape(o, v, base) {
  if (!v || v.type !== 'volume' || v.shape !== 'box') return null;
  const a = (v.rot * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a);
  // in the frame of the box: the middle of the wall, the direction along it (to the right, seen from outside), its normal
  const W = { front: [[0, -v.d / 2], [1, 0], [0, -1], v.w], right: [[v.w / 2, 0], [0, 1], [1, 0], v.d], back: [[0, v.d / 2], [-1, 0], [0, 1], v.w], left: [[-v.w / 2, 0], [0, -1], [-1, 0], v.d] }[o.side] || null;
  if (!W) return null;
  const [mid, along, nrm, len] = W;
  const world = (lx, ly, z) => [v.x + lx * c - ly * sn, v.y + lx * sn + ly * c, z];
  const out = 0.03;
  const w = Math.min(o.w, len), u = Math.max(-(len - w) / 2, Math.min((len - w) / 2, o.u));
  // up to the top of the wall — and into the gable, when the box has a roof
  const z0 = base + Math.max(0, Math.min(o.z, Math.max(0, v.h + (v.roof && v.roof !== 'flat' ? v.roofH || 0 : 0) - 0.1)));
  const at = (du, dz) => world(mid[0] + along[0] * (u + du) + nrm[0] * out, mid[1] + along[1] * (u + du) + nrm[1] * out, z0 + dz);
  let pts;
  if (o.kind === 'oculus') {
    const r = Math.min(w, o.h) / 2;
    pts = Array.from({ length: 28 }, (_, i) => { const t = (i / 28) * Math.PI * 2; return at(Math.cos(t) * r, r + Math.sin(t) * r); });
  } else if (o.kind === 'arch') {
    const r = Math.min(w / 2, o.h);
    pts = [at(-w / 2, 0), at(w / 2, 0), at(w / 2, o.h - r)];
    for (let i = 1; i < 14; i++) { const t = (i / 14) * Math.PI; pts.push(at(Math.cos(t) * (w / 2), o.h - r + Math.sin(t) * r)); }
    pts.push(at(-w / 2, o.h - r));
  } else pts = [at(-w / 2, 0), at(w / 2, 0), at(w / 2, o.h), at(-w / 2, o.h)];
  const n = [nrm[0] * c - nrm[1] * sn, nrm[0] * sn + nrm[1] * c, 0];
  // the bars of a window: one upright and one across
  const lines = o.kind === 'window' ? [[at(0, 0), at(0, o.h)], [at(-w / 2, o.h / 2), at(w / 2, o.h / 2)]] : [];
  return { pts, n, lines };
}

/**
 * The top of what stands under a point (x, y) for someone whose feet are at `z`: the highest of the
 * platforms, slopes and volumes there that start at or below the feet (so a block raised on pilotis does
 * not count, and neither does a courtyard cut through a volume). A person or a tree stands on it: never
 * lower than `z`. `levels` gives the elevations; `baseOfVolume` the base of a volume (stacks).
 */
export function restingHeight(objects, levels, x, y, z, baseOfVolume, elevationOf) {
  const FEET = 0.05;
  let top = z;
  // inside, and not just on its edge (someone standing beside a block, against its wall, stays on the ground)
  const inside = (ring) => pointInRingXY(x, y, ring) && edgeDistance(x, y, ring) > 0.15;
  for (const o of objects) {
    if (o.hidden) continue;
    if (o.type === 'platform') {
      const e = elevationOf(levels, o.level) + (o.z || 0);
      if (e > top && inside(rectRing(o.x, o.y, o.w, o.d, o.rot))) top = e;
    } else if (o.type === 'slope') {
      if (!inside(rectRing(o.x, o.y, o.w, o.d, o.rot))) continue;
      const zA = elevationOf(levels, o.from) + (o.zFrom || 0), zB = elevationOf(levels, o.to) + (o.zTo || 0);
      const a = ((o.rot || 0) * Math.PI) / 180;
      const ly = -(x - o.x) * Math.sin(a) + (y - o.y) * Math.cos(a);
      const e = zA + (zB - zA) * Math.min(1, Math.max(0, (ly + o.d / 2) / o.d));
      if (e > top) top = e;
    } else if (o.type === 'volume') {
      if (o.state === 'ghost' || o.shape === 'sphere' || o.shape === 'cone' || o.shape === 'pyramid') continue;
      const base = baseOfVolume(o);
      let e = base + o.h;
      if (o.shape === 'trapezoid') {
        // on its top, not on a leaning side
        const a = ((o.rot || 0) * Math.PI) / 180;
        const lx = (x - o.x) * Math.cos(a) + (y - o.y) * Math.sin(a);
        const at = trapezoidTopAt(o, lx);
        if (at == null) continue;
        e = base + at;
      }
      if (base > z + FEET || e <= top || !inside(footprintOf(o))) continue;
      // a cut through the top there (a courtyard, a notch): not a place to stand on
      const holed = !o.fill && objects.some((c) => c.type === 'cut' && (!c.target || c.target === o.id) && !c.hidden
        && (elevationOf(levels, c.level) + (c.z || 0)) + c.h >= e - 0.01 && inside(footprintOf(c)));
      if (!holed) top = e;
    }
  }
  return top;
}

function pointInRingXY(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function edgeDistance(x, y, ring) {
  let best = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const [ax, ay] = ring[i], [bx, by] = ring[(i + 1) % ring.length];
    const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
    const t = L ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L)) : 0;
    best = Math.min(best, Math.hypot(x - ax - t * dx, y - ay - t * dy));
  }
  return best;
}

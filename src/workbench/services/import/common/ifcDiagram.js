/*---------------------------------------------------------------------------------------------
 *  LionAxon — Copyright (C) 2026 LionAxon Team.
 *  Created and conceived by Daniel Michelon De Carli.
 *  Licensed under the GNU General Public License v3.0 or later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/
// A diagram made from a building model read from an IFC file (pure data, no DOM).
//
// The model is turned into masses: on each storey, the outline of everything built there (walls, slabs,
// roofs, masses…) seen from above becomes one volume per piece, with its courtyards cut out; what rises
// far above its storey (a fly tower, a chimney) or sinks below it becomes a volume of its own. The steps
// tell how the building comes to be:
//   - by phases, when the elements carry them (existing, new construction…): each step shows what stands
//     in that phase — what is built in it appears, what is taken down disappears;
//   - storey by storey, from the lowest up;
//   - or both: the phases before the last one, then the last one storey by storey (the default when the
//     file has phases).
// A step where something was taken away shows it dashed (the ghost of the step before).
// A last step shows the uses: the rooms, coloured by their names, inside the masses seen as ghosts.
// Everything is a starting point, to be edited: titles, texts and the order of the steps are the person's.
import { signedArea, pointInRing } from '../../../../base/common/geometry/polygon.js';
import { polyFromWorld, createVolume, createCut, createStep, createProject, newId } from '../../model/common/model.js';

const createCategory = (name, color) => ({ id: newId('k'), name, color });

/** Colours of the categories made from the rooms (the same as the ones of new categories). */
export const USE_COLORS = ['#e59aa6', '#8fa9cc', '#8aa346', '#e8b464', '#a68bc9', '#6fb3a8', '#d98a6c', '#9a948c'];
/** The most categories made from the room names: the smaller uses go together. */
export const MAX_USES = 8;
/** How far (m) an element may go past its storey and still be part of the storey's mass. */
const BAND = 0.6;
/** The most points of an outline (as in the model). */
const MAX_PTS = 64;
/** The most points the outlines of one step may have together: past it the drawing gets slow to draw (a hidden-face sort), so they are simplified further. */
const STEP_POINTS = 3000;
/** The most room volumes in the step of the uses (the biggest): many stacked rooms are slow to draw. */
const MAX_ROOM_PIECES = 60;

const mm = (v) => Math.round(v * 1000) / 1000;
/** The least and the greatest of many numbers (a model has too many for Math.min(...list)). */
const least = (list, f = (x) => x) => { let m = Infinity; for (const x of list) { const v = f(x); if (v < m) m = v; } return m; };
const most = (list, f = (x) => x) => { let m = -Infinity; for (const x of list) { const v = f(x); if (v > m) m = v; } return m; };

/** The finest and the coarsest cell of the grid the outlines are drawn on (m), and how many cells a side may have. */
const CELL_MIN = 0.05, GRID_CELLS = 1600;
/** Gaps narrower than this (m) are closed: joints between walls, a row of columns under one slab. */
const CLOSE_GAP = 0.6;
/** The most pieces one mass keeps (the biggest), and the least area of a piece kept beyond the first (m²). */
const MAX_PIECES = 40, MIN_PIECE = 2;
/** An element farther than this (m) from the middle of the building is left out (a survey point, a stray element). */
const FAR = 1000;

/**
 * The outline seen from above of everything in some lists of triangles ([x1, y1, x2, y2, x3, y3, …]):
 * the triangles are filled on a fine grid and its border is traced back into rings, then simplified. A grid
 * never fails on the near-coincident points of real models (an exact union of thousands of triangles does),
 * and it is quick; a cell is at most 5 cm for a building of 80 m. Returns a multipolygon.
 */
export function footprintOf(lists) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const t of lists) {
    for (let k = 0; k + 1 < t.length; k += 2) {
      if (t[k] < x0) x0 = t[k];
      if (t[k] > x1) x1 = t[k];
      if (t[k + 1] < y0) y0 = t[k + 1];
      if (t[k + 1] > y1) y1 = t[k + 1];
    }
  }
  if (!Number.isFinite(x0) || x1 - x0 < 1e-6 || y1 - y0 < 1e-6) return [];
  // never more than GRID_CELLS cells a side, whatever the size (a coarser cell for a bigger place)
  const c = Math.max(CELL_MIN, Math.max(x1 - x0, y1 - y0) / GRID_CELLS);
  const r = Math.floor(CLOSE_GAP / 2 / c);
  // an empty margin around, wider than the gaps closed, so that closing them never reaches the border
  const pad = r + 2;
  const ox = (Math.floor(x0 / c + 1e-9) - pad) * c, oy = (Math.floor(y0 / c + 1e-9) - pad) * c;
  const W = Math.ceil((x1 - ox) / c - 1e-9) + pad, H = Math.ceil((y1 - oy) / c - 1e-9) + pad;
  const grid = new Uint8Array(W * H);
  // a cell is filled when its centre is inside a triangle
  for (const t of lists) for (let k = 0; k + 5 < t.length; k += 6) fillTriangle(grid, W, H, c, ox, oy, t[k], t[k + 1], t[k + 2], t[k + 3], t[k + 4], t[k + 5]);
  if (r >= 1) closeGaps(grid, W, H, r);
  const rings = traceGrid(grid, W, H).map((ring) => ring.map(([i, j]) => [mm(ox + i * c), mm(oy + j * c)]));
  const outers = rings.filter((r) => signedArea(r) > 0).map((r) => ({ ring: r, area: signedArea(r), holes: [] }));
  for (const hole of rings.filter((r) => signedArea(r) < 0)) {
    // the smallest outline around the hole (a point just inside the solid side of the hole's first side)
    const [a, b] = [hole[0], hole[1]];
    const probe = [(a[0] + b[0]) / 2 - (b[1] - a[1]) * 0.01, (a[1] + b[1]) / 2 + (b[0] - a[0]) * 0.01];
    const owner = outers.filter((o) => pointInRing(probe, o.ring)).sort((p, q) => p.area - q.area)[0];
    if (owner) owner.holes.push(hole);
  }
  const tol = c * 0.9;
  outers.sort((p, q) => q.area - p.area);
  const kept = outers.filter((o, k) => k === 0 || (k < MAX_PIECES && o.area >= MIN_PIECE));
  return kept.map((o) => [simplifyRing(o.ring, tol), ...o.holes.map((h) => simplifyRing(h, tol))]);
}

/**
 * Closes the gaps narrower than 2r + 1 cells (grows the filled cells by r, then shrinks them back): the
 * outline of a building, not of each of its parts. Running sums keep it linear in the size of the grid.
 */
function closeGaps(grid, W, H, r) {
  const pass = (src, dst, along, n, m, want) => {
    // along rows (along = 1) or columns: a cell is set when every (want = all) or any cell within r is set
    const line = new Int32Array(n + 1);
    for (let b = 0; b < m; b++) {
      for (let a = 0; a < n; a++) line[a + 1] = line[a] + src[along ? b * W + a : a * W + b];
      for (let a = 0; a < n; a++) {
        const lo = Math.max(0, a - r), hi = Math.min(n, a + r + 1);
        const count = line[hi] - line[lo];
        // (the margin around is empty: what is beyond the grid never matters)
        dst[along ? b * W + a : a * W + b] = want === 'any' ? (count > 0 ? 1 : 0) : (count === hi - lo ? 1 : 0);
      }
    }
  };
  const tmp = new Uint8Array(W * H);
  pass(grid, tmp, 1, W, H, 'any');
  pass(tmp, grid, 0, H, W, 'any');
  pass(grid, tmp, 1, W, H, 'all');
  pass(tmp, grid, 0, H, W, 'all');
}

function fillTriangle(grid, W, H, c, ox, oy, ax, ay, bx, by, cx, cy) {
  const ymin = Math.min(ay, by, cy), ymax = Math.max(ay, by, cy);
  const j0 = Math.max(0, Math.ceil((ymin - oy) / c - 0.5 - 1e-9)), j1 = Math.min(H - 1, Math.floor((ymax - oy) / c - 0.5 + 1e-9));
  const edges = [[ax, ay, bx, by], [bx, by, cx, cy], [cx, cy, ax, ay]];
  for (let j = j0; j <= j1; j++) {
    const y = oy + (j + 0.5) * c;
    let xa = Infinity, xb = -Infinity;
    for (const [px, py, qx, qy] of edges) {
      if ((py <= y && qy >= y) || (qy <= y && py >= y)) {
        if (Math.abs(qy - py) < 1e-12) { xa = Math.min(xa, px, qx); xb = Math.max(xb, px, qx); continue; }
        const x = px + ((y - py) / (qy - py)) * (qx - px);
        if (x < xa) xa = x;
        if (x > xb) xb = x;
      }
    }
    if (xa > xb) continue;
    const i0 = Math.max(0, Math.ceil((xa - ox) / c - 0.5 - 1e-9)), i1 = Math.min(W - 1, Math.floor((xb - ox) / c - 0.5 + 1e-9));
    if (i1 >= i0) grid.fill(1, j * W + i0, j * W + i1 + 1);
  }
}

/**
 * The borders of the filled cells as rings of grid corners, the filled side on the left of each side:
 * outlines counter-clockwise, holes clockwise. Where two pieces touch at a corner, the ring keeps to its
 * own piece (it turns left first), so pieces that only touch stay apart. Only the corners are kept.
 */
function traceGrid(grid, W, H) {
  const at = (i, j) => i >= 0 && j >= 0 && i < W && j < H && grid[j * W + i] === 1;
  const key = (i, j) => j * (W + 1) + i;
  const out = new Map(); // corner → the sides leaving it, [dx, dy]
  const add = (i, j, dx, dy) => { const k = key(i, j); if (!out.has(k)) out.set(k, []); out.get(k).push([dx, dy]); };
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      if (!at(i, j)) continue;
      if (!at(i, j - 1)) add(i, j, 1, 0);
      if (!at(i + 1, j)) add(i + 1, j, 0, 1);
      if (!at(i, j + 1)) add(i + 1, j + 1, -1, 0);
      if (!at(i - 1, j)) add(i, j + 1, 0, -1);
    }
  }
  const rings = [];
  for (const [k0, list0] of out) {
    while (list0.length) {
      let i = k0 % (W + 1), j = Math.floor(k0 / (W + 1));
      let [dx, dy] = list0.pop();
      const ring = [[i, j]];
      for (;;) {
        i += dx; j += dy;
        const list = out.get(key(i, j));
        if (!list || !list.length) break;
        // left first, then straight on, then right
        let pick = -1;
        for (const [px, py] of [[-dy, dx], [dx, dy], [dy, -dx]]) { pick = list.findIndex((d) => d[0] === px && d[1] === py); if (pick >= 0) break; }
        if (pick < 0) pick = 0;
        const [ndx, ndy] = list.splice(pick, 1)[0];
        ring.push([i, j]);
        dx = ndx; dy = ndy;
      }
      if (ring.length >= 4) rings.push(dropStraight(ring.slice(0, -1)));
    }
  }
  return rings.filter((r) => r.length >= 3);
}

/** A ring without the points where it goes straight on. */
function dropStraight(ring) {
  const n = ring.length;
  return ring.filter((p, k) => {
    const a = ring[(k + n - 1) % n], b = ring[(k + 1) % n];
    return (p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0]) !== 0;
  });
}

/** The outline seen from above of one element. */
export const footprintOfTris = (tris) => footprintOf([tris]);

/** A ring with the points that add nothing taken out (Douglas–Peucker, closed), at most MAX_PTS points; `tol` is how far (m) a point may be from the simplified side. */
export function simplifyRing(ring, tol = 0.02) {
  let out = ring;
  for (let k = 0; k < 12; k++, tol *= 2) {
    out = dpClosed(ring, tol);
    if (out.length <= MAX_PTS) break;
  }
  return out.length >= 3 ? out : ring.slice(0, 3);
}

function dpClosed(ring, tol) {
  if (ring.length <= 4) return ring;
  // split at the two points farthest apart, simplify each half
  let a = 0, b = 0, best = -1;
  for (let i = 0; i < ring.length; i++) {
    const d = (ring[i][0] - ring[0][0]) ** 2 + (ring[i][1] - ring[0][1]) ** 2;
    if (d > best) { best = d; b = i; }
  }
  const half1 = ring.slice(a, b + 1), half2 = [...ring.slice(b), ring[0]];
  const s1 = dp(half1, tol), s2 = dp(half2, tol);
  return [...s1.slice(0, -1), ...s2.slice(0, -1)];
}

function dp(pts, tol) {
  if (pts.length < 3) return pts;
  const [x1, y1] = pts[0], [x2, y2] = pts[pts.length - 1];
  const L = Math.hypot(x2 - x1, y2 - y1) || 1e-12;
  let idx = -1, far = -1;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs((x2 - x1) * (y1 - pts[i][1]) - (x1 - pts[i][0]) * (y2 - y1)) / L;
    if (d > far) { far = d; idx = i; }
  }
  if (far <= tol) return [pts[0], pts[pts.length - 1]];
  return [...dp(pts.slice(0, idx + 1), tol).slice(0, -1), ...dp(pts.slice(idx), tol)];
}

/** The scale of the storey elevations (the file's unit of length, in metres), read against the geometry. */
function elevationScale(storeys, bases) {
  const pairs = storeys.filter((s) => Number.isFinite(s.elevation) && bases.has(s.id)).map((s) => [s.elevation, bases.get(s.id)]);
  if (!pairs.length) return null;
  let best = 1, err = Infinity;
  for (const k of [1, 0.001, 0.01, 0.1, 0.3048, 0.0254]) {
    const e = pairs.reduce((sum, [E, z]) => sum + Math.abs(E * k - z), 0);
    if (e < err - 1e-9) { err = e; best = k; }
  }
  return best;
}

/** Phases in the order they happen: an element is taken down after it is built; "existing" comes first; else by name. */
export function orderPhases(elements) {
  const names = new Set();
  for (const e of elements) { if (e.created) names.add(e.created); if (e.demolished) names.add(e.demolished); }
  const list = [...names];
  const before = new Map(list.map((n) => [n, new Set()]));
  for (const e of elements) if (e.created && e.demolished && e.created !== e.demolished) before.get(e.demolished).add(e.created);
  const existing = (n) => /^(existing|existente|existentes|existant|bestand|esistente|既存|기존|现有)/i.test(n);
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  const rank = (a, b) => (existing(b) - existing(a)) || collator.compare(a, b);
  const out = [];
  const left = new Set(list);
  while (left.size) {
    const ready = [...left].filter((n) => [...before.get(n)].every((p) => !left.has(p))).sort(rank);
    const n = ready[0] || [...left].sort(rank)[0];
    out.push(n);
    left.delete(n);
  }
  return out;
}

/**
 * The project of a diagram from what was read of an IFC file: { name, project, storeys: [{ id, name,
 * elevation }], elements: [{ id, kind: 'mass' | 'space', type, name, longName, storey, created,
 * demolished, z0, z1, tris }] }. `t` gives the words of the interface; `opts.steps` is 'both', 'phases' or
 * 'storeys' (what the file allows: without phases, always by storeys), `opts.uses` adds the step of the
 * uses when there are rooms. Returns { project, info }.
 */
export function diagramFromIfc(data, t = (k) => k, opts = {}) {
  const report = typeof opts.onProgress === 'function' ? opts.onProgress : () => {};
  const centre = (e) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let k = 0; k + 1 < e.tris.length; k += 2) {
      const x = e.tris[k], y = e.tris[k + 1];
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
    return [(x0 + x1) / 2, (y0 + y1) / 2];
  };
  const withTris = (data.elements || []).filter((e) => e.tris?.length >= 6).map((e) => ({ ...e, at: centre(e) }));
  // what lies far from the middle of the building (the median of the elements) is left out
  const median = (list) => { const v = list.slice().sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : 0; };
  const mid = [median(withTris.map((e) => e.at[0])), median(withTris.map((e) => e.at[1]))];
  const all = withTris.filter((e) => Math.hypot(e.at[0] - mid[0], e.at[1] - mid[1]) <= FAR);
  const far = withTris.length - all.length;
  // the outline of a set of elements, drawn once (the steps ask for the same sets again)
  const footCache = new Map();
  const footOf = (list) => {
    const key = list.map((e) => e.id).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)).join(',');
    if (!footCache.has(key)) footCache.set(key, footprintOf(list.map((e) => e.tris)));
    return footCache.get(key);
  };
  const masses = all.filter((e) => e.kind !== 'space');
  const spaces = all.filter((e) => e.kind === 'space');
  if (!masses.length && !spaces.length) throw new Error('ifc-empty');

  // ---- the storeys: their base and top (from the file when it says, else from what stands on them)
  const byStorey = new Map();
  for (const e of all) { const k = e.storey ?? 'none'; if (!byStorey.has(k)) byStorey.set(k, []); byStorey.get(k).push(e); }
  const guessBase = (list) => {
    const upright = list.filter((e) => e.kind !== 'space' && !/SLAB|ROOF|COVERING/.test(e.type || ''));
    const pick = upright.length ? upright : list;
    return least(pick, (e) => e.z0);
  };
  const geomBase = new Map([...byStorey].map(([k, list]) => [k, guessBase(list)]));
  const scale = elevationScale(data.storeys || [], geomBase);
  const storeys = [...byStorey.keys()].map((k) => {
    const s = (data.storeys || []).find((x) => x.id === k);
    const fromFile = s && scale != null && Number.isFinite(s.elevation) ? s.elevation * scale : null;
    return { id: k, name: s?.name || t('import.storey'), base: fromFile ?? geomBase.get(k) };
  }).sort((a, b) => a.base - b.base);
  storeys.forEach((s, i) => {
    const list = byStorey.get(s.id).filter((e) => e.kind !== 'space');
    const next = storeys.slice(i + 1).find((x) => x.base > s.base + 0.05);
    const highest = list.length ? most(list, (e) => e.z1) : s.base + 3;
    // the last storey: as high as most of what stands on it (a tower on it is not its height), and at
    // least as high as the storey below it, if what stands there reaches that
    const tops = list.map((e) => e.z1).sort((x, y) => x - y);
    const typical = tops.length ? tops[Math.floor((tops.length - 1) / 2)] : highest;
    const prev = storeys[i - 1];
    s.top = next ? next.base : Math.max(typical, prev ? Math.min(highest, s.base + (s.base - prev.base)) : typical);
    if (s.top - s.base < 0.05) s.top = Math.max(highest, s.base + 0.1);
    s.index = i;
  });
  const storeyOf = new Map(storeys.map((s) => [s.id, s]));
  const ground = least(storeys, (s) => s.base);

  // ---- the masses of a set of elements: per storey, and the ones that go far past their storey on their own
  const massesOf = (list) => {
    const out = [];
    for (const s of storeys) {
      const here = list.filter((e) => (e.storey ?? 'none') === s.id);
      if (!here.length) continue;
      const inBand = here.filter((e) => e.z1 <= s.top + BAND && e.z0 >= s.base - BAND);
      const apart = here.filter((e) => !inBand.includes(e));
      if (inBand.length) {
        const z0 = Math.max(s.base, least(inBand, (e) => e.z0));
        const z1 = Math.min(s.top, most(inBand, (e) => e.z1));
        out.push({ key: `s${s.index}`, name: s.name, z0, z1: z1 - z0 < 0.1 ? z0 + Math.max(0.1, most(inBand, (e) => e.z1) - z0) : z1, foot: footOf(inBand) });
      }
      // what goes past the storey, grouped by its heights (half a metre apart at most)
      const groups = new Map();
      for (const e of apart) {
        const k = `${Math.round(e.z0 * 2)}:${Math.round(e.z1 * 2)}`;
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(e);
      }
      for (const g of groups.values()) {
        const first = g.reduce((a, b) => (a.id < b.id ? a : b));
        out.push({ key: `e${first.id}`, name: g.length === 1 ? first.name || s.name : s.name, z0: least(g, (e) => e.z0), z1: most(g, (e) => e.z1), foot: footOf(g) });
      }
    }
    return out;
  };

  // ---- the steps: by phases, storey by storey, or both
  const phases = orderPhases(all);
  const hasPhases = phases.length >= 2;
  const mode = hasPhases ? (['both', 'phases', 'storeys'].includes(opts.steps) ? opts.steps : 'both') : 'storeys';
  const standsIn = (e, i) => {
    const c = e.created ? phases.indexOf(e.created) : 0;
    const d = e.demolished ? phases.indexOf(e.demolished) : Infinity;
    return c <= i && i < d;
  };
  const lastPhase = phases.length - 1;
  const standing = hasPhases ? masses.filter((e) => standsIn(e, lastPhase)) : masses;
  const storeyIdx = (e) => storeyOf.get(e.storey ?? 'none')?.index ?? 0;
  /** The storeys of a set of elements, from the lowest up, each one with everything below it. */
  let planned = 0;
  const plan = (title, text, els) => {
    const p = { title, text, els: new Set(els), masses: massesOf(els) };
    report({ stage: 'diagram', done: ++planned });
    return p;
  };
  const storeyPlans = (list, keep = () => false) => storeys.filter((s) => list.some((e) => (e.storey ?? 'none') === s.id && !keep(e))).map((s, i) =>
    plan(s.name, i === 0 ? t('import.firstStoreyText') : t('import.storeyText'), list.filter((e) => keep(e) || storeyIdx(e) <= s.index)));
  const phasePlan = (p, i) => plan(p, t('import.phaseText'), masses.filter((e) => standsIn(e, i)));
  let plans;
  if (mode === 'phases') plans = phases.map(phasePlan);
  else if (mode === 'both') {
    const lastCreated = (e) => (e.created ? phases.indexOf(e.created) : 0) === lastPhase;
    plans = [
      ...phases.slice(0, -1).map(phasePlan),
      // the last phase, storey by storey: what was already there stays from the start (what it takes down goes)
      ...storeyPlans(standing, (e) => !lastCreated(e)).map((p) => ({ ...p, title: `${phases[lastPhase]} · ${p.title}` })),
    ];
  } else plans = storeyPlans(standing);
  if (!plans.length) plans.push(plan(t('import.title'), '', []));

  // ---- the place: everything moved so that it sits on the site with a margin around
  const pts = [];
  for (const p of plans) for (const m of p.masses) for (const poly of m.foot) for (const [x, y] of poly[0]) pts.push([x, y]);
  for (const e of spaces) for (const poly of footOf([e])) for (const [x, y] of poly[0]) pts.push([x, y]);
  const minX = least(pts, (q) => q[0]), maxX = most(pts, (q) => q[0]);
  const minY = least(pts, (q) => q[1]), maxY = most(pts, (q) => q[1]);
  const margin = Math.max(5, Math.round(0.12 * Math.max(maxX - minX, maxY - minY)));
  const W = Math.ceil(maxX - minX + 2 * margin), D = Math.ceil(maxY - minY + 2 * margin);
  const shift = ([x, y]) => [mm(x - minX + margin), mm(y - minY + margin)];

  /** The objects of masses: one volume per piece, its holes as cuts through it. */
  /** The objects of masses at a level of detail (tol, m), made coarser until the step is light enough to draw. */
  const pointsOf = (objs) => objs.reduce((n, o) => n + (o.pts?.length || 4), 0);
  const light = (build) => {
    let tol = 0.02, objs = build(tol);
    while (pointsOf(objs) > STEP_POINTS && tol < 8) { tol *= 2; objs = build(tol); }
    return objs;
  };
  const objectsOf = (list, state = 'normal') => light((tol) => objectsAt(list, state, tol));
  const objectsAt = (list, state, tol) => {
    const objs = [];
    for (const m of list) {
      const pieces = [...m.foot].sort((a, b) => Math.abs(signedArea(b[0])) - Math.abs(signedArea(a[0])));
      pieces.forEach((poly, j) => {
        const vid = `v-${m.key}-${j + 1}`;
        const outer = simplifyRing(poly[0].map(shift), tol);
        objs.push(createVolume({ id: vid, shape: 'poly', ...polyFromWorld(outer), z: mm(m.z0 - ground), h: mm(Math.max(0.1, m.z1 - m.z0)), name: m.name, state }));
        poly.slice(1).forEach((hole, k) => {
          if (Math.abs(signedArea(hole)) < 0.5) return; // a shaft or a duct: too small for a diagram
          objs.push(createCut({ id: `c-${m.key}-${j + 1}-${k + 1}`, shape: 'poly', ...polyFromWorld(simplifyRing(hole.map(shift), tol)), z: mm(m.z0 - ground - 0.05), h: mm(m.z1 - m.z0 + 0.1), target: vid }));
        });
      });
    }
    return objs;
  };
  const steps = plans.map((p, i) => {
    const objects = objectsOf(p.masses);
    // something of the step before is gone: show it dashed
    const lost = i > 0 && [...plans[i - 1].els].some((e) => !p.els.has(e));
    return createStep({ title: p.title, text: p.text, objects, ghostPrev: lost });
  });

  // ---- the uses: the rooms by name, inside the masses seen as ghosts
  const categories = [];
  const rooms = spaces.filter((e) => !hasPhases || standsIn(e, lastPhase));
  if (rooms.length && opts.uses !== false) {
    const area = new Map();
    const useName = (e) => (e.longName || e.name || '').trim() || t('import.otherUses');
    for (const e of rooms) {
      const a = footOf([e]).reduce((s, poly) => s + Math.abs(signedArea(poly[0])), 0);
      area.set(useName(e), (area.get(useName(e)) || 0) + a);
    }
    const names = [...area.keys()].sort((a, b) => area.get(b) - area.get(a));
    const kept = names.length > MAX_USES ? names.slice(0, MAX_USES - 1) : names;
    const catOf = new Map();
    kept.forEach((n, i) => { const c = createCategory(n, USE_COLORS[i % USE_COLORS.length]); categories.push(c); catOf.set(n, c.id); });
    if (kept.length < names.length) {
      const other = createCategory(t('import.otherUses'), USE_COLORS[kept.length % USE_COLORS.length]);
      categories.push(other);
      for (const n of names.slice(kept.length)) catOf.set(n, other.id);
    }
    const last = plans[plans.length - 1];
    // rooms smaller than this (m²) — shafts, closets — say nothing in a diagram of uses
    const bigRooms = rooms.filter((e) => footOf([e]).reduce((a, poly) => a + Math.abs(signedArea(poly[0])), 0) >= 2);
    const groups = new Map();
    for (const e of bigRooms) {
      const name = useName(e), st = storeyOf.get(e.storey ?? 'none')?.index ?? 0;
      const k = `${st}:${catOf.get(name)}`;
      if (!groups.has(k)) groups.set(k, { key: `${st}-${groups.size + 1}`, name, rooms: [] });
      groups.get(k).rooms.push(e);
    }
    const useGroups = [...groups.values()].map((g) => ({ ...g, z0: least(g.rooms, (e) => e.z0), z1: most(g.rooms, (e) => e.z1) }));
    const objs = light((tol) => {
      const out = objectsAt(last.masses, 'ghost', tol);
      // the rooms of one use on one storey, side by side, are one volume (lighter to draw, and clearer)
      const pieces = [];
      for (const g of useGroups) footOf(g.rooms).forEach((poly, j) => pieces.push({ g, poly, j, area: Math.abs(signedArea(poly[0])) }));
      pieces.sort((p, q) => q.area - p.area);
      for (const { g, poly, j } of pieces.slice(0, MAX_ROOM_PIECES)) {
        out.push(createVolume({ id: `v-u${g.key}-${j + 1}`, shape: 'poly', ...polyFromWorld(simplifyRing(poly[0].map(shift), tol)), z: mm(g.z0 - ground), h: mm(Math.max(0.1, g.z1 - g.z0)), name: g.name, cat: catOf.get(g.name) }));
      }
      return out;
    });
    steps.push(createStep({ title: t('import.usesTitle'), text: t('import.usesText'), objects: objs, ghostPrev: false }));
  }

  const name = data.project || data.name || t('import.title');
  const project = createProject({ name, site: { w: W, d: D, mode: 'dashed', dims: true, thickness: 0 }, categories, steps });
  project.sheet = { ...project.sheet, title: name, subtitle: t('import.subtitle') };
  return {
    project,
    info: { storeys: storeys.filter((s) => s.id !== 'none').length, phases: hasPhases ? phases : [], elements: masses.length, rooms: rooms.length, steps: steps.length, mode, far },
  };
}

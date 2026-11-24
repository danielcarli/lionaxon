/*---------------------------------------------------------------------------------------------
 *  LionAxon — Copyright (C) 2026 LionAxon Team.
 *  Created and conceived by Daniel Michelon De Carli.
 *  Licensed under the GNU General Public License v3.0 or later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/
// The vector renderer: turns one step of the project into SVG markup. The same markup is used on screen,
// in the thumbnails, in the sheet and in the exported files, so what is seen is what is exported.
//
//   solids (solids.js) → plane faces in 3D: volumes of every shape, the ground (slab, platforms, slopes)
//   faces              → screen polygons (parallel projection)
//   order              → back to front, from plane tests between overlapping faces (Newell), then by depth
//   SVG                → ground (grid, site, dimensions, north), model (faces, floor lines, people,
//                        spheres), top layer (arrows, labels, cuts and the level plane in the editor)
import { richLines, richTspans } from './richText.js';
import { project, depth, dot, verticalScale, makeView } from '../../../../base/common/geometry/projection.js';
import { rectRing, bboxOf, bboxOverlap, bboxUnion, convexHull, convexOverlap, difference, union, intersection } from '../../../../base/common/geometry/polygon.js';
import {
  baseOf, indexById, changedVolumes, elevationOf, slopeEnds, heightOf, formatElevation, explodeOffsets, splitsFloors, stepAngles,
  siteOutline, shadowVector, sameGeometry,
  TERRAIN_TARGET,
} from '../../model/common/model.js';
import { getStyle, shade, arrowColor } from './styles.js';
import { volumeFaces, extrusionFaces, slopeFaces, expandCut, footprintOf, shadowOf, openingShape, restingHeight, isTrapezoid, trapezoidFaces, cutsTaking } from './solids.js';
import { joinTerrain } from './joinTerrain.js';
import { labelFont } from './fonts.js';

export { volumeBands, volumeFaces } from './solids.js';

const EPS = 1e-6;
const r3 = (v) => Math.round(v * 1000) / 1000;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const ptsPath = (pts) => 'M' + pts.map(([x, y]) => `${r3(x)} ${r3(y)}`).join('L') + 'Z';
const linePath = (pts) => 'M' + pts.map(([x, y]) => `${r3(x)} ${r3(y)}`).join('L');

export const FONT = "'Plus Jakarta Sans', 'Segoe UI', system-ui, sans-serif";

/**
 * Tone of a face from its normal: tops keep the colour, walls darken in two tones (left and right on the
 * screen), slanted faces sit in between.
 */
export function toneFor(base, n, view) {
  if (n[2] > 0.999) return base;
  const h = Math.hypot(n[0], n[1]) || 1;
  const facing = (n[0] * view.e1[0] + n[1] * view.e1[1]) / h; // -1 left … 1 right
  const wall = 0.09 + 0.09 * (facing + 1);
  if (n[2] < -0.999) return shade(base, 0.32);
  return shade(base, wall * (1 - Math.max(0, n[2])) + (n[2] < 0 ? 0.1 : 0));
}

// ---------------------------------------------------------------------------------------------
// back-to-front order

const SIDE_TOL = 1e-4;

function prepFace(f, view) {
  f.c = dot(f.n, f.pts[0]);
  f.sign = dot(f.n, view.cam) < 0 ? -1 : 1;
  f.bb = bboxOf(f.scr);
  f.hull = convexHull(f.scr);
  f.depth = f.pts.reduce((s, p) => s + depth(view, p), 0) / f.pts.length;
}

const sideOf = (plane, p) => (dot(plane.n, p) - plane.c) * plane.sign;

/**
 * Which of two faces is drawn first: -1 (A first), 1 (B first), 0 (they do not overlap on screen) or null
 * when the plane tests cannot tell (the faces cross each other, or each straddles the other's plane).
 */
function relation(A, B) {
  if (!bboxOverlap(A.bb, B.bb, 1e-6) || !convexOverlap(A.hull, B.hull, 1e-5)) return 0;
  const sA = A.pts.map((p) => sideOf(B, p));
  const sB = B.pts.map((p) => sideOf(A, p));
  if (sA.every((x) => x <= SIDE_TOL)) return -1;   // A behind B's plane
  if (sB.every((x) => x >= -SIDE_TOL)) return -1;  // B in front of A's plane
  if (sA.every((x) => x >= -SIDE_TOL)) return 1;   // A in front of B's plane
  if (sB.every((x) => x <= SIDE_TOL)) return 1;    // B behind A's plane
  return null;
}

const straddles = (f, plane) => {
  let pos = false, neg = false;
  for (const p of f.pts) { const d = sideOf(plane, p); if (d > SIDE_TOL) pos = true; else if (d < -SIDE_TOL) neg = true; }
  return pos && neg;
};

/** Point-in-face test (even-odd over all rings), for a point on the face's plane. */
function insideFace(f, p) {
  const ax = Math.abs(f.n[0]) > Math.abs(f.n[1]) ? (Math.abs(f.n[0]) > Math.abs(f.n[2]) ? 0 : 2) : (Math.abs(f.n[1]) > Math.abs(f.n[2]) ? 1 : 2);
  const [u, v] = [[1, 2], [0, 2], [0, 1]][ax];
  let inside = false;
  for (const ring of f.rings || [f.pts]) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i], b = ring[j];
      if ((a[v] > p[v]) !== (b[v] > p[v]) && p[u] < ((b[u] - a[u]) * (p[v] - a[v])) / (b[v] - a[v]) + a[u]) inside = !inside;
    }
  }
  return inside;
}

/** The parts of 3D segments on one side of a plane (+1 or -1). */
function clipSegments(segs, plane, keep) {
  const out = [];
  for (const [a, b] of segs) {
    const da = sideOf(plane, a) * keep, db = sideOf(plane, b) * keep;
    if (da >= -SIDE_TOL && db >= -SIDE_TOL) out.push([a, b]);
    else if (da >= -SIDE_TOL || db >= -SIDE_TOL) {
      const t = da / (da - db);
      const m = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
      out.push(da >= 0 ? [a, m] : [m, b]);
    }
  }
  return out;
}

/**
 * Splits a single-ring face by the plane of another face. Each part keeps which of its edges are edges of
 * the original face (drawn) and which come from the cut (not drawn, unless the cut runs where the two
 * surfaces meet: the line where a wall goes into the ground is drawn, as by hand).
 */
function splitFace(f, by, view) {
  const pts = f.pts;
  const edges = f.edges || pts.map(() => true);
  const d = pts.map((p) => sideOf(by, p));
  const parts = [];
  for (const keep of [1, -1]) {
    const out = [], flags = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const da = d[i] * keep, db = d[(i + 1) % pts.length] * keep;
      const ina = da >= -SIDE_TOL, inb = db >= -SIDE_TOL;
      if (ina) { out.push(a); flags.push(inb ? edges[i] : 'cut'); }
      if ((da > SIDE_TOL && db < -SIDE_TOL) || (da < -SIDE_TOL && db > SIDE_TOL)) {
        const t = da / (da - db);
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
        flags.push(ina ? 'cut' : edges[i]);
      }
    }
    if (out.length < 3) continue;
    // the cut edges: drawn only where they lie on the other face (the two surfaces meet there)
    const fl = flags.map((fv, i) => {
      if (fv !== 'cut') return fv;
      const a = out[i], b = out[(i + 1) % out.length];
      return insideFace(by, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]);
    });
    const scr = out.map((p) => project(view, p));
    if (Math.abs(scr.reduce((s, p, i) => { const q = scr[(i + 1) % scr.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0)) < 1e-7) continue;
    const part = { ...f, pts: out, rings: [out], scr, edges: fl, split: true };
    if (f.lines?.length) part.lines = clipSegments(f.lines.map((l) => [l[0], l[l.length - 1]]), by, keep);
    if (f.gridMinor) part.gridMinor = clipSegments(f.gridMinor, by, keep);
    if (f.gridMajor) part.gridMajor = clipSegments(f.gridMajor, by, keep);
    if (f.smooth) {
      part.smooth = {
        rim: clipSegments(f.smooth.rim.map((l) => [l[0], l[l.length - 1]]), by, keep),
        seams: f.smooth.seams.map((sm) => ({ ...sm, edge: clipSegments([sm.edge], by, keep)[0] })).filter((sm) => sm.edge),
      };
    }
    prepFace(part, view);
    parts.push(part);
  }
  return parts;
}

/**
 * Orders faces back to front. Each face: { pts (outer ring, 3D), n, scr (outer ring on screen) }.
 * Pairs that overlap on screen are ordered by plane tests (Newell); when those cannot tell — the faces
 * cross each other, as a volume set into a platform or a slope — one face is cut by the plane of the other,
 * so every part is on one side. The order is then exact.
 */
export function sortFaces(input, view) {
  for (const f of input) prepFace(f, view);
  const list = input.slice();
  const alive = list.map(() => true);
  const splittable = (f) => f.kind === 'face' && (!f.rings || f.rings.length === 1);
  let budget = 3000;
  for (let i = 0; i < list.length && budget > 0; i++) {
    for (let j = 0; j < i && alive[i]; j++) {
      if (!alive[j] || relation(list[j], list[i]) !== null) continue;
      const A = list[j], B = list[i];
      let idx = -1, by = null;
      if (splittable(B) && straddles(B, A)) { idx = i; by = A; }
      else if (splittable(A) && straddles(A, B)) { idx = j; by = B; }
      if (idx < 0) continue;
      const parts = splitFace(list[idx], by, view);
      if (parts.length < 2) continue;
      budget -= parts.length;
      alive[idx] = false;
      for (const p of parts) { list.push(p); alive.push(true); }
    }
  }
  const faces = list.filter((_, k) => alive[k]);
  const n = faces.length;
  const after = Array.from({ length: n }, () => []);
  const indeg = new Array(n).fill(0);
  const edge = (from, to) => { after[from].push(to); indeg[to]++; };
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const r = relation(faces[i], faces[j]);
      if (r === 0) continue;
      if (r === -1) edge(i, j);
      else if (r === 1) edge(j, i);
      else if (faces[i].depth >= faces[j].depth) edge(i, j);
      else edge(j, i);
    }
  }
  // Kahn's algorithm, always taking the farthest face that is free; a cycle is broken by depth.
  const done = new Array(n).fill(false);
  const order = [];
  const ready = [];
  for (let k = 0; k < n; k++) if (!indeg[k]) ready.push(k);
  while (order.length < n) {
    if (!ready.length) {
      let best = -1;
      for (let k = 0; k < n; k++) if (!done[k] && (best < 0 || faces[k].depth > faces[best].depth)) best = k;
      indeg[best] = 0;
      ready.push(best);
    }
    let bi = 0;
    for (let k = 1; k < ready.length; k++) if (faces[ready[k]].depth > faces[ready[bi]].depth) bi = k;
    const k = ready.splice(bi, 1)[0];
    if (done[k]) continue;
    done[k] = true;
    order.push(faces[k]);
    for (const m of after[k]) if (!done[m] && --indeg[m] === 0) ready.push(m);
  }
  return order;
}

// ---------------------------------------------------------------------------------------------
// people

const PEOPLE = [
  'M-0.10 0.80L0.10 0.80L0.13 0.46L0.08 0.46L0.07 0.02L0.015 0.02L0 0.40L-0.015 0.02L-0.07 0.02L-0.08 0.46L-0.13 0.46Z',
  'M-0.10 0.80L0.10 0.80L0.14 0.48L0.09 0.47L0.13 0.02L0.07 0.02L0 0.38L-0.07 0.02L-0.13 0.02L-0.09 0.47L-0.14 0.48Z',
  'M-0.10 0.80L0.10 0.80L0.20 0.52L0.16 0.50L0.08 0.62L0.07 0.02L0.015 0.02L0 0.40L-0.015 0.02L-0.07 0.02L-0.08 0.46L-0.13 0.46Z',
];
const PERSON_HEIGHT = 1.75;
export const WHEELCHAIR = 3;

function personMarkup(view, o, z, style, attrs) {
  const [bx, by] = project(view, [o.x, o.y, z]);
  if (view.plan) {
    if (o.pose === WHEELCHAIR) {
      return `<g${attrs}><rect x="${r3(bx - 0.35)}" y="${r3(by - 0.55)}" width="0.7" height="1.1" rx="0.12" fill="${style.person}"/><circle cx="${r3(bx)}" cy="${r3(by)}" r="0.26" fill="${style.paper}"/></g>`;
    }
    return `<g${attrs}><circle cx="${r3(bx)}" cy="${r3(by)}" r="0.32" fill="${style.person}"/></g>`;
  }
  const H = PERSON_HEIGHT * verticalScale(view);
  const P = (x, y) => `${r3(bx + x * H)} ${r3(by - y * H)}`;
  if (o.pose === WHEELCHAIR) {
    // seated person in a wheelchair, seen from the side: big wheel, small front wheel, frame, body
    const sw = r3(0.045 * H);
    return `<g${attrs} fill="none" stroke="${style.person}" stroke-linecap="round" stroke-linejoin="round">`
      + `<circle cx="${r3(bx - 0.06 * H)}" cy="${r3(by - 0.19 * H)}" r="${r3(0.17 * H)}" stroke-width="${sw}"/>`
      + `<circle cx="${r3(bx + 0.2 * H)}" cy="${r3(by - 0.045 * H)}" r="${r3(0.04 * H)}" stroke-width="${r3(0.03 * H)}"/>`
      + `<path d="M${P(-0.2, 0.5)}L${P(-0.17, 0.33)}L${P(0.13, 0.33)}L${P(0.2, 0.09)}" stroke-width="${r3(0.03 * H)}"/>`
      + `<path d="M${P(-0.08, 0.64)}L${P(-0.07, 0.4)}L${P(0.13, 0.39)}L${P(0.16, 0.12)}L${P(0.23, 0.11)}" stroke-width="${r3(0.075 * H)}"/>`
      + `<path d="M${P(-0.07, 0.6)}L${P(0.08, 0.46)}" stroke-width="${r3(0.05 * H)}"/>`
      + `<circle cx="${r3(bx - 0.06 * H)}" cy="${r3(by - 0.73 * H)}" r="${r3(0.07 * H)}" fill="${style.person}" stroke="none"/></g>`;
  }
  const path = PEOPLE[o.pose] || PEOPLE[0];
  const d = path.replace(/(-?\d*\.?\d+) (-?\d*\.?\d+)/g, (_, x, y) => P(Number(x), Number(y)));
  return `<g${attrs} fill="${style.person}"><path d="${d}"/><circle cx="${r3(bx)}" cy="${r3(by - 0.915 * H)}" r="${r3(0.075 * H)}"/></g>`;
}

function personBounds(view, o, z) {
  const [bx, by] = project(view, [o.x, o.y, z]);
  if (view.plan) return [bx - 0.7, by - 0.7, bx + 0.7, by + 0.7];
  const H = PERSON_HEIGHT * verticalScale(view);
  const w = o.pose === WHEELCHAIR ? 0.3 * H : 0.2 * H;
  return [bx - w - 0.3, by - H - 0.3, bx + w + 0.3, by + 0.3];
}

// ---------------------------------------------------------------------------------------------
// arrows and labels (`o.z` already resolved to an absolute height by the caller)

/** Points of an arrow in 3D (a straight line or a curve bent sideways by `bend` metres). */
export function arrowPoints(o) {
  const a = [o.x1, o.y1], b = [o.x2, o.y2];
  const z2 = Number.isFinite(o.z2) ? o.z2 : o.z;
  if (!o.bend) return [[...a, o.z], [...b, z2]];
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  const c = [(a[0] + b[0]) / 2 - (dy / len) * o.bend * 2, (a[1] + b[1]) / 2 + (dx / len) * o.bend * 2];
  const pts = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24, u = 1 - t;
    pts.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1], o.z + (z2 - o.z) * t]);
  }
  return pts;
}

function arrowGeometry(o) {
  const pts = arrowPoints(o);
  const hl = Math.max(0.6, o.width * 4.5), hw = Math.max(0.5, o.width * 4);
  const head = (tip, from) => {
    let dx = tip[0] - from[0], dy = tip[1] - from[1];
    const len = Math.hypot(dx, dy) || 1;
    dx /= len; dy /= len;
    const bx = tip[0] - dx * hl, by = tip[1] - dy * hl;
    return { tri: [tip, [bx - dy * hw / 2, by + dx * hw / 2, tip[2]], [bx + dy * hw / 2, by - dx * hw / 2, tip[2]]], base: [bx, by, tip[2]] };
  };
  const heads = [];
  const line = pts.slice();
  if (o.heads >= 1 && line.length >= 2) {
    const h = head(line[line.length - 1], line[line.length - 2]);
    heads.push(h.tri);
    line[line.length - 1] = h.base;
  }
  if (o.heads === 2 && line.length >= 2) {
    const h = head(pts[0], pts[1]);
    heads.push(h.tri);
    line[0] = h.base;
  }
  return { pts, line, heads };
}

function arrowMarkup(view, o, style, categories, attrs, hit) {
  const g = arrowGeometry(o);
  const color = arrowColor(style, o.color, categories);
  const line = g.line.map((p) => project(view, p));
  const w = r3(o.width);
  const dash = o.dashed ? ` stroke-dasharray="${r3(o.width * 3)} ${r3(o.width * 2.2)}"` : '';
  let s = `<g${attrs}>`;
  if (hit) s += `<path d="${linePath(line)}" fill="none" stroke="transparent" stroke-width="${r3(Math.max(1.2, o.width * 5))}" stroke-linecap="round"/>`;
  s += `<path d="${linePath(line)}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="${o.dashed ? 'butt' : 'round'}" stroke-linejoin="round"${dash}/>`;
  for (const tri of g.heads) s += `<path d="${ptsPath(tri.map((p) => project(view, p)))}" fill="${color}"/>`;
  return s + '</g>';
}

const arrowBounds = (view, o) => { const g = arrowGeometry(o); return bboxOf([...g.pts, ...g.heads.flat()].map((p) => project(view, p))); };

/** How wide a character of a label is, on average (the text, or its note), in drawing units. */
const titleChar = (o) => o.size * labelFont(o.font).width * (o.caps ? 1 : 0.85);
const noteChar = (o) => o.size * 0.72 * labelFont(o.font).width * 0.85;

/**
 * The lines of the text of a label and of its note, formatted (**bold**, *italic*, lists) and broken at its
 * width when it has one; see richText.js.
 */
const labelLines = (o) => richLines(o.text || '', { max: o.wrap, cw: titleChar(o), caps: o.caps });
const noteLines = (o) => (o.note ? richLines(o.note, { max: o.wrap, cw: noteChar(o) }) : []);

/**
 * Whether the text of a label runs to the right of its point (its leader goes right): else it ends at it.
 * A text box has no leader, so it always runs to the right, wherever it is moved.
 */
export const textRight = (o) => o.line === false || o.dx >= 0;

/** Whether the text of a label hangs under its first line (a note, a width, no leader): a block of text. */
const hangsBelow = (o) => !!(o.note || o.wrap || o.line === false);

/** The box of the text of a label (no leader): its width and height in drawing units, wrapped when it has a width. */
export function labelTextBox(o) {
  const lines = labelLines(o), notes = noteLines(o);
  const w = Math.max(0, ...lines.map((l) => l.chars * titleChar(o)), ...notes.map((l) => l.chars * noteChar(o))) + o.size * 0.4;
  const h = lines.length * o.size * 1.25 + notes.length * o.size * 0.72 * 1.3;
  return { w, h };
}
/** The colours of the mark at the point of a label: a warning, a refusal, a gain, a loss. */
const MARK_COLORS = { '!': '#c8322d', '×': '#c8322d', '+': '#2e8b57', '−': '#c8322d' };

function labelMarkup(view, o, style, attrs) {
  const [ax, ay] = project(view, [o.x, o.y, o.z]);
  const tx = ax + o.dx, ty = ay + o.dy;
  const right = textRight(o);
  const lines = labelLines(o);
  const f = labelFont(o.font);
  const lh = o.size * 1.25;
  const notes = noteLines(o);
  const ns = o.size * 0.72, nlh = ns * 1.3;
  // with a note or a width, the leader comes to the first line and the rest hangs under it (a block of
  // text, as in a board); else the lines are centred on the leader
  const hangs = hangsBelow(o);
  const y0 = hangs ? ty : ty - ((lines.length - 1) * lh + notes.length * nlh) / 2;
  const x = r3(tx + (right ? 0.35 : -0.35) * o.size);
  const leader = o.line !== false; // a text box has no leader, no point and no mark
  let s = `<g${attrs}>`;
  if (leader) {
    s += `<path d="M${r3(ax)} ${r3(ay)}L${r3(tx)} ${r3(ty)}" fill="none" stroke="${style.text}" stroke-width="${r3(o.size * 0.06)}"/>`;
    s += `<circle cx="${r3(ax)}" cy="${r3(ay)}" r="${r3(o.size * 0.14)}" fill="${style.text}"/>`;
  }
  s += `<text x="${x}" y="${r3(y0)}" font-family="${esc(f.family)}" font-size="${r3(o.size)}" font-weight="${f.weight}" fill="${style.text}" text-anchor="${right ? 'start' : 'end'}" dominant-baseline="central"${o.caps ? ` letter-spacing="${r3(o.size * 0.04)}"` : ''}>`;
  s += richTspans(lines, { x, lh, cw: titleChar(o), end: !right, bold: Math.min(900, Number(f.weight) + 200) }) + '</text>';
  if (notes.length) {
    // the quieter second part: smaller, lighter, never in capitals
    const ny = y0 + (lines.length - 1) * lh + lh * 0.5 + nlh * 0.5;
    s += `<text class="label-note" x="${x}" y="${r3(ny)}" font-family="${esc(f.family)}" font-size="${r3(ns)}" font-weight="400" fill="${style.text}" fill-opacity="0.62" text-anchor="${right ? 'start' : 'end'}" dominant-baseline="central">`
      + richTspans(notes, { x, lh: nlh, cw: noteChar(o), end: !right, bold: 700 }) + '</text>';
  }
  if (o.mark && leader) {
    const r = o.size * 0.62, col = MARK_COLORS[o.mark] || style.text;
    s += `<circle cx="${r3(ax)}" cy="${r3(ay)}" r="${r3(r)}" fill="#fff" stroke="${col}" stroke-width="${r3(o.size * 0.12)}"/>`
      + `<text x="${r3(ax)}" y="${r3(ay)}" font-family="${esc(f.family)}" font-size="${r3(r * 1.5)}" font-weight="700" fill="${col}" text-anchor="middle" dominant-baseline="central">${esc(o.mark)}</text>`;
  }
  return s + '</g>';
}

function labelBounds(view, o) {
  const [ax, ay] = project(view, [o.x, o.y, o.z]);
  const { w, h } = labelTextBox(o);
  const tx = ax + o.dx, ty = ay + o.dy;
  const y0 = hangsBelow(o) ? ty - o.size * 0.625 : ty - h / 2;
  const box = textRight(o) ? [tx, y0, tx + w, y0 + h] : [tx - w, y0, tx, y0 + h];
  return o.line === false ? box : bboxUnion([ax, ay, ax, ay], box);
}

// ---------------------------------------------------------------------------------------------
// spheres

function sphereMarkup(view, f, fill, style, lw, attrs, ghost, glass) {
  const [cx, cy] = project(view, f.centre);
  const r = f.r;
  const ry = r * Math.sin((view.el * Math.PI) / 180);
  if (ghost) {
    return `<g${attrs}><circle cx="${r3(cx)}" cy="${r3(cy)}" r="${r3(r)}" fill="none" stroke="${style.edge}" stroke-width="${r3(lw * 0.9)}" stroke-dasharray="${r3(lw * 4)} ${r3(lw * 3)}" pointer-events="all"/>`
      + `<ellipse cx="${r3(cx)}" cy="${r3(cy)}" rx="${r3(r)}" ry="${r3(ry)}" fill="none" stroke="${style.edge}" stroke-width="${r3(lw * 0.6)}" stroke-dasharray="${r3(lw * 4)} ${r3(lw * 3)}"/></g>`;
  }
  const op = glass ? ' fill-opacity="0.38"' : '';
  let s = `<g${attrs}><circle cx="${r3(cx)}" cy="${r3(cy)}" r="${r3(r)}" fill="${fill}"${op}/>`;
  if (!view.plan) {
    // the lower half, below the equator, in the darker tone of the walls
    s += `<path d="M${r3(cx - r)} ${r3(cy)}A${r3(r)} ${r3(r)} 0 0 0 ${r3(cx + r)} ${r3(cy)}A${r3(r)} ${r3(ry)} 0 0 1 ${r3(cx - r)} ${r3(cy)}Z" fill="${toneFor(fill, [0.5, -0.5, -0.2], view)}"${op}/>`;
    s += `<path d="M${r3(cx - r)} ${r3(cy)}A${r3(r)} ${r3(ry)} 0 0 0 ${r3(cx + r)} ${r3(cy)}" fill="none" stroke="${style.edge}" stroke-width="${r3(lw * 0.6)}"/>`;
  }
  return s + `<circle cx="${r3(cx)}" cy="${r3(cy)}" r="${r3(r)}" fill="none" stroke="${style.edge}" stroke-width="${r3(lw)}"/></g>`;
}

// ---------------------------------------------------------------------------------------------
// ground: grid, site, dimensions, north

function siteRing(site, z = 0) {
  return siteOutline(site).map(([x, y]) => [x, y, z]);
}

// ---------------------------------------------------------------------------------------------
// the surroundings: flat areas, an image under the drawing, trees, dimension lines

const AREA_FILL = {
  street: (st) => [shade(st.paper, 0.13), 1],
  paving: (st) => [shade(st.paper, 0.06), 1],
  green: (st) => [st.green, 0.38],
  water: (st) => [st.blue, 0.4],
};

function areaMarkup(view, o, z, style, lw, attrs) {
  const [fill, op] = (AREA_FILL[o.kind] || AREA_FILL.street)(style);
  const d = ptsPath(rectRing(o.x, o.y, o.w, o.d, o.rot).map(([x, y]) => project(view, [x, y, z])));
  const edge = shade(style.paper, 0.22);
  let s = `<path${attrs} class="ax-area" d="${d}" fill="${fill}" fill-opacity="${op}" stroke="${edge}" stroke-width="${r3(lw * 0.5)}"/>`;
  if (o.joints > 0 && o.w / o.joints + o.d / o.joints < 400) {
    // the joints of a paved floor, from the middle outwards
    const a = (o.rot * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a);
    const P = (lx, ly) => project(view, [o.x + lx * c - ly * sn, o.y + lx * sn + ly * c, z]);
    let g = '';
    for (let x = (((o.w / 2) % o.joints) || o.joints) - o.w / 2; x < o.w / 2 - 1e-6; x += o.joints) g += linePath([P(x, -o.d / 2), P(x, o.d / 2)]);
    for (let y = (((o.d / 2) % o.joints) || o.joints) - o.d / 2; y < o.d / 2 - 1e-6; y += o.joints) g += linePath([P(-o.w / 2, y), P(o.w / 2, y)]);
    if (g) s += `<path d="${g}" fill="none" stroke="${shade(style.paper, 0.2)}" stroke-width="${r3(lw * 0.5)}" pointer-events="none"/>`;
  }
  return s;
}

/** An image lying on the ground: the projection is parallel, so one matrix puts it exactly in place. */
function underlayMarkup(view, u) {
  const a = (u.rot * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a);
  // image space: (0, 0) is its top-left corner, x to the right, y down, in metres; (u.x, u.y) is its bottom-left on the ground
  const W = (ix, iy) => { const lx = ix, ly = u.h - iy; return project(view, [u.x + lx * c - ly * sn, u.y + lx * sn + ly * c, 0]); };
  const o = W(0, 0), ex = W(1, 0), ey = W(0, 1);
  const m = [ex[0] - o[0], ex[1] - o[1], ey[0] - o[0], ey[1] - o[1], o[0], o[1]].map((v) => Math.round(v * 1e5) / 1e5);
  return `<image class="ax-underlay" href="${u.src}" width="${r3(u.w)}" height="${r3(u.h)}" preserveAspectRatio="none" opacity="${u.opacity}" transform="matrix(${m.join(' ')})" pointer-events="none"/>`;
}

function treeMarkup(view, o, z, style, lw, attrs) {
  const [bx, by] = project(view, [o.x, o.y, z]);
  const r = o.size / 2;
  const edge = shade(style.green, -0.35);
  if (view.plan) {
    return `<g${attrs}><circle cx="${r3(bx)}" cy="${r3(by)}" r="${r3(r)}" fill="${style.green}" fill-opacity="0.45" stroke="${edge}" stroke-width="${r3(lw * 0.7)}"/><circle cx="${r3(bx)}" cy="${r3(by)}" r="${r3(Math.min(0.3, r / 4))}" fill="${edge}"/></g>`;
  }
  const k = verticalScale(view);
  const H = o.h * k;
  const trunk = `<path d="M${r3(bx)} ${r3(by)}V${r3(by - H * 0.5)}" stroke="${edge}" stroke-width="${r3(Math.max(lw * 1.6, o.size * 0.06))}" stroke-linecap="round" fill="none"/>`;
  if (o.kind === 'conifer') {
    return `<g${attrs}>${trunk}<path d="M${r3(bx - r)} ${r3(by - H * 0.22)}L${r3(bx)} ${r3(by - H)}L${r3(bx + r)} ${r3(by - H * 0.22)}Z" fill="${style.green}" fill-opacity="0.88" stroke="${edge}" stroke-width="${r3(lw * 0.8)}" stroke-linejoin="round"/></g>`;
  }
  // a round crown: as wide as its size, a little flattened by the view
  const ry = r * (0.55 + 0.45 * k), cy = by - H + ry;
  return `<g${attrs}>${trunk}<ellipse cx="${r3(bx)}" cy="${r3(cy)}" rx="${r3(r)}" ry="${r3(ry)}" fill="${style.green}" fill-opacity="0.88" stroke="${edge}" stroke-width="${r3(lw * 0.8)}"/></g>`;
}

function treeBounds(view, o, z) {
  const [bx, by] = project(view, [o.x, o.y, z]);
  const r = o.size / 2;
  return view.plan ? [bx - r, by - r, bx + r, by + r] : [bx - r, by - o.h * verticalScale(view) - 0.2, bx + r, by + 0.2];
}

/** The geometry of a dimension line: the measured points, the line set aside by `offset`, its length. */
function dimGeometry(o) {
  const dx = o.x2 - o.x1, dy = o.y2 - o.y1, len = Math.hypot(dx, dy) || 1;
  const n = [(-dy / len) * o.offset, (dx / len) * o.offset];
  return { a: [o.x1, o.y1, o.z], b: [o.x2, o.y2, o.z], a2: [o.x1 + n[0], o.y1 + n[1], o.z], b2: [o.x2 + n[0], o.y2 + n[1], o.z], len: Math.hypot(dx, dy), n };
}

function dimMarkup(view, o, style, lw, size, fmt, attrs, hit) {
  const g = dimGeometry(o);
  const P = (q) => project(view, q);
  const [a, b, a2, b2] = [g.a, g.b, g.a2, g.b2].map(P);
  // the witness lines run a little past the dimension line
  const past = (p, q) => { const d = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1; return [q[0] + ((q[0] - p[0]) / d) * size * 0.4, q[1] + ((q[1] - p[1]) / d) * size * 0.4]; };
  const ea = past(a, a2), eb = past(b, b2);
  const dir = [b2[0] - a2[0], b2[1] - a2[1]], dl = Math.hypot(...dir) || 1;
  const u = [dir[0] / dl, dir[1] / dl];
  const tick = (c) => { const k = size * 0.38; return `M${r3(c[0] - (u[0] - u[1]) * k)} ${r3(c[1] - (u[1] + u[0]) * k)}L${r3(c[0] + (u[0] - u[1]) * k)} ${r3(c[1] + (u[1] + u[0]) * k)}`; };
  let ang = (Math.atan2(u[1], u[0]) * 180) / Math.PI;
  if (ang > 90 || ang < -90) ang += 180;
  const mid = [(a2[0] + b2[0]) / 2, (a2[1] + b2[1]) / 2];
  const d = `M${r3(a[0])} ${r3(a[1])}L${r3(ea[0])} ${r3(ea[1])}M${r3(b[0])} ${r3(b[1])}L${r3(eb[0])} ${r3(eb[1])}M${r3(a2[0])} ${r3(a2[1])}L${r3(b2[0])} ${r3(b2[1])}${tick(a2)}${tick(b2)}`;
  return `<g${attrs} class="ax-dim">`
    + (hit ? `<path d="M${r3(a2[0])} ${r3(a2[1])}L${r3(b2[0])} ${r3(b2[1])}" stroke="transparent" stroke-width="${r3(size * 1.4)}" fill="none" pointer-events="stroke"/>` : '')
    + `<path d="${d}" fill="none" stroke="${style.ink}" stroke-width="${r3(lw * 0.75)}" stroke-linecap="round"/>`
    + `<text x="${r3(mid[0])}" y="${r3(mid[1])}" transform="rotate(${r3(ang)} ${r3(mid[0])} ${r3(mid[1])})" dy="${r3(-size * 0.45)}" font-family="${FONT}" font-size="${r3(size)}" fill="${style.ink}" text-anchor="middle" paint-order="stroke" stroke="${style.paper}" stroke-width="${r3(size * 0.28)}" stroke-linejoin="round">${esc(fmt(g.len))}</text></g>`;
}

const dimBounds = (view, o, size) => { const g = dimGeometry(o); const b = bboxOf([g.a, g.b, g.a2, g.b2].map((q) => project(view, q))); return [b[0] - size, b[1] - size, b[2] + size, b[3] + size]; };

// ---------------------------------------------------------------------------------------------
// section: everything in front of a vertical plane is taken away, and what the plane cuts is filled

/** The part of a ring (3D points) with side(p) <= 0. */
function clipRing(ring, side) {
  const out = [];
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i], q = ring[(i + 1) % ring.length];
    const sp = side(p), sq = side(q);
    if (sp <= 0) out.push(p);
    if ((sp < 0 && sq > 0) || (sp > 0 && sq < 0)) { const t = sp / (sp - sq); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t]); }
  }
  return out;
}

/** Where a plane face meets the section plane: a list of segments (pairs of 3D points). */
function sectionSegments(rings, n, side) {
  const pts = [];
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i], q = ring[(i + 1) % ring.length];
      const sp = side(p) > 0, sq = side(q) > 0;
      if (sp === sq) continue;
      const a = side(p), t = a / (a - side(q));
      pts.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t]);
    }
  }
  if (pts.length < 2) return [];
  // along the line where the two planes meet
  const spread = (k) => Math.max(...pts.map((q) => q[k])) - Math.min(...pts.map((q) => q[k]));
  const k = [0, 1, 2].sort((i, j) => spread(j) - spread(i))[0];
  pts.sort((u, v) => u[k] - v[k]);
  const out = [];
  for (let i = 0; i + 1 < pts.length; i += 2) if (Math.hypot(pts[i][0] - pts[i + 1][0], pts[i][1] - pts[i + 1][1], pts[i][2] - pts[i + 1][2]) > 1e-5) out.push([pts[i], pts[i + 1]]);
  void n;
  return out;
}

/** Joins segments end to end into closed outlines. */
function chainLoops(segs) {
  const key = (q) => `${Math.round(q[0] * 500)},${Math.round(q[1] * 500)},${Math.round(q[2] * 500)}`;
  const left = segs.slice();
  const loops = [];
  while (left.length) {
    const loop = left.pop().slice();
    for (let guard = 0; guard < 10000; guard++) {
      const end = key(loop[loop.length - 1]);
      if (end === key(loop[0]) && loop.length > 2) { loop.pop(); break; }
      const i = left.findIndex(([p, q]) => key(p) === end || key(q) === end);
      if (i < 0) break;
      const [p, q] = left.splice(i, 1)[0];
      loop.push(key(p) === end ? q : p);
    }
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
}

function gridMarkup(view, prj, style, lw) {
  const { site } = prj;
  const g = prj.grid || 1;
  const m = Math.max(10, 0.3 * Math.max(site.w, site.d));
  const step = (site.w + site.d + 2 * m) / g > 600 ? g * 5 : g;
  let minor = '', major = '';
  const x0 = Math.floor(-m / step) * step, x1 = Math.ceil((site.w + m) / step) * step;
  const y0 = Math.floor(-m / step) * step, y1 = Math.ceil((site.d + m) / step) * step;
  for (let x = x0; x <= x1 + EPS; x += step) {
    const a = project(view, [x, y0, 0]), b = project(view, [x, y1, 0]);
    const seg = `M${r3(a[0])} ${r3(a[1])}L${r3(b[0])} ${r3(b[1])}`;
    if (Math.abs(Math.round(x / 5) * 5 - x) < EPS) major += seg; else minor += seg;
  }
  for (let y = y0; y <= y1 + EPS; y += step) {
    const a = project(view, [x0, y, 0]), b = project(view, [x1, y, 0]);
    const seg = `M${r3(a[0])} ${r3(a[1])}L${r3(b[0])} ${r3(b[1])}`;
    if (Math.abs(Math.round(y / 5) * 5 - y) < EPS) major += seg; else minor += seg;
  }
  return `<g class="ax-grid" fill="none" stroke="${style.grid}">`
    + (minor ? `<path d="${minor}" stroke-width="${r3(lw * 0.5)}"/>` : '')
    + (major ? `<path d="${major}" stroke-width="${r3(lw * 0.9)}"/>` : '') + '</g>';
}

/**
 * Grid lines on a surface: for each line x = k·step (and y = k·step), the pieces inside the rings (even-odd,
 * so holes are left out), lifted onto the surface's plane. Returns { minor, major } lists of 3D segments
 * (every 5 m a major line).
 */
function gridOn(rings, step, zAt) {
  const minor = [], major = [];
  const xs = rings.flat().map((p) => p[0]), ys = rings.flat().map((p) => p[1]);
  for (const axis of [0, 1]) {
    const lo = Math.min(...(axis ? ys : xs)), hi = Math.max(...(axis ? ys : xs));
    for (let c = Math.ceil((lo + EPS) / step) * step; c < hi - EPS; c += step) {
      const hits = [];
      for (const ring of rings) {
        for (let i = 0; i < ring.length; i++) {
          const a = ring[i], b = ring[(i + 1) % ring.length];
          const ua = a[axis], ub = b[axis];
          if ((ua > c) !== (ub > c)) {
            const t = (c - ua) / (ub - ua);
            hits.push(a[1 - axis] + (b[1 - axis] - a[1 - axis]) * t);
          }
        }
      }
      hits.sort((p, q) => p - q);
      const list = Math.abs(Math.round(c / 5) * 5 - c) < EPS ? major : minor;
      for (let k = 0; k + 1 < hits.length; k += 2) {
        const pa = axis ? [hits[k], c] : [c, hits[k]], pb = axis ? [hits[k + 1], c] : [c, hits[k + 1]];
        list.push([[...pa, zAt(pa)], [...pb, zAt(pb)]]);
      }
    }
  }
  return { minor, major };
}

/** The grid of the ground left between the terrain pieces that carry their own grid (editor, terrain as mesh). */
function flatGridMarkup(view, prj, style, lw, holes, siteOnly = false) {
  const { site } = prj;
  const g = prj.grid || 1;
  const m = Math.max(10, 0.3 * Math.max(site.w, site.d));
  const step = (site.w + site.d + 2 * m) / g > 600 ? g * 5 : g;
  // in the editor the grid runs beyond the site; on the sheet it stays inside the site
  const outer = siteOnly ? siteRing(site).map(([x, y]) => [x, y]) : [[-m, -m], [site.w + m, -m], [site.w + m, site.d + m], [-m, site.d + m]];
  const area = holes.length ? difference([[outer]], holes.map((r) => [[r]])) : [[outer]];
  const { minor, major } = gridOn(area.flat(), step, () => 0);
  const path = (segs) => segs.map((l) => linePath(l.map((p) => project(view, p)))).join('');
  return `<g class="ax-grid" fill="none" stroke="${style.grid}">`
    + (minor.length ? `<path d="${path(minor)}" stroke-width="${r3(lw * 0.5)}"/>` : '')
    + (major.length ? `<path d="${path(major)}" stroke-width="${r3(lw * 0.9)}"/>` : '') + '</g>';
}

/** An elevation: the camera on the horizon (the ground is a line). */
export const isElevation = (view) => !view.plan && Math.abs(view.el) < 1;

function groundMarkup(view, prj, style, opts, hasSlab, bottom = 0) {
  const { site } = prj;
  const lw = opts.lw;
  if (isElevation(view)) {
    // the ground line, a little beyond the site on both sides
    const xs = siteRing(site).map((p) => project(view, p)[0]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), pad = (x1 - x0) * 0.08 + 2;
    return `<path class="ax-groundline" d="M${r3(x0 - pad)} 0H${r3(x1 + pad)}" stroke="${style.edge}" stroke-width="${r3(lw * 1.8)}" fill="none"/>`;
  }
  let s = !opts.grid ? '' : opts.meshHoles ? flatGridMarkup(view, prj, style, lw, opts.meshHoles, !!opts.gridSiteOnly) : gridMarkup(view, prj, style, lw);
  const ring = siteRing(site).map((p) => project(view, p));
  if (!hasSlab) {
    if (site.mode === 'fill') s += `<path d="${ptsPath(ring)}" fill="${style.ground}" stroke="${style.site}" stroke-width="${r3(lw * 0.8)}"/>`;
    else if (site.mode === 'dashed') s += `<path d="${ptsPath(ring)}" fill="none" stroke="${style.site}" stroke-width="${r3(lw * 1.1)}" stroke-dasharray="${r3(lw * 6)} ${r3(lw * 4)}"/>`;
    else if (opts.editor) s += `<path d="${ptsPath(ring)}" fill="none" stroke="${style.site}" stroke-opacity="0.45" stroke-width="${r3(lw * 0.7)}" stroke-dasharray="${r3(lw * 2)} ${r3(lw * 3)}"/>`;
  }
  // with a slab, the dimensions hang at its bottom, clear of its sides
  if (site.dims && site.mode !== 'none') s += dimsMarkup(view, site, style, opts, hasSlab ? bottom : 0);
  if (showNorth(prj, view)) s += northMarkup(view, prj, style, opts);
  return s;
}

/** North arrow in the drawing: always in plan (unless turned off), in axonometry when asked. */
const showNorth = (prj, view) => prj.northPlace !== 'none' && !isElevation(view) && (view.plan || prj.northPlace === 'drawing');

/** The two sides of the site that face the viewer, with their outward normals. */
function frontEdges(view, site) {
  const a = (view.az * Math.PI) / 180;
  const dir = [Math.cos(a), Math.sin(a)];
  const edges = [
    { p: [0, 0], q: [site.w, 0], n: [0, -1], len: site.w },
    { p: [site.w, 0], q: [site.w, site.d], n: [1, 0], len: site.d },
    { p: [site.w, site.d], q: [0, site.d], n: [0, 1], len: site.w },
    { p: [0, site.d], q: [0, 0], n: [-1, 0], len: site.d },
  ];
  return edges.map((e) => ({ ...e, f: e.n[0] * dir[0] + e.n[1] * dir[1] })).sort((x, y) => y.f - x.f).slice(0, 2);
}

export const dimTextSize = (site) => Math.max(1.1, Math.min(site.w, site.d) * 0.045);

function dimsMarkup(view, site, style, opts, z = 0) {
  const off = Math.max(1.5, Math.min(site.w, site.d) * 0.07);
  const size = dimTextSize(site);
  const lw = opts.lw;
  let s = `<g class="ax-dims" stroke="${style.muted}" stroke-width="${r3(lw * 0.7)}" fill="none">`;
  let texts = '';
  for (const e of frontEdges(view, site)) {
    const o = (p, k) => [p[0] + e.n[0] * k, p[1] + e.n[1] * k, z];
    const a = project(view, o(e.p, off)), b = project(view, o(e.q, off));
    const ea0 = project(view, o(e.p, off * 0.25)), ea1 = project(view, o(e.p, off * 1.25));
    const eb0 = project(view, o(e.q, off * 0.25)), eb1 = project(view, o(e.q, off * 1.25));
    const tick = (c) => {
      const t0 = project(view, [c[0] - 0.45 * (e.n[0] + e.n[1]), c[1] - 0.45 * (e.n[1] - e.n[0]), z]);
      const t1 = project(view, [c[0] + 0.45 * (e.n[0] + e.n[1]), c[1] + 0.45 * (e.n[1] - e.n[0]), z]);
      return `M${r3(t0[0])} ${r3(t0[1])}L${r3(t1[0])} ${r3(t1[1])}`;
    };
    s += `<path d="M${r3(a[0])} ${r3(a[1])}L${r3(b[0])} ${r3(b[1])}M${r3(ea0[0])} ${r3(ea0[1])}L${r3(ea1[0])} ${r3(ea1[1])}M${r3(eb0[0])} ${r3(eb0[1])}L${r3(eb1[0])} ${r3(eb1[1])}${tick(o(e.p, off))}${tick(o(e.q, off))}"/>`;
    const mid = [(e.p[0] + e.q[0]) / 2, (e.p[1] + e.q[1]) / 2];
    const t = project(view, [mid[0] + e.n[0] * (off + size * 1.9), mid[1] + e.n[1] * (off + size * 1.9), z]);
    texts += `<text x="${r3(t[0])}" y="${r3(t[1])}" font-family="${FONT}" font-size="${r3(size)}" fill="${style.muted}" text-anchor="middle" dominant-baseline="central">${esc(opts.fmt(e.len))}</text>`;
  }
  return s + '</g>' + texts;
}

function dimsBounds(view, site, z = 0) {
  const off = Math.max(1.5, Math.min(site.w, site.d) * 0.07);
  const size = dimTextSize(site);
  const pts = [];
  for (const e of frontEdges(view, site)) {
    for (const p of [e.p, e.q]) pts.push(project(view, [p[0] + e.n[0] * off * 1.25, p[1] + e.n[1] * off * 1.25, z]));
    const mid = [(e.p[0] + e.q[0]) / 2, (e.p[1] + e.q[1]) / 2];
    const [x, y] = project(view, [mid[0] + e.n[0] * (off + size * 1.9), mid[1] + e.n[1] * (off + size * 1.9), z]);
    pts.push([x - size * 2.5, y - size], [x + size * 2.5, y + size]);
  }
  return bboxOf(pts);
}

/** Where the north arrow goes: beyond the back-right corner of the site, past the dimension line. */
function northPlace(prj, view) {
  const { site } = prj;
  const r = Math.max(1.6, Math.min(site.w, site.d) * 0.06);
  const off = Math.max(1.5, Math.min(site.w, site.d) * 0.07);
  // the corner that is at the back on the right of the screen
  const corners = siteRing(site).map((p) => ({ p, s: project(view, p) }));
  const best = corners.reduce((a, b) => ((b.s[0] - b.s[1] * 0.6) > (a.s[0] - a.s[1] * 0.6) ? b : a));
  const cx = best.p[0] === 0 ? -1 : 1, cy = best.p[1] === 0 ? -1 : 1;
  return { r, c: [best.p[0] + cx * (off * 1.4 + r * 1.8), best.p[1] - cy * r * 1.2, 0] };
}

/** North arrow drawn flat on the ground: a circle, an arrow and the letter N (in half tone when asked). */
function northMarkup(view, prj, style, opts) {
  const { r, c } = northPlace(prj, view);
  const a = (prj.north * Math.PI) / 180;
  const rot = ([x, y]) => [c[0] + x * Math.cos(a) - y * Math.sin(a), c[1] + x * Math.sin(a) + y * Math.cos(a), 0];
  const ring = [];
  for (let i = 0; i < 40; i++) { const t = (i / 40) * Math.PI * 2; ring.push(project(view, [c[0] + r * Math.cos(t), c[1] + r * Math.sin(t), 0])); }
  const tri = [[0, r], [r * 0.45, -r * 0.6], [0, -r * 0.25], [-r * 0.45, -r * 0.6]].map(rot).map((p) => project(view, p));
  const [nx, ny] = project(view, rot([0, r * 1.6]));
  const ink = prj.northHalftone ? style.muted : style.ink;
  const op = prj.northHalftone ? ' opacity="0.55"' : '';
  return `<g class="ax-north"${op}><path d="${ptsPath(ring)}" fill="none" stroke="${style.muted}" stroke-width="${r3(opts.lw * 0.7)}"/>`
    + `<path d="${ptsPath(tri)}" fill="${ink}"/>`
    + `<text x="${r3(nx)}" y="${r3(ny)}" font-family="${FONT}" font-size="${r3(r * 0.8)}" font-weight="700" fill="${ink}" text-anchor="middle" dominant-baseline="central">N</text></g>`;
}

function northBounds(prj, view) {
  const { r, c } = northPlace(prj, view);
  const pts = [];
  for (let i = 0; i < 8; i++) { const t = (i / 8) * Math.PI * 2; pts.push(project(view, [c[0] + r * 1.9 * Math.cos(t), c[1] + r * 1.9 * Math.sin(t), 0])); }
  return bboxOf(pts);
}

// ---------------------------------------------------------------------------------------------
// the ground solids: the site's slab, platforms and slopes

/** Ground faces of a step, and whether the site is drawn as a slab. */
export function groundSolids(prj, step, cuts = []) {
  const levels = prj.levels;
  const { site } = prj;
  const faces = [];
  // subtractions of the terrain: pits in the slab, notches in the platforms (absolute heights)
  const dug = cuts.filter((c) => c.target === TERRAIN_TARGET);
  const sunk = [...dug]; // pieces taken out of the slab: { x, y, w, d, rot, z, h }
  let lowest = Math.min(0, ...dug.map((c) => c.z));
  for (const o of step.objects) {
    if (o.type === 'platform') {
      const e = elevationOf(levels, o.level) + o.z;
      if (e > EPS) {
        for (const f of extrusionFaces(rectRing(o.x, o.y, o.w, o.d, o.rot), 0, e, dug, { id: TERRAIN_TARGET })) faces.push({ ...f, obj: o });
      } else if (e < -EPS) {
        sunk.push({ x: o.x, y: o.y, w: o.w, d: o.d, rot: o.rot, z: e, h: -e, target: null });
        lowest = Math.min(lowest, e);
      }
    } else if (o.type === 'slope') {
      const [zA, zB] = slopeEnds(o, levels);
      const bottom = Math.min(0, zA, zB);
      if (bottom < -EPS) {
        sunk.push({ x: o.x, y: o.y, w: o.w, d: o.d, rot: o.rot, z: bottom, h: -bottom, target: null });
        lowest = Math.min(lowest, bottom);
      }
      for (const f of slopeFaces(o, zA, zB, bottom)) faces.push({ ...f, obj: o });
    }
  }
  const thickness = Math.max(site.thickness, lowest < 0 ? -lowest + 1 : 0);
  const slab = thickness > EPS;
  if (slab) {
    for (const f of extrusionFaces(siteOutline(site), -thickness, thickness, sunk, { id: TERRAIN_TARGET })) faces.push({ ...f, obj: null, site: true });
  }
  return { faces, slab, bottom: -thickness };
}

// ---------------------------------------------------------------------------------------------
// the step

/**
 * Renders one step.
 * @param {object} prj the project
 * @param {number} index step index
 * @param {object} opts { view, lw (edge width in drawing units), grid, editor, ids, showCuts, fmt, levelPlane }
 *   `levelPlane` (editor): the id of the level whose plane is drawn as a dashed outline.
 * @returns {{ markup: string, bbox: number[], highlighted: string[] }} SVG markup (no <svg> wrapper) and its bounds on screen
 */
/** How many hatches there are for categories (the k-th category takes hatch k modulo this). */
export const PATTERN_COUNT = 8;
let patternUid = 0;
let clipUid = 0;

/**
 * One hatch as an SVG pattern (userSpaceOnUse): `tile` is the size of its cell, `w` the stroke width.
 * 0 ╱  1 ╲  2 ─  3 dots  4 ╳  5 │  6 grid  7 dense ╱
 */
export function hatchPattern(id, k, tile, w, color) {
  const T = k === 7 ? tile / 2 : tile, r = (v) => Math.round(v * 1000) / 1000;
  const up = `M${r(-T / 4)} ${r(T / 4)}L${r(T / 4)} ${r(-T / 4)}M0 ${r(T)}L${r(T)} 0M${r(T * 0.75)} ${r(T * 1.25)}L${r(T * 1.25)} ${r(T * 0.75)}`;
  const down = `M${r(-T / 4)} ${r(T * 0.75)}L${r(T / 4)} ${r(T * 1.25)}M0 0L${r(T)} ${r(T)}M${r(T * 0.75)} ${r(-T / 4)}L${r(T * 1.25)} ${r(T / 4)}`;
  const hor = `M0 ${r(T / 2)}H${r(T)}`, ver = `M${r(T / 2)} 0V${r(T)}`;
  const body = [up, down, hor, null, up + down, ver, hor + ver, up][k % PATTERN_COUNT];
  const inner = body
    ? `<path d="${body}" fill="none" stroke="${color}" stroke-width="${r(w)}" stroke-linecap="square"/>`
    : `<circle cx="${r(T / 2)}" cy="${r(T / 2)}" r="${r(T * 0.13)}" fill="${color}"/>`;
  return `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${r(T)}" height="${r(T)}">${inner}</pattern>`;
}

export function renderStep(prj, index, opts) {
  const view = opts.view;
  const style = getStyle(prj.style);
  // hidden objects are not drawn (a hidden subtraction does not cut); they still hold up what sits on them
  const step0 = prj.steps[index];
  const step = step0.objects.some((o) => o.hidden) ? { ...step0, objects: step0.objects.filter((o) => !o.hidden) } : step0;
  const levels = prj.levels;
  const lw = opts.lw ?? 0.12;
  const o2 = { lw, grid: !!opts.grid, editor: !!opts.editor, fmt: opts.fmt || ((n) => `${n} m`) };
  const ids = !!opts.ids;
  const idAttr = (o) => (ids && o && !o.fromPrev ? ` data-id="${esc(o.id)}"` : '');
  const changed = step.highlight && index > 0 ? changedVolumes(prj.steps[index - 1], step) : new Set();
  const byId = indexById(step0.objects);
  const zOf = (o) => elevationOf(levels, o.level) + (o.z || 0);
  const exploded = explodeOffsets(step0, levels);
  // a section (side views only): what is nearer than the plane is taken away
  let sec = null;
  if (opts.section && isElevation(view)) {
    const len = Math.hypot(view.cam[0], view.cam[1]) || 1;
    const nH = [view.cam[0] / len, view.cam[1] / len, 0];
    const ds = siteOutline(prj.site).map(([x, y]) => x * nH[0] + y * nH[1]);
    const front = Math.max(...ds), back = Math.min(...ds);
    const c = front - Math.max(0, Math.min(front - back, opts.section.pos ?? (front - back) / 2));
    sec = { nH, c, side: (p) => p[0] * nH[0] + p[1] * nH[1] - c, depth: front - back, segs: new Map() };
  }
  const capOf = (key, f) => { if (!sec || !f.rings) return; const list = sec.segs.get(key) || []; list.push(...sectionSegments(f.rings, f.n, sec.side)); sec.segs.set(key, list); };
  // hatches for the categories: one pattern per category in use, with ids of their own in each drawing
  const uid = prj.catPatterns ? ++patternUid : 0;
  const hatchOf = new Map(prj.catPatterns ? prj.categories.map((c, k) => [c.id, k % PATTERN_COUNT]) : []);
  const hatchUsed = new Set();
  // people and trees stand on what is under them (a platform, a slope, the top of a block): never inside it
  const standing = new Map();
  const restOf = (o) => {
    if (!standing.has(o.id)) standing.set(o.id, restingHeight(step0.objects, levels, o.x, o.y, zOf(o), (v) => baseOf(v, byId, levels), elevationOf));
    return standing.get(o.id);
  };
  const zShown = (o) => (o.type === 'person' || o.type === 'tree' ? restOf(o) : zOf(o)) + (exploded.get(o.id) || 0);
  const cutObjects = step.objects.filter((o) => o.type === 'cut').map((c) => ({ ...c, z: zOf(c) }));
  const cuts = cutObjects.flatMap(expandCut);
  const cats = new Map(prj.categories.map((c) => [c.id, c.color]));
  // the site counts in the bounds only where it is drawn (its outline, its fill, its grid, the ground line of an
  // elevation, the editor): a hidden site bigger than the model would leave the drawing small on the sheet
  const siteRingScr = () => siteRing(prj.site).map((p) => project(view, p));
  const siteDrawn = opts.editor || opts.grid || opts.terrainGrid || prj.site.mode === 'fill' || prj.site.mode === 'dashed' || isElevation(view);
  let bbox = siteDrawn ? bboxOf(siteRingScr()) : null;
  if (showNorth(prj, view)) bbox = bboxUnion(bbox, northBounds(prj, view));

  const faces = [];
  const addFace = (f, extra) => {
    const pts = f.rings[0];
    faces.push({ kind: 'face', ...f, ...extra, pts, scr: pts.map((p) => project(view, p)) });
  };

  // the ground
  const lift = (f, dz) => (dz ? { ...f, rings: f.rings?.map((r) => r.map((p) => [p[0], p[1], p[2] + dz])),
    lines: f.lines?.map((l) => l.map((p) => [p[0], p[1], p[2] + dz])),
    smooth: f.smooth && { rim: f.smooth.rim.map((l) => l.map((p) => [p[0], p[1], p[2] + dz])), seams: f.smooth.seams.map((sm) => ({ ...sm, edge: sm.edge.map((p) => [p[0], p[1], p[2] + dz]) })) },
    centre: f.centre && [f.centre[0], f.centre[1], f.centre[2] + dz] } : f);
  const ground = groundSolids(prj, step, cuts);
  // the site's switch: platforms and slopes that touch drawn as one terrain
  if (prj.site.joined) ground.faces = joinTerrain(ground.faces);
  // editor, terrain as mesh: the terrain is see-through and the grid follows its surfaces
  // the sheet's "terrain as grid": the same see-through terrain with its grid, the flat grid inside the site
  const mesh = ((!!opts.terrainMesh && !!opts.grid) || !!opts.terrainGrid) && !isElevation(view);
  const g = prj.grid || 1;
  const gridStep = (prj.site.w + prj.site.d) / g > 400 ? g * 5 : g;
  const meshHoles = [];
  if (mesh) {
    // each surface carries its own grid; the slab's top leaves out what platforms and slopes cover, and the
    // flat grid around leaves out all of them
    const pieces = ground.faces.filter((f) => f.n[2] > 0.05 && f.obj).map((f) => f.rings[0].map(([x, y]) => [x, y]));
    for (const f of ground.faces) {
      if (!(f.n[2] > 0.05) || !(f.obj || f.site)) continue;
      const flat = f.rings.map((r) => r.map(([x, y]) => [x, y]));
      meshHoles.push(flat[0]);
      const region = f.site && pieces.length ? difference([flat], pieces.map((r) => [[r]])).flat() : flat;
      const [nx, ny, nz] = f.n, c = dot(f.n, f.rings[0][0]);
      const lines = gridOn(region, gridStep, ([x, y]) => (c - nx * x - ny * y) / nz);
      f.gridMinor = lines.minor; f.gridMajor = lines.major;
    }
  }
  for (const f0 of ground.faces) {
    const f = f0.obj ? lift(f0, exploded.get(f0.obj.id) || 0) : f0;
    capOf(f0.obj ? f0.obj.id : '~site', f);
    if (f !== f0) { f.gridMinor = f0.gridMinor?.map((l) => l.map((q) => [q[0], q[1], q[2] + (exploded.get(f0.obj.id) || 0)])); f.gridMajor = f0.gridMajor?.map((l) => l.map((q) => [q[0], q[1], q[2] + (exploded.get(f0.obj.id) || 0)])); }
    if (dot(f.n, view.cam) <= 1e-9) continue;
    if (view.plan && Math.abs(f.n[2]) < 1e-6) continue;
    const top = f.n[2] > 0.999;
    addFace(f, { ground: true, mesh, fill: toneFor(f.site && prj.site.mode !== 'fill' && top ? shade(style.ground, -0.35) : style.ground, f.n, view) });
  }
  if (ground.slab) bbox = bboxUnion(bbox, bboxOf(siteRing(prj.site, ground.bottom).map((p) => project(view, p))));
  if (prj.site.dims && prj.site.mode !== 'none' && !isElevation(view)) bbox = bboxUnion(bbox, dimsBounds(view, prj.site, ground.slab ? ground.bottom : 0));

  // the volumes (in an exploded view each one raised by its offset; floors pulled apart when asked)
  const ex = step.explode;
  const projLines = []; // exploded view: dashed lines from a raised piece down to where it sits
  const footCorners = (o) => {
    const ring = footprintOf(o.type === 'volume' && o.shape === 'sphere' ? { ...o, shape: 'cylinder' } : o);
    return ring.length === 4 ? ring : [0, 1, 2, 3].map((k) => ring[Math.round((k * ring.length) / 4) % ring.length]);
  };
  // what the previous step had and this one took away or changed, as ghosts (not picked in the editor)
  const before = [];
  if (step.ghostPrev && index > 0) {
    const prev = prj.steps[index - 1];
    const prevById = indexById(prev.objects);
    for (const o of prev.objects) {
      if (o.type !== 'volume' || o.hidden || o.state === 'ghost' || o.state === 'context') continue;
      const now = byId.get(o.id);
      if (now && sameGeometry(now, o)) continue;
      before.push({ ...o, state: 'ghost', prevBase: baseOf(o, prevById, levels), fromPrev: true });
    }
  }
  const ctxFill = shade(style.paper, 0.07), ctxEdge = shade(style.paper, 0.3);
  for (const v of [...step.objects, ...before]) {
    if (v.type !== 'volume') continue;
    const base = v.fromPrev ? v.prevBase : baseOf(v, byId, levels);
    const fill = v.state === 'context' ? ctxFill : v.state === 'accent' ? style.accent : v.color ? v.color : v.cat && cats.has(v.cat) ? cats.get(v.cat) : changed.has(v.id) ? style.accent : style.volume;
    const see = v.state === 'ghost' || v.state === 'glass';
    const off = v.fromPrev ? 0 : exploded.get(v.id) || 0;
    const vcuts = v.fromPrev ? [] : cutsTaking(v, base, cutObjects, cuts);
    // the pieces drawn: the whole volume, or one per floor
    const pieces = [];
    if (ex?.on && ex.floors && splitsFloors(v)) {
      const hf = v.h / v.floors;
      for (let k = 0; k < v.floors; k++) {
        const slice = { ...v, floors: 1, h: hf };
        // each floor is built where it really is (so cuts fall right), then raised
        for (const f of volumeFaces(slice, base + k * hf, vcuts)) pieces.push({ f, dz: off + k * ex.gap });
        if (k > 0) for (const c of footCorners(v)) projLines.push([[c[0], c[1], base + k * hf + off + (k - 1) * ex.gap], [c[0], c[1], base + k * hf + off + k * ex.gap]]);
      }
    } else for (const f of volumeFaces(v, base, vcuts)) pieces.push({ f, dz: off });
    if (ex?.on && off > 0) {
      // from its base down one gap, to the top of what is under it
      for (const c of footCorners(v)) projLines.push([[c[0], c[1], base + off - ex.gap], [c[0], c[1], base + off]]);
    }
    for (const { f: f0, dz } of pieces) {
      const f = lift(f0, dz);
      if (f.role === 'sphere') {
        const disc = [];
        for (let i = 0; i < 16; i++) {
          const t = (i / 16) * Math.PI * 2;
          disc.push([0, 1, 2].map((k) => f.centre[k] + f.r * (Math.cos(t) * view.e1[k] + Math.sin(t) * view.e2[k])));
        }
        faces.push({ kind: 'sphere', obj: v, sphere: f, fill, pts: disc, n: view.cam.slice(), scr: disc.map((p) => project(view, p)) });
        continue;
      }
      if (!v.fromPrev && v.state !== 'ghost') capOf(v.id, f);
      if (!see && dot(f.n, view.cam) <= 1e-9) continue;
      if (view.plan && f.role === 'wall' && !see) continue;
      // the slopes of a roof may have a colour of their own
      addFace(f, { obj: v, fill: toneFor(f.role === 'slant' && v.roofColor && v.state !== 'context' ? v.roofColor : fill, f.n, view), ownFill: f.role === 'slant' && !!v.roofColor });
    }
  }
  // what is drawn on the walls: doors, windows, arches, round openings (they go with their volume)
  for (const op of step.objects) {
    if (op.type !== 'opening' || view.plan) continue;
    const v = byId.get(op.on);
    if (!v || v.hidden || v.state === 'ghost') continue;
    const shape = openingShape(op, v, baseOf(v, byId, levels) + (exploded.get(v.id) || 0));
    if (!shape || dot(shape.n, view.cam) <= 1e-9) continue;
    faces.push({ kind: 'opening', obj: op, pts: shape.pts, lines: shape.lines, n: shape.n, scr: shape.pts.map((q) => project(view, q)) });
  }
  for (const p of step.objects) {
    if (p.type !== 'person' || view.plan) continue;
    const z = zShown(p);
    const len = Math.hypot(view.cam[0], view.cam[1]) || 1;
    const ex = view.e1[0] * 0.25, ey = view.e1[1] * 0.25;
    const pts = [[p.x - ex, p.y - ey, z], [p.x + ex, p.y + ey, z], [p.x + ex, p.y + ey, z + PERSON_HEIGHT], [p.x - ex, p.y - ey, z + PERSON_HEIGHT]];
    faces.push({ kind: 'person', obj: p, z, pts, n: [view.cam[0] / len, view.cam[1] / len, 0], scr: pts.map((q) => project(view, q)) });
  }
  for (const tr of step.objects) {
    if (tr.type !== 'tree' || view.plan) continue;
    const z = zShown(tr);
    const len = Math.hypot(view.cam[0], view.cam[1]) || 1;
    const ex = view.e1[0] * tr.size / 2, ey = view.e1[1] * tr.size / 2;
    const pts = [[tr.x - ex, tr.y - ey, z], [tr.x + ex, tr.y + ey, z], [tr.x + ex, tr.y + ey, z + tr.h], [tr.x - ex, tr.y - ey, z + tr.h]];
    faces.push({ kind: 'tree', obj: tr, z, pts, n: [view.cam[0] / len, view.cam[1] / len, 0], scr: pts.map((q) => project(view, q)) });
  }
  for (const [a, b] of projLines) {
    const w = 0.02;
    const pts = [a, b, [b[0] + view.e1[0] * w, b[1] + view.e1[1] * w, b[2]], [a[0] + view.e1[0] * w, a[1] + view.e1[1] * w, a[2]]];
    const len = Math.hypot(view.cam[0], view.cam[1]) || 1;
    faces.push({ kind: 'pline', seg: [a, b], pts, n: [view.cam[0] / len, view.cam[1] / len, 0], scr: pts.map((q) => project(view, q)) });
  }
  for (const a of step.objects) {
    if (a.type !== 'arrow' || a.layer !== 'ground') continue;
    const ra = { ...a, z: zShown(a), ...(Number.isFinite(a.z2) ? { z2: zShown(a) + a.z2 - a.z } : {}) };
    const g = arrowGeometry(ra);
    const pts2 = convexHull([...g.pts, ...g.heads.flat()].map((p) => [p[0], p[1]]));
    if (pts2.length < 3) continue;
    const pts = pts2.map(([x, y]) => [x, y, ra.z]);
    faces.push({ kind: 'arrow', obj: ra, pts, n: [0, 0, 1], scr: pts.map((q) => project(view, q)) });
  }
  if (sec) {
    // take away what is in front of the plane, then fill what the plane cuts
    for (let i = faces.length - 1; i >= 0; i--) {
      const f = faces[i];
      if (f.kind !== 'face') {
        const mid = f.pts.reduce((a, q) => [a[0] + q[0] / f.pts.length, a[1] + q[1] / f.pts.length, 0], [0, 0, 0]);
        if (sec.side(mid) > 0) faces.splice(i, 1);
        continue;
      }
      if (!f.rings.some((r) => r.some((q) => sec.side(q) > 1e-9))) continue;
      const rings = f.rings.map((r) => clipRing(r, sec.side)).filter((r) => r.length >= 3);
      if (!rings.length) { faces.splice(i, 1); continue; }
      const lines = (f.lines || []).map((l) => clipRing(l, sec.side).slice(0, 2)).filter((l) => l.length === 2);
      faces[i] = { ...f, rings, pts: rings[0], scr: rings[0].map((q) => project(view, q)), lines, smooth: null, gridMinor: null, gridMajor: null, split: false };
    }
    for (const [key, segs] of sec.segs) {
      for (const loop of chainLoops(segs)) {
        faces.push({ kind: 'cap', obj: key === '~site' ? null : byId.get(key), pts: loop, n: sec.nH.slice(), scr: loop.map((q) => project(view, q)) });
      }
    }
  }
  const ordered = sortFaces(faces, view);
  // over a block of earth the flat areas are drawn right after the top they lie on (the top of the block
  // would cover them in the ground layer), clipped to it — a top may come in several parts
  const onTops = ground.slab && !isElevation(view) && view.cam[2] > 0 ? step.objects.filter((o) => o.type === 'area') : [];
  const areasOver = (f, d) => {
    if (!onTops.length || !f.ground || !(f.n[2] > 0.999)) return '';
    let out = '';
    for (const ar of onTops) {
      const z = zShown(ar);
      if (Math.abs(z - f.pts[0][2]) > 0.01) continue;
      const id = `lx-c${++clipUid}`;
      out += `<clipPath id="${id}"><path d="${d}" clip-rule="evenodd"/></clipPath><g clip-path="url(#${id})">${areaMarkup(view, ar, z, style, lw, idAttr(ar))}</g>`;
    }
    return out;
  };

  let model = '';
  for (const f of ordered) {
    const o = f.obj;
    if (f.kind === 'person') {
      model += personMarkup(view, o, f.z, style, idAttr(o));
      bbox = bboxUnion(bbox, personBounds(view, o, f.z));
      continue;
    }
    if (f.kind === 'opening') {
      // a door is dark, a window and a round opening are glass, an arch is a dark way through
      const glass = o.kind === 'window' || o.kind === 'oculus';
      model += `<g${idAttr(o)} class="ax-opening"><path d="${ptsPath(f.scr)}" fill="${glass ? shade(style.blue || '#8fb4d9', 0.35) : shade(style.edge, 0.25)}" fill-opacity="${glass ? 0.85 : 0.82}" stroke="${style.edge}" stroke-width="${r3(lw * 0.8)}" stroke-linejoin="round"/>`
        + (f.lines.length ? `<path d="${f.lines.map((l) => linePath(l.map((q) => project(view, q)))).join('')}" fill="none" stroke="${style.edge}" stroke-width="${r3(lw * 0.5)}"/>` : '') + '</g>';
      bbox = bboxUnion(bbox, bboxOf(f.scr));
      continue;
    }
    if (f.kind === 'tree') {
      model += treeMarkup(view, o, f.z, style, lw, idAttr(o));
      bbox = bboxUnion(bbox, treeBounds(view, o, f.z));
      continue;
    }
    if (f.kind === 'cap') {
      // what the section plane cuts: filled dark, as in a section drawing
      model += `<path class="ax-cap"${idAttr(o)} d="${ptsPath(f.scr)}" fill="${o ? style.edge : shade(style.ground, -0.45)}" fill-opacity="${o ? 0.88 : 0.75}" stroke="${style.edge}" stroke-width="${r3(lw * 1.3)}" stroke-linejoin="round"/>`;
      bbox = bboxUnion(bbox, bboxOf(f.scr));
      continue;
    }
    if (f.kind === 'pline') {
      model += `<path d="${linePath(f.seg.map((q) => project(view, q)))}" fill="none" stroke="${style.edge}" stroke-opacity="0.7" stroke-width="${r3(lw * 0.7)}" stroke-dasharray="${r3(lw * 4)} ${r3(lw * 3)}" pointer-events="none"/>`;
      continue;
    }
    if (f.kind === 'arrow') {
      model += arrowMarkup(view, o, style, prj.categories, idAttr(o), ids);
      bbox = bboxUnion(bbox, arrowBounds(view, o));
      continue;
    }
    if (f.kind === 'sphere') {
      model += sphereMarkup(view, f.sphere, f.fill, style, lw, idAttr(o), o.state === 'ghost', o.state === 'glass');
      const [cx, cy] = project(view, f.sphere.centre);
      bbox = bboxUnion(bbox, [cx - f.sphere.r, cy - f.sphere.r, cx + f.sphere.r, cy + f.sphere.r]);
      continue;
    }
    const d = f.rings.map((ring) => ptsPath(ring.map((p) => project(view, p)))).join('');
    if (f.mesh) {
      // see-through terrain: an invisible fill that still answers the mouse (shown on hover and when
      // selected), light edges, and the grid on the surface
      const outline = f.split
        ? f.pts.map((p, i) => (f.edges[i] ? [p, f.pts[(i + 1) % f.pts.length]] : null)).filter(Boolean).map((l) => linePath(l.map((q) => project(view, q)))).join('')
        : d;
      model += `<path${idAttr(o)}${ids && f.n[2] > 0.999 ? ` data-top="${r3(f.pts[0][2])}"` : ''} class="ax-terrain" d="${d}" fill="${f.fill}" fill-opacity="0" fill-rule="evenodd" stroke="none"/>`;
      const seg = (list) => list.map((l) => linePath(l.map((p) => project(view, p)))).join('');
      if (f.gridMinor?.length) model += `<path d="${seg(f.gridMinor)}" fill="none" stroke="${style.grid}" stroke-width="${r3(lw * 0.5)}" pointer-events="none"/>`;
      if (f.gridMajor?.length) model += `<path d="${seg(f.gridMajor)}" fill="none" stroke="${shade(style.grid, 0.08)}" stroke-width="${r3(lw * 0.9)}" pointer-events="none"/>`;
      if (outline) model += `<path d="${outline}" fill="none" stroke="${style.site}" stroke-opacity="0.75" stroke-width="${r3(lw * 0.8)}" stroke-linejoin="round" pointer-events="none"/>`;
      model += areasOver(f, d);
      bbox = bboxUnion(bbox, bboxOf(f.scr));
      continue;
    }
    const ghost = o?.state === 'ghost';
    const edgeColor = o?.state === 'context' ? ctxEdge : style.edge;
    const glass = o?.state === 'glass';
    const smooth = f.smooth && !ghost;
    const fill = ghost ? 'none' : f.fill;
    const edgeW = f.ground ? lw * 0.8 : lw;
    // smooth faces have no outline of their own (the curved surface reads as one); a thin stroke of the
    // fill colour closes the hairline gaps between them
    const stroke = smooth ? `stroke="${f.fill}" stroke-width="${r3(lw * 0.6)}"` : `stroke="${edgeColor}" stroke-width="${r3(ghost ? lw * 0.9 : edgeW)}"`;
    const extra = ghost ? ` stroke-dasharray="${r3(lw * 4)} ${r3(lw * 3)}"${ids ? ' pointer-events="all"' : ''}` : glass ? ' fill-opacity="0.38"' : '';
    const top = ids && f.n[2] > 0.999 ? ` data-top="${r3(f.pts[0][2])}"` : '';
    if (ghost && f.smooth) {
      // a ghost curved surface: only its rims and silhouette, dashed
      const lines = [...f.smooth.rim, ...f.smooth.seams.filter((s) => (dot(s.n, view.cam) > 0) !== (dot(f.n, view.cam) > 0)).map((s) => s.edge)];
      model += `<path${idAttr(o)} d="${d}" fill="none" stroke="none"${ids ? ' pointer-events="all"' : ''}/>`;
      model += `<path d="${lines.map((l) => linePath(l.map((p) => project(view, p)))).join('')}" fill="none" stroke="${edgeColor}" stroke-width="${r3(lw * 0.9)}" stroke-dasharray="${r3(lw * 4)} ${r3(lw * 3)}" pointer-events="none"/>`;
    } else if (f.split && !smooth) {
      // a part of a face cut for the order: filled (a hairline of its own colour closes the seams), and only
      // the edges that are real edges of the shape are drawn
      const seam = ghost ? 'stroke="none"' : `stroke="${f.fill}" stroke-width="${r3(lw * 0.6)}"`;
      model += `<path${idAttr(o)}${top} d="${d}" fill="${fill}" ${seam} stroke-linejoin="round"${ghost ? (ids ? ' pointer-events="all"' : '') : glass ? ' fill-opacity="0.38"' : ''}/>`;
      const segs = [];
      f.pts.forEach((p, i) => { if (f.edges[i]) segs.push([p, f.pts[(i + 1) % f.pts.length]]); });
      if (segs.length) {
        model += `<path d="${segs.map((l) => linePath(l.map((q) => project(view, q)))).join('')}" fill="none" stroke="${edgeColor}" stroke-width="${r3(ghost ? lw * 0.9 : edgeW)}" stroke-linecap="round"${ghost ? ` stroke-dasharray="${r3(lw * 4)} ${r3(lw * 3)}"` : ''} pointer-events="none"/>`;
      }
    } else {
      model += `<path${idAttr(o)}${top} d="${d}" fill="${fill}" fill-rule="evenodd" ${stroke} stroke-linejoin="round"${extra}/>`;
    }
    if (!ghost && o?.type === 'volume' && o.state !== 'accent' && o.state !== 'context' && !o.color && !f.ownFill && hatchOf.has(o.cat)) {
      const k = hatchOf.get(o.cat);
      hatchUsed.add(k);
      model += `<path d="${d}" fill="url(#lx-h${k}-${uid})" fill-rule="evenodd" stroke="none" pointer-events="none"/>`;
    }
    if (smooth) {
      const lines = [...f.smooth.rim, ...f.smooth.seams.filter((s) => dot(s.n, view.cam) <= 1e-9).map((s) => s.edge)];
      if (lines.length) model += `<path d="${lines.map((l) => linePath(l.map((p) => project(view, p)))).join('')}" fill="none" stroke="${edgeColor}" stroke-width="${r3(lw)}" stroke-linecap="round" pointer-events="none"/>`;
    }
    if (f.lines?.length && !ghost) {
      model += `<path d="${f.lines.map((l) => linePath(l.map((p) => project(view, p)))).join('')}" fill="none" stroke="${edgeColor}" stroke-width="${r3(lw * 0.6)}" pointer-events="none"/>`;
    }
    model += areasOver(f, d);
    bbox = bboxUnion(bbox, bboxOf(f.scr));
  }

  let top = '';
  for (const o of step.objects) {
    if (o.type === 'arrow' && o.layer !== 'ground') {
      const ra = { ...o, z: zShown(o), ...(Number.isFinite(o.z2) ? { z2: zShown(o) + o.z2 - o.z } : {}) };
      top += arrowMarkup(view, ra, style, prj.categories, idAttr(o), ids);
      bbox = bboxUnion(bbox, arrowBounds(view, ra));
    } else if (o.type === 'person' && view.plan) {
      const z = zShown(o);
      top += personMarkup(view, o, z, style, idAttr(o));
      bbox = bboxUnion(bbox, personBounds(view, o, z));
    } else if (o.type === 'tree' && view.plan) {
      const z = zShown(o);
      top += treeMarkup(view, o, z, style, lw, idAttr(o));
      bbox = bboxUnion(bbox, treeBounds(view, o, z));
    } else if (o.type === 'dim' && !isElevation(view)) {
      const rd = { ...o, z: zShown(o) }, size = dimTextSize(prj.site);
      top += dimMarkup(view, rd, style, lw, size, o2.fmt, idAttr(o), ids);
      bbox = bboxUnion(bbox, dimBounds(view, rd, size));
    }
  }
  if (opts.showCuts) {
    for (const c of cutObjects) {
      const z0 = c.z + (exploded.get(c.id) || 0), z1 = z0 + Math.min(c.h, 500);
      const ring = footprintOf({ ...c, shape: c.shape === 'sphere' ? 'cylinder' : c.shape });
      const lo = ring.map(([x, y]) => project(view, [x, y, z0]));
      let d = ptsPath(lo);
      if (isTrapezoid(c)) {
        // the outline of each face of the trapezoid
        d = trapezoidFaces({ ...c, floors: 1 }, z0).filter((f) => f.role !== 'bottom').map((f) => ptsPath(f.rings[0].map((q) => project(view, q)))).join('') + d;
      } else if (c.shape === 'cone' || c.shape === 'pyramid') {
        // the outline at the base and the lines up to the point
        const apex = project(view, [c.x, c.y, z1]);
        for (let i = 0; i < lo.length; i += Math.max(1, Math.round(lo.length / 4))) d += `M${r3(lo[i][0])} ${r3(lo[i][1])}L${r3(apex[0])} ${r3(apex[1])}`;
      } else if (c.shape === 'sphere') {
        const [cx, cy] = project(view, [c.x, c.y, (z0 + z1) / 2]);
        const r = c.w / 2;
        d = `M${r3(cx - r)} ${r3(cy)}A${r3(r)} ${r3(r)} 0 1 0 ${r3(cx + r)} ${r3(cy)}A${r3(r)} ${r3(r)} 0 1 0 ${r3(cx - r)} ${r3(cy)}Z`;
      } else {
        const hi = ring.map(([x, y]) => project(view, [x, y, z1]));
        d += ptsPath(hi);
        const every = ring.length > 12 ? Math.round(ring.length / 4) : 1;
        for (let i = 0; i < ring.length; i += every) d += `M${r3(lo[i][0])} ${r3(lo[i][1])}L${r3(hi[i][0])} ${r3(hi[i][1])}`;
      }
      top += `<path${idAttr(c)} class="ax-cut" d="${d}" fill="rgba(214,64,90,0.06)" stroke="#d6405a" stroke-width="${r3(lw * 0.9)}" stroke-dasharray="${r3(lw * 3)} ${r3(lw * 2)}"/>`;
    }
  }
  if (opts.levelPlane) {
    const lv = levels.find((l) => l.id === opts.levelPlane);
    if (lv && Math.abs(lv.z) > EPS) {
      const ring = siteRing(prj.site, lv.z).map((p) => project(view, p));
      top += `<path class="ax-level" d="${ptsPath(ring)}" fill="rgba(47,116,232,0.04)" stroke="#2f74e8" stroke-opacity="0.7" stroke-width="${r3(lw * 0.9)}" stroke-dasharray="${r3(lw * 6)} ${r3(lw * 4)}" pointer-events="none"/>`;
      const size = dimTextSize(prj.site) * 0.9;
      const at = ring.reduce((a, b) => (b[0] < a[0] ? b : a));
      top += `<text x="${r3(at[0] - size * 0.6)}" y="${r3(at[1])}" font-family="${FONT}" font-size="${r3(size)}" font-weight="600" fill="#2f74e8" text-anchor="end" dominant-baseline="central" pointer-events="none">${esc(`${lv.name ? lv.name + ' ' : ''}${formatElevation(lv.z, opts.fmtNum)}`)}</text>`;
    }
  }
  for (const o of step.objects) {
    if (o.type !== 'label' || !o.text || opts.labels === false) continue;
    const ro = { ...o, z: zShown(o) };
    top += labelMarkup(view, ro, style, idAttr(o));
    bbox = bboxUnion(bbox, labelBounds(view, ro));
  }

  let groundMarkupStr = groundMarkup(view, prj, style, { ...o2, grid: o2.grid || mesh, gridSiteOnly: mesh && !opts.grid, meshHoles: mesh ? meshHoles : null }, ground.slab, ground.bottom);
  if (!isElevation(view) && view.cam[2] > 0) {
    let under = '';
    // the image under everything (the editor always shows it; the sheet when asked)
    if (prj.underlay && (opts.editor || prj.underlay.sheet)) under += underlayMarkup(view, prj.underlay);
    let flat = '';
    for (const o of step.objects) {
      if (o.type !== 'area' || ground.slab) continue;
      flat += areaMarkup(view, o, zShown(o), style, lw, idAttr(o));
      bbox = bboxUnion(bbox, bboxOf(rectRing(o.x, o.y, o.w, o.d, o.rot).map(([x, y]) => project(view, [x, y, zShown(o)]))));
    }
    // the shadows on the ground, as one shape
    const k = shadowVector(prj);
    if (k) {
      const parts = [];
      for (const v of step.objects) {
        if (v.type !== 'volume' || v.state === 'ghost' || v.state === 'glass') continue;
        const vb = baseOf(v, byId, levels);
        const sh = shadowOf(v, vb + (exploded.get(v.id) || 0), cutsTaking(v, vb, cutObjects, cuts), k);
        if (sh.length) parts.push(sh);
      }
      // kept near the site: a low sun would otherwise stretch the drawing far beyond it
      const m = Math.max(prj.site.w, prj.site.d) * 0.2;
      const near = [[[[-m, -m], [prj.site.w + m, -m], [prj.site.w + m, prj.site.d + m], [-m, prj.site.d + m]]]];
      const all = parts.length ? intersection(union(...parts), near) : [];
      const d = all.map((poly) => poly.map((ring) => ptsPath(ring.map(([x, y]) => project(view, [x, y, 0])))).join('')).join('');
      if (d) {
        flat += `<path class="ax-shadow" d="${d}" fill="#1c2430" fill-opacity="${prj.sun.opacity}" fill-rule="evenodd" stroke="none" pointer-events="none"/>`;
        for (const poly of all) bbox = bboxUnion(bbox, bboxOf(poly[0].map(([x, y]) => project(view, [x, y, 0]))));
      }
    }
    groundMarkupStr = under + groundMarkupStr + flat;
  }
  const tile = Math.max(0.6, Math.min(prj.site.w, prj.site.d) / 28);
  const defs = hatchUsed.size ? `<defs>${[...hatchUsed].map((k) => hatchPattern(`lx-h${k}-${uid}`, k, tile, Math.max(lw * 0.7, tile * 0.05), style.edge)).join('')}</defs>` : '';
  const markup = `${defs}<g class="ax-ground">${groundMarkupStr}</g><g class="ax-model">${model}</g><g class="ax-top">${top}</g>`;
  if (!bbox) bbox = bboxOf(siteRingScr()); // nothing drawn: the site still frames the drawing
  return { markup, bbox, sectionDepth: sec?.depth ?? null, highlighted: [...changed].filter((id) => byId.get(id)?.state === 'normal' && !byId.get(id)?.cat) };
}

/** Pads a bounding box by a fraction of its size. */
export function padBox(b, k = 0.06) {
  const w = b[2] - b[0], h = b[3] - b[1];
  const p = Math.max(w, h) * k;
  return [b[0] - p, b[1] - p, b[2] + p, b[3] + p];
}

/**
 * A whole standalone SVG of one step (thumbnails, "export this step"). With `views` (several angles) the
 * drawings sit side by side, at the same scale.
 */
export function stepSvg(prj, index, { view, views, width = 800, background = true, fmt, fontCss, terrainGrid = !!prj.sheet?.terrainGrid } = {}) {
  const list = views?.length ? views : [view];
  const boxes = list.map((v) => padBox(renderStep(prj, index, { view: v, lw: 0.1, fmt, terrainGrid }).bbox));
  const gap = Math.max(...boxes.map((b) => b[2] - b[0])) * 0.06;
  const total = boxes.reduce((a, b) => a + b[2] - b[0], 0) + gap * (list.length - 1);
  const bh = Math.max(...boxes.map((b) => b[3] - b[1]));
  const lw = (total / width) * 1.1;
  const style = getStyle(prj.style);
  const height = Math.round((width * bh) / total);
  let x = 0, body = '';
  list.forEach((v, j) => {
    const b = boxes[j], w = b[2] - b[0], hh = b[3] - b[1];
    const { markup } = renderStep(prj, index, { view: v, lw, fmt, terrainGrid });
    body += list.length === 1 ? markup
      : `<svg x="${r3(x)}" y="${r3((bh - hh) / 2)}" width="${r3(w)}" height="${r3(hh)}" viewBox="${r3(b[0])} ${r3(b[1])} ${r3(w)} ${r3(hh)}" overflow="visible">${markup}</svg>`;
    x += w + gap;
  });
  const vb = list.length === 1 ? [boxes[0][0], boxes[0][1], total, bh] : [0, 0, total, bh];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.map(r3).join(' ')}" width="${width}" height="${height}">`
    + (fontCss ? `<defs><style>${fontCss}</style></defs>` : '')
    + (background ? `<rect x="${r3(vb[0])}" y="${r3(vb[1])}" width="${r3(vb[2])}" height="${r3(vb[3])}" fill="${style.paper}"/>` : '')
    + body + '</svg>';
}

/** The views of the angles a step is seen from (see stepAngles). */
export const stepViews = (prj, step) => stepAngles(prj, step).map((a) => makeView(a.az, a.el));

export { heightOf };

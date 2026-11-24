/*---------------------------------------------------------------------------------------------
 *  LionAxon — Copyright (C) 2026 LionAxon Team.
 *  Created and conceived by Daniel Michelon De Carli.
 *  Licensed under the GNU General Public License v3.0 or later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/
// The project model (pure data, no DOM): a site, categories and a list of steps. Each step holds the
// whole scene; an object keeps the same id from one step to the next, so the app knows what changed.
//
// Reference planes (levels) are named elevations shared by every step: { id, name, z }. Changing the
// elevation of a level moves everything that belongs to it.
//
// Objects (all measures in metres, angles in degrees; `z` is measured from the object's level):
//   volume   { x, y (centre), w, d, h, rot, z, level, on (id of the volume it sits on, or null), floors, cat, state,
//              shape ('box' | 'cylinder' | 'sphere' | 'cone' | 'pyramid' | 'trapezoid' | 'trapezoidLying' | 'poly');
//              a trapezoid has `top`: the width of its top (standing) or of its short side at the back (lying) }
//   (a cut has the same shapes: a box, a cylinder, a cone or pyramid pointing up, a sphere, the trapezoids)
//   cut      { x, y, w, d, rot, z, h, level, target (volume id, '~terrain' = the terrain, or null = every volume it touches) }
//   platform { x, y, w, d, rot, z, level }            a piece of ground raised (or sunk) to its level
//   slope    { x, y, w, d, rot, from, zFrom, to, zTo } a ramp of ground rising along its depth, from one level to another
//   arrow    { x1, y1, x2, y2, z, level, bend, color, dashed, heads, width, layer ('top' | 'ground') }
//   person   { x, y, z, level, pose (0 standing, 1 walking, 2 pointing, 3 wheelchair) }
//   label    { x, y, z, level, dx, dy, text, size, font, caps, note?, mark?, wrap? }
//   area     { x, y, w, d, rot, z, level, kind ('street' | 'green' | 'water' | 'paving') }   a flat piece of the surroundings
//   tree     { x, y, z, level, size (crown diameter), h, kind ('round' | 'conifer') }
//   dim      { x1, y1, x2, y2, z, level, offset }   a dimension line between two points
// A volume or a cut with shape 'poly' has `pts`: its outline as [x, y] points around (x, y), before `rot`.
// A box volume may have a roof: roof ('flat' | 'gable' | 'shed' | 'hip') and roofH (its height).
// Any object may also have: name (given by the person), locked: true, hidden: true.

export const FORMAT = 'lionaxon';
export const SCHEMA_VERSION = 2;

export const VOLUME_STATES = ['normal', 'accent', 'ghost', 'glass', 'context'];
export const SHAPES = ['box', 'cylinder', 'sphere', 'cone', 'pyramid', 'trapezoid', 'trapezoidLying', 'poly'];
/** Roofs a box volume may carry on top (its height is `roofH`). */
export const ROOFS = ['flat', 'gable', 'shed', 'hip'];
/** Flat pieces of ground that give the surroundings: streets, lawns, water, paving. */
export const AREA_KINDS = ['street', 'green', 'water', 'paving'];
export const TREE_KINDS = ['round', 'conifer'];
/** Signs drawn on the sheet between a step and the one before it. */
export const STEP_OPS = ['', '+', '−', '=', '→'];
/** Objects that are a line between two points (x1, y1) → (x2, y2). */
export const isLine = (o) => o.type === 'arrow' || o.type === 'dim';
/** Ridge of a gable or shed roof: along the longer side ('auto'), along the width ('w') or along the depth ('d'). */
export const ROOF_DIRS = ['auto', 'w', 'd'];
/** What is drawn on a wall of a box: a door, a window, an arched opening or a round one. */
export const OPENING_KINDS = ['door', 'window', 'arch', 'oculus'];
/** The four walls of a box, in its own frame: front (−depth), right (+width), back (+depth), left (−width). */
export const OPENING_SIDES = ['front', 'right', 'back', 'left'];
/** A mark drawn at the point of a label: a warning, a refusal, a gain, a loss. */
export const LABEL_MARKS = ['', '!', '×', '+', '−'];
/** Where the legend of the sheet goes: a column under the title, or a row along the foot. */
export const LEGEND_PLACES = ['top', 'bottom', 'free'];
/** A colour written as #rgb or #rrggbb (else null). */
export const hexColor = (v) => (typeof v === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v.trim()) ? v.trim().toLowerCase() : null);
export const LABEL_FONT_IDS = ['sans', 'condensed', 'serif', 'mono', 'hand'];
export const NORTH_PLACES = ['header', 'drawing', 'none'];
export const GROUND_LEVEL = 'L0';
/** The target of a subtraction of the terrain (the site's slab and the platforms), instead of a volume id. */
export const TERRAIN_TARGET = '~terrain';
export const ARROW_COLORS = ['ink', 'accent', 'green', 'blue', 'red'];
export const PAPERS = { A4: [297, 210], A3: [420, 297], A2: [594, 420], A1: [841, 594], A0: [1189, 841] };
export const LAYOUTS = ['row', 'grid', 'column', 'vertical'];
/** Scales a sheet can be drawn at (1:n); 0 = fit the paper. */
export const SHEET_SCALES = [0, 100, 200, 250, 500, 750, 1000, 1250, 2000, 2500, 5000];

let counter = 0;
export function newId(prefix) {
  counter = (counter + 1) % 1296;
  return `${prefix}${Date.now().toString(36).slice(-5)}${counter.toString(36).padStart(2, '0')}${Math.random().toString(36).slice(2, 4)}`;
}

const num = (v, def, min = -Infinity, max = Infinity) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};
const str = (v, def = '') => (typeof v === 'string' ? v : def);
const pick = (v, list, def) => (list.includes(v) ? v : def);

export function createVolume(p = {}) {
  return normalizeObject({ type: 'volume', id: newId('v'), x: 0, y: 0, w: 10, d: 10, h: 3, rot: 0, z: 0, level: null, on: null, floors: 1, cat: null, state: 'normal', shape: 'box', ...p });
}
export const createCut = (p = {}) => normalizeObject({ type: 'cut', id: newId('c'), x: 0, y: 0, w: 4, d: 4, h: 6, rot: 0, z: 0, level: null, target: null, shape: 'box', ...p });
export const createPlatform = (p = {}) => normalizeObject({ type: 'platform', id: newId('g'), x: 0, y: 0, w: 10, d: 10, rot: 0, z: 0, level: null, ...p });
export const createSlope = (p = {}) => normalizeObject({ type: 'slope', id: newId('r'), x: 0, y: 0, w: 10, d: 10, rot: 0, from: null, zFrom: 0, to: null, zTo: 2, ...p });
export const createArrow = (p = {}) => normalizeObject({ type: 'arrow', id: newId('a'), x1: 0, y1: 0, x2: 10, y2: 0, z: 0, level: null, bend: 0, color: 'ink', dashed: false, heads: 1, width: 0.3, layer: 'top', ...p });
export const createPerson = (p = {}) => normalizeObject({ type: 'person', id: newId('p'), x: 0, y: 0, z: 0, level: null, pose: 0, ...p });
export const createLabel = (p = {}) => normalizeObject({ type: 'label', id: newId('l'), x: 0, y: 0, z: 0, level: null, dx: 6, dy: -6, text: '', size: 1.6, font: 'sans', caps: true, ...p });

export const createOpening = (p = {}) => normalizeObject({ type: 'opening', id: newId('o'), on: null, side: 'front', kind: 'door', u: 0, z: 0, w: 1.2, h: 2.4, ...p });

export const createArea = (p = {}) => normalizeObject({ type: 'area', id: newId('e'), x: 0, y: 0, w: 10, d: 10, rot: 0, z: 0, level: null, kind: 'street', ...p });
export const createTree = (p = {}) => normalizeObject({ type: 'tree', id: newId('t'), x: 0, y: 0, z: 0, level: null, size: 4, h: 6, kind: 'round', ...p });
export const createDim = (p = {}) => normalizeObject({ type: 'dim', id: newId('d'), x1: 0, y1: 0, x2: 10, y2: 0, z: 0, level: null, offset: 1.5, ...p });

/** A clean outline: at least three points, as numbers. */
function normalizePts(pts) {
  const out = (Array.isArray(pts) ? pts : []).filter((q) => Array.isArray(q) && Number.isFinite(Number(q[0])) && Number.isFinite(Number(q[1]))).slice(0, 200).map((q) => [r3m(Number(q[0])), r3m(Number(q[1]))]);
  return out.length >= 3 ? out : null;
}
const r3m = (v) => Math.round(v * 1000) / 1000;

/**
 * A polygon given by its points in the world: the object fields that hold it — its centre (the middle of
 * its bounds, measured along its own axes), its points around that centre and the size of its bounds.
 */
export function polyFromWorld(world, rot = 0) {
  const a = (rot * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a);
  const local = world.map(([x, y]) => [x * c + y * sn, -x * sn + y * c]);
  const xs = local.map((q) => q[0]), ys = local.map((q) => q[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  return {
    x: r3m(cx * c - cy * sn), y: r3m(cx * sn + cy * c),
    w: r3m(Math.max(0.1, Math.max(...xs) - Math.min(...xs))), d: r3m(Math.max(0.1, Math.max(...ys) - Math.min(...ys))),
    pts: local.map(([x, y]) => [r3m(x - cx), r3m(y - cy)]),
  };
}

/** The points of a polygonal object in the world. */
export function polyWorld(o) {
  const a = ((o.rot || 0) * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a);
  return o.pts.map(([x, y]) => [o.x + x * c - y * sn, o.y + x * sn + y * c]);
}

/** A polygonal shape keeps its points; its width and depth are those of its bounds. Without points it is a box. */
function polyFix(v, raw) {
  if (v.shape !== 'poly') return v;
  const pts = normalizePts(raw.pts);
  if (!pts) { v.shape = 'box'; return v; }
  const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
  v.pts = pts;
  v.w = r3m(Math.max(0.1, Math.max(...xs) - Math.min(...xs)));
  v.d = r3m(Math.max(0.1, Math.max(...ys) - Math.min(...ys)));
  return v;
}

/** Fields any object may carry besides its own: a name given by the person, locked (not picked or moved in the drawing), hidden (not drawn). */
export const EXTRA_KEYS = ['name', 'locked', 'hidden'];

/** Cleans one object read from a file (or built by a tool): unknown types are dropped, every field gets a valid value. */
export function normalizeObject(o) {
  const out = normalizeCore(o);
  if (!out) return null;
  // kept only when set, so files stay as lean as before
  const name = str(o.name).trim().slice(0, 80);
  if (name) out.name = name;
  if (o.locked === true) out.locked = true;
  if (o.hidden === true) out.hidden = true;
  return out;
}

function normalizeCore(o) {
  if (!o || typeof o !== 'object') return null;
  const id = str(o.id) || newId(String(o.type || 'x')[0]);
  const level = str(o.level) || null;
  switch (o.type) {
    case 'volume': {
      const v = trapezoidFix(polyFix(sphereFix({
        type: 'volume', id, x: num(o.x, 0), y: num(o.y, 0), w: num(o.w, 10, 0.1), d: num(o.d, 10, 0.1), h: num(o.h, 3, 0.1),
        rot: num(o.rot, 0) % 360, z: num(o.z, 0), level, on: str(o.on) || null, floors: Math.round(num(o.floors, 1, 1, 200)),
        cat: str(o.cat) || null, state: pick(o.state, VOLUME_STATES, 'normal'), shape: pick(o.shape, SHAPES, 'box'),
      }), o), o);
      // a roof, kept only when there is one (boxes only)
      if (v.shape === 'box' && ROOFS.includes(o.roof) && o.roof !== 'flat') {
        v.roof = o.roof; v.roofH = num(o.roofH, 3, 0.1, 200);
        if (o.roofDir === 'w' || o.roofDir === 'd') v.roofDir = o.roofDir;
        if (hexColor(o.roofColor)) v.roofColor = hexColor(o.roofColor);
      }
      // a colour of its own (kept out of the legend), instead of the one of the style or of the category
      if (hexColor(o.color)) v.color = hexColor(o.color);
      // a volume that fills the void of a cut (all of it or part of it): no cut takes anything out of it
      if (o.fill === true) v.fill = true;
      return v;
    }
    case 'cut': return trapezoidFix(polyFix(sphereFix({
      type: 'cut', id, x: num(o.x, 0), y: num(o.y, 0), w: num(o.w, 4, 0.1), d: num(o.d, 4, 0.1), h: num(o.h, 6, 0.1, 1000),
      rot: num(o.rot, 0) % 360, z: num(o.z, 0), level, target: str(o.target) || null, shape: pick(o.shape, SHAPES, 'box'),
    }), o), o);
    case 'area': {
      const a = {
        type: 'area', id, x: num(o.x, 0), y: num(o.y, 0), w: num(o.w, 10, 0.1), d: num(o.d, 10, 0.1), rot: num(o.rot, 0) % 360, z: num(o.z, 0), level,
        kind: pick(o.kind, AREA_KINDS, 'street'),
      };
      // joints of a paved floor, every so many metres (0: none)
      if (num(o.joints, 0, 0, 100) > 0) a.joints = num(o.joints, 0, 0.2, 100);
      return a;
    }
    // drawn on a wall of the box `on`: `u` along the wall from its middle, `z` above the base of the box
    case 'opening': return {
      type: 'opening', id, on: str(o.on) || null, side: pick(o.side, OPENING_SIDES, 'front'), kind: pick(o.kind, OPENING_KINDS, 'door'),
      u: num(o.u, 0), z: num(o.z, 0, 0), w: num(o.w, 1.2, 0.1, 200), h: num(o.h, 2.4, 0.1, 200),
    };
    case 'tree': return { type: 'tree', id, x: num(o.x, 0), y: num(o.y, 0), z: num(o.z, 0), level, size: num(o.size, 4, 0.5, 60), h: num(o.h, 6, 1, 120), kind: pick(o.kind, TREE_KINDS, 'round') };
    case 'dim': return { type: 'dim', id, x1: num(o.x1, 0), y1: num(o.y1, 0), x2: num(o.x2, 10), y2: num(o.y2, 0), z: num(o.z, 0), level, offset: num(o.offset, 1.5, -100, 100) };
    case 'platform': return {
      type: 'platform', id, x: num(o.x, 0), y: num(o.y, 0), w: num(o.w, 10, 0.1), d: num(o.d, 10, 0.1),
      rot: num(o.rot, 0) % 360, z: num(o.z, 0), level,
    };
    case 'slope': return {
      type: 'slope', id, x: num(o.x, 0), y: num(o.y, 0), w: num(o.w, 10, 0.1), d: num(o.d, 10, 0.1), rot: num(o.rot, 0) % 360,
      from: str(o.from) || null, zFrom: num(o.zFrom, 0), to: str(o.to) || null, zTo: num(o.zTo, 2),
    };
    case 'arrow': return {
      type: 'arrow', id, x1: num(o.x1, 0), y1: num(o.y1, 0), x2: num(o.x2, 10), y2: num(o.y2, 0), z: num(o.z, 0), level,
      bend: num(o.bend, 0), color: str(o.color, 'ink') || 'ink', dashed: !!o.dashed, heads: o.heads === 2 ? 2 : o.heads === 0 ? 0 : 1,
      width: num(o.width, 0.3, 0.05, 3), layer: o.layer === 'ground' ? 'ground' : 'top',
      // the height where it ends, when it climbs or goes down (else the same as where it starts)
      ...(Number.isFinite(Number(o.z2)) && o.z2 !== null && o.z2 !== '' && Number(o.z2) !== num(o.z, 0) ? { z2: num(o.z2, 0) } : {}),
    };
    case 'person': return { type: 'person', id, x: num(o.x, 0), y: num(o.y, 0), z: num(o.z, 0), level, pose: Math.round(num(o.pose, 0, 0, 3)) };
    case 'label': return {
      type: 'label', id, x: num(o.x, 0), y: num(o.y, 0), z: num(o.z, 0), level, dx: num(o.dx, 6), dy: num(o.dy, -6),
      text: str(o.text), size: num(o.size, 1.6, 0.2, 20), font: pick(o.font, LABEL_FONT_IDS, 'sans'), caps: o.caps !== false,
      // a second, quieter line under the text, and a mark at the point
      ...(str(o.note).trim() ? { note: str(o.note).slice(0, 2000) } : {}),
      ...(LABEL_MARKS.includes(o.mark) && o.mark ? { mark: o.mark } : {}),
      // the width the text is broken to (in drawing units, like its size); none: one line per line typed
      ...(Number(o.wrap) > 0 ? { wrap: num(o.wrap, 0, 1, 1000) } : {}),
      // a text box: no leader and no point, the text where the label is
      ...(o.line === false ? { line: false } : {}),
    };
    default: return null;
  }
}

/**
 * A trapezoid keeps the length of its short parallel side, `top`, no longer than the long one (its width): the
 * top of a standing one, the back of a lying one (the trapezoid of its footprint). Other shapes have none.
 */
function trapezoidFix(v, raw) {
  if (v.shape === 'trapezoid' || v.shape === 'trapezoidLying') v.top = r3m(num(raw.top, v.w / 2, 0, v.w));
  return v;
}

/** After a change in place (a new shape, a new size): the short side of a trapezoid set and kept within its width. */
export function fitTrapezoid(o) {
  if (o.shape !== 'trapezoid' && o.shape !== 'trapezoidLying') delete o.top;
  delete o.h2;
  return trapezoidFix(o, o);
}

/** A sphere is round: its depth is its width (and a spherical cut is as tall as it is wide). */
function sphereFix(v) {
  if (v.shape === 'sphere') { v.d = v.w; if (v.type === 'cut') v.h = v.w; }
  return v;
}

/** Exploded view of a step: the reference planes, the stacked volumes (and, if asked, the floors) pulled apart. */
export const createExplode = (p = {}) => ({ on: false, gap: 4, floors: false, ...p });
const normalizeExplode = (e) => createExplode({ on: !!e?.on, gap: num(e?.gap, 4, 0.5, 100), floors: !!e?.floors });

export function createStep(p = {}) {
  return { id: newId('s'), title: '', text: '', highlight: true, explode: createExplode(), views: [], ghostPrev: false, op: '', objects: [], ...p };
}

/** The isometric elevation of the camera (degrees above the horizon): the three axes keep the same scale. */
export const ISO_EL = 35.2644;
/** How many angles one step may show side by side. */
export const MAX_VIEWS = 4;

/** An angle of view: azimuth (0–360, from east, counter-clockwise) and elevation (-90 below … 90 above). */
export function normalizeAngle(v) {
  const az = Math.round((((num(v?.az, -45) % 360) + 360) % 360) * 100) / 100;
  const el = Math.round(num(v?.el, ISO_EL, -90, 90) * 10000) / 10000;
  return { az, el };
}
const normalizeViews = (list) => (Array.isArray(list) ? list : []).filter((v) => v && typeof v === 'object').slice(0, MAX_VIEWS).map(normalizeAngle);

/**
 * The angles a step is seen from on the sheet, side by side: its own (set in the 3D viewer), or the
 * project's axonometric view.
 */
export function stepAngles(prj, step) {
  return step?.views?.length ? step.views : [normalizeAngle({ az: prj.view.az, el: ISO_EL })];
}

/** The same angle (to a hundredth of a degree)? */
export const sameAngle = (a, b) => Math.abs(((a.az - b.az) % 360 + 540) % 360 - 180) < 0.01 && Math.abs(a.el - b.el) < 0.01;

export function createProject(p = {}) {
  return normalizeProject({
    format: FORMAT, schemaVersion: SCHEMA_VERSION, name: '',
    site: { w: 40, d: 60, mode: 'dashed', dims: true, thickness: 0 }, underlay: null, sun: null,
    levels: [{ id: GROUND_LEVEL, name: '', z: 0 }],
    north: 0, northPlace: 'header', northHalftone: false, grid: 1, style: 'beige', catPatterns: false, view: { az: -45 },
    categories: [],
    steps: [createStep()],
    sheet: { layout: 'row', cols: 0, paper: 'A3', orientation: 'landscape', scale: 0, title: '', subtitle: '', legend: true, texts: true, heads: true },
    ...p,
  });
}

/** Validates and completes a project read from disk. Throws on files that are not LionAxon projects. */
function normalizeSite(site) {
  const out = {
    w: num(site.w, 40, 1, 5000), d: num(site.d, 60, 1, 5000), mode: pick(site.mode, ['dashed', 'fill', 'none'], 'dashed'), dims: site.dims !== false,
    thickness: num(site.thickness, 0, 0, 200),
    // platforms and slopes that touch drawn as one terrain (one outline, no seams between them)
    joined: site.joined === true,
  };
  // a site of any outline: its points in metres; width and depth are then those of its bounds, from (0, 0)
  const pts = normalizePts(site.pts);
  if (pts) {
    const x0 = Math.min(...pts.map((q) => q[0])), y0 = Math.min(...pts.map((q) => q[1]));
    out.pts = pts.map(([x, y]) => [r3m(x - x0), r3m(y - y0)]);
    out.w = Math.max(1, Math.max(...out.pts.map((q) => q[0])));
    out.d = Math.max(1, Math.max(...out.pts.map((q) => q[1])));
  }
  return out;
}

/** The outline of the site on the ground: its points, or the rectangle. */
export const siteOutline = (site) => site.pts || [[0, 0], [site.w, 0], [site.w, site.d], [0, site.d]];

function normalizeUnderlay(u) {
  if (!u || typeof u !== 'object' || typeof u.src !== 'string' || !/^data:image\/(png|jpeg|webp);base64,/.test(u.src)) return null;
  return {
    src: u.src, x: num(u.x, 0), y: num(u.y, 0), w: num(u.w, 40, 0.5, 20000), h: num(u.h, 40, 0.5, 20000), rot: num(u.rot, 0) % 360,
    opacity: num(u.opacity, 0.6, 0.05, 1), sheet: !!u.sheet,
  };
}

function normalizeSun(sun) {
  return {
    on: !!sun?.on, lat: num(sun?.lat, -30, -89, 89), month: Math.round(num(sun?.month, 6, 1, 12)), day: Math.round(num(sun?.day, 21, 1, 31)),
    hour: num(sun?.hour, 15, 0, 24), opacity: num(sun?.opacity, 0.2, 0.05, 0.8),
  };
}

/**
 * Where the sun is: its altitude above the horizon and its azimuth, in degrees (azimuth from north,
 * clockwise: 90 = east), for a latitude, a day of the year and the solar hour (12 = noon).
 */
export function sunPosition({ lat, month, day, hour }) {
  const rad = Math.PI / 180;
  const n = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334][month - 1] + day;
  const decl = 23.44 * rad * Math.sin(((2 * Math.PI) / 365) * (284 + n));
  const H = 15 * (hour - 12) * rad, phi = lat * rad;
  const sinAlt = Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(H);
  const altitude = Math.asin(Math.max(-1, Math.min(1, sinAlt)));
  const azimuth = Math.atan2(-Math.sin(H) * Math.cos(decl), Math.sin(decl) * Math.cos(phi) - Math.cos(decl) * Math.sin(phi) * Math.cos(H));
  return { altitude: altitude / rad, azimuth: ((azimuth / rad) + 360) % 360 };
}

/**
 * How far, on the ground, the shadow of a point one metre up falls: [dx, dy] in the axes of the project
 * (its north turned by `north` degrees). Null when the sun is down (or almost).
 */
export function shadowVector(prj) {
  if (!prj.sun?.on) return null;
  const { altitude, azimuth } = sunPosition(prj.sun);
  if (altitude < 2) return null;
  const rad = Math.PI / 180, a = prj.north * rad, az = azimuth * rad;
  const north = [-Math.sin(a), Math.cos(a)], east = [Math.cos(a), Math.sin(a)];
  const toSun = [Math.cos(az) * north[0] + Math.sin(az) * east[0], Math.cos(az) * north[1] + Math.sin(az) * east[1]];
  const k = 1 / Math.tan(altitude * rad);
  return [-toSun[0] * k, -toSun[1] * k];
}

/** Style names of files written before 0.8 (they were in Portuguese). */
const STYLE_ALIASES = { bege: 'beige', gramado: 'lawn', azul: 'blue', algodao: 'cotton', menta: 'mint', lavanda: 'lavender', pessego: 'peach', ceu: 'sky' };

export function normalizeProject(raw) {
  if (!raw || typeof raw !== 'object' || (raw.format && raw.format !== FORMAT)) throw new Error('not-a-project');
  if (Number(raw.schemaVersion) > SCHEMA_VERSION) throw new Error('newer-schema');
  const site = raw.site || {};
  const sheet = raw.sheet || {};
  const categories = (Array.isArray(raw.categories) ? raw.categories : [])
    .filter((c) => c && typeof c === 'object')
    .map((c) => ({ id: str(c.id) || newId('k'), name: str(c.name), color: /^#[0-9a-f]{6}$/i.test(c.color) ? c.color : '#888888' }));
  let steps = (Array.isArray(raw.steps) ? raw.steps : []).map((s) => ({
    id: str(s?.id) || newId('s'),
    title: str(s?.title),
    text: str(s?.text),
    highlight: s?.highlight !== false,
    explode: normalizeExplode(s?.explode),
    views: normalizeViews(s?.views),
    // what the previous step had and this one took away or changed, drawn dashed
    ghostPrev: !!s?.ghostPrev,
    // a sign between this step and the one before it, on the sheet
    op: pick(s?.op, STEP_OPS, ''),
    objects: (Array.isArray(s?.objects) ? s.objects : []).map(normalizeObject).filter(Boolean),
  }));
  if (!steps.length) steps = [createStep()];
  const az = num(raw.view?.az, -45);
  let levels = (Array.isArray(raw.levels) ? raw.levels : [])
    .filter((l) => l && typeof l === 'object')
    .map((l) => ({ id: str(l.id) || newId('L'), name: str(l.name), z: num(l.z, 0, -1000, 1000) }));
  if (!levels.length) levels = [{ id: GROUND_LEVEL, name: '', z: 0 }];
  return {
    format: FORMAT,
    schemaVersion: SCHEMA_VERSION,
    name: str(raw.name),
    site: normalizeSite(site),
    // an image under the drawing (a site plan, an aerial photo), in metres on the ground
    underlay: normalizeUnderlay(raw.underlay),
    // the sun, for the shadows on the ground
    sun: normalizeSun(raw.sun),
    levels,
    north: num(raw.north, 0) % 360,
    northPlace: pick(raw.northPlace, NORTH_PLACES, 'header'),
    northHalftone: !!raw.northHalftone,
    grid: pick(Number(raw.grid), [0.5, 1, 2.5, 5], 1),
    style: STYLE_ALIASES[raw.style] || str(raw.style, 'beige') || 'beige',
    // categories also told apart by a hatch, not only by colour (for print in grey and colour-blind readers)
    catPatterns: !!raw.catPatterns,
    // four isometric views, one per corner of the site: -45 (south-east), 45, 135, 225
    view: { az: -45 + 90 * (((Math.round((az + 45) / 90)) % 4 + 4) % 4) },
    categories,
    steps,
    sheet: {
      layout: pick(sheet.layout, LAYOUTS, 'row'),
      // 0: as many columns as make the drawings largest
      cols: Math.round(num(sheet.cols, 3, 0, 8)),
      paper: pick(sheet.paper, Object.keys(PAPERS), 'A3'),
      orientation: sheet.orientation === 'portrait' ? 'portrait' : 'landscape',
      scale: SHEET_SCALES.includes(Number(sheet.scale)) ? Number(sheet.scale) : 0,
      title: str(sheet.title), subtitle: str(sheet.subtitle),
      legend: sheet.legend !== false, texts: sheet.texts !== false, heads: sheet.heads !== false,
      legendPlace: pick(sheet.legendPlace, LEGEND_PLACES, 'top'),
      // where a free legend is (its top left corner, as a fraction of the paper), dragged on the preview
      legendAt: Array.isArray(sheet.legendAt) && sheet.legendAt.length === 2 && sheet.legendAt.every(Number.isFinite)
        ? sheet.legendAt.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 10000) / 10000) : null,
      // a small north beside each drawing, besides (or instead of) the one of the header
      northEach: sheet.northEach === true,
      // the terrain drawn as in the editor: see-through, with the grid on its surfaces
      terrainGrid: sheet.terrainGrid === true,
      // free blocks of text in a column on the right of the sheet (strategy, pros and cons…): a line that starts
      // with + or − is drawn as a point for or against
      blocks: (Array.isArray(sheet.blocks) ? sheet.blocks : []).slice(0, 8)
        .map((b) => ({ title: str(b?.title).slice(0, 120), text: str(b?.text).slice(0, 4000) })).filter((b) => b.title || b.text),
    },
  };
}

export const clone = (v) => JSON.parse(JSON.stringify(v));

/** A new step that starts as a copy of `from` (same object ids, so changes can be traced). */
export function copyStep(from) {
  return createStep({ objects: clone(from.objects), highlight: from.highlight, explode: clone(from.explode || createExplode()), views: clone(from.views || []), ghostPrev: !!from.ghostPrev });
}

/** Volumes whose floors can be pulled apart in an exploded view (extruded shapes with more than one floor). */
export const splitsFloors = (v) => (v.shape === 'box' || v.shape === 'cylinder') && v.floors > 1;

/**
 * How far each object rises in the exploded view of a step (metres; empty when the step is not exploded):
 * the reference planes move apart one gap each, from the lowest; a stacked volume rises one gap above the
 * one it sits on (more when that one's floors are pulled apart too). The terrain stays where it is.
 */
export function explodeOffsets(step, levels) {
  const out = new Map();
  const ex = step.explode;
  if (!ex?.on) return out;
  const order = [...levels].sort((a, b) => a.z - b.z).map((l) => l.id);
  const levelOffset = (id) => Math.max(0, order.indexOf(id || GROUND_LEVEL)) * ex.gap;
  const byId = indexById(step.objects);
  const volumeOffset = (v, guard = 0) => {
    if (out.has(v.id)) return out.get(v.id);
    let off;
    const below = v.on && guard < 50 ? byId.get(v.on) : null;
    if (below && below.type === 'volume') {
      off = volumeOffset(below, guard + 1) + ex.gap + (ex.floors && splitsFloors(below) ? (below.floors - 1) * ex.gap : 0);
    } else off = levelOffset(v.level);
    out.set(v.id, off);
    return off;
  };
  for (const o of step.objects) {
    if (o.type === 'volume') volumeOffset(o);
    else if (o.type === 'cut') {
      const t = o.target && byId.get(o.target);
      out.set(o.id, t && t.type === 'volume' ? volumeOffset(t) : levelOffset(o.level));
    } else if (o.type === 'slope' || o.type === 'platform') out.set(o.id, 0); // the terrain stays where it is
    else out.set(o.id, levelOffset(o.level));
  }
  return out;
}

/** Elevation of a level (0 for no level, or a level that no longer exists). */
export function elevationOf(levels, id) {
  if (!id || !levels) return 0;
  return levels.find((l) => l.id === id)?.z ?? 0;
}

/**
 * Base height of an object: the elevation of its level plus its own `z`; a volume stacked on another
 * one follows the chain of volumes it sits on.
 */
export function baseOf(obj, byId, levels, guard = 0) {
  if (obj.type === 'volume' && obj.on && guard <= 50) {
    const below = byId.get(obj.on);
    if (below && below.type === 'volume') return baseOf(below, byId, levels, guard + 1) + heightOf(below);
  }
  return elevationOf(levels, obj.level) + (obj.z || 0);
}

/** The height a volume takes (a sphere is as tall as it is wide). */
export const heightOf = (v) => (v.shape === 'sphere' ? v.w : v.h);

/** The two elevations of a slope: at its start (local −y) and at its end (local +y). */
export const slopeEnds = (s, levels) => [elevationOf(levels, s.from) + s.zFrom, elevationOf(levels, s.to) + s.zTo];

/** A readable elevation: +1,20 / −3,00 / ±0,00. */
export function formatElevation(z, fmt = (n) => n.toFixed(2)) {
  if (Math.abs(z) < 0.005) return '±' + fmt(0);
  return (z > 0 ? '+' : '−') + fmt(Math.abs(z));
}

export const indexById = (objects) => new Map(objects.map((o) => [o.id, o]));

const GEOMETRY = {
  volume: ['x', 'y', 'w', 'd', 'h', 'rot', 'z', 'level', 'on', 'floors', 'shape', 'roof', 'roofH', 'pts', 'fill', 'top'],
  cut: ['x', 'y', 'w', 'd', 'h', 'rot', 'z', 'level', 'target', 'shape', 'pts', 'top'],
};

/**
 * Volumes that are new or changed in `step` compared with `prev`: new volumes, volumes whose geometry or
 * floors changed, and volumes touched by a cut that is new or changed. Category and state do not count:
 * they already show by themselves.
 */
/** The same shape in the same place (for volumes and cuts)? */
export const sameGeometry = (a, b) => a.type === b.type && !!GEOMETRY[a.type]
  && GEOMETRY[a.type].every((k) => (k === 'pts' ? JSON.stringify(a[k]) === JSON.stringify(b[k]) : a[k] === b[k]));

export function changedVolumes(prev, step) {
  const out = new Set();
  if (!prev) return out;
  const before = indexById(prev.objects);
  const same = (a, b, keys) => keys.every((k) => (k === 'pts' ? JSON.stringify(a[k]) === JSON.stringify(b[k]) : a[k] === b[k]));
  const newCuts = [];
  for (const o of step.objects) {
    if (o.type !== 'volume' && o.type !== 'cut') continue;
    const old = before.get(o.id);
    const changed = !old || old.type !== o.type || !same(old, o, GEOMETRY[o.type]);
    if (o.type === 'volume' && changed && o.state !== 'context') out.add(o.id);
    if (o.type === 'cut' && changed) newCuts.push(o);
  }
  for (const o of prev.objects) {
    if (o.type === 'cut' && !step.objects.some((n) => n.id === o.id)) newCuts.push(o); // removed cut: volumes changed too
  }
  if (newCuts.length) {
    for (const v of step.objects) {
      if (v.type !== 'volume' || v.state === 'context' || v.fill) continue;
      if (newCuts.some((c) => (c.target ? c.target === v.id : Math.hypot(c.x - v.x, c.y - v.y) < (Math.hypot(c.w, c.d) + Math.hypot(v.w, v.d)) / 2))) out.add(v.id);
    }
  }
  return out;
}

/** Steps whose objects are not empty (used to ask for the typed code before deleting). */
export const stepHasContent = (step) => step.objects.length > 0 || !!step.title || !!step.text;

/** Every category used by a volume or an arrow, in any step, with how it is used. */
export function usedCategories(project) {
  const used = new Map();
  for (const s of project.steps) {
    for (const o of s.objects) {
      const id = o.type === 'volume' ? o.cat : o.type === 'arrow' ? o.color : null;
      if (!id) continue;
      const cat = project.categories.find((c) => c.id === id);
      if (!cat) continue;
      const u = used.get(id) || { cat, volume: false, arrow: false };
      if (o.type === 'volume') u.volume = true;
      else u.arrow = true;
      used.set(id, u);
    }
  }
  return project.categories.filter((c) => used.has(c.id)).map((c) => used.get(c.id));
}

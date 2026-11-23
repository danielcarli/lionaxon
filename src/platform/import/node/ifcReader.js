/*---------------------------------------------------------------------------------------------
 *  LionAxon — Copyright (C) 2026 LionAxon Team.
 *  Created and conceived by Daniel Michelon De Carli.
 *  Licensed under the GNU General Public License v3.0 or later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/
// Reads an IFC file (the open exchange format of BIM tools) with web-ifc and keeps what a massing diagram
// needs, already small: for each building element and each room, the storey it is on, its phases, its
// name, its lowest and highest point, and the triangles of its surface that face up, seen from above (the
// walls of a solid seen from above have no area; the bottoms repeat the tops). Plain Node: it runs in a
// worker thread, so that a model of hundreds of megabytes does not stop the window.
'use strict';
const path = require('path');

/** The kinds of element that make the mass of a building. */
const MASS_TYPES = ['IFCWALL', 'IFCWALLSTANDARDCASE', 'IFCCURTAINWALL', 'IFCSLAB', 'IFCROOF', 'IFCCOLUMN', 'IFCBUILDINGELEMENTPROXY', 'IFCSTAIR', 'IFCRAMP', 'IFCPLATE', 'IFCMEMBER', 'IFCBEAM', 'IFCCOVERING', 'IFCRAILING', 'IFCCHIMNEY'];
/** A triangle seen from above smaller than this (m²) is a wall face: it is not kept. */
const MIN_AREA = 1e-5;
/** The most triangles kept per element (a terrain or a detailed roof can have many more). */
const MAX_TRIS = 20000;
/** The text of the file is searched for the phases in pieces of this size (bytes). */
const CHUNK = 32 * 1024 * 1024;

const PHASE_CREATED = /^(phase created|fase de cria[çc][aã]o|fase criada|phase de cr[ée]ation|fase de creaci[oó]n|erstellungsphase)$/i;
const PHASE_DEMOLISHED = /^(phase demolished|fase de demoli[çc][aã]o|fase demolida|phase de d[ée]molition|fase de demolici[oó]n|abbruchphase)$/i;

/** What web-ifc said while reading (it writes to the console): counted here, not printed. */
const notes = { faces: 0, other: 0 };
let apiPromise = null;
/** One web-ifc engine for the whole session (its WebAssembly is loaded the first time it is needed). */
function engine() {
  if (!apiPromise) {
    apiPromise = (async () => {
      // web-ifc keeps the console's functions when it starts (Init): it gets ones that count its messages (a model
      // with curved surfaces can have thousands of "No basis found for brep!") instead of printing them
      const keep = { log: console.log, error: console.error };
      const sieve = (orig) => (...args) => {
        const text = args.map(String).join(' ');
        if (!text.includes('[WEB-IFC]')) return orig.apply(console, args);
        if (/brep|TriangulateBounds/i.test(text)) notes.faces++;
        else notes.other++;
      };
      const WebIFC = require('../../../vendor/web-ifc/web-ifc-api-node.js');
      const api = new WebIFC.IfcAPI();
      // the .wasm sits beside the module (unpacked from the app archive when packaged)
      const dir = path.join(__dirname, '../../../vendor/web-ifc').replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');
      api.SetWasmPath(dir + path.sep, true);
      console.log = sieve(keep.log);
      console.error = sieve(keep.error);
      try { await api.Init(); } finally { console.log = keep.log; console.error = keep.error; }
      return { api, WebIFC };
    })();
  }
  return apiPromise;
}

/** The text of an IFC value (a label, an identifier…), or ''. */
const text = (v) => (v && typeof v === 'object' && 'value' in v ? String(v.value ?? '') : typeof v === 'string' ? v : '');

/**
 * What a massing diagram needs from an IFC file. The coordinates are in metres, with z up (web-ifc gives
 * them with y up: x stays, the IFC y is −z there).
 */
/** The outline around some points (counter-clockwise), as triangles from its first point: for an element whose top could not be read. */
function hullTriangles(pts) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return [];
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [], upper = [];
  for (const q of p) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q); }
  const hull = lower.slice(0, -1).concat(upper.slice(0, -1));
  const out = [];
  for (let k = 1; k + 1 < hull.length; k++) out.push(hull[0][0], hull[0][1], hull[k][0], hull[k][1], hull[k + 1][0], hull[k + 1][1]);
  return out;
}

async function readIfc(bytes, onProgress = () => {}) {
  notes.faces = 0;
  notes.other = 0;
  notes.hulls = 0;
  onProgress({ stage: 'phases-scan' });
  const phaseProps = scanPhases(bytes);
  const { api, WebIFC } = await engine();
  onProgress({ stage: 'open' });
  const id = api.OpenModel(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), { COORDINATE_TO_ORIGIN: false, MEMORY_LIMIT: 3221225472 });
  try {
    const typeName = (code) => String(api.GetNameFromTypeCode?.(code) || '').toUpperCase();
    const ids = (code) => { const v = api.GetLineIDsWithType(id, code); const out = []; for (let i = 0; i < v.size(); i++) out.push(v.get(i)); return out; };
    const line = (eid) => { try { return api.GetLine(id, eid, false); } catch { return null; } };
    const ref = (r) => (r && typeof r === 'object' ? r.value : r);

    // the storeys, with their names and elevations (the elevation is in the file's units: it is taken from the geometry below)
    const storeys = ids(WebIFC.IFCBUILDINGSTOREY).map((sid) => { const s = line(sid); return { id: sid, name: text(s?.Name) || text(s?.LongName), elevation: Number.isFinite(Number(text(s?.Elevation))) && text(s?.Elevation) !== "" ? Number(text(s?.Elevation)) : null }; });
    const storeyOf = new Map();
    for (const rid of ids(WebIFC.IFCRELCONTAINEDINSPATIALSTRUCTURE)) {
      const r = line(rid);
      const st = ref(r?.RelatingStructure);
      for (const e of r?.RelatedElements || []) storeyOf.set(ref(e), st);
    }
    // rooms belong to their storey through an aggregation; parts of an element (the slabs of a roof…) to the element
    const partOf = new Map();
    for (const rid of ids(WebIFC.IFCRELAGGREGATES)) {
      const r = line(rid);
      const whole = ref(r?.RelatingObject);
      for (const e of r?.RelatedObjects || []) partOf.set(ref(e), whole);
    }
    const storeyIds = new Set(storeys.map((s) => s.id));
    const findStorey = (eid) => {
      for (let k = eid, n = 0; k != null && n < 8; n++) {
        if (storeyIds.has(k)) return k;
        if (storeyOf.has(k)) return storeyOf.get(k);
        k = partOf.get(k);
      }
      return null;
    };

    // the phases: the properties named for them were found in the text of the file; here, which elements have them
    onProgress({ stage: 'phases' });
    const phases = new Map();
    if (phaseProps.size) {
      for (const rid of ids(WebIFC.IFCRELDEFINESBYPROPERTIES)) {
        const r = line(rid);
        const psetId = ref(r?.RelatingPropertyDefinition);
        const pset = line(psetId);
        if (!pset?.HasProperties) continue;
        let created = '', demolished = '';
        for (const p of pset.HasProperties) {
          const ph = phaseProps.get(ref(p));
          if (ph?.kind === 'created') created = ph.value;
          else if (ph?.kind === 'demolished') demolished = ph.value;
        }
        if (!created && !demolished) continue;
        for (const e of r.RelatedObjects || []) {
          const cur = phases.get(ref(e)) || {};
          phases.set(ref(e), { created: created || cur.created || '', demolished: demolished || cur.demolished || '' });
        }
      }
    }

    const elements = [];
    // models often sit at their survey coordinates (hundreds of kilometres from the origin): a float32
    // there is only good to half a metre, so everything is kept from the first point found
    let origin = null;
    const take = (mesh, kind) => {
      const eid = mesh.expressID;
      const el = line(eid);
      const up = [], down = [], seen = [];
      let z0 = Infinity, z1 = -Infinity;
      for (let i = 0; i < mesh.geometries.size(); i++) {
        const pg = mesh.geometries.get(i);
        const g = api.GetGeometry(id, pg.geometryExpressID);
        const v = api.GetVertexArray(g.GetVertexData(), g.GetVertexDataSize());
        const ix = api.GetIndexArray(g.GetIndexData(), g.GetIndexDataSize());
        const m = pg.flatTransformation;
        const P = (k) => {
          const x = v[k * 6], y = v[k * 6 + 1], z = v[k * 6 + 2];
          // world coordinates with y up, turned to z up
          const X = m[0] * x + m[4] * y + m[8] * z + m[12];
          const Y = m[1] * x + m[5] * y + m[9] * z + m[13];
          const Z = m[2] * x + m[6] * y + m[10] * z + m[14];
          if (!origin) origin = [Math.round(X), Math.round(-Z)];
          return [X - origin[0], -Z - origin[1], Y];
        };
        for (let k = 0; k + 2 < ix.length; k += 3) {
          const a = P(ix[k]), b = P(ix[k + 1]), c = P(ix[k + 2]);
          for (const q of [a, b, c]) { if (q[2] < z0) z0 = q[2]; if (q[2] > z1) z1 = q[2]; }
          if (seen.length < 4000) seen.push(a, b, c);
          const area = ((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2;
          if (Math.abs(area) < MIN_AREA) continue;
          // the tops (counter-clockwise seen from above) are enough: the bottoms are under them
          const into = area > 0 ? up : down;
          if (into.length < MAX_TRIS * 6) into.push(a[0], a[1], b[0], b[1], c[0], c[1]);
        }
        g.delete();
      }
      // nothing seen from above (its top and bottom could not be read, only its sides): the outline around its points
      const tris = up.length ? up : down.length ? down : hullTriangles(seen);
      if (!up.length && !down.length && tris.length) notes.hulls = (notes.hulls || 0) + 1;
      done++;
      if (done % 200 === 0) onProgress({ stage: 'geometry', done, total });
      if (!tris.length || !Number.isFinite(z0)) return;
      const ph = phases.get(eid) || {};
      elements.push({
        id: eid, gid: text(el?.GlobalId), kind, type: typeName(el?.type),
        name: text(el?.Name), longName: text(el?.LongName),
        storey: findStorey(eid), created: ph.created || '', demolished: ph.demolished || '',
        z0, z1, tris: Float32Array.from(tris),
      });
    };
    const massCodes = MASS_TYPES.map((n) => WebIFC[n]).filter((c) => typeof c === 'number');
    let done = 0;
    const total = [...massCodes, WebIFC.IFCSPACE].reduce((sum, code) => sum + api.GetLineIDsWithType(id, code).size(), 0);
    onProgress({ stage: 'geometry', done, total });
    api.StreamAllMeshesWithTypes(id, massCodes, (mesh) => take(mesh, 'mass'));
    api.StreamAllMeshesWithTypes(id, [WebIFC.IFCSPACE], (mesh) => take(mesh, 'space'));
    const project = line(ids(WebIFC.IFCPROJECT)[0]);
    return { project: text(project?.LongName) || text(project?.Name), storeys, elements, notes: { faces: notes.faces, other: notes.other, hulls: notes.hulls || 0 } };
  } finally {
    api.CloseModel(id);
  }
}

/** A string of an IFC file, with its escapes (\\X2\\…\\X0\\ for Unicode, \\X\\hh for Latin-1, '' for a quote) read. */
function decodeIfcString(s) {
  return s
    .replace(/\\X2\\([0-9A-F]+)\\X0\\/gi, (_m, hex) => String.fromCharCode(...hex.match(/.{4}/g).map((h) => parseInt(h, 16))))
    .replace(/\\X\\([0-9A-F]{2})/gi, (_m, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/''/g, "'");
}

/**
 * The properties that tell the phase of an element, found in the text of the file without parsing it all:
 * id → { kind: 'created' | 'demolished', value }. The file is searched in pieces (it may be hundreds of MB).
 */
function scanPhases(bytes) {
  const out = new Map();
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const re = /#(\d+)\s*=\s*IFCPROPERTYSINGLEVALUE\s*\(\s*'((?:[^']|'')*)'\s*,[^,]*,\s*IFC(?:LABEL|TEXT|IDENTIFIER)\s*\(\s*'((?:[^']|'')*)'/gi;
  for (let at = 0; at < buf.length; at += CHUNK) {
    // a little of the next piece too, so that a line cut in two is read whole
    const text = buf.toString('latin1', at, Math.min(buf.length, at + CHUNK + 4096));
    re.lastIndex = 0;
    for (let m; (m = re.exec(text));) {
      const name = decodeIfcString(m[2]).trim();
      const kind = PHASE_CREATED.test(name) ? 'created' : PHASE_DEMOLISHED.test(name) ? 'demolished' : null;
      if (!kind) continue;
      // the file is UTF-8 inside its quotes too, now and then
      let value = decodeIfcString(m[3]).trim();
      if (/[\x80-\xff]/.test(value) && !/[^\x00-\xff]/.test(value)) { const u = Buffer.from(value, 'latin1').toString('utf8'); if (!u.includes('\ufffd')) value = u; }
      if (!value || (kind === 'demolished' && /^(none|nenhum|nenhuma|aucune?|ninguna|keine)$/i.test(value))) continue;
      out.set(Number(m[1]), { kind, value });
    }
  }
  return out;
}

module.exports = { readIfc, scanPhases, decodeIfcString };

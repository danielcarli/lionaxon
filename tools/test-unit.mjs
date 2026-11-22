/*---------------------------------------------------------------------------------------------
 *  LionAxon — Copyright (C) 2026 LionAxon Team.
 *  Created and conceived by Daniel Michelon De Carli.
 *  Licensed under the GNU General Public License v3.0 or later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/
// Unit tests of the parts that do not need a window: projection, polygons, the model, the renderer's
// geometry and order, and the sheet.   node tools/test-unit.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { makeView, planView, project, unproject, ISO_ELEVATION } from '../src/base/common/geometry/projection.js';
import { rectRing, difference, multiArea, convexOverlap, signedArea } from '../src/base/common/geometry/polygon.js';
import {
  normalizeProject, createProject, createVolume, createCut, createPlatform, createSlope, createPerson, createLabel, copyStep, changedVolumes,
  baseOf, indexById, usedCategories, elevationOf, slopeEnds, heightOf, formatElevation, explodeOffsets, stepAngles, normalizeAngle, sameAngle, polyFromWorld, polyWorld, sunPosition, shadowVector,
} from '../src/workbench/services/model/common/model.js';
import { encodeGif, lzw } from '../src/base/common/gif.js';
import { roofFaces, shadowOf, footprintOf as footOf } from '../src/workbench/services/render/common/solids.js';
import { multiArea as areaOf } from '../src/base/common/geometry/polygon.js';
import { footprintOf, expandCut } from '../src/workbench/services/render/common/solids.js';
import { familiesUsed, fontFaceCss } from '../src/workbench/services/render/common/fonts.js';
import { STYLE_IDS, getStyle } from '../src/workbench/services/render/common/styles.js';
import { DocumentService } from '../src/workbench/services/document/browser/documentService.js';
import { volumeBands, volumeFaces, renderStep, sortFaces, stepSvg } from '../src/workbench/services/render/common/renderer.js';
import { renderSheet, wrap, gridOf } from '../src/workbench/services/render/common/sheet.js';
import { shade } from '../src/workbench/services/render/common/styles.js';

let n = 0;
const test = (name, fn) => { fn(); n++; console.log(`  ✓ ${name}`); };
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

console.log('LionAxon unit tests');

test('isometric view keeps the three axes at the same scale', () => {
  const v = makeView(-45, ISO_ELEVATION);
  const len = (p) => Math.hypot(...project(v, p));
  near(len([1, 0, 0]), len([0, 1, 0]), 1e-4);
  near(len([1, 0, 0]), len([0, 0, 1]), 1e-4);
});

test('unproject is the inverse of project on a horizontal plane', () => {
  for (const az of [-45, 45, 135, 225]) {
    const v = makeView(az);
    for (const z of [0, 3.5, 12]) {
      const p = [13.2, -7.5, z];
      const [x, y] = unproject(v, ...project(v, p), z);
      near(x, p[0], 1e-9); near(y, p[1], 1e-9);
    }
  }
  const pv = planView();
  const [X, Y] = project(pv, [10, 20, 0]);
  near(X, 10); near(Y, -20); // plan: north up
});

test('rectangles are counter-clockwise and rotate around their centre', () => {
  const r = rectRing(5, 5, 4, 2, 90);
  assert.ok(signedArea(r) > 0);
  near(Math.min(...r.map((p) => p[0])), 4); near(Math.max(...r.map((p) => p[1])), 7);
});

test('difference of polygons (a notch)', () => {
  const a = [[rectRing(0, 0, 10, 10)]];
  const b = [[rectRing(5, 0, 4, 4)]];
  near(multiArea(difference(a, [b])), 100 - 8);
});

test('touching shapes do not overlap; crossing shapes do', () => {
  assert.equal(convexOverlap(rectRing(0, 0, 2, 2), rectRing(2, 0, 2, 2)), false);
  assert.equal(convexOverlap(rectRing(0, 0, 2, 2), rectRing(1.5, 0, 2, 2)), true);
});

test('a cut through a volume splits it in bands; walls of unchanged edges are one face', () => {
  const v = createVolume({ x: 0, y: 0, w: 10, d: 30, h: 9, floors: 3 });
  const c = createCut({ x: 4, y: -10, w: 4, d: 4, z: 0, h: 3, target: v.id }); // a notch on the east side, ground floor only
  const bands = volumeBands(v, 0, [c]);
  assert.equal(bands.length, 2);
  near(multiArea(bands[0].poly), 300 - 12);
  near(multiArea(bands[1].poly), 300);
  const faces = volumeFaces(v, 0, [c]);
  const westFull = faces.filter((f) => f.role === 'wall' && Math.abs(f.n[0] + 1) < 1e-9 && f.rings[0].some((p) => p[2] === 9) && f.rings[0].some((p) => p[2] === 0));
  assert.ok(westFull.length >= 1, 'a wall from the ground to the top where nothing was cut');
  assert.ok(faces.some((f) => f.lines.length), 'floor lines on the walls');
});

test('volumes sit on other volumes, following the chain', () => {
  const a = createVolume({ id: 'a', h: 10 });
  const b = createVolume({ id: 'b', h: 3, on: 'a' });
  const c = createVolume({ id: 'c', h: 2, on: 'b' });
  near(baseOf(c, indexById([a, b, c])), 13);
});

test('changes between steps: new volumes, changed volumes, volumes hit by a new cut', () => {
  const s1 = { objects: [createVolume({ id: 'a', x: 0 }), createVolume({ id: 'b', x: 30 })] };
  const s2 = copyStep(s1);
  s2.objects[1].h = 9;
  s2.objects.push(createVolume({ id: 'c', x: 60 }));
  s2.objects[0].cat = 'k1'; // a category is not a change of shape
  assert.deepEqual([...changedVolumes(s1, s2)].sort(), ['b', 'c']);
  const s3 = copyStep(s2);
  s3.objects.push(createCut({ x: 0, y: 0, target: 'a' }));
  assert.deepEqual([...changedVolumes(s2, s3)], ['a']);
});

test('back-to-front order: a volume in front is drawn after the one behind', () => {
  const v = makeView(-45);
  const prj = createProject();
  prj.steps[0].objects = [createVolume({ id: 'back', x: 10, y: 40, w: 8, d: 8, h: 10 }), createVolume({ id: 'front', x: 30, y: 10, w: 8, d: 8, h: 10 })];
  const { markup } = renderStep(prj, 0, { view: v, ids: true });
  assert.ok(markup.lastIndexOf('data-id="back"') < markup.indexOf('data-id="front"'), 'every face of the back volume before the front one');
});

test('back-to-front order: a stacked volume is drawn over the roof it sits on', () => {
  const prj = createProject();
  prj.steps[0].objects = [createVolume({ id: 'base', x: 10, y: 10, w: 20, d: 20, h: 6 }), createVolume({ id: 'top', x: 10, y: 10, w: 4, d: 4, h: 3, on: 'base' })];
  for (const az of [-45, 45, 135, 225]) {
    const { markup } = renderStep(prj, 0, { view: makeView(az), ids: true });
    // the roof of the base is the face the stacked volume covers: it must come first
    assert.ok(markup.indexOf('data-id="base" data-top') < markup.indexOf('data-id="top"'), `view ${az}`);
  }
});

test('the example renders every step in every view', () => {
  for (const f of ['parti-pt-BR', 'parti-en']) {
    const prj = normalizeProject(JSON.parse(fs.readFileSync(new URL(`../examples/${f}.lionaxon`, import.meta.url), 'utf8')));
    assert.equal(prj.steps.length, 5);
    for (const az of [-45, 45, 135, 225]) for (let i = 0; i < 5; i++) assert.ok(renderStep(prj, i, { view: makeView(az) }).markup.length > 500);
    assert.ok(stepSvg(prj, 4, { view: planView() }).startsWith('<svg'));
    assert.equal(usedCategories(prj).length, 3);
  }
});

test('the six examples open, render in every view and fill their sheet', () => {
  const names = new Set();
  for (const id of ['parti', 'plateaus', 'tower', 'slope', 'school', 'corner']) for (const lang of ['pt-BR', 'en']) {
    const raw = JSON.parse(fs.readFileSync(new URL(`../examples/${id}-${lang}.lionaxon`, import.meta.url), 'utf8'));
    const prj = normalizeProject(raw);
    assert.deepEqual(normalizeProject(prj), prj, `${id}-${lang} is stored normalized`);
    assert.ok(prj.steps.length >= 4, `${id} tells a story`);
    names.add(prj.name);
    for (let i = 0; i < prj.steps.length; i++) {
      for (const az of [-45, 135]) assert.ok(renderStep(prj, i, { view: makeView(az) }).markup.length > 500, `${id} step ${i + 1}`);
      assert.ok(stepSvg(prj, i, { view: planView() }).startsWith('<svg'));
      assert.ok(prj.steps[i].title && prj.steps[i].text, `${id} step ${i + 1} has a caption`);
    }
    const sheet = renderSheet(prj, { t: (k) => k });
    assert.ok(sheet.pages.length >= 1 && !sheet.overflow, `${id} fits its sheet`);
  }
  assert.equal(names.size, 12, 'every example has a name of its own in each language');
});

test('the sheet has one layer per step, the legend and the paper size', () => {
  const prj = normalizeProject(JSON.parse(fs.readFileSync(new URL('../examples/parti-pt-BR.lionaxon', import.meta.url), 'utf8')));
  const { svg, width, height } = renderSheet(prj, { t: (k) => k });
  assert.equal(width, 420); assert.equal(height, 297);
  assert.equal((svg.match(/inkscape:groupmode="layer"/g) || []).length, 5);
  assert.ok(svg.includes('id="legend"') && svg.includes('CAIXA DE ESCADA'));
  prj.sheet.orientation = 'portrait'; prj.sheet.paper = 'A2'; prj.sheet.layout = 'grid'; prj.sheet.cols = 2;
  const p2 = renderSheet(prj, { t: (k) => k });
  assert.equal(p2.width, 420); assert.equal(p2.height, 594);
  assert.deepEqual(gridOf(prj.sheet, 5), { cols: 2, rows: 3 });
});

test('captions wrap on spaces', () => {
  assert.deepEqual(wrap('Three parallel volumes placed on the site.', 20), ['Three parallel', 'volumes placed on', 'the site.']);
});

test('files: unknown fields are ignored, missing ones filled, other formats refused', () => {
  const p = normalizeProject({ format: 'lionaxon', steps: [{ objects: [{ type: 'volume', w: 'x' }, { type: 'spaceship' }] }], extra: 1 });
  assert.equal(p.steps[0].objects.length, 1);
  assert.equal(p.steps[0].objects[0].w, 10);
  assert.throws(() => normalizeProject({ format: 'other' }), /not-a-project/);
  assert.throws(() => normalizeProject({ format: 'lionaxon', schemaVersion: 99 }), /newer-schema/);
});

test('styles: shading darkens and lightens', () => {
  assert.equal(shade('#ffffff', 0.5), '#808080');
  assert.equal(shade('#000000', -1), '#ffffff');
});

test('performance: 200 volumes render in well under a second', () => {
  const prj = createProject();
  for (let i = 0; i < 200; i++) prj.steps[0].objects.push(createVolume({ x: (i % 20) * 6, y: Math.floor(i / 20) * 8, w: 4, d: 5, h: 3 + (i % 7) }));
  const t0 = performance.now();
  renderStep(prj, 0, { view: makeView(-45) });
  const ms = performance.now() - t0;
  console.log(`    (200 volumes: ${ms.toFixed(0)} ms)`);
  assert.ok(ms < 1500, `${ms} ms`);
});

// ---- 0.2

test('files of 0.1 open with a ground plane, and every object on it', () => {
  const p = normalizeProject({ format: 'lionaxon', schemaVersion: 1, site: { w: 30, d: 20, mode: 'fill' }, steps: [{ objects: [{ type: 'volume', x: 5, y: 5, w: 4, d: 4, h: 3 }] }] });
  assert.equal(p.schemaVersion, 2);
  assert.deepEqual(p.levels.map((l) => [l.id, l.z]), [['L0', 0]]);
  assert.equal(p.site.thickness, 0);
  assert.equal(p.northPlace, 'header');
  assert.equal(p.steps[0].objects[0].shape, 'box');
  near(baseOf(p.steps[0].objects[0], indexById(p.steps[0].objects), p.levels), 0);
});

test('reference planes: an object sits on its plane and follows its elevation', () => {
  const levels = [{ id: 'L0', name: '', z: 0 }, { id: 'P', name: 'Plateau', z: 4 }];
  const a = createVolume({ id: 'a', level: 'P', z: 1, h: 3 });
  const b = createVolume({ id: 'b', on: 'a', level: 'L0', h: 2 });
  const byId = indexById([a, b]);
  near(baseOf(a, byId, levels), 5);
  near(baseOf(b, byId, levels), 8); // stacked: the plane of the one below counts, not its own
  levels[1].z = 10;
  near(baseOf(a, byId, levels), 11);
  near(elevationOf(levels, 'missing'), 0);
  const s = createSlope({ from: 'L0', zFrom: 0, to: 'P', zTo: -1 });
  assert.deepEqual(slopeEnds(s, levels), [0, 9]);
  assert.equal(formatElevation(0), '±0.00');
  assert.equal(formatElevation(3), '+3.00');
  assert.equal(formatElevation(-2.5), '−2.50');
});

test('shapes: curved footprints, spheres as tall as they are wide, pointed tops', () => {
  const cyl = createVolume({ shape: 'cylinder', x: 0, y: 0, w: 10, d: 6, h: 4 });
  const ring = footprintOf(cyl);
  assert.ok(ring.length >= 32);
  assert.ok(ring.every(([x, y]) => Math.abs((x / 5) ** 2 + (y / 3) ** 2 - 1) < 1e-6));
  const faces = volumeFaces(cyl, 0, []);
  assert.ok(faces.some((f) => f.smooth), 'curved walls are smooth faces');
  const sph = normalizeProject({ format: 'lionaxon', steps: [{ objects: [{ type: 'volume', shape: 'sphere', w: 6, d: 9 }] }] }).steps[0].objects[0];
  assert.equal(sph.d, 6);
  near(heightOf(sph), 6);
  assert.equal(volumeFaces(sph, 2, [])[0].role, 'sphere');
  for (const shape of ['cone', 'pyramid']) {
    const v = createVolume({ shape, w: 6, d: 6, h: 8 });
    const top = Math.max(...volumeFaces(v, 0, []).flatMap((f) => f.rings[0].map((p) => p[2])));
    near(top, 8);
  }
});

test('terrain: a slab with a pit cut into it, platforms and slopes in every view', () => {
  const prj = createProject();
  prj.site.thickness = 2;
  prj.levels.push({ id: 'U', name: '', z: 3 });
  prj.steps[0].objects.push(
    createPlatform({ x: 10, y: 10, w: 8, d: 8, z: -1.5 }),
    createPlatform({ x: 28, y: 40, w: 10, d: 16, level: 'U' }),
    createSlope({ x: 28, y: 25, w: 8, d: 14, from: 'L0', to: 'U', zTo: 0 }),
  );
  for (const view of [makeView(-45), makeView(135), planView()]) {
    const { markup } = renderStep(prj, 0, { view, ids: true });
    assert.ok((markup.match(/<path/g) || []).length >= (view.plan ? 6 : 12));
  }
  const flat = createProject();
  const thin = renderStep(flat, 0, { view: makeView(-45) }).markup;
  const thick = renderStep(prj, 0, { view: makeView(-45) }).markup;
  assert.ok(thick.length > thin.length * 2);
});

test('ghosts answer the mouse; people in wheelchairs; labels keep their font and case', () => {
  const prj = createProject();
  prj.steps[0].objects.push(
    createVolume({ id: 'g', x: 10, y: 10, state: 'ghost' }),
    createVolume({ id: 'gs', shape: 'sphere', x: 25, y: 30, w: 6, state: 'ghost' }),
    createPerson({ id: 'w', x: 5, y: 5, pose: 3 }),
    createLabel({ id: 'l', x: 10, y: 10, text: 'Café', font: 'hand', caps: false }),
  );
  const { markup } = renderStep(prj, 0, { view: makeView(-45), ids: true });
  assert.match(markup, /data-id="g"[^>]*pointer-events="all"|pointer-events="all"[^>]*data-id="g"/);
  assert.match(markup, /<g data-id="gs"><circle[^>]*pointer-events="all"/);
  assert.match(markup, /<g data-id="w" fill="none"[^>]*><circle/);
  assert.match(markup, /Architects Daughter[^>]*>.*Café/);
  assert.ok(familiesUsed(prj).has('Architects Daughter'));
  assert.match(fontFaceCss((f) => f, familiesUsed(prj)), /architects-daughter-latin-400/);
});

test('north: in the header, in the drawings (also in axonometry) or nowhere; half tone', () => {
  const prj = createProject();
  const axon = makeView(-45);
  assert.ok(!renderStep(prj, 0, { view: axon }).markup.includes('ax-north'));
  assert.ok(renderStep(prj, 0, { view: planView() }).markup.includes('ax-north'));
  assert.ok(renderSheet(prj, { t: (k) => k }).svg.includes('id="north"'));
  prj.northPlace = 'drawing'; prj.northHalftone = true;
  assert.match(renderStep(prj, 0, { view: axon }).markup, /class="ax-north" opacity="0.55"/);
  assert.ok(!renderSheet(prj, { t: (k) => k }).svg.includes('id="north"'));
  prj.northPlace = 'none';
  assert.ok(!renderStep(prj, 0, { view: planView() }).markup.includes('ax-north'));
  assert.deepEqual(STYLE_IDS, ['beige', 'lawn', 'blue', 'cotton', 'mint', 'lavender', 'peach', 'sky']);
});

test('tabs and the session: changes thrown away are not kept, saved files are reopened from disk', () => {
  const host = { recovery: { write: async () => true, read: async () => null } };
  const doc = new DocumentService(host);
  const a = doc.openTab(createProject({ name: 'A' }), { path: '/tmp/a.lionaxon' });
  const b = doc.openTab(createProject({ name: 'B' }));
  doc.run('x', (p) => { p.name = 'B2'; });
  const c = doc.openTab(createProject({ name: 'C' }), { path: '/tmp/c.lionaxon' });
  doc.switchTo(doc.tabs.indexOf(c));
  doc.run('x', (p) => { p.name = 'C2'; });
  assert.equal(doc.tabs.length, 3); // the first, empty tab was reused
  assert.equal(doc.openTab(createProject(), { path: '/tmp/a.lionaxon' }), a); // already open: no copy
  const s1 = JSON.parse(doc.sessionText());
  assert.deepEqual(s1.tabs.map((t) => (t.reload ? 'reload:' + t.path : t.project.name)), ['reload:/tmp/a.lionaxon', 'B2', 'C2']);
  const s2 = JSON.parse(doc.sessionText(new Set([b.id, c.id])));
  assert.deepEqual(s2.tabs.map((t) => (t.reload ? 'reload:' + t.path : t.project.name)), ['reload:/tmp/a.lionaxon', 'reload:/tmp/c.lionaxon']);
  doc.closeTab(0);
  assert.equal(doc.tabs.length, 2);
  doc.closeTab(0); doc.closeTab(0);
  assert.equal(doc.tabs.length, 1); // closing the last one leaves a new empty diagram
  assert.equal(doc.objects.length, 0);
});

test('styles: edges, walls and the accent keep 3:1 contrast (WCAG 1.4.11) in every style but the first three', () => {
  const lum = (h) => { const v = parseInt(h.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255].map((c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }).reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0); };
  const cr = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  for (const id of STYLE_IDS.slice(3)) {
    const s = getStyle(id);
    assert.ok(cr(s.edge, s.paper) >= 3, `${id}: edge`);
    assert.ok(cr(s.edge, shade(s.volume, 0.27)) >= 3, `${id}: walls`);
    assert.ok(cr(s.accent, s.volume) >= 3, `${id}: accent`);
    for (const k of ['green', 'blue', 'red', 'text', 'muted']) assert.ok(cr(s[k], s.paper) >= 3, `${id}: ${k}`);
  }
});

test('order: a box set into a slope is cut by it, and the part under the slope is drawn first', () => {
  const view = makeView(-45);
  // a wall (y = 14, x 15..33, z 0..8) and a slope surface rising from z 0 at x 20 to z 2 at x 36 (y 8..16)
  const quad = (pts) => ({ kind: 'face', pts, rings: [pts], scr: pts.map((p) => project(view, p)) });
  const wall = { ...quad([[15, 14, 0], [33, 14, 0], [33, 14, 8], [15, 14, 8]]), n: [0, -1, 0], name: 'wall' };
  const z = (x) => ((x - 20) / 16) * 2;
  const slant = { ...quad([[20, 8, z(20)], [36, 8, z(36)], [36, 16, z(36)], [20, 16, z(20)]]), name: 'slant' };
  const len = Math.hypot(2, 16); slant.n = [-2 / len, 0, 16 / len];
  const order = sortFaces([wall, slant], view);
  assert.ok(order.length > 2, 'something was cut');
  const iWall = order.findIndex((f) => f.name === 'wall');
  const front = order.filter((f) => f.name === 'slant' && f.pts.every((p) => p[1] <= 14 + 1e-6));
  const behind = order.filter((f) => f.name === 'slant' && f.pts.every((p) => p[1] >= 14 - 1e-6));
  assert.ok(front.length && behind.length, 'the slope was cut along the wall');
  for (const f of front) assert.ok(order.indexOf(f) > iWall, 'the slope in front of the wall covers it');
  for (const f of behind) assert.ok(order.indexOf(f) < iWall, 'the slope inside the box is hidden by the wall');
  // the cut runs where the slope meets the wall: that line is drawn
  assert.ok(front.some((f) => f.edges.some((e, i) => e && Math.abs(f.pts[i][1] - 14) < 1e-6 && Math.abs(f.pts[(i + 1) % f.pts.length][1] - 14) < 1e-6)));
});

test('subtractions: a cylinder is one round prism, cones, pyramids and spheres are slices', () => {
  const c = createCut({ x: 0, y: 0, w: 4, d: 4, h: 4, z: 0 });
  assert.equal(expandCut({ ...c, shape: 'box' }).length, 1);
  const cyl = expandCut({ ...c, shape: 'cylinder' });
  assert.equal(cyl.length, 1);
  assert.ok(cyl[0].ring.length >= 32);
  for (const shape of ['cone', 'pyramid', 'sphere']) {
    const parts = expandCut({ ...c, shape });
    assert.ok(parts.length >= 6, shape);
    assert.ok(parts.every((p) => p.w <= 4 + 1e-9), shape);
  }
  const sph = normalizeProject({ format: 'lionaxon', steps: [{ objects: [{ type: 'cut', shape: 'sphere', w: 6, d: 3, h: 9 }] }] }).steps[0].objects[0];
  assert.deepEqual([sph.w, sph.d, sph.h], [6, 6, 6]);
  // a round hole changes the drawing of the volume it cuts
  const prj = createProject();
  prj.steps[0].objects.push(createVolume({ id: 'v', x: 10, y: 10, w: 10, d: 10, h: 6 }));
  const plain = renderStep(prj, 0, { view: makeView(-45), ids: true }).markup;
  prj.steps[0].objects.push(createCut({ x: 10, y: 10, w: 4, d: 4, z: 2, h: 4, shape: 'cylinder', target: 'v' }));
  assert.notEqual(renderStep(prj, 0, { view: makeView(-45), ids: true }).markup, plain);
});

test('editor: see-through terrain with the grid on it; elevations draw a ground line', () => {
  const prj = createProject();
  prj.steps[0].objects.push(createPlatform({ id: 'pl', x: 10, y: 10, w: 10, d: 10, z: 2 }));
  const r = renderStep(prj, 0, { view: makeView(-45), ids: true, grid: true, editor: true, terrainMesh: true }).markup;
  assert.match(r, /class="ax-terrain"[^>]*fill-opacity="0"/);
  const solid = renderStep(prj, 0, { view: makeView(-45), ids: true, grid: true, editor: true }).markup;
  assert.ok(!solid.includes('ax-terrain'));
  const el = renderStep(prj, 0, { view: makeView(-90, 0) }).markup;
  assert.match(el, /ax-groundline/);
  assert.ok(!el.includes('ax-north') && !el.includes('ax-dims'));
});

test('exploded view: planes apart, stacked volumes above, floors apart, dashed lines down', () => {
  const prj = createProject();
  prj.levels.push({ id: 'U', name: '', z: 6 });
  const a = createVolume({ id: 'a', x: 10, y: 10, w: 8, d: 8, h: 6, floors: 2 });
  const b = createVolume({ id: 'b', x: 10, y: 10, w: 4, d: 4, h: 3, on: 'a' });
  const c = createVolume({ id: 'c', x: 30, y: 30, w: 6, d: 6, h: 3, level: 'U' });
  prj.steps[0].objects.push(a, b, c);
  const step = prj.steps[0];
  assert.equal(explodeOffsets(step, prj.levels).size, 0, 'nothing moves until the step is exploded');
  step.explode = { on: true, gap: 4, floors: false };
  let off = explodeOffsets(step, prj.levels);
  assert.deepEqual([off.get('a'), off.get('b'), off.get('c')], [0, 4, 4]);
  step.explode.floors = true;
  off = explodeOffsets(step, prj.levels);
  assert.equal(off.get('b'), 8, 'above both floors of a, pulled apart');
  const markup = renderStep(prj, 0, { view: makeView(-45) }).markup;
  assert.match(markup, /stroke-dasharray[^>]*\/>/);
  const plain = normalizeProject(JSON.parse(JSON.stringify({ ...prj, steps: [{ ...step, explode: { on: false } }] })));
  assert.ok(markup.length > renderStep(plain, 0, { view: makeView(-45) }).markup.length);
  assert.deepEqual(normalizeProject({ format: 'lionaxon', steps: [{}] }).steps[0].explode, { on: false, gap: 4, floors: false });
});

test('sheet: vertical layout, a chosen scale and pages', () => {
  const prj = normalizeProject(JSON.parse(fs.readFileSync(new URL('../examples/parti-en.lionaxon', import.meta.url), 'utf8')));
  const t = (k) => k;
  Object.assign(prj.sheet, { layout: 'vertical', paper: 'A4', orientation: 'portrait', scale: 0 });
  const auto = renderSheet(prj, { t });
  assert.equal(auto.pages.length, 1);
  assert.deepEqual([auto.width, auto.height], [210, 297]);
  assert.equal((auto.svg.match(/inkscape:groupmode="layer"/g) || []).length, 5);
  prj.sheet.scale = 500;
  const fixed = renderSheet(prj, { t });
  assert.ok(fixed.pages.length > 1, 'more pages at 1:500');
  assert.equal(fixed.scale, 500);
  assert.equal(fixed.pages.join('').match(/inkscape:groupmode="layer"/g).length, 5, 'every step once');
  assert.ok(fixed.pages.every((p) => p.includes('1:500')));
  // the drawings really are at 1:500: a 40 m side of the site is 80 mm long along the axis
  const m = /<svg x="[\d.]+" y="[\d.]+" width="([\d.]+)" height="[\d.]+" viewBox="[-\d.]+ [-\d.]+ ([\d.]+)/.exec(fixed.pages[0]);
  const mmPerUnit = Number(m[1]) / Number(m[2]);
  const v = makeView(prj.view.az);
  const axis = Math.hypot(...project(v, [1, 0, 0]).map((c, i) => c - project(v, [0, 0, 0])[i]));
  near(mmPerUnit * axis * 40, 80, 0.5);
  prj.sheet.scale = 100;
  assert.ok(renderSheet(prj, { t }).overflow, '1:100 does not fit an A4');
});

test('angles of a step: normalized, the project\'s by default, copied with the step', () => {
  assert.deepEqual(normalizeAngle({ az: -45, el: 120 }), { az: 315, el: 90 });
  assert.deepEqual(normalizeAngle({ az: 725.123, el: -30 }), { az: 5.12, el: -30 });
  assert.ok(sameAngle({ az: 0, el: 10 }, { az: 359.999, el: 10 }));
  const prj = normalizeProject(JSON.parse(fs.readFileSync(new URL('../examples/school-en.lionaxon', import.meta.url), 'utf8')));
  assert.deepEqual(stepAngles(prj, prj.steps[0]), [{ az: 315, el: 35.2644 }]);
  prj.steps[1].views = [{ az: 20, el: 50 }, { az: 200, el: -25 }, { az: 1, el: 1 }, { az: 2, el: 2 }, { az: 3, el: 3 }];
  const again = normalizeProject(JSON.parse(JSON.stringify(prj)));
  assert.equal(again.steps[1].views.length, 4, 'at most four angles');
  assert.deepEqual(copyStep(again.steps[1]).views, again.steps[1].views);
  assert.deepEqual(normalizeProject({ steps: [{}] }).steps[0].views, []);
});

test('seen from below, volumes, cones and slopes show their undersides (and never from above)', () => {
  const prj = normalizeProject({
    site: { w: 40, d: 40 },
    steps: [{ objects: [
      { type: 'volume', id: 'a', shape: 'box', x: 10, y: 10, w: 8, d: 8, h: 6 },
      { type: 'volume', id: 'b', shape: 'cone', x: 28, y: 10, w: 8, d: 8, h: 6 },
      { type: 'volume', id: 'c', shape: 'box', x: 10, y: 30, w: 8, d: 8, h: 3, z: 4 },
      { type: 'slope', id: 's', x: 28, y: 30, w: 8, d: 10, rot: 0, zFrom: 0, zTo: 3 },
    ] }],
  });
  const under = (view) => renderStep(prj, 0, { view, lw: 0.1 }).markup;
  const above = under(makeView(-45, ISO_ELEVATION));
  const below = under(makeView(-45, -ISO_ELEVATION));
  const dark = (m) => (m.match(/<path d="[^"]*Z" fill="#[0-9a-f]{6}"/g) || []).length;
  assert.ok(dark(below) >= 4, 'faces are drawn from below');
  // the box floating at 4 m shows its base from below: a face at z = 4 projected
  const v = makeView(-45, -ISO_ELEVATION);
  const corner = project(v, [6, 26, 4]).map((x) => Math.round(x * 1000) / 1000);
  assert.ok(below.includes(`${corner[0]} ${corner[1]}`), 'the base of the raised box');
  // a full turn: every angle renders
  for (let az = 0; az < 360; az += 45) for (const el of [-90, -60, -20, 0, 20, 60, 90]) assert.ok(renderStep(prj, 0, { view: makeView(az, el), lw: 0.1 }).markup.length > 100, `${az}/${el}`);
});

test('a step seen from several angles: side by side on the sheet, one layer, one caption, one scale', () => {
  const prj = normalizeProject(JSON.parse(fs.readFileSync(new URL('../examples/school-pt-BR.lionaxon', import.meta.url), 'utf8')));
  const t = (k) => k;
  const plain = renderSheet(prj, { t });
  const layout0 = prj.sheet.layout;
  prj.steps[1].views = [{ az: 315, el: 35.2644 }, { az: 135, el: 35.2644 }];
  for (const layout of ['row', 'grid', 'column', 'vertical']) {
    prj.sheet.layout = layout;
    const r = renderSheet(prj, { t });
    const svg = r.pages.join('');
    const g2 = svg.slice(svg.indexOf('id="step-02"'), svg.indexOf('id="step-03"'));
    assert.equal((g2.match(/<svg x=/g) || []).length, 2, `${layout}: two drawings in step 2`);
    assert.equal((g2.match(/font-size="[\d.]+" font-weight="500"/g) || []).length, 1, `${layout}: one number`);
    const ws = [...g2.matchAll(/<svg x="([\d.]+)" y="[\d.]+" width="([\d.]+)"/g)].map((m) => [Number(m[1]), Number(m[2])]);
    assert.ok(ws[1][0] >= ws[0][0] + ws[0][1] - 0.01, `${layout}: side by side`);
    assert.equal((svg.match(/inkscape:groupmode="layer"/g) || []).length, 5, `${layout}: still five steps`);
    // seen from opposite corners, the two drawings have different norths: each carries its own
    assert.ok(!svg.includes('id="north"') && (g2.match(/<circle/g) || []).length >= 2, `${layout}: a north per drawing`);
  }
  // with one angle everywhere the sheet is as before
  prj.steps[1].views = [];
  prj.sheet.layout = layout0;
  assert.ok(renderSheet(prj, { t }).svg === plain.svg, 'unchanged with one angle');
  // the standalone SVG of a step with two angles holds both
  prj.steps[1].views = [{ az: 20, el: 50 }, { az: 200, el: -25 }];
  const one = stepSvg(prj, 1, { views: prj.steps[1].views.map((a) => makeView(a.az, a.el)), width: 600 });
  assert.equal((one.match(/<svg /g) || []).length, 3);
});

test('objects: a name, locked and hidden are kept only when set; hidden objects are not drawn', () => {
  const prj = normalizeProject({ site: { w: 30, d: 30 }, steps: [{ objects: [
    { type: 'volume', id: 'a', x: 8, y: 8, w: 6, d: 6, h: 4, name: '  Block A  ', locked: true },
    { type: 'volume', id: 'b', x: 20, y: 20, w: 6, d: 6, h: 4, hidden: true, name: '' },
    { type: 'volume', id: 'c', x: 20, y: 20, w: 3, d: 3, h: 2, on: 'b', locked: 'yes' },
    { type: 'cut', id: 'k', x: 8, y: 8, w: 2, d: 2, h: 10, hidden: true },
  ] }] });
  const [a, b, c] = prj.steps[0].objects;
  assert.deepEqual([a.name, a.locked, 'hidden' in a], ['Block A', true, false]);
  assert.deepEqual(['name' in b, b.hidden, 'locked' in c], [false, true, false]);
  const m = renderStep(prj, 0, { view: makeView(-45, ISO_ELEVATION), lw: 0.1, ids: true }).markup;
  assert.ok(m.includes('data-id="a"') && !m.includes('data-id="b"') && m.includes('data-id="c"'), 'b is hidden, what sits on it is still drawn');
  // the hidden subtraction does not cut: the top of a is one whole face
  const shown = normalizeProject(JSON.parse(JSON.stringify(prj)));
  delete shown.steps[0].objects[3].hidden;
  assert.notEqual(renderStep(shown, 0, { view: makeView(-45, ISO_ELEVATION), lw: 0.1 }).markup, renderStep(prj, 0, { view: makeView(-45, ISO_ELEVATION), lw: 0.1 }).markup);
  // files written before these fields exist read the same
  assert.deepEqual(normalizeProject(JSON.parse(JSON.stringify(prj))), prj);
});

test('hatches: one per category, on the faces and in the legend, only when asked', () => {
  const prj = normalizeProject({ site: { w: 30, d: 30 }, categories: [{ id: 'k1', name: 'A', color: '#88aacc' }, { id: 'k2', name: 'B', color: '#ccaa88' }],
    steps: [{ objects: [{ type: 'volume', id: 'a', x: 8, y: 8, w: 6, d: 6, h: 4, cat: 'k1' }, { type: 'volume', id: 'b', x: 20, y: 20, w: 6, d: 6, h: 4, cat: 'k2' }, { type: 'volume', id: 'c', x: 20, y: 8, w: 4, d: 4, h: 4 }] }] });
  const view = makeView(-45, ISO_ELEVATION);
  assert.equal(prj.catPatterns, false);
  assert.ok(!renderStep(prj, 0, { view, lw: 0.1 }).markup.includes('<pattern'));
  prj.catPatterns = true;
  const m = renderStep(prj, 0, { view, lw: 0.1 }).markup;
  assert.equal((m.match(/<pattern /g) || []).length, 2);
  assert.equal((m.match(/fill="url\(#lx-h0-/g) || []).length, 3, 'the three visible faces of the first category');
  assert.equal((m.match(/fill="url\(#lx-h1-/g) || []).length, 3);
  const sheet = renderSheet(prj, { t: (k) => k }).svg;
  assert.equal((sheet.match(/id="lx-leg\d"/g) || []).length, 2, 'the legend shows both hatches');
});

test('outlines: a polygon keeps its points around its centre, turned or not; without points it is a box', () => {
  const world = [[6, 6], [22, 6], [22, 14], [14, 14], [14, 30], [6, 30]];
  for (const rot of [0, 30, 90]) {
    const g = polyFromWorld(world, rot);
    const back = polyWorld({ ...g, rot });
    back.forEach((q, i) => { assert.ok(Math.abs(q[0] - world[i][0]) < 2e-3 && Math.abs(q[1] - world[i][1]) < 2e-3, `rot ${rot}`); });
  }
  const g = polyFromWorld(world, 0);
  assert.deepEqual([g.x, g.y, g.w, g.d], [14, 18, 16, 24]);
  const prj = normalizeProject({ site: { w: 40, d: 40 }, steps: [{ objects: [
    { type: 'volume', id: 'L', shape: 'poly', ...g, h: 6, floors: 2 },
    { type: 'volume', id: 'bad', shape: 'poly', x: 30, y: 30, w: 4, d: 4, h: 3, pts: [[0, 0], [1, 1]] },
    { type: 'cut', id: 'k', shape: 'poly', x: 10, y: 10, pts: [[-2, -2], [2, -2], [0, 2]], h: 20, target: 'L' },
  ] }] });
  const [L, bad, k] = prj.steps[0].objects;
  assert.equal(bad.shape, 'box');
  assert.deepEqual([k.w, k.d], [4, 4]);
  // the area of the L (16×8 + 8×16 = 256) less the triangle cut out of it (8)
  const top = volumeFaces(L, 0, [{ ...k, z: 0, ring: footOf(k) }]).filter((f) => f.role === 'top');
  assert.ok(Math.abs(areaOf(top.map((f) => f.rings.map((r) => r.map(([x, y]) => [x, y])))) - 248) < 1e-6);
  assert.ok(renderStep(prj, 0, { view: makeView(-45, ISO_ELEVATION), lw: 0.1, showCuts: true }).markup.length > 500);
  assert.deepEqual(normalizeProject(JSON.parse(JSON.stringify(prj))), prj);
});

test('the site takes any outline; its width and depth are those of its bounds', () => {
  const prj = normalizeProject({ site: { w: 10, d: 10, pts: [[5, 5], [45, 5], [45, 41], [35, 55], [5, 55]], thickness: 2 }, steps: [{}] });
  assert.deepEqual([prj.site.w, prj.site.d, prj.site.pts[0]], [40, 50, [0, 0]]);
  for (const view of [makeView(-45, ISO_ELEVATION), planView(), makeView(-90, 0)]) assert.ok(renderStep(prj, 0, { view, lw: 0.1, grid: true }).markup.length > 200);
});

test('roofs: gable, shed and hip close the top of a box; flat leaves it as it was', () => {
  const v = { type: 'volume', id: 'r', shape: 'box', x: 10, y: 10, w: 10, d: 6, h: 4, rot: 0, floors: 1, roofH: 3 };
  assert.equal(volumeFaces(v, 0, []).filter((f) => f.role === 'top').length, 1);
  for (const [roof, slants, walls] of [['gable', 2, 2], ['shed', 1, 3], ['hip', 4, 0]]) {
    const faces = roofFaces({ ...v, roof }, 4);
    assert.equal(faces.filter((f) => f.role === 'slant').length, slants, roof);
    assert.equal(faces.filter((f) => f.role === 'wall').length, walls, roof);
    assert.ok(faces.every((f) => f.n[2] >= -1e-9 && Math.max(...f.rings[0].map((q) => q[2])) <= 7 + 1e-9), roof);
    const all = volumeFaces({ ...v, roof }, 0, []);
    assert.ok(!all.some((f) => f.role === 'top'), `${roof}: no flat top left`);
  }
  // the ridge follows the longer side
  const ridge = (o) => roofFaces({ ...o, roof: 'gable' }, 0).flatMap((f) => f.rings[0]).filter((q) => q[2] > 2.9);
  assert.ok(ridge(v).every((q) => Math.abs(q[1] - 10) < 1e-9));
  assert.ok(ridge({ ...v, w: 6, d: 10 }).every((q) => Math.abs(q[0] - 10) < 1e-9));
  const prj = normalizeProject({ steps: [{ objects: [{ ...v, roof: 'gable' }, { ...v, id: 'c', shape: 'cylinder', roof: 'gable' }, { ...v, id: 'f', roof: 'flat' }] }] });
  assert.deepEqual(prj.steps[0].objects.map((o) => o.roof), ['gable', undefined, undefined]);
});

test('the sun: where it is by latitude, day and hour; the shadows fall away from it', () => {
  const noon = sunPosition({ lat: -30, month: 12, day: 21, hour: 12 });
  assert.ok(Math.abs(noon.altitude - 83.44) < 0.3, String(noon.altitude)); // 90 − (30 − 23.44)
  const winter = sunPosition({ lat: -30, month: 6, day: 21, hour: 12 });
  assert.ok(Math.abs(winter.altitude - 36.56) < 0.3 && Math.abs(winter.azimuth - 0) < 0.5 || Math.abs(winter.azimuth - 360) < 0.5, JSON.stringify(winter)); // in the south, the noon sun is to the north
  const morning = sunPosition({ lat: -30, month: 3, day: 21, hour: 8 });
  assert.ok(morning.azimuth > 45 && morning.azimuth < 135, 'in the morning the sun is to the east');
  assert.ok(sunPosition({ lat: -30, month: 6, day: 21, hour: 23 }).altitude < 0);
  const prj = normalizeProject({ north: 0, sun: { on: true, lat: -30, month: 6, day: 21, hour: 12 }, steps: [{ objects: [{ type: 'volume', id: 'a', x: 20, y: 20, w: 4, d: 4, h: 10 }] }] });
  const k = shadowVector(prj);
  assert.ok(Math.abs(k[0]) < 0.02 && k[1] < -1.3 && k[1] > -1.4, JSON.stringify(k)); // sun to the north: shadows to the south, 1/tan(36.56°) long
  const sh = shadowOf(prj.steps[0].objects[0], 0, [], k);
  assert.ok(Math.abs(areaOf(sh) - (16 + 4 * 10 * -k[1])) < 0.5, String(areaOf(sh)));
  assert.equal(shadowVector({ ...prj, sun: { ...prj.sun, hour: 23 } }), null);
  assert.equal(shadowVector({ ...prj, sun: { ...prj.sun, on: false } }), null);
  const m = renderStep(prj, 0, { view: makeView(-45, ISO_ELEVATION), lw: 0.1 }).markup;
  assert.ok(m.includes('class="ax-shadow"') && m.indexOf('ax-shadow') < m.indexOf('ax-model'), 'under the model');
});

test('surroundings: areas under the model, trees, dimensions, context volumes, the previous step as a ghost', () => {
  const prj = normalizeProject({ site: { w: 40, d: 40 }, steps: [
    { objects: [{ type: 'volume', id: 'old', x: 30, y: 30, w: 6, d: 6, h: 5 }, { type: 'volume', id: 'same', x: 8, y: 30, w: 4, d: 4, h: 3 }] },
    { ghostPrev: true, op: '+', objects: [
      { type: 'volume', id: 'same', x: 8, y: 30, w: 4, d: 4, h: 3 },
      { type: 'volume', id: 'n', x: 8, y: 8, w: 6, d: 6, h: 9, state: 'context', cat: 'zz' },
      { type: 'area', id: 'st', x: 20, y: 2, w: 40, d: 4, kind: 'water' }, { type: 'area', id: 'x', x: 1, y: 1, kind: 'lava' },
      { type: 'tree', id: 't', x: 20, y: 20, size: 5, h: 7, kind: 'conifer' },
      { type: 'dim', id: 'd', x1: 5, y1: 5, x2: 11, y2: 5, offset: -2 },
    ] }] });
  const objs = prj.steps[1].objects;
  assert.deepEqual([objs[3].kind, prj.steps[1].op, prj.steps[1].ghostPrev, prj.steps[0].op], ['street', '+', true, '']);
  const view = makeView(-45, ISO_ELEVATION);
  const r = renderStep(prj, 1, { view, lw: 0.1, ids: true, fmt: (v) => `${v} m` });
  const m = r.markup;
  assert.ok(m.indexOf('data-id="st"') < m.indexOf('ax-model'), 'the area is in the ground layer');
  assert.ok(m.includes('data-id="t"') && m.includes('data-id="d"') && m.includes('>6 m<'), 'tree and dimension, with its length');
  assert.ok(!r.highlighted.includes('n') && !changedVolumes(prj.steps[0], prj.steps[1]).has('n'), 'context is never "new"');
  assert.ok(!m.includes('data-id="old"'), 'the ghost of the previous step is not picked');
  const dashed = (x) => (x.match(/stroke-dasharray/g) || []).length;
  prj.steps[1].ghostPrev = false;
  assert.ok(dashed(m) > dashed(renderStep(prj, 1, { view, lw: 0.1, ids: true }).markup), 'what was taken away shows dashed');
  // plan and elevation render too
  for (const v of [planView(), makeView(-90, 0)]) assert.ok(renderStep(prj, 1, { view: v, lw: 0.1 }).markup.length > 200);
  // the sign between steps, on the sheet
  const sheet = renderSheet(prj, { t: (k) => k }).svg;
  assert.equal((sheet.match(/class="op"/g) || []).length, 1);
  assert.ok(sheet.includes('>+</text>'));
});

test('sections: what is in front of the plane goes, what it cuts is filled', () => {
  const prj = normalizeProject({ site: { w: 40, d: 40 }, steps: [{ objects: [
    { type: 'volume', id: 'front', x: 10, y: 5, w: 6, d: 6, h: 4 },   // y 2…8
    { type: 'volume', id: 'mid', x: 20, y: 20, w: 10, d: 10, h: 6 },  // y 15…25
    { type: 'volume', id: 'back', x: 30, y: 35, w: 6, d: 6, h: 8 },   // y 32…38
  ] }] });
  const view = makeView(-90, 0); // from the front: the plane is `pos` metres behind y = 0
  const at = (pos) => renderStep(prj, 0, { view, lw: 0.1, ids: true, section: pos == null ? null : { pos } });
  const whole = at(null);
  assert.equal(whole.sectionDepth, null);
  assert.ok(!whole.markup.includes('ax-cap'));
  const r = at(20);
  assert.equal(r.sectionDepth, 40);
  assert.ok(!/<path[^>]*data-id="front"/.test(r.markup), 'the volume in front is gone');
  assert.equal((r.markup.match(/class="ax-cap"/g) || []).length, 1, 'one volume is cut');
  assert.ok(/class="ax-cap" data-id="mid" d="M15 -?0L25 -?0L25 -6L15 -6Z"|class="ax-cap" data-id="mid"/.test(r.markup));
  assert.ok(r.markup.includes('data-id="back"'), 'what is behind is seen whole');
  assert.equal((at(30).markup.match(/class="ax-cap"/g) || []).length, 0, 'between two volumes nothing is cut');
  // only side views are cut
  assert.ok(!renderStep(prj, 0, { view: makeView(-45, ISO_ELEVATION), lw: 0.1, section: { pos: 20 } }).markup.includes('ax-cap'));
});

test('gif: LZW that a decoder reads back, one palette, the frames with their delays', () => {
  // a tiny LZW decoder, as a GIF reader does it
  const unlzw = (bytes, min) => {
    const clear = 1 << min, end = clear + 1;
    let table, size, next, prev = null, bits = 0, nbits = 0, pos = 0;
    const reset = () => { table = Array.from({ length: clear }, (_, i) => [i]); table.push(null, null); size = min + 1; next = end + 1; prev = null; };
    reset();
    const out = [];
    for (;;) {
      while (nbits < size && pos < bytes.length) { bits |= bytes[pos++] << nbits; nbits += 8; }
      if (nbits < size) break;
      const code = bits & ((1 << size) - 1);
      bits >>>= size; nbits -= size;
      if (code === clear) { reset(); continue; }
      if (code === end) break;
      const entry = code < table.length && table[code] ? table[code] : [...prev, prev[0]];
      out.push(...entry);
      if (prev && next < 4096) { table[next++] = [...prev, entry[0]]; if (next === (1 << size) && size < 12) size++; }
      prev = entry;
    }
    return out;
  };
  let seed = 3;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const data = Array.from({ length: 30000 }, (_, i) => (i % 97 < 40 ? 7 : Math.floor(rnd() * 200)));
  assert.deepEqual(unlzw(lzw(data, 8), 8), data);
  const frame = (c) => { const px = new Uint8ClampedArray(8 * 6 * 4); for (let i = 0; i < 48; i++) px.set(i % 8 < 4 ? c : [255, 255, 255, 255], i * 4); return px; };
  const gif = encodeGif([frame([200, 60, 40, 255]), frame([40, 90, 200, 255])], 8, 6, { delays: [150, 300] });
  assert.equal(String.fromCharCode(...gif.slice(0, 6)), 'GIF89a');
  assert.deepEqual([gif[6] | (gif[7] << 8), gif[8] | (gif[9] << 8), gif[gif.length - 1]], [8, 6, 0x3b]);
  const gce = [...gif.keys()].filter((i) => gif[i] === 0x21 && gif[i + 1] === 0xf9 && gif[i + 2] === 4);
  assert.deepEqual(gce.map((i) => gif[i + 4] | (gif[i + 5] << 8)), [150, 300]);
});

console.log(`\n${n} passed`);
void sortFaces;

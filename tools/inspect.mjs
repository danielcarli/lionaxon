#!/usr/bin/env node
/*---------------------------------------------------------------------------------------------
 *  LionAxon — Copyright (C) 2026 LionAxon Team.
 *  Created and conceived by Daniel Michelon De Carli.
 *  Licensed under the GNU General Public License v3.0 or later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/
// Describes a project as JSON (schema 1), without opening the app and without changing anything.
// Made for people, scripts and AI agents.
//   node tools/inspect.mjs project.lionaxon [--objects] [--step N] [--svg N > step.svg]
import fs from 'node:fs';
import { normalizeProject, baseOf, indexById, changedVolumes, usedCategories, heightOf } from '../src/workbench/services/model/common/model.js';
import { renderStep, stepSvg } from '../src/workbench/services/render/common/renderer.js';
import { makeView } from '../src/base/common/geometry/projection.js';
import { rectRing } from '../src/base/common/geometry/polygon.js';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--') && !/^\d+$/.test(a));
if (!file) {
  console.error('usage: node tools/inspect.mjs <project.lionaxon> [--objects] [--step N] [--svg N]');
  process.exit(2);
}
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const prj = normalizeProject(JSON.parse(fs.readFileSync(file, 'utf8')));
const view = makeView(prj.view.az);

if (args.includes('--svg')) {
  const i = Math.max(0, Number(opt('--svg') || 1) - 1);
  process.stdout.write(stepSvg(prj, i, { view, width: 1200 }) + '\n');
  process.exit(0);
}

const r2 = (v) => Math.round(v * 100) / 100;
const only = opt('--step') ? Number(opt('--step')) - 1 : null;
const out = {
  schema: 2,
  name: prj.name,
  site: prj.site,
  style: prj.style,
  view: prj.view,
  levels: prj.levels,
  categories: prj.categories,
  sheet: prj.sheet,
  steps: prj.steps.map((s, i) => {
    if (only != null && only !== i) return null;
    const byId = indexById(s.objects);
    const vols = s.objects.filter((o) => o.type === 'volume');
    const outside = vols.filter((v) => rectRing(v.x, v.y, v.w, v.d, v.rot).some(([x, y]) => x < -1e-6 || y < -1e-6 || x > prj.site.w + 1e-6 || y > prj.site.d + 1e-6)).map((v) => v.id);
    const step = {
      number: i + 1,
      title: s.title,
      text: s.text,
      counts: Object.fromEntries(['volume', 'cut', 'arrow', 'person', 'label'].map((t) => [t, s.objects.filter((o) => o.type === t).length])),
      footprint: r2(vols.filter((v) => !v.on).reduce((a, v) => a + v.w * v.d, 0)),
      floorArea: r2(vols.reduce((a, v) => a + v.w * v.d * v.floors, 0)),
      maxHeight: r2(Math.max(0, ...vols.map((v) => baseOf(v, byId, p.levels) + heightOf(v)))),
      changed: s.highlight && i > 0 ? [...changedVolumes(prj.steps[i - 1], s)] : [],
      warnings: outside.length ? [{ code: 'outside-site', ids: outside }] : [],
      bounds: renderStep(prj, i, { view }).bbox.map(r2),
    };
    if (args.includes('--objects')) step.objects = s.objects;
    return step;
  }).filter(Boolean),
  legend: usedCategories(prj).map((u) => ({ id: u.cat.id, name: u.cat.name, volume: u.volume, arrow: u.arrow })),
};
console.log(JSON.stringify(out, null, 2));

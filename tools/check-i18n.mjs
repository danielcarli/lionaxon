/*---------------------------------------------------------------------------------------------
 *  LionAxon — Copyright (C) 2026 LionAxon Team.
 *  Created and conceived by Daniel Michelon De Carli.
 *  Licensed under the GNU General Public License v3.0 or later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/
// Checks the message catalogs: every key used in the code exists in English, every language has every
// key, and the {placeholders} match.   node tools/check-i18n.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nls = path.join(root, 'src', 'nls');
const locales = JSON.parse(fs.readFileSync(path.join(nls, 'locales.json'), 'utf8')).map((l) => l.id);
const cat = Object.fromEntries(locales.map((id) => [id, JSON.parse(fs.readFileSync(path.join(nls, `${id}.json`), 'utf8'))]));
const en = cat.en;
const problems = [];

// keys used with a literal string, plus the families built at run time
const used = new Set();
const dynamic = {
  'tool.': ['select', 'box', 'cut', 'terrain', 'arrow', 'person', 'label', 'tree', 'dim', 'align'],
  'update.how.': ['win-setup', 'mac-dmg', 'linux-appimage', 'linux-deb', 'linux-rpm', 'page'],
  'update.ready.': ['wizard', 'dmg', 'appimage', 'package'],
  'alignFaces.': ['notParallel', 'locked', 'stacked', 'nothing'],
  'tool.hint.': ['select', 'box', 'cut', 'terrain', 'arrow', 'person', 'label', 'tree', 'dim', 'site', 'poly', 'align'],
  'roof.': ['flat', 'gable', 'shed', 'hip'],
  'area.': ['street', 'green', 'water', 'paving'],
  'tree.': ['round', 'conifer'],
  'tool.hint.': ['select', 'box', 'cut', 'terrain', 'arrow', 'person', 'label'],
  'object.': ['volume', 'cut', 'platform', 'slope', 'arrow', 'person', 'label', 'area', 'tree', 'dim', 'opening'],
  'opening.': ['door', 'window', 'arch', 'oculus'],
  'opening.side.': ['front', 'right', 'back', 'left'],
  'style.': ['beige', 'lawn', 'blue', 'cotton', 'mint', 'lavender', 'peach', 'sky'],
  'shape.': ['box', 'cylinder', 'sphere', 'cone', 'pyramid', 'poly'],
  'terrain.': ['platform', 'slope', 'area'],
  'elements.': ['volume', 'cut', 'terrain', 'arrow', 'person', 'label', 'tree', 'dim', 'opening'],
  'person.pose': ['0', '1', '2', '3'],
  'state.': ['normal', 'accent', 'ghost', 'glass', 'context'],
  'corner.': ['se', 'ne', 'nw', 'sw'],
  'tab.': ['axon', 'plan', 'elev', 'sheet', 'orbit'],
  'orbit.preset.': ['iso', 'top', 'front', 'below', 'isoTip', 'topTip', 'frontTip', 'belowTip'],
  'example.': ['parti', 'plateaus', 'tower', 'slope', 'school', 'corner'],
  'elev.tool.': ['select', 'level'],
  'elev.hint.': ['select', 'level'],
  'elev.facing.': ['front', 'right', 'back', 'left'],
  'elev.facingTip.': ['front', 'right', 'back', 'left'],
  'activity.': ['steps', 'project', 'categories', 'sheet'],
};
for (const [prefix, list] of Object.entries(dynamic)) for (const k of list) used.add(prefix + k);
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
for (const file of walk(path.join(root, 'src')).filter((f) => /\.(m?js)$/.test(f) && !f.includes('vendor'))) {
  const src = fs.readFileSync(file, 'utf8');
  for (const m of src.matchAll(/\bt\('([a-zA-Z0-9_.]+)'/g)) if (!m[1].endsWith('.')) used.add(m[1]);
  for (const m of src.matchAll(/\btn\('([a-zA-Z0-9_.]+)'/g)) { used.add(m[1] + '.one'); used.add(m[1] + '.other'); }
  for (const m of src.matchAll(/'((?:shortcuts|statusbar|tool)\.[a-zA-Z.]+)'/g)) if (!m[1].endsWith('.')) used.add(m[1]);
}
for (const k of used) if (!(k in en) && !(`${k}.other` in en) && !/^(common\.files|common\.showIn|overview\.)/.test(k)) problems.push(`missing in en: ${k}`);
const ph = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
for (const id of locales) {
  for (const k of Object.keys(en)) {
    if (!(k in cat[id])) problems.push(`missing in ${id}: ${k}`);
    else if (ph(cat[id][k]) !== ph(en[k])) problems.push(`placeholders differ in ${id}: ${k}`);
  }
  for (const k of Object.keys(cat[id])) if (!(k in en)) problems.push(`unknown key in ${id}: ${k}`);
}
if (problems.length) { console.log(problems.join('\n')); process.exit(1); }
console.log(`i18n: ${Object.keys(en).length} keys, ${locales.length} languages, all complete`);

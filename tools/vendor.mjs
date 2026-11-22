/*---------------------------------------------------------------------------------------------
 *  LionAxon — Copyright (C) 2026 LionAxon Team.
 *  Created and conceived by Daniel Michelon De Carli.
 *  Licensed under the GNU General Public License v3.0 or later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/
// Rebuilds src/vendor/polygon-clipping/polygon-clipping.mjs (one ES module, with its two small
// dependencies inside) from the npm package. The app itself never downloads anything.
//   npm install && node tools/vendor.mjs
import { build } from 'esbuild';
import fs from 'node:fs';

await build({
  entryPoints: ['node_modules/polygon-clipping/dist/polygon-clipping.esm.js'],
  bundle: true, format: 'esm', minify: true,
  outfile: 'src/vendor/polygon-clipping/polygon-clipping.mjs',
});
fs.copyFileSync('node_modules/polygon-clipping/LICENSE.md', 'src/vendor/polygon-clipping/LICENSE.md');
console.log('vendored polygon-clipping', JSON.parse(fs.readFileSync('node_modules/polygon-clipping/package.json', 'utf8')).version);

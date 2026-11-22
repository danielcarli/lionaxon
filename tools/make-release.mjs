/*---------------------------------------------------------------------------------------------
 *  LionAxon — Copyright (C) 2026 LionAxon Team.
 *  Created and conceived by Daniel Michelon De Carli.
 *  Licensed under the GNU General Public License v3.0 or later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/
// What a release carries besides the installers, written into the folder that holds them:
//   manifest.txt      the version (the app reads it when asked to look for a new one) and each file
//   SHA256SUMS.txt    the checksums, in the format of `sha256sum -c`
//   RELEASE-NOTES.md  the section of this version in CHANGELOG.md, with the download table
// The installers themselves are built by electron-builder (see .github/workflows/release.yml).
//
//   node tools/make-release.mjs <folder with the installers>
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const dir = path.resolve(process.argv[2] || 'dist');

/** The files a release publishes, by their fixed names (the links of the README point to them). */
export const ASSETS = [
  ['LionAxon-Setup.exe', 'Windows 10/11 (x64) — setup'],
  ['LionAxon-win-x64.zip', 'Windows (x64) — portable, no installation'],
  ['LionAxon-mac-universal.dmg', 'macOS 12+ (Apple Silicon and Intel)'],
  ['lionaxon_amd64.deb', 'Linux (x64) — Ubuntu, Debian, Mint…'],
  ['lionaxon.x86_64.rpm', 'Linux (x64) — Fedora, RHEL, openSUSE…'],
  ['LionAxon-x86_64.AppImage', 'Linux (x64) — any distribution, no installation'],
];

const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

/** The section of a version in the changelog, without its heading. */
export function notesOf(changelog, v) {
  const start = changelog.indexOf(`## [${v}]`);
  if (start < 0) return '';
  const from = changelog.indexOf('\n', start) + 1;
  const next = changelog.indexOf('\n## [', from);
  return changelog.slice(from, next < 0 ? undefined : next).trim();
}

function main() {
  if (!fs.existsSync(dir)) { console.error(`No such folder: ${dir}`); process.exit(1); }
  const found = ASSETS.filter(([name]) => fs.existsSync(path.join(dir, name)));
  const missing = ASSETS.filter(([name]) => !fs.existsSync(path.join(dir, name))).map(([name]) => name);
  if (!found.length) { console.error(`No installer found in ${dir}. Expected: ${ASSETS.map((a) => a[0]).join(', ')}`); process.exit(1); }
  const rows = found.map(([name, what]) => { const file = path.join(dir, name); return { name, what, size: fs.statSync(file).size, sum: sha256(file) }; });

  fs.writeFileSync(path.join(dir, 'manifest.txt'), [`version=${version}`, ...rows.map((r) => `file=${r.name} sha256=${r.sum} size=${r.size}`)].join('\n') + '\n');
  fs.writeFileSync(path.join(dir, 'SHA256SUMS.txt'), rows.map((r) => `${r.sum}  ${r.name}`).join('\n') + '\n');

  const mb = (n) => `${(n / 1048576).toFixed(1)} MB`;
  const base = `https://github.com/danielcarli/lionaxon/releases/download/v${version}`;
  const notes = notesOf(fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8'), version);
  fs.writeFileSync(path.join(dir, 'RELEASE-NOTES.md'), [
    '## Download', '',
    '| System | File | Size |', '|---|---|---|',
    ...rows.map((r) => `| ${r.what} | [\`${r.name}\`](${base}/${r.name}) | ${mb(r.size)} |`),
    '',
    'The installers are not signed with a paid certificate yet. On first launch, Windows may show "Windows protected your PC" (**More info › Run anyway**) and macOS asks you to allow the app in **System Settings › Privacy & Security › Open Anyway**. The checksums are in `SHA256SUMS.txt`.',
    '', notes ? `## What changed\n\n${notes}` : '', '',
  ].join('\n'));

  console.log(`LionAxon ${version}: ${rows.length} file(s) in ${dir}`);
  for (const r of rows) console.log(`  ${r.sum.slice(0, 12)}…  ${mb(r.size).padStart(9)}  ${r.name}`);
  if (missing.length) console.log(`Not there (built on another system): ${missing.join(', ')}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

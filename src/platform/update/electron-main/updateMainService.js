/*---------------------------------------------------------------------------------------------
 *  LionAxon — Copyright (C) 2026 LionAxon Team.
 *  Created and conceived by Daniel Michelon De Carli.
 *  Licensed under the GNU General Public License v3.0 or later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/
// New versions: the only network access of the app, and only when the person clicks "Check now" in the
// versions window. Reads manifest.txt of the latest GitHub release (the same small file the installers
// of the Lion family use) and compares its version with this one. Nothing about the person or their
// files is sent. Updating opens the release page; the installers do the rest.
const { net, shell } = require('electron');
const fs = require('fs');
const path = require('path');

const REPO = 'danielcarli/lionaxon';
const RELEASES = `https://github.com/${REPO}/releases`;
const LATEST_PAGE = `${RELEASES}/latest`;
const MANIFEST = `${RELEASES}/latest/download/manifest.txt`;
const VERSION_RE = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.]+))?$/;
const TIMEOUT_MS = 15000;

/** Semantic version comparison: 1.0.10 > 1.0.9, and 1.1.0 > 1.1.0-beta.1. */
function compareVersions(a, b) {
  const pa = VERSION_RE.exec(a);
  const pb = VERSION_RE.exec(b);
  if (!pa || !pb) return 0;
  for (let i = 1; i <= 3; i++) {
    const d = Number(pa[i]) - Number(pb[i]);
    if (d) return Math.sign(d);
  }
  if (pa[4] === pb[4]) return 0;
  if (!pa[4]) return 1;
  if (!pb[4]) return -1;
  return pa[4] < pb[4] ? -1 : 1;
}

class UpdateMainService {
  constructor(appRoot) {
    this.version = JSON.parse(fs.readFileSync(path.join(appRoot, 'package.json'), 'utf8')).version;
  }

  registerChannels(ipc) {
    ipc.handle('update:check', () => this.check());
    ipc.handle('update:openReleasePage', () => shell.openExternal(LATEST_PAGE).then(() => true, () => false));
  }

  async check() {
    const base = { current: this.version, checkedAt: Date.now() };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await net.fetch(MANIFEST, { signal: controller.signal, headers: { 'User-Agent': `LionAxon/${this.version}` } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = (await res.text()).slice(0, 4096);
      const latest = /^version=(.+)$/m.exec(text)?.[1].trim();
      if (!latest || !VERSION_RE.test(latest)) throw new Error('unexpected manifest');
      return { ...base, ok: true, latest, available: compareVersions(latest, this.version) > 0 };
    } catch (err) {
      return { ...base, ok: false, error: err.name === 'AbortError' ? 'timeout' : String(err.message || err) };
    } finally {
      clearTimeout(timer);
    }
  }
}

module.exports = { UpdateMainService, compareVersions };

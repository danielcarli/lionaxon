/*---------------------------------------------------------------------------------------------
 *  LionAxon — Copyright (C) 2026 LionAxon Team.
 *  Created and conceived by Daniel Michelon De Carli.
 *  Licensed under the GNU General Public License v3.0 or later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/
// New versions, as in the other apps of the Lion family. The only network access of the app, and only when the
// person clicks in the versions window:
//   "Check now"   reads manifest.txt of the latest GitHub release (its version, and the name, SHA-256 and size
//                 of each installer) and compares the version with this one;
//   "Update now"  downloads the installer of this copy — the setup wizard on Windows, the .dmg on macOS, the
//                 AppImage, the .deb or the .rpm on Linux — keeps it only if its SHA-256 is the one of the
//                 manifest, and opens it. A copy that no installer put there (the source, the portable .zip)
//                 gets the page of the release instead.
// Nothing about the person or their files is sent.
const { app, net, shell } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const REPO = 'danielcarli/lionaxon';
const RELEASES = `https://github.com/${REPO}/releases`;
const LATEST_PAGE = `${RELEASES}/latest`;
const VERSION_RE = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.]+))?$/;
const TIMEOUT_MS = 15000;
const MAX_BYTES = 600 * 1024 * 1024;   // no installer is anywhere near this

/** The installer of each kind of copy, by its fixed name in the release. */
const INSTALLERS = {
  'win-setup': 'LionAxon-Setup.exe',
  'mac-dmg': 'LionAxon-mac-universal.dmg',
  'linux-appimage': 'LionAxon-x86_64.AppImage',
  'linux-deb': 'lionaxon_amd64.deb',
  'linux-rpm': 'lionaxon.x86_64.rpm',
};

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

/** manifest.txt as { version, files: Map(name → { sha256, size }) }, or null when it is not one. */
function parseManifest(text) {
  const version = /^version=(.+)$/m.exec(text)?.[1].trim();
  if (!version || !VERSION_RE.test(version)) return null;
  const files = new Map();
  for (const m of text.matchAll(/^file=(\S+) sha256=([0-9a-f]{64}) size=(\d+)$/gm)) files.set(m[1], { sha256: m[2], size: Number(m[3]) });
  return { version, files };
}

/**
 * How this copy was installed, which says how it is updated. `probe` stands for the machine in the tests:
 * { platform, packaged, exePath, env, exists(path) }.
 */
function installKind(probe) {
  const { platform, packaged, exePath, env, exists } = probe;
  if (!packaged) return 'source';
  if (platform === 'win32') {
    // the setup wizard leaves its uninstaller beside the program; the portable .zip has none
    return exists(path.win32.join(path.win32.dirname(exePath), 'Uninstall LionAxon.exe')) ? 'win-setup' : 'portable';
  }
  if (platform === 'darwin') return 'mac-dmg';
  if (platform === 'linux') {
    if (env.APPIMAGE) return 'linux-appimage';
    if (exists('/var/lib/dpkg/info/lionaxon.list')) return 'linux-deb';
    if (exePath.startsWith('/opt/') && (exists('/var/lib/rpm') || exists('/usr/lib/sysimage/rpm'))) return 'linux-rpm';
  }
  return 'portable';
}

class UpdateMainService {
  constructor(appRoot) {
    this.version = JSON.parse(fs.readFileSync(path.join(appRoot, 'package.json'), 'utf8')).version;
    // the tests point the service to a local "release" and say which kind of copy this is; never in an installed copy
    const test = !app.isPackaged && process.env.LIONAXON_UPDATE_BASE;
    this.base = test ? process.env.LIONAXON_UPDATE_BASE.replace(/\/$/, '') : `${RELEASES}/latest/download`;
    this.kind = test && process.env.LIONAXON_UPDATE_KIND ? process.env.LIONAXON_UPDATE_KIND : installKind({
      platform: process.platform, packaged: app.isPackaged, exePath: process.execPath, env: process.env, exists: (p) => fs.existsSync(p),
    });
    this.dry = !!test;                 // download and check, but do not run the installer
    this.requests = 0;                 // how many times the network was used (the tests count them)
    this.busy = false;
  }

  registerChannels(ipc) {
    ipc.handle('update:check', () => this.check());
    ipc.handle('update:install', (e) => this.install((p) => { if (!e.sender.isDestroyed()) e.sender.send('update:progress', p); }));
    ipc.handle('update:openReleasePage', () => shell.openExternal(LATEST_PAGE).then(() => true, () => false));
  }

  async #fetch(name, signal) {
    this.requests++;
    const res = await net.fetch(`${this.base}/${name}`, { signal, headers: { 'User-Agent': `LionAxon/${this.version}` } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res;
  }

  async #manifest() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const manifest = parseManifest((await (await this.#fetch('manifest.txt', controller.signal)).text()).slice(0, 8192));
      if (!manifest) throw new Error('unexpected manifest');
      return manifest;
    } finally {
      clearTimeout(timer);
    }
  }

  async check() {
    const base = { current: this.version, checkedAt: Date.now(), kind: this.kind, installer: INSTALLERS[this.kind] || null };
    try {
      const manifest = await this.#manifest();
      // "Update now" is offered only where the release has the installer of this copy, with its checksum
      const canInstall = !!base.installer && manifest.files.has(base.installer);
      return { ...base, ok: true, latest: manifest.version, available: compareVersions(manifest.version, this.version) > 0, canInstall };
    } catch (err) {
      return { ...base, ok: false, error: err.name === 'AbortError' ? 'timeout' : String(err.message || err) };
    }
  }

  /**
   * Downloads the installer of this copy, checks it and opens it. Answers { ok, how, file } — how the update
   * goes on from here ('wizard', 'dmg', 'appimage', 'package') — or { ok: false, error }: 'page' (no installer
   * for this copy), 'current', 'checksum', 'size', or what the network said.
   */
  async install(onProgress = () => {}) {
    if (this.busy) return { ok: false, error: 'busy' };
    const name = INSTALLERS[this.kind];
    if (!name) return { ok: false, error: 'page' };
    this.busy = true;
    let part = null;
    try {
      const manifest = await this.#manifest();
      if (compareVersions(manifest.version, this.version) <= 0) return { ok: false, error: 'current' };
      const want = manifest.files.get(name);
      if (!want) return { ok: false, error: 'page' };
      if (want.size > MAX_BYTES) return { ok: false, error: 'size' };

      // the AppImage is replaced where it is; everything else is kept where the person finds it again
      const dir = this.dry ? (process.env.LIONAXON_TEST_DIR || os.tmpdir())
        : this.kind === 'linux-appimage' ? path.dirname(process.env.APPIMAGE)
        : this.kind === 'win-setup' ? fs.mkdtempSync(path.join(os.tmpdir(), 'lionaxon-update-'))
          : app.getPath('downloads');
      const file = path.join(dir, this.kind === 'linux-appimage' ? `${name}.new` : name);
      part = `${file}.part`;

      const res = await this.#fetch(name);
      const hash = crypto.createHash('sha256');
      const out = fs.createWriteStream(part);
      let got = 0, last = 0;
      onProgress({ received: 0, total: want.size });
      for await (const chunk of res.body) {
        got += chunk.length;
        if (got > want.size) { out.destroy(); throw Object.assign(new Error('size'), { code: 'size' }); }
        hash.update(chunk);
        if (!out.write(chunk)) await new Promise((r) => out.once('drain', r));
        if (Date.now() - last > 120) { last = Date.now(); onProgress({ received: got, total: want.size }); }
      }
      await new Promise((resolve, reject) => out.end((err) => (err ? reject(err) : resolve())));
      onProgress({ received: got, total: want.size });
      // kept only if it is the file the release says it is
      if (got !== want.size || hash.digest('hex') !== want.sha256) throw Object.assign(new Error('checksum'), { code: 'checksum' });
      fs.renameSync(part, file);
      part = null;
      return { ok: true, version: manifest.version, ...(await this.#open(file)) };
    } catch (err) {
      return { ok: false, error: err.code === 'checksum' || err.code === 'size' ? err.code : String(err.message || err) };
    } finally {
      if (part) fs.rm(part, { force: true }, () => {});
      this.busy = false;
    }
  }

  /** Opens what was downloaded, as each kind of copy is updated. */
  async #open(file) {
    const how = { 'win-setup': 'wizard', 'mac-dmg': 'dmg', 'linux-appimage': 'appimage', 'linux-deb': 'package', 'linux-rpm': 'package' }[this.kind];
    if (this.dry) return { how, file };
    if (this.kind === 'win-setup') {
      // the wizard installs over this copy, which has to be closed for that
      spawn(file, [], { detached: true, stdio: 'ignore' }).unref();
      setTimeout(() => app.quit(), 800);
    } else if (this.kind === 'mac-dmg') {
      // the .dmg opens in the Finder: the person drags the app to Applications once this copy is closed
      await shell.openPath(file);
    } else if (this.kind === 'linux-appimage') {
      const current = process.env.APPIMAGE;
      fs.chmodSync(file, 0o755);
      fs.renameSync(file, current);
      app.relaunch({ execPath: current, args: [] });
      setTimeout(() => app.quit(), 800);
      return { how, file: current };
    } else {
      // the .deb or the .rpm opens in the program of the system that installs packages
      const error = await shell.openPath(file);
      if (error) shell.showItemInFolder(file);
    }
    return { how, file };
  }
}

module.exports = { UpdateMainService, compareVersions, parseManifest, installKind, INSTALLERS };

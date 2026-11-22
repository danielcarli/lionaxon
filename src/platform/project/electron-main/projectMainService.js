/*---------------------------------------------------------------------------------------------
 *  LionAxon — Copyright (C) 2026 LionAxon Team.
 *  Created and conceived by Daniel Michelon De Carli.
 *  Licensed under the GNU General Public License v3.0 or later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/
// Project files: open and save .lionaxon files (JSON text), the examples that come with the app, and
// the recovery copy written while the person works (so closing without saving never loses work).
// The renderer never names a path to read: it asks to open (a native dialog), to save (a dialog, or the
// file it opened) or to reopen the recovery copy. Writes go to a temporary file first, then replace.
const { app, dialog, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const { t } = require('../../nls/common/nls');

const MAX_BYTES = 50 * 1024 * 1024;
const MAX_RECENT = 10;
const MAX_IMAGE_BYTES = 40 * 1024 * 1024;
/** The examples that come with the app (examples/<id>-<lang>.lionaxon). */
const EXAMPLES = ['parti', 'plateaus', 'tower', 'slope', 'school', 'corner'];
const FILTERS = () => [{ name: t('dialog.projectFilter'), extensions: ['lionaxon'] }];

function writeAtomic(file, text) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text, 'utf8');
  fs.renameSync(tmp, file);
}

function readProject(file) {
  const stat = fs.statSync(file);
  if (!stat.isFile()) throw new Error('not a file');
  if (stat.size > MAX_BYTES) throw new Error('file too large');
  return fs.readFileSync(file, 'utf8');
}

class ProjectMainService {
  constructor(appRoot) {
    this.appRoot = appRoot;
    // Files the person chose in a dialog (or opened by double-click): only these may be written back.
    this.known = new Set();
  }

  get recoveryDir() { return path.join(app.getPath('userData'), 'recovery'); }
  get recentFile() { return path.join(app.getPath('userData'), 'recent.json'); }

  // ---- recent files: the last projects opened or saved (paths only, kept by this process)

  #readRecent() {
    try {
      const list = JSON.parse(fs.readFileSync(this.recentFile, 'utf8'));
      return Array.isArray(list) ? list.filter((f) => typeof f === 'string' && /\.lionaxon$/i.test(f)).slice(0, MAX_RECENT) : [];
    } catch { return []; }
  }

  #addRecent(file) {
    try {
      const f = path.resolve(file);
      const list = [f, ...this.#readRecent().filter((x) => x !== f)].slice(0, MAX_RECENT);
      writeAtomic(this.recentFile, JSON.stringify(list));
    } catch { /* the list is a convenience: never in the way of opening or saving */ }
  }

  /** The recent files that still exist, newest first. */
  recent() {
    return this.#readRecent().filter((f) => fs.existsSync(f)).map((f) => ({ path: f, name: path.basename(f).replace(/\.lionaxon$/i, ''), dir: path.dirname(f) }));
  }

  clearRecent() {
    try { fs.rmSync(this.recentFile, { force: true }); } catch { /* nothing to clear */ }
    return true;
  }

  registerChannels(ipc) {
    ipc.handle('project:open', (e) => this.open(e));
    ipc.handle('project:openPath', (_e, file) => this.openPath(file));
    ipc.handle('project:save', (e, file, text, suggested) => this.save(e, file, text, suggested));
    ipc.handle('project:recent', () => this.recent());
    ipc.handle('project:pickImage', (e) => this.pickImage(e));
    ipc.handle('project:clearRecent', () => this.clearRecent());
    ipc.handle('project:example', (_e, lang, id) => this.example(String(lang), String(id || 'parti')));
    ipc.handle('recovery:write', (_e, text, meta) => this.writeRecovery(text, meta));
    ipc.handle('recovery:read', () => this.readRecovery());
    ipc.handle('recovery:clear', () => this.clearRecovery());
  }

  async open(event) {
    const win = BrowserWindow.fromWebContents(event.sender);
    const res = await dialog.showOpenDialog(win, { title: t('dialog.openTitle'), properties: ['openFile'], filters: FILTERS() });
    if (res.canceled || !res.filePaths[0]) return null;
    return this.openPath(res.filePaths[0], true);
  }

  /** Opens a file given on the command line or chosen in a dialog. */
  openPath(file, chosen = false) {
    if (typeof file !== 'string' || !/\.lionaxon$/i.test(file)) return { ok: false, error: 'not-a-project' };
    // a path coming from the UI is only accepted if it came from the command line (double-click) or a dialog
    if (!chosen && !this.allowedToOpen(file)) return { ok: false, error: 'not-allowed' };
    try {
      const text = readProject(file);
      this.known.add(path.resolve(file));
      this.#addRecent(file);
      return { ok: true, path: path.resolve(file), name: path.basename(file), text };
    } catch (err) {
      return { ok: false, error: String(err.message || err) };
    }
  }

  allowedToOpen(file) {
    const f = path.resolve(file);
    if (this.known.has(f)) return true;
    if (this.#readRecent().includes(f)) return true; // a file this app opened or saved before
    if (process.argv.some((a) => path.resolve(a) === f)) return true;
    if (this.pendingOpen && path.resolve(this.pendingOpen) === f) return true;
    if (process.env.LIONAXON_TEST_DIR && f.startsWith(path.resolve(process.env.LIONAXON_TEST_DIR) + path.sep)) return true;
    return false;
  }

  async save(event, file, text, suggested) {
    if (typeof text !== 'string' || text.length > MAX_BYTES) return { ok: false, error: 'invalid' };
    let target = typeof file === 'string' && file ? path.resolve(file) : null;
    if (target && !this.known.has(target)) target = null; // never write where the person did not choose
    if (!target) {
      const testDir = process.env.LIONAXON_TEST_DIR;
      if (testDir) {
        target = path.join(testDir, sanitize(suggested || 'project') + '.lionaxon');
      } else {
        const win = BrowserWindow.fromWebContents(event.sender);
        const res = await dialog.showSaveDialog(win, {
          title: t('dialog.saveTitle'),
          defaultPath: path.join(app.getPath('documents'), sanitize(suggested || t('dialog.untitled')) + '.lionaxon'),
          filters: FILTERS(),
        });
        if (res.canceled || !res.filePath) return null;
        target = res.filePath.toLowerCase().endsWith('.lionaxon') ? res.filePath : res.filePath + '.lionaxon';
      }
    }
    try {
      writeAtomic(target, text);
      this.known.add(target);
      this.#addRecent(target);
      return { ok: true, path: target, name: path.basename(target) };
    } catch (err) {
      return { ok: false, error: String(err.message || err) };
    }
  }

  /**
   * An image chosen by the person (a site plan, an aerial photo) as a data URL, to lie under the drawing.
   * The renderer never names the file: it only receives what was picked in the dialog.
   */
  async pickImage(event) {
    let file;
    const testDir = process.env.LIONAXON_TEST_DIR;
    if (testDir) file = path.join(testDir, 'underlay.png');
    else {
      const win = BrowserWindow.fromWebContents(event.sender);
      const res = await dialog.showOpenDialog(win, { title: t('dialog.imageTitle'), properties: ['openFile'], filters: [{ name: t('dialog.imageFilter'), extensions: ['png', 'jpg', 'jpeg', 'webp'] }] });
      if (res.canceled || !res.filePaths[0]) return null;
      file = res.filePaths[0];
    }
    try {
      const ext = path.extname(file).slice(1).toLowerCase();
      const mime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' }[ext];
      if (!mime) return { ok: false, error: 'not-an-image' };
      const stat = fs.statSync(file);
      if (!stat.isFile() || stat.size > MAX_IMAGE_BYTES) return { ok: false, error: 'file too large' };
      return { ok: true, name: path.basename(file), dataUrl: `data:${mime};base64,${fs.readFileSync(file).toString('base64')}` };
    } catch (err) {
      return { ok: false, error: String(err.message || err) };
    }
  }

  /** One of the examples that come with the app, in the language of the interface (English otherwise). */
  example(lang, id = 'parti') {
    if (!EXAMPLES.includes(id)) return { ok: false, error: 'missing' };
    const dir = path.join(this.appRoot, 'examples');
    const file = [`${id}-${lang}.lionaxon`, lang.startsWith('pt') ? `${id}-pt-BR.lionaxon` : null, `${id}-en.lionaxon`].filter(Boolean).map((f) => path.join(dir, f)).find((f) => fs.existsSync(f));
    if (!file) return { ok: false, error: 'missing' };
    return { ok: true, text: fs.readFileSync(file, 'utf8') };
  }

  writeRecovery(text, meta) {
    if (typeof text !== 'string' || text.length > MAX_BYTES) return false;
    try {
      fs.mkdirSync(this.recoveryDir, { recursive: true });
      writeAtomic(path.join(this.recoveryDir, 'current.lionaxon'), text);
      // the files of the open tabs: only those this process itself opened or saved are remembered as
      // known, so the next session may reopen (and write) them without asking again
      let paths = [];
      try {
        const data = JSON.parse(text);
        if (Array.isArray(data?.tabs)) paths = data.tabs.map((x) => x?.path).filter((f) => typeof f === 'string' && this.known.has(path.resolve(f)));
      } catch { /* a 0.1 single project */ }
      const m = { path: typeof meta?.path === 'string' ? meta.path : null, paths, dirty: !!meta?.dirty, savedAt: Date.now() };
      writeAtomic(path.join(this.recoveryDir, 'current.json'), JSON.stringify(m));
      if (m.path) this.known.add(path.resolve(m.path));
      return true;
    } catch {
      return false;
    }
  }

  readRecovery() {
    try {
      const text = fs.readFileSync(path.join(this.recoveryDir, 'current.lionaxon'), 'utf8');
      let meta = {};
      try { meta = JSON.parse(fs.readFileSync(path.join(this.recoveryDir, 'current.json'), 'utf8')); } catch { /* text alone */ }
      // the file it came from may have been moved or deleted since: it is then treated as unsaved
      const exists = meta.path && fs.existsSync(meta.path);
      if (exists) this.known.add(path.resolve(meta.path));
      for (const f of Array.isArray(meta.paths) ? meta.paths : []) {
        if (typeof f === 'string' && /\.lionaxon$/i.test(f) && fs.existsSync(f)) this.known.add(path.resolve(f));
      }
      return { text, path: exists ? meta.path : null, dirty: !!meta.dirty || (meta.path && !exists), savedAt: meta.savedAt || 0 };
    } catch {
      return null;
    }
  }

  clearRecovery() {
    fs.rmSync(this.recoveryDir, { recursive: true, force: true });
    return true;
  }
}

const sanitize = (name) => String(name).replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').trim().slice(0, 120) || 'project';

module.exports = { ProjectMainService, sanitize };

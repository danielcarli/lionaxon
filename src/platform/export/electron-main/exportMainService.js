/*---------------------------------------------------------------------------------------------
 *  LionAxon — Copyright (C) 2026 LionAxon Team.
 *  Created and conceived by Daniel Michelon De Carli.
 *  Licensed under the GNU General Public License v3.0 or later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/
// Exporting the sheet or a step: SVG (the same vector the screen shows), PNG (drawn by the window at the
// chosen resolution, bytes sent here) and PDF (the SVG printed by a hidden window, with the fonts embedded).
// The file name and folder are always chosen by the person in a native dialog.
const { app, dialog, BrowserWindow, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { t } = require('../../nls/common/nls');
const { sanitize } = require('../../project/electron-main/projectMainService');

const KINDS = {
  svg: { ext: 'svg', filter: () => t('dialog.svgFilter') },
  png: { ext: 'png', filter: () => t('dialog.pngFilter') },
  pdf: { ext: 'pdf', filter: () => t('dialog.pdfFilter') },
  gif: { ext: 'gif', filter: () => t('dialog.gifFilter') },
};

class ExportMainService {
  constructor(scheme) {
    this.scheme = scheme;
    this.lastDir = null;
    this.folders = new Set(); // the folders written in this session (only these can be shown)
  }

  registerChannels(ipc) {
    // a sheet of several pages: SVG and PNG come as a list (one file per page), the PDF as one file
    const many = (x, conv) => (Array.isArray(x) ? x.slice(0, 200).map(conv) : conv(x));
    ipc.handle('export:svg', (e, name, text) => this.write(e, 'svg', name, () => many(text, (v) => Buffer.from(String(v), 'utf8'))));
    ipc.handle('export:gif', (e, name, bytes) => this.write(e, 'gif', name, () => Buffer.from(bytes)));
    ipc.handle('export:png', (e, name, bytes) => this.write(e, 'png', name, () => many(bytes, (v) => Buffer.from(v))));
    ipc.on('export:showFolder', (_e, dir) => { const d = path.resolve(String(dir || '')); if (this.folders.has(d)) shell.openPath(d); });
    ipc.handle('export:steps', (e, folder, files) => this.writeSteps(e, String(folder || 'lionaxon'), Array.isArray(files) ? files.slice(0, 600) : []));
    ipc.handle('export:pdf', (e, name, svg, w, h) => this.write(e, 'pdf', name, () => this.printPdf(Array.isArray(svg) ? svg.slice(0, 200).map(String) : [String(svg)], Number(w), Number(h))));
  }

  async target(event, kind, name) {
    const ext = KINDS[kind].ext;
    const file = `${sanitize(name || 'lionaxon')}.${ext}`;
    if (process.env.LIONAXON_TEST_DIR) return path.join(process.env.LIONAXON_TEST_DIR, file);
    const win = BrowserWindow.fromWebContents(event.sender);
    const res = await dialog.showSaveDialog(win, {
      title: t('dialog.exportTitle'),
      defaultPath: path.join(this.lastDir || app.getPath('documents'), file),
      filters: [{ name: KINDS[kind].filter(), extensions: [ext] }],
    });
    if (res.canceled || !res.filePath) return null;
    return res.filePath.toLowerCase().endsWith('.' + ext) ? res.filePath : `${res.filePath}.${ext}`;
  }

  async write(event, kind, name, produce) {
    try {
      const file = await this.target(event, kind, name);
      if (!file) return null;
      const data = await produce();
      this.lastDir = path.dirname(file);
      if (Array.isArray(data)) {
        if (data.length === 1) { fs.writeFileSync(file, data[0]); return { ok: true, path: file, name: path.basename(file), bytes: data[0].length }; }
        // pages: "name-1.png", "name-2.png"… next to the name chosen
        const ext = path.extname(file), stem = file.slice(0, file.length - ext.length);
        const files = data.map((d, i) => { const f = `${stem}-${i + 1}${ext}`; fs.writeFileSync(f, d); return f; });
        return { ok: true, path: files[0], paths: files, name: path.basename(files[0]), pages: files.length, bytes: data.reduce((n, d) => n + d.length, 0) };
      }
      fs.writeFileSync(file, data);
      return { ok: true, path: file, name: path.basename(file), bytes: data.length };
    } catch (err) {
      return { ok: false, error: String(err.message || err) };
    }
  }

  /**
   * The files of every step (PNG bytes, SVG text, PDF to print), in a folder of their own inside the one the
   * person chooses: "<project> — steps". A file of the same name there is replaced (exporting again updates them).
   */
  async writeSteps(event, folder, files) {
    try {
      let base;
      if (process.env.LIONAXON_TEST_DIR) base = process.env.LIONAXON_TEST_DIR;
      else {
        const win = BrowserWindow.fromWebContents(event.sender);
        const res = await dialog.showOpenDialog(win, {
          title: t('dialog.exportStepsTitle'), buttonLabel: t('dialog.exportStepsButton'),
          defaultPath: this.lastDir || app.getPath('documents'), properties: ['openDirectory', 'createDirectory'],
        });
        if (res.canceled || !res.filePaths[0]) return null;
        base = res.filePaths[0];
      }
      this.lastDir = base;
      const dir = path.join(base, sanitize(folder));
      fs.mkdirSync(dir, { recursive: true });
      this.folders.add(path.resolve(dir));
      const written = [];
      for (const f of files) {
        const kind = KINDS[f?.kind] && f.kind !== 'gif' ? f.kind : null;
        if (!kind) continue;
        const file = path.join(dir, `${sanitize(f.name)}.${KINDS[kind].ext}`);
        const data = kind === 'svg' ? Buffer.from(String(f.data), 'utf8')
          : kind === 'png' ? Buffer.from(f.data)
          : await this.printPdf([String(f.svg)], Number(f.w), Number(f.h));
        fs.writeFileSync(file, data);
        written.push(file);
      }
      return { ok: true, dir, paths: written, count: written.length, name: path.basename(dir) };
    } catch (err) {
      return { ok: false, error: String(err.message || err) };
    }
  }

  /** Prints the sheet's pages (SVG) to a PDF of exactly the paper size (millimetres), in a hidden window. */
  async printPdf(pages, widthMm, heightMm) {
    if (!(widthMm > 0 && heightMm > 0)) throw new Error('invalid size');
    const win = new BrowserWindow({
      show: false, width: 1200, height: 900,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, javascript: true },
    });
    try {
      await win.loadURL(`${this.scheme}://bundle/src/workbench/browser/print.html`);
      await win.webContents.executeJavaScript(`(async () => {
        const st = document.createElement('style');
        st.textContent = '@page { size: ${widthMm}mm ${heightMm}mm; margin: 0 } html, body { margin: 0; padding: 0 } body > svg { display: block; width: ${widthMm}mm; height: ${heightMm}mm; break-after: page } body > svg:last-child { break-after: auto }';
        document.head.append(st);
        document.body.innerHTML = ${JSON.stringify(pages.join(''))};
        await document.fonts.ready;
        await Promise.all([...document.fonts].map((f) => f.load().catch(() => null)));
        return true;
      })()`);
      return await win.webContents.printToPDF({ preferCSSPageSize: true, printBackground: true, margins: { top: 0, bottom: 0, left: 0, right: 0 } });
    } finally {
      win.destroy();
    }
  }
}

module.exports = { ExportMainService };

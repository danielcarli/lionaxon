/*---------------------------------------------------------------------------------------------
 *  LionAxon — Copyright (C) 2026 LionAxon Team.
 *  Created and conceived by Daniel Michelon De Carli.
 *  Licensed under the GNU General Public License v3.0 or later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/
// The import of an IFC file: the person chooses it in a native dialog, a worker thread reads it (a model of
// hundreds of megabytes takes a while, and the window must not stop), the window hears how far it got
// and may cancel. What comes back is small: see ../node/ifcReader.js.
'use strict';
const fs = require('fs');
const path = require('path');
const { Worker } = require('worker_threads');
const { dialog, BrowserWindow } = require('electron');
const { t } = require('../../nls/common/nls');

class IfcMainService {
  constructor() { this.worker = null; }

  registerChannels(ipc) {
    ipc.handle('import:ifc', (e) => this.pick(e));
    ipc.handle('import:cancel', () => this.cancel());
  }

  async pick(event) {
    let file;
    const testDir = process.env.LIONAXON_TEST_DIR;
    if (testDir && fs.existsSync(path.join(testDir, 'import.ifc'))) file = path.join(testDir, 'import.ifc');
    else {
      const win = BrowserWindow.fromWebContents(event.sender);
      const res = await dialog.showOpenDialog(win, { title: t('dialog.ifcTitle'), properties: ['openFile'], filters: [{ name: 'IFC', extensions: ['ifc'] }] });
      if (res.canceled || !res.filePaths[0]) return null;
      file = res.filePaths[0];
    }
    const name = path.basename(file).replace(/\.ifc$/i, '');
    let size = 0;
    try { size = fs.statSync(file).size; } catch { /* read below */ }
    const send = (p) => { if (!event.sender.isDestroyed()) event.sender.send('import:progress', { name, size, ...p }); };
    send({ stage: 'start' });
    const result = await this.#read(file, send);
    if (result.cancelled) return { ok: false, cancelled: true };
    if (result.error) return { ok: false, error: result.error };
    return { ok: true, name, ...result.data };
  }

  cancel() {
    if (!this.worker) return false;
    this.cancelled = true;
    this.worker.terminate();
    return true;
  }

  /** The file read in a worker thread; inside the app archive, the worker's script sits unpacked beside it. */
  #read(file, send) {
    this.cancel();
    this.cancelled = false;
    return new Promise((resolve) => {
      const script = path.join(__dirname, '..', 'node', 'ifcWorker.js').replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');
      let worker;
      try {
        worker = new Worker(script, { workerData: { file }, resourceLimits: { maxOldGenerationSizeMb: 4096 } });
      } catch (err) {
        resolve({ error: String(err?.message || err) });
        return;
      }
      this.worker = worker;
      let settled = false;
      const done = (v) => { if (settled) return; settled = true; this.worker = null; resolve(v); };
      worker.on('message', (m) => {
        if (m.progress) send(m.progress);
        else if (m.error) done({ error: m.error });
        else if (m.data) done({ data: m.data });
      });
      worker.on('error', (err) => done({ error: String(err?.message || err) }));
      worker.on('exit', (code) => done(this.cancelled ? { cancelled: true } : { error: code ? `worker ${code}` : 'no-data' }));
    });
  }
}

module.exports = { IfcMainService };

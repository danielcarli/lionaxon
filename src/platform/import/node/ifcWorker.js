/*---------------------------------------------------------------------------------------------
 *  LionAxon — Copyright (C) 2026 LionAxon Team.
 *  Created and conceived by Daniel Michelon De Carli.
 *  Licensed under the GNU General Public License v3.0 or later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/
// The worker thread that reads an IFC file: it says how far it got, and sends back what it found (the
// triangles moved, not copied).
'use strict';
const fs = require('fs');
const { parentPort, workerData } = require('worker_threads');
const { readIfc } = require('./ifcReader');

(async () => {
  try {
    parentPort.postMessage({ progress: { stage: 'file' } });
    const bytes = fs.readFileSync(workerData.file);
    const data = await readIfc(bytes, (progress) => parentPort.postMessage({ progress }));
    // all the triangles in one array (one big array crosses to the window much quicker than many small
    // ones); each element keeps where its own are: tris = [start, end]
    const pack = new Float32Array(data.elements.reduce((n, e) => n + e.tris.length, 0));
    let at = 0;
    for (const e of data.elements) { pack.set(e.tris, at); e.tris = [at, at + e.tris.length]; at += e.tris[1] - e.tris[0]; }
    parentPort.postMessage({ data: { ...data, pack } }, [pack.buffer]);
  } catch (err) {
    parentPort.postMessage({ error: String(err?.message || err) });
  }
})();

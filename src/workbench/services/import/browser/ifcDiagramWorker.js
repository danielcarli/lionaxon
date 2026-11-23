/*---------------------------------------------------------------------------------------------
 *  LionAxon — Copyright (C) 2026 LionAxon Team.
 *  Created and conceived by Daniel Michelon De Carli.
 *  Licensed under the GNU General Public License v3.0 or later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/
// Makes the diagram of a building model away from the window (a module worker): the outlines of a big
// model take a while, and the window must keep answering. It says how far it got.
import { diagramFromIfc } from '../common/ifcDiagram.js';

self.onmessage = (e) => {
  const { data, opts, words } = e.data;
  try {
    // the triangles of every element come in one array: each element gets its own part of it
    if (data.pack) for (const el of data.elements) if (Array.isArray(el.tris)) el.tris = data.pack.subarray(el.tris[0], el.tris[1]);
    const t = (key) => words[key] ?? key;
    const result = diagramFromIfc(data, t, { ...opts, onProgress: (p) => self.postMessage({ progress: p }) });
    self.postMessage({ result });
  } catch (err) {
    self.postMessage({ error: String(err?.message || err) });
  }
};

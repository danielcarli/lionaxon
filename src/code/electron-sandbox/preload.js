/*---------------------------------------------------------------------------------------------
 *  LionAxon — Copyright (C) 2026 LionAxon Team.
 *  Created and conceived by Daniel Michelon De Carli.
 *  Licensed under the GNU General Public License v3.0 or later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/
// Secure bridge between the UI (no Node access) and the main process.
// Runs sandboxed: exposes only these functions, nothing else.
const { contextBridge, ipcRenderer } = require('electron');

const on = (channel) => (cb) => {
  const listener = (_e, p) => cb(p);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld('host', {
  platform: process.platform,
  setTheme: (dark, theme) => ipcRenderer.send('window:setTheme', !!dark, String(theme || '')),
  setTitle: (title) => ipcRenderer.send('window:setTitle', String(title)),
  setLocale: (locale) => ipcRenderer.send('nls:setLocale', locale),
  reloadWindow: () => ipcRenderer.send('window:reload'),
  appInfo: () => ipcRenderer.invoke('app:info'),
  takeInitialFile: () => ipcRenderer.invoke('app:takeInitialFile'),
  onOpenFile: on('app:openFile'),
  // closing the window: the main process asks first, the UI answers when it may close
  onCloseRequest: on('app:closeRequest'),
  confirmClose: () => ipcRenderer.send('window:confirmClose'),

  // project files (always chosen by the person in a native dialog)
  project: {
    open: () => ipcRenderer.invoke('project:open'),
    openPath: (file) => ipcRenderer.invoke('project:openPath', file),
    save: (file, text, suggested) => ipcRenderer.invoke('project:save', file, text, suggested),
    example: (lang, id) => ipcRenderer.invoke('project:example', lang, id),
    recent: () => ipcRenderer.invoke('project:recent'),
    pickImage: () => ipcRenderer.invoke('project:pickImage'),
    clearRecent: () => ipcRenderer.invoke('project:clearRecent'),
  },
  recovery: {
    write: (text, meta) => ipcRenderer.invoke('recovery:write', text, meta),
    read: () => ipcRenderer.invoke('recovery:read'),
    clear: () => ipcRenderer.invoke('recovery:clear'),
  },

  // exports
  exportSvg: (name, text) => ipcRenderer.invoke('export:svg', name, text),
  exportPng: (name, bytes) => ipcRenderer.invoke('export:png', name, bytes),
  exportGif: (name, bytes) => ipcRenderer.invoke('export:gif', name, bytes),
  exportPdf: (name, svg, widthMm, heightMm) => ipcRenderer.invoke('export:pdf', name, svg, widthMm, heightMm),

  // new versions (the app's only network access, and only when asked)
  update: {
    check: () => ipcRenderer.invoke('update:check'),
    openReleasePage: () => ipcRenderer.invoke('update:openReleasePage'),
  },
});

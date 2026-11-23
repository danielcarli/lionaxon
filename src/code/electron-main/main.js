/*---------------------------------------------------------------------------------------------
 *  LionAxon — Copyright (C) 2026 LionAxon Team.
 *  Created and conceived by Daniel Michelon De Carli.
 *  Licensed under the GNU General Public License v3.0 or later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/
// Main process entry point (equivalent to VS Code's src/vs/code/electron-main).
// Creates the window, registers the app:// protocol that serves the UI and instantiates the services.
const { app, BrowserWindow, protocol, nativeTheme, ipcMain, dialog, shell } = require('electron');

app.setName('LionAxon');
if (process.platform === 'win32') app.setAppUserModelId('br.dmdc.lionaxon');
const path = require('path');
const fs = require('fs');

const { ProjectMainService, asideBase } = require('../../platform/project/electron-main/projectMainService');
const { ExportMainService } = require('../../platform/export/electron-main/exportMainService');
const { UpdateMainService } = require('../../platform/update/electron-main/updateMainService');
const { setLocale, t } = require('../../platform/nls/common/nls');

const APP_ROOT = path.resolve(__dirname, '..', '..', '..');
const SCHEME = 'app';

// Tests and screenshots may run the app with its data in a disposable folder.
if (process.env.LIONAXON_USER_DATA) app.setPath('userData', path.resolve(process.env.LIONAXON_USER_DATA));

protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
};
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
].join('; ');

// Only files inside these folders may be served to the UI.
const SERVABLE = [path.join(APP_ROOT, 'src')];

function registerAppProtocol() {
  protocol.handle(SCHEME, async (request) => {
    const url = new URL(request.url);
    const filePath = path.normalize(path.join(APP_ROOT, decodeURIComponent(url.pathname)));
    if (!SERVABLE.some((dir) => filePath.startsWith(dir + path.sep))) {
      return new Response('Forbidden', { status: 403 });
    }
    try {
      const body = await fs.promises.readFile(filePath);
      return new Response(body, {
        headers: {
          'content-type': MIME[path.extname(filePath)] || 'application/octet-stream',
          'content-security-policy': CSP,
        },
      });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });
}

const TITLEBAR_HEIGHT = 36;
const OVERLAY = {
  light: { color: '#f2f0ec', symbolColor: '#4d5157' },
  dark: { color: '#17191c', symbolColor: '#c3c7cc' },
  map: { color: '#efe7d7', symbolColor: '#1f3b34' },
  riverfront: { color: '#dcece9', symbolColor: '#1b4743' },
};
function overlayColors(dark, theme) {
  return { ...(OVERLAY[theme] || (dark ? OVERLAY.dark : OVERLAY.light)), height: TITLEBAR_HEIGHT };
}

let mainWindow = null;
const START_URL = `${SCHEME}://bundle/src/workbench/browser/workbench.html`;
/** Tests only (never in an installed app): a start made slow on purpose, and the answer to the question. */
const TEST_BOOT = !app.isPackaged && process.env.LIONAXON_TEST_SLOW_BOOT ? `?slowBoot=${encodeURIComponent(process.env.LIONAXON_TEST_SLOW_BOOT)}` : '';
/** How long the start may take before the app asks whether to start without the last session (ms). */
const BOOT_ASK_MS = Number(process.env.LIONAXON_BOOT_ASK_MS) || 15000;
let projectsService = null;

/** The start is over: no question any more (a question already on screen goes away). */
function bootReady(win) {
  win.booting = false;
  clearTimeout(win.bootTimer);
  win.bootAsk?.abort();
  win.bootAsk = null;
}

/**
 * Starts the window again without the work of the last session: that work is put aside in Documents ›
 * LionAxon (nothing is lost), and the page loads afresh. A page that hangs is stopped first.
 */
function startEmpty(win, hung = false) {
  bootReady(win);
  win.startedEmpty = true;
  const aside = projectsService?.setAsideRecovery() || null;
  const q = new URLSearchParams({ fresh: '1', ...(aside ? { aside: aside.dir, n: String(aside.files.length) } : {}) });
  win.booting = true;
  let loaded = false;
  const load = () => { if (loaded || win.isDestroyed()) return; loaded = true; win.loadURL(`${START_URL}?${q}`); };
  if (!hung) { load(); return; }
  // a page that hangs is stopped first; the new one is loaded once the old one is gone
  win.webContents.once('render-process-gone', () => setTimeout(load, 50));
  setTimeout(load, 2000);
  try { win.webContents.forcefullyCrashRenderer(); } catch { load(); }
}

/** The native question, for a start that takes long (asked once per start; it goes away if the start ends). */
async function askStartEmpty(win) {
  // once started without the last session, a fresh start is never asked about again
  if (!win.booting || win.bootAsk || win.startedEmpty || win.isDestroyed()) return;
  const ctrl = new AbortController();
  win.bootAsk = ctrl;
  try {
    if (!app.isPackaged && process.env.LIONAXON_TEST_BOOT_ANSWER === 'skip') { startEmpty(win, true); return; }
    const { response } = await dialog.showMessageBox(win, {
      type: 'question', signal: ctrl.signal, noLink: true, defaultId: 0, cancelId: 0,
      title: 'LionAxon', message: t('boot.slowTitle'), detail: t('boot.slowDetail'),
      buttons: [t('boot.keepWaiting'), t('boot.skip')],
    });
    if (response === 1 && win.booting && !win.isDestroyed()) startEmpty(win, true);
  } catch { /* the question was taken away: the start ended */ }
  if (win.bootAsk === ctrl) win.bootAsk = null;
}

function createWindow() {
  const isMac = process.platform === 'darwin';
  const win = new BrowserWindow({
    width: Number(process.env.LIONAXON_WIDTH) || 1440,
    height: Number(process.env.LIONAXON_HEIGHT) || 900,
    minWidth: 860,
    minHeight: 600,
    title: 'LionAxon',
    icon: path.join(APP_ROOT, 'src', 'workbench', 'browser', 'media', 'icon.png'),
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1c1f23' : '#fbfaf7',
    titleBarStyle: 'hidden',
    ...(isMac ? { trafficLightPosition: { x: 12, y: 11 } } : { titleBarOverlay: overlayColors(nativeTheme.shouldUseDarkColors) }),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'electron-sandbox', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // External links never open inside the app.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());

  // Closing the window first asks the UI, which offers to save diagrams with unsaved changes; the UI then
  // confirms (or cancels) and the window closes for real.
  win.allowClose = false;
  win.on('close', (e) => {
    // while it is still starting there is nothing to save (and a page that hangs could not answer)
    if (win.allowClose || win.booting || win.webContents.isCrashed?.() || !win.webContents.getURL()) return;
    e.preventDefault();
    win.webContents.send('app:closeRequest');
  });

  // ---- the start may take long (a heavy diagram of the last session): the page shows a button to start
  // without it; if the page hangs and cannot show it, the app asks in a native dialog
  win.booting = true;
  win.webContents.on('did-start-loading', () => {
    win.booting = true;
    clearTimeout(win.bootTimer);
    win.bootTimer = setTimeout(() => askStartEmpty(win), BOOT_ASK_MS);
  });
  win.on('unresponsive', () => { if (win.booting) askStartEmpty(win); });

  if (process.env.LIONAXON_HIDDEN !== '1') win.show();
  win.loadURL(START_URL + TEST_BOOT);
  mainWindow = win;
  win.on('closed', () => { if (mainWindow === win) mainWindow = null; });
  return win;
}

// ---- one instance only: opening the app again brings the window that is already open to the front
const gotTheLock = process.env.LIONAXON_MULTI === '1' || app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    const win = mainWindow || BrowserWindow.getAllWindows()[0];
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    const file = projectArg(argv);
    if (file) win.webContents.send('app:openFile', file);
  });
}

/** A project file given on the command line (double-click on a .lionaxon file). */
function projectArg(argv) {
  const f = argv.slice(1).find((a) => /\.lionaxon$/i.test(a) && !a.startsWith('-'));
  if (!f) return null;
  try { return fs.statSync(f).isFile() ? path.resolve(f) : null; } catch { return null; }
}

let initialFile = projectArg(process.argv);
app.on('open-file', (e, file) => { // macOS
  e.preventDefault();
  if (mainWindow) mainWindow.webContents.send('app:openFile', file);
  else initialFile = file;
});

module.exports = { getMainWindow: () => mainWindow };

if (gotTheLock) app.whenReady().then(() => {
  setLocale(app.getLocale());
  ipcMain.on('nls:setLocale', (_e, locale) => setLocale(String(locale)));
  ipcMain.handle('app:info', () => ({ version: require(path.join(APP_ROOT, 'package.json')).version, electron: process.versions.electron }));
  ipcMain.handle('app:takeInitialFile', () => { const f = initialFile; initialFile = null; return f; });
  registerAppProtocol();

  createWindow();

  const projects = new ProjectMainService(APP_ROOT);
  projectsService = projects;
  // the start: over (the page says so), or to be done again without the last session (the page's button)
  ipcMain.on('boot:ready', (event) => { const win = BrowserWindow.fromWebContents(event.sender); if (win) bootReady(win); });
  ipcMain.on('boot:startEmpty', (event) => { const win = BrowserWindow.fromWebContents(event.sender); if (win) startEmpty(win); });
  ipcMain.on('boot:showAside', (_e, dir) => {
    const docs = asideBase();
    const target = path.resolve(String(dir || ''));
    if (target.startsWith(docs) && fs.existsSync(target)) shell.openPath(target);
  });
  const exporter = new ExportMainService(SCHEME);
  const update = new UpdateMainService(APP_ROOT);
  [projects, exporter, update].forEach((s) => s.registerChannels(ipcMain));

  // Reload asked by the UI (after changing the language): the window blocks navigations started by the page.
  ipcMain.on('window:reload', (event) => event.sender.reload());
  ipcMain.on('window:setTheme', (event, dark, theme) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && process.platform !== 'darwin') {
      try { win.setTitleBarOverlay(overlayColors(!!dark, String(theme || ''))); } catch { /* platform without overlay */ }
    }
  });
  ipcMain.on('window:confirmClose', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    win.allowClose = true;
    win.close();
  });
  ipcMain.on('window:setTitle', (event, title) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.setTitle(String(title).slice(0, 200));
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

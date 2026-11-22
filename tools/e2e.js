/*---------------------------------------------------------------------------------------------
 *  LionAxon — Copyright (C) 2026 LionAxon Team.
 *  Created and conceived by Daniel Michelon De Carli.
 *  Licensed under the GNU General Public License v3.0 or later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/
// End-to-end test: starts the app with its data in a DISPOSABLE folder and drives it with the real mouse
// and keyboard (Electron input events): draws volumes, moves them, changes the height with the handle,
// subtracts, adds steps, arrows, people and labels, deletes a step with the typed code, undoes, saves,
// exports the sheet (SVG, PDF, PNG) and a step, then starts the app again to check that the work was
// recovered.
//
//   npm run test:e2e              (on Linux without a screen: xvfb-run -a npm run test:e2e)
//   npm run shots                 screenshots for the README, in docs/screenshots
//                                 (--lang=pt-BR --out=docs/screenshots/pt-BR for another language)
//
// Nothing outside the temporary folder is touched.
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const SHOTS = args.includes('--shots');
const PHASE2 = args.find((a) => a.startsWith('--phase2='))?.slice(9);
const OUT = args.find((a) => a.startsWith('--out='))?.slice(6);
const LANG = args.find((a) => a.startsWith('--lang='))?.slice(7) || 'en';

const tmp = PHASE2 || fs.mkdtempSync(path.join(os.tmpdir(), 'lionaxon-e2e-'));
process.env.LIONAXON_USER_DATA = path.join(tmp, 'user-data');
process.env.LIONAXON_TEST_DIR = path.join(tmp, 'out');
process.env.LIONAXON_HIDDEN = '1';
process.env.LIONAXON_MULTI = '1';
process.env.LIONAXON_WIDTH = '1440';
process.env.LIONAXON_HEIGHT = '900';
fs.mkdirSync(process.env.LIONAXON_TEST_DIR, { recursive: true });

// a local "release" for the update test: a manifest and one installer, which can be served tampered with
const http = require('http');
const crypto = require('crypto');
const RELEASE = { port: 21000 + (process.pid % 20000), hits: [], tampered: false, installer: crypto.randomBytes(300000) };
RELEASE.manifest = `version=99.0.0\nfile=LionAxon-x86_64.AppImage sha256=${crypto.createHash('sha256').update(RELEASE.installer).digest('hex')} size=${RELEASE.installer.length}\n`;
http.createServer((req, res) => {
  RELEASE.hits.push(req.url);
  if (req.url === '/manifest.txt') { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end(RELEASE.manifest); return; }
  if (req.url === '/LionAxon-x86_64.AppImage') {
    const body = Buffer.from(RELEASE.installer);
    if (RELEASE.tampered) body[1000] ^= 0xff;
    res.writeHead(200, { 'Content-Length': body.length });
    res.end(body);
    return;
  }
  res.writeHead(404); res.end();
}).listen(RELEASE.port, '127.0.0.1').unref();
process.env.LIONAXON_UPDATE_BASE = `http://127.0.0.1:${RELEASE.port}`;
process.env.LIONAXON_UPDATE_KIND = 'linux-appimage';

const { app, BrowserWindow } = require('electron');
app.commandLine.appendSwitch('lang', LANG);
require(path.join(ROOT, 'src', 'code', 'electron-main', 'main.js'));

let passed = 0;
const failures = [];
function check(name, ok, detail = '') {
  if (ok) { passed++; console.log(`  ✓ ${name}`); }
  else { failures.push(name); console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  let win;
  for (let i = 0; i < 50 && !win; i++) { await sleep(100); win = BrowserWindow.getAllWindows()[0]; }
  const errors = [];
  win.webContents.on('console-message', (e) => { if (e.level === 'error' || e.level === 3) errors.push(String(e.message)); });
  const js = (code) => win.webContents.executeJavaScript(code);
  // wait for the UI and the first project
  for (let i = 0; i < 100; i++) {
    if (await js('!!window.lionaxon && !document.getElementById("boot")').catch(() => false)) break;
    await sleep(100);
  }
  await js(`localStorage.setItem('lionaxon.locale', ${JSON.stringify(LANG)}); true`);
  await sleep(400);
  // the first start shows the start screen over the example
  if (!PHASE2) {
    const welcome = await js(`!!document.querySelector('.welcome-dialog')`);
    if (!SHOTS) check('the first start shows the start screen: new, open, the six examples, a guide', welcome
      && await js(`document.querySelectorAll('.welcome-dialog [data-welcome^=example-]').length === 6 && document.querySelectorAll('.welcome-guide li').length === 4 && !!document.querySelector('.welcome-dialog [data-welcome=new]')`));
    await js(`document.querySelector('.welcome-dialog [data-welcome=close]')?.click(); true`);
    await sleep(150);
  }
  try {
    if (PHASE2) await phase2(js);
    else if (SHOTS) await shots(win, js);
    else await phase1(win, js);
  } catch (err) {
    failures.push('exception: ' + (err.stack || err));
    console.log(err.stack || err);
  }
  if (errors.length) console.log('console errors:\n  ' + errors.join('\n  '));
  check('no errors in the console', errors.length === 0, errors[0]);
  console.log(`\n${passed} passed, ${failures.length} failed${PHASE2 ? ' (after restart)' : ''}`);
  if (!PHASE2 && !SHOTS && !failures.length) {
    // start the app again on the same data: the unsaved work must come back
    const code = await new Promise((resolve) => {
      const child = spawn(process.execPath, [...process.argv.slice(1).filter((a) => !a.startsWith('--')), `--phase2=${tmp}`, '--no-sandbox'], { stdio: 'inherit', env: process.env });
      child.on('exit', resolve);
    });
    if (code) failures.push('phase 2');
    else fs.rmSync(tmp, { recursive: true, force: true });
  }
  app.exit(failures.length ? 1 : 0);
});

// ---------------------------------------------------------------------------------------------

async function mouse(win, type, [x, y], extra = {}) {
  win.webContents.sendInputEvent({ type, x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1, ...extra });
}

async function drag(win, from, to, steps = 8, modifiers = []) {
  await mouse(win, 'mouseMove', from, { modifiers });
  await mouse(win, 'mouseDown', from, { modifiers });
  for (let i = 1; i <= steps; i++) {
    await mouse(win, 'mouseMove', [from[0] + ((to[0] - from[0]) * i) / steps, from[1] + ((to[1] - from[1]) * i) / steps], { modifiers });
    await sleep(15);
  }
  await mouse(win, 'mouseUp', to, { modifiers });
  await sleep(120);
}

async function click(win, at, modifiers = []) { await drag(win, at, at, 1, modifiers); }

async function key(win, keyCode, modifiers = []) {
  win.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
  win.webContents.sendInputEvent({ type: 'char', keyCode, modifiers });
  win.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
  await sleep(80);
}

async function type(win, text) {
  for (const ch of text) win.webContents.sendInputEvent({ type: 'char', keyCode: ch });
  await sleep(60);
}

const S = 'window.lionaxon.services';
const at = (js, p, view = 'axon') => js(`window.lionaxon.views.${view}.clientOf(${JSON.stringify(p)})`);

async function phase1(win, js) {
  console.log('LionAxon end-to-end test — data in', tmp);
  check('opens the example on first start', await js(`${S}.document.project.steps.length === 5 && ${S}.document.objects.length > 0`));
  check('the example draws faces on screen', await js(`document.querySelectorAll('[data-view=axon] .ax-model path').length > 10`));

  // a new diagram opens in a new tab; the example stays open in its own
  await key(win, 'N', ['control']);
  await sleep(300);
  check('new project: one empty step', await js(`${S}.document.project.steps.length === 1 && ${S}.document.objects.length === 0`));
  check('…in a second tab, next to the example', await js(`${S}.document.tabs.length === 2 && document.querySelectorAll('.doc-tab').length === 2 && ${S}.document.tabs[0].project.steps.length === 5`));
  await key(win, 'W', ['control']);
  await sleep(200);
  check('Ctrl+W closes an untouched tab without asking', await js(`${S}.document.tabs.length === 1 && !document.querySelector('.save-dialog') && ${S}.document.project.steps.length === 5`));
  check('the title bar moves the window everywhere but on its controls', await js(`(() => {
    const r = (sel) => getComputedStyle(document.querySelector(sel)).getPropertyValue('-webkit-app-region');
    return r('.titlebar') === 'drag' && r('.titlebar-right') === 'drag' && r('.doc-tabs') === 'drag' && r('.titlebar-right > button') === 'no-drag' && r('.doc-tab') === 'no-drag';
  })()`));
  await key(win, 'N', ['control']);
  await sleep(300);
  await js(`${S}.commands.setProject((p) => { p.name = 'E2E test'; p.site.w = 40; p.site.d = 60; }); true`);
  await sleep(200);
  await key(win, 'F');
  await sleep(200);

  // ---- draw a volume with the mouse (tool B), from (4, 15) to (12, 45) on the ground
  await key(win, 'B');
  check('B picks the volume tool', await js(`${S}.layout.tool === 'box'`));
  await drag(win, await at(js, [4, 15, 0]), await at(js, [12, 45, 0]));
  let v = JSON.parse(await js(`JSON.stringify(${S}.document.objects[0] || null)`));
  check('drawing on the ground makes a volume of 8 × 30 m', v && v.type === 'volume' && Math.abs(v.w - 8) < 1e-6 && Math.abs(v.d - 30) < 1e-6, JSON.stringify(v));
  check('after drawing, the tool goes back to select and the volume is selected', await js(`${S}.layout.tool === 'select' && ${S}.document.selection.has(${S}.document.objects[0].id)`));

  // ---- duplicate in series: three parallel bars, 5 m apart
  await js(`${S}.commands.duplicateSeries(2, 5, 'w'); true`);
  await sleep(150);
  check('duplicate in series: three volumes', await js(`${S}.document.objects.filter((o) => o.type === 'volume').length === 3`));
  const xs = JSON.parse(await js(`JSON.stringify(${S}.document.objects.map((o) => o.x))`));
  check('…13 m between centres (8 m + 5 m gap)', Math.abs(xs[1] - xs[0] - 13) < 1e-6 && Math.abs(xs[2] - xs[1] - 13) < 1e-6, xs.join(', '));

  // ---- move the first volume by dragging its top face 2 m along x
  await js(`${S}.document.select([${S}.document.objects[0].id]); true`);
  const id0 = await js(`${S}.document.objects[0].id`);
  v = JSON.parse(await js(`JSON.stringify(${S}.document.objects[0])`));
  await drag(win, await at(js, [v.x, v.y + 6, v.h]), await at(js, [v.x + 2, v.y + 6, v.h]));
  const moved = JSON.parse(await js(`JSON.stringify(${S}.document.byId(${JSON.stringify(id0)}))`));
  check('dragging a volume moves it on the grid (+2 m)', Math.abs(moved.x - v.x - 2) < 1e-6 && Math.abs(moved.y - v.y) < 1e-6, `${v.x},${v.y} → ${moved.x},${moved.y}`);
  await key(win, 'Z', ['control']);
  check('undo puts it back', Math.abs(await js(`${S}.document.byId(${JSON.stringify(id0)}).x`) - v.x) < 1e-6);

  // ---- height handle: drag up 6 m
  await js(`${S}.document.select([${JSON.stringify(id0)}]); true`);
  await sleep(100);
  const hpos = JSON.parse(await js(`JSON.stringify(window.lionaxon.views.axon.handles(${S}.document.byId(${JSON.stringify(id0)})).find((x) => x.id === 'h'))`));
  const hClient = await at(js, [v.x, v.y, v.h]);
  const up = await at(js, [v.x, v.y, v.h + 6]);
  check('the height handle sits on the top of the volume', !!hpos);
  await drag(win, hClient, up);
  const hNow = await js(`${S}.document.byId(${JSON.stringify(id0)}).h`);
  check('the height handle makes the volume 6 m taller', Math.abs(hNow - (v.h + 6)) < 0.51, `${v.h} → ${hNow}`);
  await key(win, 'Z', ['control']);

  // ---- floors through the properties panel (real typing)
  await js(`document.querySelector('.properties input[data-key="floors"]').focus(); true`);
  await js(`document.querySelector('.properties input[data-key="floors"]').select(); true`);
  await type(win, '3');
  await key(win, 'Return');
  check('typing 3 floors in the properties panel', await js(`${S}.document.byId(${JSON.stringify(id0)}).floors === 3`));
  check('floor lines are drawn', await js(`[...document.querySelectorAll('[data-view=axon] .ax-model path[pointer-events=none]')].length > 0`));

  // ---- step 2: a copy, plus a connecting volume (shown in the accent colour)
  await js(`document.activeElement.blur(); ${S}.document.clearSelection(); ${S}.commands.addStep(); true`);
  await sleep(150);
  check('new step is a copy of the current one', await js(`${S}.document.project.steps.length === 2 && ${S}.document.stepIndex === 1 && ${S}.document.objects.length === 3`));
  await key(win, 'B');
  await drag(win, await at(js, [12, 30, 0]), await at(js, [17, 36, 0]));
  const linkId = await js(`${S}.document.objects.at(-1).id`);
  await js(`${S}.commands.setStepProps({ title: 'Connection', highlight: true }); true`);
  await sleep(150);
  check('the new volume is highlighted as a change of the step', await js(`(async () => {
    const m = await import('../services/render/common/renderer.js');
    const p = await import('../../base/common/geometry/projection.js');
    return m.renderStep(${S}.document.project, 1, { view: p.makeView(-45) }).highlighted.includes(${JSON.stringify(linkId)});
  })()`).catch((e) => String(e)));

  // ---- subtraction with the mouse (tool S) over the third volume
  await js(`${S}.document.clearSelection(); true`);
  await key(win, 'S');
  const v3 = JSON.parse(await js(`JSON.stringify(${S}.document.objects[2])`));
  await drag(win, await at(js, [v3.x + 2, v3.y + 10, v3.h]), await at(js, [v3.x + 6, v3.y + 15, v3.h]));
  const cut = JSON.parse(await js(`JSON.stringify(${S}.document.objects.at(-1))`));
  check('dragging over a volume with S makes a subtraction aimed at it', cut.type === 'cut' && cut.target === v3.id, JSON.stringify(cut));
  check('the cut changes the drawing (more faces)', await js(`document.querySelectorAll('[data-view=axon] .ax-model path[data-id="${v3.id}"]').length > 3`));

  // ---- a category, an arrow, a person and a label
  await js(`(() => { const c = ${S}.commands.addCategory('Circulation'); ${S}.commands.setProps({ cat: c.id }, [${JSON.stringify(linkId)}]); return true; })()`);
  await js(`${S}.document.clearSelection(); true`);
  await key(win, 'A');
  await drag(win, await at(js, [-4, 30, 0]), await at(js, [40, 30, 0]));
  const arrow = JSON.parse(await js(`JSON.stringify(${S}.document.objects.at(-1))`));
  check('arrow tool: an arrow from −4 to 40 m', arrow.type === 'arrow' && Math.abs(arrow.x1 + 4) < 1e-6 && Math.abs(arrow.x2 - 40) < 1e-6, JSON.stringify(arrow));
  await key(win, 'P');
  await click(win, await at(js, [44, 6, 0]));
  check('person tool: a person on the ground', await js(`${S}.document.objects.at(-1).type === 'person'`));
  await key(win, 'T');
  await click(win, await at(js, [8, 30, v.h]));
  await sleep(250);
  check('label tool: the text field takes the cursor', await js(`document.activeElement?.dataset?.key === 'text'`));
  await js(`document.activeElement.select(); true`);
  await type(win, 'Café');
  await js(`document.activeElement.blur(); true`);
  await sleep(150);
  check('label text typed in the properties', await js(`${S}.document.objects.at(-1).text === 'Café'`));

  // ---- delete a step: nothing is asked, a notice offers to undo
  await js(`${S}.commands.removeStep(1); true`);
  await sleep(250);
  check('deleting a step asks nothing and offers to undo', await js(`${S}.document.project.steps.length === 1 && !document.querySelector('.cm-overlay') && !!document.querySelector('.toast .btn')`));
  await key(win, 'Z', ['control']);
  await sleep(200);
  check('undo brings the step back', await js(`${S}.document.project.steps.length === 2`));

  // ---- plan view and sheet
  await key(win, '2', ['control']);
  await sleep(600);
  check('Ctrl+2 shows the plan', await js(`${S}.layout.tab === 'plan' && document.querySelectorAll('[data-view=plan] .ax-model path').length > 0`));
  await key(win, '4', ['control']);
  await sleep(500);
  check('Ctrl+4 shows the sheet with both steps', await js(`!!document.querySelector('.sheet-paper #step-01') && !!document.querySelector('.sheet-paper #step-02')`));
  check('the legend lists the category in use', await js(`document.querySelector('.sheet-paper #legend')?.textContent.includes('CIRCULATION')`));

  // ---- save and reopen
  const saved = await js(`${S}.commands.save().then((r) => r && r.path)`);
  check('save writes the project file', !!saved && fs.existsSync(saved));
  const json = JSON.parse(fs.readFileSync(saved, 'utf8'));
  check('the file is readable JSON with the format and the steps', json.format === 'lionaxon' && json.steps.length === 2);
  await key(win, 'N', ['control']);
  await sleep(200);
  const tabsBefore = await js(`${S}.document.tabs.length`);
  await js(`${S}.commands.openPath(${JSON.stringify(saved)})`);
  await sleep(300);
  check('opening the saved file brings back both steps', await js(`${S}.document.project.steps.length === 2 && ${S}.document.project.name === 'E2E test'`));
  check('…in the tab where it is already open (no copy)', (await js(`${S}.document.tabs.length`)) === tabsBefore);

  // ---- exports
  for (const kind of ['svg', 'pdf', 'png']) {
    const r = JSON.parse(await js(`${S}.commands.exportSheet('${kind}', { dpi: 120 }).then((r) => JSON.stringify(r))`));
    const ok = r && r.ok && fs.existsSync(r.path);
    const head = ok ? fs.readFileSync(r.path).subarray(0, 8) : Buffer.alloc(0);
    const sig = { svg: head.toString().startsWith('<svg'), pdf: head.toString().startsWith('%PDF'), png: head[0] === 0x89 && head.toString('latin1', 1, 4) === 'PNG' }[kind];
    check(`sheet exported as ${kind.toUpperCase()}`, ok && sig, JSON.stringify(r));
  }
  const svgFile = fs.readdirSync(process.env.LIONAXON_TEST_DIR).find((f) => f.endsWith('.svg'));
  const svgText = fs.readFileSync(path.join(process.env.LIONAXON_TEST_DIR, svgFile), 'utf8');
  check('the SVG has one named layer per step', (svgText.match(/inkscape:groupmode="layer"/g) || []).length === 2);
  const pdf = fs.readFileSync(path.join(process.env.LIONAXON_TEST_DIR, fs.readdirSync(process.env.LIONAXON_TEST_DIR).find((f) => f.endsWith('.pdf'))), 'latin1');
  check('the PDF has the A3 page size (1190.55 × 841.89 pt)', /MediaBox\s*\[\s*0 0 119[01][.\d]* 84[12][.\d]*\]/.test(pdf), (pdf.match(/MediaBox\s*\[[^\]]*\]/) || [''])[0]);
  check('the PDF embeds the font', /PlusJakartaSans/i.test(pdf));
  for (const kind of ['svg', 'png']) {
    const r = JSON.parse(await js(`${S}.commands.exportStep('${kind}').then((r) => JSON.stringify(r))`));
    check(`current step exported as ${kind.toUpperCase()}`, r && r.ok && fs.existsSync(r.path), JSON.stringify(r));
  }

  await sheet02(win, js);
  await features02(win, js);
  await menu04(win, js);
  await orbit05(win, js);
  await usability06(win, js);
  await features07(win, js);
  await edit3d08(win, js);
  await cycle08(win, js);
  await labelEdit08(win, js);
  await features10(win, js);
  await alignFaces11(win, js);
  await fixes12(win, js);
  await update12(win, js);

  // ---- leave unsaved work behind for phase 2
  await js(`${S}.document.switchTo(${S}.document.tabs.findIndex((t) => t.project.name === 'E2E test')); true`);
  await key(win, '1', ['control']);
  await js(`${S}.commands.setProject((p) => { p.name = 'Unsaved work'; }); true`);
  await sleep(1200);
}

// ---------------------------------------------------------------------------------------------
// 0.4: the menu bar and the five examples
async function menu04(win, js) {
  const fire = (sel, type) => `document.querySelector(${JSON.stringify(sel)}).dispatchEvent(new PointerEvent('${type}', { bubbles: true, button: 0 }))`;
  await key(win, 'N', ['control']);
  await js(`${S}.commands.setProject((p) => { p.name = 'Before the example'; }); true`);
  check('the title bar has the six menus', await js(`[...document.querySelectorAll('.menubar .menubar-item')].map((b) => b.dataset.menu).join() === 'file,edit,insert,view,step,help'`));
  await js(`${fire('.menubar [data-menu=file]', 'pointerdown')}; true`);
  check('a click opens the File menu, with its shortcuts', await js(`!!document.querySelector('.menu-popup') && [...document.querySelectorAll('.menu-popup .menu-key')].some((k) => k.textContent === 'Ctrl+S')`));
  await js(`${fire('.menubar [data-menu=edit]', 'pointerenter')}; true`);
  check('moving to another menu opens it instead', await js(`document.querySelectorAll('.menu-popup').length === 1 && document.querySelector('.menubar [data-menu=edit]').classList.contains('open')`));
  await js(`${fire('.menubar [data-menu=file]', 'pointerenter')}; true`);
  const exIndex = await js(`[...document.querySelectorAll('.menu-popup .menu-entry')].filter((r) => r.querySelector('.menu-more'))[1].dataset.index`);
  await js(`${fire(`.menu-popup [data-index="${exIndex}"]`, 'pointerenter')}; true`);
  check('Examples opens a submenu with the six examples', await js(`document.querySelectorAll('.menu-popup').length === 2 && document.querySelectorAll('.menu-popup:last-child .menu-entry').length === 6`));
  const before = await js(`${S}.document.tabs.length`);
  await js(`${fire('.menu-popup:last-child [data-index="2"]', 'pointerup')}; true`);
  await sleep(500);
  check('choosing one opens it in a tab of its own', await js(`${S}.document.tabs.length === ${before + 1} && /tower|torre/i.test(${S}.document.project.name) && ${S}.document.project.steps.length >= 4 && !${S}.document.dirty`));
  check('…and the menu closes', await js(`!document.querySelector('.menu-popup')`));
  for (const id of ['parti', 'plateaus', 'tower', 'slope', 'school', 'corner']) {
    const ok = await js(`window.host.project.example('pt-BR', '${id}').then((r) => r.ok && JSON.parse(r.text).steps.length >= 3)`);
    check(`the example "${id}" is there`, ok);
  }
  // the keyboard: F10 opens the first menu, the arrows move, Enter runs, Escape closes
  await key(win, 'F10');
  check('F10 opens the File menu with the first entry highlighted', await js(`document.querySelector('.menubar [data-menu=file]').classList.contains('open') && document.querySelector('.menu-popup .menu-entry.active')?.dataset.index === '0'`));
  await key(win, 'Right'); await key(win, 'Right'); await key(win, 'Right');
  check('→ goes to the next menus', await js(`document.querySelector('.menubar [data-menu=view]').classList.contains('open')`));
  await key(win, 'Down'); await key(win, 'Down');
  await key(win, 'Return');
  await sleep(150);
  check('Enter runs the entry (View › Elevation)', await js(`${S}.layout.tab === 'elev' && !document.querySelector('.menu-popup')`));
  await key(win, 'F10');
  await key(win, 'Escape');
  check('Escape closes the menu', await js(`!document.querySelector('.menu-popup') && !document.querySelector('.menubar-item.open')`));
  // a checked entry follows the state
  await js(`${fire('.menubar [data-menu=view]', 'pointerdown')}; true`);
  check('View shows which view is on', await js(`[...document.querySelectorAll('.menu-popup .menu-entry[aria-checked=true]')].some((r) => r.dataset.index === '2')`));
  await key(win, 'Escape');
  await key(win, '1', ['control']);
}

// ---------------------------------------------------------------------------------------------
// 0.5: the 3D viewer, and steps seen from several angles
async function orbit05(win, js) {
  const O = 'window.lionaxon.views.orbit';
  const angle = async () => JSON.parse(await js(`JSON.stringify(${O}.angle)`));
  const views = async () => JSON.parse(await js(`JSON.stringify(${S}.document.step.views)`));
  const pointer = (type, x, y, extra = '') => js(`${O}.svg.dispatchEvent(new PointerEvent('${type}', { bubbles: true, button: 0, buttons: 1, pointerId: 7, clientX: ${x}, clientY: ${y}${extra} })); true`);
  await js(`${S}.commands.example('school').then(() => true)`);
  await sleep(400);
  await js(`${S}.document.setStep(2); true`);
  const objectsBefore = await js(`JSON.stringify(${S}.document.project.steps.map((s) => s.objects))`);
  await key(win, '5', ['control']);
  await sleep(400);
  check('Ctrl+5 opens the 3D viewer, with the step drawn', await js(`${S}.layout.tab === 'orbit' && document.querySelectorAll('[data-view=orbit] .canvas path').length > 20`));
  let a = await angle();
  check('…from the angle of the step (the project\'s, at first)', Math.abs(a.az - 315) < 0.01 && Math.abs(a.el - 35.2644) < 0.01, JSON.stringify(a));
  check('the chips say the sheet uses the project\'s angle', await js(`document.querySelectorAll('[data-view=orbit] .orbit-chip').length === 1 && !document.querySelector('[data-view=orbit] .orbit-chip-x')`));
  // dragging turns the model: right → the azimuth goes down, down → seen more from above
  const [cx, cy] = JSON.parse(await js(`(() => { const r = ${O}.svg.getBoundingClientRect(); return JSON.stringify([r.left + r.width / 2, r.top + r.height / 2]); })()`));
  await pointer('pointerdown', cx, cy);
  for (let k = 1; k <= 5; k++) await pointer('pointermove', cx + 20 * k, cy + 12 * k);
  await pointer('pointerup', cx + 100, cy + 60);
  a = await angle();
  check('dragging turns the view round and over', Math.abs(a.az - (315 - 45)) < 0.6 && Math.abs(a.el - (35.2644 + 27)) < 0.6, JSON.stringify(a));
  // all the way under: the elevation goes below zero and the model is still drawn (with its undersides)
  await pointer('pointerdown', cx, cy);
  for (let k = 1; k <= 10; k++) await pointer('pointermove', cx, cy - 50 * k);
  await pointer('pointerup', cx, cy - 500);
  a = await angle();
  check('…down to straight from below (-90°)', a.el === -90, JSON.stringify(a));
  await js(`${O}.render(); true`);
  check('…where the model shows its undersides', await js(`document.querySelectorAll('[data-view=orbit] .canvas path').length > 10`));
  await key(win, 'Right');
  check('→ turns 15°', Math.abs((await angle()).az - 285) < 0.6);
  await js(`document.querySelector('[data-view=orbit] [data-preset=iso]').click(); true`);
  a = await angle();
  check('Isometric goes back to the nearest isometric corner', Math.abs(a.el - 35.2644) < 0.01 && a.az % 90 === 45, JSON.stringify(a));
  // the numbers
  await js(`(() => { const i = document.querySelector('[data-view=orbit] input[data-key=el]'); i.value = '60'; i.dispatchEvent(new Event('change')); })(); true`);
  check('the elevation can be typed', (await angle()).el === 60);
  // use this angle for the step
  await js(`${O}.setAngle(20, 50); document.querySelector('[data-view=orbit] [data-action=use]').click(); true`);
  let v = await views();
  check('"Use for this step" gives the step its own angle', v.length === 1 && v[0].az === 20 && v[0].el === 50, JSON.stringify(v));
  // duplicate at another angle: the same step, two drawings
  await js(`${O}.setAngle(200, -25); document.querySelector('[data-view=orbit] [data-action=add]').click(); true`);
  v = await views();
  check('"Duplicate at this angle" adds a second angle to the same step', v.length === 2 && v[1].az === 200 && v[1].el === -25, JSON.stringify(v));
  check('…the step count does not change', await js(`${S}.document.project.steps.length === 5`));
  check('…and the chips list both, each removable', await js(`document.querySelectorAll('[data-view=orbit] .orbit-chip').length === 2 && document.querySelectorAll('[data-view=orbit] .orbit-chip-x').length === 2`));
  check('the objects were not touched', objectsBefore === await js(`JSON.stringify(${S}.document.project.steps.map((s) => s.objects))`));
  // the sheet: the step's two drawings side by side, in one layer, one caption
  await key(win, '4', ['control']);
  await sleep(500);
  check('the sheet draws the step twice, side by side, under one caption', await js(`(() => { const g = document.querySelector('.sheet-page #step-03'); if (!g) return false; const d = [...g.children].filter((c) => c.tagName === 'svg'); return d.length === 2 && Number(d[1].getAttribute('x')) > Number(d[0].getAttribute('x')) + Number(d[0].getAttribute('width')) - 0.01 && g.querySelectorAll(':scope > text').length >= 2 && !!document.querySelector('.sheet-page #step-05'); })()`));
  check('…the other steps as they were (step 4 of the example already has two angles)', await js(`[...document.querySelectorAll('.sheet-page [id^=step-]')].filter((g) => g.id !== 'step-03' && g.id !== 'step-04').every((g) => [...g.children].filter((c) => c.tagName === 'svg').length === 1)`));
  // the step exported alone holds both angles
  const r = JSON.parse(await js(`${S}.commands.exportStep('svg').then((r) => JSON.stringify(r))`));
  check('exporting the step puts both angles in the file', r?.ok && (fs.readFileSync(r.path, 'utf8').match(/<svg /g) || []).length === 3, JSON.stringify(r));
  // undo, remove, reset
  await key(win, '5', ['control']);
  await sleep(300);
  await key(win, 'Z', ['control']);
  check('undo takes the second angle away', (await views()).length === 1);
  await key(win, 'Y', ['control']);
  await js(`document.querySelector('[data-view=orbit] .orbit-chip-x').click(); true`);
  v = await views();
  check('× takes one angle out', v.length === 1 && v[0].az === 200, JSON.stringify(v));
  await js(`document.querySelector('[data-view=orbit] [data-action=reset]').click(); true`);
  check('"Project angle" goes back to the axonometric of the project', (await views()).length === 0 && Math.abs((await angle()).az - 315) < 0.01);
  // a new step starts as a copy, angles included
  await js(`${S}.commands.setStepAngle(0, { az: 60, el: 20 }); ${S}.commands.addStep(); true`);
  check('a new step keeps the angles of the one it copies', JSON.stringify(await views()) === JSON.stringify([{ az: 60, el: 20 }]));
  await js(`${S}.commands.undo(); ${S}.commands.undo(); true`);
  await key(win, '1', ['control']);
}

// ---------------------------------------------------------------------------------------------
// 0.6: usability — clipboard, the right-button menu, the selection rectangle, lock and hide, names,
// carrying changes to the next steps, alignment, typed sizes, zoom, steps by dragging, panels
async function usability06(win, js) {
  const D = `${S}.document`, C = `${S}.commands`;
  const obj = async (id, step) => JSON.parse(await js(`JSON.stringify(${D}.project.steps[${step ?? `${D}.stepIndex`}].objects.find((o) => o.id === '${id}') || null)`));
  const ids = async () => JSON.parse(await js(`JSON.stringify([...${D}.selection])`));
  const base = { site: { w: 40, d: 60 }, categories: [{ id: 'k1', name: 'Rooms', color: '#8fa9cc' }] };
  const objects = [
    { type: 'volume', id: 'a', x: 10, y: 10, w: 8, d: 8, h: 6, cat: 'k1' },
    { type: 'volume', id: 'b', x: 30, y: 20, w: 6, d: 10, h: 3 },
    { type: 'volume', id: 'c', x: 20, y: 45, w: 4, d: 4, h: 3 },
  ];
  const prj = { ...base, name: 'Usability', steps: ['One', 'Two', 'Three'].map((title, i) => ({ id: 's' + i, title, objects })) };
  await js(`${D}.loadText(${JSON.stringify(JSON.stringify(prj))}, { dirty: true }); ${S}.layout.setTab('plan'); true`);
  await sleep(400);
  await js(`window.lionaxon.views.plan.fit(); true`);
  const P = async (p) => JSON.parse(await js(`JSON.stringify(window.lionaxon.views.plan.clientOf(${JSON.stringify(p)}))`));

  // ---- the window never grows wider than the screen, whatever the hint in the status bar says
  check('the status bar tells what the tool does, without widening the window', await js(`document.querySelector('.status-hint').textContent.length > 20 && document.documentElement.scrollWidth <= innerWidth && document.querySelector('#workbench').scrollWidth <= innerWidth`));
  check('the toolbars no longer carry a cut-off hint', await js(`!document.querySelector('.tool-hint')`));

  // ---- the selection rectangle
  await drag(win, await P([24, 12, 0]), await P([36, 28, 0]));
  check('dragging on the paper selects what the rectangle touches', JSON.stringify(await ids()) === '["b"]', JSON.stringify(await ids()));
  await drag(win, await P([16, 41, 0]), await P([24, 49, 0]), 8, ['shift']);
  check('…and Shift adds to the selection', JSON.stringify((await ids()).sort()) === '["b","c"]', JSON.stringify(await ids()));

  // ---- align and distribute
  check('two objects selected: the panel offers to align them', await js(`document.querySelectorAll('.properties [data-align]').length === 6`));
  await js(`document.querySelector('.properties [data-align=left]').click(); true`);
  check('Align left lines their left edges up', (await obj('b')).x - 3 === (await obj('c')).x - 2 && (await obj('c')).x === 20, JSON.stringify([await obj('b'), await obj('c')]));
  await key(win, 'Z', ['control']);
  await key(win, 'A', ['control']);
  await js(`${C}.distributeSelection('x'); true`);
  const [oa, ob, oc] = [await obj('a'), await obj('b'), await obj('c')];
  check('Distribute in X leaves equal gaps', Math.abs((oc.x - 2 - (oa.x + 4)) - (ob.x - 3 - (oc.x + 2))) < 1e-6 && oa.x === 10 && ob.x === 30, JSON.stringify([oa.x, oc.x, ob.x]));
  await key(win, 'Z', ['control']);
  await key(win, 'Escape');

  // ---- copy, paste, cut
  await click(win, await P([10, 10, 0]));
  check('a click selects the volume', JSON.stringify(await ids()) === '["a"]');
  await key(win, 'C', ['control']);
  await key(win, 'V', ['control']);
  let n = await js(`${D}.objects.length`);
  let pasted = JSON.parse(await js(`JSON.stringify(${D}.selected()[0])`));
  check('Ctrl+C, Ctrl+V: a copy, a little aside, selected', n === 4 && pasted.id !== 'a' && pasted.x === 12 && pasted.y === 8 && pasted.w === 8, JSON.stringify(pasted));
  await key(win, 'X', ['control']);
  check('Ctrl+X takes it away', await js(`${D}.objects.length`) === 3);
  await js(`${D}.setStep(1); true`);
  await key(win, 'V', ['control']);
  pasted = JSON.parse(await js(`JSON.stringify(${D}.selected()[0])`));
  check('pasted in another step, it lands where it was', await js(`${D}.objects.length`) === 4 && pasted.x === 12 && pasted.y === 8, JSON.stringify(pasted));
  await key(win, 'Z', ['control']);
  await key(win, 'N', ['control']);
  await key(win, 'V', ['control']);
  check('pasted in another diagram, its category comes along', await js(`${D}.objects.length === 1 && ${D}.project.categories.some((c) => c.id === 'k1') && ${D}.objects[0].cat === 'k1'`));
  await js(`${D}.tab.dirty = false; ${C}.closeTab().then(() => true)`);
  await sleep(200);
  await js(`${D}.setStep(0); ${S}.layout.setTab('plan'); true`);
  await sleep(250);

  // ---- the menu of the right button
  const right = async (pt) => { await mouse(win, 'mouseMove', pt); await mouse(win, 'mouseDown', pt, { button: 'right' }); await mouse(win, 'mouseUp', pt, { button: 'right' }); await sleep(150); };
  const pick = (label) => js(`(() => { const rows = [...document.querySelectorAll('.context-menu .menu-entry')]; const r = typeof ${JSON.stringify(label)} === 'number' ? rows[${JSON.stringify(label)}] : rows.find((x) => x.querySelector('.menu-key').textContent === ${JSON.stringify(label)}); if (!r) return false; r.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); return true; })()`);
  await key(win, 'Escape');
  await right(await P([10, 10, 0]));
  check('the right button opens the menu of the object (and selects it)', await js(`!!document.querySelector('.context-menu') && document.querySelectorAll('.context-menu .menu-entry').length >= 9`) && JSON.stringify(await ids()) === '["a"]');
  check('picking Lock locks it (it stays selected, to be unlocked)', await pick('Ctrl+L') && (await obj('a')).locked === true && JSON.stringify(await ids()) === '["a"]' && !(await js(`!!document.querySelector('.context-menu')`)));
  await key(win, 'Escape');
  await drag(win, await P([10, 10, 0]), await P([14, 10, 0]), 6);
  check('a locked object is not moved in the drawing', (await obj('a')).x === 10);
  await key(win, 'Escape');
  await key(win, 'A', ['control']);
  check('…nor by Select all', JSON.stringify((await ids()).sort()) === '["b","c"]');
  await key(win, 'Escape');
  await right(await P([10, 10, 0]));
  check('its menu offers to unlock it', await pick(0) && !(await obj('a')).locked);
  await right(await P([36, 55, 0]));
  check('on the paper, the menu is the paper\'s (paste, select all, fit)', await js(`document.querySelectorAll('.context-menu .menu-entry').length >= 3 && document.querySelectorAll('.context-menu .menu-entry').length <= 5`));
  await key(win, 'Escape');
  check('Escape closes it', !(await js(`!!document.querySelector('.context-menu')`)));

  // ---- hide, show, and the element list
  await js(`${C}.setHidden(true, ['b']); true`);
  await sleep(150);
  check('a hidden object is not drawn', await js(`!document.querySelector('[data-view=plan] .canvas [data-id=b]') && !!document.querySelector('[data-view=plan] .canvas [data-id=c]')`));
  check('…and the list shows its eye closed', await js(`!!document.querySelector('.element-row.is-hidden [data-element=b]') && document.querySelector('.element-row.is-hidden [data-toggle=hidden]').classList.contains('on')`));
  await js(`document.querySelector('.element-row.is-hidden [data-toggle=hidden]').click(); true`);
  check('a click on the eye shows it again', !(await obj('b')).hidden && await js(`!!document.querySelector('[data-view=plan] .canvas [data-id=b]')`));
  await js(`document.querySelector('[data-element=c]').closest('.element-row').dispatchEvent(new MouseEvent('mouseenter')); true`);
  check('the list item under the mouse is outlined in the drawing', await js(`window.lionaxon.views.plan.listHover === 'c' && window.lionaxon.views.plan.overlay.querySelectorAll('path').length === 1`));
  await js(`document.querySelector('[data-element=c]').closest('.element-row').dispatchEvent(new MouseEvent('mouseleave')); true`);

  // ---- a name of its own
  await click(win, await P([10, 10, 0]));
  await key(win, 'F2');
  check('F2 puts the cursor in the name', await js(`document.activeElement?.dataset.key === 'name'`));
  await type(win, 'Block A');
  await key(win, 'Return');
  await js(`document.activeElement.blur(); true`);
  await key(win, 'Escape');
  await sleep(150);
  check('the name is kept and shown in the list', (await obj('a')).name === 'Block A' && await js(`document.querySelector('[data-element=a] .element-name').textContent === 'Block A'`));

  // ---- the same object in the following steps
  await click(win, await P([10, 10, 0]));
  await js(`${C}.setProps({ h: 9 }); true`);
  check('a change stays in its step…', (await obj('a', 1)).h === 6);
  await js(`document.querySelector('.properties [data-action=propagate]').click(); true`);
  check('…until it is applied to the following steps', (await obj('a', 1)).h === 9 && (await obj('a', 2)).h === 9 && (await obj('a', 2)).name === 'Block A' && (await obj('b', 2)).h === 3);
  await key(win, 'Z', ['control']);
  check('one undo takes it back from all of them', (await obj('a', 1)).h === 6 && (await obj('a', 0)).h === 9);

  // ---- a size typed
  await key(win, '1');
  check('a digit opens the size box', await js(`document.activeElement?.dataset.key === 'typed-size' && document.activeElement.value === '1'`));
  await type(win, '2 x 14 x 7');
  await key(win, 'Return');
  const a = await obj('a');
  check('width × depth × height typed and applied', a.w === 12 && a.d === 14 && a.h === 7 && !(await js(`!!document.querySelector('.size-box')`)), JSON.stringify(a));
  await key(win, 'Z', ['control']);

  // ---- guides: an edge that comes close to another object's edge lines up with it
  await js(`${C}.setProps({ x: 30.3 }, ['b']); true`);
  await sleep(100);
  await drag(win, await P([10, 10, 0]), await P([31.1, 10, 0]), 10);
  check('moving a shape, its edge snaps to the edge of another', Math.abs((await obj('a')).x - 31.3) < 1e-6 && (await obj('a')).y === 10, JSON.stringify(await obj('a')));
  await key(win, 'Z', ['control']);
  await key(win, 'Z', ['control']);
  await key(win, 'Escape');

  // ---- zoom
  check('the zoom reads 100% when the drawing fits', await js(`document.querySelector('[data-view=plan] [data-zoom=label]').textContent === '100%'`));
  await key(win, '=', ['control']);
  check('Ctrl++ zooms in', await js(`document.querySelector('[data-view=plan] [data-zoom=label]').textContent === '125%'`));
  await js(`document.querySelector('[data-view=plan] [data-zoom=out]').click(); document.querySelector('[data-view=plan] [data-zoom=out]').click(); true`);
  check('the − button zooms out', await js(`document.querySelector('[data-view=plan] [data-zoom=label]').textContent === '80%'`));
  await key(win, '0', ['control']);
  check('Ctrl+0 fits again', await js(`document.querySelector('[data-view=plan] [data-zoom=label]').textContent === '100%'`));

  // ---- steps by dragging
  await js(`${S}.layout.setActivity('steps'); true`);
  await sleep(300);
  await js(`(() => { const cards = document.querySelectorAll('.steps-list .step-card'); const dt = new DataTransfer(); const ev = (type) => new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt });
    cards[2].dispatchEvent(ev('dragstart')); cards[0].dispatchEvent(ev('dragover')); cards[0].dispatchEvent(ev('drop')); cards[2].dispatchEvent(ev('dragend')); })(); true`);
  await sleep(200);
  check('dragging a step onto another moves it there', await js(`${D}.project.steps.map((s) => s.title).join() === 'Three,One,Two'`), await js(`${D}.project.steps.map((s) => s.title).join()`));
  await key(win, 'Z', ['control']);

  // ---- tabs keep a readable width
  check('the tabs of the diagrams keep a readable width', await js(`[...document.querySelectorAll('.doc-tab')].every((t) => t.offsetWidth >= 130) && document.querySelector('.doc-tabs').scrollWidth >= document.querySelector('.doc-tabs').clientWidth`));

  // ---- only the drawing
  const wide = await js(`document.querySelector('.editor').offsetWidth`);
  await key(win, '\\', ['control']);
  check('Ctrl+\\ leaves only the drawing', await js(`document.querySelector('.sidebar').hidden && document.querySelector('.properties').hidden && document.querySelector('.editor').offsetWidth > ${wide} + 400`));
  await key(win, '\\', ['control']);
  check('…and again brings the panels back', await js(`!document.querySelector('.sidebar').hidden && !document.querySelector('.properties').hidden`));

  // ---- sections fold, explanations can be hidden
  check('the long sections of the step start folded', await js(`document.querySelectorAll('.properties .pane-section.closed').length === 3`));
  await js(`document.querySelector('.properties .pane-section.closed .section-head').click(); true`);
  check('a click on a title opens it, and it is remembered', await js(`document.querySelectorAll('.properties .pane-section.closed').length === 2 && Object.values(JSON.parse(localStorage.getItem('lionaxon.sections'))).includes(false)`));
  await js(`${S}.layout.toggleHints(); true`);
  check('the explanations of the panels can be hidden', await js(`getComputedStyle(document.querySelector('.properties .pane-hint')).display === 'none'`));
  await js(`${S}.layout.toggleHints(); localStorage.removeItem('lionaxon.sections'); true`);

  // ---- hatches for the categories
  await js(`${C}.setProject((p) => { p.catPatterns = true; }); true`);
  await sleep(200);
  check('with hatches on, a volume of a category is hatched', await js(`document.querySelectorAll('[data-view=plan] .canvas pattern').length === 1 && !!document.querySelector('[data-view=plan] .canvas path[fill^="url(#lx-h0-"]')`));
  await key(win, '4', ['control']);
  await sleep(400);
  check('…and so is its legend on the sheet', await js(`!!document.querySelector('.sheet-page #legend pattern') && !!document.querySelector('.sheet-page #legend rect[fill^="url("]')`));
  await js(`${C}.undo(); true`);

  // ---- the 3D viewer says it only looks
  await key(win, '5', ['control']);
  await sleep(300);
  check('the 3D viewer says what can be done there, with the way to where shapes are drawn', await js(`/select/i.test(document.querySelector('.status-hint').textContent) && !!document.querySelector('[data-view=orbit] [data-action=edit]')`));
  await js(`document.querySelector('[data-view=orbit] [data-action=edit]').click(); true`);
  check('…which goes to the axonometric', await js(`${S}.layout.tab === 'axon'`));

  // ---- recent files, in the menu and on the start screen
  const recent = JSON.parse(await js(`window.host.project.recent().then((r) => JSON.stringify(r))`));
  check('files saved or opened are remembered as recent', recent.length >= 1 && /\.lionaxon$/.test(recent[0].path), JSON.stringify(recent));
  await js(`${S}.recent.refresh().then(() => true)`);
  await js(`document.querySelector('.menubar [data-menu=help]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 })); document.querySelector('.menu-popup [data-index="0"]').dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); true`);
  await sleep(300);
  check('Help opens the start screen, with the recent files', await js(`document.querySelectorAll('.welcome-dialog [data-welcome=recent]').length >= 1`));
  check('…and, small at the bottom, who conceived the software', await js(`/Daniel Michelon De Carli/.test(document.querySelector('.welcome-dialog .welcome-credit')?.textContent || '') && parseFloat(getComputedStyle(document.querySelector('.welcome-credit')).fontSize) <= 11`));
  await key(win, 'Escape');

  // ---- the dialogs of Help open (About, Shortcuts)
  await js(`document.querySelector('.activity-bottom .activity-item').click(); true`);
  check('the shortcuts dialog opens and lists the new shortcuts', await js(`!!document.querySelector('.shortcuts-dialog') && [...document.querySelectorAll('.shortcuts-dialog kbd')].some((k) => k.textContent.includes('Ctrl+C'))`));
  await key(win, 'Escape');
  await js(`document.querySelectorAll('.activity-bottom .activity-item')[2].click(); true`);
  await sleep(250);
  check('the About dialog opens', await js(`!!document.querySelector('.about-dialog')`));
  await js(`document.querySelector('.about-dialog [data-action=credits]').click(); true`);
  await sleep(250);
  check('…and leads to the credits: who conceived it, who keeps it, what it is made with', await js(`!!document.querySelector('.credits-dialog') && !document.querySelector('.about-dialog') && document.querySelector('.credits-list dd b').textContent === 'Daniel Michelon De Carli' && document.querySelectorAll('.credits-third li').length === 9`));
  await key(win, 'Escape');

  // ---- every button has a name for screen readers
  const unnamed = await js(`[...document.querySelectorAll('button')].filter((b) => !b.textContent.trim() && !b.getAttribute('aria-label')).map((b) => b.className).join(' | ')`);
  check('every icon button has an accessible name', unnamed === '', unnamed);
  await js(`${D}.tab.dirty = false; true`);
  await key(win, '1', ['control']);
}

// ---------------------------------------------------------------------------------------------
// 0.7: outlines of any shape, surroundings, sun, roofs, trees, dimensions, the previous step as a ghost,
// signs between steps, the animation, sections
async function features07(win, js) {
  const D = `${S}.document`, C = `${S}.commands`, L = `${S}.layout`;
  const last = async () => JSON.parse(await js(`JSON.stringify(${D}.objects.at(-1) || null)`));
  const canvas = (view) => `document.querySelector('[data-view=${view}] .canvas')`;
  const prj = { name: 'Features 0.7', site: { w: 40, d: 50 }, steps: [
    { id: 'f1', title: 'Before', objects: [{ type: 'volume', id: 'old', x: 20, y: 30, w: 8, d: 8, h: 6 }, { type: 'volume', id: 'keep', x: 8, y: 8, w: 6, d: 6, h: 3 }] },
    { id: 'f2', title: 'After', objects: [{ type: 'volume', id: 'keep', x: 8, y: 8, w: 6, d: 6, h: 3 }] },
  ] };
  await js(`${D}.loadText(${JSON.stringify(JSON.stringify(prj))}, { dirty: true }); ${L}.setTab('plan'); ${D}.setStep(1); true`);
  await sleep(400);
  await js(`window.lionaxon.views.plan.fit(); true`);
  const P = async (p) => JSON.parse(await js(`JSON.stringify(window.lionaxon.views.plan.clientOf(${JSON.stringify(p)}))`));

  // ---- a volume of any outline, point by point
  await js(`${L}.setToolOption('shape', 'poly'); true`);
  check('the outline shape draws point by point (the status bar says how)', await js(`/Enter/.test(document.querySelector('.status-hint').textContent)`));
  for (const p of [[20, 10], [34, 10], [34, 18], [28, 18], [28, 30]]) await click(win, await P([...p, 0]));
  check('each click adds a corner', await js(`window.lionaxon.views.plan.poly?.pts.length === 5`));
  await click(win, await P([20, 30, 0]));
  await click(win, await P([20, 10, 0]));
  let v = await last();
  check('a click on the first corner closes the outline: an L-shaped volume', v?.shape === 'poly' && v.pts.length === 6 && v.w === 14 && v.d === 20 && v.x === 27 && v.y === 20 && await js(`${L}.tool === 'select'`), JSON.stringify(v));
  check('…drawn as one shape', await js(`${canvas('plan')}.querySelectorAll('[data-id="${v.id}"]').length >= 1`));
  // a corner dragged
  const hp = JSON.parse(await js(`JSON.stringify(window.lionaxon.views.plan.clientAt(window.lionaxon.views.plan.handles(${D}.selected()[0]).find((h) => h.id === 'p1').p))`));
  await drag(win, hp, await P([36, 10, 0]));
  v = await last();
  check('dragging a corner moves it (the bounds follow)', v.w === 16 && v.x === 28, JSON.stringify([v.w, v.x, v.pts]));
  const hm = JSON.parse(await js(`JSON.stringify(window.lionaxon.views.plan.clientAt(window.lionaxon.views.plan.handles(${D}.selected()[0]).find((h) => h.id === 'm5').p))`));
  await drag(win, hm, await P([18, 20, 0]));
  v = await last();
  check('dragging the middle of a side makes a new corner', v.pts.length === 7 && v.w === 18, JSON.stringify(v.pts));
  await key(win, 'Z', ['control']);
  check('the properties show the outline, with its height only', await js(`!!document.querySelector('.properties [data-key=h]') && !document.querySelector('.properties [data-key=w]')`));
  const polyId = v.id;

  // ---- a polygonal subtraction, ended with Enter
  await js(`${L}.setToolOption('cutShape', 'poly'); true`);
  for (const p of [[22, 12], [26, 12], [24, 16]]) await click(win, await P([...p, 0]));
  await key(win, 'Return');
  const cut = await last();
  check('Enter ends an outline: a triangular subtraction in the volume', cut?.type === 'cut' && cut.shape === 'poly' && cut.pts.length === 3 && cut.target === polyId, JSON.stringify(cut));
  await key(win, 'Escape');

  // ---- the site with any outline
  await js(`document.querySelector('[data-pane=project] [data-action=site-draw]')?.click(); ${L}.setTool('site'); true`);
  for (const p of [[0, 0], [40, 0], [40, 36], [30, 50], [0, 50]]) await click(win, await P([...p, 0]));
  await key(win, 'Return');
  await sleep(300);
  check('the site takes the outline drawn', await js(`${D}.project.site.pts?.length === 5 && ${D}.project.site.w === 40 && ${D}.project.site.d === 50`));
  await js(`${C}.setSiteOutline(null); true`);
  check('…and goes back to a rectangle', await js(`!${D}.project.site.pts`));
  await js(`${C}.undo(); window.lionaxon.views.plan.fit(); true`);

  // ---- roofs
  await js(`${D}.select(['keep']); true`);
  await sleep(150);
  await js(`document.querySelector('.properties [data-value=gable]').click(); true`);
  await sleep(150);
  check('a box takes a roof (gable), with its height', await js(`${D}.byId('keep').roof === 'gable' && ${D}.byId('keep').roofH === 3 && !!document.querySelector('.properties [data-key=roofH]')`));
  await js(`${L}.setTab('axon'); true`);
  await sleep(300);
  check('…drawn with its two slopes and gable ends', await js(`${canvas('axon')}.querySelectorAll('[data-id=keep]').length >= 4`));
  await js(`document.querySelector('.properties [data-value=flat]').click(); true`);
  check('Flat takes it away', await js(`!('roof' in ${D}.byId('keep'))`));
  await js(`${C}.undo(); ${L}.setTab('plan'); true`);
  await sleep(250);
  await key(win, 'Escape');

  // ---- surroundings: a street, a neighbour, a tree, a dimension
  await js(`${L}.setToolOption('terrainKind', 'area'); true`);
  await drag(win, await P([2, 40, 0]), await P([14, 46, 0]));
  const area = await last();
  check('the terrain tool draws a flat area (a street)', area?.type === 'area' && area.kind === 'street' && area.w === 12 && area.d === 6, JSON.stringify(area));
  check('…under the volumes, in the ground of the drawing', await js(`!!${canvas('plan')}.querySelector('.ax-ground .ax-area[data-id="${area.id}"]')`));
  await js(`document.querySelector('.properties [data-value=green]').click(); true`);
  check('its kind changes in the properties', await js(`${D}.byId('${area.id}').kind === 'green'`));
  await key(win, 'Escape');
  await key(win, 'E');
  await click(win, await P([8, 43, 0]));
  const tree = await last();
  check('E places a tree', tree?.type === 'tree' && tree.x === 8 && tree.y === 43 && await js(`!!${canvas('plan')}.querySelector('[data-id="${tree.id}"] circle')`), JSON.stringify(tree));
  await key(win, 'Escape');
  await key(win, 'D');
  await drag(win, await P([5, 5, 0]), await P([11, 5, 0]));
  const dim = await last();
  check('D draws a dimension line with its length', dim?.type === 'dim' && dim.x1 === 5 && dim.x2 === 11 && await js(`/6/.test(${canvas('plan')}.querySelector('[data-id="${dim.id}"] text')?.textContent || '')`), JSON.stringify(dim));
  await key(win, 'Escape');
  await js(`${C}.setProps({ state: 'context' }, ['${polyId}']); true`);
  await sleep(150);
  check('a context volume is neutral: never in the accent colour', await js(`(() => { const a = getComputedStyle(document.documentElement); const f = ${canvas('plan')}.querySelector('[data-id="${polyId}"]').getAttribute('fill'); return /^#[def]/i.test(f); })()`), await js(`${canvas('plan')}.querySelector('[data-id="${polyId}"]').getAttribute('fill')`));
  await js(`${C}.undo(); true`);

  // ---- the image underneath
  fs.writeFileSync(path.join(process.env.LIONAXON_TEST_DIR, 'underlay.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAACCAYAAAB/qH1jAAAAEklEQVR4nGP4z8DwH4QZYAwAR8oH+Rq28akAAAAASUVORK5CYII=', 'base64'));
  await js(`${C}.pickUnderlay().then(() => true)`);
  await sleep(300);
  check('an image goes under the drawing, as wide as the site', await js(`(() => { const u = ${D}.project.underlay; return !!u && u.w === 40 && u.h === 20 && u.src.startsWith('data:image/jpeg') && !!${canvas('plan')}.querySelector('image.ax-underlay'); })()`), await js(`JSON.stringify({ ...${D}.project.underlay, src: (${D}.project.underlay?.src || '').slice(0, 30) })`));
  check('…it is not on the sheet unless asked', await js(`!window.lionaxon.services.export.sheet().svg.includes('ax-underlay')`));
  await js(`${C}.setProject((p) => { p.underlay.opacity = 0.4; }); true`);
  check('the undo history names the image instead of copying it', await js(`${D}.tab.undo.at(-1).state.project.includes('"src":"@image:') && !${D}.tab.undo.at(-1).state.project.includes('base64')`));
  await js(`${C}.undo(); true`);
  check('undo brings the project back with its image', await js(`${D}.project.underlay.opacity === 0.6 && ${D}.project.underlay.src.startsWith('data:image/jpeg')`));
  await js(`${C}.undo(); true`);
  check('…and one more takes the image away', await js(`!${D}.project.underlay`));

  // ---- sun and shadows
  await js(`${C}.setProject((p) => { p.sun.on = true; p.sun.lat = -30; p.sun.month = 12; p.sun.day = 21; p.sun.hour = 15; }); true`);
  await sleep(200);
  check('with the sun on, the volumes cast shadows on the ground', await js(`!!${canvas('plan')}.querySelector('.ax-ground .ax-shadow')`));
  await js(`${L}.setActivity('project'); true`);
  await sleep(200);
  check('the Project pane tells where the sun is', await js(`/[0-9]+°/.test(document.querySelector('[data-pane=project] [data-key=sun-pos]')?.textContent || '')`));
  await js(`${C}.setProject((p) => { p.sun.hour = 23; }); true`);
  await sleep(150);
  check('at night there are none', await js(`!${canvas('plan')}.querySelector('.ax-shadow')`));
  await js(`${C}.undo(); ${C}.undo(); ${L}.setActivity('steps'); true`);

  // ---- the previous step as a ghost, and the sign between steps
  await js(`${C}.setStepProps({ ghostPrev: true, op: '−' }); ${L}.setTab('axon'); true`);
  await sleep(300);
  const withGhost = await js(`${canvas('axon')}.querySelectorAll('path[stroke-dasharray]').length`);
  await js(`${C}.setStepProps({ ghostPrev: false }); true`);
  await sleep(200);
  check('the step can show, dashed, what the previous step had', withGhost > await js(`${canvas('axon')}.querySelectorAll('path[stroke-dasharray]').length`) && await js(`!${canvas('axon')}.querySelector('[data-id=old]')`));
  await key(win, '4', ['control']);
  await sleep(400);
  check('the sheet draws the sign between the two steps', await js(`document.querySelector('.sheet-page #step-02 text.op')?.textContent === '−' && !document.querySelector('.sheet-page #step-01 text.op')`));

  // ---- the animation
  const gif = JSON.parse(await js(`${C}.exportGif({ width: 320 }).then((r) => JSON.stringify(r))`));
  const bytes = gif?.ok ? fs.readFileSync(gif.path) : Buffer.alloc(0);
  check('the steps are exported as an animated GIF, one frame each', gif?.ok && bytes.slice(0, 6).toString() === 'GIF89a' && bytes.readUInt16LE(6) === 320
    && bytes.includes(Buffer.from('NETSCAPE2.0')) && bytes.filter((b, i) => b === 0x21 && bytes[i + 1] === 0xf9 && bytes[i + 2] === 4).length === 2, JSON.stringify(gif));

  // ---- a section, in the elevation
  await key(win, '3', ['control']);
  await sleep(400);
  const before = await js(`${canvas('elev')}.querySelectorAll('[data-id]').length`);
  await js(`document.querySelector('[data-view=elev] [data-action=section]').click(); true`);
  await sleep(250);
  check('Section cuts the model: what the plane crosses is filled', await js(`${canvas('elev')}.querySelectorAll('.ax-cap').length >= 1 && !!document.querySelector('[data-view=elev] [data-key=section-pos]')`), `${before}`);
  const caps = await js(`${canvas('elev')}.querySelectorAll('.ax-cap').length`);
  await js(`(() => { const i = document.querySelector('[data-view=elev] [data-key=section-pos]'); i.value = '2'; i.dispatchEvent(new Event('input')); })(); true`);
  await sleep(200);
  check('moving the plane changes what is cut', await js(`${canvas('elev')}.querySelectorAll('.ax-cap').length`) !== caps || await js(`window.lionaxon.views.elev.section.pos === 2`));
  await js(`document.querySelector('[data-view=elev] [data-action=section]').click(); true`);
  check('…and off, the elevation is whole again', await js(`${canvas('elev')}.querySelectorAll('.ax-cap').length === 0`));
  await js(`${D}.tab.dirty = false; true`);
  await key(win, '1', ['control']);
}

async function phase2(js) {
  console.log('After restarting the app:');
  check('the unsaved work is recovered', await js(`${S}.document.project.name === 'Unsaved work' && ${S}.document.project.steps.length === 2`));
  check('…and still marked as not saved', await js(`${S}.document.dirty === true`));
  check('the other tabs of the session are back too (the example)', await js(`${S}.document.tabs.length >= 2 && ${S}.document.tabs.some((t) => t.project.steps.length === 5)`));
  check('the diagram whose changes were thrown away did not come back', await js(`!${S}.document.tabs.some((t) => t.project.name === 'Features 0.2')`));
}

// ---------------------------------------------------------------------------------------------
// 0.2: the vertical evolution sheet on A4, at a chosen scale, on as many pages as it needs

async function sheet02(win, js) {
  await key(win, '4', ['control']);
  await sleep(300);
  await js(`document.querySelector('[data-preset="a4-vertical"]').click(); true`);
  await sleep(300);
  check('one click makes a vertical evolution sheet on A4, upright', await js(`(() => { const s = ${S}.document.project.sheet; return s.layout === 'vertical' && s.paper === 'A4' && s.orientation === 'portrait'; })()`));
  check('…with the text beside each drawing', await js(`(() => {
    const g = document.querySelector('.sheet-paper #step-01'); const d = g.querySelector('svg'); const txt = [...g.querySelectorAll(':scope > text')].pop();
    return Number(txt.getAttribute('x')) > Number(d.getAttribute('x')) + Number(d.getAttribute('width')) - 0.01;
  })()`));
  check('fitting the paper, the hint gives the scale the drawings come out at', await js(`/1:\\d+/.test(document.querySelector('[data-scale-hint]').textContent)`));
  await js(`(() => { const s = document.querySelector('.pane select[data-key=scale]'); s.value = '200'; s.dispatchEvent(new Event('change')); return true; })()`);
  await sleep(400);
  const pages = await js(`document.querySelectorAll('.sheet-paper .sheet-page').length`);
  check('at 1:200 the steps go on to more A4 pages, all shown', pages >= 2 && (await js(`${S}.document.project.sheet.scale`)) === 200, `pages ${pages}`);
  check('…with the scale written on the sheet', await js(`document.querySelector('.sheet-paper #scale')?.textContent.includes('1:200')`));
  const pdf = JSON.parse(await js(`${S}.commands.exportSheet('pdf').then((r) => JSON.stringify(r))`));
  const pdfText = pdf?.ok ? fs.readFileSync(pdf.path, 'latin1') : '';
  const pdfPages = (pdfText.match(/\/Type\s*\/Page[^s]/g) || []).length;
  check('the PDF has every page, each A4 upright (595 × 842 pt)', pdfPages === pages && /MediaBox\s*\[\s*0 0 59[45][.\d]* 84[12][.\d]*\]/.test(pdfText), `${pdfPages} pages`);
  const png = JSON.parse(await js(`${S}.commands.exportSheet('png', { dpi: 72 }).then((r) => JSON.stringify(r))`));
  check('PNG: one file per page', png?.ok && png.paths?.length === pages && png.paths.every((f) => fs.existsSync(f)), JSON.stringify(png));
  // back to how the sheet was, for the rest of the test
  await js(`${S}.commands.setProject((p) => { p.sheet.layout = 'row'; p.sheet.paper = 'A3'; p.sheet.orientation = 'landscape'; p.sheet.scale = 0; }); true`);
  await key(win, '1', ['control']);
  await sleep(200);
}

// ---------------------------------------------------------------------------------------------
// 0.2: shapes, rotation, cut heights, ghosts, reference planes, terrain, wheelchair, label fonts, north,
// styles, closing with unsaved changes

async function features02(win, js) {
  const V = 'window.lionaxon.views.axon';
  const last = async () => JSON.parse(await js(`JSON.stringify(${S}.document.objects.at(-1))`));
  const handle = async (id, h) => js(`${V}.clientAt(${V}.handles(${S}.document.byId(${JSON.stringify(id)})).find((x) => x.id === '${h}').p)`);
  await key(win, 'N', ['control']);
  await sleep(250);
  await js(`${S}.layout.setTab('axon'); ${S}.commands.setProject((p) => { p.name = 'Features 0.2'; }); ${V}.fit(); true`);
  await sleep(200);

  // shapes from the box tool's options
  await key(win, 'B');
  check('the volume tool shows the shapes', await js(`document.querySelectorAll('[data-view=axon] .tool-options [data-shape]').length === 6`));
  await js(`document.querySelector('[data-view=axon] .tool-options [data-shape=cylinder]').click(); true`);
  await drag(win, await at(js, [24, 40, 0]), await at(js, [32, 48, 0]));
  let o = await last();
  check('a cylinder is drawn with the mouse', o.type === 'volume' && o.shape === 'cylinder' && Math.abs(o.w - 8) < 1e-6, JSON.stringify(o));
  check('…as a curved surface (seams drawn without outlines)', await js(`document.querySelectorAll('[data-view=axon] path[data-id="${o.id}"]').length > 10`));
  await key(win, 'B');
  await js(`document.querySelector('[data-view=axon] .tool-options [data-shape=sphere]').click(); true`);
  await drag(win, await at(js, [24, 20, 0]), await at(js, [30, 28, 0]));
  o = await last();
  check('a sphere stays round (depth = width)', o.shape === 'sphere' && o.w === o.d && Math.abs(o.w - 6) < 1e-6, JSON.stringify(o));
  await key(win, 'B');
  await js(`document.querySelector('[data-view=axon] .tool-options [data-shape=box]').click(); true`);
  await drag(win, await at(js, [4, 4, 0]), await at(js, [14, 12, 0]));
  const box = await last();

  // rotation with the mouse: the round handle, 15° at a time
  const rotFrom = await handle(box.id, 'rot');
  const k = box.d / 2 + 3;
  const a = (35 * Math.PI) / 180;
  const rotTo = await at(js, [box.x + Math.sin(a) * k, box.y - Math.cos(a) * k, box.h]);
  await drag(win, rotFrom, rotTo, 10);
  o = JSON.parse(await js(`JSON.stringify(${S}.document.byId(${JSON.stringify(box.id)}))`));
  check('dragging the round handle rotates the volume (snapped to 30°)', Math.abs(o.rot - 30) < 1e-6, `rot ${o.rot}`);
  await key(win, 'Z', ['control']);

  // a subtraction gets a sensible height, and its handles change the drawing
  await js(`${S}.document.clearSelection(); true`);
  await key(win, 'S');
  await drag(win, await at(js, [6, 6, box.h]), await at(js, [10, 9, box.h]));
  const cut = await last();
  check('a new subtraction goes from the plane to the top of its volume (not 200 m)', cut.type === 'cut' && cut.target === box.id && Math.abs(cut.z) < 1e-6 && Math.abs(cut.h - box.h) < 1e-6, JSON.stringify(cut));
  const before = await js(`[...document.querySelectorAll('[data-view=axon] path[data-id="${box.id}"]')].map((p) => p.getAttribute('d')).join('|')`);
  await drag(win, await handle(cut.id, 'h'), await at(js, [cut.x, cut.y, cut.h - 1.5]), 8);
  const cutNow = JSON.parse(await js(`JSON.stringify(${S}.document.byId(${JSON.stringify(cut.id)}))`));
  const after = await js(`[...document.querySelectorAll('[data-view=axon] path[data-id="${box.id}"]')].map((p) => p.getAttribute('d')).join('|')`);
  check('the height handle of a subtraction changes its height…', Math.abs(cutNow.h - 1.5) < 0.26, `h ${cutNow.h}`);
  check('…and the drawing of the volume it cuts', before !== after);
  check('the subtraction has a handle for its base too', await js(`${V}.handles(${S}.document.byId(${JSON.stringify(cut.id)})).some((x) => x.id === 'z')`));

  // ghosts can be picked: on their lines and in the element list
  await js(`${S}.commands.setProps({ state: 'ghost' }, [${JSON.stringify(box.id)}]); ${S}.document.clearSelection(); true`);
  await sleep(150);
  check('a ghost answers the mouse on its dashed lines', await js(`[...document.querySelectorAll('[data-view=axon] path[data-id="${box.id}"]')].some((p) => p.getAttribute('pointer-events') === 'all')`));
  check('the element list groups everything by type', await js(`document.querySelectorAll('.properties .element-group').length >= 2 && !!document.querySelector('.properties [data-element="${box.id}"]')`));
  await js(`document.querySelector('.properties [data-element="${box.id}"]').click(); true`);
  await sleep(100);
  check('…and a click there selects the ghost', await js(`${S}.document.selection.has(${JSON.stringify(box.id)})`));

  // reference planes: draw on a plane, move the plane, everything on it follows
  await js(`${S}.document.clearSelection(); true`);
  const lvl = await js(`${S}.commands.addLevel()`);
  await js(`${S}.commands.setLevel(${JSON.stringify(lvl)}, { z: 4, name: 'Mezanino' }); true`);
  await sleep(150);
  check('a new plane becomes the active plane in the toolbar', await js(`document.querySelector('[data-view=axon] .level-select')?.value === ${JSON.stringify(lvl)}`));
  await key(win, 'B');
  await drag(win, await at(js, [4, 50, 4]), await at(js, [12, 56, 4]));
  o = await last();
  check('a volume drawn on the active plane belongs to it', o.level === lvl && Math.abs(o.z) < 1e-6 && Math.abs(o.x - 8) < 1e-6, JSON.stringify(o));
  await js(`${S}.commands.setLevel(${JSON.stringify(lvl)}, { z: 7 }); true`);
  check('changing the elevation of the plane lifts what is on it', Math.abs(await js(`${V}.extentOf(${S}.document.byId(${JSON.stringify(o.id)})).z0`) - 7) < 1e-6);

  // terrain: a platform and a slope
  await key(win, 'G');
  check('G picks the terrain tool', await js(`${S}.layout.tool === 'terrain'`));
  await js(`${S}.document.setActiveLevel('L0'); true`);
  await drag(win, await at(js, [30, 4, 0]), await at(js, [38, 14, 0]));
  o = await last();
  check('the terrain tool draws a platform, 1 m above the ground', o.type === 'platform' && Math.abs(o.z - 1) < 1e-6, JSON.stringify(o));
  await key(win, 'G');
  await js(`document.querySelector('[data-view=axon] .tool-options [data-terrain=slope]').click(); true`);
  await drag(win, await at(js, [30, 16, 0]), await at(js, [38, 28, 0]));
  o = await last();
  check('…and a slope up to the next plane', o.type === 'slope' && o.to === lvl && o.from === 'L0', JSON.stringify(o));
  await js(`${S}.commands.setProject((p) => { p.site.thickness = 2; }); true`);
  check('the site can be drawn as a block of earth', await js(`document.querySelectorAll('[data-view=axon] .ax-model path:not([data-id])').length > 0`));

  // see-through terrain: the grid follows the platform, the platform shows under the mouse
  check('the terrain is see-through, with the grid on its surfaces', await js(`document.querySelectorAll('[data-view=axon] .ax-terrain').length > 0 && [...document.querySelectorAll('[data-view=axon] .ax-terrain')].every((p) => p.getAttribute('fill-opacity') === '0')`));
  const plat = JSON.parse(await js(`JSON.stringify(${S}.document.objects.find((o) => o.type === 'platform'))`));
  // (a hidden window delivers mouse moves only with the next frame: the move is dispatched directly)
  await js(`(() => { const p = ${JSON.stringify(await at(js, [plat.x, plat.y, 1]))}; const el = document.elementFromPoint(p[0], p[1]);
    el.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: p[0], clientY: p[1], pointerId: 1 })); return true; })()`);
  await sleep(120);
  check('…and a piece of terrain shows when the mouse is over it', await js(`!!document.querySelector('[data-view=axon] .ax-terrain.hover[data-id="${plat.id}"]')`),
    await js(`(() => { const p = ${JSON.stringify(await at(js, [plat.x, plat.y, 1]))}; const el = document.elementFromPoint(p[0], p[1]); return el.tagName + ' ' + el.getAttribute('class') + ' ' + el.dataset.id + ' hover=' + window.lionaxon.views.axon.hoverId; })()`));

  // Space turns any shape: a box, a platform, a slope, a cut
  for (const type of ['volume', 'platform', 'slope', 'cut']) {
    const obj = JSON.parse(await js(`JSON.stringify(${S}.document.objects.find((o) => o.type === '${type}'))`));
    await js(`${S}.document.select([${JSON.stringify(obj.id)}]); document.activeElement?.blur(); true`);
    await key(win, 'Space');
    const rot = await js(`${S}.document.byId(${JSON.stringify(obj.id)}).rot`);
    check(`Space turns a ${type} by 90°`, Math.abs(((rot - obj.rot + 360) % 360) - 90) < 1e-6, `${obj.rot} → ${rot}`);
    await key(win, 'Z', ['control']);
  }

  // subtractions have the same shapes as volumes
  await js(`${S}.document.clearSelection(); true`);
  await key(win, 'S');
  check('the subtract tool shows the shapes too', await js(`document.querySelectorAll('[data-view=axon] .tool-options [data-shape]').length === 6`));
  await js(`document.querySelector('[data-view=axon] .tool-options [data-shape=cylinder]').click(); true`);
  const cylVol = JSON.parse(await js(`JSON.stringify(${S}.document.objects.find((o) => o.type === 'volume' && o.shape === 'box' && o.state === 'normal' && !o.on))`));
  const vb = await js(`${V}.extentOf(${S}.document.byId(${JSON.stringify(cylVol.id)})).z1`);
  await drag(win, await at(js, [cylVol.x - 1, cylVol.y - 1, vb]), await at(js, [cylVol.x + 1, cylVol.y + 1, vb]));
  o = await last();
  check('a round hole: a cylindrical subtraction', o.type === 'cut' && o.shape === 'cylinder' && o.target === cylVol.id, JSON.stringify(o));
  await js(`${S}.layout.setToolOption('cutShape', 'box'); ${S}.layout.setTool('select'); true`);

  // the elevation: level lines, a new plane by clicking, a level line dragged, an object anchored to a plane
  const E = 'window.lionaxon.views.elev';
  await key(win, '3', ['control']);
  await sleep(400);
  check('Ctrl+3 shows the elevation, with one level line per plane', await js(`${S}.layout.tab === 'elev' && document.querySelectorAll('[data-view=elev] .level-line').length === ${S}.document.project.levels.length`),
    await js(`${S}.layout.tab + ' lines ' + document.querySelectorAll('[data-view=elev] .level-line').length + ' levels ' + ${S}.document.project.levels.length + ' cam ' + JSON.stringify(${E}.cam)`));
  const midX = await js(`(() => { const s = ${S}.document.project.site; const v = ${E}.view; return s.w / 2 * v.e1[0] + s.d / 2 * v.e1[1]; })()`);
  const nLevels = await js(`${S}.document.project.levels.length`);
  await js(`document.querySelector('[data-view=elev] [data-elev-tool=level]').click(); true`);
  await click(win, await js(`${E}.clientAt([${midX}, -11])`));
  const newLevel = JSON.parse(await js(`JSON.stringify(${S}.document.project.levels.find((l) => Math.abs(l.z - 11) < 1e-6) || null)`));
  check('a click with the plane tool makes a reference plane at that height (+11.00)', (await js(`${S}.document.project.levels.length`)) === nLevels + 1 && !!newLevel);
  await drag(win, await js(`${E}.clientAt([${midX} + 3, -11])`), await js(`${E}.clientAt([${midX} + 3, -14])`), 8);
  check('dragging the level line changes its elevation (+14.00)', Math.abs((await js(`${S}.document.project.levels.find((l) => l.id === ${JSON.stringify(newLevel.id)}).z`)) - 14) < 1e-6);
  // a box dragged up in the elevation until its base meets the new level line
  const boxE = JSON.parse(await js(`JSON.stringify(${S}.document.objects.find((o) => o.type === 'volume' && o.shape === 'box' && !o.on && o.state === 'normal'))`));
  const base0 = await js(`${E}.extentOf(${S}.document.byId(${JSON.stringify(boxE.id)})).z0`);
  await js(`${S}.document.clearSelection(); true`);
  await sleep(150);
  const bx = await js(`(() => { const v = ${E}.view; return ${boxE.x} * v.e1[0] + ${boxE.y} * v.e1[1]; })()`);
  await drag(win, await js(`${E}.clientAt([${bx}, -${base0 + boxE.h / 2}])`), await js(`${E}.clientAt([${bx}, -${boxE.h / 2 + 13.8}])`), 12);
  const anchored = JSON.parse(await js(`JSON.stringify(${S}.document.byId(${JSON.stringify(boxE.id)}))`));
  check('an object dragged onto a level line is anchored to that plane', anchored.level === newLevel.id && Math.abs(anchored.z) < 1e-6, JSON.stringify({ level: anchored.level, z: anchored.z }));
  await js(`${S}.commands.setLevel(${JSON.stringify(newLevel.id)}, { z: 16 }); true`);
  check('…and follows the plane when its elevation changes', Math.abs((await js(`window.lionaxon.views.axon.extentOf(${S}.document.byId(${JSON.stringify(boxE.id)})).z0`)) - 16) < 1e-6);
  await key(win, '1', ['control']);
  await sleep(300);

  // an exploded view of the step
  await js(`${S}.document.clearSelection(); true`);
  await sleep(150);
  const pathsBefore = await js(`document.querySelectorAll('[data-view=axon] .ax-model path').length`);
  await js(`document.querySelector('.properties input[data-key=explode]').click(); true`);
  await sleep(250);
  check('a step can be exploded: the planes move apart, with dashed lines down', await js(`${S}.document.step.explode.on === true`) && (await js(`document.querySelectorAll('[data-view=axon] .ax-model path[stroke-dasharray]').length`)) > 0 && (await js(`document.querySelectorAll('[data-view=axon] .ax-model path').length`)) > pathsBefore);
  await js(`document.querySelector('.properties input[data-key=explodeFloors]').click(); true`);
  await sleep(200);
  check('…and the floors too', await js(`${S}.document.step.explode.floors === true`));
  await js(`${S}.commands.setStepProps({ explode: { on: false, gap: 4, floors: false } }); true`);

  // a person in a wheelchair; a label in another font
  await key(win, 'P');
  await click(win, await at(js, [20, 34, 0]));
  await js(`document.querySelector('.properties .segmented [data-value="3"]').click(); true`);
  await sleep(120);
  check('a person can be in a wheelchair', await js(`${S}.document.objects.at(-1).pose === 3 && document.querySelector('[data-view=axon] [data-id="' + ${S}.document.objects.at(-1).id + '"] circle') != null`));
  await key(win, 'T');
  await click(win, await at(js, [9, 8, 3]));
  await sleep(250);
  await js(`document.activeElement.blur(); (() => { const s = document.querySelector('.properties select[data-key=font]'); s.value = 'hand'; s.dispatchEvent(new Event('change')); return true; })()`);
  await sleep(150);
  check('the font of a label can be changed', await js(`${S}.document.objects.at(-1).font === 'hand' && [...document.querySelectorAll('[data-view=axon] .ax-top text')].some((x) => /Architects Daughter/.test(x.getAttribute('font-family')))`));

  // north in the drawings, in half tone; the two new styles
  await js(`${S}.commands.setProject((p) => { p.northPlace = 'drawing'; p.northHalftone = true; }); true`);
  await sleep(150);
  check('the north arrow can lie in the drawings, in half tone', await js(`document.querySelector('[data-view=axon] .ax-north')?.getAttribute('opacity') === '0.55'`));
  check('…and leaves the sheet header', await js(`(async () => { const m = await import('../services/render/common/sheet.js'); return !m.renderSheet(${S}.document.project, { t: (k) => k }).svg.includes('id="north"'); })()`));
  // the two colour themes of the interface (the drawing keeps its own style)
  const paper = await js(`document.querySelector('[data-view=axon] svg > rect')?.getAttribute('fill')`);
  await js(`document.querySelector('.theme-switch [data-theme-id=map]').click(); true`);
  await sleep(100);
  check('the "Map" interface theme: cream and dark green, vermilion accent', await js(`document.documentElement.dataset.theme === 'map' && getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() === '#e2552e' && getComputedStyle(document.querySelector('.titlebar')).backgroundColor === 'rgb(239, 231, 215)'`));
  await js(`document.querySelector('.theme-switch [data-theme-id=riverfront]').click(); true`);
  await sleep(100);
  check('the "Riverfront" interface theme: sea green and deep teal, blue accent', await js(`document.documentElement.dataset.theme === 'riverfront' && getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() === '#2c6aa8'`));
  check('…the drawing is not affected by the interface theme', paper === await js(`document.querySelector('[data-view=axon] svg > rect')?.getAttribute('fill')`));
  check('…and the theme is remembered', await js(`localStorage.getItem('lionaxon.theme') === 'riverfront'`));
  await js(`${S}.layout.setTheme('auto'); true`);
  const png = JSON.parse(await js(`${S}.commands.exportStep('png').then((r) => JSON.stringify(r))`));
  check('a step with a handwritten label exports as PNG', png && png.ok && fs.existsSync(png.path));

  // closing with unsaved changes asks first: cancel keeps the window, "don't save" closes the tab
  win.close();
  await sleep(400);
  check('closing the window with unsaved diagrams asks first', await js(`!!document.querySelector('.save-dialog')`));
  await js(`document.querySelector('.save-dialog [data-answer=cancel]').click(); true`);
  await sleep(200);
  check('…and Cancel keeps it open', !win.isDestroyed() && await js(`!document.querySelector('.save-dialog')`));
  const n = await js(`${S}.document.tabs.length`);
  await js(`${S}.document.switchTo(${S}.document.tabs.findIndex((t) => t.project.name === 'Features 0.2')); true`);
  await key(win, 'W', ['control']);
  await sleep(250);
  check('closing a tab with changes asks whether to save', await js(`!!document.querySelector('.save-dialog') && document.querySelector('.save-dialog h2').textContent.includes('Features 0.2')`));
  await js(`document.querySelector('.save-dialog [data-answer=discard]').click(); true`);
  await sleep(250);
  check('…"Don\'t save" closes it', (await js(`${S}.document.tabs.length`)) === n - 1 && !(await js(`${S}.document.tabs.some((t) => t.project.name === 'Features 0.2')`)));
}

// ---------------------------------------------------------------------------------------------
// 0.8: the model is edited from the 3D viewer too

async function edit3d08(win, js) {
  const O = 'window.lionaxon.views.orbit';
  await js(`${S}.commands.example('parti').then(() => true)`);
  await sleep(400);
  await js(`${S}.document.setStep(0); ${S}.layout.setTab('orbit'); true`);
  await sleep(500);
  await js(`${O}.setAngle(315, 35.2644); ${O}.fit(); true`);
  await sleep(400);
  const state = () => js(`JSON.stringify({ sel: [...${S}.document.selection], objs: ${S}.document.objects.map((o) => [o.id, o.x, o.y, o.h]), n: ${S}.document.objects.length })`).then(JSON.parse);
  const topOf = (id) => js(`(() => { const r = document.querySelector('[data-view=orbit] .canvas [data-id="${id}"][data-top]').getBoundingClientRect(); return JSON.stringify([r.left + r.width / 2, r.top + r.height / 2]); })()`).then(JSON.parse);
  const s0 = await state();
  const id = await js(`${S}.document.objects.find((o) => o.type === 'volume').id`);
  const before = s0.objs.find((o) => o[0] === id);
  const grid = await js(`${S}.document.project.grid`);

  let at = await topOf(id);
  await click(win, at);
  await sleep(200);
  check('3D: a click on a volume selects it', JSON.stringify((await state()).sel) === JSON.stringify([id]));
  check('3D: what is selected is marked, with a handle for its height, inside a frame in the selection colour', await js(`getComputedStyle(document.querySelector('.orbit-canvas')).outlineStyle === 'solid' && !!document.querySelector('[data-view=orbit] .orbit-sel') && !!document.querySelector('[data-view=orbit] [data-handle=h]')`));
  check('3D: the properties show it', await js(`!!document.querySelector('.properties input[data-key=h], .properties .form-grid input')`));

  await drag(win, at, [at[0] + 70, at[1] + 10], 10);
  await sleep(250);
  let now = (await state()).objs.find((o) => o[0] === id);
  const onGrid = (v) => Math.abs(v / grid - Math.round(v / grid)) < 1e-6;
  check('3D: dragging a volume slides it on the ground, on the grid', (now[1] !== before[1] || now[2] !== before[2]) && onGrid(now[1] - before[1]) && onGrid(now[2] - before[2]) && now[3] === before[3], JSON.stringify([before, now]));
  check('3D: the view did not turn meanwhile', await js(`${O}.angle.az === 315`));
  await key(win, 'Z', ['control']);
  await sleep(200);
  now = (await state()).objs.find((o) => o[0] === id);
  check('3D: one undo takes the move back', now[1] === before[1] && now[2] === before[2]);

  const hp = await js(`JSON.stringify(${O}.clientAt(${O}.heightHandle()))`).then(JSON.parse);
  await drag(win, hp, [hp[0], hp[1] - 60], 10);
  await sleep(250);
  now = (await state()).objs.find((o) => o[0] === id);
  check('3D: pulling the handle up makes the volume taller, by half metres', now[3] > before[3] && Math.abs(now[3] * 2 - Math.round(now[3] * 2)) < 1e-6 && now[1] === before[1], JSON.stringify([before, now]));
  await key(win, 'Z', ['control']);
  await sleep(200);

  await key(win, 'Delete');
  await sleep(200);
  check('3D: Delete removes what is selected', (await state()).n === s0.n - 1);
  await key(win, 'Z', ['control']);
  await sleep(200);
  check('3D: …and undo brings it back', (await state()).n === s0.n);

  at = await topOf(id);
  await click(win, at);
  await sleep(150);
  const r = await js(`(() => { const r = document.querySelector('[data-view=orbit] .canvas').getBoundingClientRect(); return JSON.stringify([r.left + 12, r.bottom - 12]); })()`).then(JSON.parse);
  await click(win, r);
  await sleep(200);
  check('3D: a click on the paper clears the selection', (await state()).sel.length === 0);
  await drag(win, r, [r[0] + 40, r[1]], 6);
  await sleep(200);
  check('3D: a drag on the paper still turns the view', await js(`${O}.angle.az !== 315`));
  await js(`${S}.layout.setTab('axon'); true`);
  await sleep(200);
}

// Tab picks the next object under the same spot; it takes another outline and the rest fades
async function cycle08(win, js) {
  await js(`${S}.commands.example('tower').then(() => true)`);
  await sleep(400);
  await js(`${S}.document.setStep(${S}.document.project.steps.length - 1); ${S}.layout.setTab('plan'); ${S}.layout.setTool('select'); true`);
  await sleep(400);
  await js(`window.lionaxon.views.plan.fit(); true`);
  await sleep(300);
  const sel = () => js(`JSON.stringify([...${S}.document.selection])`).then(JSON.parse);
  const cycling = (view) => js(`document.querySelector('[data-view=${view}] .canvas').classList.contains('cycling')`);
  // the tower stands on the base: in plan, a click on it only reaches the tower
  const at = await js(`(() => { const r = document.querySelector('[data-view=plan] .canvas [data-id="v-tower"]').getBoundingClientRect(); return JSON.stringify([r.left + r.width / 2, r.top + r.height / 2]); })()`).then(JSON.parse);
  const stack = await js(`JSON.stringify(window.lionaxon.views.plan.cycle.under(${JSON.stringify(at)}))`).then(JSON.parse);
  check('Tab: several objects are drawn under the spot', stack.length >= 2 && stack.includes('v-base'), JSON.stringify(stack));
  await click(win, at);
  await sleep(200);
  const first = (await sel())[0];
  check('Tab: a click reaches the one in front, nothing fades', first === stack[0] && !(await cycling('plan')), first);
  await key(win, 'Tab');
  await sleep(200);
  const second = (await sel())[0];
  check('Tab: picks the next object under the same spot', second === stack[1], second);
  check('Tab: the one picked keeps its colours, the others fade, the outline takes another colour', await js(`(() => {
    const c = document.querySelector('[data-view=plan] .canvas');
    const on = c.querySelector('[data-id="${stack[1]}"]'), off = c.querySelector('[data-id="${stack[0]}"]');
    const edge = [...c.querySelectorAll('svg > g:last-of-type [stroke="#2f74e8"]')][0];
    return c.classList.contains('cycling') && getComputedStyle(on).opacity === '1' && Number(getComputedStyle(off).opacity) < 0.5 && !!edge && getComputedStyle(edge).stroke === 'rgb(192, 38, 211)';
  })()`));
  await key(win, 'Tab', ['shift']);
  await sleep(200);
  check('Tab: Shift+Tab goes back', (await sel())[0] === stack[0] && await cycling('plan'));
  for (let k = 0; k < stack.length; k++) { await key(win, 'Tab'); await sleep(120); }
  check('Tab: after the last one it starts again', (await sel())[0] === stack[0]);
  // pick the base (under the tower) and drag from the spot: the base is what moves
  while ((await sel())[0] !== 'v-base') { await key(win, 'Tab'); await sleep(120); }
  const x0 = await js(`${S}.document.byId('v-base').x`);
  await drag(win, at, [at[0] + 60, at[1]], 8);
  await sleep(250);
  check('Tab: a drag from the spot moves the object picked, not the one in front', (await sel())[0] === 'v-base' && await js(`${S}.document.byId('v-base').x`) !== x0);
  await key(win, 'Z', ['control']);
  await sleep(200);
  await key(win, 'Escape');
  await sleep(200);
  check('Tab: Esc ends it and nothing is faded any more', !(await cycling('plan')) && (await sel()).length === 0 && await js(`!document.querySelector('[data-view=plan] .cycle-on')`));
  // the 3D viewer does the same
  await js(`${S}.layout.setTab('orbit'); true`);
  await sleep(500);
  await js(`window.lionaxon.views.orbit.setAngle(315, 90); window.lionaxon.views.orbit.fit(); true`);
  await sleep(400);
  const at3 = await js(`(() => { const r = document.querySelector('[data-view=orbit] .canvas [data-id="v-tower"]').getBoundingClientRect(); return JSON.stringify([r.left + r.width / 2, r.top + r.height / 2]); })()`).then(JSON.parse);
  await click(win, at3);
  await sleep(200);
  const a = (await sel())[0];
  await key(win, 'Tab');
  await sleep(200);
  const b = (await sel())[0];
  check('Tab: in the 3D viewer too', !!a && !!b && a !== b && await cycling('orbit'), JSON.stringify([a, b]));
  await key(win, 'Escape');
  await js(`window.lionaxon.views.orbit.setAngle(315, 35.2644); ${S}.layout.setTab('axon'); true`);
  await sleep(200);
}

// the text of a label is written where it is drawn
async function labelEdit08(win, js) {
  await js(`${S}.document.switchTo(${S}.document.tabs.findIndex((t) => /tower/i.test(t.project.name))); ${S}.document.setStep(${S}.document.project.steps.length - 1); ${S}.layout.setTab('axon'); ${S}.layout.setTool('select'); true`);
  await sleep(400);
  await js(`window.lionaxon.views.axon.fit(); true`);
  await sleep(300);
  const id = await js(`${S}.document.objects.find((o) => o.type === 'label').id`);
  const before = await js(`${S}.document.byId('${id}').text`);
  const at = await js(`(() => { const r = document.querySelector('[data-view=axon] .canvas [data-id="${id}"] text').getBoundingClientRect(); return JSON.stringify([r.left + r.width / 2, r.top + r.height / 2]); })()`).then(JSON.parse);
  const dbl = async () => {
    await mouse(win, 'mouseMove', at);
    await mouse(win, 'mouseDown', at); await mouse(win, 'mouseUp', at);
    await mouse(win, 'mouseDown', at, { clickCount: 2 }); await mouse(win, 'mouseUp', at, { clickCount: 2 });
    await sleep(300);
  };
  await dbl();
  check('label: a double click opens its text on the drawing, with the text selected', await js(`(() => { const a = document.querySelector('[data-view=axon] .label-box textarea'); return !!a && document.activeElement === a && a.value === ${JSON.stringify(before)} && a.selectionEnd - a.selectionStart === a.value.length; })()`));
  check('label: the box sits over the label', await js(`(() => { const b = document.querySelector('.label-box').getBoundingClientRect(); return Math.abs(b.left - ${at[0]}) < 400 && b.top < ${at[1]} + 6 && b.bottom > ${at[1]} - 6; })()`));
  await type(win, 'Sky bar');
  await key(win, 'Enter');
  await sleep(250);
  check('label: Enter applies what was typed', await js(`${S}.document.byId('${id}').text === 'Sky bar' && !document.querySelector('.label-box')`));
  await key(win, 'Enter');
  await sleep(250);
  check('label: Enter on the selected label opens it again', await js(`!!document.querySelector('[data-view=axon] .label-box textarea')`));
  await type(win, 'nothing');
  await key(win, 'Escape');
  await sleep(200);
  check('label: Esc gives up', await js(`${S}.document.byId('${id}').text === 'Sky bar' && !document.querySelector('.label-box')`));
  await key(win, 'Z', ['control']);
  await sleep(200);
  check('label: one undo brings the old text back', await js(`${S}.document.byId('${id}').text === ${JSON.stringify(before)}`));
  await key(win, 'Escape');
}

// ---------------------------------------------------------------------------------------------
// 0.10: openings on the walls, the ridge and the colour of a roof, a colour of its own, areas over a block of
// earth with joints, arrows between levels, notes and marks on labels, the legend along the foot, text blocks

async function features10(win, js) {
  const D = `${S}.document`, C = `${S}.commands`;
  await js(`${C}.newProject(); true`);
  await sleep(400);
  await js(`${S}.layout.setTab('axon'); ${S}.layout.setTool('select'); true`);
  await js(`${C}.setProject((p) => { p.site.thickness = 3; p.site.mode = 'fill'; }, 'project.set'); true`);
  const add = (o) => js(`(async () => { const m = await import('../services/model/common/model.js'); const o = m.normalizeObject(${JSON.stringify(o)}); ${D}.run('object.add', (_p, step) => { step.objects.push(o); return [o.id]; }); return o.id; })()`);
  const obj = (id) => js(`JSON.stringify(${D}.byId('${id}'))`).then(JSON.parse);
  const axon = '[data-view=axon] .canvas';

  // a flat area over a site with thickness is drawn over the top of the block, with its joints
  await add({ type: 'area', id: 'e-sq', x: 12, y: 8, w: 12, d: 8, kind: 'paving', joints: 2 });
  await sleep(300);
  check('0.10: an area over a block of earth is drawn on its top (not under it), with joints', await js(`(() => { const a = document.querySelector('${axon} .ax-model .ax-area'); return !!a && !!a.parentElement.getAttribute('clip-path') && a.parentElement.querySelectorAll('path').length === 2 && !document.querySelector('${axon} .ax-ground .ax-area'); })()`));
  check('0.10: paving is darker than the paper, not lighter', await js(`(async () => { const st = await import('../services/render/common/styles.js'); const paper = st.getStyle(${D}.project.style).paper; return document.querySelector('${axon} .ax-area').getAttribute('fill') !== '#ffffff' && st.shade(paper, 0.06) === document.querySelector('${axon} .ax-area').getAttribute('fill'); })()`));

  // openings: from the properties of a box, on the wall that faces the person
  await add({ type: 'volume', id: 'v-hall', x: 12, y: 18, w: 12, d: 8, h: 6 });
  await sleep(300);
  await js(`document.querySelector('.properties [data-action=opening-arch]').click(); true`);
  await sleep(300);
  const op = await js(`JSON.stringify(${D}.selected()[0])`).then(JSON.parse);
  check('0.10: a button of the box draws an arch on the wall that faces the person', op?.type === 'opening' && op.kind === 'arch' && op.on === 'v-hall' && ['front', 'right'].includes(op.side), JSON.stringify(op));
  check('0.10: …it is drawn, and its form shows kind, wall, place and size', await js(`!!document.querySelector('${axon} .ax-opening[data-id="${op.id}"]') && !!document.querySelector('.properties input[data-key=u]') && document.querySelectorAll('.properties .segmented').length >= 2`));
  const before = await js(`document.querySelector('${axon} .ax-opening path').getAttribute('d')`);
  await js(`${C}.setProps({ kind: 'oculus', side: 'right', z: 3 }); true`);
  await sleep(250);
  check('0.10: kind, wall and height change the drawing', await js(`document.querySelector('${axon} .ax-opening path').getAttribute('d')`) !== before && (await obj(op.id)).side === 'right');
  await js(`${D}.select(['v-hall']); ${C}.setProps({ x: 20 }); true`);
  await sleep(250);
  check('0.10: the opening goes with its volume', await js(`document.querySelector('${axon} .ax-opening path').getAttribute('d')`) !== before);
  await js(`${C}.duplicateSelection(); true`);
  await sleep(200);
  check('0.10: duplicating the volume duplicates its openings', await js(`${D}.objects.filter((o) => o.type === 'opening').length`) === 2);
  await js(`${C}.deleteSelection(); true`);
  await sleep(200);
  check('0.10: deleting a volume takes its openings', await js(`${D}.objects.filter((o) => o.type === 'opening').length`) === 1);

  // the roof: ridge and colour; a colour of its own
  await js(`${D}.select(['v-hall']); ${C}.setProps({ roof: 'gable' }); true`);
  await sleep(250);
  const roofA = await js(`document.querySelector('${axon} svg').innerHTML.length + '|' + [...document.querySelectorAll('${axon} [data-id="v-hall"]')].map((e) => e.getAttribute('d')).join('')`);
  await js(`document.querySelectorAll('.properties .segmented')[2] && ${C}.setProps({ roofDir: 'd' }); true`);
  await sleep(250);
  const roofB = await js(`document.querySelector('${axon} svg').innerHTML.length + '|' + [...document.querySelectorAll('${axon} [data-id="v-hall"]')].map((e) => e.getAttribute('d')).join('')`);
  check('0.10: the ridge can run across the longer side', roofA !== roofB && (await obj('v-hall')).roofDir === 'd');
  await js(`${C}.setProps({ roofDir: 'auto', roofColor: '#8e3a34', color: '#cfc3ad' }); true`);
  await sleep(250);
  let v = await obj('v-hall');
  check('0.10: "auto" keeps no direction; the roof and the volume take colours of their own', !('roofDir' in v) && v.roofColor === '#8e3a34' && v.color === '#cfc3ad' && await js(`!!document.querySelector('.properties [data-action=clear-color]') && !!document.querySelector('.properties [data-action=clear-roofColor]')`));
  check('0.10: …and a volume with its own colour stays out of the legend', await js(`(async () => { const m = await import('../services/render/common/sheet.js'); return !m.renderSheet(${D}.project, { t: (k) => k }).svg.includes('#cfc3ad'); })()`));
  await js(`document.querySelector('.properties [data-action=clear-color]').click(); true`);
  await sleep(250);
  check('0.10: "None" takes the colour away', !('color' in (await obj('v-hall'))));

  // an arrow that climbs; a label with a note and a mark
  const aid = await add({ type: 'arrow', id: 'a-up', x1: 2, y1: 2, x2: 10, y2: 6, z: 0 });
  const flat = await js(`document.querySelector('${axon} [data-id="a-up"]').innerHTML`);
  await js(`${C}.setProps({ z2: 4 }); true`);
  await sleep(250);
  check('0.10: an arrow may end at another height', (await obj(aid)).z2 === 4 && await js(`document.querySelector('${axon} [data-id="a-up"]').innerHTML`) !== flat);
  await js(`${C}.setProps({ z2: 0 }); true`);
  check('0.10: …and the same height as the start keeps nothing', !('z2' in (await obj(aid))));
  const lid = await add({ type: 'label', id: 'l-n', x: 6, y: 6, z: 0, text: 'Foyer' });
  await js(`${C}.setProps({ note: 'arrival of the public', mark: '!' }); true`);
  await sleep(250);
  check('0.10: a label carries a quieter note and a mark at its point', await js(`(() => { const g = document.querySelector('${axon} [data-id="l-n"]'); const tx = [...g.querySelectorAll('text')]; return tx.length === 3 && tx[1].textContent === 'arrival of the public' && Number(tx[1].getAttribute('font-size')) < Number(tx[0].getAttribute('font-size')) && tx[2].textContent === '!' && g.querySelectorAll('circle').length === 2; })()`));
  await js(`${C}.setProps({ note: '', mark: '' }); true`);
  const l = await obj(lid);
  check('0.10: …both go away when emptied', !('note' in l) && !('mark' in l));

  // the sheet: the legend along the foot, text blocks on the right
  await js(`${C}.setProject((p) => { p.categories.push({ id: 'k-a', name: 'Hall', color: '#f2b98a' }); }, 'category.add'); ${D}.select(['v-hall']); ${C}.setProps({ cat: 'k-a' }); ${S}.layout.setTab('sheet'); ${S}.layout.setActivity?.('sheet'); true`);
  await sleep(500);
  const legendY = () => js(`(async () => { const m = await import('../services/render/common/sheet.js'); const r = m.renderSheet(${D}.project, { t: (k) => k }); const y = /<g id="legend">.*?<text x="[^"]*" y="([0-9.]+)"/.exec(r.svg)?.[1]; return JSON.stringify([Number(y), r.height, r.svg.includes('id="notes"'), r.scale]); })()`).then(JSON.parse);
  const top = await legendY();
  await js(`${C}.setProject((p) => { p.sheet.legendPlace = 'bottom'; }, 'sheet.set'); true`);
  const bottom = await legendY();
  check('0.10: the legend can go along the foot of the sheet', top[0] < top[1] / 2 && bottom[0] > bottom[1] * 0.8, JSON.stringify([top, bottom]));
  await js(`${C}.setProject((p) => { p.sheet.blocks = [{ title: 'Strategy', text: 'One volume on the edge.\\n+ a larger square\\n− more earth moved' }]; }, 'sheet.set'); true`);
  await sleep(500);
  const withBlocks = await legendY();
  check('0.10: text blocks take a column on the right; the drawings make room', withBlocks[2] && !bottom[2] && withBlocks[3] >= bottom[3], JSON.stringify([bottom, withBlocks]));
  check('0.10: + and − lines are points for and against', await js(`(async () => { const m = await import('../services/render/common/sheet.js'); const svg = m.renderSheet(${D}.project, { t: (k) => k }).svg; const g = svg.slice(svg.indexOf('<g id="notes">')); return (g.match(/<circle/g) || []).length === 2 && g.includes('#2e8b57') && g.includes('#c8322d') && g.includes('STRATEGY'); })()`));
  check('0.10: the sheet pane edits the blocks and the place of the legend', await js(`!!document.querySelector('.sidebar [data-block="0"] textarea') && !!document.querySelector('.sidebar [data-action=add-block]')`));
  // saved and read back
  check('0.10: everything survives the file', await js(`(async () => { const m = await import('../services/model/common/model.js'); const p = m.normalizeProject(JSON.parse(JSON.stringify(${D}.project))); const o = p.steps[0].objects; return p.sheet.legendPlace === 'bottom' && p.sheet.blocks.length === 1 && o.some((x) => x.type === 'opening' && x.kind === 'oculus') && o.find((x) => x.id === 'e-sq').joints === 2 && o.find((x) => x.id === 'v-hall').roofColor === '#8e3a34'; })()`));
  await js(`${S}.layout.setTab('axon'); true`);
  await sleep(200);
}

// ---------------------------------------------------------------------------------------------
// 0.11: the align tool — the face to align to, then the face of another shape, which moves into its plane

async function alignFaces11(win, js) {
  const D = `${S}.document`, C = `${S}.commands`, V = 'window.lionaxon.views.axon';
  await js(`${C}.newProject(); true`);
  await sleep(400);
  await js(`${S}.layout.setTab('axon'); true`);
  const add = (o) => js(`(async () => { const m = await import('../services/model/common/model.js'); const o = m.normalizeObject(${JSON.stringify(o)}); ${D}.run('object.add', (_p, step) => { step.objects.push(o); return []; }); return o.id; })()`);
  await add({ type: 'volume', id: 'v-a', x: 10, y: 10, w: 8, d: 6, h: 6 });   // x 6..14, y 7..13
  await add({ type: 'volume', id: 'v-b', x: 21, y: 12.5, w: 6, d: 4, h: 3 }); // x 18..24, y 10.5..14.5
  await add({ type: 'volume', id: 'v-top', x: 21, y: 12.5, w: 2, d: 2, h: 2, on: 'v-b' });
  await add({ type: 'volume', id: 'v-rot', x: 30, y: 24, w: 6, d: 4, h: 3, rot: 30 });
  await sleep(300);
  await js(`${V}.fit(); true`);
  await sleep(400);
  // a point of a face on the screen: the middle of the wall of a box that looks to the front (−y) or to the right (+x), or of its top
  const at = (id, which) => js(`(async () => { const p = await import('../../base/common/geometry/projection.js'); const v = ${V}, o = ${D}.byId('${id}'); const e = v.extentOf(o);
    const w = ${JSON.stringify(which)} === 'front' ? [o.x, o.y - o.d / 2, (e.z0 + e.z1) / 2] : ${JSON.stringify(which)} === 'right' ? [o.x + o.w / 2, o.y, (e.z0 + e.z1) / 2] : [o.x, o.y, e.z1];
    return JSON.stringify(v.clientAt(p.project(v.view, w))); })()`).then(JSON.parse);
  const pos = (id) => js(`JSON.stringify((() => { const o = ${D}.byId('${id}'); return [o.x, o.y, o.z, o.w, o.d, o.h]; })())`).then(JSON.parse);
  await key(win, 'L');
  await sleep(200);
  check('align: L takes the tool, with its hint', await js(`${S}.layout.tool === 'align' && /face/i.test(document.querySelector('.status-hint').textContent) && !!document.querySelector('[data-view=axon] .toolbar [data-tool=align], [data-view=axon] .toolbar button[aria-pressed=true]')`));
  // the front wall of A is the reference; the front wall of B comes to it
  await click(win, await at('v-a', 'front'));
  await sleep(250);
  check('align: the first click marks the face to align to; nothing moves', await js(`!!document.querySelector('[data-view=axon] .align-ref')`) && JSON.stringify(await pos('v-b')) === JSON.stringify([21, 12.5, 0, 6, 4, 3]));
  await click(win, await at('v-b', 'front'));
  await sleep(300);
  let b = await pos('v-b');
  check('align: the second click brings that face into the same plane (it moves straight, keeps its size)', b[0] === 21 && Math.abs(b[1] - b[4] / 2 - 7) < 1e-6 && b[3] === 6 && b[4] === 4, JSON.stringify(b));
  check('align: what stands on it goes along', (await pos('v-top'))[1] === b[1]);
  check('align: the reference did not move, and the tool waits for a new one', JSON.stringify((await pos('v-a')).slice(0, 2)) === '[10,10]' && await js(`!document.querySelector('[data-view=axon] .align-ref') && ${S}.layout.tool === 'align'`));
  await key(win, 'Z', ['control']);
  await sleep(200);
  check('align: one undo takes it back', (await pos('v-b'))[1] === 12.5 && (await pos('v-top'))[1] === 12.5);
  // tops: B rises to the height of A
  await click(win, await at('v-a', 'top'));
  await click(win, await at('v-b', 'right'));
  await sleep(300);
  check('align: a top and a side are not parallel — nothing moves, and it says so', JSON.stringify(await pos('v-b')) === JSON.stringify([21, 12.5, 0, 6, 4, 3]) && await js(`!!document.querySelector('.notification, .toast')`));
  // (the tower on B hides its top: align the right wall of B to the right wall of A instead, then tops with the rotated box)
  await key(win, 'Escape');
  await key(win, 'L');
  await click(win, await at('v-a', 'right'));
  await click(win, await at('v-b', 'right'));
  await sleep(300);
  b = await pos('v-b');
  check('align: right walls: B slides along x until they are flush', Math.abs(b[0] + b[3] / 2 - 14) < 1e-6 && b[1] === 12.5, JSON.stringify(b));
  await click(win, await at('v-a', 'top'));
  await click(win, await at('v-rot', 'top'));
  await sleep(300);
  const r = await pos('v-rot');
  check('align: tops: the other shape is raised until its top is level with the reference', r[2] + r[5] === 6 && r[0] === 30 && r[1] === 24, JSON.stringify(r));
  await click(win, await at('v-a', 'front'));
  await click(win, await at('v-rot', 'top'));
  await sleep(200);
  check('align: a turned box keeps its place when its faces are not parallel to the reference', JSON.stringify((await pos('v-rot')).slice(0, 3)) === JSON.stringify(r.slice(0, 3)));
  check('align: a volume standing on another cannot have its top aligned', await js(`${C}.alignFace('v-top', [0, 0, 1])`) === 'stacked' && await js(`${C}.setProps({ locked: true }, ['v-b']); ${C}.alignFace('v-b', [1, 0, 0])`) === 'locked');
  await key(win, 'Escape');
  await sleep(150);
  check('align: Esc goes back to selecting', await js(`${S}.layout.tool === 'select' && !document.querySelector('[data-view=axon] .align-ref, [data-view=axon] .align-hover')`));
}

// ---------------------------------------------------------------------------------------------
// 0.12: a locked object can be picked to be unlocked; a pane keeps its scroll; updating from the app

async function fixes12(win, js) {
  const D = `${S}.document`, C = `${S}.commands`, V = 'window.lionaxon.views.axon';
  await js(`${C}.newProject(); true`);
  await sleep(400);
  await js(`${S}.layout.setTab('axon'); ${S}.layout.setTool('select'); true`);
  await js(`(async () => { const m = await import('../services/model/common/model.js'); const o = m.normalizeObject({ type: 'platform', id: 'g-p', x: 14, y: 14, w: 12, d: 10, z: 2 }); ${D}.run('object.add', (_p, step) => { step.objects.push(o); return ['g-p']; }); return true; })()`);
  await sleep(300);
  await js(`${V}.fit(); true`);
  await sleep(300);
  const at = await js(`(async () => { const p = await import('../../base/common/geometry/projection.js'); return JSON.stringify(${V}.clientAt(p.project(${V}.view, [14, 14, 2]))); })()`).then(JSON.parse);
  await js(`document.querySelector('.properties .name-row .icon-button').click(); true`);
  await sleep(250);
  check('lock: the padlock of the panel locks a platform; it stays selected, without handles, and says so', await js(`${D}.byId('g-p').locked === true && ${D}.selection.has('g-p') && !document.querySelector('[data-view=axon] [data-handle]') && !!document.querySelector('.properties .locked-note [data-action=unlock]')`));
  await key(win, 'Escape');
  await sleep(150);
  await click(win, at);
  await sleep(250);
  check('lock: a click on the locked platform selects it again', await js(`${D}.selection.has('g-p') && !!document.querySelector('.properties .locked-note')`));
  const before = await js(`JSON.stringify([${D}.byId('g-p').x, ${D}.byId('g-p').y])`);
  await drag(win, at, [at[0] + 80, at[1] + 10], 8);
  await key(win, 'ArrowRight');
  await sleep(250);
  check('lock: …but a drag or the arrows do not move it', await js(`JSON.stringify([${D}.byId('g-p').x, ${D}.byId('g-p').y])`) === before);
  await click(win, at);
  await sleep(200);
  await js(`document.querySelector('.properties .locked-note [data-action=unlock]').click(); true`);
  await sleep(250);
  check('lock: "Unlock" in the panel frees it, and the handles are back', await js(`!${D}.byId('g-p').locked && !document.querySelector('.properties .locked-note') && !!document.querySelector('[data-view=axon] [data-handle]')`));

  // a pane keeps its place when what it shows is rebuilt
  await js(`${S}.layout.setActivity('project'); true`);
  await sleep(400);
  const scroll = await js(`(() => { const b = [...document.querySelectorAll('.sidebar .pane-body')].find((e) => e.offsetParent && e.scrollHeight > e.clientHeight + 40); if (!b) return null; b.scrollTop = b.scrollHeight; return b.scrollTop; })()`);
  await js(`(() => { const b = [...document.querySelectorAll('.sidebar .style-card, .sidebar [data-style]')]; b[b.length - 2].click(); return true; })()`);
  await sleep(500);
  const after = await js(`[...document.querySelectorAll('.sidebar .pane-body')].find((e) => e.offsetParent && e.scrollHeight > e.clientHeight + 40)?.scrollTop`);
  check('pane: choosing a drawing style does not throw the project pane back to its top', scroll > 100 && Math.abs(after - scroll) < 40, JSON.stringify([scroll, after]));
  await js(`${S}.layout.setActivity('steps'); true`);
}

async function update12(win, js) {
  const U = `${S}.update`;
  const { installKind, parseManifest } = require(path.join(ROOT, 'src', 'platform', 'update', 'electron-main', 'updateMainService.js'));
  const probe = (o) => installKind({ platform: 'linux', packaged: true, exePath: '/opt/LionAxon/lionaxon', env: {}, exists: () => false, ...o });
  check('update: each kind of copy is told apart', installKind({ packaged: false }) === 'source'
    && probe({ platform: 'win32', exePath: 'C:\\Program Files\\LionAxon\\LionAxon.exe', exists: (p) => /Uninstall LionAxon\.exe$/.test(p) }) === 'win-setup'
    && probe({ platform: 'win32', exePath: 'D:\\apps\\LionAxon\\LionAxon.exe' }) === 'portable'
    && probe({ platform: 'darwin' }) === 'mac-dmg' && probe({ env: { APPIMAGE: '/home/a/LionAxon.AppImage' } }) === 'linux-appimage'
    && probe({ exists: (p) => p === '/var/lib/dpkg/info/lionaxon.list' }) === 'linux-deb' && probe({ exists: (p) => p === '/var/lib/rpm' }) === 'linux-rpm' && probe({}) === 'portable');
  check('update: the manifest gives the version and each file with its checksum', parseManifest(RELEASE.manifest).files.get('LionAxon-x86_64.AppImage').size === 300000 && parseManifest('hello') === null);
  check('update: nothing went to the network before the click', RELEASE.hits.length === 0, RELEASE.hits.join(' '));
  await js(`document.querySelector('.status-version').click(); true`);
  await sleep(1300);
  check('update: opening the window asks nothing either', RELEASE.hits.length === 0 && await js(`!!document.querySelector('.update-dialog') && !document.querySelector('.update-dialog [data-action=update-now]')`));
  await js(`${U}.check().then(() => true)`);
  await sleep(300);
  check('update: "Check now" finds the new version and offers to update this copy', RELEASE.hits.join() === '/manifest.txt' && await js(`${U}.status === 'available' && ${U}.info.latest === '99.0.0' && ${U}.info.canInstall && !!document.querySelector('.update-dialog [data-action=update-now]') && !!document.querySelector('.update-dialog .update-how')`));
  const file = path.join(process.env.LIONAXON_TEST_DIR, 'LionAxon-x86_64.AppImage.new');
  RELEASE.tampered = true;
  await js(`document.querySelector('.update-dialog [data-action=update-now]').click(); true`);
  for (let i = 0; i < 40 && await js(`${U}.status === 'downloading'`); i++) await sleep(150);
  check('update: a file that is not the one of the release is discarded, and the window says so', await js(`${U}.status === 'failed' && ${U}.result.error === 'checksum' && !!document.querySelector('.update-dialog [data-action=update-now]')`) && !fs.existsSync(file) && !fs.existsSync(file + '.part'));
  RELEASE.tampered = false;
  await js(`document.querySelector('.update-dialog [data-action=update-now]').click(); true`);
  for (let i = 0; i < 40 && await js(`${U}.status === 'downloading'`); i++) await sleep(150);
  check('update: the right file is kept, checked, and the window says what happens next', await js(`${U}.status === 'ready' && ${U}.result.how === 'appimage' && ${U}.progress.received === 300000 && /again/i.test(document.querySelector('.update-dialog [data-status=ready]').textContent)`) && fs.existsSync(file) && fs.readFileSync(file).equals(RELEASE.installer));
  await js(`document.querySelector('.update-dialog .btn-secondary').click(); true`);
  await sleep(300);
}

// ---------------------------------------------------------------------------------------------
// screenshots for the README

async function shots(win, js) {
  const dir = OUT ? path.resolve(OUT) : path.join(ROOT, 'docs', 'screenshots');
  fs.mkdirSync(dir, { recursive: true });
  const shot = async (name) => { await sleep(500); fs.writeFileSync(path.join(dir, name), (await win.webContents.capturePage()).toPNG()); console.log('  ', name); };
  await js(`${S}.notifications.element.replaceChildren(); true`);
  await win.webContents.capturePage(); // the first capture of a hidden window may still show the loading screen
  await sleep(600);
  await js(`${S}.document.setStep(4); true`);
  await sleep(300);
  await js(`window.lionaxon.views.axon.fit(); true`);
  await shot('axonometric.png');
  await js(`${S}.document.select(['v-link-w']); true`);
  await shot('properties.png');
  await js(`${S}.document.clearSelection(); ${S}.document.setStep(2); ${S}.layout.setTab('plan'); true`);
  await sleep(300);
  await js(`window.lionaxon.views.plan.fit(); true`);
  await shot('plan.png');
  await js(`${S}.layout.setTab('sheet'); true`);
  await shot('sheet.png');
  await js(`${S}.layout.setTheme('dark'); ${S}.layout.setTab('axon'); ${S}.document.setStep(3); ${S}.layout.setActivity('categories'); true`);
  await sleep(300);
  await js(`window.lionaxon.views.axon.fit(); true`);
  await shot('dark.png');
  await js(`${S}.layout.setTheme('auto'); true`);
  // 0.2: a second diagram with terrain, reference planes, curved shapes and the new style
  await js(`${S}.document.loadText(${JSON.stringify(JSON.stringify(DEMO_02))}); ${S}.layout.setActivity('project'); true`);
  await sleep(400);
  await js(`window.lionaxon.views.axon.fit(); true`);
  await shot('terrain-levels.png');
  await js(`${S}.layout.setActivity('steps'); ${S}.document.clearSelection(); true`);
  await shot('elements.png');
  await js(`${S}.document.select(['slope']); true`);
  await shot('slope.png');
  await js(`${S}.document.clearSelection(); ${S}.layout.setTab('elev'); true`);
  await sleep(400);
  await js(`window.lionaxon.views.elev.fit(); true`);
  await shot('elevation.png');
  await js(`${S}.layout.setTab('axon'); true`);
  await sleep(300);
  await js(`${S}.document.clearSelection(); ${S}.layout.setActivity('project'); ${S}.layout.setTheme('map'); true`);
  await shot('theme-map.png');
  await js(`${S}.layout.setTheme('riverfront'); ${S}.document.switchTo(0); ${S}.layout.setActivity('steps'); true`);
  await sleep(300);
  await js(`window.lionaxon.views.axon.fit(); true`);
  await shot('theme-riverfront.png');
  await js(`${S}.layout.setTheme('auto'); ${S}.document.setStep(4); ${S}.commands.setStepProps({ explode: { on: true, gap: 4, floors: true } }); true`);
  await sleep(400);
  await js(`window.lionaxon.views.axon.fit(); true`);
  await shot('exploded.png');
  await js(`${S}.commands.undo(); ${S}.commands.setProject((p) => { p.sheet.layout = 'vertical'; p.sheet.paper = 'A4'; p.sheet.orientation = 'portrait'; }); ${S}.layout.setTab('sheet'); true`);
  await shot('sheet-vertical.png');
  await js(`${S}.commands.undo(); ${S}.layout.setTab('axon'); true`);
  // 0.4: the menu bar with the examples, and each example open
  for (const id of ['plateaus', 'tower', 'slope', 'school']) {
    await js(`${S}.commands.example('${id}').then(() => true)`);
    await sleep(500);
    await js(`${S}.document.setStep(${S}.document.project.steps.length - 1); ${S}.layout.setActivity('steps'); true`);
    await sleep(300);
    await js(`window.lionaxon.views.axon.fit(); true`);
    await shot(`example-${id}.png`);
  }
  {
    const fire = (sel, type) => `document.querySelector(${JSON.stringify(sel)}).dispatchEvent(new PointerEvent('${type}', { bubbles: true, button: 0 }))`;
    await js(`${fire('.menubar [data-menu=file]', 'pointerdown')}; true`);
    const k = await js(`[...document.querySelectorAll('.menu-popup .menu-entry')].filter((r) => r.querySelector('.menu-more'))[1].dataset.index`);
    await js(`${fire(`.menu-popup [data-index="${k}"]`, 'pointerenter')}; document.querySelector('.menu-popup:last-child [data-index="1"]').dispatchEvent(new PointerEvent('pointerenter')); true`);
    await shot('menu.png');
    await js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); true`);
    await js(`${fire('.menubar [data-menu=view]', 'pointerdown')}; true`);
    await shot('menu-view.png');
    await js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); true`);
  }
  // 0.5: the 3D viewer — the school seen from above and from below, and its sheet with a step at two angles
  await js(`${S}.commands.example('school').then(() => true)`);
  await sleep(400);
  await js(`${S}.document.setStep(3); ${S}.layout.setActivity('steps'); ${S}.layout.setTab('orbit'); true`);
  await sleep(500);
  await js(`window.lionaxon.views.orbit.setAngle(28, 52); window.lionaxon.views.orbit.fit(); true`);
  await shot('viewer-3d.png');
  // 0.8: a volume selected in the 3D viewer, with the handle of its height
  await js(`${S}.document.select([${S}.document.objects.filter((o) => o.type === 'volume' && !o.on).pop().id]); true`);
  await sleep(300);
  await shot('viewer-3d-edit.png');
  await js(`${S}.document.clearSelection(); true`);
  await js(`window.lionaxon.views.orbit.setAngle(212, -28); window.lionaxon.views.orbit.fit(); true`);
  await shot('viewer-3d-below.png');
  await js(`${S}.layout.setTab('sheet'); true`);
  await shot('sheet-angles.png');
  await js(`${S}.commands.example('tower').then(() => true)`);
  await sleep(400);
  await js(`${S}.layout.setTab('sheet'); true`);
  await shot('sheet-angles-vertical.png');
  await js(`${S}.layout.setTab('axon'); true`);
  // 0.6: the start screen, the right-button menu, alignment, hatches
  await js(`${S}.document.switchTo(${S}.document.tabs.findIndex((t) => /parti/i.test(t.project.name))); ${S}.layout.setTab('axon'); ${S}.layout.setActivity('steps'); ${S}.document.setStep(4); true`);
  await sleep(400);
  await js(`window.lionaxon.views.axon.fit(); true`);
  {
    const v = await js(`JSON.stringify(${S}.document.objects.filter((o) => o.type === 'volume' && !o.on).slice(0, 3).map((o) => { const r = document.querySelector('[data-view=axon] .canvas [data-id="' + o.id + '"][data-top]').getBoundingClientRect(); return [o.id, [r.left + r.width / 2, r.top + r.height / 2]]; }))`).then(JSON.parse);
    await mouse(win, 'mouseMove', v[2][1]); await mouse(win, 'mouseDown', v[2][1], { button: 'right' }); await mouse(win, 'mouseUp', v[2][1], { button: 'right' });
    await sleep(500);
    win.webContents.invalidate();
    await sleep(400);
    await shot('context-menu.png');
    await key(win, 'Escape');
    await js(`${S}.document.select(${JSON.stringify(v.map((x) => x[0]))}); true`);
    await sleep(250);
    await shot('align.png');
    await key(win, 'Escape');
  }
  await js(`${S}.commands.example('school').then(() => true)`);
  await sleep(400);
  await js(`${S}.commands.setProject((p) => { p.catPatterns = true; }); ${S}.document.setStep(3); ${S}.layout.setActivity('categories'); true`);
  await sleep(300);
  await js(`window.lionaxon.views.axon.fit(); true`);
  await shot('hatches.png');
  await js(`${S}.commands.undo(); ${S}.layout.setActivity('steps'); true`);
  await js(`window.lionaxon.services.recent.list = []; true`);
  await js(`document.querySelector('.menubar [data-menu=help]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 })); document.querySelector('.menu-popup [data-index="0"]').dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); true`);
  await sleep(1200);
  await shot('welcome.png');
  await key(win, 'Escape');
  await js(`document.querySelector('.menubar [data-menu=help]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 })); [...document.querySelectorAll('.menu-popup .menu-entry')].at(-2).dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); true`);
  await sleep(1200);
  await shot('credits.png');
  await key(win, 'Escape');
  // 0.7: the corner lot — surroundings, an outline, a roof, shadows; its corners in plan; a section; the sheet
  await js(`${S}.commands.example('corner').then(() => true)`);
  await sleep(500);
  await js(`${S}.document.setStep(4); ${S}.layout.setActivity('project'); ${S}.layout.setTab('axon'); true`);
  await sleep(400);
  await js(`window.lionaxon.views.axon.fit(); document.querySelectorAll('[data-pane=project] .pane-section.closed .section-head').forEach((b) => b.click()); document.querySelector('[data-pane=project] [data-key=sun-on]').scrollIntoView({ block: 'center' }); true`);
  await shot('surroundings.png');
  await js(`document.querySelectorAll('[data-pane=project] .pane-section:not(.closed) .section-head').forEach((b, i) => { if (/sun|sol|image|imagem/i.test(b.textContent)) b.click(); }); ${S}.layout.setActivity('steps'); ${S}.layout.setTab('plan'); ${S}.document.select(['v-house']); true`);
  await sleep(400);
  await js(`window.lionaxon.views.plan.fit(); true`);
  await shot('outline.png');
  await key(win, 'Escape');
  await js(`${S}.layout.setTab('elev'); true`);
  await sleep(400);
  await js(`window.lionaxon.views.elev.setSection(true, 9); true`);
  await sleep(300);
  await shot('section.png');
  await js(`window.lionaxon.views.elev.setSection(false); ${S}.layout.setTab('sheet'); true`);
  await sleep(300);
  await shot('sheet-corner.png');
  await js(`${S}.layout.setTab('axon'); localStorage.removeItem('lionaxon.sections'); true`);
  // the example's sheet as a PNG for the README
  await js(`${S}.document.switchTo(${S}.document.tabs.findIndex((t) => /parti/i.test(t.project.name))); true`);
  const r = JSON.parse(await js(`${S}.commands.exportSheet('png', { dpi: 110 }).then((r) => JSON.stringify(r))`));
  if (r?.ok) fs.copyFileSync(r.path, path.join(dir, 'example-sheet.png'));
  // 0.9: Tab picks what is behind — the bar in the middle, seen from the side
  await js(`${S}.document.switchTo(${S}.document.tabs.findIndex((t) => /parti/i.test(t.project.name))); ${S}.document.setStep(0); ${S}.layout.setTab('elev'); true`);
  await sleep(400);
  await js(`document.querySelector('[data-view=elev] .toolbar [role=radiogroup] button:nth-child(2)').click(); true`);
  await sleep(400);
  await js(`window.lionaxon.views.elev.fit(); true`);
  await sleep(300);
  {
    const E = 'window.lionaxon.views.elev';
    const at = await js(`(() => { const r = document.querySelector('[data-view=elev] .canvas [data-id]').getBoundingClientRect(); const p = [r.left + r.width / 2, r.top + r.height / 2]; return JSON.stringify([p, ${E}.cycle.under(p)]); })()`).then(JSON.parse);
    console.log('   under the spot:', at[1].join(', '));
    await click(win, at[0]);
    await sleep(200);
    await key(win, 'Tab');
    await sleep(300);
    win.webContents.invalidate();
    await sleep(300);
    await shot('pick-behind.png');
    await key(win, 'Escape');
  }
  // 0.9: the text of a label written on the drawing
  await js(`${S}.document.switchTo(${S}.document.tabs.findIndex((t) => /tower|torre/i.test(t.project.name))); ${S}.document.setStep(${S}.document.project.steps.length - 1); ${S}.layout.setTab('axon'); true`);
  await sleep(400);
  await js(`window.lionaxon.views.axon.fit(); true`);
  await sleep(300);
  await js(`window.lionaxon.views.axon.editLabel(${S}.document.objects.find((o) => o.type === 'label').id); true`);
  await sleep(300);
  await shot('label-edit.png');
  await key(win, 'Escape');
  // 0.10: openings on the walls and a roof with its own colour; the sheet with the legend along the foot and text blocks
  await js(`${S}.commands.example('corner').then(() => true)`);
  await sleep(500);
  await js(`${S}.document.setStep(${S}.document.project.steps.length - 1); ${S}.layout.setTab('axon'); true`);
  await sleep(300);
  await js(`(() => { const d = ${S}.document, c = ${S}.commands; d.select(['v-garage']); c.setProps({ roofColor: '#8e3a34', color: '#d9cdb8' }); c.addOpening('arch', 'front'); c.setProps({ w: 2.6, h: 2.4 }); d.select(['v-garage']); c.addOpening('oculus', 'right'); c.setProps({ z: 3.3, w: 0.9 }); d.select(['v-garage']); return true; })()`);
  await sleep(300);
  await js(`window.lionaxon.views.axon.fit(); true`);
  await sleep(400);
  await shot('openings.png');
  await js(`(() => { const c = ${S}.commands; c.setProject((p) => { p.sheet.legendPlace = 'bottom'; p.sheet.blocks = LANG_BLOCKS; }, 'sheet.set'); ${S}.document.clearSelection(); ${S}.layout.setTab('sheet'); ${S}.layout.setActivity('sheet'); return true; })()`.replace('LANG_BLOCKS', JSON.stringify(LANG === 'pt-BR'
    ? [{ title: 'Estratégia', text: 'A casa acompanha as duas ruas e abre o fundo do lote para o jardim.' }, { title: 'Avaliação', text: '+ Sol de inverno no jardim.\n+ A garagem fecha o pátio.\n− Menos área no pavimento térreo.' }]
    : [{ title: 'Strategy', text: 'The house follows the two streets and opens the back of the lot to the garden.' }, { title: 'Assessment', text: '+ Winter sun in the garden.\n+ The garage closes the yard.\n− Less area on the ground floor.' }])));
  await sleep(900);
  await shot('sheet-blocks.png');
  // 0.11: the align tool, with the face to align to picked and the mouse over the face that will come to it
  await js(`${S}.commands.example('parti').then(() => true)`);
  await sleep(500);
  await js(`${S}.document.setStep(1); ${S}.layout.setTab('axon'); ${S}.layout.setActivity('steps'); true`);
  await sleep(300);
  await js(`window.lionaxon.views.axon.fit(); ${S}.layout.setTool('align'); true`);
  await sleep(400);
  {
    const mid = (id, which) => js(`(async () => { const p = await import('../../base/common/geometry/projection.js'); const v = window.lionaxon.views.axon, o = ${S}.document.byId('${id}'); const e = v.extentOf(o);
      const w = '${which}' === 'front' ? [o.x, o.y - o.d / 2, (e.z0 + e.z1) / 2] : [o.x + o.w / 2, o.y, (e.z0 + e.z1) / 2]; return JSON.stringify(v.clientAt(p.project(v.view, w))); })()`).then(JSON.parse);
    await click(win, await mid('v-east', 'front'));
    await sleep(200);
    await mouse(win, 'mouseMove', await mid('v-link-e', 'front'));
    await sleep(300);
    win.webContents.invalidate();
    await sleep(300);
    await shot('align-faces.png');
    await key(win, 'Escape');
  }
  // 0.12: the versions window with a new version found and the way this copy is updated
  await js(`document.querySelector('.status-version').click(); true`);
  await sleep(1300);
  await js(`${S}.update.check().then(() => true)`);
  await sleep(500);
  win.webContents.invalidate();
  await sleep(300);
  await shot('update.png');
  await js(`document.querySelector('.update-dialog .btn-secondary').click(); true`);
  await sleep(300);
  check('screenshots written', fs.existsSync(path.join(dir, 'sheet.png')));
}

// the diagram of the terrain screenshots
const DEMO_02 = {
  format: 'lionaxon', schemaVersion: 2, name: 'Cultural centre — terrain and planes', style: 'lawn', grid: 1,
  site: { w: 48, d: 64, mode: 'fill', dims: true, thickness: 2.5 },
  levels: [{ id: 'L0', name: 'Street', z: 0 }, { id: 'L1', name: 'Plateau', z: 3 }, { id: 'L2', name: 'Lookout', z: 13 }],
  north: 20, northPlace: 'drawing', northHalftone: true, view: { az: -45 },
  categories: [{ id: 'k1', name: 'Auditorium', color: '#7cc3b6' }],
  steps: [{
    id: 's1', title: 'Terrain and planes', text: 'The plateau at +3.00 takes the auditorium; a slope links the street to it.', highlight: false,
    objects: [
      { type: 'platform', id: 'plateau', x: 30, y: 44, w: 32, d: 36, level: 'L1', z: 0 },
      { type: 'slope', id: 'slope', x: 30, y: 19, w: 14, d: 14, from: 'L0', zFrom: 0, to: 'L1', zTo: 0 },
      { type: 'platform', id: 'pit', x: 8, y: 14, w: 12, d: 14, level: 'L0', z: -2 },
      { type: 'volume', id: 'aud', shape: 'cylinder', x: 34, y: 48, w: 16, d: 16, h: 9, level: 'L1', floors: 2, cat: 'k1' },
      { type: 'cut', id: 'hall', x: 28, y: 42, w: 6, d: 5, z: 0, h: 4, level: 'L1', target: 'aud' },
      { type: 'volume', id: 'bar', x: 22, y: 48, w: 8, d: 30, h: 7, level: 'L1', floors: 2 },
      { type: 'volume', id: 'tower', x: 8, y: 50, w: 8, d: 8, h: 13, floors: 4 },
      { type: 'volume', id: 'lookout', shape: 'sphere', x: 8, y: 50, w: 6, level: 'L2', on: 'tower' },
      { type: 'volume', id: 'old', x: 8, y: 30, w: 10, d: 10, h: 6, state: 'ghost' },
      { type: 'volume', id: 'landmark', shape: 'pyramid', x: 42, y: 10, w: 6, d: 6, h: 5 },
      { type: 'person', id: 'p1', x: 27, y: 9, pose: 3 },
      { type: 'person', id: 'p2', x: 25.5, y: 8, pose: 1 },
      { type: 'person', id: 'p3', x: 30, y: 30, level: 'L1', pose: 0 },
      { type: 'arrow', id: 'a1', x1: 30, y1: 2, x2: 30, y2: 30, level: 'L0', z: 0.3, bend: 0, color: 'blue', heads: 1, width: 0.35, layer: 'ground' },
      { type: 'label', id: 'l1', x: 34, y: 48, z: 9, level: 'L1', dx: 7, dy: -7, text: 'Auditorium', size: 1.7, font: 'serif', caps: false },
      { type: 'label', id: 'l2', x: 30, y: 19, z: 1.5, dx: 9, dy: 4, text: 'Accessible slope', size: 1.4, font: 'condensed', caps: true },
      { type: 'label', id: 'l3', x: 8, y: 30, z: 6, dx: -7, dy: -5, text: 'existing house', size: 1.5, font: 'hand', caps: false },
    ],
  }],
  sheet: { layout: 'row', cols: 3, paper: 'A3', orientation: 'landscape', title: '', subtitle: '', legend: true, texts: true },
};


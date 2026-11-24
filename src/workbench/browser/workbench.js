/*---------------------------------------------------------------------------------------------
 *  LionAxon — Copyright (C) 2026 LionAxon Team.
 *  Created and conceived by Daniel Michelon De Carli.
 *  Licensed under the GNU General Public License v3.0 or later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/
// Workbench startup: creates the services once and injects them into the layout parts — the same
// principle as VS Code and the other Lion apps, in a lean version.
import { h } from '../../base/browser/dom.js';
import { t, tn } from '../../base/common/nls.js';
import { bootDone, bootStatus, bootSkip, nextFrame } from './boot.js';
import { showWelcomeDialog } from './dialogs.js';
import { LayoutService } from '../services/layout/browser/layoutService.js';
import { DocumentService } from '../services/document/browser/documentService.js';
import { NotificationService } from '../services/notification/browser/notificationService.js';
import { ConfirmationService } from '../services/dialog/browser/confirmationService.js';
import { UpdateService } from '../services/update/browser/updateService.js';
import { ExportService } from '../services/export/browser/exportService.js';
import { CommandService } from '../services/commands/browser/commandService.js';
import { TitlebarPart, ActivitybarPart, SidebarPart, EditorPart, StatusbarPart } from './parts.js';
import { DrawingView, isTyping } from '../contrib/drawing/browser/drawingView.js';
import { PropertiesPanel } from '../contrib/properties/browser/propertiesPanel.js';
import { StepsPane } from '../contrib/steps/browser/stepsPane.js';
import { ProjectPane } from '../contrib/project/browser/projectPane.js';
import { CategoriesPane } from '../contrib/categories/browser/categoriesPane.js';
import { SheetPane, SheetView } from '../contrib/sheet/browser/sheetPane.js';
import { OrbitView } from '../contrib/orbit/browser/orbitView.js';

const host = window.host;
if (!host) throw new Error(t('workbench.preloadMissing'));
document.documentElement.dataset.platform = host.platform;

// ---- services ----
const services = { host };
services.layout = new LayoutService(host);
services.document = new DocumentService(host);
services.notifications = new NotificationService();
services.confirmation = new ConfirmationService();
services.update = new UpdateService(services);
services.export = new ExportService(services);
services.commands = new CommandService(services);
// the last files opened or saved (File › Open recent, and the start screen)
services.recent = {
  list: [],
  async refresh() { this.list = (await host.project.recent?.().catch(() => [])) || []; return this.list; },
  async clear() { await host.project.clearRecent?.(); this.list = []; },
};
services.recent.refresh();
services.document.onDidChange((e) => { if (e.kind === 'file' || e.kind === 'load') services.recent.refresh(); });

// ---- editor views and panes (contributions) ----
const views = {
  axon: new DrawingView(services, 'axon'),
  plan: new DrawingView(services, 'plan'),
  elev: new DrawingView(services, 'elev'),
  sheet: new SheetView(services),
  orbit: new OrbitView(services),
};
const panes = {
  steps: new StepsPane(services),
  project: new ProjectPane(services),
  categories: new CategoriesPane(services),
  sheet: new SheetPane(services),
};
services.properties = new PropertiesPanel(services);
services.views = views;

// ---- layout ----
const root = document.getElementById('workbench');
root.append(
  new TitlebarPart(services).element,
  h('div.workbench-main',
    new ActivitybarPart(services).element,
    new SidebarPart(services, panes).element,
    new EditorPart(services, views).element,
    services.properties.element),
  new StatusbarPart(services).element,
  services.notifications.element,
);

// ---- startup: the file it was opened with, else the work of the last session, else the example ----
(async () => {
  const query = new URLSearchParams(location.search);
  try {
    if (query.has('fresh')) {
      // started again without the work of the last session: a new diagram, and where that work was put
      services.document.newProject();
      const dir = query.get('aside');
      if (dir) services.notifications.info(t('boot.asideDone', { n: Number(query.get('n')) || 0, dir }), 15000, { label: t('boot.showAside'), run: () => host.showAside?.(dir) });
      return;
    }
    bootStatus(t('boot.opening'));
    // if it takes long: a button to start without it (the work is put aside, not lost)
    bootSkip(t('boot.skip'), () => { bootStatus(t('boot.skipping')); host.startEmpty?.(); }, 4000);
    await nextFrame();
    // tests only: a start made slow on purpose ('wait:ms' answers meanwhile, 'hang:ms' does not)
    const slow = query.get('slowBoot');
    if (slow) {
      const [how, ms] = slow.split(':');
      if (how === 'hang') { const end = Date.now() + Number(ms); while (Date.now() < end) { /* hangs */ } } else await new Promise((r) => setTimeout(r, Number(ms)));
    }
    const initial = await host.takeInitialFile?.().catch(() => null);
    if (initial) await services.commands.openPath(initial);
    else {
      const restored = await services.document.restore();
      if (!restored) {
        // the first time: the example behind, and the start screen (new, open, examples, a short guide)
        await services.document.loadExample();
        showWelcomeDialog(services);
      } else if (restored.dirty) services.notifications.info(t('welcome.recovered'), 7000);
    }
  } catch (err) {
    console.error(err);
    services.document.newProject();
  } finally {
    bootDone();
    host.bootReady?.();
    requestAnimationFrame(() => views.axon.fit());
  }
})();
host.onOpenFile?.((file) => services.commands.openPath(file));
host.onCloseRequest?.(() => services.commands.closeWindow());

// ---- keyboard shortcuts ----
const TOOL_KEYS = { v: 'select', b: 'box', s: 'cut', g: 'terrain', a: 'arrow', p: 'person', t: 'label', x: 'textbox', e: 'tree', d: 'dim', l: 'align' };
const currentView = () => views[services.layout.tab];

window.addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();
  const { commands: cmd, layout, document: doc } = services;
  if (document.querySelector('.cm-overlay')) return; // a dialog handles its own keys
  if (mod) {
    if (key === 'z' && !e.shiftKey) { if (isTyping(e)) return; e.preventDefault(); cmd.undo(); }
    else if (key === 'y' || (key === 'z' && e.shiftKey)) { if (isTyping(e)) return; e.preventDefault(); cmd.redo(); }
    else if (key === 's') { e.preventDefault(); cmd.save(e.shiftKey); }
    else if (key === 'o') { e.preventDefault(); cmd.open(); }
    else if (key === 'n') { e.preventDefault(); cmd.newProject(); }
    else if (key === 'w') { e.preventDefault(); cmd.closeTab(); }
    else if (e.key === 'Tab') { e.preventDefault(); cmd.nextTab(e.shiftKey ? -1 : 1); }
    else if (key === 'd') { if (isTyping(e)) return; e.preventDefault(); if (e.shiftKey) cmd.duplicateStep(); else cmd.duplicateSelection(); }
    else if (key === 'b') { e.preventDefault(); layout.toggleSidebar(); }
    else if (key === 'a' && !isTyping(e)) { e.preventDefault(); cmd.selectAll(); }
    else if ((key === 'c' || key === 'x' || key === 'v') && !e.shiftKey) {
      // in a field these are the system's; in the drawing they copy, cut and paste objects
      if (isTyping(e) || layout.tab === 'sheet' || String(getSelection())) return;
      e.preventDefault();
      if (key === 'c') { const n = cmd.copySelection(); if (n) services.notifications.info(tn('edit.copied', n), 2500); }
      else if (key === 'x') cmd.cutSelection();
      else if (!cmd.paste()) services.notifications.info(t('edit.nothingToPaste'), 3000);
    }
    else if (key === 'l' && !isTyping(e)) { e.preventDefault(); if (doc.selection.size) cmd.setLocked(true); }
    else if (key === 'h' && !isTyping(e)) { e.preventDefault(); if (doc.selection.size) cmd.setHidden(true); }
    else if (e.key === '\\') { e.preventDefault(); layout.toggleFocus(); }
    else if (e.key === '=' || e.key === '+') { e.preventDefault(); currentView()?.zoomBy?.(1.25); }
    else if (e.key === '-') { e.preventDefault(); currentView()?.zoomBy?.(1 / 1.25); }
    else if (key === '0') { e.preventDefault(); currentView()?.fit?.(); }
    else if (['1', '2', '3', '4', '5'].includes(key)) { e.preventDefault(); layout.setTab(['axon', 'plan', 'elev', 'sheet', 'orbit'][Number(key) - 1]); }
    return;
  }
  if (isTyping(e)) return;
  if (e.key === 'PageUp') { e.preventDefault(); doc.setStep(doc.stepIndex - 1); return; }
  if (e.key === 'PageDown') { e.preventDefault(); doc.setStep(doc.stepIndex + 1); return; }
  if (layout.tab === 'sheet') { views.sheet?.key?.(e); return; }
  // Tab: the next object under the same spot (Shift+Tab: the one before) — only while nothing has the
  // focus, so that Tab still walks through buttons and fields
  if (e.key === 'Tab' && !e.altKey && (document.activeElement === document.body || !document.activeElement) && !document.querySelector('.cm-overlay, .menu-popup, .modal')) {
    const view = layout.tab === 'orbit' ? views.orbit : currentView();
    if (view?.cycle) { e.preventDefault(); view.cycle.next(e.shiftKey ? -1 : 1); return; }
  }
  if (layout.tab === 'orbit') {
    // the 3D viewer: no drawing tools, but what is selected can be deleted; the arrows turn the view
    if (e.key === 'Escape') { doc.clearSelection(); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); cmd.deleteSelection(); return; }
    views.orbit.key(e);
    return;
  }
  // an outline being drawn point by point: Enter ends it
  if (e.key === 'Enter' && currentView()?.poly) { e.preventDefault(); currentView().finishPoly(); return; }
  // Enter on a selected label: its text is written on the drawing
  if (e.key === 'Enter' && doc.selection.size === 1 && doc.selected()[0]?.type === 'label' && currentView()?.editLabel) { e.preventDefault(); currentView().editLabel(); return; }
  if (e.key === 'Escape') { currentView()?.cancel?.(); layout.setTool('select'); views.elev.setElevTool('select'); doc.clearSelection(); return; }
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); cmd.deleteSelection(); return; }
  if (e.key.startsWith('Arrow') && doc.selection.size) {
    e.preventDefault();
    const step = e.shiftKey ? 0.1 : doc.project.grid;
    const [dx, dy] = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[e.key];
    cmd.nudge(dx, dy);
    return;
  }
  if (key === 'r') { cmd.rotateSelection(e.shiftKey ? 15 : 90); return; }
  if (e.key === 'F2' && doc.selection.size === 1) { e.preventDefault(); services.properties.focus('name'); return; }
  // a number typed with one shape selected: its size, typed (width × depth × height)
  if (/^[0-9]$/.test(e.key) && !e.altKey && (layout.tab === 'axon' || layout.tab === 'plan') && currentView().typeSize?.(e.key)) { e.preventDefault(); return; }
  if (layout.tab === 'elev') {
    // the elevation has its own two tools: select (V) and new reference plane (N)
    if (key === 'n' || key === 'v') views.elev.setElevTool(key === 'n' ? 'level' : 'select');
    if (key === 'f') views.elev.fit();
    return;
  }
  if (key === 'f') { currentView()?.fit?.(); return; }
  if (TOOL_KEYS[key] && !e.altKey) layout.setTool(TOOL_KEYS[key]);
});
window.addEventListener('contextmenu', (e) => { if (e.target.closest?.('.canvas')) e.preventDefault(); });

// For tests and agents: the services, read-only from outside the window.
Object.defineProperty(window, 'lionaxon', { value: Object.freeze({ services, views }) });

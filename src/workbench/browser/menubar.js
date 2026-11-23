/*---------------------------------------------------------------------------------------------
 *  LionAxon — Copyright (C) 2026 LionAxon Team.
 *  Created and conceived by Daniel Michelon De Carli.
 *  Licensed under the GNU General Public License v3.0 or later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/
// The menu bar in the title bar, as in the other Lion apps and VS Code: File, Edit, Insert, View, Step and
// Help, each opening a list of commands with their shortcuts. A click opens a menu; while one is open,
// moving to another opens it; the arrow keys, Enter and Escape work; Alt or F10 puts the focus on the bar.
// Every entry runs a named command, the same the shortcuts and the panes use.
import { h, setChildren } from '../../base/browser/dom.js';
import { icon } from '../../base/browser/icons.js';
import { t } from '../../base/common/nls.js';
import { showAboutDialog, showUpdateDialog, showShortcutsDialog, showWelcomeDialog, showCreditsDialog } from './dialogs.js';
import { EXAMPLES } from '../services/document/browser/documentService.js';
import { THEMES } from '../services/layout/browser/layoutService.js';

const SEP = { sep: true };
const TOOLS = [['select', 'V'], ['box', 'B'], ['cut', 'S'], ['terrain', 'G'], ['arrow', 'A'], ['dim', 'D'], ['person', 'P'], ['tree', 'E'], ['label', 'T']];
const THEME_LABELS = { auto: 'statusbar.themeAuto', light: 'statusbar.themeLight', dark: 'statusbar.themeDark', mapa: 'statusbar.themeMap', orla: 'statusbar.themeRiverfront' };

/** The menus: { id, label, items: [{ label, key?, run?, checked?(), disabled?(), items? (submenu) } | SEP] } */
export function buildMenus(s) {
  const { commands: cmd, layout, document: doc } = s;
  const view = () => s.views?.[layout.tab];
  const drawing = () => layout.tab !== 'sheet';
  const sel = () => doc.selection.size > 0;
  return [
    { id: 'file', label: t('menu.file'), items: [
      { label: t('file.new'), key: 'Ctrl+N', run: () => cmd.newProject() },
      { label: t('file.open') + '…', key: 'Ctrl+O', run: () => cmd.open() },
      { label: t('menu.recent'), items: () => {
        const list = s.recent?.list || [];
        return list.length
          ? [...list.map((r) => ({ label: r.name, run: () => cmd.openPath(r.path) })), SEP, { label: t('menu.clearRecent'), run: () => s.recent.clear() }]
          : [{ label: t('menu.noRecent'), disabled: () => true }];
      } },
      { label: t('menu.examples'), items: EXAMPLES.map((id) => ({ label: t('example.' + id), run: () => cmd.example(id) })) },
      SEP,
      { label: t('file.save'), key: 'Ctrl+S', run: () => cmd.save() },
      { label: t('file.saveAs') + '…', key: 'Ctrl+Shift+S', run: () => cmd.save(true) },
      SEP,
      { label: t('menu.exportSheet'), items: [
        { label: 'PDF', run: () => cmd.exportSheet('pdf') },
        { label: 'SVG', run: () => cmd.exportSheet('svg') },
        { label: 'PNG', run: () => cmd.exportSheet('png', { dpi: 200 }) },
      ] },
      { label: t('menu.exportStep'), items: [
        { label: 'SVG', run: () => cmd.exportStep('svg') },
        { label: 'PNG', run: () => cmd.exportStep('png') },
      ] },
      { label: t('menu.exportAllSteps'), items: [
        { label: 'PNG', run: () => cmd.exportAllSteps(['png']) },
        { label: 'SVG', run: () => cmd.exportAllSteps(['svg']) },
        { label: 'PDF', run: () => cmd.exportAllSteps(['pdf']) },
        { label: t('menu.exportAllFormats'), run: () => cmd.exportAllSteps(['png', 'svg', 'pdf']) },
      ] },
      { label: t('gif.export') + '…', run: () => cmd.exportGif() },
      SEP,
      { label: t('menu.closeTab'), key: 'Ctrl+W', run: () => cmd.closeTab() },
      { label: t('menu.quit'), run: () => cmd.closeWindow() },
    ] },
    { id: 'edit', label: t('menu.edit'), items: [
      { label: t('drawing.undo'), key: 'Ctrl+Z', run: () => cmd.undo(), disabled: () => !doc.canUndo },
      { label: t('drawing.redo'), key: 'Ctrl+Y', run: () => cmd.redo(), disabled: () => !doc.canRedo },
      SEP,
      { label: t('edit.cut'), key: 'Ctrl+X', run: () => cmd.cutSelection(), disabled: () => !sel() },
      { label: t('edit.copy'), key: 'Ctrl+C', run: () => cmd.copySelection(), disabled: () => !sel() },
      { label: t('edit.paste'), key: 'Ctrl+V', run: () => cmd.paste(), disabled: () => !cmd.canPaste },
      { label: t('props.duplicate'), key: 'Ctrl+D', run: () => cmd.duplicateSelection(), disabled: () => !sel() },
      { label: t('props.delete'), key: 'Delete', run: () => cmd.deleteSelection(), disabled: () => !sel() },
      { label: t('menu.selectAll'), key: 'Ctrl+A', run: () => cmd.selectAll() },
      SEP,
      { label: t('menu.rotate90'), key: 'Space · R', run: () => cmd.rotateSelection(90), disabled: () => !sel() },
      { label: t('menu.rotate15'), key: 'Shift+Space', run: () => cmd.rotateSelection(15), disabled: () => !sel() },
      { label: t('align.title'), items: [
        ...['left', 'centerX', 'right', 'top', 'centerY', 'bottom'].map((how) => ({ label: t('align.' + how), run: () => cmd.alignSelection(how), disabled: () => doc.selection.size < 2 })),
        SEP,
        { label: t('align.distributeX'), run: () => cmd.distributeSelection('x'), disabled: () => doc.selection.size < 3 },
        { label: t('align.distributeY'), run: () => cmd.distributeSelection('y'), disabled: () => doc.selection.size < 3 },
        SEP,
        { label: t('tool.align'), key: 'L', run: () => { layout.setTab('axon'); layout.setTool('align'); } },
      ] },
      SEP,
      { label: t('edit.rename') + '…', key: 'F2', run: () => s.properties.focus('name'), disabled: () => doc.selection.size !== 1 },
      { label: t('edit.lock'), key: 'Ctrl+L', run: () => cmd.setLocked(true), disabled: () => !sel() },
      { label: t('edit.hide'), key: 'Ctrl+H', run: () => cmd.setHidden(true), disabled: () => !sel() },
      { label: t('edit.showAll'), run: () => cmd.showAll(), disabled: () => !doc.objects.some((o) => o.hidden || o.locked) },
      SEP,
      { label: t('propagate.apply'), run: () => cmd.applyToFollowing(), disabled: () => !sel() || doc.stepIndex >= doc.project.steps.length - 1 },
      { label: t('propagate.delete'), run: () => cmd.deleteInFollowing(), disabled: () => !sel() || doc.stepIndex >= doc.project.steps.length - 1 },
    ] },
    { id: 'insert', label: t('menu.insert'), items: [
      ...TOOLS.map(([id, key]) => ({
        label: t('tool.' + id), key, checked: () => drawing() && layout.tab !== 'elev' && layout.tool === id,
        run: () => { if (!drawing() || layout.tab === 'elev') layout.setTab('axon'); layout.setTool(id); },
      })),
      SEP,
      { label: t('poly.volume'), run: () => { if (!drawing() || layout.tab === 'elev') layout.setTab('plan'); layout.setToolOption('shape', 'poly'); } },
      { label: t('site.draw'), run: () => { layout.setTab('plan'); layout.setTool('site'); } },
      { label: t('underlay.pick') + '…', run: () => cmd.pickUnderlay() },
      SEP,
      { label: t('menu.newLevel'), key: 'N', run: () => { layout.setTab('elev'); queueMicrotask(() => s.views?.elev?.setElevTool('level')); } },
      { label: t('menu.newCategory'), run: () => { cmd.addCategory(); layout.setActivity('categories'); } },
    ] },
    { id: 'view', label: t('menu.view'), items: [
      ...['axon', 'plan', 'elev', 'sheet', 'orbit'].map((id, i) => ({ label: t('tab.' + id), key: `Ctrl+${i + 1}`, checked: () => layout.tab === id, run: () => layout.setTab(id) })),
      SEP,
      { label: t('drawing.fit'), key: 'F', run: () => view()?.fit?.(), disabled: () => !drawing() },
      { label: t('zoom.in'), key: 'Ctrl++', run: () => view()?.zoomBy?.(1.25), disabled: () => !view()?.zoomBy },
      { label: t('zoom.out'), key: 'Ctrl+−', run: () => view()?.zoomBy?.(1 / 1.25), disabled: () => !view()?.zoomBy },
      { label: t('drawing.rotateLeft'), run: () => cmd.rotateView(-1) },
      { label: t('drawing.rotateRight'), run: () => cmd.rotateView(1) },
      SEP,
      { label: t('drawing.showCuts'), checked: () => !!s.views?.axon?.showCuts, run: () => { s.views.axon.toggleShowCuts(); s.views.plan.toggleShowCuts(); } },
      { label: t('menu.terrainMesh'), checked: () => layout.terrainMesh, run: () => layout.toggleTerrainMesh() },
      SEP,
      { label: t('menu.sidebar'), key: 'Ctrl+B', checked: () => layout.sidebarVisible, run: () => layout.toggleSidebar() },
      { label: t('menu.properties'), checked: () => layout.propertiesVisible, run: () => layout.toggleProperties() },
      { label: t('menu.focus'), key: 'Ctrl+\\', checked: () => layout.focusMode, run: () => layout.toggleFocus() },
      { label: t('menu.hints'), checked: () => layout.hintsVisible, run: () => layout.toggleHints() },
      { label: t('sun.shadows'), checked: () => !!doc.project.sun?.on, run: () => cmd.setProject((p) => { p.sun.on = !p.sun.on; }, 'project.sun') },
      { label: t('menu.patterns'), checked: () => !!doc.project.catPatterns, run: () => cmd.setProject((p) => { p.catPatterns = !p.catPatterns; }, 'project.patterns') },
      { label: t('statusbar.theme'), items: THEMES.map((id) => ({ label: t(THEME_LABELS[id]), checked: () => layout.themePreference === id, run: () => layout.setTheme(id) })) },
    ] },
    { id: 'step', label: t('menu.step'), items: [
      { label: t('steps.addLong'), run: () => cmd.addStep() },
      { label: t('steps.duplicate'), key: 'Ctrl+Shift+D', run: () => cmd.duplicateStep() },
      { label: t('steps.prev'), key: 'PgUp', run: () => doc.setStep(doc.stepIndex - 1), disabled: () => doc.stepIndex === 0 },
      { label: t('steps.next'), key: 'PgDn', run: () => doc.setStep(doc.stepIndex + 1), disabled: () => doc.stepIndex >= doc.project.steps.length - 1 },
      SEP,
      { label: t('explode.on'), checked: () => !!doc.step.explode?.on, run: () => cmd.setStepProps({ explode: { ...doc.step.explode, on: !doc.step.explode?.on } }) },
      { label: t('step.highlight'), checked: () => !!doc.step.highlight, run: () => cmd.setStepProps({ highlight: !doc.step.highlight }) },
      { label: t('step.ghostPrev'), checked: () => !!doc.step.ghostPrev, run: () => cmd.setStepProps({ ghostPrev: !doc.step.ghostPrev }), disabled: () => doc.stepIndex === 0 },
      SEP,
      { label: t('orbit.viewer'), key: 'Ctrl+5', run: () => layout.setTab('orbit') },
      { label: t('orbit.resetTip'), run: () => cmd.resetStepAngles(), disabled: () => !doc.step.views?.length },
      SEP,
      { label: t('steps.remove') + '…', run: () => cmd.removeStep(doc.stepIndex), disabled: () => doc.project.steps.length <= 1 },
    ] },
    { id: 'help', label: t('menu.help'), items: [
      { label: t('welcome.title'), run: () => showWelcomeDialog(s) },
      { label: t('shortcuts.title'), run: () => showShortcutsDialog() },
      { label: t('update.title') + '…', run: () => showUpdateDialog(s) },
      SEP,
      { label: t('credits.title'), run: () => showCreditsDialog(s.host) },
      { label: t('about.title'), run: () => showAboutDialog(s.host) },
    ] },
  ];
}

export class Menubar {
  constructor(services) {
    this.s = services;
    this.open = null;      // index of the open menu
    this.popups = [];      // open popups: [{ el, items, active }] — the menu, then submenus
    this.buttons = [];
    this.element = h('div.menubar', { role: 'menubar', 'aria-label': t('menu.aria') });
    this.render();
    // close when clicking elsewhere or when the window loses focus
    document.addEventListener('pointerdown', (e) => { if (this.open != null && !this.element.contains(e.target) && !e.target.closest?.('.menu-popup')) this.close(); }, true);
    window.addEventListener('blur', () => this.close());
    document.addEventListener('keydown', (e) => this.#key(e), true);
    document.addEventListener('keyup', (e) => this.altUp(e), true);
    // Alt held while dragging (to leave the grid) must not open the menu
    document.addEventListener('pointerdown', () => { this.altArmed = false; this.pointerDown = true; }, true);
    document.addEventListener('pointerup', () => { this.pointerDown = false; }, true);
  }

  render() {
    this.menus = buildMenus(this.s);
    this.buttons = this.menus.map((m, i) => h('button.menubar-item', {
      role: 'menuitem', 'aria-haspopup': 'true', 'data-menu': m.id,
      onpointerdown: (e) => { e.preventDefault(); if (this.open === i) this.close(); else this.show(i); },
      onpointerenter: () => { if (this.open != null && this.open !== i) this.show(i); },
    }, m.label));
    setChildren(this.element, this.buttons);
  }

  show(i, focusFirst = false) {
    this.close();
    this.open = i;
    this.buttons[i].classList.add('open');
    const r = this.buttons[i].getBoundingClientRect();
    this.#popup(this.menus[i].items, r.left, r.bottom + 2, 0);
    if (focusFirst) this.#move(0, 1);
  }

  close() {
    for (const p of this.popups) p.el.remove();
    this.popups = [];
    for (const b of this.buttons) b.classList.remove('open', 'focus');
    this.open = null;
    this.barFocus = null;
  }

  /** Builds a popup at (x, y) for a list of entries; level 0 is the menu, 1 a submenu. */
  #popup(items, x, y, level) {
    this.popups.splice(level).forEach((p) => p.el.remove());
    const rows = items.map((it, k) => {
      if (it.sep) return h('div.menu-sep', { role: 'separator' });
      const disabled = it.disabled?.() || false;
      const checked = it.checked?.();
      const row = h('div.menu-entry', {
        role: checked === undefined ? 'menuitem' : 'menuitemcheckbox', 'aria-checked': checked === undefined ? null : String(!!checked),
        'aria-disabled': disabled ? 'true' : null, class: disabled ? 'menu-entry disabled' : 'menu-entry', 'data-index': String(k),
        onpointerenter: () => this.#activate(level, k),
        onpointerup: (e) => { e.preventDefault(); this.#run(level, k); },
      },
      h('span.menu-check', checked ? { html: icon('check', 13) } : null),
      h('span.menu-label', it.label),
      it.items ? h('span.menu-more', { html: icon('next', 12) }) : h('span.menu-key', it.key || ''));
      return row;
    });
    const el = h('div.menu-popup', { role: 'menu' }, rows);
    document.body.append(el);
    // keep it on the screen
    const w = el.offsetWidth, hh = el.offsetHeight;
    el.style.left = `${Math.max(4, Math.min(x, window.innerWidth - w - 4))}px`;
    el.style.top = `${Math.max(4, Math.min(y, window.innerHeight - hh - 4))}px`;
    this.popups[level] = { el, items, active: -1 };
  }

  #activate(level, k) {
    const p = this.popups[level];
    if (!p) return;
    p.active = k;
    [...p.el.children].forEach((row) => row.classList.toggle('active', row.dataset.index === String(k)));
    const it = p.items[k];
    // a submenu opens beside its entry; anything else closes the submenus below
    if (it?.items && !it.disabled?.()) {
      const row = p.el.querySelector(`[data-index="${k}"]`).getBoundingClientRect();
      this.#popup(typeof it.items === 'function' ? it.items() : it.items, row.right - 2, row.top - 5, level + 1);
    } else this.popups.splice(level + 1).forEach((q) => q.el.remove());
  }

  #run(level, k) {
    const it = this.popups[level]?.items[k];
    if (!it || it.sep || it.disabled?.()) return;
    if (it.items) { this.#activate(level, k); this.#move(0, 1, level + 1); return; }
    this.close();
    it.run?.();
  }

  /** Moves the highlight in a popup by `d` (skipping separators and disabled entries). */
  #move(from, d, level = this.popups.length - 1) {
    const p = this.popups[level];
    if (!p) return;
    const n = p.items.length;
    let k = p.active < 0 ? (d > 0 ? -1 : n) : p.active;
    for (let step = 0; step < n; step++) {
      k = (k + d + n) % n;
      if (!p.items[k].sep && !p.items[k].disabled?.()) break;
    }
    this.#activate(level, k);
    void from;
  }

  #key(e) {
    if (e.key !== 'Alt') this.altArmed = false;
    // Alt alone or F10: the focus goes to the menu bar
    if ((e.key === 'F10' && !e.shiftKey) || (e.key === 'Alt' && e.type === 'keydown' && !e.repeat && this.open == null && !document.querySelector('.cm-overlay'))) {
      if (e.key === 'Alt') { this.altArmed = !this.pointerDown; return; }
      e.preventDefault();
      this.show(0, true);
      return;
    }
    if (this.open == null) return;
    if (e.ctrlKey || e.metaKey) { this.close(); return; } // a shortcut closes the menu and runs as usual
    const level = this.popups.length - 1;
    const p = this.popups[level];
    const stop = () => { e.preventDefault(); e.stopPropagation(); };
    if (e.key === 'Escape') { stop(); if (level > 0) this.popups.splice(level).forEach((q) => q.el.remove()); else this.close(); }
    else if (e.key === 'ArrowDown') { stop(); this.#move(0, 1); }
    else if (e.key === 'ArrowUp') { stop(); this.#move(0, -1); }
    else if (e.key === 'ArrowRight') {
      stop();
      if (p && p.active >= 0 && p.items[p.active].items) this.#run(level, p.active);
      else this.show((this.open + 1) % this.menus.length, true);
    } else if (e.key === 'ArrowLeft') {
      stop();
      if (level > 0) this.popups.splice(level).forEach((q) => q.el.remove());
      else this.show((this.open - 1 + this.menus.length) % this.menus.length, true);
    } else if (e.key === 'Enter' || e.key === ' ') { stop(); if (p && p.active >= 0) this.#run(level, p.active); }
    else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) stop(); // typing does not reach the drawing while a menu is open
  }

  /** Alt released alone (no other key in between) opens the first menu. */
  altUp(e) {
    if (e.key === 'Alt' && this.altArmed) { this.altArmed = false; if (this.open == null) this.show(0, true); else this.close(); }
  }
}

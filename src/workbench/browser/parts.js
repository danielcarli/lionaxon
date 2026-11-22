/*---------------------------------------------------------------------------------------------
 *  LionAxon — Copyright (C) 2026 LionAxon Team.
 *  Created and conceived by Daniel Michelon De Carli.
 *  Licensed under the GNU General Public License v3.0 or later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/
// The layout parts of the workbench, as in the other Lion apps: title bar (the menu bar and a tab per open
// diagram),
// activity bar, side bar, editor (tabs: axonometric, plan, sheet) and status bar (with the version in the
// bottom-right corner).
import { h, setChildren } from '../../base/browser/dom.js';
import { icon } from '../../base/browser/icons.js';
import { t, tn, getLocales, getLocalePreference, setLocalePreference } from '../../base/common/nls.js';
import { showAboutDialog, showUpdateDialog, showShortcutsDialog } from './dialogs.js';
import { Menubar } from './menubar.js';

export class TitlebarPart {
  constructor(services) {
    const { document: doc, commands } = services;
    this.doc = doc;
    this.commands = commands;
    // with many diagrams open the tabs keep a readable width and the strip scrolls (wheel, or drag the bar)
    this.strip = h('div.doc-tabs', { role: 'tablist', 'aria-label': t('titlebar.tabs'), onwheel: (e) => { this.strip.scrollLeft += e.deltaY || e.deltaX; } });
    this.menubar = new Menubar(services);
    this.element = h('header.part.titlebar',
      h('div.titlebar-left', h('img.app-glyph', { src: 'media/logo.svg', alt: '' }), h('span.app-name', 'Lion', h('b', 'Axon')), this.menubar.element),
      this.strip,
      h('div.titlebar-right',
        h('button.icon-button', { title: t('menu.focus') + ' (Ctrl+\\)', 'data-action': 'focus', html: icon('focus', 16), onclick: () => services.layout.toggleFocus() }),
        h('button.icon-button', { title: t('titlebar.toggleProperties'), html: icon('panel', 16), onclick: () => services.layout.toggleProperties() })));
    doc.onDidChange((e) => { if (e.kind === 'file' || e.kind === 'load' || e.kind === 'tabs' || (e.kind === 'content' && !e.live)) this.render(); });
    this.render();
  }

  render() {
    const d = this.doc;
    const tabs = d.tabs.map((tab, i) => {
      const name = d.nameOf(tab) || t('file.untitled');
      const close = h(`button.doc-tab-close${tab.dirty ? '' : '.clean'}`, {
        title: `${t('titlebar.closeTab')} (Ctrl+W)`, 'aria-label': t('titlebar.closeTab'),
        onclick: (e) => { e.stopPropagation(); this.commands.closeTab(i); },
      }, tab.dirty ? h('span.dirty-dot', { title: t('titlebar.unsaved') }) : null, h('span.close-x', { html: icon('close', 12) }));
      const el = h(`div.doc-tab${i === d.active ? '.active' : ''}`, {
        role: 'tab', 'aria-selected': String(i === d.active), 'data-tab-id': tab.id, draggable: 'true',
        title: tab.path || name,
        onmousedown: (e) => { if (e.button === 1) e.preventDefault(); },
        onauxclick: (e) => { if (e.button === 1) { e.preventDefault(); this.commands.closeTab(i); } },
        onclick: () => d.switchTo(i),
        ondblclick: () => this.commands.s.layout.setActivity('project'),
        ondragstart: (e) => { this.dragFrom = i; el.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; },
        ondragend: () => { el.classList.remove('dragging'); this.dragFrom = null; },
        ondragover: (e) => { if (this.dragFrom != null) e.preventDefault(); },
        ondrop: (e) => { e.preventDefault(); if (this.dragFrom != null) d.moveTab(this.dragFrom, i); },
      }, h('span.doc-tab-name', name), close);
      return el;
    });
    setChildren(this.strip, tabs,
      h('button.doc-tab-new', { title: `${t('file.new')} (Ctrl+N)`, 'aria-label': t('file.new'), html: icon('plus', 14), onclick: () => this.commands.newProject() }));
    this.strip.querySelector('.doc-tab.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const name = d.displayName || t('file.untitled');
    const title = `${d.dirty ? '• ' : ''}${name} — LionAxon`;
    if (document.title !== title) { document.title = title; d.host.setTitle?.(title); }
  }
}

const ACTIVITY_ICONS = { steps: 'steps', project: 'site', categories: 'palette', sheet: 'sheet' };

export class ActivitybarPart {
  constructor(services) {
    const { layout } = services;
    this.layout = layout;
    this.buttons = Object.keys(ACTIVITY_ICONS).map((id) => h('button.activity-item', {
      'data-activity': id, title: t('activity.' + id), 'aria-label': t('activity.' + id), html: icon(ACTIVITY_ICONS[id], 22),
      onclick: () => (layout.activity === id && layout.sidebarVisible ? layout.toggleSidebar() : layout.setActivity(id)),
    }));
    this.element = h('nav.part.activitybar', { 'aria-label': t('activity.aria') },
      h('div.activity-top', this.buttons),
      h('div.activity-bottom',
        h('button.activity-item', { title: t('shortcuts.title'), html: icon('keyboard', 20), onclick: () => showShortcutsDialog() }),
        h('button.activity-item', { title: t('activity.toggleSidebar') + ' (Ctrl+B)', html: icon('sidebar', 20), onclick: () => layout.toggleSidebar() }),
        h('button.activity-item', { title: t('about.title'), html: icon('info', 20), onclick: () => showAboutDialog(services.host) })));
    layout.onDidChange(() => this.render());
    this.render();
  }

  render() {
    for (const b of this.buttons) b.classList.toggle('active', b.dataset.activity === this.layout.activity && this.layout.sidebarVisible);
  }
}

export class SidebarPart {
  constructor(services, panes) {
    this.layout = services.layout;
    this.panes = panes;
    this.element = h('aside.part.sidebar', Object.values(panes).map((p) => p.element));
    this.layout.onDidChange(() => this.render());
    this.render();
  }

  render() {
    this.element.hidden = !this.layout.sidebarVisible;
    for (const [id, p] of Object.entries(this.panes)) p.element.hidden = id !== this.layout.activity;
  }
}

const TAB_ICONS = { axon: 'axon', plan: 'plan', elev: 'elevation', sheet: 'sheet', orbit: 'orbit' };

export class EditorPart {
  constructor(services, views) {
    this.s = services;
    this.layout = services.layout;
    this.doc = services.document;
    this.views = views;
    this.tabs = Object.keys(TAB_ICONS).map((id) => h('button.tab', {
      'data-tab': id, onclick: () => this.layout.setTab(id), title: `${t('tab.' + id)} (Ctrl+${Object.keys(TAB_ICONS).indexOf(id) + 1})`,
    }, h('span', { html: icon(TAB_ICONS[id], 15) }), t('tab.' + id)));
    this.stepLabel = h('span.sn-label');
    this.prev = h('button.icon-button', { title: t('steps.prev') + ' (PgUp)', html: icon('prev', 15), onclick: () => this.doc.setStep(this.doc.stepIndex - 1) });
    this.next = h('button.icon-button', { title: t('steps.next') + ' (PgDn)', html: icon('next', 15), onclick: () => this.doc.setStep(this.doc.stepIndex + 1) });
    this.element = h('main.part.editor',
      h('div.editor-header', h('div.tabs', this.tabs), h('span.grow'), h('div.step-nav', this.prev, this.stepLabel, this.next)),
      h('div.editor-content', Object.values(views).map((v) => v.element)));
    this.layout.onDidChange((w) => { if (w === 'tab') this.render(); });
    this.doc.onDidChange((e) => { if (e.kind === 'step' || e.kind === 'load' || e.kind === 'content') this.render(); });
    this.render();
  }

  render() {
    for (const b of this.tabs) b.classList.toggle('active', b.dataset.tab === this.layout.tab);
    for (const [id, v] of Object.entries(this.views)) v.element.hidden = id !== this.layout.tab;
    const n = this.doc.project.steps.length, i = this.doc.stepIndex;
    this.stepLabel.textContent = t('steps.nav', { i: i + 1, n });
    this.prev.disabled = i === 0;
    this.next.disabled = i === n - 1;
    this.stepLabel.parentElement.hidden = this.layout.tab === 'sheet';
  }
}

const THEMES = [['auto', 'auto', 'statusbar.themeAuto'], ['light', 'sun', 'statusbar.themeLight'], ['dark', 'moon', 'statusbar.themeDark'],
  ['map', ['#f4eddf', '#1f3b34', '#e2552e'], 'statusbar.themeMap'], ['riverfront', ['#7cc3b6', '#1b4743', '#2c6aa8'], 'statusbar.themeRiverfront']];

export class StatusbarPart {
  constructor(services) {
    this.s = services;
    this.doc = services.document;
    this.left = h('div.status-left');
    // what the tool in use does, in a sentence (it used to be cut short in the toolbar)
    this.hint = h('div.status-hint', { 'aria-live': 'polite' });
    this.themeSwitch = h('div.theme-switch', { role: 'radiogroup', 'aria-label': t('statusbar.theme') });
    const current = getLocalePreference();
    const select = h('select.status-select', { 'aria-label': t('nls.language'), onchange: (e) => setLocalePreference(e.target.value) },
      [['auto', t('nls.auto')], ...getLocales().map((l) => [l.id, l.label])].map(([v, label]) => h('option', { value: v, selected: v === current }, label)));
    this.version = h('button.status-version', { onclick: () => showUpdateDialog(services), title: t('update.title') });
    this.element = h('footer.part.statusbar', this.left, this.hint,
      h('div.status-right-wrap', this.themeSwitch, h('label.status-language', { title: t('nls.changeHint') }, h('span.status-icon', { html: icon('globe', 12) }), select), this.version));
    this.doc.onDidChange(() => this.render());
    services.layout.onDidChange((w) => { if (w === 'tool' || w === 'tab' || w === 'hint') this.#renderHint(); });
    this.#renderHint();
    services.layout.onDidChangeTheme(() => this.#renderTheme());
    services.update.onDidChange(() => this.#renderVersion());
    this.render();
    this.#renderTheme();
    this.#renderVersion();
  }

  render() {
    const d = this.doc;
    const n = d.project.steps.length;
    const items = [
      t('steps.nav', { i: d.stepIndex + 1, n }),
      tn('statusbar.objects', d.objects.length),
      t('statusbar.grid', { g: String(d.project.grid).replace('.', t('number.decimal')) }),
    ];
    if (d.selection.size) items.push(tn('statusbar.selected', d.selection.size));
    setChildren(this.left, items.map((x) => h('span.status-item', x)));
  }

  #renderHint() {
    const L = this.s.layout;
    const text = L.tab === 'sheet' ? t('sheet.hint') : L.tab === 'orbit' ? t('orbit.hint')
      : L.tab === 'elev' ? t('elev.hint.' + (this.s.views?.elev.elevTool || 'select'))
        : (L.tool === 'box' && L.shape === 'poly') || (L.tool === 'cut' && L.cutShape === 'poly') || L.tool === 'site' ? t('tool.hint.poly') : t('tool.hint.' + L.tool);
    this.hint.textContent = text;
    this.hint.title = text;
  }

  #renderTheme() {
    const cur = this.s.layout.themePreference;
    setChildren(this.themeSwitch, THEMES.map(([id, ic, label]) => h('button.theme-option', {
      role: 'radio', 'aria-checked': String(id === cur), class: id === cur ? 'theme-option active' : 'theme-option',
      'data-theme-id': id, title: Array.isArray(ic) ? t(label + 'Tip') : t(label), 'aria-label': t(label),
      onclick: () => this.s.layout.setTheme(id),
    }, Array.isArray(ic)
      ? h('span.theme-swatch', { style: { background: `conic-gradient(${ic[0]} 0 50%, ${ic[1]} 50% 75%, ${ic[2]} 75%)` } })
      : h('span.status-icon', { html: icon(ic, 12) }), h('span.theme-label', t(label)))));
  }

  #renderVersion() {
    const u = this.s.update;
    const available = u.status === 'available';
    this.version.classList.toggle('update-available', available);
    setChildren(this.version, h(`span.status-icon${u.status === 'checking' ? '.spin' : ''}`, { html: icon(available ? 'download' : 'info', 12) }),
      available ? t('update.availableShort', { version: u.info.latest }) : u.version ? `v${u.version}` : '');
  }
}

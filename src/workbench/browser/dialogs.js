/*---------------------------------------------------------------------------------------------
 *  LionAxon — Copyright (C) 2026 LionAxon Team.
 *  Created and conceived by Daniel Michelon De Carli.
 *  Licensed under the GNU General Public License v3.0 or later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/
// Dialogs: About (version, experimental note, credits, licence), Versions (checks for a new version only
// when asked) and Keyboard shortcuts.
import { h, setChildren } from '../../base/browser/dom.js';
import { icon } from '../../base/browser/icons.js';
import { t } from '../../base/common/nls.js';

function modal(cls, content) {
  const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey, true); };
  const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
  const overlay = h('div.cm-overlay', { onmousedown: (e) => { if (e.target === overlay) close(); } },
    h(`div.cm-dialog.${cls}`, { role: 'dialog', 'aria-modal': 'true' }, ...content(close)));
  document.addEventListener('keydown', onKey, true);
  document.body.append(overlay);
  return close;
}

export async function showAboutDialog(host) {
  const info = await host.appInfo().catch(() => ({}));
  modal('about-dialog', (close) => [
    h('header.about-head', h('img.about-logo', { src: 'media/logo.svg', alt: '' }),
      h('div', h('h2', 'Lion', h('b', 'Axon')), h('p.about-tag', t('app.tagline')))),
    h('p', h('span.about-badge', `v${info.version || ''}`), ' ', h('span.about-badge', t('about.experimental'))),
    h('p', t('about.text')),
    h('p', t('about.credit')),
    h('p.about-team', t('about.team')),
    h('p', h('button.link-button', { 'data-action': 'credits', onclick: () => { close(); showCreditsDialog(host); } }, t('credits.open'))),
    h('p.muted', t('about.license')),
    h('p.muted', t('about.privacy')),
    h('footer.cm-actions', h('button.btn.btn-primary', { onclick: close }, t('common.close'))),
  ]);
}

/** What LionAxon is made with (the full list and the licences are in THIRD-PARTY-NOTICES.md). */
const THIRD_PARTY = [
  ['Electron', 'MIT'], ['polygon-clipping · Mike Fogel', 'MIT'], ['splaytree · Alexander Milevski', 'MIT'], ['robust-predicates · Vladimir Agafonkin', 'Unlicense'],
  ['Plus Jakarta Sans · Tokotype', 'OFL 1.1'], ['JetBrains Mono · JetBrains', 'OFL 1.1'], ['Archivo Narrow · Omnibus-Type', 'OFL 1.1'],
  ['Source Serif 4 · Adobe', 'OFL 1.1'], ['Architects Daughter · Kimberly Geswein', 'OFL 1.1'],
];

/** Credits: who conceived the software, who keeps it, and the free software it is made with. */
export async function showCreditsDialog(host) {
  if (document.querySelector('.credits-dialog')) return;
  const info = await host.appInfo().catch(() => ({}));
  modal('credits-dialog', (close) => [
    h('header.about-head', h('img.about-logo', { src: 'media/logo.svg', alt: '' }),
      h('div', h('h2', t('credits.title')), h('p.about-tag', `LionAxon ${info.version ? 'v' + info.version : ''}`))),
    h('dl.credits-list',
      h('dt', t('credits.conceived')), h('dd', h('b', 'Daniel Michelon De Carli'), h('span.muted', t('credits.conceivedNote'))),
      h('dt', t('credits.team')), h('dd', 'LionAxon Team', h('span.muted', t('credits.teamNote'))),
      h('dt', t('credits.family')), h('dd', 'LionOrganizer · LionPhotos · LionFoundry · LionAxon'),
      h('dt', t('credits.madeWith')), h('dd', h('ul.credits-third', THIRD_PARTY.map(([name, lic]) => h('li', h('span', name), h('span.muted', lic)))))),
    h('p.muted', { style: { fontSize: '12px' } }, t('credits.license')),
    h('footer.cm-actions', h('button.btn.btn-primary', { onclick: close }, t('common.close'))),
  ]);
}

export function showUpdateDialog({ update }) {
  if (document.querySelector('.update-dialog')) return;
  const body = h('div');
  const actions = h('footer.cm-actions');
  let sub;
  const close = modal('update-dialog', () => [body, h('p.muted', { style: { fontSize: '12px' } }, t('update.privacy')), actions]);
  const render = () => {
    const { status, info } = update;
    const versions = h('dl.update-versions', h('dt', t('update.installed')), h('dd', update.version || '—'),
      info?.latest ? [h('dt', t('update.latest')), h('dd', { class: info.available ? 'update-new' : null }, info.latest)] : null);
    const head = (ic, title) => h('header.cm-head', h('span.cm-icon', { style: { background: 'var(--accent-soft)', color: 'var(--accent)' }, html: icon(ic, 20) }), h('h2', title));
    const msg = status === 'idle' ? t('update.idle') : status === 'checking' ? t('update.checking') : status === 'current' ? t('update.current')
      : status === 'available' ? t('update.available', { version: info.latest }) : t('update.error');
    setChildren(body, head(status === 'available' ? 'download' : status === 'error' ? 'warning' : 'info', t('update.title')), versions, h('p', msg));
    setChildren(actions,
      h('button.btn.btn-secondary', { onclick: () => { sub?.dispose(); close(); } }, t('common.close')),
      status === 'available'
        ? h('button.btn.btn-primary', { onclick: () => update.openReleasePage() }, h('span', { html: icon('download', 14) }), t('update.download'))
        : h('button.btn.btn-primary', { disabled: status === 'checking', onclick: () => update.check() }, h('span', { html: icon('refresh', 14) }), t('update.checkNow')));
  };
  sub = update.onDidChange(render);
  render();
}

/**
 * The start screen: a new diagram, a file, one of the examples or a recent file, and the four moves of a
 * parti diagram. Shown the first time the app opens, and from Help.
 */
export async function showWelcomeDialog(services) {
  if (document.querySelector('.welcome-dialog')) return;
  const { commands: cmd } = services;
  const recent = await services.recent.refresh().catch(() => []);
  modal('welcome-dialog', (close) => {
    const go = (fn) => () => { close(); fn(); };
    const item = (ic, label, run, attrs = {}) => h('button.welcome-item', { onclick: go(run), ...attrs }, h('span.welcome-icon', { html: icon(ic, 16) }), h('span.welcome-label', label));
    const guide = [['box', 'welcome.g1'], ['cut', 'welcome.g2'], ['steps', 'welcome.g3'], ['sheet', 'welcome.g4']];
    return [
      h('header.about-head', h('img.about-logo', { src: 'media/logo.svg', alt: '' }),
        h('div', h('h2', t('welcome.title')), h('p.about-tag', t('app.tagline')))),
      h('div.welcome-cols',
        h('section', h('h3', t('welcome.start')),
          item('newFile', t('file.new'), () => cmd.newProject(), { 'data-welcome': 'new' }),
          item('folderOpen', t('file.open') + '…', () => cmd.open(), { 'data-welcome': 'open' }),
          h('h3', { style: { marginTop: '14px' } }, t('menu.recent')),
          recent.length
            ? recent.slice(0, 5).map((r) => item('clock', r.name, () => cmd.openPath(r.path), { title: r.path, 'data-welcome': 'recent' }))
            : h('p.muted', { style: { fontSize: '12px', margin: '4px 0 0' } }, t('menu.noRecent'))),
        h('section', h('h3', t('menu.examples')),
          EXAMPLE_IDS.map((id) => item('axon', t('example.' + id), () => cmd.example(id), { 'data-welcome': 'example-' + id }))),
        h('section', h('h3', t('welcome.guide')),
          h('ol.welcome-guide', guide.map(([ic, key]) => h('li', h('span.welcome-icon', { html: icon(ic, 15) }), h('span', t(key))))))),
      h('footer.cm-actions', h('span.muted.grow', { style: { fontSize: '12px' } }, t('welcome.again')), h('button.btn.btn-primary', { 'data-welcome': 'close', onclick: close }, t('welcome.continue'))),
      h('p.welcome-credit', t('welcome.credit')),
    ];
  });
}

const EXAMPLE_IDS = ['parti', 'plateaus', 'tower', 'slope', 'school', 'corner'];

export function showShortcutsDialog() {
  const rows = [
    ['V', 'tool.select'], ['B', 'tool.box'], ['S', 'tool.cut'], ['G', 'tool.terrain'], ['A', 'tool.arrow'], ['D', 'tool.dim'], ['P', 'tool.person'], ['E', 'tool.tree'], ['T', 'tool.label'], ['Enter', 'shortcuts.polyEnd'],
    ['Delete', 'shortcuts.delete'], ['Ctrl+C · X · V', 'shortcuts.clipboard'], ['Ctrl+D', 'shortcuts.duplicate'], ['R · Space', 'shortcuts.rotate'], ['N', 'shortcuts.newLevel'],
    ['0–9', 'shortcuts.typeSize'], ['F2', 'shortcuts.rename'], ['Ctrl+L · Ctrl+H', 'shortcuts.lockHide'], [t('shortcuts.rightClick'), 'shortcuts.contextMenu'],
    ['← → ↑ ↓', 'shortcuts.nudge'], ['Ctrl+Z · Ctrl+Y', 'shortcuts.undoRedo'], ['F', 'shortcuts.fit'],
    [t('shortcuts.wheel') + ' · Ctrl+ + − 0', 'shortcuts.zoom'], [t('shortcuts.dragEmpty'), 'shortcuts.marquee'], [t('shortcuts.panKeys'), 'shortcuts.pan'], ['Alt', 'shortcuts.noSnap'],
    ['PgUp · PgDn', 'shortcuts.steps'], ['Ctrl+1 · 2 · 3 · 4 · 5', 'shortcuts.tabs'], ['Ctrl+B', 'shortcuts.sidebar'], ['Ctrl+\\', 'shortcuts.focus'],
    ['Ctrl+N · O · S', 'shortcuts.files'], ['Ctrl+W', 'shortcuts.closeTab'], ['Ctrl+Tab', 'shortcuts.nextTab'], ['Esc', 'shortcuts.escape'],
  ];
  modal('shortcuts-dialog', (close) => [
    h('header.cm-head', h('span.cm-icon', { style: { background: 'var(--accent-soft)', color: 'var(--accent)' }, html: icon('keyboard', 20) }), h('h2', t('shortcuts.title'))),
    h('dl.shortcut-list', rows.flatMap(([k, v]) => [h('dt', h('kbd', k)), h('dd', t(v))])),
    h('footer.cm-actions', h('button.btn.btn-primary', { onclick: close }, t('common.close'))),
  ]);
}

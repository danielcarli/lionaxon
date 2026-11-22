/*---------------------------------------------------------------------------------------------
 *  LionAxon — Copyright (C) 2026 LionAxon Team.
 *  Created and conceived by Daniel Michelon De Carli.
 *  Licensed under the GNU General Public License v3.0 or later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/
// The menu of the right button: a flat list of commands at the pointer, with the same look as the menus
// of the menu bar. Entries: { label, key?, run, disabled?, checked?, danger? } or { sep: true }.
// It closes on a click elsewhere, on Escape, when the window loses focus, and after running an entry.
import { h } from '../../base/browser/dom.js';
import { icon } from '../../base/browser/icons.js';

let open = null;

export function closeContextMenu() {
  if (!open) return;
  open.el.remove();
  document.removeEventListener('pointerdown', open.onDown, true);
  document.removeEventListener('keydown', open.onKey, true);
  window.removeEventListener('blur', closeContextMenu);
  open = null;
}

export function showContextMenu(x, y, entries) {
  closeContextMenu();
  const items = entries.filter(Boolean).filter((it, i, list) => !(it.sep && (i === 0 || i === list.length - 1 || list[i - 1].sep)));
  if (!items.length) return null;
  let active = -1;
  const rows = items.map((it, k) => (it.sep ? h('div.menu-sep', { role: 'separator' }) : h('div.menu-entry', {
    class: `menu-entry${it.disabled ? ' disabled' : ''}${it.danger ? ' danger' : ''}`, role: 'menuitem', 'aria-disabled': it.disabled ? 'true' : null, 'data-index': String(k),
    onpointerenter: () => setActive(k),
    onpointerup: (e) => { e.preventDefault(); run(k); },
  }, h('span.menu-check', it.checked ? { html: icon('check', 13) } : null), h('span.menu-label', it.label), h('span.menu-key', it.key || ''))));
  const el = h('div.menu-popup.context-menu', { role: 'menu', oncontextmenu: (e) => e.preventDefault() }, rows);
  const setActive = (k) => { active = k; rows.forEach((r, i) => r.classList.toggle('active', i === k && !items[i].sep)); };
  const run = (k) => { const it = items[k]; if (!it || it.sep || it.disabled) return; closeContextMenu(); it.run?.(); };
  const move = (d) => {
    let k = active;
    for (let n = 0; n < items.length; n++) { k = (k + d + items.length) % items.length; if (!items[k].sep && !items[k].disabled) break; }
    setActive(k);
  };
  const onDown = (e) => { if (!el.contains(e.target)) closeContextMenu(); };
  const onKey = (e) => {
    if (e.key === 'Escape') closeContextMenu();
    else if (e.key === 'ArrowDown') move(1);
    else if (e.key === 'ArrowUp') move(-1);
    else if (e.key === 'Enter' || e.key === ' ') run(active);
    else if (e.ctrlKey || e.metaKey) { closeContextMenu(); return; }
    e.preventDefault();
    e.stopPropagation();
  };
  document.body.append(el);
  el.style.left = `${Math.max(4, Math.min(x, window.innerWidth - el.offsetWidth - 4))}px`;
  el.style.top = `${Math.max(4, Math.min(y, window.innerHeight - el.offsetHeight - 4))}px`;
  open = { el, onDown, onKey };
  // after this click has finished, so it does not close the menu it opened
  setTimeout(() => { if (open?.el === el) { document.addEventListener('pointerdown', onDown, true); document.addEventListener('keydown', onKey, true); window.addEventListener('blur', closeContextMenu); } }, 0);
  return el;
}

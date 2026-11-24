/*---------------------------------------------------------------------------------------------
 *  LionAxon — Copyright (C) 2026 LionAxon Team.
 *  Created and conceived by Daniel Michelon De Carli.
 *  Licensed under the GNU General Public License v3.0 or later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/
// Bold, italic and lists for the texts of labels, written as marks in the text itself (**bold**, *italic*,
// "- " and "1. " at the start of a line; see render/common/richText.js): a small bar of buttons over a
// field, and Ctrl+B / Ctrl+I in it.

import { h } from '../../base/browser/dom.js';
import { t } from '../../base/common/nls.js';

/** Puts `mark` around the selection (or takes it away when it is already there); with nothing selected, an empty pair. */
function wrapWith(el, mark) {
  const { value: v, selectionStart: a, selectionEnd: b } = el;
  const n = mark.length;
  if (a >= n && v.slice(a - n, a) === mark && v.slice(b, b + n) === mark) {
    el.value = v.slice(0, a - n) + v.slice(a, b) + v.slice(b + n);
    el.setSelectionRange(a - n, b - n);
  } else {
    el.value = v.slice(0, a) + mark + v.slice(a, b) + mark + v.slice(b);
    el.setSelectionRange(a + n, b + n);
  }
}

/** Makes the lines of the selection items of a list (or plain lines again, when they all already are). */
function listLines(el, numbered) {
  const { value: v, selectionStart: a, selectionEnd: b } = el;
  const start = v.lastIndexOf('\n', a - 1) + 1;
  const endNl = v.indexOf('\n', b > a && v[b - 1] === '\n' ? b - 1 : b);
  const end = endNl < 0 ? v.length : endNl;
  const lines = v.slice(start, end).split('\n');
  const mark = numbered ? /^\s*\d{1,3}[.)]\s+/ : /^\s*[-*•]\s+/;
  const any = /^\s*([-*•]|\d{1,3}[.)])\s+/;
  const all = lines.every((l) => mark.test(l));
  const next = lines.map((l, i) => {
    const bare = l.replace(any, '');
    return all ? bare : `${numbered ? `${i + 1}. ` : '- '}${bare}`;
  }).join('\n');
  el.value = v.slice(0, start) + next + v.slice(end);
  el.setSelectionRange(start, start + next.length);
}

/** Applies one of the formats ('b', 'i', 'ul', 'ol') to a field and tells it it changed. */
export function applyFormat(el, kind, { commit = false } = {}) {
  if (kind === 'b') wrapWith(el, '**');
  else if (kind === 'i') wrapWith(el, '*');
  else listLines(el, kind === 'ol');
  el.dispatchEvent(new Event('input', { bubbles: true }));
  if (commit) el.dispatchEvent(new Event('change', { bubbles: true }));
}

/** Ctrl+B and Ctrl+I in a field: true when the key was taken. */
export function formatKeys(e, el, opts) {
  if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return false;
  const k = e.key.toLowerCase();
  if (k !== 'b' && k !== 'i') return false;
  e.preventDefault();
  applyFormat(el, k, opts);
  return true;
}

/**
 * The bar of buttons for a field (`field()` gives it, as it may be made after the bar). The buttons keep the
 * focus in the field; `commit` sends a change as well (a field that saves on change).
 */
export function formatBar(field, { commit = false } = {}) {
  const btn = (kind, label, tip, cls) => h('button.format-btn', {
    type: 'button', class: `format-btn ${cls || ''}`, 'data-format': kind, title: tip, 'aria-label': tip,
    onmousedown: (e) => e.preventDefault(),
    onclick: () => { const el = field(); if (el) { el.focus(); applyFormat(el, kind, { commit }); } },
  }, label);
  return h('div.format-bar', { role: 'toolbar', 'aria-label': t('format.title') },
    btn('b', 'B', `${t('format.bold')} (Ctrl+B)`, 'b'),
    btn('i', 'I', `${t('format.italic')} (Ctrl+I)`, 'i'),
    btn('ul', '•', t('format.bullets')),
    btn('ol', '1.', t('format.numbers')));
}

/*---------------------------------------------------------------------------------------------
 *  LionAxon — Copyright (C) 2026 LionAxon Team.
 *  Created and conceived by Daniel Michelon De Carli.
 *  Licensed under the GNU General Public License v3.0 or later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/
// Small form controls shared by the panes: number fields in metres (decimal comma or point, arrows to
// step, Enter or leaving the field to apply), segmented choices, selects, checkboxes and text fields.
import { h } from '../../base/browser/dom.js';
import { formatNumber } from '../../base/common/nls.js';

export function parseNumber(text) {
  const s = String(text).trim().replace(/\s/g, '').replace(',', '.');
  if (!s) return NaN;
  return Number(s);
}

/**
 * @param {{ label?: string, value: number, unit?: string, step?: number, min?: number, max?: number,
 *   digits?: number, title?: string, disabled?: boolean, onCommit: (v: number) => void, key?: string }} o
 */
export function numField(o) {
  const step = o.step ?? 0.5;
  const fmt = (v) => formatNumber(v, o.digits ?? 2);
  const clamp = (v) => Math.min(o.max ?? Infinity, Math.max(o.min ?? -Infinity, v));
  let committed = o.value;
  const input = h('input', {
    type: 'text', inputMode: 'decimal', value: fmt(o.value), disabled: !!o.disabled, spellcheck: false,
    'aria-label': o.title || o.label || '', 'data-key': o.key || null,
    onfocus: () => input.select(),
    onkeydown: (e) => {
      if (e.key === 'Enter') { e.preventDefault(); commit(); input.select(); }
      else if (e.key === 'Escape') { input.value = fmt(committed); input.blur(); }
      else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const cur = parseNumber(input.value);
        const base = Number.isFinite(cur) ? cur : committed;
        const k = (e.shiftKey ? 10 : e.altKey ? 0.1 : 1) * (e.key === 'ArrowUp' ? 1 : -1);
        input.value = fmt(clamp(Math.round((base + step * k) * 1000) / 1000));
        commit();
      }
      e.stopPropagation();
    },
    onchange: () => commit(),
  });
  const commit = () => {
    const v = parseNumber(input.value);
    if (!Number.isFinite(v)) { input.value = fmt(committed); return; }
    const c = clamp(v);
    input.value = fmt(c);
    if (c !== committed) { committed = c; o.onCommit(c); }
  };
  return h('label.num-field', { title: o.title || null },
    o.label ? h('span.nf-label', o.label) : null, input, o.unit ? h('span.nf-unit', o.unit) : null);
}

export function segmented(options, value, onPick, { title } = {}) {
  return h('div.segmented', { role: 'radiogroup', 'aria-label': title || null },
    options.map(([v, label, tip]) => h('button', {
      type: 'button', role: 'radio', 'aria-checked': String(v === value), class: v === value ? 'active' : null, title: tip || null,
      'data-value': String(v),
      onclick: () => { if (v !== value) onPick(v); },
    }, label)));
}

export function selectField(options, value, onPick, attrs = {}) {
  return h('select.select', { ...attrs, onchange: (e) => onPick(e.target.value) },
    options.map(([v, label]) => h('option', { value: v, selected: String(v) === String(value) }, label)));
}

export function checkbox(label, checked, onChange, attrs = {}) {
  return h('label.checkbox', h('input', { type: 'checkbox', checked, ...attrs, onchange: (e) => onChange(e.target.checked) }), h('span', label));
}

export function textField(value, onCommit, { placeholder = '', multiline = false, key } = {}) {
  let committed = value;
  const commit = () => { if (el.value !== committed) { committed = el.value; onCommit(el.value); } };
  const el = multiline
    ? h('textarea.textarea', { placeholder, 'data-key': key || null, onchange: commit, onblur: commit, onkeydown: (e) => e.stopPropagation() })
    : h('input.input', { type: 'text', placeholder, 'data-key': key || null, onchange: commit, onkeydown: (e) => { if (e.key === 'Enter') { commit(); el.blur(); } else if (e.key === 'Escape') { el.value = committed; el.blur(); } e.stopPropagation(); } });
  el.value = value;
  return el;
}

export const row = (label, control) => h('div.form-row', h('label', label), control);
const SECTIONS_KEY = 'lionaxon.sections';
let sectionState = null;
const sections = () => {
  if (!sectionState) { try { sectionState = JSON.parse(localStorage.getItem(SECTIONS_KEY) || '{}'); } catch { sectionState = {}; } }
  return sectionState;
};

function makeSection(title, children, closedByDefault) {
  if (!title) return h('section.pane-section', ...children);
  const closed = sections()[title] ?? closedByDefault;
  const body = h('div.section-body', ...children);
  const head = h('button.section-head', {
    type: 'button', 'aria-expanded': String(!closed),
    onclick: () => {
      const now = !el.classList.contains('closed');
      el.classList.toggle('closed', now);
      head.setAttribute('aria-expanded', String(!now));
      sections()[title] = now;
      try { localStorage.setItem(SECTIONS_KEY, JSON.stringify(sections())); } catch { /* storage unavailable */ }
    },
  }, h('span.section-chevron', { html: '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9.5l6 6 6-6"/></svg>' }), h('h3', title));
  const el = h(`section.pane-section${closed ? '.closed' : ''}`, head, body);
  return el;
}

/** A titled group of a panel. A click on the title folds it; each title remembers how it was left. */
export const section = (title, ...children) => makeSection(title, children, false);
/** A section that starts folded (until the person opens it). */
section.closed = (title, ...children) => makeSection(title, children, true);

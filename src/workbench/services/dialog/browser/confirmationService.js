/*---------------------------------------------------------------------------------------------
 *  LionAxon — Copyright (C) 2026 LionAxon Team.
 *  Created and conceived by Daniel Michelon De Carli.
 *  Licensed under the GNU General Public License v3.0 or later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/
// Second confirmation of the Lion family: what is hard to take back asks the person to type a code of
// three characters shown on screen (letters and digits that cannot be confused: no O/0, I/1, L).
// Also the question asked before closing a diagram with unsaved changes (save, don't save, cancel).
import { h } from '../../../../base/browser/dom.js';
import { icon } from '../../../../base/browser/icons.js';
import { t } from '../../../../base/common/nls.js';

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 3;

export function makeCode(rand = Math.random) {
  let s = '';
  for (let i = 0; i < CODE_LENGTH; i++) s += ALPHABET[Math.floor(rand() * ALPHABET.length)];
  return s;
}

export class ConfirmationService {
  /**
   * Asks what to do with a diagram that has unsaved changes. Resolves 'save', 'discard' or 'cancel'.
   * Enter saves, Escape cancels; nothing is thrown away without a click on "Don't save".
   */
  askSave({ name, more = 0 }) {
    return new Promise((resolve) => {
      const finish = (answer) => {
        document.removeEventListener('keydown', onKey, true);
        overlay.remove();
        resolve(answer);
      };
      const onKey = (e) => {
        if (e.key === 'Escape') { e.preventDefault(); finish('cancel'); }
        else if (e.key === 'Enter' && document.activeElement?.closest?.('.cm-dialog') == null) { e.preventDefault(); finish('save'); }
      };
      const save = h('button.btn.btn-primary', { 'data-answer': 'save', onclick: () => finish('save') }, t('close.save'));
      const overlay = h('div.cm-overlay', { onmousedown: (e) => { if (e.target === overlay) finish('cancel'); } },
        h('div.cm-dialog.save-dialog', { role: 'dialog', 'aria-modal': 'true' },
          h('header.cm-head', h('span.cm-icon', { style: { background: 'var(--accent-soft)', color: 'var(--accent)' }, html: icon('save', 20) }),
            h('h2', t('close.title', { name }))),
          h('p', t('close.message')),
          more ? h('p.muted', t('close.more', { n: more })) : null,
          h('footer.cm-actions',
            h('button.btn.btn-secondary', { 'data-answer': 'discard', onclick: () => finish('discard') }, t('close.discard')),
            h('span.grow'),
            h('button.btn.btn-secondary', { 'data-answer': 'cancel', onclick: () => finish('cancel') }, t('common.cancel')),
            save)));
      document.addEventListener('keydown', onKey, true);
      document.body.append(overlay);
      setTimeout(() => save.focus(), 0);
    });
  }

  /** Resolves true when the code was typed and confirmed, false when cancelled. */
  confirmWithCode({ title, message, action }) {
    return new Promise((resolve) => {
      const code = makeCode();
      const input = h('input.cm-code-input', {
        type: 'text', maxLength: CODE_LENGTH, autocomplete: 'off', spellcheck: false, 'aria-label': t('confirm.typeCode'),
        oninput: () => { input.value = input.value.toUpperCase(); go.disabled = input.value !== code; },
        onkeydown: (e) => { if (e.key === 'Enter' && input.value === code) finish(true); },
      });
      const go = h('button.btn.btn-danger', { disabled: true, onclick: () => finish(true) }, action);
      const finish = (ok) => {
        document.removeEventListener('keydown', onKey, true);
        overlay.remove();
        resolve(ok);
      };
      const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); finish(false); } };
      const overlay = h('div.cm-overlay', { onmousedown: (e) => { if (e.target === overlay) finish(false); } },
        h('div.cm-dialog', { role: 'dialog', 'aria-modal': 'true' },
          h('header.cm-head', h('span.cm-icon', { html: icon('warning', 20) }), h('h2', title)),
          h('p', message),
          h('div.cm-code-row',
            h('span.cm-code-label', t('confirm.typeCode')),
            h('span.cm-code', { 'data-code': code }, code),
            input),
          h('footer.cm-actions', h('button.btn.btn-secondary', { onclick: () => finish(false) }, t('common.cancel')), go)));
      document.addEventListener('keydown', onKey, true);
      document.body.append(overlay);
      requestAnimationFrame(() => input.focus());
    });
  }
}

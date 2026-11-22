/*---------------------------------------------------------------------------------------------
 *  LionAxon — Copyright (C) 2026 LionAxon Team.
 *  Created and conceived by Daniel Michelon De Carli.
 *  Licensed under the GNU General Public License v3.0 or later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/
// Steps (side bar): the list of steps with a drawing of each one. A new step starts as a copy of the
// current one; steps are moved by dragging (or with the arrows), and a deleted step can be brought back
// from the notice that follows (or with undo).
import { h, setChildren } from '../../../../base/browser/dom.js';
import { icon } from '../../../../base/browser/icons.js';
import { t } from '../../../../base/common/nls.js';
import { stepSvg, stepViews } from '../../../services/render/common/renderer.js';
import { meters } from '../../../services/export/browser/exportService.js';

export class StepsPane {
  constructor(services) {
    this.s = services;
    this.doc = services.document;
    this.list = h('div.steps-list');
    this.thumbs = new Map(); // step id → { key, url }
    this.element = h('div.pane', { 'data-pane': 'steps' },
      h('div.pane-header', h('span.grow', t('activity.steps')),
        h('button.icon-button', { title: t('steps.add'), 'aria-label': t('steps.add'), html: icon('plus', 16), onclick: () => services.commands.addStep() })),
      h('div.pane-body', this.list,
        h('button.btn.btn-secondary.btn-sm.btn-block', { onclick: () => services.commands.addStep() }, h('span', { html: icon('plus', 14) }), t('steps.addLong')),
        h('p.pane-hint', t('steps.hint'))));
    this.doc.onDidChange((e) => {
      if (e.kind === 'selection' || e.kind === 'file') return;
      if (e.live) { this.#schedule(250); return; }
      this.#schedule(e.kind === 'content' ? 120 : 0);
    });
    this.render();
  }

  #schedule(ms) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.render(), ms);
  }

  #thumb(i) {
    const p = this.doc.project;
    const step = p.steps[i];
    // the drawing of a step depends on its objects, the previous step (highlight), the style and the view
    const key = JSON.stringify([step.objects, step.highlight, step.explode, step.views, i ? p.steps[i - 1].objects : null, p.style, p.view, p.site, p.levels, p.categories]);
    const cached = this.thumbs.get(step.id);
    if (cached && cached.key === key) return cached.url;
    const svg = stepSvg(p, i, { views: stepViews(p, p.steps[i]), width: 240, fmt: meters });
    const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    this.thumbs.set(step.id, { key, url });
    return url;
  }

  render() {
    const doc = this.doc;
    const steps = doc.project.steps;
    setChildren(this.list, steps.map((step, i) => {
      const n = String(i + 1).padStart(2, '0');
      const card = h('div.step-card', {
        class: i === doc.stepIndex ? 'step-card active' : 'step-card', role: 'button', tabIndex: 0, 'data-step': i, draggable: 'true',
        title: t('steps.dragHint'),
        // drag a step onto another to move it there
        ondragstart: (e) => { this.dragFrom = i; card.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(i)); },
        ondragend: () => { this.dragFrom = null; for (const c of this.list.children) c.classList.remove('dragging', 'drop-before', 'drop-after'); },
        ondragover: (e) => {
          if (this.dragFrom == null || this.dragFrom === i) return;
          e.preventDefault();
          for (const c of this.list.children) c.classList.remove('drop-before', 'drop-after');
          card.classList.add(this.dragFrom < i ? 'drop-after' : 'drop-before');
        },
        ondragleave: () => card.classList.remove('drop-before', 'drop-after'),
        ondrop: (e) => { e.preventDefault(); const from = this.dragFrom; this.dragFrom = null; if (from != null && from !== i) doc.moveStep(from, i); },
        'aria-label': `${t('sheet.step')} ${n} ${step.title}`,
        onclick: () => doc.setStep(i),
        onkeydown: (e) => { if (e.key === 'Enter') doc.setStep(i); },
      },
      h('div.step-thumb', h('img', { src: this.#thumb(i), alt: '', draggable: false })),
      h('div.step-meta',
        h('span.step-num', n),
        h(`span.step-title${step.title ? '' : '.empty'}`, step.title || t('steps.untitled')),
        step.highlight && i > 0 ? h('span.step-flag', { title: t('steps.highlightOn'), html: icon('highlight', 13) }) : null,
        h('span.step-actions',
          h('button.icon-button', { title: t('steps.up'), disabled: i === 0, html: icon('up', 14), onclick: (e) => { e.stopPropagation(); doc.moveStep(i, i - 1); } }),
          h('button.icon-button', { title: t('steps.down'), disabled: i === steps.length - 1, html: icon('down', 14), onclick: (e) => { e.stopPropagation(); doc.moveStep(i, i + 1); } }),
          h('button.icon-button.danger', { title: t('steps.remove'), disabled: steps.length <= 1, html: icon('trash', 14), onclick: (e) => { e.stopPropagation(); this.s.commands.removeStep(i); } }))));
      return card;
    }));
    // forget drawings of steps that no longer exist
    const ids = new Set(steps.map((s) => s.id));
    for (const id of this.thumbs.keys()) if (!ids.has(id)) this.thumbs.delete(id);
  }
}

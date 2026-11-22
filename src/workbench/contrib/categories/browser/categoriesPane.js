/*---------------------------------------------------------------------------------------------
 *  LionAxon — Copyright (C) 2026 LionAxon Team.
 *  Created and conceived by Daniel Michelon De Carli.
 *  Licensed under the GNU General Public License v3.0 or later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/
// Categories (side bar): uses of the project (stair core, circulation, theatre…), each with a colour.
// Volumes and arrows take the colour of a category; the sheet's legend lists only the ones in use.
import { h, setChildren } from '../../../../base/browser/dom.js';
import { icon } from '../../../../base/browser/icons.js';
import { t } from '../../../../base/common/nls.js';
import { checkbox } from '../../../browser/widgets.js';

export class CategoriesPane {
  constructor(services) {
    this.s = services;
    this.doc = services.document;
    this.cmd = services.commands;
    this.list = h('div.cat-list');
    this.element = h('div.pane', { 'data-pane': 'categories' },
      h('div.pane-header', h('span.grow', t('activity.categories')),
        h('button.icon-button', { title: t('categories.add'), html: icon('plus', 16), onclick: () => this.#add() })),
      h('div.pane-body', this.list,
        h('button.btn.btn-secondary.btn-sm.btn-block', { style: { marginTop: '10px' }, onclick: () => this.#add() }, h('span', { html: icon('plus', 14) }), t('categories.add')),
        h('p.pane-hint', t('categories.hint')),
        (this.patterns = h('div', { style: { marginTop: '12px' } }))));
    this.doc.onDidChange((e) => { if (!e.live && e.kind !== 'selection') this.render(); });
    this.render();
  }

  #add() {
    const cat = this.cmd.addCategory();
    requestAnimationFrame(() => this.list.querySelector(`[data-cat="${cat.id}"] input[type=text]`)?.select());
  }

  render() {
    if (this.element.contains(document.activeElement) && document.activeElement?.type === 'text') return;
    const p = this.doc.project;
    const uses = new Map();
    for (const s of p.steps) for (const o of s.objects) {
      const id = o.type === 'volume' ? o.cat : o.type === 'arrow' ? o.color : null;
      if (id) uses.set(id, (uses.get(id) || 0) + 1);
    }
    setChildren(this.patterns,
      checkbox(t('categories.patterns'), !!p.catPatterns, (v) => this.cmd.setProject((pp) => { pp.catPatterns = v; }, 'project.patterns'), { 'data-key': 'catPatterns' }),
      h('p.pane-hint', t('categories.patternsHint')));
    if (!p.categories.length) { setChildren(this.list, h('p.empty-hint', t('categories.empty'))); return; }
    setChildren(this.list, p.categories.map((c) => h('div.cat-row', { 'data-cat': c.id },
      h('input', { type: 'color', value: c.color, title: t('categories.color'), onchange: (e) => this.cmd.setProject((pp) => { pp.categories.find((x) => x.id === c.id).color = e.target.value; }, 'category.color') }),
      h('input.input', { type: 'text', value: c.name, placeholder: t('categories.namePlaceholder'),
        onkeydown: (e) => { e.stopPropagation(); if (e.key === 'Enter') e.target.blur(); },
        onchange: (e) => this.cmd.setProject((pp) => { pp.categories.find((x) => x.id === c.id).name = e.target.value; }, 'category.rename') }),
      h('span.cat-count', { title: t('categories.uses') }, String(uses.get(c.id) || 0)),
      h('button.icon-button.danger', { title: t('categories.remove'), html: icon('trash', 14), onclick: () => this.cmd.removeCategory(c.id) }))));
  }
}

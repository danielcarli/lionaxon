/*---------------------------------------------------------------------------------------------
 *  LionAxon — Copyright (C) 2026 LionAxon Team.
 *  Created and conceived by Daniel Michelon De Carli.
 *  Licensed under the GNU General Public License v3.0 or later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/
// Sheet: the settings (side bar) and the preview (editor tab). The preview is the exported SVG itself.
import { h, setChildren } from '../../../../base/browser/dom.js';
import { icon } from '../../../../base/browser/icons.js';
import { t } from '../../../../base/common/nls.js';
import { numField, segmented, selectField, checkbox, textField, row, section } from '../../../browser/widgets.js';
import { PAPERS, SHEET_SCALES } from '../../../services/model/common/model.js';

export class SheetPane {
  constructor(services) {
    this.s = services;
    this.doc = services.document;
    this.cmd = services.commands;
    this.dpi = 200;
    this.body = h('div.pane-body');
    this.element = h('div.pane', { 'data-pane': 'sheet' }, h('div.pane-header', h('span.grow', t('activity.sheet'))), this.body);
    this.doc.onDidChange((e) => { if (!e.live && e.kind !== 'selection') this.render(); });
    this.render();
  }

  /** What the chosen scale gives: the scale on "auto", the number of pages, or that it does not fit. */
  #scaleHint() {
    const r = this.s.export.sheet();
    const paper = `${this.doc.project.sheet.paper}`;
    const parts = [];
    if (!r.fixed) parts.push(t('sheet.scaleAutoIs', { n: r.scale }));
    const fit = r.largestFit ? `1:${r.largestFit}` : '—';
    if (r.overflow) parts.push(t('sheet.scaleOverflow', { paper, fit }));
    else if (r.stacked) parts.push(t('sheet.scaleStacked', { fit }));
    parts.push(r.pages.length > 1 ? t('sheet.pagesMany', { n: r.pages.length, paper }) : t('sheet.pagesOne', { paper }));
    return h('p.pane-hint', { 'data-scale-hint': '' , class: r.overflow ? 'pane-hint warn' : 'pane-hint' }, parts.join(' '));
  }

  render() {
    if (this.element.contains(document.activeElement) && document.activeElement !== document.body) {
      clearTimeout(this.retry);
      this.retry = setTimeout(() => this.render(), 400);
      return;
    }
    const sh = this.doc.project.sheet;
    const set = (fn) => this.cmd.setProject((p) => fn(p.sheet), 'sheet.set');
    const exp = (kind, label) => h('button.btn.btn-secondary.btn-sm', { 'data-export': kind, onclick: () => this.cmd.exportSheet(kind, { dpi: this.dpi }) }, h('span', { html: icon('download', 14) }), label);
    setChildren(this.body,
      section(t('sheet.texts'), h('div.form',
        h('label.form-label', t('sheet.title')), textField(sh.title, (v) => set((s) => { s.title = v; }), { placeholder: t('sheet.titlePlaceholder'), key: 'sheetTitle' }),
        h('label.form-label', t('sheet.subtitle')), textField(sh.subtitle, (v) => set((s) => { s.subtitle = v; }), { placeholder: t('sheet.subtitlePlaceholder'), key: 'sheetSubtitle' }),
        checkbox(t('sheet.showLegend'), sh.legend, (v) => set((s) => { s.legend = v; })),
        sh.legend ? row(t('sheet.legendPlace'), segmented([['top', t('sheet.legendTop')], ['bottom', t('sheet.legendBottom')]], sh.legendPlace || 'top', (v) => set((s) => { s.legendPlace = v; }), { title: t('sheet.legendPlace') })) : null,
        checkbox(t('sheet.showTexts'), sh.texts, (v) => set((s) => { s.texts = v; })))),
      // free blocks of text in a column on the right of the sheet
      section(t('sheet.blocks'), h('div.form',
        (sh.blocks || []).map((b, i) => h('div.sheet-block', { 'data-block': String(i) },
          h('div.sheet-block-head',
            textField(b.title, (v) => set((s) => { s.blocks[i].title = v; }), { placeholder: t('sheet.blockTitle'), key: `blockTitle${i}` }),
            h('button.icon-button', { title: t('sheet.blockRemove'), 'aria-label': t('sheet.blockRemove'), html: icon('trash', 14), onclick: () => set((s) => { s.blocks.splice(i, 1); }) })),
          textField(b.text, (v) => set((s) => { s.blocks[i].text = v; }), { multiline: true, placeholder: t('sheet.blockText'), key: `blockText${i}` }))),
        (sh.blocks || []).length < 8 ? h('button.btn.btn-secondary.btn-sm', { 'data-action': 'add-block', onclick: () => set((s) => { (s.blocks ||= []).push({ title: t('sheet.blockNew'), text: '' }); }) }, h('span', { html: icon('plus', 14) }), t('sheet.blockAdd')) : null,
        h('p.pane-hint', t('sheet.blocksHint')))),
      section(t('sheet.layout'), h('div.form',
        segmented([['row', t('sheet.row')], ['grid', t('sheet.grid')], ['column', t('sheet.column')], ['vertical', t('sheet.vertical'), t('sheet.verticalTip')]], sh.layout,
          // the vertical sheet is read top to bottom: it turns the paper upright
          (v) => set((s) => { s.layout = v; if (v === 'vertical') s.orientation = 'portrait'; })),
        sh.layout === 'grid' ? row(t('sheet.cols'), numField({ value: sh.cols, unit: '', step: 1, min: 1, max: 8, digits: 0, onCommit: (v) => set((s) => { s.cols = Math.round(v); }) })) : null,
        row(t('sheet.paper'), selectField(Object.keys(PAPERS).map((k) => [k, `${k} · ${PAPERS[k][0]} × ${PAPERS[k][1]} mm`]), sh.paper, (v) => set((s) => { s.paper = v; }), { 'data-key': 'paper' })),
        segmented([['landscape', t('sheet.landscape')], ['portrait', t('sheet.portrait')]], sh.orientation, (v) => set((s) => { s.orientation = v; })),
        h('button.btn.btn-secondary.btn-sm', { 'data-preset': 'a4-vertical', title: t('sheet.presetA4Tip'), onclick: () => set((s) => { s.layout = 'vertical'; s.paper = 'A4'; s.orientation = 'portrait'; }) },
          h('span', { html: icon('sheet', 14) }), t('sheet.presetA4')))),
      section(t('sheet.scale'), h('div.form',
        selectField(SHEET_SCALES.map((d) => [d, d ? `1:${d}` : t('sheet.scaleAuto')]), sh.scale, (v) => set((s) => { s.scale = Number(v); }), { 'data-key': 'scale' }),
        this.#scaleHint())),
      section(t('sheet.export'), h('div.form',
        h('div.btn-row', exp('pdf', 'PDF'), exp('svg', 'SVG'), exp('png', 'PNG')),
        row(t('sheet.pngDpi'), selectField([[150, '150 dpi'], [200, '200 dpi'], [300, '300 dpi']], this.dpi, (v) => { this.dpi = Number(v); })),
        h('p.pane-hint', t('sheet.exportHint')))),
      section(t('gif.title'), h('div.form',
        h('button.btn.btn-secondary.btn-sm.btn-block', { 'data-action': 'gif', onclick: () => this.cmd.exportGif() }, h('span', { html: icon('film', 14) }), t('gif.export')),
        h('p.pane-hint', t('gif.hint')))),
      section(t('sheet.exportStep'), h('div.form',
        h('div.btn-row',
          h('button.btn.btn-secondary.btn-sm', { onclick: () => this.cmd.exportStep('svg') }, h('span', { html: icon('download', 14) }), 'SVG'),
          h('button.btn.btn-secondary.btn-sm', { onclick: () => this.cmd.exportStep('png') }, h('span', { html: icon('download', 14) }), 'PNG')),
        h('p.pane-hint', t('sheet.exportStepHint', { n: String(this.doc.stepIndex + 1).padStart(2, '0') })))),
    );
  }
}

export class SheetView {
  constructor(services) {
    this.s = services;
    this.doc = services.document;
    this.paper = h('div.sheet-paper');
    this.wrap = h('div.sheet-wrap', this.paper);
    this.element = h('div.editor-view', { 'data-view': 'sheet' }, this.wrap);
    this.doc.onDidChange((e) => { if (e.kind !== 'selection' && e.kind !== 'file') this.#schedule(e.live ? 300 : 60); });
    services.layout.onDidChange((w) => { if (w === 'tab' && this.visible) this.render(); });
    new ResizeObserver(() => { if (this.visible) this.#fitPaper(); }).observe(this.wrap);
  }

  get visible() { return this.s.layout.tab === 'sheet'; }

  #schedule(ms) {
    if (!this.visible) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.render(), ms);
  }

  render() {
    if (!this.visible) return;
    const { pages, width, height } = this.s.export.sheet();
    this.size = [width, height];
    // every page of the sheet, one under the other (the first is the whole sheet when it fits one page)
    setChildren(this.paper, pages.map((svg, i) => {
      const page = h('div.sheet-page', { 'data-page': String(i + 1) });
      page.innerHTML = svg;
      return page;
    }));
    this.paper.classList.toggle('multi', pages.length > 1);
    this.#fitPaper();
  }

  #fitPaper() {
    if (!this.size) return;
    const W = this.wrap.clientWidth - 56, H = this.wrap.clientHeight - 56;
    const k = Math.min(W / this.size[0], H / this.size[1]);
    for (const page of this.paper.children) {
      page.style.width = `${Math.max(100, this.size[0] * k)}px`;
      page.style.height = `${Math.max(70, this.size[1] * k)}px`;
    }
  }
}

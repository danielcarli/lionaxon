/*---------------------------------------------------------------------------------------------
 *  LionAxon — Copyright (C) 2026 LionAxon Team.
 *  Created and conceived by Daniel Michelon De Carli.
 *  Licensed under the GNU General Public License v3.0 or later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/
// Sheet: the settings (side bar) and the preview (editor tab). The preview is the exported SVG itself.
import { h, setChildren } from '../../../../base/browser/dom.js';
import { icon } from '../../../../base/browser/icons.js';
import { t } from '../../../../base/common/nls.js';
import { toggleSwitch, numField, segmented, selectField, checkbox, textField, row, section } from '../../../browser/widgets.js';
import { PAPERS, SHEET_SCALES } from '../../../services/model/common/model.js';
import { parseStepRange, formatStepRange } from '../../../services/export/common/stepRange.js';

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

  /**
   * Export some steps: a field for which ones ("7", "3-7", "1, 4, 6-8", empty for the step shown), each
   * drawing in a file of its own or a sheet of just those steps, in PDF, SVG or PNG.
   */
  #stepsSection() {
    const count = this.doc.project.steps.length;
    const current = this.doc.stepIndex;
    const hint = h('p.pane-hint', { 'data-steps-hint': '' });
    const update = () => {
      const { indexes, error } = parseStepRange(field.value, count, current);
      hint.classList.toggle('warn', error != null);
      field.classList.toggle('invalid', error != null);
      if (error != null) { hint.textContent = t('export.stepsInvalid', { part: error, n: count }); return; }
      const list = formatStepRange(indexes);
      const capt = this.s.export.stepCaption;
      hint.textContent = this.stepsMode === 'sheet' ? t('sheet.stepsHintSheet', { list })
        : indexes.length === 1 ? t(capt ? 'sheet.exportStepHintCaption' : 'sheet.exportStepHint', { n: String(indexes[0] + 1).padStart(2, '0') })
          : t(capt ? 'sheet.stepsHintFilesCaption' : 'sheet.stepsHintFiles', { list, n: indexes.length });
    };
    const field = h('input.input', {
      type: 'text', value: this.stepsText || '', 'data-key': 'exportSteps', spellcheck: 'false',
      title: t('sheet.stepsTip'),
      placeholder: t('sheet.stepsPlaceholder', { n: current + 1 }),
      oninput: () => { this.stepsText = field.value; update(); },
      onkeydown: (e) => { if (e.key === 'Enter') field.blur(); e.stopPropagation(); },
    });
    // where that text goes: under the drawing or beside it (shown when there is a text to place)
    const place = segmented([['below', t('sheet.captionsBelow')], ['beside', t('sheet.captionsBeside')]], this.s.export.stepCaptionPlace, (v) => { this.s.export.stepCaptionPlace = v; }, { title: t('sheet.captions'), 'data-key': 'stepCaptionPlace' });
    place.hidden = !this.s.export.stepCaption;
    const go = (kind) => this.cmd.exportStepRange(field.value, { mode: this.stepsMode || 'files', kind, dpi: this.dpi });
    const btn = (kind, label) => h('button.btn.btn-secondary.btn-sm', { 'data-export-steps': kind, onclick: () => go(kind) }, h('span', { html: icon('download', 14) }), label);
    update();
    return section(t('sheet.exportSteps'), h('div.form',
      row(t('sheet.stepsField'), field),
      segmented([['files', t('sheet.stepsFiles')], ['sheet', t('sheet.stepsSheet')]], this.stepsMode || 'files', (v) => { this.stepsMode = v; this.render(); }, { title: t('sheet.exportSteps') }),
      // each step in a file of its own: its size in pixels, of width or of height (a sheet takes the resolution above)
      (this.stepsMode || 'files') === 'files' ? this.#stepSize() : null,
      // each image with the number, title and text of its step under the drawing
      (this.stepsMode || 'files') === 'files' ? checkbox(t('sheet.stepsCaption'), this.s.export.stepCaption, (v) => { this.s.export.stepCaption = v; place.hidden = !v; update(); }, { 'data-key': 'stepCaption', title: t('sheet.stepsCaptionTip') }) : null,
      (this.stepsMode || 'files') === 'files' ? place : null,
      h('div.btn-row', btn('pdf', 'PDF'), btn('svg', 'SVG'), this.#pngGroup(btn('png', 'PNG'))),
      hint));
  }

  /** The size of the images of the steps exported on their own: pixels, of width or of height. */
  #stepSize() {
    const ex = this.s.export, z = ex.stepSize;
    // the number and what it measures, in one group: they are read together
    return h('div.size-group', { title: t('sheet.stepsSizeTip') },
      row(t('sheet.stepsSize'), numField({ value: z.px, unit: 'px', step: 100, min: 100, max: 20000, digits: 0, key: 'stepPx', title: t('sheet.stepsSizeTip'), onCommit: (v) => { ex.stepSize = { ...ex.stepSize, px: v }; } })),
      segmented([['w', t('sheet.sizeWidth')], ['h', t('sheet.sizeHeight')]], z.side, (v) => { ex.stepSize = { ...ex.stepSize, side: v }; }, { title: t('sheet.stepsSizeTip'), 'data-key': 'stepSide' }));
  }

  /** The PNG button with its switch right under it, in one group: a transparent background (no paper) or not. */
  #pngGroup(button) {
    const ex = this.s.export;
    return h('div.png-group', button,
      toggleSwitch(t('export.transparent'), ex.pngTransparent, (v) => { ex.pngTransparent = v; this.render(); }, { 'data-key': 'pngTransparent', title: t('export.transparentTip') }));
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
    clearTimeout(this.retry);
    // only a field being typed in holds the pane back (it is redrawn when the field is left); a button, a
    // switch or a list keeps the focus and is redrawn at once, so the pane always shows what was picked
    const active = document.activeElement;
    if (this.element.contains(active) && active.matches('input:not([type=checkbox]), textarea')) {
      this.retry = setTimeout(() => this.render(), 400);
      return;
    }
    const focusables = () => [...this.body.querySelectorAll('button, select, input, textarea')];
    const focused = this.element.contains(active) ? focusables().indexOf(active) : -1;
    this.#build();
    if (focused >= 0) focusables()[focused]?.focus({ preventScroll: true });
  }

  #build() {
    const sh = this.doc.project.sheet;
    const set = (fn) => this.cmd.setProject((p) => fn(p.sheet), 'sheet.set');
    const exp = (kind, label) => h('button.btn.btn-secondary.btn-sm', { 'data-export': kind, onclick: () => this.cmd.exportSheet(kind, { dpi: this.dpi }) }, h('span', { html: icon('download', 14) }), label);
    setChildren(this.body,
      section(t('sheet.texts'), h('div.form',
        h('label.form-label', t('sheet.title')), textField(sh.title, (v) => set((s) => { s.title = v; }), { placeholder: t('sheet.titlePlaceholder'), key: 'sheetTitle' }),
        h('label.form-label', t('sheet.subtitle')), textField(sh.subtitle, (v) => set((s) => { s.subtitle = v; }), { placeholder: t('sheet.subtitlePlaceholder'), key: 'sheetSubtitle' }),
        checkbox(t('sheet.showLegend'), sh.legend, (v) => set((s) => { s.legend = v; })),
        // where the legend goes, across the whole pane (three choices)
        sh.legend ? h('label.form-label', t('sheet.legendPlace')) : null,
        sh.legend ? segmented([['top', t('sheet.legendTop')], ['bottom', t('sheet.legendBottom')], ['free', t('sheet.legendFree'), t('sheet.legendFreeTip')]], sh.legendPlace || 'top', (v) => set((s) => { s.legendPlace = v; }), { title: t('sheet.legendPlace'), 'data-key': 'legendPlace' }) : null,
        sh.legend && sh.legendPlace === 'free' ? h('p.pane-hint', t('sheet.legendFreeHint')) : null,
        checkbox(t('sheet.northEach'), !!sh.northEach, (v) => set((s) => { s.northEach = v; }), { 'data-key': 'northEach', title: t('sheet.northEachTip') }),
        checkbox(t('sheet.showHeads'), sh.heads !== false, (v) => set((s) => { s.heads = v; }), { 'data-key': 'heads' }),
        checkbox(t('sheet.showTexts'), sh.texts, (v) => set((s) => { s.texts = v; })),
        toggleSwitch(t('sheet.terrainGrid'), sh.terrainGrid, (v) => set((s) => { s.terrainGrid = v; }), { 'data-key': 'terrainGrid', title: t('sheet.terrainGridTip') }))),
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
        // the columns of the grid: automatic (as many as make the drawings largest) or a number
        sh.layout === 'grid' ? row(t('sheet.cols'), selectField([[0, t('sheet.colsAuto')], ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => [n, String(n)])], sh.cols || 0, (v) => set((s) => { s.cols = Number(v); }), { 'data-key': 'cols' })) : null,
        row(t('sheet.paper'), selectField(Object.keys(PAPERS).map((k) => [k, `${k} · ${PAPERS[k][0]} × ${PAPERS[k][1]} mm`]), sh.paper, (v) => set((s) => { s.paper = v; }), { 'data-key': 'paper' })),
        segmented([['landscape', t('sheet.landscape')], ['portrait', t('sheet.portrait')]], sh.orientation, (v) => set((s) => { s.orientation = v; })),
        // the text of each step: under its drawing, beside it, or wherever the drawings come out larger
        sh.layout !== 'vertical' ? h('label.form-label', t('sheet.captions')) : null,
        sh.layout !== 'vertical' ? segmented([['auto', t('sheet.captionsAuto'), t('sheet.captionsAutoTip')], ['below', t('sheet.captionsBelow')], ['beside', t('sheet.captionsBeside')]], sh.captions || 'auto', (v) => set((s) => { s.captions = v; }), { title: t('sheet.captions'), 'data-key': 'captions' }) : null,
        sh.layout === 'vertical' ? h('p.pane-hint', t('sheet.verticalHint')) : null)),
      section(t('sheet.scale'), h('div.form',
        selectField(SHEET_SCALES.map((d) => [d, d ? `1:${d}` : t('sheet.scaleAuto')]), sh.scale, (v) => set((s) => { s.scale = Number(v); }), { 'data-key': 'scale' }),
        this.#scaleHint())),
      section(t('sheet.export'), h('div.form',
        h('div.btn-row', exp('pdf', 'PDF'), exp('svg', 'SVG'), this.#pngGroup(exp('png', 'PNG'))),
        row(t('sheet.pngDpi'), selectField([[150, '150 dpi'], [200, '200 dpi'], [300, '300 dpi']], this.dpi, (v) => { this.dpi = Number(v); })),
        h('p.pane-hint', t('sheet.exportHint')))),
      section(t('gif.title'), h('div.form',
        h('button.btn.btn-secondary.btn-sm.btn-block', { 'data-action': 'gif', onclick: () => this.cmd.exportGif() }, h('span', { html: icon('film', 14) }), t('gif.export')),
        h('p.pane-hint', t('gif.hint')))),
      this.#stepsSection(),
    );
  }
}

/**
 * The preview of the sheet: the pages one under the other, navigated like the drawing — the wheel zooms where
 * the mouse is, the middle or right button (or Space, or the left button on the paper) drags it around,
 * F / Ctrl+0 frames the page, Ctrl+ / Ctrl− zoom, and ← → (or the buttons in the corner) go from page to page.
 */
export class SheetView {
  static GAP = 24; // px between pages

  constructor(services) {
    this.s = services;
    this.doc = services.document;
    this.cam = null;   // { k: px per mm, x, y: where the top left of the first page is } — null: framed
    this.page = 0;     // the page in view
    this.paper = h('div.sheet-paper');
    this.zoomLabel = h('button.zoom-label', { title: t('zoom.reset'), 'data-zoom': 'label', onclick: () => this.fit() }, '100%');
    this.pageLabel = h('span.sheet-page-label', { 'data-page-label': '' });
    this.pager = h('div.zoom-box.sheet-pager', { role: 'group', 'aria-label': t('sheet.pages') },
      h('button.icon-button', { title: `${t('sheet.pagePrev')} (←)`, 'data-page-nav': 'prev', html: icon('prev', 14), onclick: () => this.goPage(this.page - 1) }),
      this.pageLabel,
      h('button.icon-button', { title: `${t('sheet.pageNext')} (→)`, 'data-page-nav': 'next', html: icon('next', 14), onclick: () => this.goPage(this.page + 1) }));
    this.wrap = h('div.sheet-wrap', { tabindex: '-1' }, this.paper,
      h('div.canvas-corner',
        this.pager,
        h('div.zoom-box', { role: 'group', 'aria-label': t('zoom.title') },
          h('button.icon-button', { title: t('zoom.out') + ' (Ctrl+−)', 'data-zoom': 'out', html: icon('minus', 14), onclick: () => this.zoomBy(1 / 1.25) }),
          this.zoomLabel,
          h('button.icon-button', { title: t('zoom.in') + ' (Ctrl++)', 'data-zoom': 'in', html: icon('plus', 14), onclick: () => this.zoomBy(1.25) })),
        h('button.icon-button', { title: t('sheet.fitPage') + ' (F)', 'data-zoom': 'fit', html: icon('fit', 16), onclick: () => this.fit() })));
    this.element = h('div.editor-view', { 'data-view': 'sheet' }, this.wrap);
    this.doc.onDidChange((e) => { if (e.kind !== 'selection' && e.kind !== 'file') this.#schedule(e.live ? 300 : 60); });
    services.layout.onDidChange((w) => { if (w === 'tab' && this.visible) this.render(); });
    new ResizeObserver(() => { if (this.visible) this.#place(); }).observe(this.wrap);
    this.#bindPointer();
  }

  get visible() { return this.s.layout.tab === 'sheet'; }
  get pages() { return this.paper.children.length; }

  #schedule(ms) {
    if (!this.visible) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.render(), ms);
  }

  render() {
    if (!this.visible) return;
    const { pages, width, height } = this.s.export.sheet();
    const changed = !this.size || this.size[0] !== width || this.size[1] !== height || pages.length !== this.pages;
    this.size = [width, height];
    // every page of the sheet, one under the other
    setChildren(this.paper, pages.map((svg, i) => {
      const page = h('div.sheet-page', { 'data-page': String(i + 1) });
      page.innerHTML = svg;
      return page;
    }));
    this.paper.classList.toggle('multi', pages.length > 1);
    // another paper, another orientation or another number of pages: framed again
    if (changed) { this.cam = null; this.page = Math.min(this.page, pages.length - 1); }
    this.#place();
  }

  /** The scale (px per mm) that shows a whole page. */
  #fitK() {
    const W = this.wrap.clientWidth - 56, H = this.wrap.clientHeight - 56;
    return Math.max(0.05, Math.min(W / this.size[0], H / this.size[1]));
  }

  /** The camera that frames page `i` at scale k (the page centred; a page taller than the view from its top). */
  #frame(i, k) {
    const vw = this.wrap.clientWidth, vh = this.wrap.clientHeight;
    const pw = this.size[0] * k, ph = this.size[1] * k;
    return { k, x: (vw - pw) / 2, y: (ph <= vh - 56 ? (vh - ph) / 2 : 28) - i * (ph + SheetView.GAP) };
  }

  #place() {
    if (!this.size || !this.wrap.clientWidth) return;
    const cam = this.cam || this.#frame(this.page, this.#fitK());
    const pw = this.size[0] * cam.k, ph = this.size[1] * cam.k;
    for (const page of this.paper.children) { page.style.width = `${pw}px`; page.style.height = `${ph}px`; }
    this.paper.style.gap = `${SheetView.GAP}px`;
    this.paper.style.transform = `translate(${cam.x}px, ${cam.y}px)`;
    this.zoomLabel.textContent = `${Math.round((cam.k / this.#fitK()) * 100)}%`;
    // the page in view: the one whose middle is nearest the middle of the view
    const n = this.pages;
    if (this.cam && n) {
      const mid = this.wrap.clientHeight / 2 - cam.y;
      this.page = Math.max(0, Math.min(n - 1, Math.round((mid - ph / 2) / (ph + SheetView.GAP))));
    }
    this.pager.hidden = n < 2;
    this.pageLabel.textContent = `${this.page + 1} / ${n}`;
    this.pager.querySelector('[data-page-nav=prev]').disabled = this.page <= 0;
    this.pager.querySelector('[data-page-nav=next]').disabled = this.page >= n - 1;
  }

  /** Frames the page in view (the whole page fits). */
  fit() { this.cam = null; this.#place(); }

  /** Goes to page `i`, keeping the zoom (framed when the view was framed). */
  goPage(i) {
    const n = this.pages;
    if (!n) return;
    this.page = Math.max(0, Math.min(n - 1, i));
    if (this.cam) this.cam = this.#frame(this.page, this.cam.k);
    this.#place();
  }

  zoomBy(f) { this.zoomAt(f, this.wrap.clientWidth / 2, this.wrap.clientHeight / 2); }

  /** Zooms by `f` keeping the point (cx, cy) of the view (px) where it is. */
  zoomAt(f, cx, cy) {
    if (!this.size) return;
    const cam = this.cam || this.#frame(this.page, this.#fitK());
    const fit = this.#fitK();
    const k = Math.max(fit * 0.2, Math.min(fit * 40, cam.k * f));
    this.cam = { k, x: cx - ((cx - cam.x) * k) / cam.k, y: cy - ((cy - cam.y) * k) / cam.k };
    this.#place();
  }

  panBy(dx, dy) {
    const cam = this.cam || this.#frame(this.page, this.#fitK());
    this.cam = { ...cam, x: cam.x + dx, y: cam.y + dy };
    this.#place();
  }

  /** Keys while the sheet is shown (nothing being typed): F frames, ← → go from page to page. */
  key(e) {
    const key = e.key.toLowerCase();
    if (key === 'f') { e.preventDefault(); this.fit(); return true; }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); this.goPage(this.page - 1); return true; }
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); this.goPage(this.page + 1); return true; }
    if (e.key === 'Home') { e.preventDefault(); this.goPage(0); return true; }
    if (e.key === 'End') { e.preventDefault(); this.goPage(this.pages - 1); return true; }
    return false;
  }

  /**
   * The legend let go after a drag of (dx, dy) pixels: it stays where it was put — free on the paper, its top
   * left corner kept as a fraction of the paper.
   */
  #dropLegend(el, dx, dy) {
    const k = (this.cam || this.#frame(this.page, this.#fitK())).k;
    const [W, H] = this.size;
    const s = Math.sqrt((W * H) / (420 * 297));
    el.removeAttribute('transform');
    const b = el.getBBox();
    // a free legend has a box under it (1.5 × s to the left of the items, 1 × s above them); the others start at their first symbol
    const free = el.dataset.free === '1';
    const x = b.x + (free ? 1.5 * s : 0) + dx / k, y = b.y + (free ? 1 * s : -0.8 * s) + dy / k;
    this.s.commands.setProject((p) => { p.sheet.legendPlace = 'free'; p.sheet.legendAt = [Math.min(1, Math.max(0, x / W)), Math.min(1, Math.max(0, y / H))]; }, 'sheet.set');
  }

  #bindPointer() {
    const wrap = this.wrap;
    const at = (e) => { const r = wrap.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    wrap.addEventListener('wheel', (e) => {
      e.preventDefault();
      const [x, y] = at(e);
      this.zoomAt(Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015)), x, y);
    }, { passive: false });
    let drag = null, lastMiddle = 0;
    wrap.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.canvas-corner')) return;
      if (e.button === 1) {
        // a double click of the middle button frames the page, as in the 3D viewer
        if (performance.now() - lastMiddle < 380) { lastMiddle = 0; e.preventDefault(); this.fit(); return; }
        lastMiddle = performance.now();
      }
      if (e.button > 2) return;
      e.preventDefault();
      // the legend is taken with the left button and put anywhere on the paper (it becomes free)
      const legend = e.button === 0 ? e.target.closest?.('.sheet-page[data-page="1"] #legend') : null;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, legend };
      wrap.setPointerCapture(e.pointerId);
      if (!legend) wrap.classList.add('panning');
    });
    wrap.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      if (drag.legend) {
        // while it is dragged it only slides (the sheet is drawn again when it is let go)
        const k = (this.cam || this.#frame(this.page, this.#fitK())).k;
        drag.legend.setAttribute('transform', `translate(${(e.clientX - drag.sx) / k} ${(e.clientY - drag.sy) / k})`);
        return;
      }
      this.panBy(e.clientX - drag.x, e.clientY - drag.y);
      drag.x = e.clientX; drag.y = e.clientY;
    });
    const end = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const d = drag;
      drag = null;
      wrap.classList.remove('panning');
      if (d.legend && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 2) this.#dropLegend(d.legend, (e.clientX - d.sx), (e.clientY - d.sy));
    };
    wrap.addEventListener('pointerup', end);
    wrap.addEventListener('pointercancel', end);
    wrap.addEventListener('contextmenu', (e) => e.preventDefault());
    wrap.addEventListener('dblclick', (e) => { if (!e.target.closest('.canvas-corner')) this.fit(); });
  }
}

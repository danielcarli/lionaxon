/*---------------------------------------------------------------------------------------------
 *  LionAxon — Copyright (C) 2026 LionAxon Team.
 *  Created and conceived by Daniel Michelon De Carli.
 *  Licensed under the GNU General Public License v3.0 or later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/
// Project (side bar): files, name, site (with its thickness), reference planes and their elevations,
// north (where it is drawn, in half tone or not), grid, drawing style and the corner the axonometry is
// seen from.
import { h, setChildren } from '../../../../base/browser/dom.js';
import { icon } from '../../../../base/browser/icons.js';
import { t } from '../../../../base/common/nls.js';
import { numField, segmented, selectField, checkbox, textField, row, section } from '../../../browser/widgets.js';
import { STYLES, STYLE_IDS } from '../../../services/render/common/styles.js';
import { GROUND_LEVEL, sunPosition } from '../../../services/model/common/model.js';
import { EXAMPLES } from '../../../services/document/browser/documentService.js';

export class ProjectPane {
  constructor(services) {
    this.s = services;
    this.doc = services.document;
    this.cmd = services.commands;
    this.body = h('div.pane-body');
    this.element = h('div.pane', { 'data-pane': 'project' }, h('div.pane-header', h('span.grow', t('activity.project'))), this.body);
    this.doc.onDidChange((e) => { if (!e.live && e.kind !== 'selection') this.render(); });
    this.render();
  }

  render() {
    // left alone while the person types in one of its fields
    if (this.element.contains(document.activeElement) && document.activeElement.matches('input:not([type=checkbox]), textarea')) {
      clearTimeout(this.retry);
      this.retry = setTimeout(() => this.render(), 400);
      return;
    }
    const p = this.doc.project;
    const set = (fn) => this.cmd.setProject(fn);
    const fileBtn = (ic, label, run, title) => h('button.btn.btn-secondary.btn-sm', { onclick: run, title: title || null }, h('span', { html: icon(ic, 14) }), label);
    const corner = ['se', 'ne', 'nw', 'sw'][(((Math.round((p.view.az + 45) / 90)) % 4) + 4) % 4];
    setChildren(this.body,
      section(t('project.files'), h('div.btn-row',
        fileBtn('newFile', t('file.new'), () => this.cmd.newProject(), 'Ctrl+N'),
        fileBtn('folderOpen', t('file.open'), () => this.cmd.open(), 'Ctrl+O'),
        fileBtn('save', t('file.save'), () => this.cmd.save(), 'Ctrl+S'),
        fileBtn('save', t('file.saveAs'), () => this.cmd.save(true), 'Ctrl+Shift+S')),
        h('div.form', { style: { marginTop: '8px' } }, row(t('menu.examples'), selectField([['', t('example.pick')], ...EXAMPLES.map((id) => [id, t('example.' + id)])], '',
          (v) => { if (v) this.cmd.example(v); }, { 'data-key': 'example' }))),
        h('p.pane-hint', this.doc.path ? t('project.savedAt', { path: this.doc.path }) : t('project.notSaved'))),
      section(t('project.name'), textField(p.name, (v) => set((pp) => { pp.name = v; }), { placeholder: t('project.namePlaceholder'), key: 'projectName' })),
      section(t('project.site'), h('div.form',
        h('div.form-grid', numField({ label: 'L', value: p.site.w, unit: 'm', step: 1, min: 1, title: t('prop.width'), onCommit: (v) => set((pp) => { pp.site.w = v; }) }),
          numField({ label: 'P', value: p.site.d, unit: 'm', step: 1, min: 1, title: t('prop.depth'), onCommit: (v) => set((pp) => { pp.site.d = v; }) })),
        segmented([['dashed', t('site.dashed')], ['fill', t('site.fill')], ['none', t('site.none')]], p.site.mode, (v) => set((pp) => { pp.site.mode = v; })),
        checkbox(t('site.dims'), p.site.dims, (v) => set((pp) => { pp.site.dims = v; })),
        row(t('site.thickness'), numField({ value: p.site.thickness, unit: 'm', step: 0.5, min: 0, max: 200, key: 'siteThickness', title: t('site.thicknessHint'), onCommit: (v) => set((pp) => { pp.site.thickness = v; }) })),
        h('p.pane-hint', t('site.thicknessHint')),
        h('div.btn-row',
          h('button.btn.btn-secondary.btn-sm', { 'data-action': 'site-draw', onclick: () => { this.s.layout.setTab('plan'); this.s.layout.setTool('site'); } }, h('span', { html: icon('poly', 14) }), t('site.draw')),
          p.site.pts ? h('button.btn.btn-secondary.btn-sm', { 'data-action': 'site-rect', onclick: () => this.cmd.setSiteOutline(null) }, t('site.rect')) : null),
        h('p.pane-hint', p.site.pts ? t('site.outlineHint', { n: p.site.pts.length }) : t('site.drawHint')),
        row(t('project.grid'), selectField([0.5, 1, 2.5, 5].map((g) => [g, `${String(g).replace('.', t('number.decimal'))} m`]), p.grid, (v) => set((pp) => { pp.grid = Number(v); }))))),
      this.#levelsSection(p),
      this.#underlaySection(p, set),
      this.#sunSection(p, set),
      section(t('project.north'), h('div.form',
        row(t('north.angle'), numField({ value: p.north, unit: '°', step: 15, key: 'north', onCommit: (v) => set((pp) => { pp.north = ((v % 360) + 360) % 360; }) })),
        segmented([['header', t('north.header'), t('north.headerTip')], ['drawing', t('north.drawing'), t('north.drawingTip')], ['none', t('north.none')]],
          p.northPlace, (v) => set((pp) => { pp.northPlace = v; }), { title: t('north.place') }),
        checkbox(t('north.halftone'), p.northHalftone, (v) => set((pp) => { pp.northHalftone = v; })),
        h('p.pane-hint', t('north.hint')))),
      section(t('project.style'), h('div.style-list', { style: { display: 'grid', gap: '6px' } },
        STYLE_IDS.flatMap((id, i) => [i === 3 ? h('label.form-label', { style: { marginTop: '6px' } }, t('project.pastels')) : null, (() => {
          const st = STYLES[id];
          return h('button.btn.btn-secondary', {
            style: { justifyContent: 'flex-start', height: '34px', ...(p.style === id ? { borderColor: 'var(--accent)', boxShadow: '0 0 0 1px var(--accent)' } : {}) },
            'data-style': id, onclick: () => set((pp) => { pp.style = id; }),
          },
          h('span', { style: { display: 'inline-flex', gap: '2px' } }, [st.volume, st.accent, st.ground, st.edge].map((c) => h('span', { style: { width: '12px', height: '18px', borderRadius: '3px', background: c, border: '1px solid rgba(0,0,0,.12)' } }))),
          h('span', t('style.' + id)));
        })()])),
        h('p.pane-hint', t('project.styleHint'))),
      section(t('project.view'), h('div.form',
        h('div.btn-row',
          h('button.btn.btn-secondary.btn-sm', { onclick: () => this.cmd.rotateView(-1) }, h('span', { html: icon('rotateLeft', 14) }), t('drawing.rotateLeftShort')),
          h('button.btn.btn-secondary.btn-sm', { onclick: () => this.cmd.rotateView(1) }, h('span', { html: icon('rotateRight', 14) }), t('drawing.rotateRightShort'))),
        h('p.pane-hint', t('project.viewFrom', { corner: t('corner.' + corner) })))),
    );
  }

  /** An image under the drawing: a site plan or an aerial photo, placed and sized in metres. */
  #underlaySection(p, set) {
    const u = p.underlay;
    const field = (label, key, extra = {}) => numField({ label, value: u[key], unit: extra.unit ?? 'm', step: extra.step ?? 1, min: extra.min, max: extra.max, key: 'underlay-' + key, title: extra.title,
      onCommit: (v) => set((pp) => { if (key === 'w') { pp.underlay.h = Math.round((pp.underlay.h / pp.underlay.w) * v * 1000) / 1000; } pp.underlay[key] = v; }) });
    return section.closed(t('underlay.title'), h('div.form',
      h('div.btn-row',
        h('button.btn.btn-secondary.btn-sm', { 'data-action': 'underlay-pick', onclick: () => this.cmd.pickUnderlay() }, h('span', { html: icon('image', 14) }), u ? t('underlay.change') : t('underlay.pick')),
        u ? h('button.btn.btn-secondary.btn-sm', { 'data-action': 'underlay-remove', onclick: () => set((pp) => { pp.underlay = null; }) }, h('span', { html: icon('trash', 14) }), t('underlay.remove')) : null),
      u ? [
        h('div.form-grid', field('L', 'w', { min: 0.5, title: t('underlay.width') }), field('↻', 'rot', { unit: '°', step: 5, title: t('prop.rotation') }), field('X', 'x'), field('Y', 'y')),
        row(t('underlay.opacity'), numField({ value: Math.round(u.opacity * 100), unit: '%', step: 10, min: 5, max: 100, digits: 0, key: 'underlay-opacity', onCommit: (v) => set((pp) => { pp.underlay.opacity = v / 100; }) })),
        checkbox(t('underlay.sheet'), u.sheet, (v) => set((pp) => { pp.underlay.sheet = v; }), { 'data-key': 'underlay-sheet' }),
      ] : null,
      h('p.pane-hint', t('underlay.hint'))));
  }

  /** The sun: where it is (latitude, day, hour) and the shadows it casts on the ground. */
  #sunSection(p, set) {
    const sun = p.sun;
    const pos = sunPosition(sun);
    const months = Array.from({ length: 12 }, (_, i) => [i + 1, new Intl.DateTimeFormat(document.documentElement.lang || 'en', { month: 'long' }).format(new Date(2026, i, 1))]);
    return section.closed(t('sun.title'), h('div.form',
      checkbox(t('sun.shadows'), sun.on, (v) => set((pp) => { pp.sun.on = v; }), { 'data-key': 'sun-on' }),
      sun.on ? [
        row(t('sun.latitude'), numField({ value: sun.lat, unit: '°', step: 1, min: -89, max: 89, key: 'sun-lat', title: t('sun.latitudeHint'), onCommit: (v) => set((pp) => { pp.sun.lat = v; }) })),
        row(t('sun.date'), h('div.form-grid', { style: { gridTemplateColumns: '0.8fr 1.4fr' } },
          numField({ value: sun.day, unit: '', step: 1, min: 1, max: 31, digits: 0, key: 'sun-day', onCommit: (v) => set((pp) => { pp.sun.day = Math.round(v); }) }),
          selectField(months, sun.month, (v) => set((pp) => { pp.sun.month = Number(v); }), { 'data-key': 'sun-month' }))),
        row(t('sun.hour'), numField({ value: sun.hour, unit: 'h', step: 0.5, min: 0, max: 24, key: 'sun-hour', title: t('sun.hourHint'), onCommit: (v) => set((pp) => { pp.sun.hour = v; }) })),
        row(t('sun.strength'), numField({ value: Math.round(sun.opacity * 100), unit: '%', step: 5, min: 5, max: 80, digits: 0, key: 'sun-opacity', onCommit: (v) => set((pp) => { pp.sun.opacity = v / 100; }) })),
        h('p.pane-hint', { 'data-key': 'sun-pos' }, pos.altitude < 2 ? t('sun.down') : t('sun.position', { alt: Math.round(pos.altitude), az: Math.round(pos.azimuth) })),
      ] : null,
      h('p.pane-hint', t('sun.hint'))));
  }

  /** Reference planes: name and elevation of each; objects drawn on a plane follow its elevation. */
  #levelsSection(p) {
    const levels = [...p.levels].sort((a, b) => b.z - a.z);
    return section(t('level.title'), h('div.form',
      h('div.level-list', levels.map((l) => h('div.level-row', { 'data-level': l.id, class: l.id === this.doc.activeLevel ? 'level-row active' : 'level-row' },
        h('button.level-dot', { title: t('level.makeActive'), 'aria-label': t('level.makeActive'), onclick: () => this.doc.setActiveLevel(l.id) }),
        textField(l.name, (v) => this.cmd.setLevel(l.id, { name: v }), { placeholder: l.id === GROUND_LEVEL ? t('level.ground') : t('level.unnamed'), key: 'levelName' }),
        numField({ value: l.z, unit: 'm', step: 0.5, key: 'levelZ', title: t('level.elevation'), onCommit: (v) => this.cmd.setLevel(l.id, { z: v }) }),
        l.id === GROUND_LEVEL
          ? h('span.level-fixed', { title: t('level.groundFixed') })
          : h('button.icon-button', { title: t('level.remove'), 'aria-label': t('level.remove'), html: icon('trash', 14), onclick: () => this.cmd.removeLevel(l.id) })))),
      h('button.btn.btn-secondary.btn-sm', { onclick: () => this.cmd.addLevel() }, h('span', { html: icon('plus', 14) }), t('level.add')),
      h('p.pane-hint', t('level.hint'))));
  }
}

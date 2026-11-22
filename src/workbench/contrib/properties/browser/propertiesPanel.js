/*---------------------------------------------------------------------------------------------
 *  LionAxon — Copyright (C) 2026 LionAxon Team.
 *  Created and conceived by Daniel Michelon De Carli.
 *  Licensed under the GNU General Public License v3.0 or later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/
// Properties panel (right): shape, measures, reference plane, floors, category and state of the selection;
// with nothing selected, the title and text of the current step and the list of everything in it, by type
// (the way to reach a ghost volume, a hidden cut or anything hard to click). Values are typed in metres
// and applied on Enter.
import { h, setChildren } from '../../../../base/browser/dom.js';
import { icon } from '../../../../base/browser/icons.js';
import { t, tn } from '../../../../base/common/nls.js';
import { numField, segmented, selectField, checkbox, textField, row, section } from '../../../browser/widgets.js';
import { indexById, baseOf, elevationOf, slopeEnds, heightOf, formatElevation, SHAPES, LABEL_FONT_IDS, GROUND_LEVEL, ROOFS, AREA_KINDS, TREE_KINDS, STEP_OPS, OPENING_KINDS, OPENING_SIDES, LABEL_MARKS } from '../../../services/model/common/model.js';
import { getStyle } from '../../../services/render/common/styles.js';
import { LABEL_FONTS } from '../../../services/render/common/fonts.js';
import { levelName } from '../../drawing/browser/drawingView.js';

export class PropertiesPanel {
  constructor(services) {
    this.s = services;
    this.doc = services.document;
    this.cmd = services.commands;
    this.body = h('div.pane-body');
    this.title = h('span.grow');
    this.element = h('aside.part.properties', { 'aria-label': t('props.title') },
      h('div.pane-header', this.title,
        h('button.icon-button', { title: t('props.hide'), html: icon('panel', 15), onclick: () => services.layout.toggleProperties() })),
      this.body);
    this.doc.onDidChange((e) => {
      if (e.kind === 'file') return;
      if (e.live) { this.pending = true; return; }
      this.render();
    });
    this.element.addEventListener('focusout', () => setTimeout(() => { if (this.pending && !this.element.contains(document.activeElement)) this.render(); }, 0));
    services.layout.onDidChange((w) => { if (w === 'properties') this.element.hidden = !services.layout.propertiesVisible; });
    this.render();
  }

  /** Puts the cursor in a field (e.g. the text of a new label). */
  focus(key) {
    this.render(true);
    const el = this.body.querySelector(`[data-key="${key}"]`);
    if (el) { el.focus(); el.select?.(); }
  }

  render(force = false) {
    // while the person types in a field of the panel it is left alone; a click on a button updates it at once
    if (!force && this.element.contains(document.activeElement) && document.activeElement.matches('input:not([type=checkbox]), textarea, select')) { this.pending = true; return; }
    this.pending = false;
    const sel = this.doc.selected();
    if (!sel.length) { this.title.textContent = t('props.step'); setChildren(this.body, this.#stepForm()); return; }
    if (sel.length > 1) { this.title.textContent = tn('props.many', sel.length); setChildren(this.body, this.#multiForm(sel)); return; }
    const o = sel[0];
    this.title.textContent = t('object.' + o.type);
    const forms = {
      volume: () => this.#volumeForm(o), cut: () => this.#cutForm(o), platform: () => this.#platformForm(o), slope: () => this.#slopeForm(o),
      arrow: () => this.#arrowForm(o), person: () => this.#personForm(o), label: () => this.#labelForm(o),
      area: () => this.#areaForm(o), tree: () => this.#treeForm(o), dim: () => this.#dimForm(o), opening: () => this.#openingForm(o),
    };
    setChildren(this.body, this.#nameField(o), forms[o.type](), this.#actions());
  }

  set(props) { this.cmd.setProps(props); }

  #num(label, key, o, extra = {}) {
    return numField({ label, value: o[key], unit: extra.unit ?? 'm', step: extra.step ?? this.doc.project.grid, key, title: extra.title, min: extra.min, max: extra.max, digits: extra.digits, disabled: extra.disabled, onCommit: (v) => this.set({ [key]: v }) });
  }

  /** A colour of its own (or none): a colour well and a button that takes it away. */
  #colorRow(label, key, o, fallback) {
    const well = h('input.color-well', { type: 'color', value: o[key] || fallback, 'data-key': key, title: label, onchange: () => this.set({ [key]: well.value }) });
    return row(label, h('div.color-row', well,
      o[key] ? h('button.btn.btn-ghost.btn-sm', { 'data-action': `clear-${key}`, onclick: () => this.set({ [key]: null }) }, t('color.none')) : h('span.pane-hint', t('color.unset'))));
  }

  /** A name of its own for the object (shown in the lists instead of "Box 3"), and its lock and eye. */
  #nameField(o) {
    if (o.type === 'label') return null;
    return h('div.name-row',
      textField(o.name || '', (v) => this.set({ name: v }), { placeholder: elementName(o, this.doc, true), key: 'name' }),
      h('button.icon-button', { class: o.locked ? 'icon-button on' : 'icon-button', title: o.locked ? t('edit.unlock') : t('edit.lock'), 'aria-pressed': String(!!o.locked), html: icon(o.locked ? 'lock' : 'unlock', 15), onclick: () => this.cmd.setProps({ locked: !o.locked }, [o.id]) }),
      h('button.icon-button', { class: o.hidden ? 'icon-button on' : 'icon-button', title: o.hidden ? t('edit.show') : t('edit.hide'), 'aria-pressed': String(!!o.hidden), html: icon(o.hidden ? 'eyeOff' : 'eye', 15), onclick: () => this.cmd.setProps({ hidden: !o.hidden }, [o.id]) }));
  }

  #stepForm() {
    const step = this.doc.step;
    const n = String(this.doc.stepIndex + 1).padStart(2, '0');
    return [
      section(`${t('sheet.step')} ${n}`, h('div.form',
        h('label.form-label', t('step.title')),
        textField(step.title, (v) => this.cmd.setStepProps({ title: v }), { placeholder: t('step.titlePlaceholder'), key: 'stepTitle' }),
        h('label.form-label', t('step.text')),
        textField(step.text, (v) => this.cmd.setStepProps({ text: v }), { placeholder: t('step.textPlaceholder'), multiline: true, key: 'stepText' }),
        checkbox(t('step.highlight'), step.highlight, (v) => this.cmd.setStepProps({ highlight: v })),
        h('p.pane-hint', this.doc.stepIndex === 0 ? t('step.highlightFirst') : t('step.highlightHint')),
        this.doc.stepIndex > 0 ? [
          checkbox(t('step.ghostPrev'), !!step.ghostPrev, (v) => this.cmd.setStepProps({ ghostPrev: v }), { 'data-key': 'ghostPrev' }),
          h('p.pane-hint', t('step.ghostPrevHint')),
          row(t('step.op'), segmented(STEP_OPS.map((op) => [op, op || '—']), step.op || '', (v) => this.cmd.setStepProps({ op: v }), { title: t('step.opHint') })),
          h('p.pane-hint', t('step.opHint')),
        ] : null)),
      section.closed(t('explode.title'), h('div.form',
        checkbox(t('explode.on'), !!step.explode?.on, (v) => this.cmd.setStepProps({ explode: { ...step.explode, on: v } }), { 'data-key': 'explode' }),
        step.explode?.on ? [
          row(t('explode.gap'), numField({ value: step.explode.gap, unit: 'm', step: 0.5, min: 0.5, max: 100, key: 'explodeGap', onCommit: (v) => this.cmd.setStepProps({ explode: { ...step.explode, gap: v } }) })),
          checkbox(t('explode.floors'), step.explode.floors, (v) => this.cmd.setStepProps({ explode: { ...step.explode, floors: v } }), { 'data-key': 'explodeFloors' }),
        ] : null,
        h('p.pane-hint', t('explode.hint')))),
      // the angles the step is seen from on the sheet (set in the 3D viewer)
      section.closed(t('orbit.title'), h('div.form',
        h('p.pane-hint', { 'data-key': 'angles' }, step.views?.length
          ? tn('orbit.summaryN', step.views.length, { list: step.views.map((a) => `${Math.round(a.az)}°/${Math.round(a.el)}°`).join(' · ') })
          : t('orbit.summary0')),
        h('div.btn-row',
          h('button.btn.btn-secondary.btn-sm', { 'data-action': 'open-3d', onclick: () => this.s.layout.setTab('orbit') }, h('span', { html: icon('orbit', 14) }), t('orbit.open')),
          step.views?.length ? h('button.btn.btn-secondary.btn-sm', { onclick: () => this.cmd.resetStepAngles() }, t('orbit.reset')) : null))),
      this.#elementList(),
      section.closed(t('props.shortcuts'), h('dl.shortcut-list',
        ...[['V B S G', t('props.sc.tools')], ['A P T', t('props.sc.tools2')], ['Del', t('props.sc.delete')], ['Ctrl+D', t('props.sc.duplicate')],
          ['R', t('props.sc.rotate')], [t('props.sc.arrowsKey'), t('props.sc.arrows')], ['F', t('props.sc.fit')], ['PgUp PgDn', t('props.sc.steps')]]
          .flatMap(([k, v]) => [h('dt', h('kbd', k)), h('dd', v)]))),
    ];
  }

  #categorySelect(value) {
    const cats = this.doc.project.categories;
    return selectField([['', t('props.noCategory')], ...cats.map((c) => [c.id, c.name || '—']), ['__new', t('props.newCategory')]], value || '', (v) => {
      if (v === '__new') {
        const cat = this.cmd.addCategory();
        this.set({ cat: cat.id });
        this.s.layout.setActivity('categories');
      } else this.set({ cat: v || null });
    });
  }

  #stateField(value) {
    return h('div.state-field', this.#stateButtons(value));
  }

  #stateButtons(value) {
    return segmented([
      ['normal', t('state.normal'), t('state.normalTip')], ['accent', t('state.accent'), t('state.accentTip')],
      ['ghost', t('state.ghost'), t('state.ghostTip')], ['glass', t('state.glass'), t('state.glassTip')],
      ['context', t('state.context'), t('state.contextTip')],
    ], value, (v) => this.set({ state: v }));
  }

  /** The reference plane an object belongs to (it follows the plane when its elevation changes). */
  #levelRow(o, key = 'level', label = t('level.plane')) {
    const levels = this.doc.project.levels;
    return row(label, selectField(levels.map((l) => [l.id, levelName(l)]), o[key] || GROUND_LEVEL, (v) => this.set({ [key]: v }), { 'data-key': key }));
  }

  #volumeForm(o) {
    const byId = indexById(this.doc.objects);
    const others = this.doc.objects.filter((v) => v.type === 'volume' && v.id !== o.id && !sitsOn(v, o.id, byId));
    const sphere = o.shape === 'sphere', pointed = o.shape === 'cone' || o.shape === 'pyramid';
    const base = baseOf(o, byId, this.doc.project.levels);
    let series = { count: 2, gap: 2, axis: 'w' };
    return [
      section(t('prop.shape'), segmented(SHAPES.map((sh) => [sh, h('span', { html: icon(sh, 16) }), t('shape.' + sh)]), o.shape,
        (v) => this.set(v === 'sphere' ? { shape: v, d: o.w } : { shape: v }), { title: t('prop.shape') })),
      section(t('props.position'), h('div.form-grid',
        this.#num('X', 'x', o), this.#num('Y', 'y', o),
        sphere ? null : this.#num('↻', 'rot', o, { unit: '°', step: 15, title: t('prop.rotation') }),
        this.#num('Z', 'z', o, { disabled: !!o.on, title: o.on ? t('prop.zStacked', { z: fmtZ(base) }) : t('prop.zOnPlane') })),
      h('div.form', { style: { marginTop: '6px' } },
        o.on ? null : this.#levelRow(o),
        row(t('prop.on'), selectField([['', t('prop.ground')], ...others.map((v) => [v.id, volumeName(v, this.doc)])], o.on || '', (v) => this.set({ on: v || null }))),
        h('p.pane-hint', t('prop.baseAt', { z: fmtElev(base), top: fmtElev(base + heightOf(o)) })))),
      section(t('props.size'), sphere
        ? h('div.form-grid', numField({ label: 'Ø', value: o.w, unit: 'm', step: this.doc.project.grid, min: 0.1, key: 'w', title: t('prop.diameter'), onCommit: (v) => this.set({ w: v, d: v }) }))
        : o.shape === 'poly'
          ? [h('div.form-grid', this.#num(t('prop.heightShort'), 'h', o, { min: 0.1, step: 0.5, title: t('prop.height') })), h('p.pane-hint', t('poly.hint', { n: o.pts.length, w: fmtZ(o.w), d: fmtZ(o.d) }))]
          : h('div.form-grid.three',
            this.#num(t('prop.widthShort'), 'w', o, { min: 0.1, title: t('prop.width') }), this.#num(t('prop.depthShort'), 'd', o, { min: 0.1, title: t('prop.depth') }), this.#num(t('prop.heightShort'), 'h', o, { min: 0.1, step: 0.5, title: t('prop.height') })),
      sphere || pointed ? null : h('div.form', { style: { marginTop: '8px' } }, row(t('prop.floors'), numField({ value: o.floors, unit: '', step: 1, min: 1, max: 200, digits: 0, key: 'floors', onCommit: (v) => this.set({ floors: Math.round(v) }) })),
        h('p.pane-hint', t('prop.floorHeight', { h: fmtZ(o.h / o.floors) })))),
      o.shape === 'box' ? section(t('roof.title'), h('div.form',
        segmented(ROOFS.map((r) => [r, t('roof.' + r)]), o.roof || 'flat', (v) => this.set({ roof: v }), { title: t('roof.title') }),
        o.roof ? row(t('roof.height'), numField({ value: o.roofH, unit: 'm', step: 0.5, min: 0.1, max: 200, key: 'roofH', onCommit: (v) => this.set({ roofH: v }) })) : null,
        o.roof && o.roof !== 'hip' ? row(t('roof.ridge'), segmented([['auto', t('roof.ridgeAuto')], ['w', t('roof.ridgeW')], ['d', t('roof.ridgeD')]], o.roofDir || 'auto', (v) => this.set({ roofDir: v }), { title: t('roof.ridge') })) : null,
        o.roof ? this.#colorRow(t('roof.color'), 'roofColor', o, '#8e3a34') : null,
        o.roof ? h('p.pane-hint', t('roof.hint')) : null)) : null,
      o.shape === 'box' ? section(t('opening.title'), h('div.form',
        h('div.opening-add', OPENING_KINDS.map((k) => h('button.btn.btn-secondary.btn-sm', { 'data-action': `opening-${k}`, title: t('opening.addTip'), onclick: () => this.cmd.addOpening(k, this.#facingSide(o)) }, t('opening.' + k)))),
        h('p.pane-hint', t('opening.hint')))) : null,
      section(t('props.look'), h('div.form', row(t('prop.category'), this.#categorySelect(o.cat)), this.#stateField(o.state),
        this.#colorRow(t('prop.ownColor'), 'color', o, '#cfc3ad'),
        o.state === 'ghost' ? h('p.pane-hint', t('state.ghostHint')) : null,
        o.state === 'context' ? h('p.pane-hint', t('state.contextHint')) : null)),
      section(t('props.series'), h('div.form',
        h('div.form-grid.three', { style: { gridTemplateColumns: '1fr 1fr 1.25fr' } },
          numField({ label: '×', value: series.count, unit: '', step: 1, min: 1, max: 50, digits: 0, title: t('series.count'), onCommit: (v) => { series.count = Math.round(v); } }),
          numField({ label: '↔', value: series.gap, unit: 'm', step: 0.5, min: 0, title: t('series.gap'), onCommit: (v) => { series.gap = v; } }),
          selectField([['w', t('series.alongWidth')], ['d', t('series.alongDepth')]], 'w', (v) => { series.axis = v; })),
        h('button.btn.btn-secondary.btn-sm', { onclick: () => this.cmd.duplicateSeries(series.count, series.gap, series.axis) }, h('span', { html: icon('copy', 14) }), t('series.go')),
        h('p.pane-hint', t('series.hint')))),
    ];
  }

  /** The wall of a box that faces the person in the axonometric view (the one a new opening goes to). */
  #facingSide(v) {
    const az = (this.doc.project.view.az * Math.PI) / 180;
    const cam = [Math.cos(az), Math.sin(az)];
    const a = (v.rot * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a);
    const normals = { front: [0, -1], right: [1, 0], back: [0, 1], left: [-1, 0] };
    let best = 'front', most = -Infinity;
    for (const side of OPENING_SIDES) {
      const [nx, ny] = normals[side];
      const d = (nx * c - ny * sn) * cam[0] + (nx * sn + ny * c) * cam[1];
      if (d > most + 1e-9) { most = d; best = side; }
    }
    return best;
  }

  #openingForm(o) {
    const v = this.doc.byId(o.on);
    const len = v ? (o.side === 'front' || o.side === 'back' ? v.w : v.d) : 0;
    return [
      h('p.pane-hint', { style: { margin: '2px 0 8px' } }, v ? t('opening.explain', { name: volumeName(v, this.doc) }) : t('opening.orphan')),
      section(t('opening.kind'), segmented(OPENING_KINDS.map((k) => [k, t('opening.' + k)]), o.kind, (k) => this.set({ kind: k }), { title: t('opening.kind') })),
      section(t('opening.wall'), h('div.form',
        segmented(OPENING_SIDES.map((sd) => [sd, t('opening.side.' + sd)]), o.side, (sd) => this.set({ side: sd }), { title: t('opening.wall') }),
        h('div.form-grid',
          this.#num('↔', 'u', o, { step: 0.5, title: t('opening.along') }),
          this.#num('Z', 'z', o, { step: 0.25, min: 0, title: t('opening.sill') })),
        v ? h('p.pane-hint', t('opening.alongHint', { len: fmtZ(len) })) : null)),
      section(t('props.size'), h('div.form-grid',
        this.#num(t('prop.widthShort'), 'w', o, { min: 0.1, step: 0.25, title: t('prop.width') }),
        o.kind === 'oculus' ? null : this.#num(t('prop.heightShort'), 'h', o, { min: 0.1, step: 0.25, title: t('prop.height') }))),
    ];
  }

  #cutForm(o) {
    const vols = this.doc.objects.filter((v) => v.type === 'volume');
    const lz = elevationOf(this.doc.project.levels, o.level);
    const sphere = o.shape === 'sphere';
    return [
      h('p.pane-hint', { style: { margin: '2px 0 8px' } }, t('cut.explain')),
      section(t('prop.shape'), segmented(SHAPES.map((sh) => [sh, h('span', { html: icon(sh, 16) }), t('shape.' + sh)]), o.shape,
        (v) => this.set(v === 'sphere' ? { shape: v, d: o.w, h: o.w } : { shape: v }), { title: t('prop.shape') }),
        o.shape === 'cone' || o.shape === 'pyramid' || sphere ? h('p.pane-hint', t('cut.shapeHint')) : null),
      section(t('props.position'), h('div.form-grid', this.#num('X', 'x', o), this.#num('Y', 'y', o), sphere ? null : this.#num('↻', 'rot', o, { unit: '°', step: 15, title: t('prop.rotation') }))),
      section(t('props.size'), sphere
        ? h('div.form-grid', numField({ label: 'Ø', value: o.w, unit: 'm', step: this.doc.project.grid, min: 0.1, key: 'w', title: t('prop.diameter'), onCommit: (v) => this.set({ w: v, d: v, h: v }) }))
        : o.shape === 'poly' ? h('p.pane-hint', t('poly.hint', { n: o.pts.length, w: fmtZ(o.w), d: fmtZ(o.d) }))
          : h('div.form-grid', this.#num(t('prop.widthShort'), 'w', o, { min: 0.1, title: t('prop.width') }), this.#num(t('prop.depthShort'), 'd', o, { min: 0.1, title: t('prop.depth') }))),
      section(t('cut.heights'), h('div.form-grid', this.#num(t('cut.fromShort'), 'z', o, { step: 0.5, title: t('cut.from') }), sphere ? null : this.#num(t('cut.heightShort'), 'h', o, { min: 0.1, step: 0.5, title: t('cut.height') })),
        h('div.form', { style: { marginTop: '6px' } }, this.#levelRow(o)),
        h('p.pane-hint', t('cut.range', { from: fmtElev(lz + o.z), to: fmtElev(lz + o.z + o.h) }))),
      section(t('cut.target'), selectField([['', t('cut.allTouched')], ...vols.map((v) => [v.id, volumeName(v, this.doc)])], o.target || '', (v) => this.set({ target: v || null }))),
    ];
  }

  #platformForm(o) {
    const top = elevationOf(this.doc.project.levels, o.level) + o.z;
    return [
      h('p.pane-hint', { style: { margin: '2px 0 8px' } }, t('platform.explain')),
      section(t('props.position'), h('div.form-grid', this.#num('X', 'x', o), this.#num('Y', 'y', o), this.#num('↻', 'rot', o, { unit: '°', step: 15, title: t('prop.rotation') }))),
      section(t('props.size'), h('div.form-grid', this.#num(t('prop.widthShort'), 'w', o, { min: 0.1, title: t('prop.width') }), this.#num(t('prop.depthShort'), 'd', o, { min: 0.1, title: t('prop.depth') }))),
      section(t('platform.height'), h('div.form',
        this.#levelRow(o),
        row(t('prop.zOnPlane'), numField({ value: o.z, unit: 'm', step: 0.5, key: 'z', onCommit: (v) => this.set({ z: v }) })),
        h('p.pane-hint', t('platform.at', { z: fmtElev(top) })))),
    ];
  }

  #slopeForm(o) {
    const [zA, zB] = slopeEnds(o, this.doc.project.levels);
    const end = (lk, zk, label) => h('div.form', { style: { marginBottom: '8px' } },
      h('label.form-label', label),
      this.#levelRow(o, lk),
      row(t('prop.zOnPlane'), numField({ value: o[zk], unit: 'm', step: 0.5, key: zk, onCommit: (v) => this.set({ [zk]: v }) })));
    const run = Math.abs(zB - zA) > 1e-6 ? Math.abs(zB - zA) / o.d : 0;
    return [
      h('p.pane-hint', { style: { margin: '2px 0 8px' } }, t('slope.explain')),
      section(t('props.position'), h('div.form-grid', this.#num('X', 'x', o), this.#num('Y', 'y', o), this.#num('↻', 'rot', o, { unit: '°', step: 15, title: t('prop.rotation') }))),
      section(t('props.size'), h('div.form-grid', this.#num(t('prop.widthShort'), 'w', o, { min: 0.1, title: t('prop.width') }), this.#num(t('slope.lengthShort'), 'd', o, { min: 0.1, title: t('slope.length') }))),
      section(t('slope.ends'), end('from', 'zFrom', t('slope.from', { z: fmtElev(zA) })), end('to', 'zTo', t('slope.to', { z: fmtElev(zB) })),
        h('p.pane-hint', t('slope.grade', { p: fmtZ(run * 100), a: fmtZ((Math.atan(run) * 180) / Math.PI) }))),
      h('div.btn-row', h('button.btn.btn-secondary.btn-sm', { onclick: () => this.set({ from: o.to, zFrom: o.zTo, to: o.from, zTo: o.zFrom }) }, t('slope.flip'))),
    ];
  }

  #areaForm(o) {
    return [
      h('p.pane-hint', { style: { margin: '2px 0 8px' } }, t('area.explain')),
      section(t('area.kind'), segmented(AREA_KINDS.map((k) => [k, t('area.' + k)]), o.kind, (v) => { this.s.layout.areaKind = v; this.set({ kind: v }); })),
      section(t('props.position'), h('div.form-grid', this.#num('X', 'x', o), this.#num('Y', 'y', o), this.#num('↻', 'rot', o, { unit: '°', step: 15, title: t('prop.rotation') }),
        this.#num('Z', 'z', o, { step: 0.5, title: t('prop.zOnPlane') })),
        h('div.form', { style: { marginTop: '6px' } }, this.#levelRow(o))),
      section(t('props.size'), h('div.form-grid', this.#num(t('prop.widthShort'), 'w', o, { min: 0.1, title: t('prop.width') }), this.#num(t('prop.depthShort'), 'd', o, { min: 0.1, title: t('prop.depth') })),
        h('div.form', { style: { marginTop: '8px' } }, row(t('area.joints'), numField({ value: o.joints || 0, unit: 'm', step: 0.5, min: 0, max: 100, key: 'joints', onCommit: (v) => this.set({ joints: v }) })),
          h('p.pane-hint', t('area.jointsHint')))),
    ];
  }

  #treeForm(o) {
    return [
      section(t('tree.kind'), segmented(TREE_KINDS.map((k) => [k, t('tree.' + k)]), o.kind, (v) => this.set({ kind: v }))),
      section(t('props.size'), h('div.form-grid', this.#num('Ø', 'size', o, { min: 0.5, step: 0.5, title: t('tree.size') }), this.#num(t('prop.heightShort'), 'h', o, { min: 1, step: 0.5, title: t('prop.height') }))),
      section(t('props.position'), h('div.form-grid.three', this.#num('X', 'x', o), this.#num('Y', 'y', o), this.#num('Z', 'z', o, { step: 0.5, title: t('prop.zOnPlane') })),
        h('div.form', { style: { marginTop: '6px' } }, this.#levelRow(o))),
    ];
  }

  #dimForm(o) {
    return [
      h('p.pane-hint', { style: { margin: '2px 0 8px' } }, t('dim.length', { len: fmtZ(Math.hypot(o.x2 - o.x1, o.y2 - o.y1)) })),
      section(t('arrow.ends'), h('div.form-grid', this.#num('X₁', 'x1', o), this.#num('Y₁', 'y1', o), this.#num('X₂', 'x2', o), this.#num('Y₂', 'y2', o)),
        h('div.form-grid', { style: { marginTop: '6px' } }, this.#num('Z', 'z', o, { step: 0.25, title: t('arrow.height') }), this.#num('↕', 'offset', o, { step: 0.5, title: t('dim.offset') })),
        h('div.form', { style: { marginTop: '6px' } }, this.#levelRow(o)),
        h('p.pane-hint', t('dim.hint'))),
    ];
  }

  #arrowForm(o) {
    const style = getStyle(this.doc.project.style);
    const colors = [['ink', style.ink, t('color.ink')], ['accent', style.accent, t('color.accent')], ['green', style.green, t('color.green')], ['blue', style.blue, t('color.blue')], ['red', style.red, t('color.red')],
      ...this.doc.project.categories.map((c) => [c.id, c.color, c.name])];
    return [
      section(t('arrow.ends'), h('div.form-grid', this.#num('X₁', 'x1', o), this.#num('Y₁', 'y1', o), this.#num('X₂', 'x2', o), this.#num('Y₂', 'y2', o)),
        h('div.form-grid', { style: { marginTop: '6px' } }, this.#num('Z', 'z', o, { step: 0.25, title: t('arrow.height') }), this.#num('⌒', 'bend', o, { step: 0.5, title: t('arrow.bend') }),
          numField({ label: 'Z₂', value: o.z2 ?? o.z, unit: 'm', step: 0.25, key: 'z2', title: t('arrow.heightEnd'), onCommit: (v) => this.set({ z2: v }) })),
        h('div.form', { style: { marginTop: '6px' } }, this.#levelRow(o))),
      section(t('arrow.look'), h('div.form',
        h('div.swatches', colors.map(([id, c, name]) => h('button.swatch-btn', { class: o.color === id ? 'swatch-btn active' : 'swatch-btn', title: name, style: { background: c }, onclick: () => this.set({ color: id }) }))),
        h('p.pane-hint', t('arrow.colorHint')),
        checkbox(t('arrow.dashed'), o.dashed, (v) => this.set({ dashed: v })),
        row(t('arrow.heads'), segmented([[0, '—'], [1, '→'], [2, '↔']], o.heads, (v) => this.set({ heads: v }))),
        row(t('arrow.width'), numField({ value: o.width, unit: 'm', step: 0.05, min: 0.05, max: 3, onCommit: (v) => this.set({ width: v }) })),
        row(t('arrow.layer'), segmented([['top', t('arrow.layerTop')], ['ground', t('arrow.layerGround')]], o.layer, (v) => this.set({ layer: v }))))),
    ];
  }

  #personForm(o) {
    return [
      section(t('props.position'), h('div.form-grid.three', this.#num('X', 'x', o), this.#num('Y', 'y', o), this.#num('Z', 'z', o, { step: 0.5, title: t('prop.zOnPlane') })),
        h('div.form', { style: { marginTop: '6px' } }, this.#levelRow(o))),
      section(t('person.pose'), segmented([[0, t('person.pose0')], [1, t('person.pose1')], [2, t('person.pose2')], [3, h('span', { html: icon('wheelchair', 16) }), t('person.pose3')]],
        o.pose, (v) => this.set({ pose: v }))),
      h('p.pane-hint', t('person.hint')),
    ];
  }

  #labelForm(o) {
    return [
      section(t('label.text'), textField(o.text, (v) => this.set({ text: v }), { multiline: true, key: 'text', placeholder: t('label.default') }),
        h('p.pane-hint', t('label.textHint')),
        h('div.form', { style: { marginTop: '8px' } },
          textField(o.note || '', (v) => this.set({ note: v }), { multiline: true, key: 'note', placeholder: t('label.notePlaceholder') }),
          row(t('label.mark'), segmented(LABEL_MARKS.map((m) => [m, m || '—']), o.mark || '', (m) => this.set({ mark: m }), { title: t('label.markTip') })))),
      section(t('label.font'), h('div.form',
        selectField(LABEL_FONT_IDS.map((id) => [id, LABEL_FONTS[id].name]), o.font, (v) => this.set({ font: v }), { 'data-key': 'font' }),
        h('div.font-sample', { style: { fontFamily: LABEL_FONTS[o.font]?.family, fontWeight: LABEL_FONTS[o.font]?.weight } }, o.caps ? (o.text || t('label.default')).split('\n')[0].toUpperCase() : (o.text || t('label.default')).split('\n')[0]),
        checkbox(t('label.caps'), o.caps, (v) => this.set({ caps: v })),
        row(t('label.size'), numField({ value: o.size, unit: 'm', step: 0.1, min: 0.2, max: 20, onCommit: (v) => this.set({ size: v }) })))),
      section(t('label.anchor'), h('div.form-grid.three', this.#num('X', 'x', o), this.#num('Y', 'y', o), this.#num('Z', 'z', o, { step: 0.5, title: t('prop.zOnPlane') })),
        h('div.form', { style: { marginTop: '6px' } }, this.#levelRow(o))),
      section(t('label.offset'), h('div.form-grid', this.#num('dX', 'dx', o, { step: 1 }), this.#num('dY', 'dy', o, { step: 1 }))),
    ];
  }

  /** Everything in the current step, grouped by type; a click selects (ghosts and hidden cuts included). */
  #elementList() {
    const objs = this.doc.objects;
    if (!objs.length) return section(t('elements.title'), h('p.pane-hint', t('elements.empty')));
    const groups = [
      ['volume', 'box', objs.filter((o) => o.type === 'volume')],
      ['cut', 'cut', objs.filter((o) => o.type === 'cut')],
      ['terrain', 'terrain', objs.filter((o) => o.type === 'platform' || o.type === 'slope' || o.type === 'area')],
      ['arrow', 'arrow', objs.filter((o) => o.type === 'arrow')],
      ['dim', 'dim', objs.filter((o) => o.type === 'dim')],
      ['opening', 'door', objs.filter((o) => o.type === 'opening')],
      ['person', 'person', objs.filter((o) => o.type === 'person')],
      ['tree', 'tree', objs.filter((o) => o.type === 'tree')],
      ['label', 'text', objs.filter((o) => o.type === 'label')],
    ].filter(([, , list]) => list.length);
    return section(t('elements.title'), h('div.element-list', groups.map(([type, ic, list]) => h('div.element-group',
      h('div.element-group-head', h('span', { html: icon(ic, 14) }), t('elements.' + type), h('span.element-count', String(list.length))),
      list.map((o) => {
        const tag = o.type === 'volume' && o.state !== 'normal' ? t('state.' + o.state) : null;
        const ic = o.type === 'volume' || (o.type === 'cut' && o.shape !== 'box') ? o.shape : null;
        const hover = (id) => { for (const v of ['axon', 'plan', 'elev']) this.s.views?.[v]?.setListHover(id); };
        const toggle = (key, on, onIcon, offIcon, onTip, offTip) => h('button.icon-button.element-toggle', {
          class: `icon-button element-toggle${on ? ' on' : ''}`, 'data-toggle': key, title: on ? onTip : offTip, 'aria-pressed': String(on), html: icon(on ? onIcon : offIcon, 13),
          onclick: (e) => { e.stopPropagation(); this.cmd.setProps({ [key]: !on }, [o.id]); },
        });
        return h('div.element-row', {
          class: `element-row${this.doc.selection.has(o.id) ? ' selected' : ''}${o.hidden ? ' is-hidden' : ''}`,
          onmouseenter: () => hover(o.id), onmouseleave: () => hover(null),
        },
        h('button.element-item', {
          'data-element': o.id, title: t('elements.selectHint'),
          onclick: (e) => this.doc.select([o.id], { add: e.shiftKey || e.ctrlKey || e.metaKey }),
          ondblclick: () => this.focus('name'),
        }, ic ? h('span.element-icon', { html: icon(ic, 13) }) : null,
          h('span.element-name', elementName(o, this.doc)), tag ? h('span.element-tag', tag) : null),
        toggle('locked', !!o.locked, 'lock', 'unlock', t('edit.unlock'), t('edit.lock')),
        toggle('hidden', !!o.hidden, 'eyeOff', 'eye', t('edit.show'), t('edit.hide')));
      })))));
  }

  #multiForm(sel) {
    const vols = sel.filter((o) => o.type === 'volume');
    const same = (k) => (vols.every((v) => v[k] === vols[0][k]) ? vols[0][k] : null);
    const al = (how, label) => h('button.btn.btn-secondary.btn-sm', { 'data-align': how, onclick: () => this.cmd.alignSelection(how) }, label);
    return [
      section(t('align.title'), h('div.form',
        h('div.align-grid', al('left', t('align.leftShort')), al('centerX', t('align.centerXShort')), al('right', t('align.rightShort')),
          al('top', t('align.topShort')), al('centerY', t('align.centerYShort')), al('bottom', t('align.bottomShort'))),
        h('div.btn-row',
          h('button.btn.btn-secondary.btn-sm', { 'data-distribute': 'x', disabled: sel.length < 3, onclick: () => this.cmd.distributeSelection('x') }, t('align.distributeX')),
          h('button.btn.btn-secondary.btn-sm', { 'data-distribute': 'y', disabled: sel.length < 3, onclick: () => this.cmd.distributeSelection('y') }, t('align.distributeY'))),
        h('p.pane-hint', t('align.hint')))),
      vols.length ? section(t('props.look'), h('div.form', row(t('prop.category'), this.#categorySelect(same('cat'))), this.#stateField(same('state')),
        row(t('prop.floors'), numField({ value: same('floors') ?? 1, unit: '', step: 1, min: 1, max: 200, digits: 0, onCommit: (v) => this.cmd.setProps({ floors: Math.round(v) }, vols.map((x) => x.id)) })))) : null,
      this.#actions(),
    ];
  }

  #actions() {
    return section(null, h('div.btn-row',
      h('button.btn.btn-secondary.btn-sm', { onclick: () => this.cmd.duplicateSelection(), title: 'Ctrl+D' }, h('span', { html: icon('copy', 14) }), t('props.duplicate')),
      h('button.btn.btn-secondary.btn-sm', { onclick: () => this.cmd.deleteSelection(), title: 'Delete' }, h('span', { html: icon('trash', 14) }), t('props.delete'))),
      // the same object lives in every step: carry what was changed here to the steps that follow
      this.doc.stepIndex < this.doc.project.steps.length - 1 ? h('div.form', { style: { marginTop: '8px' } },
        h('button.btn.btn-secondary.btn-sm.btn-block', { 'data-action': 'propagate', onclick: () => this.cmd.applyToFollowing() }, h('span', { html: icon('next', 14) }), t('propagate.apply')),
        h('p.pane-hint', t('propagate.hint'))) : null);
  }
}

const fmtZ = (v) => new Intl.NumberFormat(document.documentElement.lang || 'en', { maximumFractionDigits: 2 }).format(v);
const fmtElev = (z) => formatElevation(z, (n) => fmtZ(n));

function sitsOn(v, id, byId, guard = 0) {
  if (!v.on || guard > 50) return false;
  if (v.on === id) return true;
  const below = byId.get(v.on);
  return below ? sitsOn(below, id, byId, guard + 1) : false;
}

/** A readable name for a volume in lists: its category (if any), its size and its position in the list. */
export function volumeName(v, doc) {
  if (v.name) return v.name;
  const i = doc.objects.filter((o) => o.type === 'volume').indexOf(v) + 1;
  const cat = doc.project.categories.find((c) => c.id === v.cat)?.name;
  const nf = (x) => fmtZ(x);
  const size = v.shape === 'sphere' ? `Ø ${nf(v.w)}` : `${nf(v.w)} × ${nf(v.d)} × ${nf(v.h)}`;
  return `${t('shape.' + (v.shape || 'box'))} ${i}${cat ? ' · ' + cat : ''} (${size})`;
}

/** A readable name for any object in the element list. */
export function elementName(o, doc, generic = false) {
  if (o.name && !generic) return o.name;
  const levels = doc.project.levels;
  const ground = (x) => x.type === 'platform' || x.type === 'slope' || x.type === 'area';
  const same = doc.objects.filter((x) => x.type === o.type || (ground(o) && ground(x)));
  const i = same.indexOf(o) + 1;
  switch (o.type) {
    case 'volume': {
      const cat = doc.project.categories.find((c) => c.id === o.cat)?.name;
      const size = o.shape === 'sphere' ? `Ø ${fmtZ(o.w)}` : `${fmtZ(o.w)} × ${fmtZ(o.d)} × ${fmtZ(o.h)}`;
      return `${t('shape.' + o.shape)} ${i}${cat ? ' · ' + cat : ''} · ${size}`;
    }
    case 'cut': {
      const v = o.target && doc.byId(o.target);
      return `${t('object.cut')} ${i}${o.shape !== 'box' ? ' (' + t('shape.' + o.shape).toLowerCase() + ')' : ''} · ${v ? volumeName(v, doc).split(' (')[0] : t('cut.allTouched')}`;
    }
    case 'platform': return `${t('object.platform')} ${i} · ${fmtElev(elevationOf(levels, o.level) + o.z)}`;
    case 'slope': { const [a, b] = slopeEnds(o, levels); return `${t('object.slope')} ${i} · ${fmtElev(a)} → ${fmtElev(b)}`; }
    case 'arrow': return `${t('object.arrow')} ${i} · ${fmtZ(Math.hypot(o.x2 - o.x1, o.y2 - o.y1))} m`;
    case 'dim': return `${t('object.dim')} ${i} · ${fmtZ(Math.hypot(o.x2 - o.x1, o.y2 - o.y1))} m`;
    case 'area': return `${t('area.' + o.kind)} ${i} · ${fmtZ(o.w)} × ${fmtZ(o.d)}`;
    case 'tree': return `${t('object.tree')} ${i} · ${t('tree.' + o.kind)}`;
    case 'person': return `${t('object.person')} ${i} · ${t('person.pose' + o.pose)}`;
    case 'label': return (o.text || t('label.default')).split('\n')[0];
    case 'opening': return t('opening.' + o.kind);
    default: return o.id;
  }
}

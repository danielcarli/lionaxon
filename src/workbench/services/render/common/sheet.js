/*---------------------------------------------------------------------------------------------
 *  LionAxon — Copyright (C) 2026 LionAxon Team.
 *  Created and conceived by Daniel Michelon De Carli.
 *  Licensed under the GNU General Public License v3.0 or later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/
// The sheet: every step in a row, a column or a grid, all at the same scale, with the title, the legend
// (only the categories in use), the number, title and text of each step, and a north arrow. A step seen
// from several angles (set in the 3D viewer) shows its drawings side by side, under one caption.
// Units are millimetres of paper; each drawing is a nested <svg> whose viewBox is the drawing in metres.
import { makeView, project } from '../../../../base/common/geometry/projection.js';
import { bboxUnion } from '../../../../base/common/geometry/polygon.js';
import { PAPERS, usedCategories, stepAngles } from '../../model/common/model.js';
import { renderStep, padBox, FONT, hatchPattern, PATTERN_COUNT } from './renderer.js';
import { getStyle } from './styles.js';

const r2 = (v) => Math.round(v * 100) / 100;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const EDGE_MM = 0.2;

export function paperSize(sheet) {
  const [w, h] = PAPERS[sheet.paper] || PAPERS.A3;
  return sheet.orientation === 'portrait' ? [h, w] : [w, h];
}

/** Splits a text into lines of at most `max` characters, on spaces. */
export function wrap(text, max) {
  const out = [];
  for (const para of String(text || '').split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      if (!line) line = word;
      else if ((line + ' ' + word).length <= max) line += ' ' + word;
      else { out.push(line); line = word; }
    }
    if (line) out.push(line);
  }
  return out;
}

/** Rows and columns of the grid of steps (before a chosen scale makes it reflow). */
export function gridOf(sheet, n) {
  if (sheet.layout === 'column' || sheet.layout === 'vertical') return { cols: 1, rows: n };
  if (sheet.layout === 'grid') {
    const cols = Math.max(1, Math.min(n, sheet.cols || Math.ceil(Math.sqrt(n))));
    return { cols, rows: Math.ceil(n / cols) };
  }
  return { cols: n, rows: 1 };
}

/** The usual scales of a parti diagram (1:n). */
export const SCALES = [100, 200, 250, 500, 750, 1000, 1250, 2000, 2500, 5000];

/**
 * A north arrow centred at (cx, cy), radius r: the direction of north as it falls on the paper in `view`.
 */
function northGlyph(view, north, cx, cy, r, { ink, muted, halftone, s, id = '' }) {
  const a = (north * Math.PI) / 180;
  const p0 = project(view, [0, 0, 0]), p1 = project(view, [-Math.sin(a), Math.cos(a), 0]);
  let dx = p1[0] - p0[0], dy = p1[1] - p0[1];
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) { dx = 0; dy = -1; } else { dx /= len; dy /= len; } // seen from the side: straight up
  const tip = [cx + dx * r * 0.8, cy + dy * r * 0.8];
  const back = [cx - dx * r * 0.55, cy - dy * r * 0.55];
  const side = (k) => [back[0] - dy * r * 0.4 * k - dx * r * 0.1, back[1] + dx * r * 0.4 * k - dy * r * 0.1];
  const nPos = [cx + dx * r * 1.55, cy + dy * r * 1.55];
  return `<g${id ? ` id="${id}"` : ''}${halftone ? ' opacity="0.55"' : ''}><circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(r)}" fill="none" stroke="${muted}" stroke-width="${r2(0.25 * s * (r / (5.5 * s)))}"/>`
    + `<path d="M${r2(tip[0])} ${r2(tip[1])}L${r2(side(1)[0])} ${r2(side(1)[1])}L${r2(back[0] + dx * r * 0.2)} ${r2(back[1] + dy * r * 0.2)}L${r2(side(-1)[0])} ${r2(side(-1)[1])}Z" fill="${ink}"/>`
    + `<text x="${r2(nPos[0])}" y="${r2(nPos[1])}" font-size="${r2(3.2 * s * (r / (5.5 * s)))}" font-weight="700" fill="${ink}" text-anchor="middle" dominant-baseline="central">N</text></g>`;
}

const angleKey = (a) => `${a.az}|${a.el}`;

/** Millimetres of paper per metre measured along the axes of the axonometry (the scale of the drawing). */
const axisFactor = (view) => {
  const a = project(view, [0, 0, 0]), b = project(view, [1, 0, 0]);
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
};

/**
 * Builds the sheet: one or more pages of the chosen paper.
 * With the scale on "auto" every step fits on one page; with a chosen scale (1:500…) the drawings keep that
 * scale and the steps go on as many pages as they need.
 * @param {object} prj the project
 * @param {{ t: (key: string) => string, fmt?: (n: number) => string, fontCss?: string, only?: number, steps?: number[] }} opts
 *   `only` renders a single step on the sheet (used by "export this step"); `steps` a sheet of some steps only.
 * @returns {{ svg: string, pages: string[], width: number, height: number, scale: number, fixed: boolean,
 *   overflow: boolean, stacked: boolean, largestFit: number|null }} width and height in millimetres; `scale` is the 1:n of the
 *   drawings; `overflow` when a chosen scale is too large for the paper; `stacked` when (vertical layout) the
 *   text went under the drawings for lack of width; `largestFit` the largest usual scale that fits
 */
export function renderSheet(prj, opts) {
  const { t } = opts;
  const style = getStyle(prj.style);
  const sheet = prj.sheet;
  const [W, H] = paperSize(sheet);
  const s = Math.sqrt((W * H) / (420 * 297));
  const m = 14 * s;
  // every step, one alone (`only`, a drawing with nothing around it), or some of them (`steps`: a sheet of
  // just those, laid out like the whole one)
  const indexes = opts.only != null ? [opts.only] : (opts.steps?.length ? opts.steps.filter((i) => i >= 0 && i < prj.steps.length) : prj.steps.map((_, i) => i));
  // the angles of each step (one, or several side by side); every drawing of one angle shares its framing
  const angles = new Map(indexes.map((i) => [i, stepAngles(prj, prj.steps[i]).map((a) => ({ key: angleKey(a), view: makeView(a.az, a.el) }))]));
  const keys = new Set([...angles.values()].flat().map((a) => a.key));
  const uniform = keys.size === 1;
  // the view the scale and the north of the header are taken from: the common angle, or the project's
  const view = uniform ? [...angles.values()][0][0].view : makeView(prj.view.az);
  const axis = axisFactor(view);
  const fixed = sheet.scale > 0 && opts.only == null;
  const vertical = sheet.layout === 'vertical';
  const K = Math.max(...indexes.map((i) => angles.get(i).length)); // the most angles of one step

  // the same scale for every step: the union of their bounds, per angle; the slots take the largest
  const boxes = new Map();
  const highlighted = [];
  for (const i of indexes) {
    angles.get(i).forEach(({ key, view: v }, j) => {
      const r = renderStep(prj, i, { view: v, lw: 0.1, fmt: opts.fmt, terrainGrid: !!sheet.terrainGrid });
      boxes.set(key, bboxUnion(boxes.get(key) || null, r.bbox));
      if (j === 0 && r.highlighted.length) highlighted.push(i);
    });
  }
  for (const [k, b] of boxes) boxes.set(k, padBox(b, 0.03));
  const bw = Math.max(...[...boxes.values()].map((b) => b[2] - b[0]));
  const bh = Math.max(...[...boxes.values()].map((b) => b[3] - b[1]));
  const ink = prj.northHalftone ? style.muted : style.ink;

  // ---- what takes room beside the steps: a column of text blocks on the right, the legend along the foot
  const blocks = opts.only == null ? (sheet.blocks || []) : [];
  const panelW = blocks.length ? Math.min(Math.max(62 * s, (W - 2 * m) * 0.24), 110 * s) : 0;
  const Wc = panelW ? W - panelW - 9 * s : W;      // the right edge of what is laid out (plus the margin)
  const legendBelow = sheet.legendPlace === 'bottom' && sheet.legend;
  // ---- header (every page: title and subtitle; the first page: also the legend and the north arrow)
  const legendItems = [];
  if (sheet.legend) {
    for (const u of usedCategories(prj)) {
      legendItems.push({ color: u.cat.color, name: u.cat.name, arrow: u.arrow && !u.volume, hatch: prj.catPatterns && u.volume ? prj.categories.indexOf(u.cat) % PATTERN_COUNT : null });
    }
    if (highlighted.length && opts.only == null) legendItems.push({ color: style.accent, name: t('legend.changed'), arrow: false });
  }
  /** The legend from (left, y): a column, or a row that wraps at `right`. Returns its markup and the y after it. */
  const legendFlow = (left, right, y, inRow) => {
    let legend = '';
    let x = left;
    for (const it of legendItems) {
      const label = it.name.toUpperCase();
      const wItem = 8 * s + label.length * 3.1 * s * 0.62 + 6 * s;
      if (inRow && x > left && x + wItem > right) { x = left; y += 6 * s; }
      const sym = it.arrow
        ? `<path d="M${r2(x)} ${r2(y - 1.3 * s)}h${r2(5 * s)}M${r2(x + 3.6 * s)} ${r2(y - 2.4 * s)}l${r2(1.4 * s)} ${r2(1.1 * s)}M${r2(x + 5 * s)} ${r2(y + 0.9 * s)}h${r2(-5 * s)}M${r2(x + 1.4 * s)} ${r2(y - 0.2 * s)}l${r2(-1.4 * s)} ${r2(1.1 * s)}" stroke="${it.color}" stroke-width="${r2(0.45 * s)}" fill="none" stroke-linecap="round"/>`
        : `<rect x="${r2(x)}" y="${r2(y - 2.6 * s)}" width="${r2(5 * s)}" height="${r2(4 * s)}" fill="${it.color}"/>`
          + (it.hatch != null ? `<defs>${hatchPattern(`lx-leg${it.hatch}`, it.hatch, 1.5 * s, 0.14 * s, style.edge)}</defs><rect x="${r2(x)}" y="${r2(y - 2.6 * s)}" width="${r2(5 * s)}" height="${r2(4 * s)}" fill="url(#lx-leg${it.hatch})" stroke="${style.edge}" stroke-width="${r2(0.12 * s)}"/>` : '');
      legend += sym + `<text x="${r2(x + 8 * s)}" y="${r2(y)}" font-size="${r2(3.1 * s)}" letter-spacing="${r2(0.2 * s)}" fill="${style.text}" dominant-baseline="central" dy="${r2(-0.4 * s)}">${esc(label)}</text>`;
      if (inRow) x += wItem; else y += 6 * s;
    }
    return { markup: `<g id="legend">${legend}</g>`, y: inRow ? y + 6 * s : y };
  };
  // the legend along the foot takes as many rows as it needs
  const legendRows = legendBelow && legendItems.length ? Math.round((legendFlow(m, W - m, 0, true).y) / (6 * s)) : 0;
  const Hc = H - (legendRows ? legendRows * 6 * s + 4 * s : 0);
  const header = (first) => {
    let y = m;
    const left = m;
    let out = '';
    if (sheet.title) {
      y += 9 * s;
      out += `<text x="${r2(left)}" y="${r2(y)}" font-size="${r2(10 * s)}" font-weight="700" letter-spacing="${r2(0.5 * s)}" fill="${style.text}">${esc(sheet.title.toUpperCase())}</text>`;
    }
    if (sheet.subtitle) {
      y += (sheet.title ? 8 : 5) * s;
      out += `<text x="${r2(left)}" y="${r2(y)}" font-size="${r2(4.2 * s)}" font-weight="500" letter-spacing="${r2(0.4 * s)}" fill="${style.muted}">${esc(sheet.subtitle.toUpperCase())}</text>`;
      y += 3.2 * s;
      out += `<path d="M${r2(left)} ${r2(y)}h${r2(24 * s)}" stroke="${style.caption}" stroke-width="${r2(0.45 * s)}"/>`;
    }
    // north arrow, top right: the direction of north in this axonometric view (or drawn in the drawings
    // themselves, flat on the ground, when the project asks for it); the scale under it
    // (with steps seen from different angles, each drawing has its own small north instead)
    if (prj.northPlace === 'header' && first && uniform) {
      const r = 5.5 * s;
      out += northGlyph(view, prj.north, Wc - m - r, m + r, r, { ink, muted: style.muted, halftone: prj.northHalftone, s, id: 'north' });
    }
    out = `<g id="cabecalho">${out}</g>`;
    // legend: a column under the subtitle (a row across the page for the vertical layout), unless it goes to the foot
    if (first && legendItems.length && !legendBelow) {
      y += 7 * s;
      const l = legendFlow(left, Wc - m, y, vertical);
      out += l.markup;
      y = l.y + (vertical ? -3 * s : -3 * s);
    }
    return { markup: out, top: y > m ? y + 10 * s : m };
  };

  // ---- captions: number, rule, title, text
  const fs = 3 * s;
  // the number and title of each step (they can be left out: the drawings alone, or with their text only)
  const heads = sheet.heads !== false;
  const captionLines = (step, width) => (sheet.texts && step.text ? wrap(step.text, Math.max(12, Math.floor((width * 0.98) / (fs * 0.5)))) : []);
  const captionHeight = (step, width) => {
    const n = captionLines(step, width).length;
    const head = heads ? 11.6 * s + (step.title ? 6.2 * s : 0) : 0;
    return head + (n ? (heads ? 6 * s : 3 * s) + (n - 1) * fs * 1.4 + 2 * s : 0);
  };
  const noCaptions = !heads && !(sheet.texts && indexes.some((i) => prj.steps[i].text));
  const caption = (step, num, x, y, width, room, rule = Math.min(width, 60 * s)) => {
    let g = '';
    let cy = y + (heads ? 9 * s : -3 * s);
    if (heads) {
      g += `<text x="${r2(x)}" y="${r2(cy)}" font-size="${r2(5.5 * s)}" font-weight="500" fill="${style.caption}">${num}</text>`;
      cy += 2.6 * s;
      g += `<path d="M${r2(x)} ${r2(cy)}h${r2(rule)}" stroke="${style.caption}" stroke-width="${r2(0.3 * s)}"/>`;
      if (step.title) {
        cy += 6.2 * s;
        g += `<text x="${r2(x)}" y="${r2(cy)}" font-size="${r2(3.3 * s)}" font-weight="600" letter-spacing="${r2(0.25 * s)}" fill="${style.text}">${esc(step.title.toUpperCase())}</text>`;
      }
    }
    const lines = captionLines(step, width);
    const fit = Math.max(1, Math.floor((y + room - cy - 2 * s) / (fs * 1.4)));
    lines.slice(0, fit).forEach((line, i) => {
      g += `<text x="${r2(x)}" y="${r2(cy + 6 * s + i * fs * 1.4)}" font-size="${r2(fs)}" fill="${style.muted}">${esc(line)}</text>`;
    });
    return g;
  };
  /** The sign of a step (+, −, =, →), drawn between it and the step before, centred at (x, y). */
  const opSign = (stepIndex, x, y, size = 9 * s) => {
    const op = prj.steps[stepIndex].op;
    if (!op || stepIndex === indexes[0] || opts.only != null) return '';
    return `<text class="op" x="${r2(x)}" y="${r2(y)}" font-size="${r2(size)}" font-weight="500" fill="${style.caption}" text-anchor="middle" dominant-baseline="central">${esc(op)}</text>`;
  };
  const stepGroup = (stepIndex, inner) => {
    const step = prj.steps[stepIndex];
    const num = String(stepIndex + 1).padStart(2, '0');
    const name = `${t('sheet.step')} ${num}${step.title ? ' — ' + step.title : ''}`;
    return `<g id="step-${num}" inkscape:groupmode="layer" inkscape:label="${esc(name)}">${inner}</g>`;
  };
  /**
   * The drawings of a step from left to right, from (x, y): each in a slot `slotW` wide and bh tall
   * (the drawing centred in it), `gap` between slots.
   */
  const drawings = (stepIndex, x, y, scale, slotW, gap) => angles.get(stepIndex).map(({ key, view: v }, j) => {
    const box = boxes.get(key);
    const w = box[2] - box[0], hh = box[3] - box[1];
    const sx = x + j * (slotW + gap), dx = sx + (slotW - w * scale) / 2, dy = y + ((bh - hh) * scale) / 2;
    const { markup } = renderStep(prj, stepIndex, { view: v, lw: EDGE_MM / scale, fmt: opts.fmt, terrainGrid: !!sheet.terrainGrid });
    let g = `<svg x="${r2(dx)}" y="${r2(dy)}" width="${r2(w * scale)}" height="${r2(hh * scale)}" viewBox="${r2(box[0])} ${r2(box[1])} ${r2(w)} ${r2(hh)}" overflow="visible">${markup}</svg>`;
    if (!uniform && prj.northPlace === 'header') {
      const r = 3.2 * s;
      g += northGlyph(v, prj.north, sx + slotW - r, y + r, r, { ink, muted: style.muted, halftone: prj.northHalftone, s });
    }
    return g;
  }).join('');
  /** Width of the drawings of a step, side by side. */
  const groupW = (stepIndex, slotW, gap) => { const k = angles.get(stepIndex).length; return k * slotW + (k - 1) * gap; };

  const footerH = 8 * s;
  const firstTop = header(true).top;
  const nextTop = header(false).top;
  const pages = []; // each: array of markup pieces
  let stacked = false;
  let scale; // mm of paper per drawing unit
  let overflow = false;
  let fitWidth; // the widest a drawing may be (mm)

  if (vertical) {
    // ---- vertical: one step under the other, the drawing on the left, its caption on the right
    // no captions at all: the drawings take the whole width
    const capW = noCaptions ? 0 : Math.max(46 * s, (Wc - 2 * m) * 0.3);
    const gap = noCaptions ? 0 : 8 * s, rowGap = 7 * s, gapIn = 6 * s;
    const drawW = Wc - 2 * m - capW - gap;
    fitWidth = drawW;
    const capH = indexes.map((i) => captionHeight(prj.steps[i], capW));
    if (fixed) scale = 1000 / sheet.scale / axis;
    else {
      // the largest scale that fits every step on one page
      const room = Hc - m - footerH - firstTop - (indexes.length - 1) * rowGap;
      scale = Math.min((drawW - (K - 1) * gapIn) / (K * bw), Math.max(4 * s, room / indexes.length) / bh);
      for (let k = 0; k < 30; k++) { // rows taller than the drawing (long captions) take room too
        const total = indexes.reduce((sum, _, j) => sum + Math.max(bh * scale, capH[j]), 0) + (indexes.length - 1) * rowGap;
        if (total <= Hc - m - footerH - firstTop + 1e-6) break;
        scale *= 0.97;
      }
    }
    // a drawing too wide to share the line with its caption takes the whole width, the caption under it
    const widest = K * bw * scale + (K - 1) * gapIn;
    stacked = fixed && widest > drawW + 1e-6;
    overflow = fixed && widest > Wc - 2 * m + 1e-6;
    const dw = bw * scale, dh = bh * scale;
    let page = [], y = firstTop;
    if (stacked) {
      const fullW = Wc - 2 * m;
      const capHs = indexes.map((i) => captionHeight(prj.steps[i], Math.min(fullW, 110 * s)));
      indexes.forEach((stepIndex, j) => {
        const rowH = dh + capHs[j];
        if (page.length && y + rowH > Hc - m - footerH + 1e-6) { pages.push(page); page = []; y = nextTop; }
        const num = String(stepIndex + 1).padStart(2, '0');
        let g = drawings(stepIndex, m + Math.max(0, (fullW - groupW(stepIndex, dw, gapIn)) / 2), y, scale, dw, gapIn);
        g += caption(prj.steps[stepIndex], num, m, y + dh, Math.min(fullW, 110 * s), capHs[j]);
        page.push(stepGroup(stepIndex, g));
        y += rowH + rowGap;
      });
      pages.push(page);
    } else indexes.forEach((stepIndex, j) => {
      const rowH = Math.max(dh, capH[j]);
      if (page.length && y + rowH > Hc - m - footerH + 1e-6) { pages.push(page); page = []; y = nextTop; }
      const num = String(stepIndex + 1).padStart(2, '0');
      let g = drawings(stepIndex, m + Math.max(0, (drawW - groupW(stepIndex, dw, gapIn)) / 2), y + (rowH - dh) / 2, scale, dw, gapIn);
      g += caption(prj.steps[stepIndex], num, m + drawW + gap, y + Math.max(0, (rowH - capH[j]) / 2), capW, Math.max(rowH, capH[j]));
      // a thin rule between steps, and a small arrow down the caption column: one step leads to the next
      if (j < indexes.length - 1 && y + rowH + rowGap + Math.max(dh, capH[j + 1]) <= Hc - m - footerH + 1e-6) {
        const ry = y + rowH + rowGap / 2;
        g += `<path d="M${r2(m)} ${r2(ry)}H${r2(m + drawW)}" stroke="${style.grid}" stroke-width="${r2(0.25 * s)}"/>`;
        const ax = noCaptions ? m / 2 : m + drawW + gap + 2.5 * s; // no caption column: in the margin
        const nextOp = opSign(indexes[j + 1], ax, ry, 6 * s);
        if (nextOp) g += nextOp;
        else g += `<path d="M${r2(ax - 1.6 * s)} ${r2(ry - 1 * s)}L${r2(ax)} ${r2(ry + 0.8 * s)}L${r2(ax + 1.6 * s)} ${r2(ry - 1 * s)}" fill="none" stroke="${style.caption}" stroke-width="${r2(0.35 * s)}" stroke-linecap="round" stroke-linejoin="round"/>`;
      }
      page.push(stepGroup(stepIndex, g));
      y += rowH + rowGap;
    });
    if (!stacked) pages.push(page);
  } else {
    // ---- row, grid or column: captions under the drawings. The paper is divided in slots of the same
    // width; a step takes one slot per angle, and the steps flow into rows of slots.
    const gapX = 10 * s, gapY = 8 * s;
    const ks = indexes.map((i) => angles.get(i).length);
    const column = sheet.layout === 'column';
    const total = ks.reduce((a, k) => a + k, 0);
    const flow = (perRow) => {
      const rows = [];
      let cur = [], used = 0;
      indexes.forEach((stepIndex, j) => {
        if (cur.length && (column || used + ks[j] > perRow)) { rows.push(cur); cur = []; used = 0; }
        cur.push({ stepIndex, slot: used, k: ks[j] });
        used += ks[j];
      });
      if (cur.length) rows.push(cur);
      return rows;
    };
    // as many slots per row as it takes to keep the rows of the grid (wider when a step has more angles)
    let slots = total;
    if (sheet.layout !== 'row') {
      const wanted = gridOf(sheet, indexes.length).rows;
      slots = Math.max(K, Math.ceil(total / wanted));
      while (!column && slots < total && flow(slots).length > wanted) slots++;
    }
    fitWidth = Wc - 2 * m;
    if (fixed) {
      scale = 1000 / sheet.scale / axis;
      // the steps flow into as many slots as fit across the paper
      const fitSlots = Math.max(1, Math.floor((Wc - 2 * m + gapX) / (bw * scale + gapX)));
      slots = Math.max(1, Math.min(slots, fitSlots));
      overflow = K * bw * scale + (K - 1) * gapX > Wc - 2 * m + 1e-6 || bh * scale + captionH > Hc - m - footerH - nextTop + 1e-6;
      slots = Math.max(slots, K);
    }
    const rowsAll = flow(slots);
    // the captions under the drawings take the room the tallest of them needs (up to a limit: a longer
    // text is cut), not a fixed height
    const slotW0 = (Wc - 2 * m - (slots - 1) * gapX) / slots;
    const capWidth = Math.max(30 * s, Math.min(slotW0, 70 * s));
    const captionH = noCaptions ? 0 : Math.max(heads ? 12 * s : 0, Math.min(sheet.texts ? 30 * s : 18 * s, Math.max(...indexes.map((i) => captionHeight(prj.steps[i], capWidth)))));
    if (!fixed) {
      const maxCellH = (Hc - m - firstTop - (rowsAll.length - 1) * gapY) / rowsAll.length;
      scale = Math.min(slotW0 / bw, Math.max(10 * s, maxCellH - captionH) / bh);
    }
    // ---- captions beside the drawings: when the drawings are held by the height (a column, a grid of wide
    // cells, an upright paper) the caption goes on the left of its drawing and the drawing grows
    const beside = !fixed && !noCaptions && besideLayout();
    function besideLayout() {
      const capW = Math.min(60 * s, Math.max(40 * s, (Wc - 2 * m) * 0.2)), gapC = 6 * s;
      const per = sheet.layout === 'row' ? indexes.length : column ? 1 : gridOf(sheet, indexes.length).cols;
      const rows = [];
      indexes.forEach((stepIndex, j) => { if (j % per === 0) rows.push([]); rows[rows.length - 1].push({ stepIndex, j }); });
      const capHs = indexes.map((i) => captionHeight(prj.steps[i], capW));
      const avail = Wc - 2 * m;
      const fixedW = (row) => row.reduce((a, { j }) => a + capW + gapC + (ks[j] - 1) * gapX, 0) + (row.length - 1) * gapX;
      const sumK = (row) => row.reduce((a, { j }) => a + ks[j], 0);
      let sc = Math.min(...rows.map((row) => (avail - fixedW(row)) / (sumK(row) * bw)));
      if (!(sc > 0)) return false;
      const room = Hc - m - firstTop - (rows.length - 1) * gapY;
      sc = Math.min(sc, room / rows.length / bh);
      const rowH = (row, k) => Math.max(bh * k, ...row.map(({ j }) => capHs[j]));
      for (let n = 0; n < 40 && rows.reduce((a, row) => a + rowH(row, sc), 0) > room + 1e-6; n++) sc *= 0.97;
      if (!(sc > scale * 1.08)) return false; // not worth it: the captions stay under the drawings
      scale = sc;
      const dw = bw * scale, dh = bh * scale;
      const used = rows.reduce((a, row) => a + rowH(row, scale), 0) + (rows.length - 1) * gapY;
      let y = firstTop + Math.max(0, Hc - m - firstTop - used) / 3;
      const page = [];
      // the steps line up in columns (the captions of a column one under the other); the leftover width is
      // shared evenly around the columns, so the drawings stay beside their captions
      const groupW = ({ j }) => ks[j] * dw + (ks[j] - 1) * gapX;
      const colW = [];
      for (const row of rows) row.forEach((it, q) => { colW[q] = Math.max(colW[q] || 0, groupW(it)); });
      const share = Math.max(0, avail - colW.reduce((a, w) => a + capW + gapC + w, 0) - (colW.length - 1) * gapX) / (colW.length + 1);
      const colX = [];
      colW.reduce((x, w, q) => { colX[q] = x + share; return colX[q] + capW + gapC + w + gapX; }, m);
      for (const row of rows) {
        const rh = rowH(row, scale);
        row.forEach((it, q) => {
          const { stepIndex, j } = it;
          const x = colX[q];
          const num = String(stepIndex + 1).padStart(2, '0');
          const dx = x + capW + gapC + (colW[q] - groupW(it)) / 2;
          const g = opSign(stepIndex, q ? x - (share + gapX) / 2 : Math.max(m / 2, x - share / 2), y + rh / 2)
            + caption(prj.steps[stepIndex], num, x, y + Math.max(0, (rh - capHs[j]) / 2), capW, rh)
            + drawings(stepIndex, dx, y + (rh - dh) / 2, scale, dw, gapX);
          page.push(stepGroup(stepIndex, g));
        });
        y += rh + gapY;
      }
      pages.push(page);
      return true;
    }
    const slotW = fixed ? Math.min(bw * scale, Wc - 2 * m) + Math.max(0, (Wc - 2 * m - slots * Math.min(bw * scale, Wc - 2 * m) - (slots - 1) * gapX) / slots) : (Wc - 2 * m - (slots - 1) * gapX) / slots;
    const dh = bh * scale;
    const cellH = dh + captionH;
    // rows that fit on each page (at least one)
    const perPage = (top) => Math.max(1, Math.floor((Hc - m - footerH - top + gapY) / (cellH + gapY)));
    let k = beside ? rowsAll.length : 0;
    while (k < rowsAll.length) {
      const top = pages.length ? nextTop : firstTop;
      const rowsHere = fixed ? Math.min(perPage(top), rowsAll.length - k) : rowsAll.length;
      // the block of steps starts under the header; when there is room left over it is shared: a third
      // above, two thirds below, so the steps stay close to the title and the legend
      const slack = fixed ? 0 : Math.max(0, Hc - m - top - (rowsAll.length * cellH + (rowsAll.length - 1) * gapY));
      const start = top + slack / 3;
      const page = [];
      for (let r = 0; r < rowsHere; r++, k++) {
        for (const { stepIndex, slot, k: n } of rowsAll[k]) {
          const x = m + slot * (slotW + gapX);
          const yTop = start + r * (cellH + gapY);
          const num = String(stepIndex + 1).padStart(2, '0');
          const w = groupW(stepIndex, slotW, gapX);
          // the rule under the number spans every drawing of the step: they read as one
          const g = opSign(stepIndex, slot ? x - gapX / 2 : m / 2, yTop + dh / 2)
            + drawings(stepIndex, x, yTop, scale, slotW, gapX)
            + caption(prj.steps[stepIndex], num, x, yTop + dh, Math.min(w, (n > 1 ? 110 : 70) * s), captionH, n > 1 ? w - (slotW - Math.min(slotW, bw * scale)) / 2 : undefined);
          page.push(stepGroup(stepIndex, g));
        }
      }
      pages.push(page);
    }
  }

  const denom = 1000 / (scale * axis);
  const scaleText = fixed ? `${t('sheet.scaleLabel')} 1:${sheet.scale} · ${t('sheet.scaleAxes')}` : '';
  // the largest usual scale that fits the paper's width (for the vertical layout: beside the text)
  const largestFit = SCALES.find((d) => K * bw * (1000 / d / axis) + (K - 1) * (vertical ? 6 : 10) * s <= (overflow && vertical ? W - 2 * m : fitWidth) + 1e-6) ?? null;
  const fontStyle = opts.fontCss ? `<defs><style>${opts.fontCss}</style></defs>` : '';
  const svgs = pages.map((content, p) => {
    const head = header(p === 0).markup;
    let extra = '';
    if (p === 0 && legendRows) extra += legendFlow(m, W - m, Hc + 1.5 * s, true).markup;
    if (p === 0 && panelW) {
      // the text blocks: a small title in the caption colour, a rule, the text; + and − lines are points for and against
      const x = Wc + 9 * s - m, right = W - m, fsz = 3 * s, lh = fsz * 1.5;
      const chars = Math.max(12, Math.floor((right - x - 5 * s) / (fsz * 0.5)));
      let y = m + 6 * s, g = '';
      for (const b of blocks) {
        if (y > H - m - 10 * s) break;
        if (b.title) {
          g += `<text x="${r2(x)}" y="${r2(y)}" font-size="${r2(2.8 * s)}" font-weight="700" letter-spacing="${r2(0.5 * s)}" fill="${style.caption}">${esc(b.title.toUpperCase())}</text>`;
          y += 2.4 * s;
          g += `<path d="M${r2(x)} ${r2(y)}H${r2(right)}" stroke="${style.grid}" stroke-width="${r2(0.25 * s)}"/>`;
          y += 5.5 * s;
        }
        for (const para of b.text.split('\n')) {
          const mark = /^\s*([+\-−–])\s+/.exec(para);
          const body = mark ? para.slice(mark[0].length) : para;
          if (!body.trim()) { y += lh * 0.5; continue; }
          const lines = wrap(body, mark ? chars - 4 : chars);
          if (y + lines.length * lh > H - m) break;
          if (mark) {
            const plus = mark[1] === '+', col = plus ? '#2e8b57' : '#c8322d';
            g += `<circle cx="${r2(x + 1.6 * s)}" cy="${r2(y - 1 * s)}" r="${r2(1.7 * s)}" fill="${col}"/>`
              + `<path d="M${r2(x + 0.7 * s)} ${r2(y - 1 * s)}h${r2(1.8 * s)}${plus ? `M${r2(x + 1.6 * s)} ${r2(y - 1.9 * s)}v${r2(1.8 * s)}` : ''}" stroke="#fff" stroke-width="${r2(0.4 * s)}"/>`;
          }
          lines.forEach((line, i) => { g += `<text x="${r2(x + (mark ? 5 * s : 0))}" y="${r2(y + i * lh)}" font-size="${r2(fsz)}" fill="${style.text}">${esc(line)}</text>`; });
          y += lines.length * lh + lh * 0.35;
        }
        y += 5 * s;
      }
      extra += `<g id="notes">${g}</g>`;
    }
    // footer: the scale (when chosen) on the left, the page number on the right
    const foot = (scaleText ? `<text id="scale" x="${r2(m)}" y="${r2(H - m * 0.6)}" font-size="${r2(3 * s)}" font-weight="600" letter-spacing="${r2(0.25 * s)}" fill="${style.muted}">${esc(scaleText)}</text>` : '')
      + (pages.length > 1 ? `<text id="page" x="${r2(W - m)}" y="${r2(H - m * 0.6)}" font-size="${r2(3 * s)}" fill="${style.muted}" text-anchor="end">${p + 1} / ${pages.length}</text>` : '');
    return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}" font-family="${esc(FONT)}">`
      + fontStyle + `<rect id="papel" width="${W}" height="${H}" fill="${style.paper}"/>` + head + content.join('') + extra + foot + '</svg>';
  });
  return { svg: svgs[0], pages: svgs, width: W, height: H, scale: Math.round(denom), fixed, overflow, stacked, largestFit };
}

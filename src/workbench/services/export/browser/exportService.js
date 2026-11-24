/*---------------------------------------------------------------------------------------------
 *  LionAxon — Copyright (C) 2026 LionAxon Team.
 *  Created and conceived by Daniel Michelon De Carli.
 *  Licensed under the GNU General Public License v3.0 or later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/
// Exports: the sheet as SVG, PDF or PNG, and one step alone as SVG or PNG. Every format starts from the
// same SVG the screen shows. PNG embeds the fonts in the SVG before drawing it, so the text keeps the
// family's typeface; the PDF is printed by the main process with the fonts of the app.
import { renderSheet, northGlyph, wrap } from '../../render/common/sheet.js';
import { stepSvg, stepViews, renderStep, padBox, FONT, northSpot } from '../../render/common/renderer.js';
import { getStyle } from '../../render/common/styles.js';
import { bboxUnion } from '../../../../base/common/geometry/polygon.js';
import { encodeGif } from '../../../../base/common/gif.js';
import { t, formatNumber } from '../../../../base/common/nls.js';
import { FONT_FACES, fontFaceCss, familiesUsed } from '../../render/common/fonts.js';
import { formatStepRange } from '../common/stepRange.js';

const toBase64 = (bytes) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

export const meters = (n) => `${formatNumber(n, 2)} m`;

const PNG_TRANSPARENT_KEY = 'lionaxon.pngTransparent';
const STEP_SIZE_KEY = 'lionaxon.stepSize';
const STEP_CAPTION_KEY = 'lionaxon.stepCaption';
const STEP_CAPTION_PLACE_KEY = 'lionaxon.stepCaptionPlace';

export class ExportService {
  #fontData = new Map();

  constructor({ host, document }) {
    this.host = host;
    this.doc = document;
  }

  /** Whether PNG files come out with a transparent background (no paper): on unless turned off, and remembered. */
  get pngTransparent() {
    try { return localStorage.getItem(PNG_TRANSPARENT_KEY) !== 'false'; } catch { return true; }
  }

  set pngTransparent(on) {
    try { localStorage.setItem(PNG_TRANSPARENT_KEY, String(!!on)); } catch { /* no storage */ }
  }

  /** Whether the steps exported on their own carry their number, title and text under the drawing. Remembered. */
  get stepCaption() {
    try { return localStorage.getItem(STEP_CAPTION_KEY) === 'true'; } catch { return false; }
  }

  set stepCaption(on) {
    try { localStorage.setItem(STEP_CAPTION_KEY, String(!!on)); } catch { /* no storage */ }
  }

  /** Where that caption goes: 'below' the drawing or 'beside' it (on its left). Remembered. */
  get stepCaptionPlace() {
    try { return localStorage.getItem(STEP_CAPTION_PLACE_KEY) === 'beside' ? 'beside' : 'below'; } catch { return 'below'; }
  }

  set stepCaptionPlace(v) {
    try { localStorage.setItem(STEP_CAPTION_PLACE_KEY, v === 'beside' ? 'beside' : 'below'); } catch { /* no storage */ }
  }

  /** The size of the images of steps exported on their own: `px` pixels of width ('w') or height ('h'). Remembered. */
  get stepSize() {
    try {
      const v = JSON.parse(localStorage.getItem(STEP_SIZE_KEY) || 'null');
      if (v && Number.isFinite(v.px) && (v.side === 'w' || v.side === 'h')) return { px: Math.round(Math.min(20000, Math.max(100, v.px))), side: v.side };
    } catch { /* no storage */ }
    return { px: 2400, side: 'w' };
  }

  set stepSize(v) {
    try { localStorage.setItem(STEP_SIZE_KEY, JSON.stringify({ px: Math.round(Math.min(20000, Math.max(100, Number(v.px) || 2400))), side: v.side === 'h' ? 'h' : 'w' })); } catch { /* no storage */ }
  }

  get baseName() { return this.doc.displayName || t('file.untitled'); }

  sheet(extra = {}) {
    return renderSheet(this.doc.project, { t, fmt: meters, ...extra });
  }

  /**
   * The @font-face rules of the families the project uses, with the font files embedded (a PNG is drawn
   * from an SVG image, which cannot load files). Each file is read once.
   */
  async fontCss(families = familiesUsed(this.doc.project)) {
    const faces = FONT_FACES.filter((f) => families.has(f.family));
    const urls = new Map();
    for (const f of faces) {
      if (!this.#fontData.has(f.file)) {
        const res = await fetch(new URL(`../../../browser/media/fonts/${f.file}`, import.meta.url));
        this.#fontData.set(f.file, toBase64(new Uint8Array(await res.arrayBuffer())));
      }
      urls.set(f.file, `data:font/woff2;base64,${this.#fontData.get(f.file)}`);
    }
    return fontFaceCss((file) => urls.get(file), families);
  }

  /** Draws an SVG (with its fonts embedded) into PNG bytes of the given pixel size. */
  async rasterize(svg, pxW, pxH) {
    const sized = svg.replace(/^<svg([^>]*?) width="[^"]*" height="[^"]*"/, `<svg$1 width="${pxW}" height="${pxH}"`);
    const url = 'data:image/svg+xml;base64,' + toBase64(new TextEncoder().encode(sized));
    const img = new Image();
    img.decoding = 'sync';
    await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = () => reject(new Error('svg')); img.src = url; });
    const canvas = document.createElement('canvas');
    canvas.width = pxW;
    canvas.height = pxH;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, pxW, pxH);
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
    return new Uint8Array(await blob.arrayBuffer());
  }

  /** The sheet as a file. `steps` (0-based) makes a sheet of those steps only, laid out like the whole one. */
  async exportSheet(kind, { dpi = 200, steps = null, transparent = this.pngTransparent } = {}) {
    const some = steps?.length && steps.length < this.doc.project.steps.length ? { steps } : {};
    const name = `${this.baseName} — ${t('sheet.fileSuffix')}${some.steps ? ` (${t('export.stepsWord')} ${formatStepRange(steps)})` : ''}`;
    if (kind === 'svg') { const s = this.sheet(some); return this.host.exportSvg(name, s.pages.length > 1 ? s.pages : s.svg); }
    if (kind === 'pdf') {
      const s = this.sheet(some);
      return this.host.exportPdf(name, s.pages.length > 1 ? s.pages : s.svg, s.width, s.height);
    }
    const s = this.sheet({ ...some, fontCss: await this.fontCss(), transparent });
    const pxW = Math.round((s.width / 25.4) * dpi), pxH = Math.round((s.height / 25.4) * dpi);
    const pngs = [];
    for (const page of s.pages) pngs.push(await this.rasterize(page, pxW, pxH));
    return this.host.exportPng(name, pngs.length > 1 ? pngs : pngs[0]);
  }

  /** An SVG drawn into RGBA pixels. */
  async pixels(svg, pxW, pxH) {
    const url = 'data:image/svg+xml;base64,' + toBase64(new TextEncoder().encode(svg));
    const img = new Image();
    await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = () => reject(new Error('svg')); img.src = url; });
    const canvas = document.createElement('canvas');
    canvas.width = pxW;
    canvas.height = pxH;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, pxW, pxH);
    return ctx.getImageData(0, 0, pxW, pxH).data;
  }

  /**
   * The frames of the animation: one SVG per step, all in the same frame (the bounds of every step
   * together), each with its number and title underneath.
   */
  gifFrames(width = 900, fontCss = '') {
    return this.stepFrames(width, { fontCss, caption: this.doc.project.sheet.heads !== false });
  }

  /**
   * Every step as a drawing of its own, all in the same frame (the bounds of every step together, at the
   * same scale), so that the images line up one after the other in a presentation or a board.
   * `caption`: the number and title of the step underneath (the GIF has them); 'text': its text too, in
   * lines under the title (the steps exported on their own, when asked). `captionPlace`: 'below' the
   * drawing, or 'beside' it (on its left, in a column).
   */
  stepFrames(width = 900, { fontCss = '', caption = false, captionPlace = 'below', steps = null, transparent = false } = {}) {
    const p0 = this.doc.project;
    // a north beside each drawing takes the place of the one lying in it
    const p = p0.sheet.northEach ? { ...p0, northPlace: 'none' } : p0;
    const style = getStyle(p.style);
    const views = p.steps.map((st) => stepViews(p, st)[0]);
    const only = steps ? new Set(steps) : null; // the frame of the steps exported (the others are not drawn)
    let box = null;
    const drawn = new Map();
    p.steps.forEach((_, i) => {
      if (only && !only.has(i)) return;
      const r = renderStep(p, i, { view: views[i], lw: 0.1, fmt: meters, terrainGrid: !!p.sheet.terrainGrid });
      drawn.set(i, r);
      box = bboxUnion(box, r.bbox);
    });
    // the north beside each drawing: its top right corner, or above its texts (never on a text)
    const nr = Math.min(box[2] - box[0], box[3] - box[1]) * 0.045;
    const norths = new Map();
    if (p.sheet.northEach) {
      for (const [i, r] of drawn) {
        const [cx, cy] = northSpot(r.bbox, r.texts || [], nr);
        norths.set(i, [cx, cy]);
        box = bboxUnion(box, [cx - nr, cy - nr, cx + nr, cy + nr]);
      }
    }
    box = padBox(box, 0.05);
    const bw = box[2] - box[0], bh = box[3] - box[1];
    const esc = (x) => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const exported = p.steps.filter((_, i) => !only || only.has(i));
    // the caption: the number and the title, and the lines of the text — under the drawing (as many lines as
    // the longest has), or `beside` it, on its left, in a column as on the sheet
    const u = bh * 0.11, fsT = u * 0.24, lhT = u * 0.36;
    const besideCap = caption && captionPlace === 'beside';
    const capW = besideCap ? bw * 0.42 : 0, gapC = besideCap ? bw * 0.05 : 0;
    const textChars = Math.max(besideCap ? 14 : 20, Math.floor(((besideCap ? capW : bw * 0.92)) / (fsT * 0.52)));
    const textLines = (st) => (caption === 'text' && st.text ? wrap(st.text, textChars) : []);
    const titleLines = (st) => (besideCap ? wrap((st.title || '').toUpperCase(), Math.max(8, Math.floor(capW / (u * 0.3 * 0.62)))) : [(st.title || '').toUpperCase()]);
    const sideH = (st) => u * 0.95 + titleLines(st).length * u * 0.42 + (textLines(st).length ? u * 0.15 + textLines(st).length * lhT : 0);
    const most = Math.max(0, ...exported.map((st) => textLines(st).length));
    const cap = !caption || besideCap ? 0 : u + (most ? most * lhT + u * 0.2 : 0);
    const tallSide = besideCap ? Math.max(...exported.map(sideH)) + u * 0.4 : 0;
    // the frame: the drawings (all in the same place), with the room of the caption under or on the left
    const vw = capW + gapC + bw, vh = Math.max(bh + cap, tallSide);
    const vx = box[0] - capW - gapC, vy = box[1] - Math.max(0, vh - bh - cap) / 2;
    const height = Math.round((width * vh) / vw / 2) * 2;
    const svgs = p.steps.map((st, i) => {
      if (only && !only.has(i)) return null;
      const { markup } = renderStep(p, i, { view: views[i], lw: (vw / width) * 1.2, fmt: meters, terrainGrid: !!p.sheet.terrainGrid });
      const num = String(i + 1).padStart(2, '0');
      let capSvg = '';
      if (caption && !besideCap) {
        capSvg = `<text x="${box[0] + bw * 0.04}" y="${box[3] + u * 0.45}" font-family="${FONT}" font-size="${u * 0.42}" fill="${style.caption}" font-weight="500">${num}</text>`
          + `<text x="${box[0] + bw * 0.04 + u * 0.8}" y="${box[3] + u * 0.45}" font-family="${FONT}" font-size="${u * 0.3}" fill="${style.text}" font-weight="700" letter-spacing="${u * 0.01}">${esc((st.title || '').toUpperCase())}</text>`
          + textLines(st).map((line, k) => `<text x="${box[0] + bw * 0.04}" y="${box[3] + u * 0.95 + k * lhT}" font-family="${FONT}" font-size="${fsT}" fill="${style.muted}">${esc(line)}</text>`).join('');
      } else if (besideCap) {
        // the number, a rule, the title, the text: a column on the left, centred on the drawing
        const x = vx + u * 0.2;
        let y = box[1] + bh / 2 - sideH(st) / 2 + u * 0.42;
        capSvg = `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${u * 0.5}" fill="${style.caption}" font-weight="500">${num}</text>`;
        y += u * 0.2;
        capSvg += `<path d="M${x} ${y}h${Math.min(capW * 0.8, u * 4)}" stroke="${style.caption}" stroke-width="${u * 0.025}"/>`;
        y += u * 0.1;
        for (const line of titleLines(st)) { y += u * 0.42; capSvg += `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${u * 0.3}" fill="${style.text}" font-weight="700" letter-spacing="${u * 0.015}">${esc(line)}</text>`; }
        if (textLines(st).length) y += u * 0.15;
        for (const line of textLines(st)) { y += lhT; capSvg += `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${fsT}" fill="${style.muted}">${esc(line)}</text>`; }
      }
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vx} ${vy} ${vw} ${vh}" width="${width}" height="${height}">`
        + (fontCss ? `<defs><style>${fontCss}</style></defs>` : '')
        + (transparent ? '' : `<rect x="${vx}" y="${vy}" width="${vw}" height="${vh}" fill="${style.paper}"/>`) + markup
        // the north at the corner of each drawing, when the sheet asks for it
        + (norths.has(i) ? northGlyph(views[i], p.north, norths.get(i)[0], norths.get(i)[1], nr, { ink: p.northHalftone ? style.muted : style.ink, muted: style.muted, halftone: p.northHalftone, s: nr / 5.5 }) : '')
        + capSvg + '</svg>';
    });
    return { svgs, width, height };
  }

  /** The steps one after the other, as an animated GIF. `seconds` is how long each step stays. */
  async exportGif({ seconds = 1.5, width = 900 } = {}) {
    const { svgs, height } = this.gifFrames(width, await this.fontCss());
    const frames = [];
    for (const svg of svgs) frames.push(await this.pixels(svg, width, height));
    const delays = frames.map((_, i) => Math.round(seconds * 100 * (i === frames.length - 1 ? 2 : 1))); // the last one stays longer
    return this.host.exportGif(`${this.baseName} — ${t('gif.fileSuffix')}`, encodeGif(frames, width, height, { delays }));
  }

  /**
   * Every step of the evolution as files of its own — PNG, SVG, PDF, or all three — in a folder chosen once:
   * one image per step, all in the same frame and scale. `kinds` lists the formats.
   */
  async exportAllSteps(kinds = ['png'], { width, height, pageWidthMm = 297, steps = null, transparent = this.pngTransparent } = {}) {
    const p = this.doc.project;
    // the size asked (pixels of width or of height); a height gives the width the frame needs for it
    if (width == null && height == null) { const z = this.stepSize; if (z.side === 'h') height = z.px; else width = z.px; }
    // the number, title and text of each step under its drawing, when asked
    const caption = this.stepCaption ? 'text' : false, captionPlace = this.stepCaptionPlace;
    if (width == null) { const probe = this.stepFrames(1000, { steps, caption, captionPlace }); width = Math.max(16, Math.round((height * 1000) / probe.height)); }
    const fontCss = kinds.includes('png') ? await this.fontCss() : '';
    const plain = this.stepFrames(width, { steps, caption, captionPlace });                 // SVG and PDF: the fonts come from the system or the print page
    // the PNG may leave out the paper (a transparent background); the SVG and the PDF keep it
    const withFonts = fontCss ? this.stepFrames(width, { fontCss, steps, transparent, caption, captionPlace }) : plain;
    const pageH = Math.round((pageWidthMm * plain.height) / plain.width * 10) / 10;
    const files = [];
    for (const i of steps || p.steps.map((_, k) => k)) {
      const st = p.steps[i];
      const name = `${t('sheet.step')} ${String(i + 1).padStart(2, '0')}${st.title ? ' ' + st.title : ''}`;
      if (kinds.includes('png')) files.push({ name, kind: 'png', data: await this.rasterize(withFonts.svgs[i], width, withFonts.height) });
      if (kinds.includes('svg')) files.push({ name, kind: 'svg', data: plain.svgs[i] });
      if (kinds.includes('pdf')) files.push({ name, kind: 'pdf', svg: plain.svgs[i], w: pageWidthMm, h: pageH });
    }
    return this.host.exportSteps(`${this.baseName} — ${t('export.stepsFolder')}`, files);
  }

  /** The drawing of one step alone (no title, legend or caption): SVG, PNG or PDF. */
  async exportStep(kind, index = this.doc.stepIndex, { width, height, pageWidthMm = 297, transparent = this.pngTransparent } = {}) {
    const p = this.doc.project;
    const step = p.steps[index];
    if (width == null && height == null) { const z = this.stepSize; if (z.side === 'h') height = z.px; else width = z.px; }
    const name = `${this.baseName} — ${t('sheet.step')} ${String(index + 1).padStart(2, '0')}${step.title ? ' ' + step.title : ''}`;
    const views = stepViews(p, step); // every angle of the step, side by side
    // with its number, title and text: the drawing in its frame, the caption under it
    if (this.stepCaption) {
      const captionPlace = this.stepCaptionPlace;
      if (width == null) { const probe = this.stepFrames(1000, { steps: [index], caption: 'text', captionPlace }); width = Math.max(16, Math.round((height * 1000) / probe.height)); }
      if (kind === 'svg') return this.host.exportSvg(name, this.stepFrames(width, { steps: [index], caption: 'text', captionPlace }).svgs[index]);
      if (kind === 'pdf') {
        const f = this.stepFrames(width, { steps: [index], caption: 'text', captionPlace });
        return this.host.exportPdf(name, f.svgs[index], pageWidthMm, Math.round((pageWidthMm * f.height) / f.width * 10) / 10);
      }
      const f = this.stepFrames(width, { steps: [index], caption: 'text', captionPlace, transparent, fontCss: await this.fontCss() });
      return this.host.exportPng(name, await this.rasterize(f.svgs[index], width, f.height));
    }
    if (width == null) {
      const probe = stepSvg(p, index, { views, width: 1000, fmt: meters });
      width = Math.max(16, Math.round((height * 1000) / Number(/height="([\d.]+)"/.exec(probe)[1])));
    }
    if (kind === 'svg') return this.host.exportSvg(name, stepSvg(p, index, { views, width, fmt: meters }));
    if (kind === 'pdf') {
      const svg = stepSvg(p, index, { views, width: 1200 * Math.min(2, views.length), fmt: meters });
      const w = Number(/width="([\d.]+)"/.exec(svg)[1]), h = Number(/height="([\d.]+)"/.exec(svg)[1]);
      return this.host.exportPdf(name, svg, pageWidthMm, Math.round((pageWidthMm * h) / w * 10) / 10);
    }
    let svg = stepSvg(p, index, { views, width, fmt: meters, background: !transparent });
    svg = svg.replace(/^<svg([^>]*)>/, `<svg$1><defs><style>${await this.fontCss()}</style></defs>`);
    const h = Number(/height="(\d+)"/.exec(svg)[1]);
    return this.host.exportPng(name, await this.rasterize(svg, width, h));
  }
}

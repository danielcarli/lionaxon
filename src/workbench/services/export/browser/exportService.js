/*---------------------------------------------------------------------------------------------
 *  LionAxon — Copyright (C) 2026 LionAxon Team.
 *  Created and conceived by Daniel Michelon De Carli.
 *  Licensed under the GNU General Public License v3.0 or later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/
// Exports: the sheet as SVG, PDF or PNG, and one step alone as SVG or PNG. Every format starts from the
// same SVG the screen shows. PNG embeds the fonts in the SVG before drawing it, so the text keeps the
// family's typeface; the PDF is printed by the main process with the fonts of the app.
import { renderSheet } from '../../render/common/sheet.js';
import { stepSvg, stepViews, renderStep, padBox, FONT } from '../../render/common/renderer.js';
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

export class ExportService {
  #fontData = new Map();

  constructor({ host, document }) {
    this.host = host;
    this.doc = document;
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
  async exportSheet(kind, { dpi = 200, steps = null } = {}) {
    const some = steps?.length && steps.length < this.doc.project.steps.length ? { steps } : {};
    const name = `${this.baseName} — ${t('sheet.fileSuffix')}${some.steps ? ` (${t('export.stepsWord')} ${formatStepRange(steps)})` : ''}`;
    if (kind === 'svg') { const s = this.sheet(some); return this.host.exportSvg(name, s.pages.length > 1 ? s.pages : s.svg); }
    if (kind === 'pdf') {
      const s = this.sheet(some);
      return this.host.exportPdf(name, s.pages.length > 1 ? s.pages : s.svg, s.width, s.height);
    }
    const s = this.sheet({ ...some, fontCss: await this.fontCss() });
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
    return this.stepFrames(width, { fontCss, caption: true });
  }

  /**
   * Every step as a drawing of its own, all in the same frame (the bounds of every step together, at the
   * same scale), so that the images line up one after the other in a presentation or a board.
   * `caption`: the number and title of the step underneath (the GIF has them; the single images do not).
   */
  stepFrames(width = 900, { fontCss = '', caption = false, steps = null } = {}) {
    const p = this.doc.project;
    const style = getStyle(p.style);
    const views = p.steps.map((st) => stepViews(p, st)[0]);
    const only = steps ? new Set(steps) : null; // the frame of the steps exported (the others are not drawn)
    let box = null;
    p.steps.forEach((_, i) => { if (!only || only.has(i)) box = bboxUnion(box, renderStep(p, i, { view: views[i], lw: 0.1, fmt: meters, terrainGrid: !!p.sheet.terrainGrid }).bbox); });
    box = padBox(box, 0.05);
    const bw = box[2] - box[0], bh = box[3] - box[1];
    const cap = caption ? bh * 0.11 : 0; // room for the caption
    const height = Math.round((width * (bh + cap)) / bw / 2) * 2;
    const esc = (x) => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const svgs = p.steps.map((st, i) => {
      if (only && !only.has(i)) return null;
      const { markup } = renderStep(p, i, { view: views[i], lw: (bw / width) * 1.2, fmt: meters, terrainGrid: !!p.sheet.terrainGrid });
      const num = String(i + 1).padStart(2, '0');
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box[0]} ${box[1]} ${bw} ${bh + cap}" width="${width}" height="${height}">`
        + (fontCss ? `<defs><style>${fontCss}</style></defs>` : '')
        + `<rect x="${box[0]}" y="${box[1]}" width="${bw}" height="${bh + cap}" fill="${style.paper}"/>${markup}`
        + (!caption ? '</svg>' : '')
        + (!caption ? '' : `<text x="${box[0] + bw * 0.04}" y="${box[3] + cap * 0.45}" font-family="${FONT}" font-size="${cap * 0.42}" fill="${style.caption}" font-weight="500">${num}</text>`
        + `<text x="${box[0] + bw * 0.04 + cap * 0.8}" y="${box[3] + cap * 0.45}" font-family="${FONT}" font-size="${cap * 0.3}" fill="${style.text}" font-weight="700" letter-spacing="${cap * 0.01}">${esc((st.title || '').toUpperCase())}</text></svg>`);
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
  async exportAllSteps(kinds = ['png'], { width = 2400, pageWidthMm = 297, steps = null } = {}) {
    const p = this.doc.project;
    const fontCss = kinds.includes('png') ? await this.fontCss() : '';
    const plain = this.stepFrames(width, { steps });                 // SVG and PDF: the fonts come from the system or the print page
    const withFonts = fontCss ? this.stepFrames(width, { fontCss, steps }) : plain;
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
  async exportStep(kind, index = this.doc.stepIndex, { width = 2400, pageWidthMm = 297 } = {}) {
    const p = this.doc.project;
    const step = p.steps[index];
    const name = `${this.baseName} — ${t('sheet.step')} ${String(index + 1).padStart(2, '0')}${step.title ? ' ' + step.title : ''}`;
    const views = stepViews(p, step); // every angle of the step, side by side
    if (kind === 'svg') return this.host.exportSvg(name, stepSvg(p, index, { views, width: 1200 * Math.min(2, views.length), fmt: meters }));
    if (kind === 'pdf') {
      const svg = stepSvg(p, index, { views, width: 1200 * Math.min(2, views.length), fmt: meters });
      const w = Number(/width="([\d.]+)"/.exec(svg)[1]), h = Number(/height="([\d.]+)"/.exec(svg)[1]);
      return this.host.exportPdf(name, svg, pageWidthMm, Math.round((pageWidthMm * h) / w * 10) / 10);
    }
    let svg = stepSvg(p, index, { views, width, fmt: meters });
    svg = svg.replace(/^<svg([^>]*)>/, `<svg$1><defs><style>${await this.fontCss()}</style></defs>`);
    const h = Number(/height="(\d+)"/.exec(svg)[1]);
    return this.host.exportPng(name, await this.rasterize(svg, width, h));
  }
}

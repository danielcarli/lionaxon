/*---------------------------------------------------------------------------------------------
 *  LionAxon — Copyright (C) 2026 LionAxon Team.
 *  Created and conceived by Daniel Michelon De Carli.
 *  Licensed under the GNU General Public License v3.0 or later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/
// The little formatting the texts of labels take, written the way people write notes:
//   **bold**, *italic* (or ***both***)
//   a line starting with "- ", "* " or "• " is an item of a list; with "1. " or "1) ", of a numbered one
// A marker left open is shown as it was typed. Lines that are too long break at the spaces, and the lines
// of an item hang under its text, after the bullet or the number.

const INLINE = /\*\*\*(?=\S)(.+?)(?<=\S)\*\*\*|\*\*(?=\S)(.+?)(?<=\S)\*\*|\*(?=\S)(.+?)(?<=\S)\*/g;

/** A line of text as runs of the same look: [{ t, b, i }]. */
export function parseInline(line) {
  const runs = [];
  let at = 0;
  const push = (t, b, i) => { if (t) runs.push({ t, b, i }); };
  for (const m of String(line).matchAll(INLINE)) {
    push(line.slice(at, m.index), false, false);
    if (m[1] != null) push(m[1], true, true);
    else if (m[2] != null) push(m[2], true, false);
    else push(m[3], false, true);
    at = m.index + m[0].length;
  }
  push(line.slice(at), false, false);
  return runs;
}

/** What a line of a list starts with: '•' for a bullet, the number for a numbered one, '' for a plain line. */
export function listItem(line) {
  const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
  if (bullet) return { prefix: '•', rest: bullet[1] };
  const num = /^\s*(\d{1,3})[.)]\s+(.*)$/.exec(line);
  if (num) return { prefix: `${num[1]}.`, rest: num[2] };
  return { prefix: '', rest: line };
}

/** The text without its markers: what is read, for measures and for the places that show it plain. */
export function plainText(text) {
  return String(text ?? '').split('\n').map((l) => {
    const { prefix, rest } = listItem(l);
    return (prefix ? `${prefix} ` : '') + parseInline(rest).map((r) => r.t).join('');
  }).join('\n');
}

/**
 * The lines to draw: each { prefix, hang, runs, chars } — the bullet or number of an item on its first
 * line, `hang` on the lines that follow it (they start under its text), the runs of the line, and how many
 * characters wide it is (prefix and its space included). `max`: the width to break at (0: none), `cw`: the
 * width of a character, `caps`: in capitals.
 */
export function richLines(text, { max = 0, cw = 1, caps = false } = {}) {
  const out = [];
  for (const source of String(text ?? '').split('\n')) {
    const { prefix, rest } = listItem(source);
    const lead = prefix ? prefix.length + 1 : 0; // the bullet or number and a space
    let runs = parseInline(rest);
    if (caps) runs = runs.map((r) => ({ ...r, t: r.t.toUpperCase() }));
    const plain = runs.map((r) => r.t).join('');
    // the words, where they start and end in the plain text
    const words = [...plain.matchAll(/\S+/g)].map((m) => [m.index, m.index + m[0].length]);
    const room = max > 0 ? Math.max(cw, max - lead * cw) : Infinity;
    const spans = [];
    let start = null, end = 0;
    for (const [a, b] of words) {
      if (start == null) { start = a; end = b; continue; }
      if ((b - start) * cw > room) { spans.push([start, end]); start = a; }
      end = b;
    }
    if (start != null) spans.push([start, end]);
    if (!spans.length) spans.push([0, plain.length]);
    spans.forEach(([a, b], k) => {
      out.push({ prefix: k === 0 ? prefix : '', hang: k > 0 && !!prefix, lead, runs: sliceRuns(runs, a, b), chars: lead + (b - a) });
    });
  }
  return out;
}

/** The runs between two places of the plain text they make. */
function sliceRuns(runs, a, b) {
  const out = [];
  let at = 0;
  for (const r of runs) {
    const s = Math.max(a, at), e = Math.min(b, at + r.t.length);
    if (e > s) out.push({ ...r, t: r.t.slice(s - at, e - at) });
    at += r.t.length;
  }
  return out;
}

const escXml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * The SVG of the lines (inside a <text>): one positioned tspan per line, `x` where the lines start (the
 * text anchored at its start, or at its end when `end`), `lh` the line height, `cw` the width of a
 * character (the indent of a list), `bold` the weight of bold text.
 */
export function richTspans(lines, { x, lh, cw, end = false, bold = 700 }) {
  const r3 = (v) => Math.round(v * 1000) / 1000;
  const runs = (rs) => rs.map((r) => (r.b || r.i
    ? `<tspan${r.b ? ` font-weight="${bold}"` : ''}${r.i ? ' font-style="italic"' : ''}>${escXml(r.t)}</tspan>`
    : escXml(r.t))).join('');
  return lines.map((l, i) => {
    const dy = i ? ` dy="${r3(lh)}"` : '';
    // anchored at the end (a label to the left of its point): the bullet goes in front, no hanging indent
    if (end) return `<tspan x="${r3(x)}"${dy}>${l.prefix ? `${escXml(l.prefix)} ` : ''}${runs(l.runs)}</tspan>`;
    const ix = x + l.lead * cw;
    if (l.prefix) return `<tspan x="${r3(x)}"${dy}>${escXml(l.prefix)}</tspan><tspan x="${r3(ix)}">${runs(l.runs)}</tspan>`;
    return `<tspan x="${r3(l.hang ? ix : x)}"${dy}>${runs(l.runs) || ' '}</tspan>`;
  }).join('');
}

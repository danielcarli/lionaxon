/*---------------------------------------------------------------------------------------------
 *  LionAxon — Copyright (C) 2026 LionAxon Team.
 *  Created and conceived by Daniel Michelon De Carli.
 *  Licensed under the GNU General Public License v3.0 or later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/
// The fonts that come with the app (all under the SIL Open Font License): one list for the screen, the
// PDF (printed with the same files) and the PNG (the files embedded in the SVG). Labels can use any of
// the five families; titles and captions use Plus Jakarta Sans.
const LATIN = 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD';
const LATIN_EXT = 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF';

export const FONT_FACES = [
  { family: 'Plus Jakarta Sans', weight: '200 800', file: 'plus-jakarta-sans-latin-wght-normal.woff2', range: LATIN },
  { family: 'Plus Jakarta Sans', weight: '200 800', file: 'plus-jakarta-sans-latin-ext-wght-normal.woff2', range: LATIN_EXT },
  { family: 'JetBrains Mono', weight: '100 800', file: 'jetbrains-mono-latin-wght-normal.woff2', range: LATIN },
  { family: 'JetBrains Mono', weight: '100 800', file: 'jetbrains-mono-latin-ext-wght-normal.woff2', range: LATIN_EXT },
  { family: 'Archivo Narrow', weight: '400', file: 'archivo-narrow-latin-400-normal.woff2', range: LATIN },
  { family: 'Archivo Narrow', weight: '400', file: 'archivo-narrow-latin-ext-400-normal.woff2', range: LATIN_EXT },
  { family: 'Archivo Narrow', weight: '600', file: 'archivo-narrow-latin-600-normal.woff2', range: LATIN },
  { family: 'Archivo Narrow', weight: '600', file: 'archivo-narrow-latin-ext-600-normal.woff2', range: LATIN_EXT },
  { family: 'Source Serif 4', weight: '200 900', file: 'source-serif-4-latin-wght-normal.woff2', range: LATIN },
  { family: 'Source Serif 4', weight: '200 900', file: 'source-serif-4-latin-ext-wght-normal.woff2', range: LATIN_EXT },
  { family: 'Architects Daughter', weight: '400', file: 'architects-daughter-latin-400-normal.woff2', range: LATIN },
  { family: 'Architects Daughter', weight: '400', file: 'architects-daughter-latin-ext-400-normal.woff2', range: LATIN_EXT },
];

/** Label fonts: family for SVG, weight, and roughly how wide a capital is (for the bounds of a label). */
export const LABEL_FONTS = {
  sans: { name: 'Plus Jakarta Sans', family: "'Plus Jakarta Sans', 'Segoe UI', system-ui, sans-serif", weight: 600, width: 0.66 },
  condensed: { name: 'Archivo Narrow', family: "'Archivo Narrow', 'Arial Narrow', sans-serif", weight: 600, width: 0.52 },
  serif: { name: 'Source Serif 4', family: "'Source Serif 4', Georgia, serif", weight: 600, width: 0.66 },
  mono: { name: 'JetBrains Mono', family: "'JetBrains Mono', Consolas, monospace", weight: 600, width: 0.62 },
  hand: { name: 'Architects Daughter', family: "'Architects Daughter', 'Comic Sans MS', cursive", weight: 400, width: 0.66 },
};

export const labelFont = (id) => LABEL_FONTS[id] || LABEL_FONTS.sans;

/**
 * @font-face rules for the given families (all when omitted). `src(file)` returns the URL of a file:
 * a relative URL for the screen and the PDF, a data: URL for the PNG.
 */
export function fontFaceCss(src, families = null) {
  return FONT_FACES.filter((f) => !families || families.has(f.family))
    .map((f) => `@font-face{font-family:'${f.family}';font-style:normal;font-display:swap;font-weight:${f.weight};src:url(${src(f.file)}) format('woff2');unicode-range:${f.range}}`)
    .join('\n');
}

/** The families a project uses (titles always use Plus Jakarta Sans). */
export function familiesUsed(project) {
  const set = new Set(['Plus Jakarta Sans']);
  for (const s of project.steps) for (const o of s.objects) if (o.type === 'label') set.add(labelFont(o.font).name);
  return set;
}

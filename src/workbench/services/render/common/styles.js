/*---------------------------------------------------------------------------------------------
 *  LionAxon — Copyright (C) 2026 LionAxon Team.
 *  Created and conceived by Daniel Michelon De Carli.
 *  Licensed under the GNU General Public License v3.0 or later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/
// Drawing styles that come with the app. Each one follows a family of references: thin dark edges,
// flat faces in three tones (top lighter, the two sides darker), one accent colour for "what changes".
export const STYLES = {
  beige: {
    paper: '#ffffff', volume: '#f4efe6', edge: '#3b3631', accent: '#d98a6c',
    site: '#9a948c', ground: '#efebe4', grid: '#e9e4dc', person: '#8f8982',
    ink: '#3b3631', green: '#7f9b3c', blue: '#7193bd', red: '#d7808d',
    text: '#2b2724', muted: '#6d665f', caption: '#9aa75a',
  },
  lawn: {
    paper: '#ffffff', volume: '#fbfbf9', edge: '#383838', accent: '#e4a23a',
    site: '#5f8a4a', ground: '#8db170', grid: '#e7ece2', person: '#4b4b4b',
    ink: '#383838', green: '#4f8a3a', blue: '#4f7fb0', red: '#cf5b4b',
    text: '#2a2a2a', muted: '#666666', caption: '#b06d17',
  },
  blue: {
    paper: '#ffffff', volume: '#eef1f4', edge: '#1f2a36', accent: '#5b7c9e',
    site: '#c2c8cf', ground: '#f2f3f5', grid: '#e8ebee', person: '#1f2a36',
    ink: '#1f2a36', green: '#3c8f5a', blue: '#5b7c9e', red: '#c55a5a',
    text: '#1f2a36', muted: '#5f6b78', caption: '#5b7c9e',
  },
  // five pastel combinations: the volumes in one pastel, the ground in another, a deeper tone for the
  // accent (still 3:1 against the volumes) and soft dark edges instead of black
  cotton: { // cotton candy: blush pink volumes on baby blue, blue accent
    paper: '#fffbfc', volume: '#f8dde5', edge: '#4a3f4e', accent: '#4f7cc0',
    site: '#9aaccb', ground: '#dbe8f7', grid: '#f1ecf2', person: '#6d6274',
    ink: '#4a3f4e', green: '#5f9e7f', blue: '#4f7cc0', red: '#c95f7b',
    text: '#3b3340', muted: '#7a6f80', caption: '#c95f7b',
  },
  mint: { // mint volumes on peach, terracotta accent
    paper: '#fbfefc', volume: '#d5efe2', edge: '#33473f', accent: '#c4603c',
    site: '#e0a98f', ground: '#fde3d6', grid: '#e8f2ed', person: '#566a62',
    ink: '#33473f', green: '#3f9a72', blue: '#4f8fb8', red: '#c4603c',
    text: '#2c3d36', muted: '#667a72', caption: '#3f9a72',
  },
  lavender: { // lavender volumes on butter yellow, violet accent
    paper: '#fdfcff', volume: '#e6defa', edge: '#3d3650', accent: '#6e52ad',
    site: '#d6c27a', ground: '#fbf3cf', grid: '#efecf6', person: '#5f5873',
    ink: '#3d3650', green: '#6a9a5c', blue: '#6a82c8', red: '#c8678a',
    text: '#352f45', muted: '#736c85', caption: '#6e52ad',
  },
  peach: { // peach volumes on sage, green accent
    paper: '#fffbf6', volume: '#fde2cf', edge: '#4a3b31', accent: '#5b8744',
    site: '#a9b996', ground: '#dfe9d3', grid: '#f1ece4', person: '#6d5d52',
    ink: '#4a3b31', green: '#5b8744', blue: '#6b8fb0', red: '#c35c33',
    text: '#3d3029', muted: '#7d6e63', caption: '#c35c33',
  },
  sky: { // powder blue volumes on cream, coral accent
    paper: '#fbfdff', volume: '#d7e8f5', edge: '#2f4253', accent: '#c4643f',
    site: '#d9c391', ground: '#fbf1d8', grid: '#e7eff5', person: '#526575',
    ink: '#2f4253', green: '#5d9a73', blue: '#3f8ea8', red: '#c4643f',
    text: '#283846', muted: '#64788a', caption: '#3f8ea8',
  },
};

export const STYLE_IDS = Object.keys(STYLES);
export const getStyle = (id) => STYLES[id] || STYLES.bege;

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const toHex = (rgb) => '#' + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');

/** Mixes a colour with black (k > 0) or white (k < 0). */
export function shade(hex, k) {
  const rgb = hexToRgb(hex);
  return toHex(k >= 0 ? rgb.map((v) => v * (1 - k)) : rgb.map((v) => v + (255 - v) * -k));
}

/** Tone of a wall from how much it faces the screen's right side (-1 left … 1 right). */
export const wallTone = (base, facingRight) => shade(base, 0.09 + 0.09 * (facingRight + 1));

/** Colour of an arrow: one of the style's named inks, or a category's colour. */
export function arrowColor(style, color, categories) {
  if (style[color] && ['ink', 'accent', 'green', 'blue', 'red'].includes(color)) return style[color];
  return categories.find((c) => c.id === color)?.color || style.ink;
}

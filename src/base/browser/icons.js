/*---------------------------------------------------------------------------------------------
 *  LionAxon — Copyright (C) 2026 LionAxon Team.
 *  Created and conceived by Daniel Michelon De Carli.
 *  Licensed under the GNU General Public License v3.0 or later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/
// Thin-stroke icons (codicon style), drawn inline as SVG — the same set as the other Lion apps, plus the
// drawing tools of LionAxon.
const svg = (body, size = 16) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

const paths = {
  // tools
  select: '<path d="M6 4l12 7.2-5.3 1.4 3.2 5.8-2.2 1.2-3.2-5.8L6 17.5z"/>',
  box: '<path d="M12 3.8l7.5 4.1v8.2L12 20.2l-7.5-4.1V7.9z"/><path d="M4.5 7.9L12 12l7.5-4.1M12 12v8.2"/>',
  cut: '<path d="M4.5 8.2l6.2-3.4 6.3 3.4v3.3M4.5 8.2v7.6l6.2 3.4v-7.6zM10.7 11.6l6.3-3.4"/><path d="M10.7 19.2l3.6-2" /><path d="M14.8 16.8h6.4" stroke-width="2.2"/>',
  cylinder: '<ellipse cx="12" cy="6.5" rx="6.5" ry="2.6"/><path d="M5.5 6.5v11c0 1.4 2.9 2.6 6.5 2.6s6.5-1.2 6.5-2.6v-11"/>',
  sphere: '<circle cx="12" cy="12" r="7.5"/><path d="M4.5 12c0 1.6 3.4 2.9 7.5 2.9s7.5-1.3 7.5-2.9"/>',
  cone: '<path d="M12 3.5L5.5 17.5M12 3.5l6.5 14"/><ellipse cx="12" cy="17.5" rx="6.5" ry="2.6"/>',
  pyramid: '<path d="M12 3.5L4 16l8 4.5 8-4.5z"/><path d="M12 3.5v17"/>',
  terrain: '<path d="M3 17l5-2.8 4 2.2 9-5"/><path d="M3 17v2.5l5-2.8 4 2.2 9-5V11.4"/><path d="M8 14.2V8.5l8-4.4 5 2.8v4.5"/><path d="M8 8.5l5 2.8 8-4.4M13 11.3v2.6"/>',
  platform: '<path d="M12 6l8.5 4.6L12 15.2 3.5 10.6z"/><path d="M3.5 10.6v3.2L12 18.4l8.5-4.6v-3.2M12 15.2v3.2"/>',
  slope: '<path d="M3.5 17.5l11-6 6 3.3-11 6z"/><path d="M14.5 11.5V6.5l6 3.3v5"/><path d="M3.5 17.5v-0"/>',
  elevation: '<path d="M3 20h18"/><path d="M5 20V9h6v11M13 20v-7h6v7"/><path d="M2.5 6.5h19" stroke-dasharray="2 2"/>',
  levels: '<path d="M12 4l8.5 4.3L12 12.6 3.5 8.3z"/><path d="M3.5 12.2l8.5 4.3 8.5-4.3M3.5 16l8.5 4.3 8.5-4.3"/>',
  wheelchair: '<circle cx="11" cy="4.5" r="1.6"/><path d="M10.5 7.5l.5 6h5l2 5"/><path d="M11 10.5h4.5"/><path d="M8.2 11.2a5 5 0 1 0 7.3 5.6"/>',
  arrow: '<path d="M4 17C8 9 13 7 19.5 7.5"/><path d="M15.5 4.5l4 3-3.4 3.8"/>',
  person: '<circle cx="12" cy="5" r="2"/><path d="M9.2 21l.8-7-1.8-.5.8-5.3h6l.8 5.3-1.8.5.8 7"/>',
  text: '<path d="M5 6V4.5h14V6M12 4.5v15M9 19.5h6"/>',
  // views and navigation
  fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/><rect x="8.5" y="8.5" width="7" height="7" rx="1"/>',
  rotateLeft: '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3L4.5 9"/><path d="M4.5 4.5V9H9"/>',
  rotateRight: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3L19.5 9"/><path d="M19.5 4.5V9H15"/>',
  axon: '<path d="M12 3.8l7.5 4.1v8.2L12 20.2l-7.5-4.1V7.9z"/><path d="M4.5 7.9L12 12l7.5-4.1M12 12v8.2"/>',
  pencil: '<path d="M4 20l1-4.5L16.5 4l3.5 3.5L8.5 19z"/><path d="M14.5 6l3.5 3.5"/>',
  plan: '<rect x="4" y="4" width="16" height="16" rx="1.5"/><path d="M4 12h9v8M13 12V4"/>',
  sheet: '<rect x="3" y="5" width="18" height="14" rx="1.5"/><path d="M6.5 15.5l2.5-3 2 2 3-4 3.5 5"/><path d="M6.5 8.5h5"/>',
  steps: '<rect x="3.5" y="4" width="7" height="7" rx="1"/><rect x="13.5" y="4" width="7" height="7" rx="1"/><rect x="3.5" y="14" width="7" height="6" rx="1"/><path d="M13.5 17h7"/>',
  site: '<path d="M3.5 17.5L9 6.5l11.5 2.5-3 9.5z" stroke-dasharray="2.4 2"/><path d="M8 15l3-6 5 1.2-1.4 4.7z"/>',
  palette: '<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.3 0 2-.8 2-1.8 0-1.4-1.2-1.6-1.2-2.8 0-1 .8-1.6 1.8-1.6h2c2.3 0 3.9-1.6 3.9-3.9C20.5 6.7 16.7 3.5 12 3.5z"/><circle cx="7.5" cy="11" r="1.1"/><circle cx="10.5" cy="7" r="1.1"/><circle cx="15" cy="7.5" r="1.1"/>',
  prev: '<path d="M14.5 6l-6 6 6 6"/>',
  next: '<path d="M9.5 6l6 6-6 6"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  duplicate: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  orbit: '<path d="M12 5.5l5.5 3v6.5L12 18l-5.5-3V8.5z"/><path d="M6.5 8.5L12 11.5l5.5-3M12 11.5V18"/><path d="M3 12.5c0 2.6 4 4.7 9 4.7s9-2.1 9-4.7" stroke-dasharray="0"/><path d="M19.2 15.6l1.8-3.1 1 3.4"/>',
  up: '<path d="M6 14.5l6-6 6 6"/>',
  down: '<path d="M6 9.5l6 6 6-6"/>',
  // files and actions
  newFile: '<path d="M6.5 3.5h7l4 4v13h-11z"/><path d="M13.5 3.5v4h4M12 11v6M9 14h6"/>',
  folderOpen: '<path d="M3 18.5V6.5A1.5 1.5 0 0 1 4.5 5h4.2l2 2.2h7.8A1.5 1.5 0 0 1 20 8.7V10"/><path d="M3 18.5l2.6-7.1A1.5 1.5 0 0 1 7 10.4h13.6a1 1 0 0 1 .95 1.3L19.4 18.9a1.5 1.5 0 0 1-1.4 1.1H4.5A1.5 1.5 0 0 1 3 18.5z"/>',
  save: '<path d="M5 4h11.5L20 7.5V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"/><path d="M8 4v5h7V4M7.5 20v-6h9v6"/>',
  example: '<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>',
  undo: '<path d="M9 7.5L4.5 12 9 16.5"/><path d="M4.5 12H15a4.5 4.5 0 0 1 0 9h-2"/>',
  redo: '<path d="M15 7.5l4.5 4.5-4.5 4.5"/><path d="M19.5 12H9a4.5 4.5 0 0 0 0 9h2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  poly: '<path d="M5 6.5h8.5v5H19V19H5z"/>',
  area: '<path d="M3 16.5l7-4 11 4-7 4z"/><path d="M8.2 14.5l8.6 3.2" stroke-dasharray="2 2"/>',
  tree: '<path d="M12 21v-7"/><circle cx="12" cy="9" r="5.5"/><path d="M12 15.5l2.5-2.5"/>',
  alignFaces: '<path d="M12 3v18"/><path d="M4 6h8v5H4z"/><path d="M12 13h6v5h-6z" stroke-dasharray="2 2"/><path d="M20 15.5h-1.5"/>',
  door: '<path d="M6 20V9a6 6 0 0 1 12 0v11"/><path d="M4 20h16"/>',
  dim: '<path d="M4 8v10M20 8v10M4 13h16"/><path d="M6.5 10.5L4 13l2.5 2.5M17.5 10.5L20 13l-2.5 2.5"/>',
  sunIcon: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/>',
  image: '<rect x="3.5" y="5" width="17" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M4 17l5-4.5 4 3.5 3-2.5 4 3.5"/>',
  film: '<rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="M8 5v14M16 5v14M3.5 9.5H8M3.5 14.5H8M16 9.5h4.5M16 14.5h4.5"/>',
  eye: '<path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12s-3.5 6.5-9.5 6.5S2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
  eyeOff: '<path d="M4 4l16 16M9.9 5.8A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3 3.8M6.3 7.4A17 17 0 0 0 2.5 12s3.5 6.5 9.5 6.5c1.5 0 2.8-.4 4-1"/><path d="M10 10a2.8 2.8 0 0 0 4 4"/>',
  lock: '<rect x="5.5" y="10.5" width="13" height="9.5" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
  unlock: '<rect x="5.5" y="10.5" width="13" height="9.5" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 6.7-1.4"/>',
  focus: '<path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15"/>',
  chevron: '<path d="M6 9.5l6 6 6-6"/>',
  clock: '<circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 2"/>',
  trash: '<path d="M4 7h16M9.5 7V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2M6.5 7l.8 12a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4l.8-12M10 11v6M14 11v6"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/>',
  download: '<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19.5h14"/>',
  highlight: '<path d="M12 3.8l7.5 4.1v8.2L12 20.2l-7.5-4.1V7.9z"/><path d="M4.5 7.9L12 12l7.5-4.1z" fill="currentColor" stroke="none"/>',
  // shared with the other Lion apps
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  auto: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17a8.5 8.5 0 0 0 0-17z" fill="currentColor" stroke="none"/>',
  close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  warning: '<path d="M12 4l9 15.5H3z"/><path d="M12 10v4M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/>',
  refresh: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3L19.5 9"/><path d="M19.5 4.5V9H15"/>',
  sidebar: '<rect x="3.5" y="4.5" width="17" height="15" rx="1.5"/><path d="M9.5 4.5v15"/>',
  panel: '<rect x="3.5" y="4.5" width="17" height="15" rx="1.5"/><path d="M14.5 4.5v15"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17"/><path d="M12 3.5c2.3 2.4 3.4 5.2 3.4 8.5s-1.1 6.1-3.4 8.5c-2.3-2.4-3.4-5.2-3.4-8.5s1.1-6.1 3.4-8.5z"/>',
  shield: '<path d="M12 3.5l7.5 3v5.2c0 4.4-3.1 7.9-7.5 9.3-4.4-1.4-7.5-4.9-7.5-9.3V6.5z"/><path d="M9 12l2.2 2.2L15.5 10"/>',
  keyboard: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10h.01M10 10h.01M13 10h.01M16 10h.01M7 14h10"/>',
};

export function icon(name, size) {
  return svg(paths[name] || '', size);
}

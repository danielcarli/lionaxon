/*---------------------------------------------------------------------------------------------
 *  LionAxon — Copyright (C) 2026 LionAxon Team.
 *  Created and conceived by Daniel Michelon De Carli.
 *  Licensed under the GNU General Public License v3.0 or later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/
// Which steps to export, as people write it: "7", "3-7", "3 a 7", "1, 4, 6-8", "3-" (to the last), "-5" (from
// the first), "*" or "-" (every step).
// Steps are counted from 1 in the text and from 0 in the result.

const ALL = /^(\*|all|todas?|tudo|todos|toutes?|tous|alle|tutte|tutti|すべて|全部|모두)$/i;

/**
 * @param {string} text what was typed; empty means `current`
 * @param {number} count how many steps the project has
 * @param {number} current the step shown now (0-based), for an empty field
 * @returns {{ indexes: number[], error: string|null }} the steps in order, without repeats; `error` names the
 *   part that could not be read or the number out of range ('' parts are skipped)
 */
export function parseStepRange(text, count, current = 0) {
  const src = String(text ?? '').trim();
  if (!src) return { indexes: [Math.max(0, Math.min(count - 1, current))], error: null };
  if (ALL.test(src)) return { indexes: Array.from({ length: count }, (_, i) => i), error: null };
  const out = new Set();
  for (const raw of src.split(/[,;]+/)) {
    const part = raw.trim();
    if (!part) continue;
    // a range: 3-7, 3–7, 3 a 7, 3 to 7, 3..7, 3:7; an open end runs to the last step (3-, 3 a) or from the
    // first (-5); the dash alone is every step
    const m = /^(\d*)\s*(?:-|–|—|\.\.|:|(?:^|\s)(?:a|to|até|ate|à|bis|al)(?:\s|$))\s*(\d*)$/i.exec(part);
    const one = /^\d+$/.test(part) ? Number(part) : null;
    let a, b;
    if (one != null) { a = b = one; } else if (m && (m[1] || m[2] || /^[-–—]$/.test(part))) { a = m[1] ? Number(m[1]) : 1; b = m[2] ? Number(m[2]) : count; } else return { indexes: [], error: part };
    if (a > b) [a, b] = [b, a];
    if (a < 1 || b > count) return { indexes: [], error: part };
    for (let i = a; i <= b; i++) out.add(i - 1);
  }
  if (!out.size) return { indexes: [], error: src };
  return { indexes: [...out].sort((x, y) => x - y), error: null };
}

/** The steps written back short: [2,3,4,5,6,8] → "3–7, 9". */
export function formatStepRange(indexes) {
  const parts = [];
  const sorted = [...indexes].sort((a, b) => a - b);
  for (let i = 0; i < sorted.length; i++) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    parts.push(j > i ? `${sorted[i] + 1}–${sorted[j] + 1}` : String(sorted[i] + 1));
    i = j;
  }
  return parts.join(', ');
}

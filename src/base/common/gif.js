/*---------------------------------------------------------------------------------------------
 *  LionAxon — Copyright (C) 2026 LionAxon Team.
 *  Created and conceived by Daniel Michelon De Carli.
 *  Licensed under the GNU General Public License v3.0 or later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/
// A small animated GIF writer (GIF89a, one palette for the whole animation, LZW). The drawings are flat
// colours with thin edges, so one palette of the 256 most used colours carries them well.

/** The palette of a set of RGBA frames: up to 256 colours, the most used first (as [r, g, b]). */
export function buildPalette(frames, max = 256) {
  const count = new Map();
  for (const px of frames) {
    for (let i = 0; i < px.length; i += 4) {
      // 5 bits a channel: close colours (the soft edges) fall together
      const key = ((px[i] >> 3) << 10) | ((px[i + 1] >> 3) << 5) | (px[i + 2] >> 3);
      const c = count.get(key);
      if (c) { c.n++; c.r += px[i]; c.g += px[i + 1]; c.b += px[i + 2]; } else count.set(key, { n: 1, r: px[i], g: px[i + 1], b: px[i + 2] });
    }
  }
  return [...count.values()].sort((a, b) => b.n - a.n).slice(0, max).map((c) => [Math.round(c.r / c.n), Math.round(c.g / c.n), Math.round(c.b / c.n)]);
}

/** The index of the palette colour nearest to each pixel of an RGBA frame. */
export function mapToPalette(px, palette) {
  const out = new Uint8Array(px.length / 4);
  const cache = new Map();
  for (let i = 0, j = 0; i < px.length; i += 4, j++) {
    const key = (px[i] << 16) | (px[i + 1] << 8) | px[i + 2];
    let k = cache.get(key);
    if (k === undefined) {
      let best = Infinity;
      k = 0;
      for (let p = 0; p < palette.length; p++) {
        const dr = px[i] - palette[p][0], dg = px[i + 1] - palette[p][1], db = px[i + 2] - palette[p][2];
        const d = dr * dr * 2 + dg * dg * 4 + db * db;
        if (d < best) { best = d; k = p; if (!d) break; }
      }
      cache.set(key, k);
    }
    out[j] = k;
  }
  return out;
}

/** LZW as GIF wants it: variable code size, clear code first, the table reset when it fills. */
export function lzw(indices, minCodeSize) {
  const clear = 1 << minCodeSize, end = clear + 1;
  const bytes = [];
  let bits = 0, nbits = 0;
  const put = (code, size) => {
    bits |= code << nbits;
    nbits += size;
    while (nbits >= 8) { bytes.push(bits & 255); bits >>>= 8; nbits -= 8; }
  };
  let table = new Map(), next = end + 1, size = minCodeSize + 1;
  put(clear, size);
  let cur = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i];
    const key = (cur << 8) | k;
    const hit = table.get(key);
    if (hit !== undefined) { cur = hit; continue; }
    put(cur, size);
    if (next < 4096) {
      table.set(key, next++);
      if (next > (1 << size) && size < 12) size++;
    } else {
      put(clear, size);
      table = new Map();
      next = end + 1;
      size = minCodeSize + 1;
    }
    cur = k;
  }
  put(cur, size);
  put(end, size);
  if (nbits > 0) bytes.push(bits & 255);
  return bytes;
}

/**
 * An animated GIF from RGBA frames of the same size. `delays` are in hundredths of a second (one per
 * frame, or one for all); `loop` 0 repeats for ever.
 */
export function encodeGif(frames, width, height, { delays = 150, loop = 0 } = {}) {
  const palette = buildPalette(frames);
  let bitsPerPixel = 1;
  while ((1 << bitsPerPixel) < palette.length) bitsPerPixel++;
  bitsPerPixel = Math.max(2, bitsPerPixel);
  const size = 1 << bitsPerPixel;
  const out = [];
  const word = (v) => out.push(v & 255, (v >> 8) & 255);
  out.push(...[...'GIF89a'].map((c) => c.charCodeAt(0)));
  word(width); word(height);
  out.push(0x80 | 0x70 | (bitsPerPixel - 1), 0, 0);
  for (let i = 0; i < size; i++) out.push(...(palette[i] || [0, 0, 0]));
  out.push(0x21, 0xff, 11, ...[...'NETSCAPE2.0'].map((c) => c.charCodeAt(0)), 3, 1); word(loop); out.push(0);
  frames.forEach((px, f) => {
    const delay = Array.isArray(delays) ? delays[f] ?? delays[delays.length - 1] : delays;
    out.push(0x21, 0xf9, 4, 0x04); word(delay); out.push(0, 0);
    out.push(0x2c); word(0); word(0); word(width); word(height); out.push(0);
    out.push(bitsPerPixel);
    const data = lzw(mapToPalette(px, palette), bitsPerPixel);
    for (let i = 0; i < data.length; i += 255) { const n = Math.min(255, data.length - i); out.push(n); for (let k = 0; k < n; k++) out.push(data[i + k]); }
    out.push(0);
  });
  out.push(0x3b);
  return Uint8Array.from(out);
}

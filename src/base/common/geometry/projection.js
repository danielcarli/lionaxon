/*---------------------------------------------------------------------------------------------
 *  LionAxon — Copyright (C) 2026 LionAxon Team.
 *  Created and conceived by Daniel Michelon De Carli.
 *  Licensed under the GNU General Public License v3.0 or later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/
// Parallel (axonometric) projection. World: x east, y north, z up, in metres. The camera sits on the
// direction `cam` (azimuth `az` from east, counter-clockwise; elevation `el` above the horizon) and looks
// at the scene; screen X grows to the right and screen Y grows downwards, in metres of the drawing.
const D = Math.PI / 180;

export const ISO_ELEVATION = 35.2644; // true isometric: the three axes keep the same scale

export function makeView(az = -45, el = ISO_ELEVATION) {
  const a = az * D, e = el * D;
  const ce = Math.cos(e), se = Math.sin(e), ca = Math.cos(a), sa = Math.sin(a);
  return {
    az, el,
    plan: el > 89.5,
    cam: [ce * ca, ce * sa, se],          // towards the camera
    e1: [-sa, ca, 0],                     // screen right
    e2: [-se * ca, -se * sa, ce],         // screen up
  };
}

/** The plan view: seen from above, north up. */
export const planView = () => makeView(-90, 90);

export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** World point → screen [X, Y]. */
export function project(v, p) {
  return [p[0] * v.e1[0] + p[1] * v.e1[1] + p[2] * v.e1[2], -(p[0] * v.e2[0] + p[1] * v.e2[1] + p[2] * v.e2[2])];
}

/** Distance from the camera along the view direction (larger = farther). */
export const depth = (v, p) => -dot(p, v.cam);

/** Screen [X, Y] → the world point [x, y] on the horizontal plane at height z. */
export function unproject(v, X, Y, z = 0) {
  const u = X, w = -Y;
  const s = (z - w * v.e2[2]) / v.cam[2];
  return [u * v.e1[0] + w * v.e2[0] + s * v.cam[0], u * v.e1[1] + w * v.e2[1] + s * v.cam[1]];
}

/** How many screen units one metre of height takes (used for vertical handles and people). */
export const verticalScale = (v) => v.e2[2];

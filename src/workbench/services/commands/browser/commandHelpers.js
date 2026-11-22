/*---------------------------------------------------------------------------------------------
 *  LionAxon — Copyright (C) 2026 LionAxon Team.
 *  Created and conceived by Daniel Michelon De Carli.
 *  Licensed under the GNU General Public License v3.0 or later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/
// Model helpers used by the commands.
import { newId, clone } from '../../model/common/model.js';

export { newId, clone };

export const createCategory = (name, color) => ({ id: newId('k'), name, color });

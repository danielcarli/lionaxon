/*---------------------------------------------------------------------------------------------
 *  LionAxon — Copyright (C) 2026 LionAxon Team.
 *  Created and conceived by Daniel Michelon De Carli.
 *  Licensed under the GNU General Public License v3.0 or later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/
// New versions: the state shown by the versions window. Nothing is checked on its own: the check runs
// only when the person presses "Check now" (the app's only network access).
import { Emitter } from '../../../../base/common/event.js';

export class UpdateService {
  #onDidChange = new Emitter();
  onDidChange = this.#onDidChange.event;

  /** @type {'idle'|'checking'|'current'|'available'|'error'} */
  status = 'idle';
  info = null;
  version = '';

  constructor({ host }) {
    this.host = host;
    host.appInfo().then((i) => { this.version = i.version || ''; this.#onDidChange.fire(); }, () => {});
  }

  async check() {
    if (this.status === 'checking') return this.info;
    this.status = 'checking';
    this.#onDidChange.fire();
    let info;
    try { info = await this.host.update.check(); } catch (err) { info = { ok: false, error: String(err?.message || err) }; }
    this.info = info;
    this.status = !info.ok ? 'error' : info.available ? 'available' : 'current';
    this.#onDidChange.fire();
    return info;
  }

  openReleasePage() { return this.host.update.openReleasePage(); }
}

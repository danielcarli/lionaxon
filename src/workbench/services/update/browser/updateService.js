/*---------------------------------------------------------------------------------------------
 *  LionAxon — Copyright (C) 2026 LionAxon Team.
 *  Created and conceived by Daniel Michelon De Carli.
 *  Licensed under the GNU General Public License v3.0 or later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/
// New versions: the state shown by the versions window. Nothing is checked on its own: the check runs only
// when the person presses "Check now", and the installer comes only when they press "Update now" (the app's
// only network access).
import { Emitter } from '../../../../base/common/event.js';

export class UpdateService {
  #onDidChange = new Emitter();
  onDidChange = this.#onDidChange.event;

  /** @type {'idle'|'checking'|'current'|'available'|'error'|'downloading'|'ready'|'failed'} */
  status = 'idle';
  info = null;
  version = '';
  progress = null;   // { received, total } while the installer comes
  result = null;     // what "Update now" answered

  constructor({ host }) {
    this.host = host;
    host.update.onProgress?.((p) => { this.progress = p; this.#onDidChange.fire(); });
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

  /** Downloads the installer of this copy, checks it and opens it (only where the release has one for it). */
  async install() {
    if (this.status === 'downloading') return this.result;
    this.status = 'downloading';
    this.progress = null;
    this.result = null;
    this.#onDidChange.fire();
    let result;
    try { result = await this.host.update.install(); } catch (err) { result = { ok: false, error: String(err?.message || err) }; }
    this.result = result;
    this.status = result.ok ? 'ready' : 'failed';
    this.#onDidChange.fire();
    return result;
  }

  openReleasePage() { return this.host.update.openReleasePage(); }
}

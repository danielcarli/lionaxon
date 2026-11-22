/*---------------------------------------------------------------------------------------------
 *  LionAxon — Copyright (C) 2026 LionAxon Team.
 *  Created and conceived by Daniel Michelon De Carli.
 *  Licensed under the GNU General Public License v3.0 or later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/
// The open diagrams (one tab each) and, for the active one: its data, the current step, the selection,
// the active level, the file it came from, undo and redo. Every change goes through run() (one undo entry)
// or through a gesture (begin → update… → end, one undo entry for a whole drag), always by name, so the
// same commands can serve the interface, scripts and agents. The open tabs are kept in a session copy
// while the person works, so closing the app never loses work.
import { Emitter } from '../../../../base/common/event.js';
import { createProject, normalizeProject, copyStep, clone, stepHasContent, GROUND_LEVEL } from '../../model/common/model.js';

/** The examples that come with the app, in the order the menu lists them. */
export const EXAMPLES = ['parti', 'plateaus', 'tower', 'slope', 'school', 'corner'];
import { getLocale } from '../../../../base/common/nls.js';

const UNDO_LIMIT = 200;
const SESSION_DELAY = 700;
let tabCounter = 0;

function newTab(project, { path = null, dirty = false } = {}) {
  return {
    id: `t${++tabCounter}`, project, stepIndex: 0, selection: new Set(), path, dirty,
    undo: [], redo: [], level: project.levels?.[0]?.id || GROUND_LEVEL,
  };
}

const isPristine = (tab) => !tab.path && !tab.dirty && !tab.undo.length && tab.project.steps.length === 1 && !tab.project.steps[0].objects.length;

export class DocumentService {
  #onDidChange = new Emitter();
  /**
   * fired with { kind: 'content' | 'step' | 'selection' | 'file' | 'load' | 'tabs' | 'level', live?: boolean }
   * 'load' carries { tabId, prevTabId } when the active diagram changes.
   */
  onDidChange = this.#onDidChange.event;

  tabs = [newTab(createProject())];
  active = 0;
  #gesture = null;
  #sessionTimer = null;

  constructor(host) {
    this.host = host;
  }

  // ---- the active tab

  get tab() { return this.tabs[this.active]; }
  get project() { return this.tab.project; }
  set project(p) { this.tab.project = p; }
  get stepIndex() { return this.tab.stepIndex; }
  set stepIndex(i) { this.tab.stepIndex = i; }
  get selection() { return this.tab.selection; }
  set selection(s) { this.tab.selection = s; }
  get path() { return this.tab.path; }
  set path(p) { this.tab.path = p; }
  get dirty() { return this.tab.dirty; }
  set dirty(d) { this.tab.dirty = d; }
  /** The level new objects are drawn on (a reference plane of the project). */
  get activeLevel() {
    const ok = this.project.levels.some((l) => l.id === this.tab.level);
    return ok ? this.tab.level : this.project.levels[0]?.id || GROUND_LEVEL;
  }

  get step() { return this.project.steps[this.stepIndex]; }
  get objects() { return this.step.objects; }
  get canUndo() { return this.tab.undo.length > 0; }
  get canRedo() { return this.tab.redo.length > 0; }
  get displayName() { return nameOf(this.tab); }
  nameOf(tab) { return nameOf(tab); }

  byId(id) { return this.objects.find((o) => o.id === id); }
  selected() { return this.objects.filter((o) => this.selection.has(o.id)); }

  /**
   * The state kept for undo. The image under the drawing would make every entry megabytes long: it is
   * kept once, aside, and the entry only names it.
   */
  #snapshot() {
    const src = this.project.underlay?.src;
    let project;
    if (src) {
      const token = `@image:${src.length}:${src.slice(-24)}`;
      (this.tab.images ??= new Map()).set(token, src);
      project = JSON.stringify(this.project, (k, v) => (k === 'src' && v === src ? token : v));
    } else project = JSON.stringify(this.project);
    return { project, stepIndex: this.stepIndex, selection: [...this.selection] };
  }

  #restore(s) {
    this.project = JSON.parse(s.project);
    const u = this.project.underlay;
    if (u && this.tab.images?.has(u.src)) u.src = this.tab.images.get(u.src);
    this.stepIndex = Math.min(s.stepIndex, this.project.steps.length - 1);
    this.selection = new Set(s.selection.filter((id) => this.byId(id)));
  }

  #fire(kind, extra = {}) { this.#onDidChange.fire({ kind, ...extra }); }

  #changed(live = false) {
    const wasDirty = this.dirty;
    this.dirty = true;
    this.#fire('content', { live });
    if (!wasDirty) this.#fire('tabs');
    if (!live) this.#scheduleSession();
  }

  /**
   * Runs a named change as one undo entry. `fn(project, step)` mutates the project; it may return an array
   * of ids to select afterwards.
   */
  run(name, fn) {
    const before = this.#snapshot();
    const res = fn(this.project, this.step);
    this.tab.undo.push({ name, state: before });
    if (this.tab.undo.length > UNDO_LIMIT) this.tab.undo.shift();
    this.tab.redo = [];
    if (Array.isArray(res)) this.selection = new Set(res);
    this.#prune();
    this.#changed();
    if (Array.isArray(res)) this.#fire('selection');
    return res;
  }

  /** Starts a drag: one undo entry for everything until end(). */
  begin(name) {
    this.#gesture = { name, state: this.#snapshot(), moved: false };
  }

  update(fn) {
    if (!this.#gesture) return;
    fn(this.project, this.step);
    this.#gesture.moved = true;
    this.#changed(true);
  }

  end() {
    const g = this.#gesture;
    this.#gesture = null;
    if (!g || !g.moved) return;
    this.tab.undo.push({ name: g.name, state: g.state });
    if (this.tab.undo.length > UNDO_LIMIT) this.tab.undo.shift();
    this.tab.redo = [];
    this.#changed();
  }

  undo() {
    const entry = this.tab.undo.pop();
    if (!entry) return null;
    this.tab.redo.push({ name: entry.name, state: this.#snapshot() });
    this.#restore(entry.state);
    this.#changed();
    this.#fire('step');
    this.#fire('selection');
    return entry.name;
  }

  redo() {
    const entry = this.tab.redo.pop();
    if (!entry) return null;
    this.tab.undo.push({ name: entry.name, state: this.#snapshot() });
    this.#restore(entry.state);
    this.#changed();
    this.#fire('step');
    this.#fire('selection');
    return entry.name;
  }

  /** Drops references to objects and levels that no longer exist (after a delete). */
  #prune() {
    const ids = new Set(this.objects.map((o) => o.id));
    for (const id of [...this.selection]) if (!ids.has(id)) this.selection.delete(id);
    const levels = new Set(this.project.levels.map((l) => l.id));
    for (const s of this.project.steps) {
      const here = new Set(s.objects.map((o) => o.id));
      for (const o of s.objects) {
        if (o.type === 'volume' && o.on && !here.has(o.on)) o.on = null;
        if (o.type === 'cut' && o.target && !here.has(o.target)) o.target = null;
        if (o.level && !levels.has(o.level)) o.level = null;
        if (o.type === 'slope') { if (o.from && !levels.has(o.from)) o.from = null; if (o.to && !levels.has(o.to)) o.to = null; }
      }
    }
  }

  // ---- selection, steps, level

  select(ids, { add = false } = {}) {
    const next = add ? new Set(this.selection) : new Set();
    for (const id of ids) {
      if (add && next.has(id)) next.delete(id);
      else next.add(id);
    }
    this.selection = next;
    this.#fire('selection');
  }

  clearSelection() {
    if (!this.selection.size) return;
    this.selection = new Set();
    this.#fire('selection');
  }

  setStep(i) {
    const n = Math.max(0, Math.min(this.project.steps.length - 1, i));
    if (n === this.stepIndex) return;
    this.stepIndex = n;
    this.selection = new Set([...this.selection].filter((id) => this.byId(id)));
    this.#fire('step');
    this.#fire('selection');
  }

  setActiveLevel(id) {
    if (!this.project.levels.some((l) => l.id === id) || id === this.tab.level) return;
    this.tab.level = id;
    this.#fire('level');
  }

  addStep() {
    this.run('step.add', (p) => {
      p.steps.splice(this.stepIndex + 1, 0, copyStep(this.step));
    });
    this.setStep(this.stepIndex + 1);
  }

  moveStep(from, to) {
    if (to < 0 || to >= this.project.steps.length || from === to) return;
    this.run('step.move', (p) => {
      const [s] = p.steps.splice(from, 1);
      p.steps.splice(to, 0, s);
    });
    this.stepIndex = to;
    this.#fire('step');
  }

  removeStep(i) {
    if (this.project.steps.length <= 1) return false;
    this.run('step.remove', (p) => {
      p.steps.splice(i, 1);
      // the index is fixed before anyone hears of the change
      this.stepIndex = Math.min(this.stepIndex > i ? this.stepIndex - 1 : this.stepIndex, p.steps.length - 1);
    });
    this.#fire('step');
    return true;
  }

  stepHasContent(i) { return stepHasContent(this.project.steps[i]); }

  // ---- tabs

  #announceSwitch(prevTabId) {
    this.#fire('load', { tabId: this.tab.id, prevTabId });
    this.#fire('step');
    this.#fire('selection');
    this.#fire('file');
    this.#fire('tabs');
    this.#fire('level');
  }

  switchTo(i) {
    if (i < 0 || i >= this.tabs.length || i === this.active) return;
    const prev = this.tab.id;
    this.active = i;
    this.#announceSwitch(prev);
    this.#scheduleSession();
  }

  /**
   * Opens a project in a tab: the same file again only switches to it; an untouched empty tab is reused;
   * otherwise a new tab is added.
   */
  openTab(project, { path = null, dirty = false } = {}) {
    if (path) {
      const same = this.tabs.findIndex((t) => t.path && t.path === path);
      if (same >= 0) { this.switchTo(same); return this.tabs[same]; }
    }
    const prev = this.tab?.id;
    const tab = newTab(project, { path, dirty });
    if (this.tab && isPristine(this.tab)) this.tabs[this.active] = tab;
    else { this.tabs.push(tab); this.active = this.tabs.length - 1; }
    this.#announceSwitch(prev);
    this.#scheduleSession(0);
    return tab;
  }

  /** Closes a tab (the caller has already asked about unsaved changes). The last tab becomes a new empty one. */
  closeTab(i) {
    if (i < 0 || i >= this.tabs.length) return;
    const prev = this.tab.id;
    this.tabs.splice(i, 1);
    if (!this.tabs.length) this.tabs.push(newTab(createProject()));
    if (this.active >= this.tabs.length || this.active > i) this.active = Math.max(0, this.active - 1);
    this.#announceSwitch(prev);
    this.#scheduleSession(0);
  }

  moveTab(from, to) {
    if (from === to || to < 0 || to >= this.tabs.length) return;
    const activeId = this.tab.id;
    const [t] = this.tabs.splice(from, 1);
    this.tabs.splice(to, 0, t);
    this.active = this.tabs.findIndex((x) => x.id === activeId);
    this.#fire('tabs');
    this.#scheduleSession();
  }

  // ---- files

  loadText(text, opts) {
    return this.openTab(normalizeProject(JSON.parse(text)), opts);
  }

  newProject() {
    this.openTab(createProject());
  }

  /** Opens one of the examples that come with the app, in a tab of its own. */
  async loadExample(id = 'parti') {
    const res = await this.host.project.example(getLocale(), id);
    if (!res?.ok) throw new Error(res?.error || 'example');
    this.loadText(res.text, { dirty: false });
  }

  async open() {
    const res = await this.host.project.open();
    if (!res) return null;
    if (!res.ok) throw new Error(res.error);
    this.loadText(res.text, { path: res.path });
    return res;
  }

  async openPath(file) {
    const res = await this.host.project.openPath(file);
    if (!res?.ok) throw new Error(res?.error || 'open');
    this.loadText(res.text, { path: res.path });
    return res;
  }

  serialize(tab = this.tab) {
    return JSON.stringify(tab.project, null, 2) + '\n';
  }

  /** Saves the active tab (or another one). Returns null when the person cancels the dialog. */
  async save({ as = false, tab = this.tab } = {}) {
    const res = await this.host.project.save(as ? null : tab.path, this.serialize(tab), nameOf(tab) || null);
    if (!res) return null;
    if (!res.ok) throw new Error(res.error);
    tab.path = res.path;
    tab.dirty = false;
    this.#fire('file');
    this.#fire('tabs');
    this.#scheduleSession(0);
    return res;
  }

  /** Reopens the tabs of the last session (saved or not). Returns false when there is none. */
  async restore() {
    const rec = await this.host.recovery.read().catch(() => null);
    if (!rec?.text) return false;
    let session;
    try {
      const data = JSON.parse(rec.text);
      session = Array.isArray(data.tabs) ? data : { active: 0, tabs: [{ project: data, path: rec.path, dirty: rec.dirty }] }; // 0.1: one project
    } catch { return false; }
    const tabs = [];
    let anyDirty = false;
    for (const t of session.tabs) {
      try {
        if (t.reload && t.path) {
          const res = await this.host.project.openPath(t.path);
          if (res?.ok) tabs.push(newTab(normalizeProject(JSON.parse(res.text)), { path: res.path }));
          continue;
        }
        tabs.push(newTab(normalizeProject(t.project), { path: t.path || null, dirty: !!t.dirty }));
        anyDirty ||= !!t.dirty;
      } catch { /* a broken tab is left out */ }
    }
    if (!tabs.length) return false;
    const prev = this.tab.id;
    this.tabs = tabs;
    this.active = Math.min(Math.max(0, session.active | 0), tabs.length - 1);
    this.#announceSwitch(prev);
    return { dirty: anyDirty, count: tabs.length };
  }

  /**
   * The session as it should be kept. `discard` lists tabs whose unsaved changes the person chose to
   * throw away: a saved file is reopened from disk next time, an unsaved one is left out.
   */
  sessionText(discard = new Set()) {
    const tabs = [];
    let active = 0;
    this.tabs.forEach((t, i) => {
      if (discard.has(t.id)) {
        if (t.path) tabs.push({ path: t.path, reload: true });
        else return;
      } else if (!t.dirty && t.path) tabs.push({ path: t.path, reload: true });
      else tabs.push({ project: t.project, path: t.path, dirty: t.dirty });
      if (i === this.active) active = tabs.length - 1;
    });
    return JSON.stringify({ version: 2, active, tabs });
  }

  async writeSession(discard) {
    clearTimeout(this.#sessionTimer);
    const dirty = this.tabs.some((t) => t.dirty && !discard?.has(t.id));
    await this.host.recovery.write(this.sessionText(discard), { path: null, dirty }).catch(() => {});
  }

  #scheduleSession(delay = SESSION_DELAY) {
    clearTimeout(this.#sessionTimer);
    this.#sessionTimer = setTimeout(() => this.writeSession(), delay);
  }

  /** For tests: a copy of the project as it is now. */
  snapshotProject() { return clone(this.project); }
}

function nameOf(tab) {
  return tab.project.name || (tab.path ? tab.path.split(/[\\/]/).pop().replace(/\.lionaxon$/i, '') : '');
}

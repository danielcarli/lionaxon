/*---------------------------------------------------------------------------------------------
 *  LionAxon — Copyright (C) 2026 LionAxon Team.
 *  Created and conceived by Daniel Michelon De Carli.
 *  Licensed under the GNU General Public License v3.0 or later. See LICENSE in the project root.
 *--------------------------------------------------------------------------------------------*/
// Layout state: the activity in the side bar, the editor tab (axonometric, plan, sheet), side bar and
// properties visibility, the active tool and the interface theme.
import { Emitter } from '../../../../base/common/event.js';

export const ACTIVITIES = ['steps', 'project', 'categories', 'sheet'];
export const TABS = ['axon', 'plan', 'elev', 'sheet', 'orbit'];
// 'site' is not in the toolbar: it draws the outline of the site, from the Project pane
export const TOOLS = ['select', 'align', 'box', 'cut', 'terrain', 'arrow', 'dim', 'person', 'tree', 'label', 'site'];
export const TERRAIN_KINDS = ['platform', 'slope', 'area'];
/** Interface themes: follow the system, light, dark, and two light themes with their own colours. */
export const THEMES = ['auto', 'light', 'dark', 'map', 'riverfront'];
const THEME_KEY = 'lionaxon.theme';
const HINTS_KEY = 'lionaxon.hints';

export class LayoutService {
  #onDidChange = new Emitter();
  #onDidChangeTheme = new Emitter();
  /** fired with the name of what changed: 'activity' | 'tab' | 'sidebar' | 'properties' | 'tool' */
  onDidChange = this.#onDidChange.event;
  onDidChangeTheme = this.#onDidChangeTheme.event;

  activity = 'steps';
  tab = 'axon';
  lastDrawingTab = 'axon';
  sidebarVisible = true;
  propertiesVisible = true;
  tool = 'select';
  /** options of the drawing tools: the shape the box tool draws, what the terrain tool draws */
  shape = 'box';
  cutShape = 'box';
  /** the terrain drawn see-through in the editor, with the grid on its surfaces */
  terrainMesh = true;
  terrainKind = 'platform';
  /** only the drawing: both panels hidden (they come back as they were) */
  focusMode = false;
  /** the explanations under the fields of the panels */
  hintsVisible = true;

  constructor(host) {
    this.host = host;
    let pref = 'auto';
    try { pref = localStorage.getItem(THEME_KEY) || 'auto'; } catch { /* storage unavailable */ }
    pref = { mapa: 'map', orla: 'riverfront' }[pref] || pref; // the names used before 0.8
    this.themePreference = THEMES.includes(pref) ? pref : 'auto';
    try { this.hintsVisible = localStorage.getItem(HINTS_KEY) !== 'off'; } catch { /* storage unavailable */ }
    document.documentElement.dataset.hints = this.hintsVisible ? 'on' : 'off';
    this.media = matchMedia('(prefers-color-scheme: dark)');
    this.media.addEventListener('change', () => this.#applyTheme());
    this.#applyTheme();
  }

  setActivity(id) {
    if (!ACTIVITIES.includes(id)) return;
    if (id === this.activity) {
      if (!this.sidebarVisible) this.toggleSidebar();
      return;
    }
    this.activity = id;
    if (!this.sidebarVisible) { this.sidebarVisible = true; this.#onDidChange.fire('sidebar'); }
    this.#onDidChange.fire('activity');
    if (id === 'sheet') this.setTab('sheet');
    else if (this.tab === 'sheet') this.setTab(this.lastDrawingTab);
  }

  setTab(id) {
    if (!TABS.includes(id) || id === this.tab) return;
    this.tab = id;
    if (id !== 'sheet') this.lastDrawingTab = id;
    this.#onDidChange.fire('tab');
    if (id === 'sheet' && this.activity !== 'sheet') { this.activity = 'sheet'; this.#onDidChange.fire('activity'); }
    if (id !== 'sheet' && this.activity === 'sheet') { this.activity = 'steps'; this.#onDidChange.fire('activity'); }
  }

  setTool(id) {
    if (!TOOLS.includes(id) || id === this.tool) return;
    this.tool = id;
    this.#onDidChange.fire('tool');
  }

  /** Picks a tool with an option (the box tool with a shape, the terrain tool with platform or slope). */
  setToolOption(key, value) {
    if (key === 'shape') this.shape = value;
    else if (key === 'cutShape') this.cutShape = value;
    else if (key === 'terrainKind' && TERRAIN_KINDS.includes(value)) this.terrainKind = value;
    else return;
    this.tool = key === 'shape' ? 'box' : key === 'cutShape' ? 'cut' : 'terrain';
    this.#onDidChange.fire('tool');
  }

  toggleTerrainMesh() {
    this.terrainMesh = !this.terrainMesh;
    this.#onDidChange.fire('terrainMesh');
  }

  /** Tells the listeners that something they show may have changed (e.g. 'hint': the tool of a view). */
  notify(what) { this.#onDidChange.fire(what); }

  toggleSidebar() {
    this.sidebarVisible = !this.sidebarVisible;
    this.focusMode = false;
    this.#onDidChange.fire('sidebar');
  }

  toggleProperties() {
    this.propertiesVisible = !this.propertiesVisible;
    this.focusMode = false;
    this.#onDidChange.fire('properties');
  }

  /** Only the drawing: hides the side bar and the properties; again, and they come back as they were. */
  toggleFocus() {
    if (!this.focusMode) {
      this.beforeFocus = { sidebar: this.sidebarVisible, properties: this.propertiesVisible };
      this.sidebarVisible = false;
      this.propertiesVisible = false;
      this.focusMode = true;
    } else {
      this.sidebarVisible = this.beforeFocus?.sidebar ?? true;
      this.propertiesVisible = this.beforeFocus?.properties ?? true;
      this.focusMode = false;
    }
    this.#onDidChange.fire('sidebar');
    this.#onDidChange.fire('properties');
  }

  /** Shows or hides the explanations under the fields of the panels. */
  toggleHints() {
    this.hintsVisible = !this.hintsVisible;
    try { localStorage.setItem(HINTS_KEY, this.hintsVisible ? 'on' : 'off'); } catch { /* storage unavailable */ }
    document.documentElement.dataset.hints = this.hintsVisible ? 'on' : 'off';
    this.#onDidChange.fire('hints');
  }

  get isDark() {
    return this.themePreference === 'dark' || (this.themePreference === 'auto' && this.media.matches);
  }

  /** @param {'auto'|'light'|'dark'|'map'|'riverfront'} pref */
  setTheme(pref) {
    if (!THEMES.includes(pref) || pref === this.themePreference) return;
    this.themePreference = pref;
    try { localStorage.setItem(THEME_KEY, pref); } catch { /* storage unavailable */ }
    this.#applyTheme();
  }

  #applyTheme() {
    const root = document.documentElement;
    if (this.themePreference === 'auto') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', this.themePreference);
    this.host.setTheme(this.isDark, this.isDark ? 'dark' : this.themePreference === 'auto' ? 'light' : this.themePreference);
    this.#onDidChangeTheme.fire(this.isDark);
  }
}

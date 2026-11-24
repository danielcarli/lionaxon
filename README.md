<div align="center">

<img src="src/workbench/browser/media/logo.svg" width="96" height="96" alt="LionAxon logo">

# LionAxon

### Your design idea, told in blocks.

**Parti diagrams and massing studies for architecture — from the first volume to the printed sheet.**<br>
Simple to learn in an afternoon. The same app on Windows, macOS and Linux. Free.

<sub>by the <b>LionAxon Team</b> · created and conceived by <b>Daniel Michelon De Carli</b> · part of the Lion family, with <a href="https://github.com/danielcarli/lionorganizer">LionOrganizer</a> and <a href="https://github.com/danielcarli/lionphotos">LionPhotos</a></sub>

**English** · [Português (Brasil)](docs/README.pt-BR.md)

![Version 0.21.3](https://img.shields.io/badge/version-0.21.3-23272b)
![Experimental](https://img.shields.io/badge/status-experimental-b5532d)
![Platforms: Windows, macOS, Linux](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-23272b)
![10 languages](https://img.shields.io/badge/languages-10-d0673f)
![License: GPL-3.0](https://img.shields.io/badge/license-GPL--3.0-b5532d)

<p>
  <a href="https://github.com/danielcarli/lionaxon/releases/latest/download/LionAxon-Setup.exe"><img src="https://img.shields.io/badge/Windows-Download%20.exe-b5532d?style=for-the-badge&labelColor=23272b" alt="LionAxon-Setup.exe"></a>
  <a href="https://github.com/danielcarli/lionaxon/releases/latest/download/LionAxon-mac-universal.dmg"><img src="https://img.shields.io/badge/macOS-Download%20.dmg-b5532d?style=for-the-badge&labelColor=23272b" alt="LionAxon-mac-universal.dmg"></a>
  <a href="https://github.com/danielcarli/lionaxon/releases/latest/download/lionaxon_amd64.deb"><img src="https://img.shields.io/badge/Linux-Download%20.deb-b5532d?style=for-the-badge&labelColor=23272b" alt="lionaxon_amd64.deb"></a>
  <a href="https://github.com/danielcarli/lionaxon/releases/latest/download/lionaxon.x86_64.rpm"><img src="https://img.shields.io/badge/Linux-Download%20.rpm-b5532d?style=for-the-badge&labelColor=23272b" alt="lionaxon.x86_64.rpm"></a>
  <a href="https://github.com/danielcarli/lionaxon/releases/latest/download/LionAxon-x86_64.AppImage"><img src="https://img.shields.io/badge/Linux-Download%20AppImage-b5532d?style=for-the-badge&labelColor=23272b" alt="LionAxon-x86_64.AppImage"></a>
</p>

<sub><a href="https://github.com/danielcarli/lionaxon/releases">All versions</a> · <a href="#download">How to install</a></sub>

<img src="docs/screenshots/axonometric.png" alt="LionAxon: the steps of a parti diagram on the left, the axonometric drawing in the middle, the properties on the right" width="900">

</div>

## What it is for

Every architecture project starts with the same question: *why does the building have this shape?* The answer is usually a row of small drawings — the site, the first block, what was cut, what was stacked, where people walk — and it is usually made by fighting a 3D modeller, a vector editor and a layout program at once.

**LionAxon does that one job, start to finish.** You draw simple volumes on a site, tell the story in steps, and get a clean vector sheet: PDF, SVG or PNG. Nothing else to learn, nothing else to install.

<table>
<tr>
<td width="33%" valign="top">

### Simple

Ten tools and one idea: *each step is a copy of the one before; change only what that step tells.* What changed takes the accent colour by itself. No layers, no cameras, no render settings.

</td>
<td width="33%" valign="top">

### Everywhere

One app, identical on **Windows, macOS and Linux**, in **ten languages**. A project is a single small text file that opens the same on any of them — send it to a colleague, keep it in git.

</td>
<td width="33%" valign="top">

### Yours

Free software (GPL-3.0). No account, no subscription, no telemetry, and it works offline. The diagrams and sheets you make are yours.

</td>
</tr>
</table>

## A diagram in four moves

| | |
|---|---|
| **1 · Draw volumes on the site.** Drag a rectangle, pull its height. Boxes, cylinders, spheres, cones, pyramids, trapezoids standing or lying, or any outline point by point. Type the numbers if you prefer. | <img src="docs/screenshots/plan.png" width="420" alt="The plan view with three bars on the site"> |
| **2 · Subtract and stack.** Open a notch or a passage; start on a roof to stack. The subtraction stays an object: move it later. | <img src="docs/screenshots/properties.png" width="420" alt="A volume selected, with its properties"> |
| **3 · Add a step.** It starts as a copy. What you change shows in the accent colour; the previous step can stay as a dashed ghost. | <img src="docs/screenshots/elements.png" width="420" alt="The steps of the diagram and the list of elements"> |
| **4 · Open the sheet.** Every step at the same scale, with title, texts, legend, north and scale bar. Export and print. | <img src="docs/screenshots/sheet.png" width="420" alt="The sheet with the five steps side by side"> |

## What you get

**Tell the story**
- **Steps** with title and text, written right on the card of the current step, reordered by dragging; changes applied to the following steps with one click; signs between steps (+ − = →).
- **Categories** with colour *and* hatch (circulation, stair core, theatre…), so the legend reads in grey print and for people who do not tell colours apart.
- **Align faces** (`L`): click the face to align to, then the face of another shape, and it moves until the two lie in the same plane — sides with sides, tops with tops.
- **Arrows, people, labels, dimension lines and trees** — people at their real height, to give the scale (the person and tree tools stay on: one more at each click); people and trees stand on whatever is under them (a plateau, a slope, a roof). Double-click a label to write its text — and the smaller note under it — right on the drawing, with **bold**, *italic* and lists. A **text box** is a label with no leader: text on its own, in a box resized by its side.
- **Texts in line**: drag a text near another and it snaps to its left side, middle, right side, top or bottom, with a pink guide across them (`Alt`: free); select several and *Align* lines them up by their boxes as drawn — left, centre, right, top, middle, bottom — or *Distribute* leaves equal gaps between them, across or down. The texts move; the points of their leaders stay.

**Shape the site**
- **Terrain**: platforms, slopes, pits, reference planes with level lines in the elevation; a site of any outline. **Join terrain** (a switch in the toolbar of the drawing) draws platforms and slopes that touch as one piece, without the lines between them.
- **Surroundings**: neighbours in neutral grey, streets, lawns, water, and a site plan or aerial photo underneath to draw over.
- **Sun and shadows** by latitude, day and hour. **Roofs**: gable, shed and hip, with the ridge the way you want and a colour of their own.
- **Doors, windows, arches and round openings** drawn on the walls: they go with their volume, without cutting it.
- **Move a wall by its edge**: on a selected box, outline or lying trapezoid, take the top edge of a wall and pull it out or in; drag a corner to change the outline.
- **Fill a void**: a subtraction leaves a void that another shape can fill, all of it or a part — *Fill the void* on the subtraction, or draw a shape inside it. **Subtract from the terrain** too: a pit in the ground, a notch in a platform.
- **Paved floors with joints**, and arrows that climb from one level to another.

**See it from anywhere**
- **Axonometric, plan and four elevations**, with **sections**.
- A **3D viewer** that turns all the way round — and where you can **select, move, resize and pull heights** too, and see the subtractions (a button in its toolbar). The mouse has **two modes, Rev and Sketch** (your choice), with a view cube in the corner. A blue frame tells you that you are in it.
- **Duplicate a step** with one click, to tell the next move from where the last one stopped.
- **`Tab` reaches what is behind**: the next object under the same spot takes an outline in another colour and the rest fades.
- **Exploded views**, and one step **seen from several angles side by side** on the sheet.

**Take it out**
- **PDF and SVG in vectors** (one layer per step in Illustrator and Inkscape), **PNG** up to 300 dpi, the steps as an **animated GIF**, and **every step as its own image** (PNG, SVG or PDF, all in the same frame and scale) in one go.
- **Text blocks** beside the drawings (strategy, pros and cons with + and −), the **legend** under the title or along the foot; labels with a quieter second line and marks (! × + −), broken into lines at the width you pull the side of their text box to. The terrain can be drawn on the sheet **as a grid**, as in the editor.
- Sheets in row, grid, column or vertical layouts, A4 to A0, to scale, on as many pages as needed; when the drawings are held by the height, the captions go beside them and the drawings grow. The preview is zoomed with the wheel and dragged like the drawing, page by page.
- Sheets with or without the **number and title** of each step.
- **Export the steps you write** — `7`, `3-7`, `1, 4, 6-8`, `3-` to the last, `-5` from the first — each in a file of its own, or as one sheet with just those steps.
- **Eight drawing styles**, light and dark interface, and two coloured themes.

<table>
<tr>
<td><img src="docs/screenshots/terrain-levels.png" alt="Terrain with a plateau, a slope and a pit; curved volumes"><br><sub>Terrain, reference planes and curved volumes</sub></td>
<td><img src="docs/screenshots/viewer-3d-edit.png" alt="The 3D viewer with a volume selected and the handle of its height"><br><sub>The 3D viewer: turn, select, move, resize, pull the height</sub></td>
</tr>
<tr>
<td><img src="docs/screenshots/surroundings.png" alt="Context volumes, a street, trees and shadows"><br><sub>Surroundings, trees, sun and shadows</sub></td>
<td><img src="docs/screenshots/exploded.png" alt="An exploded view of a step"><br><sub>Exploded views</sub></td>
</tr>
<tr>
<td><img src="docs/screenshots/section.png" alt="A section in the elevation"><br><sub>Elevations and sections</sub></td>
<td><img src="docs/screenshots/sheet-angles.png" alt="A sheet with steps seen from two angles"><br><sub>One step, several angles, one sheet</sub></td>
</tr>
<tr>
<td><img src="docs/screenshots/openings.png" alt="A garage with an arch, a round opening and a red roof"><br><sub>Openings on the walls, roofs with their own colour</sub></td>
<td><img src="docs/screenshots/sheet-blocks.png" alt="A sheet with text blocks on the right and the legend along the foot"><br><sub>Text blocks and the legend along the foot</sub></td>
</tr>
<tr>
<td><img src="docs/screenshots/align-texts.png" alt="A text dragged near the left side of two others, a pink guide across them"><br><sub>Texts in line: a guide while one is dragged</sub></td>
<td><img src="docs/screenshots/label-edit.png" alt="The text of a label written on the drawing"><br><sub>A label written on the drawing</sub></td>
</tr>
<tr>
<td><img src="docs/screenshots/align-faces.png" alt="The align tool: one face picked, another about to come to it"><br><sub>Align faces: the reference, then the face that comes to it</sub></td>
<td><img src="docs/screenshots/pick-behind.png" alt="Tab picks the volume behind another"><br><sub><code>Tab</code> reaches what is behind</sub></td>
</tr>
<tr>
<td><img src="docs/screenshots/hatches.png" alt="Categories with hatches"><br><sub>Categories with colour and hatch</sub></td>
<td><img src="docs/screenshots/dark.png" alt="The dark theme"><br><sub>Light and dark themes</sub></td>
</tr>
</table>

## Runs where you work

| | |
|---|---|
| **Systems** | Windows 10 and 11 · macOS · Linux — the same interface, the same shortcuts, the same files |
| **Languages** | English · Português (Brasil) · Português (Portugal) · Español · Français · Deutsch · Italiano · 简体中文 · 日本語 · 한국어 — the app follows the system language, or the one you pick in the status bar |
| **Files** | One `.lionaxon` file per project: readable JSON, a few kilobytes, with any image underneath kept inside |
| **Offline** | Everything works without a network. The only connections are the version check and the update, and only when you click |

The examples that come with the app are in English and Portuguese; in the languages other than these two they open in English. The translations other than English and Brazilian Portuguese were made without native review yet: corrections are welcome.

## Download

Download the installer for your system. The links always bring the **latest version**; every installer holds the whole app, so nothing else is downloaded while it installs.

- **Windows 10/11** (x64): a setup wizard that lets you choose the folder. → [`LionAxon-Setup.exe`](https://github.com/danielcarli/lionaxon/releases/latest/download/LionAxon-Setup.exe) · or the portable version, with no installation: [`LionAxon-win-x64.zip`](https://github.com/danielcarli/lionaxon/releases/latest/download/LionAxon-win-x64.zip)
- **macOS 12+** (Apple Silicon and Intel): open the `.dmg` and drag LionAxon to Applications. → [`LionAxon-mac-universal.dmg`](https://github.com/danielcarli/lionaxon/releases/latest/download/LionAxon-mac-universal.dmg)
- **Linux** (x64): `.deb` for Ubuntu, Debian, Mint…, `.rpm` for Fedora, RHEL, openSUSE…, or the AppImage for any distribution, with no installation. → [`.deb`](https://github.com/danielcarli/lionaxon/releases/latest/download/lionaxon_amd64.deb) · [`.rpm`](https://github.com/danielcarli/lionaxon/releases/latest/download/lionaxon.x86_64.rpm) · [AppImage](https://github.com/danielcarli/lionaxon/releases/latest/download/LionAxon-x86_64.AppImage)

> The installers are not signed with a paid certificate yet. On first launch, Windows may show "Windows protected your PC" (**More info › Run anyway**) and macOS asks you to allow the app in **System Settings › Privacy & Security › Open Anyway**. The checksums of every file are in [`SHA256SUMS.txt`](https://github.com/danielcarli/lionaxon/releases/latest/download/SHA256SUMS.txt).

LionAxon is **experimental** (version 0.21): it already makes a whole parti diagram and exports it, but the file format and the behaviour may still change before 1.0. **Updating from the app.** Click the version number in the bottom-right corner, then *Check now*: if there is a newer version, *Update now* downloads the installer of your copy (the setup wizard, the `.dmg`, the AppImage, the `.deb` or the `.rpm`), checks its SHA-256 against the release and opens it. Both steps happen only when you click.

The installers are built by GitHub Actions for each version tag (`.github/workflows/release.yml`), on Windows, macOS and Linux machines, from the code of this repository.

### From the source

With [Node.js](https://nodejs.org) (LTS):

```sh
npm install
npm start
```

On Windows you can also double-click **`start.bat`** (the first run installs what is needed).

The app opens on a start screen with six examples — from the five-step parti that inspired the app to a house on a corner lot. Change them freely, or start a new diagram with **Ctrl+N**.

<div align="center">
<img src="docs/screenshots/welcome.png" alt="The start screen, with the examples and a guide in four moves" width="760">
</div>

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `V` `B` `S` `G` `A` `P` `T` `X` | Select · volume · subtract · terrain · arrow · person · label · text box |
| `D` · `E` | Dimension line · tree |
| `L` | Align faces: the face to align to, then the face to bring to it |
| `Enter` · double-click | End an outline drawn point by point |
| `N` | New reference plane (in the elevation) |
| `Delete` · `Ctrl+D` | Delete · duplicate the selection |
| `Ctrl+Shift+D` | Duplicate the current step |
| `Ctrl+C` · `Ctrl+X` · `Ctrl+V` | Copy · cut · paste (also to another step or diagram) |
| `0`–`9` with a shape selected | Type its size: width × depth × height |
| `Tab` · `Shift+Tab` | The next · previous object under the same spot (the others fade) |
| Drag the edge of a wall · a corner (shape selected) | Move the wall straight out or in (`Shift`: any direction) · move the corner |
| Drag a text near another · `Alt` while dragging | It lines up with the other (a pink guide) · free |
| Double-click a label · `Enter` with it selected | Write its text and its note on the drawing (`Enter` applies, `Shift+Enter` new line, `Tab` the other text, `Ctrl+B` bold, `Ctrl+I` italic, `Esc` gives up) |
| `F2` · `Ctrl+L` · `Ctrl+H` | Rename · lock · hide the selection |
| Right button | The menu of the object (or of the paper) |
| `R` · `Space` · `Shift` | Turn the selection 90° (`Shift`: 15°); `Space` also while moving; hold `Space` and drag to pan |
| `←` `→` `↑` `↓` | Move the selection by the grid (`Shift`: 0.1 m) |
| `Ctrl+Z` · `Ctrl+Y` | Undo · redo |
| `F` | Fit the drawing |
| Drag on the paper | Select with a rectangle (`Shift` adds) |
| Wheel · `Ctrl` `+` `−` `0` | Zoom in and out · fit |
| `Space` + drag · middle or right button | Pan |
| `Ctrl+\` | Only the drawing (hide the panels) |
| `Alt` while dragging | Leave the grid |
| `Alt` · `F10` | The menu bar (arrows to move, `Enter` to run, `Esc` to close) |
| `PgUp` · `PgDn` | Previous · next step |
| In the sheet: wheel · drag · `F` · `←` `→` | Zoom at the mouse · move the paper · frame the page · previous · next page |
| `Ctrl+1` `2` `3` `4` `5` | Axonometric · plan · elevation · sheet · 3D viewer |
| In the 3D viewer: drag on the paper · `←` `→` `↑` `↓` · `I` | Turn all the way round · turn 15° (`Shift`: 5°) · isometric |
| In the 3D viewer: click · drag a shape · the square handles · the round handle · `Delete` | Select · slide it on the ground · resize · pull its height · delete |
| In the 3D viewer: middle button · `Shift` + middle button · right button · wheel · middle button twice | Pan · orbit (the other way round in Sketch mode) · pan (`Shift`: orbit) · zoom at the mouse · fit |
| In the 3D viewer: `O` · `H` | Left button orbits · left button pans |
| `Ctrl+N` · `Ctrl+O` · `Ctrl+S` · `Ctrl+Shift+S` | New · open · save · save as |
| `Ctrl+W` · `Ctrl+Tab` | Close the diagram · next diagram (`Shift`: previous) |
| `Esc` | Back to select, clear the selection |

## How it works

**A 2.5D model.** A volume is a footprint (a rectangle or an ellipse, turned at any angle) extruded between a base height and a top, with a number of floors; cones and pyramids end in a point, a standing trapezoid leans its sides (a lying one is a trapezoid in plan), spheres are drawn as spheres. A subtraction is a box with its own heights; the volume is cut in height bands and each band's footprint loses the cuts that cover it (boolean operations on polygons, rounded to 1 mm). Heights are counted from the object's reference plane. This covers boxes, notches, passages, stacks, courtyards, floors and terrain, and keeps editing simple.

**A vector renderer of its own.** Faces are projected in parallel (isometric by default), ordered back to front with plane tests between the faces that overlap on screen (Newell) — a face that crosses another is cut by its plane, and only the line where they meet is drawn — and written as SVG; curved surfaces are drawn without the seams between their facets. The same SVG is the screen, the thumbnails, the sheet and the exported files: what you see is what you export. Walls get two tones from the same colour and tops stay lighter, as in hand-made diagrams. 200 volumes are drawn in a few tens of milliseconds.

**Steps are whole scenes.** Each step keeps every object; an object keeps the same id from one step to the next. That is how the app knows what changed.

## The file

A project is one `.lionaxon` file: indented JSON with a `schemaVersion`, readable and easy to compare in git.

```jsonc
{
  "format": "lionaxon", "schemaVersion": 2, "name": "…",
  "site": { "w": 40, "d": 60, "mode": "dashed", "dims": true, "thickness": 0 },   // "pts": [[0,0],[40,0],…] for a site of any outline
  "sun": { "on": false, "lat": -30, "month": 6, "day": 21, "hour": 15, "opacity": 0.2 }, "underlay": null,
  "levels": [{ "id": "L0", "name": "Street", "z": 0 }, { "id": "L1", "name": "Plateau", "z": 3 }],
  "north": 0, "northPlace": "header", "northHalftone": false, "grid": 1, "style": "beige", "view": { "az": -45 },
  "categories": [{ "id": "k-circ", "name": "Circulation", "color": "#8fa9cc" }],
  "steps": [{ "id": "s-1", "title": "…", "text": "…", "highlight": true, "explode": { "on": false, "gap": 4, "floors": false }, "views": [{ "az": 315, "el": 35.2644 }, { "az": 135, "el": -20 }], "objects": [
    { "type": "volume", "id": "v-west", "shape": "box", "x": 7, "y": 30, "w": 8, "d": 30, "h": 10.5, "rot": 0, "level": "L0", "z": 0, "on": null, "floors": 3, "cat": null, "state": "normal", "name": "West bar" },
    { "type": "opening", "id": "o-door", "on": "v-west", "side": "front", "kind": "arch", "u": 0, "z": 0, "w": 2, "h": 3 },
    { "type": "cut", "id": "c-passage", "shape": "box", "x": 20, "y": 22, "w": 10, "d": 5, "level": "L0", "z": 0, "h": 3.5, "rot": 0, "target": "v-mid" },
    { "type": "platform", "id": "g-plateau", "x": 30, "y": 44, "w": 20, "d": 30, "rot": 0, "level": "L1", "z": 0 },
    { "type": "slope", "id": "r-ramp", "x": 30, "y": 20, "w": 8, "d": 14, "rot": 0, "from": "L0", "zFrom": 0, "to": "L1", "zTo": 0 }
  ] }],
  "sheet": { "layout": "vertical", "paper": "A4", "orientation": "portrait", "scale": 500, "title": "…", "subtitle": "…", "legend": true, "texts": true }
}
```

Other objects: `area` (a flat street, lawn, water or paving, with `joints`), `opening` (a door, window, arch or oculus on a wall of the box `on`), `tree`, `dim` (a dimension line), and volumes or cuts with `"shape": "poly"` and their `pts`; a box may have `roof`, `roofH`, `roofDir` and `roofColor`; a trapezoid the length `top` of its short side: the top of a standing one (`"shape": "trapezoid"`), the back of a lying one (`"trapezoidLying"`, a trapezoid in plan); a volume a `color` of its own and `fill` (it fills the void of a subtraction: that one leaves it whole, others still cut it); a cut the `target` `"~terrain"` (it digs into the terrain); an arrow `z2` (where it ends); a label `note` and `mark`, and `line: false` for a text box (its texts take `**bold**`, `*italic*` and lines starting with `- ` or `1. `); the sheet `legendPlace`, `blocks` and `heads` (the number and title of each step); a step may have `ghostPrev` and `op`.

Measures are in metres, angles in degrees; `x`, `y` is the centre of a volume; `z` is the height over its plane (`level`); `on` is the volume it sits on. Files of 0.1 (`schemaVersion` 1) open as they are, with everything on the ground plane.

## For agents and scripts

A command describes a project as JSON (schema 2) without opening the app and without changing anything — steps, counts, footprint and floor area, highest point, what changed in each step, volumes outside the site:

```sh
node tools/inspect.mjs examples/parti-en.lionaxon            # the whole project
node tools/inspect.mjs examples/parti-en.lionaxon --step 3   # one step
node tools/inspect.mjs project.lionaxon --objects            # with every object
node tools/inspect.mjs project.lionaxon --svg 2 > step2.svg  # the drawing of step 2
```

Every change in the app goes through named commands (`object.add`, `object.move`, `step.add`…), the base for a command palette and for agents in the next versions.

## Architecture

Same layering as [LionOrganizer](https://github.com/danielcarli/lionorganizer), [LionPhotos](https://github.com/danielcarli/lionphotos) and [Visual Studio Code](https://github.com/microsoft/vscode): `base` knows nothing above it, `platform` provides main-process services, `workbench` builds the interface. The main process (Node.js) and the interface (a sandboxed renderer without Node access) only talk through the `preload` bridge.

```
src/
  base/
    common/              events, i18n (nls.js)
      geometry/          parallel projection, polygons (booleans through polygon-clipping)
    browser/             DOM helpers, icons
  platform/              main-process services
    project/             open and save .lionaxon files, examples, recovery copy
    export/              write SVG and PNG, print the PDF (hidden window, fonts embedded)
    update/ · nls/       version check and update with the installer of each system (only when asked), i18n for the main process
  code/
    electron-main/       entry point: window, app:// protocol, service wiring
    electron-sandbox/    preload bridge
  nls/                   message catalogs, one per language (ten), and locales.json
  vendor/                polygon-clipping (MIT), as one ES module
  workbench/
    browser/             layout parts, dialogs, form controls, styles
    services/
      model/             the project model (pure data): planes, volumes, cuts, terrain, arrows, people, labels, steps
      render/            the vector renderer and its solids, the sheet, the drawing styles, the fonts
      document/          open diagrams (tabs), current step, selection, active plane, undo, session copy
      commands/          the named commands
      export/ · layout/ · notification/ · dialog/ · update/
    contrib/             drawing (axonometric, plan and elevation, tools, handles), the 3D viewer (orbit: look from any angle, select, move, pull heights), properties, steps, project, categories, sheet
examples/                the six example projects, in English and Portuguese
tools/                   tests, the inspector, the example builder
```

Security: `contextIsolation` and `sandbox` on, no `nodeIntegration`, a strict Content Security Policy. The main process only writes where the person chose in a native dialog, or to the file they opened.

Privacy: no account, no telemetry. LionAxon uses the network only when you click the version (bottom-right corner) and press *Check now* or *Update now*.

## Development

| Command | What it does |
|---|---|
| `npm start` | Run the app |
| `npm test` | Unit tests (projection, polygons, model, renderer order, sheet) and the i18n check |
| `npm run test:e2e` | End-to-end test on a **disposable** folder, with the real mouse and keyboard: draw, move, height and rotation handles, floors, subtract, shapes, planes, terrain, steps, arrow, person, label, delete a step and undo, tabs, the save question on closing, save, reopen, export PDF/SVG/PNG, then restart and check the session (on Linux without a screen: `xvfb-run -a npm run test:e2e`); two more starts check a slow start left with the button, and a hung one left through the question |
| `npm run shots` | The screenshots of this README (`-- --lang=pt-BR --out=docs/screenshots/pt-BR` for another language) |
| `npm run inspect -- <project.lionaxon>` | Describe a project as JSON |
| `npm run examples` | Rebuild the example projects |
| `npm run dist` | Build the installers of the system you are on with electron-builder, into `dist/` (the release workflow does it for the three systems) |
| `npm run release:files` | Write `manifest.txt`, `SHA256SUMS.txt` and the release notes beside the installers in `dist/` |

Code, comments, identifiers and documentation are in English. The interface is translated in `src/nls/<language>.json`; `npm test` fails if a language misses a key or a placeholder. To add a language, copy `en.json`, translate it and add a line to `src/nls/locales.json`.

## Roadmap

- **0.21** ✓ — texts lined up as in a drawing program: smart guides while one is dragged, and align and distribute by their boxes on the screen; the subtractions in the 3D viewer; a subtraction started on a volume always cuts it.
- **0.20** ✓ — text boxes (labels with no leader, resized by their side); bold, italic and lists in the texts of labels; the title and text of a step written on its card.
- **0.19** ✓ — trapezoids, standing (the sides leaning in to a narrower top) and lying (a trapezoid in plan, its walls straight up), as volumes and as subtractions; walls moved by their edges, corners by their handles.
- **0.18** ✓ — a shape that fills the void of a subtraction, all of it or part; subtractions of the terrain (pits, notches in platforms); people and trees placed one after another; sheets without the number and title of the steps.
- **0.17** ✓ — export the steps you write (3-7, 1, 4, 6), as files or one sheet; the sheet preview zoomed and dragged like the drawing, page by page; captions beside the drawings when that makes them larger; a label's text box resized by its side, and its small text written on the drawing; the import from IFC taken out until it reads real models.
- **0.16** ✓ — every step exported as its own image (PNG, SVG, PDF); the terrain as a grid on the sheet; labels with a width, broken into lines by themselves.
- **0.15** ✓ — join terrain (platforms and slopes that touch drawn as one); people and trees stand on what is under them.
- **0.14** ✓ — a first import of building models (IFC); taken out in 0.17, it did not yet read real models.
- **0.13** ✓ — the 3D viewer with two mouse modes (Rev and Sketch), a view cube, optional labels and resizing by handles; duplicate a step.
- **0.12** ✓ — updating from the app, with the installer of each system; locked objects can be picked to be unlocked; panes keep their scroll.
- **0.11** ✓ — the align tool: one face brought into the plane of another.
- **0.10** ✓ — openings on the walls; ridge direction and roof colour; own colours; paved floors with joints; arrows between levels; notes and marks on labels; text blocks and the legend along the foot on the sheet; flat areas now show over a site with thickness.
- **0.9** ✓ — `Tab` picks the object behind another; the text of a label written on the drawing.
- **0.8** ✓ — the interface in ten languages; editing in the 3D viewer (select, move, heights) inside a frame of its own; code identifiers all in English, with old files still opening.
- **0.7** ✓ — outlines of any shape; surroundings; sun and shadows; roofs; dimension lines; ghosts and signs between steps; sections; the steps as GIF; a workflow that builds the installers.
- **0.6** ✓ — usability: copy and paste, a right-button menu, a selection rectangle, align and guides, typed sizes, names, lock and hide, a start screen, recent files, hatches for categories.
- **0.5 – 0.1** ✓ — the 3D viewer and several angles per step; a menu bar and examples; elevations, exploded views and vertical sheets; terrain, reference planes and curved shapes; tabs; the first volumes, steps and sheet.
- **Next** — the import of building models (IFC, then Rev files), tested on real projects; several sheets and alternatives in one project; free terrain; stairs; zoning plans; courtyards and joining volumes; loose slabs and pilotis; shadows on volumes and terrain; sections on the sheet; drawing new shapes in the 3D viewer; a command palette; signed installers.
- **1.0** — DXF in and out; a manual and tutorials in the order of a design studio; reviewed translations.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) — current version: **0.21.3**.

## Credits

LionAxon was **created and conceived by Daniel Michelon De Carli**, an architecture and urbanism student, and is maintained by the **LionAxon Team** together with its contributors and translators.

The first example recreates, with simple volumes, the five steps of a parti diagram used as a reference while designing the app.

In the app, the credits are in *Help › Credits*.

## License

LionAxon is free software under the **GNU General Public License v3.0 or later** — see [LICENSE](LICENSE). The licence covers the program, not the diagrams and sheets you make with it: they are yours.

Third-party components and their licences are listed in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

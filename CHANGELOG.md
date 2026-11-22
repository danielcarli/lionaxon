# Changelog

All notable changes to LionAxon are documented here. The project follows [Semantic Versioning](https://semver.org).

## [0.9.0] — 2026-11-21

Reaching what is behind, and writing labels where they are.

### Added
- **`Tab` picks the next object under the same spot** (`Shift+Tab`: the one before), in the axonometric, the plan, the elevations and the 3D viewer. When one volume is drawn behind another — the usual case in an elevation — a click only reaches the one in front; `Tab` goes through the others. The object picked takes an outline in another colour (magenta) and everything else fades, so that it shows through what covers it; a press on that spot then grabs the object picked, not the one in front. It ends with `Esc` or when something else is selected. `Tab` still walks through buttons and fields when one of them has the focus.
- **The text of a label written on the drawing**: a double click on a label, or `Enter` with it selected, opens a box over it (`Enter` applies, `Shift+Enter` starts another line, `Esc` gives up). A new label opens it right away. The field in the properties panel is still there.

### Fixed
- A double click on a shape always finds what is under the mouse (the press before it captured the pointer).
- A press on the drawing takes the focus from any button or field, so the keys go to the drawing.

## [0.8.0] — 2026-11-21

The first public version: ten languages, editing in the 3D viewer, and the code all in English. Files of earlier versions open as they are.

### Added
- **Ten languages**: English, Português (Brasil), Português (Portugal), Español, Français, Deutsch, Italiano, 简体中文, 日本語 and 한국어 — the languages of the Lion family. The app follows the system language or the one chosen in the status bar. `npm test` checks that every language has every key and placeholder. The translations other than English and Brazilian Portuguese have not been reviewed by native speakers yet; the examples stay in English and Portuguese.
- **Editing in the 3D viewer**: a click selects a shape (Shift adds; a click on the paper clears), a drag that starts on a shape slides the selection on the ground by the grid (`Alt`: free) with the volumes stacked on it, a round handle over a selected volume pulls its height by half metres, and `Delete`, duplicate, copy, cut and paste work as in the axonometric. The properties panel edits what is selected. A drag that starts on the paper still turns the view. New shapes are still drawn in the axonometric and the plan (a pencil button goes there).
- **A frame in the selection colour** around the 3D viewer, so that it is obvious it is another kind of view.
- Screenshots in English (`docs/screenshots`) and in Portuguese (`docs/screenshots/pt-BR`); `npm run shots` takes `--lang` and `--out`.

### Changed
- **Code identifiers in English**: drawing styles (`beige`, `lawn`, `blue`, `cotton`, `mint`, `lavender`, `peach`, `sky`), interface themes (`map`, `riverfront`), example ids (`parti`, `plateaus`, `tower`, `slope`, `school`, `corner`), SVG ids of the sheet (`step-01`, `legend`, `north`, `scale`, `page`) and the test data. Files and preferences that carry the old Portuguese names still open (aliases).
- The short labels of the size fields (W, D, H, L) are translated instead of fixed.
- The README was rewritten around what the app is for: simple, the same on Windows, macOS and Linux, and free.

### Fixed
- Longer words in other languages no longer widen the window: the view tabs shrink, and choices that do not fit in a row (roofs, states) wrap to a second one.
- The 3D viewer's toolbar no longer runs out of the window at 1280 px.

### Notes
- The labels drawn on the sheet use the embedded Latin fonts; text in Chinese, Japanese or Korean falls back to a font of the system.
- The installers are built by the release workflow and are not signed; the workflow has not run yet.

## [0.7.0] — 2026-11-21

Shapes of any outline, the surroundings, the sun, roofs, dimensions, sections and an animation. Files of 0.6 open as they are.

### Added
- **Outlines of any shape**: a sixth shape for volumes and subtractions, drawn point by point (click the corners; close on the first one, by double-click or `Enter`; `Esc` cancels). A selected outline shows a handle on each corner (drag to move it), a mark in the middle of each side (drag it out for a new corner) and takes a corner out on a double-click.
- **Site of any outline**: *Project › Draw the outline* (or *Insert › Draw the outline*), and *Back to a rectangle*. Slab, grid and exploded views follow it.
- **Surroundings**: the **Context** state for volumes (neutral grey, never highlighted, out of the legend, not counted as new); **flat areas** — street, lawn, water, paving — as a third option of the terrain tool, drawn on the ground under the model; **trees** (`E`), with a round crown or as a conifer; an **image underneath** (PNG, JPEG or WebP; width in metres, position, rotation, opacity; on the sheet only when asked), kept inside the project file and out of the undo history.
- **Sun and shadows** (*Project › Sun and shadows*, *View › Shadows on the ground*): latitude, day, solar hour and strength; the pane tells the altitude and azimuth of the sun. Shadows follow the north of the project and take subtractions into account.
- **Roofs** for boxes: gable, shed and hip, with a height; the ridge follows the longer side.
- **Dimension lines** (`D`): between two points, with an offset; the length follows the points.
- **The previous step as a ghost**: per step, what the step before had and this one took away or changed is drawn dashed.
- **Signs between steps** on the sheet: +, −, = or →, per step.
- **Sections**: in the elevation, *Section* with a slider for the plane; what is in front is taken away, what is cut is filled.
- **Animation**: *File › Export the steps as GIF* (and in the Sheet pane): one frame per step, all in the same frame, with number and title. The GIF writer is the app's own.
- A sixth example, *House on a corner lot*, using the new features.
- `.github/workflows/release.yml`: installers for Windows (NSIS, zip), macOS (dmg) and Linux (AppImage, deb) built by GitHub Actions on a version tag, attached to a draft release. Not signed.

### Changed
- File format: `shape: "poly"` with `pts` on volumes and cuts; `roof`/`roofH` on boxes; objects `area`, `tree`, `dim`; `site.pts`; `sun` and `underlay` on the project; `ghostPrev` and `op` on steps. All optional.
- The Project pane refreshes at once after a click on one of its buttons.

### Known limits
- Shadows fall on the ground only (not on other volumes, platforms or slopes) and are kept near the site; with a thick site slab they are hidden by it.
- The section is a view of the editor: it is not on the sheet.
- Roofs ignore subtractions that reach them.

## [0.6.1] — 2026-11-21

### Added
- **Credits** (*Help › Credits*, and a link in About): who conceived the software, who maintains it, the Lion family and the free software it is made with, with their licences.
- The start screen says, small at the bottom, "Software conceived by Daniel Michelon De Carli".

## [0.6.0] — 2026-11-21

Usability: the everyday editing a drawing program is expected to have, and a calmer interface. Files of 0.5 open as they are.

### Added
- **Copy, cut and paste** (`Ctrl+C`, `Ctrl+X`, `Ctrl+V`, *Edit*, the right-button menu): into the same step (a little aside), another step (in the same place) or another open diagram (its categories come along; a plane that does not exist there becomes the ground, at the same height).
- **Menu on the right button**: for the object under it (cut, copy, paste, duplicate, delete, turn, rename, lock, hide, align, apply to the following steps) or for the paper (paste, select all, show everything, fit). A right-button drag still pans.
- **Selection rectangle**: dragging on the paper selects what the rectangle touches; `Shift` adds.
- **Apply to the following steps**: the selected objects, as they are now, replace themselves in every step after the current one (and are added where they do not exist), as one undo. Also *Delete here and in the following steps*.
- **Align and distribute** (left, centre, right, back, centre, front; equal gaps in X or Y), in the panel of a multiple selection, in *Edit › Align* and in the right-button menu. While a shape is moved, its edges and centre snap to those of the other shapes, with a pink guide (`Alt`: off).
- **Typed size**: with one shape selected, typing a number opens a small box for `width × depth × height`.
- **Names, lock and hide**: any object can have a name of its own (`F2`, double-click), be locked (`Ctrl+L`: not picked or moved in the drawing) or hidden (`Ctrl+H`: not drawn; a hidden subtraction does not cut). The element list has a lock and an eye on each row, and outlines in the drawing the row under the mouse.
- **Start screen** on the first start and in *Help*: new, open, recent files, the five examples and a four-move guide. **Recent files** in *File › Open recent*.
- **Zoom indicator** with − and + in the corner of the drawing (100% = the drawing fits); `Ctrl` `+`, `Ctrl` `−`, `Ctrl+0`.
- **Steps reordered by dragging** a card onto another.
- **Only the drawing** (`Ctrl+\`, the button in the title bar): hides both panels, and brings them back as they were.
- **Panels**: sections fold with a click on their title (remembered); in the step, *Exploded view*, *Angles on the sheet* and *Shortcuts* start folded; *View › Explanations in the panels* hides the texts under the fields.
- **Hatches on the categories** (*View*, or the Categories pane): each category also gets a hatch, on the drawings and in the legend.
- Accessibility: every icon button has a name for screen readers; a clearer focus ring; the theme switch names its options.

### Changed
- Dragging on the empty paper now selects (it used to pan). Pan with `Space` + drag, the middle button or the right button.
- The hint of the tool in use moved from the toolbar, where it was cut short, to the status bar, in a shorter sentence.
- Deleting a step no longer asks for a typed code: a notice offers to undo.
- The tabs of the open diagrams keep a readable width and the strip scrolls; the examples dropped the "Example —" prefix from their names.
- The 3D viewer says it only shows, with a button to edit in the axonometric.
- The Subtract tool has an icon of its own (it looked like the Volume tool).
- A click on a button of the properties panel updates the panel at once.
- The window can be made smaller (860 × 600).

### Fixed
- The About, Versions and Shortcuts dialogs did not open.
- A long text in the status bar could make the window wider than the screen.

## [0.5.0] — 2026-11-21

A 3D viewer for every step, and steps seen from several angles at once. Files of 0.4 open as they are.

### Added
- **3D viewer**, a fifth tab (`Ctrl+5`, *View › 3D*, *Step › See it in 3D*): the current step turns all the way round with the mouse — any azimuth, any height from straight above to straight below. Presets (isometric from the nearest corner, top, front, below), the azimuth and the elevation typed in degrees, `←` `→` `↑` `↓` to turn 15° (`Shift`: 5°), `I` for isometric, the wheel to zoom, the right button or `Space` to pan, a double-click to fit. The viewer only looks: the model is never changed from it.
- **Angles of a step**: *Use for this step* makes the angle in view the step's angle on the sheet; *Duplicate at this angle* adds it beside the others — the same step, seen from up to four angles, its drawings side by side under one number and one caption (one layer in the SVG). The angles are listed over the drawing (a click looks from one, × takes it out) and in the properties of the step; *Project angle* goes back to the axonometric of the project. A new step copies the angles of the one it starts from.
- On the sheet, a step with several angles takes one slot per angle; the grid keeps its rows. When the steps are not all seen from the same angle, each drawing gets its own small north arrow.
- Thumbnails of the steps and *Export the current step* show every angle of the step.
- Volumes, cones, pyramids and slopes have undersides, drawn only when seen from below.
- Examples: the tower's crown is also seen from near the ground; the school's uses from two opposite corners.

### Changed
- File format: `views` on steps (a list of `{ az, el }`; empty means the project's angle). Older files open as they are.

## [0.4.0] — 2026-11-21

A traditional menu bar and five examples to open. Files of 0.3 open as they are.

### Added
- **Menu bar** in the title bar — *File* (new, open, examples, save, save as, export the sheet or the step, close, quit), *Edit* (undo, redo, duplicate, delete, select all, turn 90°/15°), *Insert* (the drawing tools, a reference plane, a category), *View* (the four views, fit, turn the view, subtractions, see-through terrain, side bar, properties, theme), *Step* (new, previous, next, explode, highlight, delete) and *Help* (shortcuts, versions, about). Each entry shows its shortcut and, where it applies, whether it is on. A click opens a menu, moving to the next opens that one; `Alt` or `F10` open it from the keyboard, the arrows move, `Enter` runs and `Esc` closes.
- **Five examples**, in English and Portuguese, from *File › Examples* or the Project pane: *site and parti* (the one the app opens with), *cultural centre on plateaus* (platforms, an accessible slope, a sunken square, curved volumes, a sphere and an exploded step), *tower and podium* (stacked volumes, a pyramid crown, a vertical A4 sheet), *house on the slope* (a house set into the slope, a cantilever, a wheelchair route, floors apart) and *school around a courtyard* (the existing building as a ghost, four wings, a porch cut, a round library).

### Changed
- The New, Open and Save buttons of the title bar are now in the *File* menu.
- In an exploded view the terrain stays where it is; only the buildings move apart.

### Fixed
- Spheres in an exploded view could stop the drawing.

## [0.3.0] — 2026-11-21

Elevations with level lines, exploded views, subtractions of every shape and vertical evolution sheets at a chosen scale. Files of 0.2 open as they are.

### Added
- **Elevation** (a fourth tab, `Ctrl+3`): the model seen from the front, right, back or left, with the reference planes as level lines. The plane tool (`N`) makes a new plane where you click; a level line is dragged up or down to change its elevation; an object dragged onto a level line is anchored to that plane (the base snaps to the line).
- **Exploded view**, per step: the reference planes move apart one gap each, stacked volumes rise above the one below and, if asked, the floors of each volume come apart too; dashed lines go down to where each piece belongs. The sheet shows exploded steps as they are.
- **Subtractions of every shape**: box, cylinder, cone, pyramid and sphere, from the subtract tool's options or the properties; round hollows are drawn smooth; cones, pyramids and spheres cut in thin slices.
- **Vertical sheet**: one step under the other with the text beside each drawing, and a one-click preset for a vertical evolution sheet on A4.
- **Scale of the drawings** on the sheet: fit the paper (the scale it comes to is shown) or 1:100 to 1:5000, written on the sheet; at a chosen scale the steps go on to as many pages as they need. The PDF has every page; SVG and PNG give one file per page. When the drawings do not fit, the panel says which scale does.
- **See-through terrain** in the editor (on by default, a button in the toolbar): the grid follows platforms, slopes and the site's block; a piece of terrain shows its fill when the mouse is over it or when it is selected. Exports are not affected.
- **`Space` turns any shape** — volumes, cuts, platforms, slopes — by 90° (`Shift`: 15°), also while it is being moved; held while dragging, it still pans.

### Changed
- `Ctrl+3` opens the elevation and `Ctrl+4` the sheet.
- File format: `shape` on cuts, `explode` on steps, `scale` and the `vertical` layout on the sheet (all optional; older files open as they are).

### Fixed
- Shapes that cross each other — a volume set into a slope or a platform — were sometimes drawn in the wrong order (the volume over the slope). A face that crosses another is now cut by its plane, so every part is ordered exactly; only the line where the two surfaces meet is drawn.
- The outlines of the cuts stayed on screen after a cut was deselected.
- A view shown for the first time could stay empty until the window was resized.

## [0.2.0] — 2026-11-21

Terrain, reference planes, more shapes and several diagrams open at once. Files of 0.1 open as they are.

### Added
- **Terrain:** platforms (a plateau above zero, a pit cut into the site below zero) and slopes between two heights (embankments, ramps), with the new terrain tool (`G`) and their own handles; the site can be a block of earth with a thickness.
- **Reference planes:** named planes with an elevation, in the Project pane; every object belongs to a plane and follows its elevation; the active plane is chosen in the toolbar and shown as a dashed outline while drawing; removing a plane moves what was on it to the ground plane at the same height.
- **Shapes:** cylinder, sphere, cone and pyramid besides the box, chosen beside the volume tool or in the properties; curved surfaces drawn without seams, spheres shaded below the equator.
- **Rotation with the mouse:** a round handle on volumes, cuts, platforms and slopes, 15° at a time (Alt: free); what is stacked turns with it (also with `R`).
- **Several diagrams open:** one tab each in the title bar (click, middle click to close, drag to reorder, `Ctrl+W`, `Ctrl+Tab`); opening a file that is already open goes to its tab; each tab keeps its own zoom.
- **Save before closing:** closing a tab or the window with unsaved changes asks: save, don't save or cancel.
- **Element list:** everything in the step, grouped by type, in the properties panel (with nothing selected), above the shortcuts; a click selects, ghosts included.
- **Person in a wheelchair**, as a fourth pose.
- **Label fonts:** sans (Plus Jakarta Sans), condensed (Archivo Narrow), serif (Source Serif 4), mono (JetBrains Mono) and handwritten (Architects Daughter); capitals optional; embedded in the PDF and PNG.
- **Five pastel drawing styles:** *Cotton candy* (blush volumes on baby blue, blue accent), *Mint* (mint on peach, terracotta accent), *Lavender* (lavender on butter yellow, violet accent), *Peach* (peach on sage, green accent) and *Powder blue* (powder blue on cream, coral accent); edges, walls, accent and arrows keep 3:1 contrast (WCAG 1.4.11), checked by a unit test.
- **Two interface themes:** *Map* (cream, dark green and vermilion, from a city map poster) and *Riverfront* (sea green, deep teal and blue, from a waterfront masterplan), next to Auto, Light and Dark in the status bar; the window's title-bar buttons follow the theme. The drawings keep their own style.
- **North arrow:** in the sheet header, flat on the ground next to each drawing (axonometry too) or nowhere; optionally in half tone.

### Changed
- File format `schemaVersion` 2: `levels`, `site.thickness`, `northPlace`, `northHalftone`; `shape` and `level` on objects; `platform` and `slope` objects. Version 1 files are read as they are.
- The session copy keeps every open tab; a diagram whose changes were thrown away on closing is not brought back (a saved file is reopened from disk).
- A new subtraction goes from the active plane to the top of the volume it cuts (it used to be 200 m tall, so changing its height seemed to do nothing); it has handles for its top and its base.
- `Ctrl+N` opens the new diagram in a new tab instead of replacing the current one.
- Moving and resizing follow the plane the object is on, so the pointer stays on it in axonometry.

### Fixed
- The title bar could not move the window to the right of the project name: now every empty part of the bar drags the window, only its buttons and tabs don't.
- Changing the height of a subtraction with the mouse did not change the drawing.
- A ghost volume could not be selected again by clicking it.
- The side bar did not scroll when its content was taller than the window.

## [0.1.0] — 2026-11-21

The first version: a whole parti diagram, from the first block to the exported sheet. Experimental.

### Added
- **Workbench of the Lion family:** title bar with the project's name, activity bar (Steps, Project, Categories, Sheet), side bar, editor with three tabs (Axonometric, Plan, Sheet), properties panel, status bar with the version in the bottom-right corner; light and dark themes; English and Portuguese (Brazil).
- **Model 2.5D:** volumes (footprint, base, height, rotation, floors, category, state, stacked on another volume), subtractions kept as editable objects (cut in height bands with polygon booleans), arrows, people at real scale, labels with a leader line.
- **Tools:** select and move on the grid (Alt leaves it), handles for width, depth and height, volume (on the ground or stacked on a roof), subtract, arrow, person, label; turn by 90° or 15°; move with the arrow keys; duplicate; duplicate in series.
- **Vector renderer of its own:** parallel projection seen from the four corners and plan, back-to-front order with plane tests (Newell), walls in two tones, floor lines, ghost and glass states; the same SVG for the screen, the thumbnails, the sheet and the exports.
- **Steps:** each new step copies the current one; title, text and "show what changed" per step (new volumes, changed volumes and volumes hit by a new cut take the accent colour); move steps; deleting a step with content asks for the typed code of three characters.
- **Categories** with colours for volumes and arrows; the sheet's legend lists only those in use.
- **Sheet:** row, column or grid; A4 to A1, landscape or portrait; title, subtitle, legend, north arrow, number, title and text of each step, every step at the same scale.
- **Export:** sheet as PDF (vector, fonts embedded), SVG (one named layer per step) and PNG (150, 200 or 300 dpi); the current step alone as SVG or PNG.
- **Three drawing styles:** Beige, Lawn and Blue.
- **Files:** `.lionaxon` (indented JSON, `schemaVersion` 1); new, open, save, save as; opening a file given on the command line.
- **Never lose work:** undo and redo for everything, opening another project included; a recovery copy written while working, opened again at the next start.
- **Example:** five steps of a parti diagram (basic layout, connection, subtraction, massing, programme and circulation), in English and Portuguese.
- **For agents and scripts:** `tools/inspect.mjs` describes a project as JSON (schema 1) or writes the SVG of a step; every change goes through named commands.
- **Versions window:** checks the latest release on GitHub only when asked.
- **Tests:** 16 unit tests, i18n check, end-to-end test with the real mouse and keyboard (41 checks, plus the recovery after a restart).

### Not yet
- Installers (the electron-builder configuration is there, untested).
- Polygonal sites and volumes, courtyards, roofs, exploded view, context, background image, dimensions on volumes: see the roadmap in the README.

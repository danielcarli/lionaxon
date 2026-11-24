# Changelog

All notable changes to LionAxon are documented here. The project follows [Semantic Versioning](https://semver.org).

## [0.22.4] — 2026-11-24

### Added
- **The text of the steps exported on their own can go beside the drawing**: with *Number, title and text of the step* on, *Under* and *Beside* choose where — beside, it is a column on the left of the drawing (the number, a rule, the title, the text), centred on it, as on the sheet. Remembered. For PNG, SVG and PDF.

### Fixed
- **The north beside each drawing sat on a text** when a label was in the top right corner: it now goes above the texts there, its right side on the right side of the texts, and the frame of the drawings makes room for it (on the sheet and on the steps exported on their own). Its size follows the drawings.
- **Text of each step › Beside did nothing on a sheet to scale** (1:750, 1:500…): to scale the captions always stayed under the drawings. Now they go beside them there too — as many steps a row as fit across the paper, each its caption then its drawing, the rows page after page. *Automatic* keeps them under when the scale is fixed (there is no size to gain).

## [0.22.3] — 2026-11-24

### Added
- **Number, title and text of the step** on the steps exported on their own (a checkbox in *Export steps › Separate files*, remembered): under each drawing its number, its title and its text, in lines — the image grows to hold the longest. For PNG, SVG and PDF, one step or many.

### Fixed
- **Export steps — the size**: a size typed and then an export button clicked right away did not export: committing the size redrew the pane under the mouse, and the click was lost. The pane is no longer redrawn for it.
- **The size came back as 100 px**: the field showed 2.400 with a thousands separator, and 2.400 was read back as 2.4 (then held at the least, 100). Number fields no longer show thousands separators, and a whole number typed with one (2.500, 2,500) is read as that number.

## [0.22.2] — 2026-11-24

### Added
- **The text of each step under its drawing or beside it**, as you choose: *Text of each step* in *Layout* (row, grid and column) has *Automatic* (wherever the drawings come out larger — as until now), *Under* and *Beside* (on the left of the drawing). The vertical layout always has it beside.

### Changed
- The size of the steps exported on their own and whether it is their width or their height are in one group.

## [0.22.1] — 2026-11-24

### Changed
- **The drawings fill the sheet much better** — measured on a sheet of eight steps with texts:
  - **Column** and **vertical** on wide paper go on in more columns side by side (read top to bottom, then the next column), when that makes the drawings larger: on A1 landscape the drawings went from 1:4600 to 1:660 (column) and from 1:5347 on two pages to 1:853 on one (vertical).
  - The captions beside the drawings are tried at several widths (wider: fewer lines, lower rows) and taken when they win; a caption that cannot fit the page is never taken. A grid of 2 columns on A1 upright: 1:859 → 1:634.
  - The white left over is shared evenly above, between and below the rows, instead of a band under the header.
  - The automatic columns of a grid weigh the captions beside too.
- **North beside each drawing**: the north sits in the top right corner of the drawing's own bounds, as close to it as it goes, and the north of the header goes (as does the north lying in the drawings).

## [0.22.0] — 2026-11-24

### Added
- **PNG with a transparent background**: a *Transparent* switch right under the PNG buttons, grouped with them, in *Export the sheet* and in *Export steps* — on by default (the drawing with no paper behind it, to lay over other images), remembered. SVG and PDF keep the paper.
- **A free legend**: *Legend* has *Free* beside *Top* and *Foot*; the legend floats where it is put and takes no room from the drawings. Drag it on the preview with the left button — a legend at the top or the foot becomes free where it is dropped.
- **North beside each drawing** (a checkbox in the *Sheet* pane): a small north at the corner of every drawing of the sheet, and of the steps exported on their own, besides the one of the header.
- **The size of the steps exported on their own**, in pixels, of their **width** or of their **height** (the other follows the drawing), remembered; for PNG and SVG.
- **Automatic columns** for the grid (*Columns: Automatic*, the default for new diagrams): the sheet takes the number of columns that makes the drawings largest.

### Changed
- **The drawings on the sheet are larger**: the legend at the top runs in rows under the title instead of a column (it was taking a band of the page from the drawings); a site that is not drawn (no outline, no fill, no grid) no longer counts in the frame of the drawings, so a large site around a small building does not shrink them. In the examples the drawings of a grid grow 6 to 55 %.
- The choices of the legend are shorter: *Top*, *Foot*, *Free*.

### Fixed
- A sheet at a fixed scale in a row, grid or column could fail to lay out (a measure used before it was worked out).

## [0.21.3] — 2026-11-23

### Changed
- **Export steps**: a range with an open end runs to the last step whichever way it is written — `3-`, `3–`, `3 a`, `3 até` — and one with an open start from the first (`-5`); the dash alone is every step, like `*`. The field shows the ways to write it under the mouse, and the message when it cannot be read lists them.

## [0.21.2] — 2026-11-23

### Changed
- *Align* in the properties is a single row of icons — left, centre, right · top, middle, bottom · distribute across, down — with no text on the buttons: the name of each shows when the mouse is over it.

## [0.21.1] — 2026-11-23

### Changed
- The buttons of *Align* in the properties have icons, as in a drawing program: the line the objects line up on (left, centre, right, top, middle, bottom) and the two spreads (across, down).

## [0.21.0] — 2026-11-23

### Added
- **Smart guides for texts**, as in a drawing program: drag the text of a label (its handle) or move a text box, and when its left side, middle or right side — or its top, middle or bottom — comes within a few pixels of the same line of another text, it snaps to it and a pink guide runs across the texts on that line. `Alt` while dragging leaves it free. The guides go when the mouse is let go.
- **The subtractions in the 3D viewer**: a new button in its toolbar (the scissors) draws their outlines, as in the drawing; a selected subtraction always shows, and can be moved there, resized by its handles and its height pulled like a volume.
- **Align and distribute texts by their boxes**: with two or more texts selected (labels and text boxes, nothing else), *Align* in the properties, the right-button menu and *Edit › Align* lines them up by their boxes as drawn in the view open — left, centre, right, top, middle, bottom of the screen — and *Distribute horizontally / vertically* leaves equal gaps between three or more. The texts move; the points of their leaders stay where they point. A text that has to cross over its point to get there changes sides, keeping its box where it was sent. With shapes in the selection, aligning still works in plan, as before.

### Changed
- A text box always runs to the right of where it is placed (it has no leader to go left of).

### Fixed
- **A subtraction did not cut the volume it was drawn on** in two cases. With the *terrain* option of the subtraction tool left on, a subtraction started on top of a volume went into the terrain instead, and stayed as a box inside the volume; now a subtraction started on a volume always cuts that volume (the option is for subtractions started on the ground). And a volume marked *Fills a subtraction* was left whole by every subtraction; now only the subtraction whose void it stands in leaves it whole, and a new subtraction made in it cuts it. (A subtraction already drawn with the terrain option keeps it: choose the volume in *Subtracts from* in its properties.)

## [0.20.1] — 2026-11-23

### Changed
- The title and the text of a step are written only on its card, in the steps pane: the *Step* properties on the right no longer repeat them (they keep the highlight, the ghost of the previous step, the sign, the exploded view and the angles).

## [0.20.0] — 2026-11-23

### Added
- **Text boxes**: a new tool, *Text box* (X), puts text on its own on the drawing — a label with no leader and no point, in a box of a width (pull its side to make it narrower or wider, as for any label), not in capitals. Any label can turn its leader off or on in its properties (*Leader line and point*); a text box moves as a whole.
- **Bold, italic and lists in the texts of labels** — the text and the smaller note, of labels and text boxes: `**bold**`, `*italic*`, a line starting with `- ` is an item of a list (a bullet), with `1. ` of a numbered one; the lines of an item hang under its text, and long lines still break at the width. A bar of buttons (B, I, •, 1.) over each text, in the properties and in the box that opens on the drawing, and Ctrl+B / Ctrl+I in them. The sheet, the exports and the GIF draw them the same. The note of a label holds up to 2000 characters.
- **The title and the text of a step on its card**: the card of the current step has the fields to write them, right under its drawing (the properties of the step still have them too).

## [0.19.1] — 2026-11-23

### Added
- **The edges of the walls can be taken and moved.** On a selected box, outline or lying trapezoid (volume or subtraction), in the axonometric and the plan, the top edge of each wall lights up under the mouse: drag it and the wall moves straight out or in (on the grid; Alt: free; Shift: in any direction, the walls beside it leaning to follow). The corners have handles too. A box stays a box when one of its walls moves straight; moving a corner (or a wall with Shift) makes it an outline, as editing a lying trapezoid does. A box with a roof or openings keeps its shape and its size handles. One undo puts it back.

### Changed
- **The lying trapezoid is now a trapezoid in plan** — seen from above, the long side at the front, the short one at the back — with its walls straight up and its top level, the same as the bottom. *Back side* in the properties sets the short side (half the width to start with; 0 makes a triangle). Being an upright extrusion, it takes **subtractions**, floors, cast shadows and *Align faces* on all its walls, like a box. (In 0.19.0 it was a block with a sloping top.) As a subtraction, it hollows out a trapezoid in plan in one piece.

## [0.19.0] — 2026-11-23

### Added
- **Trapezoids, standing and lying**, two new shapes for volumes and for subtractions, beside the box, the cylinder, the sphere, the cone and the pyramid (in the toolbar of the volume and subtraction tools, and in *Shape* in the properties):
  - **Standing trapezoid**: the long side down, the two sides leaning in to a narrower top — *Top width* in the properties (half the base to start with; 0 makes a ridge, like a prism).
  - **Lying trapezoid**: the parallel sides upright — one side as tall as the volume, the other lower, the top sloping between them — *Low side* in the properties (half the height to start with; 0 makes a wedge).
  - They are drawn in every view (axonometric, plan, elevations, 3D viewer, sheet and exports) with their floors, cast shadows, take part in *Align faces* by their upright faces and level top, and people and trees stand on their top (on the slope of a lying one). As subtractions they hollow out the way the shape goes, in thin slices, as a pyramid does; *Fill the void* on one makes a trapezoid of the same measures.
  - A new trapezoid is 6 m tall. Like cones and pyramids, a trapezoid volume is not cut by subtractions yet.

### Changed
- The shape choice in the properties shows its eight shapes on one line.

## [0.18.0] — 2026-11-23

### Added
- **Fill the void of a subtraction**, all of it or a part. A selected subtraction has **Fill the void** (in its properties and in the right-button menu): a shape in its place, of the same shape and as high, comes selected — make it smaller to fill only a part, give it a category or a colour of its own. A volume can also be drawn straight into the void: started on the floor a notch left in a volume, it stands there (not on the roof of the volume); started under a subtraction that goes through everything (a courtyard) or on the subtraction itself, it fills it. Such a volume is marked *Fills a subtraction* in its properties: no subtraction takes anything from it.
- **Subtracting from the terrain**: the subtraction tool has a *terrain* option; with it, a subtraction digs into the ground (a pit, 3 m deep by default) and into platforms (a notch) instead of the volumes, which are left whole. A subtraction started on a platform or a slope does it without the option. The site gets the thickness the pit needs. In the properties, *Subtracts from* has *The terrain*. (Slopes are not cut yet.)
- **People and trees one after another**: their tools stay on after each click, so a row of trees or a group of people takes a click each; Esc or V goes back to selecting.
- **The sheet without the number and title of each step**: a checkbox in the *Sheet* pane (*Number and title of each step*); with the text of the steps off too, the drawings take the room the captions had. It holds for the exported sheet and the GIF as well.

## [0.17.1] — 2026-11-23

### Added
- **The small text of a label is written on the drawing too**: the box that opens on a label (double click, or Enter with it selected) has its two parts — the text and the quieter note under it — each in the size, font and width it has on the drawing; a double click on the note opens it with the note in focus, Tab goes from one to the other, and an empty note field is there to add one. The title in the box breaks its lines like on the drawing (it was one long line, cut, and too big).

### Fixed
- The installers of 0.17.0 were not built: unpacking a version over the folder adds and replaces files but does not take old ones away, so the files of the removed IFC import were still in the repository, and the check of the translations stopped the build on the texts they use. The publish scripts now delete what a version no longer has (listed in `tools/removed-paths.txt`) before they commit.

## [0.17.0] — 2026-11-23

### Added
- **Export steps** in the *Sheet* pane (instead of "Export only the current step"): a field where you write which steps — `7`, `3-7`, `3 a 7`, `1, 4, 6-8`, `*` for all, empty for the step shown — and whether they come out as **separate files** (each step's drawing alone, in a file of its own: one step asks where to save it, several go into a folder, all in the same frame and scale) or as **one sheet** with just those steps, in the layout, paper and scale chosen in the pane. In PDF, SVG or PNG. The hint under it says what will come out, or how to write it when it cannot be read.
- **The sheet preview is navigated like the drawing**: the wheel zooms where the mouse is; the middle or right button, Space or the left button drag the paper; F, Ctrl+0, a double click or the button in the corner frame the page; Ctrl+ and Ctrl− zoom; the zoom box in the corner as in the drawing. A sheet of several pages goes from page to page with the arrows in the corner or ← → (Home, End).
- **The text box of a label is resized on the drawing**: the selected label shows a box hugging its text, lightly filled, its far side drawn heavier with a grip ↔ in the middle and handles at its corners. Pull the side, the grip or a corner in and the text breaks into lines; the side stays under the mouse. A double click on it puts the lines back as typed. The tooltip says so.

### Changed
- **Sheets use the paper better.** The captions under the drawings take the room their text needs, not a fixed height. When the drawings are held by the height (a column, a grid of wide cells, an upright paper), the captions go to the **left of the drawings** and the drawings grow — in a column on an upright A3, from about 38 mm wide to about 77 to 96 mm in the examples. The steps line up in columns, the drawings beside their captions, the block centred on the paper.
- PDF of a single step's drawing (it was SVG and PNG only).

### Removed
- **File › Import from IFC…** and the IFC reader (web-ifc) are taken out: the import did not yet work with real models. It will come back, tested on real projects (and, later, Rev files).
- The *Vertical evolution sheet on A4* button: the vertical layout already turns the paper upright, and A4 is chosen in the paper list.

### Fixed
- A button of the *Sheet* pane (layout, orientation, legend place) sometimes did not take the click. After a click the button kept the focus, and the pane waited for the focus to leave before showing the change: it still showed the old choice (and the old scale hint, "A4" with A1 chosen), and clicking that old choice did nothing, as it looked already picked. Now only a field being typed in holds the pane back, and a choice is compared with what the control shows.

## [0.16.0] — 2026-11-23

### Added
- **File › Export all steps › PNG, SVG, PDF, or PNG, SVG and PDF**: every step of the evolution as an image of its own, in one go. The folder is chosen once; the files go into a folder of their own inside it, "<project> — steps", named by step number and title ("Step 01 Terreno.png"). All the images have the same frame and the same scale, so they line up one after the other in a presentation or a board. PNG at 2400 px, SVG in vectors, PDF in vectors on a page 297 mm wide. Exporting again replaces the files. The message at the end has a button that shows the folder.
- **Terrain as grid** on the sheet — a switch in the *Sheet* pane: the terrain is drawn as in the editor, see-through, with the grid on its surfaces; the flat grid stays inside the site. It is in the exported sheet, in the images of the steps and in the GIF too.
- **The width of a label**: a bar on the far side of the selected label's text; pull it in and the text — the title and the quieter line under it — breaks into lines by itself. The width is also a field in the properties (*Text width*; 0: one line per line typed). A label with a note or a width hangs under its first line, where the leader comes to, as a block of text.

### Changed
- When the toolbar of the drawing is too narrow, the *Join terrain* switch shows without its words (the tooltip says them), so the toolbar keeps one line and the drawing does not jump.

## [0.15.1] — 2026-11-23

### Changed
- The **Join terrain** switch moved from *Project › Site* to the toolbar of the drawing (axonometric and plan), beside the tools, where it is at hand while drawing the terrain. One undo still turns it back.
- The toolbar of the drawing goes on to a second line in a narrow window, instead of hiding its last buttons (the turns of the view).

## [0.15.0] — 2026-11-23

### Added
- **Join terrain** — a switch in *Project › Site*, off by default: platforms and slopes that touch are drawn as one terrain. Faces of the ground in the same plane that touch become one (the line between two platforms at the same height goes, and so does the vertical line on a front that runs on), and the fold where a slope meets a plateau is not drawn; steps (a wall going down) stay. It changes only the drawing: the platforms and slopes stay separate objects, to be moved and edited as before.
- **People and trees stand on what is under them**: on a plateau, half way up a slope, on the roof of a block. They never go below where they were put, and they do not climb onto a block raised on pilotis, into a courtyard cut through a volume, or onto a block they only stand beside.

## [0.14.4] — 2026-11-22

### Added
- **Cancel loading and start without a project**: when opening the last session takes more than a few seconds, the loading screen shows this button. The work of that session is not lost: each of its diagrams that was not saved is written as a `.lionaxon` file in a folder of its own in *Documents › LionAxon*, and a message says where (with a button to show the folder).
- If the window hangs while it starts (and so cannot show the button), after 15 s the app asks in a dialog of the system whether to keep waiting or to start without the project; the page that hangs is stopped and the app starts afresh.
- The window can be closed while it is still starting, even if the page hangs.

### Fixed
- A diagram imported from a big model could make the app slow to open (minutes): stacked outlines with many points are slow to sort for drawing. The outlines of each step are simplified until the step has at most 3,000 points (64 per outline); in the step of the uses, the rooms of one use on one storey make one volume, at most the 60 biggest, and rooms under 2 m² are left out.

## [0.14.3] — 2026-11-22

### Fixed
- Models with curved surfaces filled the terminal with thousands of `[WEB-IFC][error][TriangulateBounds()] No basis found for brep!` — faces the IFC reader cannot triangulate (curved or broken faces of a brep). They are now counted instead of printed, and the import dialog says how many there were.
- An element whose top and bottom were among those faces, with only its sides read, was left out of the diagram (seen from above, sides have no area). It now comes by the outline around its points, and the dialog says how many elements came that way.

## [0.14.2] — 2026-11-22

### Fixed
- The import of a real model could stay on "Drawing the outlines of the storeys…" for good. A single element far from the building (a survey marker, a stray element kilometres away) made the grid of the outlines grow to hundreds of millions of cells. Now the grid never has more than 1,600 cells a side, and the elements more than 1 km from the middle of the building are left out (the message at the end says how many).
- Models placed at their survey coordinates (hundreds of kilometres from the origin) kept their points to only half a metre: they are now kept from the first point of the model, to the millimetre.

### Changed
- The diagram is made in a worker, away from the window: the window keeps answering, the progress says which step is done, the seconds keep counting, and **Cancel** works at this stage too.
- One mass keeps at most its 40 biggest pieces (each at least 2 m², besides the biggest), so that the drawing stays light.

## [0.14.1] — 2026-11-22

The import of IFC files with real, big models.

### Fixed
- A real model could not be imported: "Unable to find segment … in SweepLine tree". The outlines of the storeys were an exact union of thousands of triangles, and the polygon library fails on points a hair apart, as real models have them (far from the origin, many short pieces). The outlines are now drawn on a fine grid (5 cm for a building of 80 m) and traced back: it cannot fail, and it is much quicker. Gaps narrower than 60 cm (joints, a row of columns) are closed, so a storey is one outline, not hundreds of parts.
- The boolean operations of the whole app (subtractions, stacks) no longer fail on such points either: they try again on a 1 cm, then a 5 cm grid before giving up gracefully.

### Changed
- **Big models**: the IFC file is read in a worker thread, so the window does not stop; a window shows how far the reading got (the file, the phases, the model, the geometry element by element) with **Cancel**. The phases are found in the text of the file instead of opening every property; only the faces that look up are kept. A model of 550 MB with 200,000 elements is read in about 20 s here, and the diagram is made in about 5 s more.
- What rises above or sinks below its storey is grouped by its heights (one volume per group, not one per element).

## [0.14.0] — 2026-11-22

A diagram made from a building model: LionAxon reads an IFC file and builds the steps by itself.

### Added
- **File › Import from IFC…** — opens an IFC file (the open exchange format that BIM tools export) and turns the model into masses:
  - on each storey, the outline of everything built there (walls, slabs, roofs, columns, masses…) seen from above becomes one volume per piece, with its courtyards cut out;
  - what rises well above its storey (a fly tower, a chimney) or sinks below it becomes a volume of its own;
  - the model is moved onto a site with a margin around it; the sheet takes the project's name.
- **The steps are built from the model**, as chosen in the import dialog (which first says what was found: storeys, elements, rooms, phases):
  - *Phases, then storeys* (the default when the file has phases): each earlier phase as a step, then the last phase storey by storey;
  - *Phases*: one step per phase — what is built in it appears, what is taken down disappears and shows dashed;
  - *Storeys*: from the lowest storey up.
  Phases are read from the "Phase Created" and "Phase Demolished" properties, when the model exports them; "existing" comes first, and a demolition always after the building.
- **A last step with the uses**: the rooms, coloured by their names (the eight biggest uses get a category each, the rest go together), inside the masses seen as ghosts.
- The diagram opens in a new tab, not saved yet; titles, texts and the order of the steps are yours to change.
- **A0 paper** for the sheet (1189 × 841 mm), beside A4, A3, A2 and A1; it exports as PDF, SVG and PNG (at 300 dpi, 14043 × 9933 px).
- web-ifc (MPL 2.0) reads the IFC files, in the main process; it is kept in `src/vendor/web-ifc`.

### Notes
- Spheres, terrain and openings of the model are not brought in; curved walls come as many short sides.
- The import has been tested with IFC files made for the tests (IFC4, millimetres); files exported by the BIM tools in use may still show cases to adjust.

## [0.13.2] — 2026-11-22

### Changed
- The two mouse modes of the 3D viewer are called only **Rev** and **Sketch**, everywhere: the toolbar, its tooltips, the status bar, the documentation.

## [0.13.1] — 2026-11-22

### Changed
- The *Mouse* choice of the 3D viewer reads **Rev / Sketch** (shorter, so the toolbar fits on one line more often).

## [0.13.0] — 2026-11-22

The 3D viewer has two mouse modes, shapes are resized in it, and a step can be duplicated.

### Added
- **Two mouse modes in the 3D viewer, Rev and Sketch** — a choice in the viewer's toolbar (*Mouse*), kept between sessions:
  - *Rev* (the default): dragging with the middle button pans, `Shift` + middle button orbits;
  - *Sketch*: dragging with the middle button orbits, `Shift` + middle button pans;
  - in both: the wheel zooms at the mouse, a double press of the middle button fits the drawing, the right button pans and `Shift` + right button orbits.
- **Orbit and Pan tools** for the left button on the paper, with the keys `O` orbit (as before), `H` pan.
- **The view turns around what is selected**; with nothing selected, around the middle of the site.
- **A view cube** in the corner of the viewer: a click on a face looks straight at that side, a click on a corner looks from it (isometric).
- **Labels are optional in the 3D viewer**, and off by default: a *Labels* switch in its toolbar (the choice is kept). The sheet and the other tabs draw them as always.
- **Resizing in the 3D viewer**: a selected shape shows handles on its sides and corners — volumes, cuts, platforms, slopes and flat areas; a sphere by its diameter. The opposite side stays where it is; the size follows the grid (`Alt`: free, at least 0.1 m); turned shapes grow along their own sides; one undo per pull. The round handle of the height is still there. Free outlines are not resized here.
- **Duplicate step**: a button on each card of the list of steps, in the card's right-button menu and in the *Step* menu (`Ctrl+Shift+D`). The copy comes right below, selected, with the same title, text, drawing, exploded view, angles, ghost and sign; the objects keep their ids (that is how the changes between steps are told). One undo takes it out.

### Changed
- In the 3D viewer the middle button used to pan only; it now follows the chosen way (Rev: the same as before, plus `Shift` to orbit).
- `Shift` snaps the turn to 15° only with the left button.
- The viewer's toolbar goes to a second line in a narrow window.

## [0.12.0] — 2026-11-22

Updating from the app, as in the other apps of the Lion family, and two things found in use.

### Added
- **Update now**: in the versions window (the version number, bottom-right corner), after *Check now* finds a newer version, *Update now* downloads the installer of this copy, keeps it only if its SHA-256 and size are the ones of the release's `manifest.txt`, shows the progress and opens it:
  - Windows, installed by the setup wizard: the new wizard is opened and LionAxon closes to be replaced;
  - macOS: the `.dmg` goes to Downloads and is opened;
  - Linux: the AppImage is replaced where it is and LionAxon opens again; the `.deb` or the `.rpm` goes to Downloads and is opened in the system's software installer;
  - any other copy (the source, the portable `.zip`): the download page, as before.
  The window says which of these applies before anything is downloaded. Nothing is checked or downloaded on its own: only when the person clicks.
- A locked object says so at the top of its form, with an **Unlock** button.

### Fixed
- **A locked object could not be picked again to be unlocked**: a click on it went through to the paper, so its padlock was out of reach (only the right-button menu and the element list could unlock it). A click now selects it — without handles, and it still cannot be dragged, nudged or turned. Locking keeps the selection.
- **Choosing a drawing style threw the project pane back to its top**, and so did any other change in a scrolled pane: panes now keep their scroll when what they show is rebuilt.

### Notes
- The update was tested here against a local copy of a release (the check, a tampered download discarded, the right file kept). Opening the real installers on Windows and macOS, and replacing a real AppImage, could not be tried here.
- The portable `.zip` on Windows is told from the installed copy by the uninstaller that the wizard leaves beside the program.

## [0.11.0] — 2026-11-22

Aligning faces, as the Align tool of BIM programs does.

### Added
- **Align faces** (`L`, in the toolbar of the drawing and in *Edit › Align*): the first click picks the face to align to, the second the face of another shape, which moves straight until the two lie in the same plane. Upright sides are aligned by sliding on the ground, tops by changing the height of the base. The face picked is filled, the one under the mouse is outlined; after each pair the tool waits for a new reference, and `Esc` goes back to selecting.
  - It works on volumes (boxes, free outlines, turned or not), subtractions, platforms, slopes (their sides) and flat areas; a locked shape may be the reference.
  - What stands on a shape goes along with it; one undo takes the move back.
  - Faces that are not parallel are left alone, with a notice; so is the top of a volume that stands on another (its height comes from the one below) and a locked shape.

### Changed
- The release and CI workflows use the versions of the GitHub actions made for Node 24 (`checkout@v6`, `setup-node@v6`, `upload-artifact@v6`, `download-artifact@v7`), to end the deprecation warnings. Not run yet.

### Notes
- Round sides (cylinders) lie in no plane: only their tops can be aligned. The align tool works in the axonometric tab.

## [0.10.0] — 2026-11-22

What a real design sheet asked for: redoing the eight moves of a theatre's parti showed what was missing.

### Added
- **Openings on the walls**: doors, windows, arches and round openings drawn on a wall of a box, without cutting it. They are added from the properties of the box (on the wall that faces you), have their own form (kind, wall, place along it, sill, size), go with their volume when it moves, turns or is duplicated, and are deleted with it. They may reach into the gable of a roof.
- **Roofs**: the **ridge** along the width or the depth (or the longer side, as before), so a row of volumes can share one roof line; a **colour of its own** for the slopes.
- **A colour of its own** for a volume, instead of the one of its category or of the style; it stays out of the legend.
- **Paved floors**: flat areas may have joints every so many metres.
- **Arrows between levels**: an arrow may end at another height than where it starts.
- **Labels**: a second, quieter line under the text (a note), and a mark at the point (! × + −).
- **Sheet**: the **legend along the foot** in a row, instead of the column under the title; **text blocks** in a column on the right (title and text; a line that starts with + or − is drawn as a point for or against). The drawings make room for them.

### Fixed
- **Flat areas did not show over a site with thickness**: the top of the block of earth covered them. They are now drawn on the top they lie on.
- **Streets, paving and context volumes were lighter than the paper instead of darker** (the shade went the wrong way), so on white paper they could not be seen.
- `tools/inspect.mjs` failed on projects with volumes on a reference plane.
- The legend along the foot uses the whole width of the paper.

### Notes
- Still to come from the same test: several sheets and alternatives in one project, a small drawing beside the main one, free terrain (L-shaped levels, contour lines, volumes that dig), stairs, zoning plans with named rooms, materials (stone, tiles).
- Openings are for boxes only, and are not drawn in plan.

## [0.9.1] — 2026-11-22

Installers, and the links to download them.

### Added
- **Installers for each version**, built by the release workflow on Windows, macOS and Linux machines when a version tag is pushed, and published in the release: `LionAxon-Setup.exe` (setup wizard) and `LionAxon-win-x64.zip` (portable), `LionAxon-mac-universal.dmg`, `lionaxon_amd64.deb`, `lionaxon.x86_64.rpm` and `LionAxon-x86_64.AppImage`. The names are fixed, so `releases/latest/download/<name>` always brings the latest version. Every installer holds the whole app.
- **Download buttons and a Download section in the README** (English and Portuguese), with how to install on each system and what the first-launch warnings mean.
- `manifest.txt`, `SHA256SUMS.txt` and the release notes (the section of the version in this changelog) are written by `tools/make-release.mjs` and published with the installers. The app's *Check now* reads `manifest.txt`, so it starts working with the first published release.

### Changed
- The release is published at once (it was a draft), and only if the tag is the version of `package.json`.

### Notes
- The installers are not signed. They have not been built or tried on real machines before this version: the first run of the workflow is the first test.

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

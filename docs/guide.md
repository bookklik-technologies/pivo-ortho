# User guide

New to the app? Start with the [Beginner tutorials](/tutorials/) for step-by-step projects, screenshots, and editable checkpoints.

The canonical Ortho workflow is **Model → Paint → Animate → Save → Export**. Release 0.8.0 is a working development baseline; scope details are in [COVERAGE.md](/COVERAGE).

## 1. Model

- Select a mesh from the outliner or click it in a viewport. Add **Cube, Plane, Pyramid, Cylinder or Triangular Prism** from the inspector.
- Choose **Pick mesh/face/vertex** and **Select/Move/Rotate/Scale**. Colored arrows, rings and box handles provide graphical transforms with world/local movement and rotation, local scaling, independent snap settings, edited-pivot support and one undo entry per gesture. **Escape cancels.**
- Rectangle-select vertices through depth, then drag with Move. Use the numeric inspector for translation, rotation, scale and pivot.
- Select a face to **extrude/delete** or change color, textured/shaded/double-sided/draw-behind flags. **Mirror and merge** are available.

## 2. Paint

- Choose a swatch, use **pen/eraser/fill/line/rectangle/ellipse**, and click or drag on the fixed **128×128 indexed atlas**. Ctrl-click or *Pick color* samples an index. Right-click paints with the secondary color.
- Filled shapes, marquee snapshot move/**Alt-copy** with one-step undo, palette edits, gradients, shade ramps and PNG quantization are available.
- Selected face UVs survive switching from Model to Paint: manipulate their handles or use nudge/rotate/flip/scale/copy/paste controls. UV handles update the real textured model while dragging, without changing saved state until release.
- **Navigation** — wheel zooms at the pointer; middle-drag or Space+drag pans; `+`/`-`/`Home` zoom/fit the focused atlas. Escape cancels moves, UV edits and pans. The live preview renders the real scene.

## 3. Animate

- Select a mesh and add **Movement / Rotation / Scale / Visibility / Oscillation** clips, adjusting one of four tracks. New clips select themselves and use the least populated track.
- **Drag a library button into a lane** to create a clip at that position. Existing clips drag between tracks; either edge resizes the interval (the left edge holds the original right edge and vice versa).
- Each gesture previews without changing the document and commits once on release; **Escape cancels**. Timeline snap is adjustable, Ctrl/Cmd temporarily disables it, and locked meshes/folders cannot be edited.
- The inspector exposes track, time, amount, axis, easing, frequency, ping-pong and oscillation property. Scrub by clicking a lane; Play loops the shared timeline — the actual scene preview updates, not merely numeric pose text.

## 4. Save

- Download an editable **`.pvo`** project. Open validates before replacing the document; invalid files are rejected without discarding current work.
- Undo/redo stores up to 60 snapshots. New/Open are undoable in this release (a deliberate browser safety adaptation).

## 5. Export

- **OBJ/MTL/PNG** or **glTF/bin/PNG** are ZIP bundles.
- Texture PNG, rendered PNG, animated GIF and sprite-sheet PNG are actual encoded downloads. GIF/sheets can use a **camera turntable** or the timeline.
- Frame batches are bounded to 64 MiB, 120 frames and 512px frames; encoding runs on the main thread after rendering, and cancellation is effective during frame capture.

## Navigation & shortcuts

Right-drag pans; Alt/middle-drag orbits in perspective and pans in orthographic views; wheel zooms.

| Keys | Action |
| --- | --- |
| `Q` / `W` / `E` | Pick mesh / face / vertex |
| `V` / `T` / `R` / `S` | Select / Move / Rotate / Scale (Model mode) |
| `1` / `2` / `3` | Switch modes |
| Ctrl/Cmd + `Z` / `Y` | Undo / redo |
| Ctrl/Cmd + `S` / Ctrl/Cmd + `O` | Save / open |

Shortcuts are suppressed in text inputs. Use Help for the full limitations and shortcut list.

## Storage & safety

- No accounts, telemetry, cloud uploads or runtime font/icon CDN dependencies.
- A namespaced localStorage recovery copy is debounced and validated on reload; quota/unavailable-storage failures are reported. **Save a `.pvo` copy for reliable persistence** — clearing browser site data removes recovery.
- *Clear recovery* removes the stored copy, not the current document; later edits resume autosave. The iframe preview may restrict storage/downloads compared with running the packaged app directly.
- Mesh and folder locks block geometry, UV, transforms and associated clip edits. Global atlas/palette edits still affect the shared texture. Folder merging bakes base transforms and removes source clips; it is undoable and explicitly reported.
- File size/count limits reject malformed or excessive projects; the app does not execute code from project files.

## Themes & typography

- Light/dark theme via the header Moon/Sun button, persisted in `pivo-ortho:theme:v1`. Theme changes affect only interface chrome and display-only checkerboards — never project rendering, palette colors, geometry, clips or exported pixels.
- Outfit Variable typography and Lucide icons are locally bundled; theme-matched scrollbars use Chromium/WebKit styling with a Firefox fallback.

# PiVo Ortho — behavioral specification

Version 1.0 • 10 October 2026.

## 1. Purpose

Build a usable desktop-browser low-poly editor spanning modeling, indexed pixel-art textures, per-face UV editing, relative clip animation, and portable exports.

Example geometry, palette, shader and export bitmap glyphs are authored for PiVo Ortho. The v0.6 UI uses licensed Lucide icon paths and locally bundled Outfit font assets. Rules explicitly identified below as design decisions are ours.

## 2. Feature scope versus design choices

Documented: three work modes; four modeling viewports; direct vertex/mesh edits; additive and through-depth rectangle selection; snapping; editable mesh center; extrusion, face deletion, vertex merging/deletion, mirror and clone; face color/double-sided/shaded/textured/draw-behind flags; project folders, hide/lock, rename/duplicate/merge; copy/paste; 128×128 texture, sixteen palette entries, one transparent entry; per-face UVs with selection/move/rotate/flip/scale/copy/paste; pixel pen, eyedropper, fill, line, rectangle, circle and marquee tools; palette ramps, swap/gradient/presets; one shared timeline with four tracks per mesh and relative movement, rotation, scale, visibility, and oscillation clips; easing, ping-pong and frequency; movable/resizable clips; GIF, sprite sheet, texture PNG, OBJ/MTL and glTF exports; retro affine texture mapping.

Design choices: coordinate system, mesh storage and polygon triangulation, primitive inventory, numeric ranges, undo transaction model, shader implementation, alpha threshold, clip overlap/order/end state, color quantizer, browser storage format, UI arrangement/shortcuts where conflicts occur, and export packaging. Compatibility with third-party native project formats is deliberately outside this release. Advanced GIF decoration options, OS file-browser actions, cross-window clipboard conventions, and exact palette/theme appearance beyond our own design are not automatically implied by the core workflow targets; each must be listed as implemented or deferred in the delivery matrix.

## 3. Platforms, privacy and architecture

Desktop mouse/keyboard experience; minimum recommended viewport 1100×700. Smaller windows remain navigable; touch-first 3D editing is not a release goal. Serve static assets with no API, account, telemetry, CDN, cloud storage, or external runtime fonts. File uploads, quantization and project processing happen locally. Browser download and explicit file selection replace native filesystem dialogs. localStorage recovery is best-effort, quota guarded, and isolated under the app namespace. Work is not automatically uploaded.

TypeScript data/geometry/raster/animation/history core has no UI dependencies. React owns accessible UI state. Three.js supplies WebGL infrastructure, but renderer choices and shader math are authored here. IO imports core types/functions and uses audited open-source compression/GIF dependencies. Modules have no cyclic dependencies. Vite builds static assets. Unit tests use Vitest and browser tests Playwright. No proprietary format parser is present.

## 4. Data model and limits

One Project stores format='pivo-ortho', version=1, name, mesh array, folder array, one indexed Texture, Animation and RenderSettings. Stable opaque IDs link meshes, vertices, faces, clips and folders. A mesh owns vertices, polygon faces, local position/rotation/scale, local pivot, visible/locked flags, and an optional folder ID. A face references its vertex IDs, stores one UV per corner, and its five render flags. UVs are texture-pixel coordinates with top-left origin; export codecs convert conventions explicitly. Geometry is right-handed, Y-up; rotations are radians internally and degrees in user-facing fields. The transform is position + pivot + rotation × scale × (vertex − pivot).

Textures have exactly 16,384 indices in 0…15 and 16 six-digit sRGB colors. A designated palette index is transparent; background and discrete shading ramps reference palette entries. Animation duration and fps are finite positive numbers; track indices are 0…3. Validation caps project bytes, counts and nesting to avoid accidental resource exhaustion and rejects invalid IDs, nonfinite numbers, dangling references, malformed topology, impossible dimensions and unrecognized project versions. Limits and failures are visible, not silent truncation.

## 5. Document editing and history

Only explicit transactions mutate durable state. Each action clones the current document, applies changes, validates, and commits atomically. Exceptions do not change the current document or history. Undo/redo covers geometry, UVs, texture, palette, folder, render settings and clips. One pointer gesture is one transaction: use a preview copy while dragging and commit on pointer-up; Escape cancels. Starting a fresh action after undo discards redo state. Cap stored snapshots to avoid unbounded memory; do not promise unlimited history. Project load/new may retain an undoable safety transaction in the browser UI; explicit core reset clears history. Session camera and transient selection are not file identity.

Native save is an explicit .pvo UTF-8 JSON download; open validates before replacing the project. Autosave uses a dedicated recovery key with debounce and reports quota/security errors. A corrupt recovery must not crash startup. Existing work is not overwritten through imports until validation succeeds. Provide a deliberate reset/new action and recovery affordance. Save/load must preserve transforms, faces, UVs, palette indices and clip properties exactly.

## 6. Viewports, navigation and selection

Model mode presents top, front, side and perspective views. Camera pan, orbit (perspective), wheel zoom, reset/frame and viewport maximization are available. Clearly distinguish edit dragging from camera manipulation. A world grid and axes aid orientation. Use CSS-scaled, nearest-neighbor low-resolution render output while matching picking to the displayed viewport and device pixel ratio.

Mesh, face and vertex selection modes have visible controls. Clicking selects nearest eligible geometry; Shift extends/toggles selection. Rectangle vertex selection is through-depth. Hidden meshes cannot be picked. Locked meshes/folders can be inspected but cannot be mutated. Selection is pruned after deletion or loading; an active face always belongs to its active mesh. Numeric inspectors are an alternative to pointer manipulation. Shortcuts do not intercept text editing, file dialogs or unrelated browser commands.

## 7. Geometry operations

Primitive set: cube, plane, pyramid, cylinder and triangular prism. Each has consistent winding and UVs. Mesh translation/rotation/scale, vertex translation/nudge/grid snap, pivot adjustment, duplication, deletion, mirror, folder merge, and copy/paste preserve material/UV data where possible.

Extrusion duplicates selected face corners along its normalized face normal, moves the cap, and adds connecting side faces with meaningful UV defaults. Zero/negative distance behavior is defined and tested; degenerate faces fail clearly. Vertex merging averages selected positions, rewires affected faces, retains per-corner UVs, removes degenerate polygons and leaves no dangling IDs. Deleting vertices removes faces referencing them. Mesh deletion removes its clips. Face deletion removes an empty mesh at application level. Mirroring corrects winding. Folder merge bakes world transforms into an independent mesh and prunes former clip references or explicitly explains animation consequences.

Concave polygon rendering/export uses projected ear clipping, not an unsafe triangle fan. Reject non-simple/degenerate polygons that cannot be triangulated. Geometry operations must honor locks regardless of whether invoked via pointer, keyboard or menu.

## 8. Render semantics

Each face can use a flat palette color or indexed texture, be single/double sided, opt into shading, or draw behind ordinary geometry. nearest-neighbor filtering and discrete ramp lookup produce pixel-art output; transparent texels discard fragments. In this renderer, draw-behind uses a distinct order/depth policy tested separately. Shading uses a configurable light direction and per-color palette ramps. Unshaded faces use their base colors. Wireframe/solid/textured display modes are presentation options.

Affine UV interpolation approximates a PS1-style texture distortion using standard affine texture mapping. A perspective-correct alternative may be provided later. Exact rasterization details, such as palette-lighting rounding, order artifacts and edge pixels, follow this specification rather than any external implementation. Transparencies, winding and affine sampling are covered by dedicated tests using fixture geometry generated by this project.

## 9. Indexed painting and palette

Display the 128×128 canvas at integer-friendly zoom with crisp pixels, optional grid, pan, primary/secondary color controls and a visible tool label. Pen/eraser strokes interpolate points to avoid gaps. Line uses integer rasterization. Rectangle and ellipse support outline/filled choices. Flood fill is four-connected and bounded. Eye dropper reads a texture index, including transparency. Marquee uses an explicitly bounded rectangular selection and supports copy/paste/move without reading arbitrary system clipboard data.

Painting updates the model preview immediately. Do not edit UVs with the pen or paint pixels while manipulating UV handles. PNG import decodes locally, maps to the fixed texture dimensions and quantizes against the selected palette deterministically; transparent input goes to the transparent index. Alpha threshold and resampling are independent rules, explained in help. Palette editing updates indices' appearance without rewriting geometry. Swap semantics must state whether visual colors or index identities are preserved. Shade ramps are editable; auto-ramp generation is a deterministic helper. Pixel export reconstructs RGBA with transparent alpha exactly.

## 10. UV editing

Select one or several faces and draw UV edges/handles over the pixel texture. Face corners are not shared UV vertices; seams remain representable. Select/move UV corners, including rectangle selection; whole-face move/scale/rotate/flip/copy/paste are accessible controls. Rotation is around the selected UV centroid, normally in quarter turns. Snap is in texture pixels; normalized export coordinates are derived, never stored. Operations preview live and commit once. UVs may extend outside the atlas, with renderer clamp/wrap behavior defined, but nonfinite UVs are invalid. Clipboard paste must match corner counts or reject clearly rather than scrambling the face.

## 11. Clips and deterministic playback

Every mesh has four lanes on one timeline. Library types: movement, rotation, scale, visibility and sine oscillation. Clip position/duration is editable with pointer drag/resize and numeric inspector, as is track. Select axis, amount, easing (linear/ease-in/ease-out/ease-in-out), ping-pong and oscillation frequency/property. Duration edits stay positive; start stays nonnegative. Clips remain attached to stable mesh IDs when names change. Duplicate/copy/paste generates new clip IDs.

Evaluation rules: evaluate relative to base mesh transforms, sorted by track, start and ID. Movement/rotation add and scale factors multiply. Ordinary progress clamps to 0 before start and 1 after end; ping-pong uses a triangular progress envelope. Visibility hides only during its active interval. Sine oscillation contributes only during its active interval, with frequency in cycles per second. Mesh base state is never modified by playback. UI loops time modulo project duration; core evaluation itself does not loop. Scrubbing the same time always produces the same pose regardless of prior playback. Hidden folder/mesh state still applies.

## 12. Output and interoperability

- Project: .pvo JSON, all editable state.
- Texture PNG: 128×128 RGBA, transparent index preserved.
- Rendered PNG: current view/pose with selected background/transparency.
- OBJ/MTL/PNG: current evaluated static scene, world-space positions, per-corner UVs, corrected normals/winding and compatible materials. Animation is intentionally absent.
- glTF 2.0/.bin/PNG: triangulated scene, standard textured/flat materials, double-sided state and sampled transform animation where representable. Mesh-center transforms must be correctly baked or represented by nodes. Visibility, draw-behind, palette ramps, affine sampling and retro post effects are not portable core glTF semantics; emit specific warnings instead of silently claiming parity.
- GIF: deterministic timeline or turntable frames, explicit dimensions/fps/duration, real animated frames and transparent index handling. Encode palette colors carefully; restrict frame count/memory and expose progress/cancel.
- Sprite sheet PNG: deterministic turntable or animation frames in row-major tiles, configurable frame count/size/columns, explicit transparency. Empty tail cells are transparent. Camera choices must be visible and reproducible.

Multi-file exports download as a ZIP with sanitized names. Browser downloads replace native output-folder launch. No fake success notification before bytes exist. Check exports with an independent reader/validator, not only the writer's inverse function.

## 13. Organization, settings and accessible interactions

Outliner shows named meshes/folders, selection, visibility and locks; supports rename, folder organization, duplicate/delete and merge. Face/mesh inspectors expose relevant flags and transforms with accessible labels. Mode-specific keyboard help avoids shortcut collisions. Support focus-visible controls, keyboard-operable dialogs, escaped user text, status updates and readable contrast. WebGL failure explains the requirement rather than rendering an inert editor. Context menus cannot be the sole path to essential operations. Do not claim a canvas-based 3D editor is fully screen-reader accessible; label limitations honestly.

Settings include grid snap, texture grid, render pixels, shading/affine preferences, theme and recovery control when actually implemented. Theme controls do not reuse product themes. No default feature may require external internet. Full offline use is only claimed when caching/install workflow is implemented and tested; local static hosting is sufficient for this release.

## 14. Verification coverage

Core: primitive topology, concave triangulation, transform/pivot math, extrusion, merge/delete, mirrored winding, locks, UV transforms, raster boundaries, flood fill, palette swaps/ramps/quantization, deterministic clips, atomic undo/redo, strict malformed project rejection.

IO: PNG signature/CRC/decoded content, actual GIF frame count/delays, sprite layout, OBJ face/UV/MTL structure, glTF accessors/alignment/materials/animation and third-party loader import. Test no hidden/locked assumptions are silently conflated.

Browser: first launch, modeling edits, undo/redo, paint with live texture, UV editing, all clip types, scrub/play/pause, outliner hide/lock, validated file open/download, recovery after reload, all export paths, resize/picking, shortcut text-input guards and build asset loading. Capture console/page errors. Document actual browser engines exercised; do not claim unrun coverage.

Performance: start with measured fixtures of 50 meshes and 2,000 faces, 128×128 painting, 12-fps previews and bounded 256×256 GIFs. Record measured results rather than guaranteed frame rates. Dispose renderer resources and avoid rebuilding unmodified geometry per playback frame. Validate resource caps under malicious/accidental imports.

## 15. Delivery

Ship source archive, lockfile, static build, example projects, this specification, module contracts, architecture/user guide, the project LICENSE (MIT) and dependency license inventory, actual test report and honest implemented/deferred matrix. Built distribution is served by a static HTTP server, not opened as file:// ES modules. No hosted public URL is created without an explicit destination and consent. Product completeness is assessed feature by feature against the documented roadmap.

Roadmap beyond delivered baseline: native-format compatibility only with public docs or authorized fixtures; advanced export decoration and camera animation; clipboard interoperability; touch input; richer performance fixtures; optional installable offline shell. These are not silently included in claims of completion.

## Release implementation status

Release 0.1.0 delivers the tested baseline described in COVERAGE.md and README.md; remaining roadmap items are deferred. Numeric transforms replace graphical rotate/scale gizmos; capture uses a fixed camera; advanced GIF effects and third-party native-format compatibility are deferred. Actual test results live in TEST-REPORT.md. All demo colors use the Studio palette.

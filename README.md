# PiVo Ortho

A local-first browser low-poly editor. Release 0.8.0 is a working development baseline; scope is listed below.

## Run on your development machine

Use Node 22.12+ or Node 24 and npm.

```sh
npm ci
npm run dev
```

Build: `npm run build`. Serve the resulting dist directory using any static HTTP server, or `npm run preview`. Open the URL printed by Vite. The self-contained pivo-ortho-browser.html is also included for a dependency-free runtime preview. WebGL2 and a desktop mouse/keyboard are required. Recommended window width: 1200px or more. This is not a touch-first editor.

The hosted production build includes a manifest and automatically registered service worker that caches the app shell and bundled assets. Open it online over HTTPS or localhost and let caching finish before using it offline. Use the browser's install action where supported. This workflow applies to the production build, including `npm run preview`; the development server and separate `pivo-ortho-browser.html` preview do not use this offline shell. Keep downloaded `.pvo` backups: clearing site data removes local recovery and cached assets.

## Documentation

After `npm ci`, run these commands from the app's repository root:

```sh
npm run docs:dev      # start the VitePress documentation server
npm run docs:build    # generate the static documentation site
npm run docs:preview  # preview the built documentation site
npm run docs:capture  # recreate tutorial screenshots and downloadable checkpoints
```

Open the local URL printed by VitePress. The documentation build is written to `docs/.vitepress/dist`; run `docs:build` before `docs:preview`. The application build remains in `dist/`.

The [beginner tutorials](docs/tutorials/index.md) cover one project through three lessons, with real screenshots and editable native-project checkpoints. `docs:capture` starts a temporary local Vite server, uses a fresh Chromium session, writes assets to `docs/public/tutorials/`, and closes the browser/server afterward. It uses an installed Playwright Chromium browser (or installed Chrome); if neither is present, install Chromium with `npx playwright install chromium` first.

## Verify

```sh
npm test
npx playwright install chromium
npm run test:browser
```

Historical verification from 10 October 2026 records 320 unit/integration tests and 96 Chromium browser tests passing, including an independent Three.js glTF importer and a 50-mesh/2,100-face fixture. Firefox, Safari/WebKit and real mobile devices are not yet certified. The production TypeScript/Vite build passed in that run. These results predate the PWA addition and do not certify its installation/offline behavior. See docs/TEST-REPORT.md for the recorded results and caveats.

## Make something

1. Model: select a mesh from the outliner or click it in a viewport. Add Cube, Plane, Pyramid, Cylinder or Triangular Prism from the inspector. Choose Pick mesh/face/vertex and Select/Move/Rotate/Scale. Colored arrows, rings and box handles provide graphical transforms with world/local movement and rotation, local scaling, independent snap settings, edited-pivot support and one undo entry per gesture. Escape cancels. Rectangle-select vertices through depth, then drag with Move. Use the numeric inspector for translation, rotation, scale and pivot. Select a face to extrude/delete or change color, textured/shaded/double-sided/draw-behind flags. Mirror and merge are available.
2. Paint: choose a swatch, use pen/eraser/fill/line/rectangle/ellipse, and click or drag on the fixed 128×128 indexed atlas. Ctrl-click or Pick color samples an index. Right-click paints with secondary color. Filled shapes, marquee snapshot move/Alt-copy with one-step undo, palette edits, gradients, shade ramps and PNG quantization are available. Selected face UVs survive switching from Model to Paint; manipulate their handles or use nudge/rotate/flip/scale/copy/paste controls. UV handles update the real textured model while dragging, without changing saved state until release. Wheel zooms at the pointer; middle-drag or Space+drag pans; +/- and Home zoom/fit the focused atlas. Escape cancels moves, UV edits and pans. The live preview renders the real scene.
3. Animate: select a mesh, add Movement/Rotation/Scale/Visibility/Oscillation clips, and adjust one of four tracks. New clips select themselves and use the least populated track. Drag a library button into a lane to create a clip at that position. Existing clips drag between tracks; either edge resizes the interval. The left edge holds the original right edge, and the right edge holds the start. Each gesture previews without changing the document and commits once on release; Escape cancels. Timeline snap is adjustable, Ctrl/Cmd temporarily disables it, and locked meshes/folders cannot be edited. The inspector exposes track, time, amount, axis, easing, frequency, ping-pong and oscillation property. Scrub by clicking a lane; Play loops the shared timeline. The actual scene preview updates, not merely numeric pose text.
4. Save: download an editable .pvo project. Open validates before replacing the document; invalid files are rejected without discarding current work. Undo/redo stores up to 60 snapshots. New/Open are undoable in this release (a deliberate browser safety adaptation).
5. Export: OBJ/MTL/PNG or glTF/bin/PNG are ZIP bundles. Texture PNG, rendered PNG, animated GIF and sprite-sheet PNG are actual encoded downloads. GIF/sheets can use a camera turntable or the timeline. Animation GIF duration follows the timeline; turntable duration is frames/fps. Frame batches are bounded to 64 MiB, 120 frames and 512px frames; encoding runs on the main thread after rendering and cancellation is effective during frame capture.

Navigation: right-drag pans; Alt/middle-drag orbits in perspective and pans in orthographic views; wheel zooms. Q/W/E select mesh/face/vertex. V/T/R/S choose Select/Move/Rotate/Scale in Model mode. 1/2/3 switch modes. Ctrl/Cmd+Z/Y undo/redo; Ctrl/Cmd+S saves and Ctrl/Cmd+O opens. Shortcuts are suppressed in text inputs. Use Help for limitations and shortcuts.

## Storage and safety

No accounts, telemetry, cloud uploads, runtime font/icon CDN dependencies. A namespaced localStorage recovery copy is debounced and validated on reload. Quota/unavailable-storage failures are reported. Save a .pvo copy for reliable persistence; browser site-data clearing removes recovery. Clear recovery removes the stored copy, not the current document; later edits resume autosave. The iframe preview may restrict storage/downloads compared with running the packaged app directly.

Mesh and folder locks block geometry, UV, transforms and associated clip edits. Global atlas/palette edits still affect the shared texture. Folder merging bakes base transforms and removes source clips; it is undoable and explicitly reported. File size/count limits reject malformed or excessive projects; the app does not execute code from project files.

## Scope and known differences

- Own project format: third-party native formats are NOT supported.
- Interface, palette, demo geometry, editor code and shader are authored for PiVo Ortho; the UI uses licensed Lucide icons and Outfit typography.
- Scope is documented; see docs/COVERAGE.md.
- Our rules are explicit in docs/SPECIFICATION.md and CONTRACT.md.
- Mesh, vertex and face graphical transforms are supported alongside numeric fields. Scaling uses local axes. Multi-mesh nonuniform scale is baked into geometry to preserve affine shape without inventing a shear-capable TRS; the common group pivot uses world orientation.
- UV editing operates on the active mesh; cross-mesh multi-face editing is not certified. UV drags commit selected corners, whole-face controls act on selected faces.
- PNG/GIF/sprite capture has perspective/orthographic cameras, yaw/tilt, distance, target XYZ, FOV/orthographic height, background and turntable start/direction. Use current view copies the last focused viewport camera pose/projection; output dimensions define the aspect ratio. PNG size is configurable up to 2048px per axis. Fit model recenters off-origin scenes. Settings persist locally and sheets include companion JSON. Outline, scanline and bottom-left/right pixel tags now apply to PNG/GIF/sprite output through one shared pipeline. Live previews use the exact output resolution, support scrubbing/playback, and match saved-frame pixels.
- Desktop pointer drag/drop, cross-track movement and both resize handles are supported; mobile drag behavior is not supported. Existing overlapping clips are allowed. Use the Selected clip chooser to reach overlapped or off-range clips; imported clips beyond the timeline are retained rather than silently truncated.
- Decorated GIF exports extend the global palette to preserve exact effect/background colors while retaining transparency (up to 256 colors). Overflow is explicitly warned and mapped to nearest colors. The core default indexed-palette path remains available.
- glTF supports sampled transform animation with pivot-correct local nodes. Visibility clips, draw-behind, retro affine interpolation, shade ramps and retro post effects are not standard glTF semantics; warnings name these losses. OBJ is a static scene snapshot. Exported standard materials are not the editor's custom retro shader.
- Collaboration, skeleton rigging, native-format interoperability, and a remote deployment are not included. The hosted production build has a PWA offline shell; the separate bundled HTML preview has no runtime network dependencies but does not use that service-worker caching workflow.
- WebGL canvas workflows are not fully screen-reader accessible. Panels/inputs are labeled, focus is visible, and dialogs contain focus and support Escape.

## Structure

- src/core: typed project model, geometry, raster operations, UV math, absolute evaluated poses, strict parser and transaction history.
- src/ui: React workspaces, Three.js palette/affine shader, real render previews, selection/navigation and export capture.
- src/io: pure PNG/GIF codecs, sprite packing, OBJ and glTF exporters, ZIP/browser download helpers. gltf2.ts is the active glTF implementation.
- tests: deterministic unit/integration tests and browser workflows.
- docs: behavioral specification, module contract, coverage matrix and actual test report.
- examples: robot demo and performance fixtures. `npm run examples` regenerates them.
- dist: static production build.

## 0.2.0 additions

The graphical control geometry and hit testing use Three.js's MIT-licensed TransformControls. The application-specific immutable selection/pivot/group transform math is implemented in src/ui/transforms.ts. Controls live on transparent overlay canvases to survive scene rebuilds during a drag. The 0.1.0 project format remains compatible.

Export camera helpers preserve top-view up vectors and rotate those vectors for top-down turntables, avoiding duplicated pole frames. Fit-model uses a conservative bounding sphere; output aspect ratio may differ from the original viewport. Closing and modifying settings are blocked during capture; Cancel stops capture without a download. Encoding remains synchronous after capture.

## 0.3.0 export effects

Exports → Animated GIF / Rendered PNG / Sprite Sheet → Pixel effects:

- Silhouette outline: 1–4 output pixels, arbitrary opaque RGB color, bounded edge clipping. A two-pass Chebyshev dilation of the original transparent scene mask avoids recursive growth and never outlines the background itself.
- Scanlines: color, strength 0–1 and interval 2–8 output rows. They affect the composited image but never fill empty transparent areas.
- Bottom-left/right tags: original uppercase 5×7 bitmap letterforms, independent RGB colors, scale 1–4, 48-character input limits. Lowercase is displayed as uppercase; unsupported characters become question marks. Tags truncate into disjoint halves when both are present. If the font is taller than the frame, the preview warns; choose a smaller scale/larger frame.
- Pipeline order is outline → background/transparency → scanlines → tags. Text stays legible above scanlines. PNG and sprite exports use the same renderer as GIF frames.
- Preview scrubbing uses exact frame poses, resolution and post-processing. Playback is capped at 24 FPS for responsiveness; saved sequences always begin at frame 1. Saving while previewing a later frame does not change that start.
- Effect settings persist in a namespaced local key where permitted, fail safely in opaque sandboxes, and appear in the sprite settings JSON. Reset effects restores an undecorated preview. Controls are disabled during capture.

Tests use an independent GIF reader (gifuct-js, development-only) to compare visible RGB and alpha in decoded exports with the preview, including custom colors and transparent outlines. GIF's RGB values under alpha zero are unspecified and are normalized for these comparisons. Arbitrary Unicode fonts, anti-aliased/system text and scanline animation are outside this version.

## 0.4.0 timeline gestures

All five library types support click-to-add and pointer drag-to-drop. Valid drops create exactly one clip in the chosen track/time; outside drops and Escape create nothing. Moving an existing clip retains its ID, duration and animation properties, changes its start/track, and commits one history entry. Resizing holds the opposite edge, enforces positive duration, and ignores vertical track changes. Empty-lane clicks and arrow keys scrub; edge sliders use arrows/Home/End for keyboard resizing, with one transaction per key action.

During a gesture playback pauses, numeric clip/time controls lock, target lanes highlight, and a ghost clip plus actual 3D pose preview show prospective timing. Durable project data and autosave remain unchanged until release. Escape/blur/pointer cancellation discard preview and release capture; listeners are cleaned up on unmount. Existing clips are captured through the stable timeline element so crossing lanes does not lose the pointer when the clip DOM node moves. A concurrent edit, mesh change, or lock invalidates the transaction. No-op clicks add no undo entries.

The animation preview camera now anchors to base geometry with a conservative movement margin instead of following every animated pose (which previously hid single-object movement). The native .pvo v1 format stays compatible; timeline snap is a session preference, not a proprietary-format field. Library drop uses the pointer as the clip's starting edge. Default snapping is 0.05s and minimum resize duration is 0.05s (bounded by shorter timelines).

## 0.5.0 texture and UV interaction

- Marquee: choose the Marquee tool, draw a rectangle, then drag inside it to move its indexed pixel snapshot. The source is cleared to the designated transparent index and the destination is replaced, including selected transparent pixels. Overlap is safe. Alt at gesture start copies instead of moving; Shift starts a new selection. The whole rectangle clamps inside the 128-square atlas so no edge pixels are discarded. One release is one undo step; Escape restores pixels and the original rectangle. Concurrent texture changes reject a stale move.
- Paint and UV navigation: independent integer zoom presets 1×–16×, pointer-anchored wheel zoom, middle-drag or Space+drag pan, fit/reset controls and focused +/-/Home/arrow keys. Navigation changes scroll/zoom only, not project state or history. Escape during a pan restores starting scroll. Drawing gestures temporarily prevent navigation changes to keep coordinates stable.
- UV editing: selected-corner movement is built from a cloned baseline and previews both UV edges/handles and the actual textured model immediately. Adjacent corners remain unchanged. Release commits once; Escape/blur/pointer cancel or mesh changes discard preview. Mesh/folder locks prevent previews and commits. Ctrl/Cmd temporarily disables UV snap. Cross-mesh UV editing is still outside this version.
- Shared transient previews are React view state, never serialized into native files or autosave. Pen/eraser strokes also update the model through the same ephemeral path. Shapes continue to commit as bounded drawing actions.
- Atlas redraws use one cached 128×128 upload and nearest-neighbor scaled blit instead of thousands of Canvas2D rectangles per pointer update. Display checkerboards/grid/selection overlays do not modify atlas indices or exports.

The native .pvo v1 format remains compatible. Pan/zoom choices are local view state, not project edits. Desktop mouse/keyboard behavior is verified; touch-first workflows and cross-mesh UV remain unclaimed.

## 0.6.0 UI assets — Lucide + Outfit

The requested UI refresh replaces all custom Icon* SVG paths with tree-shaken lucide-react adapters. Keyboard, close, merge, UV-arrow and lock-state glyphs are also Lucide. Icons inherit currentColor, use a consistent 16px/1.8-stroke treatment, remain decorative within labeled controls, and preserve existing accessibility names/actions.

Outfit Variable is locally bundled through @fontsource-variable/outfit, weights 100–900. Body text, controls, headings and numeric fields inherit Outfit. The normal dist build includes local Latin/Latin-extended WOFF2 files; the standalone HTML embeds those exact bytes as data URLs. No font or icon CDN is contacted. Package-supplied Lucide and Outfit license texts are included in THIRD_PARTY_NOTICES.txt.

This is UI typography only: pixel-art export labels retain the independent 5×7 bitmap renderer so GIF/PNG/sprite outputs and exact-frame tests are unchanged. Native .pvo v1 stays compatible. Verification uses isolated headless browsers.

## 0.7.0 light/dark UI theme

The default UI is now a light studio: white panels, slate text, warm amber selections, blue focus rings, subtle separators and soft dialog shadows. Outfit Variable and Lucide stay locally bundled. The header's Moon/Dark or Sun/Light button switches themes and stores the choice in pivo-ortho:theme:v1 where browser storage is permitted. Saved dark preferences are respected; invalid/unavailable preferences fall back to light. In opaque preview sandboxes, switching still works for the current session and reports that persistence is unavailable.

Theme changes affect only interface chrome and display-only transparency checkerboards. Artist-controlled palette colors, project rendering/background settings, model geometry, clips, UVs and exported frame pixels are not recolored. This intentionally leaves project canvases dark when their own scene background is dark. Theme toggling does not add undo entries or modify .pvo v1 documents.

Readability tests verify normal UI text at 4.5:1 or better against supported surfaces, active-state text, and focus/input boundaries at 3:1 or better. DOM tests inspect visible model/paint/UV/animation/export labels and enabled controls. Palette swatches and canvas artwork are excluded from text contrast checks because their colors belong to the artist; disabled controls are exempt. This is targeted readability evidence, not a complete WCAG/accessibility certification.

Light and dark screenshots were inspected. Canvas display checkerboards refresh on theme changes without rewriting texture indices. Dialogs use a simple tinted backdrop rather than a costly GPU backdrop blur, preserving responsiveness on software-rendering browsers.

## 0.7.1 theme-matched scrollbars

Native scrollbars now use matching light/dark tracks, rounded slate thumbs and amber hover/pressed states. Chromium/WebKit pseudo-elements provide 12px bars with inset rounded handles and matching corners; coarse pointers get 16px bars. Standard thin/color properties provide the Firefox fallback. No JavaScript scrolling replacement, pointer interception or project edits are introduced. OS settings may still decide when overlay bars appear.

Forced-colors/high-contrast mode restores platform-controlled styling. Thumb/track pairs exceed a 3:1 contrast check in both themes. Native thumb dragging is tested in an isolated Chromium launch with its default hide-scrollbars flag disabled; scrolling remains independent of painting and native document data. Firefox/WebKit engine certification is still outside this release.

## 0.8.0 comfortable control spacing

Standard desktop controls use 32px minimum height, with compact 28–30px outliner icon actions, consistent padding/radius/icon gaps and more legible labels. The model toolbar separates transform tools, transform settings, view actions and render options into wrapping groups. Inspector vector fields align with predictable gutters, section spacing and numeric widths.

Panels, paint/UV tools, timeline lanes and export dialogs have larger spacing and clearer hit areas. Palette colors use a four-column swatch grid; the real model preview sits first in the paint sidebar so it remains easy to reach. Dialogs have wider responsive fields and generous padding. Outfit, Lucide, light/dark colors and native themed scrollbars are retained.

At 1100px and 900px, groups wrap without overlapping; compact outliner rows wrap their action controls, while paint/UV workspaces scroll horizontally when needed instead of crushing the atlases. Fixed-pixel UV canvases stay left-aligned inside overflowing panes so left-edge handles never slip outside the scrollable area. This remains desktop-first, not mobile certification.

Spacing changes do not alter project data, export pixels or input semantics. Five new browser checks verify control sizes, non-overlapping tools at 1440/1100/900px, reachable workspace controls, exact numeric editing and an actual PNG download. Screenshots were inspected; full interaction/theme/scrollbar regressions remain green.

## License

The project source is released under the MIT License (see LICENSE). Third-party runtime and test dependency licenses are preserved in THIRD_PARTY_NOTICES.txt.

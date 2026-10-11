# Verification report — PiVo Ortho 0.8.0

Executed 10 October 2026. These are actual runs, not a proposed test plan.

## Build and unit/integration suite

- npm run build: TypeScript strict checking and Vite production bundle PASS.
- npm test: 320/320 PASS across twelve files: core 132, IO 45, renderer/behavior integration 15, UI polygon helpers 8, camera helpers 24, transform transactions 14, sandbox storage guards 2, export effects/independent GIF decode 23, timeline gesture math/isolation 24, texture move/navigation/UV isolation 18, Lucide SVG adapters 2, theme preference/contrast math 13.
- Tests exercise original topology, winding, concave triangulation, extrusion, merge/delete, mirror, locks, UV geometric transforms, raster boundaries, fill/quantization/alpha, palette swaps/ramps, absolute pose/pivot behavior, deterministic clips and atomic history.
- IO checks PNG data/CRCs, actual GIF frames/delays/transparency, sprite layout, OBJ face/UV/material structure and glTF accessors/materials/sampled channels.
- Independent Three.js GLTFLoader successfully parses a real exported bundle's geometry and animation. A regression reconstructs pivoted multi-axis animated vertices from exported TRS and compares them against the core. Duplicate mesh names target distinct nodes.
- Renderer regressions catch palette ramp row layout, sampled-color shading, hidden folders during animation and affine interpolation setup.

## Browser suite

96/96 PASS in local Chromium (Playwright, headless software ANGLE/SwiftShader). No page errors or console errors in checked workflows. Executed in bounded suites: 18 camera/gizmo checks, 21 baseline/performance checks, 9 effects/sequence-preview checks, 17 timeline checks, 13 texture/navigation/UV checks, two icon/font/layout checks, seven theme/readability checks, three native-scrollbar checks, five spacing/layout checks and one published-style iframe sandbox check; all pass.

Verified: first launch; four viewports; resize/maximize; pixel settings; add/delete/undo/redo; exact transforms; locks/hide/show; clipboard and merge; folder assignment/hide/lock; full interpolated paint stroke and one-step undo; palette/ramps/eyedropper; face-picking → Paint → UV edits; through-depth vertex selection and actual geometry dragging; five clip types and four tracks with real preview; save/open round-trip and invalid file rejection; reload recovery and corrupt recovery fallback; shortcuts inside inputs and Escape dialogs; six real export downloads.

Exports checked through the actual UI: OBJ ZIP, glTF ZIP, texture PNG, rendered PNG, animated GIF and sprite-sheet PNG. Downloads contain real byte payloads, not success-only placeholders.

## Measured fixture

Original fixture: 50 meshes, 2,100 faces, 712,554-byte .pvo file.

- Core serialize: about 8.1 ms in one Node 24 run.
- Core parse/validate: about 18.1 ms in that run.
- Browser file import through first screenshot: about 1,888 ms in the measured Chromium run; all four canvases render and no errors are recorded.

These are environment-specific single-run observations, not FPS guarantees or universal performance claims. Browser tests do not measure sustained interactive frame rate. Animation/render capture rebuilds scene data and GPU materials; optimizing retained geometry and workers remains a next-step opportunity.

## Distribution and limitations

Vite reports a large single JavaScript chunk (approximately 946 kB raw, 268 kB gzip before inlining). It is functional and dependency-free at runtime; code-splitting is deferred. Only Chromium is certified here; Firefox/WebKit/mobile are not claimed. Canvas interaction is not fully screen-reader accessible. Arbitrary Unicode/system-font text, third-party native formats, installable offline caching are explicitly excluded in COVERAGE.md.

## Graphical and export-camera verification

Real pointer drags exercise the move arrows, Z rotation ring and X scale handle. Assertions require the appropriate Gizmo history label, changed axis-specific values, unchanged other axes, snapping, one-step undo and Escape cancellation. Locked meshes disable handles. Pure tests cover pivots, faces/vertices under rotated nonuniform scale, group rotation/scale without shear loss, source immutability and clip identity preservation.

Export-camera browser checks exercise actual preview pixel changes, front/top current-view snapshots, orthographic PNG decode/dimensions, reset, fit and off-origin recentering, camera settings restoration, GIF capture, sprite PNG plus settings JSON, and capture cancellation without download. Closing via Escape is blocked while capture is busy. Unit checks cover exact top position/up, projection/aspect, validation, turntable up-vector rotation and fit bounds.

The 50-mesh fixture result measures import through first screenshot, not sustained render rate. Graphical overlays introduce extra WebGL contexts and remain a desktop-first feature. Multi-touch and cross-browser GPU certification are not claimed.

## Published iframe regression

The actual published preview revealed a storage getter exception when Exports opened in an opaque-origin iframe. The getters themselves are now inside error guards. Two unit tests simulate denied storage, and a Chromium test runs the complete bundled editor inside an iframe with allow-scripts/allow-downloads but without same-origin permission. It opens the export dialog, changes to orthographic framing and confirms the real preview renders without a fatal error.

## Pixel effects and independent export decoding

23 effect tests verify input immutability, true silhouettes, radius bounds, original-mask dilation, clipped edges, empty scenes, opacity/interval rows, background/alpha composition, tag anchors/colors/scaling/case, clipping and non-overlap, settings guards, palette overflow, and exact visible RGB/alpha reconstruction through gifuct-js. Opaque decor equal to the transparent palette RGB gets an independent opaque index instead of disappearing.

9 new browser checks verify actual preview pixel changes, reset, scanline rows, independent left/right tag colors, exact comparison of GIF frames 1 and 3 to the corresponding previews, real animation frame differences, transparency, persisted settings, control locks/cancel-without-download, sprite metadata and preview scrubbing/play/pause. The existing opaque-iframe check now also enables outline and text controls.

Encoding remains synchronous after the cancellable frame-capture phase. Preview playback is capped at 24 FPS; no real-time performance guarantee is claimed. gifuct-js is test-only and is not part of the browser bundle.

## Timeline interaction verification

24 unit tests cover all library types, lane/time bounds, immutable initial sampling, snap overrides, short/overlength clips, opposite-edge invariants, nonnegative starts/minimum durations, invalid numbers/tracks, nearest-lane geometry, locks, preview isolation, pose evaluation and one final undo/redo transaction.

17 Chromium tests perform actual library drags for all five types, outside and Escape drops, cross-track moves, left/right resizing, single-step undo/redo, Escape for each gesture, subsequent mouse-up listener safety, locks, Ctrl unsnapped timing, autosave remaining unchanged during preview, prospective 3D pose changes/restoration, keyboard activation after pointer cancellation, and keyboard edge resizing rather than unintended scrubbing. Prior model/camera/gizmo/FX/export regressions also pass.

Pointer drag/drop is desktop-first; no claim of native OS drag transport, multi-touch support or arbitrary browser-engine equivalence. Imported outside-range clips are preserved, not silently normalized.

## Texture navigation, marquee and live UV verification

18 pure tests cover snapshot moves/copies, overlap, transparency replacement, no-op preservation, whole-rectangle bounds, invalid rectangles, selected-corner UV isolation, snapping/modifier precision, missing corners, lock guards, colon-containing IDs, anchored zoom and preset limits.

13 Chromium tests perform real marquee select/move/Alt-copy and single-step undo/redo, Escape restoring data, wheel zoom, middle/Space pan, fit/reset and keyboard navigation. UV tests show real model pixels changing before release, then restoring on undo/Escape, with unchanged neighbor/saved data and lock protection. A safety test inspects autosave during a marquee preview and verifies it is still the original texture, while the model image reflects the prospective move. Pan cancellation restores scroll without editing.

An initial per-texel Canvas2D rectangle implementation slowed these drag checks (marquee checks around 14–21 seconds including automation). The cached-bitmap draw path reduced the corresponding checks to roughly 3–6 seconds, with UV checks roughly 5–7 seconds in this environment. These are whole test durations, not rendering frame-rate guarantees.

## Lucide and Outfit verification

Two SSR/unit checks iterate every Icon* adapter, requiring genuine Lucide 24×24 SVG markup, 16px defaults and decorative aria-hidden semantics while preserving caller SVG overrides. Two browser checks await document.fonts.ready, verify loaded Outfit and computed body/control font families, verify local WOFF2 requests with no font CDN, confirm Lucide SVGs in model/paint/animate/dialog controls, and capture a clean desktop layout.

The packaged opaque-origin iframe test also awaits the inlined Outfit font and confirms Lucide controls work without same-origin storage permission. Font files remain in dist for normal static hosting and are embedded in the standalone HTML. Existing 5×7 export labels and all GIF decoded-frame checks remain unchanged. Use-client module directives in lucide-react are ignored by the CSR bundler; the build succeeds. The prior single-chunk size warning remains.

## Light theme and readability verification

13 pure tests cover allowed preference values, requested light default, saved-dark restoration, invalid/denied storage guards, successful persistence, known WCAG contrast math, primary/secondary/muted light labels over all major surfaces, active selections, dark muted labels, and blue focus/input boundaries.

Seven Chromium checks verify actual CSS theme/font/icon state, persistence across reloads, no project or undo change on toggling, visible-label text contrast in Model/Paint/UV/Animate/export dialogs, selected clip text, preserved export preview bytes, and invalid preference fallback. Headless light/dark screenshots and light Paint/export screenshots were inspected. The opaque iframe test exercises theme switching without storage and keeps editor operations usable.

The first contrast sweep included empty artist-colored swatches as if they were text; these are now correctly excluded rather than recoloring the artist's palette. Readability claims are limited to normal UI text/enabled controls and tested token boundaries, not full WCAG certification. GPU backdrop blur was removed after it increased software-rendering test durations; a tint and soft dialog shadow provide separation without that cost.

## Native scrollbar verification

Three new Chromium checks verify light/dark pseudo-element colors, rounded geometry and >=3:1 thumb/track contrast, actual native thumb dragging with unchanged serialized project data, and forced-colors restoration. Isolated scrollbar tests disable Playwright's headless hide-scrollbars default so the real native hit target is exercised rather than clicking artwork. All texture pan/zoom/marquee/UV, theme/font, model, timeline, camera/gizmo and export regressions remain green.

## Control spacing verification

Five new Chromium checks require >=32px standard header/model control heights (allowing measurement rounding), >=28px widths, explicit visible control groups and no overlapping toolbar rectangles at 1440/1100/900px. Paint and Animate controls remain reachable, numeric inspectors edit exact values, and a PNG download succeeds from the padded dialog. Desktop Model, narrow Animate and export screenshots were inspected.

The expanded paint/UV sidebars exposed an older centered-overflow atlas issue: left UV handles could slip outside the scroll area and a drag selected page text. UV containers now explicitly left-align fixed-pixel canvases with min-width zero; canvas text selection is disabled. Live-UV pixel/cancel/undo checks were rerun successfully. The model preview was moved above palette tools to keep feedback visible without scrolling past helper controls. All previous 91 browser checks remain green.

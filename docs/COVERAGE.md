# Release 0.8.0 coverage

This matrix distinguishes delivered behavior from the full roadmap.

| Area | Delivered | Remaining/different |
|---|---|---|
| Model | Four distinct cameras, picking, mesh/face/vertex modes, through-depth rectangle selection, ortho/world-plane dragging, snap, graphical move/rotate/scale handles with pivot-aware history, exact numeric transforms/pivot, five primitives, extrude/delete/merge/mirror | Group-frame refinements, broader primitive inventory and shortcut map |
| Faces | Color, texture, shade, double-sided, draw-behind flags; robust polygon triangulation | No bit-identical rasterization claim |
| Organization | Mesh/folder rename, visibility/lock, folder assignment, mesh duplication/clipboard/merge, folder duplicate/merge | Folder hierarchy is flat; mesh copy/paste is local to this session, not native cross-window clipboard |
| Paint | 128-square indexed atlas, 16 colors, one transparent entry, pen/eraser/fill/line/rectangle/ellipse, eyedropper, brush sizes, filled shapes, marquee move/Alt-copy/copy/paste with transaction previews, pointer pan/anchored zoom/fit/reset, PNG import, editable palette, gradients, generated/editable ramps | Touch navigation and richer selection shapes remain unclaimed |
| UV | Active mesh face selection, corner and rectangle selection, selected-corner drag, numeric edits, nudge/rotate/flip/scale/copy/paste, live model preview during uncommitted corner dragging | Cross-mesh face editing and advanced UV workflows remain unclaimed |
| Animation | Shared timeline, four tracks/mesh, all five clip types, deterministic relative-to-base evaluation, playback, lane scrubbing, library drops, cross-track moves, both-edge resize, single-gesture history/cancel, live prospective 3D pose, duplicate/clipboard, full numeric inspector, real scene preview | Multi-clip batch drags, snapping refinements and touch certification remain unclaimed |
| Retro look | Nearest-neighbor indexed sampling, authored affine interpolation, editable discrete shade ramps, transparency, wireframe | Own palette/UI with locally bundled Lucide/Outfit |
| Persistence | Atomic undo/redo, validated native .pvo save/open, debounced recovery, quota guards, clear-recovery control | Third-party native project formats, cloud sync/collaboration, PWA caching |
| Outputs | Actual configurable-camera PNG, GIF and sprite sheets with shared effects plus sheet camera/effect metadata; OBJ/MTL/PNG ZIP; glTF/bin/PNG ZIP with sampled pivot-correct TRS | Perspective/orthographic and current-view cameras are supported; Outline/scanline/pixel tag decorations and exact-frame live previews are delivered; standard formats cannot preserve custom shader/visibility/draw-behind |
| Tests | 320 unit/integration, 96 Chromium browser checks, production build, independent glTF import | Firefox/WebKit/mobile certification, broad accessibility audit, release-scale load testing |

## Independent semantics

Coordinate system is right-handed Y-up, local transform is position + pivot + Rz*Ry*Rx*scale*(vertex−pivot). evaluateMesh returns absolute evaluated TRS (base transforms already included); worldVertex must not apply them twice. Mesh motion is a world offset, rotation adds radians, scales multiply base scale. Ordinary clips retain their ending transform; ping-pong reaches the full amount at the midpoint then returns to zero; visibility hides only inside its interval; oscillation is sine amplitude inside its interval. UI loops time; evaluation does not.

UV rotation/flip are geometric transforms about the face's UV centroid, not corner-array permutations. Alpha <128 is transparent on import; input resampling is nearest-neighbor to 128×128. Palette swapping remaps pixel indices, transparency/background, ramps and application face color references to preserve appearance. These are explicit design decisions.

## 0.2.0 gesture rules

One graphical drag previews an immutable baseline and commits only on release; Escape discards it. Any locked member blocks a grouped edit. Mesh pivots remain local and fixed; faces/vertices transform through exact world-space matrices. Group nonuniform scaling is baked into vertex positions rather than pretending shear is TRS. World/local applies to move and rotate; scale uses local axes.

Use current view snapshots front/top/side/perspective from the last focused viewport. Top snapshots preserve 90-degree pitch and negative-Z up. Output dimensions—not the viewport dimensions—determine crop/aspect. Camera preview follows the selected output/source settings; a top-down turntable rotates its up vector. Camera settings are namespaced browser settings, not additions to the native v1 project schema.

## 0.3.0 effect semantics

The scene is captured on transparent RGBA, outlined against its alpha mask, composed onto the selected background when desired, striped, and finally labeled with the built-in bitmap text renderer. Transparent empty areas remain empty. Output-resolution preview and frame scrubbing share this exact function with encoders; CSS only scales the display. GIF palettes are expanded deterministically to preserve decor colors up to 256 entries, with explicit overflow warnings. Text uses uppercase ASCII-compatible glyphs and bounded clipping rendered by a dedicated bitmap font, not a system font. Arbitrary Unicode text remains out of scope.

## 0.4.0 transaction semantics

One lifecycle handles library, move, left and right gestures. Every sample derives from the immutable initial clip. Ctrl/Cmd disables quantization, not clamping. A transient animation overlay feeds the timeline, inspector and live 3D renderer but does not enter history/autosave. Drop/resize release commits only a changed valid result; Escape creates no transaction. Both mesh and folder locks are rechecked at release. Leaving the whole timeline vertically rejects a move/drop; resize stays in the original lane. Existing overlength clips preserve authored duration and can be reached through the clip chooser/numeric fields.

## 0.5.0 transient texture/UV previews

Marquee moves paste immutable snapshots after clearing source, with Alt-copy retaining it. Entire selections clamp to the atlas; source/destination overlap cannot smear data. A shared ephemeral project preview drives the actual model renderer for UV and texture gestures. It never becomes the durable store project before a validated release. Navigation uses native scroll geometry so pointer pixel mapping and UV picking remain consistent after zoom/pan; zoom compensation preserves the pointed-to texel where scroll bounds permit.

## 0.6.0 icon/font assets

Lucide supplies the icon paths under its package license; Outfit is locally bundled under its supplied OFL license. The standalone artifact inlines the WOFF2 files and requires no font CDN. UI asset choices do not change native projects or exported bitmap text.

## 0.7.0 theme boundary and readability

A separate UI preference drives light/dark tokens and native color-scheme. It is never part of the native project schema or history. Light starts by default; a stored dark choice survives reload. Opaque origins safely use session-only toggling. Outfit/Lucide remain unchanged, as does exported bitmap text.

Normal UI text and active-state text meet 4.5:1 test thresholds on the token surfaces; focus and essential input boundaries meet 3:1. Actual visible labels in each workspace/dialog are checked. Arbitrary artist palette/canvas colors and disabled controls are not falsely advertised as text-compliant. Canvas interaction remains screen-reader limited and complete WCAG certification is unclaimed.

## 0.7.1 scrolling chrome

Theme tokens cover scrollbar track/thumb/hover/pressed/corner colors. Styling retains native scrolling and standardized browser fallbacks. High-contrast mode uses platform values. Three Chromium checks cover exact theme colors and thumb geometry/contrast, genuine thumb dragging without document changes, and forced-color fallback. Platform overlay visibility and non-Chromium certification remain unclaimed.

## 0.8.0 desktop layout

Consistent 32px standard controls and 28–30px compact actions improve pointer targets without changing the editor tools. Explicit transform/view/render groups, aligned inspectors, spaced sections, larger dialogs and responsive wrapping retain the Outfit/Lucide/theme/scrollbar design. 1440, 1100 and 900px layouts are exercised. UI chrome only changes; touch certification and arbitrary viewport support are unclaimed.

# File formats

## Native project format — `.pvo`

Ortho's own editable format is version **1** and has remained compatible across releases. Open **validates** before replacing the document; invalid files are rejected without discarding current work. New/Open are undoable in this release.

::: tip
Save a `.pvo` copy for reliable persistence — the IndexedDB recovery copy is removed when browser site data is cleared.
:::

## Export bundles

| Bundle | Contents |
| --- | --- |
| OBJ bundle | `OBJ` + `MTL` + texture `PNG` in a ZIP. A static scene snapshot. |
| glTF bundle | `glTF` + `bin` + texture `PNG` in a ZIP (gltf2.ts implementation). |
| Texture PNG | The 128×128 indexed atlas, expanded to RGBA. |
| Rendered PNG | Scene render, configurable up to 2048px per axis. |
| Animated GIF | Timeline-driven or turntable; duration follows the timeline (turntable: frames/fps). |
| Sprite sheet | Packed frames with companion JSON settings. |

## Export effects (0.3.0)

Exports → Animated GIF / Rendered PNG / Sprite Sheet → Pixel effects:

- **Silhouette outline** — 1–4 output pixels, arbitrary opaque RGB color, bounded edge clipping. A two-pass Chebyshev dilation of the original transparent scene mask avoids recursive growth and never outlines the background itself.
- **Scanlines** — color, strength 0–1, interval 2–8 output rows. They affect the composited image but never fill empty transparent areas.
- **Pixel tags** — bottom-left/right uppercase 5×7 bitmap letterforms, independent RGB colors, scale 1–4, 48-character input limit. Lowercase is displayed as uppercase; unsupported characters become question marks. Tags truncate into disjoint halves when both are present.
- Pipeline order is **outline → background/transparency → scanlines → tags**; text stays legible above scanlines. PNG and sprite exports use the same renderer as GIF frames.
- Decorated GIF exports extend the global palette to preserve exact effect/background colors while retaining transparency (up to 256 colors). Overflow is explicitly warned and mapped to nearest colors.

## glTF fidelity notes

glTF supports sampled transform animation with pivot-correct local nodes. The following are **not standard glTF semantics** and produce named warnings: visibility clips, draw-behind, retro affine interpolation, shade ramps and retro post effects.

## Camera & frame capture

PNG/GIF/sprite capture supports perspective/orthographic cameras, yaw/tilt, distance, target XYZ, FOV/orthographic height, background and turntable start/direction. *Use current view* copies the last focused viewport camera pose/projection; output dimensions define the aspect ratio. Fit-model recenters off-origin scenes. Live previews use the exact output resolution, support scrubbing/playback, and match saved-frame pixels.

Frame batches are bounded to **64 MiB, 120 frames and 512px frames**; encoding runs on the main thread after rendering and cancellation is effective during capture.

## What is not supported

- Third-party native formats (FBX, DAE, …) are **not** supported — only `.pvo`.
- No collaboration or skeleton rigging.

The hosted production app includes a service worker and installable PWA offline shell. See [Installation & running](/getting-started#offline-shell-installation) for setup and the distinction from the standalone HTML preview.

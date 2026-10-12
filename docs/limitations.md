# Limitations & known differences

Release 0.8.0 is a working development baseline. Scope is documented in [COVERAGE.md](/COVERAGE).

## Formats

- **Own project format only** — third-party native formats (FBX, DAE, Aseprite, …) are not supported.
- glTF export supports sampled transform animation with pivot-correct local nodes; visibility clips, draw-behind, retro affine interpolation, shade ramps and retro post effects are **not standard glTF semantics** — warnings name these losses.
- OBJ is a static scene snapshot. Exported standard materials are not the editor's custom retro shader.

## Editing scope

- UV editing operates on the active mesh; cross-mesh multi-face editing is not certified.
- Scaling uses local axes. Multi-mesh nonuniform scale is baked into geometry to preserve affine shape without inventing a shear-capable TRS; the common group pivot uses world orientation.
- No skeleton rigging.
- The hosted production app includes a service-worker offline shell after its assets are cached. Browser installation support varies; the standalone HTML preview does not use this caching workflow. See [Installation & running](/getting-started#offline-shell-installation).
- No collaboration or deployment story included.

## Animation

- Desktop pointer drag/drop, cross-track movement and both resize handles are supported; **mobile drag behavior is not supported**.
- Existing overlapping clips are allowed — use the Selected clip chooser to reach overlapped or off-range clips; imported clips beyond the timeline are retained rather than silently truncated.
- Scanline animation and arbitrary Unicode/anti-aliased/system-text tag rendering are outside this version (tags use the independent 5×7 bitmap renderer).

## Platform

- WebGL2 and a desktop mouse/keyboard are required; not a touch-first editor.
- WebGL canvas workflows are not fully screen-reader accessible; panels/inputs are labeled, focus is visible, dialogs trap focus and support Escape.
- This is targeted readability evidence, not a complete WCAG/accessibility certification.
- Firefox, Safari/WebKit and real mobile devices are not yet certified.

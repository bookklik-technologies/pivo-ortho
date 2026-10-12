# Verification

Historical verification record for release 0.8.0, executed on 10 October 2026. Measured results and caveats are in [docs/TEST-REPORT.md](/TEST-REPORT); behavioral rules are in [SPECIFICATION.md](/SPECIFICATION) and [CONTRACT.md](/CONTRACT). These results predate the PWA offline shell and do not certify its installation/offline behavior.

## Recorded results — 10 October 2026

| Layer | Result |
| --- | --- |
| Unit/integration tests | **320 passed** (`npm test`) |
| Chromium browser tests | **96 passed** (`npm run test:browser`) |
| Independent glTF importer | A Three.js glTF importer validates exported bundles |
| Performance fixture | 50-mesh / 2,100-face fixture |
| Production build | TypeScript/Vite build passed |

## Browser coverage

- Headless Chromium only — **Firefox, Safari/WebKit and real mobile devices are not yet certified**.
- Desktop pointer drag/drop, cross-track movement and both resize handles are verified; mobile drag behavior is not supported.
- Native scrollbar dragging is tested in an isolated Chromium launch with the default `hide-scrollbars` flag disabled.
- GIF exports are decoded with an independent reader (`gifuct-js`, development-only) and compared with the preview in visible RGB and alpha, including custom colors and transparent outlines.

## Readability evidence

- Normal UI text ≥ 4.5:1 contrast against supported surfaces; active-state text, focus and input boundaries ≥ 3:1 in both themes.
- DOM tests inspect visible model/paint/UV/animation/export labels and enabled controls. Palette swatches and canvas artwork are excluded (their colors belong to the artist); disabled controls are exempt.
- Thumb/track scrollbar pairs exceed a 3:1 contrast check in both themes.

This is targeted readability evidence, **not a complete WCAG/accessibility certification**. WebGL canvas workflows are not fully screen-reader accessible, though panels/inputs are labeled, focus is visible, and dialogs trap focus and support Escape.

## Spacing regression (0.8.0)

Five browser checks verify control sizes, non-overlapping tools at 1440/1100/900px, reachable workspace controls, exact numeric editing and an actual PNG download. Screenshots were inspected; interaction/theme/scrollbar regressions remained green.

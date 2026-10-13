# Installation & running

PiVo Ortho is a React + Three.js Vite application that runs entirely in your browser.

## Requirements

- Node.js **22.12+** or Node 24, with npm
- A desktop browser with **WebGL2** and mouse/keyboard (this is not a touch-first editor)
- Recommended window width: 1200px or more

## Run the dev server

```sh
npm ci
npm run dev
```

Open the URL printed by Vite.

## Production build

```sh
npm run build      # typecheck (tsc --noEmit) + static production build in dist/
npm run preview    # serve dist locally
```

Serve `dist` with any static HTTP server. A self-contained `pivo-ortho-browser.html` is also included for a dependency-free runtime preview (no runtime network dependencies, but that is not a PWA caching guarantee).

## Offline shell & installation

The production build includes a web app manifest and an automatically registered service worker that caches the app shell and bundled assets. Open the hosted app online over HTTPS or localhost and let the initial caching finish before using it offline. Where supported, use your browser's install action to open Ortho as a standalone app window. Installation availability depends on the browser.

This workflow applies to the hosted production build, including `npm run preview`, rather than the development server or the separate `pivo-ortho-browser.html` preview. The offline shell does not back up projects: keep downloaded `.pvo` copies, since clearing browser site data removes local recovery and cached assets. The historical test report predates the PWA addition and does not certify its installation/offline behavior.

## Run the test suite

```sh
npm test                       # unit/integration tests
npx playwright install chromium
npm run test:browser           # Chromium browser tests
```

Historical results from 10 October 2026 and their caveats are recorded in [docs/TEST-REPORT.md](/TEST-REPORT). Firefox, Safari/WebKit and real mobile devices are not yet certified.

## Regenerate the examples

```sh
npm run examples   # rebuilds the robot demo and performance fixtures in examples/
```

## Next steps

- Build your first project with the [Beginner tutorials](/tutorials/), including screenshots and downloadable checkpoints.
- Follow the [User guide](/guide) through the full Model → Paint → Animate → Save → Export workflow.
- Read [File formats](/formats) for `.pvo`, OBJ and glTF details.
- Drive the engine directly with the [Core & IO API](/api).

## Release validation and updates

Production browser checks use `npm run test:release` against the built app at its deployment subpath. Unit tests are manually authorized. See [production readiness](production-readiness.md) for current evidence and limitations. Updates show a prompt and require recovery to be stored before reload. Download native project backups regularly; browser site data can be cleared by the browser or user.

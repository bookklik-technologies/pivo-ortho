# Core & IO API

For installed package imports, supported headless operations and release steps, see the [npm SDK guide](npm.md). The source paths below describe internal implementation, not public package subpaths.

The engine is split into two framework-independent layers: `src/core` (no DOM, IO or UI dependencies) and `src/io` (pure encoders; only browser download paths require DOM). Both are runnable in Node/Vitest. Full behavioral details live in [CONTRACT.md](/CONTRACT).

## Core — `src/core/index.ts`

```ts
import {
  createProject, createPrimitive, cloneMesh, defaultTexture, PALETTE_16, TEXTURE_SIZE,
  extrudeFace, deleteFace, mirrorMesh, mergeMeshes, mergeVertices, deleteVertices,
  translateVertices, triangulateFace, worldVertex,
  transformUV, rewireFaceCorners,
  paint, floodFill, textureRGBA, quantizeRGBA, swapPalette, generateRamps,
  marqueeCopy, marqueePaste, hexToRGB, TEX_W, TEX_H,
  createClip, evaluateMesh,
  serializeProject, parseProject,
  History,
  ValidationError, MAX_MESHES, MAX_FOLDERS, MAX_CLIPS, MAX_PROJECT_BYTES,
} from '../core';
```

### Types

`Vec2`, `Vec3`, `Axis`, `Primitive`, `Vertex`, `Face`, `Mesh`, `Folder`, `Texture`, `ClipType`, `Curve`, `Clip`, `Animation`, `RenderSettings`, `Project`, `Pose`, `UVEdit`, `ExportFile`, `ExportBundle`, `SpriteSettings`, `RasterTool`.

### Surface

| Area | Exports |
| --- | --- |
| Project & primitives | `createProject`, `createPrimitive`, `cloneMesh`, `defaultTexture`, `PALETTE_16`, `TEXTURE_SIZE` |
| Geometry | `worldVertex`, `triangulateFace`, `translateVertices`, `mergeVertices`, `deleteVertices`, `deleteFace`, `extrudeFace`, `mirrorMesh`, `mergeMeshes`, `faceById`, `vertexById` |
| UV | `transformUV`, `rewireFaceCorners` |
| Raster | `paint`, `floodFill`, `textureRGBA`, `quantizeRGBA`, `swapPalette`, `generateRamps`, `marqueeCopy`, `marqueePaste`, `hexToRGB`, `TEX_W`, `TEX_H` |
| Animation | `createClip`, `evaluateMesh` |
| Serialization | `serializeProject`, `parseProject` (strict parser) |
| History | `class History` — transaction snapshots |
| Validation | `ValidationError`, `MAX_MESHES`, `MAX_FOLDERS`, `MAX_CLIPS`, `MAX_PROJECT_BYTES` |
| Utilities | `uid`, `isFiniteNumber`, `add`, `sub`, `scale`, `dot`, `cross`, `normalize`, `length`, `clamp`, `deepClone` |

## IO — `src/io/index.ts`

All encoders are pure and Node-runnable; only `downloadBundle`/`downloadFile` touch the DOM.

```ts
import {
  // codecs
  encodePNG, decodePNG, PNG_SIGNATURE, concatBytes,
  encodeGIF, encodeGIFDetailed, paletteToRGBA,
  spriteSheet,
  exportOBJ,        // OBJ/MTL static snapshot
  exportGLTF,       // glTF 2.0 (gltf2.ts) with sampled transform animation
  // bundling & downloads
  downloadBundle, downloadFile, zipBundle,
  sanitizeFileName, sanitizeBaseName, validateBundle, EXPORT_LIMITS,
  // scene baking
  bakeScene, groupByMaterial, hexToRGB, meshPose,
} from '../io';
```

| Area | Exports |
| --- | --- |
| PNG | `encodePNG`, `decodePNG`, `PNG_SIGNATURE`, `concatBytes`, plus `PNGChunkReport`, `DecodedPNG`, `EncodePNGOptions` types |
| GIF | `encodeGIF`, `encodeGIFDetailed`, `paletteToRGBA` |
| Sprite | `spriteSheet` → `SpriteSheetResult` |
| Mesh | `exportOBJ`, `exportGLTF` (with `GLTFOptions`) |
| Bundling | `downloadBundle`, `downloadFile`, `zipBundle`, `sanitizeFileName`, `sanitizeBaseName`, `validateBundle`, `EXPORT_LIMITS` |
| Baking | `bakeScene`, `groupByMaterial`, `hexToRGB`, `meshPose` (`BakedTriangle`, `BakedScene`, `MaterialGroup`) |

## UI layer — `src/ui`

React 19 workspaces (`app.tsx` with model/paint/animate workspaces, outliner, inspector, exports dialog), the Three.js palette/affine shader (`render.ts`), gizmo overlay (`gizmoLayer.tsx`, using Three.js MIT-licensed TransformControls with application-specific immutable selection/pivot/group math in `transforms.ts`), the Zustand-style `store.tsx`, timeline (`timeline.ts`), theme (`theme.ts`) and the suite integration (`suite.ts` + `suite-components.tsx`).

## Example

These relative imports assume a TypeScript file under `src/ui`, using the repository's bundler configuration. `createPrimitive` returns a mesh; add it to the project before exporting.

```ts
import { createProject, createPrimitive } from '../core';
import { exportOBJ, exportGLTF } from '../io';

const project = createProject('Demo');
project.meshes.push(createPrimitive('cube'));

// pure encoders produce bytes without a DOM
const objBundle = exportOBJ(project);
const gltfBundle = exportGLTF(project);
```

The exact signatures are defined in `src/core/*.ts` and `src/io/*.ts`, and exercised by the tests under `tests/`.

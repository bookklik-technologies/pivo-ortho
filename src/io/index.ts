/**
 * PiVo Ortho IO layer — public API.
 *
 * Implements the CONTRACT.md "Required IO exports" on top of portable
 * codecs: portable PNG (fflate deflate), deterministic GIF89a (gifenc),
 * sprite sheet packing, OBJ/MTL and glTF 2.0 exporters, and browser
 * download/ZIP plumbing. Only browser download paths require DOM; all
 * encoders are pure and runnable in Node/Vitest.
 */

// Core contract imports (core never imports IO).
import { worldVertex, evaluateMesh, textureRGBA } from '../core';
export { worldVertex, evaluateMesh, textureRGBA };

// Types.
export type { ExportBundle, ExportFile } from '../core/types';
export type {
  FflateZipEntry,
  BakedMesh,
} from './types';
export type { PNGChunkReport, DecodedPNG, EncodePNGOptions } from './png';
export type { EncodeGIFResult } from './gif';
export type { SpriteSheetResult } from './sprite';
export type { GLTFOptions } from './gltf2';
export type { BakedTriangle, BakedScene, MaterialGroup } from './scene-bake';

// Codecs.
export { encodePNG, decodePNG, PNG_SIGNATURE, concatBytes } from './png';
export { encodeGIF, encodeGIFDetailed, paletteToRGBA } from './gif';
export { spriteSheet } from './sprite';
export { exportOBJ } from './obj';
export { exportGLTF } from './gltf2';

// Bundling and downloads.
export {
  downloadBundle,
  downloadFile,
  zipBundle,
  sanitizeFileName,
  sanitizeBaseName,
  validateBundle,
  EXPORT_LIMITS,
} from './bundle';

// Scene baking (shared with codecs, exposed for UI preview parity).
export { bakeScene, groupByMaterial, hexToRGB, meshPose } from './scene-bake';

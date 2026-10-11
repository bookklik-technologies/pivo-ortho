// PiVo Ortho core: framework-independent data/geometry/raster/animation
// layer. No DOM, IO or UI dependencies. See docs/CONTRACT.md for the API.

// Types (re-exported for convenience; types.ts is the source of truth)
export type {
  Vec2, Vec3, Axis, Primitive, Vertex, Face, Mesh, Folder, Texture,
  ClipType, Curve, Clip, Animation, RenderSettings, Project, Pose,
  UVEdit, ExportFile, ExportBundle, SpriteSettings, RasterTool,
} from './types';

// ids, vectors, small helpers
export { uid, isFiniteNumber, add, sub, scale, dot, cross, normalize, length, clamp, deepClone } from './util';
export { ValidationError, MAX_MESHES, MAX_FOLDERS, MAX_CLIPS, MAX_PROJECT_BYTES } from './validate';

// project + primitives
export { createProject, createPrimitive, cloneMesh, defaultTexture, PALETTE_16, TEXTURE_SIZE } from './project';

// geometry
export {
  worldVertex, triangulateFace, translateVertices, mergeVertices, deleteVertices,
  deleteFace, extrudeFace, mirrorMesh, mergeMeshes, faceById, vertexById,
} from './geometry';

// uv
export { transformUV, rewireFaceCorners } from './uv';

// raster
export {
  paint, floodFill, textureRGBA, quantizeRGBA, swapPalette, generateRamps,
  marqueeCopy, marqueePaste, hexToRGB, TEX_W, TEX_H,
} from './raster';

// animation
export { createClip, evaluateMesh } from './animation';

// serialization
export { serializeProject, parseProject } from './serialize';

// history
export { History } from './history';

// Deep, strict validation of PiVo Ortho project data. Used by history commits and
// project parsing so that invalid state can never enter durable documents.
import type {
  Project, Mesh, Face, Texture, Animation, Clip, Folder, RenderSettings,
  Vec2, Vec3,
} from './types';

export const MAX_MESHES = 256;
export const MAX_VERTICES_PER_MESH = 20000;
export const MAX_FACES_PER_MESH = 20000;
export const MAX_FOLDERS = 128;
export const MAX_CLIPS = 1024;
export const MAX_PROJECT_BYTES = 8 * 1024 * 1024;
export const MAX_NAME_LENGTH = 120;
export const MAX_FOLDER_DEPTH = 8;

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const VALID_TRACK = 0;
const MAX_TRACK = 3;

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

function fail(msg: string): never {
  throw new ValidationError(msg);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

function checkName(name: unknown, what: string): void {
  if (typeof name !== 'string' || name.length === 0 || name.length > MAX_NAME_LENGTH) {
    fail(`${what} name must be a non-empty string of at most ${MAX_NAME_LENGTH} characters`);
  }
}

function checkVec3(v: unknown, what: string): asserts v is Vec3 {
  if (!Array.isArray(v) || v.length !== 3 || !v.every((n) => typeof n === 'number' && Number.isFinite(n))) {
    fail(`${what} must be a finite 3-component vector`);
  }
}

function checkVec2(v: unknown, what: string): asserts v is Vec2 {
  if (!Array.isArray(v) || v.length !== 2 || !v.every((n) => typeof n === 'number' && Number.isFinite(n))) {
    fail(`${what} must be a finite 2-component vector`);
  }
}

const CLIP_TYPES = ['movement', 'rotation', 'scale', 'visibility', 'oscillation'];
const CURVES = ['linear', 'easeIn', 'easeOut', 'easeInOut'];
const CLIP_PROPERTIES = ['movement', 'rotation', 'scale'];

/** Throws a descriptive ValidationError when the project is not structurally valid. */
export function validateProject(project: unknown): asserts project is Project {
  if (!isPlainObject(project)) fail('project must be a plain object');
  const p = project as Record<string, unknown>;
  if (p.format !== 'pivo-ortho') fail(`unrecognized project format: ${JSON.stringify(p.format)}`);
  if (p.version !== 1) fail(`unrecognized project version: ${JSON.stringify(p.version)} (expected 1)`);
  checkName(p.name, 'project');

  if (!Array.isArray(p.folders)) fail('project.folders must be an array');
  if (p.folders.length > MAX_FOLDERS) fail(`too many folders (max ${MAX_FOLDERS})`);
  const folderIds = new Set<string>();
  for (const f of p.folders as unknown[]) validateFolder(f, folderIds);

  if (!Array.isArray(p.meshes)) fail('project.meshes must be an array');
  if (p.meshes.length > MAX_MESHES) fail(`too many meshes (max ${MAX_MESHES})`);
  const meshIds = new Set<string>();
  const vertexIds = new Set<string>();
  const faceIds = new Set<string>();
  for (const m of p.meshes as unknown[]) validateMesh(m, folderIds, meshIds, vertexIds, faceIds);

  validateTexture(p.texture);
  validateAnimation(p.animation);
  validateRenderSettings(p.render);

  const anim = p.animation as Animation;
  const clipIds = new Set<string>();
  if (anim.clips.length > MAX_CLIPS) fail(`too many clips (max ${MAX_CLIPS})`);
  for (const clip of anim.clips) {
    if (!meshIds.has(clip.meshId)) fail(`clip ${clip.id} references unknown mesh ${clip.meshId}`);
    if (clipIds.has(clip.id)) fail(`duplicate clip id ${clip.id}`);
    clipIds.add(clip.id);
  }
}

function validateFolder(f: unknown, folderIds: Set<string>): void {
  if (!isPlainObject(f)) fail('folder must be an object');
  const folder = f as Record<string, unknown>;
  if (typeof folder.id !== 'string' || folder.id.length === 0) fail('folder.id must be a non-empty string');
  if (folderIds.has(folder.id)) fail(`duplicate folder id ${folder.id}`);
  folderIds.add(folder.id);
  checkName(folder.name, 'folder');
  if (typeof folder.visible !== 'boolean' || typeof folder.locked !== 'boolean') {
    fail(`folder ${folder.id} visible/locked must be booleans`);
  }
}

function validateMesh(m: unknown, folderIds: Set<string>, meshIds: Set<string>, vertexIds: Set<string>, faceIds: Set<string>): void {
  if (!isPlainObject(m)) fail('mesh must be an object');
  const mesh = m as Record<string, unknown>;
  if (typeof mesh.id !== 'string' || mesh.id.length === 0) fail('mesh.id must be a non-empty string');
  if (meshIds.has(mesh.id)) fail(`duplicate mesh id ${mesh.id}`);
  meshIds.add(mesh.id);
  checkName(mesh.name, 'mesh');
  checkVec3(mesh.position, `mesh ${mesh.id} position`);
  checkVec3(mesh.rotation, `mesh ${mesh.id} rotation`);
  checkVec3(mesh.scale, `mesh ${mesh.id} scale`);
  if ((mesh.scale as Vec3).every((s) => s === 0)) fail(`mesh ${mesh.id} scale may not be zero`);
  checkVec3(mesh.pivot, `mesh ${mesh.id} pivot`);
  if (typeof mesh.visible !== 'boolean' || typeof mesh.locked !== 'boolean') {
    fail(`mesh ${mesh.id} visible/locked must be booleans`);
  }
  if (mesh.folderId !== null && (typeof mesh.folderId !== 'string' || !folderIds.has(mesh.folderId as string))) {
    fail(`mesh ${mesh.id} references unknown folder ${JSON.stringify(mesh.folderId)}`);
  }

  if (!Array.isArray(mesh.vertices)) fail(`mesh ${mesh.id} vertices must be an array`);
  if (mesh.vertices.length > MAX_VERTICES_PER_MESH) fail(`mesh ${mesh.id} exceeds vertex limit (${MAX_VERTICES_PER_MESH})`);
  const local = new Set<string>();
  for (const v of mesh.vertices as unknown[]) {
    if (!isPlainObject(v)) fail(`mesh ${mesh.id} vertex must be an object`);
    const vert = v as Record<string, unknown>;
    if (typeof vert.id !== 'string' || vert.id.length === 0) fail(`mesh ${mesh.id} vertex id must be a non-empty string`);
    if (vertexIds.has(vert.id) || local.has(vert.id)) fail(`duplicate vertex id ${vert.id}`);
    local.add(vert.id);
    vertexIds.add(vert.id);
    checkVec3(vert.position, `vertex ${vert.id} position`);
  }

  if (!Array.isArray(mesh.faces)) fail(`mesh ${mesh.id} faces must be an array`);
  if (mesh.faces.length > MAX_FACES_PER_MESH) fail(`mesh ${mesh.id} exceeds face limit (${MAX_FACES_PER_MESH})`);
  for (const f of mesh.faces as unknown[]) validateFace(f, mesh.id as string, local, faceIds);
}

function validateFace(f: unknown, meshId: string, local: Set<string>, faceIds: Set<string>): void {
  if (!isPlainObject(f)) fail(`mesh ${meshId} face must be an object`);
  const face = f as Record<string, unknown>;
  if (typeof face.id !== 'string' || face.id.length === 0) fail(`mesh ${meshId} face id must be a non-empty string`);
  if (faceIds.has(face.id)) fail(`duplicate face id ${face.id}`);
  faceIds.add(face.id);
  if (!Array.isArray(face.vertices)) fail(`face ${face.id} vertices must be an array`);
  if (face.vertices.length < 3) fail(`face ${face.id} must reference at least 3 vertices (got ${Array.isArray(face.vertices) ? face.vertices.length : 'n/a'})`);
  const seen = new Set<string>();
  for (const vid of face.vertices as unknown[]) {
    if (typeof vid !== 'string' || !local.has(vid)) {
      fail(`face ${face.id} references vertex ${JSON.stringify(vid)} outside its mesh (dangling reference)`);
    }
    if (seen.has(vid)) fail(`face ${face.id} repeats vertex ${vid}`);
    seen.add(vid);
  }
  if (!Array.isArray(face.uv)) fail(`face ${face.id} uv must be an array`);
  if (face.uv.length !== face.vertices.length) {
    fail(`face ${face.id} must store exactly one uv per corner (${face.vertices.length}); got ${face.uv.length}`);
  }
  for (const uv of face.uv as unknown[]) checkVec2(uv, `face ${face.id} uv corner`);
  if (typeof face.color !== 'number' || !Number.isInteger(face.color) || face.color < 0 || face.color > 15) {
    fail(`face ${face.id} color must be a palette index 0…15`);
  }
  for (const key of ['doubleSided', 'shaded', 'textured', 'drawBehind'] as const) {
    if (typeof face[key] !== 'boolean') fail(`face ${face.id} ${key} must be a boolean`);
  }
}

function validateTexture(t: unknown): asserts t is Texture {
  if (!isPlainObject(t)) fail('texture must be an object');
  const tex = t as Record<string, unknown>;
  if (tex.width !== 128 || tex.height !== 128) fail('texture must be exactly 128×128');
  if (!Array.isArray(tex.pixels) || tex.pixels.length !== 16384) {
    fail('texture.pixels must contain exactly 16,384 indices');
  }
  for (let i = 0; i < tex.pixels.length; i++) {
    const v = tex.pixels[i];
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 15) {
      fail(`texture pixel ${i} must be an integer palette index 0…15`);
    }
  }
  if (!Array.isArray(tex.palette) || tex.palette.length !== 16 ||
      !tex.palette.every((c) => typeof c === 'string' && HEX_COLOR.test(c))) {
    fail('texture.palette must contain exactly 16 six-digit hex colors');
  }
  if (typeof tex.transparent !== 'number' || !Number.isInteger(tex.transparent) || tex.transparent < 0 || tex.transparent > 15) {
    fail('texture.transparent must be a palette index 0…15');
  }
  if (typeof tex.background !== 'number' || !Number.isInteger(tex.background) || tex.background < 0 || tex.background > 15) {
    fail('texture.background must be a palette index 0…15');
  }
  if (!Array.isArray(tex.shadeRamps)) fail('texture.shadeRamps must be an array');
  for (const ramp of tex.shadeRamps as unknown[]) {
    if (!Array.isArray(ramp) || !ramp.every((i) => typeof i === 'number' && Number.isInteger(i) && i >= 0 && i <= 15)) {
      fail('shade ramps must be arrays of palette indices 0…15');
    }
  }
}

function validateAnimation(a: unknown): asserts a is Animation {
  if (!isPlainObject(a)) fail('animation must be an object');
  const anim = a as Record<string, unknown>;
  if (typeof anim.duration !== 'number' || !Number.isFinite(anim.duration) || anim.duration <= 0) {
    fail('animation.duration must be a finite positive number of seconds');
  }
  if (typeof anim.fps !== 'number' || !Number.isFinite(anim.fps) || anim.fps <= 0) {
    fail('animation.fps must be a finite positive number');
  }
  if (!Array.isArray(anim.clips)) fail('animation.clips must be an array');
  for (const c of anim.clips as unknown[]) validateClip(c);
}

function validateClip(c: unknown): asserts c is Clip {
  if (!isPlainObject(c)) fail('clip must be an object');
  const clip = c as Record<string, unknown>;
  if (typeof clip.id !== 'string' || clip.id.length === 0) fail('clip.id must be a non-empty string');
  if (typeof clip.meshId !== 'string' || clip.meshId.length === 0) fail('clip.meshId must be a non-empty string');
  if (typeof clip.track !== 'number' || !Number.isInteger(clip.track) || clip.track < VALID_TRACK || clip.track > MAX_TRACK) {
    fail(`clip ${clip.id} track must be an integer 0…${MAX_TRACK}`);
  }
  if (!CLIP_TYPES.includes(clip.type as string)) fail(`clip ${clip.id} has unknown type ${JSON.stringify(clip.type)}`);
  if (clip.axis !== 'x' && clip.axis !== 'y' && clip.axis !== 'z') fail(`clip ${clip.id} axis must be x, y or z`);
  if (typeof clip.start !== 'number' || !Number.isFinite(clip.start) || clip.start < 0) {
    fail(`clip ${clip.id} start must be a finite nonnegative number`);
  }
  if (typeof clip.duration !== 'number' || !Number.isFinite(clip.duration) || clip.duration <= 0) {
    fail(`clip ${clip.id} duration must be a finite positive number`);
  }
  if (typeof clip.amount !== 'number' || !Number.isFinite(clip.amount)) fail(`clip ${clip.id} amount must be finite`);
  if (!CURVES.includes(clip.curve as string)) fail(`clip ${clip.id} has unknown curve ${JSON.stringify(clip.curve)}`);
  if (typeof clip.pingPong !== 'boolean') fail(`clip ${clip.id} pingPong must be a boolean`);
  if (typeof clip.frequency !== 'number' || !Number.isFinite(clip.frequency) || clip.frequency < 0) {
    fail(`clip ${clip.id} frequency must be a finite nonnegative number`);
  }
  if (!CLIP_PROPERTIES.includes(clip.property as string)) fail(`clip ${clip.id} property must be movement, rotation or scale`);
}

function validateRenderSettings(r: unknown): asserts r is RenderSettings {
  if (!isPlainObject(r)) fail('render settings must be an object');
  const render = r as Record<string, unknown>;
  if (typeof render.background !== 'string' || !HEX_COLOR.test(render.background)) {
    fail('render.background must be a six-digit hex color');
  }
  for (const key of ['shading', 'wireframe', 'affine'] as const) {
    if (typeof render[key] !== 'boolean') fail(`render.${key} must be a boolean`);
  }
  if (typeof render.pixelSize !== 'number' || !Number.isFinite(render.pixelSize) || render.pixelSize < 1) {
    fail('render.pixelSize must be a finite number ≥ 1');
  }
  checkVec3(render.light, 'render.light');
}

// Per-face UV editing. UVs are texture-pixel coordinates, top-left origin.
// Corner UVs always stay aligned to their corners during rewiring.
import type { Mesh, Face, Vec2, UVEdit } from './types';
import { assertVec2 } from './util';
import { ValidationError } from './validate';

function faceById(mesh: Mesh, faceId: string): Face {
  const f = mesh.faces.find((ff) => ff.id === faceId);
  if (f) return f;
  throw new Error(`mesh "${mesh.name}" has no face ${faceId}`);
}

/**
 * Apply an affine edit (offset / scale / rotation / flips) to the UV corners of
 * the given faces. Rotation is around each face's UV centroid, in quarter-turn
 * friendly radians. Locks are honored; nonfinite inputs are rejected.
 */
export function transformUV(mesh: Mesh, faceIds: string[], edit: UVEdit): void {
  if (mesh.locked) throw new Error(`mesh "${mesh.name}" is locked; cannot edit UVs`);
  if (typeof edit !== 'object' || edit === null) throw new Error('uv edit must be an object');
  const { offset, scale, rotation, flipX, flipY } = edit;
  if (offset !== undefined) assertVec2(offset, 'uv edit offset');
  if (scale !== undefined) assertVec2(scale, 'uv edit scale');
  if (rotation !== undefined && !(typeof rotation === 'number' && Number.isFinite(rotation))) {
    throw new Error('uv edit rotation must be a finite number of radians');
  }
  if (!edit.offset && !edit.scale && edit.rotation === undefined && !edit.flipX && !edit.flipY) {
    throw new Error('uv edit must specify at least one of offset, scale, rotation, flipX or flipY');
  }

  for (const id of faceIds) {
    const face = faceById(mesh, id);
    let uvs = face.uv.map((uv) => [uv[0], uv[1]] as Vec2);
    const n = uvs.length;

    const centroid: Vec2 = uvs.length
      ? uvs.reduce((a, b) => [a[0] + b[0], a[1] + b[1]], [0, 0]).map((m2) => m2 / uvs.length) as Vec2
      : [0, 0];

    if (scale) uvs = uvs.map(([u, v]) => [centroid[0] + (u - centroid[0]) * scale[0], centroid[1] + (v - centroid[1]) * scale[1]]);
    if (rotation !== undefined) {
      const c = Math.cos(rotation), s = Math.sin(rotation);
      uvs = uvs.map(([u, v]) => {
        const du = u - centroid[0], dv = v - centroid[1];
        return [centroid[0] + du * c - dv * s, centroid[1] + du * s + dv * c] as Vec2;
      });
    }
    if (flipX) uvs = uvs.map(([u,v]) => [2*centroid[0]-u,v]);
    if (flipY) uvs = uvs.map(([u,v]) => [u,2*centroid[1]-v]);
    if (offset) uvs = uvs.map(([u, v]) => [u + offset[0], v + offset[1]] as Vec2);

    for (const uv of uvs) {
      if (!uv.every((m2) => Number.isFinite(m2))) {
        throw new ValidationError(`uv edit produced nonfinite uv on face ${face.id}`);
      }
    }
    face.uv = uvs;
  }
}

/**
 * Rewire faces onto a new vertex list, preserving each corner's UV. Used by
 * merge operations elsewhere; exported because IO/serialization helpers and
 * tests rely on UV corners surviving topology changes.
 */
export function rewireFaceCorners(face: Face, idMap: Map<string, string>): void {
  const next: string[] = [];
  const uvs: Vec2[] = [];
  for (let i = 0; i < face.vertices.length; i++) {
    const mapped = idMap.get(face.vertices[i]);
    if (!mapped) throw new Error(`face ${face.id} references vertex ${face.vertices[i]} outside its mesh (dangling reference)`);
    next.push(mapped);
    uvs.push([face.uv[i][0], face.uv[i][1]]);
  }
  face.vertices = next;
  face.uv = uvs;
}

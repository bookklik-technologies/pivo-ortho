// Geometry editing operations: transforms, triangulation, extrusion, mirroring,
// merging, vertex and face editing. Every mutation honors mesh.locked and never
// leaves dangling face->vertex references.
import type { Mesh, Face, Vec3, Vec2, Axis, Pose } from './types';
import { uid, add, sub, scale as vscale, cross, dot, normalize, length, cloneVec3, cloneVec2, AXIS_INDEX, rotateVec, mulVec } from './util';
import { ValidationError } from './validate';

export function faceById(mesh: Mesh, faceId: string): Face {
  const face = mesh.faces.find((f) => f.id === faceId);
  if (!face) throw new Error(`mesh ${mesh.name} has no face ${faceId}`);
  return face;
}

export function vertexById(mesh: Mesh, id: string) {
  const v = mesh.vertices.find((vv) => vv.id === id);
  if (!v) throw new Error(`mesh ${mesh.name} has no vertex ${id}`);
  return v;
}

function assertEditable(mesh: Mesh, what: string): void {
  if (mesh.locked) throw new Error(`mesh "${mesh.name}" is locked; cannot ${what}`);
}

/**
 * Local mesh transform: position + pivot + R*S*(vertex - pivot).
 * A supplied pose is an absolute evaluated TRS replacement; base transforms
 * are already included by evaluateMesh. The local pivot remains unchanged.
 */
export function worldVertex(mesh: Mesh, position: Vec3, pose?: Pose): Vec3 {
  const pivot = mesh.pivot;
  const rel = sub(position, pivot);
  const scaled = mulVec(rel, pose?.scale ?? mesh.scale);
  const rotated = rotateVec(scaled, pose?.rotation ?? mesh.rotation);
  return add(add(pose?.position ?? mesh.position, pivot), rotated);
}

/**
 * Triangulate a polygon face with projected ear clipping. Works for concave
 * polygons by projecting onto the face's dominant plane. Returns an array of
 * triangle corner indices into the face's corner list. Degenerate polygons
 * (fewer than 3 distinct corners, collinear with zero area, or repeated
 * vertices) throw clear errors.
 */
export function triangulateFace(mesh: Mesh, face: Face): number[] {
  const n = face.vertices.length;
  if (n < 3) throw new Error(`face ${face.id} has ${n} corners; at least 3 are required for triangulation`);
  const positions = face.vertices.map((vid) => {
    const v = mesh.vertices.find((vv) => vv.id === vid);
    if (!v) throw new Error(`face ${face.id} references vertex ${vid} outside its mesh (dangling reference)`);
    return v.position;
  });
  // Deduplicate repeated consecutive corner positions (indices preserved).
  const idx: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = positions[i];
    const b = positions[(i + 1) % n];
    if (a[0] !== b[0] || a[1] !== b[1] || a[2] !== b[2]) idx.push(i);
  }
  if (idx.length < 3) {
    throw new Error(`face ${face.id} is degenerate: all corners collapse onto the same position`);
  }

  // Project onto the axis plane with the largest normal component.
  const p0 = positions[idx[0]];
  const p1 = positions[idx[1]];
  const p2 = positions[idx[2]];
  const nrm = cross(sub(p1, p0), sub(p2, p0));
  const nl = length(nrm);
  if (nl < 1e-12) {
    throw new Error(`face ${face.id} is degenerate: corners are collinear so it has zero area`);
  }
  const ax = Math.abs(nrm[0]), ay = Math.abs(nrm[1]), az = Math.abs(nrm[2]);
  const dropAxis = ax >= ay && ax >= az ? 0 : ay >= az ? 1 : 2;

  const pts: [number, number][] = idx.map((i) => {
    const p = positions[i];
    if (dropAxis === 0) return [p[1], p[2]];
    if (dropAxis === 1) return [p[2], p[0]];
    return [p[0], p[1]];
  });

  // Signed area of the projected ring tells us its orientation.
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  const ccw = area > 0;
  const crossZ = (a: [number, number], b: [number, number], c: [number, number]) =>
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const inTriangle = (a: [number, number], b: [number, number], c: [number, number], p: [number, number]) => {
    const d1 = crossZ(a, b, p);
    const d2 = crossZ(b, c, p);
    const d3 = crossZ(c, a, p);
    const hasNeg = d1 < -1e-9 || d2 < -1e-9 || d3 < -1e-9;
    const hasPos = d1 > 1e-9 || d2 > 1e-9 || d3 > 1e-9;
    return !(hasNeg && hasPos);
  };

  const remaining = pts.map((_, k) => k);
  const triangles: number[] = [];
  let guard = 0;
  const maxGuard = remaining.length * remaining.length + 16;
  while (remaining.length > 3) {
    if (guard++ > maxGuard) {
      throw new Error(`face ${face.id} could not be triangulated; the polygon is self-intersecting or otherwise malformed`);
    }
    let clipped = false;
    outer:
    for (let k = 0; k < remaining.length; k++) {
      const i0 = remaining[(k + remaining.length - 1) % remaining.length];
      const i1 = remaining[k];
      const i2 = remaining[(k + 1) % remaining.length];
      const a = pts[i0], b = pts[i1], c = pts[i2];
      const cz = ccw ? crossZ(a, b, c) : -crossZ(a, b, c);
      if (cz <= 1e-12) continue; // reflex or collinear ear
      let contains = false;
      for (let m = 0; m < remaining.length; m++) {
        const im = remaining[m];
        if (im === i0 || im === i1 || im === i2) continue;
        if (inTriangle(a, b, c, pts[im])) { contains = true; break; }
      }
      if (contains) continue;
      triangles.push(idx[i0], idx[i1], idx[i2]);
      remaining.splice(k, 1);
      clipped = true;
      break outer;
    }
    if (!clipped) {
      throw new Error(`face ${face.id} could not be triangulated; the polygon is self-intersecting or otherwise malformed`);
    }
  }
  const [i0, i1, i2] = remaining;
  triangles.push(idx[i0], idx[i1], idx[i2]);
  return triangles;
}

/** Translate a set of vertices, optionally snapping the result to a grid. */
export function translateVertices(mesh: Mesh, ids: string[], delta: Vec3, snap?: number): void {
  assertEditable(mesh, 'translate vertices');
  const set = new Set(ids);
  for (const id of ids) {
    const v = vertexById(mesh, id);
    let next = add(v.position, delta);
    if (snap !== undefined) {
      if (!(typeof snap === 'number' && Number.isFinite(snap) && snap > 0)) {
        throw new Error('snap must be a positive finite number');
      }
      next = [
        Math.round(next[0] / snap) * snap,
        Math.round(next[1] / snap) * snap,
        Math.round(next[2] / snap) * snap,
      ];
    }
    v.position = next;
  }
  void set;
}

/**
 * Merge vertices: average positions, rewire faces, keep per-corner UVs, drop
 * degenerate polygons and never leave dangling ids.
 */
export function mergeVertices(mesh: Mesh, ids: string[]): void {
  assertEditable(mesh, 'merge vertices');
  if (ids.length < 2) throw new Error('vertex merge needs at least 2 vertex ids');
  const targets = ids.map((id) => vertexById(mesh, id));
  const avg: Vec3 = [0, 0, 0];
  for (const t of targets) avg[0] += t.position[0], avg[1] += t.position[1], avg[2] += t.position[2];
  avg[0] /= targets.length; avg[1] /= targets.length; avg[2] /= targets.length;
  for (const t of targets) t.position = cloneVec3(avg);
  const keep = targets[0];
  const removed = new Set(targets.slice(1).map((t) => t.id));

  const remap = (id: string) => (removed.has(id) ? keep.id : id);
  const nextFaces: Face[] = [];
  for (const face of mesh.faces) {
    // remap corners, preserving UV corners; collapse consecutive duplicates
    const corners: { id: string; uv: Vec2 }[] = [];
    for (let i = 0; i < face.vertices.length; i++) {
      const id = remap(face.vertices[i]);
      const uv = cloneVec2(face.uv[i]);
      const last = corners[corners.length - 1];
      if (last && last.id === id) {
        // collapsed corner: keep first uv
        continue;
      }
      corners.push({ id, uv });
    }
    // also collapse wraparound duplicate (first === last)
    if (corners.length > 1 && corners[0].id === corners[corners.length - 1].id) {
      corners.pop();
    }
    if (corners.length < 3) continue; // polygon became degenerate
    nextFaces.push({ ...face, vertices: corners.map((c) => c.id), uv: corners.map((c) => c.uv) });
  }
  mesh.faces = nextFaces;
  mesh.vertices = mesh.vertices.filter((v) => !removed.has(v.id));
}

/** Delete vertices; any face that references them is removed as well. */
export function deleteVertices(mesh: Mesh, ids: string[]): void {
  assertEditable(mesh, 'delete vertices');
  const removed = new Set(ids);
  for (const id of ids) vertexById(mesh, id); // must exist
  mesh.faces = mesh.faces.filter((f) => !f.vertices.some((vid) => removed.has(vid)));
  mesh.vertices = mesh.vertices.filter((v) => !removed.has(v.id));
}

/** Delete one face by id. */
export function deleteFace(mesh: Mesh, faceId: string): void {
  assertEditable(mesh, 'delete a face');
  const before = mesh.faces.length;
  mesh.faces = mesh.faces.filter((f) => f.id !== faceId);
  if (mesh.faces.length === before) throw new Error(`mesh "${mesh.name}" has no face ${faceId}`);
}

/**
 * Extrude a face along its normalized face normal. The source face's corners
 * are duplicated and moved by distance*normal; connecting side quads bridge
 * each original edge to the moved copy, and the original face becomes the cap.
 * distance === 0 is rejected; negative distances extrude inward (normal flips
 * via the shared corner copy, so the operation remains well-formed).
 */
export function extrudeFace(mesh: Mesh, faceId: string, distance: number): void {
  assertEditable(mesh, 'extrude a face');
  const face = faceById(mesh, faceId);
  if (!Number.isFinite(distance)) throw new Error('extrude distance must be a finite number');
  if (distance === 0) throw new Error('extrude distance must be non-zero; a zero-distance extrusion would create degenerate geometry');

  const corners = face.vertices.map((vid) => vertexById(mesh, vid));
  const positions = corners.map((v) => v.position);
  const nrm = normalize(cross(
    sub(positions[1], positions[0]),
    sub(positions[2], positions[0]),
  ));

  const copies = corners.map((v) => ({ id: uid('v'), position: add(cloneVec3(v.position), vscale(nrm, distance)) }));
  mesh.vertices.push(...copies);

  // side quads: (old[i], old[j], new[j], new[i]) — winding follows the cap's
  // corner order so sides stay outward when the cap was outward wound.
  const sideUV: [number, number][] = [[8, 8], [24, 8], [24, 24], [8, 24]];
  for (let i = 0; i < corners.length; i++) {
    const j = (i + 1) % corners.length;
    mesh.faces.push({
      id: uid('f'),
      vertices: [corners[i].id, corners[j].id, copies[j].id, copies[i].id],
      uv: sideUV.map(([u, v]) => [u, v] as [number, number]),
      color: face.color,
      doubleSided: face.doubleSided,
      shaded: face.shaded,
      textured: face.textured,
      drawBehind: face.drawBehind,
    });
  }
  // the extruded cap: reuse the original face object, point it at the copies,
  // keeping its per-corner UVs so texturing is preserved.
  face.vertices = copies.map((c) => c.id);
}

/** Mirror vertex positions (and hence winding) across a world axis through the mesh origin. */
export function mirrorMesh(mesh: Mesh, axis: Axis): void {
  assertEditable(mesh, 'mirror the mesh');
  const i = AXIS_INDEX[axis];
  for (const v of mesh.vertices) {
    v.position[i] = -v.position[i];
  }
  // Correct winding: reversing each face's corner order flips the normal back
  // to outward. Per-corner UVs travel with their corners so textures survive.
  for (const face of mesh.faces) {
    face.vertices = [...face.vertices].reverse();
    const flipped: Vec2[] = face.uv.map((uv) => cloneVec2(uv));
    flipped.reverse();
    face.uv = flipped;
  }
}

/**
 * Merge several meshes into one new mesh. Each source mesh's world transform
 * (position, pivot, rotation, scale) is baked into vertex positions; material
 * attributes and per-corner UVs are preserved. Source meshes are not mutated.
 */
export function mergeMeshes(meshes: Mesh[], name = 'Merged'): Mesh {
  if (!Array.isArray(meshes) || meshes.length === 0) {
    throw new Error('mergeMeshes needs at least one mesh');
  }
  const out: Mesh = {
    id: uid('m'),
    name,
    vertices: [],
    faces: [],
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    pivot: [0, 0, 0],
    visible: true,
    locked: false,
    folderId: null,
  };
  const globalIds = new Map<string, string>();
  for (const src of meshes) {
    for (const v of src.vertices) {
      const world = worldVertex(src, v.position);
      const nid = uid('v');
      globalIds.set(`${src.id}:${v.id}`, nid);
      out.vertices.push({ id: nid, position: world });
    }
  }
  for (const src of meshes) {
    for (const f of src.faces) {
      const corners = f.vertices.map((vid) => {
        const nid = globalIds.get(`${src.id}:${vid}`);
        if (!nid) throw new Error(`face ${f.id} references vertex ${vid} outside its mesh (dangling reference)`);
        return nid;
      });
      out.faces.push({
        ...f,
        id: uid('f'),
        vertices: corners,
        uv: f.uv.map(([u, v]) => [u, v] as [number, number]),
      });
    }
  }
  return out;
}

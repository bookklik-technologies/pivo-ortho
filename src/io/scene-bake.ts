/**
 * Shared scene baking: converts a Project at an evaluated time into world-space
 * triangle soup with per-corner UVs and material descriptors. Used by both the
 * OBJ and glTF exporters so both codecs observe identical semantics.
 */

import type { Mesh, Project, Vec3, Vec2 } from '../core/types';
import { worldVertex, triangulateFace, evaluateMesh } from '../core';

export interface BakedTriangle {
  /** 3 world positions. */
  positions: [Vec3, Vec3, Vec3];
  /** Normalized UVs, v flipped to image-bottom-left. */
  uvs: [Vec2, Vec2, Vec2];
  /** Full source-face corner UVs (normalized), parallel to the face's corners;
   * quads carry 4 entries so OBJ writers can emit one vt per face corner per
   * triangle. */
  faceUvs: Vec2[];
  /** Face color palette index. */
  color: number;
  textured: boolean;
  doubleSided: boolean;
  drawBehind: boolean;
  shaded: boolean;
  /** Geometric normal (normalized). */
  normal: Vec3;
  meshName: string;
  meshId: string;
}

export interface BakedScene {
  triangles: BakedTriangle[];
  meshes: Array<{ id: string; name: string; visible: boolean }>;
  warnings: string[];
}

export function hexToRGB(hex: string): [number, number, number] {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) throw new Error(`hexToRGB: invalid color ${JSON.stringify(hex)}`);
  const v = parseInt(m[1], 16);
  return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
}

function normalize(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]);
  if (l < 1e-12) return [0, 1, 0];
  return [v[0] / l, v[1] / l, v[2] / l];
}

/**
 * Bake the project at `time` (seconds) to world-space triangles.
 * - hidden meshes and meshes in hidden folders are skipped (with a warning
 *   naming each skipped mesh)
 * - texture UVs (pixel coords, top-left origin) convert to normalized
 *   bottom-left-origin UVs; u wraps modulo the texture width so seam UVs
 *   like (128, y) still land on the last texel column.
 */
export function bakeScene(project: Project, time = 0, options: { ignoreVisibilityClips?: boolean } = {}): BakedScene {
  if (!project || !Array.isArray(project.meshes)) throw new Error('bakeScene: invalid project');
  const hiddenFolders = new Set(
    (project.folders ?? []).filter((f) => !f.visible).map((f) => f.id),
  );
  const warnings: string[] = [];
  const triangles: BakedTriangle[] = [];
  const meshes: BakedScene['meshes'] = [];
  const texW = project.texture.width;
  const texH = project.texture.height;

  for (const mesh of project.meshes) {
    if (!mesh.visible) {
      warnings.push(`mesh "${mesh.name}" is hidden and was skipped`);
      continue;
    }
    if (mesh.folderId != null && hiddenFolders.has(mesh.folderId)) {
      warnings.push(`mesh "${mesh.name}" belongs to a hidden folder and was skipped`);
      continue;
    }
    const pose = evaluateMesh(mesh, project.animation, time);
    if (!pose.visible) {
      if (options.ignoreVisibilityClips) {
        // Static exporters can't express animation-driven hiding; keep the
        // base geometry and warn (the visibility clip is reported separately).
        warnings.push(`mesh "${mesh.name}" is hidden by a visibility clip at t=${time}; exported at its base pose because visibility animation is not representable`);
      } else {
        warnings.push(`mesh "${mesh.name}" is hidden by animation at t=${time} and was skipped`);
        continue;
      }
    }
    meshes.push({ id: mesh.id, name: mesh.name, visible: true });

    for (const face of mesh.faces) {
      // Local vertex world positions.
      const world = face.vertices.map((vid) => {
        const v = mesh.vertices.find((vv) => vv.id === vid);
        if (!v) throw new Error(`bakeScene: face ${face.id} references missing vertex ${vid}`);
        return worldVertex(mesh, v.position, pose);
      });
      const cornerIdx = triangulateFace(mesh, face);
      if (cornerIdx.length < 3 || cornerIdx.length % 3 !== 0) {
        throw new Error(`bakeScene: face ${face.id} triangulated to ${cornerIdx.length} indices`);
      }
      // Geometric normal from the first triangle for degenerate-input safety.
      const [i0, i1, i2] = cornerIdx;
      const a = world[i0];
      const b = world[i1];
      const c = world[i2];
      const u: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const v: Vec3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const n: Vec3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const nn = normalize(n);

      const uvFor=(uv:Vec2):Vec2=>[(uv[0]+0.5)/texW,1-(uv[1]+0.5)/texH];
      const faceUvs:Vec2[]=face.uv.map(uvFor);

      for (let t = 0; t < cornerIdx.length; t += 3) {
        const tri = cornerIdx.slice(t, t + 3);
        const uvs=tri.map(ci=>uvFor(face.uv[ci]??[0,0]));
        triangles.push({
          positions: [world[tri[0]], world[tri[1]], world[tri[2]]],
          uvs: [uvs[0], uvs[1], uvs[2]],
          faceUvs,
          color: face.color,
          textured: face.textured,
          doubleSided: face.doubleSided,
          drawBehind: face.drawBehind,
          shaded: face.shaded,
          normal: nn,
          meshName: mesh.name,
          meshId: mesh.id,
        });
      }
    }
  }
  return { triangles, meshes, warnings };
}

/** Evaluate a single mesh's pose (re-exported convenience for codecs). */
export function meshPose(mesh: Mesh, project: Project, time: number) {
  return evaluateMesh(mesh, project.animation, time);
}

/** Group triangles by (mesh, color, textured) material key. */
export interface MaterialGroup {
  key: string;
  meshName: string;
  color: number;
  textured: boolean;
  triangles: BakedTriangle[];
}

export function groupByMaterial(scene: BakedScene): MaterialGroup[] {
  const groups = new Map<string, MaterialGroup>();
  for (const tri of scene.triangles) {
    const key = `${tri.meshId}|${tri.color}|${tri.textured ? 'tex' : 'flat'}`;
    let g = groups.get(key);
    if (!g) {
      g = { key, meshName: tri.meshName, color: tri.color, textured: tri.textured, triangles: [] };
      groups.set(key, g);
    }
    g.triangles.push(tri);
  }
  return [...groups.values()];
}

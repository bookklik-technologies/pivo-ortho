// Project construction, primitives and mesh cloning.
// Winding convention: every face is counter-clockwise seen from outside, so the
// cross product of consecutive edge vectors points outward.
import type { Mesh, Project, Texture, Face, Vertex, Vec3 } from './types';
import { uid, cloneVec3 } from './util';
import { validateProject } from './validate';

/** The 16-color palette (index 0 transparent by default). */
export const PALETTE_16: string[] = [
  '#0b1019', '#1b2946', '#67415b', '#3f806c', '#b66f53', '#5a5d69', '#b0bdc5', '#f4eee0',
  '#ee536d', '#e7aa49', '#eddb79', '#90b56b', '#6aaed1', '#8d86b5', '#d797b4', '#eac2a2',
];

export const TEXTURE_SIZE = 128;

/**
 * Authored default texture: a solid border band around an 8px checkerboard of
 * two tinted regions, expressed purely as palette indices.
 */
function defaultTexturePixels(): number[] {
  const pixels = new Array<number>(TEXTURE_SIZE * TEXTURE_SIZE).fill(14);
  const border = 8;
  for (let y = 0; y < TEXTURE_SIZE; y++) {
    for (let x = 0; x < TEXTURE_SIZE; x++) {
      const inBorder = x < border || y < border || x >= TEXTURE_SIZE - border || y >= TEXTURE_SIZE - border;
      if (inBorder) {
        // Border band uses indices 3/5 (kept clear of common paint colors so
        // pasted regions remain distinguishable from the default pattern).
        pixels[y * TEXTURE_SIZE + x] = x + y < TEXTURE_SIZE ? 3 : 5;
      } else {
        const cx = Math.floor((x - border) / 8);
        const cy = Math.floor((y - border) / 8);
        pixels[y * TEXTURE_SIZE + x] = (cx + cy) % 2 === 0 ? 15 : 11;
      }
    }
  }
  return pixels;
}

export function defaultTexture(): Texture {
  return {
    width: 128,
    height: 128,
    pixels: defaultTexturePixels(),
    palette: [...PALETTE_16],
    transparent: 0,
    background: 7,
    shadeRamps: [],
  };
}

export function createProject(name = 'Untitled'): Project {
  const project: Project = {
    format: 'pivo-ortho',
    version: 1,
    name,
    meshes: [],
    folders: [],
    texture: defaultTexture(),
    animation: { duration: 4, fps: 12, clips: [] },
    render: {
      background: '#182131',
      shading: true,
      wireframe: false,
      pixelSize: 2,
      affine: true,
      light: [0.5, 0.8, 0.3],
    },
  };
  validateProject(project);
  return project;
}

function vertex(position: Vec3): Vertex {
  return { id: uid('v'), position: cloneVec3(position) };
}

function makeFace(verts: Vertex[], uv: [number, number][], opts?: Partial<Face>): Face {
  return {
    id: uid('f'),
    vertices: verts.map((v) => v.id),
    uv: uv.map(([u, v]) => [u, v] as [number, number]),
    color: 10,
    doubleSided: false,
    shaded: true,
    textured: false,
    drawBehind: false,
    ...opts,
  };
}

function baseMesh(name: string): Mesh {
  return {
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
}

const QUAD_UV: [number, number][] = [[8, 8], [24, 8], [24, 24], [8, 24]];
const TRI_UV: [number, number][] = [[8, 8], [24, 8], [16, 24]];

/** Evenly spread n corner UVs around a circle in texture space (for n-gon caps). */
function capUV(n: number): [number, number][] {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    return [16 + Math.cos(a) * 8, 16 + Math.sin(a) * 8] as [number, number];
  });
}

/** Create a primitive mesh with consistent outward winding and per-corner UVs. */
export function createPrimitive(type: 'cube' | 'plane' | 'pyramid' | 'cylinder' | 'prism', name?: string): Mesh {
  switch (type) {
    case 'cube': return cube(name ?? 'Cube');
    case 'plane': return plane(name ?? 'Plane');
    case 'pyramid': return pyramid(name ?? 'Pyramid');
    case 'cylinder': return cylinder(name ?? 'Cylinder');
    case 'prism': return prism(name ?? 'Prism');
    default: throw new Error(`unknown primitive type: ${String(type)}`);
  }
}

function cube(name: string): Mesh {
  const m = baseMesh(name);
  const s = 0.5;
  // corner index bit0:+x, bit1:+y, bit2:+z, then mirrored across x so vertex 0
  // sits at (+s,-s,-s) — the documented vertex order (bit0:-x).
  const c: Vertex[] = [];
  for (let i = 0; i < 8; i++) {
    c.push(vertex([((i & 1) ? -1 : 1) * s, ((i & 2) ? 1 : -1) * s, ((i & 4) ? 1 : -1) * s]));
  }
  m.vertices.push(...c);
  const q = (a: Vertex, b: Vertex, cc: Vertex, d: Vertex) => m.faces.push(makeFace([a, b, cc, d], QUAD_UV));
  // -z, +z, -y, +y, -x, +x — all CCW seen from outside (each cycle is the
  // original corner-set winding reversed, compensating the x mirror)
  q(c[1], c[3], c[2], c[0]);
  q(c[6], c[7], c[5], c[4]);
  q(c[4], c[5], c[1], c[0]);
  q(c[3], c[7], c[6], c[2]);
  q(c[2], c[6], c[4], c[0]);
  q(c[5], c[7], c[3], c[1]);
  return m;
}

function plane(name: string): Mesh {
  const m = baseMesh(name);
  const s = 0.5;
  const a = vertex([-s, 0, -s]);
  const b = vertex([s, 0, -s]);
  const c = vertex([s, 0, s]);
  const d = vertex([-s, 0, s]);
  m.vertices.push(a, b, c, d);
  m.faces.push(makeFace([a, d, c, b], QUAD_UV)); // normal +y
  return m;
}

function pyramid(name: string): Mesh {
  const m = baseMesh(name);
  const s = 0.5, h = 0.5;
  const a = vertex([-s, -h, -s]);
  const b = vertex([s, -h, -s]);
  const c = vertex([s, -h, s]);
  const d = vertex([-s, -h, s]);
  const apex = vertex([0, h, 0]);
  m.vertices.push(a, b, c, d, apex);
  m.faces.push(makeFace([a, b, c, d], QUAD_UV)); // base, outward -y
  m.faces.push(makeFace([b, a, apex], TRI_UV));  // -z side
  m.faces.push(makeFace([c, b, apex], TRI_UV));  // +x side
  m.faces.push(makeFace([d, c, apex], TRI_UV));  // +z side
  m.faces.push(makeFace([a, d, apex], TRI_UV));  // -x side
  return m;
}

function cylinder(name: string, segments = 8): Mesh {
  const m = baseMesh(name);
  const r = 0.5, h = 0.5;
  const ring: Vertex[] = [];
  const ringTop: Vertex[] = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    ring.push(vertex([Math.cos(a) * r, -h, Math.sin(a) * r]));
    ringTop.push(vertex([Math.cos(a) * r, h, Math.sin(a) * r]));
  }
  m.vertices.push(...ring, ...ringTop);
  for (let i = 0; i < segments; i++) {
    const j = (i + 1) % segments;
    m.faces.push(makeFace([ring[i], ringTop[i], ringTop[j], ring[j]], QUAD_UV));
  }
  m.faces.push(makeFace([...ringTop].reverse(), capUV(segments))); // top cap, outward +y
  m.faces.push(makeFace([...ring], capUV(segments)));              // bottom cap, outward -y
  return m;
}

function prism(name: string): Mesh {
  const m = baseMesh(name);
  const r = 0.5, h = 0.5;
  const tri: [number, number][] = [];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 - Math.PI / 2;
    tri.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  const bottom = tri.map(([x, z]) => vertex([x, -h, z]));
  const top = tri.map(([x, z]) => vertex([x, h, z]));
  m.vertices.push(...bottom, ...top);
  for (let i = 0; i < 3; i++) {
    const j = (i + 1) % 3;
    m.faces.push(makeFace([bottom[i], top[i], top[j], bottom[j]], QUAD_UV));
  }
  m.faces.push(makeFace([...top].reverse(), capUV(3))); // top cap, outward +y
  m.faces.push(makeFace([...bottom], capUV(3)));        // bottom cap, outward -y
  return m;
}

/** Deep clone with fresh IDs for the mesh, its vertices and faces; nudged by a small offset. */
export function cloneMesh(mesh: Mesh): Mesh {
  const offset = 0.25;
  const idMap = new Map<string, string>();
  const vertices = mesh.vertices.map((v) => {
    const id = uid('v');
    idMap.set(v.id, id);
    return { id, position: cloneVec3(v.position) };
  });
  const faces = mesh.faces.map((f) => ({
    ...f,
    id: uid('f'),
    vertices: f.vertices.map((vid) => {
      const mapped = idMap.get(vid);
      if (!mapped) throw new Error(`face ${f.id} references vertex ${vid} outside its mesh (dangling reference)`);
      return mapped;
    }),
    uv: f.uv.map(([u, v]) => [u, v] as [number, number]),
  }));
  return {
    ...mesh,
    id: uid('m'),
    name: `${mesh.name} copy`,
    vertices,
    faces,
    position: [mesh.position[0] + offset, mesh.position[1] + offset, mesh.position[2] + offset],
  };
}

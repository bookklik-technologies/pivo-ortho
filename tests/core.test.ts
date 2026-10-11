import { describe, it, expect } from 'vitest';
import {
  uid, createProject, createPrimitive, cloneMesh, worldVertex, triangulateFace,
  translateVertices, mergeVertices, deleteVertices, deleteFace, extrudeFace,
  mirrorMesh, mergeMeshes, transformUV, paint, floodFill, textureRGBA,
  quantizeRGBA, swapPalette, generateRamps, marqueeCopy, marqueePaste,
  createClip, evaluateMesh, serializeProject, parseProject, History,
  PALETTE_16, ValidationError,
} from '../src/core';
import type { Mesh, Face, Project, Clip, Animation } from '../src/core';

let seq = 0;
function nextId(prefix: string): string {
  return `${prefix}_t${++seq}`;
}

function makeMesh(partial: Partial<Mesh> = {}): Mesh {
  return {
    id: nextId('m'),
    name: partial.name ?? 'TestMesh',
    vertices: [],
    faces: [],
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    pivot: [0, 0, 0],
    visible: true,
    locked: false,
    folderId: null,
    ...partial,
  };
}

function cubeMesh(): Mesh {
  return createPrimitive('cube', 'Cube');
}

function faceNormal(mesh: Mesh, face: Face): [number, number, number] {
  const p = face.vertices.map((id) => mesh.vertices.find((v) => v.id === id)!.position);
  const a = [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]];
  const b = [p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]];
  const n = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const l = Math.hypot(...n);
  return [n[0] / l, n[1] / l, n[2] / l];
}

function faceCentroid(mesh: Mesh, face: Face): [number, number, number] {
  const p = face.vertices.map((id) => mesh.vertices.find((v) => v.id === id)!.position);
  return p.reduce((a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], [0, 0, 0]).map((n) => n / p.length) as [number, number, number];
}

function simpleFace(vertices: { id: string }[], uvs: [number, number][]): Face {
  return {
    id: nextId('f'),
    vertices: vertices.map((v) => v.id),
    uv: uvs,
    color: 3,
    doubleSided: false,
    shaded: true,
    textured: false,
    drawBehind: false,
  };
}

// ── ids / project ──────────────────────────────────────────────

describe('uid and project creation', () => {
  it('generates unique ids with prefix', () => {
    const a = uid('m'), b = uid('m'), c = uid('v');
    expect(a).not.toBe(b);
    expect(a.startsWith('m_')).toBe(true);
    expect(c.startsWith('v_')).toBe(true);
  });

  it('defaults prefix to id', () => {
    expect(uid().startsWith('id_')).toBe(true);
  });

  it('creates a project with format/version/name', () => {
    const p = createProject('Demo');
    expect(p.format).toBe('pivo-ortho');
    expect(p.version).toBe(1);
    expect(p.name).toBe('Demo');
    expect(p.meshes).toEqual([]);
    expect(p.folders).toEqual([]);
  });

  it('project name defaults to Untitled', () => {
    expect(createProject().name).toBe('Untitled');
  });

  it('creates the original 16-color palette', () => {
    const p = createProject();
    expect(p.texture.palette).toHaveLength(16);
    expect(p.texture.palette).toEqual(PALETTE_16);
    expect(p.texture.palette.every((c) => /^#[0-9a-f]{6}$/i.test(c))).toBe(true);
  });

  it('texture is 128x128 with 16384 indexed pixels', () => {
    const p = createProject();
    expect(p.texture.width).toBe(128);
    expect(p.texture.height).toBe(128);
    expect(p.texture.pixels).toHaveLength(16384);
    expect(p.texture.pixels.every((v) => Number.isInteger(v) && v >= 0 && v <= 15)).toBe(true);
  });

  it('default texture has a designated transparent index and authored pattern', () => {
    const p = createProject();
    expect(Number.isInteger(p.texture.transparent)).toBe(true);
    const values = new Set(p.texture.pixels);
    expect(values.size).toBeGreaterThan(1);
  });
});

// ── primitives ─────────────────────────────────────────────────

describe('primitives', () => {
  const types = ['cube', 'plane', 'pyramid', 'cylinder', 'prism'] as const;

  it.each(types)('%s has consistent outward winding', (type) => {
    const m = createPrimitive(type);
    for (const face of m.faces) {
      const n = faceNormal(m, face);
      const c = faceCentroid(m, face);
      const d = n[0] * c[0] + n[1] * c[1] + n[2] * c[2];
      expect(d).toBeGreaterThan(-1e-6);
    }
  });

  it.each(types)('%s has one uv per corner', (type) => {
    const m = createPrimitive(type);
    for (const f of m.faces) expect(f.uv).toHaveLength(f.vertices.length);
  });

  it('cube has 6 quads and 8 vertices', () => {
    const m = createPrimitive('cube');
    expect(m.vertices).toHaveLength(8);
    expect(m.faces).toHaveLength(6);
    expect(m.faces.every((f) => f.vertices.length === 4)).toBe(true);
  });

  it('cylinder has caps and sides', () => {
    const m = createPrimitive('cylinder');
    expect(m.faces).toHaveLength(10);
  });

  it('rejects unknown primitive type', () => {
    expect(() => createPrimitive('sphere' as never)).toThrow(/unknown primitive/i);
  });

  it('cloneMesh gets new ids and a small offset', () => {
    const m = cubeMesh();
    const c = cloneMesh(m);
    expect(c.id).not.toBe(m.id);
    expect(c.name).toContain('copy');
    expect(c.position).toEqual([0.25, 0.25, 0.25]);
    const origIds = new Set(m.vertices.map((v) => v.id));
    expect(c.vertices.every((v) => !origIds.has(v.id))).toBe(true);
    const origFaceIds = new Set(m.faces.map((f) => f.id));
    expect(c.faces.every((f) => !origFaceIds.has(f.id))).toBe(true);
    expect(c.vertices).toHaveLength(m.vertices.length);
    expect(c.faces).toHaveLength(m.faces.length);
  });

  it('cloneMesh preserves uv corners', () => {
    const m = cubeMesh();
    const c = cloneMesh(m);
    expect(c.faces.map((f) => f.uv)).toEqual(m.faces.map((f) => f.uv));
  });
});

// ── transforms / worldVertex ───────────────────────────────────

describe('worldVertex transform', () => {
  it('identity transform leaves position unchanged', () => {
    const m = makeMesh();
    expect(worldVertex(m, [1, 2, 3])).toEqual([1, 2, 3]);
  });

  it('applies position offset', () => {
    const m = makeMesh({ position: [10, 0, 0] });
    expect(worldVertex(m, [1, 2, 3])).toEqual([11, 2, 3]);
  });

  it('pivot offset composes additively with no rotation', () => {
    const m = makeMesh({ position: [2, 3, 4], pivot: [1, 1, 1] });
    expect(worldVertex(m, [1, 1, 1])).toEqual([3, 4, 5]);
  });

  it('scales around the pivot', () => {
    const m = makeMesh({ scale: [2, 2, 2] });
    expect(worldVertex(m, [1, 1, 1])).toEqual([2, 2, 2]);
  });

  it('rotates 90 degrees around z', () => {
    const m = makeMesh({ rotation: [0, 0, Math.PI / 2] });
    const out = worldVertex(m, [1, 0, 0]);
    expect(out[0]).toBeCloseTo(0, 6);
    expect(out[1]).toBeCloseTo(1, 6);
  });

  it('applies scale before rotation', () => {
    const m = makeMesh({ scale: [2, 1, 1], rotation: [0, 0, Math.PI / 2] });
    const out = worldVertex(m, [1, 0, 0]);
    expect(out[0]).toBeCloseTo(0, 6);
    expect(out[1]).toBeCloseTo(2, 6);
  });
});

// ── triangulation ──────────────────────────────────────────────

describe('triangulateFace', () => {
  it('triangulates a quad into 2 triangles', () => {
    const m = makeMesh({
      vertices: [
        { id: 'a', position: [0, 0, 0] },
        { id: 'b', position: [1, 0, 0] },
        { id: 'c', position: [1, 1, 0] },
        { id: 'd', position: [0, 1, 0] },
      ],
      faces: [simpleFace([{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }], [[0, 0], [1, 0], [1, 1], [0, 1]])],
    });
    const tris = triangulateFace(m, m.faces[0]);
    expect(tris).toHaveLength(6);
    expect(new Set(tris).size).toBe(4);
  });

  it('triangulates a concave L-shaped polygon correctly', () => {
    const m = makeMesh({
      vertices: [
        { id: 'a', position: [0, 0, 0] },
        { id: 'b', position: [2, 0, 0] },
        { id: 'c', position: [2, 1, 0] },
        { id: 'd', position: [1, 1, 0] },
        { id: 'e', position: [1, 2, 0] },
        { id: 'f', position: [0, 2, 0] },
      ],
      faces: [simpleFace([{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'e' }, { id: 'f' }], [[0, 0], [1, 0], [1, 1], [0.5, 1], [0.5, 2], [0, 2]])],
    });
    const tris = triangulateFace(m, m.faces[0]);
    expect(tris).toHaveLength(12); // 4 triangles
    expect(tris.every((i) => i >= 0 && i < 6)).toBe(true);
    const pos = m.vertices.map((v) => v.position);
    for (let t = 0; t < tris.length; t += 3) {
      const [i, j, k] = [tris[t], tris[t + 1], tris[t + 2]];
      const area2 = (pos[j][0] - pos[i][0]) * (pos[k][1] - pos[i][1]) - (pos[k][0] - pos[i][0]) * (pos[j][1] - pos[i][1]);
      expect(area2).not.toBe(0);
    }
  });

  it('handles a concave star polygon', () => {
    const pts: [number, number][] = [];
    const n = 10;
    for (let i = 0; i < n; i++) {
      const r = i % 2 === 0 ? 1 : 0.4;
      const a = (i / n) * Math.PI * 2;
      pts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    const m = makeMesh({
      vertices: pts.map((p, i) => ({ id: `s${i}`, position: [p[0], p[1], 0] })),
      faces: [simpleFace(pts.map((_, i) => ({ id: `s${i}` })), pts.map(() => [0, 0] as [number, number]))],
    });
    const tris = triangulateFace(m, m.faces[0]);
    expect(tris).toHaveLength(24); // n-2 triangles
  });

  it('rejects degenerate collinear polygon', () => {
    const m = makeMesh({
      vertices: [
        { id: 'a', position: [0, 0, 0] },
        { id: 'b', position: [1, 0, 0] },
        { id: 'c', position: [2, 0, 0] },
      ],
      faces: [simpleFace([{ id: 'a' }, { id: 'b' }, { id: 'c' }], [[0, 0], [1, 0], [2, 0]])],
    });
    expect(() => triangulateFace(m, m.faces[0])).toThrow(/degenerate|collinear/i);
  });

  it('rejects polygon with repeated corner', () => {
    const m = makeMesh({
      vertices: [
        { id: 'a', position: [0, 0, 0] },
        { id: 'b', position: [1, 0, 0] },
        { id: 'c', position: [1, 0, 0] },
      ],
      faces: [simpleFace([{ id: 'a' }, { id: 'b' }, { id: 'c' }], [[0, 0], [1, 0], [1, 0]])],
    });
    expect(() => triangulateFace(m, m.faces[0])).toThrow();
  });

  it('rejects dangling vertex reference clearly', () => {
    const m = makeMesh({
      faces: [simpleFace([{ id: 'ghost' }, { id: 'b' }, { id: 'c' }], [[0, 0], [1, 0], [1, 1]])],
    });
    expect(() => triangulateFace(m, m.faces[0])).toThrow(/dangling|outside its mesh/i);
  });

  it('works on non-axis-aligned planes', () => {
    const m = makeMesh({
      vertices: [
        { id: 'a', position: [0, 0, 0] },
        { id: 'b', position: [1, 0.5, 0] },
        { id: 'c', position: [1, 1.5, 1] },
        { id: 'd', position: [0, 1, 1] },
      ],
      faces: [simpleFace([{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }], [[0, 0], [1, 0], [1, 1], [0, 1]])],
    });
    expect(triangulateFace(m, m.faces[0])).toHaveLength(6);
  });
});

// ── vertex/face editing ────────────────────────────────────────

describe('vertex and face editing', () => {
  it('translateVertices moves the requested vertices', () => {
    const m = cubeMesh();
    const id = m.vertices[0].id;
    translateVertices(m, [id], [1, 0, 0]);
    expect(m.vertices[0].position).toEqual([1.5, -0.5, -0.5]);
  });

  it('translateVertices snaps to grid', () => {
    const m = makeMesh({ vertices: [{ id: 'a', position: [0.3, 0, 0] }] });
    translateVertices(m, ['a'], [0.2, 0, 0], 1);
    expect(m.vertices[0].position[0]).toBeCloseTo(1, 6);
  });

  it('translateVertices rejects nonpositive snap', () => {
    const m = cubeMesh();
    expect(() => translateVertices(m, [m.vertices[0].id], [0, 0, 0], 0)).toThrow(/snap/i);
  });

  it('translateVertices on unknown id throws', () => {
    const m = cubeMesh();
    expect(() => translateVertices(m, ['nope'], [0, 0, 0])).toThrow(/no vertex/i);
  });

  it('locked mesh rejects translation', () => {
    const m = cubeMesh();
    m.locked = true;
    expect(() => translateVertices(m, [m.vertices[0].id], [0, 0, 0])).toThrow(/locked/i);
  });

  it('mergeVertices averages positions and keeps uv corners', () => {
    const m = makeMesh({
      vertices: [
        { id: 'a', position: [0, 0, 0] },
        { id: 'b', position: [2, 0, 0] },
        { id: 'c', position: [1, 1, 0] },
        { id: 'd', position: [0, 1, 0] },
      ],
      faces: [simpleFace([{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }], [[0, 0], [1, 0], [1, 1], [0, 1]])],
    });
    mergeVertices(m, ['a', 'b']);
    const a = m.vertices.find((v) => v.id === 'a')!;
    expect(a.position[0]).toBeCloseTo(1);
    expect(m.vertices.find((v) => v.id === 'b')).toBeUndefined();
    expect(m.faces).toHaveLength(1);
    expect(m.faces[0].vertices).toContain('a');
    expect(m.faces[0].vertices).not.toContain('b');
    expect(m.faces[0].uv).toHaveLength(m.faces[0].vertices.length);
  });

  it('mergeVertices drops faces that become degenerate', () => {
    const m = makeMesh({
      vertices: [
        { id: 'a', position: [0, 0, 0] },
        { id: 'b', position: [1, 0, 0] },
        { id: 'c', position: [2, 0, 0] },
      ],
      faces: [simpleFace([{ id: 'a' }, { id: 'b' }, { id: 'c' }], [[0, 0], [1, 0], [2, 0]])],
    });
    mergeVertices(m, ['a', 'b', 'c']);
    expect(m.faces).toHaveLength(0);
    expect(m.vertices).toHaveLength(1);
  });

  it('mergeVertices rejects single id', () => {
    const m = cubeMesh();
    expect(() => mergeVertices(m, [m.vertices[0].id])).toThrow(/2 vertex/i);
  });

  it('deleteVertices removes referencing faces and leaves no dangling ids', () => {
    const m = cubeMesh();
    const doomed = m.vertices[0].id;
    deleteVertices(m, [doomed]);
    expect(m.vertices.find((v) => v.id === doomed)).toBeUndefined();
    for (const f of m.faces) expect(f.vertices).not.toContain(doomed);
    expect(m.faces.length).toBeLessThan(6);
  });

  it('deleteFace removes the face and errors on unknown id', () => {
    const m = cubeMesh();
    const fid = m.faces[0].id;
    deleteFace(m, fid);
    expect(m.faces.find((f) => f.id === fid)).toBeUndefined();
    expect(() => deleteFace(m, fid)).toThrow(/no face/i);
  });

  it('locked mesh rejects deleteFace', () => {
    const m = cubeMesh();
    m.locked = true;
    expect(() => deleteFace(m, m.faces[0].id)).toThrow(/locked/i);
  });
});

// ── extrusion ──────────────────────────────────────────────────

describe('extrudeFace', () => {
  it('adds side faces and duplicates the cap corners', () => {
    const m = cubeMesh();
    const face = m.faces[0];
    const before = m.faces.length;
    const beforeVerts = m.vertices.length;
    extrudeFace(m, face.id, 1);
    expect(m.faces.length).toBe(before + face.vertices.length);
    expect(m.vertices.length).toBe(beforeVerts + face.vertices.length);
    const n = faceNormal(m, face);
    expect(Math.hypot(...n)).toBeCloseTo(1, 6);
    const c = faceCentroid(m, face);
    expect(Math.hypot(...c)).toBeGreaterThan(0.5);
  });

  it('extruded cap keeps per-corner uvs', () => {
    const m = cubeMesh();
    const face = m.faces[0];
    const uvs = face.uv.map((u) => [...u] as [number, number]);
    extrudeFace(m, face.id, 0.5);
    expect(face.uv).toEqual(uvs);
    expect(face.uv).toHaveLength(face.vertices.length);
  });

  it('zero distance throws', () => {
    const m = cubeMesh();
    expect(() => extrudeFace(m, m.faces[0].id, 0)).toThrow(/zero/i);
  });

  it('negative distance extrudes inward', () => {
    const m = cubeMesh();
    const face = m.faces[0];
    const before = m.faces.length;
    extrudeFace(m, face.id, -0.5);
    expect(m.faces.length).toBe(before + face.vertices.length);
    const c = faceCentroid(m, face);
    expect(Math.hypot(...c)).toBeLessThan(0.5 + 1e-6);
  });

  it('extruding a triangular face works', () => {
    const m = createPrimitive('pyramid');
    const tri = m.faces[1];
    const before = m.faces.length;
    extrudeFace(m, tri.id, 0.25);
    expect(m.faces.length).toBe(before + 3);
  });

  it('locked mesh rejects extrusion', () => {
    const m = cubeMesh();
    m.locked = true;
    expect(() => extrudeFace(m, m.faces[0].id, 1)).toThrow(/locked/i);
  });

  it('rejects nonfinite distance', () => {
    const m = cubeMesh();
    expect(() => extrudeFace(m, m.faces[0].id, NaN)).toThrow(/finite/i);
  });
});

// ── mirror and merge ───────────────────────────────────────────

describe('mirror and merge', () => {
  it('mirrorMesh flips positions and corrects winding', () => {
    const m = cubeMesh();
    const before = m.faces.map((f) => faceNormal(m, f));
    mirrorMesh(m, 'x');
    const after = m.faces.map((f) => faceNormal(m, f));
    for (let i = 0; i < before.length; i++) {
      expect(after[i][0]).toBeCloseTo(-before[i][0], 6);
      expect(after[i][1]).toBeCloseTo(before[i][1], 6);
      expect(after[i][2]).toBeCloseTo(before[i][2], 6);
    }
    for (const f of m.faces) {
      const n = faceNormal(m, f);
      const c = faceCentroid(m, f);
      expect(n[0] * c[0] + n[1] * c[1] + n[2] * c[2]).toBeGreaterThan(-1e-6);
    }
  });

  it('mirrorMesh preserves uv corners with their corners', () => {
    const m = cubeMesh();
    const uvsBefore = m.faces.map((f) => f.uv.map((u) => [...u] as [number, number]));
    mirrorMesh(m, 'y');
    for (let i = 0; i < m.faces.length; i++) {
      expect(m.faces[i].uv).toHaveLength(m.faces[i].vertices.length);
      const sortedBefore = uvsBefore[i].map((u) => u.join(',')).sort();
      const sortedAfter = m.faces[i].uv.map((u) => u.join(',')).sort();
      expect(sortedAfter).toEqual(sortedBefore);
    }
  });

  it('locked mesh rejects mirroring', () => {
    const m = cubeMesh();
    m.locked = true;
    expect(() => mirrorMesh(m, 'z')).toThrow(/locked/i);
  });

  it('mergeMeshes bakes world transforms', () => {
    const a = cubeMesh();
    a.position = [1, 0, 0];
    const b = cubeMesh();
    b.rotation = [0, 0, Math.PI / 2];
    b.scale = [2, 1, 1];
    const merged = mergeMeshes([a, b], 'Merged');
    expect(merged.name).toBe('Merged');
    expect(merged.vertices).toHaveLength(16);
    expect(merged.faces).toHaveLength(12);
    const fromA = merged.vertices[0].position;
    expect(fromA[0]).toBeCloseTo(1.5, 6);
    expect(merged.position).toEqual([0, 0, 0]);
    expect(merged.rotation).toEqual([0, 0, 0]);
    expect(merged.scale).toEqual([1, 1, 1]);
  });

  it('mergeMeshes preserves material flags and uvs', () => {
    const a = cubeMesh();
    a.faces[0].color = 9;
    a.faces[0].doubleSided = true;
    a.faces[0].textured = true;
    const merged = mergeMeshes([a]);
    const f = merged.faces[0];
    expect(f.color).toBe(9);
    expect(f.doubleSided).toBe(true);
    expect(f.textured).toBe(true);
    expect(f.uv).toHaveLength(f.vertices.length);
  });

  it('mergeMeshes with no meshes throws', () => {
    expect(() => mergeMeshes([])).toThrow();
  });

  it('mergeMeshes keeps source meshes unmutated', () => {
    const a = cubeMesh();
    const snapshot = JSON.stringify(a);
    mergeMeshes([a, cloneMesh(a)]);
    expect(JSON.stringify(a)).toBe(snapshot);
  });
});

// ── uv editing ─────────────────────────────────────────────────

describe('transformUV', () => {
  function uvMesh(): Mesh {
    return makeMesh({
      vertices: [
        { id: 'a', position: [0, 0, 0] },
        { id: 'b', position: [1, 0, 0] },
        { id: 'c', position: [1, 1, 0] },
      ],
      faces: [simpleFace([{ id: 'a' }, { id: 'b' }, { id: 'c' }], [[10, 10], [20, 10], [20, 20]])],
    });
  }

  it('offsets uvs', () => {
    const m = uvMesh();
    transformUV(m, [m.faces[0].id], { offset: [5, -3] });
    expect(m.faces[0].uv[0]).toEqual([15, 7]);
  });

  it('rotates around the centroid', () => {
    const m = uvMesh();
    const fid = m.faces[0].id;
    transformUV(m, [fid], { rotation: Math.PI / 2 });
    const c = m.faces[0].uv.reduce((a, b) => [a[0] + b[0], a[1] + b[1]], [0, 0]).map((n) => n / 3);
    expect(c[0]).toBeCloseTo(50 / 3, 6);
    expect(c[1]).toBeCloseTo(40 / 3, 6);
    const all = m.faces[0].uv.map((u) => u.join(','));
    expect(m.faces[0].uv[0][0]).toBeCloseTo(20,6);
    expect(m.faces[0].uv[0][1]).toBeCloseTo(20/3,6);
  });

  it('flips x around centroid', () => {
    const m = uvMesh();
    const fid = m.faces[0].id;
    transformUV(m, [fid], { flipX: true });
    const xs = m.faces[0].uv.map((u) => u[0]).sort((a, b) => a - b);
    expect(xs[0]).toBeCloseTo(40/3,6);
    expect(xs[2]).toBeCloseTo(70/3,6);
  });

  it('scales around centroid', () => {
    const m = uvMesh();
    const fid = m.faces[0].id;
    transformUV(m, [fid], { scale: [2, 2] });
    const c = m.faces[0].uv.reduce((a, b) => [a[0] + b[0], a[1] + b[1]], [0, 0]).map((n) => n / 3);
    expect(c[0]).toBeCloseTo(50 / 3, 6);
  });

  it('rejects empty edits', () => {
    const m = uvMesh();
    expect(() => transformUV(m, [m.faces[0].id], {})).toThrow(/at least one/i);
  });

  it('rejects nonfinite uvs', () => {
    const m = uvMesh();
    expect(() => transformUV(m, [m.faces[0].id], { offset: [Infinity, 0] })).toThrow();
  });

  it('rejects unknown face id clearly', () => {
    const m = uvMesh();
    expect(() => transformUV(m, ['ghost'], { offset: [1, 1] })).toThrow(/no face/i);
  });

  it('locked mesh rejects uv edits', () => {
    const m = uvMesh();
    m.locked = true;
    expect(() => transformUV(m, [m.faces[0].id], { offset: [1, 1] })).toThrow(/locked/i);
  });

  it('uv corners stay aligned to corners after merge rewiring', () => {
    const m = makeMesh({
      vertices: [
        { id: 'a', position: [0, 0, 0] },
        { id: 'b', position: [1, 0, 0] },
        { id: 'c', position: [2, 0, 0] },
        { id: 'd', position: [1, 1, 0] },
      ],
      faces: [simpleFace([{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }], [[1, 1], [2, 2], [3, 3], [4, 4]])],
    });
    mergeVertices(m, ['a', 'b']);
    const f = m.faces[0];
    const aIdx = f.vertices.indexOf('a');
    expect(f.uv[aIdx]).toEqual([1, 1]);
  });
});

// ── raster / texture ───────────────────────────────────────────

describe('raster tools', () => {
  function tex() {
    return createProject().texture;
  }

  it('pen paints pixels including interpolated stroke', () => {
    const t = tex();
    paint(t, 'pen', [0, 0], [10, 0], 9);
    for (let x = 0; x <= 10; x++) expect(t.pixels[x]).toBe(9);
  });

  it('pen stroke never writes out of bounds', () => {
    const t = tex();
    paint(t, 'pen', [-5, 0], [200, 0], 9);
    expect(t.pixels.every((v) => Number.isInteger(v) && v >= 0 && v <= 15)).toBe(true);
  });

  it('eraser paints the transparent index', () => {
    const t = tex();
    paint(t, 'pen', [0, 0], [3, 3], 9);
    paint(t, 'eraser', [0, 0], [0, 0], 9);
    expect(t.pixels[0]).toBe(t.transparent);
  });

  it('line is rasterized between endpoints', () => {
    const t = tex();
    paint(t, 'line', [2, 2], [2, 8], 12);
    for (let y = 2; y <= 8; y++) expect(t.pixels[y * 128 + 2]).toBe(12);
    expect(t.pixels[2 * 128 + 3]).not.toBe(12);
  });

  it('rectangle outline vs filled', () => {
    const t = tex();
    paint(t, 'rectangle', [1, 1], [4, 4], 8, false);
    expect(t.pixels[1 * 128 + 1]).toBe(8);
    expect(t.pixels[2 * 128 + 2]).not.toBe(8);
    paint(t, 'rectangle', [1, 1], [4, 4], 8, true);
    expect(t.pixels[2 * 128 + 2]).toBe(8);
  });

  it('ellipse filled covers center', () => {
    const t = tex();
    paint(t, 'ellipse', [10, 10], [30, 20], 5, true);
    expect(t.pixels[15 * 128 + 20]).toBe(5);
  });

  it('paint rejects out-of-range color', () => {
    const t = tex();
    expect(() => paint(t, 'pen', [0, 0], [0, 0], 16)).toThrow(/palette index/i);
    expect(() => paint(t, 'pen', [0, 0], [0, 0], -1)).toThrow(/palette index/i);
  });

  it('paint rejects nonfinite coordinates', () => {
    const t = tex();
    expect(() => paint(t, 'pen', [NaN, 0], [1, 1], 3)).toThrow();
  });

  it('floodFill is four-connected and bounded', () => {
    const t = tex();
    paint(t, 'rectangle', [10, 0], [10, 60], 4, true);
    floodFill(t, 0, 0, 7);
    expect(t.pixels[5 * 128 + 5]).toBe(7);
    expect(t.pixels[5 * 128 + 11]).not.toBe(7);
    expect(t.pixels[5 * 128 + 10]).toBe(4);
    expect(t.pixels[100 * 128 + 50]).not.toBe(7);
  });

  it('floodFill with same color is a no-op', () => {
    const t = tex();
    const before = [...t.pixels];
    floodFill(t, 0, 0, t.pixels[0]);
    expect(t.pixels).toEqual(before);
  });

  it('floodFill outside bounds fills nothing', () => {
    const t = tex();
    const before = [...t.pixels];
    floodFill(t, -1, 0, 7);
    floodFill(t, 0, 128, 7);
    expect(t.pixels).toEqual(before);
  });

  it('textureRGBA resolves palette and transparent alpha', () => {
    const t = tex();
    t.pixels[0] = t.transparent;
    t.pixels[1] = 3;
    const rgba = textureRGBA(t);
    expect(rgba).toHaveLength(128 * 128 * 4);
    expect(rgba[3]).toBe(0);
    expect(rgba[7]).toBe(255);
    const rgb = t.palette[3].match(/[0-9a-f]{2}/gi)!.map((h) => parseInt(h, 16));
    expect([rgba[4], rgba[5], rgba[6]]).toEqual(rgb);
  });

  it('quantizeRGBA maps colors to nearest palette entry deterministically', () => {
    const t = tex();
    t.palette[8]='#ff0000'; t.palette[11]='#00ff00'; t.palette[7]='#fafaf5';
    const w = 2, h = 2;
    const rgba = new Uint8Array(w * h * 4);
    rgba.set([255, 0, 0, 255], 0);
    rgba.set([0, 255, 0, 255], 4);
    rgba.set([250, 250, 245, 255], 8);
    rgba.set([0, 0, 0, 30], 12);
    quantizeRGBA(rgba, w, h, t);
    expect(t.pixels).toHaveLength(128*128);
    expect(t.pixels[0]).toBe(8);
    expect(t.pixels[127]).toBe(11);
    expect(t.pixels[127*128]).toBe(7);
    expect(t.pixels[16383]).toBe(t.transparent);
  });

  it('quantizeRGBA rejects size mismatch', () => {
    const t = tex();
    expect(() => quantizeRGBA(new Uint8Array(3), 2, 2, t)).toThrow(/RGBA bytes/i);
  });

  it('swapPalette trades index identities and preserves visuals', () => {
    const t = tex();
    t.pixels.fill(2);
    const beforeRGBA = textureRGBA(t);
    swapPalette(t, 2, 5);
    expect(t.pixels.every((p) => p === 5)).toBe(true);
    expect(textureRGBA(t)).toEqual(beforeRGBA);
    expect(t.palette[2]).toBe(PALETTE_16[5]);
    expect(t.palette[5]).toBe(PALETTE_16[2]);
  });

  it('swapPalette rejects out-of-range indices', () => {
    const t = tex();
    expect(() => swapPalette(t, 0, 16)).toThrow(/0…15/i);
  });

  it('generateRamps produces 16 deterministic ramps', () => {
    const t = tex();
    generateRamps(t);
    expect(t.shadeRamps).toHaveLength(16);
    for (let i = 0; i < 16; i++) {
      const ramp = t.shadeRamps[i];
      expect(ramp).toHaveLength(3);
      expect(ramp.every((j) => j >= 0 && j <= 15)).toBe(true);
      expect(ramp[1]).toBe(i);
    }
    const t2 = tex();
    generateRamps(t2);
    expect(t2.shadeRamps).toEqual(t.shadeRamps);
  });

  it('marqueeCopy/paste round-trip a region', () => {
    const t = tex();
    paint(t, 'rectangle', [5, 5], [9, 9], 6, true);
    const region = marqueeCopy(t, 4, 4, 8, 8);
    expect(region.width).toBe(8);
    expect(region.height).toBe(8);
    expect(region.pixels).toHaveLength(64);
    const t2 = tex();
    marqueePaste(t2, region, 20, 30);
    expect(t2.pixels[31 * 128 + 21]).toBe(6);
    expect(t2.pixels[30 * 128 + 20]).not.toBe(6);
  });

  it('marqueeCopy clips to texture bounds', () => {
    const t = tex();
    const region = marqueeCopy(t, 120, 120, 100, 100);
    expect(region.width).toBe(8);
    expect(region.height).toBe(8);
  });

  it('marqueePaste rejects malformed data', () => {
    const t = tex();
    expect(() => marqueePaste(t, { width: 2, height: 2, pixels: [0, 0, 0] }, 0, 0)).toThrow(/width\*height/i);
    expect(() => marqueePaste(t, { width: 1, height: 1, pixels: [99] }, 0, 0)).toThrow(/palette index/i);
  });
});

// ── clips and animation ────────────────────────────────────────

describe('clips and evaluation', () => {
  function meshWithClip(clipOverrides: Partial<Clip>): { mesh: Mesh; animation: Animation } {
    const mesh = makeMesh();
    const clip: Clip = {
      id: 'c1', meshId: mesh.id, track: 0, type: 'movement', axis: 'y',
      start: 0, duration: 2, amount: 4, curve: 'linear', pingPong: false,
      frequency: 1, property: 'movement',
      ...clipOverrides,
    };
    return { mesh, animation: { duration: 4, fps: 12, clips: [clip] } };
  }

  it('createClip defaults and validates track', () => {
    const mesh = makeMesh();
    const c = createClip(mesh.id, 'movement');
    expect(c.meshId).toBe(mesh.id);
    expect(c.track).toBe(0);
    expect(c.duration).toBeGreaterThan(0);
    expect(c.start).toBe(0);
    expect(() => createClip(mesh.id, 'movement', 4)).toThrow(/track/i);
    expect(() => createClip(mesh.id, 'movement', -1)).toThrow(/track/i);
    expect(() => createClip('', 'movement')).toThrow(/mesh id/i);
  });

  it('movement adds before base transform', () => {
    const { mesh, animation } = meshWithClip({});
    expect(evaluateMesh(mesh, animation, 0).position).toEqual([0, 0, 0]);
    expect(evaluateMesh(mesh, animation, 1).position).toEqual([0, 2, 0]);
    expect(evaluateMesh(mesh, animation, 2).position).toEqual([0, 4, 0]);
  });

  it('movement clamps after end and contributes zero before start', () => {
    const { mesh, animation } = meshWithClip({});
    expect(evaluateMesh(mesh, animation, 3).position).toEqual([0, 4, 0]);
    const later = meshWithClip({ start: 1 });
    expect(evaluateMesh(later.mesh, later.animation, 0.5).position).toEqual([0, 0, 0]);
  });

  it('rotation adds radians', () => {
    const { mesh, animation } = meshWithClip({ type: 'rotation', axis: 'z', amount: Math.PI });
    expect(evaluateMesh(mesh, animation, 1).rotation[2]).toBeCloseTo(Math.PI / 2, 6);
  });

  it('scale multiplies from 1 to amount', () => {
    const { mesh, animation } = meshWithClip({ type: 'scale', amount: 3 });
    expect(evaluateMesh(mesh, animation, 0).scale).toEqual([1, 1, 1]);
    expect(evaluateMesh(mesh, animation, 1).scale[1]).toBeCloseTo(2, 6);
    expect(evaluateMesh(mesh, animation, 2).scale[1]).toBeCloseTo(3, 6);
    expect(evaluateMesh(mesh, animation, 5).scale[1]).toBeCloseTo(3, 6);
  });

  it('scale before start contributes factor 1', () => {
    const { mesh, animation } = meshWithClip({ type: 'scale', amount: 3, start: 1 });
    expect(evaluateMesh(mesh, animation, 0.5).scale).toEqual([1, 1, 1]);
  });

  it('pingPong uses triangular progress', () => {
    const { mesh, animation } = meshWithClip({ pingPong: true });
    expect(evaluateMesh(mesh, animation, 0.5).position[1]).toBeCloseTo(2, 6);
    expect(evaluateMesh(mesh, animation, 1).position[1]).toBeCloseTo(4, 6);
    expect(evaluateMesh(mesh, animation, 1.5).position[1]).toBeCloseTo(2, 6);
    expect(evaluateMesh(mesh, animation, 2).position[1]).toBeCloseTo(0, 6);
  });

  it('easing curves bend progress', () => {
    const { mesh, animation } = meshWithClip({ curve: 'easeIn' });
    expect(evaluateMesh(mesh, animation, 1).position[1]).toBeCloseTo(1, 6);
    const b = meshWithClip({ curve: 'easeOut' });
    expect(evaluateMesh(b.mesh, b.animation, 1).position[1]).toBeCloseTo(3, 6);
  });

  it('visibility hides only during its interval', () => {
    const { mesh, animation } = meshWithClip({ type: 'visibility', start: 1, duration: 2 });
    expect(evaluateMesh(mesh, animation, 0).visible).toBe(true);
    expect(evaluateMesh(mesh, animation, 1.5).visible).toBe(false);
    expect(evaluateMesh(mesh, animation, 3.5).visible).toBe(true);
  });

  it('oscillation contributes only within its interval', () => {
    const { mesh, animation } = meshWithClip({ type: 'oscillation', frequency: 2, amount: 1, duration: 2 });
    expect(evaluateMesh(mesh, animation, -0.1).position[1]).toBe(0);
    expect(evaluateMesh(mesh, animation, 2.5).position[1]).toBe(0);
    const inside = evaluateMesh(mesh, animation, 0.25).position[1];
    expect(inside).toBeCloseTo(Math.sin(2 * Math.PI * 2 * 0.25), 6);
  });

  it('oscillation property selects movement/rotation/scale', () => {
    const { mesh, animation } = meshWithClip({ type: 'oscillation', property: 'rotation', frequency: 0.25, amount: 2 });
    const p = evaluateMesh(mesh, animation, 1);
    expect(p.rotation[1]).toBeCloseTo(Math.sin(2 * Math.PI * 0.25 * 1) * 2, 6);
  });

  it('same time always yields same pose (determinism)', () => {
    const { mesh, animation } = meshWithClip({ type: 'oscillation', frequency: 3 });
    expect(evaluateMesh(mesh, animation, 1.234)).toEqual(evaluateMesh(mesh, animation, 1.234));
  });

  it('evaluation never mutates input', () => {
    const { mesh, animation } = meshWithClip({});
    const snapshot = JSON.stringify({ mesh, animation });
    evaluateMesh(mesh, animation, 1);
    expect(JSON.stringify({ mesh, animation })).toBe(snapshot);
  });

  it('clips sort by track, start, then id', () => {
    const mesh = makeMesh();
    const later: Clip = { id: 'b', meshId: mesh.id, track: 0, type: 'movement', axis: 'x', start: 0, duration: 4, amount: 10, curve: 'linear', pingPong: false, frequency: 1, property: 'movement' };
    const earlier: Clip = { id: 'a', meshId: mesh.id, track: 0, type: 'movement', axis: 'y', start: 0, duration: 4, amount: 1, curve: 'linear', pingPong: false, frequency: 1, property: 'movement' };
    const animation: Animation = { duration: 4, fps: 12, clips: [later, earlier] };
    const p = evaluateMesh(mesh, animation, 2);
    expect(p.position[0]).toBeCloseTo(5, 6);
    expect(p.position[1]).toBeCloseTo(0.5, 6);
  });

  it('clips on other meshes are ignored', () => {
    const mesh = makeMesh();
    const other = makeMesh();
    const animation: Animation = {
      duration: 4, fps: 12,
      clips: [{ id: 'c', meshId: other.id, track: 0, type: 'movement', axis: 'x', start: 0, duration: 4, amount: 99, curve: 'linear', pingPong: false, frequency: 1, property: 'movement' }],
    };
    expect(evaluateMesh(mesh, animation, 2).position).toEqual([0, 0, 0]);
  });

  it('rejects nonfinite evaluation time', () => {
    const { mesh, animation } = meshWithClip({});
    expect(() => evaluateMesh(mesh, animation, NaN)).toThrow(/finite/i);
  });
});

// ── serialization ──────────────────────────────────────────────

describe('serialize/parse', () => {
  it('round-trips a valid project exactly', () => {
    const p = createProject();
    p.meshes.push(cubeMesh());
    p.meshes[0].position = [1, 2, 3];
    p.meshes[0].rotation = [0.1, 0.2, 0.3];
    p.meshes[0].scale = [1.5, 1, 1];
    p.meshes[0].pivot = [0.5, 0.5, 0.5];
    p.meshes[0].faces[0].color = 4;
    p.meshes[0].faces[0].uv = [[3, 4], [5, 6], [7, 8], [9, 10]];
    p.animation.clips.push(createClip(p.meshes[0].id, 'movement'));
    const text = serializeProject(p);
    const q = parseProject(text);
    expect(q).toEqual(p);
  });

  it('preserves transforms, faces, uvs, palette and clips exactly', () => {
    const p = createProject();
    p.meshes.push(cubeMesh());
    p.texture.palette[3] = '#123456';
    p.animation.clips.push({ ...createClip(p.meshes[0].id, 'rotation'), start: 1.5, duration: 2.5, amount: 0.75, curve: 'easeIn', pingPong: true, frequency: 2.5, property: 'rotation' });
    const q = parseProject(serializeProject(p));
    expect(q.texture.palette[3]).toBe('#123456');
    expect(q.animation.clips[0]).toEqual(p.animation.clips[0]);
    expect(q.meshes[0].faces).toEqual(p.meshes[0].faces);
  });

  it('rejects unknown format', () => {
    const p = createProject();
    const bad = JSON.parse(serializeProject(p));
    bad.format = 'other';
    expect(() => parseProject(JSON.stringify(bad))).toThrow(/format/i);
  });

  it('rejects unknown version', () => {
    const p = createProject();
    const bad = JSON.parse(serializeProject(p));
    bad.version = 99;
    expect(() => parseProject(JSON.stringify(bad))).toThrow(/version/i);
  });

  it('rejects invalid JSON', () => {
    expect(() => parseProject('{not json')).toThrow(/JSON/i);
  });

  it('rejects dangling face references', () => {
    const p = createProject();
    p.meshes.push(cubeMesh());
    const bad = JSON.parse(serializeProject(p));
    bad.meshes[0].faces[0].vertices[0] = 'ghost';
    expect(() => parseProject(JSON.stringify(bad))).toThrow(/dangling|outside/i);
  });

  it('rejects nonfinite numbers', () => {
    const p = createProject();
    p.meshes.push(cubeMesh());
    const bad = JSON.parse(serializeProject(p));
    bad.meshes[0].position = [NaN, 0, 0];
    expect(() => parseProject(JSON.stringify(bad))).toThrow(/finite/);
  });

  it('rejects wrong uv corner counts', () => {
    const p = createProject();
    p.meshes.push(cubeMesh());
    const bad = JSON.parse(serializeProject(p));
    bad.meshes[0].faces[0].uv = [[0, 0]];
    expect(() => parseProject(JSON.stringify(bad))).toThrow(/one uv per corner/i);
  });

  it('rejects wrong texture size and pixel counts', () => {
    const p = createProject();
    const bad = JSON.parse(serializeProject(p));
    bad.texture.width = 64;
    expect(() => parseProject(JSON.stringify(bad))).toThrow(/128/);
    const bad2 = JSON.parse(serializeProject(p));
    bad2.texture.pixels = [];
    expect(() => parseProject(JSON.stringify(bad2))).toThrow(/16,384/);
  });

  it('rejects out-of-range palette indices in pixels', () => {
    const p = createProject();
    const bad = JSON.parse(serializeProject(p));
    bad.texture.pixels[0] = 42;
    expect(() => parseProject(JSON.stringify(bad))).toThrow(/0…15/i);
  });

  it('rejects invalid clip track and duration', () => {
    const p = createProject();
    p.meshes.push(cubeMesh());
    p.animation.clips.push(createClip(p.meshes[0].id, 'movement'));
    const bad = JSON.parse(serializeProject(p));
    bad.animation.clips[0].track = 7;
    expect(() => parseProject(JSON.stringify(bad))).toThrow(/track/i);
    const bad2 = JSON.parse(serializeProject(p));
    bad2.animation.clips[0].duration = 0;
    expect(() => parseProject(JSON.stringify(bad2))).toThrow(/duration/i);
  });

  it('rejects clips referencing unknown meshes', () => {
    const p = createProject();
    p.animation.clips.push(createClip('ghost-mesh', 'movement'));
    expect(() => parseProject(JSON.stringify(p))).toThrow(/unknown mesh/i);
  });

  it('rejects __proto__ keys', () => {
    const p = createProject();
    const text = JSON.stringify(p).replace('"name":"Untitled"', '"name":"Untitled","__proto__":{"x":1}');
    expect(() => parseProject(text)).toThrow(/forbidden|__proto__/i);
  });

  it('rejects oversized project payloads', () => {
    const huge = ' '.repeat(8 * 1024 * 1024 + 1);
    expect(() => parseProject(huge)).toThrow(/limit/i);
  });

  it('rejects duplicate ids', () => {
    const p = createProject();
    p.meshes.push(cubeMesh(), cloneMesh(cubeMesh()));
    const bad = JSON.parse(serializeProject(p));
    bad.meshes[1].id = bad.meshes[0].id;
    expect(() => parseProject(JSON.stringify(bad))).toThrow(/duplicate/i);
  });
});

// ── history ────────────────────────────────────────────────────

describe('history', () => {
  it('commit applies mutation atomically and supports undo/redo', () => {
    const p = createProject();
    const h = new History(p);
    expect(h.canUndo).toBe(false);
    const committed = h.commit('add mesh', (draft) => {
      draft.meshes.push(cubeMesh());
    });
    expect(committed).toBe(h.current);
    expect(h.current.meshes).toHaveLength(1);
    expect(h.canUndo).toBe(true);
    const undone = h.undo();
    expect(undone.meshes).toHaveLength(0);
    expect(h.canRedo).toBe(true);
    expect(h.redo().meshes).toHaveLength(1);
  });

  it('failed mutation leaves document and history untouched', () => {
    const p = createProject();
    const h = new History(p);
    expect(() =>
      h.commit('bad edit', (draft) => {
        draft.meshes.push(cubeMesh());
        (draft.meshes[0] as unknown as { faces: unknown[] }).faces = [{ broken: true }];
      }),
    ).toThrow();
    expect(h.current.meshes).toHaveLength(0);
    expect(h.canUndo).toBe(false);
  });

  it('failed mutation does not corrupt via partial edits', () => {
    const p = createProject();
    const h = new History(p);
    h.commit('add', (draft) => { draft.meshes.push(cubeMesh()); });
    expect(() =>
      h.commit('throwing', () => {
        throw new Error('user cancel');
      }),
    ).toThrow('user cancel');
    expect(h.current.meshes).toHaveLength(1);
    expect(h.undoLabel).toBe('add');
  });

  it('undo label matches the committed action', () => {
    const p = createProject();
    const h = new History(p);
    h.commit('translate vertices', () => {});
    expect(h.undoLabel).toBe('translate vertices');
    h.undo();
    expect(h.redoLabel).toBe('translate vertices');
  });

  it('new commit after undo discards redo state', () => {
    const p = createProject();
    const h = new History(p);
    h.commit('a', () => {});
    h.commit('b', () => {});
    h.undo();
    h.commit('c', () => {});
    expect(h.canRedo).toBe(false);
  });

  it('history limit bounds stored snapshots', () => {
    const p = createProject();
    const h = new History(p, 3);
    for (let i = 0; i < 10; i++) h.commit(`step ${i}`, () => {});
    let count = 0;
    while (h.canUndo) { h.undo(); count++; }
    expect(count).toBe(3);
  });

  it('history rejects nonpositive limit', () => {
    expect(() => new History(createProject(), 0)).toThrow(/limit/i);
  });

  it('reset replaces document and clears history', () => {
    const p = createProject();
    const h = new History(p);
    h.commit('a', (d) => { d.meshes.push(cubeMesh()); });
    h.reset(createProject('Fresh'));
    expect(h.current.name).toBe('Fresh');
    expect(h.canUndo).toBe(false);
    expect(h.canRedo).toBe(false);
  });

  it('undo throws when nothing to undo', () => {
    const h = new History(createProject());
    expect(() => h.undo()).toThrow(/nothing to undo/i);
    expect(() => h.redo()).toThrow(/nothing to redo/i);
  });

  it('texture snapshots are plain serializable arrays', () => {
    const p = createProject();
    const h = new History(p);
    h.commit('paint', (d) => { d.texture.pixels[0] = 9; });
    expect(JSON.parse(JSON.stringify(h.current.texture.pixels))[0]).toBe(9);
    h.undo();
    expect(h.current.texture.pixels[0]).not.toBe(9);
  });

  it('commit works on a draft clone: original project untouched', () => {
    const p = createProject();
    p.meshes.push(cubeMesh());
    const h = new History(p);
    h.commit('drag', (d) => {
      translateVertices(d.meshes[0], [d.meshes[0].vertices[0].id], [1, 0, 0]);
    });
    expect(p.meshes[0].vertices[0].position).toEqual([0.5, -0.5, -0.5]);
  });
});

// ── error types ────────────────────────────────────────────────

describe('error types', () => {
  it('validation failures throw ValidationError with message', () => {
    const p = createProject();
    const bad = JSON.parse(serializeProject(p));
    bad.version = 2;
    try {
      parseProject(JSON.stringify(bad));
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationError);
      expect((e as Error).message).toMatch(/version/i);
    }
  });
});

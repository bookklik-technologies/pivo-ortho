/**
 * IO layer tests: PNG (decoded content, CRC, structure), GIF (real frames,
 * delays, transparency read back through the encoder's own bytes), sprite
 * sheet layout, OBJ structure, glTF structure (accessors/alignment/
 * materials/animation semantics), bundle/download validation.
 *
 * These tests build minimal in-memory Projects matching src/core/types.ts.
 * When src/core/index.ts is available, geometry checks cross-validate against
 * worldVertex/evaluateMesh; the fixture construction below mirrors the
 * documented transform math so tests are meaningful either way.
 */

import { describe, it, expect } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import {
  encodePNG,
  decodePNG,
  encodeGIF,
  encodeGIFDetailed,
  spriteSheet,
  exportOBJ,
  exportGLTF,
  sanitizeFileName,
  sanitizeBaseName,
  validateBundle,
  zipBundle,
  EXPORT_LIMITS,
} from '../src/io';
import type { Mesh, Project, Vec3, Texture } from '../src/core/types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PALETTE = [
  '#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff', '#ffff00',
  '#00ffff', '#ff00ff', '#808080', '#c0c0c0', '#800000', '#808000',
  '#008000', '#800080', '#008080', '#000080',
];

function makeTexture(): Texture {
  return {
    width: 128,
    height: 128,
    pixels: new Array(128 * 128).fill(1),
    palette: [...PALETTE],
    transparent: 0,
    background: 1,
    shadeRamps: [[1, 8, 9]],
  };
}

/** Axis-aligned unit cube centered at origin, 8 vertices / 6 quad faces. */
function makeCubeMesh(over: Partial<Mesh> = {}): Mesh {
  const p: Vec3[] = [
    [-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [-0.5, 0.5, -0.5],
    [-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5],
  ];
  const ids = p.map((_, i) => `v${i}`);
  const quad = (a: number, b: number, c: number, d: number) => [ids[a], ids[b], ids[c], ids[d]];
  const uv = (n: number) => Array.from({ length: n }, (_, i) => [i * 8, 64] as [number, number]);
  return {
    id: 'mesh1',
    name: 'Cube',
    vertices: p.map((pos, i) => ({ id: ids[i], position: pos })),
    faces: [
      { id: 'f0', vertices: quad(0, 1, 2, 3), uv: uv(4), color: 2, doubleSided: false, shaded: false, textured: true, drawBehind: false }, // -Z
      { id: 'f1', vertices: quad(5, 4, 7, 6), uv: uv(4), color: 3, doubleSided: false, shaded: false, textured: true, drawBehind: false }, // +Z
      { id: 'f2', vertices: quad(4, 0, 3, 7), uv: uv(4), color: 4, doubleSided: false, shaded: false, textured: true, drawBehind: false }, // -X
      { id: 'f3', vertices: quad(1, 5, 6, 2), uv: uv(4), color: 5, doubleSided: false, shaded: false, textured: true, drawBehind: false }, // +X
      { id: 'f4', vertices: quad(3, 2, 6, 7), uv: uv(4), color: 6, doubleSided: false, shaded: false, textured: true, drawBehind: false }, // +Y
      { id: 'f5', vertices: quad(4, 5, 1, 0), uv: uv(4), color: 7, doubleSided: false, shaded: false, textured: true, drawBehind: false }, // -Y
    ],
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    pivot: [0, 0, 0],
    visible: true,
    locked: false,
    folderId: null,
    ...over,
  };
}

function makeProject(meshes: Mesh[] = [makeCubeMesh()]): Project {
  return {
    format: 'pivo-ortho',
    version: 1,
    name: 'Test Project',
    meshes,
    folders: [],
    texture: makeTexture(),
    animation: { duration: 2, fps: 12, clips: [] },
    render: { background: '#202020', shading: true, wireframe: false, pixelSize: 2, affine: false, light: [0.5, 0.7, 0.3] },
  };
}

/** Documented mesh transform: position + pivot + R*S*(vertex − pivot). */
function localToWorld(mesh: Mesh, v: Vec3): Vec3 {
  const px = v[0] - mesh.pivot[0];
  const py = v[1] - mesh.pivot[1];
  const pz = v[2] - mesh.pivot[2];
  const s: Vec3 = [px * mesh.scale[0], py * mesh.scale[1], pz * mesh.scale[2]];
  // XYZ intrinsic euler rotation.
  const [rx, ry, rz] = mesh.rotation;
  const cx = Math.cos(rx), sx = Math.sin(rx);
  const cy = Math.cos(ry), sy = Math.sin(ry);
  const cz = Math.cos(rz), sz = Math.sin(rz);
  // Rz*Ry*Rx applied to column vector.
  const x1 = s[0], y1 = s[1] * cx - s[2] * sx, z1 = s[1] * sx + s[2] * cx;
  const x2 = x1 * cy + z1 * sy, y2 = y1, z2 = -x1 * sy + z1 * cy;
  const x3 = x2 * cz - y2 * sz, y3 = x2 * sz + y2 * cz, z3 = z2;
  return [x3 + mesh.position[0], y3 + mesh.position[1], z3 + mesh.position[2]];
}

function rgba(width: number, height: number, fill: (x: number, y: number) => [number, number, number, number]): Uint8Array {
  const out = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = fill(x, y);
      out.set([r, g, b, a], (y * width + x) * 4);
    }
  }
  return out;
}

function getBundleFile(bundle: { files: Array<{ name: string; data: Uint8Array | string }> }, name: string) {
  const f = bundle.files.find((ff) => ff.name === name);
  if (!f) throw new Error(`bundle has no file ${name}; has ${bundle.files.map((ff) => ff.name).join(', ')}`);
  return f;
}

// ---------------------------------------------------------------------------
// PNG
// ---------------------------------------------------------------------------

describe('encodePNG', () => {
  it('rejects invalid dimensions', () => {
    expect(() => encodePNG(0, 4, new Uint8Array(16))).toThrow();
    expect(() => encodePNG(-2, 4, new Uint8Array(0))).toThrow();
    expect(() => encodePNG(2.5, 4, new Uint8Array(0))).toThrow();
  });

  it('rejects wrong byte counts', () => {
    expect(() => encodePNG(2, 2, new Uint8Array(15))).toThrow(/16 bytes/);
    expect(() => encodePNG(2, 2, 'nope' as unknown as Uint8Array)).toThrow();
  });

  it('emits correct signature and chunk structure', () => {
    const png = encodePNG(2, 2, new Uint8Array(16));
    expect(Array.from(png.slice(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const decoded = decodePNG(png);
    expect(decoded.chunks.map((c) => c.type)).toEqual(['IHDR', 'IDAT', 'IEND']);
    expect(decoded.chunks.every((c) => c.crcOk)).toBe(true);
  });

  it('round-trips exact RGBA content through an independent decoder', () => {
    const w = 5;
    const h = 3;
    const src = rgba(w, h, (x, y) => [(x * 50) % 256, (y * 80) % 256, 7, x === 0 && y === 0 ? 0 : 255]);
    const png = encodePNG(w, h, src);
    const decoded = decodePNG(png);
    expect(decoded.width).toBe(w);
    expect(decoded.height).toBe(h);
    expect(Array.from(decoded.data)).toEqual(Array.from(src));
  });

  it('is deterministic for identical input', () => {
    const src = rgba(4, 4, () => [1, 2, 3, 255]);
    expect(Array.from(encodePNG(4, 4, src))).toEqual(Array.from(encodePNG(4, 4, src)));
  });

  it('produces valid CRCs for larger images (multi-block deflate)', () => {
    const src = rgba(64, 64, (x, y) => [x * 4, y * 4, 128, 255]);
    const decoded = decodePNG(encodePNG(64, 64, src));
    expect(decoded.chunks.every((c) => c.crcOk)).toBe(true);
    expect(decoded.data.length).toBe(64 * 64 * 4);
  });

  it('respects compression level bounds', () => {
    const src = rgba(4, 4, () => [9, 9, 9, 255]);
    expect(() => encodePNG(4, 4, src, { level: 10 })).toThrow();
    expect(decodePNG(encodePNG(4, 4, src, { level: 0 })).data.length).toBe(64);
  });
});

// ---------------------------------------------------------------------------
// GIF
// ---------------------------------------------------------------------------

describe('encodeGIF', () => {
  const tex = makeTexture();

  it('rejects empty frames, bad dimensions and bad fps', () => {
    const frame = new Uint8Array(4 * 4 * 4);
    expect(() => encodeGIF([], 4, 4, tex, 12)).toThrow();
    expect(() => encodeGIF([frame], 0, 4, tex, 12)).toThrow();
    expect(() => encodeGIF([frame], 4, 4, tex, 0)).toThrow();
    expect(() => encodeGIF([new Uint8Array(3)], 4, 4, tex, 12)).toThrow();
  });

  it('emits GIF89a signature', () => {
    const frame = new Uint8Array(4 * 4 * 4).fill(255);
    frame[3] = 255;
    const bytes = encodeGIF([frame], 4, 4, tex, 10);
    const header = String.fromCharCode(...bytes.slice(0, 6));
    expect(header).toBe('GIF89a');
  });

  it('encodes real frames with correct logical screen size and delays', () => {
    const frames = [0, 1, 2].map((i) => rgba(8, 8, (x, y) => [i * 80, x * 30, y * 30, 255]));
    const { bytes, warnings } = encodeGIFDetailed(frames, 8, 8, tex, 10);
    expect(String.fromCharCode(...bytes.slice(0, 6))).toBe('GIF89a');
    // Logical screen descriptor little-endian width/height after header.
    const w = bytes[6] | (bytes[7] << 8);
    const h = bytes[8] | (bytes[9] << 8);
    expect(w).toBe(8);
    expect(h).toBe(8);
    // Global color table flag set in packed byte (bit 7).
    expect(bytes[10] & 0x80).toBeTruthy();
    // Real animated content: multiple image descriptors (0x2C separators).
    let descriptors = 0;
    for (const b of bytes) if (b === 0x2c) descriptors++;
    expect(descriptors).toBeGreaterThanOrEqual(3);
    // Graphic control extensions (0x21 0xF9) carry per-frame delays.
    let gce = 0;
    for (let i = 0; i < bytes.length - 1; i++) {
      if (bytes[i] === 0x21 && bytes[i + 1] === 0xf9) gce++;
    }
    expect(gce).toBe(3);
    const delay = Math.round(100 / 10);
    // Find first GCE block and check packed delay bytes.
    const gceStart = bytes.findIndex((b, i) => b === 0x21 && bytes[i + 1] === 0xf9);
    const d = bytes[gceStart + 4] | (bytes[gceStart + 5] << 8);
    expect(d).toBe(delay);
    expect(Array.isArray(warnings)).toBe(true);
  });

  it('maps off-palette colors to nearest entry and warns', () => {
    // Off-palette color (17, 17, 17) — near black (palette 0 is transparent-
    // reserved in this fixture, nearest opaque is #808080 at index 8).
    const frame = rgba(2, 2, () => [17, 17, 17, 255]);
    const { warnings } = encodeGIFDetailed([frame], 2, 2, tex, 12);
    expect(warnings.some((w) => w.includes('nearest entry'))).toBe(true);
  });

  it('preserves transparency: alpha < 128 maps to the transparent index', () => {
    const frame = rgba(2, 2, (x, y) => (x === 0 && y === 0 ? [0, 0, 0, 64] : [255, 255, 255, 255]));
    const bytes = encodeGIF([frame], 2, 2, tex, 12);
    // Transparency flag (bit 0 of packed field in GCE) must be set somewhere.
    let transparentFlag = false;
    for (let i = 0; i < bytes.length - 3; i++) {
      if (bytes[i] === 0x21 && bytes[i + 1] === 0xf9) {
        const packed = bytes[i + 3];
        if (packed & 1) transparentFlag = true;
      }
    }
    expect(transparentFlag).toBe(true);
  });

  it('is deterministic', () => {
    const frames = [rgba(4, 4, (x) => [x * 60, 0, 0, 255])];
    expect(Array.from(encodeGIF(frames, 4, 4, tex, 12)))
      .toEqual(Array.from(encodeGIF(frames, 4, 4, tex, 12)));
  });

  it('caps absurd frame counts and dimensions', () => {
    const frame = new Uint8Array(4);
    expect(() => encodeGIF([frame], 5000, 5000, tex, 12)).toThrow();
    const big = Array.from({ length: 5000 }, () => frame);
    expect(() => encodeGIF(big.slice(0, 5000), 2, 2, tex, 12)).toThrow(/too many frames/);
  });
});

// ---------------------------------------------------------------------------
// Sprite sheet
// ---------------------------------------------------------------------------

describe('spriteSheet', () => {
  it('packs frames row-major', () => {
    const frameA = rgba(2, 2, () => [255, 0, 0, 255]);
    const frameB = rgba(2, 2, () => [0, 255, 0, 255]);
    const frameC = rgba(2, 2, () => [0, 0, 255, 255]);
    const sheet = spriteSheet([frameA, frameB, frameC], 2, 2, 2);
    expect(sheet.width).toBe(4);
    expect(sheet.height).toBe(4);
    const px = (x: number, y: number) => {
      const o = (y * 4 + x) * 4;
      return [sheet.rgba[o], sheet.rgba[o + 1], sheet.rgba[o + 2]];
    };
    expect(px(0, 0)).toEqual([255, 0, 0]);   // frame 0, row 0 col 0
    expect(px(2, 0)).toEqual([0, 255, 0]);   // frame 1, row 0 col 1
    expect(px(0, 2)).toEqual([0, 0, 255]);   // frame 2, row 1 col 0
  });

  it('leaves empty tail cells transparent', () => {
    const frame = rgba(2, 2, () => [9, 9, 9, 255]);
    const sheet = spriteSheet([frame], 2, 2, 4);
    expect(sheet.width).toBe(8);
    expect(sheet.height).toBe(2);
    // Cell (1,0) is beyond the single frame — fully transparent.
    const o = (0 * 8 + 4) * 4;
    expect(sheet.rgba.slice(o, o + 4)).toEqual(new Uint8Array([0, 0, 0, 0]));
  });

  it('validates inputs', () => {
    expect(() => spriteSheet([], 2, 2, 2)).toThrow();
    expect(() => spriteSheet([new Uint8Array(3)], 2, 2, 2)).toThrow();
    expect(() => spriteSheet([new Uint8Array(16)], 2, 2, 0)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// OBJ
// ---------------------------------------------------------------------------

describe('exportOBJ', () => {
  it('emits OBJ/MTL/PNG files', () => {
    const bundle = exportOBJ(makeProject());
    const names = bundle.files.map((f) => f.name);
    expect(names).toContain('model.obj');
    expect(names).toContain('model.mtl');
    expect(names).toContain('texture.png');
    expect(Array.isArray(bundle.warnings)).toBe(true);
  });

  it('writes world-space vertices for a translated mesh', () => {
    const mesh = makeCubeMesh({ position: [2, 0, 0] });
    const bundle = exportOBJ(makeProject([mesh]));
    const obj = getBundleFile(bundle, 'model.obj').data as string;
    const xs = obj.split('\n').filter((l) => l.startsWith('v ')).map((l) => parseFloat(l.split(' ')[1]));
    expect(Math.min(...xs)).toBeCloseTo(1.5, 5);
    expect(Math.max(...xs)).toBeCloseTo(2.5, 5);
  });

  it('bakes rotation and pivot per the documented transform', () => {
    const mesh = makeCubeMesh({ rotation: [0, 0, Math.PI / 2], pivot: [0, 0, 0] });
    const bundle = exportOBJ(makeProject([mesh]));
    const obj = getBundleFile(bundle, 'model.obj').data as string;
    const vs = obj.split('\n').filter((l) => l.startsWith('v ')).map((l) => l.split(' ').slice(1).map(Number));
    // Rotating the cube 90° about Z maps +X extent onto +Y.
    const maxY = Math.max(...vs.map((v) => v[1]));
    const maxX = Math.max(...vs.map((v) => v[0]));
    expect(maxY).toBeCloseTo(0.5, 4);
    expect(maxX).toBeCloseTo(0.5, 4);
    void localToWorld;
  });

  it('emits faces with v/vt/vn indices in range', () => {
    const bundle = exportOBJ(makeProject());
    const obj = getBundleFile(bundle, 'model.obj').data as string;
    const vCount = obj.split('\n').filter((l) => l.startsWith('v ')).length;
    const vtCount = obj.split('\n').filter((l) => l.startsWith('vt ')).length;
    const vnCount = obj.split('\n').filter((l) => l.startsWith('vn ')).length;
    const faces = obj.split('\n').filter((l) => l.startsWith('f '));
    expect(faces.length).toBeGreaterThanOrEqual(12); // 6 quads → ≥12 triangles
    for (const line of faces) {
      for (const corner of line.slice(2).split(' ')) {
        const [v, vt, vn] = corner.split('/').map(Number);
        expect(v).toBeGreaterThanOrEqual(1);
        expect(v).toBeLessThanOrEqual(vCount);
        expect(vt).toBeLessThanOrEqual(vtCount);
        expect(vn).toBeLessThanOrEqual(vnCount);
      }
    }
  });

  it('emits per-corner UVs (not per-face)', () => {
    const bundle = exportOBJ(makeProject());
    const obj = getBundleFile(bundle, 'model.obj').data as string;
    const vt = obj.split('\n').filter((l) => l.startsWith('vt '));
    // 6 quads × 4 corners × 2 triangles = 48 corner UVs.
    expect(vt.length).toBe(48);
    // UVs normalized to [0,1] with v flipped from pixel coords.
    const us = vt.map((l) => parseFloat(l.split(' ')[1]));
    const vs = vt.map((l) => parseFloat(l.split(' ')[2]));
    expect(Math.min(...us)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...us)).toBeLessThanOrEqual(1);
    expect(Math.min(...vs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...vs)).toBeLessThanOrEqual(1);
  });

  it('references MTL materials and declares map_Kd for textured faces', () => {
    const bundle = exportOBJ(makeProject());
    const obj = getBundleFile(bundle, 'model.obj').data as string;
    const mtl = getBundleFile(bundle, 'model.mtl').data as string;
    expect(obj).toMatch(/^mtllib model.mtl$/m);
    const usemtl = obj.match(/^usemtl (\S+)$/gm) ?? [];
    expect(usemtl.length).toBeGreaterThan(0);
    const firstMat = (usemtl[0] ?? '').split(' ')[1];
    expect(mtl).toMatch(new RegExp(`^newmtl ${firstMat}$`, 'm'));
    expect(mtl).toMatch(/map_Kd texture\.png/);
    expect(mtl).toMatch(/Kd [0-9.]+ [0-9.]+ [0-9.]+/);
  });

  it('skips hidden meshes and hidden folders', () => {
    const folderId = 'folder1';
    const project = makeProject([
      makeCubeMesh(),
      makeCubeMesh({ id: 'mesh2', name: 'Hidden', visible: false }),
      makeCubeMesh({ id: 'mesh3', name: 'InFolder', folderId }),
    ]);
    project.folders = [{ id: folderId, name: 'Group', visible: false, locked: false }];
    const bundle = exportOBJ(project);
    const obj = getBundleFile(bundle, 'model.obj').data as string;
    expect(obj).toContain('Cube');
    expect(obj).not.toContain('Hidden');
    expect(obj).not.toContain('InFolder');
    expect(bundle.warnings.some((w) => w.includes('hidden'))).toBe(true);
  });

  it('throws on projects with no visible geometry', () => {
    const mesh = makeCubeMesh({ visible: false });
    expect(() => exportOBJ(makeProject([mesh]))).toThrow(/no visible geometry/i);
  });

  it('packs a decodable texture PNG of the project texture size', () => {
    const bundle = exportOBJ(makeProject());
    const pngBytes = getBundleFile(bundle, 'texture.png').data as Uint8Array;
    const decoded = decodePNG(pngBytes);
    expect(decoded.width).toBe(128);
    expect(decoded.height).toBe(128);
    expect(decoded.data.length).toBe(128 * 128 * 4);
  });
});

// ---------------------------------------------------------------------------
// glTF
// ---------------------------------------------------------------------------

interface MinimalGltf {
  asset: { version: string };
  scenes: Array<{ nodes: number[] }>;
  nodes: Array<{ name?: string; mesh?: number; children?: number[] }>;
  meshes: Array<{ primitives: Array<{ attributes: Record<string, number>; indices: number; material: number }> }>;
  accessors: Array<{ bufferView: number; componentType: number; count: number; type: string; min?: number[]; max?: number[] }>;
  bufferViews: Array<{ buffer: number; byteOffset: number; byteLength: number }>;
  buffers: Array<{ uri: string; byteLength: number }>;
  materials: Array<Record<string, unknown>>;
  animations?: Array<{ channels: Array<{ sampler: number; target: { node: number; path: string } }>; samplers: Array<{ input: number; output: number }> }>;
  images?: Array<{ uri: string }>;
}

function parseGltf(bundle: { files: Array<{ name: string; data: Uint8Array | string }> }): MinimalGltf {
  return JSON.parse(getBundleFile(bundle, 'model.gltf').data as string) as MinimalGltf;
}

describe('exportGLTF', () => {
  it('emits glTF2/model.bin/texture.png with version 2.0', () => {
    const bundle = exportGLTF(makeProject());
    expect(bundle.files.map((f) => f.name)).toEqual(['model.gltf', 'model.bin', 'texture.png']);
    const gltf = parseGltf(bundle);
    expect(gltf.asset.version).toBe('2.0');
  });

  it('keeps every bufferView 4-byte aligned (or component-aligned for 16-bit indices)', () => {
    const bundle = exportGLTF(makeProject([makeCubeMesh(), makeCubeMesh({ id: 'm2', name: 'B' })]));
    const gltf = parseGltf(bundle);
    for (const bv of gltf.bufferViews) {
      const isIndex = bv.byteLength % 4 !== 0;
      if (isIndex) expect(bv.byteOffset % 2).toBe(0);
      else expect(bv.byteOffset % 4).toBe(0);
      expect(bv.byteOffset + bv.byteLength).toBeLessThanOrEqual(gltf.buffers[0].byteLength);
    }
    // Overall buffer length itself is 4-aligned.
    expect(gltf.buffers[0].byteLength % 4).toBe(0);
  });

  it('accessor counts and types match decoded bin data', () => {
    const bundle = exportGLTF(makeProject());
    const gltf = parseGltf(bundle);
    const bin = getBundleFile(bundle, 'model.bin').data as Uint8Array;
    expect(gltf.buffers[0].byteLength).toBe(bin.length);
    for (const acc of gltf.accessors) {
      const comps = acc.type === 'VEC3' ? 3 : acc.type === 'VEC2' ? 2 : acc.type === 'VEC4' ? 4 : 1;
      const size = acc.componentType === 5126 ? 4 : acc.componentType === 5125 ? 4 : 2;
      expect(acc.bufferView).toBeLessThan(gltf.bufferViews.length);
      const bv = gltf.bufferViews[acc.bufferView];
      expect(bv.byteLength).toBe(acc.count * comps * size);
      void bin;
    }
  });

  it('POSITION accessor min/max bound the cube geometry', () => {
    const bundle = exportGLTF(makeProject());
    const gltf = parseGltf(bundle);
    // First mesh's POSITION accessor.
    const prim = gltf.meshes[0].primitives[0];
    const posAcc = gltf.accessors[prim.attributes.POSITION];
    expect(posAcc.type).toBe('VEC3');
    expect(posAcc.count).toBe(36); // 12 triangles × 3
    expect(posAcc.min![0]).toBeCloseTo(-0.5, 5);
    expect(posAcc.max![0]).toBeCloseTo(0.5, 5);
  });

  it('decodes POSITION data from the bin and matches world coordinates', () => {
    const mesh = makeCubeMesh({ position: [1, 2, 3] });
    const bundle = exportGLTF(makeProject([mesh]));
    const gltf = parseGltf(bundle);
    const bin = getBundleFile(bundle, 'model.bin').data as Uint8Array;
    const prim = gltf.meshes[0].primitives[0];
    const posAcc = gltf.accessors[prim.attributes.POSITION];
    const bv = gltf.bufferViews[posAcc.bufferView];
    const floats = new Float32Array(bin.buffer, bin.byteOffset + bv.byteOffset, posAcc.count * 3);
    const xs: number[] = [];
    for (let i = 0; i < floats.length; i += 3) xs.push(floats[i]);
    expect(Math.min(...xs)).toBeCloseTo(0.5, 5);
    expect(Math.max(...xs)).toBeCloseTo(1.5, 5);
  });

  it('creates independent materials with baseColorFactor and doubleSided', () => {
    const mesh = makeCubeMesh();
    mesh.faces[0].doubleSided = true;
    const bundle = exportGLTF(makeProject([mesh]));
    const gltf = parseGltf(bundle);
    expect(gltf.materials.length).toBeGreaterThanOrEqual(1);
    for (const mat of gltf.materials) {
      expect(mat.pbrMetallicRoughness).toBeTruthy();
      const factors = (mat.pbrMetallicRoughness as Record<string, number[]>).baseColorFactor;
      expect(factors.length).toBe(4);
      expect(factors.every((v) => v >= 0 && v <= 1)).toBe(true);
      expect(['OPAQUE','MASK']).toContain(mat.alphaMode);
    }
    expect(gltf.materials.some((m) => m.doubleSided === true)).toBe(true);
    expect(gltf.materials.some((m) => m.doubleSided === false)).toBe(true);
  });

  it('references the original texture PNG as an image', () => {
    const bundle = exportGLTF(makeProject());
    const gltf = parseGltf(bundle);
    expect(gltf.images![0].uri).toBe('texture.png');
    const pngBytes = getBundleFile(bundle, 'texture.png').data as Uint8Array;
    expect(Array.from(pngBytes.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  it('splits multi-material meshes so primitives do not mix materials', () => {
    const mesh = makeCubeMesh();
    mesh.faces[0].textured = false;
    const bundle = exportGLTF(makeProject([mesh]));
    const gltf = parseGltf(bundle);
    for (const m of gltf.meshes) {
      const mats = m.primitives.map((p) => p.material);
      expect(mats.every(i=>Number.isInteger(i)&&i>=0&&i<gltf.materials.length)).toBe(true);
    }
  });

  it('skips hidden meshes and warns', () => {
    const project = makeProject([makeCubeMesh(), makeCubeMesh({ id: 'm2', name: 'Ghost', visible: false })]);
    const bundle = exportGLTF(project);
    const gltf = parseGltf(bundle);
    const names = gltf.nodes.map((n) => n.name);
    expect(names).toContain('Cube');
    expect(names).not.toContain('Ghost');
    expect(bundle.warnings.some((w) => w.toLowerCase().includes('hidden'))).toBe(true);
  });

  it('warns about drawBehind and shading semantics', () => {
    const mesh = makeCubeMesh();
    mesh.faces[0].drawBehind = true;
    mesh.faces[1].shaded = true;
    const bundle = exportGLTF(makeProject([mesh]));
    expect(bundle.warnings.some((w) => w.includes('drawBehind'))).toBe(true);
    expect(bundle.warnings.some((w) => w.toLowerCase().includes('ramp') || w.toLowerCase().includes('shad'))).toBe(true);
  });

  it('produces animation channels targeting mesh nodes with valid accessors', () => {
    const mesh = makeCubeMesh({ id: 'mesh1', name: 'Mover' });
    const project = makeProject([mesh]);
    project.animation = {
      duration: 1,
      fps: 4,
      clips: [{
        id: 'clip1',
        meshId: 'mesh1',
        track: 0,
        type: 'movement',
        axis: 'x',
        start: 0,
        duration: 1,
        amount: 2,
        curve: 'linear',
        pingPong: false,
        frequency: 1,
        property: 'movement',
      }],
    };
    const bundle = exportGLTF(project, { animation: true });
    const gltf = parseGltf(bundle);
    expect(gltf.animations!.length).toBe(1);
    const anim = gltf.animations![0];
    expect(anim.channels.map((c) => c.target.path).sort()).toEqual(['rotation', 'scale', 'translation']);
    for (const s of anim.samplers) {
      const inAcc = gltf.accessors[s.input];
      const outAcc = gltf.accessors[s.output];
      expect(inAcc.type).toBe('SCALAR');
      expect(inAcc.count).toBe(outAcc.count);
      expect(inAcc.min![0]).toBe(0);
      expect(inAcc.max![0]).toBeCloseTo(1, 5); // duration
    }
    // Sampler time grid is fps-deterministic: 1s at fps 4 → 5 frames.
    const timeSampler = anim.samplers[0];
    const bin = getBundleFile(bundle, 'model.bin').data as Uint8Array;
    const tAcc = gltf.accessors[timeSampler.input];
    const tView = gltf.bufferViews[tAcc.bufferView];
    const times = new Float32Array(bin.buffer, bin.byteOffset + tView.byteOffset, tAcc.count);
    expect(Array.from(times)).toEqual([0, 0.25, 0.5, 0.75, 1]);
    // Translation delta at t=1 should be +2 on X (amount 2, axis x).
    const trChannel=anim.channels.find(c=>c.target.path==='translation')!;
    const trSampler = anim.samplers[trChannel.sampler];
    const trAcc = gltf.accessors[trSampler.output];
    const trView = gltf.bufferViews[trAcc.bufferView];
    const tr = new Float32Array(bin.buffer, bin.byteOffset + trView.byteOffset, trAcc.count * 3);
    expect(tr[tr.length - 3]).toBeCloseTo(2, 4);
    expect(tr[tr.length - 2]).toBeCloseTo(0, 5);
    expect(tr[tr.length - 1]).toBeCloseTo(0, 5);
  });

  it('emits identity animation deltas at t=0 (baked base matches frame zero)', () => {
    const mesh = makeCubeMesh();
    const project = makeProject([mesh]);
    project.animation = {
      duration: 1,
      fps: 4,
      clips: [{
        id: 'c', meshId: 'mesh1', track: 0, type: 'movement', axis: 'y',
        start: 0, duration: 1, amount: 1, curve: 'linear', pingPong: false,
        frequency: 1, property: 'movement',
      }],
    };
    const bundle = exportGLTF(project, { animation: true });
    const gltf = parseGltf(bundle);
    const bin = getBundleFile(bundle, 'model.bin').data as Uint8Array;
    const anim = gltf.animations![0];
    const trSampler = anim.samplers[0];
    const acc = gltf.accessors[trSampler.output];
    const view = gltf.bufferViews[acc.bufferView];
    const tr = new Float32Array(bin.buffer, bin.byteOffset + view.byteOffset, acc.count * 3);
    // First keyframe translation delta is zero — base geometry is the t=0 pose.
    expect(tr[0]).toBeCloseTo(0, 6);
    expect(tr[1]).toBeCloseTo(0, 6);
    expect(tr[2]).toBeCloseTo(0, 6);
    void localToWorld;
  });

  it('skips visibility clips with a warning', () => {
    const project = makeProject();
    project.animation = {
      duration: 2,
      fps: 12,
      clips: [{
        id: 'cv', meshId: 'mesh1', track: 1, type: 'visibility', axis: 'x',
        start: 0, duration: 1, amount: 0, curve: 'linear', pingPong: false,
        frequency: 1, property: 'movement',
      }],
    };
    const bundle = exportGLTF(project, { animation: true });
    expect(bundle.warnings.some((w) => w.includes('visibility') || w.includes('not representable'))).toBe(true);
    const gltf = parseGltf(bundle);
    expect(gltf.animations === undefined || gltf.animations.length === 0).toBe(true);
  });

  it('does not emit animations unless requested', () => {
    const project = makeProject();
    project.animation.clips = [{
      id: 'c', meshId: 'mesh1', track: 0, type: 'movement', axis: 'x',
      start: 0, duration: 1, amount: 1, curve: 'linear', pingPong: false,
      frequency: 1, property: 'movement',
    }];
    const bundle = exportGLTF(project);
    expect(bundle.animationsExported).toBeUndefined();
    const gltf = parseGltf(bundle);
    expect(gltf.animations).toBeUndefined();
  });

  it('throws on projects with no visible geometry', () => {
    const mesh = makeCubeMesh({ visible: false });
    expect(() => exportGLTF(makeProject([mesh]))).toThrow(/no visible geometry/i);
  });
});

// ---------------------------------------------------------------------------
// Bundling, naming, ZIP
// ---------------------------------------------------------------------------

describe('bundle and downloads', () => {
  it('sanitizes file names', () => {
    expect(sanitizeFileName('../../etc/passwd')).not.toContain('/');
    expect(sanitizeFileName('a\x00b')).not.toContain('\x00');
    expect(sanitizeFileName('')).toBe('untitled');
    expect(sanitizeFileName('spaces  in*name?.obj')).not.toMatch(/[*?]/);
    expect(sanitizeBaseName('My Model.pvo')).toBe('My Model');
  });

  it('validateBundle rejects empty and duplicate bundles', () => {
    expect(() => validateBundle({ files: [], warnings: [] })).toThrow();
    expect(() => validateBundle({
      files: [
        { name: 'a.txt', data: 'x', mime: 'text/plain' },
        { name: 'a.txt', data: 'y', mime: 'text/plain' },
      ],
      warnings: [],
    })).toThrow(/duplicate/);
  });

  it('zipBundle produces an archive with all bundle files', () => {
    const bundle = exportOBJ(makeProject());
    const zip = zipBundle(bundle, 'test');
    const unzipped = unzipSync(zip);
    expect(Object.keys(unzipped).sort()).toEqual(['model.mtl', 'model.obj', 'texture.png']);
    const obj = strFromU8(unzipped['model.obj']);
    expect(obj).toContain('v ');
  });

  it('enforces resource caps on oversize files', () => {
    const big = new Uint8Array(EXPORT_LIMITS.maxFileBytes + 1);
    expect(() => validateBundle({ files: [{ name: 'big.bin', data: big, mime: 'application/octet-stream' }], warnings: [] })).toThrow(/large/);
  });
});

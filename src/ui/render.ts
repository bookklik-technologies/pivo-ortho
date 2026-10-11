// PiVo Ortho renderer: builds Three.js scene from a Project, applies the
// indexed nearest-neighbor palette shader with shade ramps, optional affine
// UV interpolation, and provides offscreen frame capture for exports.
// All shader code authored here; no external assets.
import * as THREE from 'three';
import type { Mesh, Project, Vec3 } from '../core/types';
import { worldVertex } from '../core';
import { polygonNormal, triangulatePolygon } from './geometry';

export { polygonNormal, triangulatePolygon };

export interface RenderPose {
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
  visible: boolean;
}

export type PoseFn = (meshId: string) => RenderPose | null;

export function meshVisible(project: Project, m: Mesh): boolean {
  if (!m.visible) return false;
  if (m.folderId) {
    const f = project.folders.find((x) => x.id === m.folderId);
    if (f && !f.visible) return false;
  }
  return true;
}

export interface FaceEntry {
  meshId: string;
  faceId: string;
  meshName: string;
  /** corner world positions */
  corners: Vec3[];
  tris: Array<[number, number, number]>;
  normal: Vec3;
  color: number;
  textured: boolean;
  shaded: boolean;
  doubleSided: boolean;
  drawBehind: boolean;
  uv: Array<[number, number]>;
}

export interface BuiltScene {
  entries: FaceEntry[];
  vertexPoints: Array<{ meshId: string; vertexId: string; pos: Vec3 }>;
  bounds: { min: Vec3; max: Vec3 };
}

/** Collect renderable faces (world space) honoring folder/mesh visibility and pose. */
export function collectFaces(project: Project, poseFn?: PoseFn): BuiltScene {
  const entries: FaceEntry[] = [];
  const vertexPoints: Array<{ meshId: string; vertexId: string; pos: Vec3 }> = [];
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const mesh of project.meshes) {
    const pose = poseFn ? poseFn(mesh.id) : null;
    if (!meshVisible(project, mesh) || (pose && !pose.visible)) continue;
    const pos = pose?.position ?? mesh.position;
    const rot = pose?.rotation ?? mesh.rotation;
    const scl = pose?.scale ?? mesh.scale;
    const livePose = pose ? { position: pos, rotation: rot, scale: scl, visible: true } : undefined;
    for (const v of mesh.vertices) {
      const p = worldVertex(mesh, v.position, livePose);
      vertexPoints.push({ meshId: mesh.id, vertexId: v.id, pos: p });
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k], p[k]);
        max[k] = Math.max(max[k], p[k]);
      }
    }
    for (const face of mesh.faces) {
      if (face.vertices.length < 3) continue;
      const corners: Vec3[] = [];
      let missing = false;
      for (const vid of face.vertices) {
        const v = mesh.vertices.find((x) => x.id === vid);
        if (!v) { missing = true; break; }
        corners.push(worldVertex(mesh, v.position, livePose));
      }
      if (missing) continue;
      const normal = polygonNormal(corners);
      const tris = triangulatePolygon(corners);
      if (tris.length === 0) continue;
      for (let k = 0; k < 3; k++) {
        for (const c of corners) {
          min[k] = Math.min(min[k], c[k]);
          max[k] = Math.max(max[k], c[k]);
        }
      }
      entries.push({
        meshId: mesh.id, faceId: face.id, meshName: mesh.name,
        corners, tris, normal,
        color: face.color, textured: face.textured, shaded: face.shaded,
        doubleSided: face.doubleSided, drawBehind: face.drawBehind,
        uv: face.uv.map((u) => [u[0], u[1]]),
      });
    }
  }
  if (min[0] === Infinity) { min[0] = 0; min[1] = 0; min[2] = 0; max[0] = 0; max[1] = 0; max[2] = 0; }
  return { entries, vertexPoints, bounds: { min, max } };
}

// ---- Shader ----
// Texture UVs arrive in texture-pixel units (top-left origin). In
// standard UV varying uses perspective-correct interpolation. In affine mode
// interpolate uv*w and w, then divide the two to recover screen-linear UVs. The transparent palette index discards the fragment.
const VERT = /* glsl */ `
  varying vec3 vNormal;
  varying vec2 vUvPx;
  varying vec2 vUvAffine;
  varying float vW;
  void main() {
    vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    vNormal = normal;
    vUvPx = uv;
    vUvAffine = uv * clip.w;
    vW = clip.w;
    gl_Position = clip;
  }
`;

const FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D uIndexTex;
  uniform sampler2D uPaletteTex;
  uniform sampler2D uRampTex;
  uniform float uColorIdx;
  uniform float uTextured;
  uniform float uShaded;
  uniform float uAffine;
  uniform float uTransparentIdx;
  uniform vec2 uTexSize;
  uniform vec3 uLight;
  varying vec3 vNormal;
  varying vec2 vUvPx;
  varying vec2 vUvAffine;
  varying float vW;

  vec3 paletteColor(float idx) {
    return texture2D(uPaletteTex, vec2((idx + 0.5) / 16.0, 0.5)).rgb;
  }

  vec3 rampColor(float idx, float level) {
    return texture2D(uRampTex, vec2((idx + 0.5) / 16.0, (level + 0.5) / 3.0)).rgb;
  }

  void main() {
    // Recover linear screen-space UVs from perspective-interpolated uv*w / w.
    vec2 uvPx = vW > 0.0001 ? mix(vUvPx, vUvAffine / vW, uAffine) : vUvPx;
    vec3 col;
    float colorIdx = uColorIdx;
    if (uTextured > 0.5) {
      vec2 uvN = (uvPx + 0.5) / uTexSize;
      float idx = floor(texture2D(uIndexTex, uvN).r * 255.0 + 0.5);
      idx = clamp(idx, 0.0, 15.0);
      if (uTextured > 0.5 && abs(idx - uTransparentIdx) < 0.5) discard;
      colorIdx = idx;
      col = paletteColor(idx);
    } else {
      col = paletteColor(uColorIdx);
    }
    if (uShaded > 0.5) {
      vec3 n = normalize(vNormal);
      if (!gl_FrontFacing) n = -n;
      float d = dot(n, normalize(uLight));
      float level = d > 0.55 ? 2.0 : (d > 0.05 ? 1.0 : 0.0);
      col = rampColor(colorIdx, level);
    }
    gl_FragColor = vec4(col, 1.0);
  }
`;

function makeRgbTexture(pixels: Uint8Array, w: number, h: number): THREE.DataTexture {
  const t = new THREE.DataTexture(pixels, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.flipY = false;
  t.needsUpdate = true;
  return t;
}

export function indexTextureFromProject(project: Project): THREE.DataTexture {
  const tex = project.texture;
  const data = new Uint8Array(tex.width * tex.height);
  for (let i = 0; i < tex.pixels.length && i < data.length; i++) {
    data[i] = Math.max(0, Math.min(15, tex.pixels[i] | 0));
  }
  const t = new THREE.DataTexture(data, tex.width, tex.height, THREE.RedFormat, THREE.UnsignedByteType);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.flipY = false;
  t.needsUpdate = true;
  return t;
}

function hexChannel(hex: string, shift: number): number {
  const v = parseInt(hex.replace('#', ''), 16);
  return Number.isFinite(v) ? ((v >> shift) & 255) / 255 : 0;
}

export function paletteTextureFromProject(project: Project): THREE.DataTexture {
  const px = new Uint8Array(16 * 4);
  for (let i = 0; i < 16; i++) {
    px[i * 4] = Math.round(hexChannel(project.texture.palette[i] ?? '#000000', 16) * 255);
    px[i * 4 + 1] = Math.round(hexChannel(project.texture.palette[i] ?? '#000000', 8) * 255);
    px[i * 4 + 2] = Math.round(hexChannel(project.texture.palette[i] ?? '#000000', 0) * 255);
    px[i * 4 + 3] = 255;
  }
  return makeRgbTexture(px, 16, 1);
}

export function rampTextureFromProject(project: Project): THREE.DataTexture {
  const tex = project.texture;
  const px = new Uint8Array(16 * 3 * 4);
  for (let i = 0; i < 16; i++) {
    const ramp = tex.shadeRamps[i] ?? [i, i, i];
    for (let s = 0; s < 3; s++) {
      const idx = Math.max(0, Math.min(15, ramp[s] ?? i));
      px[(s * 16 + i) * 4] = Math.round(hexChannel(tex.palette[idx] ?? '#000000', 16) * 255);
      px[(s * 16 + i) * 4 + 1] = Math.round(hexChannel(tex.palette[idx] ?? '#000000', 8) * 255);
      px[(s * 16 + i) * 4 + 2] = Math.round(hexChannel(tex.palette[idx] ?? '#000000', 0) * 255);
      px[(s * 16 + i) * 4 + 3] = 255;
    }
  }
  return makeRgbTexture(px, 16, 3);
}

export interface FaceMaterialOptions {
  affine: boolean;
  shading: boolean;
  light: Vec3;
  wireframe: boolean;
  doubleSidedOverride?: boolean;
  transparentIndex?: number;
}

export function makeFaceMaterial(
  entry: FaceEntry,
  project: Project,
  indexTex: THREE.DataTexture,
  paletteTex: THREE.DataTexture,
  rampTex: THREE.DataTexture,
  opts: FaceMaterialOptions,
): THREE.ShaderMaterial {
  const useTexture = entry.textured;
  return new THREE.ShaderMaterial({
    uniforms: {
      uIndexTex: { value: indexTex },
      uPaletteTex: { value: paletteTex },
      uRampTex: { value: rampTex },
      uColorIdx: { value: entry.color },
      uTextured: { value: useTexture ? 1 : 0 },
      uShaded: { value: entry.shaded && opts.shading ? 1 : 0 },
      uAffine: { value: opts.affine ? 1 : 0 },
      uTransparentIdx: { value: opts.transparentIndex ?? project.texture.transparent },
      uTexSize: { value: new THREE.Vector2(project.texture.width, project.texture.height) },
      uLight: { value: new THREE.Vector3(...opts.light).normalize() },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    side: entry.doubleSided || opts.doubleSidedOverride ? THREE.DoubleSide : THREE.FrontSide,
    wireframe: opts.wireframe,
  });
}

export interface SceneBundle {
  group: THREE.Group;
  faceMeshes: Array<{ entry: FaceEntry; mesh: THREE.Mesh }>;
  dispose: () => void;
}

/** Build a THREE.Group of per-face meshes for rendering/picking. */
export function buildThreeGroup(
  scene: BuiltScene,
  project: Project,
  opts: FaceMaterialOptions,
): SceneBundle {
  const indexTex = indexTextureFromProject(project);
  const paletteTex = paletteTextureFromProject(project);
  const rampTex = rampTextureFromProject(project);
  const group = new THREE.Group();
  const faceMeshes: Array<{ entry: FaceEntry; mesh: THREE.Mesh }> = [];
  for (const entry of scene.entries) {
    const positions: number[] = [];
    const uvs: number[] = [];
    const normals: number[] = [];
    for (const [a, b, c] of entry.tris) {
      for (const i of [a, b, c]) {
        positions.push(entry.corners[i][0], entry.corners[i][1], entry.corners[i][2]);
        const uv = entry.uv[i] ?? [0, 0];
        uvs.push(uv[0], uv[1]);
        normals.push(entry.normal[0], entry.normal[1], entry.normal[2]);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    const mat = makeFaceMaterial(entry, project, indexTex, paletteTex, rampTex, opts);
    if (entry.drawBehind) {
      mat.depthTest = false;
      mat.depthWrite = false;
    }
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = entry.drawBehind ? -1 : 0;
    mesh.userData = { meshId: entry.meshId, faceId: entry.faceId };
    group.add(mesh);
    faceMeshes.push({ entry, mesh });
  }
  const dispose = () => {
    for (const fm of faceMeshes) {
      fm.mesh.geometry.dispose();
      (fm.mesh.material as THREE.Material).dispose();
    }
    indexTex.dispose();
    paletteTex.dispose();
    rampTex.dispose();
  };
  return { group, faceMeshes, dispose };
}

/** Shared world grid + axes. */
export function createGridHelper(size = 8, divisions = 16): THREE.Group {
  const g = new THREE.Group();
  const grid = new THREE.GridHelper(size, divisions, 0x334052, 0x222c39);
  const mat = grid.material as THREE.Material;
  mat.transparent = true;
  mat.opacity = 0.55;
  g.add(grid);
  const axes: Array<[Vec3, number]> = [
    [[1, 0, 0], 0xb3543f],
    [[0, 1, 0], 0x5f9a4e],
    [[0, 0, 1], 0x4a6fb0],
  ];
  for (const [dir, color] of axes) {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-dir[0] * 4, -dir[1] * 4, -dir[2] * 4),
      new THREE.Vector3(dir[0] * 4, dir[1] * 4, dir[2] * 4),
    ]);
    g.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color })));
  }
  return g;
}

// ---- Frame capture for exports ----

let captureRenderer: THREE.WebGLRenderer | null = null;

export function disposeCaptureRenderer(): void {
  captureRenderer?.dispose();
  captureRenderer = null;
}

export interface CaptureOptions {
  width: number;
  height: number;
  transparent: boolean;
  clearColor: string;
}

export interface CaptureCameraSpec {
  kind: 'orbit';
  /** camera yaw (radians), pitch (radians), distance and target */
  yaw: number;
  pitch: number;
  distance: number;
  target: Vec3;
  /** perspective vertical FOV in degrees */
  fov: number;
  /** projection for the capture camera (default 'perspective') */
  projection?: 'perspective' | 'orthographic';
  /** orthographic full vertical world span (used when projection is 'orthographic') */
  orthoSize?: number;
  /** camera up vector (default [0,1,0]; use [0,0,-1] for top views) */
  up?: Vec3;
}

function sanitizeVec(v: Vec3, fallback: Vec3): Vec3 {
  if (!v || v.length < 3 || !v.every((n) => typeof n === 'number' && Number.isFinite(n))) return [...fallback] as Vec3;
  return [v[0], v[1], v[2]];
}

/** Sanitized, normalized up vector (falls back to +Y when zero/degenerate). */
function sanitizeUpVec(up: Vec3 | undefined): Vec3 {
  const v = sanitizeVec(up ?? [0, 1, 0], [0, 1, 0]);
  const len = Math.hypot(v[0], v[1], v[2]);
  if (len < 1e-9) return [0, 1, 0];
  return [v[0] / len, v[1] / len, v[2] / len];
}

/**
 * Build the export capture camera from an orbit spec. Perspective cameras use
 * spec.fov; orthographic cameras use spec.orthoSize as the full vertical
 * world span. Returns a PerspectiveCamera | OrthographicCamera positioned at
 * the orbit offset around the target, looking at the target.
 */
export function makeCaptureCamera(
  spec: CaptureCameraSpec,
  aspect: number,
): THREE.PerspectiveCamera | THREE.OrthographicCamera {
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const finite = (v: number, fallback: number) => (Number.isFinite(v) ? v : fallback);
  const yaw = finite(spec.yaw, 0);
  const pitch = Number.isFinite(spec.pitch)
    ? Math.min(Math.PI / 2, Math.max(-Math.PI / 2, spec.pitch))
    : 0;
  const distance = Number.isFinite(spec.distance) ? Math.max(0.05, spec.distance) : 7;
  const target = sanitizeVec(spec.target, [0, 0, 0]);
  const up = sanitizeUpVec(spec.up);
  const projection = spec.projection === 'orthographic' ? 'orthographic' : 'perspective';
  const fov = Math.max(1,Math.min(170,finite(spec.fov,45)));
  const orthoSize = Number.isFinite(spec.orthoSize ?? NaN) ? Math.max(0.01, spec.orthoSize!) : 2;

  const position = new THREE.Vector3(
    target[0] + distance * Math.cos(pitch) * Math.sin(yaw),
    target[1] + distance * Math.sin(pitch),
    target[2] + distance * Math.cos(pitch) * Math.cos(yaw),
  );
  const lookAt = new THREE.Vector3(target[0], target[1], target[2]);

  let cam: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  if (projection === 'orthographic') {
    const halfH = orthoSize / 2;
    cam = new THREE.OrthographicCamera(-halfH * safeAspect, halfH * safeAspect, halfH, -halfH, -200, 400);
  } else {
    cam = new THREE.PerspectiveCamera(fov, safeAspect, 0.01, 400);
  }
  cam.up.set(up[0], up[1], up[2]);
  cam.position.copy(position);
  cam.lookAt(lookAt);
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
  return cam;
}

/** Sanitize a capture camera spec into a validated copy with all fields finite. */
export function sanitizeCaptureCameraSpec(spec: CaptureCameraSpec): Required<CaptureCameraSpec> {
  const proj = spec.projection === 'orthographic' ? 'orthographic' : 'perspective';
  const finite = (v: number, fallback: number) => (Number.isFinite(v) ? v : fallback);
  return {
    kind: 'orbit',
    yaw: finite(spec.yaw, 0),
    pitch: Number.isFinite(spec.pitch) ? Math.min(Math.PI / 2, Math.max(-Math.PI / 2, spec.pitch)) : 0,
    distance: Number.isFinite(spec.distance) ? Math.max(0.05, spec.distance) : 7,
    target: sanitizeVec(spec.target, [0, 0, 0]),
    fov: Number.isFinite(spec.fov) ? Math.min(170, Math.max(1, spec.fov)) : 45,
    projection: proj,
    orthoSize: Number.isFinite(spec.orthoSize ?? NaN) ? Math.max(0.01, spec.orthoSize!) : 2,
    up: sanitizeUpVec(spec.up),
  };
}

/**
 * Render the built scene from a camera into an RGBA pixel buffer
 * (top-left origin rows, straight alpha).
 */
export function captureFrame(
  scene: BuiltScene,
  project: Project,
  camera: THREE.Camera,
  camOpts: CaptureOptions,
): Uint8Array {
  if (!captureRenderer) {
    captureRenderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: false,
      preserveDrawingBuffer: true,
      premultipliedAlpha: false,
    });
    captureRenderer.setPixelRatio(1);
  }
  const r = captureRenderer;
  r.setSize(camOpts.width, camOpts.height, false);
  r.setClearColor(new THREE.Color(camOpts.clearColor), camOpts.transparent ? 0 : 1);
  r.clear(true, true, true);

  const bundle = buildThreeGroup(scene, project, {
    affine: project.render.affine,
    shading: project.render.shading,
    light: project.render.light,
    wireframe: false,
    transparentIndex: project.texture.transparent,
  });
  const s = new THREE.Scene();
  s.add(bundle.group);
  r.render(s, camera);
  const ctx = r.getContext();
  const buf = new Uint8Array(camOpts.width * camOpts.height * 4);
  ctx.readPixels(0, 0, camOpts.width, camOpts.height, ctx.RGBA, ctx.UNSIGNED_BYTE, buf);
  bundle.dispose();
  // WebGL origin bottom-left → flip vertically.
  const flipped = new Uint8Array(buf.length);
  const row = camOpts.width * 4;
  for (let y = 0; y < camOpts.height; y++) {
    flipped.set(buf.subarray(y * row, (y + 1) * row), (camOpts.height - 1 - y) * row);
  }
  return flipped;
}

/** Raycast from a viewport NDC point into face meshes. Returns closest entry or null. */
export function pickFace(
  faceMeshes: Array<{ entry: FaceEntry; mesh: THREE.Mesh }>,
  ndc: THREE.Vector2,
  camera: THREE.Camera,
): { entry: FaceEntry; point: THREE.Vector3 } | null {
  const ray = new THREE.Raycaster();
  ray.setFromCamera(ndc, camera);
  const hits = ray.intersectObjects(faceMeshes.map((f) => f.mesh), false);
  if (hits.length === 0) return null;
  const hit = hits[0];
  const found = faceMeshes.find((f) => f.mesh === hit.object);
  return found ? { entry: found.entry, point: hit.point } : null;
}

/** Project a world point to NDC (-1..1) for vertex picking / rectangle select. */
export function projectToNdc(point: Vec3, camera: THREE.Camera): [number, number] {
  const v = new THREE.Vector3(point[0], point[1], point[2]).project(camera);
  return [v.x, v.y];
}

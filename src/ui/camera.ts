// PiVo Ortho — pure camera configuration helpers for exports.
// No DOM, no WebGL, no Three.js: plain math + validation so these run in
// Vitest/Node. Computes orbit camera positions, editor-view snapshots from a
// shared CameraRig, and bounded/clamped export settings.
import type { CameraRig } from './modelWorkspace';
import type { ViewKind } from './store';
import type { Vec3 } from '../core/types';

/** Export-focused view kinds for the "use view" snapshot (persp maps to the shared rig orbit). */
export type CameraViewKind = ViewKind;

/** Sentinel for "not a finite number" checks. */
function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function sanitizeVec3(v: Vec3 | undefined, fallback: Vec3): Vec3 {
  if (!v || v.length < 3 || !v.every(isFiniteNumber)) return [...fallback] as Vec3;
  return [v[0], v[1], v[2]];
}

/** Normalize an up vector; falls back to +Y when zero/degenerate. */
export function sanitizeUp(up: Vec3 | undefined): Vec3 {
  const v = sanitizeVec3(up, [0, 1, 0]);
  const len = Math.hypot(v[0], v[1], v[2]);
  if (len < 1e-9) return [0, 1, 0];
  return [v[0] / len, v[1] / len, v[2] / len];
}

/**
 * Orbit camera position for yaw/pitch/distance around a target. Identical
 * convention to the editor rig: yaw 0 looks down -Z... position offset is
 * (d·cos(pitch)·sin(yaw), d·sin(pitch), d·cos(pitch)·cos(yaw)).
 */
export function orbitPosition(
  target: Vec3, yaw: number, pitch: number, distance: number,
): Vec3 {
  const t = sanitizeVec3(target, [0, 0, 0]);
  const y = isFiniteNumber(yaw) ? yaw : 0;
  const p = isFiniteNumber(pitch) ? clamp(pitch, -Math.PI / 2, Math.PI / 2) : 0;
  const d = isFiniteNumber(distance) ? Math.max(0.01, distance) : 1;
  return [
    t[0] + d * Math.cos(p) * Math.sin(y),
    t[1] + d * Math.sin(p),
    t[2] + d * Math.cos(p) * Math.cos(y),
  ];
}

export interface CaptureCameraOptions {
  kind?: 'orbit';
  yaw: number;
  pitch: number;
  distance: number;
  target: Vec3;
  /** perspective vertical FOV in degrees (used when projection is 'perspective') */
  fov?: number;
  projection?: 'perspective' | 'orthographic';
  /** orthographic full vertical world span */
  orthoSize?: number;
  up?: Vec3;
}

export const PITCH_LIMIT = Math.PI / 2;

/** Validate + clamp an export camera spec into safe finite bounds. */
export function sanitizeCaptureCameraOptions(spec: CaptureCameraOptions): Required<
  Pick<CaptureCameraOptions, 'kind' | 'yaw' | 'pitch' | 'distance' | 'fov' | 'projection' | 'orthoSize'>
> & { target: Vec3; up: Vec3 } {
  const kind = 'orbit';
  const yaw = isFiniteNumber(spec.yaw) ? spec.yaw : 0;
  const pitch = isFiniteNumber(spec.pitch) ? clamp(spec.pitch, -PITCH_LIMIT, PITCH_LIMIT) : 0;
  const distance = isFiniteNumber(spec.distance) ? clamp(spec.distance, 0.05, 500) : 7;
  const target = sanitizeVec3(spec.target, [0, 0, 0]);
  const projection = spec.projection === 'orthographic' ? 'orthographic' : 'perspective';
  const fov = isFiniteNumber(spec.fov) ? clamp(spec.fov, 1, 170) : 45;
  const orthoSize = isFiniteNumber(spec.orthoSize) ? clamp(spec.orthoSize, 0.01, 1000) : 2;
  return { kind, yaw, pitch, distance, target, fov, projection, orthoSize, up: sanitizeUp(spec.up) };
}

/**
 * Snapshot the editor camera for a view: front looks from +Z, side from +X,
 * top from +Y with up [0,0,-1]; persp is the shared rig orbit. Ortho views use
 * orthoSize = rig.orthoZoom * 2 (full vertical span, matching the editor whose
 * half-height is orthoZoom); perspective uses the editor's fov 45.
 */
export function captureCameraFromView(rig: CameraRig, view: CameraViewKind): CaptureCameraOptions {
  const t = sanitizeVec3(rig?.target, [0, 0.8, 0]);
  const distance = isFiniteNumber(rig?.distance) && rig.distance > 0 ? rig.distance : 7;
  const yaw = isFiniteNumber(rig?.yaw) ? rig.yaw : Math.PI / 4;
  const pitch = isFiniteNumber(rig?.pitch) ? rig.pitch : Math.PI / 5;
  const orthoZoom = isFiniteNumber(rig?.orthoZoom) && rig.orthoZoom > 0 ? rig.orthoZoom : 3.2;
  if (view === 'front') {
    return { kind: 'orbit', yaw: 0, pitch: 0, distance, target: t, fov: 45, projection: 'orthographic', orthoSize: orthoZoom * 2, up: [0, 1, 0] };
  }
  if (view === 'side') {
    return { kind: 'orbit', yaw: Math.PI / 2, pitch: 0, distance, target: t, fov: 45, projection: 'orthographic', orthoSize: orthoZoom * 2, up: [0, 1, 0] };
  }
  if (view === 'top') {
    return { kind: 'orbit', yaw: 0, pitch: PITCH_LIMIT, distance, target: t, fov: 45, projection: 'orthographic', orthoSize: orthoZoom * 2, up: [0, 0, -1] };
  }
  // persp: exact shared-rig orbit, editor perspective fov 45.
  return { kind: 'orbit', yaw, pitch, distance, target: t, fov: 45, projection: 'perspective', up: [0, 1, 0] };
}

/** Compute an auto-fit distance so the scene bounds fit the chosen projection. */
export function fitDistance(
  bounds: { min: Vec3; max: Vec3 },
  opts: { projection: 'perspective' | 'orthographic'; fov: number; aspect: number },
): number {
  const min = sanitizeVec3(bounds?.min, [-1, -1, -1]);
  const max = sanitizeVec3(bounds?.max, [1, 1, 1]);
  const cx = (min[0] + max[0]) / 2;
  const cy = (min[1] + max[1]) / 2;
  const cz = (min[2] + max[2]) / 2;
  const radius = Math.max(
    0.5,
    Math.hypot(max[0] - cx, max[1] - cy, max[2] - cz),
  );
  const aspect = isFiniteNumber(opts.aspect) && opts.aspect > 0 ? opts.aspect : 1;
  if (opts.projection === 'orthographic') {
    // radius maps to half the vertical span with margin.
    return radius * 1.6;
  }
  const fov = isFiniteNumber(opts.fov) ? clamp(opts.fov, 1, 170) : 45;
  const halfFov = (fov * Math.PI) / 360;
  const vFit = radius / Math.sin(halfFov);
  const hFit = radius / (Math.sin(halfFov) * aspect);
  return Math.max(0.05, Math.max(vFit, hFit) * 1.05);
}

/** Compute the orthoSize that fits bounds (full vertical world span). */
export function fitOrthoSize(bounds: { min: Vec3; max: Vec3 }): number {
  const min = sanitizeVec3(bounds?.min, [-1, -1, -1]);
  const max = sanitizeVec3(bounds?.max, [1, 1, 1]);
  const span = Math.max(
    max[0] - min[0], max[1] - min[1], max[2] - min[2], 0.5,
  );
  const radius=Math.hypot((max[0]-min[0])/2,(max[1]-min[1])/2,(max[2]-min[2])/2);
  return Math.max(0.5,radius*2.1);
}

export function deg2rad(d: number): number {
  return (d * Math.PI) / 180;
}

export function rad2deg(r: number): number {
  return (r * 180) / Math.PI;
}

// ---- Session persistence (safely namespaced localStorage) ----

const STORAGE_KEY = 'pivo-ortho:export-camera:v1';

/** Read persisted export-camera settings; returns null when absent/corrupt. */
export function loadExportCameraSettings<T>(): T | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as T;
  } catch {
    return null;
  }
}

/** Persist export-camera settings; silently ignores quota/unavailability. */
export function saveExportCameraSettings(settings: unknown): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // quota exceeded or storage disabled — persistence is best-effort
  }
}

/** Remove persisted export-camera settings. */
export function clearExportCameraSettings(): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** Turntable yaw also rotates the up vector: a top-down orbit must rotate the
 * view orientation, not emit a batch of identical frames at the north pole. */
export function turntableCamera(spec:CaptureCameraOptions,startDeg:number,direction:1|-1,index:number,count:number):CaptureCameraOptions {
 const base=sanitizeCaptureCameraOptions(spec);
 const yaw=deg2rad(startDeg)+direction*(index/Math.max(1,count))*Math.PI*2;
 const angle=yaw-base.yaw,[x,y,z]=base.up;
 return {...base,yaw,up:[x*Math.cos(angle)+z*Math.sin(angle),y,-x*Math.sin(angle)+z*Math.cos(angle)]};
}

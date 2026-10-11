// Unit tests for the pure export camera helpers (src/ui/camera.ts) and the
// capture camera region of src/ui/render.ts. No WebGL required — camera
// construction is pure Three.js math.
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  orbitPosition, sanitizeUp, captureCameraFromView, sanitizeCaptureCameraOptions,
  fitDistance, fitOrthoSize, deg2rad, rad2deg,turntableCamera,
} from '../src/ui/camera';
import { makeCaptureCamera, sanitizeCaptureCameraSpec, type CaptureCameraSpec } from '../src/ui/render';
import { DEFAULT_RIG, type CameraRig } from '../src/ui/modelWorkspace';

const rig: CameraRig = { ...DEFAULT_RIG };

describe('orbitPosition', () => {
  it('places yaw=0 pitch=0 on the +Z axis', () => {
    const p = orbitPosition([0, 0, 0], 0, 0, 7);
    expect(p[0]).toBeCloseTo(0, 6);
    expect(p[1]).toBeCloseTo(0, 6);
    expect(p[2]).toBeCloseTo(7, 6);
  });
  it('places yaw=π/2 on the +X axis (side view)', () => {
    const p = orbitPosition([0, 0, 0], Math.PI / 2, 0, 5);
    expect(p[0]).toBeCloseTo(5, 6);
    expect(p[2]).toBeCloseTo(0, 6);
  });
  it('places pitch=π/2 above the target (top view)', () => {
    const p = orbitPosition([1, 2, 3], Math.PI / 2, Math.PI / 2, 4);
    expect(p[0]).toBeCloseTo(1, 3);
    expect(p[1]).toBeCloseTo(6, 3);
    expect(p[2]).toBeCloseTo(3, 3);
  });
  it('is finite and safe for non-finite inputs', () => {
    const p = orbitPosition([0, 0, 0], NaN, Infinity, -5);
    expect(p.every(Number.isFinite)).toBe(true);
  });
});

describe('sanitizeUp', () => {
  it('normalizes the vector', () => {
    expect(sanitizeUp([0, 0, -5])).toEqual([0, 0, -1]);
  });
  it('falls back to +Y for zero vector', () => {
    expect(sanitizeUp([0, 0, 0])).toEqual([0, 1, 0]);
  });
  it('falls back to +Y for non-finite input', () => {
    expect(sanitizeUp([NaN, 1, 0])).toEqual([0, 1, 0]);
  });
});

describe('captureCameraFromView — exact editor view values', () => {
  it('front: +Z, orthographic, orthoSize = orthoZoom*2, up +Y', () => {
    const s = captureCameraFromView(rig, 'front');
    expect(s.yaw).toBe(0);
    expect(s.pitch).toBe(0);
    expect(s.projection).toBe('orthographic');
    expect(s.orthoSize).toBeCloseTo(rig.orthoZoom * 2, 9);
    expect(s.up).toEqual([0, 1, 0]);
    expect(s.target).toEqual(rig.target);
    const pos = orbitPosition(s.target, s.yaw, s.pitch, s.distance);
    expect(pos[2]).toBeCloseTo(rig.target[2] + rig.distance, 9);
  });
  it('side: +X, orthographic', () => {
    const s = captureCameraFromView(rig, 'side');
    expect(s.yaw).toBeCloseTo(Math.PI / 2, 9);
    expect(s.projection).toBe('orthographic');
    const pos = orbitPosition(s.target, s.yaw, s.pitch, s.distance);
    expect(pos[0]).toBeCloseTo(rig.target[0] + rig.distance, 9);
  });
  it('top: +Y with up [0,0,-1], orthographic', () => {
    const s = captureCameraFromView(rig, 'top');
    expect(s.up).toEqual([0, 0, -1]);
    expect(s.projection).toBe('orthographic');
    const pos = orbitPosition(s.target, s.yaw, s.pitch, s.distance);
    expect(pos[1]).toBeCloseTo(rig.target[1] + rig.distance * Math.sin(s.pitch), 6);
  });
  it('persp: the exact shared rig orbit with editor fov 45, perspective', () => {
    const s = captureCameraFromView(rig, 'persp');
    expect(s.projection).toBe('perspective');
    expect(s.fov).toBe(45);
    expect(s.yaw).toBeCloseTo(rig.yaw, 9);
    expect(s.pitch).toBeCloseTo(rig.pitch, 9);
    expect(s.distance).toBe(rig.distance);
  });
});

describe('sanitizeCaptureCameraOptions / sanitizeCaptureCameraSpec validation', () => {
  it('clamps out-of-range values into finite bounds', () => {
    const s = sanitizeCaptureCameraSpec({
      kind: 'orbit', yaw: NaN, pitch: 99, distance: -3, target: [0, 0, 0],
      fov: 999, projection: 'orthographic', orthoSize: -1, up: [0, 0, 0],
    });
    expect(Number.isFinite(s.yaw)).toBe(true);
    expect(s.pitch).toBeLessThanOrEqual(Math.PI / 2);
    expect(s.distance).toBeGreaterThanOrEqual(0.05);
    expect(s.fov).toBeLessThanOrEqual(170);
    expect(s.orthoSize).toBeGreaterThanOrEqual(0.01);
    expect(s.up).toEqual([0, 1, 0]);
  });
  it('defaults projection to perspective', () => {
    const s = sanitizeCaptureCameraOptions({ yaw: 0, pitch: 0, distance: 5, target: [0, 0, 0] });
    expect(s.projection).toBe('perspective');
  });
});

describe('makeCaptureCamera — projection/position/look target/aspect', () => {
  const spec: CaptureCameraSpec = {
    kind: 'orbit', yaw: Math.PI / 4, pitch: Math.PI / 5, distance: 7,
    target: [0, 0.8, 0], fov: 45,
  };

  it('returns a positioned PerspectiveCamera looking at the target by default', () => {
    const cam = makeCaptureCamera(spec, 1);
    expect(cam).toBeInstanceOf(THREE.PerspectiveCamera);
    const p = cam.position;
    const d = Math.hypot(p.x - spec.target[0], p.y - spec.target[1], p.z - spec.target[2]);
    expect(d).toBeCloseTo(7, 6);
    const dir = new THREE.Vector3(...spec.target).sub(p).normalize();
    const fwd = new THREE.Vector3();
    cam.getWorldDirection(fwd);
    expect(fwd.dot(dir)).toBeCloseTo(1, 5);
    expect((cam as THREE.PerspectiveCamera).fov).toBe(45);
    expect((cam as THREE.PerspectiveCamera).aspect).toBe(1);
  });

  it('aspect is honored on the perspective camera', () => {
    const cam = makeCaptureCamera(spec, 2) as THREE.PerspectiveCamera;
    expect(cam.aspect).toBe(2);
  });

  it('returns an OrthographicCamera with orthoSize as the full vertical span', () => {
    const cam = makeCaptureCamera({ ...spec, projection: 'orthographic', orthoSize: 4 }, 2);
    expect(cam).toBeInstanceOf(THREE.OrthographicCamera);
    const o = cam as THREE.OrthographicCamera;
    expect(o.top - o.bottom).toBeCloseTo(4, 9);
    expect(o.right - o.left).toBeCloseTo(8, 9); // aspect 2
  });

  it('up vector is applied (top view [0,0,-1])', () => {
    const cam = makeCaptureCamera({
      kind: 'orbit', yaw: 0, pitch: Math.PI / 2 - 0.01, distance: 7,
      target: [0, 0, 0], fov: 45, up: [0, 0, -1],
    }, 1);
    expect(cam.up.x).toBe(0);
    expect(cam.up.y).toBe(0);
    expect(cam.up.z).toBe(-1);
  });
});

describe('fit helpers', () => {
  const bounds = { min: [-1, -1, -1] as [number, number, number], max: [1, 1, 1] as [number, number, number] };
  it('fitDistance returns a positive distance that bounds the sphere', () => {
    const d = fitDistance(bounds, { projection: 'perspective', fov: 45, aspect: 1 });
    expect(d).toBeGreaterThan(1);
  });
  it('narrow aspect needs a larger distance', () => {
    const wide = fitDistance(bounds, { projection: 'perspective', fov: 45, aspect: 2 });
    const narrow = fitDistance(bounds, { projection: 'perspective', fov: 45, aspect: 0.5 });
    expect(narrow).toBeGreaterThan(wide);
  });
  it('fitOrthoSize returns positive span', () => {
    expect(fitOrthoSize(bounds)).toBeGreaterThan(1);
  });
});

describe('degree conversions', () => {
  it('round-trips', () => {
    expect(rad2deg(deg2rad(37.5))).toBeCloseTo(37.5, 9);
  });
});

it('top snapshot is exactly above target with an independent up vector',()=>{const spec=captureCameraFromView(rig,'top');const cam=makeCaptureCamera({...spec,kind:'orbit',fov:45},1);expect(cam.position.y).toBeCloseTo(rig.target[1]+rig.distance,10);expect(cam.position.z).toBeCloseTo(rig.target[2],10);expect(cam.up.toArray()).toEqual([0,0,-1])});
it('top-down turntable rotates up so frames are not duplicates',()=>{const spec=captureCameraFromView(rig,'top');const start=turntableCamera(spec,0,1,0,4);const next=turntableCamera(spec,0,1,1,4);expect(start.up).toEqual([0,0,-1]);expect(next.up![0]).toBeCloseTo(-1);expect(next.up![2]).toBeCloseTo(0)});
it('orthographic fit contains the bounding sphere at any rotation',()=>{const b={min:[-1,-1,-1] as [number,number,number],max:[1,1,1] as [number,number,number]};expect(fitOrthoSize(b)).toBeGreaterThan(Math.sqrt(12))});

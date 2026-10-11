// Core utility helpers — pure functions, no IO or UI dependencies.
import type { Vec2, Vec3, Axis } from './types';

let counter = 0;

/** Generate a reasonably unique, opaque id with an optional readable prefix. */
export function uid(prefix = 'id'): string {
  counter = (counter + 1) % Number.MAX_SAFE_INTEGER;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${rand}`;
}

export function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

export function isVec3(v: unknown): v is Vec3 {
  return Array.isArray(v) && v.length === 3 && v.every(isFiniteNumber);
}

export function isVec2(v: unknown): v is Vec2 {
  return Array.isArray(v) && v.length === 2 && v.every(isFiniteNumber);
}

export function assertVec3(v: unknown, what: string): asserts v is Vec3 {
  if (!isVec3(v)) throw new Error(`${what} must be a finite [number, number, number] triple`);
}

export function assertVec2(v: unknown, what: string): asserts v is Vec2 {
  if (!isVec2(v)) throw new Error(`${what} must be a finite [number, number] pair`);
}

export function isAxis(v: unknown): v is Axis {
  return v === 'x' || v === 'y' || v === 'z';
}

export const AXIS_INDEX: Record<Axis, 0 | 1 | 2> = { x: 0, y: 1, z: 2 };

export function v3(x: number, y: number, z: number): Vec3 {
  return [x, y, z];
}
export function v2(x: number, y: number): Vec2 {
  return [x, y];
}

export function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}
export function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
export function scale(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}
export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
export function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
export function length(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2]);
}
export function normalize(a: Vec3): Vec3 {
  const l = length(a);
  if (l === 0) throw new Error('cannot normalize a zero-length vector');
  return scale(a, 1 / l);
}

export function cloneVec2(v: Vec2): Vec2 {
  return [v[0], v[1]];
}
export function cloneVec3(v: Vec3): Vec3 {
  return [v[0], v[1], v[2]];
}

/** Componentwise scale of a vector (used by the mesh scale transform). */
export function mulVec(a: Vec3, b: Vec3): Vec3 {
  return [a[0] * b[0], a[1] * b[1], a[2] * b[2]];
}

/** Euler rotation applied as Rz*Ry*Rx (degrees are never used internally). */
export function rotateVec(v: Vec3, rot: Vec3): Vec3 {
  let [x, y, z] = v;
  // X axis
  let c = Math.cos(rot[0]);
  let s = Math.sin(rot[0]);
  let y2 = y * c - z * s;
  let z2 = y * s + z * c;
  y = y2;
  z = z2;
  // Y axis
  c = Math.cos(rot[1]);
  s = Math.sin(rot[1]);
  let x2 = x * c + z * s;
  z2 = -x * s + z * c;
  x = x2;
  z = z2;
  // Z axis
  c = Math.cos(rot[2]);
  s = Math.sin(rot[2]);
  x2 = x * c - y * s;
  y2 = x * s + y * c;
  x = x2;
  y = y2;
  return [x, y, z];
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function deepClone<T>(value: T): T {
  return structuredClone(value);
}

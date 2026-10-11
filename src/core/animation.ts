// Deterministic clip evaluation. Input meshes/animation are never mutated;
// evaluation is a pure function of (mesh, animation, time).
import type { Animation, Axis, Clip, Curve, Mesh, Pose, Vec3, ClipType } from './types';
import { AXIS_INDEX } from './util';
import { ValidationError } from './validate';

function clipProgress(clip: Clip, time: number): number | null {
  const end = clip.start + clip.duration;
  if (time < clip.start) return null; // before start contributes zero
  if (clip.duration <= 0) throw new ValidationError(`clip ${clip.id} duration must be positive`);
  // Continuous transforms clamp at the end (no looping, no snap-back);
  // interval-bound effects (visibility, oscillation) handle their own bounds.
  let t = time >= end ? 1 : (time - clip.start) / clip.duration;
  if (clip.pingPong) {
    // triangular envelope: 0→1→0 over the clip duration. The midpoint reaches the full requested amount, then returns to zero.
    t = t <= 0.5 ? t * 2 : (1 - t) * 2;
  }
  return applyCurve(t, clip.curve);
}

function applyCurve(t: number, curve: Curve): number {
  switch (curve) {
    case 'linear': return t;
    case 'easeIn': return t * t;
    case 'easeOut': return 1 - (1 - t) * (1 - t);
    case 'easeInOut': return t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t);
    default: throw new ValidationError(`unknown curve ${String(curve)}`);
  }
}

function axisVec(axis: Axis, amount: number): Vec3 {
  const out: Vec3 = [0, 0, 0];
  out[AXIS_INDEX[axis]] = amount;
  return out;
}

/**
 * Evaluate a mesh's pose at `time` by composing every clip attached to it.
 * Clips are applied sorted by track, then start, then id. Movement/rotation
 * add; scale multiplies; visibility hides only while an interval is active;
 * oscillation contributes a sine contribution only during its interval.
 */
export function evaluateMesh(mesh: Mesh, animation: Animation, time: number): Pose {
  if (!Number.isFinite(time)) throw new ValidationError('evaluation time must be finite');
  const pose: Pose = {
    position: [...mesh.position],
    rotation: [...mesh.rotation],
    scale: [...mesh.scale],
    visible: mesh.visible,
  };
  const clips = animation.clips
    .filter((c) => c.meshId === mesh.id)
    .sort((a, b) =>
      a.track - b.track ||
      a.start - b.start ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );

  let anyVisibility = false;
  for (const clip of clips) {
    switch (clip.type) {
      case 'movement': {
        const p = clipProgress(clip, time);
        if (p === null) break; // before start contributes zero
        const amt = clip.amount * p;
        const d = axisVec(clip.axis, amt);
        pose.position[0] += d[0]; pose.position[1] += d[1]; pose.position[2] += d[2];
        break;
      }
      case 'rotation': {
        const p = clipProgress(clip, time);
        if (p === null) break;
        pose.rotation[AXIS_INDEX[clip.axis]] += clip.amount * p;
        break;
      }
      case 'scale': {
        // scale factor multiplies: 1 before start, lerp 1→amount during, clamp
        // at amount after end (consistent with movement/rotation clamping)
        let factor = 1;
        if (time >= clip.start) {
          const p = clipProgress(clip, time)!;
          factor = 1 + (clip.amount - 1) * p;
        }
        pose.scale[AXIS_INDEX[clip.axis]] *= factor;
        break;
      }
      case 'visibility': {
        const end = clip.start + clip.duration;
        if (time >= clip.start && time <= end) {
          anyVisibility = true;
          pose.visible = false;
        }
        break;
      }
      case 'oscillation': {
        const end = clip.start + clip.duration;
        if (time < clip.start || time > end) break; // zero outside interval
        const local = time - clip.start;
        const contribution = Math.sin(2 * Math.PI * clip.frequency * local) * clip.amount;
        switch (clip.property) {
          case 'movement': {
            const d = axisVec(clip.axis, contribution);
            pose.position[0] += d[0]; pose.position[1] += d[1]; pose.position[2] += d[2];
            break;
          }
          case 'rotation':
            pose.rotation[AXIS_INDEX[clip.axis]] += contribution;
            break;
          case 'scale': {
            const factor = 1 + contribution;
            pose.scale[AXIS_INDEX[clip.axis]] *= factor;
            break;
          }
        }
        break;
      }
      default:
        throw new ValidationError(`unknown clip type ${String((clip as Clip).type satisfies ClipType)}`);
    }
  }
  void anyVisibility;
  return pose;
}

export function createClip(meshId: string, type: ClipType, track = 0): Clip {
  if (typeof meshId !== 'string' || meshId.length === 0) throw new ValidationError('createClip needs a mesh id');
  if (!Number.isInteger(track) || track < 0 || track > 3) {
    throw new ValidationError('clip track must be an integer 0…3');
  }
  const axis: Axis = type === 'rotation' ? 'z' : 'y';
  return {
    id: `clip_${Math.random().toString(36).slice(2, 10)}`,
    meshId,
    track,
    type,
    axis,
    start: 0,
    duration: 1,
    amount: type === 'scale' ? 1 : type === 'visibility' ? 0 : 1,
    curve: 'linear',
    pingPong: false,
    frequency: 1,
    property: 'movement',
  };
}

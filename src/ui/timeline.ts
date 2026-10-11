import type {Clip,ClipType,Project} from '../core/types';
import {createClip} from '../core';
export type ClipGestureKind='move'|'left'|'right';
export const MIN_CLIP_DURATION=0.05;
export function validLibraryType(value:unknown):value is ClipType{return ['movement','rotation','scale','visibility','oscillation'].includes(String(value))}
export function animationLocked(project:Project,meshId:string):boolean{const mesh=project.meshes.find(m=>m.id===meshId);return !mesh||mesh.locked||project.folders.some(f=>f.id===mesh.folderId&&f.locked)}
function finite(v:number,name:string){if(!Number.isFinite(v))throw new Error(`${name} must be finite`)}
export function snapTime(value:number,snap:number,disable=false):number{finite(value,'Time');finite(snap,'Snap');return !disable&&snap>0?Number((Math.round(value/snap)*snap).toFixed(9)):value}
export function libraryClip(meshId:string,type:ClipType,track:number,start:number,length:number,snap=0.05,disable=false):Clip {
 if(!validLibraryType(type))throw new Error('Unknown clip type');finite(length,'Timeline length');if(length<=0)throw new Error('Timeline must be positive');
 const clip=createClip(meshId,type,track);clip.duration=Math.min(1,length);clip.start=Math.max(0,Math.min(length-clip.duration,snapTime(start,snap,disable)));
 if(type==='movement')clip.amount=1;if(type==='rotation')clip.amount=Math.PI/6;if(type==='scale')clip.amount=1.5;if(type==='oscillation'){clip.frequency=1;clip.property='movement';clip.amount=0.5}
 return clip;
}
/** Gesture samples always derive from the initial clip, never the last preview.
 * Left resize holds the original right edge; right resize holds the start.
 * Existing overlength clips can be moved but keep their authored duration. */
export function sampleClipGesture(initial:Clip,kind:ClipGestureKind,time:number,track:number,length:number,snap=0.05,disable=false):Clip {
 finite(time,'Pointer time');finite(length,'Timeline length');if(length<=0)throw new Error('Timeline must be positive');if(!Number.isInteger(track)||track<0||track>3)throw new Error('Track must be 0–3');
 const out=structuredClone(initial),minimum=Math.min(MIN_CLIP_DURATION,length),end=initial.start+initial.duration;
 if(kind==='move'){out.start=Math.max(0,Math.min(Math.max(0,length-initial.duration),snapTime(time,snap,disable)));out.track=track}
 if(kind==='left'){out.start=Math.max(0,Math.min(end-minimum,snapTime(time,snap,disable)));out.duration=end-out.start}
 if(kind==='right'){const edge=Math.max(initial.start+minimum,Math.min(Math.max(length,initial.start+minimum),snapTime(time,snap,disable)));out.duration=edge-initial.start}
 out.start=Number(out.start.toFixed(9));out.duration=Number(out.duration.toFixed(9));return out;
}
export function clipTimingChanged(a:Clip,b:Clip):boolean{return a.track!==b.track||Math.abs(a.start-b.start)>1e-8||Math.abs(a.duration-b.duration)>1e-8}
export interface TrackRect {track:number;left:number;right:number;top:number;bottom:number}
/** A gap between lanes belongs to the nearest lane; outside the whole track
 * area is invalid. Existing drags may clamp horizontal overflow, library drops
 * must actually land inside the timeline. */
export function laneAt(rects:TrackRect[],x:number,y:number,allowHorizontalOverflow=false):TrackRect|null {
 if(!rects.length)return null;const top=Math.min(...rects.map(r=>r.top)),bottom=Math.max(...rects.map(r=>r.bottom));if(y<top||y>bottom)return null;
 const lane=[...rects].sort((a,b)=>Math.abs((a.top+a.bottom)/2-y)-Math.abs((b.top+b.bottom)/2-y))[0];
 if(!allowHorizontalOverflow&&(x<lane.left||x>lane.right))return null;return lane;
}
export function pointerTime(rect:TrackRect,x:number,length:number):number{if(rect.right<=rect.left)throw new Error('Track has no width');return (x-rect.left)/(rect.right-rect.left)*length}
export function animationWithPreview(project:Project,clip:Clip|null):Project{if(!clip)return project;const found=project.animation.clips.some(c=>c.id===clip.id);return {...project,animation:{...project.animation,clips:found?project.animation.clips.map(c=>c.id===clip.id?clip:c):[...project.animation.clips,clip]}}}

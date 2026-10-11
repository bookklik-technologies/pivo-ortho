import * as THREE from 'three';
import type {Project,Vec3,Mesh} from '../core/types';
import {worldVertex} from '../core';
export type GizmoMode='move'|'rotate'|'scale';
export interface TransformSelection {meshIds:string[];vertexIds:string[];faceIds:string[];kind:'mesh'|'face'|'vertex';activeMeshId:string|null}
export interface TransformFrame {position:Vec3;rotation:Vec3;scale:Vec3}
export interface GizmoEvent {phase:'start'|'change'|'end'|'cancel';mode:GizmoMode;before:TransformFrame;after:TransformFrame}
export function locked(project:Project,mesh:Mesh):boolean{return mesh.locked||project.folders.some(f=>f.id===mesh.folderId&&f.locked)}
function selected(project:Project,s:TransformSelection){
 const vertices=new Set(s.kind==='vertex'?s.vertexIds:[]);
 if(s.kind==='face')for(const m of project.meshes)for(const f of m.faces)if(s.faceIds.includes(f.id))for(const id of f.vertices)vertices.add(id);
 const meshes=project.meshes.filter(m=>vertices.size?m.vertices.some(v=>vertices.has(v.id)):s.meshIds.includes(m.id));
 return {meshes,vertices};
}
const vec=(v:Vec3)=>new THREE.Vector3(...v);
const quaternion=(r:Vec3)=>new THREE.Quaternion().setFromEuler(new THREE.Euler(...r,'ZYX'));
const arr=(v:THREE.Vector3)=>v.toArray() as Vec3;
function matrix(f:TransformFrame){return new THREE.Matrix4().compose(vec(f.position),quaternion(f.rotation),vec(f.scale))}
function meshMatrix(m:Mesh){return new THREE.Matrix4().compose(vec(m.position).add(vec(m.pivot)),quaternion(m.rotation),vec(m.scale)).multiply(new THREE.Matrix4().makeTranslation(-m.pivot[0],-m.pivot[1],-m.pivot[2]))}
export function transformFrame(project:Project,s:TransformSelection):TransformFrame|null {
 const {meshes,vertices}=selected(project,s);
 if(!meshes.length||meshes.some(m=>locked(project,m)))return null;
 if(!vertices.size&&meshes.length===1){const m=meshes[0];return {position:arr(vec(m.position).add(vec(m.pivot))),rotation:[...m.rotation],scale:[...m.scale]}}
 const points:Vec3[]=vertices.size?meshes.flatMap(m=>m.vertices.filter(v=>vertices.has(v.id)).map(v=>worldVertex(m,v.position))):meshes.map(m=>arr(vec(m.position).add(vec(m.pivot))));
 if(!points.length)return null;
 return {position:arr(points.reduce((a,p)=>a.add(vec(p)),new THREE.Vector3()).multiplyScalar(1/points.length)),rotation:vertices.size&&meshes.length===1?[...meshes[0].rotation]:[0,0,0],scale:[1,1,1]};
}
function validate(f:TransformFrame){for(const key of ['position','rotation','scale'] as const)if(f[key].length!==3||!f[key].every(Number.isFinite))throw new Error('Gizmo transform must be finite');if(f.scale.some(v=>Math.abs(v)<0.0001))throw new Error('Gizmo scale cannot collapse an axis')}
/** Apply one gesture against an immutable baseline. Mesh pivots remain fixed in
 * local coordinates. Selected corners are transformed exactly in world space.
 * Multi-mesh nonuniform scale is baked into vertices to preserve affine shape
 * without pretending shear can be represented by one TRS. */
export function applyGizmoTransform(project:Project,s:TransformSelection,before:TransformFrame,after:TransformFrame,mode:GizmoMode):Project {
 validate(before);validate(after);
 const targets=selected(project,s);if(!targets.meshes.length)throw new Error('Nothing selected');if(targets.meshes.some(m=>locked(project,m)))throw new Error('Selection contains locked meshes');
 const out=structuredClone(project);const meshes=out.meshes.filter(m=>targets.meshes.some(t=>t.id===m.id));
 const delta=matrix(after).multiply(matrix(before).invert());
 if(targets.vertices.size){for(const m of meshes){const inverse=meshMatrix(m).invert();for(const v of m.vertices)if(targets.vertices.has(v.id))v.position=arr(vec(worldVertex(m,v.position)).applyMatrix4(delta).applyMatrix4(inverse));}return out}
 if(meshes.length===1){const m=meshes[0];if(mode==='move')m.position=arr(vec(after.position).sub(vec(m.pivot)));if(mode==='rotate')m.rotation=[...after.rotation];if(mode==='scale')m.scale=[...after.scale];return out}
 const dq=quaternion(after.rotation).multiply(quaternion(before.rotation).invert());
 for(const m of meshes){
  if(mode==='move')m.position=arr(vec(m.position).add(vec(after.position).sub(vec(before.position))));
  if(mode==='rotate'){const pivotWorld=vec(m.position).add(vec(m.pivot)).sub(vec(before.position)).applyQuaternion(dq).add(vec(after.position));m.position=arr(pivotWorld.sub(vec(m.pivot)));const e=new THREE.Euler().setFromQuaternion(dq.clone().multiply(quaternion(m.rotation)),'ZYX');m.rotation=[e.x,e.y,e.z]}
  if(mode==='scale'){const inverse=meshMatrix(m).invert();for(const v of m.vertices)v.position=arr(vec(worldVertex(m,v.position)).applyMatrix4(delta).applyMatrix4(inverse));}
 }
 return out;
}
export function transformChanged(a:TransformFrame,b:TransformFrame):boolean{return ['position','rotation','scale'].some(k=>(a[k as keyof TransformFrame]).some((v,i)=>Math.abs(v-b[k as keyof TransformFrame][i])>1e-7))}

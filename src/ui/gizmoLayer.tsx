import React,{useEffect,useRef} from 'react';
import * as THREE from 'three';
import {TransformControls} from 'three/examples/jsm/controls/TransformControls.js';
import type {GizmoMode,TransformFrame,GizmoEvent} from './transforms';
export interface GizmoLayerProps {
 camera:THREE.Camera|null;frame:TransformFrame|null;mode:'select'|GizmoMode;
 space:'world'|'local';translationSnap:number;rotationSnap:number;scaleSnap:number;
 onTransform:(event:GizmoEvent)=>void;
}
/** Separate transparent WebGL canvas: controls survive scene-preview rebuilds,
 * so a pointer gesture is never detached midway through a React rerender. */
export function GizmoLayer(props:GizmoLayerProps){
 const canvas=useRef<HTMLCanvasElement>(null),latest=useRef(props);latest.current=props;
 const state=useRef<{renderer:THREE.WebGLRenderer;control:TransformControls;scene:THREE.Scene;object:THREE.Object3D;before:TransformFrame|null;canceling:boolean;raf:number|null}|null>(null);
 const snapshot=(o:THREE.Object3D):TransformFrame=>{const e=new THREE.Euler().setFromQuaternion(o.quaternion,'ZYX');return {position:o.position.toArray() as [number,number,number],rotation:[e.x,e.y,e.z],scale:o.scale.toArray() as [number,number,number]}};
 useEffect(()=>{
  const el=canvas.current;if(!el)return;
  const camera=latest.current.camera??new THREE.PerspectiveCamera();
  const renderer=new THREE.WebGLRenderer({canvas:el,alpha:true,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));renderer.setClearColor(0,0);
  const scene=new THREE.Scene(),object=new THREE.Object3D();object.rotation.order='ZYX';scene.add(object);
  const control=new TransformControls(camera,el);control.setSize(0.85);control.attach(object);scene.add(control.getHelper());
  const s={renderer,control,scene,object,before:null as TransformFrame|null,canceling:false,raf:null as number|null};state.current=s;
  const redraw=()=>{if(s.raf!==null)return;s.raf=requestAnimationFrame(()=>{s.raf=null;const r=el.getBoundingClientRect();if(r.width<1||r.height<1)return;renderer.setSize(Math.round(r.width),Math.round(r.height),false);renderer.clear();renderer.render(scene,control.camera)})};
  const start=()=>{if(!latest.current.frame)return;s.before=snapshot(object);latest.current.onTransform({phase:'start',mode:latest.current.mode as GizmoMode,before:s.before,after:snapshot(object)})};
  const change=()=>{if(!s.before||s.canceling)return;latest.current.onTransform({phase:'change',mode:latest.current.mode as GizmoMode,before:s.before,after:snapshot(object)})};
  const end=()=>{if(!s.before||s.canceling)return;const before=s.before;s.before=null;latest.current.onTransform({phase:'end',mode:latest.current.mode as GizmoMode,before,after:snapshot(object)})};
  const cancel=()=>{if(!s.before)return;const before=s.before;s.canceling=true;control.reset();control.dragging=false;control.axis=null;s.before=null;s.canceling=false;latest.current.onTransform({phase:'cancel',mode:latest.current.mode as GizmoMode,before,after:before});redraw()};
  control.addEventListener('change',redraw);control.addEventListener('mouseDown',start);control.addEventListener('objectChange',change);control.addEventListener('mouseUp',end);
  // Stop the parent editor's free-drag/select path only for a real gizmo hit.
  const down=(e:PointerEvent)=>{if(control.dragging){e.stopPropagation();el.dataset.dragging='true'}};
  const up=(e:PointerEvent)=>{if(el.dataset.dragging==='true'){e.stopPropagation();delete el.dataset.dragging}};
  el.addEventListener('pointerdown',down);el.addEventListener('pointerup',up);el.addEventListener('pointercancel',cancel);
  window.addEventListener('pivo-ortho:cancel-gesture',cancel);
  const ro=new ResizeObserver(redraw);ro.observe(el);redraw();
  return()=>{cancel();ro.disconnect();window.removeEventListener('pivo-ortho:cancel-gesture',cancel);el.removeEventListener('pointerdown',down);el.removeEventListener('pointerup',up);el.removeEventListener('pointercancel',cancel);if(s.raf!==null)cancelAnimationFrame(s.raf);control.dispose();renderer.dispose();renderer.forceContextLoss();state.current=null};
 },[]);
 useEffect(()=>{
  const s=state.current;if(!s)return;const c=s.control;
  if(props.camera)c.camera=props.camera;
  c.enabled=!!props.frame&&props.mode!=='select';c.getHelper().visible=c.enabled;
  c.setMode(props.mode==='move'?'translate':props.mode==='select'?'translate':props.mode);
  c.setSpace(props.space);c.setTranslationSnap(props.translationSnap>0?props.translationSnap:null);c.setRotationSnap(props.rotationSnap>0?props.rotationSnap*Math.PI/180:null);c.setScaleSnap(props.scaleSnap>0?props.scaleSnap:null);
  if(props.frame&&!s.before){s.object.position.fromArray(props.frame.position);s.object.rotation.set(...props.frame.rotation,'ZYX');s.object.scale.fromArray(props.frame.scale);s.object.updateMatrixWorld(true)}
  const el=canvas.current;if(!el)return;const rect=el.getBoundingClientRect();s.renderer.setSize(Math.max(1,Math.round(rect.width)),Math.max(1,Math.round(rect.height)),false);s.renderer.clear();s.renderer.render(s.scene,c.camera);
 },[props.camera,props.frame,props.mode,props.space,props.translationSnap,props.rotationSnap,props.scaleSnap]);
 return <canvas ref={canvas} className="gizmo-canvas" aria-label={`Graphical ${props.mode} gizmo`} data-gizmo-mode={props.mode} data-enabled={!!props.frame&&props.mode!=='select'} style={{pointerEvents:props.frame&&props.mode!=='select'?'auto':'none'}}/>;
}

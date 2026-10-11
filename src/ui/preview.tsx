import React, {useEffect, useRef, useState} from 'react';
import type {Project} from '../core/types';
import {evaluateMesh} from '../core';
import {captureFrame, collectFaces, makeCaptureCamera} from './render';

/** An actual scene render, shared by paint and animated previews. */
export function ScenePreview({project,time=0,animated=false}:{project:Project;time?:number;animated?:boolean}) {
 const ref=useRef<HTMLCanvasElement>(null);
 const [error,setError]=useState('');
 useEffect(()=>{
  const canvas=ref.current; if(!canvas)return;
  try {
   const scene=collectFaces(project,animated ? id=>{const m=project.meshes.find(m=>m.id===id);return m?evaluateMesh(m,project.animation,time):null} : undefined);
   const bounds=animated?collectFaces(project).bounds:scene.bounds;
   const target=bounds.min.map((v,i)=>(v+bounds.max[i])/2) as [number,number,number];
   const radius=Math.max(1,...bounds.max.map((v,i)=>v-bounds.min[i]));
   const camera=makeCaptureCamera({kind:'orbit',target,yaw:Math.PI/4,pitch:0.35,distance:(radius+(animated?Math.max(0,...project.meshes.map(m=>project.animation.clips.filter(c=>c.meshId===m.id&&(c.type==='movement'||c.type==='oscillation'&&c.property==='movement')).reduce((n,c)=>n+Math.abs(c.amount),0))):0))*2.1,fov:45},1.4);
   const rgba=captureFrame(scene,project,camera,{width:280,height:200,transparent:false,clearColor:project.render.background});
   const ctx=canvas.getContext('2d'); if(!ctx)return;
   const image=ctx.createImageData(280,200); image.data.set(rgba); ctx.putImageData(image,0,0);
   setError('');
  } catch(e){setError((e as Error).message)}
 },[project,time,animated]);
 return <div className="scene-preview"><canvas ref={ref} width={280} height={200} aria-label={animated?'Live animated scene preview':'Live textured scene preview'} />{error&&<p role="alert">Preview error: {error}</p>}</div>;
}

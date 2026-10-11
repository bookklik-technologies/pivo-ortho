import {useEffect,useRef,useState,useCallback} from 'react';
import type React from 'react';
import {nextTextureZoom,zoomAt,TEXTURE_ZOOMS} from './textureTools';
interface Options {zoom:number;setZoom:(zoom:number)=>void;isEditing?:()=>boolean}
/** Scroll-based navigation keeps canvas and pointer coordinates in the same
 * native CSS geometry; no hidden transform changes pixel picking. */
export function useTextureNavigation(options:Options){
 const container=useRef<HTMLDivElement|null>(null),latest=useRef(options);latest.current=options;
 const space=useRef(false),hovered=useRef(false),pan=useRef<{id:number;x:number;y:number;left:number;top:number}|null>(null);
 const [panning,setPanning]=useState(false);
 const changeZoom=useCallback((zoom:number,x?:number,y?:number)=>{
  const host=container.current,canvas=host?.querySelector('canvas');if(!host||!canvas||latest.current.isEditing?.())return;
  const hr=host.getBoundingClientRect(),cr=canvas.getBoundingClientRect();
  const point:[number,number]=[x??hr.left+host.clientWidth/2,y??hr.top+host.clientHeight/2];
  const destination=zoomAt(latest.current.zoom,zoom,point,[cr.left,cr.top],[host.scrollLeft,host.scrollTop]);
  latest.current.setZoom(zoom);requestAnimationFrame(()=>{host.scrollLeft=destination[0];host.scrollTop=destination[1]});
 },[]);
 const fit=useCallback(()=>{const host=container.current;if(!host||latest.current.isEditing?.())return;const limit=Math.max(1,Math.min(16,Math.floor(Math.min(host.clientWidth-24,host.clientHeight-24)/128)));changeZoom([...TEXTURE_ZOOMS].reverse().find(z=>z<=limit)??1);requestAnimationFrame(()=>{host.scrollLeft=0;host.scrollTop=0})},[changeZoom]);
 const reset=useCallback(()=>{const host=container.current;if(!host||latest.current.isEditing?.())return;changeZoom(4);requestAnimationFrame(()=>{host.scrollLeft=0;host.scrollTop=0})},[changeZoom]);
 const endPan=useCallback((cancel=false)=>{const g=pan.current,host=container.current;if(!g||!host)return;pan.current=null;setPanning(false);if(cancel){host.scrollLeft=g.left;host.scrollTop=g.top}try{if(host.hasPointerCapture(g.id))host.releasePointerCapture(g.id)}catch{}},[]);
 const beginPan=useCallback((event:React.PointerEvent)=>{
  if(event.button!==1&&!(event.button===0&&space.current))return false;
  event.preventDefault();event.stopPropagation();const host=container.current;if(!host||latest.current.isEditing?.())return true;
  host.focus({preventScroll:true});host.setPointerCapture(event.pointerId);pan.current={id:event.pointerId,x:event.clientX,y:event.clientY,left:host.scrollLeft,top:host.scrollTop};setPanning(true);return true;
 },[]);
 useEffect(()=>{
  const host=container.current;if(!host)return;
  const wheel=(e:WheelEvent)=>{e.preventDefault();if(pan.current||latest.current.isEditing?.())return;changeZoom(nextTextureZoom(latest.current.zoom,e.deltaY<0?1:-1),e.clientX,e.clientY)};
  const move=(e:PointerEvent)=>{const g=pan.current;if(!g||g.id!==e.pointerId)return;host.scrollLeft=g.left-(e.clientX-g.x);host.scrollTop=g.top-(e.clientY-g.y)};
  const up=(e:PointerEvent)=>{if(pan.current?.id===e.pointerId)endPan(false)};
  const cancel=()=>{space.current=false;endPan(true)};
  const down=(e:KeyboardEvent)=>{const target=e.target as HTMLElement|null;if(target?.matches('input,textarea,select')||target?.isContentEditable)return;if(!hovered.current&&!host.contains(document.activeElement))return;
   if(e.code==='Space'){e.preventDefault();space.current=true}
   if(e.key==='Escape'){cancel();return}
   if(e.key==='+'||e.key==='='||e.key==='-'){e.preventDefault();changeZoom(nextTextureZoom(latest.current.zoom,e.key==='-'?-1:1))}
   if(e.key==='Home'){e.preventDefault();fit()}
   if(e.key.startsWith('Arrow')&&!latest.current.isEditing?.()){e.preventDefault();host.scrollLeft+=(e.key==='ArrowRight'?32:e.key==='ArrowLeft'?-32:0);host.scrollTop+=(e.key==='ArrowDown'?32:e.key==='ArrowUp'?-32:0)}
  };
  const keyUp=(e:KeyboardEvent)=>{if(e.code==='Space')space.current=false};
  host.addEventListener('wheel',wheel,{passive:false});window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);window.addEventListener('pointercancel',cancel);window.addEventListener('keydown',down);window.addEventListener('keyup',keyUp);window.addEventListener('blur',cancel);window.addEventListener('pivo-ortho:cancel-gesture',cancel);
  return()=>{host.removeEventListener('wheel',wheel);window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',cancel);window.removeEventListener('keydown',down);window.removeEventListener('keyup',keyUp);window.removeEventListener('blur',cancel);window.removeEventListener('pivo-ortho:cancel-gesture',cancel);pan.current=null};
 },[changeZoom,endPan,fit]);
 return {container,panning,beginPan,changeZoom,fit,reset,bind:{tabIndex:0,onPointerEnter:()=>{hovered.current=true},onPointerLeave:()=>{hovered.current=false},onPointerDown:(e:React.PointerEvent)=>{beginPan(e)}}};
}

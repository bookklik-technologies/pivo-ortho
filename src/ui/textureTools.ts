import type {Texture,Vec2,Project} from '../core/types';
import {marqueeCopy,marqueePaste} from '../core';
export type PixelRect=[number,number,number,number];
export function selectionRect(a:Vec2,b:Vec2):PixelRect{return [Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.abs(a[0]-b[0])+1,Math.abs(a[1]-b[1])+1]}
export function pointInRect(p:Vec2,r:PixelRect):boolean{return p[0]>=r[0]&&p[1]>=r[1]&&p[0]<r[0]+r[2]&&p[1]<r[1]+r[3]}
export function boundedMove(r:PixelRect,delta:Vec2,size=128):PixelRect {
 if(r.length!==4||!r.every(Number.isFinite)||r[2]<1||r[3]<1||r[2]>size||r[3]>size||!delta.every(Number.isFinite))throw new Error('Invalid marquee bounds');
 return [Math.max(0,Math.min(size-r[2],r[0]+Math.round(delta[0]))),Math.max(0,Math.min(size-r[3],r[1]+Math.round(delta[1]))),r[2],r[3]];
}
/** Clear original pixels first, then paste a snapshot. Overlapping moves never
 * read partly moved data. Copy uses the same destination math without clearing. */
export function movedTexture(texture:Texture,source:PixelRect,destination:PixelRect,copy=false):Texture {
 if(![...source,...destination].every(Number.isInteger)||source[2]!==destination[2]||source[3]!==destination[3]||source[0]<0||source[1]<0||source[0]+source[2]>128||source[1]+source[3]>128||destination[0]<0||destination[1]<0||destination[0]+destination[2]>128||destination[1]+destination[3]>128)throw new Error('Marquee must fit inside the texture');
 const out=structuredClone(texture),patch=marqueeCopy(texture,...source);
 if(!copy)for(let y=source[1];y<source[1]+source[3];y++)for(let x=source[0];x<source[0]+source[2];x++)out.pixels[y*128+x]=texture.transparent;
 marqueePaste(out,patch,destination[0],destination[1]);return out;
}
export interface UVCorner {meshId:string;faceId:string;corner:number;uv:Vec2}
export function previewUV(project:Project,corners:UVCorner[],delta:Vec2,snap=1,disableSnap=false):Project {
 if(!delta.every(Number.isFinite)||!Number.isFinite(snap)||snap<0)throw new Error('UV motion must be finite');
 const d=delta.map(v=>!disableSnap&&snap>0?Math.round(v/snap)*snap:v) as Vec2;
 const out=structuredClone(project);
 for(const c of corners){const mesh=out.meshes.find(m=>m.id===c.meshId);if(!mesh)throw new Error('UV mesh no longer exists');if(mesh.locked||out.folders.some(f=>f.id===mesh.folderId&&f.locked))throw new Error('UV mesh or folder is locked');const face=mesh.faces.find(f=>f.id===c.faceId);if(!face||!face.uv[c.corner])throw new Error('UV corner no longer exists');face.uv[c.corner]=[c.uv[0]+d[0],c.uv[1]+d[1]]}
 return out;
}
export function zoomAt(oldZoom:number,newZoom:number,point:Vec2,canvasOrigin:Vec2,scroll:Vec2):Vec2 {
 if(oldZoom<=0||newZoom<=0||![oldZoom,newZoom,...point,...canvasOrigin,...scroll].every(Number.isFinite))throw new Error('Invalid zoom parameters');
 return [Math.max(0,scroll[0]+(point[0]-canvasOrigin[0])*(newZoom/oldZoom-1)),Math.max(0,scroll[1]+(point[1]-canvasOrigin[1])*(newZoom/oldZoom-1))];
}
export const TEXTURE_ZOOMS=[1,2,3,4,5,6,8,12,16];
export function nextTextureZoom(current:number,direction:number):number{const index=TEXTURE_ZOOMS.indexOf(current);if(index>=0)return TEXTURE_ZOOMS[Math.max(0,Math.min(TEXTURE_ZOOMS.length-1,index+(direction>0?1:-1)))];return direction>0?(TEXTURE_ZOOMS.find(z=>z>current)??16):([...TEXTURE_ZOOMS].reverse().find(z=>z<current)??1)}

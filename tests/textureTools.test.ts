import {describe,it,expect} from 'vitest';
import {createProject,createPrimitive} from '../src/core';
import {movedTexture,boundedMove,selectionRect,pointInRect,previewUV,zoomAt,nextTextureZoom} from '../src/ui/textureTools';
describe('Marquee transactions',()=>{
 it('Selections normalize reverse drags and include the endpoint',()=>expect(selectionRect([5,6],[2,3])).toEqual([2,3,4,4]));
 it('Selection hit-testing excludes the outside right/bottom edges',()=>{expect(pointInRect([3,3],[2,2,2,2])).toBe(true);expect(pointInRect([4,3],[2,2,2,2])).toBe(false)});
 it('Move clears source to transparent and replaces destination from a snapshot',()=>{const t=createProject().texture;t.pixels.fill(7);t.pixels[1*128+1]=8;const out=movedTexture(t,[1,1,1,1],[5,6,1,1]);expect(out.pixels[129]).toBe(t.transparent);expect(out.pixels[6*128+5]).toBe(8);expect(t.pixels[129]).toBe(8)});
 it('Overlapping moves never smear or reread already moved pixels',()=>{const t=createProject().texture;t.pixels.fill(7);t.pixels[0]=2;t.pixels[1]=3;t.pixels[2]=4;const out=movedTexture(t,[0,0,3,1],[1,0,3,1]);expect(out.pixels.slice(0,4)).toEqual([t.transparent,2,3,4])});
 it('Copy drag preserves source and pastes all palette indices',()=>{const t=createProject().texture;t.pixels[0]=9;const out=movedTexture(t,[0,0,1,1],[5,0,1,1],true);expect(out.pixels[0]).toBe(9);expect(out.pixels[5]).toBe(9)});
 it('Transparent selected pixels overwrite destination consistently',()=>{const t=createProject().texture;t.pixels.fill(8);t.pixels[0]=t.transparent;expect(movedTexture(t,[0,0,1,1],[1,0,1,1],true).pixels[1]).toBe(t.transparent)});
 it('No-op moves restore every texture value',()=>{const t=createProject().texture;expect(movedTexture(t,[8,8,4,4],[8,8,4,4])).toEqual(t)});
 it('Moves clamp the whole selection rather than crop pixels',()=>{expect(boundedMove([10,10,8,9],[-100,-100])).toEqual([0,0,8,9]);expect(boundedMove([10,10,8,9],[500,500])).toEqual([120,119,8,9])});
 it('Invalid or differently sized source/destination rectangles reject',()=>{const t=createProject().texture;expect(()=>movedTexture(t,[0,0,2,2],[127,127,2,2])).toThrow();expect(()=>movedTexture(t,[0,0,2,2],[3,3,3,2])).toThrow();expect(()=>boundedMove([0,0,200,1],[0,0])).toThrow()});
});
describe('UV preview isolation',()=>{
 function setup(){const p=createProject(),m=createPrimitive('cube');p.meshes=[m];const f=m.faces[0];return {p,m,f,c:[{meshId:m.id,faceId:f.id,corner:0,uv:[...f.uv[0]] as [number,number]}]}}
 it('Preview moves selected corners, not adjacent corners or saved state',()=>{const {p,m,f,c}=setup();const out=previewUV(p,c,[3,4],1);expect(out.meshes[0].faces[0].uv[0]).toEqual([f.uv[0][0]+3,f.uv[0][1]+4]);expect(out.meshes[0].faces[0].uv[1]).toEqual(f.uv[1]);expect(m.faces[0].uv[0]).toEqual(c[0].uv);expect(out.texture).toEqual(p.texture)});
 it('UV snapping supports modifier override',()=>{const {p,c}=setup();const snapped=previewUV(p,c,[3.2,2.3],4).meshes[0].faces[0].uv[0];expect(snapped).toEqual([12,12]);const raw=previewUV(p,c,[3.2,2.3],4,true).meshes[0].faces[0].uv[0];expect(raw[0]).toBeCloseTo(11.2);expect(raw[1]).toBeCloseTo(10.3)});
 it('Nonfinite motion and missing corners are rejected',()=>{const {p,c}=setup();expect(()=>previewUV(p,c,[Infinity,0])).toThrow();expect(()=>previewUV(p,[{...c[0],corner:50}],[1,1])).toThrow()});
 it('Mesh and folder locks block UV previews before any state mutation',()=>{const {p,m,c}=setup();m.locked=true;expect(()=>previewUV(p,c,[1,1])).toThrow(/locked/);m.locked=false;m.folderId='f';p.folders=[{id:'f',name:'Folder',visible:true,locked:true}];expect(()=>previewUV(p,c,[1,1])).toThrow(/locked/)});
 it('Opaque face IDs containing colons are handled directly',()=>{const {p,f,c}=setup();f.id='face:with:colon';c[0].faceId=f.id;expect(previewUV(p,c,[1,1]).meshes[0].faces[0].uv[0]).toEqual([9,9])});
});
describe('Texture navigation math',()=>{
 it('Pointer-anchored zoom compensates scrolling exactly',()=>expect(zoomAt(4,8,[150,120],[50,20],[80,90])).toEqual([180,190]));
 it('Zoom-out scroll clamps to valid nonnegative offsets',()=>expect(zoomAt(8,1,[100,100],[0,0],[10,10])).toEqual([0,0]));
 it('Zoom presets stay bounded and support fit-generated intermediate values',()=>{expect(nextTextureZoom(16,1)).toBe(16);expect(nextTextureZoom(1,-1)).toBe(1);expect(nextTextureZoom(7,1)).toBe(8);expect(nextTextureZoom(7,-1)).toBe(6)});
 it('Invalid zoom scales do not produce broken scroll geometry',()=>expect(()=>zoomAt(0,4,[0,0],[0,0],[0,0])).toThrow());
});

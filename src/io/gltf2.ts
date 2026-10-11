import * as THREE from 'three';
import type {Project, ExportBundle, Mesh} from '../core/types';
import {evaluateMesh, triangulateFace, textureRGBA, worldVertex} from '../core';
import {encodePNG} from './png';
export interface GLTFOptions {animation?:boolean}

/** glTF2 with pivot-centered local geometry for animated nodes. No baked-world
 * delta rotations: those incorrectly rotate translated meshes about the origin. */
export function exportGLTF(project:Project,options:GLTFOptions={}):ExportBundle {
 const chunks:Uint8Array[]=[]; let byteLength=0;
 const accessors:any[]=[]; const views:any[]=[]; const materials:any[]=[];
 const meshes:any[]=[]; const nodes:any[]=[]; const roots:number[]=[];
 const warnings=new Set<string>(); const channels:any[]=[]; const samplers:any[]=[];
 const animated=!!options.animation;
 const materialMap=new Map<string,number>();
 function pack(values:number[],type:string,target?:number):number {
  const components=type==='SCALAR'?1:type==='VEC2'?2:type==='VEC3'?3:4;
  const pad=(4-byteLength%4)%4; if(pad){chunks.push(new Uint8Array(pad));byteLength+=pad}
  const data=new Float32Array(values); const bytes=new Uint8Array(data.buffer);
  const view=views.push({buffer:0,byteOffset:byteLength,byteLength:bytes.length,...(target?{target}: {})})-1;
  chunks.push(bytes);byteLength+=bytes.length;
  const accessor:any={bufferView:view,componentType:5126,count:values.length/components,type};
  if(target===34962 && type==='VEC3' || type==='SCALAR') {
   accessor.min=Array.from({length:components},(_,c)=>Math.min(...values.filter((_,i)=>i%components===c)));
   accessor.max=Array.from({length:components},(_,c)=>Math.max(...values.filter((_,i)=>i%components===c)));
  }
  return accessors.push(accessor)-1;
 }
 function mat(color:number,textured:boolean,doubleSided:boolean):number {
  const key=`${textured?'texture':color}:${doubleSided}`;
  const old=materialMap.get(key); if(old!==undefined)return old;
  const hex=project.texture.palette[color];
  const rgb=[1,3,5].map(i=>{const v=parseInt(hex.slice(i,i+2),16)/255;return v<=0.04045?v/12.92:Math.pow((v+0.055)/1.055,2.4)});
  const index=materials.push({name:key,doubleSided,alphaMode:textured?'MASK':'OPAQUE',...(textured?{alphaCutoff:0.5}:{}),pbrMetallicRoughness:{baseColorFactor:textured?[1,1,1,1]:[...rgb,1],metallicFactor:0,roughnessFactor:1,...(textured?{baseColorTexture:{index:0}}:{})}})-1;
  materialMap.set(key,index);return index;
 }
 const rotation=(r:[number,number,number])=>new THREE.Quaternion().setFromEuler(new THREE.Euler(...r,'ZYX')).toArray();
 for(const mesh of project.meshes) {
  if(!mesh.visible || project.folders.some(f=>f.id===mesh.folderId&&!f.visible)){warnings.add(`Hidden mesh ${mesh.name} was skipped`);continue}
  if(!mesh.faces.length)continue;
  const pose=evaluateMesh(mesh,project.animation,0);
  const groups=new Map<number,{pos:number[];uv:number[];normal:number[]}>();
  for(const face of mesh.faces) {
   if(face.drawBehind)warnings.add('drawBehind ordering is not representable in glTF');
   if(face.shaded)warnings.add('Palette shade ramps and retro lighting are not portable glTF semantics');
   const mi=mat(face.color,face.textured,face.doubleSided);
   let group=groups.get(mi);if(!group){group={pos:[],uv:[],normal:[]};groups.set(mi,group)}
   const indices=triangulateFace(mesh,face);
   for(let t=0;t<indices.length;t+=3) {
    const points=indices.slice(t,t+3).map(ci=>{const v=mesh.vertices.find(v=>v.id===face.vertices[ci])!;return animated?v.position.map((n,i)=>n-mesh.pivot[i]) as [number,number,number]:worldVertex(mesh,v.position,pose)});
    const a=new THREE.Vector3(...points[0]),b=new THREE.Vector3(...points[1]),c=new THREE.Vector3(...points[2]);
    const normal=b.sub(a).cross(c.sub(a)).normalize().toArray();
    for(let k=0;k<3;k++) {
     group.pos.push(...points[k]);group.normal.push(...normal);
     const uv=face.uv[indices[t+k]];
     // glTF UV V increases down from the image's top-left. Preserve continuous
     // seam coordinates instead of wrapping each corner before interpolation.
     group.uv.push((uv[0]+0.5)/128,(uv[1]+0.5)/128);
    }
   }
  }
  const primitives=[...groups].map(([mi,g])=>({attributes:{POSITION:pack(g.pos,'VEC3',34962),NORMAL:pack(g.normal,'VEC3',34962),TEXCOORD_0:pack(g.uv,'VEC2',34962)},material:mi,mode:4}));
  const meshIndex=meshes.push({name:mesh.name,primitives})-1;
  const node:any={name:mesh.name,mesh:meshIndex};
  if(animated){node.translation=pose.position.map((v,i)=>v+mesh.pivot[i]);node.rotation=rotation(pose.rotation);node.scale=pose.scale}
  const ni=nodes.push(node)-1;roots.push(ni);
  const clips=project.animation.clips.filter(c=>c.meshId===mesh.id);
  if(clips.some(c=>c.type==='visibility'))warnings.add(`Visibility animation for ${mesh.name} is not representable in glTF and was skipped`);
  if(animated && clips.some(c=>c.type!=='visibility')) {
   const count=Math.ceil(project.animation.duration*project.animation.fps)+1;
   if(count>10000)throw new Error('glTF animation sample limit exceeded (10,000 per mesh)');
   const times=Array.from({length:Math.max(2,count)},(_,i)=>Math.min(project.animation.duration,i/project.animation.fps));
   const translations:number[]=[],rotations:number[]=[],scales:number[]=[];
   let prev:THREE.Quaternion|null=null;
   for(const time of times){
    const p=evaluateMesh(mesh,project.animation,time);
    translations.push(...p.position.map((v,i)=>v+mesh.pivot[i]));scales.push(...p.scale);
    const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(...p.rotation,'ZYX'));
    if(prev&&prev.dot(q)<0){q.x*=-1;q.y*=-1;q.z*=-1;q.w*=-1} prev=q.clone();rotations.push(...q.toArray());
   }
   const input=pack(times,'SCALAR');
   for(const [path,values,type] of [['translation',translations,'VEC3'],['rotation',rotations,'VEC4'],['scale',scales,'VEC3']] as const){
    const si=samplers.push({input,output:pack([...values],type),interpolation:'LINEAR'})-1;channels.push({sampler:si,target:{node:ni,path}});
   }
  }
 }
 if(!roots.length)throw new Error('exportGLTF: no visible geometry to export');
 if(project.render.affine)warnings.add('Affine texture interpolation is not portable; glTF uses perspective-correct UVs');
 if(channels.length)warnings.add(`Transform clips sampled at ${project.animation.fps} fps; visibility is unsupported`);
 const bin=new Uint8Array(byteLength);let offset=0;for(const c of chunks){bin.set(c,offset);offset+=c.length}
 const gltf:any={asset:{version:'2.0',generator:'PiVo Ortho'},scene:0,scenes:[{name:project.name,nodes:roots}],nodes,meshes,materials,accessors,bufferViews:views,buffers:[{uri:'model.bin',byteLength}],images:[{uri:'texture.png'}],textures:[{source:0,sampler:0}],samplers:[{magFilter:9728,minFilter:9728,wrapS:10497,wrapT:10497}]};
 if(channels.length)gltf.animations=[{name:'Timeline',channels,samplers}];
 return {files:[{name:'model.gltf',data:JSON.stringify(gltf,null,2),mime:'model/gltf+json'},{name:'model.bin',data:bin,mime:'application/octet-stream'},{name:'texture.png',data:encodePNG(128,128,textureRGBA(project.texture)),mime:'image/png'}],warnings:[...warnings],...(channels.length?{animationsExported:true}:{})};
}

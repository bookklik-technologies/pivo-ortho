import {writeFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import {createProject,createPrimitive,extrudeFace,createClip,serializeProject,parseProject} from '../src/core';
const base=process.cwd()+'/examples/';
const demo=createProject('Studio Robot');
for(const [name,position,scale,type] of [
 ['Body',[0,0.6,0],[1,1,0.8],'cube'],['Head',[0,1.5,0],[0.6,0.6,0.6],'cube'],
 ['Left arm',[-0.7,0.7,0],[0.2,0.7,0.2],'cube'],['Right arm',[0.7,0.7,0],[0.2,0.7,0.2],'cube'],
 ['Left leg',[-0.25,0,0],[0.25,0.4,0.3],'cube'],['Right leg',[0.25,0,0],[0.25,0.4,0.3],'cube'],
 ['Antenna',[0,2,0],[0.08,0.4,0.08],'cylinder']
] as const){const mesh=createPrimitive(type,name);mesh.position=[...position];mesh.scale=[...scale];mesh.faces.forEach(f=>f.textured=true);demo.meshes.push(mesh)}
const clip=createClip(demo.meshes[1].id,'oscillation');clip.axis='z';clip.property='rotation';clip.frequency=0.5;clip.duration=4;clip.amount=0.15;demo.animation.clips=[clip];
writeFileSync(base+'studio-robot.pvo',serializeProject(demo));
const fixture=createProject('50 meshes - 2100 faces');
for(let i=0;i<50;i++){const mesh=createPrimitive('cube',`Column ${i+1}`);mesh.position=[(i%10-4.5)*1.5,0,(Math.floor(i/10)-2)*1.5];for(let k=0;k<9;k++)extrudeFace(mesh,mesh.faces[0].id,0.2);fixture.meshes.push(mesh)}
let t=performance.now();const json=serializeProject(fixture);const serializeMs=performance.now()-t;t=performance.now();parseProject(json);const parseMs=performance.now()-t;writeFileSync(base+'performance-50-2100.pvo',json);
console.log(JSON.stringify({meshes:50,faces:fixture.meshes.reduce((n,m)=>n+m.faces.length,0),bytes:json.length,serializeMs,parseMs}));

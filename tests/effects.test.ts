import {describe,it,expect} from 'vitest';
import {parseGIF,decompressFrames} from 'gifuct-js';
import {applyFrameEffects,DEFAULT_EFFECTS,sanitizeEffects,cleanTag,tagWidth,loadFrameEffects,saveFrameEffects} from '../src/ui/effects';
import {encodeGIFDetailed} from '../src/io';
import {createProject} from '../src/core';
// RGB under alpha zero is unspecified in GIF; compare visible RGB and exact alpha.
function canonical(f:Uint8Array){const out=f.slice();for(let i=0;i<out.length;i+=4)if(out[i+3]===0)out.set([0,0,0],i);return out}
const transparent={transparent:true,background:'#010203'};
function frame(w:number,h:number){return new Uint8Array(w*h*4)}
function pixel(f:Uint8Array,w:number,x:number,y:number){return [...f.subarray((y*w+x)*4,(y*w+x)*4+4)]}
function set(f:Uint8Array,w:number,x:number,y:number,c:number[]=[240,100,20,255]){f.set(c,(y*w+x)*4)}
const alpha=(f:Uint8Array)=>f.filter((_,i)=>i%4===3).filter(x=>x>0).length;
const render=(f:Uint8Array,w:number,h:number,patch:Partial<typeof DEFAULT_EFFECTS>={})=>applyFrameEffects(f,w,h,{...DEFAULT_EFFECTS,...patch},transparent);

describe('Export pixel effects',()=>{
 it('Disabled effects preserve binary-alpha pixels without mutating input',()=>{const f=frame(5,5);set(f,5,2,2);const old=f.slice();expect(render(f,5,5)).toEqual(f);expect(f).toEqual(old)});
 it('One-pixel outline is an eight-neighbor silhouette',()=>{const f=frame(5,5);set(f,5,2,2);const out=render(f,5,5,{outline:true,outlineColor:'#123456'});expect(alpha(out)).toBe(9);expect(pixel(out,5,1,1)).toEqual([18,52,86,255]);expect(pixel(out,5,2,2)).toEqual([240,100,20,255])});
 it('Outline thickness uses the original mask and cannot spread iteratively',()=>{const f=frame(9,9);set(f,9,4,4);expect(alpha(render(f,9,9,{outline:true,outlineSize:2}))).toBe(25)});
 it('Image-edge outline clips and never wraps across rows',()=>{const f=frame(4,4);set(f,4,0,0);const out=render(f,4,4,{outline:true});expect(alpha(out)).toBe(4);expect(pixel(out,4,3,0)[3]).toBe(0)});
 it('Empty transparent scene stays empty with outline and scanlines',()=>{expect(alpha(render(frame(16,16),16,16,{outline:true,scanlines:true}))).toBe(0)});
 it('Opaque background uses chosen RGB instead of being mistaken for silhouette',()=>{const f=frame(5,5);set(f,5,2,2);const out=applyFrameEffects(f,5,5,{...DEFAULT_EFFECTS,outline:true,outlineColor:'#112233'},{transparent:false,background:'#abcdef'});expect(pixel(out,5,0,0)).toEqual([171,205,239,255]);expect(pixel(out,5,1,2)).toEqual([17,34,51,255])});
 it('Scanlines blend selected rows at a deterministic interval',()=>{const f=new Uint8Array(4*5*4).fill(255);const out=render(f,4,5,{scanlines:true,scanlineColor:'#000000',scanlineOpacity:0.5,scanlineSpacing:2});expect(pixel(out,4,0,0)).toEqual([255,255,255,255]);expect(pixel(out,4,0,1)).toEqual([128,128,128,255]);expect(pixel(out,4,0,3)).toEqual([128,128,128,255]);expect(pixel(out,4,0,4)).toEqual([255,255,255,255])});
 it('Zero-strength scanlines leave colors unchanged',()=>{const f=new Uint8Array(8*8*4).fill(255);expect(render(f,8,8,{scanlines:true,scanlineOpacity:0})).toEqual(f)});
 it('Full-strength scanlines produce the exact requested color',()=>{const f=new Uint8Array(8*8*4).fill(255);expect(pixel(render(f,8,8,{scanlines:true,scanlineOpacity:1,scanlineColor:'#102030'}),8,1,1)).toEqual([16,32,48,255])});
 it('Scanlines preserve transparent alpha and do not paint empty rows',()=>{const f=frame(8,8);set(f,8,2,1);expect(alpha(render(f,8,8,{scanlines:true}))).toBe(1)});
 it('Left tag renders real glyph pixels at a bottom-left anchor',()=>{const out=render(frame(64,32),64,32,{leftTag:'A',leftColor:'#ff0000'});expect(alpha(out)).toBeGreaterThan(8);expect(pixel(out,64,3,23)).toEqual([255,0,0,255]);expect(pixel(out,64,40,23)[3]).toBe(0)});
 it('Right tag anchors to the right margin',()=>{const out=render(frame(64,32),64,32,{rightTag:'A',rightColor:'#00ff00'});expect(pixel(out,64,58,23)).toEqual([0,255,0,255]);expect(pixel(out,64,3,23)[3]).toBe(0)});
 it('Pixel text scales without interpolation',()=>{const out=render(frame(64,40),64,40,{leftTag:'A',textScale:2});expect(pixel(out,64,6,22)[3]).toBe(255);expect(pixel(out,64,7,23)[3]).toBe(255);expect(tagWidth('AB',2)).toBe(22)});
 it('Lowercase intentionally renders as uppercase',()=>{expect(render(frame(64,32),64,32,{leftTag:'abc'})).toEqual(render(frame(64,32),64,32,{leftTag:'ABC'}))});
 it('Text is drawn after scanlines and stays legible',()=>{const out=render(frame(64,32),64,32,{leftTag:'A',leftColor:'#ff00ff',scanlines:true,scanlineOpacity:1});expect(pixel(out,64,3,23)).toEqual([255,0,255,255])});
 it('Long paired tags are truncated into separate halves',()=>{const out=render(frame(64,32),64,32,{leftTag:'AAAAAAAAAAAAAAA',rightTag:'BBBBBBBBBBBBBBB',leftColor:'#ff0000',rightColor:'#00ff00'});for(let y=0;y<32;y++){expect(pixel(out,64,31,y)[3]).toBe(0);expect(pixel(out,64,32,y)[3]).toBe(0)}});
 it('Tiny frames cannot cause out-of-bounds text writes',()=>{const out=render(frame(4,4),4,4,{leftTag:'LONG',rightTag:'TAGS',textScale:4});expect(out.length).toBe(64);expect(alpha(out)).toBe(0)});
 it('Invalid settings are bounded and sanitized',()=>{const s=sanitizeEffects({outlineSize:99,outlineColor:'bad',scanlineOpacity:Infinity,scanlineSpacing:-3,textScale:0,leftTag:'A'.repeat(99)});expect(s.outlineSize).toBe(4);expect(s.outlineColor).toBe(DEFAULT_EFFECTS.outlineColor);expect(s.scanlineSpacing).toBe(2);expect(s.textScale).toBe(1);expect(s.leftTag.length).toBe(48);expect(cleanTag('abc\n')).toBe('abc?')});
 it('Invalid dimensions and RGBA byte counts are rejected',()=>{expect(()=>render(frame(2,2),3,2)).toThrow(/dimensions/);expect(()=>render(frame(1,1),0,1)).toThrow();expect(()=>render(frame(1,1),Infinity,1)).toThrow()});
 it('Effect persistence is safe even if the storage getter throws',()=>{const old=Object.getOwnPropertyDescriptor(globalThis,'localStorage');Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw new Error('denied')}});try{expect(loadFrameEffects()).toEqual(DEFAULT_EFFECTS);expect(()=>saveFrameEffects(DEFAULT_EFFECTS)).not.toThrow()}finally{if(old)Object.defineProperty(globalThis,'localStorage',old);else Reflect.deleteProperty(globalThis,'localStorage')}});
 it('An independent GIF reader reconstructs effect frames and custom colors exactly',()=>{const p=createProject(),f=frame(32,24);set(f,32,15,6,[20,150,190,255]);const s={...DEFAULT_EFFECTS,outline:true,outlineColor:'#0b1019',scanlines:true,scanlineColor:'#13579b',leftTag:'A',leftColor:'#a1b2c3'};const a=render(f,32,24,s);set(f,32,18,6,[20,150,190,255]);const b=render(f,32,24,s);const encoded=encodeGIFDetailed([a,b],32,24,p.texture,10,{preserveColors:true});const decoded=decompressFrames(parseGIF(new Uint8Array(encoded.bytes).buffer),true);expect(decoded.length).toBe(2);expect(decoded[0].delay).toBe(100);expect(canonical(new Uint8Array(decoded[0].patch))).toEqual(a);expect(canonical(new Uint8Array(decoded[1].patch))).toEqual(b)});
 it('GIF custom opaque color equal to the transparent RGB is not lost',()=>{const p=createProject(),f=frame(2,2);const c=p.texture.palette[p.texture.transparent].slice(1).match(/../g)!.map(h=>parseInt(h,16));set(f,2,0,0,[...c,255]);const encoded=encodeGIFDetailed([f],2,2,p.texture,10,{preserveColors:true});const decoded=decompressFrames(parseGIF(new Uint8Array(encoded.bytes).buffer),true)[0].patch;expect(decoded[3]).toBe(255);expect(decoded[7]).toBe(0)});
 it('GIF palette overflow produces an explicit warning',()=>{const p=createProject(),f=frame(300,1);for(let x=0;x<300;x++)set(f,300,x,0,[x%256,Math.floor(x/256)*80,70,255]);expect(encodeGIFDetailed([f],300,1,p.texture,10,{preserveColors:true}).warnings.some(w=>w.includes('256'))).toBe(true)});
});

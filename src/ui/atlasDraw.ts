import type {Texture} from '../core/types';
import {textureRGBA} from '../core';
const cache=new WeakMap<CanvasRenderingContext2D,HTMLCanvasElement>();
/** One 128-square upload + nearest-neighbor scaled blit, rather than 16,384
 * Canvas2D draw commands per pointer update. Checker pixels are display-only. */
export function drawAtlas(ctx:CanvasRenderingContext2D,texture:Texture,scale:number,opacity=1){
 let surface=cache.get(ctx);if(!surface){surface=document.createElement('canvas');surface.width=128;surface.height=128;cache.set(ctx,surface)}
 const source=surface.getContext('2d')!;
 const light=document.documentElement.dataset.theme==='light';
 const image=source.createImageData(128,128),rgba=textureRGBA(texture);image.data.set(rgba);
 for(let i=0;i<16384;i++)if(image.data[i*4+3]===0){const dark=((i%128)+Math.floor(i/128))%2;image.data[i*4]=light?(dark?219:245):(dark?27:36);image.data[i*4+1]=light?(dark?228:247):(dark?34:44);image.data[i*4+2]=light?(dark?238:250):(dark?44:56);image.data[i*4+3]=255}
 source.putImageData(image,0,0);ctx.clearRect(0,0,128*scale,128*scale);ctx.imageSmoothingEnabled=false;ctx.globalAlpha=opacity;ctx.drawImage(surface,0,0,128*scale,128*scale);ctx.globalAlpha=1;
}

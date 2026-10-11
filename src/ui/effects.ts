export interface FrameEffects {
 outline:boolean;outlineSize:number;outlineColor:string;
 scanlines:boolean;scanlineColor:string;scanlineOpacity:number;scanlineSpacing:number;
 leftTag:string;rightTag:string;leftColor:string;rightColor:string;textScale:number;
}
export const DEFAULT_EFFECTS:FrameEffects={outline:false,outlineSize:1,outlineColor:'#0b1019',scanlines:false,scanlineColor:'#0b1019',scanlineOpacity:0.45,scanlineSpacing:2,leftTag:'',rightTag:'',leftColor:'#f4eee0',rightColor:'#f4eee0',textScale:1};
const color=(v:unknown,fallback:string)=>typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v)?v.toLowerCase():fallback;
const number=(v:unknown,fallback:number,min:number,max:number)=>typeof v==='number'&&Number.isFinite(v)?Math.max(min,Math.min(max,v)):fallback;
export function cleanTag(text:unknown):string{return typeof text==='string'?text.replace(/[^\x20-\x7e]/g,'?').slice(0,48):''}
export function sanitizeEffects(raw:unknown):FrameEffects {
 const r=(raw&&typeof raw==='object'?raw:{}) as Partial<FrameEffects>,d=DEFAULT_EFFECTS;
 return {outline:r.outline===true,outlineSize:Math.round(number(r.outlineSize,d.outlineSize,1,4)),outlineColor:color(r.outlineColor,d.outlineColor),scanlines:r.scanlines===true,scanlineColor:color(r.scanlineColor,d.scanlineColor),scanlineOpacity:number(r.scanlineOpacity,d.scanlineOpacity,0,1),scanlineSpacing:Math.round(number(r.scanlineSpacing,d.scanlineSpacing,2,8)),leftTag:cleanTag(r.leftTag),rightTag:cleanTag(r.rightTag),leftColor:color(r.leftColor,d.leftColor),rightColor:color(r.rightColor,d.rightColor),textScale:Math.round(number(r.textScale,d.textScale,1,4))};
}
function rgb(hex:string):[number,number,number]{return [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)) as [number,number,number]}
/** Original 5x7 bitmap letterforms, authored as row masks. No system fonts or
 * copied product font assets. Lowercase is deliberately rendered as capitals. */
const FONT:Record<string,number[]>={
 A:[14,17,17,31,17,17,17],B:[30,17,17,30,17,17,30],C:[14,17,16,16,16,17,14],D:[30,17,17,17,17,17,30],E:[31,16,16,30,16,16,31],F:[31,16,16,30,16,16,16],G:[14,17,16,23,17,17,15],H:[17,17,17,31,17,17,17],I:[31,4,4,4,4,4,31],J:[7,2,2,2,18,18,12],K:[17,18,20,24,20,18,17],L:[16,16,16,16,16,16,31],M:[17,27,21,21,17,17,17],N:[17,25,21,19,17,17,17],O:[14,17,17,17,17,17,14],P:[30,17,17,30,16,16,16],Q:[14,17,17,17,21,18,13],R:[30,17,17,30,20,18,17],S:[15,16,16,14,1,1,30],T:[31,4,4,4,4,4,4],U:[17,17,17,17,17,17,14],V:[17,17,17,17,17,10,4],W:[17,17,17,21,21,21,10],X:[17,17,10,4,10,17,17],Y:[17,17,10,4,4,4,4],Z:[31,1,2,4,8,16,31],
 '0':[14,17,19,21,25,17,14],'1':[4,12,4,4,4,4,14],'2':[14,17,1,2,4,8,31],'3':[30,1,1,14,1,1,30],'4':[2,6,10,18,31,2,2],'5':[31,16,16,30,1,1,30],'6':[14,16,16,30,17,17,14],'7':[31,1,2,4,8,8,8],'8':[14,17,17,14,17,17,14],'9':[14,17,17,15,1,1,14],
 ' ':[0,0,0,0,0,0,0],'.':[0,0,0,0,0,12,12],',':[0,0,0,0,0,4,8],':':[0,12,12,0,12,12,0],';':[0,12,12,0,4,4,8],'-':[0,0,0,31,0,0,0],'_':[0,0,0,0,0,0,31],'+':[0,4,4,31,4,4,0],'/':[1,2,2,4,8,8,16],'\\':[16,8,8,4,2,2,1],'!':[4,4,4,4,4,0,4],'?':[14,17,1,2,4,0,4],'(':[2,4,8,8,8,4,2],')':[8,4,2,2,2,4,8],'[':[14,8,8,8,8,8,14],']':[14,2,2,2,2,2,14],'=':[0,0,31,0,31,0,0],'#':[10,31,10,10,31,10,0],'%':[17,2,4,8,16,17,0],'*':[0,21,14,31,14,21,0],'<':[1,2,4,8,4,2,1],'>':[16,8,4,2,4,8,16],"'":[4,4,8,0,0,0,0],'"':[10,10,0,0,0,0,0], '|':[4,4,4,4,4,4,4], '@':[14,17,23,21,23,16,14], '$':[4,15,20,14,5,30,4], '&':[12,18,20,8,21,18,13], '^':[4,10,17,0,0,0,0], '`':[8,4,0,0,0,0,0],'~':[0,0,9,22,0,0,0], '{':[3,4,4,8,4,4,3],'}':[24,4,4,2,4,4,24]
};
export function tagWidth(text:string,scale:number):number{return Math.max(0,(text.length*6-1)*scale)}
function drawTag(out:Uint8Array,w:number,h:number,text:string,x:number,y:number,scale:number,tint:[number,number,number]){
 for(let i=0;i<text.length;i++){const glyph=FONT[text[i].toUpperCase()]??FONT['?'];for(let row=0;row<7;row++)for(let col=0;col<5;col++)if(glyph[row]&(1<<(4-col)))for(let dy=0;dy<scale;dy++)for(let dx=0;dx<scale;dx++){const px=x+i*6*scale+col*scale+dx,py=y+row*scale+dy;if(px<0||py<0||px>=w||py>=h)continue;out.set([...tint,255],(py*w+px)*4)}}
}
export interface FrameOutput {transparent:boolean;background:string}
/** Pipeline: silhouette outline -> optional background -> scanlines -> tags.
 * Works on a transparent scene render, so background isn't mistaken for model.
 * Scanlines never create opaque rows in transparent empty space. */
export function applyFrameEffects(input:Uint8Array,w:number,h:number,settings:FrameEffects,output:FrameOutput):Uint8Array {
 if(!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||w>2048||h>2048||input.length!==w*h*4)throw new Error('Invalid effect frame dimensions or RGBA bytes');
 const s=sanitizeEffects(settings),out=new Uint8Array(input),mask=new Uint8Array(w*h);
 for(let i=0;i<mask.length;i++)mask[i]=input[i*4+3]>=128?1:0;
 if(s.outline){const tint=rgb(s.outlineColor),r=s.outlineSize,horizontal=new Uint8Array(mask.length),prefix=new Int32Array(Math.max(w,h)+1);for(let y=0;y<h;y++){prefix[0]=0;for(let x=0;x<w;x++)prefix[x+1]=prefix[x]+mask[y*w+x];for(let x=0;x<w;x++)horizontal[y*w+x]=prefix[Math.min(w,x+r+1)]-prefix[Math.max(0,x-r)]>0?1:0}for(let x=0;x<w;x++){prefix[0]=0;for(let y=0;y<h;y++)prefix[y+1]=prefix[y]+horizontal[y*w+x];for(let y=0;y<h;y++)if(!mask[y*w+x]&&prefix[Math.min(h,y+r+1)]-prefix[Math.max(0,y-r)]>0)out.set([...tint,255],(y*w+x)*4)}}
 const bg=rgb(color(output.background,'#151a21'));
 for(let i=0;i<mask.length;i++){const a=out[i*4+3];if(a<128){if(output.transparent)out.set([0,0,0,0],i*4);else out.set([...bg,255],i*4)}else out[i*4+3]=255}
 if(s.scanlines){const tint=rgb(s.scanlineColor);for(let y=s.scanlineSpacing-1;y<h;y+=s.scanlineSpacing)for(let x=0;x<w;x++){const i=(y*w+x)*4;if(out[i+3]===0)continue;for(let c=0;c<3;c++)out[i+c]=Math.round(out[i+c]*(1-s.scanlineOpacity)+tint[c]*s.scanlineOpacity)}}
 const margin=2*s.textScale,available=Math.max(0,w-2*margin),fullCapacity=Math.max(0,Math.floor((available+s.textScale)/(6*s.textScale)));
 let left=s.leftTag,right=s.rightTag;
 if(left&&right){const each=Math.max(0,Math.floor((available-2*s.textScale)/2));const count=Math.max(0,Math.floor((each+s.textScale)/(6*s.textScale)));left=left.slice(0,count);right=right.slice(0,count)}else{left=left.slice(0,fullCapacity);right=right.slice(0,fullCapacity)}
 const y=h-margin-7*s.textScale;
 if(y>=0){drawTag(out,w,h,left,margin,y,s.textScale,rgb(s.leftColor));drawTag(out,w,h,right,w-margin-tagWidth(right,s.textScale),y,s.textScale,rgb(s.rightColor))}
 return out;
}
export function loadFrameEffects():FrameEffects{try{return sanitizeEffects(JSON.parse(localStorage.getItem('pivo-ortho:export-effects:v1')||'null'))}catch{return {...DEFAULT_EFFECTS}}}
export function saveFrameEffects(s:FrameEffects):void{try{localStorage.setItem('pivo-ortho:export-effects:v1',JSON.stringify(sanitizeEffects(s)))}catch{/* optional persistence in sandbox */}}

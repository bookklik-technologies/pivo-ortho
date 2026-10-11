export type UITheme='light'|'dark';
export const THEME_KEY='pivo-ortho:theme:v1';
export const DEFAULT_THEME:UITheme='light';
export function validTheme(value:unknown):value is UITheme{return value==='light'||value==='dark'}
export function loadTheme():UITheme{try{const value=localStorage.getItem(THEME_KEY);if(validTheme(value))return value}catch{}return typeof matchMedia==='function'&&matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}
export function saveTheme(theme:UITheme):boolean{try{localStorage.setItem(THEME_KEY,theme);return true}catch{return false}}
export function applyTheme(theme:UITheme):void{
 if(typeof document==='undefined')return;
 document.documentElement.dataset.theme=theme;
 document.documentElement.style.colorScheme=theme;
 if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('pivo-ortho:theme-changed',{detail:theme}));
}
export function initializeTheme():UITheme{const theme=loadTheme();applyTheme(theme);return theme}
export function contrastRatio(a:string,b:string):number {
 const luminance=(hex:string)=>{if(!/^#[0-9a-f]{6}$/i.test(hex))throw new Error('Contrast colors must be #rrggbb');const c=[1,3,5].map(i=>{const v=parseInt(hex.slice(i,i+2),16)/255;return v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4});return .2126*c[0]+.7152*c[1]+.0722*c[2]};
 const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
}

export function checkerColor(x:number,y:number):string {const light=typeof document!=='undefined'&&document.documentElement.dataset.theme==='light';return light?((x+y)%2?'#dbe4ee':'#f5f7fa'):((x+y)%2?'#1b222c':'#242c38')}

import {describe,it,expect} from 'vitest';
import {validTheme,DEFAULT_THEME,loadTheme,saveTheme,contrastRatio} from '../src/ui/theme';
function storage(run:()=>void,value:unknown=null,throws=false){const old=Object.getOwnPropertyDescriptor(globalThis,'localStorage');Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){if(throws)throw new Error('sandbox denied');return {getItem:()=>value,setItem:()=>{}}}});try{run()}finally{if(old)Object.defineProperty(globalThis,'localStorage',old);else Reflect.deleteProperty(globalThis,'localStorage')}}
describe('Theme preferences',()=>{
 it('Accepts only light and dark names',()=>{expect(validTheme('light')).toBe(true);expect(validTheme('dark')).toBe(true);expect(validTheme('system')).toBe(false);expect(validTheme('<script>')).toBe(false)});
 it('New installations start with the requested light theme',()=>storage(()=>expect(loadTheme()).toBe(DEFAULT_THEME)));
 it('A saved dark choice is respected',()=>storage(()=>expect(loadTheme()).toBe('dark'),'dark'));
 it('Invalid values fall back safely',()=>storage(()=>expect(loadTheme()).toBe('light'),'bad'));
 it('Opaque sandbox storage does not crash loading or saving',()=>storage(()=>{expect(loadTheme()).toBe('light');expect(saveTheme('dark')).toBe(false)},null,true));
 it('Normal storage saving succeeds',()=>storage(()=>expect(saveTheme('light')).toBe(true)));
});
describe('Readability contrast math',()=>{
 it('Computes known black/white WCAG contrast',()=>expect(contrastRatio('#000000','#ffffff')).toBeCloseTo(21,10));
 it('Identical colors are contrast one and swapping preserves ratio',()=>{expect(contrastRatio('#112233','#112233')).toBe(1);expect(contrastRatio('#112233','#ddeeff')).toBe(contrastRatio('#ddeeff','#112233'))});
 it('Rejects malformed colors instead of returning misleading scores',()=>expect(()=>contrastRatio('white','#ffffff')).toThrow());
 it('Light text hierarchy meets normal-text contrast on panel/control backgrounds',()=>{for(const fg of ['#142338','#334a64','#4e627b'])for(const bg of ['#ffffff','#f7f9fc','#eef2f7','#e3eaf2','#d5e0eb'])expect(contrastRatio(fg,bg),`${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5)});
 it('Active light-mode text and accent labels remain readable',()=>{expect(contrastRatio('#142338','#f4bc58')).toBeGreaterThanOrEqual(4.5);expect(contrastRatio('#875009','#ffffff')).toBeGreaterThanOrEqual(4.5)});
 it('Light focus and control boundaries meet the non-text contrast threshold',()=>{expect(contrastRatio('#155eae','#ffffff')).toBeGreaterThanOrEqual(3);expect(contrastRatio('#6b7c91','#eef2f7')).toBeGreaterThanOrEqual(3)});
 it('Dark-mode muted text remains readable on the working surfaces',()=>{for(const bg of ['#10151c','#151a21','#222c39'])expect(contrastRatio('#95a4b7',bg)).toBeGreaterThanOrEqual(4.5)});
});

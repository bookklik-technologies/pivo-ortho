import {it,expect} from 'vitest';
import {createProject} from '../src/core/project';
import {History} from '../src/core/history';
import {serializeProject,parseProject} from '../src/core/serialize';
import {MAX_PROJECT_BYTES} from '../src/core/validate';

it('save and open both reject UTF-8 bytes above the project cap',()=>{
 const project=Object.assign(createProject(),{padding:'é'.repeat(MAX_PROJECT_BYTES/2)});
 const text=JSON.stringify(project);expect(text.length).toBeLessThan(MAX_PROJECT_BYTES);
 expect(()=>serializeProject(project)).toThrow('UTF-8');expect(()=>parseProject(text)).toThrow('UTF-8');
});
it('failed oversized commits preserve the current document and undo stack',()=>{
 const history=new History(createProject());
 expect(()=>history.commit('Oversize',p=>Object.assign(p,{padding:'x'.repeat(MAX_PROJECT_BYTES)}))).toThrow();
 expect(history.canUndo).toBe(false);expect(history.current.name).toBe('Untitled');
});
it('history byte budget evicts oldest whole transactions',()=>{
 const history=new History(createProject(),60,1);
 history.commit('First',p=>{p.name='First';});history.commit('Second',p=>{p.name='Second';});
 expect(history.undo().name).toBe('First');expect(history.canUndo).toBe(false);
});

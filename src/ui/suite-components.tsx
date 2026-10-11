import React,{useEffect,useRef} from 'react';
import {createPortal} from 'react-dom';
import {resize,tabKeys,positionMenu} from './suite';

export function SuiteMenu({label,children}:{label:string;children:React.ReactNode}) {
 const ref=useRef<HTMLDetailsElement>(null);
 useEffect(()=>{const el=ref.current!;const outside=(e:PointerEvent)=>{if(!el.contains(e.target as Node))el.open=false;};document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside);},[]);
 return <details ref={ref} className="suite-menu" data-suite-managed="true" onToggle={e=>{const el=e.currentTarget;if(el.open){positionMenu(el);for(const other of document.querySelectorAll<HTMLDetailsElement>('.suite-menu[open]'))if(other!==el)other.open=false;}}} onKeyDown={e=>{const el=ref.current!;const items=[...el.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];if(e.key==='Escape'){e.preventDefault();e.stopPropagation();el.open=false;el.querySelector('summary')?.focus();}else if(['ArrowUp','ArrowDown','Home','End'].includes(e.key)){e.preventDefault();el.open=true;const n=items.indexOf(document.activeElement as HTMLButtonElement);items[e.key==='Home'?0:e.key==='End'?items.length-1:n<0?(e.key==='ArrowDown'?0:items.length-1):(n+(e.key==='ArrowDown'?1:-1)+items.length)%items.length]?.focus();}}}><summary>{label}</summary><div className="suite-menu-popup" onClick={e=>{if((e.target as HTMLElement).closest('button:not(:disabled)'))ref.current!.open=false;}}>{children}</div></details>;
}
export function SuiteTabs({label,values,active,onChange}:{label:string;values:Array<{id:string;label:string;icon?:React.ReactNode}>;active:string;onChange:(id:string)=>void}) {
 const ref=useRef<HTMLDivElement>(null);useEffect(()=>tabKeys(ref.current!),[]);
 return <div ref={ref} className="suite-tablist" role="tablist" aria-label={label}>{values.map(v=><button key={v.id} role="tab" aria-selected={active===v.id} tabIndex={active===v.id?0:-1} onClick={()=>onChange(v.id)}>{v.icon}{v.label}</button>)}</div>;
}
export function SuiteResize({label,storageKey,property,initial,min,max,host,direction=1}:{label:string;storageKey:string;property:string;initial:number;min:number;max:number;host:string;direction?:number}) {
 const ref=useRef<HTMLDivElement>(null);useEffect(()=>{const handle=ref.current!;const target=handle.closest<HTMLElement>(host);if(target)return resize(handle,target,property,initial,min,max,storageKey,'y',direction);},[host,property,initial,min,max,storageKey,direction]);
 return <div ref={ref} className="suite-resize" aria-label={label}/>;
}
export function DockPortal({target,hidden=false,children}:{target:HTMLElement|null;hidden?:boolean;children:React.ReactNode}) {return target?createPortal(<div hidden={hidden}>{children}</div>,target):null;}

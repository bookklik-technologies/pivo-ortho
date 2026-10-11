import {installDisclosureMenus,installDockToggle} from './suite';
import logo from '../../logo.svg?url';
import {SuiteMenu,SuiteTabs,SuiteResize,DockPortal} from './suite-components';
import {initializeTheme,applyTheme,saveTheme,type UITheme} from './theme';
import {applyGizmoTransform,transformFrame,transformChanged,type GizmoEvent} from './transforms';
// PiVo Ortho — app shell: header (new/save/open/exports/help), mode tabs,
// mode workspaces, outliner + inspector panels, status bar, shortcuts.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { Project, Vec3 } from '../core/types';
import { cloneMesh, deleteFace, deleteVertices, parseProject, serializeProject, uid } from '../core';
import { StoreProvider, useStore, emptySelection, type Mode } from './store';
import { ModelWorkspace, DEFAULT_RIG, type CameraRig, type SelectPayload, type DragPayload } from './modelWorkspace';
import { PaintWorkspace } from './paintWorkspace';
import { UVEditor, AnimateWorkspace } from './animateWorkspace';
import { Outliner } from './outliner';
import { Inspector } from './inspector';
import { ExportsDialog } from './exportsDialog';
import { ShortcutsDialog, HelpDialog, ErrorBoundary, WebGLFallback } from './dialogs';import { AboutDialog } from './aboutDialog';
import { collectFaces, projectToNdc } from './render';
import { IconCube, IconExport, IconHelp, IconOpen, IconPaint, IconPlay, IconRedo, IconSave, IconUndo,IconKeyboard,IconCursor,IconMove,IconRotate,IconScale,IconSun,IconMoon } from './icons';

function Header({paintTab,onPaintTab,onResetViews}:{paintTab:string;onPaintTab:(tab:string)=>void;onResetViews:()=>void}):React.JSX.Element {
  const { state, dispatch, history, commit } = useStore();
  const project = state.project;
  const [theme,setTheme]=useState<UITheme>(initializeTheme);
  const toggleTheme=()=>{const next:UITheme=theme==='light'?'dark':'light';setTheme(next);applyTheme(next);const saved=saveTheme(next);dispatch({t:'setStatus',status:`${next==='light'?'Light':'Dark'} theme enabled${saved?'.':' for this session; browser storage unavailable.'}`})};
  const useSystem=()=>{try{localStorage.removeItem('pivo-ortho:theme:v1');}catch{}const next:UITheme=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';setTheme(next);applyTheme(next);};
  useEffect(()=>{const media=matchMedia('(prefers-color-scheme: dark)');const change=()=>{try{if(!localStorage.getItem('pivo-ortho:theme:v1')){const next:UITheme=media.matches?'dark':'light';setTheme(next);applyTheme(next);}}catch{}};media.addEventListener('change',change);return()=>media.removeEventListener('change',change);},[]);
  const dockToggleRef=useRef<HTMLButtonElement>(null);useEffect(()=>{const dock=document.getElementById('ortho-dock');if(dock&&dockToggleRef.current)return installDockToggle(dockToggleRef.current,dock);},[]);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const save = useCallback(() => {
    try {
      const text = serializeProject(project);
      const blob = new Blob([text], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      const safe = (project.name || 'project').replace(/[^a-z0-9_-]+/gi, '-').toLowerCase();
      a.download = `${safe}.pvo`;
      a.click();
      URL.revokeObjectURL(a.href);
      dispatch({t:'markSaved',snapshot:JSON.stringify(project)});
      dispatch({ t: 'setStatus', status: `Project downloaded: ${safe}.pvo` });
    } catch (err) {
      dispatch({ t: 'setStatus', status: `Save failed: ${(err as Error).message}` });
    }
  }, [project, dispatch]);

  const open = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const parsed = parseProject(text); // strict validation before replacing
      const opened=commit('Open project', (draft) => {
        draft.format = parsed.format;
        draft.version = parsed.version;
        draft.name = parsed.name;
        draft.meshes = parsed.meshes;
        draft.folders = parsed.folders;
        draft.texture = parsed.texture;
        draft.animation = parsed.animation;
        draft.render = parsed.render;
      });
      if(!opened)return;dispatch({t:'markSaved',snapshot:JSON.stringify(opened),source:'opened'});
      dispatch({ t: 'setSelection', selection: emptySelection() });
      dispatch({ t: 'setStatus', status: `Opened ${file.name}` });
    } catch (err) {
      dispatch({ t: 'setStatus', status: `Open rejected: ${(err as Error).message}` });
    }
  }, [commit, dispatch]);

  const newProject = useCallback(() => {
    commit('New project', (draft) => {
      draft.name = 'Untitled';
      draft.meshes = [];
      draft.folders = [];
      draft.animation = { duration: 4, fps: 12, clips: [] };
      draft.texture.pixels = new Array(128 * 128).fill(draft.texture.background);
    });
    dispatch({ t: 'setSelection', selection: emptySelection() });
    dispatch({ t: 'setStatus', status: 'New empty project. Undo returns the previous scene.' });
  }, [commit, dispatch]);

  const doUndo = () => {
    if (!history || !history.canUndo) return;
    const label = history.undoLabel;
    const next = history.undo();
    dispatch({ t: 'setProject', project: next, label: `Undo: ${label}` });
    dispatch({ t: 'setSelection', selection: emptySelection() });
  };
  const doRedo = () => {
    if (!history || !history.canRedo) return;
    const label = history.redoLabel;
    const next = history.redo();
    dispatch({ t: 'setProject', project: next, label: `Redo: ${label}` });
  };

  const dirty=JSON.stringify(project)!==state.savedSnapshot;
  const recovery=state.recoveryState==='stored'&&state.recoverySnapshot!==JSON.stringify(project)?'pending':state.recoveryState;
  return <>
    <header className="app-header suite-header">
      <span className="suite-brand"><img src={logo} alt=""/>PiVo Ortho</span>
      <nav className="suite-menus" aria-label="Application menus">
        <SuiteMenu label="File"><button onClick={newProject}>New project</button><button aria-label="Open project" onClick={()=>fileRef.current?.click()}>Open project…</button><button onClick={save}>Save project</button><button onClick={()=>dispatch({t:'setDialog',dialog:'exports'})}>Export…</button><button onClick={()=>dispatch({t:'setDialog',dialog:'recovery'})}>Recovery…</button></SuiteMenu>
        <SuiteMenu label="Edit"><button disabled={!history?.canUndo} onClick={doUndo}>Undo</button><button disabled={!history?.canRedo} onClick={doRedo}>Redo</button></SuiteMenu>
        <SuiteMenu label="View"><button onClick={onResetViews}>Reset workspace views</button><button onClick={()=>dispatch({t:'setLayout',layout:state.viewLayout==='quad'?'persp':'quad'})}>Four views / maximize 3D</button><button onClick={()=>document.querySelector<HTMLButtonElement>('.suite-dock-toggle')?.click()}>Toggle panels</button><button onClick={useSystem}>System appearance</button><button onClick={()=>{setTheme('light');applyTheme('light');saveTheme('light');}}>Light appearance</button><button onClick={()=>{setTheme('dark');applyTheme('dark');saveTheme('dark');}}>Dark appearance</button><button onClick={()=>document.querySelector('.app')?.classList.toggle('suite-diagnostics')}>Technical diagnostics</button></SuiteMenu>
        <SuiteMenu label="Help"><button onClick={()=>dispatch({t:'setDialog',dialog:'shortcuts'})}>Keyboard shortcuts…</button><button onClick={()=>dispatch({t:'setDialog',dialog:'help'})}>Usage help…</button><button onClick={()=>dispatch({t:'setDialog',dialog:'about'})}>About PiVo Ortho</button></SuiteMenu>
      </nav>
      <div className="suite-header-actions">
        <button onClick={doUndo} disabled={!history?.canUndo} aria-label="Undo" title="Undo (Ctrl/Cmd+Z)"><IconUndo/></button>
        <button onClick={doRedo} disabled={!history?.canRedo} aria-label="Redo" title="Redo (Ctrl/Cmd+Shift+Z, Ctrl/Cmd+Y)"><IconRedo/></button>
        <button className="suite-file-action" onClick={save} aria-label="Save project"><IconSave/><span className="suite-action-label">Save project</span></button>
        <button className="suite-file-action" onClick={()=>dispatch({t:'setDialog',dialog:'exports'})} aria-label="Export"><IconExport/><span className="suite-action-label">Export</span></button>
        <button onClick={toggleTheme} aria-label={theme==='light'?'Switch to dark theme':'Switch to light theme'}>{theme==='light'?<IconMoon/>:<IconSun/>}</button>
      </div>
      <input ref={fileRef} type="file" accept=".pvo,application/json" hidden aria-label="Open project file" onChange={e=>{const f=e.target.files?.[0];if(f)void open(f);e.target.value='';}}/>
    </header>
    <div className="suite-document-strip">
      <div className="ortho-mode-tabs"><SuiteTabs label="Work mode" values={[{id:'model',label:'Model',icon:<IconCube/>},{id:'paint',label:'Paint',icon:<IconPaint/>},{id:'animate',label:'Animate',icon:<IconPlay/>}]} active={state.mode} onChange={mode=>dispatch({t:'setMode',mode:mode as Mode})}/></div><select className="ortho-mode-select" aria-label="Work mode (compact)" value={state.mode} onChange={e=>dispatch({t:'setMode',mode:e.target.value as Mode})}>{(['model','paint','animate'] as Mode[]).map(mode=><option key={mode} value={mode}>{mode[0].toUpperCase()+mode.slice(1)}</option>)}</select>
      {state.mode==='paint'&&<SuiteTabs label="Paint workspace" values={[{id:'texture',label:'Texture'},{id:'uv',label:'UV'}]} active={paintTab} onChange={onPaintTab}/>}
      <div className="suite-document-meta"><span className="suite-document-name" title={project.name}>{project.name}</span>
      <span className="suite-save-state" role="status">{dirty?'Unsaved edits':state.savedSource==='opened'?'Project opened':'Project downloaded'} · {recovery==='stored'?'Browser recovery stored':recovery==='unavailable'?'Recovery unavailable':recovery==='cleared'?'Recovery cleared':'Recovery pending'}</span></div>
      <button className="suite-dock-toggle" aria-controls="ortho-dock" aria-expanded="false" ref={dockToggleRef}>Panels</button>
    </div>
  </>;
}

function RecoveryDialog(){
 const {state,dispatch}=useStore();const [confirm,setConfirm]=useState(false);
 return <div className="dialog-backdrop"><div className="dialog" role="dialog" aria-modal="true" aria-labelledby="recovery-title"><header><h2 id="recovery-title">Browser recovery</h2></header><div className="dialog-body"><p>Browser recovery is separate from downloaded .pvo projects. The last valid recovery copy is restored when this editor starts.</p><p>{state.recoveryState==='stored'?'A recovery copy is stored in this browser.':state.recoveryState==='unavailable'?'Browser storage is unavailable. Download a project to keep your work.':state.recoveryState==='cleared'?'The recovery copy has been cleared. Further edits resume browser recovery.':'Recovery is pending.'}</p>{confirm&&<p role="alert">Discard permanently removes the browser recovery copy. Your current document and downloaded projects are kept. Further edits resume recovery.</p>}</div><footer className="suite-dialog-footer"><button onClick={()=>dispatch({t:'setDialog',dialog:null})}>Cancel</button><button className="danger" disabled={state.recoveryState==='unavailable'||state.recoveryState==='cleared'} onClick={()=>{if(!confirm){setConfirm(true);return;}try{localStorage.removeItem('pivo-ortho:recovery:v1');dispatch({t:'clearRecovery'});dispatch({t:'setStatus',status:'Browser recovery discarded. Download the current project before closing.'});dispatch({t:'setDialog',dialog:null});}catch{dispatch({t:'setStatus',status:'Recovery discard failed: browser storage unavailable.'});}}}>{confirm?'Discard recovery':'Discard recovery…'}</button></footer></div></div>;
}

function StatusBar(): React.JSX.Element {
  const { state } = useStore();
  return (
    <footer className="status-bar" role="status" aria-live="polite">
      <span className="status-msg">{state.status}</span>
      <span className="status-meta">
        {state.project.meshes.length} meshes · {state.project.animation.clips.length} clips · {state.mode}
      </span>
    </footer>
  );
}

function AppInner(): React.JSX.Element {
  const { state, dispatch, commit, cancelDrag } = useStore();
  const project = state.project;
  useEffect(()=>installDisclosureMenus(),[]);
  const [toolbarTarget,setToolbarTarget]=useState<HTMLDivElement|null>(null);
  const [dockTarget,setDockTarget]=useState<HTMLDivElement|null>(null);
  const [paintTab,setPaintTab]=useState('texture');
  const [toastMessage,setToastMessage]=useState('');
  useEffect(()=>{if(/downloaded|opened|failed|rejected|blocked|discarded|export complete/i.test(state.status)){setToastMessage(state.status);const timer=window.setTimeout(()=>setToastMessage(''),6000);return()=>clearTimeout(timer);}},[state.status]);
  const [rig, setRig] = useState<CameraRig>(DEFAULT_RIG);
  const [activeView,setActiveView]=useState<'front'|'top'|'side'|'persp'>('persp');
  const [gizmoSpace,setGizmoSpace]=useState<'world'|'local'>('world');
  const [rotationSnap,setRotationSnap]=useState(15);
  const [scaleSnap,setScaleSnap]=useState(0.1);
  const gizmoBaseline=useRef<{project:Project;selection:typeof state.selection}|null>(null);
  const [previewProject, setPreviewProject] = useState<Project | null>(null);
  const [paintPreview,setPaintPreview]=useState<Project|null>(null);
  const [previewTick, setPreviewTick] = useState(0);
  const [noWebGL, setNoWebGL] = useState(false);
  const dragCtxRef = useRef<{
    startWorld: Vec3 | null;
    kind: 'vertex' | 'meshMove' | null;
    meshIds: string[];
    vertexIds: string[];
  }>({ startWorld: null, kind: null, meshIds: [], vertexIds: [] });

  const selFaceIds = useMemo(() => new Set(state.selection.faceIds), [state.selection.faceIds]);
  const selVertexIds = useMemo(() => new Set(state.selection.vertexIds), [state.selection.vertexIds]);
  const selMeshIds = useMemo(() => new Set(state.selection.meshIds), [state.selection.meshIds]);

  // WebGL probe: if context creation fails the editor renders an explanatory
  // fallback instead of an inert interface.
  useEffect(() => {
    try {
      const c = document.createElement('canvas');
      if (!(c.getContext('webgl2') || c.getContext('webgl'))) setNoWebGL(true);
    } catch {
      setNoWebGL(true);
    }
  }, []);

  // Focus containment for all dialogs, including Escape from text inputs.
  useEffect(()=>{
    if(!state.dialog)return;
    const prior=document.activeElement as HTMLElement|null;
    const dialog=document.querySelector<HTMLElement>('.dialog');
    const items=()=>Array.from(dialog?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')??[]).filter(el=>el.getClientRects().length>0&&getComputedStyle(el).visibility!=='hidden');
    (dialog?.querySelector<HTMLElement>('[data-dialog-initial]')??items()[0])?.focus();
    const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){if(dialog?.querySelector<HTMLButtonElement>('[aria-label="Close exports"]')?.disabled)return;e.preventDefault();dispatch({t:'setDialog',dialog:null});}if(e.key==='Tab'){const all=items();if(!all.length)return;const index=all.indexOf(document.activeElement as HTMLElement);if(e.shiftKey&&index<=0){e.preventDefault();all[all.length-1].focus()}else if(!e.shiftKey&&index===all.length-1){e.preventDefault();all[0].focus()}}};
    const keepFocus=(e:FocusEvent)=>{if(dialog&&e.target instanceof Node&&!dialog.contains(e.target))items()[0]?.focus();};
    window.addEventListener('keydown',key);document.addEventListener('focusin',keepFocus);return()=>{window.removeEventListener('keydown',key);document.removeEventListener('focusin',keepFocus);if(prior?.isConnected)prior.focus()};
  },[state.dialog,dispatch]);

  const onGizmo=useCallback((event:GizmoEvent)=>{
    if(event.phase==='start'){gizmoBaseline.current={project:structuredClone(project),selection:structuredClone(state.selection)};return;}
    const base=gizmoBaseline.current;if(!base)return;
    if(event.phase==='cancel'){gizmoBaseline.current=null;setPreviewProject(null);cancelDrag();return;}
    try{
      const next=applyGizmoTransform(base.project,base.selection,event.before,event.after,event.mode);
      if(event.phase==='change'){setPreviewProject(next);setPreviewTick(t=>t+1);return;}
      if(transformChanged(event.before,event.after))commit(`Gizmo ${event.mode}`,draft=>{draft.meshes=next.meshes});
    }catch(e){dispatch({t:'setStatus',status:`Transform blocked: ${(e as Error).message}`});if(event.phase=== 'change'){setPreviewProject(null);return;}}
    gizmoBaseline.current=null;setPreviewProject(null);
  },[project,state.selection,commit,cancelDrag,dispatch]);
  const frame=useMemo(()=>transformFrame(project,state.selection),[project,state.selection]);

  // --- selection from viewports ---
  const onSelect = useCallback((p: SelectPayload) => {
    const sel = state.selection;
    if(p.vertexIds && (sel.kind==='vertex' || p.vertexIds.length>1)) {
      const vids=p.shift?[...new Set([...sel.vertexIds,...p.vertexIds])]:p.vertexIds;
      const meshIds=project.meshes.filter(m=>m.vertices.some(v=>vids.includes(v.id))).map(m=>m.id);
      dispatch({t:'setSelection',selection:{meshIds,faceIds:[],vertexIds:vids,activeMeshId:p.meshId??meshIds[0]??null,kind:'vertex'}});
      return;
    }
    if (p.screenRect) {
      const hits = rectSelect(project, p, rig);
      dispatch({
        t: 'setSelection',
        selection: {
          meshIds: sel.meshIds,
          faceIds: [],
          vertexIds: p.shift ? [...new Set([...sel.vertexIds, ...hits])] : hits,
          activeMeshId: sel.activeMeshId,
          kind: 'vertex',
        },
      });
      dispatch({ t: 'setStatus', status: `Rectangle select: ${hits.length} vertices.` });
      return;
    }
    if (p.meshId == null && !p.shift) {
      dispatch({ t: 'setSelection', selection: emptySelection() });
      return;
    }
    const meshIds = new Set(sel.meshIds);
    const faceIds = new Set(sel.faceIds);
    let active = sel.activeMeshId;
    if (p.meshId) {
      if (p.shift) {
        if (sel.kind==='mesh' && meshIds.has(p.meshId)) meshIds.delete(p.meshId);
        else meshIds.add(p.meshId);
      } else {
        meshIds.clear();faceIds.clear();meshIds.add(p.meshId);
      }
      active = p.meshId;
    }
    if (sel.kind === 'face' && p.faceId && p.meshId) {
      if (p.shift) {
        if (faceIds.has(p.faceId)) faceIds.delete(p.faceId);
        else faceIds.add(p.faceId);
      } else {
        faceIds.clear();
        faceIds.add(p.faceId);
      }
      active = p.meshId;
    }
    dispatch({
      t: 'setSelection',
      selection: {
        meshIds: [...meshIds], faceIds: [...faceIds], vertexIds: [],
        activeMeshId: active, kind: sel.kind,
      },
    });
  }, [state.selection, project, rig, dispatch]);

  // --- drag transforms (vertex/mesh move, ground-plane projection) ---
  const onDrag = useCallback((p: DragPayload) => {
    const sel = state.selection;
    if (p.phase === 'start') {
      const kind: 'vertex' | 'meshMove' = sel.vertexIds.length > 0 ? 'vertex' : 'meshMove';
      dragCtxRef.current = {
        startWorld: p.startWorld,
        kind,
        meshIds: kind === 'meshMove'
          ? [...(sel.meshIds.length ? sel.meshIds : p.meshId ? [p.meshId] : [])]
          : sel.meshIds.length?[...sel.meshIds]:[p.meshId ?? sel.activeMeshId ?? ''],
        vertexIds: [...sel.vertexIds],
      };
      setPreviewProject(structuredClone(project));
      return;
    }
    const ctx = dragCtxRef.current;
    if (p.phase === 'cancel') {
      dragCtxRef.current = { startWorld: null, kind: null, meshIds: [], vertexIds: [] };
      setPreviewProject(null);
      cancelDrag();
      return;
    }
    if (!ctx.startWorld || !p.world) return;
    const d: Vec3 = [
      p.world[0] - ctx.startWorld[0],
      p.world[1] - ctx.startWorld[1],
      p.world[2] - ctx.startWorld[2],
    ];
    const snap = state.snap;
    const delta: Vec3 = snap > 0
      ? [Math.round(d[0] / snap) * snap, Math.round(d[1] / snap) * snap, Math.round(d[2] / snap) * snap]
      : d;

    if (p.phase === 'move') {
      setPreviewProject((prev) => {
        if (!prev) return prev;
        const next: Project = { ...prev, meshes: prev.meshes.map((m) => ({ ...m })) };
        for (const meshId of ctx.meshIds) {
          const m = next.meshes.find((x) => x.id === meshId);
          const base = project.meshes.find((x) => x.id === meshId);
          if (!m || !base || m.locked || project.folders.some(f=>f.id===m.folderId&&f.locked)) continue;
          const inv=new THREE.Quaternion().setFromEuler(new THREE.Euler(...base.rotation,'ZYX')).invert();
          const vDelta=new THREE.Vector3(...delta).applyQuaternion(inv);
          const localDelta=[vDelta.x/(base.scale[0]||1),vDelta.y/(base.scale[1]||1),vDelta.z/(base.scale[2]||1)];
          if (ctx.kind === 'meshMove') {
            m.position = [base.position[0] + delta[0], base.position[1] + delta[1], base.position[2] + delta[2]];
          } else {
            const target = new Set(ctx.vertexIds);
            const baseById = new Map(base.vertices.map((v) => [v.id, v.position]));
            m.vertices = m.vertices.map((v) => {
              const bp = baseById.get(v.id);
              if (bp && target.has(v.id)) {
                return { ...v, position: [bp[0] + localDelta[0], bp[1] + localDelta[1], bp[2] + localDelta[2]] as Vec3 };
              }
              return v;
            });
          }
        }
        return next;
      });
      setPreviewTick((t) => t + 1);
      return;
    }
    // phase === 'end': one history commit for the whole gesture
    const label = ctx.kind === 'vertex' ? 'Move vertices' : 'Move mesh';
    const moved = delta[0] !== 0 || delta[1] !== 0 || delta[2] !== 0;
    if (moved) {
      commit(label, (draft) => {
        for (const meshId of ctx.meshIds) {
          const m = draft.meshes.find((x) => x.id === meshId);
          const base = project.meshes.find((x) => x.id === meshId);
          if (!m || !base || m.locked || project.folders.some(f=>f.id===m.folderId&&f.locked)) continue;
          const inv=new THREE.Quaternion().setFromEuler(new THREE.Euler(...base.rotation,'ZYX')).invert();
          const vDelta=new THREE.Vector3(...delta).applyQuaternion(inv);
          const localDelta=[vDelta.x/(base.scale[0]||1),vDelta.y/(base.scale[1]||1),vDelta.z/(base.scale[2]||1)];
          const folderLocked = m.folderId ? draft.folders.find((f) => f.id === m.folderId)?.locked : false;
          if (m.locked || folderLocked) continue;
          if (ctx.kind === 'meshMove') {
            m.position = [base.position[0] + delta[0], base.position[1] + delta[1], base.position[2] + delta[2]];
          } else {
            const target = new Set(ctx.vertexIds);
            const baseById = new Map(base.vertices.map((v) => [v.id, v.position]));
            for (const v of m.vertices) {
              const bp = baseById.get(v.id);
              if (bp && target.has(v.id)) {
                v.position = [bp[0] + localDelta[0], bp[1] + localDelta[1], bp[2] + localDelta[2]];
              }
            }
          }
        }
      });
    }
    dragCtxRef.current = { startWorld: null, kind: null, meshIds: [], vertexIds: [] };
    setPreviewProject(null);
  }, [state.selection, state.snap, project, commit, cancelDrag]);

  // Keyboard shortcuts — suppressed while typing in inputs.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey) return;
      if (e.key === 'Escape') {
        if (state.dialog) {if(!state.exporting)dispatch({ t: 'setDialog', dialog: null });}
        else {
          // tell viewports to abort the live pointer gesture (drag/marquee)
          window.dispatchEvent(new CustomEvent('pivo-ortho:cancel-gesture'));
        }
        return;
      }
      if(state.dialog||target?.closest('button,summary,[role=tab],[role=treeitem]'))return;
      const k = e.key.toLowerCase();
      if (e.key === '1') dispatch({ t: 'setMode', mode: 'model' });
      if (e.key === '2') dispatch({ t: 'setMode', mode: 'paint' });
      if (e.key === '3') dispatch({ t: 'setMode', mode: 'animate' });
      if (state.mode === 'model') {
        if (k === 'q') dispatch({ t: 'setSelection', selection: { ...state.selection, kind: 'mesh' } });
        if (k === 'w') dispatch({ t: 'setSelection', selection: { ...state.selection, kind: 'face' } });
        if (k === 'e') dispatch({ t: 'setSelection', selection: { ...state.selection, kind: 'vertex' } });
        if (k === 'f') setRig({ ...DEFAULT_RIG });
        if (k === 'g') dispatch({ t: 'setLayout', layout: state.viewLayout === 'quad' ? 'persp' : 'quad' });
        if (k === 'x' || k === 'd') {
          const sel = state.selection;
          const locked = project.meshes
            .filter((m) => sel.meshIds.includes(m.id))
            .some((m) => m.locked || (m.folderId ? project.folders.find((f) => f.id === m.folderId)?.locked : false));
          if (locked) { dispatch({ t: 'setStatus', status: 'Selection includes locked meshes.' }); return; }
          if (k === 'd') {
            // Duplicate active mesh (D).
            if (sel.activeMeshId) {
              let newId: string | null = null;
              commit('Duplicate mesh', (draft) => {
                const m = draft.meshes.find((x) => x.id === sel.activeMeshId);
                if (!m) return;
                const copy = cloneMesh(m);
                copy.id = uid('mesh');
                newId = copy.id;
                draft.meshes.push(copy);
              });
              if (newId) {
                dispatch({
                  t: 'setSelection',
                  selection: { ...emptySelection(), meshIds: [newId], activeMeshId: newId, kind: 'mesh' },
                });
                dispatch({ t: 'setStatus', status: 'Mesh duplicated.' });
              }
            }
            return;
          }
          // X — delete in selection context: vertices > faces > whole meshes.
          if (sel.vertexIds.length > 0 && sel.activeMeshId) {
            const meshId = sel.activeMeshId;
            const vids = [...sel.vertexIds];
            commit('Delete vertices', (draft) => {
              const m = draft.meshes.find((x) => x.id === meshId);
              if (m) deleteVertices(m, vids);
              if (m && m.faces.length === 0) draft.meshes = draft.meshes.filter((x) => x.id !== meshId);
            });
            dispatch({ t: 'setSelection', selection: emptySelection() });
          } else if (sel.faceIds.length > 0 && sel.activeMeshId) {
            const meshId = sel.activeMeshId;
            const fids = [...sel.faceIds];
            commit('Delete faces', (draft) => {
              const m = draft.meshes.find((x) => x.id === meshId);
              if (!m) return;
              for (const fid of fids) deleteFace(m, fid);
              if (m.faces.length === 0) draft.meshes = draft.meshes.filter((x) => x.id !== meshId);
            });
            dispatch({ t: 'setSelection', selection: { ...emptySelection(), meshIds: [meshId], activeMeshId: meshId, kind: 'mesh' } });
          } else if (sel.meshIds.length > 0) {
            const ids = [...sel.meshIds];
            commit('Delete meshes', (draft) => {
              draft.meshes = draft.meshes.filter((m) => !ids.includes(m.id));
              draft.animation.clips = draft.animation.clips.filter((c) => !ids.includes(c.meshId));
            });
            dispatch({ t: 'setSelection', selection: emptySelection() });
          }
        }
      }
      if (state.mode === 'paint') {
        const map: Record<string, 'pen' | 'eraser' | 'fill' | 'line' | 'rect' | 'ellipse' | 'marquee' | 'picker'> = {
          i:'picker', b: 'pen', e: 'eraser', f: 'fill', l: 'line', r: 'rect', c: 'ellipse', m: 'marquee',
        };
        const t = map[k];
        if (t) dispatch({ t: 'setTool', tool: t });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state.mode, state.selection, state.dialog, state.exporting, state.viewLayout, state.project, project, dispatch, previewProject, cancelDrag, commit]);

  // Ctrl+Z/Y/S/O with input guard.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) return;
      if(state.dialog || state.exporting)return;
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === 'z') { e.preventDefault(); document.querySelector<HTMLButtonElement>(e.shiftKey?'button[aria-label="Redo"]':'button[aria-label="Undo"]')?.click(); }
      if (k === 'y') { e.preventDefault(); document.querySelector<HTMLButtonElement>('button[aria-label="Redo"]')?.click(); }
      if (k === 's') { e.preventDefault(); document.querySelector<HTMLButtonElement>('button[aria-label="Save project"]')?.click(); }
      if (k === 'o') { e.preventDefault(); document.querySelector<HTMLButtonElement>('button[aria-label="Open project"]')?.click(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state.dialog,state.exporting]);

  if (noWebGL) return <WebGLFallback />;

  return (
    <div className="app">
      <Header paintTab={paintTab} onPaintTab={tab=>{window.dispatchEvent(new CustomEvent('pivo-ortho:cancel-gesture'));setPaintPreview(null);setPaintTab(tab);}} onResetViews={()=>{setRig({...DEFAULT_RIG});dispatch({t:'setLayout',layout:'quad'});}}/>
      <div className="ortho-context-toolbar" ref={setToolbarTarget}/>
      <div className="app-main">
        {state.mode === 'model' && (
          <>
            <nav className="suite-tool-rail" aria-label="Transform tools">
              <button aria-label="Select" title="Select" aria-pressed={state.modelTool==='select'} onClick={()=>dispatch({t:'setTool',tool:'select'})}><IconCursor/></button>
              <button aria-label="Move" title="Move" aria-pressed={state.modelTool==='move'} onClick={()=>dispatch({t:'setTool',tool:'move'})}><IconMove/></button>
              <button aria-label="Rotate" title="Rotate" aria-pressed={state.modelTool==='rotate'} onClick={()=>dispatch({t:'setTool',tool:'rotate'})}><IconRotate/></button>
              <button aria-label="Scale" title="Scale" aria-pressed={state.modelTool==='scale'} onClick={()=>dispatch({t:'setTool',tool:'scale'})}><IconScale/></button>
              </nav><div className="model-center"><DockPortal target={toolbarTarget}><div className="model-toolbar suite-context-toolbar"><div className="control-cluster setting-cluster" role="group" aria-label="Transform settings">
              <label>Space <select aria-label="Gizmo space" disabled={state.modelTool==='scale'} title="Move and rotate use world/local axes; scaling uses local axes" value={state.modelTool==='scale'?'local':gizmoSpace} onChange={e=>setGizmoSpace(e.target.value as 'world'|'local')}><option value="world">World</option><option value="local">Local</option></select></label>
              <label>Rotation snap ° <input aria-label="Rotation snap degrees" type="number" min={0} max={180} value={rotationSnap} onChange={e=>setRotationSnap(Math.max(0,Number(e.target.value)))}/></label>
              <label>Scale snap <input aria-label="Scale snap" type="number" min={0} step={0.1} value={scaleSnap} onChange={e=>setScaleSnap(Math.max(0,Number(e.target.value)))}/></label>
              <label>Snap <input type="number" aria-label="World snap" value={state.snap} min={0} step={0.25} onChange={e=>dispatch({t:'setSnap',snap:Math.max(0,Number(e.target.value))})} /></label>
              </div><details className="suite-menu model-view-options"><summary>View options</summary><div className="suite-menu-popup"><div className="narrow-transform-settings"><label>Rotation snap °<input aria-label="Rotation snap degrees (compact)" type="number" min={0} max={180} value={rotationSnap} onChange={e=>setRotationSnap(Math.max(0,Number(e.target.value)))}/></label><label>Scale snap<input aria-label="Scale snap (compact)" type="number" min={0} step={0.1} value={scaleSnap} onChange={e=>setScaleSnap(Math.max(0,Number(e.target.value)))}/></label></div><div className="control-cluster" role="group" aria-label="View actions">
              <button onClick={()=>setRig({...DEFAULT_RIG})}>Reset cameras</button>
              <button onClick={()=>dispatch({t:'setLayout',layout:state.viewLayout==='quad'?'persp':'quad'})}>{state.viewLayout==='quad'?'Maximize 3D':'Four views'}</button>
              </div><div className="control-cluster render-cluster" role="group" aria-label="Render options">
              <label><input type="checkbox" checked={project.render.shading} onChange={e=>commit('Toggle shading',p=>{p.render.shading=e.target.checked})}/>Shading</label>
              <label><input type="checkbox" checked={project.render.affine} onChange={e=>commit('Toggle affine UV',p=>{p.render.affine=e.target.checked})}/>Affine UV</label>
              <label><input type="checkbox" checked={project.render.wireframe} onChange={e=>commit('Toggle wireframe',p=>{p.render.wireframe=e.target.checked})}/>Wireframe</label>
              <label>Pixels <select aria-label="Render pixel size" value={project.render.pixelSize} onChange={e=>commit('Render pixel size',p=>{p.render.pixelSize=Number(e.target.value)})}>{[1,2,3,4].map(v=><option key={v}>{v}</option>)}</select></label>
              </div></div></details>
            </div></DockPortal><ModelWorkspace
              project={project}
              rig={rig}
              setRig={setRig}
              layout={state.viewLayout}
              selectKind={state.selection.kind}
              modelTool={state.modelTool}
              gizmoFrame={frame}
              gizmoSpace={state.modelTool==='scale'?'local':gizmoSpace}
              translationSnap={state.snap}
              rotationSnap={rotationSnap}
              scaleSnap={scaleSnap}
              onGizmo={onGizmo}
              onActiveView={setActiveView}
              onSelect={onSelect}
              onDrag={onDrag}
              selectedFaceIds={selFaceIds}
              selectedVertexIds={selVertexIds}
              selectedMeshIds={selMeshIds}
              previewProject={previewProject}
              previewTick={previewTick}
            /></div>
          </>
        )}
        {state.mode==='paint'&&<div className="paint-main">
          <div className="paint-view" hidden={paintTab!=='texture'}><PaintWorkspace toolbar={toolbarTarget} active={paintTab==='texture'} dock={dockTarget} previewProject={paintPreview} onPreview={setPaintPreview}/></div>
          <div className="paint-view" hidden={paintTab!=='uv'}><UVEditor toolbar={toolbarTarget} dock={dockTarget} active={paintTab==='uv'} onPreview={setPaintPreview}/></div>
        </div>}
        {state.mode==='animate'&&<AnimateWorkspace toolbar={toolbarTarget} dock={dockTarget}/>}
        <aside id="ortho-dock" className="suite-dock" aria-label="Panels">
          <div className="suite-hierarchy"><Outliner/></div>
          <SuiteResize label="Scene hierarchy height" storageKey="pivo-ortho-hierarchy" property="--pivo-hierarchy-height" initial={160} min={100} max={400} host=".suite-dock"/>
          <div className="suite-context-panel" ref={setDockTarget}>{state.mode==='model'&&<Inspector/>}</div>
        </aside>
      </div>
      <StatusBar />
      {toastMessage&&<div className="suite-toast" role="status">{toastMessage}</div>}
      {state.dialog==='recovery'&&<RecoveryDialog/>}
      {state.dialog === 'shortcuts' && <ShortcutsDialog onClose={() => dispatch({ t: 'setDialog', dialog: null })} />}
      {state.dialog === 'help' && <HelpDialog onClose={() => dispatch({ t: 'setDialog', dialog: null })} />}{state.dialog === 'about' && <AboutDialog onClose={() => dispatch({ t: 'setDialog', dialog: null })} />}
      {state.dialog === 'exports' && <ExportsDialog cameraRig={rig} currentView={activeView} onClose={() => dispatch({ t: 'setDialog', dialog: null })} />}
    </div>
  );
}

/**
 * Rectangle vertex selection: project all visible-mesh vertices into the
 * viewport camera (through-depth — depth does not restrict hits). The screen
 * rect arrives in viewport-local CSS pixels; the pane's camera is rebuilt from
 * the shared rig and the focused viewport's pane size maps rect -> NDC.
 */
function rectSelect(project: Project, p: SelectPayload, camRig: CameraRig): string[] {
  const [rx, ry, rw, rh] = p.screenRect!;
  const cam = new THREE.PerspectiveCamera(45, 1, 0.01, 200);
  cam.position.set(
    camRig.target[0] + camRig.distance * Math.cos(camRig.pitch) * Math.sin(camRig.yaw),
    camRig.target[1] + camRig.distance * Math.sin(camRig.pitch),
    camRig.target[2] + camRig.distance * Math.cos(camRig.pitch) * Math.cos(camRig.yaw),
  );
  cam.lookAt(camRig.target[0], camRig.target[1], camRig.target[2]);
  cam.updateMatrixWorld();
  const built = collectFaces(project);
  const pane = document.activeElement?.closest('.viewport') as HTMLElement | null;
  const paneW = Math.max(1, pane?.clientWidth ?? 400);
  const paneH = Math.max(1, pane?.clientHeight ?? 400);
  const ndcX0 = (rx / paneW) * 2 - 1;
  const ndcX1 = ((rx + rw) / paneW) * 2 - 1;
  const ndcY1 = -((ry / paneH) * 2 - 1);
  const ndcY0 = -(((ry + rh) / paneH) * 2 - 1);
  const hits: string[] = [];
  for (const vp of built.vertexPoints) {
    const [nx, ny] = projectToNdc(vp.pos, cam);
    if (nx >= Math.min(ndcX0, ndcX1) && nx <= Math.max(ndcX0, ndcX1) &&
        ny >= Math.min(ndcY0, ndcY1) && ny <= Math.max(ndcY0, ndcY1)) {
      hits.push(vp.vertexId);
    }
  }
  return hits;
}

export default function App(): React.JSX.Element {
  return (
    <ErrorBoundary>
      <StoreProvider>
        <AppInner />
      </StoreProvider>
    </ErrorBoundary>
  );
}

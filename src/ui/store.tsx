// PiVo Ortho — client-side store.
// React context + reducer owning: history-backed project, selection, mode,
// camera settings, tool state, and UI flags. All durable edits flow through
// history.commit; drag operations preview on a draft and commit once.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import { History, createProject, createPrimitive, uid } from '../core';
import { validateProject } from '../core/validate';
import type { Clip, Project } from '../core/types';

export type Mode = 'model' | 'paint' | 'animate';
export type SelectKind = 'mesh' | 'face' | 'vertex';
export type ModelTool = 'select' | 'move' | 'rotate' | 'scale';
export type PaintTool = 'pen' | 'eraser' | 'fill' | 'line' | 'rect' | 'ellipse' | 'marquee' | 'picker';
export type UVTool = 'move' | 'scale' | 'rotate';
export type ViewKind = 'front' | 'top' | 'side' | 'persp';

export interface Selection {
  meshIds: string[];
  faceIds: string[];
  vertexIds: string[];
  activeMeshId: string | null;
  kind: SelectKind;
}

export const emptySelection = (): Selection => ({
  meshIds: [], faceIds: [], vertexIds: [], activeMeshId: null, kind: 'mesh',
});

export interface UiState {
  project: Project;
  savedSnapshot:string|null;
  savedSource:'opened'|'downloaded'|null;
  recoverySnapshot:string|null;
  recoveryState:'pending'|'stored'|'unavailable'|'cleared';
  recoverySuspended:boolean;
  mode: Mode;
  selection: Selection;
  modelTool: ModelTool;
  paintTool: PaintTool;
  primary: number;
  secondary: number;
  paintFilled: boolean;
  brushSize: number;
  snap: number; // grid snap; 0 disables
  uvSnap: number;
  viewLayout: 'quad' | ViewKind; // maximize one view
  wireframe: boolean;
  status: string;
  dialog: null | 'shortcuts' | 'exports' | 'help' | 'recovery' | 'settings';
  exporting: null | { label: string; progress: number; cancel: boolean };
  undoLabel: string;
  redoLabel: string;
}

type Action =
  | { t: 'setProject'; project: Project; label?: string }
  | {t:'markSaved';snapshot:string;source?:'opened'|'downloaded'}
  | {t:'setRecovery';snapshot:string|null;status:UiState['recoveryState']}
  | {t:'clearRecovery'}
  | { t: 'setMode'; mode: Mode }
  | { t: 'setSelection'; selection: Selection }
  | { t: 'setTool'; tool: ModelTool | PaintTool }
  | { t: 'setPaint'; primary?: number; secondary?: number; filled?: boolean; brush?: number }
  | { t: 'setSnap'; snap: number }
  | { t: 'setUvSnap'; snap: number }
  | { t: 'setLayout'; layout: UiState['viewLayout'] }
  | { t: 'setWireframe'; wireframe: boolean }
  | { t: 'setStatus'; status: string }
  | { t: 'setDialog'; dialog: UiState['dialog'] }
  | { t: 'setExporting'; exporting: UiState['exporting'] }
  | { t: 'commit'; project: Project; label: string };

function reduce(state: UiState, a: Action): UiState {
  switch (a.t) {
    case 'markSaved':return {...state,savedSnapshot:a.snapshot,savedSource:a.source??'downloaded'};
    case 'setRecovery':return {...state,recoverySnapshot:a.snapshot,recoveryState:a.status};
    case 'clearRecovery':return {...state,recoverySnapshot:null,recoveryState:'cleared',recoverySuspended:true};
    case 'setProject': return { ...state, project: a.project,recoverySuspended:false,recoveryState:'pending', status: a.label ?? state.status };
    case 'setMode':
      // Switching mode keeps the mesh context (active mesh + multi-select) and
      // face picks (Paint's UV editor edits the faces picked in Model mode);
      // only model-only vertex picks reset.
      return {
        ...state,
        mode: a.mode,
        selection: {
          ...state.selection,
          vertexIds: [],
        },
      };
    case 'setSelection': return { ...state, selection: a.selection };
    case 'setTool': return state.mode==='model'?{...state,modelTool:a.tool as ModelTool}:{...state,paintTool:a.tool as PaintTool};
    case 'setPaint': return {
      ...state,
      primary: a.primary ?? state.primary,
      secondary: a.secondary ?? state.secondary,
      paintFilled: a.filled ?? state.paintFilled,
      brushSize: a.brush ?? state.brushSize,
    };
    case 'setSnap': return { ...state, snap: a.snap };
    case 'setUvSnap': return { ...state, uvSnap: a.snap };
    case 'setLayout': return { ...state, viewLayout: a.layout };
    case 'setWireframe': return { ...state, wireframe: a.wireframe, project: { ...state.project, render: { ...state.project.render, wireframe: a.wireframe } } };
    case 'setStatus': return { ...state, status: a.status };
    case 'setDialog': return { ...state, dialog: a.dialog };
    case 'setExporting': return { ...state, exporting: a.exporting };
    case 'commit': return { ...state, project: a.project,recoverySuspended:false,recoveryState:'pending', status: a.label };
    default: return state;
  }
}

interface Store {
  state: UiState;
  dispatch: React.Dispatch<Action>;
  history: History | null;
  /** commit a durable change; returns committed project or null on failure */
  commit: (label: string, mutate: (draft: Project) => void) => Project | null;
  cancelDrag: () => void;
}

const StoreCtx = createContext<Store | null>(null);

export function useStore(): Store {
  const s = useContext(StoreCtx);
  if (!s) throw new Error('store not mounted');
  return s;
}

const STORAGE_KEY = 'pivo-ortho:recovery:v1';
const SAVE_DEBOUNCE = 800;

export function makeDefaultProject(): Project {
  const project = createProject('PiVo Demo');
  const robot = createPrimitive('cube', 'Robot Body');
  robot.position = [0, 0.6, 0];
  const head = createPrimitive('cube', 'Head');
  head.position = [0, 1.55, 0];
  head.scale = [0.6, 0.6, 0.6];
  const legL = createPrimitive('cube', 'Leg L');
  legL.position = [-0.3, 0.15, 0];
  legL.scale = [0.25, 0.3, 0.25];
  const legR = createPrimitive('cube', 'Leg R');
  legR.position = [0.3, 0.15, 0];
  legR.scale = [0.25, 0.3, 0.25];
  const armL = createPrimitive('cube', 'Arm L');
  armL.position = [-0.75, 0.8, 0];
  armL.scale = [0.2, 0.55, 0.2];
  const armR = createPrimitive('cube', 'Arm R');
  armR.position = [0.75, 0.8, 0];
  armR.scale = [0.2, 0.55, 0.2];
  const eyeL = createPrimitive('pyramid', 'Eye L');
  eyeL.position = [-0.18, 1.6, 0.32];
  eyeL.scale = [0.12, 0.12, 0.12];
  eyeL.rotation = [Math.PI / 2, 0, 0];
  const eyeR = createPrimitive('pyramid', 'Eye R');
  eyeR.position = [0.18, 1.6, 0.32];
  eyeR.scale = [0.12, 0.12, 0.12];
  eyeR.rotation = [Math.PI / 2, 0, 0];
  const antenna = createPrimitive('cylinder', 'Antenna');
  antenna.position = [0, 2.05, 0];
  antenna.scale = [0.05, 0.3, 0.05];
  const meshList = [robot, head, legL, legR, armL, armR, eyeL, eyeR, antenna];
  for (const m of meshList) {
    for (const f of m.faces) {
      f.textured = true;
      f.shaded = true;
    }
  }
  for (const f of robot.faces) f.color = 3;
  for (const f of head.faces) f.color = 4;
  for (const f of legL.faces) f.color = 5;
  for (const f of legR.faces) f.color = 5;
  for (const f of armL.faces) f.color = 5;
  for (const f of armR.faces) f.color = 5;
  for (const f of eyeL.faces) f.color = 0;
  for (const f of eyeR.faces) f.color = 0;
  for (const f of antenna.faces) f.color = 2;
  project.meshes.push(...meshList);
  project.animation.duration = 4;
  const wave: Clip = {
    id: uid('clip'), meshId: head.id, track: 0, type: 'oscillation',
    axis: 'z', start: 0, duration: 4, amount: 0.08, curve: 'easeInOut',
    pingPong: true, frequency: 0.5, property: 'rotation',
  };
  project.animation.clips.push(wave);
  return project;
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const startupStatus=useRef('Ready — original demo scene loaded.');
  const historyRef = useRef<History | null>(null);
  let histRef: History | null = null;

  const init = useMemo(() => {
    let recovered: Project | null = null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        let parsed: Project;
        // Strict parse via core: schema checks, limits, pollution guards.
        // Any failure falls back to the demo scene (never a raw cast).
        try {
          parsed = JSON.parse(raw) as Project;
          validateProject(parsed);
        } catch {
          parsed = null as unknown as Project;
        }
        if (
          parsed && typeof parsed === 'object' &&
          parsed.format === 'pivo-ortho' && parsed.version === 1 &&
          Array.isArray(parsed.meshes) &&
          parsed.texture &&
          typeof parsed.texture.pixels === 'object' &&
          parsed.texture.pixels.length === 16384
        ) {
          recovered = parsed;
        }
      }
    } catch {
      recovered = null;
    }
    if(recovered)startupStatus.current='Browser recovery restored. Download a project to keep an editable backup.';
    const project = recovered ?? makeDefaultProject();
    const hist = new History(project, 60);
    historyRef.current = hist;
    histRef = hist;
    return hist;
  }, []);

  const [state, dispatch] = useReducer(reduce, undefined, () => ({
    project: init.current,
    savedSnapshot:null,savedSource:null,recoverySnapshot:null,recoveryState:'pending' as const,recoverySuspended:false,
    mode: 'model' as Mode,
    selection: emptySelection(),
    modelTool: 'select' as ModelTool,
    paintTool: 'pen' as PaintTool,
    primary: 3,
    secondary: 0,
    paintFilled: false,
    brushSize: 1,
    snap: 0.25,
    uvSnap: 4,
    viewLayout: 'quad' as const,
    wireframe: false,
    status:startupStatus.current,
    dialog: null,
    exporting: null,
    undoLabel: '',
    redoLabel: '',
  }));

  const commit = useCallback((label: string, mutate: (draft: Project) => void): Project | null => {
    const hist = historyRef.current;
    if (!hist) return null;
    try {
      const next = hist.commit(label, draft => {
        mutate(draft);
        for (const old of hist.current.meshes) {
          const locked = old.locked || !!hist.current.folders.find(f=>f.id===old.folderId)?.locked;
          if(!locked || label==='New project' || label==='Open project') continue;
          const after=draft.meshes.find(m=>m.id===old.id);
          if(!after) throw new Error(`Mesh ${old.name} is locked`);
          const editable=(m: typeof old)=>JSON.stringify({...m,visible:undefined,locked:undefined});
          if(editable(old)!==editable(after)) throw new Error(`Mesh ${old.name} is locked`);
          const clips=(p: Project)=>JSON.stringify(p.animation.clips.filter(c=>c.meshId===old.id));
          if(clips(hist.current)!==clips(draft)) throw new Error(`Animation for ${old.name} is locked`);
        }
        const ids=new Set(draft.meshes.map(m=>m.id));
        draft.animation.clips=draft.animation.clips.filter(c=>ids.has(c.meshId));
      });
      dispatch({ t: 'commit', project: next, label: `✓ ${label}` });
      return next;
    } catch (err) {
      dispatch({ t: 'setStatus', status: `Blocked: ${(err as Error).message}` });
      return null;
    }
  }, []);

  const cancelDrag = useCallback(() => {
    dispatch({ t: 'setStatus', status: 'Drag cancelled.' });
  }, []);

  // Debounced autosave with quota + security error reporting.
  useEffect(() => {
    if(state.recoverySuspended)return;
    const snapshot=JSON.stringify(state.project);
    const id = window.setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY,snapshot);
        dispatch({t:'setRecovery',snapshot,status:'stored'});
      } catch (err) {
        dispatch({t:'setRecovery',snapshot:null,status:'unavailable'});
        const e = err as DOMException;
        if (e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
          dispatch({ t: 'setStatus', status: 'Recovery save failed: localStorage quota exceeded. Use Save to keep a .pvo copy.' });
        } else {
          dispatch({ t: 'setStatus', status: 'Recovery save failed: storage unavailable.' });
        }
      }
    }, SAVE_DEBOUNCE);
    return () => window.clearTimeout(id);
  }, [state.project,state.recoverySuspended]);

  const store: Store = {
    state, dispatch, history: histRef ?? historyRef.current,
    commit, cancelDrag,
  };

  return <StoreCtx.Provider value={store}>{children}</StoreCtx.Provider>;
}

/** Stable clipboard, mode-aware (mesh JSON, UV corner arrays, clip JSON). */
export const clipboard: { kind: null | 'mesh' | 'uv' | 'clip'; data: unknown } = { kind: null, data: null };

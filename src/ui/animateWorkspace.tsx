import {DockPortal,SuiteResize} from './suite-components';
import {drawAtlas} from './atlasDraw';
import {useTextureNavigation} from './textureNavigation';
import {previewUV,TEXTURE_ZOOMS,type UVCorner} from './textureTools';
import {libraryClip,sampleClipGesture,clipTimingChanged,laneAt,pointerTime,animationWithPreview,animationLocked,type ClipGestureKind,type TrackRect} from './timeline';
import { ScenePreview } from './preview';
// PiVo Ortho — UV editing overlay + animate mode (clip timeline).
// UV: face corner handles over the pixel texture, drag/scale/rotate/flip,
// copy/paste, pixel snap; live textured model preview.
// Animate: clip library, four lanes per mesh, scrubbing, playback via core.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Clip, UVEdit, Vec2,Project } from '../core/types';
import { createClip, evaluateMesh, TEXTURE_SIZE, transformUV, uid } from '../core';
import { useStore, clipboard } from './store';
import { IconCopy, IconPause, IconPlay,IconArrowUp,IconArrowDown,IconArrowLeft,IconArrowRight,IconPlus } from './icons';

const TEX = TEXTURE_SIZE; // 128 — texture is square (TEX_W === TEX_H)

// ============================== UV EDITOR ==============================

interface UVHandle {
  meshId: string;
  faceId: string;
  corner: number;
  uv: Vec2;
}

export function UVEditor({onPreview,dock,active,toolbar}:{onPreview?:(project:Project|null)=>void;dock:HTMLElement|null;active:boolean;toolbar:HTMLElement|null}): React.JSX.Element {
  const previewOffsetRef = useRef<Vec2>([0, 0]);
  const { state, dispatch, commit } = useStore();
  const project = state.project;
  const tex = project.texture;
  const [zoom, setZoom] = useState(4);
  const [showGrid, setShowGrid] = useState(true);
  const [selCorners, setSelCorners] = useState<Set<string>>(new Set()); // `${faceId}:${corner}`
  const [drag, setDrag] = useState<{ startPx: Vec2; origUV: Map<string, Vec2>; meshId: string | null } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [uvPreview,setUvPreview]=useState<Project|null>(null);
  const uvGesture=useRef<{base:Project;corners:UVCorner[];start:Vec2;pointerId:number;preview:Project|null;meshId:string|null}|null>(null);
  const navigation=useTextureNavigation({zoom,setZoom,isEditing:()=>!!uvGesture.current});
  const [clipboardInfo, setClipboardInfo] = useState<string | null>(null);
  const scale = zoom;
  const cssSize = TEX * scale;

  const activeMesh = project.meshes.find((m) => m.id === state.selection.activeMeshId) ?? null;
  const selFaceSet = useMemo(() => new Set(state.selection.faceIds), [state.selection.faceIds]);

  // gather handles for selected faces
  const handles: UVHandle[] = useMemo(() => {
    const out: UVHandle[] = [];
    if (!activeMesh) return out;
    for (const face of activeMesh.faces) {
      if (!selFaceSet.has(face.id)) continue;
      face.uv.forEach((uv, corner) => {
        out.push({ meshId: activeMesh.id, faceId: face.id, corner, uv: [uv[0], uv[1]] });
      });
    }
    return out;
  }, [activeMesh, selFaceSet]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if(canvas.width!==cssSize)canvas.width=cssSize;if(canvas.height!==cssSize)canvas.height=cssSize;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    drawAtlas(ctx,tex,scale,0.85);
    if (showGrid && scale >= 2) {
      ctx.strokeStyle = 'rgba(128,145,166,0.18)';
      for (let i = 0; i <= TEX; i += 8) {
        ctx.beginPath(); ctx.moveTo(i * scale + 0.5, 0); ctx.lineTo(i * scale + 0.5, cssSize); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i * scale + 0.5); ctx.lineTo(cssSize, i * scale + 0.5); ctx.stroke();
      }
    }
    // draw all faces of active mesh as outlines; selected faces highlighted
    if (activeMesh) {
      for (const face of (uvPreview?.meshes.find(m=>m.id===activeMesh.id)??activeMesh).faces) {
        const selected = selFaceSet.has(face.id);
        ctx.strokeStyle = selected ? '#ffb03a' : 'rgba(128,145,166,0.5)';
        ctx.lineWidth = selected ? 2 : 1;
        ctx.beginPath();
        face.uv.forEach((uv, i) => {
          const x = uv[0] * scale;
          const y = uv[1] * scale;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.closePath();
        ctx.stroke();
      }
    }
    // handles (offset by live drag preview)
    const [offX, offY] = previewOffsetRef.current;
    for (const h of handles) {
      const key = `${h.faceId}:${h.corner}`;
      const selected = selCorners.has(key);
      const dragging = drag !== null && drag.origUV.has(key);
      const hx = h.uv[0] + (dragging ? offX : 0);
      const hy = h.uv[1] + (dragging ? offY : 0);
      ctx.fillStyle = selected ? '#ffb03a' : '#e8edf4';
      ctx.strokeStyle = '#0c1016';
      ctx.beginPath();
      ctx.arc(hx * scale, hy * scale, Math.max(3, scale * 0.9), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }, [tex, scale, cssSize, showGrid, activeMesh, selFaceSet, handles, selCorners, drag,uvPreview]);

  useEffect(() => { draw(); }, [draw]);
  const themeDraw=useRef(draw);themeDraw.current=draw;
  useEffect(()=>{const redraw=()=>themeDraw.current();window.addEventListener('pivo-ortho:theme-changed',redraw);return()=>window.removeEventListener('pivo-ortho:theme-changed',redraw)},[]);
  const cancelUVRef=useRef<()=>void>(()=>{});
  cancelUVRef.current=()=>{uvGesture.current=null;setDrag(null);setUvPreview(null);previewOffsetRef.current=[0,0];onPreview?.(null)};
  useEffect(()=>{const cancel=()=>cancelUVRef.current();const key=(e:KeyboardEvent)=>{if(e.key==='Escape'&&uvGesture.current){e.preventDefault();cancel();}};window.addEventListener('keydown',key);window.addEventListener('pivo-ortho:cancel-gesture',cancel);window.addEventListener('blur',cancel);return()=>{window.removeEventListener('keydown',key);window.removeEventListener('pivo-ortho:cancel-gesture',cancel);window.removeEventListener('blur',cancel);onPreview?.(null)}},[onPreview]);
  useEffect(()=>{if(uvGesture.current&&(uvGesture.current.meshId!==activeMesh?.id||activeMesh?.locked||project.folders.some(f=>f.id===activeMesh?.folderId&&f.locked)))cancelUVRef.current()},[activeMesh?.id,activeMesh?.locked,project.folders]);


  const hitHandle = useCallback((px: Vec2): UVHandle | null => {
    const tol = 6 / scale + 1;
    for (const h of handles) {
      if (Math.hypot(h.uv[0] - px[0], h.uv[1] - px[1]) <= tol) return h;
    }
    return null;
  }, [handles, scale]);

  const pxFromEvent = useCallback((e: React.PointerEvent): Vec2 | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * TEX;
    const y = ((e.clientY - rect.top) / rect.height) * TEX;
    return [x, y];
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if(navigation.beginPan(e))return;
    navigation.container.current?.focus({preventScroll:true});
    if(e.button!==0)return;
    const p = pxFromEvent(e);
    if (!p) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const hit = hitHandle(p);
    if (hit) {
      if(activeMesh?.locked||project.folders.some(f=>f.id===activeMesh?.folderId&&f.locked)){dispatch({t:'setStatus',status:'UV edit blocked: mesh or folder locked.'});return;}
      const key = `${hit.faceId}:${hit.corner}`;
      const next = new Set(selCorners);
      if (e.shiftKey) {
        if (next.has(key)) next.delete(key); else next.add(key);
        setSelCorners(next);
      } else if (!next.has(key)) {
        next.clear(); next.add(key);
        setSelCorners(next);
      }
      // start drag of all selected corners
      const orig = new Map<string, Vec2>();
      for (const h of handles) {
        if (next.has(`${h.faceId}:${h.corner}`)) {
          orig.set(`${h.faceId}:${h.corner}`, [h.uv[0], h.uv[1]]);
        }
      }
      setDrag({ startPx: p, origUV: orig, meshId: activeMesh?.id ?? null });
      uvGesture.current={base:structuredClone(project),corners:handles.filter(h=>next.has(`${h.faceId}:${h.corner}`)).map(h=>({...h,uv:[...h.uv]})),start:p,pointerId:e.pointerId,preview:null,meshId:activeMesh?.id??null};
    } else {
      // rectangle select corners
      setDrag({ startPx: p, origUV: new Map(), meshId: null });
      uvGesture.current={base:project,corners:[],start:p,pointerId:e.pointerId,preview:null,meshId:activeMesh?.id??null};
      setSelCorners(new Set());
    }
  }, [hitHandle, selCorners, handles, pxFromEvent,navigation,activeMesh,project,dispatch]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const gesture=uvGesture.current;if (!gesture) return;
    const p = pxFromEvent(e);
    if (!p) return;
    if (gesture.corners.length > 0) {
      const dx = p[0] - gesture.start[0];
      const dy = p[1] - gesture.start[1];
      const snap = e.ctrlKey||e.metaKey?0:state.uvSnap;
      const sd = snap > 0 ? Math.round(dx / snap) * snap : dx;
      const sd2 = snap > 0 ? Math.round(dy / snap) * snap : dy;
      // live preview: mutate the texture-space positions in-place in a draft? We
      // draw handles directly from state, so store offsets via a preview map.
      previewOffsetRef.current = [sd, sd2];
      try{const result=previewUV(gesture.base,gesture.corners,[sd,sd2],0);gesture.preview=result;setUvPreview(result);onPreview?.(result)}catch(err){dispatch({t:'setStatus',status:(err as Error).message});cancelUVRef.current()}
      draw();
    }
  }, [drag, pxFromEvent, state.uvSnap, draw,onPreview,dispatch]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    const gesture=uvGesture.current;uvGesture.current=null;setUvPreview(null);onPreview?.(null);
    if (!drag||!gesture) return;
    const p = pxFromEvent(e);
    if (drag.origUV.size === 0 && p) {
      // rectangle select
      const min: Vec2 = [Math.min(drag.startPx[0], p[0]), Math.min(drag.startPx[1], p[1])];
      const max: Vec2 = [Math.max(drag.startPx[0], p[0]), Math.max(drag.startPx[1], p[1])];
      const next = new Set<string>();
      for (const h of handles) {
        if (h.uv[0] >= min[0] && h.uv[0] <= max[0] && h.uv[1] >= min[1] && h.uv[1] <= max[1]) {
          next.add(`${h.faceId}:${h.corner}`);
        }
      }
      setSelCorners(next);
      setDrag(null);
      previewOffsetRef.current = [0, 0];
      return;
    }
    const [dx, dy] = previewOffsetRef.current;
    previewOffsetRef.current = [0, 0];
    setDrag(null);
    if ((dx !== 0 || dy !== 0)&&gesture.preview) {
      commit('Move UV corners', draft=>{
        const mesh=draft.meshes.find(m=>m.id===gesture.meshId),base=gesture.base.meshes.find(m=>m.id===gesture.meshId),preview=gesture.preview?.meshes.find(m=>m.id===gesture.meshId);
        if(!mesh||!base||!preview)throw new Error('UV mesh no longer exists');
        if(mesh.locked||draft.folders.some(f=>f.id===mesh.folderId&&f.locked))throw new Error('UV mesh or folder locked');
        if(JSON.stringify(mesh.faces)!==JSON.stringify(base.faces))throw new Error('UV data changed during drag');
        mesh.faces=preview.faces;
      });
    }
  }, [drag, pxFromEvent, handles, commit,onPreview]);

  const applyUVEdit = useCallback((edit: UVEdit, label: string) => {
    if (state.selection.faceIds.length === 0) {
      dispatch({ t: 'setStatus', status: 'Select faces first (Model mode face picking).' });
      return;
    }
    const meshId = state.selection.activeMeshId;
    const faceIds = [...state.selection.faceIds];
    commit(label, (draft) => {
      const mesh = draft.meshes.find((m) => m.id === meshId);
      if (mesh) transformUV(mesh, faceIds, edit);
    });
  }, [state.selection.faceIds, state.selection.activeMeshId, commit, dispatch]);

  const copyUV = useCallback(() => {
    if (!activeMesh || state.selection.faceIds.length === 0) return;
    const face = activeMesh.faces.find((f) => f.id === state.selection.faceIds[0]);
    if (!face) return;
    clipboard.kind = 'uv';
    clipboard.data = { uv: face.uv.map((u) => [u[0], u[1]]), cornerCount: face.vertices.length };
    setClipboardInfo(`UV of face (${face.vertices.length} corners) copied.`);
  }, [activeMesh, state.selection.faceIds]);

  const pasteUV = useCallback(() => {
    if (clipboard.kind !== 'uv') { dispatch({ t: 'setStatus', status: 'UV clipboard is empty.' }); return; }
    const data = clipboard.data as { uv: Vec2[]; cornerCount: number };
    if (!activeMesh || state.selection.faceIds.length === 0) return;
    const face = activeMesh.faces.find((f) => f.id === state.selection.faceIds[0]);
    if (!face) return;
    if (face.vertices.length !== data.cornerCount) {
      dispatch({ t: 'setStatus', status: `Paste rejected: source has ${data.cornerCount} corners, target has ${face.vertices.length}.` });
      return;
    }
    commit('Paste UV', (draft) => {
      const df = draft.meshes.find((m) => m.id === activeMesh.id)?.faces.find((f) => f.id === face.id);
      if (df) df.uv = data.uv.map((u) => [u[0], u[1]]);
    });
    setClipboardInfo('UV pasted.');
  }, [activeMesh, state.selection.faceIds, commit, dispatch]);

  return (
    <div className="uv-editor"><nav className="suite-tool-rail uv-tool-rail" aria-label="UV tools">        <button type="button" onClick={() => applyUVEdit({ offset: [0, -state.uvSnap || -1] }, 'UV up')} aria-label="Nudge UVs up"><IconArrowUp/></button>
        <button type="button" onClick={() => applyUVEdit({ offset: [0, state.uvSnap || 1] }, 'UV down')} aria-label="Nudge UVs down"><IconArrowDown/></button>
        <button type="button" onClick={() => applyUVEdit({ offset: [-(state.uvSnap || 1), 0] }, 'UV left')} aria-label="Nudge UVs left"><IconArrowLeft/></button>
        <button type="button" onClick={() => applyUVEdit({ offset: [state.uvSnap || 1, 0] }, 'UV right')} aria-label="Nudge UVs right"><IconArrowRight/></button>
        <div className="vsep" />
        <button type="button" onClick={() => applyUVEdit({ scale: [1.1, 1.1] }, 'Scale UV up')} aria-label="Scale UVs up">+</button>
        <button type="button" onClick={() => applyUVEdit({ scale: [0.9, 0.9] }, 'Scale UV down')} aria-label="Scale UVs down">−</button>
        <button type="button" onClick={() => applyUVEdit({ rotation: Math.PI / 2 }, 'Rotate UV 90°')} aria-label="Rotate UVs 90 degrees">90°</button>
        <button type="button" onClick={() => applyUVEdit({ flipX: true }, 'Flip UV X')} aria-label="Flip UVs horizontally">H</button>
        <button type="button" onClick={() => applyUVEdit({ flipY: true }, 'Flip UV Y')} aria-label="Flip UVs vertically">V</button>
</nav>
      <DockPortal target={toolbar} hidden={!active}><div className="uv-toolbar">
        <label className="inline-label" htmlFor="uv-zoom">Zoom
          <select id="uv-zoom" value={zoom} onChange={(e) => navigation.changeZoom(Number(e.target.value))}>
            {TEXTURE_ZOOMS.map((z) => <option key={z} value={z}>{z}×</option>)}
          </select>
        </label>
        <button onClick={navigation.fit} aria-label="Fit UV texture">Fit</button><button onClick={navigation.reset} aria-label="Reset UV texture view">Reset view</button>
        <label className="inline-label check"><input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} />Grid</label>
        <label className="inline-label" htmlFor="uv-snap">Snap (px)
          <input id="uv-snap" type="number" min={0} max={32} value={state.uvSnap}
            onChange={(e) => dispatch({ t: 'setUvSnap', snap: Math.max(0, Number(e.target.value) || 0) })} style={{ width: 52 }} />
        </label>
        <div className="vsep" />
        <details className="suite-menu"><summary>UV actions</summary><div className="suite-menu-popup">        <div className="vsep" />
        <button type="button" onClick={copyUV}>Copy UV</button>
        <button type="button" onClick={pasteUV}>Paste UV</button>
        <button type="button" onClick={() => setSelCorners(new Set())}>Clear selection</button>
        {clipboardInfo && <span className="hint">{clipboardInfo}</span>}
</div></details>
      </div></DockPortal>
<details className="suite-instructions texture-help"><summary>UV usage help</summary><p className="hint texture-hint">UV handles update the real model while dragging. Wheel zooms at pointer; Space+drag or middle-drag pans; Home fits. Ctrl/Cmd disables UV snap; Escape discards edits.</p></details>
      <div className="uv-body">
        <div ref={navigation.container} {...navigation.bind} className={`uv-canvas-wrap ${navigation.panning?'texture-panning':''}`} aria-label="UV texture navigation"><canvas
          ref={canvasRef}
          className="uv-canvas"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={()=>cancelUVRef.current()}
          onContextMenu={e=>e.preventDefault()}
          aria-label="UV editor over 128 pixel texture"
          role="img"
        /></div>
        <DockPortal target={dock} hidden={!active}><div className="uv-side">
          <h3>Selected faces</h3>
          {state.selection.faceIds.length === 0 && <p className="hint">Select faces in Model mode (Face pick) to edit UVs.</p>}
          {activeMesh && state.selection.faceIds.map((fid) => {
            const face = activeMesh.faces.find((f) => f.id === fid);
            if (!face) return null;
            return (
              <div key={fid} className="uv-face-info">
                <strong>{face.id.slice(0, 8)}</strong>
                {face.uv.map((uv, i) => (
                  <label key={i} className="uv-corner">
                    C{i} U<input type="number" value={uv[0]} step={1} aria-label={`Face corner ${i} U`}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        commit('Set UV corner', (draft) => {
                          const df = draft.meshes.find((m) => m.id === activeMesh.id)?.faces.find((f) => f.id === fid);
                          if (df && Number.isFinite(v)) df.uv[i] = [v, df.uv[i][1]];
                        });
                      }} />
                    V<input type="number" value={uv[1]} step={1} aria-label={`Face corner ${i} V`}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        commit('Set UV corner', (draft) => {
                          const df = draft.meshes.find((m) => m.id === activeMesh.id)?.faces.find((f) => f.id === fid);
                          if (df && Number.isFinite(v)) df.uv[i] = [df.uv[i][0], v];
                        });
                      }} />
                  </label>
                ))}
              </div>
            );
          })}
        </div></DockPortal>
      </div>
    </div>
  );
}

// ============================== ANIMATE MODE ==============================

const CLIP_LIBRARY: Array<{ type: Clip['type']; label: string; hint: string }> = [
  { type: 'movement', label: 'Movement', hint: 'Additive world offset' },
  { type: 'rotation', label: 'Rotation', hint: 'Additive rotation (radians)' },
  { type: 'scale', label: 'Scale', hint: 'Multiplicative end scale' },
  { type: 'visibility', label: 'Visibility', hint: 'Hidden during interval' },
  { type: 'oscillation', label: 'Oscillation', hint: 'Sine cycles/sec' },
];

interface TimelineGesture {kind:ClipGestureKind|'library';original:Clip;preview:Clip;meshId:string;duration:number;grab:number;pointerId:number;capture:HTMLElement;downX:number;downY:number;moved:boolean;valid:boolean;returnToPlay:boolean}

const CURVES: Array<Clip['curve']> = ['linear', 'easeIn', 'easeOut', 'easeInOut'];

export function AnimateWorkspace({dock,toolbar}:{dock:HTMLElement|null;toolbar:HTMLElement|null}): React.JSX.Element {
  const { state, dispatch, commit } = useStore();
  const project = state.project;
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [selClipId, setSelClipId] = useState<string | null>(null);
  const [laneMeshId, setLaneMeshId] = useState<string | null>(state.selection.activeMeshId);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const timelineRef=useRef<HTMLDivElement|null>(null);
  const gestureRef=useRef<TimelineGesture|null>(null);
  const suppressClick=useRef(false);
  const [gesturePreview,setGesturePreview]=useState<Clip|null>(null);
  const [dragging,setDragging]=useState(false);
  const [hoverTrack,setHoverTrack]=useState<number|null>(null);
  const [timelineSnap,setTimelineSnap]=useState(0.05);

  const anim = project.animation;
  const activeMesh = project.meshes.find((m) => m.id === (state.selection.activeMeshId ?? laneMeshId)) ?? project.meshes[0] ?? null;

  useEffect(() => {
    if (!playing) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }
    const tick = (ts: number) => {
      if (lastTsRef.current != null) {
        const dt = (ts - lastTsRef.current) / 1000;
        setTime((t) => {
          const nt = t + dt;
          return nt % anim.duration;
        });
      }
      lastTsRef.current = ts;
      rafRef.current = requestAnimationFrame(tick);
    };
    lastTsRef.current = null;
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastTsRef.current = null;
    };
  }, [playing, anim.duration]);

  const clipsForMesh = useMemo(
    () => anim.clips.filter((c) => c.meshId === activeMesh?.id).sort((a, b) => a.track - b.track || a.start - b.start),
    [anim.clips, activeMesh],
  );

  const addClip = useCallback((type: Clip['type']) => {
    if (!activeMesh) { dispatch({ t: 'setStatus', status: 'No mesh selected.' }); return; }
    let created: string|null=null;
    const result=commit(`Add ${type} clip`, (draft) => {
      const track=[0,1,2,3].sort((a,b)=>draft.animation.clips.filter(c=>c.meshId===activeMesh.id&&c.track===a).length-draft.animation.clips.filter(c=>c.meshId===activeMesh.id&&c.track===b).length)[0];
      const clip=libraryClip(activeMesh.id,type,track,time,draft.animation.duration,timelineSnap);
      created=clip.id;
      draft.animation.clips.push(clip);
    });
    if(result&&created)setSelClipId(created);
  }, [activeMesh, time, commit, dispatch,timelineSnap]);

  const updateClip = useCallback((clipId: string, patch: Partial<Clip>) => {
    commit('Edit clip', (draft) => {
      const clip = draft.animation.clips.find((c) => c.id === clipId);
      if (!clip) return;
      Object.assign(clip, patch);
      if (clip.duration <= 0) clip.duration = 0.01;
      if (clip.start < 0) clip.start = 0;
    });
  }, [commit]);

  const deleteClip = useCallback((clipId: string) => {
    commit('Delete clip', (draft) => {
      draft.animation.clips = draft.animation.clips.filter((c) => c.id !== clipId);
    });
    setSelClipId(null);
  }, [commit]);

  const duplicateClip = useCallback((clipId: string) => {
    commit('Duplicate clip', (draft) => {
      const src = draft.animation.clips.find((c) => c.id === clipId);
      if (!src) return;
      const copy: Clip = { ...structuredClone(src), id: uid('clip'), start: src.start + src.duration };
      draft.animation.clips.push(copy);
    });
  }, [commit]);

  const copyClip = useCallback((clipId: string) => {
    const clip = anim.clips.find((c) => c.id === clipId);
    if (!clip) return;
    clipboard.kind = 'clip';
    clipboard.data = structuredClone(clip);
    dispatch({ t: 'setStatus', status: 'Clip copied.' });
  }, [anim.clips, dispatch]);

  const pasteClip = useCallback(() => {
    if (clipboard.kind !== 'clip' || !activeMesh) return;
    const src = clipboard.data as Clip;
    commit('Paste clip', (draft) => {
      draft.animation.clips.push({ ...structuredClone(src), id: uid('clip'), meshId: activeMesh.id });
    });
  }, [activeMesh, commit]);

  const timelineWidth = 100; // percent-based
  const timeFrac = anim.duration > 0 ? time / anim.duration : 0;

  const previewProject=useMemo(()=>animationWithPreview(project,gesturePreview),[project,gesturePreview]);
  const shownClips=useMemo(()=>previewProject.animation.clips.filter(c=>c.meshId===activeMesh?.id).sort((a,b)=>a.track-b.track||a.start-b.start),[previewProject,activeMesh]);
  const latest=useRef({project,activeMesh,commit,dispatch,playing,timelineSnap});
  latest.current={project,activeMesh,commit,dispatch,playing,timelineSnap};
  const trackRects=():TrackRect[]=>Array.from(timelineRef.current?.querySelectorAll<HTMLElement>('.lane-track')??[]).map(el=>{const r=el.getBoundingClientRect();return {track:Number(el.dataset.track),left:r.left,right:r.right,top:r.top,bottom:r.bottom}});
  const finishGesture=(cancel=false)=>{
    const g=gestureRef.current;if(!g)return;
    if(g.kind==='library'&&(g.moved||cancel))suppressClick.current=true;
    gestureRef.current=null;setGesturePreview(null);setDragging(false);setHoverTrack(null);
    try{if(g.capture.hasPointerCapture(g.pointerId))g.capture.releasePointerCapture(g.pointerId)}catch{}
    const ctx=latest.current;
    if(g.returnToPlay)setPlaying(true);
    if(g.kind==='library'&&!g.moved&&!cancel)return;
    if(cancel||!g.valid||ctx.activeMesh?.id!==g.meshId||ctx.project.animation.duration!==g.duration||animationLocked(ctx.project,g.meshId)){
      ctx.dispatch({t:'setStatus',status:cancel?'Timeline gesture cancelled.':'Timeline drop rejected; original clip unchanged.'});return;
    }
    if(g.kind==='library'){
      if(!g.moved)return;
      const result=ctx.commit(`Add ${g.preview.type} clip by drop`,draft=>{if(animationLocked(draft,g.meshId))throw new Error('Mesh is locked');draft.animation.clips.push(structuredClone(g.preview));});
      if(result)setSelClipId(g.preview.id);return;
    }
    if(!g.moved||!clipTimingChanged(g.original,g.preview))return;
    const current=ctx.project.animation.clips.find(c=>c.id===g.original.id);
    if(!current||JSON.stringify(current)!==JSON.stringify(g.original)){ctx.dispatch({t:'setStatus',status:'Timeline changed during gesture; edit cancelled.'});return;}
    ctx.commit(g.kind==='move'?'Move clip':g.kind==='left'?'Resize clip left':'Resize clip right',draft=>{const c=draft.animation.clips.find(c=>c.id===g.original.id);if(!c)throw new Error('Clip no longer exists');if(animationLocked(draft,c.meshId))throw new Error('Mesh is locked');c.start=g.preview.start;c.duration=g.preview.duration;c.track=g.preview.track;});
  };
  const beginGesture=(event:React.PointerEvent<HTMLElement>,kind:ClipGestureKind|'library',clip:Clip)=>{
    if(event.button!==0||gestureRef.current)return;
    if(kind==='library')suppressClick.current=false;
    if(kind!=='library')event.preventDefault();event.stopPropagation();
    const ctx=latest.current;
    if(!ctx.activeMesh||animationLocked(ctx.project,clip.meshId)){ctx.dispatch({t:'setStatus',status:'Timeline edit blocked: mesh or folder is locked.'});return;}
    const rect=trackRects().find(r=>r.track===clip.track)??trackRects()[0];if(!rect)return;
    setSelClipId(kind==='library'?selClipId:clip.id);
    const capture=kind==='library'?event.currentTarget:(timelineRef.current??event.currentTarget);
    gestureRef.current={kind,original:structuredClone(clip),preview:structuredClone(clip),meshId:clip.meshId,duration:ctx.project.animation.duration,grab:kind==='move'?pointerTime(rect,event.clientX,ctx.project.animation.duration)-clip.start:0,pointerId:event.pointerId,capture,downX:event.clientX,downY:event.clientY,moved:false,valid:kind!=='library',returnToPlay:ctx.playing};
    capture.setPointerCapture(event.pointerId);setDragging(true);setPlaying(false);
    if(kind!=='library')setGesturePreview(structuredClone(clip));
  };
  const samplePointer=(event:PointerEvent)=>{
    const g=gestureRef.current;if(!g||event.pointerId!==g.pointerId)return;
    if(Math.hypot(event.clientX-g.downX,event.clientY-g.downY)>3)g.moved=true;
    if(!g.moved)return;
    const rects=trackRects(),target=laneAt(rects,event.clientX,event.clientY,g.kind!=='library');
    if(g.kind==='move'||g.kind==='library'){
      g.valid=!!target;setHoverTrack(target?.track??null);
      if(!target){if(g.kind==='library')setGesturePreview(null);return;}
      const at=pointerTime(target,event.clientX,g.duration);
      g.preview=sampleClipGesture(g.original,'move',at-g.grab,target.track,g.duration,latest.current.timelineSnap,event.ctrlKey||event.metaKey);
    }else{
      const rect=rects.find(r=>r.track===g.original.track);if(!rect){g.valid=false;return;}
      g.valid=true;setHoverTrack(g.original.track);
      g.preview=sampleClipGesture(g.original,g.kind,pointerTime(rect,event.clientX,g.duration),g.original.track,g.duration,latest.current.timelineSnap,event.ctrlKey||event.metaKey);
    }
    setGesturePreview(structuredClone(g.preview));
  };
  const handlers=useRef({samplePointer,finishGesture});handlers.current={samplePointer,finishGesture};
  useEffect(()=>{
    const move=(e:PointerEvent)=>handlers.current.samplePointer(e);
    const up=(e:PointerEvent)=>{if(gestureRef.current?.pointerId===e.pointerId){handlers.current.samplePointer(e);handlers.current.finishGesture(false)}};
    const cancel=()=>handlers.current.finishGesture(true);
    const pointerCancel=(e:PointerEvent)=>{if(gestureRef.current?.pointerId===e.pointerId)cancel()};
    const key=(e:KeyboardEvent)=>{if(e.key==='Escape'&&gestureRef.current){e.preventDefault();cancel()}};
    window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);window.addEventListener('pointercancel',pointerCancel);window.addEventListener('keydown',key);window.addEventListener('pivo-ortho:cancel-gesture',cancel);window.addEventListener('blur',cancel);
    return()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',pointerCancel);window.removeEventListener('keydown',key);window.removeEventListener('pivo-ortho:cancel-gesture',cancel);window.removeEventListener('blur',cancel);const g=gestureRef.current;gestureRef.current=null;try{if(g?.capture.hasPointerCapture(g.pointerId))g.capture.releasePointerCapture(g.pointerId)}catch{}};
  },[]);
  useEffect(()=>{if(gestureRef.current&&(gestureRef.current.meshId!==activeMesh?.id||animationLocked(project,gestureRef.current.meshId)))handlers.current.finishGesture(true)},[activeMesh,project]);

  const resizeByKey=(event:React.KeyboardEvent<HTMLElement>,kind:'left'|'right',clip:Clip)=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();event.stopPropagation();
    if(dragging||animationLocked(project,clip.meshId)){dispatch({t:'setStatus',status:'Timeline resize blocked: mesh or folder is locked.'});return;}
    const step=event.ctrlKey||event.metaKey?1/anim.fps:timelineSnap>0?timelineSnap:1/anim.fps;
    const edge=kind==='left'?clip.start:clip.start+clip.duration;
    const target=event.key==='Home'?0:event.key==='End'?anim.duration:edge+(event.key==='ArrowRight'?step:-step);
    const preview=sampleClipGesture(clip,kind,target,clip.track,anim.duration,timelineSnap,event.ctrlKey||event.metaKey);
    if(clipTimingChanged(clip,preview))commit(`Resize clip ${kind}`,draft=>{const c=draft.animation.clips.find(c=>c.id===clip.id);if(c){c.start=preview.start;c.duration=preview.duration;}});
  };

  const evalPose = useCallback((meshId: string) => {
    const mesh = project.meshes.find((m) => m.id === meshId);
    if (!mesh) return null;
    try {
      return evaluateMesh(mesh, previewProject.animation, time);
    } catch {
      return null;
    }
  }, [project.meshes, previewProject.animation, time]);

  return (
    <div className="animate-workspace"><nav className="suite-tool-rail animate-tools" aria-label="Animation tools">{CLIP_LIBRARY.map(c=><button key={c.type} aria-label={`Add ${c.label} clip`} title={`Add ${c.label} clip`} disabled={!activeMesh||animationLocked(project,activeMesh.id)} onClick={()=>addClip(c.type)}><IconPlus/><span>{c.label.slice(0,1)}</span></button>)}</nav>
      <DockPortal target={toolbar}><div className="animate-toolbar">
        <label className="inline-label" htmlFor="lane-mesh">Mesh
          <select
            id="lane-mesh" disabled={dragging} value={activeMesh?.id ?? ''}
            onChange={(e) => { setLaneMeshId(e.target.value); dispatch({t:'setSelection',selection:{...state.selection, activeMeshId:e.target.value, meshIds:[e.target.value]}}); }}
          >
            {project.meshes.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </label>
        <div className="vsep" />
        <div className="vsep" />
        <button type="button" disabled={dragging} onClick={() => { setPlaying(!playing); }} aria-pressed={playing}>
          {playing ? <IconPause /> : <IconPlay />} {playing ? 'Pause' : 'Play'}
        </button>
        <label className="inline-label" htmlFor="anim-dur">Duration (s)
          <input
            id="anim-dur" disabled={dragging} type="number" min={0.1} step={0.1} value={anim.duration}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (v > 0) commit('Set animation duration', (draft) => { draft.animation.duration = v; });
            }}
            style={{ width: 64 }}
          />
        </label>
        <label className="inline-label" htmlFor="anim-fps">FPS
          <input
            id="anim-fps" disabled={dragging} type="number" min={1} max={60} value={anim.fps}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (v >= 1) commit('Set animation fps', (draft) => { draft.animation.fps = v; });
            }}
            style={{ width: 56 }}
          />
        </label>
        <details className="suite-menu"><summary>Timeline options</summary><div className="suite-menu-popup"><label className="narrow-duration">Duration (s)<input aria-label="Animation duration (compact)" type="number" min={0.1} step={0.1} value={anim.duration} disabled={dragging} onChange={e=>{const value=Number(e.target.value);if(value>0)commit('Set animation duration',draft=>{draft.animation.duration=value;});}}/></label>        <button type="button" disabled={dragging} onClick={pasteClip}>Paste clip</button>
        <label className="inline-label">Selected clip<select aria-label="Selected timeline clip" value={selClipId??''} disabled={dragging} onChange={e=>setSelClipId(e.target.value||null)}><option value="">Choose a clip</option>{clipsForMesh.map(c=><option key={c.id} value={c.id}>{c.type} · track {c.track} · {c.start.toFixed(2)}s</option>)}</select></label>
        <label className="inline-label">Timeline snap (s)<input aria-label="Timeline snap seconds" type="number" min={0} step={0.05} value={timelineSnap} disabled={dragging} onChange={e=>setTimelineSnap(Math.max(0,Number(e.target.value)||0))} style={{width:62}}/></label>
</div></details>
      </div></DockPortal>

      <div className="animate-preview"><ScenePreview project={previewProject} time={time} animated/>{!clipsForMesh.length&&<div className="suite-empty">{activeMesh?'No clips for this mesh':'Select a mesh to animate'}<button disabled={!activeMesh||animationLocked(project,activeMesh.id)} onClick={()=>addClip('movement')}>Add clip</button></div>}</div>
      <SuiteResize label="Animation timeline height" storageKey="pivo-ortho-timeline" property="--pivo-timeline-height" initial={166} min={120} max={400} host=".animate-workspace" direction={-1}/>
      <div className="animate-body">
        <div ref={timelineRef} className="timeline" role="group" aria-label="Animation timeline">
          <div className="timeline-header">
            <span>Tracks 0–3 · {activeMesh?.name ?? 'no mesh'}</span>
            <span>{time.toFixed(2)}s / {anim.duration}s</span>
          </div>


          {[0, 1, 2, 3].map((track) => (
            <div key={track} className="lane" data-track={track}>
              <span className="lane-label">{track}</span>
              <div
                className={`lane-track ${hoverTrack===track?'drop-target':''}`} data-track={track}
                onPointerDown={(e) => {
                  if(dragging)return;
                  setPlaying(false);
                  // scrub when clicking empty lane
                  const rect = e.currentTarget.getBoundingClientRect();
                  const frac = (e.clientX - rect.left) / rect.width;
                  setTime(Math.max(0, Math.min(anim.duration, frac * anim.duration)));
                }}
                onKeyDown={e=>{if(dragging)return;if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();setPlaying(false);setTime(t=>e.key==='Home'?0:e.key==='End'?anim.duration:Math.max(0,Math.min(anim.duration,t+(e.key==='ArrowRight'?1:-1)/anim.fps)));}}}
                role="slider"
                aria-label={`Track ${track} scrub`}
                aria-valuenow={time} aria-valuemin={0} aria-valuemax={anim.duration}
                tabIndex={0}
              >
                {shownClips.filter((c) => c.track === track).map((rawClip) => {
                  const clip = rawClip;
                  const left = (clip.start / anim.duration) * timelineWidth;
                  const width = (clip.duration / anim.duration) * timelineWidth;
                  return (
                    <button
                      key={clip.id}
                      type="button"
                      className={`clip ${selClipId === clip.id ? 'selected' : ''} ${gesturePreview?.id===clip.id?'gesture-preview':''} type-${clip.type}`}
                      style={{ left: `${left}%`, width: `${Math.max(2, width)}%` }}
                      data-clip-id={clip.id} data-start={clip.start} data-duration={clip.duration} data-track={clip.track}
                      onClick={()=>setSelClipId(clip.id)}
                      onPointerDown={e=>beginGesture(e,'move',clip)}
                      aria-label={`${clip.type} clip, start ${clip.start}s, duration ${clip.duration}s`}
                    >
                      <span className="clip-handle left" role="slider" tabIndex={0} aria-label="Resize clip left edge" aria-valuenow={clip.start} aria-valuemin={0} aria-valuemax={clip.start+clip.duration} onKeyDown={e=>resizeByKey(e,'left',clip)} onPointerDown={e=>beginGesture(e,'left',clip)} />
                      <span className="clip-name">{clip.type}</span>
                      <span className="clip-handle right" role="slider" tabIndex={0} aria-label="Resize clip right edge" aria-valuenow={clip.start+clip.duration} aria-valuemin={clip.start} aria-valuemax={Math.max(anim.duration,clip.start+clip.duration)} onKeyDown={e=>resizeByKey(e,'right',clip)} onPointerDown={e=>beginGesture(e,'right',clip)} />
                    </button>
                  );
                })}
                <div className="playhead" style={{ left: `${timeFrac * timelineWidth}%` }} aria-hidden />
              </div>
            </div>
          ))}
        </div>

        <DockPortal target={dock}><div className="clip-inspector">
          <h3>Clip properties</h3><details className="suite-instructions"><summary>Timeline usage help</summary><p>Drag library clips to a lane; drag clips between tracks; drag either edge to resize. Ctrl/Cmd disables snapping. Escape cancels.</p></details>
          <details className="suite-menu"><summary>Add clip</summary><div className="suite-menu-popup">        {CLIP_LIBRARY.map((c) => (
          <button key={c.type} type="button" title={`${c.hint}. Click to add, or drag onto a track.`} disabled={!activeMesh||animationLocked(project,activeMesh.id)} data-library-type={c.type} aria-label={`+ ${c.label}`}
            onPointerDown={e=>{if(activeMesh)beginGesture(e,'library',libraryClip(activeMesh.id,c.type,0,0,anim.duration,timelineSnap))}}
            onClick={e=>{if(suppressClick.current&&e.detail>0){suppressClick.current=false;return;}suppressClick.current=false;addClip(c.type)}}>
            <IconPlus/> {c.label}
          </button>
        ))}
</div></details>
          {!selClipId && <p className="hint">Select a clip on the timeline.</p>}
          {selClipId && (() => {
            const clip = gesturePreview?.id===selClipId?gesturePreview:anim.clips.find((c) => c.id === selClipId);
            if (!clip) return null;
            return (
              <fieldset className="clip-fields" disabled={dragging||animationLocked(project,clip.meshId)}>
                <label>Type
                  <select value={clip.type} onChange={(e) => updateClip(clip.id, { type: e.target.value as Clip['type'] })}>
                    {CLIP_LIBRARY.map((c) => <option key={c.type} value={c.type}>{c.label}</option>)}
                  </select>
                </label>
                <label>Track (0–3)
                  <input type="number" min={0} max={3} value={clip.track}
                    onChange={(e) => {
                      const v = Math.max(0, Math.min(3, Number(e.target.value) || 0));
                      updateClip(clip.id, { track: v });
                    }} />
                </label>
                <label>Start (s)
                  <input type="number" min={0} step={0.05} value={clip.start}
                    onChange={(e) => updateClip(clip.id, { start: Math.max(0, Number(e.target.value) || 0) })} />
                </label>
                <label>Duration (s)
                  <input type="number" min={0.05} step={0.05} value={clip.duration}
                    onChange={(e) => updateClip(clip.id, { duration: Math.max(0.05, Number(e.target.value) || 0.05) })} />
                </label>
                <label>Axis
                  <select value={clip.axis} onChange={(e) => updateClip(clip.id, { axis: e.target.value as Clip['axis'] })}>
                    <option value="x">X</option><option value="y">Y</option><option value="z">Z</option>
                  </select>
                </label>
                {clip.type !== 'visibility' && (
                  <label>Amount {clip.type === 'rotation' ? '(radians)' : clip.type === 'scale' ? '(end multiplier)' : '(world units)'}
                    <input type="number" step={0.05} value={clip.amount}
                      onChange={(e) => updateClip(clip.id, { amount: Number(e.target.value) || 0 })} />
                  </label>
                )}
                {clip.type === 'oscillation' && (
                  <>
                    <label>Frequency (cycles/s)
                      <input type="number" min={0.05} step={0.05} value={clip.frequency}
                        onChange={(e) => updateClip(clip.id, { frequency: Math.max(0.05, Number(e.target.value) || 0.05) })} />
                    </label>
                    <label>Property
                      <select value={clip.property} onChange={(e) => updateClip(clip.id, { property: e.target.value as Clip['property'] })}>
                        <option value="movement">Movement</option>
                        <option value="rotation">Rotation</option>
                        <option value="scale">Scale</option>
                      </select>
                    </label>
                  </>
                )}
                <label>Easing
                  <select value={clip.curve} onChange={(e) => updateClip(clip.id, { curve: e.target.value as Clip['curve'] })}>
                    {CURVES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
                <label className="check">
                  <input type="checkbox" checked={clip.pingPong}
                    onChange={(e) => updateClip(clip.id, { pingPong: e.target.checked })} />
                  Ping-pong
                </label>
                <div className="row">
                  <button type="button" onClick={() => duplicateClip(clip.id)}>Duplicate</button>
                  <button type="button" onClick={() => copyClip(clip.id)}>Copy</button>
                  <button type="button" className="danger" onClick={() => deleteClip(clip.id)}>Delete</button>
                </div>
                <p className="hint">Pose at playhead preview: {JSON.stringify(evalPose(clip.meshId)?.position ?? '—')}</p>
              </fieldset>
            );
          })()}
        </div></DockPortal>
      </div>
    </div>
  );
}

/** Live animated preview strip (uses core evaluateMesh for determinism). */
function AnimatePreview({ time }: { time: number; playing: boolean }): React.JSX.Element {
  const { state } = useStore();
  return <ScenePreview project={state.project} time={time} animated />;
}

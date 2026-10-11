import {GizmoLayer} from './gizmoLayer';
import type {TransformFrame,GizmoEvent} from './transforms';
// PiVo Ortho — model workspace: four viewports (front/top/side/persp),
// orbit/pan/zoom, CPU face picking, vertex projection, drag transforms.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { Project, Vec3 } from '../core/types';
import type { ViewKind } from './store';
import type { SceneBundle } from './render';
import {
  buildThreeGroup, collectFaces, createGridHelper, pickFace,
} from './render';

export interface CameraRig {
  target: Vec3;
  distance: number;
  yaw: number;
  pitch: number;
  orthoZoom: number;
}

export const DEFAULT_RIG: CameraRig = {
  target: [0, 0.8, 0],
  distance: 7,
  yaw: Math.PI / 4,
  pitch: Math.PI / 5,
  orthoZoom: 3.2,
};

export function isOrtho(view: ViewKind): boolean {
  return view !== 'persp';
}

export type ModelTool = 'select' | 'move' | 'rotate' | 'scale';

export interface SelectPayload {
  meshId: string | null;
  faceId: string | null;
  shift: boolean;
  screenRect: [number, number, number, number] | null;
  vertexIds?: string[]; vertexMeshIds?: string[];
}

export interface DragPayload {
  startWorld: Vec3 | null;
  world: Vec3 | null;
  meshId: string | null;
  phase: 'start' | 'move' | 'end' | 'cancel';
  view: ViewKind;
  shift: boolean;
}

interface ViewportProps {
  view: ViewKind;
  project: Project;
  rig: CameraRig;
  setRig: (r: CameraRig) => void;
  modelTool: ModelTool;
  gizmoFrame?:TransformFrame|null;
  gizmoSpace?:'world'|'local';
  translationSnap?:number;rotationSnap?:number;scaleSnap?:number;
  onGizmo?:(event:GizmoEvent)=>void;
  onActiveView?:(view:ViewKind)=>void;
  selectKind?: 'mesh'|'face'|'vertex';
  onSelect: (p: SelectPayload) => void;
  onDrag: (p: DragPayload) => void;
  selectedFaceIds: Set<string>;
  selectedVertexIds: Set<string>;
  selectedMeshIds: Set<string>;
  /** bumped while a drag preview mutates the draft project */
  previewTick: number;
  /** project version to render (draft during drag) */
  sceneProject: Project;
}

function ViewportCanvas(props: ViewportProps): React.JSX.Element {
  const {
    view, project, rig, setRig, modelTool, onSelect, onDrag,
    selectedFaceIds, selectedVertexIds, selectedMeshIds, previewTick, sceneProject,
  } = props;
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | THREE.OrthographicCamera | null>(null);
  const [sizeTick,setSizeTick]=useState(0);
  const [gizmoCamera,setGizmoCamera]=useState<THREE.Camera|null>(null);
  const bundleRef = useRef<SceneBundle | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const rigRef = useRef(rig);
  rigRef.current = rig;
  const failedRef = useRef(false);

  const interaction = useRef<{
    mode: null | 'orbit' | 'pan' | 'select' | 'drag';
    lastX: number; lastY: number; downX: number; downY: number;
    moved: boolean; rectStart: [number, number] | null;
    startWorld: Vec3 | null; dragMeshId: string | null;
  }>({ mode: null, lastX: 0, lastY: 0, downX: 0, downY: 0, moved: false, rectStart: null, startWorld: null, dragMeshId: null });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const r = new THREE.WebGLRenderer({ canvas, alpha: false, antialias: false });
      r.setPixelRatio(1);
      rendererRef.current = r;
    } catch {
      failedRef.current = true;
    }
    return () => {
      bundleRef.current?.dispose();
      rendererRef.current?.dispose();
      rendererRef.current = null;
    };
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let lastWidth=-1,lastHeight=-1;
    const ro = new ResizeObserver(() => {
      const w=Math.max(1,host.clientWidth),h=Math.max(1,host.clientHeight);
      if(w===lastWidth&&h===lastHeight)return;
      lastWidth=w;lastHeight=h;
      // Changing the WebGL drawing buffer clears it: rebuild and draw at the
      // new aspect ratio instead of leaving a blank resized viewport.
      setSizeTick(n=>n+1);
    });
    ro.observe(host);
    return () => ro.disconnect();
  }, []);

  // Draw whenever inputs change (project, rig, selection, preview tick).
  useEffect(() => {
    const r = rendererRef.current;
    const host = hostRef.current;
    if (!r || !host || failedRef.current) return;
    const w = Math.max(1, host.clientWidth);
    const h = Math.max(1, host.clientHeight);
    const aspect = w / h;
    const myRig = rigRef.current;
    const ortho = isOrtho(view);

    let cam: THREE.PerspectiveCamera | THREE.OrthographicCamera;
    const pos = new THREE.Vector3(
      myRig.target[0] + myRig.distance * Math.cos(myRig.pitch) * Math.sin(myRig.yaw),
      myRig.target[1] + myRig.distance * Math.sin(myRig.pitch),
      myRig.target[2] + myRig.distance * Math.cos(myRig.pitch) * Math.cos(myRig.yaw),
    );
    if (ortho) {
      const halfH = myRig.orthoZoom;
      cam = new THREE.OrthographicCamera(-halfH * aspect, halfH * aspect, halfH, -halfH, -50, 100);
    } else {
      cam = new THREE.PerspectiveCamera(45, aspect, 0.01, 200);
    }
    if(view==='front') pos.set(myRig.target[0],myRig.target[1],myRig.target[2]+myRig.distance);
    if(view==='side') pos.set(myRig.target[0]+myRig.distance,myRig.target[1],myRig.target[2]);
    if(view==='top') {pos.set(myRig.target[0],myRig.target[1]+myRig.distance,myRig.target[2]);cam.up.set(0,0,-1);}
    cam.position.copy(pos);
    if (view === 'top' && Math.abs(myRig.pitch - Math.PI / 2) < 0.01) cam.up.set(0, 0, -1);
    cam.lookAt(myRig.target[0], myRig.target[1], myRig.target[2]);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    cameraRef.current = cam;
    setGizmoCamera(cam);

    const bundle = buildThreeGroup(collectFaces(sceneProject), sceneProject, {
      affine: sceneProject.render.affine,
      shading: sceneProject.render.shading,
      light: sceneProject.render.light,
      wireframe: sceneProject.render.wireframe,
      transparentIndex: sceneProject.texture.transparent,
    });
    bundleRef.current?.dispose();
    bundleRef.current = bundle;

    const s = new THREE.Scene();
    s.background = new THREE.Color(project.render.background || '#151a21');
    s.add(createGridHelper(8, 16));
    s.add(bundle.group);

    // selection overlays
    const overlay = new THREE.Group();
    for (const fm of bundle.faceMeshes) {
      if (selectedFaceIds.has(fm.entry.faceId) || selectedMeshIds.has(fm.entry.meshId)) {
        const eg = new THREE.EdgesGeometry(fm.mesh.geometry, 1);
        overlay.add(new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: document.documentElement.dataset.theme==='light'?0x2563eb:0x7faaff })));
      }
    }
    if (props.selectKind === 'vertex') {
      const cloud: number[] = [];
      const sel: number[] = [];
      for (const vp of collectFaces(sceneProject).vertexPoints) {
        cloud.push(vp.pos[0], vp.pos[1], vp.pos[2]);
        if (selectedVertexIds.has(vp.vertexId)) sel.push(vp.pos[0], vp.pos[1], vp.pos[2]);
      }
      const g1 = new THREE.BufferGeometry();
      g1.setAttribute('position', new THREE.Float32BufferAttribute(cloud, 3));
      overlay.add(new THREE.Points(g1, new THREE.PointsMaterial({ color: 0x8091a6, size: 5, sizeAttenuation: false })));
      if (sel.length > 0) {
        const g2 = new THREE.BufferGeometry();
        g2.setAttribute('position', new THREE.Float32BufferAttribute(sel, 3));
        overlay.add(new THREE.Points(g2, new THREE.PointsMaterial({ color: document.documentElement.dataset.theme==='light'?0x2563eb:0x7faaff, size: 8, sizeAttenuation: false })));
      }
    }
    s.add(overlay);

    r.setSize(Math.ceil(w/(project.render.pixelSize||1)),Math.ceil(h/(project.render.pixelSize||1)),false);
    r.render(s, cam);
    // cleanup per-frame GPU resources
    for (const child of overlay.children) {
      const anyChild = child as THREE.Mesh | THREE.Points | THREE.LineSegments;
      anyChild.geometry?.dispose();
      (anyChild.material as THREE.Material)?.dispose();
    }
    const grid = s.children.find((c) => c !== bundle.group) as THREE.Group | undefined;
    if (grid) {
      grid.traverse((o) => {
        const obj = o as THREE.Mesh & { geometry?: THREE.BufferGeometry; material?: THREE.Material };
        obj.geometry?.dispose();
        if (obj.material) (obj.material as THREE.Material).dispose();
      });
    }
  }, [project, sceneProject, view, rig, selectedFaceIds, selectedVertexIds, selectedMeshIds, previewTick, modelTool, props.selectKind,sizeTick]);

  // Escape (dispatched by AppInner) aborts an in-progress select/drag gesture.
  useEffect(() => {
    const cancel = () => {
      const it = interaction.current;
      if (!it.mode) return;
      if (it.mode === 'drag') {
        onDrag({ startWorld: it.startWorld, world: null, meshId: null, phase: 'cancel', view, shift: false });
      }
      it.mode = null;
      it.rectStart = null;
    };
    window.addEventListener('pivo-ortho:cancel-gesture', cancel);
    return () => window.removeEventListener('pivo-ortho:cancel-gesture', cancel);
  }, [onDrag, view]);

  const ndcFrom = useCallback((clientX: number, clientY: number): THREE.Vector2 | null => {
    const host = hostRef.current;
    if (!host) return null;
    const rect = host.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    return new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -(((clientY - rect.top) / rect.height) * 2 - 1),
    );
  }, []);

  const worldFromScreen = useCallback((clientX: number, clientY: number): Vec3 | null => {
    const cam = cameraRef.current;
    if (!cam) return null;
    const ndc = ndcFrom(clientX, clientY);
    if (!ndc) return null;
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, cam);
    const normal=new THREE.Vector3(); cam.getWorldDirection(normal);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal,new THREE.Vector3(...rigRef.current.target));
    const hit = new THREE.Vector3();
    if (ray.ray.intersectPlane(plane, hit)) return [hit.x, hit.y, hit.z];
    return null;
  }, [ndcFrom]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const it = interaction.current;
    it.lastX = e.clientX; it.lastY = e.clientY;
    it.downX = e.clientX; it.downY = e.clientY;
    it.moved = false;

    if (e.button === 2) { it.mode = 'pan'; return; }
    if (e.button === 1 || (e.button === 0 && e.altKey)) { it.mode = view==='persp' && !e.shiftKey?'orbit':'pan'; return; }
    if (e.button !== 0) return;

    const tool = propsRef.current.modelTool;
    if (tool === 'move') {
      it.mode = 'drag';
      const world = worldFromScreen(e.clientX, e.clientY);
      const ndc = ndcFrom(e.clientX, e.clientY);
      const cam = cameraRef.current;
      const bundle = bundleRef.current;
      let meshId: string | null = null;
      if (ndc && cam && bundle) {
        const hit = pickFace(bundle.faceMeshes, ndc, cam);
        meshId = hit?.entry.meshId ?? null;
      }
      it.startWorld = world;
      it.dragMeshId = meshId;
      onDrag({ startWorld: world, world, meshId, phase: 'start', view, shift: e.shiftKey });
      return;
    }
    it.mode = 'select';
    it.rectStart = [e.clientX, e.clientY];
  }, [worldFromScreen, ndcFrom, onDrag, view]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const it = interaction.current;
    if (!it.mode) return;
    const dx = e.clientX - it.lastX;
    const dy = e.clientY - it.lastY;
    it.lastX = e.clientX; it.lastY = e.clientY;
    if (Math.abs(e.clientX - it.downX) + Math.abs(e.clientY - it.downY) > 4) it.moved = true;

    if (it.mode === 'orbit') {
      const r = rigRef.current;
      setRig({ ...r, yaw: r.yaw + dx * 0.01, pitch: Math.max(-1.5, Math.min(1.5, r.pitch + dy * 0.01)) });
      return;
    }
    if (it.mode === 'pan') {
      const r = rigRef.current;
      const cam = cameraRef.current;
      if (!cam) return;
      const scale = isOrtho(view) ? (r.orthoZoom * 2) / 300 : r.distance / 300;
      const right = new THREE.Vector3();
      const up = new THREE.Vector3();
      cam.matrix.extractBasis(right, up, new THREE.Vector3());
      const t: Vec3 = [
        r.target[0] - right.x * dx * scale + up.x * dy * scale,
        r.target[1] - right.y * dx * scale + up.y * dy * scale,
        r.target[2] - right.z * dx * scale + up.z * dy * scale,
      ];
      setRig({ ...r, target: t });
      return;
    }
    if (it.mode === 'drag') {
      const world = worldFromScreen(e.clientX, e.clientY);
      onDrag({ startWorld: it.startWorld, world, meshId: it.dragMeshId, phase: 'move', view, shift: e.shiftKey });
    }
  }, [setRig, view, onDrag, worldFromScreen]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    const el = e.currentTarget as HTMLElement;
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    const it = interaction.current;
    const mode = it.mode;
    it.mode = null;
    if (mode === 'drag') {
      const world = worldFromScreen(e.clientX, e.clientY);
      onDrag({ startWorld: it.startWorld, world, meshId: it.dragMeshId, phase: 'end', view, shift: false });
      return;
    }
    if (mode === 'select') {
      const host=hostRef.current,cam=cameraRef.current,bundle=bundleRef.current;
      if(!host||!cam||!bundle)return;
      const rect=host.getBoundingClientRect();
      const points=collectFaces(propsRef.current.sceneProject).vertexPoints;
      const allowed=points.filter(v=>{const m=project.meshes.find(m=>m.id===v.meshId)!;return !m.locked&&!project.folders.some(f=>f.id===m.folderId&&f.locked)});
      const x=e.clientX-rect.left,y=e.clientY-rect.top;
      const screen=(v:typeof points[number])=>{const q=new THREE.Vector3(...v.pos).project(cam);return {x:(q.x+1)*rect.width/2,y:(1-q.y)*rect.height/2};};
      if(it.moved && it.rectStart){
        const x0=Math.min(it.rectStart[0]-rect.left,x),y0=Math.min(it.rectStart[1]-rect.top,y);
        const x1=Math.max(it.rectStart[0]-rect.left,x),y1=Math.max(it.rectStart[1]-rect.top,y);
        const hits=allowed.filter(v=>{const q=screen(v);return q.x>=x0&&q.x<=x1&&q.y>=y0&&q.y<=y1});
        onSelect({meshId:hits[0]?.meshId??null,faceId:null,shift:e.shiftKey,screenRect:null,vertexIds:hits.map(v=>v.vertexId),vertexMeshIds:[...new Set(hits.map(v=>v.meshId))]});
      } else {
        const hit=pickFace(bundle.faceMeshes,ndcFrom(e.clientX,e.clientY)!,cam);
        const near=allowed.map(v=>({v,d:Math.hypot(screen(v).x-x,screen(v).y-y)})).filter(v=>v.d<9).sort((a,b)=>a.d-b.d)[0]?.v;
        onSelect({meshId:hit?.entry.meshId??near?.meshId??null,faceId:hit?.entry.faceId??null,shift:e.shiftKey,screenRect:null,...(near?{vertexIds:[near.vertexId],vertexMeshIds:[near.meshId]}:{})});
      }
      it.rectStart=null;
    }
  }, [onSelect, onDrag, ndcFrom, worldFromScreen, view, project]);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const r = rigRef.current;
    const factor = e.deltaY > 0 ? 1.12 : 0.89;
    if (isOrtho(view)) {
      setRig({ ...r, orthoZoom: Math.max(0.2, Math.min(40, r.orthoZoom * factor)) });
    } else {
      setRig({ ...r, distance: Math.max(0.5, Math.min(60, r.distance * factor)) });
    }
  }, [view, setRig]);

  return (
    <div
      ref={hostRef}
      onFocus={()=>props.onActiveView?.(view)}
      onPointerDownCapture={()=>props.onActiveView?.(view)}
      className={`viewport viewport-${view}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        const it = interaction.current;
        if (it.mode === 'drag') {
          onDrag({ startWorld: it.startWorld, world: null, meshId: null, phase: 'cancel', view, shift: false });
        }
        it.mode = null;
      }}
      onWheel={onWheel}
      onContextMenu={(e) => e.preventDefault()}
      tabIndex={0}
      role="application"
      aria-label={`${view} viewport — click to select, right-drag to pan, wheel to zoom`}
    >
      <canvas ref={canvasRef} />
      <GizmoLayer camera={gizmoCamera} frame={props.gizmoFrame??null} mode={modelTool} space={props.gizmoSpace??'world'} translationSnap={props.translationSnap??0} rotationSnap={props.rotationSnap??0} scaleSnap={props.scaleSnap??0} onTransform={event=>propsRef.current.onGizmo?.(event)}/>
      <span className="viewport-label">{view === 'persp' ? 'Perspective' : view[0].toUpperCase() + view.slice(1)}</span>
    </div>
  );
}

export function ModelWorkspace(props: {
  project: Project;
  rig: CameraRig;
  setRig: (r: CameraRig) => void;
  layout: 'quad' | ViewKind;
  modelTool: ModelTool;
  gizmoFrame?:TransformFrame|null;
  gizmoSpace?:'world'|'local';
  translationSnap?:number;rotationSnap?:number;scaleSnap?:number;
  onGizmo?:(event:GizmoEvent)=>void;
  onActiveView?:(view:ViewKind)=>void;
  selectKind?: 'mesh'|'face'|'vertex';
  onSelect: (p: SelectPayload) => void;
  onDrag: (p: DragPayload) => void;
  selectedFaceIds: Set<string>;
  selectedVertexIds: Set<string>;
  selectedMeshIds: Set<string>;
  previewProject: Project | null;
  previewTick: number;
}): React.JSX.Element {
  const { layout, previewProject, previewTick, ...rest } = props;
  const views: ViewKind[] = layout === 'quad' ? ['front', 'top', 'side', 'persp'] : [layout];
  const sceneProject = previewProject ?? props.project;
  return (
    <div className={`viewports ${layout === 'quad' ? 'quad' : 'single'}`}>
      {views.map((v) => (
        <ViewportCanvas
          key={v}
          view={v}
          sceneProject={sceneProject}
          previewTick={previewTick}
          {...rest}
        />
      ))}
    </div>
  );
}

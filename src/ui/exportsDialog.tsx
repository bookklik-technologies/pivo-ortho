import {IconClose} from './icons';
import {applyFrameEffects,loadFrameEffects,saveFrameEffects,sanitizeEffects,DEFAULT_EFFECTS} from './effects';
// PiVo Ortho — exports modal: OBJ ZIP, glTF ZIP, texture PNG, rendered
// PNG, GIF turntable/animation and sprite sheet. Uses IO codecs; render frames
// via the UI renderer capture. Progress + cancel + resource caps.
// Export camera is fully user-editable (perspective/orthographic orbit) with a
// live preview, view snapshots, fit/reset and session persistence.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { encodeGIFDetailed, encodePNG, exportGLTF, exportOBJ, downloadBundle, downloadFile, spriteSheet } from '../io';
import { evaluateMesh, textureRGBA } from '../core';
import { useStore } from './store';
import { captureFrame, collectFaces, makeCaptureCamera, sanitizeCaptureCameraSpec, type CaptureCameraSpec, type PoseFn } from './render';
import type { CameraRig } from './modelWorkspace';
import type { ViewKind } from './store';
import {
  captureCameraFromView, deg2rad, fitDistance, fitOrthoSize,turntableCamera,
  loadExportCameraSettings, saveExportCameraSettings,
} from './camera';

type ExportTab = 'project' | 'texture' | 'render' | 'obj' | 'gltf' | 'gif' | 'spritesheet';

const TABS: Array<{ id: ExportTab; label: string }> = [
  { id: 'obj', label: 'OBJ ZIP' },
  { id: 'gltf', label: 'glTF ZIP' },
  { id: 'texture', label: 'Texture PNG' },
  { id: 'render', label: 'Rendered PNG' },
  { id: 'gif', label: 'Animated GIF' },
  { id: 'spritesheet', label: 'Sprite Sheet' },
];

const MAX_FRAMES = 120;
const MAX_DIM = 512;
const MAX_PNG_DIM = 2048;

interface ExportCameraSettings {
  projection: 'perspective' | 'orthographic';
  yawDeg: number;
  pitchDeg: number;
  distance: number;
  targetX: number;
  targetY: number;
  targetZ: number;
  fov: number;
  orthoSize: number;
  background: string;
  turntableDir: 1 | -1;
  turntableStartDeg: number;
  pngWidth: number;
  pngHeight: number;
  up:[number,number,number];
}

const DEFAULT_SETTINGS: ExportCameraSettings = {
  projection: 'perspective',
  yawDeg: 45,
  pitchDeg: 36,
  distance: 7,
  targetX: 0,
  targetY: 0.8,
  targetZ: 0,
  fov: 45,
  orthoSize: 4,
  background: '#151a21',
  turntableDir: 1,
  turntableStartDeg: 45,
  pngWidth: 512,
  pngHeight: 512,
  up:[0,1,0],
};

function sanitizeSettings(raw: unknown, fallbackBg: string): ExportCameraSettings {
  const out: ExportCameraSettings = { ...DEFAULT_SETTINGS, background: fallbackBg };
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as Record<string, unknown>;
  const num = (k: string, lo: number, hi: number) => {
    const v = r[k];
    if (typeof v === 'number' && Number.isFinite(v)) return Math.min(hi, Math.max(lo, v));
    return (DEFAULT_SETTINGS as unknown as Record<string, unknown>)[k] as number;
  };
  out.projection = r.projection === 'orthographic' ? 'orthographic' : 'perspective';
  out.yawDeg = num('yawDeg', -3600, 3600);
  out.pitchDeg = num('pitchDeg', -90, 90);
  out.distance = num('distance', 0.05, 500);
  out.targetX = num('targetX', -1000, 1000);
  out.targetY = num('targetY', -1000, 1000);
  out.targetZ = num('targetZ', -1000, 1000);
  out.fov = num('fov', 1, 170);
  out.orthoSize = num('orthoSize', 0.01, 1000);
  out.background = typeof r.background === 'string' && /^#[0-9a-fA-F]{6}$/.test(r.background) ? r.background : fallbackBg;
  out.turntableDir = r.turntableDir === -1 ? -1 : 1;
  out.turntableStartDeg = num('turntableStartDeg', -3600, 3600);
  out.pngWidth = Math.round(num('pngWidth', 32, MAX_PNG_DIM));
  out.pngHeight = Math.round(num('pngHeight', 32, MAX_PNG_DIM));
  if(Array.isArray(r.up)&&r.up.length===3&&r.up.every(v=>typeof v==='number'&&Number.isFinite(v)))out.up=r.up as [number,number,number];
  return out;
}

function settingsToSpec(s: ExportCameraSettings): CaptureCameraSpec {
  return sanitizeCaptureCameraSpec({
    kind: 'orbit',
    yaw: deg2rad(s.yawDeg),
    pitch: deg2rad(s.pitchDeg),
    distance: s.distance,
    target: [s.targetX, s.targetY, s.targetZ],
    fov: s.fov,
    projection: s.projection,
    orthoSize: s.orthoSize,
    up: s.up,
  });
}

export function ExportsDialog({ onClose, cameraRig, currentView }: {
  onClose: () => void;
  /** current editor camera rig — enables "Use current view" snapshots */
  cameraRig?: CameraRig;
  /** last focused viewport ('front'|'top'|'side'|'persp') — used by "Use current view" */
  currentView?: ViewKind;
}): React.JSX.Element {
  const { state, dispatch } = useStore();
  const project = state.project;
  const [tab, setTab] = useState<ExportTab>('obj');
  const [busy, setBusy] = useState<null | { label: string; pct: number }>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const cancelRef = useRef(false);

  // GIF / sprite options
  const [gifSource, setGifSource] = useState<'animation' | 'turntable'>('turntable');
  const [gifFrames, setGifFrames] = useState(16);
  const [gifSize, setGifSize] = useState(192);
  const [gifFps, setGifFps] = useState(10);
  const [gifTransparent, setGifTransparent] = useState(false);
  const [sheetColumns, setSheetColumns] = useState(4);
  const [renderTransparent, setRenderTransparent] = useState(false);
  const baseName = (project.name || 'pivo-ortho').replace(/[^a-z0-9_-]+/gi, '-').toLowerCase();

  // Export camera settings (persisted per session under a namespaced key).
  const [cam, setCam] = useState<ExportCameraSettings>(() =>
    sanitizeSettings(loadExportCameraSettings<unknown>(), project.render.background));
  const previewRef = useRef<HTMLCanvasElement | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [previewFrame,setPreviewFrame]=useState(0);
  const [previewPlaying,setPreviewPlaying]=useState(false);
  const [effects,setEffects]=useState(loadFrameEffects);
  useEffect(()=>saveFrameEffects(effects),[effects]);
  const changeEffects=(patch:Partial<typeof effects>)=>setEffects(e=>sanitizeEffects({...e,...patch}));

  useEffect(() => {
    saveExportCameraSettings(cam);
  }, [cam]);

  const update = (patch: Partial<ExportCameraSettings>) => setCam((c) => ({ ...c, ...patch }));

  const clampSetting = (v: string, lo: number, hi: number): number =>
    Math.min(hi, Math.max(lo, Number(v) || lo));

  useEffect(()=>setPreviewFrame(i=>Math.min(i,gifFrames-1)),[gifFrames]);
  useEffect(()=>{
    if(!previewPlaying||busy||(tab!=='gif'&&tab!=='spritesheet'))return;
    const fps=gifSource==='animation'?gifFrames/project.animation.duration:gifFps;
    const timer=window.setInterval(()=>setPreviewFrame(i=>(i+1)%gifFrames),1000/Math.max(1,Math.min(24,fps)));
    return()=>window.clearInterval(timer);
  },[previewPlaying,busy,tab,gifSource,gifFrames,gifFps,project.animation.duration]);

  // Live preview: real render of the capture scene with the current camera.
  useEffect(() => {
    const canvas = previewRef.current;
    if (!canvas) return;
    try {
      const scene = collectFaces(project,(tab==='gif'||tab==='spritesheet')&&gifSource==='animation'?id=>{const m=project.meshes.find(m=>m.id===id);return m?evaluateMesh(m,project.animation,previewFrame/gifFrames*project.animation.duration):null}:undefined);
      const baseSpec = settingsToSpec(cam);
      const spec=(tab==='gif'||tab==='spritesheet')&&gifSource==='turntable'?{...baseSpec,...turntableCamera(baseSpec,cam.turntableStartDeg,cam.turntableDir,previewFrame,gifFrames)}:baseSpec;
      const camera = makeCaptureCamera(spec, canvas.width / canvas.height);
      const rgba = captureFrame(scene, project, camera, {
        width: canvas.width, height: canvas.height, transparent: true, clearColor: cam.background,
      });
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const image = ctx.createImageData(canvas.width, canvas.height);
      image.data.set(applyFrameEffects(rgba,canvas.width,canvas.height,effects,{transparent:tab==='render'?renderTransparent:gifTransparent,background:cam.background}));
      ctx.putImageData(image, 0, 0);
      setPreviewError('');
    } catch (e) {
      setPreviewError((e as Error).message);
    }
  }, [project, cam, tab,gifSource,gifFrames,gifSize,effects,gifTransparent,renderTransparent,previewFrame]);

  /** Exact snapshot of the editor camera for the last focused view. */
  const useCurrentView = () => {
    if (!cameraRig) return;
    const snap = captureCameraFromView(cameraRig, currentView ?? 'persp');
    const deg = (r: number) => (r*180)/Math.PI;
    update({
      projection: snap.projection,
      yawDeg: deg(snap.yaw),
      turntableStartDeg:deg(snap.yaw),
      pitchDeg: deg(snap.pitch),
      distance: snap.distance,
      up:snap.up??[0,1,0],
      targetX: snap.target[0], targetY: snap.target[1], targetZ: snap.target[2],
      fov: snap.fov,
      orthoSize: snap.orthoSize ?? 4,
    });
  };

  const resetCamera = () => update({ ...DEFAULT_SETTINGS, background: project.render.background });

  const fitModel = () => {
    const bounds = collectFaces(project).bounds;
    const target={targetX:(bounds.min[0]+bounds.max[0])/2,targetY:(bounds.min[1]+bounds.max[1])/2,targetZ:(bounds.min[2]+bounds.max[2])/2};
    if (cam.projection === 'orthographic') {
      update({ ...target,orthoSize:fitOrthoSize(bounds)*(tab==='render'?Math.max(1,cam.pngHeight/cam.pngWidth):1) });
    } else {
      const aspect = tab==='render'?cam.pngWidth/cam.pngHeight:1;
      update({ ...target,distance: Math.round(fitDistance(bounds, { projection: cam.projection, fov: cam.fov, aspect }) * 1000) / 1000 });
    }
  };

  const turntableYaw = (i: number, count: number): number =>
    deg2rad(cam.turntableStartDeg) + cam.turntableDir * ((i / count) * Math.PI * 2);

  const run = useCallback(async (label: string, fn: (setPct: (p: number) => void) => Promise<void>) => {
    cancelRef.current = false;
    setBusy({ label, pct: 0 });
    dispatch({t:'setExporting',exporting:{label,progress:0,cancel:false}});
    setWarnings([]);
    try {
      await fn((p) => setBusy((b) => (b ? { ...b, pct: p } : b)));
      dispatch({ t: 'setStatus', status: `Export complete: ${label}` });
    } catch (err) {
      dispatch({ t: 'setStatus', status: `Export failed: ${(err as Error).message}` });
      setWarnings([`Export failed: ${(err as Error).message}`]);
    } finally {
      setBusy(null);
      dispatch({t:'setExporting',exporting:null});
    }
  }, [dispatch]);

  const doObj = () => run('OBJ ZIP', async () => {
    const bundle = exportOBJ(project);
    setWarnings(bundle.warnings);
    downloadBundle(bundle, baseName);
  });

  const doGltf = () => run('glTF ZIP', async () => {
    const bundle = exportGLTF(project, { animation: true });
    setWarnings(bundle.warnings);
    downloadBundle(bundle, baseName);
  });

  const doTexture = () => run('Texture PNG', async () => {
    const rgba = textureRGBA(project.texture);
    const png = encodePNG(128, 128, rgba);
    downloadFile({ name: `${baseName}-texture.png`, data: png, mime: 'image/png' });
  });

  const doRender = () => run('Rendered PNG', async () => {
    const width = Math.round(Math.min(MAX_PNG_DIM, Math.max(32, cam.pngWidth)));
    const height = Math.round(Math.min(MAX_PNG_DIM, Math.max(32, cam.pngHeight)));
    const scene = collectFaces(project);
    const camObj = makeCaptureCamera(settingsToSpec(cam), width / height);
    const rgba = captureFrame(scene, project, camObj, {
      width, height, transparent:true, clearColor: cam.background,
    });
    const png = encodePNG(width, height, applyFrameEffects(rgba,width,height,effects,{transparent:renderTransparent,background:cam.background}));
    downloadFile({ name: `${baseName}-render.png`, data: png, mime: 'image/png' });
    if (renderTransparent) {
      setWarnings(['Transparent PNG: background pixels are fully transparent; rendering is unfiltered pixel art (no anti-aliasing).']);
    }
  });

  const captureFrames = useCallback(async (
    count: number, size: number, onPct: (p: number) => void,
  ): Promise<Uint8Array[]> => {
    if (count * size * size * 4 > 64 * 1024 * 1024) throw new Error('Frame batch exceeds 64 MiB. Reduce frames or size.');
    const spec = settingsToSpec(cam);
    const frames: Uint8Array[] = [];
    for (let i = 0; i < count; i++) {
      if (cancelRef.current) throw new Error('Cancelled');
      let poseFn: PoseFn | undefined;
      if (gifSource === 'animation') {
        const t = (i / count) * project.animation.duration;
        poseFn = (meshId: string) => {
          const mesh = project.meshes.find((m) => m.id === meshId);
          if (!mesh) return null;
          try {
            const pose = evaluateMesh(mesh, project.animation, t);
            return { position: pose.position, rotation: pose.rotation, scale: pose.scale, visible: pose.visible };
          } catch {
            return null;
          }
        };
      }
      // Turntable orbits from the configured start angle/direction; animation
      // uses the configured camera pose as-is.
      const frameSpec: CaptureCameraSpec = gifSource === 'turntable'
        ? { ...spec,...turntableCamera(spec,cam.turntableStartDeg,cam.turntableDir,i,count) }
        : spec;
      const scene = collectFaces(project, poseFn);
      const camObj = makeCaptureCamera(frameSpec, 1);
      const rgba = captureFrame(scene, project, camObj, {
        width: size, height: size, transparent:true, clearColor: cam.background,
      });
      frames.push(applyFrameEffects(rgba,size,size,effects,{transparent:gifTransparent,background:cam.background}));
      onPct(Math.round(((i + 1) / count) * 100));
      await new Promise((r) => setTimeout(r, 0)); // yield for progress/cancel
    }
    return frames;
  }, [project, gifSource, gifTransparent, cam,effects]);

  const doGif = () => run('Animated GIF', async (setPct) => {
    const size = Math.min(MAX_DIM, Math.max(32, gifSize));
    const frames = await captureFrames(Math.min(MAX_FRAMES, gifFrames), size, setPct);
    const result = encodeGIFDetailed(frames, size, size, project.texture, gifSource === 'animation' ? frames.length / project.animation.duration : gifFps,{preserveColors:true});
    setWarnings([...new Set(result.warnings)]);
    downloadFile({ name: `${baseName}-${gifSource}.gif`, data: result.bytes, mime: 'image/gif' });
  });

  const doSheet = () => run('Sprite sheet', async (setPct) => {
    const size = Math.min(MAX_DIM, Math.max(32, gifSize));
    const frameCount = Math.min(MAX_FRAMES, gifFrames);
    const frames = await captureFrames(frameCount, size, setPct);
    const sheet = spriteSheet(frames, size, size, sheetColumns);
    const png = encodePNG(sheet.width, sheet.height, sheet.rgba);
    downloadFile({ name: `${baseName}-sheet.png`, data: png, mime: 'image/png' });
    // Reproducible-settings companion JSON (does not alter the .png path).
    try {
      const meta = {
        generator: 'pivo-ortho',
        sheet: { frames: frameCount, columns: sheetColumns, frameSize: size, width: sheet.width, height: sheet.height },
        camera: {
          kind: 'orbit', projection: cam.projection,
          yawDeg: gifSource === 'turntable'
            ? Array.from({ length: frameCount }, (_, i) => Math.round(((turntableYaw(i, frameCount) * 180) / Math.PI) * 1000) / 1000)
            : Math.round(cam.yawDeg * 1000) / 1000,
          pitchDeg: cam.pitchDeg, distance: cam.distance,
          target: [cam.targetX, cam.targetY, cam.targetZ],
          fov: cam.fov, orthoSize: cam.orthoSize,
          up: cam.up,
        },
        source: gifSource,
        transparent:gifTransparent,
        animationTimes:gifSource==='animation'?Array.from({length:frameCount},(_,i)=>i/frameCount*project.animation.duration):undefined,
        background: cam.background,
        effects:sanitizeEffects(effects),
      };
      downloadFile({ name: `${baseName}-sheet-settings.json`, data: JSON.stringify(meta, null, 2), mime: 'application/json' });
    } catch {
      // companion metadata is best-effort; the sheet export itself succeeded
    }
  });

  const camDisabled = !!busy; // camera/control changes locked while capturing

  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="dialog suite-export-dialog" role="dialog" aria-modal="true" aria-labelledby="exports-title">
        <header>
          <h2 id="exports-title">Export artwork</h2>
          <button type="button" className="close" aria-label="Close exports" disabled={!!busy} onClick={() => { if (!busy) onClose(); }}><IconClose/></button>
        </header>
        <div className="dialog-body suite-export-body">
        <label className="suite-export-format">Format<select aria-label="Export format" data-dialog-initial value={tab} disabled={!!busy} onChange={e=>{setTab(e.target.value as ExportTab);setWarnings([]);}}>{TABS.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}</select></label>

          {(tab === 'obj') && (
            <div>
              <p>Exports the current evaluated scene as OBJ + MTL + texture PNG in a ZIP, world-space, per-corner UVs.</p>
              <p className="hint">Animation is intentionally not included in OBJ.</p>
            </div>
          )}
          {tab === 'gltf' && (
            <div>
              <p>Exports glTF 2.0 + .bin + texture PNG in a ZIP, with sampled transform animation where representable.</p>
              <p className="hint">Draw-behind, palette ramps, affine sampling and retro effects are not portable glTF semantics and produce warnings.</p>
            </div>
          )}
          {tab === 'texture' && (
            <div>
              <p>128×128 indexed texture as RGBA PNG with the transparent index preserved.</p>
            </div>
          )}

          {(tab === 'render' || tab === 'gif' || tab === 'spritesheet') && (
            <fieldset className="export-camera" disabled={camDisabled}>
              <legend>Export camera</legend>
              <p className="hint camera-note">Use current view copies its pose and projection. Output dimensions set the image aspect ratio.</p>
              <div className="camera-preview">
                <canvas
                  ref={previewRef} width={tab==='render'?cam.pngWidth:gifSize} height={tab==='render'?cam.pngHeight:gifSize}
                  aria-label="Live export camera preview"
                />
                {previewError && <p role="alert" className="hint">Preview error: {previewError}</p>}
              </div>
              <label>Projection
                <select
                  aria-label="Export camera projection"
                  value={cam.projection}
                  onChange={(e) => update({ projection: e.target.value as 'perspective' | 'orthographic' })}
                >
                  <option value="perspective">Perspective</option>
                  <option value="orthographic">Orthographic</option>
                </select>
              </label>
              <label>Yaw (degrees)
                <input type="number" aria-label="Export camera yaw degrees" step={5}
                  value={cam.yawDeg} onChange={(e) => update({ yawDeg: clampSetting(e.target.value, -3600, 3600) })} />
              </label>
              <label>Tilt (degrees)
                <input type="number" aria-label="Export camera tilt degrees" step={5}
                  value={cam.pitchDeg} onChange={(e) => update({ pitchDeg: clampSetting(e.target.value, -90, 90),up:Math.abs(Number(e.target.value))===90?[0,0,-Math.sign(Number(e.target.value))]:[0,1,0] })} />
              </label>
              <label>Distance
                <input type="number" aria-label="Export camera distance" min={0.05} step={0.5}
                  value={cam.distance} onChange={(e) => update({ distance: clampSetting(e.target.value, 0.05, 500) })} />
              </label>
              <label>Target X
                <input type="number" aria-label="Export camera target X" step={0.25}
                  value={cam.targetX} onChange={(e) => update({ targetX: clampSetting(e.target.value, -1000, 1000) })} />
              </label>
              <label>Target Y
                <input type="number" aria-label="Export camera target Y" step={0.25}
                  value={cam.targetY} onChange={(e) => update({ targetY: clampSetting(e.target.value, -1000, 1000) })} />
              </label>
              <label>Target Z
                <input type="number" aria-label="Export camera target Z" step={0.25}
                  value={cam.targetZ} onChange={(e) => update({ targetZ: clampSetting(e.target.value, -1000, 1000) })} />
              </label>
              {cam.projection === 'perspective' ? (
                <label>Field of view (degrees)
                  <input type="number" aria-label="Export camera FOV degrees" min={1} max={170}
                    value={cam.fov} onChange={(e) => update({ fov: clampSetting(e.target.value, 1, 170) })} />
                </label>
              ) : (
                <label>Orthographic height (world units)
                  <input type="number" aria-label="Export camera orthographic height" min={0.01} step={0.5}
                    value={cam.orthoSize} onChange={(e) => update({ orthoSize: clampSetting(e.target.value, 0.01, 1000) })} />
                </label>
              )}
              <label>Background color
                <input type="color" aria-label="Export background color" value={cam.background}
                  onChange={(e) => update({ background: e.target.value })} />
              </label>
              <div className="camera-buttons">
                <button type="button" aria-label="Use current view camera" onClick={useCurrentView} disabled={!cameraRig || camDisabled}>Use current view</button>
                <button type="button" aria-label="Reset export camera" onClick={resetCamera} disabled={camDisabled}>Reset camera</button>
                <button type="button" aria-label="Fit camera to model" onClick={fitModel} disabled={camDisabled}>Fit model</button>
              </div>
              {(tab === 'gif' || tab === 'spritesheet') && (
                <>
                  <div className="camera-buttons"><label>Preview frame {previewFrame+1}/{gifFrames}<input aria-label="Export preview frame" type="range" min={0} max={gifFrames-1} step={1} value={previewFrame} onChange={e=>{setPreviewPlaying(false);setPreviewFrame(Number(e.target.value))}}/></label><button type="button" aria-label={previewPlaying?'Pause export preview':'Play export preview'} onClick={()=>setPreviewPlaying(v=>!v)}>{previewPlaying?'Pause preview':'Play preview'}</button></div>
                  <p className="hint camera-note">Saved sequences start at frame 1. Interactive preview playback is capped at 24 FPS.</p>
                  <label>Turntable direction
                    <select aria-label="Turntable direction" value={cam.turntableDir}
                      onChange={(e) => update({ turntableDir: e.target.value === '-1' ? -1 : 1 })}>
                      <option value={1}>Clockwise</option>
                      <option value={-1}>Counter-clockwise</option>
                    </select>
                  </label>
                  <label>Turntable start angle (degrees)
                    <input type="number" aria-label="Turntable start angle degrees" step={15}
                      value={cam.turntableStartDeg}
                      onChange={(e) => update({ turntableStartDeg: clampSetting(e.target.value, -3600, 3600) })} />
                  </label>
                </>
              )}
              {tab === 'render' && (
                <>
                  <label>PNG width
                    <input type="number" aria-label="Export PNG width" min={32} max={MAX_PNG_DIM} step={16}
                      value={cam.pngWidth}
                      onChange={(e) => update({ pngWidth: Math.round(clampSetting(e.target.value, 32, MAX_PNG_DIM)) })} />
                  </label>
                  <label>PNG height
                    <input type="number" aria-label="Export PNG height" min={32} max={MAX_PNG_DIM} step={16}
                      value={cam.pngHeight}
                      onChange={(e) => update({ pngHeight: Math.round(clampSetting(e.target.value, 32, MAX_PNG_DIM)) })} />
                  </label>
                </>
              )}
            </fieldset>
          )}

          {(tab==='render'||tab==='gif'||tab==='spritesheet')&&(
            <fieldset className="export-effects" disabled={camDisabled}>
              <legend>Pixel effects</legend>
              <label className="check"><input aria-label="Enable outline" type="checkbox" checked={effects.outline} onChange={e=>changeEffects({outline:e.target.checked})}/>Silhouette outline</label>
              <label>Outline thickness (px)<input aria-label="Outline thickness" type="number" min={1} max={4} value={effects.outlineSize} onChange={e=>changeEffects({outlineSize:Number(e.target.value)})}/></label>
              <label>Outline color<input aria-label="Outline color" type="color" value={effects.outlineColor} onChange={e=>changeEffects({outlineColor:e.target.value})}/></label>
              <label className="check"><input aria-label="Enable scanlines" type="checkbox" checked={effects.scanlines} onChange={e=>changeEffects({scanlines:e.target.checked})}/>Scanlines</label>
              <label>Scanline color<input aria-label="Scanline color" type="color" value={effects.scanlineColor} onChange={e=>changeEffects({scanlineColor:e.target.value})}/></label>
              <label>Scanline strength<input aria-label="Scanline opacity" type="number" min={0} max={1} step={0.05} value={effects.scanlineOpacity} onChange={e=>changeEffects({scanlineOpacity:Number(e.target.value)})}/></label>
              <label>Scanline interval (px)<input aria-label="Scanline spacing" type="number" min={2} max={8} value={effects.scanlineSpacing} onChange={e=>changeEffects({scanlineSpacing:Number(e.target.value)})}/></label>
              <label>Bottom-left tag<input aria-label="Left text tag" type="text" maxLength={48} value={effects.leftTag} onChange={e=>changeEffects({leftTag:e.target.value})}/></label>
              <label>Left tag color<input aria-label="Left text color" type="color" value={effects.leftColor} onChange={e=>changeEffects({leftColor:e.target.value})}/></label>
              <label>Bottom-right tag<input aria-label="Right text tag" type="text" maxLength={48} value={effects.rightTag} onChange={e=>changeEffects({rightTag:e.target.value})}/></label>
              <label>Right tag color<input aria-label="Right text color" type="color" value={effects.rightColor} onChange={e=>changeEffects({rightColor:e.target.value})}/></label>
              <label>Pixel text scale<input aria-label="Text scale" type="number" min={1} max={4} value={effects.textScale} onChange={e=>changeEffects({textScale:Number(e.target.value)})}/></label>
              <p className="hint">Original uppercase pixel letters. Tags truncate to fit without overlap. Preview uses exact output pixels; transparent exports keep empty areas clear. GIF preserves effect colors up to 256 entries.</p>
              {(effects.leftTag||effects.rightTag)&&9*effects.textScale>(tab==='render'?cam.pngHeight:gifSize)&&<p role="alert">Text is too large for this frame height. Reduce text scale or increase frame size.</p>}
              <button type="button" onClick={()=>setEffects({...DEFAULT_EFFECTS})}>Reset effects</button>
            </fieldset>
          )}

          {tab === 'render' && (
            <div>
              <p>Rendered PNG of the model from the export camera above, at the configured width/height (bounded to {MAX_PNG_DIM}px).</p>
              <label className="check"><input type="checkbox" checked={renderTransparent} onChange={(e) => setRenderTransparent(e.target.checked)} /> Transparent background</label>
            </div>
          )}
          {(tab === 'gif' || tab === 'spritesheet') && (
            <div className="gif-options">
              <label>Source
                <select value={gifSource} onChange={(e) => setGifSource(e.target.value as 'animation' | 'turntable')}>
                  <option value="turntable">Turntable (camera orbit)</option>
                  <option value="animation">Animation (timeline)</option>
                </select>
              </label>
              <label>Frame count (≤ {MAX_FRAMES})
                <input type="number" min={1} max={MAX_FRAMES} value={gifFrames}
                  onChange={(e) => setGifFrames(Math.max(1, Math.min(MAX_FRAMES, Number(e.target.value) || 1)))} />
              </label>
              <label>Frame size (≤ {MAX_DIM}px)
                <input type="number" min={32} max={MAX_DIM} step={16} value={gifSize}
                  onChange={(e) => setGifSize(Math.max(32, Math.min(MAX_DIM, Number(e.target.value) || 128)))} />
              </label>
              {tab === 'gif' && (
                <label>FPS
                  <input type="number" min={1} max={50} value={gifSource === 'animation' ? Number((gifFrames / project.animation.duration).toFixed(2)) : gifFps} disabled={gifSource === 'animation'}
                    onChange={(e) => setGifFps(Math.max(1, Math.min(50, Number(e.target.value) || 10)))} />
                </label>
              )}
              {tab === 'spritesheet' && (
                <label>Columns
                  <input type="number" min={1} max={24} value={sheetColumns}
                    onChange={(e) => setSheetColumns(Math.max(1, Math.min(24, Number(e.target.value) || 4)))} />
                </label>
              )}
              <label className="check"><input type="checkbox" checked={gifTransparent} onChange={(e) => setGifTransparent(e.target.checked)} /> Transparent background</label>
              <p className="hint">Memory cap: {MAX_FRAMES} frames × {MAX_DIM}px max. Progress is reported and cancel stops the batch.</p>
            </div>
          )}

          {busy && (
            <div className="export-progress" role="status">
              <div>{busy.label} — {busy.pct}%</div>
              <progress value={busy.pct} max={100} />
              <button type="button" onClick={() => { cancelRef.current = true; }}>Cancel</button>
            </div>
          )}

          {warnings.length > 0 && (
            <div className="export-warnings" role="alert">
              <h4>Warnings</h4>
              <ul>{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
            </div>
          )}
        </div>
        <footer className="suite-dialog-footer"><button disabled={!!busy} onClick={onClose}>Cancel</button><button className="primary" disabled={!!busy} onClick={tab==='obj'?doObj:tab==='gltf'?doGltf:tab==='texture'?doTexture:tab==='render'?doRender:tab==='gif'?doGif:doSheet}>Export</button></footer>
      </div>
    </div>
  );
}

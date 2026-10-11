import {DockPortal} from './suite-components';
import {checkerColor} from './theme';
import {drawAtlas} from './atlasDraw';
import {useTextureNavigation} from './textureNavigation';
import {movedTexture,boundedMove,pointInRect,selectionRect,TEXTURE_ZOOMS,type PixelRect} from './textureTools';
import { ScenePreview } from './preview';
// PiVo Ortho — paint mode: 128x128 indexed pixel canvas with crisp zoom,
// pen/eraser/fill/line/rect/ellipse/marquee tools, palette editing with
// transparent/background/ramp helpers, PNG import with deterministic
// quantization. Raster mutations commit through core for undo/history.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Texture, Vec2,Project } from '../core/types';
import { floodFill, quantizeRGBA, swapPalette, generateRamps, textureRGBA, marqueeCopy, marqueePaste, PALETTE_16 } from '../core';
import { useStore, type PaintTool } from './store';
import { IconFill, IconLine, IconMarquee, IconPen, IconRect, IconEllipse, IconEraser, IconSwap } from './icons';

const TEX = 128;

interface StrokeState {
  active: boolean;
  tool: PaintTool;
  start: Vec2;
  last: Vec2;
  previewPixels: Map<number, number>; // pixel index -> color during stroke
  marqueeStart: Vec2 | null;
  marqueeRect: [number, number, number, number] | null;
}

const TOOL_ORDER: Array<{ id: PaintTool; label: string; icon: React.FC<React.SVGProps<SVGSVGElement>>; key: string }> = [
  { id: 'pen', label: 'Pen', icon: IconPen, key: 'B' },
  { id: 'eraser', label: 'Eraser (transparent index)', icon: IconEraser, key: 'E' },
  { id: 'fill', label: 'Flood fill (4-connected)', icon: IconFill, key: 'F' },
  { id: 'line', label: 'Line', icon: IconLine, key: 'L' },
  { id: 'rect', label: 'Rectangle', icon: IconRect, key: 'R' },
  { id: 'ellipse', label: 'Ellipse', icon: IconEllipse, key: 'C' },
  { id: 'marquee', label: 'Marquee select / copy / paste', icon: IconMarquee, key: 'M' },
];

export function PaintWorkspace({previewProject,onPreview,dock,toolbar,active}:{previewProject?:Project|null;onPreview?:(project:Project|null)=>void;dock:HTMLElement|null;toolbar:HTMLElement|null;active:boolean}): React.JSX.Element {
  const { state, dispatch, commit } = useStore();
  const project = state.project;
  const tex = project.texture;
  const [movePreview,setMovePreview]=useState<Texture|null>(null);
  const moving=useRef<{source:PixelRect;start:Vec2;destination:PixelRect;project:Project;copy:boolean;id:number}|null>(null);
  const selectingPrevious=useRef<PixelRect|null>(null);
  const [zoom, setZoom] = useState(4); // integer zoom
  const [showGrid, setShowGrid] = useState(true);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [marqueeRect, setMarqueeRect] = useState<[number, number, number, number] | null>(null);
  const [hoverPx, setHoverPx] = useState<Vec2 | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const strokeRef = useRef<StrokeState | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const navigation=useTextureNavigation({zoom,setZoom,isEditing:()=>!!strokeRef.current||!!moving.current});
  const scale = zoom; // px per texel (times canvas css size handled below)
  const cssSize = TEX * scale;

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if(canvas.width!==cssSize)canvas.width=cssSize;
    if(canvas.height!==cssSize)canvas.height=cssSize;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    const drawn=movePreview??tex;
    drawAtlas(ctx,drawn,scale);
    if (showGrid && scale >= 2) {
      ctx.strokeStyle = 'rgba(128,145,166,0.22)';
      ctx.lineWidth = 1;
      for (let i = 0; i <= TEX; i += 8) {
        ctx.beginPath(); ctx.moveTo(i * scale + 0.5, 0); ctx.lineTo(i * scale + 0.5, cssSize); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i * scale + 0.5); ctx.lineTo(cssSize, i * scale + 0.5); ctx.stroke();
      }
    }
    for(const [i,c] of strokeRef.current?.previewPixels ?? []) {ctx.fillStyle=c===tex.transparent?checkerColor(i%128,Math.floor(i/128)):tex.palette[c];ctx.fillRect((i%128)*scale,Math.floor(i/128)*scale,scale,scale);}
    // marquee overlay
    if (marqueeRect) {
      const [mx, my, mw, mh] = marqueeRect;
      ctx.strokeStyle = '#ffb03a';
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(mx * scale + 0.5, my * scale + 0.5, mw * scale, mh * scale);
      ctx.setLineDash([]);
    }
    // hover cell
    if (hoverPx) {
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.strokeRect(hoverPx[0] * scale + 0.5, hoverPx[1] * scale + 0.5, scale - 1, scale - 1);
    }
  }, [tex,movePreview, scale, cssSize, showGrid, marqueeRect, hoverPx]);

  useEffect(() => { drawCanvas(); }, [drawCanvas]);
  const themeDraw=useRef(drawCanvas);themeDraw.current=drawCanvas;
  useEffect(()=>{const redraw=()=>themeDraw.current();window.addEventListener('pivo-ortho:theme-changed',redraw);return()=>window.removeEventListener('pivo-ortho:theme-changed',redraw)},[]);

  const pxFromEvent = useCallback((e: React.PointerEvent): Vec2 | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * TEX);
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * TEX);
    if (x < 0 || y < 0 || x >= TEX || y >= TEX) return moving.current?[Math.max(0,Math.min(127,x)),Math.max(0,Math.min(127,y))]:null;
    return [x, y];
  }, []);

  const colorFor = useCallback((rightButton: boolean) => (rightButton ? state.secondary : state.primary), [state.primary, state.secondary]);

  const commitPixelEdits = useCallback((label: string, pixelMap: Map<number, number>) => {
    if (pixelMap.size === 0) return;
    commit(label, (draft) => {
      for (const [i, c] of pixelMap) draft.texture.pixels[i] = c;
    });
  }, [commit]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if(navigation.beginPan(e))return;
    navigation.container.current?.focus({preventScroll:true});
    const p = pxFromEvent(e);
    if (!p) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const tool = state.paintTool;
    if(e.ctrlKey || tool==='picker'){dispatch({t:'setPaint',primary:tex.pixels[p[1]*128+p[0]]});return;}
    const rightButton = e.button === 2;
    const color = colorFor(rightButton);

    if (tool === 'fill') {
      const map = new Map<number, number>();
      // dry run via clone to capture flood result
      const draftTex: Texture = structuredClone(tex);
      floodFill(draftTex, p[0], p[1], color);
      for (let i = 0; i < TEX * TEX; i++) {
        if (draftTex.pixels[i] !== tex.pixels[i]) map.set(i, draftTex.pixels[i]);
      }
      commitPixelEdits('Flood fill', map);
      return;
    }
    if (tool === 'marquee') {
      selectingPrevious.current=marqueeRect?[...marqueeRect]:null;
      if(e.button===0&&!e.shiftKey&&marqueeRect&&pointInRect(p,marqueeRect)){
        moving.current={source:[...marqueeRect],destination:[...marqueeRect],start:p,project:structuredClone(project),copy:e.altKey,id:e.pointerId};
        return;
      }
      strokeRef.current = { active: true, tool, start: p, last: p, previewPixels: new Map(), marqueeStart: p, marqueeRect: null };
      setMarqueeRect([p[0], p[1], 1, 1]);
      return;
    }
    if (tool === 'pen' || tool === 'eraser' || tool === 'line' || tool === 'rect' || tool === 'ellipse') {
      strokeRef.current = { active: true, tool, start: p, last: p, previewPixels: new Map(), marqueeStart: null, marqueeRect: null };
      if (tool === 'pen' || tool === 'eraser') {
        const c = tool === 'eraser' ? tex.transparent : color;
        // stamp initial point (with brush size)
        const map = new Map<number, number>();
        stampBrush(map, p, state.brushSize, c);
        // apply live to displayed canvas via state preview: draw directly
        applyPreview(map);
      }
    }
  }, [state.paintTool, state.brushSize, state.primary, state.secondary, tex, colorFor, pxFromEvent, commitPixelEdits,marqueeRect,project,navigation]);

  const applyPreview = useCallback((map: Map<number, number>) => {
    // Draw preview pixels directly onto canvas (fast path); committed on pointer-up.
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    for (const [i, c] of map) {
      const x = i % TEX;
      const y = Math.floor(i / TEX);
      if (c === tex.transparent) {
        ctx.fillStyle = checkerColor(x,y);
      } else {
        ctx.fillStyle = tex.palette[c] ?? '#ff00ff';
      }
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }

    for (const [i, c] of map) strokeRef.current?.previewPixels.set(i, c);
    if(strokeRef.current){const texture=structuredClone(tex);for(const [i,c] of strokeRef.current.previewPixels)texture.pixels[i]=c;onPreview?.({...project,texture});}
  }, [tex, scale,onPreview,project]);

  const cancelRef=useRef<()=>void>(()=>{});
  cancelRef.current=()=>{const movement=moving.current;if(!movement&&!strokeRef.current)return;if(movement)setMarqueeRect(movement.source);else if(strokeRef.current?.tool==='marquee')setMarqueeRect(selectingPrevious.current);moving.current=null;strokeRef.current=null;setMovePreview(null);onPreview?.(null);drawCanvas();};
  useEffect(()=>{const cancel=()=>cancelRef.current();const key=(e:KeyboardEvent)=>{if(e.key==='Escape'&&(moving.current||strokeRef.current)){e.preventDefault();cancel();}};window.addEventListener('keydown',key);window.addEventListener('pivo-ortho:cancel-gesture',cancel);window.addEventListener('blur',cancel);return()=>{window.removeEventListener('keydown',key);window.removeEventListener('pivo-ortho:cancel-gesture',cancel);window.removeEventListener('blur',cancel);onPreview?.(null)}},[onPreview]);

  function stampBrush(map: Map<number, number>, p: Vec2, size: number, color: number) {
    const r = Math.floor((size - 1) / 2);
    for (let dy = -r; dy <= size - 1 - r; dy++) {
      for (let dx = -r; dx <= size - 1 - r; dx++) {
        const x = p[0] + dx;
        const y = p[1] + dy;
        if (x < 0 || y < 0 || x >= TEX || y >= TEX) continue;
        map.set(y * TEX + x, color);
      }
    }
  }

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const p = pxFromEvent(e);
    setHoverPx(old=>old?.[0]===p?.[0]&&old?.[1]===p?.[1]?old:p);
    const movement=moving.current;
    if(movement&&p){
      const destination=boundedMove(movement.source,[p[0]-movement.start[0],p[1]-movement.start[1]]);
      movement.destination=destination;
      const texture=movedTexture(movement.project.texture,movement.source,destination,movement.copy);
      setMovePreview(texture);setMarqueeRect(destination);onPreview?.({...movement.project,texture});return;
    }
    const st = strokeRef.current;
    if (!st || !st.active || !p) return;
    const color = colorFor(e.buttons === 2);
    if (st.tool === 'marquee') {
      const x = Math.min(st.start[0], p[0]);
      const y = Math.min(st.start[1], p[1]);
      const w = Math.abs(p[0] - st.start[0]) + 1;
      const h = Math.abs(p[1] - st.start[1]) + 1;
      st.marqueeRect = [x, y, w, h];
      setMarqueeRect([x, y, w, h]);
      return;
    }
    if (st.tool === 'pen' || st.tool === 'eraser') {
      const c = st.tool === 'eraser' ? tex.transparent : color;
      const map = new Map<number, number>();
      // interpolate from st.last to p, accumulating across the whole stroke
      interpolateLine(st.last, p, (q) => stampBrush(map, q, state.brushSize, c));
      for (const [i, col] of map) st.previewPixels.set(i, col);
      applyPreview(map);
      st.last = p;
      return;
    }
    if (st.tool === 'line' || st.tool === 'rect' || st.tool === 'ellipse') {
      // preview shape from start to p on a copy of original (pre-stroke) canvas
      drawCanvas(); // reset
      const map = new Map<number, number>();
      if (st.tool === 'line') {
        interpolateLine(st.start, p, (q) => map.set(q[1] * TEX + q[0], color));
      } else if (st.tool === 'rect') {
        const x0 = Math.min(st.start[0], p[0]);
        const x1 = Math.max(st.start[0], p[0]);
        const y0 = Math.min(st.start[1], p[1]);
        const y1 = Math.max(st.start[1], p[1]);
        for (let y = y0; y <= y1; y++) {
          for (let x = x0; x <= x1; x++) {
            const edge = x === x0 || x === x1 || y === y0 || y === y1;
            if (state.paintFilled || edge) map.set(y * TEX + x, color);
          }
        }
      } else {
        const cx = (st.start[0] + p[0]) / 2;
        const cy = (st.start[1] + p[1]) / 2;
        const rx = Math.abs(p[0] - st.start[0]) / 2 + 0.5;
        const ry = Math.abs(p[1] - st.start[1]) / 2 + 0.5;
        for (let y = Math.floor(cy - ry); y <= cy + ry; y++) {
          for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
            if (x < 0 || y < 0 || x >= TEX || y >= TEX) continue;
            const dx = (x + 0.5 - cx) / rx;
            const dy = (y + 0.5 - cy) / ry;
            const d = dx * dx + dy * dy;
            if (d <= 1) {
              if (state.paintFilled) map.set(y * TEX + x, color);
              else if (d >= 1 - 2 / Math.max(rx, ry)) map.set(y * TEX + x, color);
            }
          }
        }
      }
      const ctx = canvasRef.current?.getContext('2d');
      if (ctx) {
        for (const [i, c] of map) {
          const x = i % TEX;
          const y = Math.floor(i / TEX);
          ctx.fillStyle = tex.palette[c] ?? '#ff00ff';
          ctx.fillRect(x * scale, y * scale, scale, scale);
        }
      }
      st.last = p;
    }
  }, [colorFor, state.brushSize, state.paintFilled, tex, applyPreview, drawCanvas,onPreview]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    const movement=moving.current;
    if(movement){
      moving.current=null;setMovePreview(null);onPreview?.(null);
      try{(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)}catch{}
      if(JSON.stringify(movement.source)!==JSON.stringify(movement.destination)){
        const result=commit(movement.copy?'Copy marquee by drag':'Move marquee',draft=>{if(JSON.stringify(draft.texture)!==JSON.stringify(movement.project.texture))throw new Error('Texture changed during drag');draft.texture=movedTexture(movement.project.texture,movement.source,movement.destination,movement.copy)});
        setMarqueeRect(result?movement.destination:movement.source);
      }
      return;
    }
    const st = strokeRef.current;
    if (!st) return;
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    const p = pxFromEvent(e) ?? st.last;
    const color = colorFor(e.button === 2);

    if (st.tool === 'marquee') {
      strokeRef.current = null;
      // keep marqueeRect for copy/paste
      if (marqueeRect && (marqueeRect[2] <= 0 || marqueeRect[3] <= 0)) setMarqueeRect(null);
      return;
    }

    // Compose full stroke pixel set: accumulated preview + final shape.
    const map = new Map<number, number>(st.previewPixels);
    if (st.tool === 'pen' || st.tool === 'eraser') {
      // freehand: accumulated segments already cover the path
    } else if (st.tool === 'line') {
      interpolateLine(st.start, p, (q) => map.set(q[1] * TEX + q[0], color));
    } else if (st.tool === 'rect') {
      const x0 = Math.min(st.start[0], p[0]);
      const x1 = Math.max(st.start[0], p[0]);
      const y0 = Math.min(st.start[1], p[1]);
      const y1 = Math.max(st.start[1], p[1]);
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const edge = x === x0 || x === x1 || y === y0 || y === y1;
          if (state.paintFilled || edge) map.set(y * TEX + x, color);
        }
      }
    } else if (st.tool === 'ellipse') {
      const cx = (st.start[0] + p[0]) / 2;
      const cy = (st.start[1] + p[1]) / 2;
      const rx = Math.abs(p[0] - st.start[0]) / 2 + 0.5;
      const ry = Math.abs(p[1] - st.start[1]) / 2 + 0.5;
      for (let y = Math.floor(cy - ry); y <= cy + ry; y++) {
        for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
          if (x < 0 || y < 0 || x >= TEX || y >= TEX) continue;
          const dx = (x + 0.5 - cx) / rx;
          const dy = (y + 0.5 - cy) / ry;
          const d = dx * dx + dy * dy;
          if (d <= 1) {
            if (state.paintFilled) map.set(y * TEX + x, color);
            else if (d >= 1 - 2 / Math.max(rx, ry)) map.set(y * TEX + x, color);
          }
        }
      }
    }
    const label = TOOL_ORDER.find((t) => t.id === st.tool)?.label ?? 'Paint';
    strokeRef.current = null;
    onPreview?.(null);
    commitPixelEdits(label.split(' ')[0], map);
    drawCanvas();
  }, [colorFor, state.brushSize, state.paintFilled, tex, commitPixelEdits, drawCanvas, marqueeRect,commit,onPreview]);

  const marqueeCopy_ = useCallback(() => {
    if (!marqueeRect) { dispatch({ t: 'setStatus', status: 'No marquee selection.' }); return; }
    const data = marqueeCopy(tex, marqueeRect[0], marqueeRect[1], marqueeRect[2], marqueeRect[3]);
    (window as unknown as { __pivoOrthoMarquee?: unknown }).__pivoOrthoMarquee = data;
    dispatch({ t: 'setStatus', status: `Marquee copied (${data.width}×${data.height}).` });
  }, [marqueeRect, tex, dispatch]);

  const marqueePaste_ = useCallback(() => {
    const data = (window as unknown as { __pivoOrthoMarquee?: { width: number; height: number; pixels: number[] } }).__pivoOrthoMarquee;
    if (!marqueeRect || !data) { dispatch({ t: 'setStatus', status: 'Copy a marquee first, then paste into a selection.' }); return; }
    commit('Marquee paste', (draft) => {
      marqueePaste(draft.texture, data, marqueeRect[0], marqueeRect[1]);
    });
  }, [marqueeRect, commit, dispatch]);

  const importPNG = useCallback(async (file: File) => {
    try {
      const bitmap = await createImageBitmap(file);
      const cv = document.createElement('canvas');
      cv.width = TEX; cv.height = TEX;
      const ctx = cv.getContext('2d')!;
      ctx.imageSmoothingEnabled=false;
      ctx.drawImage(bitmap, 0, 0, TEX, TEX);
      bitmap.close();
      const rgba = ctx.getImageData(0, 0, TEX, TEX).data;
      const committed = commit('Import PNG (quantized)', (draft) => {
        quantizeRGBA(new Uint8Array(rgba), TEX, TEX, draft.texture);
      });
      if (committed) dispatch({ t: 'setStatus', status: 'PNG imported and quantized to palette.' });
    } catch (err) {
      dispatch({ t: 'setStatus', status: `PNG import failed: ${(err as Error).message}` });
    }
  }, [commit, dispatch]);

  const exportPNG = useCallback(() => {
    const rgba = textureRGBA(tex);
    const cv = document.createElement('canvas');
    cv.width = TEX; cv.height = TEX;
    const ctx = cv.getContext('2d')!;
    const img = ctx.createImageData(TEX, TEX);
    img.data.set(rgba);
    ctx.putImageData(img, 0, 0);
    cv.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${project.name || 'texture'}-texture.png`;
      a.click();
      URL.revokeObjectURL(a.href);
      dispatch({ t: 'setStatus', status: 'Texture PNG downloaded.' });
    }, 'image/png');
  }, [tex, project.name, dispatch]);

  const tool = state.paintTool;

  return (
    <div className="paint-workspace">
      <nav className="suite-tool-rail" aria-label="Paint tools">        {TOOL_ORDER.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`tool-btn ${tool === t.id ? 'active' : ''}`}
            title={`${t.label} (${t.key})`}
            aria-label={t.label}
            aria-pressed={tool === t.id}
            onClick={() => dispatch({ t: 'setTool', tool: t.id })}
          >
            <t.icon />
          </button>
        ))}
        <button title="Eyedropper (I)" aria-label="Eyedropper" aria-pressed={tool==='picker'} onClick={()=>dispatch({t:'setTool',tool:'picker'})}>Pick</button>
</nav>
      <DockPortal target={toolbar} hidden={!active}><div className="paint-toolbar" role="toolbar" aria-label="Paint tools">
        <div className="vsep" />
        <label className="inline-label" htmlFor="paint-zoom">Zoom
          <select id="paint-zoom" value={zoom} onChange={(e) => navigation.changeZoom(Number(e.target.value))}>
            {TEXTURE_ZOOMS.map((z) => <option key={z} value={z}>{z}× ({z * 128}px)</option>)}
          </select>
        </label>
        <details className="suite-menu"><summary>Brush / view</summary><div className="suite-menu-popup">        <button onClick={navigation.fit} aria-label="Fit paint texture">Fit</button><button onClick={navigation.reset} aria-label="Reset paint texture view">Reset view</button>
        <label className="inline-label check">
          <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} />
          Grid
        </label>
        <label className="inline-label check">
          <input
            type="checkbox" checked={state.paintFilled}
            onChange={(e) => dispatch({ t: 'setPaint', filled: e.target.checked })}
          />
          Filled shapes
        </label>
</div></details>
        <label className="inline-label" htmlFor="brush-size">Brush
          <input
            id="brush-size" type="number" min={1} max={8} value={state.brushSize}
            onChange={(e) => dispatch({ t: 'setPaint', brush: Math.max(1, Math.min(8, Number(e.target.value) || 1)) })}
            style={{ width: 52 }}
          />
        </label>
        <div className="vsep" />
        <details className="suite-menu"><summary>Texture actions</summary><div className="suite-menu-popup">        <button type="button" onClick={marqueeCopy_} disabled={!marqueeRect}>Copy</button>
        <button type="button" onClick={marqueePaste_} disabled={!marqueeRect}>Paste</button>
        <button type="button" onClick={() => setMarqueeRect(null)} disabled={!marqueeRect}>Clear marquee</button>
        <div className="vsep" />
        <label className="file-label">
          <input
            ref={fileRef} type="file" accept="image/png" aria-label="Import PNG texture" hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importPNG(f);
              e.target.value = '';
            }}
          />
        </label>
        <button type="button" onClick={()=>fileRef.current?.click()}>Import PNG</button>
        <button type="button" onClick={exportPNG}>Export texture PNG</button>
</div></details>
      </div></DockPortal>

<details className="suite-instructions texture-help"><summary>Texture usage help</summary><p className="hint texture-hint">Wheel zooms at pointer; Space+drag or middle-drag pans; +/- zoom, Home fits. Marquee: select, then drag inside to move; Alt copies, Shift makes a new selection. Escape cancels.</p></details>
      <div className="paint-body">
        <div ref={navigation.container} {...navigation.bind} className={`paint-canvas-wrap ${navigation.panning?'texture-panning':''}`} aria-label="Paint texture navigation">
          <canvas
            ref={canvasRef}
            width={cssSize}
            height={cssSize}
            className="paint-canvas"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={()=>cancelRef.current()}
            onContextMenu={(e) => e.preventDefault()}
            aria-label="128 by 128 indexed texture canvas"
            role="img"
          />
        </div>
        <DockPortal target={dock}><div className="paint-side">
          <section aria-labelledby="pal-h">
            <h3 id="pal-h">Palette</h3>
            <div className="palette-grid" role="listbox" aria-label="Palette colors">
              {tex.palette.map((hex, i) => (
                <button
                  key={i}
                  type="button"
                  role="option"
                  aria-label={`Palette index ${i}, ${hex}`}
                  aria-selected={state.primary === i}
                  className={`swatch ${state.primary === i ? 'primary' : ''} ${state.secondary === i ? 'secondary' : ''} ${tex.transparent === i ? 'trans' : ''} ${tex.background === i ? 'bg' : ''}`}
                  style={{ background: hex }}
                  title={`Index ${i} ${hex}${tex.transparent === i ? ' — transparent' : ''}${tex.background === i ? ' — background' : ''}`}
                  onClick={(e) => {
                    if (e.shiftKey) dispatch({ t: 'setPaint', secondary: i });
                    else dispatch({ t: 'setPaint', primary: i });
                    setEditIdx(i);
                  }}
                  onContextMenu={(e) => { e.preventDefault(); dispatch({ t: 'setPaint', secondary: i }); }}
                />
              ))}
            </div>
            <p className="hint">Click = primary · Right-click/Shift = secondary</p>
            {editIdx !== null && (
              <div className="palette-edit">
                <label htmlFor="pal-hex">Color for index {editIdx}</label>
                <input
                  id="pal-hex" type="color" value={tex.palette[editIdx]}
                  onChange={(e) => {
                    const v = e.target.value;
                    commit('Edit palette color', (draft) => { draft.texture.palette[editIdx] = v; });
                  }}
                />
                <label className="check" htmlFor="pal-trans">
                  <input
                    id="pal-trans" type="checkbox" checked={tex.transparent === editIdx}
                    onChange={(e) => {
                      if (e.target.checked) commit('Set transparent index', (draft) => { draft.texture.transparent = editIdx; });
                    }}
                  />
                  Transparent index
                </label>
                <label className="check" htmlFor="pal-bg">
                  <input
                    id="pal-bg" type="checkbox" checked={tex.background === editIdx}
                    onChange={(e) => {
                      if (e.target.checked) commit('Set background index', (draft) => { draft.texture.background = editIdx; });
                    }}
                  />
                  Background index
                </label>
                <div className="row">{[0,1,2].map(level=><label key={level}>{['Dark','Mid','Light'][level]}<input type="number" min={0} max={15} value={tex.shadeRamps[editIdx]?.[level]??editIdx} aria-label={`Shade ${level} index`} onChange={e=>commit('Edit shade ramp',p=>{if(p.texture.shadeRamps.length!==16)generateRamps(p.texture);p.texture.shadeRamps[editIdx][level]=Math.max(0,Math.min(15,Math.round(Number(e.target.value))));})} style={{width:45}}/></label>)}</div>
              </div>
            )}
          </section>
          <section>
            <h3>Model preview</h3>
            <ScenePreview project={previewProject??project} />
          </section>

          <section>
            <h3>Palette helpers</h3>
            <button className="wide" onClick={()=>commit('Reset palette',p=>{p.texture.palette=[...PALETTE_16];generateRamps(p.texture);})}>Studio palette</button>
            <button className="wide" onClick={()=>commit('Palette gradient',p=>{const a=Math.min(state.primary,state.secondary),b=Math.max(state.primary,state.secondary);if(a===b)return;const rgb=(hex:string)=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));const c1=rgb(p.texture.palette[a]),c2=rgb(p.texture.palette[b]);for(let i=a+1;i<b;i++){const t=(i-a)/(b-a);p.texture.palette[i]='#'+c1.map((c,k)=>Math.round(c+(c2[k]-c)*t).toString(16).padStart(2,'0')).join('')}})}>Gradient primary ↔ secondary</button>
            <button
              type="button" className="wide"
              onClick={() => {
                const { primary, secondary } = state;
                commit('Swap palette entries', (draft) => { swapPalette(draft.texture, primary, secondary); for(const m of draft.meshes)for(const f of m.faces){if(f.color===primary)f.color=secondary;else if(f.color===secondary)f.color=primary;} });
              }}
            >
              <IconSwap /> Swap {state.primary} ↔ {state.secondary}
            </button>
            <button
              type="button" className="wide"
              onClick={() => commit('Generate shade ramps', (draft) => generateRamps(draft.texture))}
            >
              Auto-generate all ramps
            </button>
          </section>
        </div></DockPortal>
      </div>
    </div>
  );
}

function interpolateLine(from: Vec2, to: Vec2, cb: (p: Vec2) => void) {
  // integer Bresenham
  let [x0, y0] = from;
  const [x1, y1] = to;
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let guard = 0;
  while (guard++ < 1000) {
    cb([x0, y0]);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

function PaintModelPreview(): React.JSX.Element {
  const { state } = useStore();
  return <ScenePreview project={state.project} />;
}

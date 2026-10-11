// Indexed raster painting over the fixed 128×128 texture. All tools write
// palette indices, clamp/bounds-check defensively, and never read or write
// outside the texture.
import type { Texture, RasterTool, Vec2 } from './types';
import { clamp } from './util';

export const TEX_W = 128;
export const TEX_H = 128;

function idx(x: number, y: number): number {
  return y * TEX_W + x;
}

function inBounds(x: number, y: number): boolean {
  return x >= 0 && x < TEX_W && y >= 0 && y < TEX_H;
}

function setColor(texture: Texture, x: number, y: number, color: number): void {
  if (!inBounds(x, y)) return;
  texture.pixels[idx(x, y)] = color;
}

function getColor(texture: Texture, x: number, y: number): number {
  if (!inBounds(x, y)) return -1;
  return texture.pixels[idx(x, y)];
}

/** Bresenham line between two points, inclusive of both endpoints. */
function linePoints(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  const pts: [number, number][] = [];
  let dx = Math.abs(x1 - x0);
  let dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0, y = y0;
  for (;;) {
    pts.push([x, y]);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
  return pts;
}

/**
 * Apply a paint tool. `from` is the anchor; `to` the current pointer (for pen/
 * eraser they interpolate the stroke; for shapes they define the rectangle).
 * `filled` only applies to rectangle/ellipse. Out-of-bounds parts are ignored.
 */
export function paint(
  texture: Texture,
  tool: RasterTool,
  from: Vec2,
  to: Vec2,
  color: number,
  filled?: boolean,
): void {
  if (!texture || texture.width !== TEX_W || texture.height !== TEX_H) {
    throw new Error('paint expects the fixed 128×128 texture');
  }
  if (!Number.isInteger(color) || color < 0 || color > 15) {
    throw new Error(`paint color must be a palette index 0…15, got ${String(color)}`);
  }
  for (const p of [from, to]) {
    if (!Array.isArray(p) || p.length !== 2 || !p.every((n) => typeof n === 'number' && Number.isFinite(n))) {
      throw new Error('paint coordinates must be finite [x, y] pairs');
    }
  }
  const [x0, y0] = from.map((n) => Math.round(n));
  const [x1, y1] = to.map((n) => Math.round(n));

  switch (tool) {
    case 'pen':
    case 'eraser': {
      // Eraser paints the transparent index.
      const c = tool === 'eraser' ? texture.transparent : color;
      for (const [px, py] of linePoints(x0, y0, x1, y1)) setColor(texture, px, py, c);
      break;
    }
    case 'line': {
      for (const [px, py] of linePoints(x0, y0, x1, y1)) setColor(texture, px, py, color);
      break;
    }
    case 'rectangle': {
      const xa = Math.min(x0, x1), xb = Math.max(x0, x1);
      const ya = Math.min(y0, y1), yb = Math.max(y0, y1);
      for (let y = ya; y <= yb; y++) {
        for (let x = xa; x <= xb; x++) {
          if (filled || x === xa || x === xb || y === ya || y === yb) setColor(texture, x, y, color);
        }
      }
      break;
    }
    case 'ellipse': {
      const xa = Math.min(x0, x1), xb = Math.max(x0, x1);
      const ya = Math.min(y0, y1), yb = Math.max(y0, y1);
      const cx = (xa + xb) / 2, cy = (ya + yb) / 2;
      const rx = Math.max((xb - xa) / 2, 0), ry = Math.max((yb - ya) / 2, 0);
      for (let y = ya; y <= yb; y++) {
        for (let x = xa; x <= xb; x++) {
          const nx = rx === 0 ? 0 : (x - cx) / rx;
          const ny = ry === 0 ? 0 : (y - cy) / ry;
          const r = nx * nx + ny * ny;
          if (r <= 1 + 1e-9) {
            if (filled) { setColor(texture, x, y, color); continue; }
            // outline: pixel is inside but a 4-neighbour outside the ellipse
            const edge =
              neighborOutside(nx, ny, rx, ry, 1 / Math.max(xb - xa, 1), 0) ||
              neighborOutside(nx, ny, rx, ry, -1 / Math.max(xb - xa, 1), 0) ||
              neighborOutside(nx, ny, rx, ry, 0, 1 / Math.max(yb - ya, 1)) ||
              neighborOutside(nx, ny, rx, ry, 0, -1 / Math.max(yb - ya, 1));
            if (edge) setColor(texture, x, y, color);
          }
        }
      }
      break;
    }
    case 'fill':
      floodFill(texture, x0, y0, color);
      break;
    default:
      throw new Error(`unknown raster tool: ${String(tool)}`);
  }
}

function neighborOutside(nx: number, ny: number, rx: number, ry: number, dx: number, dy: number): boolean {
  void rx; void ry;
  return nx + dx > 1 || nx + dx < -1 || ny + dy > 1 || ny + dy < -1;
}

/** Four-connected bounded flood fill. Filling with the same color is a no-op. */
export function floodFill(texture: Texture, x: number, y: number, color: number): void {
  if (!Number.isInteger(color) || color < 0 || color > 15) {
    throw new Error(`flood fill color must be a palette index 0…15, got ${String(color)}`);
  }
  if (!inBounds(x, y)) return; // bounded: outside fills nothing
  const target = getColor(texture, x, y);
  if (target === color) return;
  const stack: [number, number][] = [[x, y]];
  const seen = new Set<number>();
  while (stack.length) {
    const [cx, cy] = stack.pop()!;
    if (!inBounds(cx, cy)) continue;
    const i = idx(cx, cy);
    if (seen.has(i)) continue;
    seen.add(i);
    if (texture.pixels[i] !== target) continue;
    texture.pixels[i] = color;
    stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
  }
}

/** Decode the indexed texture into an RGBA byte array (transparent index → alpha 0). */
export function textureRGBA(texture: Texture): Uint8Array {
  const out = new Uint8Array(TEX_W * TEX_H * 4);
  const rgb = texture.palette.map(hexToRGB);
  for (let i = 0; i < texture.pixels.length; i++) {
    const p = texture.pixels[i];
    const [r, g, b] = rgb[p];
    out[i * 4] = r;
    out[i * 4 + 1] = g;
    out[i * 4 + 2] = b;
    out[i * 4 + 3] = p === texture.transparent ? 0 : 255;
  }
  return out;
}

export function hexToRGB(hex: string): [number, number, number] {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) throw new Error(`invalid hex color: ${JSON.stringify(hex)}`);
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

/**
 * Deterministically quantize an RGBA buffer into the texture's palette.
 * Alpha below the threshold goes to the transparent index; other pixels pick
 * the nearest palette color by squared sRGB distance. `texture.pixels` is
 * rewritten in place at the fixed 128x128 size using nearest-neighbor resampling.
 */
export function quantizeRGBA(rgba: Uint8Array, width: number, height: number, texture: Texture): void {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error('quantize dimensions must be positive integers');
  }
  if (rgba.length !== width * height * 4) {
    throw new Error(`quantize expected ${width * height * 4} RGBA bytes, got ${rgba.length}`);
  }
  const lut = texture.palette.map(hexToRGB);
  const out = new Array<number>(width * height);
  const alphaThreshold = 128;
  for (let i = 0; i < width * height; i++) {
    const a = rgba[i * 4 + 3];
    if (a < alphaThreshold) { out[i] = texture.transparent; continue; }
    const r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2];
    let best = 0, bestD = Infinity;
    for (let p = 0; p < lut.length; p++) {
      if (p === texture.transparent) continue;
      const [pr, pg, pb] = lut[p];
      const d = (r - pr) * (r - pr) + (g - pg) * (g - pg) + (b - pb) * (b - pb);
      if (d < bestD) { bestD = d; best = p; }
    }
    out[i] = best;
  }
  texture.pixels = Array.from({length:128*128},(_,i)=>out[Math.min(height-1,Math.floor(Math.floor(i/128)*height/128))*width+Math.min(width-1,Math.floor((i%128)*width/128))]);
}

/**
 * Swap two palette indices' *index identities*: pixel data is rewritten so the
 * visual appearance at each pixel is preserved while the palette entries trade
 * places. (Documented decision: index identities move, visuals stay.)
 */
export function swapPalette(texture: Texture, a: number, b: number): void {
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || a > 15 || b < 0 || b > 15) {
    throw new Error('swapPalette indices must be 0…15');
  }
  if (a === b) return;
  for (let i = 0; i < texture.pixels.length; i++) {
    if (texture.pixels[i] === a) texture.pixels[i] = b;
    else if (texture.pixels[i] === b) texture.pixels[i] = a;
  }
  const tmp = texture.palette[a];
  texture.palette[a] = texture.palette[b];
  texture.palette[b] = tmp;
  const remap=(i:number)=>i===a?b:i===b?a:i;
  texture.transparent=remap(texture.transparent); texture.background=remap(texture.background);
  const ramps=texture.shadeRamps.map(r=>r.map(remap));
  if(ramps.length===16){const tmp=ramps[a];ramps[a]=ramps[b];ramps[b]=tmp}
  texture.shadeRamps=ramps;

}

/**
 * Deterministically generate shading ramps for every palette entry that has a
 * strictly darker and lighter neighbour in the palette; entries without
 * usable neighbours get a self ramp. Existing ramps are replaced.
 */
export function generateRamps(texture: Texture): void {
  const lum = texture.palette.map(hexToRGB).map(([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b);
  const ramps: number[][] = [];
  for (let i = 0; i < 16; i++) {
    // nearest darker and nearest lighter entries by luminance distance
    let darker = -1, darkerD = Infinity;
    let lighter = -1, lighterD = Infinity;
    for (let j = 0; j < 16; j++) {
      if (j === i || j === texture.transparent) continue;
      const d = Math.abs(lum[j] - lum[i]);
      if (lum[j] < lum[i] && d < darkerD) { darkerD = d; darker = j; }
      if (lum[j] > lum[i] && d < lighterD) { lighterD = d; lighter = j; }
    }
    ramps.push([
      darker >= 0 ? darker : i,
      i,
      lighter >= 0 ? lighter : i,
    ]);
  }
  texture.shadeRamps = ramps;
}

/** Copy a rectangular region (clipped to the texture) of palette indices. */
export function marqueeCopy(texture: Texture, x: number, y: number, w: number, h: number): { width: number; height: number; pixels: number[] } {
  if (!Number.isInteger(w) || !Number.isInteger(h) || w <= 0 || h <= 0) {
    throw new Error('marquee size must be positive integers');
  }
  const xa = clamp(x, 0, TEX_W), xb = clamp(x + w, 0, TEX_W);
  const ya = clamp(y, 0, TEX_H), yb = clamp(y + h, 0, TEX_H);
  const width = xb - xa, height = yb - ya;
  const pixels: number[] = [];
  for (let yy = 0; yy < height; yy++) {
    for (let xx = 0; xx < width; xx++) {
      pixels.push(texture.pixels[idx(xa + xx, ya + yy)]);
    }
  }
  return { width, height, pixels };
}

/** Paste a marquee region with its top-left corner at x,y (clipped). */
export function marqueePaste(
  texture: Texture,
  data: { width: number; height: number; pixels: number[] },
  x: number,
  y: number,
): void {
  if (!data || !Array.isArray(data.pixels) || data.width * data.height !== data.pixels.length) {
    throw new Error('marquee paste data must carry width*height pixels');
  }
  for (let yy = 0; yy < data.height; yy++) {
    for (let xx = 0; xx < data.width; xx++) {
      const v = data.pixels[yy * data.width + xx];
      if (!Number.isInteger(v) || v < 0 || v > 15) {
        throw new Error(`marquee paste pixel ${yy * data.width + xx} is not a palette index 0…15`);
      }
      setColor(texture, x + xx, y + yy, v);
    }
  }
}

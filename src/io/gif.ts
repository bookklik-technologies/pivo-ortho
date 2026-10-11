/**
 * Deterministic GIF89a animation encoder built on gifenc.
 *
 * Input frames are full-frame RGBA buffers (4 bytes/pixel, row-major,
 * top-left origin). The project texture's 16-color palette and transparent
 * index are used so exported colors match the app's indexed look exactly —
 * colors are mapped to the nearest palette entry; no statistical quantization
 * is performed, so no quality warning is emitted for on-palette input.
 */

import { GIFEncoder, quantize as gifQuantize, applyPalette as gifApplyPalette } from 'gifenc';

export interface EncodeGIFResult {
  bytes: Uint8Array;
  /** Human-readable notes (e.g. off-palette colors were remapped). */
  warnings: string[];
}

export interface EncodeGIFFull {
  /** Legacy alias: just the bytes (same as result.bytes). */
  bytes: Uint8Array;
  warnings: string[];
}

const MAX_DIMENSION = 4096;
const MAX_FRAMES = 4096;

export interface GIFWarn {
  warnings: string[];
}

/**
 * Encode animated GIF89a from RGBA frames.
 *
 * The CONTRACT signature is (frames, width, height, texture, fps) => Uint8Array,
 * which we honor; the color mapping is derived from the texture's palette and
 * transparent index.
 */
export function encodeGIF(
  frames: Uint8Array[],
  width: number,
  height: number,
  texture: { palette: string[]; transparent: number; background: number; width: number; height: number; pixels: number[] },
  fps: number,
): Uint8Array {
  const { bytes } = encodeGIFDetailed(frames, width, height, texture, fps);
  return bytes;
}

/** Same as encodeGIF but also returns the warnings list. */
export function encodeGIFDetailed(
  frames: Uint8Array[],
  width: number,
  height: number,
  texture: { palette: string[]; transparent: number; background: number; width: number; height: number; pixels: number[] },
  fps: number,
  options: {preserveColors?:boolean} = {},
): EncodeGIFResult {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 || width > MAX_DIMENSION || height > MAX_DIMENSION) {
    throw new Error(`encodeGIF: invalid dimensions ${width}x${height}`);
  }
  if (!Number.isInteger(width) || !Number.isInteger(height)) throw new Error('encodeGIF: dimensions must be integers');
  if (!Array.isArray(frames) || frames.length === 0) throw new Error('encodeGIF: at least one frame is required');
  if (frames.length > MAX_FRAMES) throw new Error(`encodeGIF: too many frames (${frames.length} > ${MAX_FRAMES})`);
  if (!Number.isFinite(fps) || fps <= 0) throw new Error(`encodeGIF: invalid fps ${fps}`);

  const expected = width * height * 4;
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    if (!(f instanceof Uint8Array)) throw new Error(`encodeGIF: frame ${i} is not a Uint8Array`);
    if (f.length !== expected) {
      throw new Error(`encodeGIF: frame ${i} has ${f.length} bytes, expected ${expected} for ${width}x${height} RGBA`);
    }
  }

  const warnings: string[] = [];
  const paletteRGBA = paletteToRGBA(texture.palette);
  if(options.preserveColors){const keys=new Set(paletteRGBA.filter((_,i)=>i!==texture.transparent).map(c=>c.join(',')));let excess=false;for(const frame of frames)for(let i=0;i<frame.length;i+=4){if(frame[i+3]<128)continue;const key=`${frame[i]},${frame[i+1]},${frame[i+2]}`;if(keys.has(key))continue;if(paletteRGBA.length<256){paletteRGBA.push([frame[i],frame[i+1],frame[i+2]]);keys.add(key)}else excess=true}if(excess)warnings.push('Effect colors exceed 256 GIF entries; excess colors are mapped to the nearest available color');}

  // Deterministic mapping: nearest palette color in squared RGBA distance.
  // Transparent texels (alpha < 128) map to the texture's transparent index.
  const transparentIndex = texture.transparent;
  const cache=new Map<number,{index:number;distance:number}>();for(let i=0;i<paletteRGBA.length;i++){if(i===transparentIndex)continue;const c=paletteRGBA[i],key=(c[0]<<16)|(c[1]<<8)|c[2];if(!cache.has(key))cache.set(key,{index:i,distance:0});}
  const mapFrame = (rgba: Uint8Array): Uint8Array => {
    const indexed = new Uint8Array(width * height);
    let offPalette = 0;
    for (let p = 0; p < width * height; p++) {
      const r = rgba[p * 4];
      const g = rgba[p * 4 + 1];
      const b = rgba[p * 4 + 2];
      const a = rgba[p * 4 + 3];
      if (a < 128) {
        indexed[p] = transparentIndex;
        continue;
      }
      const key=(r<<16)|(g<<8)|b,known=cache.get(key);if(known){indexed[p]=known.index;if(known.distance>4096)offPalette++;continue;}
      let best = 0;
      let bestD = Infinity;
      for (let ci = 0; ci < paletteRGBA.length; ci++) {
        if (ci === transparentIndex) continue;
        const pc = paletteRGBA[ci];
        const dr = pc[0] - r;
        const dg = pc[1] - g;
        const db = pc[2] - b;
        const d = dr * dr + dg * dg + db * db;
        if (d < bestD) {
          bestD = d;
          best = ci;
        }
      }
      if(cache.size<4096)cache.set(key,{index:best,distance:bestD});
      if (bestD > 4096) offPalette++;
      indexed[p] = best;
    }
    if (offPalette > 0) {
      warnings.push(
        `encodeGIF: ${offPalette} texel(s) were not on the 16-color palette and were mapped to the nearest entry`,
      );
    }
    return indexed;
  };

  // GIF palettes are powers of two in size (2/4/16/256). We always emit the
  // full 256-entry table padded with black so the 16 app colors sit at their
  // original indices (color 0 keeps its identity — a 16-color table would
  // otherwise force remapping entry 0 to black).
  const tableSize = 256;
  const flatPalette: number[][] = [];
  for (let i = 0; i < tableSize; i++) {
    if (i < paletteRGBA.length) flatPalette.push([paletteRGBA[i][0], paletteRGBA[i][1], paletteRGBA[i][2]]);
    else flatPalette.push([0, 0, 0]);
  }
  const flatPaletteFlat = flatPalette.flat();

  // gifenc accepts milliseconds and writes the GIF centisecond field.
  const delay = Math.max(20, Math.round(1000 / fps));
  const encoder = GIFEncoder();
  let wroteTransparent = false;
  for (let fi = 0; fi < frames.length; fi++) {
    const indexed = mapFrame(frames[fi]);
    const hasTransparency = frames[fi].some((v, i) => i % 4 === 3 && v < 128);
    if (hasTransparency) wroteTransparent = true;
    encoder.writeFrame(indexed, width, height, {
      palette: flatPalette,
      delay,
      repeat: 0, // loop forever; UI/export callers decide looping semantics
      transparent: hasTransparency,
      transparentIndex,
      dispose: 2, // restore to background so transparent areas reveal nothing
    });
  }
  encoder.finish();
  const bytes = encoder.bytes();
  if (wroteTransparent) {
    warnings.push(`encodeGIF: transparent texels encoded with the texture's transparent index (${transparentIndex})`);
  }
  return { bytes, warnings };
}

/** Convert #rrggbb palette strings to [r,g,b] triplets. */
export function paletteToRGBA(palette: string[]): Array<[number, number, number]> {
  return palette.map((hex) => {
    const m = /^#?([0-9a-fA-F]{6})$/.exec(hex);
    if (!m) throw new Error(`paletteToRGBA: invalid color ${JSON.stringify(hex)}`);
    const v = parseInt(m[1], 16);
    return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
  });
}

/** Re-export gifenc's own quantizer for callers that need adaptive palettes. */
export { gifQuantize, gifApplyPalette };

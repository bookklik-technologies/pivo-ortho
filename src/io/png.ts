/**
 * Portable PNG encoder (color type 6, truecolor + alpha) built on fflate's
 * zlib wrapper. No DOM APIs — safe in Node and Vitest.
 *
 * Layout per PNG spec (ISO/IEC 15948): 8-byte signature, IHDR, IDAT
 * (zlib: CMF/FLG + one deflate stream + Adler-32), IEND. Each scanline is
 * prefixed with filter byte 0 (None).
 */

import { deflateSync, crc32 } from './crc-compat';

export const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

export interface EncodePNGOptions {
  /** Compression level 0–9 (default 6, matches fflate default). */
  level?: number;
}

function u32be(v: number): Uint8Array {
  const b = new Uint8Array(4);
  // Use arithmetic so values above 2^31 (e.g. CRCs) stay unsigned-correct.
  b[0] = (v >>> 24) & 0xff;
  b[1] = (v >>> 16) & 0xff;
  b[2] = (v >>> 8) & 0xff;
  b[3] = v & 0xff;
  return b;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  out.set(u32be(data.length), 0);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  const crc = crc32(out.subarray(4, 8 + data.length));
  out.set(u32be(crc >>> 0), 8 + data.length);
  return out;
}

/** Concatenate chunks into one buffer (also used by GIF import-free helpers). */
export function concatBytes(parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

/** Adler-32 checksum (RFC 1950) over the uncompressed data. */
function adler32(data: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (let i = 0; i < data.length; i++) {
    a = (a + data[i]) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

/** Wrap a raw DEFLATE stream into a zlib stream: CMF/FLG + deflate + Adler-32. */
function zlibWrap(deflated: Uint8Array, uncompressed: Uint8Array): Uint8Array {
  // CMF = 0x78 (deflate, 32K window); FLG chosen so (CMF*256+FLG) % 31 === 0
  // with FDICT clear. 0x78 0x9C is the canonical level-6-default header.
  const header = new Uint8Array([0x78, 0x9c]);
  const adler = new Uint8Array(4);
  const v = adler32(uncompressed);
  adler[0] = (v >>> 24) & 0xff;
  adler[1] = (v >>> 16) & 0xff;
  adler[2] = (v >>> 8) & 0xff;
  adler[3] = v & 0xff;
  return concatBytes([header, deflated, adler]);
}

/** Encode RGBA (4 bytes/sample, row-major, top-left origin) into a PNG file. */
export function encodePNG(
  width: number,
  height: number,
  rgba: Uint8Array,
  options: EncodePNGOptions = {},
): Uint8Array {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error(`encodePNG: invalid dimensions ${width}x${height}`);
  }
  if (!Number.isInteger(width) || !Number.isInteger(height)) {
    throw new Error('encodePNG: dimensions must be integers');
  }
  const expected = width * height * 4;
  if (!(rgba instanceof Uint8Array) || rgba.length !== expected) {
    throw new Error(`encodePNG: expected ${expected} bytes of RGBA for ${width}x${height}, got ${rgba?.length}`);
  }

  const level = options.level ?? 6;
  if (level < 0 || level > 9) throw new Error('encodePNG: level must be 0-9');

  // Raw scanlines with filter byte 0.
  const stride = width * 4;
  const raw = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    raw.set(rgba.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }

  // Level is validated to 0–9 above; fflate types it as the literal union.
  // deflateSync emits a RAW deflate stream; PNG IDAT requires a zlib stream
  // (2-byte header + deflate + Adler-32), so wrap it here.
  const deflated = deflateSync(raw, { level: level as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9, mem: 9 });
  const compressed = zlibWrap(deflated, raw);

  // IHDR: width, height, bit depth 8, color type 6 (RGBA), compression 0,
  // filter 0, interlace 0.
  const ihdr = new Uint8Array(13);
  ihdr.set(u32be(width), 0);
  ihdr.set(u32be(height), 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  // [10..12] stay zero: compression, filter, interlace methods.

  return concatBytes([
    new Uint8Array(PNG_SIGNATURE),
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', new Uint8Array(0)),
  ]);
}

export interface DecodedPNG {
  width: number;
  height: number;
  /** RGBA bytes. */
  data: Uint8Array;
  /** Chunk inventory (types + CRC validity), for tests. */
  chunks: PNGChunkReport[];
}

/** Inventory of one chunk found by decodePNG (type, byte length, CRC validity). */
export interface PNGChunkReport {
  /** Four-character chunk type, e.g. 'IHDR'. */
  type: string;
  /** Data length in bytes (excluding length/type/CRC fields). */
  length: number;
  /** True when the stored CRC matches the computed CRC. */
  crcOk: boolean;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function pngCrc(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Minimal independent PNG decoder for color type 6, bit depth 8 — used by the
 * test suite to verify encoder output with a reader that does not share the
 * writer's code path. Handles filter types 0–4 per spec.
 */
export function decodePNG(png: Uint8Array): DecodedPNG {
  const dv = new DataView(png.buffer, png.byteOffset, png.byteLength);
  for (let i = 0; i < 8; i++) {
    if (png[i] !== PNG_SIGNATURE[i]) throw new Error('decodePNG: bad signature');
  }
  const chunks: PNGChunkReport[] = [];
  let off = 8;
  let width = 0;
  let height = 0;
  const idat: Uint8Array[] = [];
  while (off + 8 <= png.length) {
    const length = dv.getUint32(off);
    const type = String.fromCharCode(png[off + 4], png[off + 5], png[off + 6], png[off + 7]);
    const dataStart = off + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > png.length) throw new Error('decodePNG: truncated chunk');
    const crcExpect = dv.getUint32(dataEnd);
    const crcActual = pngCrc(png.subarray(off + 4, dataEnd));
    chunks.push({ type, length, crcOk: crcExpect === crcActual });
    if (type === 'IHDR') {
      width = dv.getUint32(dataStart);
      height = dv.getUint32(dataStart + 4);
      if (png[dataStart + 8] !== 8 || png[dataStart + 9] !== 6) {
        throw new Error('decodePNG: only 8-bit RGBA supported');
      }
    } else if (type === 'IDAT') {
      idat.push(png.subarray(dataStart, dataEnd));
    } else if (type === 'IEND') {
      break;
    }
    off = dataEnd + 4; // skip CRC
  }
  if (!width || !height) throw new Error('decodePNG: missing IHDR');
  let compressed = 0;
  for (const c of idat) compressed += c.length;
  const z = new Uint8Array(compressed);
  let zOff = 0;
  for (const c of idat) {
    z.set(c, zOff);
    zOff += c.length;
  }

  const raw = inflateRaw(z);
  const stride = width * 4;
  const out = new Uint8Array(width * height * 4);
  const prev = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    const filter = raw[rowStart];
    const row = out.subarray(y * stride, (y + 1) * stride);
    const src = raw.subarray(rowStart + 1, rowStart + 1 + stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? row[x - 4] : 0;
      const b = prev[x];
      const c = x >= 4 ? prev[x - 4] : 0;
      let v = src[x];
      switch (filter) {
        case 0: break;
        case 1: v = (v + a) & 0xff; break;
        case 2: v = (v + b) & 0xff; break;
        case 3: v = (v + ((a + b) >> 1)) & 0xff; break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
          v = (v + pr) & 0xff;
          break;
        }
        default: throw new Error(`decodePNG: bad filter ${filter}`);
      }
      row[x] = v;
    }
    prev.set(row);
  }
  return { width, height, data: out, chunks };
}

/** Inflate a zlib stream (header + adler) using DecompressionStream when present,
 * falling back to a pure-JS inflate for test environments. */
function inflateRaw(z: Uint8Array): Uint8Array {
  // Pure-JS inflate of the raw DEFLATE block; avoids async DOM APIs so the
  // decoder is deterministic everywhere.
  return inflateSyncJs(z);
}

function inflateSyncJs(z: Uint8Array): Uint8Array {
  let pos = 2; // skip CMF/FLG
  const out: number[] = [];
  const bits = { v: 0, n: 0 };
  const take = (count: number): number => {
    while (bits.n < count) {
      if (pos >= z.length - 4) {
        // May still have entropy; allow reading up to length-4 (before adler).
      }
      bits.v |= (z[pos++] ?? 0) << bits.n;
      bits.n += 8;
    }
    const val = bits.v & ((1 << count) - 1);
    bits.v >>>= count;
    bits.n -= count;
    return val;
  };
  // Length/distance tables (RFC 1951).
  const LEN_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
  const LEN_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
  const DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
  const DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];

  interface Huff { counts: number[]; symbols: number[] }
  const buildHuff = (lengths: number[]): Huff => {
    const maxLen = Math.max(...lengths);
    const counts = new Array(maxLen + 1).fill(0);
    for (const l of lengths) if (l) counts[l]++;
    const offs = new Array(maxLen + 1).fill(0);
    for (let i = 1; i <= maxLen; i++) offs[i] = offs[i - 1] + counts[i - 1];
    const symbols = new Array(lengths.filter((l) => l > 0).length).fill(0);
    for (let s = 0; s < lengths.length; s++) if (lengths[s]) symbols[offs[lengths[s]]++] = s;
    return { counts, symbols };
  };
  const decodeSym = (h: Huff): number => {
    let code = 0;
    let first = 0;
    let index = 0;
    for (let len = 1; len <= 15; len++) {
      code |= take(1);
      const count = h.counts[len];
      if (code - first < count) return h.symbols[index + (code - first)];
      index += count;
      first = (first + count) << 1;
      code <<= 1;
    }
    throw new Error('inflate: bad code');
  };

  // Note: the read position must stop before the 4-byte Adler-32 trailer.
  const end = z.length - 4;
  for (;;) {
    if (pos >= end && bits.n === 0) break;
    const final = take(1);
    const type = take(2);
    if (type === 0) {
      // Stored block: discard remaining bits, copy LEN bytes.
      bits.v = 0;
      bits.n = 0;
      const len = z[pos] | (z[pos + 1] << 8);
      pos += 4; // LEN + NLEN
      for (let i = 0; i < len; i++) out.push(z[pos++]);
    } else if (type === 1 || type === 2) {
      let litHuff: Huff;
      let distHuff: Huff;
      if (type === 1) {
        const litLens = new Array(288).fill(8);
        for (let i = 144; i < 256; i++) litLens[i] = 9;
        for (let i = 256; i < 280; i++) litLens[i] = 7;
        for (let i = 280; i < 288; i++) litLens[i] = 8;
        litHuff = buildHuff(litLens);
        distHuff = buildHuff(new Array(30).fill(5));
      } else {
        const hlit = take(5) + 257;
        const hdist = take(5) + 1;
        const hclen = take(4) + 4;
        const order = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
        const clLens = new Array(19).fill(0);
        for (let i = 0; i < hclen; i++) clLens[order[i]] = take(3);
        const clHuff = buildHuff(clLens);
        const lens: number[] = [];
        while (lens.length < hlit + hdist) {
          const sym = decodeSym(clHuff);
          if (sym < 16) lens.push(sym);
          else if (sym === 16) {
            const prev = lens[lens.length - 1];
            const rep = 3 + take(2);
            for (let i = 0; i < rep; i++) lens.push(prev);
          } else if (sym === 17) {
            const rep = 3 + take(3);
            for (let i = 0; i < rep; i++) lens.push(0);
          } else {
            const rep = 11 + take(7);
            for (let i = 0; i < rep; i++) lens.push(0);
          }
        }
        litHuff = buildHuff(lens.slice(0, hlit));
        distHuff = buildHuff(lens.slice(hlit));
      }
      for (;;) {
        const sym = decodeSym(litHuff);
        if (sym < 256) out.push(sym);
        else if (sym === 256) break;
        else {
          const li = sym - 257;
          const len = LEN_BASE[li] + (LEN_EXTRA[li] ? take(LEN_EXTRA[li]) : 0);
          const dsym = decodeSym(distHuff);
          const dist = DIST_BASE[dsym] + (DIST_EXTRA[dsym] ? take(DIST_EXTRA[dsym]) : 0);
          for (let i = 0; i < len; i++) out.push(out[out.length - dist]);
        }
      }
    } else throw new Error('inflate: bad block type');
    if (final) break;
  }
  return new Uint8Array(out);
}

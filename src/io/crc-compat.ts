/**
 * Shared byte-level helpers. fflate exports crc32 starting at v0.8.1; older
 * builds only expose it under fflate/crc32. We resolve whichever is present
 * and provide a pure-JS fallback so the codec never fails to load.
 */

import { deflateSync } from 'fflate';
import * as crc32Namespace from 'fflate';

type Crc32 = (data: Uint8Array, seed?: number) => number;

function resolveCrc32(): Crc32 {
  const anyNs = crc32Namespace as unknown as Record<string, unknown>;
  if (typeof anyNs.crc32 === 'function') return anyNs.crc32 as Crc32;
  // Fallback: reflect-based table (identical polynomial 0xEDB88320).
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return (data: Uint8Array) => {
    let c = 0xffffffff;
    for (let i = 0; i < data.length; i++) c = table[(c ^ data[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
}

export const crc32: Crc32 = resolveCrc32();
export { deflateSync };

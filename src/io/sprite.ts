/**
 * Sprite sheet packing: row-major tiles, optional transparency on empty
 * tail cells.
 */

export interface SpriteSheetResult {
  width: number;
  height: number;
  rgba: Uint8Array;
}

export function spriteSheet(
  frames: Uint8Array[],
  width: number,
  height: number,
  columns: number,
): SpriteSheetResult {
  if (!Array.isArray(frames) || frames.length === 0) throw new Error('spriteSheet: at least one frame is required');
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error(`spriteSheet: invalid frame size ${width}x${height}`);
  }
  if (!Number.isInteger(columns) || columns <= 0) throw new Error(`spriteSheet: invalid column count ${columns}`);

  const rows = Math.ceil(frames.length / columns);
  const sheetW = columns * width;
  const sheetH = rows * height;
  const stride = sheetW * 4;
  const out = new Uint8Array(sheetW * sheetH * 4); // zero-filled: transparent

  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    const expected = width * height * 4;
    if (!(frame instanceof Uint8Array) || frame.length !== expected) {
      throw new Error(`spriteSheet: frame ${i} must be ${expected} bytes of RGBA for ${width}x${height}`);
    }
    const col = i % columns;
    const row = Math.floor(i / columns);
    const ox = col * width;
    const oy = row * height;
    for (let y = 0; y < height; y++) {
      const src = frame.subarray(y * width * 4, (y + 1) * width * 4);
      out.set(src, (oy + y) * stride + ox * 4);
    }
  }
  return { width: sheetW, height: sheetH, rgba: out };
}

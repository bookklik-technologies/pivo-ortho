declare module 'gifenc' {
  export function GIFEncoder(): { writeFrame(index: Uint8Array, width: number, height: number, options: {palette?: number[][]; delay?: number; repeat?: number; transparent?: boolean; transparentIndex?: number; dispose?: number}): void; finish(): void; bytes(): Uint8Array };
  export function quantize(rgba: Uint8Array, maxColors: number, options?: Record<string, unknown>): number[][];
  export function applyPalette(rgba: Uint8Array, palette: number[][], format?: string): Uint8Array;
}

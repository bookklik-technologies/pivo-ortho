// UI unit tests for pure helpers in src/ui/geometry.ts.
// These run without WebGL and without core/IO (independent of concurrent agents).
import { describe, expect, it } from 'vitest';
import { polygonNormal, triangulatePolygon } from '../src/ui/geometry';

describe('ui polygonNormal', () => {
  it('computes +Z for an XY quad', () => {
    const n = polygonNormal([[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]]);
    expect(Math.abs(n[2])).toBeCloseTo(1, 5);
  });
  it('computes +Y for an XZ quad', () => {
    const n = polygonNormal([[0, 0, 0], [0, 0, 1], [1, 0, 1], [1, 0, 0]]);
    expect(Math.abs(n[1])).toBeCloseTo(1, 5);
  });
  it('falls back to +Z on degenerate input', () => {
    const n = polygonNormal([[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]]);
    expect(n).toEqual([0, 0, 1]);
  });
});

describe('ui triangulatePolygon', () => {
  it('triangulates a quad into 2 triangles', () => {
    const tris = triangulatePolygon([[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]]);
    expect(tris).toHaveLength(2);
  });
  it('handles a concave L-shape without overlap', () => {
    const L: [number, number, number][] = [[0, 0, 0], [2, 0, 0], [2, 1, 0], [1, 1, 0], [1, 2, 0], [0, 2, 0]];
    const tris = triangulatePolygon(L);
    expect(tris).toHaveLength(4);
    // all indices in range and every triangle non-degenerate in flat space
    for (const [a, b, c] of tris) {
      expect(a).toBeLessThan(6); expect(b).toBeLessThan(6); expect(c).toBeLessThan(6);
      expect(new Set([a, b, c]).size).toBe(3);
    }
  });
  it('returns empty for fewer than 3 points', () => {
    expect(triangulatePolygon([[0, 0, 0], [1, 1, 1]])).toEqual([]);
  });
  it('returns a single triangle unchanged', () => {
    expect(triangulatePolygon([[0, 0, 0], [1, 0, 0], [0, 1, 0]])).toEqual([[0, 1, 2]]);
  });
  it('triangulates a pentagon into 3 triangles', () => {
    const penta: [number, number, number][] = [[0, 0, 0], [2, 0, 0], [3, 1, 0], [1, 3, 0], [0, 1, 0]];
    expect(triangulatePolygon(penta)).toHaveLength(3);
  });
});

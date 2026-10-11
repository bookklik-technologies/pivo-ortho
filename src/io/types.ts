/**
 * Shared IO type definitions.
 *
 * The runtime scene types live in ../core/types.ts (a frozen contract file).
 * This module carries only the additional shapes the IO layer itself needs,
 * plus the vendor typings for fflate's zip entry (the vendored declaration
 * file at src/vendor.d.ts only covers gifenc).
 */

/** One entry set accepted by fflate's zipSync helper. */
export type FflateZipEntry = Record<string, Uint8Array>;

/** Descriptor of a mesh baked to world space, used by both OBJ and glTF export. */
export interface BakedMesh {
  id: string;
  /** Sanitized, unique name usable as OBJ object / glTF node name. */
  name: string;
  /** World-space positions, 3 floats per vertex. */
  positions: Float32Array;
  /** Smooth vertex normals (accumulated face normals), 3 floats per vertex. */
  normals: Float32Array;
  /** Normalized per-corner UV in [0,1], v flipped for image-bottom-left conventions. */
  uvs: Float32Array;
  /** Flat triangle list, indices into positions/uvs/normals (3 per triangle). */
  triangles: number[];
  /** Palette color of each source face (per corner's face), 0…15. */
  faceColors: number[];
  /** Per-face textured flag parallel to the corner sets emitted. */
  faceTextured: boolean[];
  /** Per-corner UV in original texture pixels (top-left origin). */
  cornerUVpx: number[][];
  /** Resolved material descriptor for this baked mesh. */
  materialName: string;
  doubleSided: boolean;
}

/** Result of one export: files ready for download plus non-fatal warnings. */
export type { ExportBundle, ExportFile } from '../core/types';

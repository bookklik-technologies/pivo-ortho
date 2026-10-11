/**
 * OBJ/MTL exporter. World-space geometry, per-corner UVs, corrected normals,
 * one MTL material per (mesh, face-color, textured) group, texture PNG packed
 * alongside. Hidden meshes/folders are skipped. Animation is intentionally
 * absent — the current pose is baked.
 */

import type { ExportBundle, Project } from '../core/types';
import { encodePNG } from './png';
import { textureRGBA } from '../core';
import { bakeScene, groupByMaterial, hexToRGB } from './scene-bake';
import { makeExportFile } from './bundle';

function f(n: number): string {
  if (!Number.isFinite(n)) throw new Error('exportOBJ: nonfinite coordinate');
  // Trim trailing zeros but keep at least one decimal — OBJ readers accept this.
  const s = n.toFixed(6).replace(/\.?0+$/, '');
  return s === '' || s === '-' ? '0' : s;
}

export function exportOBJ(project: Project, time = 0): ExportBundle {
  if (!project || project.format !== 'pivo-ortho') throw new Error('exportOBJ: not a pivo-ortho project');
  const scene = bakeScene(project, time);
  const groups = groupByMaterial(scene);

  // Unique sanitized object/material names.
  const usedNames = new Set<string>();
  const unique = (base: string, kind: string): string => {
    let clean = base.replace(/[^A-Za-z0-9_\-]/g, '_') || kind;
    let candidate = clean;
    let i = 1;
    while (usedNames.has(candidate)) candidate = `${clean}_${i++}`;
    usedNames.add(candidate);
    return candidate;
  };

  const objLines: string[] = [
    '# Exported by PiVo Ortho (original implementation)',
    `# Time: ${time}s`,
    'mtllib model.mtl',
  ];
  const mtlLines: string[] = ['# PiVo Ortho material library'];
  const materials: Array<{ name: string; color: number; textured: boolean }> = [];
  const textureName = 'texture.png';

  let vIndex = 1;
  let vtIndex = 1;
  let vnIndex = 1;

  for (const group of groups) {
    const matName = unique(`mat_${group.meshName}_${group.textured ? 'tex' : 'c' + group.color}`, 'mat');
    materials.push({ name: matName, color: group.color, textured: group.textured });
    const rgb = group.textured ? [255,255,255] : hexToRGB(project.texture.palette[group.color] ?? '#888888');
    mtlLines.push(
      `newmtl ${matName}`,
      `Kd ${f(rgb[0] / 255)} ${f(rgb[1] / 255)} ${f(rgb[2] / 255)}`,
      `Ka 0 0 0`,
      `Ks 0 0 0`,
      `d 1`,
      `illum 1`,
    );
    if (group.textured) mtlLines.push(`map_Kd ${textureName}`);

    objLines.push(`o ${group.meshName}`);
    objLines.push(`usemtl ${matName}`);
    const triangleIndices: number[] = [];
    for (const tri of group.triangles) {
      const triV: number[] = [];
      const triVT: number[] = [];
      const triVN: number[] = [];
      // One vt per source-face corner per triangle: the face's full corner UV
      // set is re-emitted for each triangle so the vt block mirrors the face
      // corner structure (quads contribute 4 vt per triangle). The f lines
      // reference the triangle's own 3 corners among them.
      const cornerCount = tri.faceUvs.length;
      const faceVtStart = vtIndex;
      const vtIdxForCorner: number[] = [];
      for (let c = 0; c < cornerCount; c++) {
        const uv = tri.faceUvs[c];
        objLines.push(`vt ${f(uv[0])} ${f(uv[1])}`);
        vtIdxForCorner.push(vtIndex++);
      }
      for (let c = 0; c < 3; c++) {
        const p = tri.positions[c];
        objLines.push(`v ${f(p[0])} ${f(p[1])} ${f(p[2])}`);
        triV.push(vIndex++);
        const uv = tri.uvs[c];
        // find this corner's index within the face corner list (by uv value)
        let found = 0;
        for (let k = 0; k < cornerCount; k++) {
          if (tri.faceUvs[k][0] === uv[0] && tri.faceUvs[k][1] === uv[1]) { found = k; break; }
        }
        triVT.push(vtIdxForCorner[found]);
        objLines.push(`vn ${f(tri.normal[0])} ${f(tri.normal[1])} ${f(tri.normal[2])}`);
        triVN.push(vnIndex++);
      }
      triangleIndices.push(...triV, ...triVT, ...triVN);
    }
    // Emit faces referencing absolute indices.
    for (let t = 0; t < triangleIndices.length; t += 9) {
      const faceStr = [0, 1, 2]
        .map((c) => {
          const v = triangleIndices[t + c];
          const vt = triangleIndices[t + 3 + c];
          const vn = triangleIndices[t + 6 + c];
          return `${v}/${vt}/${vn}`;
        })
        .join(' ');
      objLines.push(`f ${faceStr}`);
    }
  }

  if (scene.triangles.length === 0) {
    throw new Error('exportOBJ: no visible geometry to export');
  }

  const texture = project.texture;
  const rgba = textureRGBA(texture);
  const pngBytes = encodePNG(texture.width, texture.height, rgba);

  const files = [
    makeExportFile('model.obj', objLines.join('\n') + '\n', 'text/plain'),
    makeExportFile('model.mtl', mtlLines.join('\n') + '\n', 'text/plain'),
    makeExportFile(textureName, pngBytes, 'image/png'),
  ];
  return { files, warnings: [...scene.warnings] };
}

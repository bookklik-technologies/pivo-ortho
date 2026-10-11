// PiVo Ortho — pure geometry helpers (no imports; unit-testable).
export type P3 = [number, number, number];

export function polygonNormal(pts: P3[]): P3 {
  let nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    nx += (a[1] - b[1]) * (a[2] + b[2]);
    ny += (a[2] - b[2]) * (a[0] + b[0]);
    nz += (a[0] - b[0]) * (a[1] + b[1]);
  }
  const len = Math.hypot(nx, ny, nz);
  if (len < 1e-9) return [0, 0, 1];
  return [nx / len, ny / len, nz / len];
}

/** Ear-clip triangulation. Returns triples of corner indices. */
export function triangulatePolygon(pts: P3[]): Array<[number, number, number]> {
  const n = pts.length;
  if (n < 3) return [];
  if (n === 3) return [[0, 1, 2]];
  const nrm = polygonNormal(pts);
  const ax = Math.abs(nrm[0]), ay = Math.abs(nrm[1]), az = Math.abs(nrm[2]);
  let i0 = 0, i1 = 1;
  if (ax >= ay && ax >= az) { i0 = 1; i1 = 2; }
  else if (ay >= ax && ay >= az) { i0 = 0; i1 = 2; }
  else { i0 = 0; i1 = 1; }
  const flat = pts.map((p) => ({ x: p[i0], y: p[i1] }));
  let area = 0;
  for (let i = 0; i < n; i++) {
    const a = flat[i], b = flat[(i + 1) % n];
    area += a.x * b.y - b.x * a.y;
  }
  if (area < 0) flat.reverse();
  const idx: number[] = flat.map((_, i) => i);
  const out: Array<[number, number, number]> = [];
  let guard = 0;
  while (idx.length > 3 && guard++ < 2000) {
    let clipped = false;
    for (let i = 0; i < idx.length; i++) {
      const prev = idx[(i + idx.length - 1) % idx.length];
      const cur = idx[i];
      const next = idx[(i + 1) % idx.length];
      const a = flat[prev], b = flat[cur], c = flat[next];
      const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
      if (cross <= 1e-9) continue;
      let contains = false;
      for (const j of idx) {
        if (j === prev || j === cur || j === next) continue;
        const p = flat[j];
        const d1 = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
        const d2 = (c.x - b.x) * (p.y - b.y) - (c.y - b.y) * (p.x - b.x);
        const d3 = (a.x - c.x) * (p.y - c.y) - (a.y - c.y) * (p.x - c.x);
        if (d1 >= -1e-9 && d2 >= -1e-9 && d3 >= -1e-9) { contains = true; break; }
      }
      if (contains) continue;
      out.push([prev, cur, next]);
      idx.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) break;
  }
  if (idx.length === 3) out.push([idx[0], idx[1], idx[2]]);
  return out;
}

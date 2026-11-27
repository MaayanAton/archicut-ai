// Terrain engine. The ground level at any point comes from, in order:
//   1. a designed level area ("terrace", flat at a level the user typed) if the point is inside one;
//   2. a triangulated surface (TIN, linear on each triangle) through the height points the user entered,
//      plus the four corners of the site at the base level (labelled as such, never hidden);
//   3. designed hills and depressions added on top.
// Nothing is invented: with no height points the ground is flat at the base level, and every sample
// reports where its value came from (measured, typed, interpolated, base level, designed).

import { type Vec2, v2 } from '../geometry/vec';
import { type Box, emptyBox, addPt, boxValid } from '../drawing/viewport';
import type { HeightSource, Mound, SiteData, SiteElement } from './types';
import { pointInPoly, segCross } from './poly';
import { elementOutline } from './outline';

export type ZSource = HeightSource | 'interpolated' | 'base' | 'terrace' | 'design';

export const ZSOURCE_LABELS: Record<ZSource, string> = {
  survey: 'נתון מדידה',
  manual: 'הוזן ידנית',
  interpolated: 'מחושב (אינטרפולציה בין נקודות גובה)',
  base: 'מפלס בסיס (ברירת מחדל, אין נתון)',
  terrace: 'מפלס מתוכנן (משטח במפלס קבוע)',
  design: 'מתוכנן (גבעה או שקע)',
};

interface TVert { p: Vec2; z: number; src: HeightSource | 'base'; id?: string }
interface Pad { id: string; pts: Vec2[]; z: number }

export interface TerrainModel {
  base: number;
  domain: Box;
  verts: TVert[];
  tris: [number, number, number][];
  mounds: Mound[];
  pads: Pad[];
  z(p: Vec2): number;
  sample(p: Vec2): { z: number; src: ZSource };
  /** Triangle edges, for exact breakpoints in section profiles. */
  edges: [Vec2, Vec2][];
}

/** Bowyer-Watson Delaunay triangulation. Returns index triples (counter-clockwise). */
export function delaunay(pts: Vec2[]): [number, number, number][] {
  const n = pts.length;
  if (n < 3) return [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }
  const dm = Math.max(maxX - minX, maxY - minY, 1) * 20;
  const mx = (minX + maxX) / 2, my = (minY + maxY) / 2;
  const P = [...pts, v2(mx - dm, my - dm), v2(mx + dm, my - dm), v2(mx, my + dm)];
  type T = { a: number; b: number; c: number; cx: number; cy: number; r2: number };
  const circ = (a: number, b: number, c: number): T => {
    const A = P[a], B = P[b], C = P[c];
    const d = 2 * (A.x * (B.y - C.y) + B.x * (C.y - A.y) + C.x * (A.y - B.y));
    if (Math.abs(d) < 1e-12) return { a, b, c, cx: 0, cy: 0, r2: Infinity };
    const a2 = A.x * A.x + A.y * A.y, b2 = B.x * B.x + B.y * B.y, c2 = C.x * C.x + C.y * C.y;
    const cx = (a2 * (B.y - C.y) + b2 * (C.y - A.y) + c2 * (A.y - B.y)) / d;
    const cy = (a2 * (C.x - B.x) + b2 * (A.x - C.x) + c2 * (B.x - A.x)) / d;
    return { a, b, c, cx, cy, r2: (A.x - cx) ** 2 + (A.y - cy) ** 2 };
  };
  let tris: T[] = [circ(n, n + 1, n + 2)];
  for (let i = 0; i < n; i++) {
    const p = P[i];
    const bad: T[] = [], keep: T[] = [];
    for (const t of tris) ((p.x - t.cx) ** 2 + (p.y - t.cy) ** 2 < t.r2 * (1 + 1e-12) ? bad : keep).push(t);
    const edgeCount = new Map<string, [number, number]>();
    const count = new Map<string, number>();
    for (const t of bad) for (const [u, w] of [[t.a, t.b], [t.b, t.c], [t.c, t.a]] as [number, number][]) {
      const k = u < w ? `${u},${w}` : `${w},${u}`;
      count.set(k, (count.get(k) ?? 0) + 1);
      edgeCount.set(k, [u, w]);
    }
    tris = keep;
    for (const [k, [u, w]] of edgeCount) if (count.get(k) === 1) tris.push(circ(u, w, i));
  }
  const out: [number, number, number][] = [];
  for (const t of tris) {
    if (t.a >= n || t.b >= n || t.c >= n) continue;
    const A = P[t.a], B = P[t.b], C = P[t.c];
    const s = (B.x - A.x) * (C.y - A.y) - (B.y - A.y) * (C.x - A.x);
    if (Math.abs(s) < 1e-9) continue;
    out.push(s > 0 ? [t.a, t.b, t.c] : [t.a, t.c, t.b]);
  }
  return out;
}

export const isLot = (e: SiteElement) => e.kind === 'lot';

/** Extent of the site: the lots if there are any, otherwise everything. */
export function siteDomain(d: SiteData): Box {
  let b = emptyBox();
  const lots = d.elements.filter(isLot);
  const src = lots.length ? lots : d.elements;
  for (const e of src) for (const p of elementOutline(e)) b = addPt(b, p);
  if (!lots.length) for (const hp of d.terrain.points) b = addPt(b, hp.p);
  if (!boxValid(b) || b.maxX - b.minX < 1 || b.maxY - b.minY < 1) b = { minX: 0, minY: 0, maxX: 20000, maxY: 20000 };
  return b;
}

const moundAt = (m: Mound, p: Vec2) => {
  const d = Math.hypot(p.x - m.c.x, p.y - m.c.y);
  return d >= m.r ? 0 : (m.h * (Math.cos((Math.PI * d) / m.r) + 1)) / 2;
};

export function buildTerrain(d: SiteData): TerrainModel {
  const t = d.terrain;
  const domain = siteDomain(d);
  const verts: TVert[] = t.points.map((hp) => ({ p: hp.p, z: hp.z, src: hp.source, id: hp.id }));
  const corners = [v2(domain.minX, domain.minY), v2(domain.maxX, domain.minY), v2(domain.maxX, domain.maxY), v2(domain.minX, domain.maxY)];
  const near = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y) < 1;
  if (verts.length) for (const c of corners) if (!verts.some((v) => near(v.p, c))) verts.push({ p: c, z: t.base, src: 'base' });
  // Remove duplicates (two points at the same place would break the triangulation): the first one wins.
  const uniq: TVert[] = [];
  for (const v of verts) if (!uniq.some((u) => near(u.p, v.p))) uniq.push(v);
  const tris = uniq.length >= 3 ? delaunay(uniq.map((v) => v.p)) : [];

  const pads: Pad[] = d.elements
    .filter((e) => e.kind === 'terrace' && e.geom.type === 'area' && e.geom.pts.length >= 3 && d.layers.find((l) => l.id === e.layer)?.visible !== false)
    .map((e) => ({ id: e.id, pts: elementOutline(e), z: e.params.level ?? t.base }));
  const mounds = t.mounds.filter((m) => m.r > 0);

  // Bucket grid over the triangles for fast lookup.
  const G = 24;
  let tb = emptyBox();
  for (const v of uniq) tb = addPt(tb, v.p);
  const buckets: number[][] = Array.from({ length: G * G }, () => []);
  const cell = (x: number, y: number) => {
    const i = Math.min(G - 1, Math.max(0, Math.floor(((x - tb.minX) / Math.max(tb.maxX - tb.minX, 1)) * G)));
    const j = Math.min(G - 1, Math.max(0, Math.floor(((y - tb.minY) / Math.max(tb.maxY - tb.minY, 1)) * G)));
    return [i, j];
  };
  tris.forEach((tr, ti) => {
    const ps = tr.map((k) => uniq[k].p);
    const [i0, j0] = cell(Math.min(...ps.map((p) => p.x)), Math.min(...ps.map((p) => p.y)));
    const [i1, j1] = cell(Math.max(...ps.map((p) => p.x)), Math.max(...ps.map((p) => p.y)));
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) buckets[j * G + i].push(ti);
  });

  const tinSample = (p: Vec2): { z: number; src: ZSource } => {
    if (!tris.length) {
      // One or two points cannot define a surface. The ground stays at the base level except at the points themselves.
      for (const v of uniq) if (near(v.p, p)) return { z: v.z, src: v.src };
      return { z: t.base, src: 'base' };
    }
    if (p.x < tb.minX - 1e-6 || p.x > tb.maxX + 1e-6 || p.y < tb.minY - 1e-6 || p.y > tb.maxY + 1e-6) return { z: t.base, src: 'base' };
    const [i, j] = cell(p.x, p.y);
    for (const ti of buckets[j * G + i]) {
      const [a, b, c] = tris[ti];
      const A = uniq[a], B = uniq[b], C = uniq[c];
      const det = (B.p.y - C.p.y) * (A.p.x - C.p.x) + (C.p.x - B.p.x) * (A.p.y - C.p.y);
      const l1 = ((B.p.y - C.p.y) * (p.x - C.p.x) + (C.p.x - B.p.x) * (p.y - C.p.y)) / det;
      const l2 = ((C.p.y - A.p.y) * (p.x - C.p.x) + (A.p.x - C.p.x) * (p.y - C.p.y)) / det;
      const l3 = 1 - l1 - l2;
      const e = -1e-9;
      if (l1 >= e && l2 >= e && l3 >= e) {
        const z = l1 * A.z + l2 * B.z + l3 * C.z;
        for (const v of [A, B, C]) if (near(v.p, p)) return { z: v.z, src: v.src };
        const src: ZSource = A.src === 'base' && B.src === 'base' && C.src === 'base' ? 'base' : 'interpolated';
        return { z, src };
      }
    }
    return { z: t.base, src: 'base' };
  };

  const sample = (p: Vec2): { z: number; src: ZSource } => {
    for (let i = pads.length - 1; i >= 0; i--) if (pointInPoly(p, pads[i].pts)) return { z: pads[i].z, src: 'terrace' };
    const s = tinSample(p);
    let dz = 0;
    for (const m of mounds) dz += moundAt(m, p);
    return dz !== 0 ? { z: s.z + dz, src: 'design' } : s;
  };

  const edges: [Vec2, Vec2][] = [];
  const seen = new Set<string>();
  for (const tr of tris) for (const [u, w] of [[tr[0], tr[1]], [tr[1], tr[2]], [tr[2], tr[0]]]) {
    const k = u < w ? `${u},${w}` : `${w},${u}`;
    if (!seen.has(k)) { seen.add(k); edges.push([uniq[u].p, uniq[w].p]); }
  }

  return { base: t.base, domain, verts: uniq, tris, mounds, pads, z: (p) => sample(p).z, sample, edges };
}

/** Slope between two points on the terrain: rise / horizontal run (0.05 = 5%). */
export function slopeBetween(m: TerrainModel, a: Vec2, b: Vec2) {
  const za = m.z(a), zb = m.z(b);
  const run = Math.hypot(b.x - a.x, b.y - a.y);
  return { za, zb, dz: zb - za, run, ratio: run > 0 ? (zb - za) / run : NaN };
}

export interface Contour { level: number; lines: Vec2[][] }

/**
 * Contour lines by marching squares on a regular grid. These are computed lines (an interpolation of the
 * terrain model) and the UI labels them as such.
 */
export function contours(m: TerrainModel, step: number, maxCells = 180): Contour[] {
  if (!(step > 0)) return [];
  const b = m.domain;
  const W = b.maxX - b.minX, H = b.maxY - b.minY;
  const h = Math.max(W, H) / maxCells;
  const nx = Math.max(2, Math.ceil(W / h)), ny = Math.max(2, Math.ceil(H / h));
  const dx = W / nx, dy = H / ny;
  const z: number[] = new Array((nx + 1) * (ny + 1));
  let zmin = Infinity, zmax = -Infinity;
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
    const v = m.z(v2(b.minX + i * dx, b.minY + j * dy));
    z[j * (nx + 1) + i] = v;
    zmin = Math.min(zmin, v); zmax = Math.max(zmax, v);
  }
  if (zmax - zmin < 1e-6) return [];
  const out: Contour[] = [];
  const first = Math.ceil(zmin / step) * step;
  for (let lv = first, guard = 0; lv <= zmax + 1e-9 && guard < 400; lv += step, guard++) {
    const L = Math.abs(lv) < 1e-9 ? 0 : lv;
    const segs: [Vec2, Vec2][] = [];
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const x0 = b.minX + i * dx, y0 = b.minY + j * dy;
      const c = [z[j * (nx + 1) + i], z[j * (nx + 1) + i + 1], z[(j + 1) * (nx + 1) + i + 1], z[(j + 1) * (nx + 1) + i]];
      const P = [v2(x0, y0), v2(x0 + dx, y0), v2(x0 + dx, y0 + dy), v2(x0, y0 + dy)];
      const cuts: Vec2[] = [];
      for (let k = 0; k < 4; k++) {
        const za = c[k], zb = c[(k + 1) % 4];
        if ((za < L) !== (zb < L)) {
          const tt = (L - za) / (zb - za);
          cuts.push(v2(P[k].x + (P[(k + 1) % 4].x - P[k].x) * tt, P[k].y + (P[(k + 1) % 4].y - P[k].y) * tt));
        }
      }
      if (cuts.length === 2) segs.push([cuts[0], cuts[1]]);
      else if (cuts.length === 4) {
        const centre = (c[0] + c[1] + c[2] + c[3]) / 4;
        if ((centre < L) === (c[0] < L)) { segs.push([cuts[0], cuts[3]]); segs.push([cuts[1], cuts[2]]); }
        else { segs.push([cuts[0], cuts[1]]); segs.push([cuts[2], cuts[3]]); }
      }
    }
    out.push({ level: L, lines: joinSegments(segs) });
  }
  return out;
}

function joinSegments(segs: [Vec2, Vec2][]): Vec2[][] {
  const key = (p: Vec2) => `${Math.round(p.x * 10)},${Math.round(p.y * 10)}`;
  const ends = new Map<string, number[]>();
  segs.forEach(([a, b], i) => { for (const p of [a, b]) { const k = key(p); if (!ends.has(k)) ends.set(k, []); ends.get(k)!.push(i); } });
  const used = new Uint8Array(segs.length);
  const lines: Vec2[][] = [];
  for (let s = 0; s < segs.length; s++) {
    if (used[s]) continue;
    used[s] = 1;
    const line = [segs[s][0], segs[s][1]];
    for (const dir of [1, -1]) {
      for (let guard = 0; guard < segs.length; guard++) {
        const tip = dir === 1 ? line[line.length - 1] : line[0];
        const next = (ends.get(key(tip)) ?? []).find((i) => !used[i]);
        if (next === undefined) break;
        used[next] = 1;
        const [a, b] = segs[next];
        const other = key(a) === key(tip) ? b : a;
        if (dir === 1) line.push(other); else line.unshift(other);
      }
    }
    lines.push(line);
  }
  return lines;
}

/** Points where the segment a→b crosses the triangle edges and the terrace outlines (exact breakpoints). */
export function terrainBreaks(m: TerrainModel, a: Vec2, b: Vec2): { t: number; step: boolean }[] {
  const out: { t: number; step: boolean }[] = [];
  for (const [p, q] of m.edges) { const t = segCross(a, b, p, q); if (t !== null) out.push({ t, step: false }); }
  for (const pad of m.pads) for (let i = 0; i < pad.pts.length; i++) {
    const t = segCross(a, b, pad.pts[i], pad.pts[(i + 1) % pad.pts.length]);
    if (t !== null) out.push({ t, step: true });
  }
  return out;
}

/**
 * Lowest and highest ground level on the site. The TIN is linear between its points, so its extremes are at the points;
 * hills peak at their centres and level areas are flat. A coarse grid covers the overlaps between them.
 */
export function terrainRange(m: TerrainModel): { lo: number; hi: number } {
  const b = m.domain;
  const cand: Vec2[] = [...m.verts.map((v) => v.p), ...m.mounds.map((x) => x.c)];
  for (const pad of m.pads) cand.push(...pad.pts);
  for (let i = 0; i <= 30; i++) for (let j = 0; j <= 30; j++) cand.push({ x: b.minX + ((b.maxX - b.minX) * i) / 30, y: b.minY + ((b.maxY - b.minY) * j) / 30 });
  let lo = Infinity, hi = -Infinity;
  const inside = (p: Vec2) => p.x >= b.minX - 1e-6 && p.x <= b.maxX + 1e-6 && p.y >= b.minY - 1e-6 && p.y <= b.maxY + 1e-6;
  for (const p of cand) if (inside(p)) { const z = m.z(p); if (z < lo) lo = z; if (z > hi) hi = z; }
  for (const pad of m.pads) { lo = Math.min(lo, pad.z); hi = Math.max(hi, pad.z); }
  return { lo, hi };
}

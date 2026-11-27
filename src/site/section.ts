// Section and elevation engine for a whole site.
//
// A section is a vertical plane through the plan line a→b. The engine computes, from the real solids:
//   - the ground profile along the line (exact for the triangulated terrain and the level areas,
//     sampled for designed hills);
//   - every solid the plane cuts, as its exact cut shape (polygons, chords of cylinders, ellipses of
//     tree crowns, cone profiles);
//   - every solid seen beyond the plane, up to the chosen depth, as its silhouette projected on the plane.
// Section coordinates: s = horizontal distance along the drawing (to the viewer's right), z = level. mm.

import { type Vec2, v2 } from '../geometry/vec';
import type { SiteData, SiteElement, SiteSection } from './types';
import { buildTerrain, terrainBreaks, type TerrainModel, type ZSource } from './terrain';
import { elementSolids, linAt, primTop, visibleElements, type ElementSolids, type Prim, type Role } from './prims';
import { clipHalfPlane, convexHull, dot, lerp, norm, perpL, segmentInsideIntervals, sub, mul } from './poly';
import { lib } from './library';

export interface SecPt { s: number; z: number }
export interface SecEllipse { cs: number; cz: number; rs: number; rz: number }
export interface SecShape { id: string; kind: string; role: Role; color: string; poly?: SecPt[]; ell?: SecEllipse; depth: number }
export interface SecSurface { id: string; kind: string; color: string; top: SecPt[]; thick: number }

export interface SectionResult {
  L: number;
  ground: SecPt[];
  /** Where the ground levels came from, for the legend under the drawing. */
  sources: ZSource[];
  surfaces: SecSurface[];
  cut: SecShape[];
  beyond: SecShape[];
  levels: { s: number; z: number; ground: boolean }[];
  vdims: { s: number; z0: number; z1: number }[];
  zMin: number;
  zMax: number;
  cutIds: string[];
  beyondIds: string[];
}

export interface SiteModel {
  terrain: TerrainModel;
  items: { e: SiteElement; s: ElementSolids }[];
}

export function buildSiteModel(d: SiteData): SiteModel {
  const terrain = buildTerrain(d);
  return { terrain, items: visibleElements(d).map((e) => ({ e, s: elementSolids(e, terrain) })) };
}

interface Frame { a: Vec2; b: Vec2; L: number; u: Vec2; n: Vec2; side: 1 | -1 }

const frameOf = (sec: SiteSection): Frame => {
  const L = Math.hypot(sec.b.x - sec.a.x, sec.b.y - sec.a.y);
  const u = norm(sub(sec.b, sec.a));
  return { a: sec.a, b: sec.b, L, u, n: mul(perpL(u), sec.side), side: sec.side };
};

/** s (to the viewer's right) and d (distance beyond the plane) of a plan point. */
const sOf = (f: Frame, p: Vec2) => { const along = dot(sub(p, f.a), f.u); return f.side === 1 ? along : f.L - along; };
const dOf = (f: Frame, p: Vec2) => dot(sub(p, f.a), f.n);
const sAtT = (f: Frame, t: number) => (f.side === 1 ? t * f.L : (1 - t) * f.L);

function groundProfile(f: Frame, m: TerrainModel, mode: SiteSection['mode'], depth: number): { pts: SecPt[]; sources: Set<ZSource> } {
  const sources = new Set<ZSource>();
  const ts: number[] = [];
  const N = Math.min(800, Math.max(60, Math.ceil(f.L / 200)));
  for (let i = 0; i <= N; i++) ts.push(i / N);
  if (mode === 'section') {
    const eps = 1e-6 / Math.max(f.L / 1000, 1);
    for (const br of terrainBreaks(m, f.a, f.b)) {
      if (br.step) ts.push(Math.max(0, br.t - eps), Math.min(1, br.t + eps));
      else ts.push(br.t);
    }
  }
  ts.sort((x, y) => x - y);
  const pts: SecPt[] = [];
  for (const t of ts) {
    const P = lerp(f.a, f.b, t);
    let z: number;
    if (mode === 'section') {
      const smp = m.sample(P);
      z = smp.z;
      sources.add(smp.src);
    } else {
      // Elevation: the outline of the ground seen from the line, the highest ground across the depth.
      z = -Infinity;
      for (let k = 0; k <= 24; k++) {
        const smp = m.sample(v2(P.x + f.n.x * (depth * k) / 24, P.y + f.n.y * (depth * k) / 24));
        if (smp.z > z) z = smp.z;
        sources.add(smp.src);
      }
    }
    pts.push({ s: sAtT(f, t), z });
  }
  pts.sort((p, q) => p.s - q.s);
  return { pts, sources };
}

const groundAtS = (g: SecPt[], s: number) => {
  if (!g.length) return 0;
  if (s <= g[0].s) return g[0].z;
  for (let i = 1; i < g.length; i++) if (g[i].s >= s) {
    const a = g[i - 1], b = g[i];
    return b.s - a.s < 1e-12 ? b.z : a.z + ((b.z - a.z) * (s - a.s)) / (b.s - a.s);
  }
  return g[g.length - 1].z;
};

function cutPrim(f: Frame, pr: Prim, kind: string): SecShape[] {
  const out: SecShape[] = [];
  const base = { id: pr.id, kind, role: pr.role, color: pr.color, depth: 0 };
  if (pr.t === 'prism') {
    for (const [t0, t1] of segmentInsideIntervals(f.a, f.b, pr.poly)) {
      const P0 = lerp(f.a, f.b, t0), P1 = lerp(f.a, f.b, t1);
      const s0 = sAtT(f, t0), s1 = sAtT(f, t1);
      out.push({ ...base, poly: [{ s: s0, z: linAt(pr.z0, P0) }, { s: s1, z: linAt(pr.z0, P1) }, { s: s1, z: linAt(pr.z1, P1) }, { s: s0, z: linAt(pr.z1, P0) }] });
    }
    return out;
  }
  const dc = dOf(f, pr.c), sc = sOf(f, pr.c);
  // The centre's position along the line, to stay within the drawn length of the section line.
  const along = dot(sub(pr.c, f.a), f.u);
  if (Math.abs(dc) >= pr.r || along < -pr.r || along > f.L + pr.r) return out;
  const w = Math.sqrt(pr.r * pr.r - dc * dc);
  if (pr.t === 'cyl') out.push({ ...base, poly: [{ s: sc - w, z: pr.z0 }, { s: sc + w, z: pr.z0 }, { s: sc + w, z: pr.z1 }, { s: sc - w, z: pr.z1 }] });
  else if (pr.t === 'ell') { const k = w / pr.r; out.push({ ...base, ell: { cs: sc, cz: pr.zc, rs: w, rz: pr.rz * k } }); }
  else {
    const H = pr.z1 - pr.z0;
    const pts: SecPt[] = [];
    const n = 24;
    for (let i = 0; i <= n; i++) {
      const tt = -w + (2 * w * i) / n;
      pts.push({ s: sc + tt, z: pr.z0 + H * (1 - Math.sqrt(tt * tt + dc * dc) / pr.r) });
    }
    out.push({ ...base, poly: [{ s: sc - w, z: pr.z0 }, ...pts, { s: sc + w, z: pr.z0 }] });
  }
  return out;
}

function beyondPrim(f: Frame, pr: Prim, kind: string, depth: number): SecShape | null {
  const base = { id: pr.id, kind, role: pr.role, color: pr.color };
  if (pr.t === 'prism') {
    let poly = clipHalfPlane(pr.poly, f.a, f.n);
    poly = clipHalfPlane(poly, v2(f.a.x + f.n.x * depth, f.a.y + f.n.y * depth), mul(f.n, -1));
    if (poly.length < 3) return null;
    const pts: Vec2[] = [];
    for (const q of poly) { const s = sOf(f, q); pts.push(v2(s, linAt(pr.z0, q)), v2(s, linAt(pr.z1, q))); }
    const hull = convexHull(pts);
    if (hull.length < 3) return null;
    return { ...base, depth: Math.min(...poly.map((q) => dOf(f, q))), poly: hull.map((q) => ({ s: q.x, z: q.y })) };
  }
  const dc = dOf(f, pr.c);
  if (dc + pr.r <= 0 || dc - pr.r > depth) return null;
  const sc = sOf(f, pr.c), r = pr.r;
  const dep = Math.max(0, dc - r);
  if (pr.t === 'cyl') return { ...base, depth: dep, poly: [{ s: sc - r, z: pr.z0 }, { s: sc + r, z: pr.z0 }, { s: sc + r, z: pr.z1 }, { s: sc - r, z: pr.z1 }] };
  if (pr.t === 'ell') return { ...base, depth: dep, ell: { cs: sc, cz: pr.zc, rs: r, rz: pr.rz } };
  return { ...base, depth: dep, poly: [{ s: sc - r, z: pr.z0 }, { s: sc + r, z: pr.z0 }, { s: sc, z: pr.z1 }] };
}

const LEVEL_KINDS = new Set(['building', 'wall', 'deck', 'pergola', 'shed', 'stairs', 'bed', 'ramp', 'play']);
const DIM_KINDS = new Set(['building', 'wall', 'pergola', 'shed', 'tree-round', 'tree-conifer', 'tree-columnar', 'palm', 'play', 'lamp', 'fence']);

export function computeSection(model: SiteModel, sec: SiteSection): SectionResult | null {
  const f = frameOf(sec);
  if (f.L < 1) return null;
  const depth = Math.max(0, sec.depth);
  const { pts: ground, sources } = groundProfile(f, model.terrain, sec.mode, depth);
  const cut: SecShape[] = [], beyond: SecShape[] = [], surfaces: SecSurface[] = [];
  const levels: SectionResult['levels'] = [];
  const vdims: SectionResult['vdims'] = [];
  const cutIds = new Set<string>(), beyondIds = new Set<string>();

  for (const { e, s } of model.items) {
    const kind = e.kind;
    for (const pr of s.prims) {
      if (sec.mode === 'section') {
        const c = cutPrim(f, pr, kind);
        if (c.length) { cut.push(...c); cutIds.add(e.id); }
      }
      const b = beyondPrim(f, pr, kind, depth);
      // Clip away silhouettes completely outside the drawing's length.
      if (b && (b.poly ? b.poly.some((q) => q.s >= -1 && q.s <= f.L + 1) : b.ell!.cs + b.ell!.rs >= 0 && b.ell!.cs - b.ell!.rs <= f.L)) { beyond.push(b); beyondIds.add(e.id); }
    }
    if (sec.mode === 'section') for (const sf of s.surfaces) {
      for (const [t0, t1] of segmentInsideIntervals(f.a, f.b, sf.poly)) {
        const s0 = Math.min(sAtT(f, t0), sAtT(f, t1)), s1 = Math.max(sAtT(f, t0), sAtT(f, t1));
        const top = [{ s: s0, z: groundAtS(ground, s0) }, ...ground.filter((g) => g.s > s0 && g.s < s1), { s: s1, z: groundAtS(ground, s1) }];
        surfaces.push({ id: e.id, kind, color: sf.color, top, thick: sf.thick });
        cutIds.add(e.id);
      }
    }
  }

  // Level marks and heights of the cut elements.
  if (sec.mode === 'section') {
    const byEl = new Map<string, SecShape[]>();
    for (const c of cut) { if (!byEl.has(c.id)) byEl.set(c.id, []); byEl.get(c.id)!.push(c); }
    for (const [id, shapes] of byEl) {
      const it = model.items.find((x) => x.e.id === id)!;
      const kind = it.e.kind;
      const ss = shapes.flatMap((c) => (c.poly ? c.poly.map((q) => q.s) : [c.ell!.cs - c.ell!.rs, c.ell!.cs + c.ell!.rs]));
      const zs = shapes.flatMap((c) => (c.poly ? c.poly.map((q) => q.z) : [c.ell!.cz + c.ell!.rz]));
      const sMid = (Math.min(...ss) + Math.max(...ss)) / 2, top = Math.max(...zs);
      if (LEVEL_KINDS.has(kind)) levels.push({ s: Math.max(...ss), z: top, ground: false });
      if (DIM_KINDS.has(kind)) vdims.push({ s: Math.max(...ss), z0: groundAtS(ground, sMid), z1: top });
      if (kind === 'pond') { const w = shapes.find((c) => c.role === 'water'); if (w?.poly) levels.push({ s: (w.poly[0].s + w.poly[1].s) / 2, z: Math.max(...w.poly.map((q) => q.z)), ground: false }); }
    }
    for (const pad of model.terrain.pads) {
      const iv = segmentInsideIntervals(f.a, f.b, pad.pts);
      for (const [t0, t1] of iv) levels.push({ s: (sAtT(f, t0) + sAtT(f, t1)) / 2, z: pad.z, ground: true });
    }
  }
  if (ground.length) {
    levels.push({ s: ground[0].s, z: ground[0].z, ground: true });
    levels.push({ s: ground[ground.length - 1].s, z: ground[ground.length - 1].z, ground: true });
  }

  beyond.sort((p, q) => q.depth - p.depth);
  let zMin = Math.min(...ground.map((g) => g.z)), zMax = Math.max(...ground.map((g) => g.z));
  for (const c of [...cut, ...beyond]) {
    if (c.poly) for (const q of c.poly) { zMin = Math.min(zMin, q.z); zMax = Math.max(zMax, q.z); }
    if (c.ell) { zMin = Math.min(zMin, c.ell.cz - c.ell.rz); zMax = Math.max(zMax, c.ell.cz + c.ell.rz); }
  }
  for (const sf of surfaces) for (const q of sf.top) zMin = Math.min(zMin, q.z - sf.thick);
  return {
    L: f.L, ground, sources: [...sources], surfaces, cut, beyond, levels, vdims, zMin, zMax,
    cutIds: [...cutIds], beyondIds: [...beyondIds].filter((id) => !cutIds.has(id)),
  };
}

/** Section letter for a new section: A, B, C... skipping letters already used. */
export function nextSectionLabel(list: SiteSection[]) {
  const used = new Set(list.map((s) => s.label));
  for (const c of 'ABCDEFGHJKLMNPQRSTUVWXYZ') if (!used.has(c)) return c;
  return `S${list.length + 1}`;
}

export const sectionKindLabel = (kind: string) => lib(kind).label;
export { primTop };

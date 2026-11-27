// Sections and elevations of a building, computed from the model's real solids.
//
// A section is a vertical plane through the plan line a→b. Every solid the plane cuts is returned as its exact cut
// shape (walls with their openings, slabs with their holes, stairs, roofs, furniture). Everything seen beyond the
// plane, up to the chosen depth, is returned as its silhouette, sorted far to near so nearer solids hide farther ones.
// An elevation cuts nothing and shows everything beyond the line.
// Section coordinates: s = horizontal distance along the drawing (to the viewer's right), z = level. mm.

import { type Vec2, v2 } from '../geometry/vec';
import { clipHalfPlane, convexHull, dot, lerp, mul, norm, perpL, segmentInsideIntervals, sub } from '../site/poly';
import { linAt } from '../site/prims';
import type { BldSection, BuildingData } from './types';
import { sortedLevels, type BPrim, type BRole, type BuildingModel, type SolidType } from './model';

export interface SPt { s: number; z: number }
export interface SShape { id: string; type: SolidType; role: BRole; color: string; poly: SPt[]; depth: number }

export interface BSectionResult {
  L: number;
  cut: SShape[];
  beyond: SShape[];
  levels: { z: number; name: string }[];
  /** Heights of openings the plane passes through. */
  openings: { s: number; z0: number; z1: number }[];
  ground: number;
  zMin: number;
  zMax: number;
  sMin: number;
  sMax: number;
  cutIds: string[];
}

interface Frame { a: Vec2; L: number; u: Vec2; n: Vec2; side: 1 | -1 }

const frameOf = (sec: BldSection): Frame => {
  const L = Math.hypot(sec.b.x - sec.a.x, sec.b.y - sec.a.y);
  const u = norm(sub(sec.b, sec.a));
  return { a: sec.a, L, u, n: mul(perpL(u), sec.side), side: sec.side };
};
const sOf = (f: Frame, p: Vec2) => { const along = dot(sub(p, f.a), f.u); return f.side === 1 ? along : f.L - along; };
const dOf = (f: Frame, p: Vec2) => dot(sub(p, f.a), f.n);
const sAtT = (f: Frame, t: number) => (f.side === 1 ? t * f.L : (1 - t) * f.L);

/** Parts of a→b inside the polygon and outside all its holes. */
function insideWithHoles(a: Vec2, b: Vec2, poly: Vec2[], holes: Vec2[][] = []): [number, number][] {
  let iv = segmentInsideIntervals(a, b, poly);
  for (const h of holes) {
    const hi = segmentInsideIntervals(a, b, h);
    const next: [number, number][] = [];
    for (const [s0, s1] of iv) {
      let cur: [number, number][] = [[s0, s1]];
      for (const [h0, h1] of hi) cur = cur.flatMap(([x0, x1]) => {
        if (h1 <= x0 || h0 >= x1) return [[x0, x1] as [number, number]];
        const o: [number, number][] = [];
        if (h0 > x0) o.push([x0, h0]);
        if (h1 < x1) o.push([h1, x1]);
        return o;
      });
      next.push(...cur);
    }
    iv = next;
  }
  return iv.filter(([x0, x1]) => x1 - x0 > 1e-9);
}

function cutPrim(f: Frame, pr: BPrim): SPt[][] {
  const end = v2(f.a.x + f.u.x * f.L, f.a.y + f.u.y * f.L);
  if (pr.t === 'prism') {
    return insideWithHoles(f.a, end, pr.poly, pr.holes).map(([t0, t1]) => {
      const P0 = lerp(f.a, end, t0), P1 = lerp(f.a, end, t1);
      const s0 = sAtT(f, t0), s1 = sAtT(f, t1);
      return [{ s: s0, z: linAt(pr.z0, P0) }, { s: s1, z: linAt(pr.z0, P1) }, { s: s1, z: linAt(pr.z1, P1) }, { s: s0, z: linAt(pr.z1, P0) }];
    });
  }
  const dc = dOf(f, pr.c), along = dot(sub(pr.c, f.a), f.u);
  if (Math.abs(dc) >= pr.r || along < -pr.r || along > f.L + pr.r) return [];
  const w = Math.sqrt(pr.r * pr.r - dc * dc), sc = sOf(f, pr.c);
  const a = Math.max(0, sc - w), b = Math.min(f.L, sc + w);
  if (b <= a) return [];
  return [[{ s: a, z: pr.z0 }, { s: b, z: pr.z0 }, { s: b, z: pr.z1 }, { s: a, z: pr.z1 }]];
}

function clipS(poly: Vec2[], L: number): Vec2[] {
  let p = clipHalfPlane(poly, v2(0, 0), v2(1, 0));
  if (p.length) p = clipHalfPlane(p, v2(L, 0), v2(-1, 0));
  return p;
}

function beyondPrim(f: Frame, pr: BPrim, depth: number, from: number): { poly: SPt[]; depth: number } | null {
  if (pr.t === 'prism') {
    let poly = clipHalfPlane(pr.poly, v2(f.a.x + f.n.x * from, f.a.y + f.n.y * from), f.n);
    if (poly.length) poly = clipHalfPlane(poly, v2(f.a.x + f.n.x * depth, f.a.y + f.n.y * depth), mul(f.n, -1));
    if (poly.length < 3) return null;
    const pts: Vec2[] = [];
    for (const q of poly) { const s = sOf(f, q); pts.push(v2(s, linAt(pr.z0, q)), v2(s, linAt(pr.z1, q))); }
    const hull = clipS(convexHull(pts), f.L);
    if (hull.length < 3) return null;
    return { poly: hull.map((q) => ({ s: q.x, z: q.y })), depth: Math.min(...poly.map((q) => dOf(f, q))) };
  }
  const dc = dOf(f, pr.c);
  if (dc + pr.r <= from || dc - pr.r > depth) return null;
  const sc = sOf(f, pr.c);
  const hull = clipS([v2(sc - pr.r, pr.z0), v2(sc + pr.r, pr.z0), v2(sc + pr.r, pr.z1), v2(sc - pr.r, pr.z1)], f.L);
  if (hull.length < 3) return null;
  return { poly: hull.map((q) => ({ s: q.x, z: q.y })), depth: Math.max(0, dc - pr.r) };
}

export function computeBSection(d: BuildingData, m: BuildingModel, sec: BldSection): BSectionResult | null {
  const f = frameOf(sec);
  if (f.L < 1) return null;
  const depth = Math.max(0, sec.depth);
  const cut: SShape[] = [], beyond: SShape[] = [];
  const cutIds = new Set<string>();
  const isSection = sec.mode === 'section';
  for (const so of m.solids) {
    if (!sec.showFurniture && so.type === 'furniture') continue;
    if (so.type === 'room') continue; // floor finishes are part of the slab line
    for (const pr of so.prims) {
      if (isSection) {
        const cs = cutPrim(f, pr);
        for (const poly of cs) cut.push({ id: so.id, type: so.type, role: pr.role, color: pr.color, poly, depth: 0 });
        if (cs.length) cutIds.add(so.id);
      }
      // Beyond: what lies behind the plane (for a section, starting just behind the cut).
      const b = beyondPrim(f, pr, depth, isSection ? 0.5 : -1e9);
      if (b) beyond.push({ id: so.id, type: so.type, role: pr.role, color: pr.color, poly: b.poly, depth: b.depth });
    }
  }
  beyond.sort((p, q) => q.depth - p.depth);
  // Openings the plane passes through: heights for the dimensions.
  const end = v2(f.a.x + f.u.x * f.L, f.a.y + f.u.y * f.L);
  const openings: BSectionResult['openings'] = [];
  if (isSection) for (const lm of m.levels) for (const wm of lm.walls) for (const om of wm.openings) {
    const t = wm.w.thickness;
    const A = wm.w.a;
    const rect = [0, 1, 2, 3].map((i) => v2(A.x + om.u.x * (i === 0 || i === 3 ? om.s0 : om.s1) + om.n.x * (i < 2 ? -t / 2 : t / 2), A.y + om.u.y * (i === 0 || i === 3 ? om.s0 : om.s1) + om.n.y * (i < 2 ? -t / 2 : t / 2)));
    const iv = segmentInsideIntervals(f.a, end, rect);
    if (!iv.length) continue;
    const s = (sAtT(f, iv[0][0]) + sAtT(f, iv[0][1])) / 2;
    const z0 = lm.level.elevation + om.o.sill;
    openings.push({ s, z0, z1: z0 + om.o.height });
  }
  const all = [...cut, ...beyond];
  let zMin = d.groundLevel, zMax = d.groundLevel + 1000, sMin = f.L, sMax = 0;
  for (const c of all) for (const q of c.poly) { zMin = Math.min(zMin, q.z); zMax = Math.max(zMax, q.z); sMin = Math.min(sMin, q.s); sMax = Math.max(sMax, q.s); }
  if (sMax < sMin) { sMin = 0; sMax = f.L; }
  const levels = sortedLevels(d).map((l) => ({ z: l.elevation, name: l.name }));
  return { L: f.L, cut, beyond, levels, openings, ground: d.groundLevel, zMin, zMax, sMin, sMax, cutIds: [...cutIds] };
}

/** Section letter for a new section: A, B, C... skipping letters already used. */
export function nextBSectionLabel(list: BldSection[]) {
  const used = new Set(list.map((s) => s.label));
  for (const c of 'ABCDEFGHJKLMNPQRSTUVWXYZ') if (!used.has(c)) return c;
  return `S${list.length + 1}`;
}

/** Elevation line for a side of the building: outside the plan bounds, looking at the building. */
export function elevationLine(box: { minX: number; minY: number; maxX: number; maxY: number }, dir: 'south' | 'north' | 'east' | 'west'): { a: Vec2; b: Vec2; side: 1 | -1 } {
  const m = 3000;
  const { minX, minY, maxX, maxY } = box;
  // side 1 = looking to the left of a→b.
  if (dir === 'south') return { a: v2(minX - m, minY - m), b: v2(maxX + m, minY - m), side: 1 };
  if (dir === 'north') return { a: v2(maxX + m, maxY + m), b: v2(minX - m, maxY + m), side: 1 };
  if (dir === 'east') return { a: v2(maxX + m, minY - m), b: v2(maxX + m, maxY + m), side: 1 };
  return { a: v2(minX - m, maxY + m), b: v2(minX - m, minY - m), side: 1 };
}

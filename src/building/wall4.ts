// 4.0 wall geometry: curved openings (arches, round and oval windows), niches and partial finishes (zones).
// A wall is cut into "cells" along its axis: full-height pieces between openings, and over each opening the parts
// below and above the hole. A curved hole is made of thin vertical slices whose top (and bottom) follow the curve,
// so the hole is real in the 3D model, the sections and the elevations. Heights here are from the level floor.

import { archCurve, defaultRise, type ArchShape } from '../library/arch';
import type { Opening, OpeningShape, Wall, WallZone } from './types';

/** One piece of wall: from s0 to s1 along the axis (null = the wall's end), bottom and top at s0 and s1. */
export interface Cell {
  s0: number | null;
  s1: number | null;
  b0: number; b1: number;
  t0: number; t1: number;
  /** Only part of the thickness (niches): offset range from the centre line, left positive. */
  tr?: [number, number];
}

const ARCH: Partial<Record<OpeningShape, ArchShape>> = { arch: 'semi', segment: 'segment', pointed: 'pointed', ellipse: 'ellipse' };

export const isCurved = (o: Pick<Opening, 'shape'>) => !!o.shape && o.shape !== 'rect';

/** Rise used for an arched opening (mm above the springing line). */
export function openingRise(o: Pick<Opening, 'shape' | 'rise' | 'width' | 'height'>): number {
  const a = ARCH[o.shape ?? 'rect'];
  if (!a) return 0;
  if (a === 'semi') return Math.min(o.width / 2, o.height - 10);
  return Math.max(10, Math.min(o.rise && o.rise > 0 ? o.rise : defaultRise(a, o.width), o.height - 10));
}

/** Bottom and top of the hole at x (from the opening's centre, −w/2 … w/2), from the level floor. Null for rectangles. */
export function holeAt(o: Pick<Opening, 'shape' | 'rise' | 'width' | 'height' | 'sill'>): ((x: number) => [number, number]) | null {
  const shape = o.shape ?? 'rect';
  if (shape === 'rect') return null;
  const a = o.width / 2;
  if (shape === 'round' || shape === 'oval') {
    const cz = o.sill + o.height / 2, ry = o.height / 2;
    return (x) => { const t = Math.max(-1, Math.min(1, x / a)); const k = ry * Math.sqrt(Math.max(0, 1 - t * t)); return [cz - k, cz + k]; };
  }
  const arch = ARCH[shape]!;
  const r = openingRise(o);
  const spring = o.sill + o.height - r;
  return (x) => [o.sill, spring + archCurve(arch, a, r, x)];
}

/** Number of slices used for a curved hole (smoothness). */
export const SLICES = 18;

/** Outline of a hole in the wall's elevation (s along the wall, z from the floor), for drawings and checks. */
export function holeOutline(o: Opening, n = 32): { s: number; z: number }[] {
  const f = holeAt(o);
  const s0 = o.pos - o.width / 2, s1 = o.pos + o.width / 2;
  if (!f) return [{ s: s0, z: o.sill }, { s: s1, z: o.sill }, { s: s1, z: o.sill + o.height }, { s: s0, z: o.sill + o.height }];
  const bot: { s: number; z: number }[] = [], top: { s: number; z: number }[] = [];
  for (let i = 0; i <= n; i++) { const x = -o.width / 2 + (o.width * i) / n; const [b, t] = f(x); bot.push({ s: o.pos + x, z: b }); top.push({ s: o.pos + x, z: t }); }
  return [...bot, ...top.reverse()];
}

export interface HoleSpan { s0: number; s1: number; o: Opening }

/**
 * Cells of a wall of height h with these holes (sorted, not overlapping). Rectangular holes give exactly the pieces of
 * 3.0 (full height between holes, below and above each hole). Niches keep the back of the wall behind the hole.
 */
export function wallCells(h: number, holes: HoleSpan[], t: number): Cell[] {
  const out: Cell[] = [];
  const C = (s0: number | null, s1: number | null, b0: number, b1: number, t0: number, t1: number, tr?: [number, number]) => {
    if (Math.max(t0, t1) - Math.min(b0, b1) > 0.5 && (s0 === null || s1 === null || s1 - s0 > 0.1)) out.push({ s0, s1, b0, b1, t0, t1, ...(tr ? { tr } : {}) });
  };
  let s: number | null = null;
  for (const hs of holes) {
    C(s, hs.s0, 0, 0, h, h);
    const o = hs.o;
    const niche = o.variant === 'niche';
    const back: [number, number] | undefined = niche ? nicheBack(o, t) : undefined;
    const f = holeAt(o);
    if (!f) {
      const top = Math.min(h, o.sill + o.height), bot = Math.min(o.sill, h);
      C(hs.s0, hs.s1, 0, 0, bot, bot);
      if (back) C(hs.s0, hs.s1, bot, bot, top, top, back);
      C(hs.s0, hs.s1, top, top, h, h);
    } else {
      const n = SLICES;
      for (let i = 0; i < n; i++) {
        const xa = hs.s0 + ((hs.s1 - hs.s0) * i) / n, xb = hs.s0 + ((hs.s1 - hs.s0) * (i + 1)) / n;
        const [ba, ta] = f(xa - o.pos), [bb, tb] = f(xb - o.pos);
        const TA = Math.min(h, ta), TB = Math.min(h, tb);
        if (Math.max(ba, bb) > 0.5) C(xa, xb, 0, 0, Math.min(ba, h), Math.min(bb, h));
        if (back) C(xa, xb, Math.min(ba, h), Math.min(bb, h), TA, TB, back);
        C(xa, xb, TA, TB, h, h);
      }
    }
    s = hs.s1;
  }
  C(s, null, 0, 0, h, h);
  return out;
}

/** Offset range of the wall left behind a niche (the niche opens on the opening's side). */
export function nicheBack(o: Pick<Opening, 'side' | 'depth'>, t: number): [number, number] {
  const dep = Math.max(20, Math.min(t - 20, o.depth ?? t / 2));
  return o.side === 'L' ? [-t / 2, t / 2 - dep] : [-t / 2 + dep, t / 2];
}

/** Along-axis range of one face of a wall (the mitred outline makes faces longer or shorter than the axis). */
export function faceRange(outline: { x: number; y: number }[], w: Wall, side: 'L' | 'R'): [number, number] {
  const ux = w.b.x - w.a.x, uy = w.b.y - w.a.y, L = Math.hypot(ux, uy) || 1;
  const u = { x: ux / L, y: uy / L }, n = { x: -u.y, y: u.x };
  const want = side === 'L' ? w.thickness / 2 : -w.thickness / 2;
  let lo = Infinity, hi = -Infinity;
  for (const p of outline) {
    const dx = p.x - w.a.x, dy = p.y - w.a.y;
    if (Math.abs(dx * n.x + dy * n.y - want) > 1) continue;
    const s = dx * u.x + dy * u.y;
    lo = Math.min(lo, s); hi = Math.max(hi, s);
  }
  return lo <= hi ? [lo, hi] : [0, L];
}

/** Rectangles (s0, s1, z0, z1) of a zone on a face, minus the holes of the openings that pass through that face. */
export function zoneRects(z: WallZone, face: [number, number], h: number, holes: HoleSpan[], t: number): Cell[] {
  const s0 = Math.max(face[0], z.s0 ?? -Infinity), s1 = Math.min(face[1], z.s1 ?? Infinity);
  const z0 = Math.max(0, z.z0), z1 = Math.min(h, z.z1 ?? h);
  if (s1 - s0 < 1 || z1 - z0 < 1) return [];
  // Holes that cut this face: every opening except a niche opening on the other side.
  const cut = holes.filter((hs) => hs.s1 > s0 && hs.s0 < s1 && !(hs.o.variant === 'niche' && hs.o.side !== z.side));
  const cells = wallCells(z1 - z0, cut.map((hs) => ({ s0: Math.max(s0, hs.s0), s1: Math.min(s1, hs.s1), o: { ...hs.o, sill: hs.o.sill - z0, variant: undefined } })), t);
  return cells.map((c) => ({ ...c, s0: c.s0 ?? s0, s1: c.s1 ?? s1, b0: c.b0 + z0, b1: c.b1 + z0, t0: c.t0 + z0, t1: c.t1 + z0 }));
}

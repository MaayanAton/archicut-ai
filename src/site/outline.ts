// Plan outlines of site elements (the footprint used for areas, hit testing, sections and draping).

import { type Vec2, v2 } from '../geometry/vec';
import type { SiteElement } from './types';
import { lib, prm } from './library';
import { rectAround, ribbon, smoothPath } from './poly';

export function circlePoly(c: Vec2, r: number, n = 40): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push(v2(c.x + r * Math.cos(a), c.y + r * Math.sin(a)));
  }
  return out;
}

/** The centre line of a line element, or the outline of an area, with curves expanded. */
export function elementPath(e: SiteElement): Vec2[] {
  const g = e.geom;
  if (g.type === 'line') return g.curved ? smoothPath(g.pts, false) : g.pts;
  if (g.type === 'area') return g.curved ? smoothPath(g.pts, true) : g.pts;
  if (g.type === 'dim') return [g.a, g.b];
  return [g.p];
}

/** Size of a point object's footprint (width along local X, depth along local Y). */
export function pointSize(e: SiteElement): { w: number; d: number; round: boolean } {
  const L = lib(e.kind);
  if (L.footprint === 'circle') { const dia = prm(e, 'dia'); return { w: dia, d: dia, round: true }; }
  if (e.kind === 'text') return { w: 1000, d: 1000, round: false };
  return { w: prm(e, 'w'), d: prm(e, 'd'), round: false };
}

/** Footprint polygon in plan (closed), or the two points of a dimension. */
export function elementOutline(e: SiteElement): Vec2[] {
  const g = e.geom;
  if (g.type === 'point') {
    const s = pointSize(e);
    return s.round ? circlePoly(g.p, s.w / 2) : rectAround(g.p, s.w, s.d, g.rot);
  }
  if (g.type === 'line') {
    const w = prm(e, 'width');
    const path = elementPath(e);
    return w > 0 ? ribbon(path, w) : path;
  }
  return elementPath(e);
}

/** Points that other elements snap to: vertices, centres and corners. */
export function elementSnapPoints(e: SiteElement): Vec2[] {
  const g = e.geom;
  if (g.type === 'point') return [g.p, ...(pointSize(e).round ? [] : elementOutline(e))];
  if (g.type === 'dim') return [g.a, g.b];
  return g.pts;
}

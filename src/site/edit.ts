// Editing operations on site elements: move, rotate, duplicate, hit testing and snapping.

import { type Vec2, v2 } from '../geometry/vec';
import type { SiteData, SiteElement } from './types';
import { lib, prm } from './library';
import { centroid, closestOnSegment, dist, distToPolyline, pointInPoly, polyArea, rotatePt } from './poly';
import { elementOutline, elementPath, elementSnapPoints } from './outline';
import { addPt, emptyBox, type Box } from '../drawing/viewport';

const mapGeom = (e: SiteElement, f: (p: Vec2) => Vec2): SiteElement => {
  const g = e.geom;
  if (g.type === 'point') return { ...e, geom: { ...g, p: f(g.p) } };
  if (g.type === 'dim') return { ...e, geom: { ...g, a: f(g.a), b: f(g.b) } };
  return { ...e, geom: { ...g, pts: g.pts.map(f) } };
};

export const translateEl = (e: SiteElement, d: Vec2) => mapGeom(e, (p) => v2(p.x + d.x, p.y + d.y));

export function elementCenter(e: SiteElement): Vec2 {
  const g = e.geom;
  if (g.type === 'point') return g.p;
  if (g.type === 'dim') return v2((g.a.x + g.b.x) / 2, (g.a.y + g.b.y) / 2);
  if (g.type === 'area') return centroid(g.pts);
  const b = boxOfPts(g.pts);
  return v2((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2);
}

export function rotateEl(e: SiteElement, deg: number, about: Vec2 = elementCenter(e)): SiteElement {
  const r = mapGeom(e, (p) => rotatePt(p, deg, about));
  if (r.geom.type === 'point') r.geom = { ...r.geom, rot: normAngle(r.geom.rot + deg) };
  return r;
}

export const normAngle = (a: number) => { let x = a % 360; if (x <= -180) x += 360; if (x > 180) x -= 360; return Object.is(x, -0) ? 0 : x; };

export function boxOfPts(pts: Vec2[]): Box {
  let b = emptyBox();
  for (const p of pts) b = addPt(b, p);
  return b;
}

export function selectionBox(els: SiteElement[]): Box {
  let b = emptyBox();
  for (const e of els) for (const p of elementOutline(e)) b = addPt(b, p);
  return b;
}

export function selectionCenter(els: SiteElement[]): Vec2 {
  const b = selectionBox(els);
  return v2((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2);
}

/**
 * The element under a plan point. Small things win over large areas, so a bench on a lawn on a lot
 * is picked before the lawn, and the lawn before the lot.
 */
export function hitElement(els: SiteElement[], p: Vec2, tol: number): SiteElement | null {
  let best: SiteElement | null = null, bestScore = Infinity;
  for (const e of els) {
    const g = e.geom;
    let score = Infinity;
    if (g.type === 'point') {
      const out = elementOutline(e);
      if (pointInPoly(p, out) || dist(p, g.p) < tol) score = polyArea(out) * 1e-9;
    } else if (g.type === 'dim') {
      if (closestOnSegment(p, g.a, g.b).d < tol) score = 0;
    } else if (g.type === 'line') {
      const out = elementOutline(e);
      const path = elementPath(e);
      if ((out.length > 2 && pointInPoly(p, out)) || distToPolyline(p, path, false) < tol + prm(e, 'width') / 2) score = 1 + prm(e, 'width') * 1e-9;
    } else {
      const out = elementOutline(e);
      const nearEdge = distToPolyline(p, out, true) < tol;
      if (pointInPoly(p, out) || nearEdge) score = (nearEdge ? 1.5 : 2) + polyArea(out) * 1e-12 + (e.kind === 'lot' ? 1000 : 0);
    }
    if (score < bestScore) { bestScore = score; best = e; }
  }
  return best;
}

export function elementsInBox(els: SiteElement[], b: Box): SiteElement[] {
  return els.filter((e) => elementOutline(e).every((q) => q.x >= b.minX && q.x <= b.maxX && q.y >= b.minY && q.y <= b.maxY));
}

export type SnapKind = 'point' | 'line' | 'grid' | null;

export function snapPoint(d: SiteData, els: SiteElement[], w: Vec2, tol: number, extra: Vec2[] = [], opts: { grid?: boolean } = {}): { p: Vec2; kind: SnapKind } {
  if (d.snap.points) {
    let best: Vec2 | null = null, bd = tol;
    for (const e of els) for (const q of elementSnapPoints(e)) { const dd = dist(q, w); if (dd < bd) { bd = dd; best = q; } }
    for (const q of extra) { const dd = dist(q, w); if (dd < bd) { bd = dd; best = q; } }
    for (const hp of d.terrain.points) { const dd = dist(hp.p, w); if (dd < bd) { bd = dd; best = hp.p; } }
    if (best) return { p: best, kind: 'point' };
  }
  if (d.snap.lines) {
    let best: Vec2 | null = null, bd = tol;
    for (const e of els) {
      if (e.geom.type === 'point' || e.geom.type === 'dim') continue;
      const pts = e.geom.type === 'line' ? elementPath(e) : elementOutline(e);
      const closed = e.geom.type === 'area';
      for (let i = 0; i < pts.length - (closed ? 0 : 1); i++) {
        const c = closestOnSegment(w, pts[i], pts[(i + 1) % pts.length]);
        if (c.d < bd) { bd = c.d; best = c.q; }
      }
    }
    if (best) return { p: best, kind: 'line' };
  }
  if ((opts.grid ?? true) && d.grid.snap && d.grid.size > 0) {
    const g = d.grid.size;
    return { p: v2(Math.round(w.x / g) * g, Math.round(w.y / g) * g), kind: 'grid' };
  }
  return { p: w, kind: null };
}

/** Length of a line element, perimeter and area of an area element (mm, mm²). */
export function measures(e: SiteElement): { length?: number; area?: number; perimeter?: number } {
  const g = e.geom;
  if (g.type === 'line') {
    const path = elementPath(e);
    let l = 0;
    for (let i = 0; i < path.length - 1; i++) l += dist(path[i], path[i + 1]);
    const w = prm(e, 'width');
    return { length: l, area: w > 0 ? l * w : undefined };
  }
  if (g.type === 'area') {
    const pts = elementPath(e);
    let per = 0;
    for (let i = 0; i < pts.length; i++) per += dist(pts[i], pts[(i + 1) % pts.length]);
    return { area: polyArea(pts), perimeter: per };
  }
  if (g.type === 'dim') return { length: dist(g.a, g.b) };
  const L = lib(e.kind);
  if (L.footprint === 'circle') { const r = prm(e, 'dia') / 2; return { area: Math.PI * r * r }; }
  return {};
}

/** Area totals by element kind, for the areas table. */
export function areaTable(d: SiteData, visibleOnly = true): { kind: string; label: string; count: number; area: number }[] {
  const hidden = new Set(d.layers.filter((l) => !l.visible).map((l) => l.id));
  const rows = new Map<string, { kind: string; label: string; count: number; area: number }>();
  for (const e of d.elements) {
    if (visibleOnly && hidden.has(e.layer)) continue;
    if (e.geom.type !== 'area' && !(e.geom.type === 'line' && e.kind === 'path')) continue;
    const a = measures(e).area;
    if (a === undefined) continue;
    const r = rows.get(e.kind) ?? { kind: e.kind, label: lib(e.kind).label, count: 0, area: 0 };
    r.count++;
    r.area += a;
    rows.set(e.kind, r);
  }
  return [...rows.values()];
}

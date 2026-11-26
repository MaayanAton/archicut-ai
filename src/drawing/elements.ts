// Geometry helpers for 2D drawing elements (world mm, y up).

import type { DrawingElement } from '../document/types';
import { type Vec2, v2, deg2rad, dist2 } from '../geometry/vec';
import { addPt, emptyBox, type Box } from './viewport';

export function rectCorners(e: Extract<DrawingElement, { kind: 'rect' }>): Vec2[] {
  const cx = e.x + e.w / 2, cy = e.y + e.h / 2;
  const a = deg2rad(e.angle), c = Math.cos(a), s = Math.sin(a);
  return [
    [-e.w / 2, -e.h / 2], [e.w / 2, -e.h / 2], [e.w / 2, e.h / 2], [-e.w / 2, e.h / 2],
  ].map(([x, y]) => v2(cx + x * c - y * s, cy + x * s + y * c));
}

/** Characteristic points used for snapping. */
export function snapPoints(e: DrawingElement): Vec2[] {
  switch (e.kind) {
    case 'point': return [e.p];
    case 'line': return [e.a, e.b, v2((e.a.x + e.b.x) / 2, (e.a.y + e.b.y) / 2)];
    case 'rect': return rectCorners(e);
    case 'circle': return [e.c, v2(e.c.x + e.r, e.c.y), v2(e.c.x - e.r, e.c.y), v2(e.c.x, e.c.y + e.r), v2(e.c.x, e.c.y - e.r)];
    case 'polygon': return e.pts;
    case 'text': return [e.p];
    case 'dim': return [e.a, e.b];
  }
}

function segDist(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const L2 = dx * dx + dy * dy;
  if (L2 < 1e-18) return dist2(p, a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2));
  return dist2(p, v2(a.x + t * dx, a.y + t * dy));
}

const polyDist = (p: Vec2, pts: Vec2[], closed: boolean) => {
  let m = Infinity;
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) m = Math.min(m, segDist(p, pts[i], pts[(i + 1) % pts.length]));
  return m;
};

/** Distance (world mm) from p to the element's outline. Text uses an approximate box. */
export function hitDistance(e: DrawingElement, p: Vec2, textWorldSize: number): number {
  switch (e.kind) {
    case 'point': return dist2(p, e.p);
    case 'line': return segDist(p, e.a, e.b);
    case 'rect': return polyDist(p, rectCorners(e), true);
    case 'circle': return Math.abs(dist2(p, e.c) - e.r);
    case 'polygon': return polyDist(p, e.pts, e.closed);
    case 'text': {
      const w = e.text.length * textWorldSize * 0.55 + textWorldSize, h = textWorldSize * 1.2;
      const inside = Math.abs(p.x - e.p.x) <= w / 2 && p.y >= e.p.y - h * 0.3 && p.y <= e.p.y + h;
      return inside ? 0 : Math.min(dist2(p, e.p), Infinity);
    }
    case 'dim': return segDist(p, e.a, e.b);
  }
}

export function elementBox(e: DrawingElement): Box {
  let b = emptyBox();
  const pts = e.kind === 'circle' ? [v2(e.c.x - e.r, e.c.y - e.r), v2(e.c.x + e.r, e.c.y + e.r)] : snapPoints(e);
  pts.forEach((p) => (b = addPt(b, p)));
  return b;
}

export function elementCenter(e: DrawingElement): Vec2 {
  const b = elementBox(e);
  return v2((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2);
}

const mapPts = (e: DrawingElement, f: (p: Vec2) => Vec2): DrawingElement => {
  switch (e.kind) {
    case 'point': return { ...e, p: f(e.p) };
    case 'line': return { ...e, a: f(e.a), b: f(e.b) };
    case 'rect': {
      const c = f(v2(e.x + e.w / 2, e.y + e.h / 2));
      return { ...e, x: c.x - e.w / 2, y: c.y - e.h / 2 };
    }
    case 'circle': return { ...e, c: f(e.c) };
    case 'polygon': return { ...e, pts: e.pts.map(f) };
    case 'text': return { ...e, p: f(e.p) };
    case 'dim': return { ...e, a: f(e.a), b: f(e.b) };
  }
};

export const translate = (e: DrawingElement, d: Vec2) => mapPts(e, (p) => v2(p.x + d.x, p.y + d.y));

export function rotate(e: DrawingElement, deg: number, about = elementCenter(e)): DrawingElement {
  const a = deg2rad(deg), c = Math.cos(a), s = Math.sin(a);
  const f = (p: Vec2) => v2(about.x + (p.x - about.x) * c - (p.y - about.y) * s, about.y + (p.x - about.x) * s + (p.y - about.y) * c);
  const moved = mapPts(e, f);
  if (moved.kind === 'rect') return { ...moved, angle: ((moved.angle + deg) % 360 + 360) % 360 };
  return moved;
}

export function scaleEl(e: DrawingElement, k: number, about = elementCenter(e)): DrawingElement {
  const f = (p: Vec2) => v2(about.x + (p.x - about.x) * k, about.y + (p.y - about.y) * k);
  const moved = mapPts(e, f);
  if (moved.kind === 'rect') {
    const c = v2(moved.x + moved.w / 2, moved.y + moved.h / 2);
    const w = moved.w * k, h = moved.h * k;
    return { ...moved, w, h, x: c.x - w / 2, y: c.y - h / 2 };
  }
  if (moved.kind === 'circle') return { ...moved, r: moved.r * k };
  if (moved.kind === 'dim') return { ...moved, offset: moved.offset * k };
  return moved;
}

export const ELEMENT_LABELS: Record<DrawingElement['kind'], string> = {
  point: 'נקודה', line: 'קו', rect: 'מלבן', circle: 'עיגול', polygon: 'מצולע', text: 'טקסט', dim: 'קו מידה',
};

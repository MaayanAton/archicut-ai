// 2D polygon and polyline geometry for the site module. Pure functions, millimetres, y up.

import { type Vec2, v2 } from '../geometry/vec';

export const sub = (a: Vec2, b: Vec2) => v2(a.x - b.x, a.y - b.y);
export const add = (a: Vec2, b: Vec2) => v2(a.x + b.x, a.y + b.y);
export const mul = (a: Vec2, k: number) => v2(a.x * k, a.y * k);
export const dot = (a: Vec2, b: Vec2) => a.x * b.x + a.y * b.y;
export const cross = (a: Vec2, b: Vec2) => a.x * b.y - a.y * b.x;
export const len = (a: Vec2) => Math.hypot(a.x, a.y);
export const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);
export const lerp = (a: Vec2, b: Vec2, t: number) => v2(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
export const norm = (a: Vec2) => { const l = len(a); return l > 0 ? v2(a.x / l, a.y / l) : v2(0, 0); };
export const perpL = (a: Vec2) => v2(-a.y, a.x);

export function rotatePt(p: Vec2, deg: number, about: Vec2 = v2(0, 0)): Vec2 {
  const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  const x = p.x - about.x, y = p.y - about.y;
  return v2(about.x + x * c - y * s, about.y + x * s + y * c);
}

/** Signed area (positive = counter-clockwise), mm². */
export function signedArea(pts: Vec2[]) {
  let a = 0;
  for (let i = 0, n = pts.length; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}
export const polyArea = (pts: Vec2[]) => Math.abs(signedArea(pts));

export function polylineLength(pts: Vec2[], closed = false) {
  let l = 0;
  for (let i = 0; i < pts.length - 1; i++) l += dist(pts[i], pts[i + 1]);
  if (closed && pts.length > 2) l += dist(pts[pts.length - 1], pts[0]);
  return l;
}

export function centroid(pts: Vec2[]): Vec2 {
  const A = signedArea(pts);
  if (Math.abs(A) < 1e-9) {
    const s = pts.reduce((acc, p) => add(acc, p), v2(0, 0));
    return pts.length ? mul(s, 1 / pts.length) : v2(0, 0);
  }
  let cx = 0, cy = 0;
  for (let i = 0, n = pts.length; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    const f = p.x * q.y - q.x * p.y;
    cx += (p.x + q.x) * f;
    cy += (p.y + q.y) * f;
  }
  return v2(cx / (6 * A), cy / (6 * A));
}

/** Even-odd point in polygon. Points exactly on an edge may go either way. */
export function pointInPoly(p: Vec2, pts: Vec2[]) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function closestOnSegment(p: Vec2, a: Vec2, b: Vec2): { q: Vec2; t: number; d: number } {
  const ab = sub(b, a);
  const L2 = dot(ab, ab);
  const t = L2 > 0 ? Math.max(0, Math.min(1, dot(sub(p, a), ab) / L2)) : 0;
  const q = lerp(a, b, t);
  return { q, t, d: dist(p, q) };
}

export function distToPolyline(p: Vec2, pts: Vec2[], closed: boolean) {
  let best = Infinity;
  const n = pts.length;
  for (let i = 0; i < n - (closed ? 0 : 1); i++) best = Math.min(best, closestOnSegment(p, pts[i], pts[(i + 1) % n]).d);
  if (n === 1) best = dist(p, pts[0]);
  return best;
}

/** Parameter t on segment p0→p1 where it crosses segment q0→q1 (both inclusive), or null. */
export function segCross(p0: Vec2, p1: Vec2, q0: Vec2, q1: Vec2): number | null {
  const r = sub(p1, p0), s = sub(q1, q0);
  const den = cross(r, s);
  if (Math.abs(den) < 1e-12) return null;
  const qp = sub(q0, p0);
  const t = cross(qp, s) / den, u = cross(qp, r) / den;
  if (t < -1e-12 || t > 1 + 1e-12 || u < -1e-12 || u > 1 + 1e-12) return null;
  return Math.max(0, Math.min(1, t));
}

/**
 * Parts of the segment a→b that lie inside the polygon, as parameter intervals [t0, t1] in 0..1.
 * Exact up to floating point: crossings with every edge are computed, then each piece's midpoint is tested.
 */
export function segmentInsideIntervals(a: Vec2, b: Vec2, poly: Vec2[]): [number, number][] {
  if (poly.length < 3) return [];
  const ts = [0, 1];
  for (let i = 0; i < poly.length; i++) {
    const t = segCross(a, b, poly[i], poly[(i + 1) % poly.length]);
    if (t !== null) ts.push(t);
  }
  ts.sort((x, y) => x - y);
  const out: [number, number][] = [];
  for (let i = 0; i < ts.length - 1; i++) {
    const t0 = ts[i], t1 = ts[i + 1];
    if (t1 - t0 < 1e-12) continue;
    if (pointInPoly(lerp(a, b, (t0 + t1) / 2), poly)) {
      if (out.length && Math.abs(out[out.length - 1][1] - t0) < 1e-12) out[out.length - 1][1] = t1;
      else out.push([t0, t1]);
    }
  }
  return out;
}

/** Smooth curve through the points (centripetal-free uniform Catmull-Rom). The curve passes through every point. */
export function smoothPath(pts: Vec2[], closed: boolean, perSeg = 10): Vec2[] {
  const n = pts.length;
  if (n < 3) return pts.slice();
  const get = (i: number) => (closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
  const out: Vec2[] = [];
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    for (let k = 0; k < perSeg; k++) {
      const t = k / perSeg, t2 = t * t, t3 = t2 * t;
      out.push(v2(
        0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      ));
    }
  }
  if (!closed) out.push(pts[n - 1]);
  return out;
}

/**
 * Outline of a strip of the given width around an open polyline (a path or a wall), with mitred corners
 * (limited, so very sharp turns do not shoot out). Returned counter-clockwise-ish: left side forward, right side back.
 */
export function ribbon(pts: Vec2[], width: number): Vec2[] {
  const n = pts.length;
  if (n < 2 || width <= 0) return [];
  const h = width / 2;
  const left: Vec2[] = [], right: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const dPrev = i > 0 ? norm(sub(pts[i], pts[i - 1])) : null;
    const dNext = i < n - 1 ? norm(sub(pts[i + 1], pts[i])) : null;
    let nrm: Vec2, k = 1;
    if (dPrev && dNext) {
      const t = norm(add(dPrev, dNext));
      nrm = len(t) > 1e-9 ? perpL(t) : perpL(dNext);
      const c = dot(nrm, perpL(dNext));
      k = Math.min(1 / Math.max(c, 1e-6), 4); // miter limit 4
    } else nrm = perpL((dNext ?? dPrev)!);
    left.push(add(pts[i], mul(nrm, h * k)));
    right.push(sub(pts[i], mul(nrm, h * k)));
  }
  return [...left, ...right.reverse()];
}

/** Each segment of a polyline as its own rectangle (used for walls: one solid per segment). */
export function segmentQuads(pts: Vec2[], width: number): { quad: Vec2[]; a: Vec2; b: Vec2 }[] {
  const out: { quad: Vec2[]; a: Vec2; b: Vec2 }[] = [];
  const full = ribbon(pts, width);
  const n = pts.length;
  if (!full.length) return out;
  const left = full.slice(0, n), right = full.slice(n).reverse();
  for (let i = 0; i < n - 1; i++) out.push({ quad: [left[i], left[i + 1], right[i + 1], right[i]], a: pts[i], b: pts[i + 1] });
  return out;
}

/** Polygon offset inwards by distance d (mitred). Works for simple polygons that are not too thin. */
export function insetPolygon(pts: Vec2[], d: number): Vec2[] {
  const n = pts.length;
  const ccw = signedArea(pts) > 0;
  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n];
    const e1 = norm(sub(p1, p0)), e2 = norm(sub(p2, p1));
    // Inward normal: left of the edge for a counter-clockwise polygon.
    const n1 = ccw ? perpL(e1) : mul(perpL(e1), -1);
    const n2 = ccw ? perpL(e2) : mul(perpL(e2), -1);
    const bis = norm(add(n1, n2));
    const c = dot(bis, n1);
    const k = Math.min(d / Math.max(c, 0.2), d * 5);
    out.push(add(p1, mul(bis, k)));
  }
  return out;
}

/** Keeps the part of the polygon where dot(p - o, n) >= 0 (Sutherland-Hodgman, one plane). */
export function clipHalfPlane(pts: Vec2[], o: Vec2, n: Vec2): Vec2[] {
  const out: Vec2[] = [];
  const f = (p: Vec2) => dot(sub(p, o), n);
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const fa = f(a), fb = f(b);
    if (fa >= 0) out.push(a);
    if ((fa >= 0) !== (fb >= 0)) out.push(lerp(a, b, fa / (fa - fb)));
  }
  return out;
}

/** Convex hull (monotone chain), counter-clockwise. */
export function convexHull(points: Vec2[]): Vec2[] {
  const p = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (p.length < 3) return p;
  const lower: Vec2[] = [], upper: Vec2[] = [];
  const c = (o: Vec2, a: Vec2, b: Vec2) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  for (const q of p) { while (lower.length >= 2 && c(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (upper.length >= 2 && c(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q); }
  upper.pop(); lower.pop();
  return lower.concat(upper);
}

/** Rectangle corners centred at c, size w×d, rotated by rot degrees. Counter-clockwise. */
export function rectAround(c: Vec2, w: number, d: number, rot: number): Vec2[] {
  return [v2(-w / 2, -d / 2), v2(w / 2, -d / 2), v2(w / 2, d / 2), v2(-w / 2, d / 2)].map((q) => rotatePt(v2(c.x + q.x, c.y + q.y), rot, c));
}

/** Point in local coordinates of a rotated object -> world. */
export const localToWorld = (c: Vec2, rot: number, q: Vec2) => rotatePt(v2(c.x + q.x, c.y + q.y), rot, c);

/** Triangulate a simple polygon by ear clipping. Returns index triples into pts. */
export function triangulate(pts: Vec2[]): [number, number, number][] {
  const n = pts.length;
  if (n < 3) return [];
  const idx = [...Array(n).keys()];
  if (signedArea(pts) < 0) idx.reverse();
  const tris: [number, number, number][] = [];
  const isEar = (i0: number, i1: number, i2: number, list: number[]) => {
    const a = pts[i0], b = pts[i1], c = pts[i2];
    if (cross(sub(b, a), sub(c, a)) <= 1e-12) return false;
    for (const j of list) {
      if (j === i0 || j === i1 || j === i2) continue;
      const p = pts[j];
      const d1 = cross(sub(b, a), sub(p, a)), d2 = cross(sub(c, b), sub(p, b)), d3 = cross(sub(a, c), sub(p, c));
      if (d1 >= 0 && d2 >= 0 && d3 >= 0) return false;
    }
    return true;
  };
  let guard = 0;
  while (idx.length > 3 && guard++ < n * n) {
    let found = false;
    for (let k = 0; k < idx.length; k++) {
      const i0 = idx[(k - 1 + idx.length) % idx.length], i1 = idx[k], i2 = idx[(k + 1) % idx.length];
      if (isEar(i0, i1, i2, idx)) {
        tris.push([i0, i1, i2]);
        idx.splice(k, 1);
        found = true;
        break;
      }
    }
    if (!found) break; // degenerate polygon: stop rather than loop forever
  }
  if (idx.length === 3) tris.push([idx[0], idx[1], idx[2]]);
  return tris;
}

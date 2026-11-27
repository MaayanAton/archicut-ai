// Geometry engine for walls and rooms. Pure functions, no interface code.
//
// - Wall joints: every wall becomes a plan polygon whose ends are mitred against the walls that meet it
//   (corners, T-junctions, crossings and nodes of three or more walls).
// - Rooms: the wall centre lines form a planar graph; its closed faces are the possible rooms. A room's net
//   polygon is the face moved inwards by half the thickness of each wall around it (the wall faces).
// - Gross area: the outer boundary of the walls moved outwards by half the wall thickness (the outside face).

import { type Vec2, v2 } from '../geometry/vec';
import { add, closestOnSegment, cross, dist, dot, mul, norm, perpL, pointInPoly, signedArea, sub } from '../site/poly';

export interface WallLike { id: string; a: Vec2; b: Vec2; thickness: number }

const TOL = 5; // mm: points closer than this are the same point

interface Arm { wallId: string; d: Vec2; t: number; virtual: boolean; end: 'a' | 'b' }

function lineX(p: Vec2, d: Vec2, q: Vec2, e: Vec2): { pt: Vec2; s: number } | null {
  const den = cross(d, e);
  if (Math.abs(den) < 1e-9) return null;
  const s = cross(sub(q, p), e) / den;
  return { pt: add(p, mul(d, s)), s };
}

/**
 * Plan outline of each wall with its ends joined to the neighbouring walls.
 * Returns wall id → polygon. Walls shorter than 1 mm are skipped.
 */
export function wallOutlines(walls: WallLike[]): Map<string, Vec2[]> {
  const out = new Map<string, Vec2[]>();
  const live = walls.filter((w) => dist(w.a, w.b) >= 1 && w.thickness > 0);
  // Nodes: wall ends that touch.
  const nodes: { p: Vec2; arms: Arm[] }[] = [];
  const nodeOf = (p: Vec2) => {
    let n = nodes.find((x) => dist(x.p, p) < TOL);
    if (!n) { n = { p, arms: [] }; nodes.push(n); }
    return n;
  };
  const endNode = new Map<string, { a: (typeof nodes)[number]; b: (typeof nodes)[number] }>();
  for (const w of live) {
    const u = norm(sub(w.b, w.a));
    const na = nodeOf(w.a), nb = nodeOf(w.b);
    na.arms.push({ wallId: w.id, d: u, t: w.thickness, virtual: false, end: 'a' });
    nb.arms.push({ wallId: w.id, d: mul(u, -1), t: w.thickness, virtual: false, end: 'b' });
    endNode.set(w.id, { a: na, b: nb });
  }
  // T-junctions: a wall end on the middle of another wall adds that wall as two virtual arms.
  for (const n of nodes) {
    for (const w of live) {
      if (n.arms.some((a) => a.wallId === w.id)) continue;
      const c = closestOnSegment(n.p, w.a, w.b);
      const L = dist(w.a, w.b);
      if (c.d < TOL && c.t * L > TOL && (1 - c.t) * L > TOL) {
        const u = norm(sub(w.b, w.a));
        n.arms.push({ wallId: w.id, d: u, t: w.thickness, virtual: true, end: 'a' }, { wallId: w.id, d: mul(u, -1), t: w.thickness, virtual: true, end: 'b' });
      }
    }
  }
  const ang = (d: Vec2) => Math.atan2(d.y, d.x);
  const corners = new Map<string, { L: Vec2; R: Vec2; c: Vec2 | null }>(); // key wallId|end
  for (const n of nodes) {
    const arms = [...n.arms].sort((a, b) => ang(a.d) - ang(b.d));
    const real = arms.filter((a) => !a.virtual).length;
    arms.forEach((arm, i) => {
      if (arm.virtual) return;
      const perpPt = (side: 1 | -1) => add(n.p, mul(perpL(arm.d), (side * arm.t) / 2));
      const limit = 4 * Math.max(...arms.map((a) => a.t));
      let L = perpPt(1), R = perpPt(-1);
      if (arms.length > 1) {
        const next = arms[(i + 1) % arms.length], prev = arms[(i - 1 + arms.length) % arms.length];
        // Left face of this arm meets the right face of the next arm counter-clockwise.
        const xl = lineX(perpPt(1), arm.d, add(n.p, mul(perpL(next.d), -next.t / 2)), next.d);
        if (xl && Math.abs(xl.s) < limit && next !== arm) L = xl.pt;
        const xr = lineX(perpPt(-1), arm.d, add(n.p, mul(perpL(prev.d), prev.t / 2)), prev.d);
        if (xr && Math.abs(xr.s) < limit && prev !== arm) R = xr.pt;
      }
      corners.set(`${arm.wallId}|${arm.end}`, { L, R, c: real >= 3 ? n.p : null });
    });
  }
  for (const w of live) {
    const A = corners.get(`${w.id}|a`)!, B = corners.get(`${w.id}|b`)!;
    const poly = [A.L, B.R, ...(B.c ? [B.c] : []), B.L, A.R, ...(A.c ? [A.c] : [])];
    out.set(w.id, dedupe(poly));
  }
  return out;
}

function dedupe(pts: Vec2[]): Vec2[] {
  const o: Vec2[] = [];
  for (const p of pts) if (!o.length || dist(o[o.length - 1], p) > 0.01) o.push(p);
  if (o.length > 1 && dist(o[0], o[o.length - 1]) < 0.01) o.pop();
  return o;
}

// ---------------------------------------------------------------- planar graph of centre lines

export interface FaceEdge { wallId: string; t: number }
export interface Face { pts: Vec2[]; edges: FaceEdge[]; area: number }

interface GEdge { u: number; v: number; wallId: string; t: number }

function segIntersectParams(a: Vec2, b: Vec2, c: Vec2, d: Vec2): [number, number] | null {
  const r = sub(b, a), s = sub(d, c);
  const den = cross(r, s);
  if (Math.abs(den) < 1e-9) return null;
  const t = cross(sub(c, a), s) / den, u = cross(sub(c, a), r) / den;
  const La = Math.hypot(r.x, r.y), Lc = Math.hypot(s.x, s.y);
  const et = TOL / La, eu = TOL / Lc;
  if (t < -et || t > 1 + et || u < -eu || u > 1 + eu) return null;
  return [Math.min(1, Math.max(0, t)), Math.min(1, Math.max(0, u))];
}

/** Builds the planar graph of wall centre lines: split at crossings and T-junctions, close points merged, dangling ends removed. */
export function wallGraph(walls: WallLike[]) {
  const live = walls.filter((w) => dist(w.a, w.b) >= 1);
  const splits = live.map(() => [0, 1]);
  for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
    const p = segIntersectParams(live[i].a, live[i].b, live[j].a, live[j].b);
    if (p) { splits[i].push(p[0]); splits[j].push(p[1]); }
    // Ends lying on the other wall (also for parallel, overlapping walls).
    for (const [x, y, k] of [[i, j, 0], [j, i, 1]] as const) {
      void k;
      for (const q of [live[y].a, live[y].b]) {
        const c = closestOnSegment(q, live[x].a, live[x].b);
        if (c.d < TOL) splits[x].push(c.t);
      }
    }
  }
  const pts: Vec2[] = [];
  const nodeId = (p: Vec2) => {
    for (let k = 0; k < pts.length; k++) if (dist(pts[k], p) < TOL) return k;
    pts.push(p);
    return pts.length - 1;
  };
  const edges: GEdge[] = [];
  const seen = new Map<string, GEdge>();
  live.forEach((w, i) => {
    const ts = [...new Set(splits[i].map((t) => Math.round(t * 1e7) / 1e7))].sort((a, b) => a - b);
    for (let k = 0; k + 1 < ts.length; k++) {
      const p = v2(w.a.x + (w.b.x - w.a.x) * ts[k], w.a.y + (w.b.y - w.a.y) * ts[k]);
      const q = v2(w.a.x + (w.b.x - w.a.x) * ts[k + 1], w.a.y + (w.b.y - w.a.y) * ts[k + 1]);
      const u = nodeId(p), v = nodeId(q);
      if (u === v) continue;
      const key = u < v ? `${u},${v}` : `${v},${u}`;
      const ex = seen.get(key);
      if (ex) { if (w.thickness > ex.t) { ex.t = w.thickness; ex.wallId = w.id; } continue; }
      const e = { u, v, wallId: w.id, t: w.thickness };
      seen.set(key, e);
      edges.push(e);
    }
  });
  // Remove dangling edges (they never close a room).
  let es = edges;
  for (let guard = 0; guard < 10000; guard++) {
    const deg = new Map<number, number>();
    for (const e of es) { deg.set(e.u, (deg.get(e.u) ?? 0) + 1); deg.set(e.v, (deg.get(e.v) ?? 0) + 1); }
    const next = es.filter((e) => (deg.get(e.u) ?? 0) > 1 && (deg.get(e.v) ?? 0) > 1);
    if (next.length === es.length) break;
    es = next;
  }
  return { pts, edges: es };
}

/** All faces of the graph. Bounded faces have area > 0 (counter-clockwise); outer boundaries have area < 0. */
export function graphFaces(g: { pts: Vec2[]; edges: GEdge[] }): Face[] {
  const out = new Map<number, { to: number; e: GEdge; a: number }[]>();
  for (const e of g.edges) {
    for (const [u, v] of [[e.u, e.v], [e.v, e.u]]) {
      if (!out.has(u)) out.set(u, []);
      out.get(u)!.push({ to: v, e, a: Math.atan2(g.pts[v].y - g.pts[u].y, g.pts[v].x - g.pts[u].x) });
    }
  }
  for (const l of out.values()) l.sort((x, y) => x.a - y.a);
  const used = new Set<string>();
  const faces: Face[] = [];
  for (const [u0, list] of out) for (const h0 of list) {
    if (used.has(`${u0},${h0.to}`)) continue;
    const pts: Vec2[] = [], edges: FaceEdge[] = [];
    let u = u0, h = h0, guard = 0;
    while (!used.has(`${u},${h.to}`) && guard++ < 100000) {
      used.add(`${u},${h.to}`);
      pts.push(g.pts[u]);
      edges.push({ wallId: h.e.wallId, t: h.e.t });
      const v = h.to;
      const lv = out.get(v)!;
      const i = lv.findIndex((x) => x.to === u && x.e === h.e);
      const nxt = lv[(i - 1 + lv.length) % lv.length];
      u = v;
      h = nxt;
    }
    if (pts.length >= 3) faces.push({ pts, edges, area: signedArea(pts) });
  }
  return faces;
}

/** Each edge moved to its left by its own distance; consecutive lines intersected. Collinear neighbours are merged. */
export function offsetLeft(pts: Vec2[], dists: number[]): Vec2[] {
  const n = pts.length;
  // Merge collinear consecutive edges with the same offset.
  const P: Vec2[] = [], D: number[] = [];
  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n], cur = pts[i], nxt = pts[(i + 1) % n];
    const dPrev = dists[(i - 1 + n) % n], dCur = dists[i];
    const straight = Math.abs(cross(norm(sub(cur, prev)), norm(sub(nxt, cur)))) < 1e-6 && dot(sub(cur, prev), sub(nxt, cur)) > 0;
    if (straight && Math.abs(dPrev - dCur) < 0.01) continue;
    P.push(cur); D.push(dCur);
  }
  const m = P.length;
  if (m < 3) return [];
  const res: Vec2[] = [];
  for (let i = 0; i < m; i++) {
    const p0 = P[(i - 1 + m) % m], p1 = P[i], p2 = P[(i + 1) % m];
    const e1 = norm(sub(p1, p0)), e2 = norm(sub(p2, p1));
    const d1 = D[(i - 1 + m) % m], d2 = D[i];
    const a = add(p0, mul(perpL(e1), d1)), b = add(p1, mul(perpL(e2), d2));
    const x = lineX(a, e1, b, e2);
    if (x && dist(x.pt, p1) < 6 * Math.max(d1, d2, 1)) res.push(x.pt);
    else { res.push(add(p1, mul(perpL(e1), d1))); res.push(add(p1, mul(perpL(e2), d2))); }
  }
  return dedupe(res);
}

/** Net (inside face) polygon of a bounded face. */
export const faceNet = (f: Face) => offsetLeft(f.pts, f.edges.map((e) => e.t / 2));

/** Outside face of an outer boundary (area < 0): moved away from the building by half the wall thickness. */
export const faceGross = (f: Face) => offsetLeft(f.pts, f.edges.map((e) => e.t / 2));

/** The smallest bounded face that contains p, or null when p is not in a closed area. */
export function faceAt(faces: Face[], p: Vec2): Face | null {
  let best: Face | null = null;
  for (const f of faces) if (f.area > 0 && pointInPoly(p, f.pts) && (!best || f.area < best.area)) best = f;
  return best;
}

/** Outside outlines of the building (one per separate group of walls, nested groups ignored). */
export function grossOutlines(faces: Face[]): Vec2[][] {
  const outer = faces.filter((f) => f.area < 0).map((f) => ({ f, poly: faceGross(f) })).filter((x) => x.poly.length >= 3);
  return outer.filter((x) => !outer.some((y) => y !== x && Math.abs(signedArea(y.f.pts)) > Math.abs(signedArea(x.f.pts)) && pointInPoly(x.f.pts[0], y.f.pts))).map((x) => x.poly);
}

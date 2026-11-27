// Roofs as simple solids: a flat slab with an optional parapet, a shed roof (one pitch) or a gable roof (two pitches
// meeting at a ridge along pts[0]→pts[1]). Pitched roofs use the rectangle along the first edge of the outline.

import { type Vec2, v2 } from '../geometry/vec';
import { dot, insetPolygon, norm, perpL, segmentQuads, signedArea, sub } from '../site/poly';
import { flat, linAlong, type Lin } from '../site/prims';
import type { Roof } from './types';

export interface RoofPrim { poly: Vec2[]; z0: Lin; z1: Lin; part: 'roof' | 'parapet' | 'gable' }

export interface RoofGeom { prims: RoofPrim[]; notes: string[]; top: number; outline: Vec2[]; ridge: [Vec2, Vec2] | null }

/** Rectangle frame along the first edge: origin, axis u (ridge direction), v (across), length, depth. */
export function roofFrame(pts: Vec2[]) {
  const p0 = pts[0], p1 = pts[1];
  const u = norm(sub(p1, p0));
  let v = perpL(u);
  // Depth: the furthest point across the first edge, on the side where the outline lies.
  const ds = pts.map((p) => dot(sub(p, p0), v));
  if (Math.max(...ds) < -Math.min(...ds)) { v = v2(-v.x, -v.y); }
  const us = pts.map((p) => dot(sub(p, p0), u)), vs = pts.map((p) => dot(sub(p, p0), v));
  const u0 = Math.min(...us), u1 = Math.max(...us), v0 = Math.min(...vs), v1 = Math.max(...vs);
  const isRect = pts.length === 4 && Math.abs(Math.abs(signedArea(pts)) - (u1 - u0) * (v1 - v0)) < 1;
  return { p0, u, v, u0, u1, v0, v1, isRect };
}

const at = (f: ReturnType<typeof roofFrame>, a: number, b: number) => v2(f.p0.x + f.u.x * a + f.v.x * b, f.p0.y + f.u.y * a + f.v.y * b);

export function roofGeom(r: Roof, levelElevation: number): RoofGeom {
  const notes: string[] = [];
  const base = levelElevation + r.base;
  const t = Math.max(r.thickness, 1);
  const o = Math.max(0, r.overhang);
  const prims: RoofPrim[] = [];
  if (r.pts.length < 3) return { prims, notes: ['לגג חסר קו מתאר.'], top: base, outline: [], ridge: null };
  if (r.shape === 'flat') {
    const poly = o > 0 ? grow(r.pts, o) : r.pts;
    prims.push({ poly, z0: flat(base), z1: flat(base + t), part: 'roof' });
    if (r.parapet > 0) {
      const inner = insetPolygon(poly, 75);
      for (const q of segmentQuads([...inner, inner[0]], 150)) prims.push({ poly: q.quad, z0: flat(base + t), z1: flat(base + t + r.parapet), part: 'parapet' });
    }
    return { prims, notes, top: base + t + Math.max(0, r.parapet), outline: poly, ridge: null };
  }
  const f = roofFrame(r.pts);
  if (!f.isRect) notes.push('גג משופע נבנה על המלבן החוסם של קו המתאר (לאורך הצלע הראשונה).');
  const tan = Math.tan((Math.min(Math.max(r.slope, 0), 75) * Math.PI) / 180);
  const cosA = Math.cos((Math.min(Math.max(r.slope, 0), 75) * Math.PI) / 180);
  const tv = t / Math.max(cosA, 0.2); // vertical thickness of a pitched slab
  const U0 = f.u0 - o, U1 = f.u1 + o;
  const outline = [at(f, U0, f.v0 - o), at(f, U1, f.v0 - o), at(f, U1, f.v1 + o), at(f, U0, f.v1 + o)];
  if (r.shape === 'shed') {
    // Rises from the first edge (v0) towards the opposite edge (v1).
    const zAt = (vv: number) => base + (vv - f.v0) * tan;
    const A = at(f, 0, f.v0 - o), B = at(f, 0, f.v1 + o);
    const bottom = linAlong(A, B, zAt(f.v0 - o), zAt(f.v1 + o));
    prims.push({ poly: outline, z0: bottom, z1: { ...bottom, c: bottom.c + tv }, part: 'roof' });
    if (r.gableWalls) {
      const wt = 200;
      const Ag = at(f, 0, f.v0), Bg = at(f, 0, f.v1);
      const topLin = linAlong(Ag, Bg, zAt(f.v0), zAt(f.v1));
      prims.push({ poly: [at(f, f.u0, f.v0), at(f, f.u0 + wt, f.v0), at(f, f.u0 + wt, f.v1), at(f, f.u0, f.v1)], z0: flat(base), z1: topLin, part: 'gable' });
      prims.push({ poly: [at(f, f.u1 - wt, f.v0), at(f, f.u1, f.v0), at(f, f.u1, f.v1), at(f, f.u1 - wt, f.v1)], z0: flat(base), z1: topLin, part: 'gable' });
      prims.push({ poly: [at(f, f.u0 + wt, f.v1 - wt), at(f, f.u1 - wt, f.v1 - wt), at(f, f.u1 - wt, f.v1), at(f, f.u0 + wt, f.v1)], z0: flat(base), z1: topLin, part: 'gable' });
    }
    return { prims, notes, top: zAt(f.v1 + o) + tv, outline, ridge: null };
  }
  // Gable: ridge in the middle, along u.
  const vm = (f.v0 + f.v1) / 2, D = (f.v1 - f.v0) / 2;
  const zAt = (vv: number) => base + (D - Math.abs(vv - vm)) * tan;
  const half = (va: number, vb: number) => {
    const A = at(f, 0, va), B = at(f, 0, vb);
    const bottom = linAlong(A, B, zAt(va), zAt(vb));
    prims.push({ poly: [at(f, U0, va), at(f, U1, va), at(f, U1, vb), at(f, U0, vb)], z0: bottom, z1: { ...bottom, c: bottom.c + tv }, part: 'roof' });
  };
  half(f.v0 - o, vm);
  half(vm, f.v1 + o);
  if (r.gableWalls) {
    const wt = 200;
    for (const [ua, ub] of [[f.u0, f.u0 + wt], [f.u1 - wt, f.u1]]) {
      for (const [va, vb] of [[f.v0, vm], [vm, f.v1]]) {
        const top = linAlong(at(f, 0, va), at(f, 0, vb), zAt(va), zAt(vb));
        prims.push({ poly: [at(f, ua, va), at(f, ub, va), at(f, ub, vb), at(f, ua, vb)], z0: flat(base), z1: top, part: 'gable' });
      }
    }
  }
  return { prims, notes, top: zAt(vm) + tv, outline, ridge: [at(f, U0, vm), at(f, U1, vm)] };
}

/** Polygon grown outwards by d (mitred). */
function grow(pts: Vec2[], d: number): Vec2[] {
  const ccw = signedArea(pts) > 0;
  const n = pts.length;
  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n];
    const e1 = norm(sub(p1, p0)), e2 = norm(sub(p2, p1));
    const n1 = ccw ? v2(e1.y, -e1.x) : v2(-e1.y, e1.x), n2 = ccw ? v2(e2.y, -e2.x) : v2(-e2.y, e2.x);
    const bx = n1.x + n2.x, by = n1.y + n2.y;
    const bl = Math.hypot(bx, by) || 1;
    const c = (n1.x * bx + n1.y * by) / bl;
    const k = d / Math.max(c, 0.2);
    out.push(v2(p1.x + (bx / bl) * k, p1.y + (by / bl) * k));
  }
  return out;
}


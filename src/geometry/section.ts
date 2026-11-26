// Exact plane / convex-polyhedron intersection.
//
// The section of a convex solid by a plane is a convex region. We find every
// point where the plane meets the solid's boundary (vertices lying on the plane
// and edges crossing it), map them to the plane's own 2D axes and take their
// convex hull. Special contacts (only a vertex, only an edge, only a face) are
// detected and reported, never hidden.

import {
  type Vec2, type Vec3, add, cross, dot, length, normalize, scale, sub, v2, v3, deg2rad, cross2, dist2,
} from './vec';
import type { Polyhedron } from './solids';

/** Tolerance for "point lies on the plane", in mm. */
export const PLANE_TOL = 1e-6;

/** Plane n·p = d, with n a unit vector. */
export interface Plane {
  n: Vec3;
  d: number;
}

export type PlaneOrientation = 'horizontal' | 'frontal' | 'profile';

export const ORIENTATION_LABELS: Record<PlaneOrientation, string> = {
  horizontal: 'אופקי',
  frontal: 'חזיתי (מקביל ל-π2)',
  profile: 'צדדי (מקביל ל-π3)',
};

export interface PlaneControls {
  orientation: PlaneOrientation;
  /** Tilt of the plane in degrees about its own horizontal axis. */
  tilt: number;
  /** Rotation of the tilted plane about the vertical Z axis, in degrees. */
  azimuth: number;
  /** Signed distance of the plane from the solid's centre, along its normal (mm). */
  offset: number;
}

export function planeFromControls(c: PlaneControls): Plane {
  const t = deg2rad(c.tilt);
  let n: Vec3;
  if (c.orientation === 'horizontal') n = v3(0, -Math.sin(t), Math.cos(t)); // tilt about X
  else if (c.orientation === 'frontal') n = v3(0, Math.cos(t), Math.sin(t)); // tilt about X
  else n = v3(Math.cos(t), 0, Math.sin(t)); // tilt about Y
  const a = deg2rad(c.azimuth);
  const ca = Math.cos(a), sa = Math.sin(a);
  n = normalize(v3(ca * n.x - sa * n.y, sa * n.x + ca * n.y, n.z));
  return { n, d: c.offset };
}

/** Orthonormal axes (u, v) lying in the plane, with u horizontal when possible and u x v = n. */
export function planeBasis(pl: Plane): { origin: Vec3; u: Vec3; v: Vec3 } {
  const Z = v3(0, 0, 1);
  let u = cross(Z, pl.n);
  if (length(u) < 1e-9) u = v3(1, 0, 0);
  u = normalize(u);
  const v = normalize(cross(pl.n, u));
  return { origin: scale(pl.n, pl.d), u, v };
}

export const signedDistance = (pl: Plane, p: Vec3) => dot(pl.n, p) - pl.d;

export function to2D(pl: Plane, p: Vec3): Vec2 {
  const b = planeBasis(pl);
  const q = sub(p, b.origin);
  return v2(dot(q, b.u), dot(q, b.v));
}

export function to3D(pl: Plane, q: Vec2): Vec3 {
  const b = planeBasis(pl);
  return add(b.origin, add(scale(b.u, q.x), scale(b.v, q.y)));
}

/** Convex hull, counter-clockwise, collinear points removed (Andrew's monotone chain). */
export function convexHull(points: Vec2[]): Vec2[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const uniq: Vec2[] = [];
  for (const p of pts) if (!uniq.length || dist2(uniq[uniq.length - 1], p) > PLANE_TOL) uniq.push(p);
  if (uniq.length < 3) return uniq;
  const span = Math.max(dist2(uniq[0], uniq[uniq.length - 1]), 1);
  const tol = 1e-9 * span * span;
  const turn = (o: Vec2, a: Vec2, b: Vec2) => cross2(v2(a.x - o.x, a.y - o.y), v2(b.x - o.x, b.y - o.y));
  const lower: Vec2[] = [];
  for (const p of uniq) {
    while (lower.length >= 2 && turn(lower[lower.length - 2], lower[lower.length - 1], p) <= tol) lower.pop();
    lower.push(p);
  }
  const upper: Vec2[] = [];
  for (let i = uniq.length - 1; i >= 0; i--) {
    const p = uniq[i];
    while (upper.length >= 2 && turn(upper[upper.length - 2], upper[upper.length - 1], p) <= tol) upper.pop();
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

export function polygonArea(pts: Vec2[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) s += cross2(pts[i], pts[(i + 1) % pts.length]);
  return s / 2;
}

export function polygonPerimeter(pts: Vec2[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) s += dist2(pts[i], pts[(i + 1) % pts.length]);
  return s;
}

export type SectionResult =
  | { kind: 'none' }
  | { kind: 'point'; point3: Vec3; point2: Vec2 }
  | { kind: 'segment'; a3: Vec3; b3: Vec3; a2: Vec2; b2: Vec2; length: number }
  | {
      kind: 'polygon';
      /** Section outline, counter-clockwise when seen from the +normal side. */
      pts3: Vec3[];
      pts2: Vec2[];
      area: number;
      perimeter: number;
      /** True when the solid lies entirely on one side: the plane only touches a face. */
      faceContact: boolean;
    };

export interface SectionOutcome {
  result: SectionResult;
  /** True when the whole solid is on one side of the plane (touching or missing). */
  oneSided: boolean;
}

export function sectionPolyhedron(poly: Polyhedron, pl: Plane): SectionOutcome {
  const ds = poly.vertices.map((p) => signedDistance(pl, p));
  const oneSided = ds.every((d) => d >= -PLANE_TOL) || ds.every((d) => d <= PLANE_TOL);
  const hits: Vec3[] = [];
  ds.forEach((d, i) => {
    if (Math.abs(d) <= PLANE_TOL) hits.push(poly.vertices[i]);
  });
  for (const [i, j] of poly.edges) {
    const di = ds[i], dj = ds[j];
    if ((di > PLANE_TOL && dj < -PLANE_TOL) || (di < -PLANE_TOL && dj > PLANE_TOL)) {
      const t = di / (di - dj);
      const a = poly.vertices[i], b = poly.vertices[j];
      hits.push(add(a, scale(sub(b, a), t)));
    }
  }
  if (!hits.length) return { result: { kind: 'none' }, oneSided };

  const flat = hits.map((p) => to2D(pl, p));
  const hull = convexHull(flat);
  if (hull.length === 1) {
    return { result: { kind: 'point', point2: hull[0], point3: to3D(pl, hull[0]) }, oneSided };
  }
  if (hull.length === 2) {
    return {
      result: { kind: 'segment', a2: hull[0], b2: hull[1], a3: to3D(pl, hull[0]), b3: to3D(pl, hull[1]), length: dist2(hull[0], hull[1]) },
      oneSided,
    };
  }
  return {
    result: {
      kind: 'polygon',
      pts2: hull,
      pts3: hull.map((q) => to3D(pl, q)),
      area: polygonArea(hull),
      perimeter: polygonPerimeter(hull),
      faceContact: oneSided,
    },
    oneSided,
  };
}

/** Unit normal of a polygon given in 3D (Newell's method). */
export function polygonNormal(pts: Vec3[]): Vec3 {
  let n = v3(0, 0, 0);
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    n = add(n, v3((a.y - b.y) * (a.z + b.z), (a.z - b.z) * (a.x + b.x), (a.x - b.x) * (a.y + b.y)));
  }
  return normalize(n);
}

/** Which side of the plane a point of the solid lies on, or 0 when on the plane. */
export const side = (pl: Plane, p: Vec3) => {
  const d = signedDistance(pl, p);
  return Math.abs(d) <= PLANE_TOL ? 0 : Math.sign(d);
};

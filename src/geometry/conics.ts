// Analytic description of plane sections of a cylinder or a cone.
// Independent from the faceted computation in section.ts, so each can verify the other.

import { type Vec3, dot, mat3Apply, rad2deg, v3 } from './vec';
import { type Plane, PLANE_TOL as PLANE_TOL_EXPORT } from './section';
import { type SolidParams, solidRotation } from './solids';

export type CurveInfo =
  | { type: 'circle'; radius: number }
  | { type: 'ellipse'; semiMajor: number | null; semiMinor: number | null; truncated?: boolean }
  | { type: 'parabola' }
  | { type: 'hyperbola' }
  | { type: 'lines'; note: string }
  | { type: 'none' };

export interface ConicReport {
  curve: CurveInfo;
  /** Angle between the cutting plane and the solid's axis, degrees (90 = perpendicular). */
  planeAxisAngle: number;
  /** For a cone: half-angle at the apex, degrees. */
  halfAngle?: number;
}

const ANGLE_TOL = 1e-6; // radians

/** Plane expressed in the solid's local frame (axis = local Z, centre at origin). */
function localPlane(p: SolidParams, pl: Plane): Plane {
  const m = solidRotation(p);
  // Inverse of a rotation matrix is its transpose.
  const mt = [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]] as typeof m;
  return { n: mat3Apply(mt, pl.n), d: pl.d };
}

export function conicReport(p: SolidParams, pl: Plane): ConicReport | null {
  if (p.kind !== 'cylinder' && p.kind !== 'cone') return null;
  if (p.r === null || p.h === null) return null;
  const lp = localPlane(p, pl);
  const c = Math.min(1, Math.abs(lp.n.z)); // |cos| of angle between normal and axis
  const planeAxis = Math.asin(c); // angle between plane and axis
  const planeAxisAngle = rad2deg(planeAxis);

  if (p.kind === 'cylinder') {
    if (Math.abs(c - 1) < 1e-12) {
      const z = lp.d * Math.sign(lp.n.z);
      return { curve: Math.abs(z) <= p.h / 2 + PLANE_TOL_EXPORT ? { type: 'circle', radius: p.r } : { type: 'none' }, planeAxisAngle };
    }
    if (c < 1e-12) {
      // Plane parallel to the axis: two straight generators (or tangent / miss).
      const distFromAxis = Math.abs(lp.d); // plane passes at |d| from the axis line through origin
      if (distFromAxis > p.r + PLANE_TOL_EXPORT) return { curve: { type: 'none' }, planeAxisAngle };
      return { curve: { type: 'lines', note: Math.abs(distFromAxis - p.r) <= PLANE_TOL_EXPORT ? 'המישור משיק לגליל לאורך קו' : 'המישור מקביל לציר: החתך מלבן' }, planeAxisAngle };
    }
    // Ellipse centre on the axis at z0, extending +-ext along the axis.
    const z0 = lp.d / lp.n.z;
    const ext = (p.r * Math.sqrt(1 - c * c)) / c;
    if (Math.abs(z0) - ext > p.h / 2 + PLANE_TOL_EXPORT) return { curve: { type: 'none' }, planeAxisAngle };
    const truncated = Math.abs(z0) + ext > p.h / 2 + PLANE_TOL_EXPORT;
    return { curve: { type: 'ellipse', semiMinor: p.r, semiMajor: p.r / c, truncated }, planeAxisAngle };
  }

  // Cone: apex at (0,0,h/2), base radius r at z=-h/2.
  const halfAngle = Math.atan(p.r / p.h);
  const apex: Vec3 = v3(0, 0, p.h / 2);
  const throughApex = Math.abs(dot(lp.n, apex) - lp.d) <= PLANE_TOL_EXPORT;
  const halfDeg = rad2deg(halfAngle);
  if (throughApex) {
    return {
      curve: { type: 'lines', note: planeAxis > halfAngle + ANGLE_TOL ? 'המישור עובר רק בקודקוד' : 'המישור עובר דרך הקודקוד: החתך משולש או קו' },
      planeAxisAngle,
      halfAngle: halfDeg,
    };
  }
  if (Math.abs(c - 1) < 1e-12) {
    // Perpendicular to the axis: circle whose radius shrinks linearly toward the apex.
    const zLocal = lp.d * Math.sign(lp.n.z);
    const radius = (p.r * (p.h / 2 - zLocal)) / p.h;
    const inside = zLocal >= -p.h / 2 - PLANE_TOL_EXPORT && zLocal < p.h / 2;
    return { curve: inside && radius > 0 ? { type: 'circle', radius } : { type: 'none' }, planeAxisAngle, halfAngle: halfDeg };
  }
  if (planeAxis > halfAngle + ANGLE_TOL) return { curve: { type: 'ellipse', semiMajor: null, semiMinor: null }, planeAxisAngle, halfAngle: halfDeg };
  if (Math.abs(planeAxis - halfAngle) <= ANGLE_TOL) return { curve: { type: 'parabola' }, planeAxisAngle, halfAngle: halfDeg };
  return { curve: { type: 'hyperbola' }, planeAxisAngle, halfAngle: halfDeg };
}

export function describeCurve(r: ConicReport): string {
  const c = r.curve;
  switch (c.type) {
    case 'circle': return 'מעגל';
    case 'ellipse': return c.truncated ? 'אליפסה שנחתכת על ידי בסיס הגוף' : 'אליפסה';
    case 'parabola': return 'פרבולה';
    case 'hyperbola': return 'היפרבולה';
    case 'lines': return c.note;
    case 'none': return 'אין חיתוך';
  }
}

// Descriptive geometry (Monge projection) engine.
//
// Convention (matches the course exercise):
//   X - along the ground line 1/2 (the intersection of pi1 and pi2)
//   Y - distance in front of the vertical plane pi2 (depth)
//   Z - height above the horizontal plane pi1
// For a point A=(x,y,z):  A1=(x,y,0) on pi1,  A2=(x,0,z) on pi2,  A3=(0,y,z) on pi3.
//
// The spread-out sheet ("epure") is a 2D drawing in millimetres, with the
// ground line on the horizontal axis and origin O where pi3 meets it.
// 2D coordinates use the mathematical convention (y grows upward).

import { EPS, type Vec2, type Vec3, v2, v3 } from './vec';

export type Coord = number | null;

export interface SpacePoint {
  id: string;
  name: string;
  x: Coord;
  y: Coord;
  z: Coord;
}

export interface EpureSettings {
  /** Side plane pi3 drawn to the right of the origin (default) or to the left. */
  sideRight: boolean;
  /** How A3 is transferred from A1: a 45 degree helper line or a quarter arc. */
  transfer: 'line45' | 'arc';
  showP3: boolean;
}

export const defaultEpureSettings: EpureSettings = { sideRight: true, transfer: 'line45', showP3: true };

const has = (c: Coord): c is number => typeof c === 'number' && Number.isFinite(c);

export function projectOnPi1(p: SpacePoint): Vec3 | null {
  return has(p.x) && has(p.y) ? v3(p.x, p.y, 0) : null;
}
export function projectOnPi2(p: SpacePoint): Vec3 | null {
  return has(p.x) && has(p.z) ? v3(p.x, 0, p.z) : null;
}
export function projectOnPi3(p: SpacePoint): Vec3 | null {
  return has(p.y) && has(p.z) ? v3(0, p.y, p.z) : null;
}

export function missingCoords(p: SpacePoint): ('x' | 'y' | 'z')[] {
  return (['x', 'y', 'z'] as const).filter((k) => !has(p[k]));
}

export type PointPosition =
  | { kind: 'incomplete' }
  | { kind: 'origin' }
  | { kind: 'groundLine' }
  | { kind: 'onPi1'; front: boolean }
  | { kind: 'onPi2'; above: boolean }
  | { kind: 'quadrant'; q: 1 | 2 | 3 | 4 };

/** Where the point lies relative to pi1 and pi2. Quadrant I = in front of pi2 and above pi1. */
export function classifyPoint(p: SpacePoint): PointPosition {
  if (!has(p.y) || !has(p.z)) return { kind: 'incomplete' };
  const onP1 = Math.abs(p.z) < EPS;
  const onP2 = Math.abs(p.y) < EPS;
  if (onP1 && onP2) return has(p.x) && Math.abs(p.x) < EPS ? { kind: 'origin' } : { kind: 'groundLine' };
  if (onP1) return { kind: 'onPi1', front: p.y > 0 };
  if (onP2) return { kind: 'onPi2', above: p.z > 0 };
  if (p.y > 0 && p.z > 0) return { kind: 'quadrant', q: 1 };
  if (p.y < 0 && p.z > 0) return { kind: 'quadrant', q: 2 };
  if (p.y < 0 && p.z < 0) return { kind: 'quadrant', q: 3 };
  return { kind: 'quadrant', q: 4 };
}

export function describePosition(pos: PointPosition): string {
  switch (pos.kind) {
    case 'incomplete': return 'חסרים נתונים לקביעת מיקום';
    case 'origin': return 'בראשית הצירים';
    case 'groundLine': return 'על ציר ההטלה 1/2';
    case 'onPi1': return pos.front ? 'על π1, לפני π2' : 'על π1, מאחורי π2';
    case 'onPi2': return pos.above ? 'על π2, מעל π1' : 'על π2, מתחת ל-π1';
    case 'quadrant': return ['', 'רביע I (לפני π2, מעל π1)', 'רביע II (מאחורי π2, מעל π1)', 'רביע III (מאחורי π2, מתחת ל-π1)', 'רביע IV (לפני π2, מתחת ל-π1)'][pos.q];
  }
}

/** Horizontal epure position of an X coordinate. With pi3 on the right, X grows to the left. */
const ex = (x: number, s: EpureSettings) => (s.sideRight ? -x : x);
/** Horizontal epure position of a Y coordinate in the pi3 field. */
const ey3 = (y: number, s: EpureSettings) => (s.sideRight ? y : -y);

export interface EpurePoint {
  p1: Vec2 | null;
  p2: Vec2 | null;
  p3: Vec2 | null;
}

export function epurePoint(p: SpacePoint, s: EpureSettings): EpurePoint {
  return {
    p1: has(p.x) && has(p.y) ? v2(ex(p.x, s), -p.y) : null,
    p2: has(p.x) && has(p.z) ? v2(ex(p.x, s), p.z) : null,
    p3: s.showP3 && has(p.y) && has(p.z) ? v2(ey3(p.y, s), p.z) : null,
  };
}

/** Inverse mapping used when the user drags a projection on the epure. */
export function fromEpureDrag(which: 1 | 2 | 3, q: Vec2, s: EpureSettings): Partial<Record<'x' | 'y' | 'z', number>> {
  const x = s.sideRight ? -q.x : q.x;
  if (which === 1) return { x, y: -q.y };
  if (which === 2) return { x, z: q.y };
  return { y: s.sideRight ? q.x : -q.x, z: q.y };
}

export type Construction =
  | { kind: 'line'; a: Vec2; b: Vec2; role: 'recall' | 'transfer' }
  | { kind: 'arc'; center: Vec2; r: number; from: Vec2; to: Vec2 };

/** Helper lines that connect the projections of a point on the epure. */
export function epureConstructions(p: SpacePoint, s: EpureSettings): Construction[] {
  const e = epurePoint(p, s);
  const out: Construction[] = [];
  if (e.p1 && e.p2) out.push({ kind: 'line', a: e.p2, b: e.p1, role: 'recall' });
  else if (e.p1) out.push({ kind: 'line', a: e.p1, b: v2(e.p1.x, 0), role: 'recall' });
  else if (e.p2) out.push({ kind: 'line', a: e.p2, b: v2(e.p2.x, 0), role: 'recall' });
  if (e.p3 && has(p.y) && has(p.z)) {
    if (e.p2) out.push({ kind: 'line', a: e.p2, b: e.p3, role: 'recall' });
    const startX = e.p1 ? e.p1.x : 0;
    if (s.transfer === 'line45') {
      // From A1 horizontally to the 45 degree line through O, then vertically to A3.
      const onDiag = v2(ey3(p.y, s), -p.y);
      out.push({ kind: 'line', a: v2(startX, -p.y), b: onDiag, role: 'transfer' });
      out.push({ kind: 'line', a: onDiag, b: e.p3, role: 'transfer' });
    } else {
      // From A1 horizontally to the vertical axis, quarter arc about O, then up to A3.
      const onAxis = v2(0, -p.y);
      const onGround = v2(ey3(p.y, s), 0);
      out.push({ kind: 'line', a: v2(startX, -p.y), b: onAxis, role: 'transfer' });
      out.push({ kind: 'arc', center: v2(0, 0), r: Math.abs(p.y), from: onAxis, to: onGround });
      out.push({ kind: 'line', a: onGround, b: e.p3, role: 'transfer' });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Axonometric (pictorial) view

export type AxonometricKind = 'cavalier' | 'cabinet' | 'isometric';

export interface AxonometricSettings {
  kind: AxonometricKind;
  sideRight: boolean;
}

export function axonometricBasis(s: AxonometricSettings): { ex: Vec2; ey: Vec2; ez: Vec2 } {
  const m = s.sideRight ? 1 : -1;
  if (s.kind === 'isometric') {
    const c = Math.cos(Math.PI / 6), h = Math.sin(Math.PI / 6);
    return { ex: v2(-c * m, -h), ey: v2(c * m, -h), ez: v2(0, 1) };
  }
  // Oblique view: pi2 in true shape, depth drawn at 45 degrees.
  const k = s.kind === 'cavalier' ? 1 : 0.5;
  const d = Math.SQRT1_2 * k;
  return { ex: v2(-m, 0), ey: v2(d * m, -d), ez: v2(0, 1) };
}

/** Parallel projection of a 3D point (mm) to the 2D picture plane (mm). */
export function axonometric(p: Vec3, s: AxonometricSettings): Vec2 {
  const b = axonometricBasis(s);
  return v2(p.x * b.ex.x + p.y * b.ey.x + p.z * b.ez.x, p.x * b.ex.y + p.y * b.ey.y + p.z * b.ez.y);
}

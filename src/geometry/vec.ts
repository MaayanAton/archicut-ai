// Basic 2D/3D vector math. All lengths are in millimetres.
// Pure functions only: no DOM, no React, no storage.

export type Vec2 = { x: number; y: number };
export type Vec3 = { x: number; y: number; z: number };

/** Geometric tolerance in mm. Values closer than this are treated as equal. */
export const EPS = 1e-7;

export const v2 = (x: number, y: number): Vec2 => ({ x, y });
export const v3 = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

export const add = (a: Vec3, b: Vec3): Vec3 => v3(a.x + b.x, a.y + b.y, a.z + b.z);
export const sub = (a: Vec3, b: Vec3): Vec3 => v3(a.x - b.x, a.y - b.y, a.z - b.z);
export const scale = (a: Vec3, k: number): Vec3 => v3(a.x * k, a.y * k, a.z * k);
export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a: Vec3, b: Vec3): Vec3 =>
  v3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
export const length = (a: Vec3): number => Math.sqrt(dot(a, a));
export const dist = (a: Vec3, b: Vec3): number => length(sub(a, b));
export const normalize = (a: Vec3): Vec3 => {
  const l = length(a);
  if (l < EPS) throw new Error('Cannot normalize a zero-length vector');
  return scale(a, 1 / l);
};
export const lerp = (a: Vec3, b: Vec3, t: number): Vec3 =>
  v3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);

export const add2 = (a: Vec2, b: Vec2): Vec2 => v2(a.x + b.x, a.y + b.y);
export const sub2 = (a: Vec2, b: Vec2): Vec2 => v2(a.x - b.x, a.y - b.y);
export const dist2 = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);
export const cross2 = (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x;

export const deg2rad = (d: number) => (d * Math.PI) / 180;
export const rad2deg = (r: number) => (r * 180) / Math.PI;

/** 3x3 rotation matrix stored row-major. */
export type Mat3 = [number, number, number, number, number, number, number, number, number];

export const mat3Identity = (): Mat3 => [1, 0, 0, 0, 1, 0, 0, 0, 1];

export const mat3Mul = (a: Mat3, b: Mat3): Mat3 => {
  const r: number[] = [];
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      r.push(a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j]);
  return r as Mat3;
};

export const mat3Apply = (m: Mat3, p: Vec3): Vec3 =>
  v3(
    m[0] * p.x + m[1] * p.y + m[2] * p.z,
    m[3] * p.x + m[4] * p.y + m[5] * p.z,
    m[6] * p.x + m[7] * p.y + m[8] * p.z,
  );

export const rotX = (a: number): Mat3 => {
  const c = Math.cos(a), s = Math.sin(a);
  return [1, 0, 0, 0, c, -s, 0, s, c];
};
export const rotY = (a: number): Mat3 => {
  const c = Math.cos(a), s = Math.sin(a);
  return [c, 0, s, 0, 1, 0, -s, 0, c];
};
export const rotZ = (a: number): Mat3 => {
  const c = Math.cos(a), s = Math.sin(a);
  return [c, -s, 0, s, c, 0, 0, 0, 1];
};

/** Rotation from angles in degrees, applied X first, then Y, then Z. */
export const rotationXYZ = (xDeg: number, yDeg: number, zDeg: number): Mat3 =>
  mat3Mul(rotZ(deg2rad(zDeg)), mat3Mul(rotY(deg2rad(yDeg)), rotX(deg2rad(xDeg))));

/** Round only for display. Never use the result in further calculations. */
export const fmt = (n: number, digits = 2): string => {
  if (!Number.isFinite(n)) return '—';
  const r = Number(n.toFixed(digits));
  return (Object.is(r, -0) ? 0 : r).toString();
};

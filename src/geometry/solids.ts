// Basic solids as convex polyhedra, in millimetres, centred on the origin.
// Curved solids (cylinder, cone) are built with CURVE_SEGMENTS facets around the
// axis. With 720 facets the largest gap between facet and true surface is
// r * (1 - cos(pi/720)) = r * 0.0000095, i.e. 0.0005 mm for r = 50 mm, far below
// what a printer can show. The exact curve type and dimensions are reported
// analytically by conics.ts.

import { type Mat3, type Vec3, mat3Apply, rotationXYZ, v3 } from './vec';

export const CURVE_SEGMENTS = 720;

export type SolidKind = 'cube' | 'box' | 'cylinder' | 'cone' | 'pyramid' | 'prism';

export interface SolidParams {
  kind: SolidKind;
  /** Cube edge, pyramid base side, prism base side (mm). */
  a: number | null;
  /** Box width along X (mm). */
  w: number | null;
  /** Box depth along Y (mm). */
  d: number | null;
  /** Height along Z for box, cylinder, cone, pyramid, prism (mm). */
  h: number | null;
  /** Radius for cylinder and cone (mm). */
  r: number | null;
  /** Number of sides of the prism base (3 to 12). */
  n: number | null;
  rotX: number;
  rotY: number;
  rotZ: number;
}

export const SOLID_LABELS: Record<SolidKind, string> = {
  cube: 'קובייה',
  box: 'תיבה',
  cylinder: 'גליל',
  cone: 'חרוט',
  pyramid: 'פירמידה',
  prism: 'מנסרה',
};

export interface Polyhedron {
  vertices: Vec3[];
  /** Each face lists vertex indices counter-clockwise when seen from outside. */
  faces: number[][];
  edges: [number, number][];
}

type Field = 'a' | 'w' | 'd' | 'h' | 'r' | 'n';

export const SOLID_FIELDS: Record<SolidKind, { key: Field; label: string }[]> = {
  cube: [{ key: 'a', label: 'אורך צלע' }],
  box: [
    { key: 'w', label: 'רוחב (X)' },
    { key: 'd', label: 'עומק (Y)' },
    { key: 'h', label: 'גובה (Z)' },
  ],
  cylinder: [
    { key: 'r', label: 'רדיוס' },
    { key: 'h', label: 'גובה' },
  ],
  cone: [
    { key: 'r', label: 'רדיוס הבסיס' },
    { key: 'h', label: 'גובה' },
  ],
  pyramid: [
    { key: 'a', label: 'צלע הבסיס (ריבוע)' },
    { key: 'h', label: 'גובה' },
  ],
  prism: [
    { key: 'n', label: 'מספר צלעות הבסיס' },
    { key: 'a', label: 'אורך צלע הבסיס' },
    { key: 'h', label: 'גובה' },
  ],
};

/** Returns a list of problems in plain Hebrew. Empty list = valid. */
export function validateSolid(p: SolidParams): string[] {
  const errors: string[] = [];
  for (const f of SOLID_FIELDS[p.kind]) {
    const val = p[f.key];
    if (val === null || !Number.isFinite(val)) errors.push(`חסר ערך: ${f.label}`);
    else if (f.key === 'n') {
      if (!Number.isInteger(val) || val < 3 || val > 12) errors.push('מספר צלעות הבסיס חייב להיות מספר שלם בין 3 ל-12');
    } else if (val <= 0) errors.push(`${f.label} חייב להיות גדול מ-0`);
  }
  return errors;
}

function edgesFromFaces(faces: number[][]): [number, number][] {
  const seen = new Set<string>();
  const out: [number, number][] = [];
  for (const f of faces)
    for (let i = 0; i < f.length; i++) {
      const a = f[i], b = f[(i + 1) % f.length];
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push([Math.min(a, b), Math.max(a, b)]);
      }
    }
  return out;
}

/** Prism with a regular-ish base polygon (given CCW in XY) extruded from -h/2 to h/2. */
function extrude(base: { x: number; y: number }[], h: number): Polyhedron {
  const n = base.length;
  const vertices = [
    ...base.map((p) => v3(p.x, p.y, -h / 2)),
    ...base.map((p) => v3(p.x, p.y, h / 2)),
  ];
  const bottom = base.map((_, i) => n - 1 - i);
  const top = base.map((_, i) => n + i);
  const sides = base.map((_, i) => [i, (i + 1) % n, n + ((i + 1) % n), n + i]);
  const faces = [bottom, top, ...sides];
  return { vertices, faces, edges: edgesFromFaces(faces) };
}

/** Pyramid/cone: base polygon at -h/2, apex at +h/2. */
function apexSolid(base: { x: number; y: number }[], h: number): Polyhedron {
  const n = base.length;
  const vertices = [...base.map((p) => v3(p.x, p.y, -h / 2)), v3(0, 0, h / 2)];
  const bottom = base.map((_, i) => n - 1 - i);
  const sides = base.map((_, i) => [i, (i + 1) % n, n]);
  const faces = [bottom, ...sides];
  return { vertices, faces, edges: edgesFromFaces(faces) };
}

const regular = (n: number, circumR: number, phase = 0) =>
  Array.from({ length: n }, (_, i) => {
    const t = phase + (2 * Math.PI * i) / n;
    return { x: circumR * Math.cos(t), y: circumR * Math.sin(t) };
  });

/** Local (unrotated) polyhedron. Call validateSolid first. */
export function buildLocalSolid(p: SolidParams): Polyhedron {
  const req = (v: number | null) => {
    if (v === null) throw new Error('missing value');
    return v;
  };
  switch (p.kind) {
    case 'cube': {
      const a = req(p.a);
      return extrude([{ x: -a / 2, y: -a / 2 }, { x: a / 2, y: -a / 2 }, { x: a / 2, y: a / 2 }, { x: -a / 2, y: a / 2 }], a);
    }
    case 'box': {
      const w = req(p.w), d = req(p.d);
      return extrude([{ x: -w / 2, y: -d / 2 }, { x: w / 2, y: -d / 2 }, { x: w / 2, y: d / 2 }, { x: -w / 2, y: d / 2 }], req(p.h));
    }
    case 'cylinder':
      return extrude(regular(CURVE_SEGMENTS, req(p.r)), req(p.h));
    case 'cone':
      return apexSolid(regular(CURVE_SEGMENTS, req(p.r)), req(p.h));
    case 'pyramid': {
      const a = req(p.a);
      return apexSolid([{ x: -a / 2, y: -a / 2 }, { x: a / 2, y: -a / 2 }, { x: a / 2, y: a / 2 }, { x: -a / 2, y: a / 2 }], req(p.h));
    }
    case 'prism': {
      const n = req(p.n), a = req(p.a);
      const circumR = a / (2 * Math.sin(Math.PI / n));
      // Rotate so one base edge is parallel to X (front edge).
      return extrude(regular(n, circumR, -Math.PI / 2 - Math.PI / n), req(p.h));
    }
  }
}

export function solidRotation(p: SolidParams): Mat3 {
  return rotationXYZ(p.rotX, p.rotY, p.rotZ);
}

/** World-space polyhedron (rotation applied about the solid's centre). */
export function buildSolid(p: SolidParams): Polyhedron {
  const local = buildLocalSolid(p);
  const m = solidRotation(p);
  return { ...local, vertices: local.vertices.map((v) => mat3Apply(m, v)) };
}

export function boundingRadius(poly: Polyhedron): number {
  return Math.max(...poly.vertices.map((v) => Math.hypot(v.x, v.y, v.z)));
}

export const isCurved = (k: SolidKind) => k === 'cylinder' || k === 'cone';

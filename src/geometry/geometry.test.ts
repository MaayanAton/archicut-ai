import { describe, expect, it } from 'vitest';
import {
  classifyPoint, defaultEpureSettings, epureConstructions, epurePoint, fromEpureDrag,
  projectOnPi1, projectOnPi2, projectOnPi3, axonometric, type SpacePoint,
} from './projection';
import { buildSolid, validateSolid, type SolidParams } from './solids';
import { planeFromControls, sectionPolyhedron, signedDistance, PLANE_TOL, type Plane } from './section';
import { conicReport } from './conics';
import { v3, normalize, dist2 } from './vec';

const T = 1e-3; // acceptance tolerance in mm
const close = (a: number, b: number, tol = T) => expect(Math.abs(a - b)).toBeLessThan(tol);

const pt = (x: number | null, y: number | null, z: number | null): SpacePoint => ({ id: 'a', name: 'A', x, y, z });

describe('Monge projections', () => {
  it('projects a point onto the three planes', () => {
    const A = pt(30, 20, 40);
    expect(projectOnPi1(A)).toEqual({ x: 30, y: 20, z: 0 });
    expect(projectOnPi2(A)).toEqual({ x: 30, y: 0, z: 40 });
    expect(projectOnPi3(A)).toEqual({ x: 0, y: 20, z: 40 });
  });

  it('places A1 and A2 on the same vertical recall line in the epure', () => {
    const e = epurePoint(pt(30, 20, 40), defaultEpureSettings);
    expect(e.p1!.x).toBe(e.p2!.x);
    expect(e.p2!.y).toBe(40); // height above ground line = z
    expect(e.p1!.y).toBe(-20); // depth below ground line = y
    expect(e.p3).toEqual({ x: 20, y: 40 }); // pi3 on the right: distance y from O
  });

  it('puts A3 at the same height as A2 and mirrors with pi3 on the left', () => {
    const s = { ...defaultEpureSettings, sideRight: false };
    const e = epurePoint(pt(30, 20, 40), s);
    expect(e.p2).toEqual({ x: 30, y: 40 });
    expect(e.p3).toEqual({ x: -20, y: 40 });
  });

  it('45 degree transfer line passes through a point with equal distances', () => {
    const c = epureConstructions(pt(30, 20, 40), defaultEpureSettings);
    const transfer = c.filter((k) => k.kind === 'line' && k.role === 'transfer');
    expect(transfer).toHaveLength(2);
    const corner = (transfer[0] as { b: { x: number; y: number } }).b;
    expect(corner.x).toBeCloseTo(-corner.y, 12); // lies on the 45 degree line
  });

  it('does not invent missing coordinates', () => {
    const e = epurePoint(pt(30, null, 40), defaultEpureSettings);
    expect(e.p1).toBeNull();
    expect(e.p3).toBeNull();
    expect(e.p2).toEqual({ x: -30, y: 40 });
    expect(classifyPoint(pt(30, null, 40)).kind).toBe('incomplete');
  });

  it('drag inverse returns the original coordinates', () => {
    const A = pt(12.5, -7, 33);
    for (const sideRight of [true, false]) {
      const s = { ...defaultEpureSettings, sideRight };
      const e = epurePoint(A, s);
      expect(fromEpureDrag(1, e.p1!, s)).toEqual({ x: 12.5, y: -7 });
      expect(fromEpureDrag(2, e.p2!, s)).toEqual({ x: 12.5, z: 33 });
      expect(fromEpureDrag(3, e.p3!, s)).toEqual({ y: -7, z: 33 });
    }
  });

  it('classifies points on planes, the ground line and in quadrants', () => {
    expect(classifyPoint(pt(10, 20, 0))).toEqual({ kind: 'onPi1', front: true });
    expect(classifyPoint(pt(10, 0, 5))).toEqual({ kind: 'onPi2', above: true });
    expect(classifyPoint(pt(10, 0, 0)).kind).toBe('groundLine');
    expect(classifyPoint(pt(10, 5, 5))).toEqual({ kind: 'quadrant', q: 1 });
    expect(classifyPoint(pt(10, -5, 5))).toEqual({ kind: 'quadrant', q: 2 });
    expect(classifyPoint(pt(10, -5, -5))).toEqual({ kind: 'quadrant', q: 3 });
    expect(classifyPoint(pt(10, 5, -5))).toEqual({ kind: 'quadrant', q: 4 });
  });

  it('cavalier view keeps pi2 in true size', () => {
    const s = { kind: 'cavalier' as const, sideRight: true };
    const a = axonometric(v3(0, 0, 0), s), b = axonometric(v3(50, 0, 0), s), c = axonometric(v3(0, 0, 30), s);
    close(dist2(a, b), 50);
    close(dist2(a, c), 30);
  });
});

const cube = (a: number, rot = { rotX: 0, rotY: 0, rotZ: 0 }): SolidParams => ({ kind: 'cube', a, w: null, d: null, h: null, r: null, n: null, ...rot });
const solid = (p: Partial<SolidParams> & { kind: SolidParams['kind'] }): SolidParams =>
  ({ a: null, w: null, d: null, h: null, r: null, n: null, rotX: 0, rotY: 0, rotZ: 0, ...p });
const plane = (n: [number, number, number], d: number): Plane => ({ n: normalize(v3(...n)), d });

function sortedEdges(pts: { x: number; y: number }[]) {
  return pts.map((p, i) => dist2(p, pts[(i + 1) % pts.length])).sort((a, b) => a - b);
}

describe('Cube sections', () => {
  const poly = buildSolid(cube(100));

  it('horizontal cut through the middle is a 100 x 100 square', () => {
    const r = sectionPolyhedron(poly, plane([0, 0, 1], 0)).result;
    expect(r.kind).toBe('polygon');
    if (r.kind !== 'polygon') return;
    expect(r.pts2).toHaveLength(4);
    close(r.area, 10000);
    sortedEdges(r.pts2).forEach((e) => close(e, 100));
  });

  it('diagonal cut through two opposite edges is a 100 x 141.421 rectangle', () => {
    const r = sectionPolyhedron(poly, plane([0, -1, 1], 0)).result;
    expect(r.kind).toBe('polygon');
    if (r.kind !== 'polygon') return;
    expect(r.pts2).toHaveLength(4);
    const e = sortedEdges(r.pts2);
    close(e[0], 100); close(e[1], 100); close(e[2], 141.421356); close(e[3], 141.421356);
    close(r.area, 100 * 100 * Math.SQRT2);
  });

  it('cut through three corners next to a vertex is an equilateral triangle', () => {
    // Corners (50,-50,-50), (-50,50,-50), (-50,-50,50): plane x+y+z = -50.
    const r = sectionPolyhedron(poly, plane([1, 1, 1], -50 / Math.sqrt(3))).result;
    expect(r.kind).toBe('polygon');
    if (r.kind !== 'polygon') return;
    expect(r.pts2).toHaveLength(3);
    sortedEdges(r.pts2).forEach((e) => close(e, 141.421356));
  });

  it('cut through the centre perpendicular to the main diagonal is a regular hexagon', () => {
    const r = sectionPolyhedron(poly, plane([1, 1, 1], 0)).result;
    expect(r.kind).toBe('polygon');
    if (r.kind !== 'polygon') return;
    expect(r.pts2).toHaveLength(6);
    sortedEdges(r.pts2).forEach((e) => close(e, 70.710678));
  });

  it('the same cut via the user controls (tilt 54.7356 deg, azimuth 45 deg) gives the hexagon', () => {
    const tilt = (Math.acos(1 / Math.sqrt(3)) * 180) / Math.PI;
    const pl = planeFromControls({ orientation: 'horizontal', tilt, azimuth: 135, offset: 0 });
    close(pl.n.x, 1 / Math.sqrt(3), 1e-9); close(pl.n.y, 1 / Math.sqrt(3), 1e-9);
    const r = sectionPolyhedron(poly, pl).result;
    expect(r.kind === 'polygon' && r.pts2.length).toBe(6);
  });

  it('plane touching a single vertex returns a point, not a polygon', () => {
    const out = sectionPolyhedron(poly, plane([1, 1, 1], 150 / Math.sqrt(3)));
    expect(out.result.kind).toBe('point');
    expect(out.oneSided).toBe(true);
  });

  it('plane touching only an edge returns a segment of length 100', () => {
    const out = sectionPolyhedron(poly, plane([0, 1, 1], 100 / Math.sqrt(2)));
    expect(out.result.kind).toBe('segment');
    if (out.result.kind === 'segment') close(out.result.length, 100);
  });

  it('plane lying on a face is reported as face contact', () => {
    const out = sectionPolyhedron(poly, plane([0, 0, 1], 50));
    expect(out.result.kind).toBe('polygon');
    if (out.result.kind === 'polygon') {
      expect(out.result.faceContact).toBe(true);
      close(out.result.area, 10000);
    }
  });

  it('plane outside the cube returns no section', () => {
    expect(sectionPolyhedron(poly, plane([0, 0, 1], 50.01)).result.kind).toBe('none');
  });

  it('every section vertex lies on the plane and inside the cube, for many random planes', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
    for (let k = 0; k < 2000; k++) {
      const pl = plane([rnd(), rnd(), rnd() + 1e-3], rnd() * 80);
      const r = sectionPolyhedron(poly, pl).result;
      if (r.kind !== 'polygon') continue;
      for (const p of r.pts3) {
        expect(Math.abs(signedDistance(pl, p))).toBeLessThan(1e-6);
        for (const c of [p.x, p.y, p.z]) expect(Math.abs(c)).toBeLessThan(50 + 1e-6);
      }
      expect(r.area).toBeGreaterThan(0); // closed counter-clockwise polygon
    }
  });

  it('changing the cube size scales the section', () => {
    const big = buildSolid(cube(240));
    const r = sectionPolyhedron(big, plane([0, -1, 1], 0)).result;
    if (r.kind !== 'polygon') throw new Error('expected polygon');
    close(r.area, 240 * 240 * Math.SQRT2);
  });

  it('a rotated cube gives the same section as a rotated plane', () => {
    const rotated = buildSolid(cube(100, { rotX: 45, rotY: 0, rotZ: 0 }));
    const r = sectionPolyhedron(rotated, plane([0, 0, 1], 0)).result;
    if (r.kind !== 'polygon') throw new Error('expected polygon');
    close(r.area, 100 * 100 * Math.SQRT2);
  });
});

describe('Other solids', () => {
  it('box horizontal section is w x d', () => {
    const r = sectionPolyhedron(buildSolid(solid({ kind: 'box', w: 120, d: 80, h: 60 })), plane([0, 0, 1], 10)).result;
    if (r.kind !== 'polygon') throw new Error('expected polygon');
    close(r.area, 9600);
  });

  it('pyramid horizontal section at mid height is half the base side', () => {
    const r = sectionPolyhedron(buildSolid(solid({ kind: 'pyramid', a: 100, h: 120 })), plane([0, 0, 1], 0)).result;
    if (r.kind !== 'polygon') throw new Error('expected polygon');
    sortedEdges(r.pts2).forEach((e) => close(e, 50));
  });

  it('pyramid touched only at the apex gives a point', () => {
    expect(sectionPolyhedron(buildSolid(solid({ kind: 'pyramid', a: 100, h: 120 })), plane([0, 0, 1], 60)).result.kind).toBe('point');
  });

  it('triangular prism horizontal section is an equilateral triangle', () => {
    const r = sectionPolyhedron(buildSolid(solid({ kind: 'prism', n: 3, a: 60, h: 100 })), plane([0, 0, 1], 0)).result;
    if (r.kind !== 'polygon') throw new Error('expected polygon');
    expect(r.pts2).toHaveLength(3);
    sortedEdges(r.pts2).forEach((e) => close(e, 60));
  });

  it('validation lists missing and invalid values in Hebrew', () => {
    expect(validateSolid(solid({ kind: 'cylinder', r: null, h: -5 }))).toEqual(['חסר ערך: רדיוס', 'גובה חייב להיות גדול מ-0']);
    expect(validateSolid(solid({ kind: 'prism', n: 2.5, a: 10, h: 10 }))).toHaveLength(1);
    expect(validateSolid(cube(10))).toEqual([]);
  });
});

describe('Cylinder and cone sections', () => {
  const cyl = solid({ kind: 'cylinder', r: 50, h: 300 });
  const cylPoly = buildSolid(cyl);

  it('horizontal cut is a circle of the cylinder radius (area pi r^2 within 0.01%)', () => {
    const pl = plane([0, 0, 1], 0);
    const r = sectionPolyhedron(cylPoly, pl).result;
    if (r.kind !== 'polygon') throw new Error('expected polygon');
    expect(Math.abs(r.area - Math.PI * 2500) / (Math.PI * 2500)).toBeLessThan(1e-4);
    expect(conicReport(cyl, pl)!.curve).toEqual({ type: 'circle', radius: 50 });
  });

  it('tilted cut is an ellipse with semi-axes r and r / cos(theta)', () => {
    const theta = (30 * Math.PI) / 180;
    const pl = planeFromControls({ orientation: 'horizontal', tilt: 30, azimuth: 0, offset: 0 });
    const r = sectionPolyhedron(cylPoly, pl).result;
    if (r.kind !== 'polygon') throw new Error('expected polygon');
    const xs = r.pts2.map((p) => p.x), ys = r.pts2.map((p) => p.y);
    close((Math.max(...xs) - Math.min(...xs)) / 2, 50, 0.01);
    close((Math.max(...ys) - Math.min(...ys)) / 2, 50 / Math.cos(theta), 0.01);
    const rep = conicReport(cyl, pl)!;
    expect(rep.curve.type).toBe('ellipse');
    if (rep.curve.type === 'ellipse') {
      close(rep.curve.semiMajor!, 50 / Math.cos(theta), 1e-9);
      expect(rep.curve.truncated).toBe(false);
    }
  });

  it('steep cut that reaches the bases is reported as a truncated ellipse', () => {
    const pl = planeFromControls({ orientation: 'horizontal', tilt: 80, azimuth: 0, offset: 0 });
    const rep = conicReport(cyl, pl)!;
    expect(rep.curve.type === 'ellipse' && rep.curve.truncated).toBe(true);
    expect(sectionPolyhedron(cylPoly, pl).result.kind).toBe('polygon');
  });

  it('plane parallel to the axis gives a rectangle', () => {
    const pl = plane([1, 0, 0], 30);
    const r = sectionPolyhedron(cylPoly, pl).result;
    if (r.kind !== 'polygon') throw new Error('expected polygon');
    const chord = 2 * Math.sqrt(50 * 50 - 30 * 30);
    close(r.area, chord * 300, 0.5);
    expect(conicReport(cyl, pl)!.curve.type).toBe('lines');
  });

  it('plane tangent to the cylinder side gives a segment along a generator', () => {
    const out = sectionPolyhedron(cylPoly, plane([1, 0, 0], 50));
    expect(out.result.kind).toBe('segment');
    if (out.result.kind === 'segment') close(out.result.length, 300);
  });

  const cone = solid({ kind: 'cone', r: 50, h: 100 });
  const conePoly = buildSolid(cone);
  const alpha = (Math.atan(50 / 100) * 180) / Math.PI; // half angle 26.565 deg

  it('cone: perpendicular cut is a circle with radius shrinking toward the apex', () => {
    const pl = plane([0, 0, 1], 0); // mid height -> radius 25
    const rep = conicReport(cone, pl)!;
    expect(rep.curve).toEqual({ type: 'circle', radius: 25 });
    const r = sectionPolyhedron(conePoly, pl).result;
    if (r.kind !== 'polygon') throw new Error('expected polygon');
    expect(Math.abs(r.area - Math.PI * 625) / (Math.PI * 625)).toBeLessThan(1e-4);
  });

  it('cone: shallow tilt gives an ellipse, tilt equal to the slope gives a parabola, steeper a hyperbola', () => {
    // planeAxis angle = 90 - tilt for a tilted horizontal plane.
    const mk = (tilt: number) => conicReport(cone, planeFromControls({ orientation: 'horizontal', tilt, azimuth: 0, offset: -10 }))!.curve.type;
    expect(mk(20)).toBe('ellipse');
    expect(mk(90 - alpha)).toBe('parabola');
    expect(mk(80)).toBe('hyperbola');
  });

  it('cone: plane through the apex is reported as degenerate', () => {
    const pl = planeFromControls({ orientation: 'frontal', tilt: 0, azimuth: 0, offset: 0 });
    expect(conicReport(cone, pl)!.curve.type).toBe('lines');
    const r = sectionPolyhedron(conePoly, pl).result;
    expect(r.kind).toBe('polygon'); // triangle through the axis
    if (r.kind === 'polygon') close(r.area, 0.5 * 100 * 100, 0.01);
  });

  it('section vertices of curved solids lie on the plane', () => {
    const pl = planeFromControls({ orientation: 'profile', tilt: 25, azimuth: 10, offset: 5 });
    const r = sectionPolyhedron(conePoly, pl).result;
    if (r.kind !== 'polygon') throw new Error('expected polygon');
    r.pts3.forEach((p) => expect(Math.abs(signedDistance(pl, p))).toBeLessThan(PLANE_TOL));
  });
});

import { describe, expect, it } from 'vitest';
import { computeSection } from './sectionCompute';
import type { SectionData } from '../document/types';
import { emptySolid } from '../document/factory';

const cube = (plane: Partial<SectionData['plane']>): SectionData => ({
  solid: { ...emptySolid('cube'), a: 100 },
  plane: { orientation: 'horizontal', tilt: 0, azimuth: 0, offset: 0, ...plane },
});

describe('section summary for the UI', () => {
  it('a plane 0.00004 mm inside a corner is reported as a vertex touch, not a zero-area triangle', () => {
    const c = computeSection(cube({ tilt: 54.7356, azimuth: 135, offset: 86.6025 }));
    expect(c.outcome!.result.kind).toBe('point');
    expect(c.summary).toContain('כמעט נוגע בקודקוד');
  });
  it('a plane 0.001 mm inside an edge is reported as an edge touch', () => {
    const c = computeSection(cube({ tilt: 45, offset: 70.7097 }));
    expect(c.outcome!.result.kind).toBe('segment');
  });
  it('a real small corner cut stays a triangle', () => {
    const c = computeSection(cube({ tilt: 54.7356, azimuth: 135, offset: 80 }));
    expect(c.outcome!.result.kind).toBe('polygon');
    expect(c.warnings).toHaveLength(0);
  });
  it('missing dimensions give errors and no result', () => {
    const d = cube({});
    d.solid = emptySolid('cylinder');
    const c = computeSection(d);
    expect(c.errors.length).toBeGreaterThan(0);
    expect(c.outcome).toBeNull();
  });
});

describe('exact measures for curved sections', () => {
  const cyl = (tilt: number) => computeSection({
    solid: { ...emptySolid('cylinder'), r: 1000, h: 5000 },
    plane: { orientation: 'horizontal', tilt, azimuth: 0, offset: 0 },
  });
  it('circle area is pi r^2 exactly, not the 720-gon area', () => {
    const c = cyl(0);
    expect(c.measures!.exact).toBe(true);
    expect(c.measures!.area).toBeCloseTo(Math.PI * 1e6, 6);
    expect(c.measures!.perimeter).toBeCloseTo(2000 * Math.PI, 9);
  });
  it('ellipse area pi a b and perimeter match known values', () => {
    const c = cyl(60); // a = r / cos 60 = 2000, b = 1000
    expect(c.measures!.area).toBeCloseTo(Math.PI * 2000 * 1000, 4);
    // Perimeter of the 2000 x 1000 semi-axes ellipse: 9688.448220547...
    expect(c.measures!.perimeter).toBeCloseTo(9688.448220547, 6);
  });
});

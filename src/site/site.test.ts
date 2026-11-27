import { describe, expect, it } from 'vitest';
import { v2 } from '../geometry/vec';
import { parseMetersToMm, fmtLevel } from './units';
import { polyArea, polylineLength, segmentInsideIntervals, triangulate, ribbon } from './poly';
import { buildTerrain, contours, delaunay, slopeBetween } from './terrain';
import { emptySite, migrateSite, SiteDataError } from './migrate';
import { makeElement } from './library';
import { buildSiteModel, computeSection } from './section';
import type { SiteData, SiteElement, SiteSection } from './types';
import { elementSolids } from './prims';
import { makeProjectFile, parseProjectFile } from '../storage/storage';
import { newProject } from '../document/factory';

let n = 0;
const id = () => `t${++n}`;
const rect = (x0: number, y0: number, x1: number, y1: number) => [v2(x0, y0), v2(x1, y0), v2(x1, y1), v2(x0, y1)];
const site = (els: SiteElement[] = [], patch: Partial<SiteData> = {}): SiteData => ({ ...emptySite(), elements: els, ...patch });
const lot = (w = 60000, h = 40000) => makeElement('lot', { type: 'area', pts: rect(0, 0, w, h), curved: false }, id());
const sec = (a: [number, number], b: [number, number], depth = 10000, side: 1 | -1 = 1): SiteSection => ({ id: id(), label: 'A', mode: 'section', a: v2(...a), b: v2(...b), side, depth, showDims: true, showLevels: true });

describe('metre input', () => {
  it('converts typed metres to millimetres exactly', () => {
    expect(parseMetersToMm('12.345')).toBe(12345);
    expect(parseMetersToMm('1.005')).toBe(1005);
    expect(parseMetersToMm('0,5')).toBe(500);
    expect(parseMetersToMm('-0.45')).toBe(-450);
    expect(parseMetersToMm('60')).toBe(60000);
    expect(parseMetersToMm('1.2345')).toBe(1234.5);
    expect(parseMetersToMm('')).toBeNull();
    expect(parseMetersToMm('abc')).toBe('invalid');
    expect(parseMetersToMm('1.2.3')).toBe('invalid');
  });
  it('formats levels the architectural way', () => {
    expect(fmtLevel(0)).toBe('±0.00');
    expect(fmtLevel(450)).toBe('+0.45');
    expect(fmtLevel(-1200)).toBe('-1.20');
  });
});

describe('areas and perimeters', () => {
  it('60×40 m lot: 2400 m², perimeter 200 m', () => {
    const p = rect(0, 0, 60000, 40000);
    expect(polyArea(p) / 1e6).toBe(2400);
    expect(polylineLength(p, true) / 1000).toBe(200);
  });
  it('L-shaped polygon', () => {
    const p = [v2(0, 0), v2(10000, 0), v2(10000, 4000), v2(4000, 4000), v2(4000, 10000), v2(0, 10000)];
    expect(polyArea(p) / 1e6).toBeCloseTo(64, 9);
    expect(triangulate(p).length).toBe(4);
  });
  it('a line through a U-shaped polygon is inside it in two separate parts', () => {
    const U = [v2(0, 0), v2(30, 0), v2(30, 30), v2(20, 30), v2(20, 10), v2(10, 10), v2(10, 30), v2(0, 30)];
    const iv = segmentInsideIntervals(v2(-10, 20), v2(40, 20), U);
    expect(iv.length).toBe(2);
    expect(iv[0][0] * 50 - 10).toBeCloseTo(0, 9);
    expect(iv[0][1] * 50 - 10).toBeCloseTo(10, 9);
    expect(iv[1][0] * 50 - 10).toBeCloseTo(20, 9);
  });
  it('a 2 m wide path ribbon has the right area', () => {
    expect(polyArea(ribbon([v2(0, 0), v2(10000, 0)], 2000)) / 1e6).toBeCloseTo(20, 9);
  });
});

describe('terrain', () => {
  it('without height data the ground is flat at the base level, and says so', () => {
    const m = buildTerrain(site([lot()]));
    expect(m.z(v2(30000, 20000))).toBe(0);
    expect(m.sample(v2(1000, 1000)).src).toBe('base');
  });
  it('Delaunay of a square gives two triangles', () => {
    expect(delaunay(rect(0, 0, 10, 10)).length).toBe(2);
  });
  it('a plane through the height points is reproduced exactly (5% slope along X)', () => {
    const pts = [[0, 0], [60000, 0], [60000, 40000], [0, 40000], [30000, 20000]].map(([x, y], i) => ({ id: `h${i}`, p: v2(x, y), z: x * 0.05, source: 'survey' as const, note: '' }));
    const d = site([lot()], { terrain: { ...emptySite().terrain, points: pts } });
    const m = buildTerrain(d);
    expect(m.z(v2(12345, 6789))).toBeCloseTo(12345 * 0.05, 6);
    expect(m.sample(v2(30000, 20000))).toEqual({ z: 1500, src: 'survey' });
    expect(m.sample(v2(10000, 30000)).src).toBe('interpolated');
    const s = slopeBetween(m, v2(10000, 5000), v2(20000, 5000));
    expect(s.ratio).toBeCloseTo(0.05, 9);
    expect(s.dz).toBeCloseTo(500, 6);
  });
  it('a level area (terrace) sets the ground to its level', () => {
    const t = makeElement('terrace', { type: 'area', pts: rect(10000, 10000, 20000, 20000), curved: false }, id(), { params: { level: 450 } });
    const m = buildTerrain(site([lot(), t]));
    expect(m.sample(v2(15000, 15000))).toEqual({ z: 450, src: 'terrace' });
    expect(m.z(v2(5000, 5000))).toBe(0);
  });
  it('a designed hill adds its height at the centre and nothing outside its radius', () => {
    const d = site([lot()], { terrain: { ...emptySite().terrain, mounds: [{ id: 'm', c: v2(30000, 20000), r: 8000, h: 1500 }] } });
    const m = buildTerrain(d);
    expect(m.z(v2(30000, 20000))).toBeCloseTo(1500, 9);
    expect(m.z(v2(30000, 29000))).toBe(0);
    expect(m.sample(v2(30000, 20000)).src).toBe('design');
  });
  it('contours of a 5% slope run straight across, at the right places', () => {
    const pts = [[0, 0], [60000, 0], [60000, 40000], [0, 40000]].map(([x, y], i) => ({ id: `h${i}`, p: v2(x, y), z: x * 0.05, source: 'manual' as const, note: '' }));
    const m = buildTerrain(site([lot()], { terrain: { ...emptySite().terrain, points: pts } }));
    const c = contours(m, 500);
    expect(c.length).toBe(7); // 0, 0.5 ... 3.0 m
    const one = c.find((x) => x.level === 1000)!;
    const xs = one.lines.flat().map((p) => p.x);
    for (const x of xs) expect(x).toBeCloseTo(20000, 3);
  });
});

describe('site sections', () => {
  it('flat ground: a wall crossed at right angles is cut as 0.20 × 1.20 m', () => {
    const wall = makeElement('wall', { type: 'line', pts: [v2(20000, 5000), v2(20000, 35000)], curved: false }, id());
    const r = computeSection(buildSiteModel(site([lot(), wall])), sec([0, 20000], [60000, 20000]))!;
    expect(r.ground.every((g) => g.z === 0)).toBe(true);
    const c = r.cut.filter((x) => x.id === wall.id);
    expect(c.length).toBe(1);
    const ss = c[0].poly!.map((q) => q.s), zs = c[0].poly!.map((q) => q.z);
    expect(Math.max(...ss) - Math.min(...ss)).toBeCloseTo(200, 6);
    expect(Math.min(...ss)).toBeCloseTo(19900, 6);
    expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo(1200, 6);
  });

  it('sloped ground: the profile follows the terrain exactly, and a wall sits on it', () => {
    const pts = [[0, 0], [60000, 0], [60000, 40000], [0, 40000], [30000, 20000]].map(([x, y], i) => ({ id: `h${i}`, p: v2(x, y), z: x * 0.05, source: 'survey' as const, note: '' }));
    const wall = makeElement('wall', { type: 'line', pts: [v2(40000, 5000), v2(40000, 35000)], curved: false }, id());
    const d = site([lot(), wall], { terrain: { ...emptySite().terrain, points: pts } });
    const r = computeSection(buildSiteModel(d), sec([0, 12000], [60000, 12000]))!;
    for (const g of r.ground) expect(g.z).toBeCloseTo(g.s * 0.05, 6);
    const c = r.cut.find((x) => x.id === wall.id)!;
    const bottom = Math.min(...c.poly!.map((q) => q.z));
    expect(bottom).toBeCloseTo(40000 * 0.05, 6); // the wall's bottom follows the ground along its centre line
    // Across the slope the ground is level.
    const across = computeSection(buildSiteModel(d), sec([15000, 0], [15000, 40000]))!;
    for (const g of across.ground) expect(g.z).toBeCloseTo(750, 6);
  });

  it('a terrace edge makes a vertical step in the profile', () => {
    const t = makeElement('terrace', { type: 'area', pts: rect(20000, 0, 40000, 40000), curved: false }, id(), { params: { level: 900 } });
    const r = computeSection(buildSiteModel(site([lot(), t])), sec([0, 20000], [60000, 20000]))!;
    const near = r.ground.filter((g) => Math.abs(g.s - 20000) < 1);
    expect(Math.min(...near.map((g) => g.z))).toBe(0);
    expect(Math.max(...near.map((g) => g.z))).toBe(900);
  });

  it('cuts through several elements, and tells cut elements from those beyond the plane', () => {
    const tree = makeElement('tree-round', { type: 'point', p: v2(10000, 20000 + 1500), rot: 0 }, id()); // 1.5 m off the line, crown r = 3 m
    const bench = makeElement('bench', { type: 'point', p: v2(20000, 20000 + 4000), rot: 0 }, id()); // 4 m beyond
    const behind = makeElement('bench', { type: 'point', p: v2(30000, 20000 - 4000), rot: 0 }, id()); // behind the viewer
    const far = makeElement('bin', { type: 'point', p: v2(40000, 20000 + 15000), rot: 0 }, id()); // beyond the depth
    const wall = makeElement('wall', { type: 'line', pts: [v2(50000, 10000), v2(50000, 30000)], curved: false }, id());
    const r = computeSection(buildSiteModel(site([lot(), tree, bench, behind, far, wall])), sec([0, 20000], [60000, 20000], 10000, 1))!;
    expect(r.cutIds).toContain(tree.id);
    expect(r.cutIds).toContain(wall.id);
    expect(r.beyondIds).toContain(bench.id);
    expect(r.cutIds).not.toContain(bench.id);
    expect(r.beyondIds).not.toContain(behind.id);
    expect(r.beyondIds).not.toContain(far.id);
    // The tree crown is cut as an ellipse narrower than the full crown: r' = r·√(1 − (d/r)²).
    const crown = r.cut.find((c) => c.id === tree.id && c.ell)!;
    expect(crown.ell!.rs).toBeCloseTo(3000 * Math.sqrt(1 - 0.25), 6);
    // The trunk (r = 0.175 m, 1.5 m away) is not cut.
    expect(r.cut.some((c) => c.id === tree.id && c.role === 'trunk')).toBe(false);
    // Turning around (looking the other way) swaps what is visible.
    const back = computeSection(buildSiteModel(site([lot(), tree, bench, behind, far, wall])), sec([0, 20000], [60000, 20000], 10000, -1))!;
    expect(back.beyondIds).toContain(behind.id);
    expect(back.beyondIds).not.toContain(bench.id);
  });

  it('the section changes when the model changes', () => {
    const wall = makeElement('wall', { type: 'line', pts: [v2(20000, 5000), v2(20000, 35000)], curved: false }, id());
    const s = sec([0, 20000], [60000, 20000]);
    const h1 = Math.max(...computeSection(buildSiteModel(site([lot(), wall])), s)!.cut[0].poly!.map((q) => q.z));
    const wall2 = { ...wall, params: { ...wall.params, h: 2500 } };
    const h2 = Math.max(...computeSection(buildSiteModel(site([lot(), wall2])), s)!.cut[0].poly!.map((q) => q.z));
    expect(h1).toBeCloseTo(1200, 6);
    expect(h2).toBeCloseTo(2500, 6);
  });

  it('stairs cut along their direction show each step; a ramp shows its slope', () => {
    const st = makeElement('stairs', { type: 'point', p: v2(30000, 20000), rot: -90 }, id(), { params: { w: 2000, d: 1800, rise: 900, n: 6 } }); // up towards +X
    const r = computeSection(buildSiteModel(site([lot(), st])), sec([0, 20000], [60000, 20000]))!;
    const steps = r.cut.filter((c) => c.id === st.id).map((c) => Math.max(...c.poly!.map((q) => q.z))).sort((a, b) => a - b);
    expect(steps.length).toBe(6);
    steps.forEach((z, i) => expect(z).toBeCloseTo((900 * (i + 1)) / 6, 6));
    const rp = makeElement('ramp', { type: 'point', p: v2(30000, 20000), rot: -90 }, id(), { params: { w: 1500, d: 6000, rise: 400 } });
    const r2 = computeSection(buildSiteModel(site([lot(), rp])), sec([0, 20000], [60000, 20000]))!;
    const poly = r2.cut.find((c) => c.id === rp.id)!.poly!;
    const top = [poly[2], poly[3]].sort((a, b) => a.s - b.s);
    expect(top[top.length - 1].z - top[0].z).toBeCloseTo(400, 6);
    expect(top[top.length - 1].s - top[0].s).toBeCloseTo(6000, 6);
  });

  it('a pond is cut as an empty basin with water below the rim', () => {
    const pond = makeElement('pond', { type: 'area', pts: rect(25000, 15000, 35000, 25000), curved: false }, id(), { params: { depth: 600 } });
    const r = computeSection(buildSiteModel(site([lot(), pond])), sec([0, 20000], [60000, 20000]))!;
    const water = r.cut.find((c) => c.id === pond.id && c.role === 'water')!;
    expect(Math.max(...water.poly!.map((q) => q.z))).toBeCloseTo(-100, 6);
    expect(Math.min(...water.poly!.map((q) => q.z))).toBeCloseTo(-600, 6);
  });

  it('elements on hidden layers are left out', () => {
    const wall = makeElement('wall', { type: 'line', pts: [v2(20000, 5000), v2(20000, 35000)], curved: false }, id());
    const d = site([lot(), wall]);
    d.layers = d.layers.map((l) => (l.id === 'built' ? { ...l, visible: false } : l));
    expect(computeSection(buildSiteModel(d), sec([0, 20000], [60000, 20000]))!.cut.length).toBe(0);
  });

  it('every library element produces valid solids', () => {
    const m = buildTerrain(site([lot()]));
    for (const kind of ['tree-round', 'tree-conifer', 'tree-columnar', 'palm', 'shrub', 'flowers', 'bench', 'table', 'bin', 'lamp', 'bike', 'drink', 'pergola', 'shed', 'gate', 'stairs', 'ramp', 'play', 'fountain', 'fitness']) {
      const s = elementSolids(makeElement(kind, { type: 'point', p: v2(5000, 5000), rot: 30 }, id()), m);
      expect(s.prims.length, kind).toBeGreaterThan(0);
      for (const pr of s.prims) if (pr.t === 'prism') expect(pr.poly.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)), kind).toBe(true);
    }
  });
});

describe('project files and migration', () => {
  it('fills in missing fields without touching existing values', () => {
    const { data, dropped } = migrateSite({ elements: [{ id: 'a', kind: 'bench', geom: { type: 'point', p: { x: 1, y: 2 }, rot: 0 }, params: { w: 2500 } }, { id: 'bad' }], terrain: { base: 300 } });
    expect(dropped).toBe(1);
    expect(data.elements[0].params.w).toBe(2500);
    expect(data.elements[0].params.d).toBe(650);
    expect(data.terrain.base).toBe(300);
    expect(data.layers.length).toBeGreaterThan(5);
  });
  it('refuses data from a newer schema', () => {
    expect(() => migrateSite({ schema: 99 })).toThrow(SiteDataError);
  });
  it('files without site projects stay version 1 (readable by version 1.0); with a site project they are version 2', () => {
    const draw = newProject('drawing', 'd');
    expect(makeProjectFile([draw]).version).toBe(1);
    const s = newProject('site', 's');
    const f = makeProjectFile([draw, s]);
    expect(f.version).toBe(2);
    const back = parseProjectFile(JSON.stringify(f));
    expect(back.map((p) => p.type)).toEqual(['drawing', 'site']);
  });
});

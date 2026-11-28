// 4.0 site library: counts by group, every item builds finite solids, real openings in the monumental gate, the
// underground shelter below the ground line, textures on surfaces, stepping stones and channels along lines,
// search with Hebrew variants, and data that a 3.0 app can keep (unknown kinds and new fields survive migration).
import { describe, expect, it } from 'vitest';
import { v2 } from '../geometry/vec';
import { emptySite, migrateSite } from './migrate';
import { LIBRARY, lib, makeElement, searchLibrary } from './library';
import { buildSiteModel, computeSection } from './section';
import { buildTerrain } from './terrain';
import { elementSolids } from './prims';
import type { SiteData, SiteElement, SiteSection } from './types';
import { FURNITURE } from '../building/furniture';
import { OPENING_PRESETS } from '../building/openings';

let n = 0;
const id = () => `v${++n}`;
const site = (els: SiteElement[] = []): SiteData => ({ ...emptySite(), elements: els });
const at = (kind: string, x = 0, y = 0, rot = 0) => makeElement(kind, { type: 'point', p: v2(x, y), rot }, id());
const sec = (a: [number, number], b: [number, number], depth = 500): SiteSection => ({ id: id(), label: 'A', mode: 'section', a: v2(...a), b: v2(...b), side: 1, depth, showDims: true, showLevels: true });
const T = buildTerrain(emptySite());

describe('4.0 site library', () => {
  it('has the groups the plan asks for, with unique kinds', () => {
    const kinds = LIBRARY.map((l) => l.kind);
    expect(new Set(kinds).size).toBe(kinds.length);
    expect(LIBRARY.filter((l) => l.symbol === 'tree').length).toBeGreaterThanOrEqual(12);
    expect(LIBRARY.filter((l) => l.sub === 'שיחים וצמחים').length).toBeGreaterThanOrEqual(13);
    expect(LIBRARY.filter((l) => l.sub === 'משטחי קרקע').length).toBeGreaterThanOrEqual(9);
    expect(LIBRARY.filter((l) => l.category === 'furniture').length).toBeGreaterThanOrEqual(24);
    expect(LIBRARY.filter((l) => l.category === 'play').length).toBeGreaterThanOrEqual(12);
    expect(LIBRARY.filter((l) => l.sub === 'שערים וקשתות').length).toBeGreaterThanOrEqual(5);
    // All element types of the app together (building furniture, designed openings, site items).
    expect(LIBRARY.length + FURNITURE.length + OPENING_PRESETS.length).toBeGreaterThanOrEqual(200);
  });

  it('every point item builds finite solids around its position', () => {
    for (const L of LIBRARY.filter((x) => x.parts)) {
      const e = at(L.kind, 10000, 5000, 30);
      const s = elementSolids(e, T);
      expect(s.prims.length, L.kind).toBeGreaterThan(0);
      for (const pr of s.prims) {
        const pts = pr.t === 'prism' ? pr.poly : [pr.c];
        for (const q of pts) { expect(Number.isFinite(q.x) && Number.isFinite(q.y), L.kind).toBe(true); expect(Math.hypot(q.x - 10000, q.y - 5000), L.kind).toBeLessThan(30000); }
      }
    }
  });

  it('the monumental gate has real openings: a section through the middle passes through the arch', () => {
    const g = at('gate-triumphal', 20000, 20000);
    const r = computeSection(buildSiteModel(site([g])), sec([20000, 10000], [20000, 30000]))!;
    const cut = r.cut.filter((c) => c.id === g.id && c.poly);
    expect(cut.length).toBeGreaterThan(0);
    // Nothing is cut below the top of the middle opening's springing (7 m opening, semicircular arch).
    const lowest = Math.min(...cut.map((c) => Math.min(...c.poly!.map((q) => q.z))));
    expect(lowest).toBeGreaterThan(6500);
    // A section through a pier cuts solid from the ground up.
    const pier = computeSection(buildSiteModel(site([g])), sec([20000 - 5800, 10000], [20000 - 5800, 30000]))!;
    expect(Math.min(...pier.cut.filter((c) => c.id === g.id && c.poly).flatMap((c) => c.poly!.map((q) => q.z)))).toBeLessThan(50);
  });

  it('the underground shelter is below the ground line and only its entrance stands above', () => {
    const e = at('shelter-under');
    const s = elementSolids(e, T);
    const zs = s.prims.filter((p) => p.t === 'prism').flatMap((p) => (p.t === 'prism' ? [p.z0.c, p.z1.c] : []));
    expect(Math.min(...zs)).toBeLessThan(-3000);
    expect(Math.max(...zs)).toBeLessThan(3000);
    expect(lib('shelter-under').note).toMatch(/להמחשה|לימודית/);
    expect(lib('shelter-above').note).toMatch(/אין להציג את התכנון כתקני/);
  });

  it('ground surfaces carry their texture; stepping stones and channels follow the line', () => {
    const sand = makeElement('ground-sand', { type: 'area', pts: [v2(0, 0), v2(4000, 0), v2(4000, 3000), v2(0, 3000)], curved: false }, id());
    expect(sand.finish?.material).toBe('sand');
    const sf = elementSolids(sand, T).surfaces;
    expect(sf.length).toBe(1);
    expect(sf[0].tex?.material).toBe('sand');
    const step = makeElement('path-stepping', { type: 'line', pts: [v2(0, 0), v2(7000, 0)], curved: false }, id());
    const stones = elementSolids(step, T).prims;
    expect(stones.length).toBe(10); // every 0.70 m along 7 m, starting half a step in
    const ch = makeElement('water-channel', { type: 'line', pts: [v2(0, 0), v2(5000, 0)], curved: false }, id());
    const water = elementSolids(ch, T).prims.filter((p) => p.role === 'water');
    expect(water.length).toBe(1);
    expect(water[0].t === 'prism' && water[0].z1.c).toBeLessThanOrEqual(0);
  });

  it('a pool is sunk into the ground like the pond, with water and an empty basin', () => {
    const pool = makeElement('pool', { type: 'area', pts: [v2(0, 0), v2(10000, 0), v2(10000, 5000), v2(0, 5000)], curved: false }, id());
    const s = elementSolids(pool, T);
    expect(s.prims.some((p) => p.role === 'water')).toBe(true);
    expect(s.prims.some((p) => p.role === 'void')).toBe(true);
  });

  it('search finds items with Hebrew spelling variants and words from the description', () => {
    expect(searchLibrary('זית').some((l) => l.kind === 'tree-olive')).toBe(true);
    expect(searchLibrary('שער ניצחון').some((l) => l.kind === 'gate-triumphal')).toBe(true);
    expect(searchLibrary('מקלט').length).toBeGreaterThanOrEqual(2);
    expect(searchLibrary('נדנדה').some((l) => l.kind === 'swing')).toBe(true);
  });

  it('migration keeps 4.0 fields and unknown kinds (a 3.0 app keeps them too, it only does not draw them)', () => {
    const e = { ...at('bench-curved'), color2: '#123456' };
    const f = makeElement('ground-pebbles', { type: 'area', pts: [v2(0, 0), v2(1000, 0), v2(1000, 1000)], curved: false }, id());
    const unknown = { ...at('bench'), kind: 'from-a-newer-version' };
    const { data } = migrateSite(JSON.parse(JSON.stringify(site([e, f, unknown]))));
    expect(data.elements.length).toBe(3);
    expect(data.elements[0].color2).toBe('#123456');
    expect(data.elements[1].finish?.material).toBe('pebbles');
    expect(data.elements[2].kind).toBe('from-a-newer-version');
  });
});

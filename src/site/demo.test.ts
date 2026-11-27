import { describe, expect, it } from 'vitest';
import { v2 } from '../geometry/vec';
import { demoParkData } from './demo';
import { buildSiteModel, computeSection } from './section';
import { lib, isKnownKind } from './library';
import { localToWorld } from './poly';
import { prm } from './library';
import { itemSize, sheetArea, sheetProblems } from './render/sheet';
import { demoParkProject, demoProjects } from '../document/factory';
import { makeProjectFile, parseProjectFile } from '../storage/storage';

let n = 0;
const ids = () => `d${n++}`;

describe('demo park "פארק ציבורי לדוגמה"', () => {
  const d = demoParkData(ids);
  const model = buildSiteModel(d);

  it('is a 60 × 40 m lot (2400 m²) made only of known, editable library elements', () => {
    const lot = d.elements.find((e) => e.kind === 'lot')!;
    expect(lot.geom.type).toBe('area');
    const b = model.terrain.domain;
    expect([b.minX, b.minY, b.maxX, b.maxY]).toEqual([0, 0, 60000, 40000]);
    for (const e of d.elements) expect(isKnownKind(e.kind), e.kind).toBe(true);
    const kinds = new Set(d.elements.map((e) => e.kind));
    for (const k of ['path', 'plaza', 'lawn', 'tree-round', 'palm', 'shrub', 'flowers', 'bench', 'pergola', 'pond', 'play', 'lamp', 'stairs', 'ramp', 'terrace', 'wall'])
      expect(kinds.has(k), `has ${lib(k).label}`).toBe(true);
    expect(new Set(d.elements.map((e) => e.id)).size).toBe(d.elements.length);
  });

  it('marks all of its height data as manual sample data, never as a survey', () => {
    expect(d.terrain.points.length).toBeGreaterThan(3);
    for (const p of d.terrain.points) expect(p.source).toBe('manual');
    expect(d.info.projectTitle).toContain('הדגמה');
    expect(d.info.student).toBe('');
  });

  it('stairs and ramp start on the lower ground and arrive exactly at the upper plaza level (+0.60)', () => {
    const t = model.terrain;
    const terrace = d.elements.find((e) => e.kind === 'terrace')!;
    const level = prm(terrace, 'level');
    expect(level).toBe(600);
    for (const kind of ['stairs', 'ramp']) {
      const e = d.elements.find((x) => x.kind === kind)!;
      if (e.geom.type !== 'point') throw new Error('point');
      const dd = prm(e, 'd');
      const lo = localToWorld(e.geom.p, e.geom.rot, v2(0, -dd / 2));
      const hi = localToWorld(e.geom.p, e.geom.rot, v2(0, dd / 2 + 50));
      expect(t.z(lo), `${kind} bottom`).toBeCloseTo(0, 6);
      expect(t.z(hi), `${kind} top`).toBeCloseTo(level, 6);
      expect(t.z(e.geom.p) + prm(e, 'rise')).toBeCloseTo(level, 6);
    }
    const ramp = d.elements.find((x) => x.kind === 'ramp')!;
    expect(prm(ramp, 'rise') / prm(ramp, 'd')).toBeLessThanOrEqual(1 / 12);
  });

  it('section A-A crosses the playground, the mound, the ramp (through the gap in the wall), the upper plaza, the pergola and the fountain', () => {
    const a = d.sections.find((s) => s.label === 'A')!;
    const r = computeSection(model, a)!;
    const cutKinds = new Set(r.cutIds.map((id) => d.elements.find((e) => e.id === id)!.kind));
    for (const k of ['ramp', 'pergola', 'fountain', 'play']) expect(cutKinds.has(k), `A-A cuts ${k}`).toBe(true);
    expect(r.zMax).toBeGreaterThan(2800);
    // The mound reaches 1.20 m and the upper plaza 0.60 m along the line.
    const zs = r.ground.map((g) => g.z);
    expect(Math.max(...zs)).toBeGreaterThan(1000);
    expect(r.beyondIds.length).toBeGreaterThan(0);
  });

  it('section B-B crosses the pond (water below the rim), the seating, the retaining wall and the pergola', () => {
    const b = d.sections.find((s) => s.label === 'B')!;
    const r = computeSection(model, b)!;
    const cutKinds = new Set(r.cutIds.map((id) => d.elements.find((e) => e.id === id)!.kind));
    for (const k of ['pond', 'bench', 'wall', 'pergola']) expect(cutKinds.has(k), `B-B cuts ${k}`).toBe(true);
    const water = r.cut.filter((c) => c.role === 'water');
    expect(water.length).toBeGreaterThan(0);
    expect(Math.max(...water[0].poly!.map((q) => q.z))).toBeCloseTo(-100, 6);
    // the ground steps up by 0.60 m at the wall line
    const ground = r.ground;
    const zAt = (s: number) => {
      for (let i = 1; i < ground.length; i++) if (ground[i].s >= s) {
        const g0 = ground[i - 1], g1 = ground[i];
        return g1.s === g0.s ? g1.z : g0.z + ((s - g0.s) / (g1.s - g0.s)) * (g1.z - g0.z);
      }
      return ground[ground.length - 1].z;
    };
    expect(zAt(27000 - 1000)).toBeCloseTo(0, 6);
    expect(zAt(28500 - 1000)).toBeCloseTo(600, 6);
  });

  it('comes with a sample A2 sheet whose drawings fit the frame without overlapping', () => {
    expect(d.sheets.length).toBe(1);
    const s = d.sheets[0];
    expect(sheetProblems(d, model, s)).toEqual([]);
    const types = s.items.map((i) => i.type);
    for (const t of ['plan', 'section', 'north', 'legend', 'areas', 'info', 'view3d']) expect(types, t).toContain(t);
    expect(types.filter((t) => t === 'section').length).toBe(2);
    // No two items of any kind overlap.
    const area = sheetArea(s);
    const rects = s.items.map((it) => ({ it, ...itemSize(d, model, it) }));
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i], b = rects[j];
      const ov = a.it.x < b.it.x + b.w && b.it.x < a.it.x + a.w && a.it.y < b.it.y + b.h && b.it.y < a.it.y + a.h;
      expect(ov, `${a.it.type} overlaps ${b.it.type}`).toBe(false);
    }
    expect(area.w).toBeGreaterThan(0);
  });

  it('is included in the demo projects, clearly marked, and survives a save and load', () => {
    const demos = demoProjects();
    const park = demos.find((p) => p.type === 'site')!;
    expect(park.demo).toBe(true);
    expect(park.name).toContain('הדגמה');
    const back = parseProjectFile(JSON.stringify(makeProjectFile([demoParkProject()])));
    expect(back.length).toBe(1);
    const p = back[0];
    if (p.type !== 'site') throw new Error('type');
    expect(p.data.elements.length).toBe(d.elements.length);
    expect(p.data.sections.length).toBe(3);
  });
});

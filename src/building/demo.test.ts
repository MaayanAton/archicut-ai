// The three educational demos must open clean: no geometric warnings in any view state, every room closed, no
// furniture inside a wall that exists at the same time, and sheets whose drawings fit without being shrunk.

import { describe, expect, it } from 'vitest';
import type { Vec2 } from '../geometry/vec';
import { demoApartment, demoHouse, demoRenovation } from './demo';
import { buildModel, furnitureOutline, inState, roomInState } from './model';
import { computeBSection } from './section';
import { buildBSheet } from './render/sheet';
import { coexist } from './openings';
import type { BuildingData, ViewState } from './types';

const area = (p: Vec2[]) => { let a = 0; for (let i = 0; i < p.length; i++) { const q = p[i], r = p[(i + 1) % p.length]; a += q.x * r.y - r.x * q.y; } return a / 2; };
/** Area of a polygon clipped by a convex polygon (Sutherland–Hodgman). */
function overlap(subject: Vec2[], convex: Vec2[]): number {
  let out = subject;
  const c = area(convex) > 0 ? convex : [...convex].reverse();
  for (let i = 0; i < c.length && out.length; i++) {
    const A = c[i], B = c[(i + 1) % c.length];
    const side = (p: Vec2) => (B.x - A.x) * (p.y - A.y) - (B.y - A.y) * (p.x - A.x);
    const inp = out; out = [];
    for (let j = 0; j < inp.length; j++) {
      const P = inp[j], Q = inp[(j + 1) % inp.length], sp = side(P), sq = side(Q);
      const X = () => { const t = sp / (sp - sq); return { x: P.x + (Q.x - P.x) * t, y: P.y + (Q.y - P.y) * t }; };
      if (sq >= 0) { if (sp < 0) out.push(X()); out.push(Q); } else if (sp >= 0) out.push(X());
    }
  }
  return out.length >= 3 ? Math.abs(area(out)) : 0;
}

let n = 0;
const id = () => `t${++n}`;
const DEMOS: [string, () => BuildingData][] = [['apartment', () => demoApartment(id)], ['house', () => demoHouse(id)], ['renovation', () => demoRenovation(id)]];

describe('building demos', () => {
  for (const [name, make] of DEMOS) {
    const d = make();
    const states: ViewState[] = d.renovation ? ['existing', 'demolition', 'proposed', 'compare'] : ['proposed'];
    it(`${name}: no warnings, rooms closed, furniture clear of walls`, () => {
      for (const st of states) {
        const m = buildModel(d, st);
        expect(m.warnings, `${name} ${st}`).toEqual([]);
        for (const lm of m.levels) {
          for (const r of lm.rooms) expect(r.area, `${name} ${st} ${r.room.name}`).toBeGreaterThan(2e6);
          const shown = d.rooms.filter((r) => r.levelId === lm.level.id && roomInState(r, st, d.renovation));
          expect(lm.rooms.length).toBe(shown.length);
          for (const f of d.furniture.filter((x) => x.levelId === lm.level.id && inState(x.phase, st, d.renovation))) {
            if (f.kind === 'rug' || f.kind === 'ceiling-lamp') continue;
            for (const wm of lm.walls) if (coexist(f.phase, wm.w.phase)) expect(overlap(wm.outline, furnitureOutline(f)), `${name} ${f.kind} @${f.p.x},${f.p.y}`).toBeLessThan(100);
          }
        }
      }
    });
    it(`${name}: sections cut something and sheets fit at their scales`, () => {
      const m = buildModel(d, 'proposed');
      for (const s of d.sections) {
        const r = computeBSection(d, m, s);
        expect(r, s.label).not.toBeNull();
        expect(r!.cut.length + r!.beyond.length, s.label).toBeGreaterThan(0);
        if (s.mode === 'section') expect(r!.cutIds.length, s.label).toBeGreaterThan(0);
      }
      expect(d.sheets.length).toBe(1);
      const b = buildBSheet(d, d.sheets[0], { demo: true });
      expect(b.problems).toEqual([]);
      expect(d.sheets[0].items.filter((it) => it.type === 'plan').length).toBeGreaterThan(0);
    });
  }
  it('the house has two levels with a stair and a roof; the renovation has all three phases', () => {
    const h = demoHouse(id);
    expect(h.levels.length).toBe(2);
    expect(h.stairs.length).toBe(1);
    expect(h.roofs[0].shape).toBe('gable');
    const r = demoRenovation(id);
    expect(new Set(r.walls.map((w) => w.phase))).toEqual(new Set(['existing', 'demolish', 'new']));
    const g = buildModel(demoApartment(id), 'proposed').levels[0];
    expect(g.grossArea / 1e6).toBeCloseTo(90, 1);
  });
});

describe('copy to a site project', () => {
  it('copies the outline of the lowest level as one site building, centred on the lot', async () => {
    const { copyBuildingToSite, buildingFootprints } = await import('./toSite');
    const { demoParkData } = await import('../site/demo');
    const h = demoHouse(id);
    const fps = buildingFootprints(h);
    expect(fps.length).toBe(1);
    expect(Math.abs(fps[0].pts.reduce((a, p, i, arr) => a + p.x * arr[(i + 1) % arr.length].y - arr[(i + 1) % arr.length].x * p.y, 0) / 2) / 1e6).toBeCloseTo(80, 1);
    expect(fps[0].height).toBe(3000 + 2750);
    const site = demoParkData(id);
    const r = copyBuildingToSite(site, h, 'בית', id);
    expect(r.count).toBe(1);
    expect(r.data.elements.length).toBe(site.elements.length + 1);
    const el = r.data.elements[r.data.elements.length - 1];
    expect(el.kind).toBe('building');
    expect(el.params.h).toBe(5750);
    expect(site.elements.length).toBe(r.data.elements.length - 1); // the original site data is not changed
  });
});

describe('a large building', () => {
  it('builds 880 walls, 880 openings and 400 rooms on 4 levels quickly and without warnings', async () => {
    const { emptyBuilding, newLevel } = await import('./migrate');
    const { newWall, newRoom, newOpening } = await import('./factories');
    const { v2 } = await import('../geometry/vec');
    const d = emptyBuilding(id());
    for (let L = 1; L < 4; L++) d.levels.push(newLevel(id(), `L${L}`, L * 3000, 'upper'));
    const N = 10, S = 4000;
    for (const lv of d.levels) {
      for (let i = 0; i <= N; i++) for (let j = 0; j < N; j++) {
        const ext = i === 0 || i === N;
        const a = newWall(id(), lv.id, v2(i * S, j * S), v2(i * S, (j + 1) * S), { thickness: ext ? 250 : 100, kind: ext ? 'exterior' : 'interior' });
        const b = newWall(id(), lv.id, v2(j * S, i * S), v2((j + 1) * S, i * S), { thickness: ext ? 250 : 100, kind: ext ? 'exterior' : 'interior' });
        d.walls.push(a, b);
        d.openings.push(newOpening(id(), a.id, 'door', 2000, {}), newOpening(id(), b.id, 'window', 2000, {}));
      }
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) d.rooms.push(newRoom(id(), lv.id, `R${i}${j}`, v2(i * S + S / 2, j * S + S / 2)));
    }
    const t = performance.now();
    const m = buildModel(d, 'proposed');
    expect(performance.now() - t).toBeLessThan(3000);
    expect(m.warnings).toEqual([]);
    expect(m.levels.every((l) => l.rooms.length === 100 && l.rooms.every((r) => r.area > 14e6 && r.area < 16e6))).toBe(true);
  });
});

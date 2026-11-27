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

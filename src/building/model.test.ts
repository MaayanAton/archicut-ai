import { describe, expect, it } from 'vitest';
import { v2 } from '../geometry/vec';
import { emptyBuilding, newLevel } from './migrate';
import { buildModel } from './model';
import { computeBSection } from './section';
import { rectWalls, translateIds, moveWallEnd, deleteIds, placeOpening } from './edit';
import { stairCheck, stairGeom } from './stairs';
import { roofGeom } from './roofs';
import { checkWallOpenings } from './openings';
import type { BuildingData, Opening, Stair, Roof } from './types';
import { linAt } from '../site/prims';

let n = 0;
const id = () => `id${++n}`;
const wallBase = { height: null, kind: 'exterior' as const, phase: 'new' as const, left: { material: 'paint', color: '#fff' }, right: { material: 'paint', color: '#eee' }, core: '#ccc' };

function house(): BuildingData {
  const d = emptyBuilding('L0');
  d.walls = rectWalls(0, 0, 10000, 6000, 250, 'L0', wallBase, id);
  d.rooms = [{ id: 'r1', levelId: 'L0', name: 'סלון', mode: 'auto', seed: v2(5000, 3000), pts: [], floor: { material: 'parquet', color: '#c89a64', tileW: 1200, tileH: 180, angle: 0 }, state: 'all', showArea: true }];
  return d;
}
const win = (wallId: string, pos: number): Opening => ({ id: id(), wallId, kind: 'window', pos, width: 1200, height: 1200, sill: 900, side: 'L', hinge: 'start', color: '#fff', material: 'aluminium', phase: 'new' });

describe('building model', () => {
  it('computes net and gross areas of a house measured outside', () => {
    const m = buildModel(house());
    const lm = m.levels[0];
    expect(lm.grossArea / 1e6).toBeCloseTo(60, 6);
    expect(lm.rooms[0].area / 1e6).toBeCloseTo(9.5 * 5.5, 6);
  });
  it('cuts a real hole for a window: the section through it shows the wall below the sill and above the head', () => {
    const d = house();
    const south = d.walls[0]; // from (125,125) to (9875,125)
    d.openings = [win(south.id, 3000)];
    const m = buildModel(d);
    const wall = m.solids.find((s) => s.id === south.id)!;
    expect(wall.prims.length).toBe(4); // left part, below sill, above head, right part
    const x = south.a.x + 3000;
    const r = computeBSection(d, m, { id: 's', label: 'A', mode: 'section', a: v2(x, -2000), b: v2(x, 8000), side: 1, depth: 20000, showDims: true, showLevels: true, showFurniture: true })!;
    const cutWall = r.cut.filter((c) => c.id === south.id);
    const zs = cutWall.map((c) => [Math.min(...c.poly.map((q) => q.z)), Math.max(...c.poly.map((q) => q.z))]).sort((a, b) => a[0] - b[0]);
    expect(zs).toEqual([[0, 900], [2100, 2700]]);
    expect(r.openings[0].z0).toBe(900);
    expect(r.openings[0].z1).toBe(2100);
    // Glass is in the section, in the gap.
    expect(r.cut.some((c) => c.role === 'glass' && Math.min(...c.poly.map((q) => q.z)) >= 900)).toBe(true);
  });
  it('flags openings outside the wall and overlapping openings', () => {
    const d = house();
    const w = d.walls[0];
    expect(checkWallOpenings(w, [win(w.id, 100)], 2700).some((p) => p.severe)).toBe(true);
    expect(checkWallOpenings(w, [win(w.id, 3000), win(w.id, 3500)], 2700).some((p) => p.msg.includes('חופף'))).toBe(true);
    expect(checkWallOpenings(w, [{ ...win(w.id, 3000), height: 2000 }], 2700).some((p) => p.msg.includes('גבוה'))).toBe(true);
    const placed = placeOpening(d, w, { ...win(w.id, 0), id: 'x' }, 50);
    expect('o' in placed && placed.o.pos).toBe(600);
  });
  it('keeps joints closed when a wall moves and keeps openings in place when the start point moves', () => {
    const d = house();
    const w = d.walls[0];
    d.openings = [win(w.id, 3000)];
    const moved = translateIds(d, [w.id], v2(0, -1000));
    const m = buildModel(moved);
    expect(m.levels[0].rooms[0].net).not.toBeNull();
    expect(m.levels[0].grossArea / 1e6).toBeCloseTo(70, 6);
    const ext = moveWallEnd(d, w.id, 'a', v2(w.a.x - 1000, w.a.y));
    const o = ext.openings[0];
    expect(o.pos).toBeCloseTo(4000, 6);
    expect(ext.walls[3].b).toEqual(v2(w.a.x - 1000, w.a.y)); // the west wall followed
  });
  it('reports an unclosed room after deleting a wall', () => {
    const d = house();
    const m = buildModel(deleteIds(d, [d.walls[1].id]));
    expect(m.levels[0].rooms[0].net).toBeNull();
    expect(m.warnings.some((w) => w.id === 'r1')).toBe(true);
  });
  it('builds stairs consistently and warns about uncomfortable numbers', () => {
    const s: Stair = { id: 's', levelId: 'L0', shape: 'straight', p: v2(0, 0), rot: 0, width: 1000, rise: 2950, risers: 17, going: 280, landing: 1000, gap: 100, turn: 'left', cutUpper: true, color: '#ccc', material: 'stone', phase: 'new' };
    const g = stairGeom(s);
    expect(g.treads.length).toBe(16);
    expect(g.riser).toBeCloseTo(2950 / 17, 6);
    expect(g.run).toBe(16 * 280);
    expect(g.treads[15].top).toBeCloseTo(2950 - 2950 / 17, 6);
    expect(stairCheck({ ...s, risers: 12 }).notes.some((x) => x.includes('גבוה'))).toBe(true);
    const L = stairGeom({ ...s, shape: 'L' });
    expect(L.treads.filter((t) => t.landing).length).toBe(1);
    expect(L.treads.length).toBe(16);
    const U = stairGeom({ ...s, shape: 'U', landing: 1100 });
    expect(U.treads.length).toBe(16);
    expect(stairCheck({ ...s, risers: 0 }).errors.length).toBeGreaterThan(0);
  });
  it('cuts the stair opening in the upper floor and builds a two-storey section', () => {
    const d = house();
    d.levels.push({ ...newLevel('L1', 'קומה א', 2950, 'upper') });
    d.walls.push(...rectWalls(0, 0, 10000, 6000, 250, 'L1', wallBase, id));
    d.stairs = [{ id: 'st', levelId: 'L0', shape: 'straight', p: v2(1000, 1500), rot: 0, width: 1000, rise: 2950, risers: 17, going: 280, landing: 1000, gap: 100, turn: 'left', cutUpper: true, color: '#ccc', material: 'stone', phase: 'new' }];
    const m = buildModel(d);
    const upperFloor = m.solids.find((s) => s.id.startsWith('auto-floor-L1'))!;
    expect(upperFloor.prims[0].t === 'prism' && upperFloor.prims[0].holes?.length).toBe(1);
    const r = computeBSection(d, m, { id: 's', label: 'A', mode: 'section', a: v2(-1000, 1500), b: v2(11000, 1500), side: 1, depth: 20000, showDims: true, showLevels: true, showFurniture: true })!;
    expect(r.levels.map((l) => l.z)).toEqual([0, 2950]);
    const upperSlabCuts = r.cut.filter((c) => c.id.startsWith('auto-floor-L1'));
    expect(upperSlabCuts.length).toBe(2); // split by the stair opening
    expect(r.cut.some((c) => c.type === 'stair')).toBe(true);
  });
  it('builds a gable roof with the ridge at the right height', () => {
    const roof: Roof = { id: 'r', levelId: 'L0', shape: 'gable', pts: [v2(0, 0), v2(10000, 0), v2(10000, 6000), v2(0, 6000)], base: 2700, thickness: 200, slope: 30, overhang: 500, parapet: 0, gableWalls: true, color: '#a55', material: 'concrete', phase: 'new' };
    const g = roofGeom(roof, 0);
    const ridgeZ = 2700 + 3000 * Math.tan(Math.PI / 6);
    const halves = g.prims.filter((p) => p.part === 'roof');
    expect(halves.length).toBe(2);
    expect(linAt(halves[0].z0, v2(5000, 3000))).toBeCloseTo(ridgeZ, 6);
    expect(linAt(halves[0].z0, v2(5000, 0))).toBeCloseTo(2700, 6);
    expect(g.prims.filter((p) => p.part === 'gable').length).toBe(4);
  });
});

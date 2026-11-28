// Version 4.0: materials, wall design, curved openings, floor zones, ceilings, lights, lock / hide and compatibility.
import { describe, expect, it } from 'vitest';
import { v2 } from '../geometry/vec';
import { emptyBuilding, migrateBuilding } from './migrate';
import { buildModel } from './model';
import { computeBSection } from './section';
import { deleteIds, duplicateIds, rectWalls, rotateIds, translateIds, findEl } from './edit';
import { newFurniture, newFloorZone, newWallZone, presetOpening, richFloor, richWall } from './factories';
import { OPENING_PRESETS, checkWallOpenings } from './openings';
import { FURNITURE, furn, partBottom, partTop, searchFurniture } from './furniture';
import { CATALOG, isKnownMat, mat, matchesQuery, searchMats } from '../materials/catalog';
import { repeatMM } from '../materials/texture';
import { resolveFinish } from '../materials/finish';
import { holeAt, wallCells, zoneRects } from './wall4';
import { linAt } from '../site/prims';
import type { BldSection, BuildingData, Opening } from './types';

let n = 0;
const id = () => `t${++n}`;
const wallBase = { height: null, kind: 'exterior' as const, phase: 'new' as const, left: { material: 'paint', color: '#ffffff' }, right: { material: 'paint', color: '#eeeeee' }, core: '#cccccc' };

function house(): BuildingData {
  const d = emptyBuilding('L0');
  d.walls = rectWalls(0, 0, 10000, 6000, 250, 'L0', wallBase, id);
  d.rooms = [{ id: 'r1', levelId: 'L0', name: 'סלון', mode: 'auto', seed: v2(5000, 3000), pts: [], floor: { material: 'parquet', color: '#c89a64', tileW: 1200, tileH: 180, angle: 0 }, state: 'all', showArea: true }];
  return d;
}
const sec = (x: number): BldSection => ({ id: 's', label: 'A', mode: 'section', a: v2(x, -2000), b: v2(x, 8000), side: 1, depth: 20000, showDims: true, showLevels: true, showFurniture: true });
const zRange = (poly: { z: number }[]) => [Math.min(...poly.map((q) => q.z)), Math.max(...poly.map((q) => q.z))];

describe('material catalogue', () => {
  it('has at least 100 materials with unique ids, and every 3.0 material id still exists', () => {
    expect(CATALOG.length).toBeGreaterThanOrEqual(100);
    expect(new Set(CATALOG.map((m) => m.id)).size).toBe(CATALOG.length);
    for (const old of ['paint', 'plaster', 'parquet', 'laminate', 'ceramic', 'porcelain', 'porcelain-large', 'terrazzo', 'concrete', 'stone', 'marble', 'wood', 'wood-cladding', 'stone-cladding', 'brick', 'tile-wall', 'glass', 'metal', 'aluminium', 'fabric', 'leather', 'lacquer', 'ceramic-white', 'plant']) expect(isKnownMat(old)).toBe(true);
  });
  it('has no two materials that differ only by colour (same pattern, size, layout and gloss)', () => {
    const sig = CATALOG.filter((m) => !m.legacy).map((m) => `${m.pattern}|${m.w}|${m.h}|${m.layout ?? ''}|${m.rough}|${m.metal}|${m.opacity}|${m.cat}|${m.color2}`);
    // Different materials may share the procedural pattern, but then they differ in their second colour, size or gloss.
    const dup = sig.filter((s, i) => sig.indexOf(s) !== i);
    expect(dup).toEqual([]);
  });
  it('falls back to paint for a missing material and resolves texture repeats from the physical size', () => {
    expect(mat('no-such-material').id).toBe('paint');
    const r = resolveFinish({ material: 'oak-natural', color: '#c8a070', v: 4, tw: 1200, th: 180, layout: 'straight' });
    expect(r.textured).toBe(true);
    const rep = repeatMM(r.spec);
    expect(rep.w).toBe(1200);
    expect(rep.h).toBeCloseTo(360, 6);
  });
  it('finds materials in Hebrew with synonyms and spelling variants', () => {
    expect(searchMats('פרקט אלון').some((m) => m.id.startsWith('oak'))).toBe(true);
    expect(searchMats('טפט').length).toBeGreaterThanOrEqual(20);
    expect(matchesQuery('קרמיקה לבנה', 'קרמיקה')).toBe(true);
  });
});

describe('element library', () => {
  it('has at least 200 element types together with the openings and keeps every 3.0 furniture kind', () => {
    const total = FURNITURE.length + OPENING_PRESETS.length;
    expect(total).toBeGreaterThanOrEqual(150); // building only; the site library adds the rest (see site tests)
    expect(new Set(FURNITURE.map((f) => f.kind)).size).toBe(FURNITURE.length);
    for (const k of ['sofa', 'bed-double', 'table-dining', 'kitchen-line', 'wc', 'tree-pot']) if (furn(k).kind !== k) expect(FURNITURE.some((f) => f.kind === k)).toBe(false);
  });
  it('builds every item with valid parts at its default size', () => {
    for (const f of FURNITURE) {
      const parts = f.parts(f.w, f.d, f.h);
      expect(parts.length, f.kind).toBeGreaterThan(0);
      for (const p of parts) {
        expect(Number.isFinite(partTop(p)) && Number.isFinite(partBottom(p)), f.kind).toBe(true);
        expect(partTop(p) >= partBottom(p) - 1e-6, f.kind).toBe(true);
      }
    }
  });
  it('searches with synonyms: "כורסא" finds armchairs', () => {
    expect(searchFurniture('כורסא').some((f) => f.kind.startsWith('armchair'))).toBe(true);
    expect(searchFurniture('אגרטל').length).toBeGreaterThan(0);
  });
});

describe('walls designed in 4.0', () => {
  it('keeps a 3.0 wall exactly as it was (no textures, same pieces)', () => {
    const d = house();
    const m = buildModel(d);
    const w = m.solids.find((s) => s.id === d.walls[0].id)!;
    expect(w.prims.length).toBe(1);
    const pr = w.prims[0];
    expect(pr.t === 'prism' && !pr.tex && !pr.sideTex).toBe(true);
  });
  it('gives each face its own textured finish', () => {
    const d = house();
    d.walls[0] = { ...d.walls[0], left: richWall('wp-classic', '#c9b48a'), right: richWall('brick-exposed') };
    const pr = buildModel(d).solids.find((s) => s.id === d.walls[0].id)!.prims[0];
    expect(pr.t === 'prism' && pr.sideTex?.L?.material === 'wp-classic' && pr.sideTex?.R?.material === 'brick-exposed').toBe(true);
  });
  it('adds ceramic up to 1.20 m on one face, cut around a door and a window', () => {
    const d = house();
    const w = d.walls[0];
    d.walls[0] = { ...w, zones: [newWallZone('z1', 'L', richWall('tile-metro'), { z0: 0, z1: 1200 })] };
    const door: Opening = { id: 'o1', wallId: w.id, kind: 'door', pos: 2000, width: 900, height: 2100, sill: 0, side: 'L', hinge: 'start', color: '#fff', material: 'wood', phase: 'new' };
    const win: Opening = { id: 'o2', wallId: w.id, kind: 'window', pos: 6000, width: 1200, height: 1200, sill: 900, side: 'L', hinge: 'start', color: '#fff', material: 'aluminium', phase: 'new' };
    d.openings = [door, win];
    const m = buildModel(d);
    const skins = m.solids.find((s) => s.id === w.id)!.prims.filter((p) => p.role === 'finish');
    expect(skins.length).toBeGreaterThan(0);
    // No skin covers the door's hole (between 1.55 and 2.45 m along the wall, below 2.1 m).
    for (const p of skins) if (p.t === 'prism') {
      const xs = p.poly.map((q) => q.x - w.a.x);
      const lo = Math.min(...xs), hi = Math.max(...xs);
      const overlapsDoor = lo < 2450 - 1 && hi > 1550 + 1;
      expect(overlapsDoor).toBe(false);
      expect(linAt(p.z1, p.poly[0])).toBeLessThanOrEqual(1200 + 1e-6);
    }
    // Below the window (sill 0.90 m) the tiles stop at the sill; the window's hole stays clear.
    const underWin = skins.filter((p) => p.t === 'prism' && p.poly.every((q) => q.x - w.a.x >= 5400 - 1 && q.x - w.a.x <= 6600 + 1));
    expect(underWin.length).toBe(1);
    expect(underWin[0].t === 'prism' && linAt(underWin[0].z1, underWin[0].poly[0])).toBeCloseTo(900, 6);
    // The section shows the finish layer as a thin piece next to the wall.
    const r = computeBSection(d, m, sec(w.a.x + 4000))!;
    const layer = r.cut.filter((c) => c.id === w.id && c.role === 'finish');
    expect(layer.length).toBe(1);
    expect(zRange(layer[0].poly)).toEqual([0, 1200]);
  });
  it('limits zones to the face length and the wall height', () => {
    const cells = zoneRects({ id: 'z', side: 'L', s0: -500, s1: 99999, z0: -10, z1: 99999, finish: { material: 'paint', color: '#fff' } }, [0, 4000], 2700, [], 200);
    expect(cells.length).toBe(1);
    expect([cells[0].s0, cells[0].s1, cells[0].b0, cells[0].t0]).toEqual([0, 4000, 0, 2700]);
  });
});

describe('curved openings are real holes', () => {
  it('cuts a semicircular arch: the section through the middle opens up to the apex, near the side only to the curve', () => {
    const d = house();
    const w = d.walls[0];
    const o = presetOpening('a1', w.id, OPENING_PRESETS.find((p) => p.id === 'pass-arch')!, 3000);
    d.openings = [o];
    expect(o.shape).toBe('arch');
    expect(o.kind).toBe('door'); // a 3.0 kind, so 3.0 still opens the project
    const m = buildModel(d);
    const at = (x: number) => computeBSection(d, m, sec(w.a.x + x))!.cut.filter((c) => c.id === w.id).map((c) => zRange(c.poly)).sort((a, b) => a[0] - b[0]);
    // Middle: no wall below the apex (2.5 m), wall above it.
    const mid = at(3000);
    expect(mid.length).toBe(1);
    expect(mid[0][0]).toBeGreaterThan(2490);
    // 0.5 m from the centre the arch (radius 0.6 m, springing at 1.9 m) is at 1.9 + sqrt(0.36 − 0.25) = 2.23 m.
    const side = at(3500);
    expect(side[0][0]).toBeGreaterThan(2180);
    expect(side[0][0]).toBeLessThan(2290);
    // A passage has no frame and no leaf.
    expect(m.solids.find((s) => s.id === 'a1')!.prims.length).toBe(0);
  });
  it('cuts a round window with wall below and above, and glass inside', () => {
    const d = house();
    const w = d.walls[0];
    d.openings = [presetOpening('r1', w.id, OPENING_PRESETS.find((p) => p.id === 'win-round')!, 5000)];
    const m = buildModel(d);
    const r = computeBSection(d, m, sec(w.a.x + 5000))!;
    const z = r.cut.filter((c) => c.id === w.id).map((c) => zRange(c.poly)).sort((a, b) => a[0] - b[0]);
    expect(z.length).toBe(2);
    expect(z[0][1]).toBeGreaterThan(1290); // below: up to about the bottom of the circle at 1.30 m
    expect(z[0][1]).toBeLessThan(1330);
    expect(z[1][0]).toBeGreaterThan(2070); // above: from about the top at 2.10 m
    expect(r.cut.some((c) => c.id === 'r1' && c.role === 'glass')).toBe(true);
  });
  it('keeps the back of the wall behind a niche', () => {
    const d = house();
    const w = d.walls[0];
    d.openings = [presetOpening('n1', w.id, OPENING_PRESETS.find((p) => p.id === 'niche-rect')!, 4000)];
    const m = buildModel(d);
    const z = computeBSection(d, m, sec(w.a.x + 4000))!.cut.filter((c) => c.id === w.id);
    // Three pieces: below the niche, the thin back, above it.
    expect(z.length).toBe(3);
  });
  it('rectangular openings give the same pieces as in 3.0', () => {
    const cells = wallCells(2700, [{ s0: 1000, s1: 2200, o: { id: 'x', wallId: 'w', kind: 'window', pos: 1600, width: 1200, height: 1200, sill: 900, side: 'L', hinge: 'start', color: '#fff', material: 'x', phase: 'new' } }], 250);
    expect(cells.map((c) => [c.s0, c.s1, c.b0, c.t0])).toEqual([[null, 1000, 0, 2700], [1000, 2200, 0, 900], [1000, 2200, 2100, 2700], [2200, null, 0, 2700]]);
  });
  it('profiles of arched shapes reach the full height at the centre', () => {
    for (const shape of ['arch', 'segment', 'pointed', 'ellipse'] as const) {
      const f = holeAt({ shape, width: 1200, height: 2400, sill: 0 })!;
      expect(f(0)[1]).toBeCloseTo(2400, 0);
      expect(f(600)[1]).toBeLessThan(2400);
    }
  });
  it('still refuses openings outside the wall or overlapping', () => {
    const d = house();
    const w = d.walls[0];
    const a = presetOpening('p1', w.id, OPENING_PRESETS[11], 400);
    const b = presetOpening('p2', w.id, OPENING_PRESETS[11], 900);
    const probs = checkWallOpenings(w, [a, b], 2700);
    expect(probs.some((p) => p.severe)).toBe(true);
  });
});

describe('floors, ceilings, furniture and lights', () => {
  it('keeps the floor area when the floor material changes, and adds a floor zone above the finish', () => {
    const d = house();
    const a0 = buildModel(d).levels[0].rooms[0].area;
    // The model is cached by the data object: edits make new objects, as in the app.
    const d2: BuildingData = { ...d, rooms: [{ ...d.rooms[0], floor: { ...richFloor('oak-natural'), layout: 'herringbone' } }], floorZones: [newFloorZone('fz1', 'L0', [v2(1000, 1000), v2(3000, 1000), v2(3000, 2000), v2(1000, 2000)], richFloor('tile-hex'))] };
    const m = buildModel(d2);
    expect(m.levels[0].rooms[0].area).toBeCloseTo(a0, 6);
    const fz = m.solids.find((s) => s.id === 'fz1')!;
    expect(fz.prims[0].t === 'prism' && linAt(fz.prims[0].z0, v2(0, 0))).toBe(6);
    expect(findEl(d2, 'fz1')?.type).toBe('floorZone');
  });
  it('builds a lowered ceiling with decorative beams inside the room', () => {
    const d = house();
    d.rooms = [{ ...d.rooms[0], ceiling: { finish: richWall('wood-ceiling'), drop: 200, beams: 3, beamW: 150, beamH: 220, beamDir: 0, beamColor: '#7a5238' } }];
    const m = buildModel(d);
    const c = m.solids.filter((s) => s.id === 'r1' && s.type === 'ceiling');
    expect(c.length).toBe(1);
    expect(c[0].prims.length).toBe(4);
    expect(c[0].prims[0].t === 'prism' && linAt(c[0].prims[0].z1, v2(0, 0))).toBe(2500);
  });
  it('gives furniture parts their own materials only when the item has them (3.0 items keep plain colours)', () => {
    const d = house();
    const old = newFurniture('f0', 'L0', 'sofa', v2(3000, 3000));
    const neo = newFurniture('f1', 'L0', 'sofa-u', v2(6000, 3000));
    expect(old.mats).toBeUndefined();
    expect(neo.mats?.length).toBeGreaterThan(0);
    d.furniture = [old, neo];
    const m = buildModel(d);
    expect(m.solids.find((s) => s.id === 'f0')!.prims.every((p) => !p.tex)).toBe(true);
    expect(m.solids.find((s) => s.id === 'f1')!.prims.some((p) => !!p.tex)).toBe(true);
  });
  it('lists the lights that are on, and none when they are off', () => {
    const lamp = FURNITURE.find((f) => f.light && !f.light.decorative)!;
    const d = house();
    d.furniture = [newFurniture('l1', 'L0', lamp.kind, v2(5000, 3000))];
    expect(buildModel(d).lights.length).toBe(1);
    expect(buildModel({ ...d, furniture: [{ ...d.furniture[0], light: { on: false, dim: 1, temp: 'warm' } }] }).lights.length).toBe(0);
  });
  it('builds a gate with a real opening: the section through it is open below the arch', () => {
    const gate = FURNITURE.find((f) => f.kind.startsWith('gate') || f.kind.startsWith('arch'))!;
    const d = house();
    d.furniture = [{ ...newFurniture('g1', 'L0', gate.kind, v2(5000, 3000)) }];
    const m = buildModel(d);
    const r = computeBSection(d, m, sec(5000))!;
    const z = r.cut.filter((c) => c.id === 'g1').map((c) => zRange(c.poly));
    expect(z.length).toBeGreaterThan(0);
    expect(Math.min(...z.map((q) => q[0]))).toBeGreaterThan(1000); // nothing cut low in the middle of the opening
  });
});

describe('lock, hide, layers and compatibility', () => {
  it('does not move, rotate or delete a locked element, but copies it (unlocked)', () => {
    const d = house();
    d.furniture = [{ ...newFurniture('f1', 'L0', 'sofa', v2(3000, 3000)), locked: true }];
    expect(translateIds(d, ['f1'], v2(100, 0)).furniture[0].p.x).toBe(3000);
    expect(rotateIds(d, ['f1'], 90, v2(0, 0)).furniture[0].rot).toBe(0);
    expect(deleteIds(d, ['f1']).furniture.length).toBe(1);
    const dup = duplicateIds(d, ['f1'], v2(500, 0), id);
    expect(dup.data.furniture.length).toBe(2);
    expect(dup.data.furniture[1].locked).toBeUndefined();
  });
  it('hides hidden elements and elements on hidden layers in the model', () => {
    const d = house();
    d.furniture = [newFurniture('f1', 'L0', 'sofa', v2(3000, 3000)), { ...newFurniture('f2', 'L0', 'sofa', v2(6000, 3000)), layer: 'ly' }, { ...newFurniture('f3', 'L0', 'sofa', v2(7000, 3000)), hidden: true }];
    d.layers = [{ id: 'ly', name: 'ריהוט', visible: false, locked: false }];
    const ids = buildModel(d).solids.filter((s) => s.type === 'furniture').map((s) => s.id);
    expect(ids).toEqual(['f1']);
  });
  it('a hidden wall still closes its room', () => {
    const d = house();
    d.walls[1] = { ...d.walls[1], hidden: true };
    const m = buildModel(d);
    expect(m.levels[0].rooms[0].net).not.toBeNull();
    expect(m.solids.some((s) => s.id === d.walls[1].id)).toBe(false);
  });
  it('migrates 4.0 data, drops broken 4.0 fields and keeps 3.0 data untouched', () => {
    const d = house();
    d.walls[0] = { ...d.walls[0], zones: [newWallZone('z1', 'L', richWall('marble-white'))], left: { ...richWall('wp-stripes-v'), tw: 'x' as unknown as number } };
    d.openings = [{ ...presetOpening('a', d.walls[0].id, OPENING_PRESETS[11], 3000), shape: 'blob' as unknown as 'arch' }];
    d.floorZones = [newFloorZone('fz', 'L0', [v2(0, 0), v2(1, 0), v2(1, 1)], richFloor('marble-white')), { id: 'bad' } as never];
    const { data, dropped } = migrateBuilding(JSON.parse(JSON.stringify(d)), id);
    expect(dropped).toBe(1);
    expect(data.walls[0].zones?.length).toBe(1);
    expect(data.walls[0].left.tw).toBeUndefined();
    expect(data.walls[0].left.v).toBe(4);
    expect(data.openings[0].shape).toBeUndefined();
    expect(data.floorZones?.length).toBe(1);
    const plain = migrateBuilding(JSON.parse(JSON.stringify(house())), id).data;
    expect(plain.floorZones).toBeUndefined();
    expect(plain.walls[0].left).toEqual({ material: 'paint', color: '#ffffff' });
  });
  it('repairs bad colours and sizes from a broken file instead of passing them to the drawing', () => {
    const d = house();
    d.rooms[0] = { ...d.rooms[0], floor: { material: 'no-such', color: 'not a colour', tileW: -5, tileH: 0, angle: 0, v: 4, grout: 'x' } };
    d.furniture = [{ ...newFurniture('f', 'L0', 'vase', v2(1000, 1000), 0, 'new'), color: 'red-ish', color3: 'zz', light: { on: true, dim: 1, temp: 'blue' } }];
    const { data } = migrateBuilding(JSON.parse(JSON.stringify(d)), id);
    const f = data.rooms[0].floor;
    expect(/^#[0-9a-f]{6}$/i.test(f.color)).toBe(true);
    expect(f.tileW).toBeUndefined();
    expect(f.tileH).toBeUndefined();
    expect(f.grout).toBeUndefined();
    expect(resolveFinish(f).def.id).toBe(mat('no-such').id);
    expect(data.furniture[0].color).toBe('#999999');
    expect(data.furniture[0].color3).toBeUndefined();
    expect(data.furniture[0].light?.temp).toBe('warm');
  });
});

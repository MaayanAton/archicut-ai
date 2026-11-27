// Three educational demonstration projects for the building module. All sizes are invented sample values for
// learning the app, clearly labelled as such. They are not approved plans and are not taken from any course exercise.

import { type Vec2, v2 } from '../geometry/vec';
import type { BuildingData, Furniture, Opening, OpeningKind, Phase, Room, Wall, WallKind } from './types';
import { emptyBuilding, newLevel } from './migrate';
import { floorFinish, newFurniture, newOpening, newRoom, newRoof, newSlab, newStair, newWall } from './factories';
import { rectWalls } from './edit';
import { elevationLine } from './section';
import { buildModel } from './model';
import { buildingBox } from './render/plan';
import { autoBSheet } from './render/sheet';

export const DEMO_APARTMENT_NAME = 'הדגמה: דירה מעוצבת (כ-90 מ״ר)';
export const DEMO_HOUSE_NAME = 'הדגמה: בית פרטי דו־קומתי';
export const DEMO_RENOVATION_NAME = 'הדגמה: שיפוץ דירה קיימת';

type Id = () => string;

/** Small builder that keeps ids and the current level. */
class B {
  d: BuildingData;
  L: string;
  id: Id;
  constructor(id: Id) { this.id = id; this.L = id(); this.d = emptyBuilding(this.L); }

  rect(x: number, y: number, w: number, h: number, t = 250, phase: Phase = 'new', levelId = this.L) {
    const base = newWall('x', levelId, v2(0, 0), v2(1, 0), { kind: 'exterior', phase });
    const ws = rectWalls(x, y, w, h, t, levelId, base, this.id, true);
    this.d.walls.push(...ws);
    return ws;
  }
  wall(a: Vec2, b: Vec2, o: { t?: number; kind?: WallKind; phase?: Phase; level?: string } = {}): Wall {
    const w = newWall(this.id(), o.level ?? this.L, a, b, { thickness: o.t ?? 100, kind: o.kind ?? 'interior', phase: o.phase ?? 'new' });
    this.d.walls.push(w);
    return w;
  }
  /** An opening centred at the world point p on the nearest wall of the level; doors swing towards `toward`. */
  open(p: Vec2, kind: OpeningKind, o: { w?: number; h?: number; sill?: number; toward?: Vec2; hinge?: 'start' | 'end'; phase?: Phase; level?: string } = {}): Opening {
    const lv = o.level ?? this.L;
    let best: { w: Wall; s: number; dist: number } | null = null;
    for (const w of this.d.walls.filter((x) => x.levelId === lv)) {
      const L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
      const ux = (w.b.x - w.a.x) / L, uy = (w.b.y - w.a.y) / L;
      const s = (p.x - w.a.x) * ux + (p.y - w.a.y) * uy;
      if (s < 0 || s > L) continue;
      const dd = Math.abs(-(p.x - w.a.x) * uy + (p.y - w.a.y) * ux);
      if (!best || dd < best.dist) best = { w, s, dist: dd };
    }
    if (!best || best.dist > 200) throw new Error(`demo: no wall at ${p.x},${p.y}`);
    const w = best.w;
    let side: 'L' | 'R' = 'L';
    if (o.toward) { const nx = -(w.b.y - w.a.y), ny = w.b.x - w.a.x; side = (o.toward.x - w.a.x) * nx + (o.toward.y - w.a.y) * ny >= 0 ? 'L' : 'R'; }
    const op = newOpening(this.id(), w.id, kind, Math.round(best.s), { width: o.w, height: o.h, sill: o.sill, side, hinge: o.hinge, phase: o.phase ?? w.phase });
    this.d.openings.push(op);
    return op;
  }
  room(name: string, seed: Vec2, floor: string, o: Partial<Room> = {}, color?: string): Room {
    const r = newRoom(this.id(), o.levelId ?? this.L, name, seed, { floor: floorFinish(floor, color), ...o });
    this.d.rooms.push(r);
    return r;
  }
  manual(name: string, pts: Vec2[], floor: string, o: Partial<Room> = {}): Room {
    const c = v2(pts.reduce((a, p) => a + p.x, 0) / pts.length, pts.reduce((a, p) => a + p.y, 0) / pts.length);
    return this.room(name, c, floor, { mode: 'manual', pts, ...o });
  }
  furn(kind: string, x: number, y: number, rot = 0, o: Partial<Furniture> & { phase?: Phase; level?: string } = {}): Furniture {
    const { phase, level, ...rest } = o;
    const f = newFurniture(this.id(), level ?? this.L, kind, v2(x, y), rot, phase ?? 'new', rest);
    this.d.furniture.push(f);
    return f;
  }
  section(label: string, a: Vec2, b: Vec2, side: 1 | -1 = 1, depth = 15000) {
    this.d.sections.push({ id: this.id(), label, mode: 'section', a, b, side, depth, showDims: true, showLevels: true, showFurniture: true });
  }
  elevations(dirs: ('south' | 'north' | 'east' | 'west')[]) {
    const m = buildModel(this.d, 'proposed');
    const box = buildingBox(this.d, m);
    const names = { south: 'חזית דרומית', north: 'חזית צפונית', east: 'חזית מזרחית', west: 'חזית מערבית' };
    for (const dir of dirs) {
      const l = elevationLine(box, dir);
      const depth = (dir === 'south' || dir === 'north' ? box.maxY - box.minY : box.maxX - box.minX) + 6000;
      this.d.sections.push({ id: this.id(), label: names[dir], mode: 'elevation', a: l.a, b: l.b, side: l.side, depth, showDims: true, showLevels: true, showFurniture: false });
    }
  }
  wallFinish(w: Wall, side: 'left' | 'right', material: string, color: string) { w[side] = { material, color }; }
  sheet(name: string, paper: 'A3' | 'A2' | 'A1', title: string) {
    this.d.info = { ...this.d.info, projectTitle: title, sheetNo: '1' };
    this.d.sheets.push(autoBSheet(this.d, { id: this.id(), name, paper, orientation: 'landscape', blackWhite: false, frame: true, ruler: true }, this.id, ''));
  }
}

// ------------------------------------------------------------------ 1. designed apartment, about 90 m² gross

export function demoApartment(id: Id): BuildingData {
  const b = new B(id);
  b.d.levels[0].name = 'קומת הדירה';
  // Outside 12.00 × 7.50 m = 90 m² gross. Exterior walls 25 cm, interior walls 10 cm.
  b.rect(0, 0, 12000, 7500, 250);
  b.wall(v2(125, 4000), v2(11875, 4000));
  b.wall(v2(4200, 4000), v2(4200, 7375));
  b.wall(v2(7600, 4000), v2(7600, 7375));
  b.wall(v2(9900, 4000), v2(9900, 7375));
  // Doors.
  b.open(v2(125, 3300), 'door-entry', { toward: v2(1000, 3300), hinge: 'end' });
  b.open(v2(3600, 4000), 'door', { toward: v2(3600, 5000), hinge: 'end' });
  b.open(v2(4800, 4000), 'door', { toward: v2(4800, 5000) });
  b.open(v2(8100, 4000), 'door', { w: 800, toward: v2(8100, 5000) });
  b.open(v2(10500, 4000), 'door', { w: 800, toward: v2(10500, 5000) });
  // Windows.
  b.open(v2(2875, 125), 'window-large');
  b.open(v2(6675, 125), 'window-sliding');
  b.open(v2(10075, 125), 'window', { w: 1200, h: 1100, sill: 1050 });
  b.open(v2(2160, 7375), 'window', { w: 1400 });
  b.open(v2(5900, 7375), 'window', { w: 1400 });
  b.open(v2(8750, 7375), 'window', { w: 600, h: 700, sill: 1500 });
  b.open(v2(10890, 7375), 'window', { w: 900 });
  // Rooms: the open living space is divided by drawn boundaries (no wall between living and kitchen).
  b.manual('סלון ופינת אוכל', [v2(250, 250), v2(8600, 250), v2(8600, 3950), v2(250, 3950)], 'parquet');
  b.manual('מטבח', [v2(8600, 250), v2(11750, 250), v2(11750, 3950), v2(8600, 3950)], 'porcelain', {}).floor.color = '#d9d4ca';
  b.room('חדר שינה הורים', v2(2160, 5600), 'laminate');
  b.room('חדר שינה', v2(5900, 5600), 'laminate');
  b.room('חדר רחצה', v2(8750, 5600), 'ceramic', {}, '#e9eef0');
  b.room('חדר עבודה', v2(10900, 5600), 'parquet');
  // Bathroom walls: wall tiles on the faces towards the bathroom.
  const w7600 = b.d.walls.find((w) => w.a.x === 7600)!, w9900 = b.d.walls.find((w) => w.a.x === 9900)!;
  b.wallFinish(w7600, 'right', 'tile-wall', '#dfe7ea');
  b.wallFinish(w9900, 'left', 'tile-wall', '#dfe7ea');
  // Furniture: living and dining.
  b.furn('rug', 2700, 2400, 0);
  b.furn('sofa-3', 2700, 3480, 0, { color: '#6f7d8c' });
  b.furn('coffee-table', 2700, 2350, 0);
  b.furn('armchair', 1000, 2250, 90, { color: '#b0773f' });
  b.furn('tv-unit', 2875, 500, 180);
  b.furn('plant', 650, 650, 0);
  b.furn('dining-table', 6700, 2100, 0);
  b.furn('dining-chair', 6250, 1430, 180); b.furn('dining-chair', 7150, 1430, 180);
  b.furn('dining-chair', 6250, 2770, 0); b.furn('dining-chair', 7150, 2770, 0);
  b.furn('ceiling-lamp', 6700, 2100, 0);
  // Kitchen along the east wall, with an island.
  b.furn('fridge', 11400, 3450, -90);
  b.furn('kitchen-base', 11450, 1800, -90);
  b.furn('kitchen-upper', 11575, 1800, -90);
  b.furn('kitchen-sink', 11500, 1300, -90);
  b.furn('cooktop', 11490, 2400, -90);
  b.furn('island', 9800, 2000, 90);
  // Bedrooms.
  b.furn('bed-double', 2160, 6200, 0, { color: '#e8e2d6', color2: '#8a6a4a' });
  b.furn('nightstand', 1110, 7000, 0); b.furn('nightstand', 3210, 7000, 0);
  b.furn('wardrobe', 3850, 6250, -90);
  b.furn('bed-single', 6900, 6200, 0);
  b.furn('desk', 5000, 6950, 0);
  b.furn('chair', 5000, 6450, 180);
  b.furn('wardrobe', 6600, 4400, 180, { w: 1200 });
  // Bathroom.
  b.furn('toilet', 9500, 6600, -90);
  b.furn('basin', 8300, 7000, 0);
  b.furn('shower', 9400, 4500, 0);
  // Study.
  b.furn('work-desk', 10850, 6850, 0);
  b.furn('office-chair', 10850, 6250, 180);
  b.furn('bookcase', 11570, 5100, -90, { w: 1000 });
  b.section('A', v2(2500, -1500), v2(2500, 9000), 1, 15000);
  b.elevations(['south']);
  b.sheet('גיליון 1 – תוכנית, חתך וחזית', 'A2', 'דירה מעוצבת – הדגמה לימודית');
  return b.d;
}

// ------------------------------------------------------------------ 2. two-storey private house

export function demoHouse(id: Id): BuildingData {
  const b = new B(id);
  const G = b.L;
  const g = b.d.levels[0];
  g.ceilingHeight = 2750;
  const U = id();
  b.d.levels.push({ ...newLevel(U, 'קומה א׳', 3000, 'upper'), ceilingHeight: 2750, slabThickness: 250 });
  b.d.groundLevel = -150;
  b.d.lot = [v2(-4000, -6000), v2(14000, -6000), v2(14000, 12000), v2(-4000, 12000)];
  // Ground floor: outside 10.00 × 8.00 m.
  b.rect(0, 0, 10000, 8000, 250, 'new', G);
  b.wall(v2(2000, 6000), v2(2000, 7875));
  b.wall(v2(125, 6000), v2(2000, 6000));
  b.open(v2(1300, 6000), 'door', { w: 800, toward: v2(1300, 7000) });
  b.open(v2(125, 3000), 'door-entry', { toward: v2(1000, 3000) });
  b.open(v2(2500, 125), 'window-large');
  b.open(v2(6600, 125), 'vitrine');
  b.open(v2(9875, 3000), 'window', { w: 1200, sill: 1050, h: 1100 });
  b.open(v2(125, 5000), 'window', { w: 1200 });
  b.open(v2(1000, 7875), 'window', { w: 600, h: 700, sill: 1500 });
  b.open(v2(8000, 7875), 'window', { w: 1200 });
  b.d.stairs.push({ ...newStair(id(), b.d, g, v2(2200, 7250), 0), risers: 17, going: 270, width: 1000 });
  b.room('סלון, מטבח ופינת אוכל', v2(5000, 3000), 'porcelain-large');
  b.room('שירותי אורחים', v2(1060, 6940), 'ceramic', {}, '#e9eef0');
  b.furn('sofa-corner', 2400, 1600, 0, { color: '#7d8a96' });
  b.furn('coffee-round', 2700, 2900, 0);
  b.furn('tv-unit', 480, 4600, 90);
  b.furn('dining-table', 6400, 3600, 0);
  for (const [x, y, r] of [[5950, 2930, 180], [6850, 2930, 180], [5950, 4270, 0], [6850, 4270, 0]] as const) b.furn('dining-chair', x, y, r);
  b.furn('kitchen-base', 9450, 5600, -90);
  b.furn('fridge', 9400, 7300, -90);
  b.furn('island', 7600, 5600, 90);
  b.furn('toilet', 600, 7400, 90);
  b.furn('basin', 1500, 7520, 0);
  // Upper floor.
  b.rect(0, 0, 10000, 8000, 250, 'new', U);
  b.wall(v2(125, 5200), v2(9875, 5200), { level: U });
  b.wall(v2(2100, 5200), v2(2100, 7875), { level: U });
  b.wall(v2(7600, 5200), v2(7600, 7875), { level: U });
  b.wall(v2(5000, 125), v2(5000, 5200), { level: U });
  b.open(v2(3000, 5200), 'door', { toward: v2(3000, 4000), level: U });
  b.open(v2(7000, 5200), 'door', { toward: v2(7000, 4000), level: U });
  b.open(v2(2100, 6000), 'door', { w: 800, toward: v2(1000, 6000), level: U });
  b.open(v2(7600, 6000), 'door', { w: 800, toward: v2(8600, 6000), level: U });
  b.open(v2(2500, 125), 'window', { w: 1400, level: U });
  b.open(v2(6500, 125), 'door-sliding', { level: U });
  b.open(v2(9875, 2500), 'window', { w: 1200, level: U });
  b.open(v2(125, 2500), 'window', { w: 1200, level: U });
  b.open(v2(1100, 7875), 'window', { w: 600, h: 700, sill: 1500, level: U });
  b.open(v2(8700, 7875), 'window', { w: 900, level: U });
  b.room('חדר הורים', v2(2500, 2600), 'parquet', { levelId: U });
  b.room('חדר ילדים', v2(7400, 2600), 'laminate', { levelId: U });
  b.room('מקלחת', v2(1100, 6500), 'ceramic', { levelId: U }, '#e9eef0');
  b.room('חדר עבודה', v2(8700, 6500), 'parquet', { levelId: U });
  b.room('מבואה ומדרגות', v2(4800, 5900), 'parquet', { levelId: U });
  const upper = b.d.levels[1];
  b.d.slabs.push(newSlab(id(), U, 'balcony', [v2(2000, -1500), v2(8000, -1500), v2(8000, 0), v2(2000, 0)], upper));
  b.d.roofs.push({ ...newRoof(id(), U, [v2(0, 0), v2(10000, 0), v2(10000, 8000), v2(0, 8000)], upper), shape: 'gable', slope: 30, overhang: 500, color: '#9a4f3a', material: 'concrete' });
  b.furn('bed-double', 1500, 4150, 0, { level: U });
  b.furn('nightstand', 475, 4950, 0, { level: U });
  b.furn('wardrobe', 4600, 1500, -90, { level: U });
  b.furn('bed-single', 8750, 4200, -90, { level: U });
  b.furn('desk', 5700, 4850, 0, { level: U });
  b.furn('shower', 700, 7300, 0, { level: U });
  b.furn('toilet', 1700, 7400, -90, { level: U });
  b.furn('basin', 800, 5475, 180, { level: U });
  b.furn('work-desk', 8700, 7350, 0, { level: U });
  b.section('A', v2(3000, -3000), v2(3000, 11000), 1, 12000);
  b.section('B', v2(-2000, 7250), v2(12000, 7250), -1, 12000);
  b.elevations(['south', 'east']);
  b.sheet('גיליון 1 – תוכניות, חתכים וחזיתות', 'A1', 'בית פרטי דו־קומתי – הדגמה לימודית');
  return b.d;
}

// ------------------------------------------------------------------ 3. renovation of an existing apartment

export function demoRenovation(id: Id): BuildingData {
  const b = new B(id);
  b.d.renovation = true;
  b.d.levels[0].name = 'קומת הדירה';
  b.rect(0, 0, 9000, 7000, 250, 'existing');
  b.wall(v2(125, 3500), v2(8875, 3500), { phase: 'existing' });
  b.wall(v2(3500, 125), v2(3500, 3500), { phase: 'demolish' });
  b.wall(v2(3000, 3500), v2(3000, 6875), { phase: 'existing' });
  b.wall(v2(6000, 3500), v2(6000, 6875), { phase: 'demolish' });
  b.wall(v2(7200, 3500), v2(7200, 6875), { phase: 'new' });
  // Openings.
  b.open(v2(3500, 2000), 'door', { toward: v2(4500, 2000), phase: 'demolish' });
  b.open(v2(4500, 125), 'door-entry', { toward: v2(4500, 1000), phase: 'existing' });
  b.open(v2(2400, 3500), 'door', { toward: v2(2400, 4500), hinge: 'end', phase: 'existing' });
  b.open(v2(4400, 3500), 'door', { toward: v2(4400, 4500), phase: 'existing' });
  b.open(v2(6700, 3500), 'door', { w: 800, toward: v2(6700, 4500), phase: 'demolish' });
  b.open(v2(8000, 3500), 'door', { w: 800, toward: v2(8000, 4500), phase: 'new' });
  b.open(v2(6500, 125), 'window', { w: 1600, phase: 'demolish' });
  b.open(v2(6500, 125), 'window-large', { phase: 'new' });
  b.open(v2(1800, 125), 'window', { w: 1200, sill: 1050, h: 1100, phase: 'existing' });
  b.open(v2(1500, 6875), 'window', { w: 1200, phase: 'existing' });
  b.open(v2(4500, 6875), 'window', { w: 1200, phase: 'existing' });
  b.open(v2(8000, 6875), 'window', { w: 600, h: 700, sill: 1500, phase: 'existing' });
  // Rooms of each state.
  b.room('מטבח', v2(1800, 1800), 'ceramic', { state: 'existing' });
  b.room('סלון', v2(6000, 1800), 'terrazzo', { state: 'existing' });
  b.room('חדר שינה 2', v2(4500, 5200), 'terrazzo', { state: 'existing' });
  b.room('חדר רחצה', v2(7400, 5200), 'ceramic', { state: 'existing' });
  b.room('סלון ומטבח פתוח', v2(4500, 1800), 'parquet', { state: 'proposed' });
  b.room('חדר שינה 2 (מורחב)', v2(5000, 5200), 'parquet', { state: 'proposed' });
  b.room('מקלחת', v2(8000, 5200), 'porcelain', { state: 'proposed' }, '#e3e7e8');
  b.room('חדר שינה 1', v2(1500, 5200), 'terrazzo');
  // Furniture: the old items are marked for removal, the new ones are added.
  b.furn('kitchen-base', 1450, 550, 180, { phase: 'existing' });
  b.furn('fridge', 600, 2900, 90, { phase: 'existing' });
  b.furn('dining-round', 2000, 2000, 0, { phase: 'demolish' });
  b.furn('sofa-3', 6000, 3000, 0, { phase: 'demolish' });
  b.furn('armchair', 8200, 1800, -90, { phase: 'demolish' });
  b.furn('island', 2100, 2300, 0, { phase: 'new' });
  b.furn('sofa-corner', 6900, 2300, 0, { phase: 'new', color: '#556b7d' });
  b.furn('coffee-round', 6200, 750, 0, { phase: 'new' });
  b.furn('dining-table', 4300, 2200, 90, { phase: 'new', w: 1600 });
  b.furn('bed-double', 1500, 5650, 0, { phase: 'existing' });
  b.furn('bed-double', 5100, 5650, 0, { phase: 'new' });
  b.furn('bed-single', 4500, 5700, 0, { phase: 'demolish' });
  b.furn('wardrobe', 6850, 4400, -90, { phase: 'new', w: 1600 });
  b.furn('bathtub', 7400, 6370, 0, { phase: 'demolish' });
  b.furn('shower', 8300, 6300, 0, { phase: 'new' });
  b.furn('toilet', 7575, 5300, 90, { phase: 'new' });
  b.furn('basin', 7475, 4700, 90, { phase: 'new' });
  b.section('A', v2(4500, -1500), v2(4500, 8500), 1, 12000);
  b.sheet('גיליון 1 – קיים, הריסה ומוצע', 'A2', 'שיפוץ דירה – הדגמה לימודית');
  return b.d;
}

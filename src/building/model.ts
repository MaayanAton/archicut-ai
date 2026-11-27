// The building model: everything the plans, the 3D view, the sections, the tables and the sheets need, computed from
// the project data in one place. There is no separate decorative model: every view reads these solids.

import { type Vec2, v2 } from '../geometry/vec';
import { add, closestOnSegment, clipHalfPlane, dist, dot, mul, norm, perpL, pointInPoly, polyArea, polylineLength, rotatePt, segmentQuads, sub } from '../site/poly';
import { flat, type Lin } from '../site/prims';
import type { BuildingData, Column, FloorFinish, Furniture, Level, Opening, Phase, Room, Slab, ViewState, Wall } from './types';
import { faceAt, faceNet, graphFaces, grossOutlines, wallGraph, wallOutlines, type Face } from './geom';
import { checkWallOpenings, openingDef, wallLength, type OpeningDef } from './openings';
import { stairGeom, type StairGeom } from './stairs';
import { roofGeom, type RoofGeom } from './roofs';
import { furn, partColor } from './furniture';

export type BRole = 'wall' | 'slab' | 'ceiling' | 'roof' | 'stair' | 'furniture' | 'glass' | 'frame' | 'leaf' | 'column' | 'beam' | 'finish' | 'railing';

export type BPrim =
  | { t: 'prism'; poly: Vec2[]; holes?: Vec2[][]; z0: Lin; z1: Lin; color: string; role: BRole; side?: { n: Vec2; L: string; R: string }; floor?: FloorFinish }
  | { t: 'cyl'; c: Vec2; r: number; z0: number; z1: number; color: string; role: BRole };

export type SolidType = 'wall' | 'opening' | 'room' | 'slab' | 'ceiling' | 'stair' | 'roof' | 'furniture' | 'column' | 'beam';

export interface BSolid { id: string; type: SolidType; levelId: string; phase: Phase; prims: BPrim[] }

export interface OpeningModel { o: Opening; def: OpeningDef; wall: Wall; s0: number; s1: number; u: Vec2; n: Vec2 }

export interface WallModel { w: Wall; outline: Vec2[]; pieces: Vec2[][]; height: number; length: number; openings: OpeningModel[] }

export interface RoomModel { room: Room; net: Vec2[] | null; area: number; perimeter: number; center: Vec2 }

export interface LevelModel {
  level: Level;
  walls: WallModel[];
  faces: Face[];
  rooms: RoomModel[];
  gross: Vec2[][];
  grossArea: number;
  netArea: number;
  stairs: { id: string; g: StairGeom }[];
  roofs: { id: string; g: RoofGeom }[];
}

export interface BuildingModel {
  levels: LevelModel[];
  solids: BSolid[];
  warnings: { id: string; msg: string }[];
  state: ViewState;
}

/** Is an element of this phase shown in this view state? Projects that are not renovations show everything. */
export function inState(phase: Phase, state: ViewState, renovation: boolean): boolean {
  if (!renovation) return true;
  // The demolition plan is the existing state with the parts to be removed marked; new work is not shown in it.
  if (state === 'existing' || state === 'demolition') return phase !== 'new';
  if (state === 'proposed') return phase !== 'demolish';
  return true;
}

/** The state used by solids (3D, sections): the existing building or the proposal. */
export const solidState = (s: ViewState): 'existing' | 'proposed' => (s === 'existing' || s === 'demolition' ? 'existing' : 'proposed');

export const roomInState = (r: Room, state: ViewState, renovation: boolean) =>
  !renovation || r.state === 'all' || r.state === (solidState(state) === 'existing' ? 'existing' : 'proposed');

export const wallHeight = (w: Wall, l: Level) => w.height ?? l.ceilingHeight;

export function levelOf(d: BuildingData, id: string): Level {
  return d.levels.find((l) => l.id === id) ?? d.levels[0];
}

/** Levels sorted from the lowest. */
export const sortedLevels = (d: BuildingData) => [...d.levels].sort((a, b) => a.elevation - b.elevation);

function wallFrame(w: Wall) { const u = norm(sub(w.b, w.a)); return { u, n: perpL(u) }; }

/** Pieces of a wall outline between s0 and s1 along its axis (s measured from a). */
function clipRange(poly: Vec2[], w: Wall, s0: number | null, s1: number | null): Vec2[] {
  const { u } = wallFrame(w);
  let p = poly;
  if (s0 !== null) p = clipHalfPlane(p, add(w.a, mul(u, s0)), u);
  if (s1 !== null && p.length) p = clipHalfPlane(p, add(w.a, mul(u, s1)), mul(u, -1));
  return p.length >= 3 ? p : [];
}

const rectPoly = (c: Vec2, u: Vec2, n: Vec2, s0: number, s1: number, t0: number, t1: number): Vec2[] => [
  add(c, add(mul(u, s0), mul(n, t0))), add(c, add(mul(u, s1), mul(n, t0))), add(c, add(mul(u, s1), mul(n, t1))), add(c, add(mul(u, s0), mul(n, t1))),
];

function openingSolids(om: OpeningModel, base: number, t: number): BPrim[] {
  const { o, def, wall, s0, s1, u, n } = om;
  const out: BPrim[] = [];
  const A = wall.a;
  const z0 = base + o.sill, z1 = base + o.sill + o.height;
  const fw = 50; // frame width
  const P = (poly: Vec2[], a: number, b: number, role: BRole, color: string) => out.push({ t: 'prism', poly, z0: flat(a), z1: flat(b), role, color });
  const fd = Math.min(t, 80); // frame depth
  // Frame: two jambs and a head (and a sill bar for windows).
  P(rectPoly(A, u, n, s0, s0 + fw, -fd / 2, fd / 2), z0, z1, 'frame', o.color);
  P(rectPoly(A, u, n, s1 - fw, s1, -fd / 2, fd / 2), z0, z1, 'frame', o.color);
  P(rectPoly(A, u, n, s0, s1, -fd / 2, fd / 2), z1 - fw, z1, 'frame', o.color);
  if (!def.door) P(rectPoly(A, u, n, s0, s1, -fd / 2, fd / 2), z0, z0 + fw, 'frame', o.color);
  const i0 = s0 + fw, i1 = s1 - fw, top = z1 - fw, bot = def.door ? z0 : z0 + fw;
  const side = o.side === 'L' ? 1 : -1;
  const leafT = 40;
  if (def.style === 'swing' || def.style === 'swing2') {
    // Leaves shown open at 90°, towards the swing side, as drawn in the plan.
    const leaves: [number, number][] = def.style === 'swing2' ? [[i0, (i1 - i0) / 2], [i1, -(i1 - i0) / 2]] : o.hinge === 'start' ? [[i0, i1 - i0]] : [[i1, -(i1 - i0)]];
    for (const [h, len] of leaves) {
      const hinge = add(A, add(mul(u, h), mul(n, (side * t) / 2)));
      const dirU = Math.sign(len);
      const poly = [hinge, add(hinge, mul(n, side * Math.abs(len))), add(add(hinge, mul(n, side * Math.abs(len))), mul(u, dirU * leafT)), add(hinge, mul(u, dirU * leafT))];
      P(poly, bot, top, def.glass ? 'glass' : 'leaf', def.glass ? '#a9cde0' : o.color);
    }
  } else if (def.style === 'sliding') {
    const mid = (i0 + i1) / 2;
    P(rectPoly(A, u, n, i0, mid + 40, -20, 20), bot, top, 'leaf', o.color);
    P(rectPoly(A, u, n, mid - 40, i1, side * 25, side * 65), bot, top, 'leaf', o.color);
  } else {
    // Windows: glass panes in the middle of the wall; sliding windows have two overlapping sashes.
    if (def.style === 'window-sliding') {
      const mid = (i0 + i1) / 2;
      P(rectPoly(A, u, n, i0, mid + 30, -22, -8), bot, top, 'glass', '#a9cde0');
      P(rectPoly(A, u, n, mid - 30, i1, 8, 22), bot, top, 'glass', '#a9cde0');
      P(rectPoly(A, u, n, mid - 25, mid + 25, -fd / 2, fd / 2), bot, top, 'frame', o.color);
    } else {
      P(rectPoly(A, u, n, i0, i1, -10, 10), bot, top, 'glass', '#a9cde0');
      if (def.style === 'window') P(rectPoly(A, u, n, (i0 + i1) / 2 - 25, (i0 + i1) / 2 + 25, -fd / 2, fd / 2), bot, top, 'frame', o.color);
    }
  }
  return out;
}

function furnitureSolids(f: Furniture, levelZ: number): BPrim[] {
  const item = furn(f.kind);
  const z = levelZ + f.elev;
  const out: BPrim[] = [];
  const T = (x: number, y: number) => rotatePt(v2(f.p.x + x, f.p.y + y), f.rot, f.p);
  for (const p of item.parts(f.w, f.d, f.h)) {
    const color = partColor(p.c, f.color, f.color2);
    const role: BRole = p.c === 'glass' ? 'glass' : 'furniture';
    if (p.t === 'box') {
      if (p.x1 - p.x0 < 0.5 || p.y1 - p.y0 < 0.5 || p.z1 - p.z0 < 0.5) continue;
      out.push({ t: 'prism', poly: [T(p.x0, p.y0), T(p.x1, p.y0), T(p.x1, p.y1), T(p.x0, p.y1)], z0: flat(z + p.z0), z1: flat(z + p.z1), color, role });
    } else if (p.r > 0 && p.z1 > p.z0) out.push({ t: 'cyl', c: T(p.cx, p.cy), r: p.r, z0: z + p.z0, z1: z + p.z1, color, role });
  }
  return out;
}

/** Plan outline of a furniture item (its footprint rectangle). */
export function furnitureOutline(f: Furniture): Vec2[] {
  return [v2(-f.w / 2, -f.d / 2), v2(f.w / 2, -f.d / 2), v2(f.w / 2, f.d / 2), v2(-f.w / 2, f.d / 2)].map((q) => rotatePt(v2(f.p.x + q.x, f.p.y + q.y), f.rot, f.p));
}

export function columnOutline(c: Column): Vec2[] {
  return [v2(-c.w / 2, -c.d / 2), v2(c.w / 2, -c.d / 2), v2(c.w / 2, c.d / 2), v2(-c.w / 2, c.d / 2)].map((q) => rotatePt(v2(c.p.x + q.x, c.p.y + q.y), c.rot, c.p));
}

/** Room polygon (net) from its seed and the walls, or the drawn polygon. */
function roomNet(room: Room, faces: Face[]): Vec2[] | null {
  if (room.mode === 'manual') return room.pts.length >= 3 ? room.pts : null;
  const f = faceAt(faces, room.seed);
  if (!f) return null;
  const net = faceNet(f);
  return net.length >= 3 ? net : null;
}

const levelSlabZ = (s: Slab, l: Level): [number, number] => {
  const top = l.elevation + s.top;
  if (s.kind === 'ceiling') return [top, top + s.thickness];
  return [top - s.thickness, top];
};

let cache: { d: BuildingData; state: ViewState; m: BuildingModel } | null = null;

export function buildModel(d: BuildingData, state: ViewState = 'proposed'): BuildingModel {
  if (cache && cache.d === d && cache.state === state) return cache.m;
  const solids: BSolid[] = [];
  const warnings: { id: string; msg: string }[] = [];
  const ren = d.renovation;
  const show = (ph: Phase) => inState(ph, state, ren);
  const sState = solidState(state);
  const solidShow = (ph: Phase) => inState(ph, sState, ren);
  const levels = sortedLevels(d);
  const levelModels: LevelModel[] = [];

  // Stair openings cut in the slab of the level they reach.
  const stairHoles = new Map<string, Vec2[][]>();
  for (const s of d.stairs) {
    if (!solidShow(s.phase) || !s.cutUpper) continue;
    const l = levelOf(d, s.levelId);
    const top = l.elevation + s.rise;
    const target = levels.find((x) => x.id !== l.id && Math.abs(x.elevation - top) < 30);
    if (!target) continue;
    const g = stairGeom(s);
    if (g.outline.length >= 3) { if (!stairHoles.has(target.id)) stairHoles.set(target.id, []); stairHoles.get(target.id)!.push(g.outline); }
  }

  for (const level of levels) {
    const L = level.id;
    const z = level.elevation;
    const wallsAll = d.walls.filter((w) => w.levelId === L && show(w.phase));
    const wallsSolid = wallsAll.filter((w) => solidShow(w.phase));
    const outlines = wallOutlines(wallsAll);
    // Room faces always use the solid state (existing building or proposal).
    const faces = graphFaces(wallGraph(wallsSolid));
    const wms: WallModel[] = [];
    for (const w of wallsAll) {
      const outline = outlines.get(w.id);
      const length = wallLength(w);
      const h = wallHeight(w, level);
      if (!outline || length < 1) { warnings.push({ id: w.id, msg: 'קיר קצר מדי (פחות מ-1 מ״מ).' }); continue; }
      const { u, n } = wallFrame(w);
      const ops = d.openings.filter((o) => o.wallId === w.id && show(o.phase) && (w.phase !== 'demolish' || o.phase !== 'new'));
      for (const p of checkWallOpenings(w, ops, h)) warnings.push({ id: p.id, msg: p.msg });
      const oms: OpeningModel[] = ops.map((o) => ({ o, def: openingDef(o.kind), wall: w, s0: Math.max(0, o.pos - o.width / 2), s1: Math.min(length, o.pos + o.width / 2), u, n })).filter((x) => x.s1 > x.s0).sort((a, b) => a.s0 - b.s0);
      // Plan pieces: the outline with the openings cut out.
      const pieces: Vec2[][] = [];
      let s = null as number | null;
      for (const om of oms) { const p = clipRange(outline, w, s, om.s0); if (p.length) pieces.push(p); s = om.s1; }
      { const p = clipRange(outline, w, s, null); if (p.length) pieces.push(p); }
      wms.push({ w, outline, pieces, height: h, length, openings: oms });
      // Solids: full-height pieces between openings, parts below and above each opening.
      if (solidShow(w.phase)) {
        const solidOps = oms.filter((om) => solidShow(om.o.phase));
        const prims: BPrim[] = [];
        const side = { n, L: w.left.color, R: w.right.color };
        const P = (poly: Vec2[], a: number, b: number) => { if (poly.length >= 3 && b - a > 0.5) prims.push({ t: 'prism', poly, z0: flat(a), z1: flat(b), color: w.core, role: 'wall', side }); };
        let s2 = null as number | null;
        for (const om of solidOps) {
          P(clipRange(outline, w, s2, om.s0), z, z + h);
          const mid = clipRange(outline, w, om.s0, om.s1);
          P(mid, z, z + Math.min(om.o.sill, h));
          P(mid, z + om.o.sill + om.o.height, z + h);
          s2 = om.s1;
        }
        P(clipRange(outline, w, s2, null), z, z + h);
        solids.push({ id: w.id, type: 'wall', levelId: L, phase: w.phase, prims });
        for (const om of solidOps) solids.push({ id: om.o.id, type: 'opening', levelId: L, phase: om.o.phase, prims: openingSolids(om, z, w.thickness) });
      }
    }

    // Rooms
    const rms: RoomModel[] = [];
    for (const room of d.rooms.filter((r) => r.levelId === L && roomInState(r, state, ren))) {
      const net = roomNet(room, faces);
      if (!net) { warnings.push({ id: room.id, msg: `החדר "${room.name}" אינו סגור בקירות. סגרי את הקירות סביבו או שרטטי את גבולו ידנית.` }); rms.push({ room, net: null, area: 0, perimeter: 0, center: room.seed }); continue; }
      const area = polyArea(net);
      const center = labelPoint(net);
      rms.push({ room, net, area, perimeter: polylineLength(net, true), center });
      solids.push({ id: room.id, type: 'room', levelId: L, phase: 'existing', prims: [{ t: 'prism', poly: net, z0: flat(z), z1: flat(z + 6), color: room.floor.color, role: 'finish', floor: room.floor }] });
    }
    const gross = grossOutlines(faces);
    const grossArea = gross.reduce((a, p) => a + polyArea(p), 0);

    // Slabs: automatic floor from the outline, plus drawn slabs.
    const holes = [
      ...(stairHoles.get(L) ?? []),
      ...d.slabs.filter((s) => s.levelId === L && s.kind === 'void' && solidShow(s.phase) && s.pts.length >= 3).map((s) => s.pts),
    ];
    if (level.autoFloor) gross.forEach((g, i) => solids.push({ id: `auto-floor-${L}-${i}`, type: 'slab', levelId: L, phase: 'existing', prims: [{ t: 'prism', poly: g, holes: holesIn(holes, g), z0: flat(z - level.slabThickness), z1: flat(z), color: '#d9d6cf', role: 'slab' }] }));
    for (const s of d.slabs.filter((x) => x.levelId === L && x.kind !== 'void' && solidShow(x.phase) && x.pts.length >= 3)) {
      const [a, b] = levelSlabZ(s, level);
      const prims: BPrim[] = [{ t: 'prism', poly: s.pts, holes: s.kind === 'floor' ? holesIn(holes, s.pts) : undefined, z0: flat(a), z1: flat(b), color: s.color, role: s.kind === 'ceiling' ? 'ceiling' : 'slab' }];
      if (s.kind === 'balcony' && s.railing > 0) {
        const ring = [...s.pts, s.pts[0]];
        for (let i = 0; i + 1 < ring.length; i++) {
          const mid = v2((ring[i].x + ring[i + 1].x) / 2, (ring[i].y + ring[i + 1].y) / 2);
          if (wallsSolid.some((w) => closestOnSegment(mid, w.a, w.b).d < w.thickness / 2 + 60)) continue;
          for (const q of segmentQuads([ring[i], ring[i + 1]], 50)) prims.push({ t: 'prism', poly: q.quad, z0: flat(b), z1: flat(b + s.railing), color: '#a9cde0', role: 'railing' });
        }
      }
      solids.push({ id: s.id, type: s.kind === 'ceiling' ? 'ceiling' : 'slab', levelId: L, phase: s.phase, prims });
    }
    const roofsHere = d.roofs.filter((r) => r.levelId === L && solidShow(r.phase));
    if (level.autoCeiling && !roofsHere.length) {
      const top = z + level.ceilingHeight;
      const above = levels.some((x) => x.id !== L && x.elevation > z && Math.abs(x.elevation - x.slabThickness - top) < 30);
      if (!above) gross.forEach((g, i) => solids.push({ id: `auto-ceiling-${L}-${i}`, type: 'ceiling', levelId: L, phase: 'existing', prims: [{ t: 'prism', poly: g, z0: flat(top), z1: flat(top + level.slabThickness), color: '#e4e1da', role: 'ceiling' }] }));
    }

    // Stairs
    const sts: LevelModel['stairs'] = [];
    for (const s of d.stairs.filter((x) => x.levelId === L && show(x.phase))) {
      const g = stairGeom(s);
      sts.push({ id: s.id, g });
      for (const e of g.errors) warnings.push({ id: s.id, msg: `מדרגות: ${e}` });
      if (!solidShow(s.phase) || g.errors.length) continue;
      const waist = 180;
      solids.push({ id: s.id, type: 'stair', levelId: L, phase: s.phase, prims: g.treads.map((t) => ({ t: 'prism' as const, poly: t.poly, z0: flat(z + Math.max(0, t.top - g.riser - waist)), z1: flat(z + t.top), color: s.color, role: 'stair' as const })) });
    }

    // Roofs
    const rfs: LevelModel['roofs'] = [];
    for (const r of d.roofs.filter((x) => x.levelId === L && show(x.phase))) {
      const g = roofGeom(r, z);
      rfs.push({ id: r.id, g });
      if (!solidShow(r.phase)) continue;
      solids.push({ id: r.id, type: 'roof', levelId: L, phase: r.phase, prims: g.prims.map((p) => ({ t: 'prism' as const, poly: p.poly, z0: p.z0, z1: p.z1, color: p.part === 'gable' ? '#e9e4da' : r.color, role: (p.part === 'gable' ? 'wall' : 'roof') as BRole })) });
    }

    for (const f of d.furniture.filter((x) => x.levelId === L && solidShow(x.phase))) solids.push({ id: f.id, type: 'furniture', levelId: L, phase: f.phase, prims: furnitureSolids(f, z) });
    for (const c of d.columns.filter((x) => x.levelId === L && solidShow(x.phase))) {
      const h = c.height ?? level.ceilingHeight;
      solids.push({ id: c.id, type: 'column', levelId: L, phase: c.phase, prims: [c.round ? { t: 'cyl', c: c.p, r: c.w / 2, z0: z, z1: z + h, color: c.color, role: 'column' } : { t: 'prism', poly: columnOutline(c), z0: flat(z), z1: flat(z + h), color: c.color, role: 'column' }] });
    }
    for (const b of d.beams.filter((x) => x.levelId === L && solidShow(x.phase))) {
      const q = segmentQuads([b.a, b.b], b.w)[0];
      if (!q) continue;
      const top = z + level.ceilingHeight;
      solids.push({ id: b.id, type: 'beam', levelId: L, phase: b.phase, prims: [{ t: 'prism', poly: q.quad, z0: flat(top - b.h), z1: flat(top), color: b.color, role: 'beam' }] });
    }

    levelModels.push({ level, walls: wms, faces, rooms: rms, gross, grossArea, netArea: rms.reduce((a, r) => a + r.area, 0), stairs: sts, roofs: rfs });
  }
  const m: BuildingModel = { levels: levelModels, solids, warnings, state };
  cache = { d, state, m };
  return m;
}

/** A point well inside a polygon for its label: the centroid when it is inside, else the middle of the widest horizontal run. */
export function labelPoint(pts: Vec2[]): Vec2 {
  const c = centroidOf(pts);
  if (pointInPoly(c, pts)) return c;
  let best: Vec2 | null = null, bestW = -1;
  const ys = pts.map((p) => p.y);
  const y0 = Math.min(...ys), y1 = Math.max(...ys);
  for (let i = 1; i < 12; i++) {
    const y = y0 + ((y1 - y0) * i) / 12;
    const xs: number[] = [];
    for (let j = 0; j < pts.length; j++) {
      const a = pts[j], b = pts[(j + 1) % pts.length];
      if ((a.y > y) !== (b.y > y)) xs.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x));
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) if (xs[k + 1] - xs[k] > bestW) { bestW = xs[k + 1] - xs[k]; best = v2((xs[k] + xs[k + 1]) / 2, y); }
  }
  return best ?? c;
}

function centroidOf(pts: Vec2[]): Vec2 {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    const c = p.x * q.y - q.x * p.y;
    a += c; cx += (p.x + q.x) * c; cy += (p.y + q.y) * c;
  }
  if (Math.abs(a) < 1e-9) return pts[0];
  return v2(cx / (3 * a), cy / (3 * a));
}

/** Holes that lie inside a slab outline (by their first point). */
function holesIn(holes: Vec2[][], outline: Vec2[]): Vec2[][] | undefined {
  const inside = holes.filter((h) => h.every((p) => pointIn(p, outline)));
  return inside.length ? inside : undefined;
}
function pointIn(p: Vec2, poly: Vec2[]) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}

export { dist, dot };

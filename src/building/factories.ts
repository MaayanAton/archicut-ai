// Creating new elements with the default sizes the interface shows (all editable).

import { type Vec2, v2 } from '../geometry/vec';
import type { BuildingData, Column, Beam, FloorFinish, FloorZone, Furniture, Level, Opening, OpeningKind, Phase, Roof, Room, Slab, SlabKind, Stair, Wall, WallKind, WallZone, Finish } from './types';
import { openingDef, type OpeningPreset } from './openings';
import { richFinish } from '../materials/finish';
import { furn } from './furniture';
import { material } from './materials';
import { sortedLevels } from './model';

export const WALL_DEFAULTS: Record<WallKind, { thickness: number; core: string }> = {
  exterior: { thickness: 250, core: '#d9d6cf' },
  interior: { thickness: 100, core: '#e2dfd8' },
  partition: { thickness: 75, core: '#e8e5df' },
};

export function newWall(id: string, levelId: string, a: Vec2, b: Vec2, o: { thickness?: number; height?: number | null; kind?: WallKind; phase?: Phase } = {}): Wall {
  const kind = o.kind ?? 'interior';
  return {
    id, levelId, a, b, thickness: o.thickness ?? WALL_DEFAULTS[kind].thickness, height: o.height ?? null, kind, phase: o.phase ?? 'new',
    left: { material: 'paint', color: '#f4f1ea' }, right: { material: kind === 'exterior' ? 'plaster' : 'paint', color: kind === 'exterior' ? '#e9e4da' : '#f4f1ea' }, core: WALL_DEFAULTS[kind].core,
  };
}

export function newOpening(id: string, wallId: string, kind: OpeningKind, pos: number, o: { width?: number | null; height?: number | null; sill?: number | null; phase?: Phase; side?: 'L' | 'R'; hinge?: 'start' | 'end' } = {}): Opening {
  const def = openingDef(kind);
  return {
    id, wallId, kind, pos, width: o.width ?? def.w, height: o.height ?? def.h, sill: def.door ? 0 : o.sill ?? def.sill, side: o.side ?? 'L', hinge: o.hinge ?? 'start',
    color: def.color, material: def.material, phase: o.phase ?? 'new',
  };
}

export function floorFinish(mat: string, color?: string, angle = 0): FloorFinish {
  const m = material(mat);
  return { material: m.id, color: color ?? m.color, tileW: m.tileW, tileH: m.tileH, angle };
}

export function newRoom(id: string, levelId: string, name: string, seed: Vec2, o: Partial<Room> = {}): Room {
  return { id, levelId, name, mode: 'auto', seed, pts: [], floor: floorFinish('porcelain'), state: 'all', showArea: true, ...o };
}

export function newFurniture(id: string, levelId: string, kind: string, p: Vec2, rot = 0, phase: Phase = 'new', o: Partial<Furniture> = {}): Furniture {
  const f = furn(kind);
  // 4.0 items come with their third colour, the materials of their parts and, for lights, a light that is on.
  const extra: Partial<Furniture> = {
    ...(f.color3 ? { color3: f.color3 } : {}),
    ...(f.mats ? { mats: f.mats.slice() } : {}),
    ...(f.light ? { light: { on: true, dim: 1, temp: 'warm' } } : {}),
  };
  return { id, levelId, kind, name: '', p, rot, w: f.w, d: f.d, h: f.h, elev: f.elev, color: f.color, color2: f.color2, material: f.material, phase, ...extra, ...o };
}

/** 4.0: a floor finish of a catalogue material with its texture settings (planks, tiles, joints). */
export function richFloor(materialId: string, color?: string, angle = 0): FloorFinish {
  const r = richFinish(materialId, color);
  return { material: r.material, color: r.color, v: 4, color2: r.color2, tileW: r.tw, tileH: r.th, angle, ...(r.layout ? { layout: r.layout } : {}), ...(r.grout ? { grout: r.grout } : {}), ...(r.groutW !== undefined ? { groutW: r.groutW } : {}) };
}

/** 4.0: a wall finish of a catalogue material. */
export const richWall = (materialId: string, color?: string): Finish => richFinish(materialId, color);

export const newFloorZone = (id: string, levelId: string, pts: Vec2[], floor: FloorFinish, name = 'אזור רצפה'): FloorZone => ({ id, levelId, name, pts, floor });

export const newWallZone = (id: string, side: 'L' | 'R', finish: Finish, o: Partial<WallZone> = {}): WallZone => ({ id, side, s0: null, s1: null, z0: 0, z1: 1200, finish, ...o });

/** 4.0: an opening made from a designed preset (arched door, round window...). */
export function presetOpening(id: string, wallId: string, pr: OpeningPreset, pos: number, o: { phase?: Phase; side?: 'L' | 'R'; hinge?: 'start' | 'end' } = {}): Opening {
  const base = newOpening(id, wallId, pr.kind, pos, { width: pr.w, height: pr.h, sill: pr.sill, phase: o.phase, side: o.side, hinge: o.hinge });
  return {
    ...base, color: pr.color ?? base.color, preset: pr.id,
    ...(pr.shape && pr.shape !== 'rect' ? { shape: pr.shape } : {}), ...(pr.variant ? { variant: pr.variant } : {}), ...(pr.rise ? { rise: pr.rise } : {}),
    ...(pr.leaf ? { leaf: pr.leaf } : {}), ...(pr.glass ? { glass: pr.glass } : {}), ...(pr.depth ? { depth: pr.depth } : {}),
  };
}

/** Height to the next level above (floor to floor), or the level's ceiling height plus its slab. */
export function riseToNext(d: BuildingData, level: Level): number {
  const up = sortedLevels(d).find((l) => l.elevation > level.elevation + 1);
  return up ? up.elevation - level.elevation : level.ceilingHeight + level.slabThickness;
}

export function newStair(id: string, d: BuildingData, level: Level, p: Vec2, rot = 0, phase: Phase = 'new'): Stair {
  const rise = riseToNext(d, level);
  const risers = Math.max(2, Math.ceil(rise / 175));
  return { id, levelId: level.id, shape: 'straight', p, rot, width: 1000, rise, risers, going: 280, landing: 1000, gap: 100, turn: 'left', cutUpper: true, color: '#cfc8bb', material: 'stone', phase };
}

export const newColumn = (id: string, levelId: string, p: Vec2, phase: Phase = 'new'): Column => ({ id, levelId, p, w: 300, d: 300, round: false, rot: 0, height: null, color: '#cfcac0', phase });
export const newBeam = (id: string, levelId: string, a: Vec2, b: Vec2, phase: Phase = 'new'): Beam => ({ id, levelId, a, b, w: 200, h: 400, color: '#cfcac0', phase });

export function newSlab(id: string, levelId: string, kind: SlabKind, pts: Vec2[], level: Level, phase: Phase = 'new'): Slab {
  return {
    id, levelId, kind, pts, thickness: kind === 'ceiling' ? 200 : kind === 'balcony' ? 200 : level.slabThickness,
    top: kind === 'ceiling' ? level.ceilingHeight : 0, railing: kind === 'balcony' ? 1050 : 0,
    color: kind === 'balcony' ? '#cfc8bb' : '#d9d6cf', material: kind === 'balcony' ? 'stone' : 'concrete', phase,
  };
}

export function newRoof(id: string, levelId: string, pts: Vec2[], level: Level, phase: Phase = 'new'): Roof {
  return { id, levelId, shape: 'flat', pts, base: level.ceilingHeight, thickness: 250, slope: 25, overhang: 0, parapet: 0, gableWalls: true, color: '#8f8a83', material: 'concrete', phase };
}

export const rectPts = (a: Vec2, b: Vec2): Vec2[] => {
  const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
  return [v2(x0, y0), v2(x1, y0), v2(x1, y1), v2(x0, y1)];
};

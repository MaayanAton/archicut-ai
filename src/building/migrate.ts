// Creating empty building data and bringing stored or imported building data up to the current schema.
// Migration only adds missing fields with safe defaults; it never changes a value the user entered.

import { v2, type Vec2 } from '../geometry/vec';
import { BUILDING_SCHEMA, type BuildingData, type Level, type SheetInfo } from './types';
import { isOpeningKind } from './openings';

export const emptyBInfo = (): SheetInfo => ({ projectTitle: '', student: '', course: '', lecturer: '', institution: '', date: '', sheetNo: '' });

/** Default sizes for a new level. They are ordinary editable defaults, shown in the level panel. */
export const newLevel = (id: string, name = 'קומת קרקע', elevation = 0, kind: Level['kind'] = 'ground'): Level => ({
  id, name, kind, elevation, ceilingHeight: 2700, slabThickness: 250, autoFloor: true, autoCeiling: true, background: null, bgOrigin: v2(0, 0), bgLocked: false,
});

export function emptyBuilding(levelId: string): BuildingData {
  return {
    schema: BUILDING_SCHEMA,
    levels: [newLevel(levelId)],
    walls: [], openings: [], rooms: [], slabs: [], stairs: [], roofs: [], furniture: [], columns: [], beams: [], annotations: [],
    sections: [], sheets: [], info: emptyBInfo(), lot: [], groundLevel: 0, renovation: false, drawPhase: 'new',
    grid: { size: 100, show: true, snap: true }, north: 0,
  };
}

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const isVec = (x: unknown): x is Vec2 => isObj(x) && isNum(x.x) && isNum(x.y);
const isPts = (x: unknown): x is Vec2[] => Array.isArray(x) && x.every(isVec);
const phase = (x: unknown) => (x === 'existing' || x === 'demolish' || x === 'new' ? x : 'new');

export class BuildingDataError extends Error {}

// ---------------------------------------------------------------- 4.0 fields (all optional)

const SHAPES = new Set(['rect', 'arch', 'segment', 'pointed', 'ellipse', 'round', 'oval']);
const VARIANTS = new Set(['passage', 'barn', 'protected', 'deco', 'grid', 'niche', 'metal', 'pivot']);
const isStr = (x: unknown): x is string => typeof x === 'string';

/** A finish with its 4.0 fields checked: fields of the wrong type are dropped, the 3.0 fields are kept as they are. */
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

export function cleanFinish<T extends { material: string; color: string }>(f: unknown, fallback: T): T {
  if (!isObj(f) || !isStr(f.material) || !isStr(f.color)) return fallback;
  const out: Record<string, unknown> = { ...f };
  if (!HEX.test(f.color)) out.color = fallback.color;
  for (const k of ['tw', 'th', 'tileW', 'tileH', 'angle', 'groutW', 'rough', 'metal', 'opacity']) if (k in out && !isNum(out[k])) delete out[k];
  for (const k of ['tw', 'th', 'tileW', 'tileH']) if (k in out && !((out[k] as number) > 0)) delete out[k];
  for (const k of ['color2', 'grout', 'img', 'layout']) if (k in out && !isStr(out[k])) delete out[k];
  for (const k of ['color2', 'grout']) if (k in out && !HEX.test(out[k] as string)) delete out[k];
  if ('v' in out && out.v !== 4) delete out.v;
  return out as T;
}

function clean4<T extends Record<string, unknown>>(x: T): T {
  const o: Record<string, unknown> = x;
  if ('locked' in o && typeof o.locked !== 'boolean') delete o.locked;
  if ('hidden' in o && typeof o.hidden !== 'boolean') delete o.hidden;
  if ('layer' in o && !isStr(o.layer)) delete o.layer;
  return x;
}

/** Accepts building data from storage or a file. Throws BuildingDataError for data from a newer version. */
export function migrateBuilding(raw: unknown, newId: () => string): { data: BuildingData; dropped: number } {
  const lid = newId();
  const base = emptyBuilding(lid);
  if (!isObj(raw)) return { data: base, dropped: 0 };
  const schema = isNum(raw.schema) ? raw.schema : 0;
  if (schema > BUILDING_SCHEMA) throw new BuildingDataError('הפרויקט נוצר בגרסה חדשה יותר של האפליקציה.');
  let dropped = 0;
  const keep = <T>(arr: unknown, ok: (x: Record<string, unknown>) => boolean, fix: (x: Record<string, unknown>) => T): T[] => {
    const out: T[] = [];
    for (const x of Array.isArray(arr) ? arr : []) { if (isObj(x) && typeof x.id === 'string' && ok(x)) out.push(fix(x)); else dropped++; }
    return out;
  };
  const levels = keep(raw.levels, (x) => isNum(x.elevation), (x) => ({ ...newLevel(String(x.id)), ...(x as object), bgOrigin: isVec(x.bgOrigin) ? x.bgOrigin : v2(0, 0) }) as Level);
  if (!levels.length) levels.push(base.levels[0]);
  const lids = new Set(levels.map((l) => l.id));
  const onLevel = (x: Record<string, unknown>) => typeof x.levelId === 'string' && lids.has(x.levelId);
  const paint = () => ({ material: 'paint', color: '#f4f1ea' });
  const walls = keep(raw.walls, (x) => onLevel(x) && isVec(x.a) && isVec(x.b) && isNum(x.thickness), (x) => {
    const w = clean4({ kind: 'interior', height: null, core: '#d9d6cf', left: paint(), right: paint(), ...(x as object), phase: phase(x.phase) }) as BuildingData['walls'][number];
    w.left = cleanFinish(w.left, paint());
    w.right = cleanFinish(w.right, paint());
    if ('zones' in w) {
      const zs = Array.isArray(w.zones) ? w.zones.filter((z) => isObj(z) && isStr(z.id) && (z.side === 'L' || z.side === 'R') && isNum(z.z0) && isObj(z.finish)) : [];
      if (zs.length) w.zones = zs.map((z) => ({ ...z, s0: isNum(z.s0) ? z.s0 : null, s1: isNum(z.s1) ? z.s1 : null, z1: isNum(z.z1) ? z.z1 : null, finish: cleanFinish(z.finish, paint()) }));
      else delete w.zones;
    }
    return w;
  });
  const wids = new Set(walls.map((w) => w.id));
  const data: BuildingData = {
    ...base,
    ...(raw as Partial<BuildingData>),
    schema: BUILDING_SCHEMA,
    levels,
    walls,
    openings: keep(raw.openings, (x) => typeof x.wallId === 'string' && wids.has(x.wallId) && isOpeningKind(x.kind) && isNum(x.pos) && isNum(x.width) && isNum(x.height), (x) => {
      const o = clean4({ sill: 0, side: 'L', hinge: 'start', color: '#f5f5f2', material: 'wood', ...(x as object), phase: phase(x.phase) }) as BuildingData['openings'][number];
      if ('shape' in o && !SHAPES.has(o.shape as string)) delete o.shape;
      if ('variant' in o && !VARIANTS.has(o.variant as string)) delete o.variant;
      for (const k of ['rise', 'depth'] as const) if (k in o && !isNum(o[k])) delete o[k];
      return o;
    }),
    rooms: keep(raw.rooms, (x) => onLevel(x) && isVec(x.seed), (x) => {
      const ff = { material: 'porcelain', color: '#d6d2ca', tileW: 600, tileH: 600, angle: 0 };
      const r = clean4({ name: 'חדר', mode: 'auto', state: 'all', showArea: true, floor: ff, ...(x as object), pts: isPts(x.pts) ? x.pts : [] as Vec2[] }) as BuildingData['rooms'][number];
      r.floor = cleanFinish(r.floor, ff);
      if ('ceiling' in r) {
        const c = r.ceiling as unknown;
        if (isObj(c) && isObj(c.finish)) r.ceiling = { drop: 0, beams: 0, beamW: 150, beamH: 200, beamDir: 0, beamColor: '#8a6a4a', ...c, finish: cleanFinish(c.finish, { material: 'paint', color: '#f7f6f2' }) } as NonNullable<typeof r.ceiling>;
        else delete r.ceiling;
      }
      if ('safeRoom' in r && typeof r.safeRoom !== 'boolean') delete r.safeRoom;
      return r;
    }),
    slabs: keep(raw.slabs, (x) => onLevel(x) && isPts(x.pts), (x) => ({ kind: 'floor', thickness: 200, top: 0, railing: 0, color: '#d9d6cf', material: 'concrete', ...(x as object), phase: phase(x.phase) }) as BuildingData['slabs'][number]),
    stairs: keep(raw.stairs, (x) => onLevel(x) && isVec(x.p), (x) => ({ shape: 'straight', rot: 0, width: 1000, rise: 2950, risers: 17, going: 280, landing: 1000, gap: 100, turn: 'left', cutUpper: true, color: '#cfc8bb', material: 'stone', ...(x as object), phase: phase(x.phase) }) as BuildingData['stairs'][number]),
    roofs: keep(raw.roofs, (x) => onLevel(x) && isPts(x.pts), (x) => ({ shape: 'flat', base: 2700, thickness: 250, slope: 25, overhang: 0, parapet: 0, gableWalls: true, color: '#8f8a83', material: 'concrete', ...(x as object), phase: phase(x.phase) }) as BuildingData['roofs'][number]),
    furniture: keep(raw.furniture, (x) => onLevel(x) && isVec(x.p) && typeof x.kind === 'string', (x) => {
      const f = clean4({ name: '', rot: 0, w: 500, d: 500, h: 500, elev: 0, color: '#999999', color2: '#777777', material: 'paint', ...(x as object), phase: phase(x.phase) }) as BuildingData['furniture'][number];
      if ('mats' in f && !(Array.isArray(f.mats) && f.mats.every((m) => m === null || isStr(m)))) delete f.mats;
      if (!isStr(f.color) || !HEX.test(f.color)) f.color = '#999999';
      if (!isStr(f.color2) || !HEX.test(f.color2)) f.color2 = '#777777';
      if ('color3' in f && !(isStr(f.color3) && HEX.test(f.color3))) delete f.color3;
      if ('light' in f) { const l = f.light as unknown; if (isObj(l)) f.light = { on: l.on !== false, dim: isNum(l.dim) ? Math.max(0, Math.min(1, l.dim)) : 1, temp: isStr(l.temp) && (['warm', 'neutral', 'cold'].includes(l.temp) || HEX.test(l.temp)) ? l.temp : 'warm' }; else delete f.light; }
      return f;
    }),
    columns: keep(raw.columns, (x) => onLevel(x) && isVec(x.p), (x) => ({ w: 300, d: 300, round: false, rot: 0, height: null, color: '#cfcac0', ...(x as object), phase: phase(x.phase) }) as BuildingData['columns'][number]),
    beams: keep(raw.beams, (x) => onLevel(x) && isVec(x.a) && isVec(x.b), (x) => ({ w: 200, h: 400, color: '#cfcac0', ...(x as object), phase: phase(x.phase) }) as BuildingData['beams'][number]),
    annotations: keep(raw.annotations, (x) => onLevel(x) && (x.type === 'dim' ? isVec(x.a) && isVec(x.b) : x.type === 'text' && isVec(x.p)), (x) => x as unknown as BuildingData['annotations'][number]),
    sections: keep(raw.sections, (x) => isVec(x.a) && isVec(x.b), (x) => ({ mode: 'section', side: 1, depth: 20000, showDims: true, showLevels: true, showFurniture: true, label: 'A', ...(x as object) }) as BuildingData['sections'][number]),
    sheets: keep(raw.sheets, (x) => Array.isArray(x.items), (x) => x as unknown as BuildingData['sheets'][number]),
    info: { ...base.info, ...(isObj(raw.info) ? raw.info : {}) },
    lot: isPts(raw.lot) ? raw.lot : [],
    groundLevel: isNum(raw.groundLevel) ? raw.groundLevel : 0,
    renovation: raw.renovation === true,
    drawPhase: phase(raw.drawPhase),
    grid: { ...base.grid, ...(isObj(raw.grid) ? raw.grid : {}) },
    north: isNum(raw.north) ? raw.north : 0,
  };
  // 4.0 collections: kept only when valid; absent in projects from 3.0.
  if ('floorZones' in raw) {
    const fz = keep(raw.floorZones, (x) => onLevel(x) && isPts(x.pts) && isObj(x.floor), (x) => clean4({ name: 'אזור רצפה', ...(x as object), floor: cleanFinish(x.floor, { material: 'porcelain', color: '#d6d2ca', tileW: 600, tileH: 600, angle: 0 }) }) as NonNullable<BuildingData['floorZones']>[number]);
    if (fz.length) data.floorZones = fz; else delete data.floorZones;
  }
  if ('layers' in raw) {
    const ls = keep(raw.layers, (x) => isStr(x.name), (x) => ({ id: String(x.id), name: String(x.name), visible: x.visible !== false, locked: x.locked === true }));
    if (ls.length) data.layers = ls; else delete data.layers;
  }
  if ('images' in raw) {
    const im = keep(raw.images, (x) => isStr(x.dataUrl) && /^data:image\/(png|jpeg|webp);base64,/.test(x.dataUrl), (x) => ({ id: String(x.id), name: isStr(x.name) ? x.name : 'תמונה', dataUrl: String(x.dataUrl), w: isNum(x.w) ? x.w : 0, h: isNum(x.h) ? x.h : 0 }));
    if (im.length) data.images = im; else delete data.images;
  }
  for (const list of [data.slabs, data.stairs, data.roofs, data.columns, data.beams, data.annotations] as unknown as Record<string, unknown>[][]) for (const x of list) clean4(x);
  return { data, dropped };
}

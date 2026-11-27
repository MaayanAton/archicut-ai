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
  const walls = keep(raw.walls, (x) => onLevel(x) && isVec(x.a) && isVec(x.b) && isNum(x.thickness), (x) => ({
    kind: 'interior', height: null, core: '#d9d6cf', left: { material: 'paint', color: '#f4f1ea' }, right: { material: 'paint', color: '#f4f1ea' }, ...(x as object), phase: phase(x.phase),
  }) as BuildingData['walls'][number]);
  const wids = new Set(walls.map((w) => w.id));
  const data: BuildingData = {
    ...base,
    ...(raw as Partial<BuildingData>),
    schema: BUILDING_SCHEMA,
    levels,
    walls,
    openings: keep(raw.openings, (x) => typeof x.wallId === 'string' && wids.has(x.wallId) && isOpeningKind(x.kind) && isNum(x.pos) && isNum(x.width) && isNum(x.height), (x) => ({ sill: 0, side: 'L', hinge: 'start', color: '#f5f5f2', material: 'wood', ...(x as object), phase: phase(x.phase) }) as BuildingData['openings'][number]),
    rooms: keep(raw.rooms, (x) => onLevel(x) && isVec(x.seed), (x) => ({ name: 'חדר', mode: 'auto', state: 'all', showArea: true, floor: { material: 'porcelain', color: '#d6d2ca', tileW: 600, tileH: 600, angle: 0 }, ...(x as object), pts: isPts(x.pts) ? x.pts : [] as Vec2[] }) as BuildingData['rooms'][number]),
    slabs: keep(raw.slabs, (x) => onLevel(x) && isPts(x.pts), (x) => ({ kind: 'floor', thickness: 200, top: 0, railing: 0, color: '#d9d6cf', material: 'concrete', ...(x as object), phase: phase(x.phase) }) as BuildingData['slabs'][number]),
    stairs: keep(raw.stairs, (x) => onLevel(x) && isVec(x.p), (x) => ({ shape: 'straight', rot: 0, width: 1000, rise: 2950, risers: 17, going: 280, landing: 1000, gap: 100, turn: 'left', cutUpper: true, color: '#cfc8bb', material: 'stone', ...(x as object), phase: phase(x.phase) }) as BuildingData['stairs'][number]),
    roofs: keep(raw.roofs, (x) => onLevel(x) && isPts(x.pts), (x) => ({ shape: 'flat', base: 2700, thickness: 250, slope: 25, overhang: 0, parapet: 0, gableWalls: true, color: '#8f8a83', material: 'concrete', ...(x as object), phase: phase(x.phase) }) as BuildingData['roofs'][number]),
    furniture: keep(raw.furniture, (x) => onLevel(x) && isVec(x.p) && typeof x.kind === 'string', (x) => ({ name: '', rot: 0, w: 500, d: 500, h: 500, elev: 0, color: '#999999', color2: '#777777', material: 'paint', ...(x as object), phase: phase(x.phase) }) as BuildingData['furniture'][number]),
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
  return { data, dropped };
}

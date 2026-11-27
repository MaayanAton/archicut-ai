// Creating empty site data and bringing older or incomplete site data up to the current schema.
// Migration only adds missing fields with safe defaults; it never changes a value the user entered.

import { v2 } from '../geometry/vec';
import { DEFAULT_LAYERS, isKnownKind, lib } from './library';
import { SITE_SCHEMA, type SheetInfo, type SiteData, type SiteElement, type SiteLayer, type TerrainData } from './types';

export const emptyInfo = (): SheetInfo => ({ projectTitle: '', student: '', course: '', lecturer: '', institution: '', date: '', sheetNo: '' });

export const emptyTerrain = (): TerrainData => ({ base: 0, points: [], mounds: [], contourStep: 250, showContours: true, showPoints: true });

export function emptySite(): SiteData {
  return {
    schema: SITE_SCHEMA,
    elements: [],
    layers: DEFAULT_LAYERS.map((l) => ({ ...l })),
    terrain: emptyTerrain(),
    sections: [],
    sheets: [],
    info: emptyInfo(),
    background: null,
    backgroundOrigin: v2(0, 0),
    grid: { size: 500, show: true, snap: true },
    snap: { points: true, lines: true },
    north: 0,
  };
}

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const isVec = (x: unknown) => isObj(x) && isNum(x.x) && isNum(x.y);

function validGeom(g: unknown): boolean {
  if (!isObj(g)) return false;
  if (g.type === 'point') return isVec(g.p);
  if (g.type === 'line' || g.type === 'area') return Array.isArray(g.pts) && g.pts.every(isVec);
  if (g.type === 'dim') return isVec(g.a) && isVec(g.b);
  return false;
}

export class SiteDataError extends Error {}

/**
 * Accepts site data from storage or from an imported file and returns a complete, current SiteData.
 * Throws SiteDataError when the data is from a newer version. Unreadable elements are dropped and counted.
 */
export function migrateSite(raw: unknown): { data: SiteData; dropped: number } {
  const base = emptySite();
  if (!isObj(raw)) return { data: base, dropped: 0 };
  const schema = isNum(raw.schema) ? raw.schema : 0;
  if (schema > SITE_SCHEMA) throw new SiteDataError('הפרויקט נוצר בגרסה חדשה יותר של האפליקציה.');
  let dropped = 0;
  const layers: SiteLayer[] = Array.isArray(raw.layers) ? (raw.layers as SiteLayer[]).filter((l) => isObj(l) && typeof l.id === 'string') : base.layers;
  for (const l of DEFAULT_LAYERS) if (!layers.some((x) => x.id === l.id)) layers.push({ ...l });
  const elements: SiteElement[] = [];
  for (const e of Array.isArray(raw.elements) ? raw.elements : []) {
    if (!isObj(e) || typeof e.id !== 'string' || typeof e.kind !== 'string' || !validGeom(e.geom)) { dropped++; continue; }
    const L = lib(e.kind);
    const el = e as unknown as SiteElement;
    elements.push({
      ...el,
      layer: typeof el.layer === 'string' && layers.some((l) => l.id === el.layer) ? el.layer : L.layer,
      name: typeof el.name === 'string' ? el.name : '',
      params: { ...(isKnownKind(el.kind) ? L.params : {}), ...(isObj(el.params) ? el.params : {}) },
      elevMode: el.elevMode === 'absolute' ? 'absolute' : 'ground',
      elev: isNum(el.elev) ? el.elev : 0,
      color: typeof el.color === 'string' ? el.color : '#999999',
      material: (typeof el.material === 'string' ? el.material : L.material) as SiteElement['material'],
    });
  }
  const t = isObj(raw.terrain) ? raw.terrain : {};
  const terrain: TerrainData = {
    ...base.terrain,
    ...(t as Partial<TerrainData>),
    points: Array.isArray(t.points) ? (t.points as TerrainData['points']).filter((p) => isObj(p) && isVec(p.p) && isNum(p.z)) : [],
    mounds: Array.isArray(t.mounds) ? (t.mounds as TerrainData['mounds']).filter((m) => isObj(m) && isVec(m.c) && isNum(m.r) && isNum(m.h)) : [],
  };
  const data: SiteData = {
    ...base,
    ...(raw as Partial<SiteData>),
    schema: SITE_SCHEMA,
    elements,
    layers,
    terrain,
    sections: Array.isArray(raw.sections) ? (raw.sections as SiteData['sections']).filter((s) => isObj(s) && isVec(s.a) && isVec(s.b)) : [],
    sheets: Array.isArray(raw.sheets) ? (raw.sheets as SiteData['sheets']).filter((s) => isObj(s) && Array.isArray(s.items)) : [],
    info: { ...base.info, ...(isObj(raw.info) ? raw.info : {}) },
    grid: { ...base.grid, ...(isObj(raw.grid) ? raw.grid : {}) },
    snap: { ...base.snap, ...(isObj(raw.snap) ? raw.snap : {}) },
    backgroundOrigin: isVec(raw.backgroundOrigin) ? (raw.backgroundOrigin as SiteData['backgroundOrigin']) : base.backgroundOrigin,
    north: isNum(raw.north) ? raw.north : 0,
  };
  return { data, dropped };
}

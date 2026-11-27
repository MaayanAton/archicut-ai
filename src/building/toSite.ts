// A controlled, one-way copy of a building into a site-planning project: the outside outline of its lowest level
// becomes one "מבנה" element (a simple mass with a flat roof) at the height of its walls. The two projects stay
// independent: later changes to the building are not carried over, and pitched roofs, openings and interiors are not
// part of the copy.

import { type Vec2, v2 } from '../geometry/vec';
import type { SiteData } from '../site/types';
import { makeElement } from '../site/library';
import type { BuildingData } from './types';
import { buildModel, sortedLevels, wallHeight } from './model';

export interface Footprint { pts: Vec2[]; height: number; wall: number }

/** Outside outlines of the lowest level (gross area) and the height from its floor to the highest wall top. */
export function buildingFootprints(d: BuildingData): Footprint[] {
  const m = buildModel(d, 'proposed');
  const levels = sortedLevels(d);
  const base = levels.find((l) => l.elevation >= -1 && m.levels.find((x) => x.level.id === l.id)?.gross.length) ?? levels.find((l) => m.levels.find((x) => x.level.id === l.id)?.gross.length);
  if (!base) return [];
  const lm = m.levels.find((x) => x.level.id === base.id)!;
  let top = base.elevation;
  for (const l of levels) for (const w of d.walls.filter((x) => x.levelId === l.id && x.phase !== 'demolish')) top = Math.max(top, l.elevation + wallHeight(w, l));
  const ext = d.walls.filter((w) => w.levelId === base.id && w.kind === 'exterior' && w.phase !== 'demolish');
  const wall = ext.length ? Math.max(...ext.map((w) => w.thickness)) : 250;
  return lm.gross.filter((g) => g.length >= 3).map((pts) => ({ pts, height: Math.round(top - base.elevation), wall }));
}

/** Adds the footprints to a site project, centred on its lot when it has one. */
export function copyBuildingToSite(site: SiteData, d: BuildingData, name: string, newId: () => string): { data: SiteData; count: number; moved: boolean } {
  const fps = buildingFootprints(d);
  if (!fps.length) return { data: site, count: 0, moved: false };
  const all = fps.flatMap((f) => f.pts);
  const bx = (Math.min(...all.map((p) => p.x)) + Math.max(...all.map((p) => p.x))) / 2, by = (Math.min(...all.map((p) => p.y)) + Math.max(...all.map((p) => p.y))) / 2;
  const lot = site.elements.find((e) => e.kind === 'lot' && e.geom.type === 'area');
  let off = v2(0, 0);
  if (lot && lot.geom.type === 'area') {
    const lp = lot.geom.pts;
    off = v2(Math.round((Math.min(...lp.map((p) => p.x)) + Math.max(...lp.map((p) => p.x))) / 2 - bx), Math.round((Math.min(...lp.map((p) => p.y)) + Math.max(...lp.map((p) => p.y))) / 2 - by));
  }
  const els = fps.map((f, i) => makeElement('building', { type: 'area', pts: f.pts.map((p) => v2(p.x + off.x, p.y + off.y)), curved: false }, newId(), {
    name: fps.length > 1 ? `${name} (${i + 1})` : name,
    params: { h: f.height, wall: f.wall, roof: 300 },
  }));
  return { data: { ...site, elements: [...site.elements, ...els] }, count: els.length, moved: !!lot };
}

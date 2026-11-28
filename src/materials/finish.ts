// Finishes: a material from the catalogue plus the user's settings (colour, size, layout, joints, rotation...).
// Shared by walls, floors, ceilings, furniture and outdoor surfaces.

import { mat, PLANK_LAYOUTS, TILE_LAYOUTS, type Layout, type MatDef } from './catalog';
import type { TexSpec } from './texture';

/** The shape of a finish (building Finish and FloorFinish both fit it). */
export interface FinishLike {
  material: string;
  color: string;
  v?: 4;
  color2?: string;
  tw?: number;
  th?: number;
  tileW?: number;
  tileH?: number;
  angle?: number;
  layout?: Layout;
  grout?: string;
  groutW?: number;
  rough?: number;
  metal?: number;
  opacity?: number;
  img?: string;
}

/** A finish edited in 4.0 (its texture is drawn). Finishes from 3.0 keep their 3.0 look until edited. */
export const isRich = (f: FinishLike | undefined | null): boolean => !!f && f.v === 4;

export interface Resolved {
  def: MatDef;
  spec: TexSpec;
  rough: number;
  metal: number;
  opacity: number;
  angle: number;
  img?: string;
  /** Draws a texture (false for plain paint, glass). */
  textured: boolean;
}

export function resolveFinish(f: FinishLike): Resolved {
  const def = mat(f.material);
  const tw = f.tw ?? f.tileW ?? def.w, th = f.th ?? f.tileH ?? def.h;
  const layout = f.layout ?? def.layout ?? (def.pattern === 'plank' ? 'straight' : 'grid');
  const spec: TexSpec = {
    pattern: def.pattern,
    color: f.color || def.color,
    color2: f.color2 ?? def.color2,
    grout: f.grout ?? def.grout ?? '#9a958c',
    groutW: f.groutW ?? def.groutW ?? 0,
    layout,
    tw: tw > 0 ? tw : 600,
    th: th > 0 ? th : 600,
  };
  return {
    def, spec,
    rough: f.rough ?? def.rough,
    metal: f.metal ?? def.metal,
    opacity: f.opacity ?? def.opacity,
    angle: f.angle ?? 0,
    img: f.img,
    textured: !!f.img || (def.pattern !== 'plain' && def.pattern !== 'glass'),
  };
}

/** A new 4.0 finish of a catalogue material with its default settings (optionally another colour). */
export function richFinish(materialId: string, color?: string): { material: string; color: string; v: 4; color2: string; tw: number; th: number; angle: number; layout?: Layout; grout?: string; groutW?: number } {
  const d = mat(materialId);
  return { material: d.id, color: color ?? d.color, v: 4, color2: d.color2, tw: d.w, th: d.h, angle: 0, ...(d.layout ? { layout: d.layout } : {}), ...(d.grout ? { grout: d.grout } : {}), ...(d.groutW !== undefined ? { groutW: d.groutW } : {}) };
}

/** Layouts that make sense for a material. */
export const layoutsFor = (d: MatDef): Layout[] => (d.pattern === 'plank' ? PLANK_LAYOUTS : d.pattern === 'tile' || d.pattern === 'stone' || d.pattern === 'brick' ? TILE_LAYOUTS : []);

/** Gloss names used in the interface. */
export const GLOSS: { v: number; label: string }[] = [
  { v: 0.9, label: 'מט' },
  { v: 0.55, label: 'משי' },
  { v: 0.2, label: 'מבריק' },
];

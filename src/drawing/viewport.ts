// Mapping between world millimetres (y up) and SVG user units (y down).

import type { Vec2 } from '../geometry/vec';

export interface Box { minX: number; minY: number; maxX: number; maxY: number }

export const emptyBox = (): Box => ({ minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
export function addPt(b: Box, p: Vec2, pad = 0): Box {
  return { minX: Math.min(b.minX, p.x - pad), minY: Math.min(b.minY, p.y - pad), maxX: Math.max(b.maxX, p.x + pad), maxY: Math.max(b.maxY, p.y + pad) };
}
export const boxValid = (b: Box) => Number.isFinite(b.minX) && b.maxX >= b.minX && b.maxY >= b.minY;
export const boxW = (b: Box) => b.maxX - b.minX;
export const boxH = (b: Box) => b.maxY - b.minY;
export function padBox(b: Box, pad: number): Box {
  return { minX: b.minX - pad, minY: b.minY - pad, maxX: b.maxX + pad, maxY: b.maxY + pad };
}

export interface ViewCtx {
  /** world mm -> SVG units */
  T: (p: Vec2) => Vec2;
  /** SVG units per world mm */
  k: number;
  /** SVG units per paper/screen millimetre: used for line widths, text size, markers */
  pu: number;
  /** black-and-white output */
  bw: boolean;
  /** true when drawing for the screen (handles, highlights); false for print */
  screen: boolean;
}

/** Linear view: SVG = (world - origin) * k, with y flipped. */
export function makeView(originX: number, originY: number, k: number, offX: number, offY: number) {
  return {
    T: (p: Vec2) => ({ x: offX + (p.x - originX) * k, y: offY - (p.y - originY) * k }),
    inv: (q: Vec2) => ({ x: originX + (q.x - offX) / k, y: originY - (q.y - offY) / k }),
  };
}

export const DASH: Record<string, number[] | null> = {
  solid: null,
  dashed: [3, 1.5],
  dashdot: [6, 1.5, 0.8, 1.5],
  hidden: [1.5, 1],
};

export function dashArray(style: string, pu: number, width = 0.35): string | undefined {
  const d = DASH[style];
  if (!d) return undefined;
  // Scale dashes slightly with line weight so thick dashed lines stay readable.
  const f = pu * Math.max(1, width / 0.35);
  return d.map((v) => +(v * f).toFixed(3)).join(' ');
}

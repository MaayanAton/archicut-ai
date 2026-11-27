// Doors and windows: kinds, default sizes and the checks that keep an opening inside its wall.

import type { Opening, OpeningKind, Wall } from './types';

export interface OpeningDef {
  kind: OpeningKind;
  label: string;
  door: boolean;
  /** How the plan and the 3D model draw it. */
  style: 'swing' | 'swing2' | 'sliding' | 'window' | 'window-sliding' | 'fixed';
  glass: boolean;
  w: number;
  h: number;
  sill: number;
  color: string;
  material: string;
}

export const OPENINGS: OpeningDef[] = [
  { kind: 'door', label: 'דלת רגילה', door: true, style: 'swing', glass: false, w: 900, h: 2100, sill: 0, color: '#f5f5f2', material: 'wood' },
  { kind: 'door-double', label: 'דלת כפולה', door: true, style: 'swing2', glass: false, w: 1400, h: 2100, sill: 0, color: '#f5f5f2', material: 'wood' },
  { kind: 'door-sliding', label: 'דלת הזזה', door: true, style: 'sliding', glass: false, w: 1600, h: 2100, sill: 0, color: '#e8e2d6', material: 'wood' },
  { kind: 'door-entry', label: 'דלת כניסה', door: true, style: 'swing', glass: false, w: 1000, h: 2150, sill: 0, color: '#5f4632', material: 'wood' },
  { kind: 'door-glass', label: 'דלת זכוכית', door: true, style: 'swing', glass: true, w: 900, h: 2100, sill: 0, color: '#c4c8cc', material: 'aluminium' },
  { kind: 'window', label: 'חלון רגיל', door: false, style: 'window', glass: true, w: 1200, h: 1200, sill: 900, color: '#f5f5f2', material: 'aluminium' },
  { kind: 'window-sliding', label: 'חלון הזזה', door: false, style: 'window-sliding', glass: true, w: 1600, h: 1300, sill: 900, color: '#f5f5f2', material: 'aluminium' },
  { kind: 'window-fixed', label: 'חלון קבוע', door: false, style: 'fixed', glass: true, w: 800, h: 1200, sill: 900, color: '#f5f5f2', material: 'aluminium' },
  { kind: 'window-large', label: 'חלון גדול', door: false, style: 'window-sliding', glass: true, w: 2400, h: 1600, sill: 600, color: '#f5f5f2', material: 'aluminium' },
  { kind: 'vitrine', label: 'ויטרינה', door: false, style: 'window-sliding', glass: true, w: 3000, h: 2300, sill: 0, color: '#3a3f45', material: 'aluminium' },
];

const BY_KIND = new Map(OPENINGS.map((o) => [o.kind, o]));
export const openingDef = (k: OpeningKind | string): OpeningDef => BY_KIND.get(k as OpeningKind) ?? OPENINGS[0];
export const isOpeningKind = (k: unknown): k is OpeningKind => typeof k === 'string' && BY_KIND.has(k as OpeningKind);

export const wallLength = (w: Wall) => Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);

export interface OpeningProblem { id: string; msg: string; severe: boolean }

/** Checks one wall's openings: inside the wall's length and height, no overlaps. Severe problems block a change. */
export function checkWallOpenings(wall: Wall, openings: Opening[], wallHeight: number): OpeningProblem[] {
  const L = wallLength(wall);
  const out: OpeningProblem[] = [];
  const list = openings.filter((o) => o.wallId === wall.id).sort((a, b) => a.pos - b.pos);
  for (const o of list) {
    if (!(o.width > 0) || !(o.height > 0)) out.push({ id: o.id, msg: 'רוחב וגובה הפתח חייבים להיות גדולים מאפס.', severe: true });
    if (o.sill < 0) out.push({ id: o.id, msg: 'גובה סף שלילי אינו אפשרי.', severe: true });
    if (o.pos - o.width / 2 < -0.5 || o.pos + o.width / 2 > L + 0.5) out.push({ id: o.id, msg: `הפתח חורג מאורך הקיר (${(L / 1000).toFixed(2)} מ׳).`, severe: true });
    if (o.sill + o.height > wallHeight + 0.5) out.push({ id: o.id, msg: `הפתח גבוה מהקיר (גובה הקיר ${(wallHeight / 1000).toFixed(2)} מ׳).`, severe: true });
  }
  for (let i = 0; i + 1 < list.length; i++) {
    const a = list[i], b = list[i + 1];
    if (a.pos + a.width / 2 > b.pos - b.width / 2 + 0.5) out.push({ id: b.id, msg: 'הפתח חופף לפתח אחר באותו קיר.', severe: true });
  }
  return out;
}

/** Nearest valid centre for a new opening of width w near pos, or null if the wall has no room for it. */
export function fitOpening(wall: Wall, openings: Opening[], w: number, pos: number, ignoreId?: string): number | null {
  const L = wallLength(wall);
  if (w > L) return null;
  const others = openings.filter((o) => o.wallId === wall.id && o.id !== ignoreId).map((o) => [o.pos - o.width / 2, o.pos + o.width / 2] as const).sort((a, b) => a[0] - b[0]);
  // Free intervals for the centre.
  const free: [number, number][] = [];
  let start = 0;
  for (const [s, e] of others) { if (s - start >= w) free.push([start + w / 2, s - w / 2]); start = Math.max(start, e); }
  if (L - start >= w) free.push([start + w / 2, L - w / 2]);
  let best: number | null = null;
  for (const [a, b] of free) {
    const c = Math.min(Math.max(pos, a), b);
    if (best === null || Math.abs(c - pos) < Math.abs(best - pos)) best = c;
  }
  return best;
}

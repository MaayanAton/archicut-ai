// Doors and windows: kinds, default sizes and the checks that keep an opening inside its wall.

import type { Opening, OpeningKind, OpeningShape, OpeningVariant, Phase, Wall } from './types';

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

/**
 * 4.0: designed doors and windows. Each is stored as a 3.0 kind plus a shape and a variant, so a project saved in 4.0
 * still opens in 3.0 (with a rectangular opening of the same size). Curved shapes cut a real curved hole in the wall.
 */
export interface OpeningPreset {
  id: string; label: string; group: 'דלתות' | 'חלונות' | 'מעברים ונישות';
  kind: OpeningKind; shape?: OpeningShape; variant?: OpeningVariant; rise?: number; depth?: number;
  w: number; h: number; sill: number; color?: string; leaf?: string; glass?: string; note?: string;
}

export const OPENING_PRESETS: OpeningPreset[] = [
  // Doors
  { id: 'door-wood', label: 'דלת עץ', group: 'דלתות', kind: 'door', w: 900, h: 2100, sill: 0, color: '#8a5a3b', leaf: '#9b6a45' },
  { id: 'door-white', label: 'דלת פנים לבנה', group: 'דלתות', kind: 'door', w: 800, h: 2100, sill: 0, color: '#f5f5f2' },
  { id: 'door-metal', label: 'דלת מתכת', group: 'דלתות', kind: 'door', variant: 'metal', w: 900, h: 2100, sill: 0, color: '#4a4f55', leaf: '#5d6268' },
  { id: 'door-glass-alu', label: 'דלת זכוכית במסגרת אלומיניום', group: 'דלתות', kind: 'door-glass', w: 1000, h: 2200, sill: 0, color: '#3a3f45' },
  { id: 'door-entry-wood', label: 'דלת כניסה מעץ', group: 'דלתות', kind: 'door-entry', w: 1000, h: 2200, sill: 0, color: '#5f4632', leaf: '#6b4a33' },
  { id: 'door-entry-deco', label: 'דלת כניסה עם מסגרת דקורטיבית', group: 'דלתות', kind: 'door-entry', variant: 'deco', w: 1100, h: 2300, sill: 0, color: '#e9e4da', leaf: '#4e3424' },
  { id: 'door-double-glass', label: 'דלת כפולה מזכוכית', group: 'דלתות', kind: 'door-double', w: 1600, h: 2200, sill: 0, color: '#2f3134', leaf: '#a9cde0' },
  { id: 'door-double-wood', label: 'דלת כפולה מעץ', group: 'דלתות', kind: 'door-double', w: 1500, h: 2200, sill: 0, color: '#6b4a33', leaf: '#7a5238' },
  { id: 'door-sliding-glass', label: 'דלת הזזה מזכוכית', group: 'דלתות', kind: 'vitrine', w: 2400, h: 2200, sill: 0, color: '#3a3f45' },
  { id: 'door-barn', label: 'דלת אסם (הזזה על מסילה)', group: 'דלתות', kind: 'door', variant: 'barn', w: 1000, h: 2200, sill: 0, color: '#3a3f45', leaf: '#8a6a4a' },
  { id: 'door-pivot', label: 'דלת ציר מרכזי (פיבוט)', group: 'דלתות', kind: 'door-entry', variant: 'pivot', w: 1200, h: 2400, sill: 0, color: '#2f3134', leaf: '#5a4030' },
  { id: 'door-arched', label: 'דלת עם קשת עליונה', group: 'דלתות', kind: 'door', shape: 'arch', w: 1000, h: 2500, sill: 0, color: '#6b4a33', leaf: '#7a5238' },
  { id: 'door-arched-double', label: 'דלת כפולה מקושתת', group: 'דלתות', kind: 'door-double', shape: 'arch', w: 1600, h: 2800, sill: 0, color: '#4e3424', leaf: '#6b4a33' },
  { id: 'door-arched-glass', label: 'דלת זכוכית מקושתת', group: 'דלתות', kind: 'door-glass', shape: 'segment', w: 1100, h: 2400, sill: 0, color: '#2f3134' },
  { id: 'door-protected', label: 'דלת מוגנת (להמחשה בלבד)', group: 'דלתות', kind: 'door', variant: 'protected', w: 800, h: 2000, sill: 0, color: '#5d6166', leaf: '#6c7075', note: 'סמל להמחשה בלבד. אינו מייצג מוצר מאושר או דרישה של גורם מוסמך.' },
  // Windows
  { id: 'win-rect', label: 'חלון מלבני', group: 'חלונות', kind: 'window', w: 1200, h: 1200, sill: 900 },
  { id: 'win-sliding', label: 'חלון הזזה', group: 'חלונות', kind: 'window-sliding', w: 1600, h: 1300, sill: 900 },
  { id: 'win-tall', label: 'חלון גבוה וצר', group: 'חלונות', kind: 'window-fixed', w: 600, h: 2000, sill: 400 },
  { id: 'win-panoramic', label: 'חלון פנורמי', group: 'חלונות', kind: 'window-large', w: 3600, h: 1800, sill: 500, color: '#3a3f45' },
  { id: 'win-vitrine', label: 'ויטרינה מהרצפה', group: 'חלונות', kind: 'vitrine', w: 3000, h: 2400, sill: 0, color: '#3a3f45' },
  { id: 'win-grid', label: 'חלון עם חלוקה דקורטיבית', group: 'חלונות', kind: 'window-fixed', variant: 'grid', w: 1200, h: 1500, sill: 800, color: '#2f3134' },
  { id: 'win-round', label: 'חלון עגול', group: 'חלונות', kind: 'window-fixed', shape: 'round', w: 800, h: 800, sill: 1300 },
  { id: 'win-oval', label: 'חלון אליפטי', group: 'חלונות', kind: 'window-fixed', shape: 'oval', w: 1200, h: 800, sill: 1200 },
  { id: 'win-arched', label: 'חלון מקושת', group: 'חלונות', kind: 'window-fixed', shape: 'arch', w: 1000, h: 1700, sill: 800 },
  { id: 'win-arched-grid', label: 'חלון מקושת עם חלוקה', group: 'חלונות', kind: 'window-fixed', shape: 'arch', variant: 'grid', w: 1200, h: 1900, sill: 700, color: '#2f3134' },
  { id: 'win-pointed', label: 'חלון קשת מחודדת', group: 'חלונות', kind: 'window-fixed', shape: 'pointed', w: 900, h: 1800, sill: 800 },
  { id: 'win-segment', label: 'חלון קשת שטוחה', group: 'חלונות', kind: 'window', shape: 'segment', w: 1400, h: 1400, sill: 900 },
  // Passages and niches
  { id: 'pass-arch', label: 'מעבר מקושת (פתח בלי דלת)', group: 'מעברים ונישות', kind: 'door', shape: 'arch', variant: 'passage', w: 1200, h: 2500, sill: 0 },
  { id: 'pass-ellipse', label: 'מעבר בקשת אליפטית', group: 'מעברים ונישות', kind: 'door', shape: 'ellipse', variant: 'passage', w: 1800, h: 2400, sill: 0 },
  { id: 'pass-pointed', label: 'מעבר בקשת מחודדת', group: 'מעברים ונישות', kind: 'door', shape: 'pointed', variant: 'passage', w: 1200, h: 2600, sill: 0 },
  { id: 'pass-rect', label: 'מעבר פתוח מלבני', group: 'מעברים ונישות', kind: 'door', variant: 'passage', w: 1200, h: 2200, sill: 0 },
  { id: 'pass-deco', label: 'מעבר מקושת עם מסגרת דקורטיבית', group: 'מעברים ונישות', kind: 'door', shape: 'arch', variant: 'deco', w: 1400, h: 2600, sill: 0, color: '#e9e4da' },
  { id: 'niche-arch', label: 'נישה מקושתת בקיר', group: 'מעברים ונישות', kind: 'window-fixed', shape: 'arch', variant: 'niche', depth: 120, w: 700, h: 1200, sill: 900 },
  { id: 'niche-rect', label: 'נישה מלבנית בקיר', group: 'מעברים ונישות', kind: 'window-fixed', variant: 'niche', depth: 120, w: 900, h: 500, sill: 1100 },
];

export const openingPreset = (id: string | undefined) => OPENING_PRESETS.find((p) => p.id === id);

/** Label of an opening for lists: its preset, else its 3.0 kind. */
export const openingLabel = (o: Pick<Opening, 'kind' | 'preset'>) => openingPreset(o.preset)?.label ?? openingDef(o.kind).label;

const BY_KIND = new Map(OPENINGS.map((o) => [o.kind, o]));
export const openingDef = (k: OpeningKind | string): OpeningDef => BY_KIND.get(k as OpeningKind) ?? OPENINGS[0];
export const isOpeningKind = (k: unknown): k is OpeningKind => typeof k === 'string' && BY_KIND.has(k as OpeningKind);

export const wallLength = (w: Wall) => Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);

export interface OpeningProblem { id: string; msg: string; severe: boolean }

const OVERLAP = 'הפתח חופף לפתח אחר באותו קיר.';

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
    if (o.variant === 'niche' && (o.depth ?? 0) >= wall.thickness - 19) out.push({ id: o.id, msg: 'עומק הנישה גדול מעובי הקיר. הנישה תישאר עם גב של 2 ס״מ לפחות.', severe: false });
  }
  // Overlaps, pair by pair. An opening that is demolished and a new one in its place never exist together, so that
  // pair is not an overlap (a renovation often replaces a window with a wider one).
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      if (b.pos - b.width / 2 >= a.pos + a.width / 2 - 0.5 || a.pos - a.width / 2 >= b.pos + b.width / 2 - 0.5) continue;
      if (!coexist(a.phase, b.phase)) continue;
      for (const x of [a, b]) if (!out.some((p) => p.id === x.id && p.msg === OVERLAP)) out.push({ id: x.id, msg: OVERLAP, severe: true });
    }
  }
  return out;
}

/** Whether two elements of these phases exist at the same time (in the existing building or in the proposal). */
export const coexist = (a: Phase | undefined, b: Phase | undefined) => !((a === 'demolish' && b === 'new') || (a === 'new' && b === 'demolish'));

/** Nearest valid centre for a new opening of width w near pos, or null if the wall has no room for it. Openings of a
 *  phase that never exists together with `phase` (demolished vs new) do not take up room. */
export function fitOpening(wall: Wall, openings: Opening[], w: number, pos: number, ignoreId?: string, phase?: Phase): number | null {
  const L = wallLength(wall);
  if (w > L) return null;
  const others = openings.filter((o) => o.wallId === wall.id && o.id !== ignoreId && coexist(o.phase, phase)).map((o) => [o.pos - o.width / 2, o.pos + o.width / 2] as const).sort((a, b) => a[0] - b[0]);
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

// Stairs: treads and landings computed from width, total rise, number of risers and tread depth.
// The numbers are checked for consistency and compared with common rules of thumb. The app never approves
// stairs against building codes or safety rules; that needs a qualified professional.

import { type Vec2, v2 } from '../geometry/vec';
import { rotatePt } from '../site/poly';
import type { Stair } from './types';

export interface Tread { poly: Vec2[]; top: number; landing: boolean }

export interface StairGeom {
  treads: Tread[];
  /** Outline of the whole stair in plan (world). */
  outline: Vec2[];
  riser: number;
  run: number;
  /** Walking line through the middle of the treads, for the arrow in the plan. */
  path: Vec2[];
  notes: string[];
  errors: string[];
}

const rect = (x0: number, y0: number, x1: number, y1: number): Vec2[] => [v2(x0, y0), v2(x1, y0), v2(x1, y1), v2(x0, y1)];

/** Numbers of a stair: riser height and the comfort rule 2R + G, with plain warnings. */
export function stairCheck(s: Stair): { riser: number; blondel: number; notes: string[]; errors: string[] } {
  const errors: string[] = [], notes: string[] = [];
  if (!(s.width > 0)) errors.push('רוחב המדרגות חייב להיות גדול מאפס.');
  if (!(s.rise > 0)) errors.push('הפרש הגובה חייב להיות גדול מאפס.');
  if (!Number.isInteger(s.risers) || s.risers < 2) errors.push('מספר הרומים חייב להיות מספר שלם, 2 לפחות.');
  if (!(s.going > 0)) errors.push('עומק השלח חייב להיות גדול מאפס.');
  const riser = s.risers > 0 ? s.rise / s.risers : 0;
  const blondel = 2 * riser + s.going;
  if (!errors.length) {
    if (riser > 190) notes.push(`גובה רום ${riser.toFixed(1)} מ״מ – גבוה מהמקובל בבתי מגורים (בדרך כלל עד כ-175–190 מ״מ).`);
    if (riser < 120) notes.push(`גובה רום ${riser.toFixed(1)} מ״מ – נמוך מהמקובל.`);
    if (s.going < 250) notes.push(`עומק שלח ${s.going} מ״מ – קטן מהמקובל (בדרך כלל 260 מ״מ ומעלה).`);
    if (blondel < 600 || blondel > 650) notes.push(`2×רום + שלח = ${blondel.toFixed(0)} מ״מ, מחוץ לטווח הנוחות המקובל 600–650 מ״מ.`);
    if (s.width < 800) notes.push(`רוחב ${s.width} מ״מ – צר מהמקובל.`);
    if (s.shape === 'L' && s.risers < 4) errors.push('מדרגות L צריכות 4 רומים לפחות.');
    if (s.shape === 'U' && s.risers < 4) errors.push('מדרגות U צריכות 4 רומים לפחות.');
    if (s.shape === 'U' && s.landing < s.width) notes.push('עומק משטח הביניים קטן מרוחב המדרגות.');
  }
  return { riser, blondel, notes, errors };
}

export function stairGeom(s: Stair): StairGeom {
  const chk = stairCheck(s);
  const out: StairGeom = { treads: [], outline: [], riser: chk.riser, run: 0, path: [], notes: chk.notes, errors: chk.errors };
  if (chk.errors.length) return out;
  const n = s.risers, r = chk.riser, g = s.going, w = s.width;
  const local: Tread[] = [];
  let outline: Vec2[] = [];
  const path: Vec2[] = [];
  const sgn = s.turn === 'left' ? 1 : -1;
  const flip = (p: Vec2[]) => p.map((q) => v2(q.x, q.y * sgn));
  if (s.shape === 'straight') {
    for (let i = 0; i < n - 1; i++) local.push({ poly: rect(i * g, -w / 2, (i + 1) * g, w / 2), top: (i + 1) * r, landing: false });
    outline = rect(0, -w / 2, (n - 1) * g, w / 2);
    path.push(v2(0, 0), v2((n - 1) * g, 0));
    out.run = (n - 1) * g;
  } else if (s.shape === 'L') {
    const k1 = Math.floor((n - 2) / 2), k2 = n - 2 - k1;
    for (let i = 0; i < k1; i++) local.push({ poly: rect(i * g, -w / 2, (i + 1) * g, w / 2), top: (i + 1) * r, landing: false });
    local.push({ poly: flip(rect(k1 * g, -w / 2, k1 * g + w, w / 2)), top: (k1 + 1) * r, landing: true });
    for (let j = 0; j < k2; j++) local.push({ poly: flip(rect(k1 * g, w / 2 + j * g, k1 * g + w, w / 2 + (j + 1) * g)), top: (k1 + 2 + j) * r, landing: false });
    outline = flip([v2(0, -w / 2), v2(k1 * g + w, -w / 2), v2(k1 * g + w, w / 2 + k2 * g), v2(k1 * g, w / 2 + k2 * g), v2(k1 * g, w / 2), v2(0, w / 2)]);
    if (sgn < 0) outline.reverse();
    path.push(v2(0, 0), v2(k1 * g + w / 2, 0), v2(k1 * g + w / 2, sgn * (w / 2 + k2 * g)));
    out.run = k1 * g + w + k2 * g;
  } else {
    const k1 = Math.floor((n - 2) / 2), k2 = n - 2 - k1, gap = Math.max(0, s.gap), L = Math.max(s.landing, 1);
    const y2 = w / 2 + gap; // inner edge of the second flight
    for (let i = 0; i < k1; i++) local.push({ poly: rect(i * g, -w / 2, (i + 1) * g, w / 2), top: (i + 1) * r, landing: false });
    local.push({ poly: flip(rect(k1 * g, -w / 2, k1 * g + L, y2 + w)), top: (k1 + 1) * r, landing: true });
    for (let j = 0; j < k2; j++) local.push({ poly: flip(rect(k1 * g - (j + 1) * g, y2, k1 * g - j * g, y2 + w)), top: (k1 + 2 + j) * r, landing: false });
    const xMin = Math.min(0, k1 * g - k2 * g);
    outline = flip(rect(xMin, -w / 2, k1 * g + L, y2 + w));
    if (sgn < 0) outline.reverse();
    path.push(v2(0, 0), v2(k1 * g + L / 2, 0), v2(k1 * g + L / 2, sgn * (y2 + w / 2)), v2(k1 * g - k2 * g, sgn * (y2 + w / 2)));
    out.run = k1 * g + L;
  }
  const T = (q: Vec2) => rotatePt(v2(s.p.x + q.x, s.p.y + q.y), s.rot, s.p);
  out.treads = local.map((t) => ({ ...t, poly: t.poly.map(T) }));
  out.outline = outline.map(T);
  out.path = path.map(T);
  return out;
}

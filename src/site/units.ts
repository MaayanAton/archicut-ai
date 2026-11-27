// Metres in the interface, millimetres in the engine. Conversions never round the stored value.

import { fmt } from '../geometry/vec';

/**
 * Parses a length typed in metres and returns millimetres, exactly as typed:
 * "12.345" -> 12345 (no 12344.999… from floating point). Accepts a comma as decimal separator.
 * Empty -> null. Anything else -> 'invalid'.
 */
export function parseMetersToMm(s: string): number | null | 'invalid' {
  const t = s.trim().replace(',', '.').replace(/^\+/, '');
  if (t === '') return null;
  const m = t.match(/^(-?)(\d*)(?:\.(\d*))?$/);
  if (!m || (m[2] === '' && (m[3] ?? '') === '')) return 'invalid';
  const sign = m[1] ? -1 : 1;
  const int = m[2] || '0';
  const frac = (m[3] ?? '').padEnd(3, '0');
  // Shift the decimal point three places in the string, then parse once.
  const mmStr = `${int}${frac.slice(0, 3)}${frac.length > 3 ? '.' + frac.slice(3) : ''}`;
  const v = Number(mmStr);
  return Number.isFinite(v) ? sign * v : 'invalid';
}

/** Millimetres shown as metres for display only, e.g. 12345 -> "12.35". */
export const mToStr = (mm: number, digits = 2) => fmt(mm / 1000, digits);

/** Length label: "12.35 מ׳". */
export const fmtM = (mm: number, digits = 2) => `${mToStr(mm, digits)} מ׳`;

/** Area label from mm²: "123.45 מ״ר". */
export const fmtArea = (mm2: number, digits = 2) => `${fmt(mm2 / 1e6, digits)} מ״ר`;

/** Level label in the usual architectural form: +1.20, ±0.00, -0.45 (metres). */
export function fmtLevel(mm: number) {
  const v = Number((mm / 1000).toFixed(2));
  if (v === 0) return '±0.00';
  return `${v > 0 ? '+' : '-'}${Math.abs(v).toFixed(2)}`;
}

/** Editable text of a millimetre value in metres, up to 4 decimals (0.1 mm), without trailing zeros. */
export function mmToMetersText(mm: number | null) {
  if (mm === null || !Number.isFinite(mm)) return '';
  return String(Number((mm / 1000).toFixed(4)));
}

export const fmtSlope = (ratio: number) => {
  if (!Number.isFinite(ratio)) return '—';
  const pct = ratio * 100;
  const oneIn = Math.abs(ratio) > 1e-9 ? ` (1:${fmt(1 / Math.abs(ratio), 1)})` : '';
  return `${fmt(pct, 2)}%${oneIn}`;
};

import type { SectionData } from '../document/types';
import { conicReport, describeCurve, type ConicReport } from '../geometry/conics';
import { planeFromControls, sectionPolyhedron, type Plane, type SectionOutcome, type SectionResult } from '../geometry/section';
import { dist2 } from '../geometry/vec';
import { boundingRadius, buildSolid, isCurved, validateSolid, type Polyhedron } from '../geometry/solids';

export interface SectionComputation {
  errors: string[];
  poly: Polyhedron | null;
  plane: Plane;
  outcome: SectionOutcome | null;
  conic: ConicReport | null;
  radius: number;
  curved: boolean;
  /** Plain-language summary of the result. */
  summary: string;
  warnings: string[];
  /** Area and perimeter of the section. exact=false means they come from the 720-point outline (relative error about 1e-5). */
  measures: { area: number; perimeter: number; exact: boolean } | null;
}

/** Ellipse perimeter by the trapezoidal rule on the periodic integrand (converges to machine precision). */
export function ellipsePerimeter(a: number, b: number) {
  const N = 8192;
  let s = 0;
  for (let i = 0; i < N; i++) {
    const t = (2 * Math.PI * i) / N;
    s += Math.hypot(a * Math.sin(t), b * Math.cos(t));
  }
  return (s * 2 * Math.PI) / N;
}

export function computeSection(d: SectionData): SectionComputation {
  const plane = planeFromControls(d.plane);
  const errors = validateSolid(d.solid);
  const curved = isCurved(d.solid.kind);
  if (errors.length) return { errors, poly: null, plane, outcome: null, conic: null, radius: 50, curved, summary: '', warnings: [], measures: null };
  const poly = buildSolid(d.solid);
  const raw = sectionPolyhedron(poly, plane);
  const conic = conicReport(d.solid, plane);
  const { result: r, near } = collapseTiny(raw.result);
  const outcome = { ...raw, result: r };
  const warnings: string[] = [];
  let summary = '';
  if (near === 'point') { summary = `המישור כמעט נוגע בקודקוד: צורת החתך קטנה מ-${NEAR_MM} מ״מ, ולכן אין שטח חתך ממשי. כדי לקבל חתך, הזיזי את המישור.`; warnings.push('כמעט מגע בקודקוד'); }
  else if (near === 'segment') { summary = `המישור כמעט נוגע במקצוע: רוחב החתך קטן מ-${NEAR_MM} מ״מ, ולכן אין שטח חתך ממשי.`; warnings.push('כמעט מגע במקצוע'); }
  else if (r.kind === 'none') summary = 'המישור לא חותך את הגוף. אפשר לשנות את מיקום החיתוך.';
  else if (r.kind === 'point') { summary = 'המישור נוגע בגוף בנקודה אחת בלבד (בקודקוד). אין שטח חתך.'; warnings.push('מגע בקודקוד'); }
  else if (r.kind === 'segment') { summary = 'המישור נוגע בגוף לאורך קו בלבד (במקצוע או בקו על המעטפת). אין שטח חתך.'; warnings.push('מגע במקצוע'); }
  else {
    if (r.faceContact) { summary = 'המישור מתלכד עם פאה של הגוף: זהו מגע בפאה ולא חתך דרך הגוף.'; warnings.push('מגע בפאה'); }
    else if (curved && conic) summary = `צורת החתך: ${describeCurve(conic)}.`;
    else summary = `צורת החתך: מצולע עם ${r.pts2.length} צלעות.`;
  }
  let measures: SectionComputation['measures'] = null;
  if (r.kind === 'polygon') {
    measures = { area: r.area, perimeter: r.perimeter, exact: !curved };
    const c = conic?.curve;
    if (curved && c?.type === 'circle') measures = { area: Math.PI * c.radius ** 2, perimeter: 2 * Math.PI * c.radius, exact: true };
    if (curved && c?.type === 'ellipse' && c.semiMajor !== null && c.semiMinor !== null && !c.truncated)
      measures = { area: Math.PI * c.semiMajor * c.semiMinor, perimeter: ellipsePerimeter(c.semiMajor, c.semiMinor), exact: true };
  }
  return { errors, poly, plane, outcome, conic, radius: boundingRadius(poly), curved, summary, warnings, measures };
}

/** Below this size (mm) a section is shown as a touch, not as a polygon with zero area. */
export const NEAR_MM = 0.01;

/** A polygon smaller than NEAR_MM is reported as a point; one thinner than NEAR_MM as a segment. */
function collapseTiny(r: SectionResult): { result: SectionResult; near: 'point' | 'segment' | null } {
  if (r.kind !== 'polygon' || r.faceContact) return { result: r, near: null };
  let best = 0, ia = 0, ib = 0;
  for (let i = 0; i < r.pts2.length; i++)
    for (let j = i + 1; j < r.pts2.length; j++) {
      const dd = dist2(r.pts2[i], r.pts2[j]);
      if (dd > best) { best = dd; ia = i; ib = j; }
    }
  if (best < NEAR_MM) {
    const n = r.pts3.length;
    const c3 = r.pts3.reduce((a, p) => ({ x: a.x + p.x / n, y: a.y + p.y / n, z: a.z + p.z / n }), { x: 0, y: 0, z: 0 });
    const c2 = r.pts2.reduce((a, p) => ({ x: a.x + p.x / n, y: a.y + p.y / n }), { x: 0, y: 0 });
    return { result: { kind: 'point', point3: c3, point2: c2 }, near: 'point' };
  }
  if ((2 * r.area) / best < NEAR_MM) {
    return { result: { kind: 'segment', a3: r.pts3[ia], b3: r.pts3[ib], a2: r.pts2[ia], b2: r.pts2[ib], length: best }, near: 'segment' };
  }
  return { result: r, near: null };
}

export const POLY_NAMES: Record<number, string> = { 3: 'משולש', 4: 'מרובע', 5: 'מחומש', 6: 'משושה', 7: 'משובע', 8: 'מתומן' };

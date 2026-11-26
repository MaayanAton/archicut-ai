import type { ReactNode } from 'react';
import type { SectionResult } from '../geometry/section';
import { type Vec2, dist2 } from '../geometry/vec';
import { Dimension, fmtLen } from './dimension';
import { addPt, emptyBox, type Box, type ViewCtx } from './viewport';

/** Hatch lines at 45 degrees clipped to a convex polygon (computed, not an SVG pattern, so PDF export is exact). */
export function hatchLines(pts: Vec2[], spacing: number): [Vec2, Vec2][] {
  if (pts.length < 3 || spacing <= 0) return [];
  // Use coordinates rotated by 45 degrees: lines are u = const.
  const c = Math.SQRT1_2;
  const uOf = (p: Vec2) => c * (p.x - p.y);
  const us = pts.map(uOf);
  const lo = Math.min(...us), hi = Math.max(...us);
  const out: [Vec2, Vec2][] = [];
  const start = Math.ceil(lo / spacing) * spacing;
  for (let u = start; u <= hi; u += spacing) {
    const hits: Vec2[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const ua = uOf(a), ub = uOf(b);
      if ((ua - u) * (ub - u) <= 0 && ua !== ub) {
        const t = (u - ua) / (ub - ua);
        hits.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      }
    }
    if (hits.length >= 2) {
      hits.sort((p, q) => (p.x + p.y) - (q.x + q.y));
      out.push([hits[0], hits[hits.length - 1]]);
    }
    if (out.length > 4000) break;
  }
  return out;
}

export function sectionWorldBox(r: SectionResult | null): Box {
  let b = emptyBox();
  if (!r) return b;
  if (r.kind === 'polygon') r.pts2.forEach((p) => (b = addPt(b, p)));
  if (r.kind === 'segment') { b = addPt(b, r.a2); b = addPt(b, r.b2); }
  if (r.kind === 'point') b = addPt(b, r.point2, 10);
  return b;
}

/** True-shape drawing of the section, in the plane's own axes (mm). */
export function renderSection(r: SectionResult | null, ctx: ViewCtx, opts: { curved: boolean }): ReactNode {
  if (!r || r.kind === 'none') return null;
  const ink = ctx.bw ? '#000' : '#1b2230';
  const fill = ctx.bw ? 'none' : 'rgba(240,138,60,0.18)';
  const hatch = ctx.bw ? '#000' : '#c2570c';
  const T = ctx.T, pu = ctx.pu;
  if (r.kind === 'point') {
    const p = T(r.point2);
    return <circle cx={p.x} cy={p.y} r={1.2 * pu} fill={ink} />;
  }
  if (r.kind === 'segment') {
    const a = T(r.a2), b = T(r.b2);
    return (
      <g>
        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={ink} strokeWidth={0.6 * pu} />
        <Dimension a={r.a2} b={r.b2} offset={8 / (ctx.k / pu)} ctx={ctx} color={ink} />
      </g>
    );
  }
  const pts = r.pts2;
  const scr = pts.map(T);
  const spacing = 2.5 * pu / ctx.k; // 2.5 paper mm between hatch lines
  const lines = hatchLines(pts, spacing);
  const off = 7 * pu / ctx.k; // 7 paper mm offset for dimensions
  const out: ReactNode[] = [
    <polygon key="f" points={scr.map((p) => `${p.x},${p.y}`).join(' ')} fill={fill} stroke="none" />,
    ...lines.map(([a, b], i) => {
      const A = T(a), B = T(b);
      return <line key={`h${i}`} x1={A.x} y1={A.y} x2={B.x} y2={B.y} stroke={hatch} strokeWidth={0.18 * pu} />;
    }),
    <polygon key="o" points={scr.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke={ink} strokeWidth={0.6 * pu} strokeLinejoin="round" />,
  ];
  if (!opts.curved && pts.length <= 12) {
    // Dimension each straight edge (polygon is counter-clockwise, so "right" of each edge is outside).
    pts.forEach((a, i) => {
      const b = pts[(i + 1) % pts.length];
      if (dist2(a, b) * ctx.k < 6 * pu) return;
      out.push(<Dimension key={`d${i}`} a={a} b={b} offset={-off} ctx={ctx} color={ink} />);
    });
    pts.forEach((p, i) => {
      const s = T(p);
      out.push(<circle key={`v${i}`} cx={s.x} cy={s.y} r={0.7 * pu} fill={ink} />);
    });
  } else {
    // Curved outline: overall width and height in the plane's axes.
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    out.push(<Dimension key="dw" a={{ x: x0, y: y0 }} b={{ x: x1, y: y0 }} offset={-off} ctx={ctx} color={ink} text={fmtLen(x1 - x0)} />);
    out.push(<Dimension key="dh" a={{ x: x1, y: y0 }} b={{ x: x1, y: y1 }} offset={-off} ctx={ctx} color={ink} text={fmtLen(y1 - y0)} />);
  }
  return out;
}

import type { ReactNode } from 'react';
import type { Vec2 } from '../geometry/vec';
import type { ViewCtx } from './viewport';

export const fmtLen = (mm: number) => {
  const r = Math.round(mm * 10) / 10;
  return (Object.is(r, -0) ? 0 : r).toString();
};

/**
 * Architectural dimension line between world points a and b, offset (world mm) to the left of a->b.
 * Uses oblique tick marks, the usual convention in architectural drawings.
 */
export function Dimension({ a, b, offset, ctx, color, text, width = 0.18 }: { a: Vec2; b: Vec2; offset: number; ctx: ViewCtx; color: string; text?: string; width?: number }): ReactNode {
  const dx = b.x - a.x, dy = b.y - a.y;
  const L = Math.hypot(dx, dy);
  if (L < 1e-9) return null;
  const nx = -dy / L, ny = dx / L; // left normal (world, y up)
  const A = { x: a.x + nx * offset, y: a.y + ny * offset };
  const B = { x: b.x + nx * offset, y: b.y + ny * offset };
  const T = ctx.T, pu = ctx.pu;
  const sa = T(a), sb = T(b), sA = T(A), sB = T(B);
  const ext = 1.5 * pu; // extension beyond the dimension line, paper mm
  const gap = 1 * pu;
  const ev = { x: sA.x - sa.x, y: sA.y - sa.y };
  const el = Math.hypot(ev.x, ev.y) || 1;
  const eu = { x: ev.x / el, y: ev.y / el };
  const extLine = (p: Vec2, P: Vec2, key: string) => {
    const start = el > gap ? { x: p.x + eu.x * gap, y: p.y + eu.y * gap } : p;
    return <line key={key} x1={start.x} y1={start.y} x2={P.x + eu.x * ext} y2={P.y + eu.y * ext} stroke={color} strokeWidth={width * pu} />;
  };
  const tick = (P: Vec2, key: string) => {
    const ux = (sB.x - sA.x), uy = (sB.y - sA.y);
    const ul = Math.hypot(ux, uy) || 1;
    // 45 degree slash
    const tx = (ux / ul + eu.x) * 1.2 * pu, ty = (uy / ul + eu.y) * 1.2 * pu;
    return <line key={key} x1={P.x - tx} y1={P.y - ty} x2={P.x + tx} y2={P.y + ty} stroke={color} strokeWidth={width * 2.2 * pu} />;
  };
  let ang = (Math.atan2(sB.y - sA.y, sB.x - sA.x) * 180) / Math.PI;
  if (ang > 90) ang -= 180;
  if (ang < -90) ang += 180;
  const mid = { x: (sA.x + sB.x) / 2, y: (sA.y + sB.y) / 2 };
  const fs = 3 * pu;
  // Put the text on the outer side of the dimension line.
  const out = offset >= 0 ? 1 : -1;
  const tpos = { x: mid.x + eu.x * out * 1.2 * pu, y: mid.y + eu.y * out * 1.2 * pu };
  const outward = eu.y * out < 0 || (Math.abs(eu.y) < 1e-6 && eu.x * out > 0);
  return (
    <g>
      {extLine(sa, sA, 'e1')}
      {extLine(sb, sB, 'e2')}
      <line x1={sA.x} y1={sA.y} x2={sB.x} y2={sB.y} stroke={color} strokeWidth={width * pu} />
      {tick(sA, 't1')}
      {tick(sB, 't2')}
      <text x={tpos.x} y={tpos.y} fontSize={fs} fill={color} textAnchor="middle" dominantBaseline={outward ? 'auto' : 'hanging'}
        transform={`rotate(${ang} ${tpos.x} ${tpos.y})`} fontFamily="Rubik, Arial, sans-serif" direction="ltr" style={{ pointerEvents: 'none' }}>
        {text ?? fmtLen(L)}
      </text>
    </g>
  );
}

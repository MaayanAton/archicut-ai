// Drawing of a building section or elevation (SVG), in section coordinates: x = s, y = level (both mm).
// Cut solids are poché (heavy outline, dark fill); solids beyond the plane are thin lines with a light fill, drawn
// far to near so nearer ones hide farther ones. Earth below the ground line is hatched.

import type { ReactNode } from 'react';
import { type Vec2, v2 } from '../../geometry/vec';
import { Dimension } from '../../drawing/dimension';
import type { Box, ViewCtx } from '../../drawing/viewport';
import { fmtLevel, mToStr } from '../../site/units';
import type { BSectionResult, SPt, SShape } from '../section';

const P = (q: SPt): Vec2 => v2(q.s, q.z);

export function bSectionBox(r: BSectionResult): Box {
  const w = Math.max(1000, r.sMax - r.sMin);
  const pad = Math.max(w * 0.06, 1200);
  return { minX: r.sMin - pad * 1.6, minY: Math.min(r.zMin, r.ground) - 2600, maxX: r.sMax + pad * 2.6, maxY: r.zMax + 1400 };
}

export interface BSecOpts { mode: 'section' | 'elevation'; showDims: boolean; showLevels: boolean; highlight?: Set<string> }

const tone = (hex: string, k: number) => {
  const n = parseInt(hex.replace('#', '').padEnd(6, '0').slice(0, 6), 16);
  const f = (v: number) => Math.round(v + (255 - v) * k);
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
};

let clipSeq = 0;

export function renderBSection(r: BSectionResult, ctx: ViewCtx, o: BSecOpts): ReactNode {
  const T = ctx.T, pu = ctx.pu, bw = ctx.bw;
  const lw = (mm: number) => mm * pu;
  const wpu = pu / ctx.k; // world mm per paper mm
  const d = (pts: SPt[], closed = true) => `M${pts.map((q) => { const s = T(P(q)); return `${s.x.toFixed(2)} ${s.y.toFixed(2)}`; }).join('L')}${closed ? 'Z' : ''}`;
  const hl = o.highlight ?? new Set<string>();
  const id = `bsc${++clipSeq}`;
  const s0 = r.sMin - Math.max(1500, (r.sMax - r.sMin) * 0.05), s1 = r.sMax + Math.max(1500, (r.sMax - r.sMin) * 0.05);
  const zDatum = Math.min(r.zMin, r.ground) - 1200;
  const earth: SPt[] = [{ s: s0, z: r.ground }, { s: s1, z: r.ground }, { s: s1, z: zDatum }, { s: s0, z: zDatum }];

  // Beyond: thin lines, light fill.
  const beyond = r.beyond.map((c, i) => {
    const isHl = hl.has(c.id);
    const glass = c.role === 'glass' || c.role === 'railing';
    const fill = bw ? '#ffffff' : glass ? '#dcebf3' : c.type === 'furniture' ? tone(c.color, 0.55) : c.role === 'roof' ? tone(c.color, 0.45) : tone(c.color, 0.35);
    return <path key={`b${i}`} d={d(c.poly)} fill={fill} fillOpacity={glass ? 0.7 : 1} stroke={isHl ? '#e8590c' : '#6b6b6b'} strokeWidth={lw(glass ? 0.1 : 0.13)} strokeLinejoin="round" />;
  });

  // Earth hatch.
  const hatch: ReactNode[] = [];
  const sp = 2.2 * wpu;
  const hgt = r.ground - zDatum;
  for (let s = s0 - hgt, i = 0; s < s1 && i < 3000; s += sp, i++) {
    const a = T(v2(s, zDatum)), b = T(v2(s + hgt, r.ground));
    hatch.push(<line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={bw ? '#777' : '#a58a68'} strokeWidth={lw(0.1)} />);
  }

  // Cut solids: structure as poché; glass, frames, door leaves and furniture lighter. Pieces of one element get a wide
  // outline first and their fills on top, so the seams between pieces disappear.
  const groups = new Map<string, SShape[]>();
  for (const c of r.cut) { const k = `${c.id}|${c.role}`; if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(c); }
  const structure: ReactNode[] = [], light: ReactNode[] = [];
  let gi = 0;
  for (const list of groups.values()) {
    gi++;
    const role = list[0].role, type = list[0].type;
    const isHl = hl.has(list[0].id);
    const line = isHl ? '#e8590c' : '#111';
    if (role === 'glass' || role === 'railing') { list.forEach((c, i) => light.push(<path key={`g${gi}-${i}`} d={d(c.poly)} fill={bw ? '#fff' : '#cfe3ee'} stroke={line} strokeWidth={lw(0.18)} />)); continue; }
    if (role === 'frame' || role === 'leaf') { list.forEach((c, i) => light.push(<path key={`l${gi}-${i}`} d={d(c.poly)} fill={bw ? '#fff' : tone(c.color, 0.3)} stroke={line} strokeWidth={lw(0.2)} />)); continue; }
    if (type === 'furniture') { list.forEach((c, i) => light.push(<path key={`f${gi}-${i}`} d={d(c.poly)} fill={bw ? '#fff' : tone(c.color, 0.25)} stroke={line} strokeWidth={lw(0.25)} />)); continue; }
    const fill = bw ? '#3a3a3a' : role === 'roof' ? '#6d5a48' : role === 'stair' ? '#6f6a63' : role === 'slab' || role === 'ceiling' ? '#5d5f63' : '#4a4d52';
    list.forEach((c, i) => structure.push(<path key={`o${gi}-${i}`} d={d(c.poly)} fill="none" stroke={line} strokeWidth={lw(0.5) * 2} strokeLinejoin="round" />));
    list.forEach((c, i) => structure.push(<path key={`i${gi}-${i}`} d={d(c.poly)} fill={isHl ? '#e8590c' : fill} stroke="none" />));
  }

  // Level marks at the right of the drawing, with a thin line across the building.
  const marks: ReactNode[] = [];
  if (o.showLevels) {
    const xr = r.sMax + 6 * wpu + 300;
    const seen: number[] = [];
    const rows = [...r.levels.map((l) => ({ z: l.z, name: l.name })), ...(Math.abs(r.zMax - r.levels[r.levels.length - 1]?.z) > 200 ? [{ z: r.zMax, name: 'נקודה עליונה' }] : [])];
    rows.forEach((lv, i) => {
      if (seen.some((z) => Math.abs(z - lv.z) < 3 * wpu)) return;
      seen.push(lv.z);
      const q = T(v2(xr, lv.z)), a = T(v2(r.sMin, lv.z));
      const h = 1.6 * pu;
      marks.push(
        <g key={`lv${i}`}>
          <line x1={a.x} y1={a.y} x2={q.x} y2={q.y} stroke="#888" strokeWidth={lw(0.1)} strokeDasharray={`${lw(2)} ${lw(1)}`} />
          <path d={`M${q.x} ${q.y}L${q.x - h * 0.6} ${q.y - h}L${q.x + h * 0.6} ${q.y - h}Z`} fill="#111" stroke="#111" strokeWidth={lw(0.15)} />
          <line x1={q.x} y1={q.y - h} x2={q.x + 16 * pu} y2={q.y - h} stroke="#111" strokeWidth={lw(0.13)} />
          <text x={q.x + 1 * pu} y={q.y - h - 0.8 * pu} fontSize={2.3 * pu} fontFamily="Rubik, Arial, sans-serif" direction="ltr" textAnchor="start" fill="#111">{fmtLevel(lv.z)}</text>
          <text x={q.x + 16 * pu} y={q.y + 2.4 * pu} fontSize={2 * pu} fontFamily="Rubik, Arial, sans-serif" direction="rtl" textAnchor="start" fill="#333">{lv.name}</text>
        </g>,
      );
    });
    // The ground level around the building.
    const g = T(v2(r.sMin - 1200, r.ground));
    const h = 1.6 * pu;
    marks.push(<g key="gl"><path d={`M${g.x} ${g.y}L${g.x - h * 0.6} ${g.y - h}L${g.x + h * 0.6} ${g.y - h}Z`} fill="#fff" stroke="#111" strokeWidth={lw(0.15)} /><text x={g.x - 1 * pu} y={g.y - h - 0.8 * pu} fontSize={2.1 * pu} fontFamily="Rubik, Arial, sans-serif" direction="ltr" textAnchor="end" fill="#111">{fmtLevel(r.ground)}</text></g>);
  }

  const dims: ReactNode[] = [];
  if (o.showDims) {
    // Heights of the openings the plane passes through.
    const used: number[] = [];
    for (const [i, op] of [...r.openings].sort((a, b) => a.s - b.s).entries()) {
      if (used.some((s) => Math.abs(s - op.s) < 7 * wpu)) continue;
      used.push(op.s);
      dims.push(<Dimension key={`od${i}`} a={v2(op.s, op.z0)} b={v2(op.s, op.z1)} offset={-3 * wpu} ctx={ctx} color="#1f4fa8" width={0.15} text={mToStr(op.z1 - op.z0, 2)} />);
    }
    // Level to level on the left.
    const zs = [...new Set(r.levels.map((l) => l.z))].sort((a, b) => a - b);
    const xl = r.sMin - 4 * wpu;
    for (let i = 0; i + 1 < zs.length; i++) dims.push(<Dimension key={`ld${i}`} a={v2(xl, zs[i + 1])} b={v2(xl, zs[i])} offset={0} ctx={ctx} color="#222" width={0.15} text={mToStr(zs[i + 1] - zs[i], 2)} />);
    if (zs.length && r.zMax - zs[zs.length - 1] > 100) dims.push(<Dimension key="ldt" a={v2(xl - 7 * wpu, r.zMax)} b={v2(xl - 7 * wpu, zs[0])} offset={0} ctx={ctx} color="#222" width={0.15} text={mToStr(r.zMax - zs[0], 2)} />);
    // Overall width.
    dims.push(<Dimension key="hd" a={v2(r.sMin, zDatum)} b={v2(r.sMax, zDatum)} offset={-5 * wpu} ctx={ctx} color="#222" width={0.15} text={mToStr(r.sMax - r.sMin, 2)} />);
  }

  return (
    <g>
      <defs><clipPath id={id}><path d={d(earth)} /></clipPath></defs>
      {beyond}
      <path d={d(earth)} fill={bw ? '#ffffff' : '#f3eee4'} stroke="none" />
      <g clipPath={`url(#${id})`}>{hatch}</g>
      <path d={d([{ s: s0, z: r.ground }, { s: s1, z: r.ground }], false)} fill="none" stroke="#111" strokeWidth={lw(o.mode === 'section' ? 0.6 : 0.4)} />
      {light}
      {structure}
      {marks}
      {dims}
    </g>
  );
}

// Drawing of a site section or elevation (SVG), in section coordinates: x = s, y = level (both mm).
// Cut elements are drawn heavy and filled; elements beyond the plane are drawn light, far to near,
// so nearer ones hide farther ones. Earth below the cut ground line is hatched.

import type { ReactNode } from 'react';
import { type Vec2, v2 } from '../../geometry/vec';
import { Dimension } from '../../drawing/dimension';
import type { Box, ViewCtx } from '../../drawing/viewport';
import type { SecPt, SecShape, SectionResult } from '../section';
import { fmtLevel, mToStr } from '../units';
import { tone } from './plan';

const P = (q: SecPt): Vec2 => v2(q.s, q.z);

export function sectionBox(r: SectionResult): Box {
  const pad = Math.max(r.L * 0.03, 800);
  const zb = r.zMin - Math.max(1200, (r.zMax - r.zMin) * 0.12);
  return { minX: -pad, minY: zb - 2600, maxX: r.L + pad * 2.2, maxY: r.zMax + 1200 };
}

let clipSeq = 0;

export function renderSiteSection(r: SectionResult, ctx: ViewCtx, opts: { mode: 'section' | 'elevation'; showDims: boolean; showLevels: boolean; highlight?: Set<string> }): ReactNode {
  const T = ctx.T, pu = ctx.pu, bw = ctx.bw;
  const lw = (mm: number) => mm * pu;
  const wpu = pu / ctx.k; // world mm per paper mm
  const d = (pts: SecPt[], closed = true) => `M${pts.map((q) => { const s = T(P(q)); return `${s.x.toFixed(2)} ${s.y.toFixed(2)}`; }).join('L')}${closed ? 'Z' : ''}`;
  const id = `sc${++clipSeq}`;
  const zDatum = r.zMin - Math.max(1200, (r.zMax - r.zMin) * 0.12);
  const ground = r.ground;
  const earth: SecPt[] = [...ground, { s: ground[ground.length - 1].s, z: zDatum }, { s: ground[0].s, z: zDatum }];
  const hl = opts.highlight ?? new Set<string>();

  const shape = (c: SecShape, key: string, fill: string, stroke: string, w: number, dash?: string, fillOpacity = 1) => {
    if (c.ell) {
      const q = T(v2(c.ell.cs, c.ell.cz));
      return <ellipse key={key} cx={q.x} cy={q.y} rx={c.ell.rs * ctx.k} ry={c.ell.rz * ctx.k} fill={fill} fillOpacity={fillOpacity} stroke={stroke} strokeWidth={w} strokeDasharray={dash} />;
    }
    return <path key={key} d={d(c.poly!)} fill={fill} fillOpacity={fillOpacity} stroke={stroke} strokeWidth={w} strokeDasharray={dash} strokeLinejoin="round" />;
  };

  // Elements beyond the plane: light lines, white fill so nearer ones hide farther ones.
  const beyond = r.beyond.map((c, i) => {
    const isHl = hl.has(c.id);
    const fill = c.role === 'foliage' ? tone(c.color, bw, 0.72) : c.role === 'water' ? tone(c.color, bw, 0.6) : c.role === 'void' ? '#ffffff' : tone(c.color, bw, 0.78);
    return shape(c, `b${i}`, bw ? '#ffffff' : fill, isHl ? '#e8590c' : '#6b6b6b', lw(0.13));
  });

  // Hatch lines for the earth, clipped to the earth polygon.
  const hatch: ReactNode[] = [];
  const sp = 2.2 * wpu;
  const x0 = ground[0].s, x1 = ground[ground.length - 1].s;
  const zTop = Math.max(...ground.map((g) => g.z));
  const hgt = zTop - zDatum;
  for (let s = x0 - hgt, i = 0; s < x1 && i < 4000; s += sp, i++) {
    const a = T(v2(s, zDatum)), b = T(v2(s + hgt, zTop));
    hatch.push(<line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={bw ? '#777' : '#a58a68'} strokeWidth={lw(0.1)} />);
  }

  // Draped surfaces: a band of the paving thickness under the ground line, or a line for lawns.
  const surfaces = r.surfaces.map((sf, i) => {
    if (sf.thick > 0) {
      const band = [...sf.top, ...[...sf.top].reverse().map((q) => ({ s: q.s, z: q.z - sf.thick }))];
      return <path key={`sf${i}`} d={d(band)} fill={tone(sf.color, bw, 0.15)} stroke="#222" strokeWidth={lw(0.18)} />;
    }
    return <path key={`sf${i}`} d={d(sf.top, false)} fill="none" stroke={bw ? '#333' : tone(sf.color, false)} strokeWidth={lw(0.6)} />;
  });

  // Cut solids. Each element's pieces get a wide outline first and their fills on top, so the
  // seams between pieces of the same element (stair steps, wall segments) disappear.
  const groups = new Map<string, SecShape[]>();
  for (const c of r.cut) { const k = `${c.id}|${c.role}`; if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(c); }
  const cutNodes: ReactNode[] = [];
  let gi = 0;
  for (const [k, list] of groups) {
    const role = list[0].role;
    const isHl = hl.has(list[0].id);
    const line = isHl ? '#e8590c' : '#111';
    gi++;
    if (role === 'void') { list.forEach((c, i) => cutNodes.push(shape(c, `v${gi}-${i}`, '#ffffff', 'none', 0))); continue; }
    if (role === 'water') {
      list.forEach((c, i) => {
        cutNodes.push(shape(c, `w${gi}-${i}`, bw ? '#e6e6e6' : tone(c.color, false, 0.35), bw ? '#333' : '#1f5f8a', lw(0.25)));
        if (c.poly) {
          const top = Math.max(...c.poly.map((q) => q.z)), sa = Math.min(...c.poly.map((q) => q.s)), sb = Math.max(...c.poly.map((q) => q.s));
          for (let j = 1; j <= 2; j++) {
            const zz = top - j * 1.2 * wpu;
            const A = T(v2(sa + (sb - sa) * 0.2, zz)), B = T(v2(sb - (sb - sa) * 0.2, zz));
            if (zz > Math.min(...c.poly.map((q) => q.z))) cutNodes.push(<line key={`wl${gi}-${i}-${j}`} x1={A.x} y1={A.y} x2={B.x} y2={B.y} stroke={bw ? '#555' : '#1f5f8a'} strokeWidth={lw(0.13)} />);
          }
        }
      });
      continue;
    }
    if (role === 'foliage') { list.forEach((c, i) => cutNodes.push(shape(c, `f${gi}-${i}`, tone(c.color, bw, 0.45), line, lw(0.35), undefined, 0.85))); continue; }
    const w = lw(role === 'trunk' ? 0.35 : 0.5);
    const fill = role === 'trunk' ? tone(list[0].color, bw, 0) : bw ? '#3a3a3a' : tone(list[0].color, false, 0).replace(/^#/, '#');
    list.forEach((c, i) => cutNodes.push(shape(c, `o${gi}-${i}`, 'none', line, w * 2)));
    list.forEach((c, i) => cutNodes.push(shape(c, `i${gi}-${i}`, role === 'solid' ? (bw ? '#4a4a4a' : darken(fill)) : fill, 'none', 0)));
    void k;
  }

  // Level marks: a small open triangle with the level written beside it.
  const marks: ReactNode[] = [];
  if (opts.showLevels) {
    const seen: { s: number; z: number }[] = [];
    r.levels.forEach((lv, i) => {
      if (seen.some((q) => Math.abs(q.s - lv.s) < 3 * wpu && Math.abs(q.z - lv.z) < 3 * wpu)) return;
      seen.push(lv);
      const q = T(v2(lv.s, lv.z));
      const h = 1.6 * pu;
      // The mark at the start of the line points outwards, so its text does not sit on the drawing.
      const dir = lv.ground && lv.s < r.L * 0.01 ? -1 : 1;
      marks.push(
        <g key={`lv${i}`}>
          <path d={`M${q.x} ${q.y}L${q.x - h * 0.6} ${q.y - h}L${q.x + h * 0.6} ${q.y - h}Z`} fill={lv.ground ? '#fff' : '#111'} stroke="#111" strokeWidth={lw(0.15)} />
          <line x1={q.x} y1={q.y - h} x2={q.x + dir * 9 * pu} y2={q.y - h} stroke="#111" strokeWidth={lw(0.13)} />
          <text x={q.x + dir * 1 * pu} y={q.y - h - 0.8 * pu} fontSize={2.3 * pu} fontFamily="Rubik, Arial, sans-serif" direction="ltr" textAnchor={dir < 0 ? 'end' : 'start'} fill="#111">{fmtLevel(lv.z)}</text>
        </g>,
      );
    });
  }

  const dims: ReactNode[] = [];
  if (opts.showDims) {
    const used: number[] = [];
    [...r.vdims].sort((a, b) => a.s - b.s).slice(0, 16).forEach((vd, i) => {
      if (vd.z1 - vd.z0 < 50) return;
      // Skip a height dimension that would sit on top of the previous one.
      if (used.some((s0) => Math.abs(s0 - vd.s) < 6 * wpu)) return;
      used.push(vd.s);
      dims.push(<Dimension key={`vd${i}`} a={v2(vd.s + 1.5 * wpu, vd.z0)} b={v2(vd.s + 1.5 * wpu, vd.z1)} offset={-2.5 * wpu} ctx={ctx} color="#222" width={0.15} text={mToStr(vd.z1 - vd.z0, 2)} />);
    });
    dims.push(<Dimension key="hd" a={v2(0, zDatum)} b={v2(r.L, zDatum)} offset={-6 * wpu} ctx={ctx} color="#222" width={0.15} text={mToStr(r.L, 2)} />);
  }

  return (
    <g>
      <defs><clipPath id={id}><path d={d(earth)} /></clipPath></defs>
      {beyond}
      <path d={d(earth)} fill={bw ? '#ffffff' : '#f3eee4'} stroke="none" />
      <g clipPath={`url(#${id})`}>{hatch}</g>
      {surfaces}
      <path d={d(ground, false)} fill="none" stroke="#111" strokeWidth={lw(opts.mode === 'section' ? 0.6 : 0.35)} />
      {cutNodes}
      {marks}
      {dims}
    </g>
  );
}

function darken(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.round(v * 0.5);
  return `#${((1 << 24) | (f((n >> 16) & 255) << 16) | (f((n >> 8) & 255) << 8) | f(n & 255)).toString(16).slice(1)}`;
}

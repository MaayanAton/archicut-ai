// Floor plan drawing (SVG) of one level. Used by the editor, the thumbnails, the print page and the sheets.
// Walls are drawn from their joined outlines with the openings cut out; doors show their leaf and swing;
// furniture is the top view of its actual solids, so the plan always matches the 3D model.

import type { ReactNode } from 'react';
import { type Vec2, v2 } from '../../geometry/vec';
import { Dimension } from '../../drawing/dimension';
import { addPt, emptyBox, type Box, type ViewCtx } from '../../drawing/viewport';
import { add, mul, norm, perpL, rotatePt, sub } from '../../site/poly';
import { tone, Halo } from '../../site/render/plan';
import { fmtArea, mToStr } from '../../site/units';
import type { BldSection, BuildingData, Furniture, Phase, PlanKind, ViewState } from '../types';
import { columnOutline, furnitureOutline, inState, shownEl, sortedLevels, type BuildingModel, type LevelModel, type OpeningModel } from '../model';
import { furn, partBottom, partColor, partTop } from '../furniture';
import { isRich, resolveFinish } from '../../materials/finish';
import type { FloorFinish } from '../types';
import { faceRange } from '../wall4';
import { stairGeom } from '../stairs';

export const SEL = '#e8590c';
const RED = '#d02f2f', GREEN = '#2f8f4e';

const d = (pts: Vec2[], ctx: ViewCtx, closed = true) => {
  if (!pts.length) return '';
  return `M${pts.map((p) => { const q = ctx.T(p); return `${q.x.toFixed(2)} ${q.y.toFixed(2)}`; }).join('L')}${closed ? 'Z' : ''}`;
};

function Txt({ p, ctx, size, children, color = '#222', bold = false, halo = true }: { p: Vec2; ctx: ViewCtx; size: number; children: ReactNode; color?: string; bold?: boolean; halo?: boolean }) {
  const q = ctx.T(p);
  const t = <text x={q.x} y={q.y} fontSize={size * ctx.pu} textAnchor="middle" dominantBaseline="middle" direction="rtl" fontFamily="Rubik, Arial, sans-serif" fontWeight={bold ? 700 : 400} fill={color} style={{ pointerEvents: 'none' }}>{children}</text>;
  return halo ? <Halo width={size * ctx.pu * 0.3} text={t} /> : t;
}

export interface BPlanOpts {
  state?: ViewState;
  kind?: PlanKind;
  selected?: Set<string>;
  /** Overall dimensions of the building. */
  dims?: boolean;
  furniture?: boolean;
  /** Level drawn faintly underneath (the one below). */
  ghost?: LevelModel | null;
  sections?: BldSection[];
  roofs?: boolean;
  /** Room labels with areas. */
  labels?: boolean;
  /** Highlight (for the warnings list). */
  warn?: Set<string>;
}

/** Style of an element by its phase in a renovation view. */
function phaseStyle(phase: Phase, state: ViewState, ren: boolean): 'normal' | 'existing' | 'demolish' | 'new' {
  if (!ren) return 'normal';
  if (state === 'demolition') return phase === 'demolish' ? 'demolish' : 'existing';
  if (state === 'compare') return phase === 'demolish' ? 'demolish' : phase === 'new' ? 'new' : 'existing';
  return 'normal';
}

/** Top view of a furniture item (exactly its solids), in world coordinates. */
export function furnitureSymbol(f: Furniture, ctx: ViewCtx, opts: { color?: string; dashed?: boolean; key?: string } = {}): ReactNode {
  const item = furn(f.kind);
  const bw = ctx.bw;
  const w = 0.13 * ctx.pu;
  const T = (x: number, y: number) => rotatePt(v2(f.p.x + x, f.p.y + y), f.rot, f.p);
  const parts = item.parts(f.w, f.d, f.h).slice().sort((a, b) => partTop(a) - partTop(b));
  const stroke = opts.color ?? (bw ? '#222' : '#3d4248');
  const dashS = `${1.2 * ctx.pu} ${0.8 * ctx.pu}`;
  const dash = item.above || opts.dashed ? dashS : undefined;
  // 4.0 "cut" items (gates, arches, canopies) are drawn as cut 1.20 m above the floor: what is above is dashed.
  const cutZ = 1200 - f.elev;
  const nodes: ReactNode[] = parts.map((p, i) => {
    const above = item.cut && partBottom(p) > cutZ;
    const pd = above ? dashS : dash;
    const fill = item.above || above ? 'none' : bw ? '#ffffff' : p.c === 'lamp' ? '#fff3c8' : tone(partColor(p.c, f.color, f.color2, f.color3), false, 0.45);
    if (p.t === 'box' || p.t === 'slice') return <path key={i} d={d([T(p.x0, p.y0), T(p.x1, p.y0), T(p.x1, p.y1), T(p.x0, p.y1)], ctx)} fill={fill} stroke={stroke} strokeWidth={w} strokeDasharray={pd} />;
    if (p.t === 'poly') return <path key={i} d={d(p.pts.map(([x, y]) => T(x, y)), ctx)} fill={fill} stroke={stroke} strokeWidth={w} strokeDasharray={pd} />;
    const c = ctx.T(T(p.cx, p.cy));
    return <circle key={i} cx={c.x} cy={c.y} r={p.r * ctx.k} fill={fill} stroke={stroke} strokeWidth={w} strokeDasharray={pd} />;
  });
  for (const [i, l] of (item.lines?.(f.w, f.d) ?? []).entries()) {
    const a = ctx.T(T(l[0], l[1])), b = ctx.T(T(l[2], l[3]));
    nodes.push(<line key={`l${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={stroke} strokeWidth={w * 0.8} strokeDasharray={dash} />);
  }
  return <g key={opts.key}>{nodes}</g>;
}

/** Plan symbol of a door or window, drawn in the gap of its wall. */
function openingSymbol(om: OpeningModel, ctx: ViewCtx, color: string, dash: string | undefined, key: string): ReactNode {
  const { o, def, wall, s0, s1, u, n } = om;
  const t = wall.thickness;
  const A = wall.a;
  const P = (s: number, off: number) => add(A, add(mul(u, s), mul(n, off)));
  const lw = 0.18 * ctx.pu;
  const line = (p: Vec2, q: Vec2, k: string, wdt = lw) => { const a = ctx.T(p), b = ctx.T(q); return <line key={k} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth={wdt} strokeDasharray={dash} />; };
  const out: ReactNode[] = [];
  const side = o.side === 'L' ? 1 : -1;
  const fw = 50;
  const i0 = s0 + fw, i1 = s1 - fw;
  // Jamb lines across the wall at both ends of the opening.
  out.push(line(P(s0, -t / 2), P(s0, t / 2), 'j0'), line(P(s1, -t / 2), P(s1, t / 2), 'j1'));
  const arc = (hingeS: number, len: number, k: string) => {
    const H = P(hingeS, (side * t) / 2);
    const tip = add(H, mul(n, side * Math.abs(len)));
    const closed = P(hingeS + len, (side * t) / 2);
    out.push(line(H, tip, `${k}l`, lw * 1.6));
    const a = ctx.T(tip), b = ctx.T(closed), h = ctx.T(H);
    const cr = (a.x - h.x) * (b.y - h.y) - (a.y - h.y) * (b.x - h.x);
    const r = Math.abs(len) * ctx.k;
    out.push(<path key={`${k}a`} d={`M${a.x} ${a.y}A${r} ${r} 0 0 ${cr > 0 ? 1 : 0} ${b.x} ${b.y}`} fill="none" stroke={color} strokeWidth={lw * 0.7} strokeDasharray={dash ?? `${0.8 * ctx.pu} ${0.5 * ctx.pu}`} />);
  };
  if (def.style === 'swing') {
    if (o.hinge === 'start') arc(i0, i1 - i0, 'd'); else arc(i1, -(i1 - i0), 'd');
    out.push(line(P(i0, 0), P(i1, 0), 'th', lw * 0.5));
  } else if (def.style === 'swing2') {
    const h = (i1 - i0) / 2;
    arc(i0, h, 'd1');
    arc(i1, -h, 'd2');
  } else if (def.style === 'sliding') {
    const mid = (i0 + i1) / 2;
    out.push(line(P(i0, -15), P(mid + 40, -15), 's1', lw * 1.6), line(P(mid - 40, side * 45), P(i1, side * 45), 's2', lw * 1.6));
    const ar = (from: Vec2, to: Vec2, k: string) => {
      const a = ctx.T(from), b = ctx.T(to);
      const dd = norm(sub(b, a)), pp = perpL(dd), hh = 1.2 * ctx.pu;
      return <path key={k} d={`M${a.x} ${a.y}L${b.x} ${b.y}M${b.x - dd.x * hh + pp.x * hh * 0.5} ${b.y - dd.y * hh + pp.y * hh * 0.5}L${b.x} ${b.y}L${b.x - dd.x * hh - pp.x * hh * 0.5} ${b.y - dd.y * hh - pp.y * hh * 0.5}`} fill="none" stroke={color} strokeWidth={lw * 0.7} />;
    };
    out.push(ar(P(mid + 200, side * (t / 2 + 150)), P(mid - 200, side * (t / 2 + 150)), 'ar'));
  } else {
    // Windows: the two faces and the glass line(s); a sliding window has two offset sashes.
    out.push(line(P(s0, -t / 2), P(s1, -t / 2), 'f1', lw * 0.7), line(P(s0, t / 2), P(s1, t / 2), 'f2', lw * 0.7));
    if (def.style === 'window-sliding') { const mid = (i0 + i1) / 2; out.push(line(P(i0, -15), P(mid + 30, -15), 'g1', lw), line(P(mid - 30, 15), P(i1, 15), 'g2', lw)); }
    else out.push(line(P(i0, 0), P(i1, 0), 'g', lw), ...(def.style === 'window' ? [line(P((i0 + i1) / 2, -25), P((i0 + i1) / 2, 25), 'm')] : []));
  }
  return <g key={key}>{out}</g>;
}

export function renderBuildingPlan(dd: BuildingData, m: BuildingModel, levelId: string, ctx: ViewCtx, o: BPlanOpts = {}): ReactNode {
  const lm = m.levels.find((l) => l.level.id === levelId);
  if (!lm) return null;
  const bw = ctx.bw;
  const state = o.state ?? m.state;
  const ren = dd.renovation;
  const sel = o.selected ?? new Set<string>();
  const kind = o.kind ?? 'plan';
  const showFurn = o.furniture ?? kind !== 'plan';
  const wallDark = bw ? '#2b2b2b' : '#353b43';
  const nodes: ReactNode[] = [];
  const pw = (x: number) => x * ctx.pu;

  // Lot boundary (on the lowest level).
  if (dd.lot.length >= 3 && levelId === [...dd.levels].sort((a, b) => a.elevation - b.elevation)[0]?.id)
    nodes.push(<path key="lot" d={d(dd.lot, ctx)} fill="none" stroke={bw ? '#555' : '#2f7a3b'} strokeWidth={pw(0.35)} strokeDasharray={`${pw(6)} ${pw(1.5)} ${pw(1)} ${pw(1.5)}`} />);

  // The level below, faintly.
  if (o.ghost) for (const wm of o.ghost.walls) nodes.push(<path key={`gh${wm.w.id}`} d={d(wm.outline, ctx)} fill="none" stroke="#9aa3ad" strokeWidth={pw(0.15)} strokeDasharray={`${pw(1)} ${pw(0.8)}`} />);

  // Drawn slabs: balconies, floors and openings in the floor.
  for (const s of dd.slabs.filter((x) => x.levelId === levelId && inState(x.phase, state, ren) && shownEl(dd, x))) {
    if (s.pts.length < 3) continue;
    const isSel = sel.has(s.id);
    if (s.kind === 'void') {
      const xs = s.pts;
      nodes.push(<path key={s.id} data-el={s.id} d={d(xs, ctx)} fill="none" stroke={isSel ? SEL : '#555'} strokeWidth={pw(0.2)} strokeDasharray={`${pw(2)} ${pw(1)}`} />);
      if (xs.length === 4) nodes.push(<path key={`${s.id}x`} d={`${d([xs[0], xs[2]], ctx, false)}${d([xs[1], xs[3]], ctx, false)}`} stroke={isSel ? SEL : '#777'} strokeWidth={pw(0.13)} fill="none" />);
    } else {
      nodes.push(<path key={s.id} data-el={s.id} d={d(s.pts, ctx)} fill={bw ? '#fff' : tone(s.color, false, s.kind === 'ceiling' ? 0.85 : 0.5)} fillOpacity={s.kind === 'ceiling' ? 0.4 : 1} stroke={isSel ? SEL : '#555'} strokeWidth={pw(s.kind === 'balcony' ? 0.3 : 0.15)} strokeDasharray={s.kind === 'ceiling' ? `${pw(2)} ${pw(1)}` : undefined} />);
    }
  }

  // Rooms: floor colour.
  for (const r of lm.rooms) {
    if (!r.net) continue;
    const isSel = sel.has(r.room.id);
    nodes.push(<path key={`rf${r.room.id}`} data-el={r.room.id} d={d(r.net, ctx)} fill={bw ? '#ffffff' : tone(r.room.floor.color, false, 0.62)} stroke={isSel ? SEL : 'none'} strokeWidth={pw(0.5)} />);
    // 4.0: the laying pattern of the floor (tiles, planks), in design plans.
    if (showFurn && isRich(r.room.floor)) nodes.push(floorPattern(r.room.floor, r.net, ctx, `rp${r.room.id}`));
    if (r.room.safeRoom) nodes.push(<Txt key={`sr${r.room.id}`} p={v2(r.center.x, r.center.y + (3.4 * ctx.pu) / ctx.k)} ctx={ctx} size={1.9} color="#8a3b12">{'ממ״ד (להמחשה בלבד)'}</Txt>);
  }
  // 4.0: floor zones (another finish inside a room).
  for (const fz of (dd.floorZones ?? []).filter((x) => x.levelId === levelId && shownEl(dd, x) && x.pts.length >= 3)) {
    const isSel = sel.has(fz.id);
    nodes.push(<path key={`fz${fz.id}`} data-el={fz.id} d={d(fz.pts, ctx)} fill={bw ? '#ffffff' : tone(fz.floor.color, false, 0.55)} stroke={isSel ? SEL : bw ? '#444' : '#6b6f75'} strokeWidth={pw(isSel ? 0.5 : 0.15)} strokeDasharray={`${pw(1.5)} ${pw(0.7)}`} />);
    if (showFurn && isRich(fz.floor)) nodes.push(floorPattern(fz.floor, fz.pts, ctx, `fp${fz.id}`));
  }

  // Stairs.
  for (const st of dd.stairs.filter((x) => x.levelId === levelId && inState(x.phase, state, ren) && shownEl(dd, x))) {
    const g = stairGeom(st);
    const isSel = sel.has(st.id);
    const col = isSel ? SEL : phaseStyle(st.phase, state, ren) === 'demolish' ? RED : '#333';
    for (const [i, t] of g.treads.entries()) nodes.push(<path key={`${st.id}t${i}`} data-el={st.id} d={d(t.poly, ctx)} fill={bw ? '#fff' : tone(st.color, false, 0.55)} stroke={col} strokeWidth={pw(0.15)} />);
    if (g.path.length >= 2) {
      nodes.push(<path key={`${st.id}p`} d={d(g.path, ctx, false)} fill="none" stroke={col} strokeWidth={pw(0.18)} />);
      const a = ctx.T(g.path[g.path.length - 2]), b = ctx.T(g.path[g.path.length - 1]);
      const dv = norm(sub(b, a)), pp = perpL(dv), h = pw(1.8);
      nodes.push(<path key={`${st.id}h`} d={`M${b.x} ${b.y}L${b.x - dv.x * h + pp.x * h * 0.45} ${b.y - dv.y * h + pp.y * h * 0.45}L${b.x - dv.x * h - pp.x * h * 0.45} ${b.y - dv.y * h - pp.y * h * 0.45}Z`} fill={col} />);
      const s0 = ctx.T(g.path[0]);
      nodes.push(<circle key={`${st.id}c`} cx={s0.x} cy={s0.y} r={pw(0.6)} fill="none" stroke={col} strokeWidth={pw(0.15)} />);
      nodes.push(<Txt key={`${st.id}u`} p={g.path[0]} ctx={ctx} size={1.8} color={col}>{'עלייה'}</Txt>);
    }
    if (!g.treads.length && g.outline.length === 0) nodes.push(<Txt key={`${st.id}e`} p={st.p} ctx={ctx} size={2} color={RED}>{'מדרגות: נתונים לא תקינים'}</Txt>);
  }

  // A stair that rises from the level below into this one, seen from above through its opening: thin lines and "ירידה".
  const lvls = sortedLevels(dd);
  const below = lvls[lvls.findIndex((l) => l.id === levelId) - 1];
  if (below) for (const st of dd.stairs.filter((x) => x.levelId === below.id && inState(x.phase, state, ren) && shownEl(dd, x))) {
    const g = stairGeom(st);
    if (!g.treads.length) continue;
    const col = '#6b6b6b';
    for (const [i, t] of g.treads.entries()) nodes.push(<path key={`${st.id}bt${i}`} d={d(t.poly, ctx)} fill="none" stroke={col} strokeWidth={pw(0.1)} />);
    if (g.path.length >= 2) {
      nodes.push(<path key={`${st.id}bp`} d={d(g.path, ctx, false)} fill="none" stroke={col} strokeWidth={pw(0.13)} strokeDasharray={`${pw(1)} ${pw(0.7)}`} />);
      const a = ctx.T(g.path[1]), b = ctx.T(g.path[0]);
      const dv = norm(sub(b, a)), pp = perpL(dv), h = pw(1.6);
      nodes.push(<path key={`${st.id}bh`} d={`M${b.x} ${b.y}L${b.x - dv.x * h + pp.x * h * 0.45} ${b.y - dv.y * h + pp.y * h * 0.45}L${b.x - dv.x * h - pp.x * h * 0.45} ${b.y - dv.y * h - pp.y * h * 0.45}Z`} fill={col} />);
      nodes.push(<Txt key={`${st.id}bd`} p={g.path[g.path.length - 1]} ctx={ctx} size={1.8} color={col}>{'ירידה'}</Txt>);
    }
  }

  // Furniture (under the walls' outline so that items touching walls look tidy).
  if (showFurn) for (const f of dd.furniture.filter((x) => x.levelId === levelId && inState(x.phase, state, ren) && shownEl(dd, x))) {
    const ps = phaseStyle(f.phase, state, ren);
    const isSel = sel.has(f.id);
    nodes.push(<g key={`f${f.id}`} data-el={f.id}>{furnitureSymbol(f, ctx, { color: isSel ? SEL : ps === 'demolish' ? RED : ps === 'new' ? GREEN : undefined, dashed: ps === 'demolish' })}</g>);
  }

  // Columns and beams (beams are above: dashed).
  for (const c of dd.columns.filter((x) => x.levelId === levelId && inState(x.phase, state, ren) && shownEl(dd, x))) {
    const isSel = sel.has(c.id);
    const fill = isSel ? SEL : wallDark;
    if (c.round) { const q = ctx.T(c.p); nodes.push(<circle key={c.id} data-el={c.id} cx={q.x} cy={q.y} r={(c.w / 2) * ctx.k} fill={fill} />); }
    else nodes.push(<path key={c.id} data-el={c.id} d={d(columnOutline(c), ctx)} fill={fill} />);
  }
  for (const b of dd.beams.filter((x) => x.levelId === levelId && inState(x.phase, state, ren) && shownEl(dd, x))) {
    const n = mul(perpL(norm(sub(b.b, b.a))), b.w / 2);
    nodes.push(<path key={b.id} data-el={b.id} d={d([add(b.a, n), add(b.b, n), sub(b.b, n), sub(b.a, n)], ctx)} fill="none" stroke={sel.has(b.id) ? SEL : '#555'} strokeWidth={pw(0.18)} strokeDasharray={`${pw(3)} ${pw(1)}`} />);
  }

  // Walls: a wide outline pass under a fill pass, so joints between walls show no seams.
  const groups: Record<'normal' | 'existing' | 'demolish' | 'new', typeof lm.walls> = { normal: [], existing: [], demolish: [], new: [] };
  for (const wm of lm.walls) groups[phaseStyle(wm.w.phase, state, ren)].push(wm);
  const fills = { normal: wallDark, existing: bw ? '#9a9a9a' : '#9aa0a6', demolish: 'none', new: bw ? '#5a5a5a' : GREEN };
  for (const g of ['existing', 'normal', 'new'] as const) {
    for (const wm of groups[g]) for (const [i, p] of wm.pieces.entries()) nodes.push(<path key={`wo${wm.w.id}${i}`} d={d(p, ctx)} fill="none" stroke="#111" strokeWidth={pw(0.5)} strokeLinejoin="round" />);
    for (const wm of groups[g]) for (const [i, p] of wm.pieces.entries()) nodes.push(<path key={`wf${wm.w.id}${i}`} data-el={wm.w.id} d={d(p, ctx)} fill={sel.has(wm.w.id) ? SEL : fills[g]} stroke="none" />);
  }
  for (const wm of groups.demolish) for (const [i, p] of wm.pieces.entries()) nodes.push(<path key={`wd${wm.w.id}${i}`} data-el={wm.w.id} d={d(p, ctx)} fill={bw ? 'none' : 'rgba(208,47,47,0.08)'} stroke={sel.has(wm.w.id) ? SEL : RED} strokeWidth={pw(0.4)} strokeDasharray={`${pw(1.6)} ${pw(0.9)}`} />);

  // 4.0: finishes of the wall faces (design plans): a thin coloured line along each face with a 4.0 finish, and the
  // zones that the plan cut (1.20 m) passes through.
  if (showFurn && !bw) for (const wm of lm.walls) {
    const w = wm.w;
    const u = norm(sub(w.b, w.a)), n = perpL(u);
    const line = (side: 'L' | 'R', s0: number, s1: number, color: string, k: string, wid: number) => {
      const off = (side === 'L' ? 1 : -1) * (w.thickness / 2 + (wid * ctx.pu) / ctx.k / 2);
      const a = ctx.T(add(w.a, add(mul(u, s0), mul(n, off)))), b = ctx.T(add(w.a, add(mul(u, s1), mul(n, off))));
      nodes.push(<line key={k} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth={wid * ctx.pu} />);
    };
    for (const side of ['L', 'R'] as const) {
      const fin = side === 'L' ? w.left : w.right;
      const fr = faceRange(wm.outline, w, side);
      if (isRich(fin)) line(side, fr[0], fr[1], tone(fin.color, false, 0.1), `wfl${w.id}${side}`, 0.35);
      for (const zn of (w.zones ?? []).filter((q) => q.side === side && q.z0 <= 1200 && (q.z1 ?? 1e9) >= 1200)) {
        line(side, Math.max(fr[0], zn.s0 ?? -1e9), Math.min(fr[1], zn.s1 ?? 1e9), tone(zn.finish.color, false, 0), `wz${zn.id}`, 0.55);
      }
    }
  }

  // Openings.
  for (const wm of lm.walls) for (const om of wm.openings) {
    const ps = phaseStyle(om.o.phase === 'new' || wm.w.phase === 'new' ? 'new' : om.o.phase === 'demolish' || wm.w.phase === 'demolish' ? 'demolish' : 'existing', state, ren);
    const col = sel.has(om.o.id) ? SEL : o.warn?.has(om.o.id) ? RED : ps === 'demolish' ? RED : ps === 'new' ? GREEN : bw ? '#111' : '#1f2328';
    nodes.push(<g key={`op${om.o.id}`} data-el={om.o.id}>{openingSymbol(om, ctx, col, ps === 'demolish' ? `${pw(1.2)} ${pw(0.8)}` : undefined, 'o')}</g>);
  }

  // Roof outlines (dashed) and ridge.
  if (o.roofs !== false) for (const r of lm.roofs) {
    if (!r.g.outline.length) continue;
    nodes.push(<path key={`ro${r.id}`} data-el={r.id} d={d(r.g.outline, ctx)} fill="none" stroke={sel.has(r.id) ? SEL : '#7a5a3a'} strokeWidth={pw(0.2)} strokeDasharray={`${pw(3)} ${pw(1)} ${pw(0.6)} ${pw(1)}`} />);
    if (r.g.ridge) nodes.push(<path key={`rr${r.id}`} d={d(r.g.ridge, ctx, false)} fill="none" stroke={sel.has(r.id) ? SEL : '#7a5a3a'} strokeWidth={pw(0.2)} strokeDasharray={`${pw(3)} ${pw(1)} ${pw(0.6)} ${pw(1)}`} />);
  }

  // Room names and areas.
  if (o.labels !== false) for (const r of lm.rooms) {
    if (!r.net) { nodes.push(<Txt key={`rl${r.room.id}`} p={r.center} ctx={ctx} size={2.2} color={RED}>{`${r.room.name} – לא סגור`}</Txt>); continue; }
    // Labels shrink to fit narrow rooms (down to a readable minimum), so neighbouring names do not run together.
    const xs = r.net.map((q) => q.x);
    const roomW = ((Math.max(...xs) - Math.min(...xs)) * ctx.k) / ctx.pu - 1.5;
    const f = Math.max(0.5, Math.min(1, roomW / Math.max(r.room.name.length * 2.6 * 0.56, fmtArea(r.area).length * 2.1 * 0.55)));
    nodes.push(<Txt key={`rl${r.room.id}`} p={r.center} ctx={ctx} size={2.6 * f} bold color={sel.has(r.room.id) ? SEL : '#1f2328'}>{r.room.name}</Txt>);
    if (r.room.showArea) nodes.push(<Txt key={`ra${r.room.id}`} p={v2(r.center.x, r.center.y - (3.6 * f * ctx.pu) / ctx.k)} ctx={ctx} size={2.1 * f} color="#3d4248">{fmtArea(r.area)}</Txt>);
  }

  // Annotations.
  for (const a of dd.annotations.filter((x) => x.levelId === levelId && shownEl(dd, x))) {
    const col = sel.has(a.id) ? SEL : '#222';
    nodes.push(<g key={a.id} data-el={a.id}>{a.type === 'dim' ? <Dimension a={a.a} b={a.b} offset={a.offset} ctx={ctx} color={col} text={mToStr(Math.hypot(a.b.x - a.a.x, a.b.y - a.a.y), 2)} /> : <Txt p={a.p} ctx={ctx} size={a.size} color={col}>{a.text}</Txt>}</g>);
  }

  // Overall dimensions of the building (outside faces).
  if (o.dims && lm.gross.length) {
    let b = emptyBox();
    for (const g of lm.gross) for (const p of g) b = addPt(b, p);
    // The dimension lines go outside anything that sticks out of the walls on this level (balconies, roof overhangs).
    let e = b;
    for (const s of dd.slabs.filter((x) => x.levelId === levelId)) for (const p of s.pts) e = addPt(e, p);
    for (const r of lm.roofs) for (const p of r.g.outline) e = addPt(e, p);
    const off = 8 * ctx.pu / ctx.k;
    nodes.push(<Dimension key="dimW" a={v2(b.minX, b.minY)} b={v2(b.maxX, b.minY)} offset={-(off + b.minY - e.minY)} ctx={ctx} color="#222" text={mToStr(b.maxX - b.minX, 2)} />);
    nodes.push(<Dimension key="dimH" a={v2(b.maxX, b.minY)} b={v2(b.maxX, b.maxY)} offset={-(off + e.maxX - b.maxX)} ctx={ctx} color="#222" text={mToStr(b.maxY - b.minY, 2)} />);
  }

  // Section marks.
  if (o.sections) for (const s of o.sections) {
    const a = ctx.T(s.a), b = ctx.T(s.b);
    const u = norm(sub(b, a));
    const nn = mul(perpL(u), -s.side); // screen y is down: the left of a→b in the world is this side on screen
    const h = pw(4);
    const col = bw ? '#000' : '#b4232c';
    const arrow = (p: Vec2, k: string) => {
      const tip = v2(p.x + nn.x * h, p.y + nn.y * h), w2 = pw(1);
      return <g key={k}><line x1={p.x} y1={p.y} x2={tip.x} y2={tip.y} stroke={col} strokeWidth={pw(0.35)} /><path d={`M${tip.x + nn.x * w2} ${tip.y + nn.y * w2}L${tip.x + u.x * w2} ${tip.y + u.y * w2}L${tip.x - u.x * w2} ${tip.y - u.y * w2}Z`} fill={col} /></g>;
    };
    if (s.mode === 'elevation') {
      // An elevation: one arrow in the middle, pointing at the building, with its name behind it.
      const m = v2((a.x + b.x) / 2, (a.y + b.y) / 2);
      // The name sits behind the arrow's tail, far enough that a long name on a vertical line does not cross it.
      const fs = 2.6, tw = s.label.length * fs * 0.55;
      const back = 1.5 + Math.abs(nn.x) * tw / 2 + Math.abs(nn.y) * fs * 0.7;
      nodes.push(
        <g key={`sec${s.id}`} data-el={s.id}>
          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={col} strokeWidth={pw(0.2)} strokeDasharray={`${pw(1)} ${pw(1)}`} />
          {arrow(m, 'a1')}
          <text x={m.x - nn.x * pw(back)} y={m.y - nn.y * pw(back)} fontSize={pw(fs)} fontWeight={700} textAnchor="middle" dominantBaseline="middle" fill={col} fontFamily="Rubik, Arial, sans-serif" direction="rtl">{s.label}</text>
        </g>,
      );
      continue;
    }
    nodes.push(
      <g key={`sec${s.id}`} data-el={s.id}>
        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={col} strokeWidth={pw(0.3)} strokeDasharray={`${pw(6)} ${pw(1.5)} ${pw(1)} ${pw(1.5)}`} />
        {arrow(a, 'a1')}{arrow(b, 'a2')}
        <text x={a.x - u.x * pw(2.5)} y={a.y - u.y * pw(2.5)} fontSize={pw(3.4)} fontWeight={700} textAnchor="middle" dominantBaseline="middle" fill={col} fontFamily="Rubik, Arial, sans-serif">{s.label}</text>
        <text x={b.x + u.x * pw(2.5)} y={b.y + u.y * pw(2.5)} fontSize={pw(3.4)} fontWeight={700} textAnchor="middle" dominantBaseline="middle" fill={col} fontFamily="Rubik, Arial, sans-serif">{s.label}</text>
      </g>,
    );
  }
  return <g>{nodes}</g>;
}

/** World box of a level's drawing (walls, rooms, furniture, slabs, roofs, annotations, lot). */
export function levelBox(dd: BuildingData, m: BuildingModel, levelId: string, withSections = false): Box {
  let b = emptyBox();
  const lm = m.levels.find((l) => l.level.id === levelId);
  if (!lm) return b;
  for (const wm of lm.walls) for (const p of wm.outline) b = addPt(b, p);
  for (const f of dd.furniture.filter((x) => x.levelId === levelId)) for (const p of furnitureOutline(f)) b = addPt(b, p);
  for (const s of dd.slabs.filter((x) => x.levelId === levelId)) for (const p of s.pts) b = addPt(b, p);
  for (const r of lm.roofs) for (const p of r.g.outline) b = addPt(b, p);
  for (const s of lm.stairs) for (const p of s.g.outline) b = addPt(b, p);
  for (const a of dd.annotations.filter((x) => x.levelId === levelId)) { if (a.type === 'dim') { b = addPt(b, a.a, Math.abs(a.offset) + 300); b = addPt(b, a.b, Math.abs(a.offset) + 300); } else b = addPt(b, a.p, 500); }
  for (const r of dd.rooms.filter((x) => x.levelId === levelId)) b = addPt(b, r.seed);
  if (withSections) for (const s of dd.sections) { b = addPt(b, s.a, 800); b = addPt(b, s.b, 800); }
  return b;
}

/** World box of the whole building, all levels. */
export function buildingBox(dd: BuildingData, m: BuildingModel): Box {
  let b = emptyBox();
  for (const l of dd.levels) { const lb = levelBox(dd, m, l.id); if (Number.isFinite(lb.minX)) { b = addPt(b, v2(lb.minX, lb.minY)); b = addPt(b, v2(lb.maxX, lb.maxY)); } }
  for (const p of dd.lot) b = addPt(b, p);
  return b;
}

/** Laying pattern of a 4.0 floor finish inside a polygon: tile joints or plank rows, turned by the laying angle. */
export function floorPattern(f: FloorFinish, poly: Vec2[], ctx: ViewCtx, key: string): ReactNode {
  const r = resolveFinish(f);
  const sp = r.spec;
  const kind = sp.pattern;
  const isPlank = kind === 'plank';
  const isTile = kind === 'tile' || kind === 'stone' || kind === 'brick' || kind === 'marble' || kind === 'terrazzo' || kind === 'hex';
  if (!isPlank && !isTile) return null;
  const tw = Math.max(50, sp.tw), th = Math.max(30, sp.th);
  // Lines in the finish's own frame (x along the planks), clipped to the polygon's box.
  const a = (r.angle * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
  const loc = poly.map((p) => v2(p.x * ca + p.y * sa, -p.x * sa + p.y * ca));
  const xs = loc.map((p) => p.x), ys = loc.map((p) => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const segs: [number, number, number, number][] = [];
  const herring = isPlank && (sp.layout === 'herringbone' || sp.layout === 'chevron' || sp.layout === 'basket');
  if ((x1 - x0) / tw * ((y1 - y0) / th) > 6000) return null; // too fine to draw at this size
  if (herring) {
    // Diagonal rows: a simple, honest sketch of the herringbone / chevron layout.
    const step = th * Math.SQRT2;
    for (let c = Math.floor((x0 - (y1 - y0)) / step) * step; c < x1 + (y1 - y0); c += step) { segs.push([c, y0, c + (y1 - y0), y1]); }
    for (let row = Math.floor(y0 / tw) * tw; row < y1; row += tw) segs.push([x0, row, x1, row]);
  } else {
    const rowH = isPlank ? th : th, colW = tw;
    const shift = sp.layout === 'offset' || sp.layout === 'staggered' ? 0.5 : isPlank && sp.layout !== 'stack' && sp.layout !== 'grid' ? 0.33 : 0;
    let i = Math.floor(y0 / rowH);
    for (let y = i * rowH; y < y1; y += rowH, i++) {
      segs.push([x0, y, x1, y]);
      const off = ((i * shift) % 1) * colW;
      for (let x = Math.floor((x0 - off) / colW) * colW + off; x < x1; x += colW) if (x > x0) segs.push([x, y, x, y + rowH]);
    }
  }
  const back = (x: number, y: number) => ctx.T(v2(x * ca - y * sa, x * sa + y * ca));
  const id = `clip-${key}`;
  const path = segs.map(([ax, ay, bx, by]) => { const p = back(ax, ay), q = back(bx, by); return `M${p.x.toFixed(1)} ${p.y.toFixed(1)}L${q.x.toFixed(1)} ${q.y.toFixed(1)}`; }).join('');
  return (
    <g key={key} pointerEvents="none">
      <clipPath id={id}><path d={d(poly, ctx)} /></clipPath>
      <path d={path} clipPath={`url(#${id})`} fill="none" stroke={darker(sp.grout && sp.groutW > 0 ? sp.grout : sp.color, 0.35)} strokeWidth={0.08 * ctx.pu} strokeOpacity={0.8} />
    </g>
  );
}

/** A darker shade of a colour (k 0 … 1). */
function darker(hex: string, k: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return '#555555';
  const n = parseInt(m[1], 16);
  const f = (v: number) => Math.round(v * (1 - k));
  return `#${((1 << 24) | (f((n >> 16) & 255) << 16) | (f((n >> 8) & 255) << 8) | f(n & 255)).toString(16).slice(1)}`;
}

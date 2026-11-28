// Site plan drawing (SVG). Used by the editor, the thumbnails, the print sheet and the submission sheets.
// Furniture and built objects are drawn as the top view of their actual solids, so the plan always shows
// the real parametric geometry (stairs show their treads, pergolas their beams).

import { cloneElement, type ReactElement, type ReactNode, type SVGProps } from 'react';
import { type Vec2, v2 } from '../../geometry/vec';
import { Dimension } from '../../drawing/dimension';
import { addPt, emptyBox, type Box, type ViewCtx } from '../../drawing/viewport';
import type { SiteData, SiteElement, SiteSection } from '../types';
import { lib, prm } from '../library';
import { centroid, insetPolygon, localToWorld, polyArea, rotatePt, sub, norm, perpL, mul, add } from '../poly';
import { elementOutline, elementPath, pointSize } from '../outline';
import type { SiteModel } from '../section';
import type { Contour, TerrainModel } from '../terrain';
import { fmtArea, fmtLevel, mToStr } from '../units';
import type { Prim } from '../prims';
import { isRich } from '../../materials/finish';
import { floorPattern } from '../../building/render/plan';
import type { FloorFinish } from '../../building/types';

export const SELECT_COLOR = '#e8590c';

/** Colour for print: in black-and-white mode, a light grey of the same brightness. */
export function tone(hex: string, bw: boolean, lighten = 0): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (bw) { const l = Math.round(0.3 * r + 0.59 * g + 0.11 * b); r = g = b = l; }
  if (lighten) { r = Math.round(r + (255 - r) * lighten); g = Math.round(g + (255 - g) * lighten); b = Math.round(b + (255 - b) * lighten); }
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}
const darker = (hex: string, bw: boolean) => {
  const t = tone(hex, bw);
  const n = parseInt(t.slice(1), 16);
  const f = (v: number) => Math.round(v * 0.55);
  return `#${((1 << 24) | (f((n >> 16) & 255) << 16) | (f((n >> 8) & 255) << 8) | f(n & 255)).toString(16).slice(1)}`;
};

const pathD = (pts: Vec2[], ctx: ViewCtx, closed: boolean) => {
  if (!pts.length) return '';
  const s = pts.map((p) => ctx.T(p));
  return `M${s.map((q) => `${q.x.toFixed(2)} ${q.y.toFixed(2)}`).join('L')}${closed ? 'Z' : ''}`;
};

function Txt({ p, ctx, size, children, color = '#222', bold = false, anchor = 'middle', bg = false }: { p: Vec2; ctx: ViewCtx; size: number; children: ReactNode; color?: string; bold?: boolean; anchor?: 'middle' | 'start' | 'end'; bg?: boolean }) {
  const q = ctx.T(p);
  const props = { x: q.x, y: q.y, fontSize: size * ctx.pu, textAnchor: anchor, dominantBaseline: 'middle', direction: 'rtl', fontFamily: 'Rubik, Arial, sans-serif', fontWeight: bold ? 700 : 400, style: { pointerEvents: 'none' } } as const;
  const t = <text {...props} fill={color}>{children}</text>;
  return bg ? <Halo width={size * ctx.pu * 0.28} text={t} /> : t;
}

/**
 * White outline behind a text, so it reads over the drawing. Drawn as a separate text under the real one
 * (not with paint-order), because the PDF export does not support paint-order.
 */
export function Halo({ text, width }: { text: ReactElement<SVGProps<SVGTextElement>>; width: number }) {
  return <g>{cloneElement(text, { fill: '#fff', stroke: '#fff', strokeWidth: width, strokeLinejoin: 'round' })}{text}</g>;
}

/** Top view of an element's solids (furniture, structures). */
function primsTopView(prims: Prim[], ctx: ViewCtx, bw: boolean, key: string): ReactNode {
  const w = 0.18 * ctx.pu;
  return prims.map((pr, i) => {
    const stroke = darker(pr.color, bw);
    if (pr.t === 'prism') return <path key={`${key}-${i}`} d={pathD(pr.poly, ctx, true)} fill={tone(pr.color, bw, 0.35)} stroke={stroke} strokeWidth={w} />;
    const c = ctx.T(pr.c);
    return <circle key={`${key}-${i}`} cx={c.x} cy={c.y} r={pr.r * ctx.k} fill={pr.role === 'void' ? 'none' : tone(pr.color, bw, 0.35)} stroke={stroke} strokeWidth={w} />;
  });
}

function treeSymbol(e: SiteElement, ctx: ViewCtx, bw: boolean): ReactNode {
  if (e.geom.type !== 'point') return null;
  const c = ctx.T(e.geom.p);
  const r = (prm(e, 'dia') / 2) * ctx.k;
  const fill = tone(e.color, bw, 0.45), stroke = darker(e.color, bw);
  const w = 0.18 * ctx.pu;
  const lines: ReactNode[] = [];
  const n = e.kind === 'palm' ? 10 : e.kind === 'tree-conifer' ? 12 : 7;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.3;
    const r0 = e.kind === 'tree-round' ? r * 0.55 : e.kind === 'palm' ? r * 0.08 : 0;
    const r1 = e.kind === 'tree-round' ? r * 0.85 : r * 0.98;
    lines.push(<line key={i} x1={c.x + r0 * Math.cos(a)} y1={c.y + r0 * Math.sin(a)} x2={c.x + r1 * Math.cos(a)} y2={c.y + r1 * Math.sin(a)} stroke={stroke} strokeWidth={w * 0.8} />);
  }
  return (
    <g>
      <circle cx={c.x} cy={c.y} r={r} fill={fill} fillOpacity={e.kind === 'palm' ? 0.55 : 0.75} stroke={stroke} strokeWidth={w * 1.4} />
      {(e.kind === 'tree-columnar') && <circle cx={c.x} cy={c.y} r={r * 0.6} fill="none" stroke={stroke} strokeWidth={w} />}
      {lines}
      <circle cx={c.x} cy={c.y} r={Math.max((prm(e, 'trunkD') / 2) * ctx.k, 0.4 * ctx.pu)} fill={stroke} />
    </g>
  );
}

function arrow(from: Vec2, to: Vec2, ctx: ViewCtx, color: string, key: string): ReactNode {
  const a = ctx.T(from), b = ctx.T(to);
  const d = norm(sub(b, a)), n = perpL(d);
  const h = 2.2 * ctx.pu;
  const tip = b, l = add(sub(b, mul(d, h)), mul(n, h * 0.45)), r = sub(sub(b, mul(d, h)), mul(n, h * 0.45));
  return (
    <g key={key}>
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth={0.25 * ctx.pu} />
      <path d={`M${tip.x} ${tip.y}L${l.x} ${l.y}L${r.x} ${r.y}Z`} fill={color} />
    </g>
  );
}

export interface PlanOpts {
  selected?: Set<string>;
  contours?: Contour[] | null;
  showPoints?: boolean;
  showSections?: boolean;
  /** Labels with areas of zones. */
  areaLabels?: boolean;
  /** Hide elements on hidden layers (default true). */
  hiddenLayers?: Set<string>;
  dimText?: (mm: number) => string;
  /** Topography view: elements that do not shape the ground are drawn faded, and contours stronger. */
  fade?: boolean;
}

const TOPO_KINDS = new Set(['lot', 'terrace', 'wall', 'stairs', 'ramp', 'dim', 'pond']);

const ORDER: Record<string, number> = {
  zone: 0, terrace: 1, lawn: 2, planting: 2, gravel: 3, plaza: 3, seating: 3, sport: 3, path: 4, pond: 5, bed: 6, deck: 6,
  building: 7, wall: 8, fence: 8, hedge: 8, lot: 20, dim: 30, text: 31,
};
const orderOf = (e: SiteElement) => ORDER[e.kind] ?? (lib(e.kind).category === 'plants' ? 15 : 10);

export function renderSitePlan(d: SiteData, model: SiteModel, ctx: ViewCtx, opts: PlanOpts = {}): ReactNode {
  const bw = ctx.bw;
  const sel = opts.selected ?? new Set<string>();
  const solidsById = new Map(model.items.map((it) => [it.e.id, it.s]));
  const visible = model.items.map((it) => it.e).sort((a, b) => orderOf(a) - orderOf(b));
  const lw = (mm: number) => mm * ctx.pu;
  const out: ReactNode[] = [];
  const labels: ReactNode[] = [];
  const contourLayer: ReactNode[] = [];

  if (opts.contours) {
    opts.contours.forEach((c, ci) => {
      const major = Math.abs(Math.round(c.level / (d.terrain.contourStep * 4)) * d.terrain.contourStep * 4 - c.level) < 1e-6;
      c.lines.forEach((ln, li) => {
        contourLayer.push(<path key={`c${ci}-${li}`} d={pathD(ln, ctx, false)} fill="none" stroke={bw ? '#777' : '#a0703c'} strokeWidth={lw(opts.fade ? (major ? 0.35 : 0.2) : major ? 0.25 : 0.13)} strokeOpacity={0.9} />);
      });
      const longest = c.lines.reduce((best, ln) => (ln.length > best.length ? ln : best), [] as Vec2[]);
      if (longest.length > 6) {
        const mid = longest[Math.floor(longest.length / 2)];
        contourLayer.push(<Txt key={`cl${ci}`} p={mid} ctx={ctx} size={2} color={bw ? '#555' : '#8a5a28'} bg>{mToStr(c.level, 2)}</Txt>);
      }
    });
  }

  let contoursDrawn = false;
  for (const e of visible) {
    const order = orderOf(e);
    if (!contoursDrawn && order >= 5) { out.push(<g key="contours">{contourLayer}</g>); contoursDrawn = true; }
    const L = lib(e.kind);
    const g = e.geom;
    const key = e.id;
    const fill = tone(e.color, bw, 0.25);
    const stroke = darker(e.color, bw);
    let node: ReactNode = null;
    if (e.kind === 'lot' && g.type === 'area') {
      node = <path d={pathD(elementOutline(e), ctx, true)} fill="none" stroke="#1b2230" strokeWidth={lw(0.6)} strokeDasharray={`${lw(6)} ${lw(1.2)} ${lw(1)} ${lw(1.2)}`} />;
    } else if (e.kind === 'zone' && g.type === 'area') {
      const pts = elementOutline(e);
      node = <path d={pathD(pts, ctx, true)} fill={bw ? 'none' : '#7a4fb0'} fillOpacity={0.05} stroke={bw ? '#444' : '#7a4fb0'} strokeWidth={lw(0.3)} strokeDasharray={`${lw(2)} ${lw(1)}`} />;
      labels.push(<Txt key={`zl${key}`} p={centroid(pts)} ctx={ctx} size={2.8} color={bw ? '#222' : '#5a3590'} bold bg>{e.name || 'אזור'}</Txt>);
      if (opts.areaLabels !== false) labels.push(<Txt key={`za${key}`} p={v2(centroid(pts).x, centroid(pts).y - 4 * ctx.pu / ctx.k)} ctx={ctx} size={2.2} color={bw ? '#333' : '#5a3590'} bg>{fmtArea(polyArea(pts))}</Txt>);
    } else if (g.type === 'area' && (L.surface || e.kind === 'pond' || e.kind === 'pool' || e.kind === 'pool-kids' || e.kind === 'deck' || e.kind === 'bed' || e.kind === 'terrace')) {
      const pts = elementOutline(e);
      const water = e.kind === 'pond' || e.kind === 'pool' || e.kind === 'pool-kids';
      node = (
        <g>
          <path d={pathD(pts, ctx, true)} fill={water && e.kind !== 'pond' ? tone('#d8d2c4', bw, 0.2) : fill} stroke={stroke} strokeWidth={lw(water ? 0.4 : 0.2)} />
          {L.surface && !bw && isRich(e.finish) && floorPattern(e.finish as FloorFinish, pts, ctx, `sp${e.id}`)}
          {water && <path d={pathD(insetPolygon(pts, e.kind === 'pond' ? 150 : 300), ctx, true)} fill={tone(e.color, bw, 0.1)} stroke={stroke} strokeWidth={lw(0.15)} />}
          {e.kind === 'bed' && <path d={pathD(insetPolygon(pts, 120), ctx, true)} fill="none" stroke={stroke} strokeWidth={lw(0.15)} />}
          {e.kind === 'sport' && polyArea(pts) > 4e6 && <path d={pathD(insetPolygon(pts, 1000), ctx, true)} fill="none" stroke="#fff" strokeWidth={lw(0.3)} />}
        </g>
      );
      if (e.kind === 'terrace') labels.push(<Txt key={`tl${key}`} p={centroid(pts)} ctx={ctx} size={2.4} color="#333" bg>{e.name ? `${e.name} ${fmtLevel(prm(e, 'level'))}` : fmtLevel(prm(e, 'level'))}</Txt>);
    } else if (e.kind === 'building' && g.type === 'area') {
      const pts = elementOutline(e);
      const inner = insetPolygon(pts, prm(e, 'wall'));
      node = (
        <g>
          <path d={`${pathD(pts, ctx, true)}${pathD([...inner].reverse(), ctx, true)}`} fill={bw ? '#444' : darker(e.color, false)} fillRule="evenodd" stroke="#111" strokeWidth={lw(0.5)} />
          <path d={pathD(inner, ctx, true)} fill={tone(e.color, bw, 0.4)} stroke="#111" strokeWidth={lw(0.25)} />
        </g>
      );
    } else if (g.type === 'line' && e.kind === 'path-stepping') {
      const s = solidsById.get(e.id);
      node = <g>{s && primsTopView(s.prims, ctx, bw, key)}</g>;
    } else if (g.type === 'line' && e.kind === 'path') {
      node = <path d={pathD(elementOutline(e), ctx, true)} fill={fill} stroke={stroke} strokeWidth={lw(0.25)} />;
    } else if (g.type === 'line') {
      const outline = elementOutline(e);
      if (e.kind === 'fence') {
        node = <path d={pathD(elementPath(e), ctx, false)} fill="none" stroke={stroke} strokeWidth={lw(0.35)} strokeDasharray={`${lw(3)} ${lw(0.8)}`} />;
      } else node = <path d={pathD(outline, ctx, true)} fill={e.kind === 'wall' ? (bw ? '#555' : darker(e.color, false)) : tone(e.color, bw, 0.3)} stroke={e.kind === 'wall' ? '#111' : stroke} strokeWidth={lw(e.kind === 'wall' ? 0.35 : 0.2)} />;
    } else if (g.type === 'point' && L.symbol === 'tree') {
      node = treeSymbol(e, ctx, bw);
    } else if (g.type === 'point' && L.symbol === 'shrub') {
      const c = ctx.T(g.p);
      const r = (prm(e, 'dia') / 2) * ctx.k;
      node = (
        <g>
          <circle cx={c.x} cy={c.y} r={r} fill={tone(e.color, bw, e.kind === 'flowers' ? 0.5 : 0.3)} stroke={stroke} strokeWidth={lw(0.2)} strokeDasharray={e.kind === 'shrub' ? `${lw(0.9)} ${lw(0.4)}` : undefined} />
          {(e.kind === 'flowers' || e.kind === 'shrub-oleander' || e.kind === 'shrub-lavender') && [0, 1, 2, 3, 4].map((i) => <circle key={i} cx={c.x + r * 0.5 * Math.cos(i * 1.256)} cy={c.y + r * 0.5 * Math.sin(i * 1.256)} r={r * 0.18} fill={bw ? '#999' : e.kind === 'shrub-lavender' ? '#9a8cc4' : '#e46f8f'} />)}
          {(e.kind === 'agave' || e.kind === 'grass-ornamental') && [0, 1, 2, 3, 4, 5].map((i) => <line key={i} x1={c.x} y1={c.y} x2={c.x + r * Math.cos(i * 1.047)} y2={c.y + r * Math.sin(i * 1.047)} stroke={stroke} strokeWidth={lw(0.15)} />)}
        </g>
      );
    } else if (e.kind === 'text' && g.type === 'point') {
      node = <Txt p={g.p} ctx={ctx} size={prm(e, 'size')} color="#111">{e.name || 'טקסט'}</Txt>;
    } else if (g.type === 'dim') {
      node = <Dimension a={g.a} b={g.b} offset={g.offset} ctx={ctx} color="#111" width={0.18} text={(opts.dimText ?? ((mm) => mToStr(mm, 2)))(Math.hypot(g.b.x - g.a.x, g.b.y - g.a.y))} />;
    } else if (g.type === 'point') {
      const s = solidsById.get(e.id);
      node = <g>{s && primsTopView(s.prims, ctx, bw, key)}</g>;
      if (e.kind === 'stairs' || e.kind === 'ramp') {
        const dd = prm(e, 'd');
        const a = localToWorld(g.p, g.rot, v2(0, -dd / 2 + dd * 0.08)), b = localToWorld(g.p, g.rot, v2(0, dd / 2 - dd * 0.08));
        node = <g>{node}{arrow(a, b, ctx, '#111', `ar${key}`)}</g>;
        if (e.kind === 'ramp') {
          const slope = prm(e, 'd') > 0 ? (prm(e, 'rise') / prm(e, 'd')) * 100 : 0;
          labels.push(<Txt key={`rl${key}`} p={localToWorld(g.p, g.rot, v2(pointSize(e).w * 0.3, 0))} ctx={ctx} size={2} color="#222" bg>{`${slope.toFixed(1)}%`}</Txt>);
        }
      }
    }
    out.push(<g key={key} data-el={e.id} opacity={opts.fade && !TOPO_KINDS.has(e.kind) ? 0.35 : undefined}>{node}</g>);
    if (e.name && e.kind !== 'zone' && e.kind !== 'text' && e.kind !== 'terrace') {
      const c = g.type === 'point' ? g.p : g.type === 'dim' ? g.a : centroid(elementPath(e));
      labels.push(<Txt key={`nl${key}`} p={c} ctx={ctx} size={2.4} color="#111" bg>{e.name}</Txt>);
    }
  }
  if (!contoursDrawn) out.push(<g key="contours">{contourLayer}</g>);

  // Selection outlines on top.
  const selNodes: ReactNode[] = [];
  if (ctx.screen) for (const e of visible) if (sel.has(e.id)) {
    const g = e.geom;
    if (g.type === 'dim') { const a = ctx.T(g.a), b = ctx.T(g.b); selNodes.push(<line key={`s${e.id}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={SELECT_COLOR} strokeWidth={3} />); continue; }
    const pts = e.kind === 'text' ? elementOutline(e) : elementOutline(e);
    const closed = !(g.type === 'line' && prm(e, 'width') <= 0);
    selNodes.push(<path key={`s${e.id}`} d={pathD(pts, ctx, closed)} fill="none" stroke={SELECT_COLOR} strokeWidth={2.5} strokeDasharray="7 4" />);
  }

  return <g>{out}{labels}{opts.showPoints && renderHeightPoints(d, model.terrain, ctx)}{opts.showSections && renderSectionMarks(d.sections, ctx)}{selNodes}</g>;
}

export function renderHeightPoints(d: SiteData, t: TerrainModel, ctx: ViewCtx, selected?: string | null): ReactNode {
  void t;
  return (
    <g>
      {d.terrain.points.map((hp) => {
        const q = ctx.T(hp.p);
        const s = 1.2 * ctx.pu;
        const col = hp.id === selected ? SELECT_COLOR : '#0b5e8a';
        return (
          <g key={hp.id} data-hp={hp.id}>
            {hp.source === 'survey'
              ? <path d={`M${q.x} ${q.y - s}L${q.x + s} ${q.y + s * 0.7}L${q.x - s} ${q.y + s * 0.7}Z`} fill={col} />
              : <circle cx={q.x} cy={q.y} r={s * 0.8} fill="#fff" stroke={col} strokeWidth={0.3 * ctx.pu} />}
            <Halo width={0.6 * ctx.pu} text={<text x={q.x + s * 1.3} y={q.y - s * 0.4} fontSize={2.2 * ctx.pu} fill={col} fontFamily="Rubik, Arial, sans-serif" direction="ltr">{fmtLevel(hp.z)}</text>} />
          </g>
        );
      })}
      {d.terrain.mounds.map((m) => {
        const q = ctx.T(m.c);
        return (
          <g key={m.id} data-mound={m.id}>
            <circle cx={q.x} cy={q.y} r={m.r * ctx.k} fill="none" stroke={m.h >= 0 ? '#8a5a28' : '#2f6f9f'} strokeWidth={0.25 * ctx.pu} strokeDasharray={`${ctx.pu * 1.5} ${ctx.pu}`} />
            <text x={q.x} y={q.y} fontSize={2.2 * ctx.pu} textAnchor="middle" dominantBaseline="middle" fill={m.h >= 0 ? '#8a5a28' : '#2f6f9f'} fontFamily="Rubik, Arial, sans-serif" direction="rtl">{m.h >= 0 ? 'גבעה' : 'שקע'} {m.h >= 0 ? '+' : '-'}{mToStr(Math.abs(m.h), 2)}</text>
          </g>
        );
      })}
    </g>
  );
}

/** Section lines in the plan: chain line, arrows towards the viewing direction, and letters. */
export function renderSectionMarks(list: SiteSection[], ctx: ViewCtx, highlight?: string | null): ReactNode {
  return list.map((s) => {
    const a = ctx.T(s.a), b = ctx.T(s.b);
    const u = norm(sub(s.b, s.a));
    const n = mul(perpL(u), s.side);
    const col = s.id === highlight ? SELECT_COLOR : s.mode === 'elevation' ? '#555' : '#c2410c';
    const arrowLen = 5 * ctx.pu / ctx.k;
    const ends = [s.a, s.b].map((p, i) => {
      const tip = add(p, mul(n, arrowLen));
      const P = ctx.T(p), Tt = ctx.T(tip);
      const lab = ctx.T(add(add(p, mul(n, arrowLen * 1.6)), mul(u, (i === 0 ? -1 : 1) * arrowLen * 0.4)));
      const dd = norm(sub(Tt, P)), nn = perpL(dd), h = 1.6 * ctx.pu;
      return (
        <g key={i}>
          <line x1={P.x} y1={P.y} x2={Tt.x} y2={Tt.y} stroke={col} strokeWidth={0.5 * ctx.pu} />
          <path d={`M${Tt.x} ${Tt.y}L${Tt.x - dd.x * h + nn.x * h * 0.5} ${Tt.y - dd.y * h + nn.y * h * 0.5}L${Tt.x - dd.x * h - nn.x * h * 0.5} ${Tt.y - dd.y * h - nn.y * h * 0.5}Z`} fill={col} />
          <Halo width={0.8 * ctx.pu} text={<text x={lab.x} y={lab.y} fontSize={3.6 * ctx.pu} fontWeight={700} textAnchor="middle" dominantBaseline="middle" fill={col} fontFamily="Rubik, Arial, sans-serif">{s.label}</text>} />
        </g>
      );
    });
    return (
      <g key={s.id} data-sec={s.id}>
        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={col} strokeWidth={0.35 * ctx.pu} strokeDasharray={`${ctx.pu * 6} ${ctx.pu * 1.2} ${ctx.pu} ${ctx.pu * 1.2}`} />
        {ends}
      </g>
    );
  });
}

/** World box of the site drawing (all visible elements, height points and sections). */
export function sitePlanBox(d: SiteData, model: SiteModel, withSections = true): Box {
  let b = emptyBox();
  for (const { e } of model.items) for (const p of elementOutline(e)) b = addPt(b, p);
  for (const hp of d.terrain.points) b = addPt(b, hp.p);
  for (const m of d.terrain.mounds) { b = addPt(b, v2(m.c.x - m.r, m.c.y - m.r)); b = addPt(b, v2(m.c.x + m.r, m.c.y + m.r)); }
  if (withSections) for (const s of d.sections) { b = addPt(b, s.a); b = addPt(b, s.b); }
  return b;
}

/** North arrow symbol, centred at (x, y) in SVG units, size = diameter. */
export function NorthArrow({ x, y, size, angle, pu = 1 }: { x: number; y: number; size: number; angle: number; pu?: number }) {
  const r = size / 2;
  const tip = rotatePt(v2(0, -r), -angle), l = rotatePt(v2(-r * 0.38, r * 0.55), -angle), rr = rotatePt(v2(r * 0.38, r * 0.55), -angle), mid = rotatePt(v2(0, r * 0.25), -angle);
  const lab = rotatePt(v2(0, -r - 3.2 * pu), -angle);
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill="none" stroke="#111" strokeWidth={0.3 * pu} />
      <path d={`M${x + tip.x} ${y + tip.y}L${x + rr.x} ${y + rr.y}L${x + mid.x} ${y + mid.y}Z`} fill="#111" />
      <path d={`M${x + tip.x} ${y + tip.y}L${x + l.x} ${y + l.y}L${x + mid.x} ${y + mid.y}Z`} fill="#fff" stroke="#111" strokeWidth={0.25 * pu} />
      <text x={x + lab.x} y={y + lab.y} fontSize={3.4 * pu} fontWeight={700} textAnchor="middle" dominantBaseline="middle" fontFamily="Rubik, Arial, sans-serif">N</text>
    </g>
  );
}

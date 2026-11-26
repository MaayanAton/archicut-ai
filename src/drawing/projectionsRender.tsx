import type { ReactNode } from 'react';
import {
  axonometric, epureConstructions, epurePoint, projectOnPi1, projectOnPi2, projectOnPi3, type SpacePoint,
} from '../geometry/projection';
import { type Vec2, type Vec3, v2, v3 } from '../geometry/vec';
import type { ProjectionsData } from '../document/types';
import { addPt, emptyBox, type Box, type ViewCtx } from './viewport';

const has = (n: number | null): n is number => typeof n === 'number' && Number.isFinite(n);

/** Extents of the projection planes, from the points (never smaller than 60 mm). */
export function planeExtents(points: SpacePoint[]) {
  const xs = points.map((p) => p.x).filter(has);
  const ys = points.map((p) => p.y).filter(has);
  const zs = points.map((p) => p.z).filter(has);
  const m = 15;
  return {
    L: Math.max(60, ...xs.map((x) => x + m)),
    xMin: Math.min(0, ...xs.map((x) => x - m)),
    yMax: Math.max(40, ...ys.map((y) => y + m)),
    yMin: Math.min(0, ...ys.map((y) => (y < 0 ? y - m : 0))),
    zMax: Math.max(40, ...zs.map((z) => z + m)),
    zMin: Math.min(0, ...zs.map((z) => (z < 0 ? z - m : 0))),
  };
}

export interface Colors { point: string; proj: string; constr: string; plane: string; planeFill: string; text: string; sel: string }
export const colors = (bw: boolean): Colors =>
  bw
    ? { point: '#000', proj: '#000', constr: '#000', plane: '#000', planeFill: 'none', text: '#000', sel: '#000' }
    : { point: '#1f4fa8', proj: '#c2410c', constr: '#8a8f99', plane: '#5b6170', planeFill: 'rgba(31,79,168,0.05)', text: '#1b2230', sel: '#e8590c' };

/** Label like A₁ drawn as "A" + smaller "1". */
export function Label({ at, name, sub, ctx, color, dx = 1.2, dy = -1.2, anchor = 'start' }: { at: Vec2; name: string; sub?: string; ctx: ViewCtx; color: string; dx?: number; dy?: number; anchor?: 'start' | 'end' | 'middle' }) {
  const fs = 3.2 * ctx.pu;
  return (
    <text x={at.x + dx * ctx.pu} y={at.y + dy * ctx.pu} fontSize={fs} fill={color} fontFamily="Rubik, Arial, sans-serif" direction="ltr" textAnchor={anchor} style={{ pointerEvents: 'none' }}>
      {name}
      {sub && <tspan fontSize={fs * 0.68} dy={fs * 0.28}>{sub}</tspan>}
    </text>
  );
}

function Cross({ at, ctx, color, size = 1.3, w = 0.3 }: { at: Vec2; ctx: ViewCtx; color: string; size?: number; w?: number }) {
  const s = size * ctx.pu;
  return (
    <g stroke={color} strokeWidth={w * ctx.pu} strokeLinecap="round">
      <line x1={at.x - s} y1={at.y - s} x2={at.x + s} y2={at.y + s} />
      <line x1={at.x - s} y1={at.y + s} x2={at.x + s} y2={at.y - s} />
    </g>
  );
}

function Dot({ at, ctx, color, r = 0.9 }: { at: Vec2; ctx: ViewCtx; color: string; r?: number }) {
  return <circle cx={at.x} cy={at.y} r={r * ctx.pu} fill={color} />;
}

const line = (a: Vec2, b: Vec2, stroke: string, width: number, dash?: string, key?: string) => (
  <line key={key} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={stroke} strokeWidth={width} strokeDasharray={dash} strokeLinecap="round" />
);

// ---------------------------------------------------------------------------
// Epure (spread-out two/three plane system)

export function epureWorldBox(d: ProjectionsData): Box {
  const e = planeExtents(d.points);
  const s = d.epure;
  const sx = s.sideRight ? -1 : 1;
  let b = emptyBox();
  b = addPt(b, v2(sx * e.L, 0));
  b = addPt(b, v2(sx * e.xMin, 0));
  b = addPt(b, v2(0, e.zMax));
  b = addPt(b, v2(0, -e.yMax));
  b = addPt(b, v2(0, e.zMin));
  b = addPt(b, v2(0, -e.yMin));
  if (s.showP3) {
    b = addPt(b, v2(-sx * e.yMax, 0));
    b = addPt(b, v2(-sx * e.yMin, 0));
  }
  return b;
}

export function renderEpure(d: ProjectionsData, ctx: ViewCtx, opts: { selectedId?: string | null; draggable?: boolean } = {}): ReactNode {
  const c = colors(ctx.bw);
  const e = planeExtents(d.points);
  const s = d.epure;
  const sx = s.sideRight ? -1 : 1;
  const T = ctx.T;
  const pu = ctx.pu;
  const out: ReactNode[] = [];

  // Ground line 1/2 and the axes of the side plane.
  const gl0 = T(v2(sx * e.L, 0));
  const gl1 = T(v2(s.showP3 ? -sx * e.yMax : sx * e.xMin, 0));
  out.push(line(gl0, gl1, c.plane, 0.5 * pu, undefined, 'gl'));
  out.push(<Label key="l2" at={gl0} name="2" ctx={ctx} color={c.text} dx={s.sideRight ? 1 : -3} dy={-1.4} />);
  out.push(<Label key="l1" at={gl0} name="1" ctx={ctx} color={c.text} dx={s.sideRight ? 1 : -3} dy={4.2} />);
  if (s.showP3) {
    const top = T(v2(0, e.zMax)), bottom = T(v2(0, -e.yMax));
    out.push(line(top, bottom, c.plane, 0.35 * pu, undefined, 'ax3'));
    out.push(<Label key="o" at={T(v2(0, 0))} name="O" ctx={ctx} color={c.text} dx={s.sideRight ? -3.6 : 1} dy={4} />);
    out.push(<Label key="l3a" at={T(v2(-sx * e.yMax, 0))} name="3" ctx={ctx} color={c.text} dx={s.sideRight ? -3 : 1} dy={-1.4} />);
    out.push(<Label key="l1b" at={T(v2(-sx * e.yMax, 0))} name="1" ctx={ctx} color={c.text} dx={s.sideRight ? -3 : 1} dy={4.2} />);
    if (s.transfer === 'line45') {
      const m = Math.max(e.yMax, -e.yMin);
      out.push(line(T(v2(0, 0)), T(v2(-sx * e.yMax, -e.yMax)), c.constr, 0.25 * pu, `${1.5 * pu} ${1 * pu}`, '45'));
      if (e.yMin < 0) out.push(line(T(v2(0, 0)), T(v2(-sx * e.yMin, -e.yMin)), c.constr, 0.25 * pu, `${1.5 * pu} ${1 * pu}`, '45b'));
      void m;
    }
  }

  d.points.forEach((p) => {
    const ep = epurePoint(p, s);
    const sel = opts.selectedId === p.id;
    const pc = sel ? c.sel : c.proj;
    if (d.showConstruction) {
      epureConstructions(p, s).forEach((k, i) => {
        if (k.kind === 'line') {
          out.push(line(T(k.a), T(k.b), c.constr, 0.2 * pu, k.role === 'transfer' ? `${1.2 * pu} ${0.9 * pu}` : `${2 * pu} ${1 * pu}`, `${p.id}-c${i}`));
        } else {
          const a = T(k.from), b = T(k.to), r = k.r * ctx.k;
          // Sweep direction depends on which side pi3 is drawn.
          const sweep = s.sideRight ? (k.from.y < 0 ? 0 : 1) : (k.from.y < 0 ? 1 : 0);
          out.push(<path key={`${p.id}-arc${i}`} d={`M${a.x} ${a.y} A${r} ${r} 0 0 ${sweep} ${b.x} ${b.y}`} fill="none" stroke={c.constr} strokeWidth={0.2 * pu} strokeDasharray={`${1.2 * pu} ${0.9 * pu}`} />);
        }
      });
    }
    const mark = (q: Vec2 | null, sub: string, which: 1 | 2 | 3) => {
      if (!q) return;
      const at = T(q);
      out.push(
        <g key={`${p.id}-${which}`} data-pid={opts.draggable ? p.id : undefined} data-which={opts.draggable ? which : undefined} style={opts.draggable ? { cursor: 'grab' } : undefined}>
          {opts.draggable && <circle cx={at.x} cy={at.y} r={4.5 * pu} fill="transparent" />}
          <Cross at={at} ctx={ctx} color={pc} w={sel ? 0.45 : 0.3} />
          <Label at={at} name={p.name} sub={sub} ctx={ctx} color={pc} />
        </g>,
      );
    };
    mark(ep.p2, '2', 2);
    mark(ep.p1, '1', 1);
    mark(ep.p3, '3', 3);
  });
  return out;
}

// ---------------------------------------------------------------------------
// Axonometric picture

export function axoWorldBox(d: ProjectionsData): Box {
  const e = planeExtents(d.points);
  let b = emptyBox();
  for (const x of [e.xMin, e.L]) for (const y of [e.yMin, e.yMax]) for (const z of [e.zMin, e.zMax]) b = addPt(b, axonometric(v3(x, y, z), d.axo));
  return b;
}

export function renderAxonometric(d: ProjectionsData, ctx: ViewCtx, opts: { selectedId?: string | null } = {}): ReactNode {
  const c = colors(ctx.bw);
  const e = planeExtents(d.points);
  const P = (p: Vec3) => ctx.T(axonometric(p, d.axo));
  const pu = ctx.pu;
  const poly = (pts: Vec3[], key: string) => (
    <polygon key={key} points={pts.map(P).map((q) => `${q.x},${q.y}`).join(' ')} fill={c.planeFill} stroke={c.plane} strokeWidth={0.4 * pu} strokeLinejoin="round" />
  );
  const out: ReactNode[] = [];
  const x0 = e.xMin, x1 = e.L;
  out.push(poly([v3(x0, 0, e.zMin), v3(x1, 0, e.zMin), v3(x1, 0, e.zMax), v3(x0, 0, e.zMax)], 'pi2'));
  out.push(poly([v3(x0, e.yMin, 0), v3(x1, e.yMin, 0), v3(x1, e.yMax, 0), v3(x0, e.yMax, 0)], 'pi1'));
  if (d.epure.showP3) out.push(poly([v3(0, e.yMin, e.zMin), v3(0, e.yMax, e.zMin), v3(0, e.yMax, e.zMax), v3(0, e.yMin, e.zMax)], 'pi3'));
  out.push(line(P(v3(x0, 0, 0)), P(v3(x1, 0, 0)), c.plane, 0.5 * pu, undefined, 'axis12'));
  out.push(<Label key="pi2" at={P(v3(x1, 0, e.zMax))} name="π" sub="2" ctx={ctx} color={c.text} dx={-6} dy={4.5} />);
  out.push(<Label key="pi1" at={P(v3(x1, e.yMax, 0))} name="π" sub="1" ctx={ctx} color={c.text} dx={-6} dy={-1.5} />);
  if (d.epure.showP3) out.push(<Label key="pi3" at={P(v3(0, e.yMax, e.zMax))} name="π" sub="3" ctx={ctx} color={c.text} dx={1.5} dy={4.5} />);

  d.points.forEach((p) => {
    if (!has(p.x) || !has(p.y) || !has(p.z)) return;
    const A = v3(p.x, p.y, p.z);
    const sel = opts.selectedId === p.id;
    const pc = sel ? c.sel : c.point;
    const prc = sel ? c.sel : c.proj;
    const p1 = projectOnPi1(p)!, p2 = projectOnPi2(p)!, p3 = projectOnPi3(p)!;
    const dash = `${1.6 * pu} ${1 * pu}`;
    if (d.showConstruction) {
      out.push(line(P(A), P(p1), c.constr, 0.22 * pu, dash, `${p.id}-a1`));
      out.push(line(P(A), P(p2), c.constr, 0.22 * pu, dash, `${p.id}-a2`));
      out.push(line(P(p1), P(v3(p.x, 0, 0)), c.constr, 0.18 * pu, dash, `${p.id}-g1`));
      out.push(line(P(p2), P(v3(p.x, 0, 0)), c.constr, 0.18 * pu, dash, `${p.id}-g2`));
      if (d.epure.showP3) out.push(line(P(A), P(p3), c.constr, 0.22 * pu, dash, `${p.id}-a3`));
    }
    out.push(<g key={`${p.id}-pt`}><Dot at={P(A)} ctx={ctx} color={pc} r={sel ? 1.2 : 0.9} /><Label at={P(A)} name={p.name} ctx={ctx} color={pc} /></g>);
    out.push(<g key={`${p.id}-p1`}><Cross at={P(p1)} ctx={ctx} color={prc} size={1} /><Label at={P(p1)} name={p.name} sub="1" ctx={ctx} color={prc} /></g>);
    out.push(<g key={`${p.id}-p2`}><Cross at={P(p2)} ctx={ctx} color={prc} size={1} /><Label at={P(p2)} name={p.name} sub="2" ctx={ctx} color={prc} /></g>);
    if (d.epure.showP3) out.push(<g key={`${p.id}-p3`}><Cross at={P(p3)} ctx={ctx} color={prc} size={1} /><Label at={P(p3)} name={p.name} sub="3" ctx={ctx} color={prc} /></g>);
  });
  return out;
}

import type { ReactNode } from 'react';
import type { BackgroundImage, DrawingData, DrawingElement } from '../document/types';
import { type Vec2, v2 } from '../geometry/vec';
import { Dimension } from './dimension';
import { elementBox, rectCorners } from './elements';
import { addPt, dashArray, emptyBox, type Box, type ViewCtx } from './viewport';

/** World size of the background image. Uncalibrated images use 1 unit per pixel. */
export function bgWorldSize(bg: BackgroundImage) {
  const s = bg.mmPerPx ?? 1;
  return { w: bg.pxW * s, h: bg.pxH * s, s };
}
/** Image pixel -> world. The image's top-left corner sits at world (0, h). */
export const imgToWorld = (bg: BackgroundImage, q: Vec2): Vec2 => {
  const { h, s } = bgWorldSize(bg);
  return v2(q.x * s, h - q.y * s);
};
export const worldToImg = (bg: BackgroundImage, p: Vec2): Vec2 => {
  const { h, s } = bgWorldSize(bg);
  return v2(p.x / s, (h - p.y) / s);
};

export function drawingWorldBox(d: DrawingData, withBackground: boolean): Box {
  let b = emptyBox();
  for (const e of d.elements) {
    const eb = elementBox(e);
    b = addPt(addPt(b, v2(eb.minX, eb.minY)), v2(eb.maxX, eb.maxY));
    if (e.kind === 'dim') {
      // include the offset dimension line
      const dx = e.b.x - e.a.x, dy = e.b.y - e.a.y, L = Math.hypot(dx, dy) || 1;
      const n = v2((-dy / L) * e.offset, (dx / L) * e.offset);
      b = addPt(addPt(b, v2(e.a.x + n.x, e.a.y + n.y)), v2(e.b.x + n.x, e.b.y + n.y));
    }
  }
  if (withBackground && d.background?.visible) {
    const { w, h } = bgWorldSize(d.background);
    b = addPt(addPt(b, v2(0, 0)), v2(w, h));
  }
  return b;
}

export function renderBackground(bg: BackgroundImage, ctx: ViewCtx, opacity = bg.opacity): ReactNode {
  const { w, h } = bgWorldSize(bg);
  const tl = ctx.T(v2(0, h));
  return <image href={bg.dataUrl} x={tl.x} y={tl.y} width={w * ctx.k} height={h * ctx.k} opacity={opacity} preserveAspectRatio="none" style={{ pointerEvents: 'none' }} />;
}

export function renderGrid(size: number, ctx: ViewCtx, view: Box): ReactNode {
  // Choose a grid step that is at least 8 px apart on screen.
  let step = size;
  while (step * ctx.k < 8) step *= 5;
  const lines: ReactNode[] = [];
  const x0 = Math.floor(view.minX / step) * step, y0 = Math.floor(view.minY / step) * step;
  let n = 0;
  for (let x = x0; x <= view.maxX && n < 600; x += step, n++) {
    const a = ctx.T(v2(x, view.minY)), b = ctx.T(v2(x, view.maxY));
    const major = Math.abs(Math.round(x / (step * 5)) * step * 5 - x) < step / 100;
    lines.push(<line key={`x${n}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={major ? '#d9d5ca' : '#ebe8e0'} strokeWidth={1} />);
  }
  for (let y = y0; y <= view.maxY && n < 1200; y += step, n++) {
    const a = ctx.T(v2(view.minX, y)), b = ctx.T(v2(view.maxX, y));
    const major = Math.abs(Math.round(y / (step * 5)) * step * 5 - y) < step / 100;
    lines.push(<line key={`y${n}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={major ? '#d9d5ca' : '#ebe8e0'} strokeWidth={1} />);
  }
  return <g style={{ pointerEvents: 'none' }}>{lines}</g>;
}

export function renderElement(e: DrawingElement, ctx: ViewCtx, color: string, opts: { worldTextScale: number }): ReactNode {
  const T = ctx.T, pu = ctx.pu;
  const sw = e.width * pu;
  const dash = dashArray(e.style, pu, e.width);
  const common = { stroke: color, strokeWidth: sw, strokeDasharray: dash, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (e.kind) {
    case 'point': {
      const p = T(e.p);
      return (
        <g key={e.id}>
          <circle cx={p.x} cy={p.y} r={0.8 * pu} fill={color} />
          {e.label && <text x={p.x + 1.2 * pu} y={p.y - 1.2 * pu} fontSize={3.2 * pu} fill={color} fontFamily="Rubik, Arial, sans-serif">{e.label}</text>}
        </g>
      );
    }
    case 'line': {
      const a = T(e.a), b = T(e.b);
      return <line key={e.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} {...common} />;
    }
    case 'rect':
      return <polygon key={e.id} points={rectCorners(e).map(T).map((p) => `${p.x},${p.y}`).join(' ')} {...common} />;
    case 'circle': {
      const c = T(e.c);
      return <circle key={e.id} cx={c.x} cy={c.y} r={e.r * ctx.k} {...common} />;
    }
    case 'polygon': {
      const pts = e.pts.map(T).map((p) => `${p.x},${p.y}`).join(' ');
      return e.closed ? <polygon key={e.id} points={pts} {...common} /> : <polyline key={e.id} points={pts} {...common} />;
    }
    case 'text': {
      const p = T(e.p);
      return (
        <text key={e.id} x={p.x} y={p.y} fontSize={ctx.screen ? Math.max(e.size * pu * opts.worldTextScale, 7) : e.size * pu * opts.worldTextScale} fill={color} textAnchor="middle" direction="rtl" fontFamily="Rubik, Arial, sans-serif">{e.text}</text>
      );
    }
    case 'dim':
      return <Dimension key={e.id} a={e.a} b={e.b} offset={e.offset} ctx={ctx} color={color} width={e.width} />;
  }
}

/**
 * textScale: on screen, text is drawn at the size it will have when printed at the project's scale
 * (paper mm x scale / screen px per paper mm). Leave it out when drawing the print sheet.
 */
export function renderElements(d: DrawingData, ctx: ViewCtx, opts: { selectedId?: string | null; skipId?: string | null; textScale?: number } = {}): ReactNode {
  const base = ctx.bw ? '#000' : '#1b2230';
  return d.elements.filter((e) => e.id !== opts.skipId).map((e) => (
    <g key={e.id} data-eid={e.id}>{renderElement(e, ctx, e.id === opts.selectedId ? '#e8590c' : base, { worldTextScale: opts.textScale ?? 1 })}</g>
  ));
}

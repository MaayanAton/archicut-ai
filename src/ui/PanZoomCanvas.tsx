import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { Vec2 } from '../geometry/vec';
import { boxH, boxValid, boxW, makeView, type Box, type ViewCtx } from '../drawing/viewport';
import { Icons } from './icons';

export const SCREEN_PU = 4; // px per "paper millimetre" for strokes and labels on screen

export interface PointerApi {
  /** Return true if the event was consumed (prevents panning). */
  down?: (e: React.PointerEvent, w: Vec2) => boolean;
  move?: (e: React.PointerEvent, w: Vec2) => void;
  up?: (e: React.PointerEvent, w: Vec2) => void;
  hover?: (w: Vec2 | null) => void;
}

interface Props {
  box: Box;
  fitKey?: string | number;
  render: (ctx: ViewCtx, toWorld: (q: Vec2) => Vec2, size: { w: number; h: number }) => ReactNode;
  pointer?: PointerApi;
  label?: ReactNode;
  cursor?: string;
  /** Distance in px that the content should keep from the edges when fitting. */
  margin?: number;
  testId?: string;
  /** Refit when the content leaves the view or becomes very small, unless the user has zoomed or panned. */
  keepInView?: boolean;
}

export function PanZoomCanvas({ box, fitKey, render, pointer, label, cursor, margin = 36, testId, keepInView }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<{ k: number; cx: number; cy: number } | null>(null);
  const pointers = useRef(new Map<number, Vec2>());
  const pan = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);
  const pinch = useRef<{ d: number; k: number; mid: Vec2; cx: number; cy: number } | null>(null);
  const consumed = useRef(false);
  const userMoved = useRef(false);

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const fit = useCallback(() => {
    if (!size.w || !size.h) return;
    const b = boxValid(box) ? box : { minX: -50, minY: -50, maxX: 50, maxY: 50 };
    const bw = Math.max(boxW(b), 1), bh = Math.max(boxH(b), 1);
    const k = Math.min((size.w - 2 * margin) / bw, (size.h - 2 * margin) / bh);
    userMoved.current = false;
    setView({ k: Math.max(k, 1e-4), cx: (b.minX + b.maxX) / 2, cy: (b.minY + b.maxY) / 2 });
  }, [box, size.w, size.h, margin]);

  // Fit when the canvas first gets a size or when the caller asks for a refit.
  const lastFit = useRef<string | number | undefined>(undefined);
  const hadSize = useRef(false);
  useEffect(() => {
    if (!size.w) return;
    if (!hadSize.current || lastFit.current !== fitKey) {
      hadSize.current = true;
      lastFit.current = fitKey;
      fit();
    }
  }, [size.w, size.h, fitKey, fit]);

  useEffect(() => {
    if (!keepInView || !view || userMoved.current || !boxValid(box) || !size.w) return;
    const hw = (size.w / 2 - margin / 2) / view.k, hh = (size.h / 2 - margin / 2) / view.k;
    const out = box.minX < view.cx - hw || box.maxX > view.cx + hw || box.minY < view.cy - hh || box.maxY > view.cy + hh;
    const tiny = boxW(box) < hw * 0.5 && boxH(box) < hh * 0.5;
    if (out || tiny) fit();
  }, [keepInView, box, view, size.w, size.h, margin, fit]);

  const v = view ?? { k: 1, cx: 0, cy: 0 };
  const { T, inv } = makeView(v.cx, v.cy, v.k, size.w / 2, size.h / 2);
  const ctx: ViewCtx = { T, k: v.k, pu: SCREEN_PU, bw: false, screen: true };

  const local = (e: { clientX: number; clientY: number }): Vec2 => {
    const r = wrap.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const zoomAt = (q: Vec2, factor: number) => {
    userMoved.current = true;
    setView((cur) => {
      if (!cur) return cur;
      const vv = makeView(cur.cx, cur.cy, cur.k, size.w / 2, size.h / 2);
      const w = vv.inv(q);
      const k = Math.min(Math.max(cur.k * factor, 1e-4), 1e4);
      // keep world point w under the cursor
      const cx = w.x - (q.x - size.w / 2) / k;
      const cy = w.y + (q.y - size.h / 2) / k;
      return { k, cx, cy };
    });
  };

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt({ x: e.clientX - r.left, y: e.clientY - r.top }, Math.exp(-e.deltaY * 0.0015));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  const onDown = (e: React.PointerEvent) => {
    const q = local(e);
    pointers.current.set(e.pointerId, q);
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), k: v.k, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, cx: v.cx, cy: v.cy };
      pan.current = null;
      if (consumed.current) {
        pointer?.up?.(e, inv(q));
        consumed.current = false;
      }
      return;
    }
    consumed.current = !!pointer?.down?.(e, inv(q));
    if (!consumed.current && (e.button === 0 || e.pointerType !== 'mouse')) pan.current = { x: q.x, y: q.y, cx: v.cx, cy: v.cy };
    if (e.button === 1) pan.current = { x: q.x, y: q.y, cx: v.cx, cy: v.cy };
  };

  const onMove = (e: React.PointerEvent) => {
    const q = local(e);
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, q);
    if (pinch.current && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const p = pinch.current;
      const k = Math.min(Math.max((p.k * d) / Math.max(p.d, 1), 1e-4), 1e4);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const startView = makeView(p.cx, p.cy, p.k, size.w / 2, size.h / 2);
      const w = startView.inv(p.mid);
      userMoved.current = true;
      setView({ k, cx: w.x - (mid.x - size.w / 2) / k, cy: w.y + (mid.y - size.h / 2) / k });
      return;
    }
    if (pan.current) {
      const p = pan.current;
      if (Math.hypot(q.x - p.x, q.y - p.y) > 3) userMoved.current = true;
      setView({ k: v.k, cx: p.cx - (q.x - p.x) / v.k, cy: p.cy + (q.y - p.y) / v.k });
      return;
    }
    if (consumed.current) pointer?.move?.(e, inv(q));
    else pointer?.hover?.(inv(q));
  };

  const onUp = (e: React.PointerEvent) => {
    const q = local(e);
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (consumed.current) pointer?.up?.(e, inv(q));
    consumed.current = false;
    pan.current = null;
  };

  return (
    <div className="canvas-wrap" ref={wrap} data-testid={testId} style={{ cursor: pan.current ? 'grabbing' : cursor }}
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
      onPointerLeave={() => pointer?.hover?.(null)}>
      {label && <div className="canvas-label">{label}</div>}
      <div className="canvas-tools" onPointerDown={(e) => e.stopPropagation()}>
        <button className="btn icon sm" aria-label="הגדלת התצוגה" title="הגדלה" onClick={() => zoomAt({ x: size.w / 2, y: size.h / 2 }, 1.3)}>{Icons.zoomIn}</button>
        <button className="btn icon sm" aria-label="הקטנת התצוגה" title="הקטנה" onClick={() => zoomAt({ x: size.w / 2, y: size.h / 2 }, 1 / 1.3)}>{Icons.zoomOut}</button>
        <button className="btn icon sm" aria-label="התאמה למסך" title="התאמה למסך" onClick={fit}>{Icons.fit}</button>
      </div>
      {size.w > 0 && view && (
        <svg className="canvas" width={size.w} height={size.h}>
          {render(ctx, inv, size)}
        </svg>
      )}
    </div>
  );
}

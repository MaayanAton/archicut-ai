import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useStore } from '../../document/store';
import { uid } from '../../document/factory';
import type { DrawingData, DrawingElement, LineStyle, Project } from '../../document/types';
import { type Vec2, v2, dist2 } from '../../geometry/vec';
import { bgWorldSize, drawingWorldBox, renderBackground, renderElement, renderElements, renderGrid, worldToImg } from '../../drawing/drawingRender';
import { hitDistance, scaleEl, snapPoints, translate } from '../../drawing/elements';
import { fmtLen } from '../../drawing/dimension';
import { boxValid, padBox, type Box, type ViewCtx } from '../../drawing/viewport';
import { PanZoomCanvas, SCREEN_PU } from '../PanZoomCanvas';
import { Check, Dialog, NumberField, Seg, toast } from '../common';
import { Icons } from '../icons';
import { PropertiesPanel } from './PropertiesPanel';
import { ImageEditDialog } from './ImageEditDialog';

type DProject = Extract<Project, { type: 'drawing' }>;

export type Tool = 'select' | 'point' | 'line' | 'dashed' | 'rect' | 'circle' | 'triangle' | 'polygon' | 'text' | 'dim' | 'calibrate' | 'measure';

const TOOL_INFO: Record<Tool, { label: string; icon: keyof typeof Icons; hint: string[]; advanced?: boolean }> = {
  select: { label: 'בחירה', icon: 'select', hint: ['לחצי על אלמנט כדי לבחור ולגרור אותו. גרירה על רקע ריק מזיזה את התצוגה.'] },
  line: { label: 'קו', icon: 'line', hint: ['לחצי על נקודת ההתחלה של הקו', 'לחצי על נקודת הסיום'] },
  dashed: { label: 'קו מקווקו', icon: 'line', hint: ['לחצי על נקודת ההתחלה של הקו המקווקו', 'לחצי על נקודת הסיום'] },
  rect: { label: 'מלבן', icon: 'rect', hint: ['לחצי על פינה אחת של המלבן', 'לחצי על הפינה הנגדית'] },
  circle: { label: 'עיגול', icon: 'circle', hint: ['לחצי על מרכז העיגול', 'לחצי על נקודה על ההיקף'] },
  text: { label: 'טקסט', icon: 'text', hint: ['לחצי במקום שבו יופיע הטקסט'] },
  dim: { label: 'קו מידה', icon: 'dim', hint: ['לחצי על תחילת המידה', 'לחצי על סוף המידה'] },
  point: { label: 'נקודה', icon: 'point', hint: ['לחצי כדי להוסיף נקודה'], advanced: true },
  triangle: { label: 'משולש', icon: 'triangle', hint: ['לחצי על הקודקוד הראשון', 'לחצי על הקודקוד השני', 'לחצי על הקודקוד השלישי'], advanced: true },
  polygon: { label: 'מצולע', icon: 'polygon', hint: ['לחצי על הקודקוד הראשון', 'המשיכי להוסיף קודקודים. לסיום לחצי שוב על הקודקוד הראשון או על "סיום מצולע"'], advanced: true },
  calibrate: { label: 'כיול', icon: 'calibrate', hint: ['כיול קנה מידה: לחצי על נקודה אחת שהמרחק שלה ידוע', 'לחצי על הנקודה השנייה'] },
  measure: { label: 'מדידה', icon: 'ruler', hint: ['לחצי על נקודת ההתחלה של המדידה', 'לחצי על נקודת הסיום'] },
};

const BASIC_TOOLS: Tool[] = ['select', 'line', 'dashed', 'rect', 'circle', 'text', 'dim'];
const ADV_TOOLS: Tool[] = ['point', 'triangle', 'polygon'];

const SNAP_PX = 12;

export function DrawingView({ project }: { project: DProject }) {
  const d = project.data;
  const bg = d.background;
  const update = useStore((s) => s.update);
  const [tool, setTool] = useState<Tool>('select');
  const [advanced, setAdvanced] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Vec2[]>([]);
  const [hover, setHover] = useState<{ p: Vec2; snapped: 'point' | 'grid' | null } | null>(null);
  const [measure, setMeasure] = useState<{ a: Vec2; b: Vec2; exact: boolean } | null>(null);
  const [textAt, setTextAt] = useState<Vec2 | null>(null);
  const [calib, setCalib] = useState<{ a: Vec2; b: Vec2 } | null>(null);
  const [imgEdit, setImgEdit] = useState(false);
  const [mobilePane, setMobilePane] = useState<'draw' | 'image'>(() => (project.data.background && project.data.layout === 'side' && project.data.elements.length === 0 ? 'image' : 'draw'));
  const dragRef = useRef<{ start: Vec2; orig: DrawingElement } | null>(null);
  const kRef = useRef(1);
  const downAt = useRef<Vec2 | null>(null);

  const setData = (fn: (d: DrawingData) => DrawingData, record = true) =>
    update(project.id, (p) => (p.type === 'drawing' ? { ...p, data: fn(p.data) } : p), record);
  const addElement = (e: DrawingElement) => {
    setData((dd) => ({ ...dd, elements: [...dd.elements, e] }));
    setSelectedId(e.id);
  };

  const side = !!bg && d.layout === 'side';
  const selected = d.elements.find((e) => e.id === selectedId) ?? null;
  const defaultDimOffset = 8 * project.print.scale;

  const chooseTool = (t: Tool) => {
    setTool(t);
    setDraft([]);
    setMeasure(null);
    if (t !== 'select') setSelectedId(null);
    if (side && (t === 'calibrate' || t === 'measure')) setMobilePane('image');
    if (side && t !== 'calibrate' && t !== 'measure') setMobilePane('draw');
  };

  // ---------- snapping ----------
  const snap = (w: Vec2, useGrid = true): { p: Vec2; snapped: 'point' | 'grid' | null } => {
    const tol = SNAP_PX / kRef.current;
    let best: Vec2 | null = null, bd = tol;
    for (const e of d.elements) for (const q of snapPoints(e)) {
      const dd = dist2(q, w);
      if (dd < bd) { bd = dd; best = q; }
    }
    for (const q of draft) {
      const dd = dist2(q, w);
      if (dd < bd) { bd = dd; best = q; }
    }
    if (best) return { p: best, snapped: 'point' };
    if (useGrid && d.grid.snap) {
      const g = d.grid.size;
      return { p: v2(Math.round(w.x / g) * g, Math.round(w.y / g) * g), snapped: 'grid' };
    }
    return { p: w, snapped: null };
  };

  const hitTest = (w: Vec2): DrawingElement | null => {
    const tol = 8 / kRef.current;
    let best: DrawingElement | null = null, bd = tol;
    for (let i = d.elements.length - 1; i >= 0; i--) {
      const e = d.elements[i];
      const dd = hitDistance(e, w, e.kind === 'text' ? Math.max(e.size * project.print.scale, 7 / kRef.current) : (3 * SCREEN_PU) / kRef.current);
      if (dd < bd) { bd = dd; best = e; }
    }
    return best;
  };

  const base = { style: 'solid' as LineStyle, width: 0.35 };

  // ---------- placing points with drawing tools ----------
  const place = (p: Vec2, exactSnap: boolean) => {
    const pts = [...draft, p];
    const tooSmall = (a: Vec2, b: Vec2) => dist2(a, b) < 1e-6;
    switch (tool) {
      case 'point': addElement({ id: uid(), kind: 'point', p, label: '', ...base }); return;
      case 'text': setTextAt(p); return;
      case 'line': case 'dashed':
        if (pts.length < 2) return setDraft(pts);
        if (tooSmall(pts[0], pts[1])) return;
        addElement({ id: uid(), kind: 'line', a: pts[0], b: pts[1], ...base, style: tool === 'dashed' ? 'dashed' : 'solid' });
        return setDraft([]);
      case 'rect': {
        if (pts.length < 2) return setDraft(pts);
        const [a, b] = pts;
        if (Math.abs(a.x - b.x) < 1e-6 || Math.abs(a.y - b.y) < 1e-6) return;
        addElement({ id: uid(), kind: 'rect', x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y), angle: 0, ...base });
        return setDraft([]);
      }
      case 'circle':
        if (pts.length < 2) return setDraft(pts);
        if (tooSmall(pts[0], pts[1])) return;
        addElement({ id: uid(), kind: 'circle', c: pts[0], r: dist2(pts[0], pts[1]), ...base });
        return setDraft([]);
      case 'dim':
        if (pts.length < 2) return setDraft(pts);
        if (tooSmall(pts[0], pts[1])) return;
        addElement({ id: uid(), kind: 'dim', a: pts[0], b: pts[1], offset: defaultDimOffset, style: 'solid', width: 0.18 });
        return setDraft([]);
      case 'triangle':
        if (pts.length < 3) return setDraft(pts);
        addElement({ id: uid(), kind: 'polygon', pts, closed: true, ...base });
        return setDraft([]);
      case 'polygon':
        if (draft.length >= 3 && dist2(p, draft[0]) < SNAP_PX / kRef.current) return finishPolygon();
        return setDraft(pts);
      case 'measure':
        if (pts.length < 2) { setMeasure(null); return setDraft(pts); }
        setMeasure({ a: pts[0], b: pts[1], exact: exactSnap && (measureExactRef.current ?? false) });
        return setDraft([]);
      case 'calibrate':
        if (pts.length < 2) return setDraft(pts);
        if (tooSmall(pts[0], pts[1])) return;
        setCalib({ a: pts[0], b: pts[1] });
        return setDraft([]);
      default:
    }
  };
  const measureExactRef = useRef<boolean | null>(null);

  const finishPolygon = () => {
    if (draft.length >= 3) addElement({ id: uid(), kind: 'polygon', pts: draft, closed: true, ...base });
    else toast('מצולע צריך לפחות 3 קודקודים');
    setDraft([]);
  };

  const pointerFor = (pane: 'draw' | 'image') => ({
    down: (e: React.PointerEvent, w: Vec2) => {
      if (e.button === 2) return false;
      const imageTool = tool === 'calibrate' || tool === 'measure';
      if (side && pane === 'image' && !imageTool) return false;
      if (side && pane === 'draw' && imageTool) return false;
      if (tool === 'select') {
        const hit = hitTest(w);
        setSelectedId(hit?.id ?? null);
        if (!hit) return false;
        useStore.getState().checkpoint(project.id);
        dragRef.current = { start: w, orig: hit };
        return true;
      }
      const useGrid = !(imageTool);
      const s = imageTool ? snap(w, false) : snap(w, useGrid);
      if (tool === 'measure') measureExactRef.current = draft.length === 0 ? s.snapped === 'point' : (measureExactRef.current ?? false) && s.snapped === 'point';
      downAt.current = s.p;
      place(s.p, s.snapped === 'point');
      return true;
    },
    move: (_e: React.PointerEvent, w: Vec2) => {
      const dr = dragRef.current;
      if (dr) {
        let delta = v2(w.x - dr.start.x, w.y - dr.start.y);
        if (d.grid.snap) {
          const g = d.grid.size;
          delta = v2(Math.round(delta.x / g) * g, Math.round(delta.y / g) * g);
        }
        const moved = translate(dr.orig, delta);
        setData((dd) => ({ ...dd, elements: dd.elements.map((x) => (x.id === moved.id ? moved : x)) }), false);
        return;
      }
      const imageTool = tool === 'calibrate' || tool === 'measure';
      setHover(snap(w, !imageTool));
    },
    up: (_e: React.PointerEvent, w: Vec2) => {
      if (dragRef.current) { dragRef.current = null; return; }
      // Press-drag-release also works for two-point tools.
      const start = downAt.current;
      downAt.current = null;
      const imageTool = tool === 'calibrate' || tool === 'measure';
      if (start && draft.length === 1 && ['line', 'dashed', 'rect', 'circle', 'dim', 'measure', 'calibrate'].includes(tool)) {
        const s = snap(w, !imageTool);
        if (dist2(s.p, start) * kRef.current > 10) place(s.p, s.snapped === 'point');
      }
    },
    hover: (w: Vec2 | null) => {
      if (!w || tool === 'select') return setHover(null);
      const imageTool = tool === 'calibrate' || tool === 'measure';
      setHover(snap(w, !imageTool));
    },
  });

  // ---------- preview of the element being drawn ----------
  const preview = (ctx: ViewCtx): ReactNode => {
    const out: ReactNode[] = [];
    const h = hover?.p;
    const col = '#1f4fa8';
    if (draft.length && h) {
      const a = draft[0];
      let el: DrawingElement | null = null;
      if (tool === 'line' || tool === 'dashed' || tool === 'measure' || tool === 'calibrate') el = { id: 'pv', kind: 'line', a, b: h, ...base, style: tool === 'line' ? 'solid' : 'dashed', width: 0.3 };
      if (tool === 'rect') el = { id: 'pv', kind: 'rect', x: Math.min(a.x, h.x), y: Math.min(a.y, h.y), w: Math.abs(a.x - h.x), h: Math.abs(a.y - h.y), angle: 0, ...base };
      if (tool === 'circle') el = { id: 'pv', kind: 'circle', c: a, r: dist2(a, h), ...base };
      if (tool === 'dim') el = { id: 'pv', kind: 'dim', a, b: h, offset: defaultDimOffset, style: 'solid', width: 0.18 };
      if (tool === 'triangle' || tool === 'polygon') el = { id: 'pv', kind: 'polygon', pts: [...draft, h], closed: false, ...base };
      if (el) out.push(<g key="pv" opacity={0.75}>{renderElement(el, ctx, col, { worldTextScale: (project.print.scale * ctx.k) / ctx.pu })}</g>);
      // live length label
      const A = ctx.T(draft[draft.length - 1]), H = ctx.T(h);
      const len = dist2(draft[draft.length - 1], h);
      const label = tool === 'circle' ? `ר = ${fmtLen(len)}` : unitLabel(len);
      out.push(<text key="len" x={(A.x + H.x) / 2} y={(A.y + H.y) / 2 - 10} fontSize={13} fill={col} textAnchor="middle" fontFamily="Rubik" stroke="#fff" strokeWidth={3} paintOrder="stroke">{label}</text>);
    }
    draft.forEach((p, i) => { const s = ctx.T(p); out.push(<circle key={`d${i}`} cx={s.x} cy={s.y} r={4} fill={col} />); });
    if (h && tool !== 'select') {
      const s = ctx.T(h);
      out.push(hover?.snapped === 'point'
        ? <rect key="snap" x={s.x - 6} y={s.y - 6} width={12} height={12} fill="none" stroke="#e8590c" strokeWidth={2} />
        : <g key="cur" stroke={col} strokeWidth={1}><line x1={s.x - 8} y1={s.y} x2={s.x + 8} y2={s.y} /><line x1={s.x} y1={s.y - 8} x2={s.x} y2={s.y + 8} /></g>);
    }
    if (measure) {
      const a = ctx.T(measure.a), b = ctx.T(measure.b);
      out.push(<g key="m"><line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#0e7c66" strokeWidth={2} strokeDasharray="6 4" />
        <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 10} fontSize={14} fill="#0e7c66" textAnchor="middle" fontFamily="Rubik" stroke="#fff" strokeWidth={3} paintOrder="stroke">{measureText(measure)}</text></g>);
    }
    return out;
  };

  const calibrated = !!bg?.mmPerPx;
  // In overlay mode the drawing lives in the image's units: pixels until the image is calibrated.
  const unitLabel = (len: number) => (bg && !side && !calibrated ? `${fmtLen(len)} יח׳` : `${fmtLen(len)} מ״מ`);
  const measureText = (m: { a: Vec2; b: Vec2; exact: boolean }) => {
    const len = dist2(m.a, m.b);
    if (bg && !calibrated && !m.exact) return `${fmtLen(len)} פיקסלים (התמונה לא מכוילת)`;
    if (bg && !m.exact) return `≈ ${fmtLen(len)} מ״מ (משוער, לפי התמונה)`;
    return `${fmtLen(len)} מ״מ`;
  };

  const drawBox = useMemo(() => {
    const b = drawingWorldBox(d, !side);
    return boxValid(b) ? padBox(b, Math.max((b.maxX - b.minX), (b.maxY - b.minY), 50) * 0.06) : { minX: -20, minY: -20, maxX: 200, maxY: 150 };
  }, [d, side]);
  const imgBox = useMemo<Box>(() => {
    if (!bg) return { minX: 0, minY: 0, maxX: 100, maxY: 100 };
    const { w, h } = bgWorldSize(bg);
    return { minX: 0, minY: 0, maxX: w, maxY: h };
  }, [bg]);

  const viewBox = (toWorld: (q: Vec2) => Vec2, size: { w: number; h: number }): Box => {
    const a = toWorld(v2(0, 0)), b = toWorld(v2(size.w, size.h));
    return { minX: Math.min(a.x, b.x), minY: Math.min(a.y, b.y), maxX: Math.max(a.x, b.x), maxY: Math.max(a.y, b.y) };
  };

  const drawCanvas = (
    <PanZoomCanvas
      testId="drawing-canvas"
      box={drawBox}
      fitKey={`${project.id}-${side}-${bg?.mmPerPx ?? 0}-${bg?.pxW ?? 0}`}
      cursor={tool === 'select' ? 'default' : 'crosshair'}
      label={side ? 'שרטוט' : undefined}
      pointer={pointerFor('draw')}
      render={(ctx, toWorld, size) => {
        kRef.current = ctx.k;
        return (
          <>
            {d.grid.show && renderGrid(d.grid.size, ctx, viewBox(toWorld, size))}
            {bg && bg.visible && !side && renderBackground(bg, ctx)}
            {renderElements(d, ctx, { selectedId, textScale: (project.print.scale * ctx.k) / ctx.pu })}
            {!(side && (tool === 'calibrate' || tool === 'measure')) && preview(ctx)}
          </>
        );
      }}
    />
  );

  const imageCanvas = bg && (
    <PanZoomCanvas
      testId="image-canvas"
      box={imgBox}
      fitKey={`${bg.pxW}-${bg.pxH}-${bg.mmPerPx ?? 0}`}
      label="תמונת המקור"
      cursor={tool === 'calibrate' || tool === 'measure' ? 'crosshair' : 'grab'}
      pointer={pointerFor('image')}
      render={(ctx) => {
        kRef.current = ctx.k;
        return <>{renderBackground(bg, ctx, 1)}{(tool === 'calibrate' || tool === 'measure') && preview(ctx)}</>;
      }}
    />
  );

  const applyCalibration = (mm: number) => {
    if (!bg || !calib) return;
    const a = worldToImg(bg, calib.a), b = worldToImg(bg, calib.b);
    const px = dist2(a, b);
    if (px < 2) { toast('הנקודות קרובות מדי זו לזו. בחרי שתי נקודות רחוקות יותר.'); return; }
    const newS = mm / px;
    const oldS = bg.mmPerPx ?? 1;
    const k = newS / oldS;
    setData((dd) => ({
      ...dd,
      // Overlay: keep the drawing registered to the image by scaling about the image's bottom-left corner.
      // Side by side: the drawing is independent and already in millimetres, so it is left unchanged.
      elements: dd.layout === 'overlay' ? dd.elements.map((e) => scaleEl(e, k, v2(0, 0))) : dd.elements,
      background: dd.background && { ...dd.background, mmPerPx: newS, calibration: { a, b, mm } },
    }));
    setCalib(null);
    setTool('select');
    toast(`הכיול נשמר: 1 פיקסל = ${fmtLen(newS * 1000) === '0' ? newS.toExponential(2) : (newS).toFixed(4)} מ״מ`);
  };

  const tools = advanced ? [...BASIC_TOOLS, ...ADV_TOOLS] : BASIC_TOOLS;
  const info = TOOL_INFO[tool];
  const hint = info.hint[Math.min(draft.length, info.hint.length - 1)];

  return (
    <div className="workspace">
      <aside className="panel" aria-label="מאפיינים והגדרות">
        {project.demo && <div className="notice warn">{Icons.info}<span>פרויקט הדגמה. {bg ? (calibrated ? 'מידות שנמדדות על התמונה הן משוערות.' : 'התמונה לא מכוילת, ולכן אין בה מידות.') : 'המידות לדוגמה בלבד.'}</span></div>}
        {selected ? (
          <PropertiesPanel key={selected.id} el={selected} unit={bg && !side && !calibrated ? 'יח׳' : 'מ״מ'}
            onChange={(next, record) => setData((dd) => ({ ...dd, elements: dd.elements.map((x) => (x.id === next.id ? next : x)) }), record)}
            onStart={() => useStore.getState().checkpoint(project.id)}
            onDelete={() => { setData((dd) => ({ ...dd, elements: dd.elements.filter((x) => x.id !== selected.id) })); setSelectedId(null); }}
            onDuplicate={() => { const c = { ...translate(selected, v2(d.grid.size, -d.grid.size)), id: uid() }; addElement(c); }}
            onClose={() => setSelectedId(null)} />
        ) : (
          <>
            {bg && (
              <div className="panel-section">
                <h3>תמונת רקע</h3>
                <div className="small muted">{bg.sourceName}</div>
                <div className="field"><span>תצוגה</span>
                  <Seg value={d.layout} options={[{ v: 'side', label: 'תמונה לצד השרטוט' }, { v: 'overlay', label: 'שרטוט מעל התמונה' }]} onChange={(v) => setData((dd) => ({ ...dd, layout: v }))} />
                </div>
                {d.layout === 'overlay' && (
                  <>
                    <Check checked={bg.visible} onChange={(v) => setData((dd) => ({ ...dd, background: dd.background && { ...dd.background, visible: v } }))}>הצגת התמונה כשכבת רקע</Check>
                    <label className="field"><span>שקיפות התמונה</span>
                      <input type="range" min={0.1} max={1} step={0.05} value={bg.opacity} aria-label="שקיפות התמונה"
                        onChange={(e) => setData((dd) => ({ ...dd, background: dd.background && { ...dd.background, opacity: Number(e.target.value) } }), false)} />
                    </label>
                  </>
                )}
                <div className="row">
                  <button className="btn" onClick={() => setImgEdit(true)}>{Icons.rotate} סיבוב וחיתוך</button>
                  <button className={`btn ${tool === 'calibrate' ? 'active' : ''}`} onClick={() => chooseTool('calibrate')}>{Icons.calibrate} כיול קנה מידה</button>
                </div>
                {calibrated ? (
                  <div className="notice ok">{Icons.check}<span>מכויל: <span className="num">{bg.calibration?.mm}</span> מ״מ בין שתי הנקודות שסימנת. מדידות על התמונה עדיין משוערות, כי צילום יוצר עיוותים.</span></div>
                ) : (
                  <div className="notice warn">{Icons.warn}<span>התמונה לא מכוילת. כדי לשרטוט במידות, סמני על התמונה שתי נקודות שהמרחק ביניהן ידוע (למשל סרגל קנה המידה) והזיני את המרחק.</span></div>
                )}
              </div>
            )}
            <div className="panel-section">
              <h3>רשת עזר</h3>
              <Check checked={d.grid.show} onChange={(v) => setData((dd) => ({ ...dd, grid: { ...dd.grid, show: v } }))}>הצגת רשת</Check>
              <Check checked={d.grid.snap} onChange={(v) => setData((dd) => ({ ...dd, grid: { ...dd.grid, snap: v } }))}>הצמדה לרשת</Check>
              <NumberField label="גודל משבצת" unit={bg && !side && !calibrated ? 'יח׳' : 'מ״מ'} value={d.grid.size} allowEmpty={false} min={0.01}
                onChange={(v) => v && setData((dd) => ({ ...dd, grid: { ...dd.grid, size: v } }))} />
              <span className="small muted">הצמדה לקצוות ולפינות של אלמנטים פועלת תמיד (ריבוע כתום).</span>
            </div>
            <div className="panel-section">
              <Check checked={advanced} onChange={setAdvanced}>מצב מתקדם: עוד כלי שרטוט</Check>
              <div className="small muted">{d.elements.length} אלמנטים בשרטוט. כדי לערוך אלמנט, בחרי בכלי "בחירה" ולחצי עליו.</div>
            </div>
          </>
        )}
      </aside>

      <section className="stage">
        <div className="toolbar" role="toolbar" aria-label="כלי שרטוט">
          {tools.map((t) => (
            <button key={t} className={`tool ${tool === t ? 'on' : ''}`} onClick={() => chooseTool(t)} aria-pressed={tool === t}>
              {t === 'dashed' ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeDasharray="3 2.5"><path d="M5 19L19 5" /></svg> : Icons[TOOL_INFO[t].icon]}
              {TOOL_INFO[t].label}
            </button>
          ))}
          {bg && <span className="tool-sep" />}
          {bg && (['calibrate', 'measure'] as Tool[]).map((t) => (
            <button key={t} className={`tool ${tool === t ? 'on' : ''}`} onClick={() => chooseTool(t)} aria-pressed={tool === t}>{Icons[TOOL_INFO[t].icon]}{TOOL_INFO[t].label}</button>
          ))}
          {!bg && <><span className="tool-sep" /><button className={`tool ${tool === 'measure' ? 'on' : ''}`} onClick={() => chooseTool('measure')} aria-pressed={tool === 'measure'}>{Icons.ruler}מדידה</button></>}
        </div>
        {side && (
          <div className="view-tabs">
            <Seg value={mobilePane} options={[{ v: 'draw', label: 'שרטוט' }, { v: 'image', label: 'תמונת המקור' }]} onChange={setMobilePane} />
          </div>
        )}
        {side ? (
          <div className="split">
            <div className={mobilePane === 'draw' ? '' : 'hidden-mobile'}>{drawCanvas}</div>
            <div className={mobilePane === 'image' ? '' : 'hidden-mobile'}>{imageCanvas}</div>
          </div>
        ) : drawCanvas}
        <div className="hint-bar" aria-live="polite">
          {Icons.info}<span style={{ flex: 1 }}>{hint}</span>
          {tool === 'polygon' && draft.length >= 3 && <button className="btn sm primary" onClick={finishPolygon}>סיום מצולע</button>}
          {draft.length > 0 && <button className="btn sm" onClick={() => setDraft([])}>ביטול</button>}
        </div>
      </section>

      {textAt && <TextDialog onClose={() => setTextAt(null)} onSave={(text, size) => { addElement({ id: uid(), kind: 'text', p: textAt, text, size, style: 'solid', width: 0.25 }); setTextAt(null); }} />}
      {calib && <CalibrateDialog onClose={() => setCalib(null)} onSave={applyCalibration} />}
      {imgEdit && bg && <ImageEditDialog bg={bg} onClose={() => setImgEdit(false)}
        onSave={(img) => { setData((dd) => ({ ...dd, background: dd.background && { ...dd.background, dataUrl: img.dataUrl, pxW: img.w, pxH: img.h, mmPerPx: null, calibration: null } })); setImgEdit(false); toast('התמונה עודכנה. יש לכייל אותה מחדש.'); }} />}
    </div>
  );
}

function TextDialog({ onClose, onSave }: { onClose: () => void; onSave: (text: string, size: number) => void }) {
  const [text, setText] = useState('');
  const [size, setSize] = useState<number | null>(3.5);
  const ok = text.trim().length > 0 && size !== null && size > 0;
  return (
    <Dialog title="הוספת טקסט" onClose={onClose}>
      <input className="input" autoFocus value={text} placeholder="הקלידי טקסט, למשל: חתך A-A" onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && ok && onSave(text.trim(), size!)} aria-label="טקסט" />
      <NumberField label="גובה האותיות בדף המודפס" unit="מ״מ" value={size} onChange={setSize} min={0.5} max={50} />
      <div className="btns">
        <button className="btn primary" disabled={!ok} onClick={() => onSave(text.trim(), size!)}>הוספה</button>
        <button className="btn" onClick={onClose}>ביטול</button>
      </div>
    </Dialog>
  );
}

function CalibrateDialog({ onClose, onSave }: { onClose: () => void; onSave: (mm: number) => void }) {
  const [mm, setMm] = useState<number | null>(null);
  const [unit, setUnit] = useState<'mm' | 'cm' | 'm'>('mm');
  const factor = unit === 'mm' ? 1 : unit === 'cm' ? 10 : 1000;
  const ok = mm !== null && mm > 0;
  return (
    <Dialog title="כיול קנה מידה" onClose={onClose}>
      <p style={{ margin: 0 }}>מה המרחק האמיתי בין שתי הנקודות שסימנת?</p>
      <div className="row">
        <div style={{ flex: 1 }}><NumberField value={mm} onChange={setMm} min={0} ariaLabel="המרחק האמיתי" placeholder="למשל 100" /></div>
        <Seg value={unit} options={[{ v: 'mm', label: 'מ״מ' }, { v: 'cm', label: 'ס״מ' }, { v: 'm', label: 'מטר' }]} onChange={setUnit} />
      </div>
      <div className="notice info">{Icons.info}<span>כדאי לבחור מרחק ארוך ככל האפשר. מדידה מתוך צילום תמיד משוערת, כי הצילום יכול להיות מעוות או מוטה.</span></div>
      <div className="btns">
        <button className="btn primary" disabled={!ok} onClick={() => onSave(mm! * factor)}>שמירת הכיול</button>
        <button className="btn" onClick={onClose}>ביטול</button>
      </div>
    </Dialog>
  );
}

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useStore } from '../../document/store';
import { uid } from '../../document/factory';
import type { Project } from '../../document/types';
import { type Vec2, v2 } from '../../geometry/vec';
import { PanZoomCanvas, type PointerApi } from '../PanZoomCanvas';
import { addPt, boxValid, padBox, type ViewCtx } from '../../drawing/viewport';
import { renderBackground, renderGrid, bgWorldSize } from '../../drawing/drawingRender';
import { add, dist, dot, mul, norm, sub } from '../../site/poly';
import { fmtM, mToStr } from '../../site/units';
import { Dialog, toast } from '../common';
import { Icons } from '../icons';
import type { BuildingData } from '../../building/types';
import type { BuildingModel } from '../../building/model';
import { levelOf } from '../../building/model';
import { renderBuildingPlan, levelBox, furnitureSymbol, SEL } from '../../building/render/plan';
import { findEl, hitTest, moveWallEnd, nearestWall, placeOpening, snapPoint, translateIds, type SnapKind } from '../../building/edit';
import { faceAt } from '../../building/geom';
import { newBeam, newColumn, newFloorZone, newFurniture, newOpening, newRoof, newRoom, newSlab, newStair, newWall, presetOpening, richFloor } from '../../building/factories';
import { openingDef, openingPreset, fitOpening, wallLength } from '../../building/openings';
import { placeItem } from '../../building/place';
import { nextBSectionLabel } from '../../building/section';
import { furn } from '../../building/furniture';
import { useBldUi } from './bldUi';
import { MField } from '../site/fields';

type BProject = Extract<Project, { type: 'building' }>;
export type SetB = (fn: (d: BuildingData) => BuildingData, record?: boolean) => void;

const POLY_TOOLS = new Set(['roomPoly', 'slab', 'roof', 'lot', 'floorZone']);

/** Hint for the active tool, shown above the drawing. */
export function toolHint(t: ReturnType<typeof useBldUi.getState>['tool'], drafting: boolean): string {
  switch (t.t) {
    case 'select': return 'לחיצה: בחירה · Shift+לחיצה: הוספה לבחירה · גרירה: הזזה · גרירת קצה של קיר נבחר: שינוי אורך · גרירה ברקע: הזזת התצוגה';
    case 'wall': return drafting ? 'לחצי על הנקודה הבאה, או הקלידי אורך בחלונית ולחצי Enter. לחיצה על נקודת ההתחלה סוגרת. Esc או Enter מסיימים.' : 'לחצי על נקודת ההתחלה של הקיר. הקירות נצמדים לקצוות, לקירות ולרשת; זוויות של 45° נשמרות.';
    case 'room': return 'לחצי בתוך שטח סגור בקירות: החדר נוצר עם שטח והיקף מחושבים.';
    case 'roomPoly': case 'slab': case 'roof': case 'lot': case 'floorZone': return drafting ? 'לחצי על הנקודות הבאות. Enter או לחיצה על הנקודה הראשונה סוגרים.' : 'לחצי על הפינה הראשונה של הצורה.';
    case 'opening': return 'רחפי מעל קיר ולחצי כדי למקם את הפתח (הדלת נפתחת לצד שבו לחצת). הכלי נשאר פעיל; Esc לסיום, ואז לחיצה על הפתח לעריכת מידותיו.';
    case 'furniture': return 'לחצי במקום שבו יוצב הפריט. פריטי קיר נצמדים לקיר הקרוב, אביזרים מונחים על השולחן או המדף שמתחתם. R מסובב ב-90°. Esc לסיום.';
    case 'stair': return 'לחצי על אמצע המדרגה הראשונה. כיוון העלייה נקבע בחלונית (אפשר לסובב אחר כך).';
    case 'column': return 'לחצי על מיקום העמוד.';
    case 'beam': case 'dim': case 'measure': case 'section': case 'calibrate': return drafting ? 'לחצי על הנקודה השנייה.' : t.t === 'calibrate' ? 'לחצי על שתי נקודות בתוכנית שהמרחק ביניהן ידוע (למשל קו מידה).' : 'לחצי על הנקודה הראשונה.';
    case 'text': return 'לחצי במקום הטקסט.';
  }
}

export function PlanEditor({ project, model, setData, levelId }: { project: BProject; model: BuildingModel; setData: SetB; levelId: string }) {
  const d = project.data;
  const level = levelOf(d, levelId);
  const ui = useBldUi();
  const tool = ui.tool;
  const [draft, setDraft] = useState<Vec2[]>([]);
  const [hover, setHover] = useState<{ p: Vec2; kind: SnapKind } | null>(null);
  const [measure, setMeasure] = useState<[Vec2, Vec2] | null>(null);
  const [calib, setCalib] = useState<[Vec2, Vec2] | null>(null);
  const [textAt, setTextAt] = useState<Vec2 | null>(null);
  const [len, setLen] = useState<number | null>(null);
  const drag = useRef<null | { kind: 'move'; start: Vec2; ids: string[]; orig: BuildingData; moved: boolean } | { kind: 'end'; wallId: string; end: 'a' | 'b'; orig: BuildingData; moved: boolean } | { kind: 'opening'; id: string; orig: BuildingData; moved: boolean; off: number }>(null);
  const kRef = useRef(1);
  const lastClick = useRef(0);

  useEffect(() => { setDraft([]); setMeasure(null); setLen(null); }, [tool, levelId]);

  const lm = model.levels.find((l) => l.level.id === levelId);
  const sorted = [...d.levels].sort((a, b) => a.elevation - b.elevation);
  const below = sorted[sorted.findIndex((l) => l.id === levelId) - 1];
  const ghost = ui.ghost && below ? model.levels.find((l) => l.level.id === below.id) ?? null : null;
  const phase = d.renovation ? d.drawPhase : 'new';

  const box = useMemo(() => {
    let b = levelBox(d, model, levelId, true);
    if (level.background) { const { w, h } = bgWorldSize(level.background); b = addPt(addPt(b, level.bgOrigin), add(level.bgOrigin, v2(w, h))); }
    if (!boxValid(b)) b = { minX: -1000, minY: -1000, maxX: 12000, maxY: 9000 };
    return padBox(b, 1500);
  }, [d, model, levelId, level.background, level.bgOrigin]);

  const tolPx = 9;
  const snap = (w: Vec2, opts: { from?: Vec2 | null; free?: boolean } = {}) => {
    const tol = tolPx / kRef.current;
    if (opts.free) return { p: w, kind: null as SnapKind };
    return snapPoint(d, levelId, w, tol, { grid: true, from: opts.from ?? null, ortho: !!opts.from, extra: draft });
  };

  const add1 = (fn: (dd: BuildingData) => BuildingData) => setData(fn);

  const finishPoly = (pts: Vec2[]) => {
    if (pts.length < 3) { toast('צריך לפחות 3 נקודות.'); return; }
    const id = uid();
    if (tool.t === 'roomPoly') add1((dd) => ({ ...dd, rooms: [...dd.rooms, newRoom(id, levelId, ui.presets.roomName || `חדר ${dd.rooms.length + 1}`, centroidSimple(pts), { mode: 'manual', pts })] }));
    else if (tool.t === 'slab') add1((dd) => ({ ...dd, slabs: [...dd.slabs, newSlab(id, levelId, tool.kind, pts, level, phase)] }));
    else if (tool.t === 'roof') add1((dd) => ({ ...dd, roofs: [...dd.roofs, newRoof(id, levelId, pts, level, phase)] }));
    else if (tool.t === 'lot') add1((dd) => ({ ...dd, lot: pts }));
    else if (tool.t === 'floorZone') add1((dd) => ({ ...dd, floorZones: [...(dd.floorZones ?? []), newFloorZone(id, levelId, pts, richFloor('tile-hex'), `אזור רצפה ${(dd.floorZones ?? []).filter((z) => z.levelId === levelId).length + 1}`)] }));
    setDraft([]);
    if (tool.t !== 'lot') useBldUi.setState({ tool: { t: 'select' }, sel: [id] });
    else useBldUi.setState({ tool: { t: 'select' } });
  };

  // Typed length for the next wall segment (metres in the panel, mm here).
  const addWallSegment = (from: Vec2, to: Vec2) => {
    if (dist(from, to) < 10) return false;
    const id = uid();
    add1((dd) => ({ ...dd, walls: [...dd.walls, newWall(id, levelId, from, to, { thickness: ui.presets.wallThickness, height: ui.presets.wallHeight, kind: ui.presets.wallKind, phase })] }));
    return true;
  };

  const keyHandler = useRef<(e: KeyboardEvent) => void>(() => {});
  keyHandler.current = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement;
    const inField = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT');
    if (e.key === 'Escape') { if (draft.length) setDraft([]); else if (tool.t !== 'select') ui.setTool({ t: 'select' }); else ui.select([]); setMeasure(null); return; }
    if (e.key === 'Enter') {
      if (tool.t === 'wall' && draft.length && inField && len && hover) {
        const from = draft[draft.length - 1];
        const dir = dist(hover.p, from) > 1 ? norm(sub(hover.p, from)) : v2(1, 0);
        const to = add(from, mul(dir, len));
        if (addWallSegment(from, to)) setDraft([...draft, to]);
        e.preventDefault();
        return;
      }
      if (inField) return;
      if (tool.t === 'wall') setDraft([]);
      else if (POLY_TOOLS.has(tool.t) && draft.length) finishPoly(draft);
      return;
    }
    if (inField) return;
    if (e.key === 'Backspace' && draft.length) { e.preventDefault(); setDraft(draft.slice(0, -1)); return; }
    if (tool.t === 'furniture' && e.key.toLowerCase() === 'r') { useBldUi.setState({ presets: { ...ui.presets, furnRot: (ui.presets.furnRot + (e.shiftKey ? -90 : 90)) % 360 } }); }
  };
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (document.querySelector('.overlay')) return; const tb = useBldUi.getState().tab; if (tb === 'plan' || tb === 'sections') keyHandler.current(e); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);

  const pointer: PointerApi = {
    down: (e, w) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return false;
      const tol = tolPx / kRef.current;
      if (tool.t === 'select') {
        // Ends of a selected wall.
        if (ui.sel.length === 1) {
          const wl = d.walls.find((x) => x.id === ui.sel[0]);
          if (wl) for (const end of ['a', 'b'] as const) if (dist(wl[end], w) < tol * 1.4) { drag.current = { kind: 'end', wallId: wl.id, end, orig: d, moved: false }; return true; }
        }
        const id = hitTest(d, model, levelId, w, tol);
        if (!id) { if (!e.shiftKey) ui.select([]); return false; }
        const locked = level.bgLocked && false;
        void locked;
        if (e.shiftKey) { ui.select(ui.sel.includes(id) ? ui.sel.filter((x) => x !== id) : [...ui.sel, id]); return true; }
        const ids = ui.sel.includes(id) ? ui.sel : [id];
        if (!ui.sel.includes(id)) ui.select([id]);
        const f = findEl(d, id);
        if (f?.type === 'opening' && ids.length === 1) {
          const o = d.openings.find((x) => x.id === id)!;
          const wl = d.walls.find((x) => x.id === o.wallId)!;
          const u = norm(sub(wl.b, wl.a));
          drag.current = { kind: 'opening', id, orig: d, moved: false, off: dot(sub(w, wl.a), u) - o.pos };
        } else drag.current = { kind: 'move', start: w, ids, orig: d, moved: false };
        return true;
      }
      const sp = (tool.t === 'wall' || POLY_TOOLS.has(tool.t) || tool.t === 'beam' || tool.t === 'measure' || tool.t === 'dim' || tool.t === 'section') && draft.length
        ? snap(w, { from: draft[draft.length - 1], free: e.altKey })
        : snap(w, { free: e.altKey || tool.t === 'calibrate' });
      const p = sp.p;
      switch (tool.t) {
        case 'wall': {
          const now = Date.now();
          const dbl = now - lastClick.current < 350;
          lastClick.current = now;
          if (!draft.length) { setDraft([p]); return true; }
          const from = draft[draft.length - 1];
          if (dbl && dist(from, p) < tol * 2) { setDraft([]); return true; }
          if (addWallSegment(from, p)) {
            if (draft.length >= 2 && dist(p, draft[0]) < 1) setDraft([]); else setDraft([...draft, p]);
          }
          return true;
        }
        case 'roomPoly': case 'slab': case 'roof': case 'lot': {
          if (draft.length >= 3 && dist(p, draft[0]) < tol * 1.5) { finishPoly(draft); return true; }
          setDraft([...draft, p]);
          return true;
        }
        case 'room': {
          const f = lm ? faceAt(lm.faces, w) : null;
          if (!f) { toast('הנקודה אינה בתוך שטח סגור בקירות. סגרי את הקירות, או השתמשי ב"מצולע ידני".'); return true; }
          // One automatic room per closed area.
          const same = lm?.rooms.find((r) => r.room.mode === 'auto' && r.room.levelId === levelId && faceAt(lm.faces, r.room.seed) === f);
          if (same) { toast(`כבר יש חדר באזור הזה ("${same.room.name}"). הוא נבחר לעריכה.`); useBldUi.setState({ tool: { t: 'select' }, sel: [same.room.id] }); return true; }
          const id = uid();
          add1((dd) => ({ ...dd, rooms: [...dd.rooms, newRoom(id, levelId, ui.presets.roomName || `חדר ${dd.rooms.filter((r) => r.levelId === levelId).length + 1}`, w, d.renovation ? { state: d.drawPhase === 'existing' ? 'existing' : 'proposed' } : {})] }));
          useBldUi.setState({ tool: { t: 'select' }, sel: [id] });
          return true;
        }
        case 'opening': {
          const nw = nearestWall(d, levelId, w, tol * 2);
          if (!nw) { toast('יש ללחוץ על קיר.'); return true; }
          const def = openingDef(tool.kind);
          const id = uid();
          const pr = openingPreset(tool.preset);
          const base0 = pr ? presetOpening(id, nw.wall.id, pr, 0, { phase }) : newOpening(id, nw.wall.id, tool.kind, 0, { phase });
          const base = { ...base0, width: ui.presets.openW ?? pr?.w ?? def.w, height: ui.presets.openH ?? pr?.h ?? def.h, sill: def.door ? 0 : ui.presets.openSill ?? pr?.sill ?? def.sill };
          const wh = nw.wall.height ?? level.ceilingHeight;
          if (base.sill + base.height > wh) { toast(`הפתח גבוה מהקיר (${fmtM(wh)}).`); return true; }
          const r = placeOpening(d, nw.wall, base, nw.s);
          if ('error' in r) { toast(r.error); return true; }
          // Door swing towards the side the user clicked on.
          const n = v2(-(nw.wall.b.y - nw.wall.a.y), nw.wall.b.x - nw.wall.a.x);
          const side = dot(sub(w, nw.wall.a), n) >= 0 ? 'L' : 'R';
          add1((dd) => ({ ...dd, openings: [...dd.openings, { ...r.o, side }] }));
          return true;
        }
        case 'furniture': {
          const id = uid();
          const pl = placeItem(d, model, level, tool.kind, p, ui.presets.furnRot);
          if (pl.note) toast(pl.note);
          else if (pl.on) { const u = d.furniture.find((x) => x.id === pl.on); if (u) toast(`הפריט הונח על "${furn(u.kind).label}" בגובה ${(pl.elev / 1000).toFixed(2)} מ׳.`); }
          add1((dd) => ({ ...dd, furniture: [...dd.furniture, newFurniture(id, levelId, tool.kind, pl.p, pl.rot, phase, { elev: pl.elev })] }));
          return true;
        }
        case 'stair': {
          const id = uid();
          add1((dd) => ({ ...dd, stairs: [...dd.stairs, newStair(id, dd, level, p, 0, phase)] }));
          useBldUi.setState({ tool: { t: 'select' }, sel: [id] });
          return true;
        }
        case 'column': {
          const id = uid();
          add1((dd) => ({ ...dd, columns: [...dd.columns, newColumn(id, levelId, p, phase)] }));
          return true;
        }
        case 'beam': case 'dim': case 'measure': case 'section': case 'calibrate': {
          if (!draft.length) { setDraft([p]); setMeasure(null); return true; }
          const a = draft[0];
          setDraft([]);
          if (dist(a, p) < 1) return true;
          if (tool.t === 'beam') { const id = uid(); add1((dd) => ({ ...dd, beams: [...dd.beams, newBeam(id, levelId, a, p, phase)] })); }
          else if (tool.t === 'dim') { const id = uid(); add1((dd) => ({ ...dd, annotations: [...dd.annotations, { id, levelId, type: 'dim', a, b: p, offset: 600 }] })); }
          else if (tool.t === 'measure') setMeasure([a, p]);
          else if (tool.t === 'calibrate') setCalib([a, p]);
          else {
            const id = uid();
            add1((dd) => ({ ...dd, sections: [...dd.sections, { id, label: nextBSectionLabel(dd.sections), mode: 'section', a, b: p, side: 1, depth: 30000, showDims: true, showLevels: true, showFurniture: true }] }));
            if (useBldUi.getState().tab !== 'sections') toast('נוצר קו חתך. החתך מוצג בלשונית "חתכים וחזיתות".');
            useBldUi.setState({ tool: { t: 'select' } });
          }
          return true;
        }
        case 'text': setTextAt(p); return true;
      }
      return false;
    },
    move: (e, w) => {
      const dr = drag.current;
      if (!dr) return;
      const tol = tolPx / kRef.current;
      if (!dr.moved) { dr.moved = true; useStore.getState().checkpoint(project.id); }
      if (dr.kind === 'move') {
        let dv = sub(w, dr.start);
        if (d.grid.snap && !e.altKey) { const g = d.grid.size; dv = v2(Math.round(dv.x / g) * g, Math.round(dv.y / g) * g); }
        setData(() => translateIds(dr.orig, dr.ids, dv), false);
      } else if (dr.kind === 'end') {
        const wl = dr.orig.walls.find((x) => x.id === dr.wallId)!;
        const other = dr.end === 'a' ? wl.b : wl.a;
        const sp = e.altKey ? { p: w } : snapPoint({ ...dr.orig, walls: dr.orig.walls.filter((x) => x.id !== dr.wallId) }, levelId, w, tol, { grid: true, from: other, ortho: true });
        setData(() => moveWallEnd(dr.orig, dr.wallId, dr.end, sp.p), false);
        setHover({ p: sp.p, kind: 'end' });
      } else {
        const o = dr.orig.openings.find((x) => x.id === dr.id)!;
        const wl = dr.orig.walls.find((x) => x.id === o.wallId)!;
        const u = norm(sub(wl.b, wl.a));
        let s = dot(sub(w, wl.a), u) - dr.off;
        if (!e.altKey) s = Math.round(s / 50) * 50;
        const pos = fitOpening(wl, dr.orig.openings, o.width, s, o.id, o.phase);
        if (pos !== null) setData(() => ({ ...dr.orig, openings: dr.orig.openings.map((x) => (x.id === o.id ? { ...x, pos } : x)) }), false);
      }
    },
    up: () => { drag.current = null; setHover(null); },
    hover: (w) => {
      if (!w) { setHover(null); return; }
      if (tool.t === 'select' || tool.t === 'room') { setHover(null); return; }
      const from = draft.length ? draft[draft.length - 1] : null;
      setHover(snap(w, { from: tool.t === 'calibrate' ? null : from, free: tool.t === 'calibrate' }));
    },
  };

  const selSet = useMemo(() => new Set(ui.sel), [ui.sel]);
  const warnSet = useMemo(() => new Set(model.warnings.map((x) => x.id)), [model.warnings]);

  const render = (ctx: ViewCtx, _inv: (q: Vec2) => Vec2, size: { w: number; h: number }) => {
    kRef.current = ctx.k;
    const nodes: ReactNode[] = [];
    const vb = { minX: _inv(v2(0, size.h)).x, minY: _inv(v2(0, size.h)).y, maxX: _inv(v2(size.w, 0)).x, maxY: _inv(v2(size.w, 0)).y };
    if (level.background && level.background.visible) {
      const o = level.bgOrigin;
      const c2: ViewCtx = { ...ctx, T: (p) => ctx.T(add(p, o)) };
      nodes.push(<g key="bg">{renderBackground(level.background, c2)}</g>);
    }
    if (d.grid.show && d.grid.size * ctx.k >= 6) nodes.push(<g key="grid">{renderGrid(d.grid.size, ctx, vb)}</g>);
    nodes.push(<g key="plan">{renderBuildingPlan(d, model, levelId, ctx, { selected: selSet, furniture: true, ghost, sections: d.sections, dims: false, warn: warnSet })}</g>);
    // Handles: ends of the selected wall, and its length.
    if (ui.sel.length === 1) {
      const wl = d.walls.find((x) => x.id === ui.sel[0]);
      if (wl) {
        for (const p of [wl.a, wl.b]) { const q = ctx.T(p); nodes.push(<rect key={`h${p.x},${p.y}`} x={q.x - 6} y={q.y - 6} width={12} height={12} fill="#fff" stroke={SEL} strokeWidth={2} />); }
        const m = ctx.T(v2((wl.a.x + wl.b.x) / 2, (wl.a.y + wl.b.y) / 2));
        nodes.push(<text key="wlen" x={m.x} y={m.y - 14} fontSize={13} textAnchor="middle" fill={SEL} fontFamily="Rubik, Arial, sans-serif" fontWeight={700} direction="ltr">{`${mToStr(wallLength(wl), 2)} m`}</text>);
      }
    }
    // Drafts and previews.
    const hp = hover?.p;
    if (draft.length) {
      const pts = hp ? [...draft, hp] : draft;
      const s = pts.map((p) => ctx.T(p));
      nodes.push(<polyline key="draft" points={s.map((q) => `${q.x},${q.y}`).join(' ')} fill="none" stroke={SEL} strokeWidth={tool.t === 'wall' ? Math.max(2, ui.presets.wallThickness * ctx.k) : 2} strokeOpacity={tool.t === 'wall' ? 0.45 : 1} strokeDasharray={tool.t === 'wall' ? undefined : '6 4'} />);
      if (hp) {
        const a = draft[draft.length - 1];
        const m = ctx.T(v2((a.x + hp.x) / 2, (a.y + hp.y) / 2));
        nodes.push(<text key="dl" x={m.x} y={m.y - 10} fontSize={13} textAnchor="middle" fill={SEL} fontFamily="Rubik, Arial, sans-serif" fontWeight={700} direction="ltr">{`${mToStr(dist(a, hp), 2)} m`}</text>);
      }
      for (const [i, q] of s.entries()) if (i < draft.length) nodes.push(<circle key={`dp${i}`} cx={q.x} cy={q.y} r={4} fill="#fff" stroke={SEL} strokeWidth={2} />);
    }
    if (hp && tool.t === 'opening') {
      const nw = nearestWall(d, levelId, hp, (tolPx * 2) / ctx.k);
      if (nw) {
        const def = openingDef(tool.kind);
        const w = ui.presets.openW ?? openingPreset(tool.preset)?.w ?? def.w;
        const pos = fitOpening(nw.wall, d.openings, w, nw.s, undefined, phase);
        const u = norm(sub(nw.wall.b, nw.wall.a));
        if (pos !== null) { const a = ctx.T(add(nw.wall.a, mul(u, pos - w / 2))), b = ctx.T(add(nw.wall.a, mul(u, pos + w / 2))); nodes.push(<line key="opv" x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={SEL} strokeWidth={Math.max(4, nw.wall.thickness * ctx.k)} strokeOpacity={0.6} />); }
      }
    }
    if (hp && tool.t === 'furniture') {
      const pl = placeItem(d, model, level, tool.kind, hp, ui.presets.furnRot);
      const f = newFurniture('pv', levelId, tool.kind, pl.p, pl.rot, 'new', { elev: pl.elev });
      nodes.push(<g key="fpv" opacity={0.6}>{furnitureSymbol(f, ctx, { color: SEL })}</g>);
    }
    if (hp && hover?.kind) {
      const q = ctx.T(hp);
      nodes.push(hover.kind === 'end' ? <rect key="sn" x={q.x - 5} y={q.y - 5} width={10} height={10} fill="none" stroke="#1f6feb" strokeWidth={2} /> : hover.kind === 'mid' ? <path key="sn" d={`M${q.x} ${q.y - 6}L${q.x + 6} ${q.y + 5}L${q.x - 6} ${q.y + 5}Z`} fill="none" stroke="#1f6feb" strokeWidth={2} /> : <circle key="sn" cx={q.x} cy={q.y} r={4} fill="#1f6feb" />);
    }
    if (measure) {
      const [a, b] = measure.map((p) => ctx.T(p));
      const dd = dist(measure[0], measure[1]);
      const ang = (Math.atan2(measure[1].y - measure[0].y, measure[1].x - measure[0].x) * 180) / Math.PI;
      nodes.push(<g key="ms"><line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#1f6feb" strokeWidth={2} /><text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 10} fontSize={14} textAnchor="middle" fill="#1f6feb" fontWeight={700} fontFamily="Rubik, Arial, sans-serif" direction="ltr">{`${mToStr(dd, 3)} m · ${ang.toFixed(1)}°`}</text></g>);
    }
    return nodes;
  };

  const hint = toolHint(tool, draft.length > 0);

  return (
    <div className="stage-col">
      <div className="hint-bar small" role="status">
        {Icons.info}<span>{hint}</span>
        {tool.t === 'wall' && draft.length > 0 && (
          <span className="row" style={{ gap: 6, marginInlineStart: 'auto' }}>
            <span style={{ width: 120 }}><MField value={len} onChange={setLen} ariaLabel="אורך הקטע הבא" placeholder="אורך" /></span>
          </span>
        )}
        {tool.t === 'furniture' && <span style={{ marginInlineStart: 'auto' }}>{furn(tool.kind).label} · סיבוב {ui.presets.furnRot}°</span>}
      </div>
      <PanZoomCanvas box={box} fitKey={`${project.id}-${levelId}`} render={render} pointer={pointer} testId="bld-plan" cursor={tool.t === 'select' ? 'default' : 'crosshair'}
        label={<span>{level.name} · {d.renovation ? ({ existing: 'מצב קיים', demolition: 'תוכנית הריסה', proposed: 'מצב מוצע', compare: 'השוואה' } as const)[ui.state] : 'תוכנית'}</span>} />
      {calib && <CalibrateDialog meas={dist(calib[0], calib[1])} onClose={() => setCalib(null)} onSave={(mm) => {
        const bg = level.background;
        if (!bg) { setCalib(null); return; }
        const k = mm / dist(calib[0], calib[1]);
        const mmPerPx = (bg.mmPerPx ?? 1) * k;
        // Keep the first clicked point where it is.
        const o = level.bgOrigin;
        const rel = sub(calib[0], o);
        const newO = sub(calib[0], mul(rel, k));
        setData((dd) => ({ ...dd, levels: dd.levels.map((l) => (l.id === levelId && l.background ? { ...l, background: { ...l.background, mmPerPx, calibration: { a: calib[0], b: calib[1], mm } }, bgOrigin: newO } : l)) }));
        setCalib(null);
        useBldUi.setState({ tool: { t: 'select' } });
        toast('קנה המידה של התוכנית כויל.');
      }} />}
      {textAt && <TextDialog onClose={() => setTextAt(null)} onSave={(text) => { const id = uid(); setData((dd) => ({ ...dd, annotations: [...dd.annotations, { id, levelId, type: 'text', p: textAt, text, size: 3 }] })); setTextAt(null); }} />}
    </div>
  );
}

function centroidSimple(pts: Vec2[]): Vec2 {
  return v2(pts.reduce((a, p) => a + p.x, 0) / pts.length, pts.reduce((a, p) => a + p.y, 0) / pts.length);
}

function CalibrateDialog({ meas, onClose, onSave }: { meas: number; onClose: () => void; onSave: (mm: number) => void }) {
  const [v, setV] = useState<number | null>(null);
  return (
    <Dialog title="כיול קנה מידה" onClose={onClose}>
      <p style={{ margin: 0 }}>מה המרחק האמיתי בין שתי הנקודות שסימנת? (נמדד כעת: {mToStr(meas, 3)} יחידות)</p>
      <MField label="המרחק האמיתי" value={v} onChange={setV} min={1} />
      <div className="small muted">יש להזין מידה ידועה מהתוכנית (למשל קו מידה רשום). האפליקציה אינה משלימה מידות חסרות.</div>
      <div className="btns"><button className="btn primary" disabled={!v} onClick={() => v && onSave(v)}>כיול</button><button className="btn" onClick={onClose}>ביטול</button></div>
    </Dialog>
  );
}

function TextDialog({ onClose, onSave }: { onClose: () => void; onSave: (t: string) => void }) {
  const [t, setT] = useState('');
  return (
    <Dialog title="טקסט בתוכנית" onClose={onClose}>
      <input className="input" autoFocus value={t} onChange={(e) => setT(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && t.trim() && onSave(t.trim())} aria-label="טקסט" />
      <div className="btns"><button className="btn primary" disabled={!t.trim()} onClick={() => onSave(t.trim())}>הוספה</button><button className="btn" onClick={onClose}>ביטול</button></div>
    </Dialog>
  );
}

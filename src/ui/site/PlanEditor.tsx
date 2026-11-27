import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useStore } from '../../document/store';
import { uid } from '../../document/factory';
import type { Project } from '../../document/types';
import { type Vec2, v2 } from '../../geometry/vec';
import { renderBackground, renderGrid } from '../../drawing/drawingRender';
import { boxValid, padBox, type Box, type ViewCtx } from '../../drawing/viewport';
import { PanZoomCanvas } from '../PanZoomCanvas';
import { Dialog, toast } from '../common';
import { Icons } from '../icons';
import type { SiteData, SiteElement, SiteSection } from '../../site/types';
import { lib, makeElement, prm } from '../../site/library';
import { elementOutline } from '../../site/outline';
import { dist, localToWorld, rectAround } from '../../site/poly';
import { hitElement, elementsInBox, rotateEl, snapPoint, translateEl, type SnapKind, normAngle } from '../../site/edit';
import { renderSitePlan, renderSectionMarks, SELECT_COLOR } from '../../site/render/plan';
import type { SiteModel } from '../../site/section';
import { nextSectionLabel } from '../../site/section';
import { slopeBetween, type Contour } from '../../site/terrain';
import { fmtLevel, fmtM, fmtSlope, mToStr, parseMetersToMm } from '../../site/units';
import { useSiteUi, type SiteTool } from './siteUi';
import { MField } from './fields';

type SProject = Extract<Project, { type: 'site' }>;

const SNAP_PX = 12;

export const toolHint = (tool: SiteTool, draftLen: number, areaMode: 'polygon' | 'rect'): string => {
  switch (tool.t) {
    case 'select': return 'לחצי על אלמנט כדי לבחור ולגרור. Shift+לחיצה מוסיפה לבחירה. גרירה ברקע עם העכבר בוחרת כמה אלמנטים; גרירה באצבע מזיזה את התצוגה.';
    case 'measure': return draftLen ? 'לחצי על הנקודה השנייה. יוצגו המרחק, הפרש הגובה והשיפוע.' : 'מדידה ושיפוע: לחצי על נקודה ראשונה.';
    case 'hpoint': return 'לחצי במקום שבו ידוע הגובה. תתבקשי להזין את הגובה ואת מקור הנתון.';
    case 'mound': return 'לחצי במרכז הגבעה או השקע.';
    case 'section': return draftLen ? 'לחצי על סוף קו החתך.' : 'קו חתך: לחצי על תחילת הקו. אפשר לחתוך בכל זווית.';
    case 'calibrate': return draftLen ? 'לחצי על הנקודה השנייה שהמרחק אליה ידוע.' : 'כיול הרקע: לחצי על נקודה ראשונה שהמרחק שלה ידוע (למשל קצה של מידה במפה).';
    case 'place': {
      const L = lib(tool.kind);
      if (L.geom === 'point') return `הצבת ${L.label}: לחצי במקום הרצוי. אפשר להציב כמה פעמים. Esc לסיום.`;
      if (L.geom === 'dim') return draftLen ? 'לחצי על סוף המידה.' : 'קו מידה: לחצי על תחילת המידה.';
      if (L.geom === 'line') return draftLen < 2 ? `${L.label}: לחצי על נקודות לאורך הקו.` : `${L.label}: המשיכי להוסיף נקודות. לסיום לחצי שוב על הנקודה האחרונה, Enter או "סיום".`;
      if (areaMode === 'rect') return draftLen ? 'לחצי על הפינה הנגדית של המלבן.' : `${L.label}: לחצי על פינה אחת של המלבן.`;
      return draftLen < 3 ? `${L.label}: לחצי על הקודקודים אחד אחרי השני.` : `${L.label}: לסיום לחצי על הקודקוד הראשון, Enter או "סיום".`;
    }
  }
};

interface Props {
  project: SProject;
  model: SiteModel;
  contours: Contour[] | null;
  mode: 'plan' | 'topo' | 'sections';
  setData: (fn: (d: SiteData) => SiteData, record?: boolean) => void;
}

type Drag =
  | { t: 'move'; start: Vec2; orig: SiteElement[]; moved: boolean }
  | { t: 'vertex'; id: string; index: number; which: 'pts' | 'a' | 'b'; orig: SiteElement }
  | { t: 'rotate'; id: string; orig: SiteElement }
  | { t: 'hp'; id: string; start: Vec2; orig: Vec2 }
  | { t: 'mound'; id: string; start: Vec2; orig: Vec2 }
  | { t: 'secEnd'; id: string; which: 'a' | 'b' }
  | { t: 'marquee'; start: Vec2; cur: Vec2; add: boolean };

export function PlanEditor({ project, model, contours, mode, setData }: Props) {
  const d = project.data;
  const ui = useSiteUi();
  const { tool, sel, areaMode } = ui;
  const [draft, setDraft] = useState<Vec2[]>([]);
  const [hover, setHover] = useState<{ p: Vec2; kind: SnapKind } | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [dialog, setDialog] = useState<null | { t: 'hpoint'; p: Vec2 } | { t: 'mound'; p: Vec2 } | { t: 'text'; p: Vec2 } | { t: 'calib'; a: Vec2; b: Vec2 }>(null);
  const kRef = useRef(1);
  const downAt = useRef<Vec2 | null>(null);

  const layerOf = useMemo(() => new Map(d.layers.map((l) => [l.id, l])), [d.layers]);
  const editable = useMemo(() => d.elements.filter((e) => { const l = layerOf.get(e.layer); return l?.visible !== false && !l?.locked; }), [d.elements, layerOf]);
  const visibleEls = useMemo(() => d.elements.filter((e) => layerOf.get(e.layer)?.visible !== false), [d.elements, layerOf]);
  const selSet = useMemo(() => new Set(sel), [sel]);
  const selected = d.elements.filter((e) => selSet.has(e.id));
  const single = selected.length === 1 ? selected[0] : null;
  const tolW = () => SNAP_PX / kRef.current;

  const snap = (w: Vec2, exclude?: string, alt = false) => (alt ? { p: w, kind: null as SnapKind } : snapPoint(d, exclude ? visibleEls.filter((e) => e.id !== exclude) : visibleEls, w, tolW(), draft));

  const addElements = (els: SiteElement[]) => {
    setData((dd) => ({ ...dd, elements: [...dd.elements, ...els] }));
    ui.select(els.map((e) => e.id));
  };

  // ---------- creating elements ----------
  const finishDraft = (pts = draft) => {
    if (tool.t !== 'place') return;
    const L = lib(tool.kind);
    if (L.geom === 'line') {
      if (pts.length < 2) { toast('קו צריך לפחות שתי נקודות'); return; }
      addElements([makeElement(tool.kind, { type: 'line', pts, curved: ui.curved }, uid())]);
    } else if (L.geom === 'area') {
      if (pts.length < 3) { toast('שטח צריך לפחות שלושה קודקודים'); return; }
      addElements([makeElement(tool.kind, { type: 'area', pts, curved: ui.curved }, uid())]);
    }
    setDraft([]);
  };

  const place = (p: Vec2) => {
    const pts = [...draft, p];
    switch (tool.t) {
      case 'place': {
        const L = lib(tool.kind);
        if (L.geom === 'point') {
          if (tool.kind === 'text') { setDialog({ t: 'text', p }); return; }
          addElements([makeElement(tool.kind, { type: 'point', p, rot: 0 }, uid())]);
          return;
        }
        if (L.geom === 'dim') {
          if (pts.length < 2) { setDraft(pts); return; }
          if (dist(pts[0], pts[1]) < 1) return;
          addElements([makeElement('dim', { type: 'dim', a: pts[0], b: pts[1], offset: 1500 }, uid())]);
          setDraft([]);
          return;
        }
        if (L.geom === 'area' && areaMode === 'rect') {
          if (pts.length < 2) { setDraft(pts); return; }
          const [a, b] = pts;
          if (Math.abs(a.x - b.x) < 1 || Math.abs(a.y - b.y) < 1) return;
          addElements([makeElement(tool.kind, { type: 'area', pts: [v2(Math.min(a.x, b.x), Math.min(a.y, b.y)), v2(Math.max(a.x, b.x), Math.min(a.y, b.y)), v2(Math.max(a.x, b.x), Math.max(a.y, b.y)), v2(Math.min(a.x, b.x), Math.max(a.y, b.y))], curved: false }, uid())]);
          setDraft([]);
          return;
        }
        const tol = tolW();
        if (L.geom === 'area' && draft.length >= 3 && dist(p, draft[0]) < tol) { finishDraft(); return; }
        if (draft.length >= 2 && dist(p, draft[draft.length - 1]) < tol) { finishDraft(); return; }
        if (draft.length && dist(p, draft[draft.length - 1]) < 1) return;
        setDraft(pts);
        return;
      }
      case 'measure':
        if (pts.length < 2) { setDraft(pts); useSiteUi.setState({ measure: null }); return; }
        useSiteUi.setState({ measure: { a: pts[0], b: pts[1] } });
        setDraft([]);
        return;
      case 'section': {
        if (pts.length < 2) { setDraft(pts); return; }
        if (dist(pts[0], pts[1]) < 500) { toast('קו החתך קצר מדי'); return; }
        const s: SiteSection = { id: uid(), label: nextSectionLabel(d.sections), mode: 'section', a: pts[0], b: pts[1], side: 1, depth: 15000, showDims: true, showLevels: true };
        setData((dd) => ({ ...dd, sections: [...dd.sections, s] }));
        useSiteUi.setState({ selSection: s.id });
        setDraft([]);
        toast(`נוצר חתך ${s.label}-${s.label}. אפשר לראות אותו בלשונית "חתכים".`);
        return;
      }
      case 'calibrate':
        if (pts.length < 2) { setDraft(pts); return; }
        if (dist(pts[0], pts[1]) < 1) return;
        setDialog({ t: 'calib', a: pts[0], b: pts[1] });
        setDraft([]);
        return;
      case 'hpoint': setDialog({ t: 'hpoint', p }); return;
      case 'mound': setDialog({ t: 'mound', p }); return;
      default:
    }
  };

  // ---------- handles of the single selection ----------
  const handles = (): { p: Vec2; kind: 'vertex' | 'rotate'; index: number; which: 'pts' | 'a' | 'b' }[] => {
    if (!single || mode !== 'plan') return [];
    const g = single.geom;
    if (g.type === 'line' || g.type === 'area') return g.pts.map((p, i) => ({ p, kind: 'vertex' as const, index: i, which: 'pts' as const }));
    if (g.type === 'dim') return [{ p: g.a, kind: 'vertex', index: 0, which: 'a' }, { p: g.b, kind: 'vertex', index: 0, which: 'b' }];
    if (lib(single.kind).footprint === 'rect' && single.kind !== 'text') {
      const dd = prm(single, 'd');
      return [{ p: localToWorld(g.p, g.rot, v2(0, dd / 2 + 14 / kRef.current)), kind: 'rotate', index: 0, which: 'pts' }];
    }
    return [];
  };

  const hitTerrain = (w: Vec2) => {
    const tol = tolW();
    for (const hp of d.terrain.points) if (dist(hp.p, w) < tol) return { t: 'hp' as const, id: hp.id, p: hp.p };
    for (const m of d.terrain.mounds) if (dist(m.c, w) < tol * 1.5) return { t: 'mound' as const, id: m.id, p: m.c };
    return null;
  };

  const pointer = {
    down: (e: React.PointerEvent, w: Vec2) => {
      if (e.button === 2) return false;
      const alt = e.altKey;
      if (tool.t === 'select') {
        // Handles first.
        for (const h of handles()) if (dist(h.p, w) < tolW()) {
          useStore.getState().checkpoint(project.id);
          setDrag(h.kind === 'rotate' ? { t: 'rotate', id: single!.id, orig: single! } : { t: 'vertex', id: single!.id, index: h.index, which: h.which, orig: single! });
          return true;
        }
        if (mode === 'sections' && ui.selSection) {
          const s = d.sections.find((x) => x.id === ui.selSection);
          if (s) for (const which of ['a', 'b'] as const) if (dist(s[which], w) < tolW()) { useStore.getState().checkpoint(project.id); setDrag({ t: 'secEnd', id: s.id, which }); return true; }
        }
        if (mode === 'topo') {
          const ht = hitTerrain(w);
          if (ht) {
            useSiteUi.setState(ht.t === 'hp' ? { selHp: ht.id, selMound: null, sel: [] } : { selMound: ht.id, selHp: null, sel: [] });
            useStore.getState().checkpoint(project.id);
            setDrag({ t: ht.t, id: ht.id, start: w, orig: ht.p });
            return true;
          }
        }
        if (mode === 'sections') {
          for (const s of d.sections) {
            const L = dist(s.a, s.b);
            const t = Math.max(0, Math.min(1, ((w.x - s.a.x) * (s.b.x - s.a.x) + (w.y - s.a.y) * (s.b.y - s.a.y)) / (L * L)));
            const q = v2(s.a.x + (s.b.x - s.a.x) * t, s.a.y + (s.b.y - s.a.y) * t);
            if (dist(q, w) < tolW()) { useSiteUi.setState({ selSection: s.id }); return true; }
          }
          return false;
        }
        const hit = mode === 'plan' ? hitElement(editable, w, tolW()) : null;
        if (hit) {
          if (e.shiftKey || e.ctrlKey || e.metaKey) {
            ui.select(selSet.has(hit.id) ? sel.filter((x) => x !== hit.id) : [...sel, hit.id]);
            return true;
          }
          const ids = selSet.has(hit.id) ? sel : [hit.id];
          if (!selSet.has(hit.id)) ui.select(ids);
          setDrag({ t: 'move', start: w, orig: d.elements.filter((x) => ids.includes(x.id)), moved: false });
          void alt;
          return true;
        }
        if (mode === 'plan' && e.pointerType === 'mouse') { setDrag({ t: 'marquee', start: w, cur: w, add: e.shiftKey }); return true; }
        if (mode === 'plan') ui.select([]);
        if (mode === 'topo') useSiteUi.setState({ selHp: null, selMound: null });
        return false;
      }
      const s = snap(w, undefined, alt);
      downAt.current = s.p;
      place(s.p);
      return true;
    },
    move: (e: React.PointerEvent, w: Vec2) => {
      const alt = e.altKey;
      if (!drag) { setHover(snap(w, undefined, alt)); return; }
      if (drag.t === 'marquee') { setDrag({ ...drag, cur: w }); return; }
      if (drag.t === 'move') {
        let delta = v2(w.x - drag.start.x, w.y - drag.start.y);
        if (!drag.moved && Math.hypot(delta.x, delta.y) * kRef.current < 3) return;
        if (!drag.moved) { useStore.getState().checkpoint(project.id); setDrag({ ...drag, moved: true }); }
        if (d.grid.snap && !alt) { const g = d.grid.size; delta = v2(Math.round(delta.x / g) * g, Math.round(delta.y / g) * g); }
        const moved = new Map(drag.orig.map((o) => [o.id, translateEl(o, delta)]));
        setData((dd) => ({ ...dd, elements: dd.elements.map((x) => moved.get(x.id) ?? x) }), false);
        return;
      }
      if (drag.t === 'vertex') {
        const p = snap(w, drag.id, alt).p;
        const o = drag.orig;
        const g = o.geom;
        let next: SiteElement = o;
        if ((g.type === 'line' || g.type === 'area') && drag.which === 'pts') next = { ...o, geom: { ...g, pts: g.pts.map((q, i) => (i === drag.index ? p : q)) } };
        if (g.type === 'dim' && drag.which !== 'pts') next = { ...o, geom: { ...g, [drag.which]: p } };
        setData((dd) => ({ ...dd, elements: dd.elements.map((x) => (x.id === next.id ? next : x)) }), false);
        return;
      }
      if (drag.t === 'rotate' && drag.orig.geom.type === 'point') {
        const c = drag.orig.geom.p;
        let ang = (Math.atan2(w.y - c.y, w.x - c.x) * 180) / Math.PI - 90;
        if (!alt) ang = Math.round(ang / 15) * 15;
        const next = { ...drag.orig, geom: { ...drag.orig.geom, rot: normAngle(ang) } };
        setData((dd) => ({ ...dd, elements: dd.elements.map((x) => (x.id === next.id ? next : x)) }), false);
        return;
      }
      if (drag.t === 'hp' || drag.t === 'mound') {
        let p = v2(drag.orig.x + w.x - drag.start.x, drag.orig.y + w.y - drag.start.y);
        if (d.grid.snap && !alt) { const g = d.grid.size; p = v2(Math.round(p.x / g) * g, Math.round(p.y / g) * g); }
        if (drag.t === 'hp') setData((dd) => ({ ...dd, terrain: { ...dd.terrain, points: dd.terrain.points.map((h) => (h.id === drag.id ? { ...h, p } : h)) } }), false);
        else setData((dd) => ({ ...dd, terrain: { ...dd.terrain, mounds: dd.terrain.mounds.map((m) => (m.id === drag.id ? { ...m, c: p } : m)) } }), false);
        return;
      }
      if (drag.t === 'secEnd') {
        const p = snap(w, undefined, alt).p;
        setData((dd) => ({ ...dd, sections: dd.sections.map((s) => (s.id === drag.id ? { ...s, [drag.which]: p } : s)) }), false);
      }
    },
    up: (_e: React.PointerEvent, w: Vec2) => {
      if (drag?.t === 'marquee') {
        const b: Box = { minX: Math.min(drag.start.x, drag.cur.x), minY: Math.min(drag.start.y, drag.cur.y), maxX: Math.max(drag.start.x, drag.cur.x), maxY: Math.max(drag.start.y, drag.cur.y) };
        if ((b.maxX - b.minX) * kRef.current < 4 && (b.maxY - b.minY) * kRef.current < 4) ui.select(drag.add ? sel : []);
        else {
          const ids = elementsInBox(editable, b).map((e) => e.id);
          ui.select(drag.add ? [...new Set([...sel, ...ids])] : ids);
        }
      }
      if (drag) { setDrag(null); return; }
      const start = downAt.current;
      downAt.current = null;
      // Press-drag-release works for two-point tools too.
      const two = tool.t === 'measure' || tool.t === 'section' || tool.t === 'calibrate' || (tool.t === 'place' && (lib(tool.kind).geom === 'dim' || (lib(tool.kind).geom === 'area' && areaMode === 'rect')));
      if (start && two && draft.length === 1) {
        const s = snap(w);
        if (dist(s.p, start) * kRef.current > 12) place(s.p);
      }
    },
    hover: (w: Vec2 | null) => setHover(w && tool.t !== 'select' ? snap(w) : null),
  };

  // ---------- drawing the overlays ----------
  const preview = (ctx: ViewCtx): ReactNode => {
    const out: ReactNode[] = [];
    const col = '#1f4fa8';
    const h = hover?.p;
    const T = ctx.T;
    const poly = (pts: Vec2[], closed: boolean, key: string, dash = false) => (
      <path key={key} d={`M${pts.map((p) => { const q = T(p); return `${q.x} ${q.y}`; }).join('L')}${closed ? 'Z' : ''}`} fill={closed ? 'rgba(31,79,168,0.08)' : 'none'} stroke={col} strokeWidth={2} strokeDasharray={dash ? '6 4' : undefined} />
    );
    if (tool.t === 'place' && h) {
      const L = lib(tool.kind);
      if (L.geom === 'point' && tool.kind !== 'text') {
        const ghost = makeElement(tool.kind, { type: 'point', p: h, rot: 0 }, 'ghost');
        out.push(poly(elementOutline(ghost), true, 'ghost', true));
      }
      if (draft.length) {
        if (L.geom === 'area' && areaMode === 'rect') {
          const a = draft[0];
          out.push(poly([a, v2(h.x, a.y), h, v2(a.x, h.y)], true, 'rect'));
          const q = T(v2((a.x + h.x) / 2, Math.max(a.y, h.y)));
          out.push(<text key="rl" x={q.x} y={q.y - 10} fontSize={13} fill={col} textAnchor="middle" fontFamily="Rubik" stroke="#fff" strokeWidth={3} paintOrder="stroke">{`${mToStr(Math.abs(h.x - a.x))} × ${mToStr(Math.abs(h.y - a.y))} מ׳`}</text>);
        } else {
          out.push(poly([...draft, h], L.geom === 'area' && draft.length >= 2, 'dr'));
          if (L.geom === 'line' && prm(makeElement(tool.kind, { type: 'line', pts: [], curved: false }, 'x'), 'width') > 0) {
            const ghost = makeElement(tool.kind, { type: 'line', pts: [...draft, h], curved: ui.curved }, 'ghost');
            out.push(poly(elementOutline(ghost), true, 'gr', true));
          }
        }
      }
    }
    if ((tool.t === 'measure' || tool.t === 'section' || tool.t === 'calibrate') && draft.length && h) out.push(poly([draft[0], h], false, 'two', true));
    if (draft.length && h) {
      const a = draft[draft.length - 1];
      const A = T(a), H = T(h);
      out.push(<text key="len" x={(A.x + H.x) / 2} y={(A.y + H.y) / 2 - 10} fontSize={13} fill={col} textAnchor="middle" fontFamily="Rubik" stroke="#fff" strokeWidth={3} paintOrder="stroke">{fmtM(dist(a, h))}</text>);
    }
    draft.forEach((p, i) => { const s = T(p); out.push(<circle key={`d${i}`} cx={s.x} cy={s.y} r={4} fill={col} />); });
    if (h && tool.t !== 'select') {
      const s = T(h);
      out.push(hover?.kind === 'point'
        ? <rect key="snap" x={s.x - 6} y={s.y - 6} width={12} height={12} fill="none" stroke="#e8590c" strokeWidth={2} />
        : hover?.kind === 'line' ? <path key="snapl" d={`M${s.x - 6} ${s.y + 6}L${s.x + 6} ${s.y - 6}M${s.x - 6} ${s.y - 6}L${s.x + 6} ${s.y + 6}`} stroke="#e8590c" strokeWidth={2} />
          : <g key="cur" stroke={col} strokeWidth={1}><line x1={s.x - 8} y1={s.y} x2={s.x + 8} y2={s.y} /><line x1={s.x} y1={s.y - 8} x2={s.x} y2={s.y + 8} /></g>);
      out.push(<text key="xy" x={s.x + 12} y={s.y + 20} fontSize={11} fill="#555" fontFamily="Rubik" direction="ltr" stroke="#fff" strokeWidth={3} paintOrder="stroke">{`${mToStr(h.x)}, ${mToStr(h.y)}`}</text>);
    }
    for (const hd of handles()) {
      const q = T(hd.p);
      out.push(hd.kind === 'rotate'
        ? <circle key={`h${hd.index}r`} cx={q.x} cy={q.y} r={7} fill="#fff" stroke={SELECT_COLOR} strokeWidth={2} />
        : <rect key={`h${hd.which}${hd.index}`} x={q.x - 5} y={q.y - 5} width={10} height={10} fill="#fff" stroke={SELECT_COLOR} strokeWidth={2} />);
    }
    if (mode === 'sections' && ui.selSection) {
      const s = d.sections.find((x) => x.id === ui.selSection);
      if (s) for (const p of [s.a, s.b]) { const q = T(p); out.push(<rect key={`se${p.x}${p.y}`} x={q.x - 5} y={q.y - 5} width={10} height={10} fill="#fff" stroke={SELECT_COLOR} strokeWidth={2} />); }
    }
    if (mode === 'topo' && (ui.selHp || ui.selMound)) {
      const p = ui.selHp ? d.terrain.points.find((x) => x.id === ui.selHp)?.p : d.terrain.mounds.find((x) => x.id === ui.selMound)?.c;
      if (p) { const q = T(p); out.push(<circle key="selt" cx={q.x} cy={q.y} r={10} fill="none" stroke={SELECT_COLOR} strokeWidth={2.5} />); }
    }
    if (drag?.t === 'marquee') {
      const a = T(drag.start), b = T(drag.cur);
      out.push(<rect key="mq" x={Math.min(a.x, b.x)} y={Math.min(a.y, b.y)} width={Math.abs(a.x - b.x)} height={Math.abs(a.y - b.y)} fill="rgba(232,89,12,0.07)" stroke={SELECT_COLOR} strokeDasharray="5 3" />);
    }
    if (ui.measure) {
      const m = ui.measure;
      const a = T(m.a), b = T(m.b);
      const s = slopeBetween(model.terrain, m.a, m.b);
      out.push(<g key="ms"><line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#0e7c66" strokeWidth={2} strokeDasharray="6 4" />
        <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 12} fontSize={13} fill="#0e7c66" textAnchor="middle" fontFamily="Rubik" stroke="#fff" strokeWidth={3} paintOrder="stroke">{`${fmtM(s.run)} · ${fmtLevel(s.za)} → ${fmtLevel(s.zb)} · שיפוע ${fmtSlope(s.ratio)}`}</text></g>);
    }
    return out;
  };

  const bgCtx = (ctx: ViewCtx): ViewCtx => ({ ...ctx, T: (p: Vec2) => ctx.T(v2(p.x + d.backgroundOrigin.x, p.y + d.backgroundOrigin.y)) });
  const bg = d.background;
  const bgShown = bg && bg.visible ? { ...bg, mmPerPx: bg.mmPerPx ?? provisionalScale(d, model) } : null;

  const box = useMemo(() => {
    const b = model.terrain.domain;
    return boxValid(b) ? padBox(b, Math.max(b.maxX - b.minX, b.maxY - b.minY) * 0.08) : { minX: -5000, minY: -5000, maxX: 30000, maxY: 20000 };
  }, [model.terrain.domain]);

  const viewBox = (toWorld: (q: Vec2) => Vec2, size: { w: number; h: number }): Box => {
    const a = toWorld(v2(0, 0)), b = toWorld(v2(size.w, size.h));
    return { minX: Math.min(a.x, b.x), minY: Math.min(a.y, b.y), maxX: Math.max(a.x, b.x), maxY: Math.max(a.y, b.y) };
  };

  const L = tool.t === 'place' ? lib(tool.kind) : null;
  const canFinish = tool.t === 'place' && ((L!.geom === 'line' && draft.length >= 2) || (L!.geom === 'area' && areaMode === 'polygon' && draft.length >= 3));

  const typePoint = (text: string) => {
    const t = text.trim();
    const rel = t.startsWith('@');
    const parts = t.replace(/^@/, '').split(/[;\s]+|,(?=\s*-?\d)/).filter(Boolean);
    if (parts.length !== 2) { toast('כתבי שני מספרים במטרים, למשל 12.5, 8 או ‎@3, 0 יחסית לנקודה הקודמת'); return false; }
    const x = parseMetersToMm(parts[0]), y = parseMetersToMm(parts[1]);
    if (typeof x !== 'number' || typeof y !== 'number') { toast('הקואורדינטות לא תקינות'); return false; }
    if (rel && !draft.length) { toast('אין נקודה קודמת. הזיני קודם נקודה מוחלטת.'); return false; }
    const base = rel ? draft[draft.length - 1] : v2(0, 0);
    place(v2(base.x + x, base.y + y));
    return true;
  };

  return (
    <div className="stage-col">
      <PanZoomCanvas
        testId="site-plan"
        box={box}
        fitKey={`${project.id}-${mode}-${d.elements.filter((e) => e.kind === 'lot').length}`}
        cursor={tool.t === 'select' ? 'default' : 'crosshair'}
        pointer={pointer}
        render={(ctx, toWorld, size) => {
          kRef.current = ctx.k;
          return (
            <>
              {d.grid.show && renderGrid(d.grid.size, ctx, viewBox(toWorld, size))}
              {bgShown && renderBackground(bgShown, bgCtx(ctx))}
              {renderSitePlan(d, model, ctx, { selected: selSet, contours, showPoints: mode === 'topo' || d.terrain.showPoints, showSections: mode !== 'sections', fade: mode === 'topo' })}
              {mode === 'sections' && renderSectionMarks(d.sections, ctx, ui.selSection)}
              {preview(ctx)}
            </>
          );
        }}
      />
      <div className="hint-bar" aria-live="polite">
        {Icons.info}<span style={{ flex: 1 }}>{toolHint(tool, draft.length, areaMode)}</span>
        {tool.t !== 'select' && ui.advanced && <CoordInput onEnter={typePoint} />}
        {canFinish && <button className="btn sm primary" onClick={() => finishDraft()}>סיום</button>}
        {draft.length > 0 && <button className="btn sm" onClick={() => setDraft([])}>ביטול</button>}
        {tool.t !== 'select' && draft.length === 0 && <button className="btn sm" onClick={() => ui.setTool({ t: 'select' })}>סיום הכלי</button>}
      </div>
      <KeyHandler onEnter={() => { if (!canFinish) return false; finishDraft(); return true; }} onEsc={() => { if (draft.length) setDraft([]); else if (tool.t !== 'select') ui.setTool({ t: 'select' }); else ui.select([]); }} onBackspace={() => draft.length > 0 && setDraft(draft.slice(0, -1))} draftActive={draft.length > 0} />

      {dialog?.t === 'hpoint' && <HeightPointDialog p={dialog.p} suggested={model.terrain.sample(dialog.p)} onClose={() => setDialog(null)} onSave={(z, source, note) => {
        const hp = { id: uid(), p: dialog.p, z, source, note };
        setData((dd) => ({ ...dd, terrain: { ...dd.terrain, points: [...dd.terrain.points, hp] } }));
        useSiteUi.setState({ selHp: hp.id });
        setDialog(null);
      }} />}
      {dialog?.t === 'mound' && <MoundDialog onClose={() => setDialog(null)} onSave={(r, h) => {
        const m = { id: uid(), c: dialog.p, r, h };
        setData((dd) => ({ ...dd, terrain: { ...dd.terrain, mounds: [...dd.terrain.mounds, m] } }));
        useSiteUi.setState({ selMound: m.id });
        setDialog(null);
      }} />}
      {dialog?.t === 'text' && <TextDialog onClose={() => setDialog(null)} onSave={(text) => { addElements([makeElement('text', { type: 'point', p: dialog.p, rot: 0 }, uid(), { name: text })]); setDialog(null); }} />}
      {dialog?.t === 'calib' && bg && <SiteCalibDialog onClose={() => setDialog(null)} onSave={(mm) => {
        const s0 = bg.mmPerPx ?? provisionalScale(d, model);
        const px = dist(dialog.a, dialog.b) / s0;
        const s1 = mm / px;
        setData((dd) => ({ ...dd, background: dd.background && { ...dd.background, mmPerPx: s1, calibration: { a: dialog.a, b: dialog.b, mm } } }));
        setDialog(null);
        ui.setTool({ t: 'select' });
        toast(`הרקע כויל: ${fmtM(mm)} בין שתי הנקודות.`);
      }} />}
    </div>
  );
}

/** Uncalibrated background: shown as wide as the site, only so it can be seen. Marked "not calibrated". */
export function provisionalScale(d: SiteData, model: SiteModel) {
  const bg = d.background;
  if (!bg) return 1;
  const w = model.terrain.domain.maxX - model.terrain.domain.minX;
  return Math.max(w, 10000) / bg.pxW;
}

function CoordInput({ onEnter }: { onEnter: (t: string) => boolean }) {
  const [t, setT] = useState('');
  return (
    <input className="input coord-input" value={t} dir="ltr" placeholder="X, Y (מ׳) או ‎@dX, dY" aria-label="הזנת נקודה בקואורדינטות"
      onChange={(e) => setT(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); if (onEnter(t)) setT(''); } }} />
  );
}

function KeyHandler({ onEnter, onEsc, onBackspace, draftActive }: { onEnter: () => boolean; onEsc: () => void; onBackspace: () => void; draftActive: boolean }) {
  const ref = useRef({ onEnter, onEsc, onBackspace, draftActive });
  ref.current = { onEnter, onEsc, onBackspace, draftActive };
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      if (document.querySelector('.overlay')) return;
      // Finishing a drawing also stops Enter from pressing the toolbar button that still has the focus.
      if (e.key === 'Enter') { if (ref.current.onEnter()) e.preventDefault(); }
      else if (e.key === 'Escape') ref.current.onEsc();
      else if (e.key === 'Backspace' && ref.current.draftActive) { e.preventDefault(); ref.current.onBackspace(); }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
  return null;
}

function HeightPointDialog({ p, suggested, onClose, onSave }: { p: Vec2; suggested: { z: number; src: string }; onClose: () => void; onSave: (z: number, source: 'survey' | 'manual', note: string) => void }) {
  const [z, setZ] = useState<number | null>(null);
  const [source, setSource] = useState<'survey' | 'manual'>('manual');
  const [note, setNote] = useState('');
  return (
    <Dialog title="נקודת גובה" onClose={onClose}>
      <div className="small muted">מיקום: <span className="num">{mToStr(p.x)}, {mToStr(p.y)}</span> מ׳. הגובה המחושב כרגע במקום הזה: <span className="num">{fmtLevel(suggested.z)}</span> ({suggested.src === 'base' ? 'מפלס בסיס, אין נתון' : 'מחושב'}).</div>
      <MField label="גובה (מפלס)" value={z} onChange={setZ} allowNegative placeholder="למשל 1.25" />
      <div className="field"><span>מקור הנתון</span>
        <div className="seg" role="radiogroup">
          <button type="button" role="radio" aria-checked={source === 'survey'} className={source === 'survey' ? 'on' : ''} onClick={() => setSource('survey')}>נתון מדידה (מפה)</button>
          <button type="button" role="radio" aria-checked={source === 'manual'} className={source === 'manual' ? 'on' : ''} onClick={() => setSource('manual')}>הוזן ידנית / תכנון</button>
        </div>
      </div>
      <label className="field"><span>הערה (לא חובה)</span><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></label>
      <div className="btns">
        <button className="btn primary" disabled={z === null} onClick={() => onSave(z!, source, note)}>הוספה</button>
        <button className="btn" onClick={onClose}>ביטול</button>
      </div>
    </Dialog>
  );
}

function MoundDialog({ onClose, onSave }: { onClose: () => void; onSave: (r: number, h: number) => void }) {
  const [r, setR] = useState<number | null>(6000);
  const [h, setH] = useState<number | null>(1000);
  const ok = r !== null && r > 0 && h !== null && h !== 0;
  return (
    <Dialog title="גבעה או שקע" onClose={onClose}>
      <p style={{ margin: 0 }} className="small">גבעה מתוכננת היא תוספת חלקה לקרקע. גובה שלילי יוצר שקע.</p>
      <MField label="רדיוס" value={r} onChange={setR} min={100} />
      <MField label="גובה (שלילי = שקע)" value={h} onChange={setH} allowNegative />
      <div className="btns">
        <button className="btn primary" disabled={!ok} onClick={() => onSave(r!, h!)}>הוספה</button>
        <button className="btn" onClick={onClose}>ביטול</button>
      </div>
    </Dialog>
  );
}

function TextDialog({ onClose, onSave }: { onClose: () => void; onSave: (t: string) => void }) {
  const [t, setT] = useState('');
  return (
    <Dialog title="הוספת טקסט" onClose={onClose}>
      <input className="input" autoFocus value={t} onChange={(e) => setT(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && t.trim() && onSave(t.trim())} aria-label="טקסט" placeholder="למשל: כניסה ראשית" />
      <div className="btns">
        <button className="btn primary" disabled={!t.trim()} onClick={() => onSave(t.trim())}>הוספה</button>
        <button className="btn" onClick={onClose}>ביטול</button>
      </div>
    </Dialog>
  );
}

function SiteCalibDialog({ onClose, onSave }: { onClose: () => void; onSave: (mm: number) => void }) {
  const [mm, setMm] = useState<number | null>(null);
  return (
    <Dialog title="כיול קנה מידה של הרקע" onClose={onClose}>
      <p style={{ margin: 0 }}>מה המרחק האמיתי בין שתי הנקודות שסימנת?</p>
      <MField label="מרחק אמיתי" value={mm} onChange={setMm} min={1} placeholder="למשל 20" />
      <div className="notice info">{Icons.info}<span>כדאי לבחור מרחק ארוך ככל האפשר. מדידה מתוך מפה סרוקה או צילום היא תמיד משוערת.</span></div>
      <div className="btns">
        <button className="btn primary" disabled={!mm} onClick={() => onSave(mm!)}>שמירת הכיול</button>
        <button className="btn" onClick={onClose}>ביטול</button>
      </div>
    </Dialog>
  );
}

export { rectAround, rotateEl };

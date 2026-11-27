// Submission sheets (גיליונות הגשה): several drawings, each at its own scale, on one paper.
// 1 SVG unit = 1 mm on paper. Nothing is shrunk to fit: a drawing that does not fit is reported.

import type { ReactNode } from 'react';
import { type Vec2, v2 } from '../../geometry/vec';
import { PAPER_MM, MARGIN, HText, CalibrationRuler, scaleLabel } from '../../drawing/page';
import { boxH, boxValid, boxW, padBox, type Box, type ViewCtx, makeView } from '../../drawing/viewport';
import type { SiteData, SiteSheet, SheetItem, SiteElement } from '../types';
import { lib, makeElement, LIBRARY } from '../library';
import { computeSection, type SiteModel, buildSiteModel } from '../section';
import { contours } from '../terrain';
import { renderSitePlan, sitePlanBox, NorthArrow } from './plan';
import { renderSiteSection, sectionBox } from './section';
import { emptySite } from '../migrate';
import { elementOutline } from '../outline';
import { areaTable } from '../edit';
import { fmtArea } from '../units';

export const SHEET_SCALES = [20, 25, 50, 100, 200, 250, 500, 1000, 1250, 2000, 2500, 5000];

export function sheetPaper(s: SiteSheet) {
  const p = PAPER_MM[s.paper];
  return s.orientation === 'portrait' ? { w: p.w, h: p.h } : { w: p.h, h: p.w };
}

/** Inside of the frame, where drawings may be placed. */
export function sheetArea(s: SiteSheet) {
  const { w, h } = sheetPaper(s);
  return { x: MARGIN + 2, y: MARGIN + 2, w: w - 2 * (MARGIN + 2), h: h - 2 * (MARGIN + 2) - (s.ruler ? 12 : 0) };
}

export interface ItemGeom { x: number; y: number; w: number; h: number }

const TITLE_GAP = 8;

function planBox(d: SiteData, model: SiteModel): Box {
  const b = sitePlanBox(d, model, true);
  return boxValid(b) ? padBox(b, 1500) : { minX: 0, minY: 0, maxX: 10000, maxY: 10000 };
}

function legendKinds(d: SiteData): string[] {
  const used = new Set(d.elements.map((e) => e.kind));
  return LIBRARY.filter((l) => used.has(l.kind) && l.kind !== 'dim' && l.kind !== 'text').map((l) => l.kind).slice(0, 22);
}

const INFO_W = 130, INFO_ROW = 6.5;
const INFO_FIELDS: { key: keyof SiteData['info']; label: string }[] = [
  { key: 'projectTitle', label: 'שם הפרויקט' }, { key: 'student', label: 'שם הסטודנטית' }, { key: 'course', label: 'קורס' },
  { key: 'lecturer', label: 'מרצה' }, { key: 'institution', label: 'מוסד' }, { key: 'date', label: 'תאריך' }, { key: 'sheetNo', label: 'גיליון מס׳' },
];

/** Size of an item on paper (mm), including its caption. */
export function itemSize(d: SiteData, model: SiteModel, it: SheetItem): { w: number; h: number; empty?: string } {
  switch (it.type) {
    case 'plan': { const b = planBox(d, model); return { w: boxW(b) / it.scale, h: boxH(b) / it.scale + TITLE_GAP + 6 }; }
    case 'section': {
      const sec = d.sections.find((s) => s.id === it.sectionId);
      if (!sec) return { w: 60, h: 12, empty: 'החתך נמחק' };
      const r = computeSection(model, sec);
      if (!r) return { w: 60, h: 12, empty: 'קו החתך קצר מדי' };
      const b = sectionBox(r);
      return { w: boxW(b) / it.scale, h: boxH(b) / it.scale + TITLE_GAP };
    }
    case 'view3d': return { w: it.w, h: it.h + TITLE_GAP };
    case 'legend': return { w: 70, h: 10 + Math.ceil(legendKinds(d).length / 2) * 9 };
    case 'north': return { w: it.size, h: it.size + 5 };
    case 'text': return { w: Math.max(10, [...it.text].length * it.size * 0.55), h: it.size * 1.4 };
    case 'areas': return { w: 80, h: 12 + areaTable(d).length * 5.5 + 6 };
    case 'info': return { w: INFO_W, h: INFO_FIELDS.length * INFO_ROW + 2 };
  }
}

export interface SheetProblem { id: string; msg: string }

export function sheetProblems(d: SiteData, model: SiteModel, s: SiteSheet): SheetProblem[] {
  const area = sheetArea(s);
  const out: SheetProblem[] = [];
  const rects: { id: string; r: ItemGeom; drawing: boolean }[] = [];
  for (const it of s.items) {
    const z = itemSize(d, model, it);
    if (z.empty) out.push({ id: it.id, msg: z.empty });
    const r = { x: it.x, y: it.y, w: z.w, h: z.h };
    rects.push({ id: it.id, r, drawing: it.type === 'plan' || it.type === 'section' || it.type === 'view3d' });
    if (r.x < area.x - 0.01 || r.y < area.y - 0.01 || r.x + r.w > area.x + area.w + 0.01 || r.y + r.h > area.y + area.h + 0.01) {
      const msg = r.w > area.w || r.h > area.h
        ? `גדול מהגיליון (${Math.round(r.w)}×${Math.round(r.h)} מ״מ, שטח פנוי ${Math.round(area.w)}×${Math.round(area.h)} מ״מ). בחרי קנה מידה קטן יותר או דף גדול יותר.`
        : 'חורג מגבולות המסגרת. גררי אותו פנימה.';
      out.push({ id: it.id, msg });
    }
  }
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    const a = rects[i].r, b = rects[j].r;
    if (rects[i].drawing && rects[j].drawing && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) out.push({ id: rects[j].id, msg: 'חופף לשרטוט אחר בגיליון.' });
  }
  return out;
}

export const itemLabel = (d: SiteData, it: SheetItem) => {
  switch (it.type) {
    case 'plan': return it.title || 'תוכנית';
    case 'section': { const s = d.sections.find((x) => x.id === it.sectionId); return it.title || (s ? (s.mode === 'section' ? `חתך ${s.label}-${s.label}` : s.label) : 'חתך'); }
    case 'view3d': return it.title || 'מבט תלת־ממדי';
    case 'legend': return it.title || 'מקרא';
    case 'north': return 'חץ צפון';
    case 'text': return it.text || 'טקסט';
    case 'areas': return it.title || 'טבלת שטחים';
    case 'info': return 'פרטי הסטודנטית והקורס';
  }
};

function ScaleBar({ x, y, scale }: { x: number; y: number; scale: number }) {
  // Graphic scale: a bar about 40-60 mm long in round metres.
  const opts = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500];
  const stepM = opts.find((m) => (m * 1000) / scale >= 8) ?? 500;
  const seg = (stepM * 1000) / scale;
  const n = Math.max(2, Math.min(5, Math.floor(50 / seg)));
  const nodes: ReactNode[] = [];
  for (let i = 0; i < n; i++) nodes.push(<rect key={i} x={x + i * seg} y={y} width={seg} height={1.4} fill={i % 2 ? '#fff' : '#111'} stroke="#111" strokeWidth={0.15} />);
  for (let i = 0; i <= n; i++) nodes.push(<text key={`t${i}`} x={x + i * seg} y={y + 4.2} fontSize={2.2} textAnchor="middle" fontFamily="Rubik, Arial, sans-serif" direction="ltr">{i * stepM}</text>);
  nodes.push(<text key="m" x={x + n * seg + 3} y={y + 1.6} fontSize={2.2} fontFamily="Rubik, Arial, sans-serif" direction="ltr">m</text>);
  return <g>{nodes}</g>;
}

function legendNode(d: SiteData, x: number, y: number, bw: boolean, title: string): ReactNode {
  const kinds = legendKinds(d);
  const rows: ReactNode[] = [];
  kinds.forEach((k, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const cx = x + 70 - 4 - col * 35, cy = y + 12 + row * 9;
    const L = lib(k);
    let geom: SiteElement['geom'];
    if (L.geom === 'point') geom = { type: 'point', p: v2(0, 0), rot: 0 };
    else if (L.geom === 'line') geom = { type: 'line', pts: [v2(-2500, -900), v2(2500, 900)], curved: false };
    else geom = { type: 'area', pts: [v2(-2500, -1500), v2(2500, -1500), v2(2500, 1500), v2(-2500, 1500)], curved: false };
    const src = d.elements.find((e) => e.kind === k);
    const e = { ...makeElement(k, geom, `lg-${k}`), color: src?.color ?? makeElement(k, geom, 'x').color, name: '' };
    const sd: SiteData = { ...emptySite(), elements: [e] };
    const m = buildSiteModel(sd);
    const pts = elementOutline(e);
    const ext = Math.max(...pts.map((p) => Math.max(Math.abs(p.x), Math.abs(p.y))), 500);
    const k2 = 3.4 / ext;
    const { T } = makeView(0, 0, k2, cx - 4, cy);
    const ctx: ViewCtx = { T, k: k2, pu: 0.45, bw, screen: false };
    rows.push(<g key={k}>{renderSitePlan(sd, m, ctx, { areaLabels: false })}<HText x={cx - 9} y={cy + 1.2} size={2.6}>{L.label}</HText></g>);
  });
  return (
    <g>
      <rect x={x} y={y} width={70} height={10 + Math.ceil(kinds.length / 2) * 9} fill="#fff" stroke="#111" strokeWidth={0.25} />
      <HText x={x + 67} y={y + 6} size={3.4} bold>{title || 'מקרא'}</HText>
      {rows}
    </g>
  );
}

function areasNode(d: SiteData, x: number, y: number, title: string): ReactNode {
  const rows = areaTable(d);
  const h = 12 + rows.length * 5.5 + 6;
  return (
    <g>
      <rect x={x} y={y} width={80} height={h} fill="#fff" stroke="#111" strokeWidth={0.25} />
      <HText x={x + 77} y={y + 6} size={3.4} bold>{title || 'טבלת שטחים'}</HText>
      <line x1={x} y1={y + 9} x2={x + 80} y2={y + 9} stroke="#111" strokeWidth={0.2} />
      {rows.map((r, i) => (
        <g key={r.kind}>
          <HText x={x + 77} y={y + 13.5 + i * 5.5} size={2.7}>{`${r.label} (${r.count})`}</HText>
          <text x={x + 3} y={y + 13.5 + i * 5.5} fontSize={2.7} fontFamily="Rubik, Arial, sans-serif" direction="rtl" textAnchor="end">{fmtArea(r.area)}</text>
        </g>
      ))}
      <text x={x + 77} y={y + h - 2} fontSize={2} fill="#555" fontFamily="Rubik, Arial, sans-serif" direction="rtl">שטחים לפי הגאומטריה המדויקת בתוכנית</text>
    </g>
  );
}

function infoNode(d: SiteData, x: number, y: number): ReactNode {
  return (
    <g>
      <rect x={x} y={y} width={INFO_W} height={INFO_FIELDS.length * INFO_ROW + 2} fill="#fff" stroke="#111" strokeWidth={0.35} />
      {INFO_FIELDS.map((f, i) => (
        <g key={f.key}>
          {i > 0 && <line x1={x} y1={y + 1 + i * INFO_ROW} x2={x + INFO_W} y2={y + 1 + i * INFO_ROW} stroke="#111" strokeWidth={0.15} />}
          <HText x={x + INFO_W - 2} y={y + 1 + i * INFO_ROW + 4.4} size={2.3} fill="#444">{f.label}</HText>
          <HText x={x + INFO_W - 30} y={y + 1 + i * INFO_ROW + 4.6} size={f.key === 'projectTitle' ? 3.4 : 3} bold={f.key === 'projectTitle'}>{d.info[f.key] || ' '}</HText>
        </g>
      ))}
      <line x1={x + INFO_W - 28} y1={y} x2={x + INFO_W - 28} y2={y + INFO_FIELDS.length * INFO_ROW + 2} stroke="#111" strokeWidth={0.15} />
    </g>
  );
}

export interface SheetBuild { svg: ReactNode; paper: { w: number; h: number }; boxes: Map<string, ItemGeom>; problems: SheetProblem[] }

let sheetSeq = 0;

export function buildSiteSheet(d: SiteData, model: SiteModel, s: SiteSheet, opts: { screen?: boolean; selected?: string | null; demo?: boolean } = {}): SheetBuild {
  const paper = sheetPaper(s);
  const boxes = new Map<string, ItemGeom>();
  const bw = s.blackWhite;
  const nodes: ReactNode[] = [];
  const cont = d.terrain.showContours ? contours(model.terrain, d.terrain.contourStep) : null;
  const clipBase = `sh${++sheetSeq}`;
  s.items.forEach((it, idx) => {
    const z = itemSize(d, model, it);
    boxes.set(it.id, { x: it.x, y: it.y, w: z.w, h: z.h });
    const key = it.id;
    if (it.type === 'plan') {
      const b = planBox(d, model);
      const k = 1 / it.scale;
      const T = (q: Vec2) => ({ x: it.x + (q.x - b.minX) * k, y: it.y + (b.maxY - q.y) * k });
      const ctx: ViewCtx = { T, k, pu: 1, bw, screen: false };
      const dh = boxH(b) * k;
      nodes.push(
        <g key={key}>
          <defs><clipPath id={`${clipBase}-${idx}`}><rect x={it.x} y={it.y} width={boxW(b) * k} height={dh} /></clipPath></defs>
          <g clipPath={`url(#${clipBase}-${idx})`}>{renderSitePlan(d, model, ctx, { contours: it.contours ? cont : null, showPoints: d.terrain.showPoints, showSections: true })}</g>
          <HText x={it.x + boxW(b) * k} y={it.y + dh + 5.5} size={3.6} bold>{`${it.title || 'תוכנית המתחם'}  ${scaleLabel(it.scale)}`}</HText>
          <ScaleBar x={it.x} y={it.y + dh + 3} scale={it.scale} />
        </g>,
      );
    } else if (it.type === 'section') {
      const sec = d.sections.find((x) => x.id === it.sectionId);
      const r = sec ? computeSection(model, sec) : null;
      if (sec && r) {
        const b = sectionBox(r);
        const k = 1 / it.scale;
        const T = (q: Vec2) => ({ x: it.x + (q.x - b.minX) * k, y: it.y + (b.maxY - q.y) * k });
        const ctx: ViewCtx = { T, k, pu: 1, bw, screen: false };
        nodes.push(
          <g key={key}>
            {renderSiteSection(r, ctx, { mode: sec.mode, showDims: sec.showDims, showLevels: sec.showLevels })}
            <HText x={it.x + boxW(b) * k} y={it.y + boxH(b) * k + 5.5} size={3.6} bold>{`${itemLabel(d, it)}  ${scaleLabel(it.scale)}`}</HText>
          </g>,
        );
      }
    } else if (it.type === 'view3d') {
      nodes.push(
        <g key={key}>
          {it.image ? <image href={it.image} x={it.x} y={it.y} width={it.w} height={it.h} preserveAspectRatio="xMidYMid meet" />
            : <g><rect x={it.x} y={it.y} width={it.w} height={it.h} fill="#f2f2f2" stroke="#999" strokeWidth={0.2} /><HText x={it.x + it.w / 2} y={it.y + it.h / 2} size={3} anchor="center" fill="#777">אין עדיין צילום של המודל</HText></g>}
          <HText x={it.x + it.w} y={it.y + it.h + 5.5} size={3.6} bold>{`${it.title || 'מבט תלת־ממדי'}  (ללא קנה מידה)`}</HText>
        </g>,
      );
    } else if (it.type === 'legend') nodes.push(<g key={key}>{legendNode(d, it.x, it.y, bw, it.title)}</g>);
    else if (it.type === 'areas') nodes.push(<g key={key}>{areasNode(d, it.x, it.y, it.title)}</g>);
    else if (it.type === 'info') nodes.push(<g key={key}>{infoNode(d, it.x, it.y)}</g>);
    else if (it.type === 'north') nodes.push(<g key={key}><NorthArrow x={it.x + it.size / 2} y={it.y + it.size / 2 + 4} size={it.size} angle={d.north} /></g>);
    else if (it.type === 'text') nodes.push(<g key={key}><HText x={it.x + z.w} y={it.y + it.size} size={it.size} bold={it.bold}>{it.text}</HText></g>);
  });

  const problems = sheetProblems(d, model, s);
  const sel = opts.selected ? boxes.get(opts.selected) : null;
  const svg = (
    <svg xmlns="http://www.w3.org/2000/svg" width={`${paper.w}mm`} height={`${paper.h}mm`} viewBox={`0 0 ${paper.w} ${paper.h}`}>
      <rect x={0} y={0} width={paper.w} height={paper.h} fill="#fff" />
      <defs />
      {s.frame && <rect x={MARGIN} y={MARGIN} width={paper.w - 2 * MARGIN} height={paper.h - 2 * MARGIN} fill="none" stroke="#000" strokeWidth={0.6} />}
      {nodes}
      {opts.demo && <HText x={paper.w - MARGIN - 3} y={MARGIN + 6} size={3} fill="#9a5b00">פרויקט הדגמה – נתונים לדוגמה בלבד, לא פרויקט מהקורס</HText>}
      {s.ruler && <CalibrationRuler x={MARGIN + 4} y={paper.h - MARGIN - 4} />}
      {opts.screen && [...boxes.entries()].map(([id, b]) => {
        const bad = problems.some((p) => p.id === id);
        if (!bad && id !== opts.selected) return null;
        return <rect key={`o${id}`} x={b.x} y={b.y} width={b.w} height={b.h} fill="none" stroke={bad ? '#b42318' : '#e8590c'} strokeWidth={0.6} strokeDasharray="3 1.5" />;
      })}
      {opts.screen && sel && <rect x={sel.x - 1} y={sel.y - 1} width={sel.w + 2} height={sel.h + 2} fill="rgba(232,89,12,0.05)" stroke="none" />}
    </svg>
  );
  return { svg, paper, boxes, problems };
}

/** Largest standard scale (smallest denominator) at which a drawing of the given world size fits. */
export function fitScale(worldW: number, worldH: number, availW: number, availH: number, extraH = 0): number | null {
  for (const sc of SHEET_SCALES) if (worldW / sc <= availW && worldH / sc + extraH <= availH) return sc;
  return null;
}

/** A first layout: plan on the right, sections under it, legend, areas, north and details on the left. */
export function autoSheet(d: SiteData, model: SiteModel, base: Omit<SiteSheet, 'items'>, ids: () => string, view3d: string | null): SiteSheet {
  const s: SiteSheet = { ...base, items: [] };
  const area = sheetArea(s);
  const side = 85; // left column for legend, north and details
  const avail = { w: area.w - side - 6, h: area.h };
  const pb = planBox(d, model);
  const secs = d.sections.filter((x) => x.mode === 'section').slice(0, 2);
  const secBoxes = secs.map((x) => { const r = computeSection(model, x); return r ? sectionBox(r) : null; });
  // One scale for the plan and the sections, the largest that fits all of them stacked.
  let scale = SHEET_SCALES[SHEET_SCALES.length - 1];
  for (const sc of SHEET_SCALES) {
    const hPlan = boxH(pb) / sc + TITLE_GAP + 6;
    const hSec = secBoxes.reduce((a, b) => a + (b ? boxH(b) / sc + TITLE_GAP + 4 : 0), 0);
    const wMax = Math.max(boxW(pb) / sc, ...secBoxes.map((b) => (b ? boxW(b) / sc : 0)));
    if (wMax <= avail.w && hPlan + hSec <= avail.h) { scale = sc; break; }
  }
  const right = area.x + area.w;
  let y = area.y + 4;
  s.items.push({ id: ids(), type: 'plan', x: right - boxW(pb) / scale, y, scale, contours: d.terrain.showContours, title: 'תוכנית המתחם' });
  y += boxH(pb) / scale + TITLE_GAP + 8;
  secs.forEach((x, i) => {
    const b = secBoxes[i];
    if (!b) return;
    s.items.push({ id: ids(), type: 'section', x: right - boxW(b) / scale, y, scale, sectionId: x.id, title: '' });
    y += boxH(b) / scale + TITLE_GAP + 4;
  });
  let ly = area.y + 4;
  const lx = area.x + 4;
  const infoY = area.y + area.h - (INFO_FIELDS.length * INFO_ROW + 2) - 2;
  s.items.push({ id: ids(), type: 'north', x: lx + 2, y: ly, size: 16 });
  ly += 26;
  s.items.push({ id: ids(), type: 'legend', x: lx, y: ly, title: 'מקרא' });
  ly += itemSize(d, model, s.items[s.items.length - 1]).h + 6;
  if (view3d !== null) {
    // The 3D view goes in the free middle band when there is one, otherwise small in the left column.
    const rightW = Math.max(boxW(pb) / scale, ...secBoxes.map((b) => (b ? boxW(b) / scale : 0)));
    const midX0 = area.x + side + 6, midX1 = right - rightW - 10;
    const midW = Math.min(midX1 - midX0, 220);
    const midH = Math.min(Math.round(midW * 0.65), infoY - (area.y + 4) - TITLE_GAP - 8);
    if (midW >= 90 && midH >= 50) {
      s.items.push({ id: ids(), type: 'view3d', x: midX1 - midW, y: area.y + 4, w: Math.round(midW), h: midH, view: 'iso', image: view3d || null, imageKey: '', title: 'מבט איזומטרי' });
    } else {
      s.items.push({ id: ids(), type: 'view3d', x: lx, y: ly, w: 78, h: 52, view: 'iso', image: view3d || null, imageKey: '', title: 'מבט איזומטרי' });
      ly += 52 + TITLE_GAP + 4;
    }
  }
  s.items.push({ id: ids(), type: 'areas', x: lx, y: ly, title: 'טבלת שטחים' });
  const info = { id: ids(), type: 'info' as const, x: side < INFO_W ? area.x + 2 : lx, y: infoY };
  s.items.push(info);
  return s;
}

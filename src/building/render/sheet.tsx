// Submission sheets of a building project: plans (floor, furniture, existing / demolition / proposed), sections,
// elevations, 3D views, legend, north arrow, area table, door and window schedule and submission details.
// 1 SVG unit = 1 mm on paper. Nothing is shrunk to fit: a drawing that does not fit is reported, not scaled down.

import type { ReactNode } from 'react';
import { type Vec2, v2 } from '../../geometry/vec';
import { PAPER_MM, MARGIN, HText, CalibrationRuler, scaleLabel } from '../../drawing/page';
import { boxH, boxValid, boxW, padBox, type Box, type ViewCtx } from '../../drawing/viewport';
import { fmt } from '../../geometry/vec';
import { NorthArrow } from '../../site/render/plan';
import { mToStr } from '../../site/units';
import type { BSheet, BSheetItem, BuildingData, PlanKind, ViewState } from '../types';
import { PLAN_KIND_LABELS } from '../types';
import { buildModel, sortedLevels, type BuildingModel } from '../model';
import { computeBSection } from '../section';
import { quantities } from '../quantities';
import { levelBox, renderBuildingPlan } from './plan';
import { bSectionBox, renderBSection } from './section';

export const B_SHEET_SCALES = [20, 25, 50, 100, 200, 250, 500];

export function bSheetPaper(s: BSheet) {
  const p = PAPER_MM[s.paper];
  return s.orientation === 'portrait' ? { w: p.w, h: p.h } : { w: p.h, h: p.w };
}

/** Inside of the frame, where drawings may be placed. */
export function bSheetArea(s: BSheet) {
  const { w, h } = bSheetPaper(s);
  return { x: MARGIN + 2, y: MARGIN + 2, w: w - 2 * (MARGIN + 2), h: h - 2 * (MARGIN + 2) - (s.ruler ? 12 : 0) };
}

export interface ItemGeom { x: number; y: number; w: number; h: number }

const TITLE_GAP = 8;
const INFO_W = 130, INFO_ROW = 6.5;
const INFO_FIELDS: { key: keyof BuildingData['info']; label: string }[] = [
  { key: 'projectTitle', label: 'שם הפרויקט' }, { key: 'student', label: 'שם הסטודנטית' }, { key: 'course', label: 'קורס' },
  { key: 'lecturer', label: 'מרצה' }, { key: 'institution', label: 'מוסד' }, { key: 'date', label: 'תאריך' }, { key: 'sheetNo', label: 'גיליון מס׳' },
];

const PLAN_STATE: Record<PlanKind, ViewState> = { plan: 'proposed', furniture: 'proposed', existing: 'existing', demolition: 'demolition', proposed: 'proposed' };

/** Models per view state, computed once per sheet build. */
class Models {
  private m = new Map<ViewState, BuildingModel>();
  private d: BuildingData;
  constructor(d: BuildingData) { this.d = d; }
  get(s: ViewState) { let x = this.m.get(s); if (!x) { x = buildModel(this.d, this.d.renovation ? s : 'proposed'); this.m.set(s, x); } return x; }
}

/** The same box for every plan kind of a level (so existing and proposed plans line up). */
function planBox(d: BuildingData, ms: Models, levelId: string, dims: boolean): Box {
  const b = levelBox(d, ms.get(d.renovation ? 'compare' : 'proposed'), levelId);
  return boxValid(b) ? padBox(b, dims ? 1600 : 900) : { minX: 0, minY: 0, maxX: 8000, maxY: 6000 };
}

const openingRows = (d: BuildingData, ms: Models) => quantities(d, ms.get('proposed')).openings;
const roomRows = (d: BuildingData, ms: Models) => quantities(d, ms.get('proposed')).rooms.filter((r) => r.closed);

function legendRows(d: BuildingData): { kind: 'wall' | 'wall-int' | 'existing' | 'demolish' | 'new' | 'door' | 'window' | 'section'; label: string }[] {
  const rows: ReturnType<typeof legendRows> = [{ kind: 'wall', label: 'קיר חיצוני (חתוך)' }, { kind: 'wall-int', label: 'קיר פנים / מחיצה' }];
  if (d.renovation) rows.push({ kind: 'existing', label: 'קיר קיים' }, { kind: 'demolish', label: 'קיר להריסה' }, { kind: 'new', label: 'קיר חדש' });
  rows.push({ kind: 'door', label: 'דלת ומהלך פתיחה' }, { kind: 'window', label: 'חלון' }, { kind: 'section', label: 'קו חתך' });
  return rows;
}

/** Size of an item on paper (mm), including its caption. */
export function bItemSize(d: BuildingData, ms: Models, it: BSheetItem): { w: number; h: number; empty?: string } {
  switch (it.type) {
    case 'plan': {
      if (!d.levels.some((l) => l.id === it.levelId)) return { w: 60, h: 12, empty: 'הקומה נמחקה' };
      const b = planBox(d, ms, it.levelId, it.dims);
      return { w: boxW(b) / it.scale, h: boxH(b) / it.scale + TITLE_GAP + 6 };
    }
    case 'section': {
      const sec = d.sections.find((s) => s.id === it.sectionId);
      if (!sec) return { w: 60, h: 12, empty: 'החתך נמחק' };
      const r = computeBSection(d, ms.get('proposed'), sec);
      if (!r) return { w: 60, h: 12, empty: 'קו החתך קצר מדי' };
      const b = bSectionBox(r);
      return { w: boxW(b) / it.scale, h: boxH(b) / it.scale + TITLE_GAP };
    }
    case 'view3d': return { w: it.w, h: it.h + TITLE_GAP };
    case 'legend': return { w: 70, h: 11 + legendRows(d).length * 7 };
    case 'north': return { w: it.size, h: it.size + 5 };
    case 'text': return { w: Math.max(10, [...it.text].length * it.size * 0.55), h: it.size * 1.4 };
    case 'areas': return { w: 90, h: 12 + (roomRows(d, ms).length + d.levels.length * 2) * 5 + 8 };
    case 'openings': return { w: 100, h: 14 + Math.max(1, openingRows(d, ms).length) * 5 + 4 };
    case 'info': return { w: INFO_W, h: INFO_FIELDS.length * INFO_ROW + 2 };
  }
}

export interface SheetProblem { id: string; msg: string }

export function bSheetProblems(d: BuildingData, ms: Models, s: BSheet): SheetProblem[] {
  const area = bSheetArea(s);
  const out: SheetProblem[] = [];
  const rects: { id: string; r: ItemGeom; drawing: boolean }[] = [];
  for (const it of s.items) {
    const z = bItemSize(d, ms, it);
    if (z.empty) out.push({ id: it.id, msg: z.empty });
    const r = { x: it.x, y: it.y, w: z.w, h: z.h };
    rects.push({ id: it.id, r, drawing: it.type === 'plan' || it.type === 'section' || it.type === 'view3d' });
    if (r.x < area.x - 0.01 || r.y < area.y - 0.01 || r.x + r.w > area.x + area.w + 0.01 || r.y + r.h > area.y + area.h + 0.01) {
      const msg = r.w > area.w || r.h > area.h
        ? `גדול מהגיליון (${Math.round(r.w)}×${Math.round(r.h)} מ״מ, שטח פנוי ${Math.round(area.w)}×${Math.round(area.h)} מ״מ). בחרי קנה מידה קטן יותר או דף גדול יותר. השרטוט לא מוקטן אוטומטית.`
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

export const bItemLabel = (d: BuildingData, it: BSheetItem) => {
  switch (it.type) {
    case 'plan': { const l = d.levels.find((x) => x.id === it.levelId); return it.title || `${PLAN_KIND_LABELS[it.plan]}${l ? ` – ${l.name}` : ''}`; }
    case 'section': { const s = d.sections.find((x) => x.id === it.sectionId); return it.title || (s ? (s.mode === 'section' ? `חתך ${s.label}-${s.label}` : s.label) : 'חתך'); }
    case 'view3d': return it.title || 'מבט תלת־ממדי';
    case 'legend': return it.title || 'מקרא';
    case 'north': return 'חץ צפון';
    case 'text': return it.text || 'טקסט';
    case 'areas': return it.title || 'טבלת שטחים';
    case 'openings': return it.title || 'רשימת דלתות וחלונות';
    case 'info': return 'פרטי ההגשה';
  }
};

function ScaleBar({ x, y, scale }: { x: number; y: number; scale: number }) {
  const opts = [0.5, 1, 2, 5, 10, 20, 50];
  const stepM = opts.find((m) => (m * 1000) / scale >= 8) ?? 50;
  const seg = (stepM * 1000) / scale;
  const n = Math.max(2, Math.min(5, Math.floor(50 / seg)));
  const nodes: ReactNode[] = [];
  for (let i = 0; i < n; i++) nodes.push(<rect key={i} x={x + i * seg} y={y} width={seg} height={1.4} fill={i % 2 ? '#fff' : '#111'} stroke="#111" strokeWidth={0.15} />);
  for (let i = 0; i <= n; i++) nodes.push(<text key={`t${i}`} x={x + i * seg} y={y + 4.2} fontSize={2.2} textAnchor="middle" fontFamily="Rubik, Arial, sans-serif" direction="ltr">{fmt(i * stepM, 1)}</text>);
  nodes.push(<text key="m" x={x + n * seg + 3} y={y + 1.6} fontSize={2.2} fontFamily="Rubik, Arial, sans-serif" direction="ltr">m</text>);
  return <g>{nodes}</g>;
}

function legendNode(d: BuildingData, x: number, y: number, bw: boolean, title: string): ReactNode {
  const rows = legendRows(d);
  const h = 11 + rows.length * 7;
  const sw = (kind: ReturnType<typeof legendRows>[number]['kind'], sx: number, sy: number): ReactNode => {
    const w = 12, hh = 3.2;
    switch (kind) {
      case 'wall': return <rect x={sx} y={sy} width={w} height={hh} fill={bw ? '#2b2b2b' : '#353b43'} stroke="#111" strokeWidth={0.25} />;
      case 'wall-int': return <rect x={sx} y={sy + 0.8} width={w} height={1.6} fill={bw ? '#2b2b2b' : '#353b43'} stroke="#111" strokeWidth={0.2} />;
      case 'existing': return <rect x={sx} y={sy} width={w} height={hh} fill={bw ? '#9a9a9a' : '#9aa0a6'} stroke="#111" strokeWidth={0.25} />;
      case 'demolish': return <rect x={sx} y={sy} width={w} height={hh} fill="none" stroke="#d02f2f" strokeWidth={0.35} strokeDasharray="1.2 0.7" />;
      case 'new': return <rect x={sx} y={sy} width={w} height={hh} fill={bw ? '#5a5a5a' : '#2f8f4e'} stroke="#111" strokeWidth={0.25} />;
      case 'door': return <g><line x1={sx} y1={sy + hh} x2={sx} y2={sy - 2.5} stroke="#111" strokeWidth={0.3} /><path d={`M${sx} ${sy - 2.5}A${5.7} ${5.7} 0 0 1 ${sx + 5.7} ${sy + hh}`} fill="none" stroke="#555" strokeWidth={0.18} strokeDasharray="0.8 0.5" /><line x1={sx - 0.5} y1={sy + hh} x2={sx + w} y2={sy + hh} stroke="#111" strokeWidth={0.25} /></g>;
      case 'window': return <g><rect x={sx} y={sy} width={w} height={hh} fill="#fff" stroke="#111" strokeWidth={0.2} /><line x1={sx} y1={sy + hh / 2} x2={sx + w} y2={sy + hh / 2} stroke="#4f7fa8" strokeWidth={0.35} /></g>;
      case 'section': return <g><line x1={sx} y1={sy + hh / 2} x2={sx + w} y2={sy + hh / 2} stroke={bw ? '#000' : '#b4232c'} strokeWidth={0.3} strokeDasharray="3 0.8 0.6 0.8" /><text x={sx - 1.2} y={sy + hh / 2 + 1} fontSize={2.6} fontWeight={700} fill={bw ? '#000' : '#b4232c'} fontFamily="Rubik, Arial, sans-serif" textAnchor="end">A</text></g>;
    }
  };
  return (
    <g>
      <rect x={x} y={y} width={70} height={h} fill="#fff" stroke="#111" strokeWidth={0.25} />
      <HText x={x + 67} y={y + 6} size={3.4} bold>{title || 'מקרא'}</HText>
      {rows.map((r, i) => (
        <g key={r.kind}>
          {sw(r.kind, x + 5, y + 10 + i * 7)}
          <HText x={x + 67} y={y + 13 + i * 7} size={2.7}>{r.label}</HText>
        </g>
      ))}
    </g>
  );
}

function areasNode(d: BuildingData, ms: Models, x: number, y: number, title: string): ReactNode {
  const q = quantities(d, ms.get('proposed'));
  const rows: { label: string; value: string; bold?: boolean }[] = [];
  for (const l of sortedLevels(d)) {
    const lr = q.levels.find((r) => r.id === l.id);
    const rooms = q.rooms.filter((r) => r.closed && r.level === l.name);
    if (!lr || (!rooms.length && lr.gross <= 0)) continue;
    rows.push({ label: l.name, value: '', bold: true });
    for (const r of rooms) rows.push({ label: r.name, value: `${fmt(r.area / 1e6, 2)} מ״ר` });
    rows.push({ label: `ברוטו ${l.name} / נטו`, value: `${fmt(lr.gross / 1e6, 2)} / ${fmt(lr.net / 1e6, 2)}`, bold: true });
  }
  const h = 12 + rows.length * 5 + 8;
  return (
    <g>
      <rect x={x} y={y} width={90} height={h} fill="#fff" stroke="#111" strokeWidth={0.25} />
      <HText x={x + 87} y={y + 6} size={3.4} bold>{title || 'טבלת שטחים'}</HText>
      <line x1={x} y1={y + 9} x2={x + 90} y2={y + 9} stroke="#111" strokeWidth={0.2} />
      {rows.map((r, i) => (
        <g key={i}>
          <HText x={x + 87} y={y + 13.5 + i * 5} size={2.6} bold={r.bold}>{r.label}</HText>
          <text x={x + 3} y={y + 13.5 + i * 5} fontSize={2.6} fontWeight={r.bold ? 700 : 400} fontFamily="Rubik, Arial, sans-serif" direction="rtl" textAnchor="end">{r.value}</text>
        </g>
      ))}
      <text x={x + 87} y={y + h - 2.5} fontSize={2} fill="#555" fontFamily="Rubik, Arial, sans-serif" direction="rtl">{`סה״כ ברוטו ${fmt(q.totalGross / 1e6, 2)} מ״ר, נטו ${fmt(q.totalNet / 1e6, 2)} מ״ר. חישוב גאומטרי, לא לפי תקנות.`}</text>
    </g>
  );
}

function openingsNode(d: BuildingData, ms: Models, x: number, y: number, title: string): ReactNode {
  const rows = openingRows(d, ms);
  const doors = rows.filter((r) => r.door), wins = rows.filter((r) => !r.door);
  const list = [...doors.map((r, i) => ({ ...r, tag: `D${i + 1}` })), ...wins.map((r, i) => ({ ...r, tag: `W${i + 1}` }))];
  const h = 14 + Math.max(1, list.length) * 5 + 4;
  const W = 100;
  const col = (k: number) => x + W - 3 - k;
  return (
    <g>
      <rect x={x} y={y} width={W} height={h} fill="#fff" stroke="#111" strokeWidth={0.25} />
      <HText x={x + W - 3} y={y + 6} size={3.4} bold>{title || 'רשימת דלתות וחלונות'}</HText>
      {[['סימון', 0], ['סוג', 12], ['קומה', 44], ['רוחב', 66], ['גובה', 78], ['סף', 90]].map(([t, k]) => <HText key={String(t)} x={col(k as number)} y={y + 11.5} size={2.3} fill="#555">{t}</HText>)}
      <line x1={x} y1={y + 13} x2={x + W} y2={y + 13} stroke="#111" strokeWidth={0.2} />
      {list.length === 0 && <HText x={col(0)} y={y + 17.5} size={2.5} fill="#777">אין פתחים</HText>}
      {list.map((r, i) => (
        <g key={r.id}>
          <HText x={col(0)} y={y + 17.5 + i * 5} size={2.5} bold>{r.tag}</HText>
          <HText x={col(12)} y={y + 17.5 + i * 5} size={2.5}>{r.type}</HText>
          <HText x={col(44)} y={y + 17.5 + i * 5} size={2.5}>{r.level}</HText>
          <HText x={col(66)} y={y + 17.5 + i * 5} size={2.5}>{mToStr(r.width, 2)}</HText>
          <HText x={col(78)} y={y + 17.5 + i * 5} size={2.5}>{mToStr(r.height, 2)}</HText>
          <HText x={col(90)} y={y + 17.5 + i * 5} size={2.5}>{r.door ? '–' : mToStr(r.sill, 2)}</HText>
        </g>
      ))}
    </g>
  );
}

function infoNode(d: BuildingData, x: number, y: number): ReactNode {
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

export interface BSheetBuild { svg: ReactNode; paper: { w: number; h: number }; boxes: Map<string, ItemGeom>; problems: SheetProblem[] }

let sheetSeq = 0;

export function buildBSheet(d: BuildingData, s: BSheet, opts: { screen?: boolean; selected?: string | null; demo?: boolean } = {}): BSheetBuild {
  const ms = new Models(d);
  const paper = bSheetPaper(s);
  const boxes = new Map<string, ItemGeom>();
  const bw = s.blackWhite;
  const nodes: ReactNode[] = [];
  const clipBase = `bsh${++sheetSeq}`;
  s.items.forEach((it, idx) => {
    const z = bItemSize(d, ms, it);
    boxes.set(it.id, { x: it.x, y: it.y, w: z.w, h: z.h });
    const key = it.id;
    if (it.type === 'plan') {
      if (z.empty) return;
      const b = planBox(d, ms, it.levelId, it.dims);
      const k = 1 / it.scale;
      const T = (q: Vec2) => ({ x: it.x + (q.x - b.minX) * k, y: it.y + (b.maxY - q.y) * k });
      const ctx: ViewCtx = { T, k, pu: 1, bw, screen: false };
      const dh = boxH(b) * k;
      const state = PLAN_STATE[it.plan];
      const m = ms.get(state);
      nodes.push(
        <g key={key}>
          <defs><clipPath id={`${clipBase}-${idx}`}><rect x={it.x} y={it.y} width={boxW(b) * k} height={dh} /></clipPath></defs>
          <g clipPath={`url(#${clipBase}-${idx})`}>{renderBuildingPlan(d, m, it.levelId, ctx, { state: d.renovation ? state : 'proposed', kind: it.plan, furniture: it.plan !== 'plan' && it.plan !== 'demolition', dims: it.dims, sections: it.plan === 'plan' || it.plan === 'proposed' || it.plan === 'furniture' ? d.sections : undefined, labels: true })}</g>
          <HText x={it.x + boxW(b) * k} y={it.y + dh + 5.5} size={3.6} bold>{`${bItemLabel(d, it)}  ${scaleLabel(it.scale)}`}</HText>
          <ScaleBar x={it.x} y={it.y + dh + 3} scale={it.scale} />
        </g>,
      );
    } else if (it.type === 'section') {
      const sec = d.sections.find((x) => x.id === it.sectionId);
      const r = sec ? computeBSection(d, ms.get('proposed'), sec) : null;
      if (sec && r) {
        const b = bSectionBox(r);
        const k = 1 / it.scale;
        const T = (q: Vec2) => ({ x: it.x + (q.x - b.minX) * k, y: it.y + (b.maxY - q.y) * k });
        const ctx: ViewCtx = { T, k, pu: 1, bw, screen: false };
        nodes.push(
          <g key={key}>
            {renderBSection(r, ctx, { mode: sec.mode, showDims: sec.showDims, showLevels: sec.showLevels })}
            <HText x={it.x + boxW(b) * k} y={it.y + boxH(b) * k + 5.5} size={3.6} bold>{`${bItemLabel(d, it)}  ${scaleLabel(it.scale)}`}</HText>
          </g>,
        );
      }
    } else if (it.type === 'view3d') {
      nodes.push(
        <g key={key}>
          {it.image ? <image href={it.image} x={it.x} y={it.y} width={it.w} height={it.h} preserveAspectRatio="xMidYMid meet" />
            : <g><rect x={it.x} y={it.y} width={it.w} height={it.h} fill="#f2f2f2" stroke="#999" strokeWidth={0.2} /><HText x={it.x + it.w / 2} y={it.y + it.h / 2} size={3} anchor="center" fill="#777">אין עדיין צילום של המודל</HText></g>}
          <HText x={it.x + it.w} y={it.y + it.h + 5.5} size={3.6} bold>{`${bItemLabel(d, it)}  (ללא קנה מידה)`}</HText>
        </g>,
      );
    } else if (it.type === 'legend') nodes.push(<g key={key}>{legendNode(d, it.x, it.y, bw, it.title)}</g>);
    else if (it.type === 'areas') nodes.push(<g key={key}>{areasNode(d, ms, it.x, it.y, it.title)}</g>);
    else if (it.type === 'openings') nodes.push(<g key={key}>{openingsNode(d, ms, it.x, it.y, it.title)}</g>);
    else if (it.type === 'info') nodes.push(<g key={key}>{infoNode(d, it.x, it.y)}</g>);
    else if (it.type === 'north') nodes.push(<g key={key}><NorthArrow x={it.x + it.size / 2} y={it.y + it.size / 2 + 4} size={it.size} angle={d.north} /></g>);
    else if (it.type === 'text') nodes.push(<g key={key}><HText x={it.x + z.w} y={it.y + it.size} size={it.size} bold={it.bold}>{it.text}</HText></g>);
  });

  const problems = bSheetProblems(d, ms, s);
  const sel = opts.selected ? boxes.get(opts.selected) : null;
  const svg = (
    <svg xmlns="http://www.w3.org/2000/svg" width={`${paper.w}mm`} height={`${paper.h}mm`} viewBox={`0 0 ${paper.w} ${paper.h}`}>
      <rect x={0} y={0} width={paper.w} height={paper.h} fill="#fff" />
      {s.frame && <rect x={MARGIN} y={MARGIN} width={paper.w - 2 * MARGIN} height={paper.h - 2 * MARGIN} fill="none" stroke="#000" strokeWidth={0.6} />}
      {nodes}
      {opts.demo && <HText x={paper.w - MARGIN - 3} y={MARGIN + 6} size={3} fill="#9a5b00">פרויקט הדגמה לימודי – נתונים לדוגמה בלבד, אינו תוכנית מאושרת</HText>}
      <HText x={MARGIN + 3} y={MARGIN + 4} size={1.8} anchor="left" fill="#666">שרטוט לימודי ותכנוני בלבד. אינו מחליף אדריכל/ית או מהנדס/ת ואינו אישור לבנייה, להריסה או לעמידה בתקנים.</HText>
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

/** Largest standard scale (smallest denominator) at which a drawing of the given size fits. */
export function bFitScale(worldW: number, worldH: number, availW: number, availH: number, extraH = 0): number | null {
  for (const sc of B_SHEET_SCALES) if (worldW / sc <= availW && worldH / sc + extraH <= availH) return sc;
  return null;
}

export function bItemSizeFor(d: BuildingData, it: BSheetItem) { return bItemSize(d, new Models(d), it); }

/**
 * A first layout: plans in a row at the top (all levels, or existing / demolition / proposed for a renovation),
 * sections and elevations under them at the same scale, and a side column with north arrow, legend, 3D view,
 * area table, door and window schedule and the submission details. The scale is the largest standard one that fits;
 * if nothing fits even at 1:200, the items keep that scale and the sheet lists the problem (nothing is shrunk).
 */
export function autoBSheet(d: BuildingData, base: Omit<BSheet, 'items'>, ids: () => string, view3d: string | null): BSheet {
  const ms = new Models(d);
  const s: BSheet = { ...base, items: [] };
  const area = bSheetArea(s);
  const side = 104;
  const avail = { w: area.w - side - 6, h: area.h };
  const levels = sortedLevels(d).filter((l) => boxValid(levelBox(d, ms.get(d.renovation ? 'compare' : 'proposed'), l.id)));
  const main = levels.find((l) => l.elevation >= -1) ?? levels[0];
  const plans: { levelId: string; plan: PlanKind }[] = d.renovation && main
    ? (['existing', 'demolition', 'proposed'] as PlanKind[]).map((p) => ({ levelId: main.id, plan: p }))
    : levels.map((l) => ({ levelId: l.id, plan: 'furniture' as PlanKind }));
  const secs = [...d.sections.filter((x) => x.mode === 'section').slice(0, 2), ...d.sections.filter((x) => x.mode === 'elevation').slice(0, 2)];
  const pBoxes = plans.map((p) => planBox(d, ms, p.levelId, true));
  const sBoxes = secs.map((x) => { const r = computeBSection(d, ms.get('proposed'), x); return r ? bSectionBox(r) : null; });
  const rowW = (bs: (Box | null)[], sc: number) => bs.reduce((a, b) => a + (b ? boxW(b) / sc + 8 : 0), 0) - 8;
  const rowH = (bs: (Box | null)[], sc: number, extra: number) => Math.max(0, ...bs.map((b) => (b ? boxH(b) / sc + extra : 0)));
  // Sections may wrap to a second row.
  const secRows = (sc: number) => { const rows: (Box | null)[][] = [[]]; let w = 0; for (const b of sBoxes) { const bw2 = b ? boxW(b) / sc + 8 : 0; if (w + bw2 > avail.w + 8 && rows[rows.length - 1].length) { rows.push([]); w = 0; } rows[rows.length - 1].push(b); w += bw2; } return rows; };
  let scale = 200;
  for (const sc of [50, 100, 200]) {
    const h = rowH(pBoxes, sc, TITLE_GAP + 10) + secRows(sc).reduce((a, r) => a + rowH(r, sc, TITLE_GAP + 6), 0);
    if (rowW(pBoxes, sc) <= avail.w && h <= avail.h) { scale = sc; break; }
  }
  const right = area.x + area.w;
  let x = right, y = area.y + 3;
  plans.forEach((p, i) => {
    const b = pBoxes[i];
    x -= boxW(b) / scale;
    s.items.push({ id: ids(), type: 'plan', x, y, scale, levelId: p.levelId, plan: p.plan, dims: true, title: '' });
    x -= 8;
  });
  y += rowH(pBoxes, scale, TITLE_GAP + 10);
  let si = 0;
  for (const row of secRows(scale)) {
    x = right;
    for (const b of row) {
      const sec = secs[si++];
      if (!b) continue;
      x -= boxW(b) / scale;
      s.items.push({ id: ids(), type: 'section', x, y, scale, sectionId: sec.id, title: '' });
      x -= 8;
    }
    y += rowH(row, scale, TITLE_GAP + 6);
  }
  // Side column.
  const lx = area.x + 2;
  let ly = area.y + 3;
  s.items.push({ id: ids(), type: 'north', x: lx + 2, y: ly, size: 16 });
  if (view3d !== null) s.items.push({ id: ids(), type: 'view3d', x: lx + 24, y: ly, w: side - 26, h: 58, view: 'iso', image: view3d || null, imageKey: '', title: 'מבט איזומטרי' });
  ly += view3d !== null ? 58 + TITLE_GAP + 4 : 26;
  s.items.push({ id: ids(), type: 'legend', x: lx, y: ly, title: 'מקרא' });
  ly += bItemSize(d, ms, s.items[s.items.length - 1]).h + 5;
  s.items.push({ id: ids(), type: 'areas', x: lx, y: ly, title: 'טבלת שטחים' });
  ly += bItemSize(d, ms, s.items[s.items.length - 1]).h + 5;
  const infoH = INFO_FIELDS.length * INFO_ROW + 2;
  const op: BSheetItem = { id: ids(), type: 'openings', x: lx, y: ly, title: '' };
  if (ly + bItemSize(d, ms, op).h <= area.y + area.h - infoH - 6) s.items.push(op);
  s.items.push({ id: ids(), type: 'info', x: lx, y: area.y + area.h - infoH - 2 });
  return s;
}

export { v2 };

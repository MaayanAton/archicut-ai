// Printable sheet: paper in millimetres (1 SVG unit = 1 mm on paper).

import type { ReactNode } from 'react';
import type { Paper, PrintSettings, Project, TitleBlock } from '../document/types';
import { SOLID_LABELS, SOLID_FIELDS } from '../geometry/solids';
import { ORIENTATION_LABELS } from '../geometry/section';
import { fmt, type Vec2 } from '../geometry/vec';
import { axoWorldBox, epureWorldBox, renderAxonometric, renderEpure } from './projectionsRender';
import { renderSection, sectionWorldBox } from './sectionRender';
import { computeSection } from './sectionCompute';
import { drawingWorldBox, renderBackground, renderElements } from './drawingRender';
import { buildSiteModel } from '../site/section';
import { contours } from '../site/terrain';
import { renderSitePlan, sitePlanBox } from '../site/render/plan';
import { buildModel, sortedLevels } from '../building/model';
import { levelBox, renderBuildingPlan } from '../building/render/plan';
import { boxH, boxValid, boxW, padBox, type Box, type ViewCtx } from './viewport';

export const PAPER_MM: Record<Paper, { w: number; h: number }> = { A4: { w: 210, h: 297 }, A3: { w: 297, h: 420 }, A2: { w: 420, h: 594 }, A1: { w: 594, h: 841 } };

export const SCALES = [0.5, 1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500];
export const scaleLabel = (s: number) => (s < 1 ? `${fmt(1 / s, 2)}:1` : `1:${fmt(s, 4)}`);

export const MARGIN = 10;
const TITLE_H = 24;
const RULER_STRIP = 14;

export function paperSize(s: PrintSettings) {
  const p = PAPER_MM[s.paper];
  return s.orientation === 'portrait' ? { w: p.w, h: p.h } : { w: p.h, h: p.w };
}

/** The area available for the drawing itself (paper mm). */
export function drawingArea(s: PrintSettings) {
  const { w, h } = paperSize(s);
  const inner = 2; // gap between frame and content
  const top = MARGIN + inner;
  const bottom = h - MARGIN - (s.frame ? TITLE_H : 0) - (s.ruler ? RULER_STRIP : 0) - inner;
  return { x: MARGIN + inner, y: top, w: w - 2 * (MARGIN + inner), h: bottom - top };
}

interface Part { box: Box; render: (ctx: ViewCtx) => ReactNode; caption?: string }

/** World-space content of a project, as one or more parts drawn at the same scale. */
export function projectParts(p: Project, s: PrintSettings): { parts: Part[]; note?: string; empty?: string } {
  if (p.type === 'projections') {
    const d = p.data;
    if (!d.points.length) return { parts: [], empty: 'אין עדיין נקודות בפרויקט.' };
    const inc = s.include ?? 'both';
    const parts: Part[] = [];
    if (inc !== 'epure') parts.push({ box: padBox(axoWorldBox(d), 6), render: (ctx) => renderAxonometric(d, ctx), caption: 'תיאור אקסונומטרי' });
    if (inc !== 'axonometric') parts.push({ box: padBox(epureWorldBox(d), 6), render: (ctx) => renderEpure(d, ctx), caption: 'מערכת פרוסה' });
    return { parts, note: p.demo ? 'נתוני הדגמה' : undefined };
  }
  if (p.type === 'section') {
    const comp = computeSection(p.data);
    if (comp.errors.length) return { parts: [], empty: `חסרות מידות: ${comp.errors.join(', ')}` };
    const r = comp.outcome!.result;
    if (r.kind === 'none') return { parts: [], empty: 'המישור לא חותך את הגוף, אין מה להדפיס.' };
    const sd = p.data.solid;
    const dims = SOLID_FIELDS[sd.kind].map((f) => `${f.label} ${sd[f.key]}`).join(', ');
    const pl = p.data.plane;
    let caption = `חתך ב${SOLID_LABELS[sd.kind]} (${dims} מ״מ). מישור ${ORIENTATION_LABELS[pl.orientation].split(' ')[0]}, הטיה ${fmt(pl.tilt, 2)}°, מיקום ${fmt(pl.offset, 2)} מ״מ.`;
    if (comp.measures) caption += ` שטח ${comp.measures.exact ? '' : '≈'}${fmt(comp.measures.area, comp.measures.exact ? 1 : 0)} מ״מ².`;
    return { parts: [{ box: padBox(sectionWorldBox(r), 12), render: (ctx) => renderSection(r, ctx, { curved: comp.curved }), caption }] };
  }
  if (p.type === 'site') {
    const d = p.data;
    const model = buildSiteModel(d);
    const box = sitePlanBox(d, model, false);
    if (!boxValid(box)) return { parts: [], empty: 'התוכנית ריקה.' };
    const cont = d.terrain.showContours ? contours(model.terrain, d.terrain.contourStep) : null;
    return {
      parts: [{ box: padBox(box, Math.max(boxW(box), boxH(box)) * 0.04), render: (ctx) => renderSitePlan(d, model, ctx, { contours: cont, showPoints: d.terrain.showPoints, showSections: true }), caption: 'תוכנית המתחם' }],
      note: p.demo ? 'פרויקט הדגמה – נתונים לדוגמה בלבד' : undefined,
    };
  }
  if (p.type === 'building') {
    const d = p.data;
    const state = 'proposed' as const;
    const model = buildModel(d, state);
    // The main floor: the lowest level at or above ground that has content (else any level with content).
    const levels = sortedLevels(d);
    const withContent = levels.filter((l) => boxValid(levelBox(d, model, l.id)));
    const lv = withContent.find((l) => l.elevation >= -1) ?? withContent[0];
    if (!lv) return { parts: [], empty: 'התוכנית ריקה.' };
    const box = levelBox(d, model, lv.id);
    return {
      parts: [{ box: padBox(box, Math.max(boxW(box), boxH(box)) * 0.05), render: (ctx) => renderBuildingPlan(d, model, lv.id, ctx, { state, furniture: true, labels: true, dims: true }), caption: `תוכנית ${lv.name}` }],
      note: p.demo ? 'פרויקט הדגמה לימודי – אינו תוכנית מאושרת' : undefined,
    };
  }
  const d = p.data;
  // The image is printed only under an overlay drawing; side by side, the drawing is independent of it.
  const withBg = !!(s.printBackground && d.layout === 'overlay' && d.background?.visible !== false && d.background);
  const box = drawingWorldBox(d, withBg);
  if (!boxValid(box)) return { parts: [], empty: 'השרטוט ריק.' };
  const pad = Math.max(boxW(box), boxH(box), 10) * 0.03;
  return {
    parts: [{
      box: padBox(box, pad),
      render: (ctx) => (
        <>
          {withBg && d.background && renderBackground({ ...d.background, visible: true }, ctx, s.blackWhite ? 0.5 : d.background.opacity)}
          {renderElements(d, ctx)}
        </>
      ),
    }],
    note: d.background && !d.background.mmPerPx && withBg ? 'תמונת רקע לא מכוילת' : undefined,
  };
}

export interface Layout {
  fits: boolean;
  needW: number;
  needH: number;
  area: ReturnType<typeof drawingArea>;
  placements: { part: Part; ox: number; oy: number }[];
}

const GAP = 10;

export function layoutParts(parts: Part[], s: PrintSettings): Layout {
  const area = drawingArea(s);
  const k = 1 / s.scale;
  const sizes = parts.map((pt) => ({ w: boxW(pt.box) * k, h: boxH(pt.box) * k + (pt.caption ? 7 : 0) }));
  // Stack vertically on portrait pages, side by side on landscape pages.
  const vertical = s.orientation === 'portrait';
  const needW = vertical ? Math.max(0, ...sizes.map((z) => z.w)) : sizes.reduce((a, z) => a + z.w, 0) + GAP * Math.max(0, parts.length - 1);
  const needH = vertical ? sizes.reduce((a, z) => a + z.h, 0) + GAP * Math.max(0, parts.length - 1) : Math.max(0, ...sizes.map((z) => z.h));
  const fits = needW <= area.w + 1e-6 && needH <= area.h + 1e-6;
  const placements: Layout['placements'] = [];
  let cx = area.x + (area.w - needW) / 2, cy = area.y + (area.h - needH) / 2;
  parts.forEach((part, i) => {
    const z = sizes[i];
    const ox = vertical ? area.x + (area.w - z.w) / 2 : cx;
    const oy = vertical ? cy : area.y + (area.h - z.h) / 2;
    placements.push({ part, ox, oy });
    if (vertical) cy += z.h + GAP;
    else cx += z.w + GAP;
  });
  return { fits, needW, needH, area, placements };
}

/** Smallest standard scale (largest drawing) that fits, for the current paper settings. */
export function suggestScale(parts: Part[], s: PrintSettings): number | null {
  for (const sc of SCALES) if (layoutParts(parts, { ...s, scale: sc }).fits) return sc;
  return null;
}

export function HText({ x, y, size, children, anchor = 'right', bold = false, fill = '#000' }: { x: number; y: number; size: number; children: ReactNode; anchor?: 'right' | 'left' | 'center'; bold?: boolean; fill?: string }) {
  return (
    <text x={x} y={y} fontSize={size} fill={fill} direction="rtl" textAnchor={anchor === 'right' ? 'start' : anchor === 'left' ? 'end' : 'middle'}
      fontFamily="Rubik, Arial, sans-serif" fontWeight={bold ? 700 : 400}>{children}</text>
  );
}

function TitleBlockSvg({ tb, s, w, h }: { tb: TitleBlock; s: PrintSettings; w: number; h: number }) {
  const x0 = MARGIN, x1 = w - MARGIN, y1 = h - MARGIN, y0 = y1 - TITLE_H;
  const midY = y0 + 10;
  const cells: { label: string; value: string; w: number }[] = [
    { label: 'שם', value: tb.name, w: 0.22 },
    { label: 'כתה', value: tb.className, w: 0.1 },
    { label: 'תאריך', value: tb.date, w: 0.13 },
    { label: "תרגיל מס'", value: tb.exerciseNo, w: 0.11 },
    { label: 'המוסר', value: tb.submitter, w: 0.18 },
    { label: 'ציון', value: tb.grade, w: 0.1 },
    { label: "דף מס'", value: tb.sheetNo, w: 0.16 },
  ];
  const total = x1 - x0;
  let xr = x1;
  const line = { stroke: '#000', strokeWidth: 0.35 };
  return (
    <g>
      <line x1={x0} y1={y0} x2={x1} y2={y0} {...line} strokeWidth={0.5} />
      <line x1={x0} y1={midY} x2={x1} y2={midY} {...line} />
      <HText x={x1 - 3} y={y0 + 7.2} size={5.2} bold>{tb.title || ' '}</HText>
      <line x1={x0 + 46} y1={y0} x2={x0 + 46} y2={midY} {...line} />
      <HText x={x0 + 43} y={y0 + 4} size={2.4} fill="#333">קנה מידה</HText>
      <text x={x0 + 4} y={y0 + 8} fontSize={4} fontFamily="Rubik, Arial, sans-serif" direction="ltr" textAnchor="start">{scaleLabel(s.scale)}</text>
      {cells.map((c, i) => {
        const cw = c.w * total;
        const xr0 = xr;
        xr -= cw;
        return (
          <g key={c.label}>
            {i > 0 && <line x1={xr0} y1={midY} x2={xr0} y2={y1} {...line} />}
            <HText x={xr0 - 1.5} y={midY + 3.4} size={2.4} fill="#333">{c.label}</HText>
            <HText x={xr0 - 1.5} y={midY + 10.6} size={3.8}>{c.value}</HText>
          </g>
        );
      })}
    </g>
  );
}

export function CalibrationRuler({ x, y }: { x: number; y: number }) {
  // Horizontal 100 mm with ticks every 5 mm, and a short 10 mm vertical leg to check the other axis.
  const t: ReactNode[] = [];
  for (let i = 0; i <= 100; i += 5) t.push(<line key={`h${i}`} x1={x + i} y1={y} x2={x + i} y2={y - (i % 10 === 0 ? 2.5 : 1.5)} stroke="#000" strokeWidth={0.2} />);
  for (let i = 0; i <= 10; i += 5) t.push(<line key={`v${i}`} x1={x} y1={y - i} x2={x + (i % 10 === 0 ? 2.5 : 1.5)} y2={y - i} stroke="#000" strokeWidth={0.2} />);
  return (
    <g data-ruler="100mm">
      <line x1={x} y1={y} x2={x + 100} y2={y} stroke="#000" strokeWidth={0.3} />
      <line x1={x} y1={y} x2={x} y2={y - 10} stroke="#000" strokeWidth={0.3} />
      {t}
      <text x={x + 102} y={y + 1} fontSize={2.6} fontFamily="Rubik, Arial, sans-serif" direction="ltr">100 mm</text>
      <HText x={x + 100} y={y + 3.8} size={2.4} anchor="left">סרגל בדיקה: אם הקו לא באורך 100 מ״מ בדיוק, ההדפסה אינה בגודל אמיתי</HText>
    </g>
  );
}

export interface SheetResult {
  svg: ReactNode;
  layout: Layout;
  empty?: string;
  note?: string;
  paper: { w: number; h: number };
}

export function buildSheet(p: Project, s: PrintSettings, opts: { screen?: boolean } = {}): SheetResult {
  const paper = paperSize(s);
  const { parts, note, empty } = projectParts(p, s);
  const layout = layoutParts(parts, s);
  const corr = s.printerCorrection > 0 ? s.printerCorrection : 1;
  const k = 1 / s.scale;
  const clipId = `clip-${p.id.slice(0, 8)}`;
  const area = layout.area;

  const content = layout.placements.map(({ part, ox, oy }, i) => {
    const b = part.box;
    const T = (q: Vec2) => ({ x: ox + (q.x - b.minX) * k, y: oy + (b.maxY - q.y) * k });
    const ctx: ViewCtx = { T, k, pu: 1, bw: s.blackWhite, screen: !!opts.screen };
    const ch = boxH(b) * k;
    return (
      <g key={i}>
        {part.render(ctx)}
        {part.caption && <HText x={ox + boxW(b) * k} y={oy + ch + 5} size={3} anchor="right">{part.caption}</HText>}
      </g>
    );
  });

  const svg = (
    <svg xmlns="http://www.w3.org/2000/svg" width={`${paper.w}mm`} height={`${paper.h}mm`} viewBox={`0 0 ${paper.w} ${paper.h}`}>
      <rect x={0} y={0} width={paper.w} height={paper.h} fill="#fff" />
      <defs>
        <clipPath id={clipId}><rect x={area.x} y={area.y} width={area.w} height={area.h} /></clipPath>
      </defs>
      <g transform={corr !== 1 ? `translate(${paper.w / 2} ${paper.h / 2}) scale(${corr}) translate(${-paper.w / 2} ${-paper.h / 2})` : undefined}>
        {s.frame && <rect x={MARGIN} y={MARGIN} width={paper.w - 2 * MARGIN} height={paper.h - 2 * MARGIN} fill="none" stroke="#000" strokeWidth={0.5} />}
        <g clipPath={`url(#${clipId})`}>{content}</g>
        {note && <HText x={area.x + area.w} y={area.y + 4} size={2.8} fill="#555">{note}</HText>}
        {s.ruler && <CalibrationRuler x={MARGIN + 4} y={paper.h - MARGIN - (s.frame ? TITLE_H : 0) - 6} />}
        {s.frame && <TitleBlockSvg tb={p.titleBlock} s={s} w={paper.w} h={paper.h} />}
      </g>
    </svg>
  );
  return { svg, layout, empty, note, paper };
}

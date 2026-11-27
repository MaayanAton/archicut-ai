import { useMemo, useState } from 'react';
import { uid } from '../../document/factory';
import type { Project } from '../../document/types';
import { v2 } from '../../geometry/vec';
import { boxValid } from '../../drawing/viewport';
import { PanZoomCanvas } from '../PanZoomCanvas';
import { Check, Seg, confirmDialog } from '../common';
import { Icons } from '../icons';
import type { SiteData, SiteSection } from '../../site/types';
import { computeSection, type SiteModel } from '../../site/section';
import type { Contour } from '../../site/terrain';
import { ZSOURCE_LABELS } from '../../site/terrain';
import { renderSiteSection, sectionBox } from '../../site/render/section';
import { lib } from '../../site/library';
import { fmtM } from '../../site/units';
import { MField } from './fields';
import { PlanEditor } from './PlanEditor';
import { useSiteUi } from './siteUi';
import { ModeToggle } from './SitePanels';

type SProject = Extract<Project, { type: 'site' }>;
type SetData = (fn: (d: SiteData) => SiteData, record?: boolean) => void;

export const sectionTitle = (s: SiteSection) => (s.mode === 'section' ? `חתך ${s.label}-${s.label}` : s.label);

export function elevationPresets(d: SiteData, model: SiteModel): { name: string; sec: Omit<SiteSection, 'id'> }[] {
  const b = model.terrain.domain;
  const off = 3000;
  const W = b.maxX - b.minX, H = b.maxY - b.minY;
  const compass = Math.abs(d.north) < 1e-9;
  const mk = (label: string, a: { x: number; y: number }, bb: { x: number; y: number }, depth: number): Omit<SiteSection, 'id'> => ({ label, mode: 'elevation', a: v2(a.x, a.y), b: v2(bb.x, bb.y), side: 1, depth, showDims: true, showLevels: true });
  return [
    { name: compass ? 'חזית דרומית' : 'חזית מהצד התחתון', sec: mk(compass ? 'חזית דרומית' : 'חזית תחתונה', { x: b.minX, y: b.minY - off }, { x: b.maxX, y: b.minY - off }, H + off + 1000) },
    { name: compass ? 'חזית צפונית' : 'חזית מהצד העליון', sec: mk(compass ? 'חזית צפונית' : 'חזית עליונה', { x: b.maxX, y: b.maxY + off }, { x: b.minX, y: b.maxY + off }, H + off + 1000) },
    { name: compass ? 'חזית מזרחית' : 'חזית מהצד הימני', sec: mk(compass ? 'חזית מזרחית' : 'חזית ימנית', { x: b.maxX + off, y: b.minY }, { x: b.maxX + off, y: b.maxY }, W + off + 1000) },
    { name: compass ? 'חזית מערבית' : 'חזית מהצד השמאלי', sec: mk(compass ? 'חזית מערבית' : 'חזית שמאלית', { x: b.minX - off, y: b.maxY }, { x: b.minX - off, y: b.minY }, W + off + 1000) },
  ];
}

export function SectionsTab({ project, model, contours, setData }: { project: SProject; model: SiteModel; contours: Contour[] | null; setData: SetData }) {
  const d = project.data;
  const ui = useSiteUi();
  const [pane, setPane] = useState<'plan' | 'section'>('section');
  const cur = d.sections.find((s) => s.id === ui.selSection) ?? d.sections[0] ?? null;
  const res = useMemo(() => (cur ? computeSection(model, cur) : null), [model, cur]);
  const box = useMemo(() => (res ? sectionBox(res) : null), [res]);
  const setSec = (patch: Partial<SiteSection>) => cur && setData((dd) => ({ ...dd, sections: dd.sections.map((s) => (s.id === cur.id ? { ...s, ...patch } : s)) }));
  const remove = async () => {
    if (!cur) return;
    if (!(await confirmDialog('מחיקת חתך', `למחוק את ${sectionTitle(cur)}? חתכים שמופיעים בגיליון יוסרו ממנו.`, 'מחיקה', true))) return;
    setData((dd) => ({ ...dd, sections: dd.sections.filter((s) => s.id !== cur.id), sheets: dd.sheets.map((sh) => ({ ...sh, items: sh.items.filter((it) => !(it.type === 'section' && it.sectionId === cur.id)) })) }));
    useSiteUi.setState({ selSection: null });
  };
  const addElevation = (sec: Omit<SiteSection, 'id'>) => {
    const s = { ...sec, id: uid() };
    setData((dd) => ({ ...dd, sections: [...dd.sections, s] }));
    useSiteUi.setState({ selSection: s.id });
  };
  const sectionTool = ui.tool.t === 'section';

  return (
    <div className="workspace">
      <aside className="panel site-panel" aria-label="חתכים">
        <ModeToggle />
        <div className="panel-section">
          <h3>חתכים וחזיתות</h3>
          <button className={`btn ${sectionTool ? 'active' : 'primary'}`} onClick={() => { useSiteUi.getState().setTool(sectionTool ? { t: 'select' } : { t: 'section' }); setPane('plan'); }}>{Icons.section} {sectionTool ? 'מסמנים קו חתך בתוכנית…' : 'קו חתך חדש'}</button>
          {d.sections.length === 0 ? <span className="small muted">אין עדיין חתכים. סמני קו בתוכנית, בכל זווית.</span> : (
            <div className="choice-list sec-list">
              {d.sections.map((s) => (
                <button key={s.id} className={`choice ${cur?.id === s.id ? 'on' : ''}`} onClick={() => { useSiteUi.setState({ selSection: s.id }); setPane('section'); }} aria-pressed={cur?.id === s.id}>
                  <div className="ic">{Icons.section}</div>
                  <div><strong>{sectionTitle(s)}</strong><span>{s.mode === 'section' ? 'חתך' : 'חזית'} · אורך {fmtM(Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y))}</span></div>
                </button>
              ))}
            </div>
          )}
          <details>
            <summary className="small">הוספת חזית של המתחם</summary>
            <div className="row" style={{ marginTop: 8 }}>
              {elevationPresets(d, model).map((p) => <button key={p.name} className="btn sm" onClick={() => addElevation(p.sec)}>{p.name}</button>)}
            </div>
          </details>
        </div>
        {cur && (
          <div className="panel-section">
            <h3>{sectionTitle(cur)}</h3>
            <label className="field"><span>{cur.mode === 'section' ? 'אות החתך' : 'שם החזית'}</span><input className="input" value={cur.label} maxLength={cur.mode === 'section' ? 3 : 40} onChange={(e) => setSec({ label: e.target.value || 'A' })} /></label>
            <div className="field"><span>סוג</span><Seg value={cur.mode} options={[{ v: 'section', label: 'חתך (המישור חותך)' }, { v: 'elevation', label: 'חזית (מבט בלבד)' }]} onChange={(v) => setSec({ mode: v })} /></div>
            <button className="btn sm" onClick={() => setSec({ side: cur.side === 1 ? -1 : 1 })}>{Icons.rotate} היפוך כיוון המבט</button>
            <MField label="עומק התצוגה מעבר למישור" value={cur.depth} min={0} onChange={(v) => setSec({ depth: v })} />
            <Check checked={cur.showLevels} onChange={(v) => setSec({ showLevels: v })}>סימוני גובה (מפלסים)</Check>
            <Check checked={cur.showDims} onChange={(v) => setSec({ showDims: v })}>מידות אופקיות ואנכיות</Check>
            {ui.advanced && (
              <div className="grid2">
                <MField label="התחלה X" value={cur.a.x} allowNegative onChange={(v) => setSec({ a: v2(v, cur.a.y) })} />
                <MField label="התחלה Y" value={cur.a.y} allowNegative onChange={(v) => setSec({ a: v2(cur.a.x, v) })} />
                <MField label="סוף X" value={cur.b.x} allowNegative onChange={(v) => setSec({ b: v2(v, cur.b.y) })} />
                <MField label="סוף Y" value={cur.b.y} allowNegative onChange={(v) => setSec({ b: v2(cur.b.x, v) })} />
              </div>
            )}
            <span className="small muted">בלשונית התוכנית שכאן אפשר לגרור את קצות הקו. החתך מתעדכן מיד אחרי כל שינוי במודל.</span>
            <button className="btn sm danger" onClick={remove}>{Icons.trash} מחיקת {cur.mode === 'section' ? 'החתך' : 'החזית'}</button>
          </div>
        )}
        {res && (
          <div className="panel-section" data-testid="section-info">
            <h3>מה רואים בחתך</h3>
            <span className="small">נחתכים: <b className="num">{res.cutIds.length}</b> אלמנטים · נראים מעבר למישור: <b className="num">{res.beyondIds.length}</b></span>
            <span className="small muted">{[...new Set(res.cutIds.map((id) => lib(d.elements.find((e) => e.id === id)?.kind ?? '').label))].join(', ') || '—'}</span>
            <div className="small legend-col">
              <span><i className="lg-cut" /> אלמנט שהמישור חותך (קו עבה ומילוי)</span>
              <span><i className="lg-beyond" /> אלמנט מעבר למישור (קו דק)</span>
              <span><i className="lg-earth" /> אדמה בחתך</span>
            </div>
            <span className="small muted">מקור גובה הקרקע לאורך הקו: {res.sources.map((s) => ZSOURCE_LABELS[s]).join('; ')}.</span>
          </div>
        )}
      </aside>
      <section className="stage">
        <div className="view-tabs">
          <Seg value={pane} options={[{ v: 'section', label: 'החתך' }, { v: 'plan', label: 'התוכנית' }]} onChange={setPane} />
        </div>
        <div className="split sections-split">
          <div className={pane === 'plan' ? '' : 'hidden-mobile'}>
            <PlanEditor project={project} model={model} contours={contours} mode="sections" setData={setData} />
          </div>
          <div className={pane === 'section' ? '' : 'hidden-mobile'}>
            {res && box && boxValid(box) ? (
              <PanZoomCanvas testId="site-section" box={box} fitKey={`${cur!.id}-${Math.round(res.L)}`} label={sectionTitle(cur!)} keepInView
                render={(ctx) => renderSiteSection(res, ctx, { mode: cur!.mode, showDims: cur!.showDims, showLevels: cur!.showLevels, highlight: new Set(ui.sel) })} />
            ) : (
              <div className="empty-stage"><div className="notice info">{Icons.info}<span>{d.sections.length ? 'קו החתך קצר מדי.' : 'כדי לראות חתך, לחצי על "קו חתך חדש" וסמני קו בתוכנית.'}</span></div></div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

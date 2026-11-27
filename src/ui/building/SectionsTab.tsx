// Sections and elevations of the building: a list of section lines, the plan to draw them on, and the drawing,
// computed from the same model as the plan and 3D (so they follow every change).

import { useEffect, useMemo, useRef, useState } from 'react';
import { uid } from '../../document/factory';
import type { Project } from '../../document/types';
import { v2 } from '../../geometry/vec';
import { boxValid } from '../../drawing/viewport';
import { PanZoomCanvas } from '../PanZoomCanvas';
import { Check, Seg, confirmDialog } from '../common';
import { Icons } from '../icons';
import { fmtM } from '../../site/units';
import { MField } from '../site/fields';
import type { BldSection, BuildingData } from '../../building/types';
import { sortedLevels, type BuildingModel } from '../../building/model';
import { computeBSection, elevationLine } from '../../building/section';
import { buildingBox } from '../../building/render/plan';
import { bSectionBox, renderBSection } from '../../building/render/section';
import { EL_LABELS, findEl } from '../../building/edit';
import { PlanEditor, type SetB } from './PlanEditor';
import { BModeToggle, BPanelAside } from './Panels';
import { useBldUi } from './bldUi';

type BProject = Extract<Project, { type: 'building' }>;

export const bSectionTitle = (s: BldSection) => (s.mode === 'section' ? `חתך ${s.label}-${s.label}` : s.label);

export function bElevationPresets(d: BuildingData, model: BuildingModel): { name: string; sec: Omit<BldSection, 'id'> }[] {
  const b = buildingBox(d, model);
  if (!Number.isFinite(b.minX)) return [];
  const compass = Math.abs(d.north) < 1e-9;
  const W = b.maxX - b.minX, H = b.maxY - b.minY;
  const mk = (dir: 'south' | 'north' | 'east' | 'west', name: string, alt: string): { name: string; sec: Omit<BldSection, 'id'> } => {
    const l = elevationLine(b, dir);
    const depth = (dir === 'south' || dir === 'north' ? H : W) + 6000;
    return { name: compass ? name : alt, sec: { label: compass ? name : alt, mode: 'elevation', a: l.a, b: l.b, side: l.side, depth, showDims: true, showLevels: true, showFurniture: false } };
  };
  return [mk('south', 'חזית דרומית', 'חזית תחתונה'), mk('north', 'חזית צפונית', 'חזית עליונה'), mk('east', 'חזית מזרחית', 'חזית ימנית'), mk('west', 'חזית מערבית', 'חזית שמאלית')];
}

export function SectionsTab({ project, model, setData, levelId }: { project: BProject; model: BuildingModel; setData: SetB; levelId: string }) {
  const d = project.data;
  const ui = useBldUi();
  const [pane, setPane] = useState<'plan' | 'section'>('section');
  const cur = d.sections.find((s) => s.id === ui.selSection) ?? d.sections[0] ?? null;
  const res = useMemo(() => (cur ? computeBSection(d, model, cur) : null), [d, model, cur]);
  const box = useMemo(() => (res ? bSectionBox(res) : null), [res]);
  const setSec = (patch: Partial<BldSection>) => cur && setData((dd) => ({ ...dd, sections: dd.sections.map((s) => (s.id === cur.id ? { ...s, ...patch } : s)) }));

  // A section line just drawn in the plan becomes the current one.
  const count = useRef(d.sections.length);
  useEffect(() => {
    if (d.sections.length > count.current) { useBldUi.setState({ selSection: d.sections[d.sections.length - 1].id }); setPane('section'); }
    count.current = d.sections.length;
  }, [d.sections]);

  const remove = async () => {
    if (!cur) return;
    if (!(await confirmDialog('מחיקת חתך', `למחוק את ${bSectionTitle(cur)}? חתכים שמופיעים בגיליון יוסרו ממנו.`, 'מחיקה', true))) return;
    setData((dd) => ({ ...dd, sections: dd.sections.filter((s) => s.id !== cur.id), sheets: dd.sheets.map((sh) => ({ ...sh, items: sh.items.filter((it) => !(it.type === 'section' && it.sectionId === cur.id)) })) }));
    useBldUi.setState({ selSection: null });
  };
  const addElevation = (sec: Omit<BldSection, 'id'>) => {
    const s = { ...sec, id: uid() };
    setData((dd) => ({ ...dd, sections: [...dd.sections, s] }));
  };
  const sectionTool = ui.tool.t === 'section';
  const presets = bElevationPresets(d, model);
  const cutNames = res ? [...new Set(res.cutIds.map((id) => findEl(d, id)?.type).filter((t): t is NonNullable<typeof t> => !!t).map((t) => EL_LABELS[t]))] : [];

  return (
    <div className="workspace">
      <BPanelAside label="חתכים וחזיתות">
        <BModeToggle />
        <div className="panel-section">
          <h3>{Icons.section} חתכים וחזיתות</h3>
          <button className={`btn ${sectionTool ? 'active' : 'primary'}`} onClick={() => { useBldUi.getState().setTool(sectionTool ? { t: 'select' } : { t: 'section' }); setPane('plan'); }}>{Icons.section} {sectionTool ? 'מסמנים קו חתך בתוכנית…' : 'קו חתך חדש'}</button>
          {d.sections.length === 0 ? <span className="small muted">אין עדיין חתכים. סמני קו בתוכנית, בכל זווית, או הוסיפי חזית.</span> : (
            <div className="choice-list sec-list">
              {d.sections.map((s) => (
                <button key={s.id} className={`choice ${cur?.id === s.id ? 'on' : ''}`} onClick={() => { useBldUi.setState({ selSection: s.id }); setPane('section'); }} aria-pressed={cur?.id === s.id}>
                  <div className="ic">{Icons.section}</div>
                  <div><strong>{bSectionTitle(s)}</strong><span>{s.mode === 'section' ? 'חתך' : 'חזית'} · אורך קו {fmtM(Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y))}</span></div>
                </button>
              ))}
            </div>
          )}
          {presets.length > 0 && (
            <div className="field">
              <span>הוספת חזית של המבנה</span>
              <div className="row" style={{ flexWrap: 'wrap' }}>{presets.map((p) => <button key={p.name} className="btn sm" onClick={() => addElevation(p.sec)}>{p.name}</button>)}</div>
            </div>
          )}
        </div>
        {cur && (
          <div className="panel-section">
            <h3>{bSectionTitle(cur)}</h3>
            <label className="field"><span>{cur.mode === 'section' ? 'אות החתך' : 'שם החזית'}</span><input className="input" value={cur.label} maxLength={cur.mode === 'section' ? 3 : 40} onChange={(e) => setSec({ label: e.target.value || 'A' })} aria-label={cur.mode === 'section' ? 'אות החתך' : 'שם החזית'} /></label>
            <div className="field"><span>סוג</span><Seg value={cur.mode} options={[{ v: 'section', label: 'חתך (המישור חותך)' }, { v: 'elevation', label: 'חזית (מבט בלבד)' }]} onChange={(v) => setSec({ mode: v })} ariaLabel="סוג" /></div>
            <button className="btn sm" onClick={() => setSec({ side: cur.side === 1 ? -1 : 1 })}>{Icons.rotate} היפוך כיוון המבט</button>
            <MField label="עומק התצוגה מעבר למישור" value={cur.depth} min={0} onChange={(v) => setSec({ depth: v })} />
            <Check checked={cur.showLevels} onChange={(v) => setSec({ showLevels: v })}>סימוני מפלסים</Check>
            <Check checked={cur.showDims} onChange={(v) => setSec({ showDims: v })}>מידות: גובה פתחים, גובה קומות ורוחב</Check>
            <Check checked={cur.showFurniture} onChange={(v) => setSec({ showFurniture: v })}>ריהוט בחתך</Check>
            {ui.advanced && (
              <div className="grid2">
                <MField label="התחלה X" value={cur.a.x} allowNegative onChange={(v) => setSec({ a: v2(v, cur.a.y) })} />
                <MField label="התחלה Y" value={cur.a.y} allowNegative onChange={(v) => setSec({ a: v2(cur.a.x, v) })} />
                <MField label="סוף X" value={cur.b.x} allowNegative onChange={(v) => setSec({ b: v2(v, cur.b.y) })} />
                <MField label="סוף Y" value={cur.b.y} allowNegative onChange={(v) => setSec({ b: v2(cur.b.x, v) })} />
              </div>
            )}
            {!ui.advanced && <span className="small muted">קואורדינטות מדויקות של קו החתך זמינות במצב מתקדם.</span>}
            <button className="btn sm danger" onClick={remove}>{Icons.trash} מחיקת {cur.mode === 'section' ? 'החתך' : 'החזית'}</button>
          </div>
        )}
        {res && (
          <div className="panel-section" data-testid="bsection-info">
            <h3>מה רואים</h3>
            {cur?.mode === 'section' && <span className="small">נחתכים: <b className="num">{res.cutIds.length}</b> אלמנטים{cutNames.length ? ` (${cutNames.join(', ')})` : ''}</span>}
            <div className="small legend-col">
              {cur?.mode === 'section' && <span><i className="lg-cut" /> אלמנט נחתך (קיר, רצפה, גג, מדרגות): קו עבה ומילוי כהה</span>}
              <span><i className="lg-beyond" /> אלמנט מעבר למישור: קו דק</span>
              <span><i className="lg-earth" /> קרקע (מפלס הקרקע מההגדרות)</span>
            </div>
            <span className="small muted">החתך מחושב מהמודל עצמו ומתעדכן אחרי כל שינוי בתוכנית.</span>
          </div>
        )}
      </BPanelAside>
      <section className="stage">
        <div className="view-tabs">
          <Seg value={pane} options={[{ v: 'section', label: 'החתך' }, { v: 'plan', label: 'התוכנית' }]} onChange={setPane} ariaLabel="תצוגה" />
          <select className="input level-pick" value={levelId} onChange={(e) => useBldUi.setState({ levelId: e.target.value, sel: [] })} aria-label="קומה בתוכנית">
            {sortedLevels(d).reverse().map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        <div className="split sections-split">
          <div className={pane === 'plan' ? '' : 'hidden-mobile'}>
            <PlanEditor project={project} model={model} setData={setData} levelId={levelId} />
          </div>
          <div className={pane === 'section' ? '' : 'hidden-mobile'}>
            {res && box && boxValid(box) ? (
              <PanZoomCanvas testId="bld-section" box={box} fitKey={`${cur!.id}-${cur!.mode}-${cur!.side}`} label={bSectionTitle(cur!)} keepInView
                render={(ctx) => renderBSection(res, ctx, { mode: cur!.mode, showDims: cur!.showDims, showLevels: cur!.showLevels, highlight: new Set(ui.sel) })} />
            ) : (
              <div className="empty-stage"><div className="notice info">{Icons.info}<span>{d.sections.length ? 'קו החתך קצר מדי.' : 'כדי לראות חתך, לחצי על "קו חתך חדש" וסמני קו בתוכנית, או הוסיפי חזית.'}</span></div></div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

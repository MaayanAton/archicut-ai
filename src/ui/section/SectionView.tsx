import { useMemo, useState } from 'react';
import { navigate } from '../../App';
import { useStore } from '../../document/store';
import { uid } from '../../document/factory';
import type { DrawingElement, Project, SectionData } from '../../document/types';
import { ORIENTATION_LABELS, type PlaneOrientation } from '../../geometry/section';
import { SOLID_FIELDS, SOLID_LABELS, type SolidKind } from '../../geometry/solids';
import { fmt } from '../../geometry/vec';
import { computeSection, POLY_NAMES } from '../../drawing/sectionCompute';
import { renderSection, sectionWorldBox } from '../../drawing/sectionRender';
import { padBox } from '../../drawing/viewport';
import { PanZoomCanvas } from '../PanZoomCanvas';
import { Check, NumberField, Seg, toast } from '../common';
import { Icons } from '../icons';
import { Section3D } from './Section3D';

type SProject = Extract<Project, { type: 'section' }>;

function Slider({ label, value, min, max, step, unit, onChange, onStart }: { label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (v: number, record: boolean) => void; onStart: () => void }) {
  return (
    <div className="field">
      <span>{label}</span>
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <input type="range" min={min} max={max} step={step} value={Math.min(max, Math.max(min, value))} aria-label={label}
          onPointerDown={onStart} onKeyDown={onStart} onChange={(e) => onChange(Number(e.target.value), false)} />
        <div style={{ width: 120, flex: 'none' }}>
          <NumberField value={value} allowEmpty={false} unit={unit} ariaLabel={`${label} – ערך מדויק`} onChange={(v) => v !== null && onChange(v, true)} />
        </div>
      </div>
    </div>
  );
}

export function SectionView({ project }: { project: SProject }) {
  const d = project.data;
  const update = useStore((s) => s.update);
  const [mobileView, setMobileView] = useState<'3d' | '2d'>('3d');
  const [showRemoved, setShowRemoved] = useState(true);
  const [advanced, setAdvanced] = useState(d.plane.azimuth !== 0 || d.solid.rotX !== 0 || d.solid.rotY !== 0 || d.solid.rotZ !== 0);

  const setData = (fn: (d: SectionData) => SectionData, record = true) =>
    update(project.id, (p) => (p.type === 'section' ? { ...p, data: fn(p.data) } : p), record);
  const checkpoint = () => useStore.getState().checkpoint(project.id);

  const comp = useMemo(() => computeSection(d), [d]);
  const r = comp.outcome?.result ?? null;
  const box = useMemo(() => padBox(sectionWorldBox(r), 12), [r]);
  const range = Math.ceil(comp.radius * 1.05);

  const to2D = () => {
    if (!r || r.kind !== 'polygon') return;
    const els: DrawingElement[] = [
      { id: uid(), kind: 'polygon', pts: r.pts2, closed: true, style: 'solid', width: 0.5 },
      { id: uid(), kind: 'text', p: { x: Math.min(...r.pts2.map((p) => p.x)), y: Math.min(...r.pts2.map((p) => p.y)) - 12 }, text: `חתך: ${SOLID_LABELS[d.solid.kind]}`, size: 3.5, style: 'solid', width: 0.25 },
    ];
    if (!comp.curved && r.pts2.length <= 12)
      r.pts2.forEach((a, i) => {
        const b = r.pts2[(i + 1) % r.pts2.length];
        els.push({ id: uid(), kind: 'dim', a, b, offset: -10, style: 'solid', width: 0.18 });
      });
    const id = useStore.getState().create('drawing', `שרטוט חתך – ${project.name}`, (p) => (p.type === 'drawing' ? { ...p, data: { ...p.data, elements: els, grid: { size: 10, show: true, snap: true } } } : p));
    toast('נוצר שרטוט דו-ממדי של החתך. אפשר לערוך אותו ולהדפיס.');
    navigate({ name: 'project', id });
  };

  return (
    <div className="workspace">
      <aside className="panel" aria-label="הגדרות הגוף והחתך">
        {project.demo && <div className="notice warn">{Icons.info}<span>פרויקט הדגמה: המידות כאן לדוגמה בלבד.</span></div>}
        <div className="panel-section">
          <h3>הגוף</h3>
          <select className="input" value={d.solid.kind} aria-label="סוג הגוף"
            onChange={(e) => setData((dd) => ({ ...dd, solid: { ...dd.solid, kind: e.target.value as SolidKind } }))}>
            {(Object.keys(SOLID_LABELS) as SolidKind[]).map((k) => <option key={k} value={k}>{SOLID_LABELS[k]}</option>)}
          </select>
          <div className="grid2">
            {SOLID_FIELDS[d.solid.kind].map((f) => (
              <NumberField key={f.key} label={f.label} unit={f.key === 'n' ? undefined : 'מ״מ'} value={d.solid[f.key]}
                onChange={(v) => setData((dd) => ({ ...dd, solid: { ...dd.solid, [f.key]: v } }))} />
            ))}
          </div>
          {comp.errors.length > 0 && (
            <div className="notice warn">{Icons.warn}<span>{comp.errors.join(' · ')}. הזיני את המידות כדי לראות את הגוף והחתך.</span></div>
          )}
        </div>

        <div className="panel-section">
          <h3>מישור החיתוך</h3>
          <div className="field"><span>כיוון בסיסי</span>
            <Seg value={d.plane.orientation} options={(Object.keys(ORIENTATION_LABELS) as PlaneOrientation[]).map((o) => ({ v: o, label: ORIENTATION_LABELS[o].split(' ')[0] }))}
              onChange={(v) => setData((dd) => ({ ...dd, plane: { ...dd.plane, orientation: v } }))} />
          </div>
          <Slider label="מיקום החיתוך (מהמרכז)" value={d.plane.offset} min={-range} max={range} step={0.5} unit="מ״מ" onStart={checkpoint}
            onChange={(v, rec) => setData((dd) => ({ ...dd, plane: { ...dd.plane, offset: v } }), rec)} />
          <Slider label="זווית הטיה" value={d.plane.tilt} min={-89} max={89} step={0.5} unit="°" onStart={checkpoint}
            onChange={(v, rec) => setData((dd) => ({ ...dd, plane: { ...dd.plane, tilt: v } }), rec)} />
          <Check checked={advanced} onChange={setAdvanced}>מצב מתקדם: סיבוב הגוף וסיבוב המישור</Check>
          {advanced && (
            <>
              <Slider label="סיבוב המישור סביב ציר Z" value={d.plane.azimuth} min={-180} max={180} step={1} unit="°" onStart={checkpoint}
                onChange={(v, rec) => setData((dd) => ({ ...dd, plane: { ...dd.plane, azimuth: v } }), rec)} />
              {(['rotX', 'rotY', 'rotZ'] as const).map((k) => (
                <Slider key={k} label={`סיבוב הגוף סביב ציר ${k.slice(3)}`} value={d.solid[k]} min={-180} max={180} step={1} unit="°" onStart={checkpoint}
                  onChange={(v, rec) => setData((dd) => ({ ...dd, solid: { ...dd.solid, [k]: v } }), rec)} />
              ))}
            </>
          )}
          <Check checked={showRemoved} onChange={setShowRemoved}>הצגת החלק שהוסר (שקוף)</Check>
        </div>

        <div className="panel-section" aria-live="polite">
          <h3>תוצאת החתך</h3>
          {comp.errors.length === 0 && r && (
            <>
              <div className={`notice ${comp.warnings.length ? 'warn' : r.kind === 'none' ? 'info' : 'ok'}`}>{comp.warnings.length ? Icons.warn : Icons.check}<span>{comp.summary}</span></div>
              {r.kind === 'polygon' && (
                <div className="small" style={{ display: 'grid', gap: 4 }}>
                  {!comp.curved && <div>סוג: {POLY_NAMES[r.pts2.length] ?? `מצולע (${r.pts2.length})`}</div>}
                  {comp.measures && (
                    <>
                      <div>שטח: <span className="num">{comp.measures.exact ? '' : '≈ '}{fmt(comp.measures.area, comp.measures.exact ? 1 : 0)}</span> מ״מ²</div>
                      <div>היקף: <span className="num">{comp.measures.exact ? '' : '≈ '}{fmt(comp.measures.perimeter, 1)}</span> מ״מ</div>
                      {!comp.measures.exact && <div className="muted">≈ מחושב לפי קו המתאר (720 נקודות), סטייה יחסית של כמאית האחוז לכל היותר.</div>}
                    </>
                  )}
                  {comp.conic?.curve.type === 'ellipse' && comp.conic.curve.semiMajor !== null && (
                    <div>צירי האליפסה (מחושב): <span className="num">{fmt(2 * comp.conic.curve.semiMajor, 2)} × {fmt(2 * comp.conic.curve.semiMinor!, 2)}</span> מ״מ{comp.conic.curve.truncated ? ' (לפני החיתוך בבסיס)' : ''}</div>
                  )}
                  {comp.conic?.curve.type === 'circle' && <div>רדיוס המעגל: <span className="num">{fmt(comp.conic.curve.radius, 2)}</span> מ״מ</div>}
                  {comp.conic && <div className="muted">זווית בין המישור לציר הגוף: <span className="num">{fmt(comp.conic.planeAxisAngle, 2)}°</span>{comp.conic.halfAngle !== undefined && <> · חצי זווית הראש של החרוט: <span className="num">{fmt(comp.conic.halfAngle, 2)}°</span></>}</div>}
                  {comp.curved && <div className="muted">נקודות הקו העקום מחושבות בדיוק על פני הגוף (720 נקודות על ההיקף), וביניהן הקו ישר. המידות שמעליו (צירים, רדיוס) מחושבות בנוסחה מדויקת.</div>}
                </div>
              )}
              <div className="row">
                <button className="btn" disabled={r.kind !== 'polygon'} onClick={to2D}>{Icons.pencil} שרטוט דו-ממדי של החתך</button>
                <button className="btn" onClick={() => navigate({ name: 'print', id: project.id })}>{Icons.print} הדפסת החתך</button>
              </div>
            </>
          )}
        </div>
      </aside>

      <section className="stage">
        <div className="view-tabs">
          <Seg value={mobileView} options={[{ v: '3d', label: 'תלת-ממד' }, { v: '2d', label: 'צורת החתך' }]} onChange={setMobileView} />
        </div>
        <div className="split">
          <div className={mobileView === '3d' ? '' : 'hidden-mobile'} style={{ position: 'relative' }}>
            <div className="canvas-label">תלת-ממד – גררי לסיבוב, צבטי להגדלה</div>
            <div className="canvas-wrap"><Section3D poly={comp.poly} plane={comp.plane} section={r} radius={comp.radius} showRemoved={showRemoved} viewKey={`${d.solid.kind}-${d.plane.orientation}`} /></div>
          </div>
          <div className={mobileView === '2d' ? '' : 'hidden-mobile'}>
            <PanZoomCanvas testId="section-2d" label="צורת החתך בגודל אמיתי (מבט ניצב למישור)" box={box} keepInView fitKey={`${d.solid.kind}-${r?.kind}`} render={(ctx) => renderSection(r, ctx, { curved: comp.curved })} />
          </div>
        </div>
      </section>
    </div>
  );
}

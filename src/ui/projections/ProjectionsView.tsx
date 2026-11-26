import { useMemo, useRef, useState } from 'react';
import { useStore } from '../../document/store';
import { uid } from '../../document/factory';
import type { Project, ProjectionsData } from '../../document/types';
import { classifyPoint, describePosition, fromEpureDrag, missingCoords, type SpacePoint } from '../../geometry/projection';
import { axoWorldBox, epureWorldBox, renderAxonometric, renderEpure } from '../../drawing/projectionsRender';
import { padBox } from '../../drawing/viewport';
import { PanZoomCanvas } from '../PanZoomCanvas';
import { Check, NumberField, Seg } from '../common';
import { Icons } from '../icons';

type PProject = Extract<Project, { type: 'projections' }>;

const nextName = (pts: SpacePoint[]) => {
  const used = new Set(pts.map((p) => p.name));
  for (const c of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') if (!used.has(c)) return c;
  return `P${pts.length + 1}`;
};

export function ProjectionsView({ project }: { project: PProject }) {
  const d = project.data;
  const [selected, setSelected] = useState<string | null>(d.points[0]?.id ?? null);
  const [mobileView, setMobileView] = useState<'epure' | 'axo'>('epure');
  const [snap, setSnap] = useState(true);
  const drag = useRef<{ pid: string; which: 1 | 2 | 3 } | null>(null);
  const update = useStore((s) => s.update);

  const setData = (fn: (d: ProjectionsData) => ProjectionsData, record = true) =>
    update(project.id, (p) => (p.type === 'projections' ? { ...p, data: fn(p.data) } : p), record);
  const setPoint = (id: string, patch: Partial<SpacePoint>, record = true) =>
    setData((dd) => ({ ...dd, points: dd.points.map((p) => (p.id === id ? { ...p, ...patch } : p)) }), record);

  const addPoint = () => {
    const p: SpacePoint = { id: uid(), name: nextName(d.points), x: null, y: null, z: null };
    setData((dd) => ({ ...dd, points: [...dd.points, p] }));
    setSelected(p.id);
  };

  // Keep the drawing extents stable while dragging so the view does not jump.
  const epBox = useMemo(() => padBox(epureWorldBox(d), 8), [d]);
  const axBox = useMemo(() => padBox(axoWorldBox(d), 8), [d]);
  const fitKey = `${d.points.length}-${d.epure.showP3}-${d.epure.sideRight}-${d.axo.kind}`;

  const sel = d.points.find((p) => p.id === selected) ?? null;
  const missingAny = d.points.some((p) => missingCoords(p).length > 0);

  return (
    <div className="workspace">
      <aside className="panel" aria-label="נקודות והגדרות">
        {project.demo && <div className="notice warn">{Icons.info}<span>פרויקט הדגמה: המידות כאן לדוגמה בלבד ואינן מתוך תרגיל.</span></div>}
        <div className="panel-section">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h3>נקודות במרחב (מ״מ)</h3>
            <button className="btn sm primary" onClick={addPoint}>{Icons.plus} נקודה</button>
          </div>
          {d.points.length === 0 ? (
            <div className="notice info">{Icons.info}<span>הוסיפי נקודה והזיני את המרחקים שלה: X לאורך ציר ההטלה, Y מרחק לפני π2, Z גובה מעל π1.</span></div>
          ) : (
            <div className="pt-table">
              <div className="pt-row head"><span>שם</span><span>X</span><span>Y</span><span>Z</span><span /></div>
              {d.points.map((p) => (
                <div key={p.id} className={`pt-row ${p.id === selected ? 'sel' : ''}`} onFocus={() => setSelected(p.id)} onClick={() => setSelected(p.id)}>
                  <input className="input pt-name" value={p.name} maxLength={4} aria-label="שם הנקודה" onChange={(e) => setPoint(p.id, { name: e.target.value.slice(0, 4) })} />
                  <NumberField value={p.x} onChange={(v) => setPoint(p.id, { x: v })} ariaLabel={`X של ${p.name}`} />
                  <NumberField value={p.y} onChange={(v) => setPoint(p.id, { y: v })} ariaLabel={`Y של ${p.name}`} />
                  <NumberField value={p.z} onChange={(v) => setPoint(p.id, { z: v })} ariaLabel={`Z של ${p.name}`} />
                  <button className="btn sm ghost icon danger" aria-label={`מחיקת ${p.name}`} title="מחיקת נקודה" onClick={(e) => { e.stopPropagation(); setData((dd) => ({ ...dd, points: dd.points.filter((q) => q.id !== p.id) })); }}>{Icons.trash}</button>
                </div>
              ))}
            </div>
          )}
          {missingAny && <div className="notice warn">{Icons.warn}<span>יש נקודות עם נתונים חסרים (מסומנים בצהוב). ההיטלים שאי אפשר לחשב בלי הנתון החסר לא מוצגים. המערכת לא משלימה ערכים בעצמה.</span></div>}
          {sel && (
            <div className="small muted">
              <strong style={{ color: 'var(--ink)' }}>{sel.name}:</strong> {describePosition(classifyPoint(sel))}
              {missingCoords(sel).length > 0 && <> · חסר: <span className="ltr">{missingCoords(sel).join(', ').toUpperCase()}</span></>}
            </div>
          )}
        </div>

        <div className="panel-section">
          <h3>מערכת ההיטלים</h3>
          <Check checked={d.epure.showP3} onChange={(v) => setData((dd) => ({ ...dd, epure: { ...dd.epure, showP3: v } }))}>הצגת מישור צדדי π3</Check>
          {d.epure.showP3 && (
            <>
              <div className="field"><span>צד המישור הצדדי</span>
                <Seg value={d.epure.sideRight ? 'r' : 'l'} options={[{ v: 'r', label: 'מימין' }, { v: 'l', label: 'משמאל' }]}
                  onChange={(v) => setData((dd) => ({ ...dd, epure: { ...dd.epure, sideRight: v === 'r' }, axo: { ...dd.axo, sideRight: v === 'r' } }))} />
              </div>
              <div className="field"><span>העברת ההיטל השלישי</span>
                <Seg value={d.epure.transfer} options={[{ v: 'line45', label: 'קו 45°' }, { v: 'arc', label: 'קשת' }]}
                  onChange={(v) => setData((dd) => ({ ...dd, epure: { ...dd.epure, transfer: v } }))} />
              </div>
            </>
          )}
          <Check checked={d.showConstruction} onChange={(v) => setData((dd) => ({ ...dd, showConstruction: v }))}>קווי עזר בין הנקודה להיטלים</Check>
          <Check checked={snap} onChange={setSnap}>הצמדה למילימטר שלם בזמן גרירה</Check>
        </div>

        <div className="panel-section">
          <h3>תצוגה מרחבית</h3>
          <Seg value={d.axo.kind} options={[{ v: 'cavalier', label: 'קוולייר' }, { v: 'cabinet', label: 'קבינט' }, { v: 'isometric', label: 'איזומטריה' }]}
            onChange={(v) => setData((dd) => ({ ...dd, axo: { ...dd.axo, kind: v } }))} />
          <span className="small muted">קוולייר: π2 בגודל אמיתי, עומק ב-45° ביחס 1:1. קבינט: עומק ביחס 1:2.</span>
        </div>
      </aside>

      <section className="stage">
        <div className="view-tabs">
          <Seg value={mobileView} options={[{ v: 'epure', label: 'מערכת פרוסה' }, { v: 'axo', label: 'תצוגה מרחבית' }]} onChange={setMobileView} />
        </div>
        <div className="split">
          <div className={mobileView === 'epure' ? '' : 'hidden-mobile'}>
            <PanZoomCanvas
              testId="epure"
              label="מערכת פרוסה – אפשר לגרור היטלים"
              box={epBox}
              fitKey={fitKey}
              render={(ctx) => renderEpure(d, ctx, { selectedId: selected, draggable: true })}
              pointer={{
                down: (e) => {
                  const g = (e.target as Element).closest('[data-pid]');
                  if (!g) return false;
                  const pid = g.getAttribute('data-pid')!;
                  drag.current = { pid, which: Number(g.getAttribute('data-which')) as 1 | 2 | 3 };
                  setSelected(pid);
                  useStore.getState().checkpoint(project.id);
                  return true;
                },
                move: (_e, w) => {
                  const dr = drag.current;
                  if (!dr) return;
                  const r = (n: number) => (snap ? Math.round(n) : Math.round(n * 100) / 100);
                  const patch = fromEpureDrag(dr.which, { x: r(w.x), y: r(w.y) }, d.epure);
                  setPoint(dr.pid, patch, false);
                },
                up: () => { drag.current = null; },
              }}
            />
          </div>
          <div className={mobileView === 'axo' ? '' : 'hidden-mobile'}>
            <PanZoomCanvas testId="axo" label="תצוגה מרחבית (אקסונומטרית)" box={axBox} fitKey={fitKey} render={(ctx) => renderAxonometric(d, ctx, { selectedId: selected })} />
          </div>
        </div>
      </section>
    </div>
  );
}

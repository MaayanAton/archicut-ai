import { useMemo } from 'react';
import type { Project } from '../../document/types';
import { v2 } from '../../geometry/vec';
import { Check } from '../common';
import { Icons } from '../icons';
import type { SiteData } from '../../site/types';
import { HEIGHT_SOURCE_LABELS } from '../../site/types';
import type { SiteModel } from '../../site/section';
import { slopeBetween, terrainRange, ZSOURCE_LABELS } from '../../site/terrain';
import { fmtLevel, fmtM, fmtSlope, mToStr } from '../../site/units';
import { MField } from './fields';
import { useSiteUi } from './siteUi';

type SProject = Extract<Project, { type: 'site' }>;
type SetData = (fn: (d: SiteData) => SiteData, record?: boolean) => void;

export function TerrainPanel({ project, model, setData }: { project: SProject; model: SiteModel; setData: SetData }) {
  const d = project.data;
  const t = d.terrain;
  const { tool, selHp, selMound, measure } = useSiteUi();
  const setT = (patch: Partial<SiteData['terrain']>, record = true) => setData((dd) => ({ ...dd, terrain: { ...dd.terrain, ...patch } }), record);
  const hp = t.points.find((p) => p.id === selHp);
  const mound = t.mounds.find((m) => m.id === selMound);
  const range = useMemo(() => terrainRange(model.terrain), [model.terrain]);
  const toolBtn = (tt: 'hpoint' | 'mound' | 'measure', label: string, icon: keyof typeof Icons) => (
    <button className={`btn sm ${tool.t === tt ? 'active' : ''}`} aria-pressed={tool.t === tt} onClick={() => useSiteUi.getState().setTool(tool.t === tt ? { t: 'select' } : { t: tt })}>{Icons[icon]} {label}</button>
  );
  const slope = measure ? slopeBetween(model.terrain, measure.a, measure.b) : null;
  return (
    <>
      <div className="panel-section">
        <h3>טופוגרפיה</h3>
        <div className="notice info">{Icons.info}<span>הקרקע נבנית רק מנתונים שהזנת: נקודות גובה (מדידה או ידני), משטחים במפלס קבוע, וגבעות או שקעים מתוכננים. בין הנקודות הגובה מחושב (אינטרפולציה ליניארית במשולשים). בפינות המגרש, אם אין נתון, נלקח מפלס הבסיס.</span></div>
        <MField label="מפלס בסיס (היכן שאין נתון)" value={t.base} allowNegative onChange={(v) => setT({ base: v })} />
        <div className="row">
          {toolBtn('hpoint', 'נקודת גובה', 'point')}
          {toolBtn('mound', 'גבעה / שקע', 'mountain')}
          {toolBtn('measure', 'שיפוע בין נקודות', 'ruler')}
        </div>
        <button className="btn sm" onClick={() => useSiteUi.getState().setTool({ t: 'place', kind: 'terrace' })}>{Icons.layers} משטח במפלס קבוע (טרסה)</button>
        <span className="small muted">טווח גבהים בשטח: <span className="num">{fmtLevel(range.lo)}</span> עד <span className="num">{fmtLevel(range.hi)}</span></span>
      </div>
      {slope && (
        <div className="panel-section" data-testid="slope-result">
          <h3>שיפוע בין שתי נקודות</h3>
          <div className="measures">
            <div><span>מרחק אופקי</span><b className="num">{fmtM(slope.run)}</b></div>
            <div><span>הפרש גובה</span><b className="num">{mToStr(slope.dz)} מ׳</b></div>
            <div><span>שיפוע</span><b className="num">{fmtSlope(slope.ratio)}</b></div>
          </div>
          <span className="small muted">גובה בנקודה הראשונה: {fmtLevel(slope.za)} ({ZSOURCE_LABELS[model.terrain.sample(measure!.a).src]}). בשנייה: {fmtLevel(slope.zb)} ({ZSOURCE_LABELS[model.terrain.sample(measure!.b).src]}).</span>
        </div>
      )}
      {hp && (
        <div className="panel-section" data-testid="hp-props">
          <div className="row" style={{ justifyContent: 'space-between' }}><h3>נקודת גובה</h3><button className="btn ghost sm icon" aria-label="סגירה" onClick={() => useSiteUi.setState({ selHp: null })}>{Icons.close}</button></div>
          <div className="grid3">
            <MField label="X" value={hp.p.x} allowNegative onChange={(v) => setT({ points: t.points.map((p) => (p.id === hp.id ? { ...p, p: v2(v, p.p.y) } : p)) })} />
            <MField label="Y" value={hp.p.y} allowNegative onChange={(v) => setT({ points: t.points.map((p) => (p.id === hp.id ? { ...p, p: v2(p.p.x, v) } : p)) })} />
            <MField label="גובה" value={hp.z} allowNegative onChange={(v) => setT({ points: t.points.map((p) => (p.id === hp.id ? { ...p, z: v } : p)) })} />
          </div>
          <label className="field"><span>מקור</span>
            <select className="input" value={hp.source} onChange={(e) => setT({ points: t.points.map((p) => (p.id === hp.id ? { ...p, source: e.target.value as 'survey' | 'manual' } : p)) })}>
              <option value="survey">{HEIGHT_SOURCE_LABELS.survey}</option>
              <option value="manual">{HEIGHT_SOURCE_LABELS.manual}</option>
            </select>
          </label>
          <label className="field"><span>הערה</span><input className="input" value={hp.note} onChange={(e) => setT({ points: t.points.map((p) => (p.id === hp.id ? { ...p, note: e.target.value } : p)) })} /></label>
          <button className="btn sm danger" onClick={() => { setT({ points: t.points.filter((p) => p.id !== hp.id) }); useSiteUi.setState({ selHp: null }); }}>{Icons.trash} מחיקת הנקודה</button>
        </div>
      )}
      {mound && (
        <div className="panel-section">
          <div className="row" style={{ justifyContent: 'space-between' }}><h3>{mound.h >= 0 ? 'גבעה' : 'שקע'}</h3><button className="btn ghost sm icon" aria-label="סגירה" onClick={() => useSiteUi.setState({ selMound: null })}>{Icons.close}</button></div>
          <div className="grid2">
            <MField label="רדיוס" value={mound.r} min={100} onChange={(v) => setT({ mounds: t.mounds.map((m) => (m.id === mound.id ? { ...m, r: v } : m)) })} />
            <MField label="גובה (שלילי = שקע)" value={mound.h} allowNegative onChange={(v) => setT({ mounds: t.mounds.map((m) => (m.id === mound.id ? { ...m, h: v } : m)) })} />
          </div>
          <button className="btn sm danger" onClick={() => { setT({ mounds: t.mounds.filter((m) => m.id !== mound.id) }); useSiteUi.setState({ selMound: null }); }}>{Icons.trash} מחיקה</button>
        </div>
      )}
      <div className="panel-section">
        <h3>קווי גובה וסימונים</h3>
        <Check checked={t.showContours} onChange={(v) => setT({ showContours: v })}>קווי גובה (מחושבים) גם בתוכנית ובגיליונות</Check>
        <Check checked={t.showPoints} onChange={(v) => setT({ showPoints: v })}>נקודות גובה גם בתוכנית ובגיליונות</Check>
        <MField label="מרווח בין קווי גובה" value={t.contourStep} min={50} onChange={(v) => setT({ contourStep: v })} />
        <div className="small legend-row"><span className="lg-tri" /> נתון מדידה <span className="lg-circ" /> הוזן ידנית <span className="lg-line" /> קו גובה מחושב</div>
      </div>
      <div className="panel-section">
        <h3>נקודות גובה ({t.points.length})</h3>
        {t.points.length === 0 ? <span className="small muted">אין נקודות גובה. הקרקע שטוחה במפלס הבסיס.</span> : (
          <table className="area-table">
            <thead><tr><th>X</th><th>Y</th><th>גובה</th><th>מקור</th></tr></thead>
            <tbody>
              {t.points.map((p) => (
                <tr key={p.id} className={p.id === selHp ? 'sel' : ''} onClick={() => useSiteUi.setState({ selHp: p.id, selMound: null })} style={{ cursor: 'pointer' }}>
                  <td className="num">{mToStr(p.p.x)}</td><td className="num">{mToStr(p.p.y)}</td><td className="num">{fmtLevel(p.z)}</td><td>{p.source === 'survey' ? 'מדידה' : 'ידני'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

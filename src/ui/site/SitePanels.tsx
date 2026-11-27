import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useStore } from '../../document/store';
import { uid } from '../../document/factory';
import type { Project } from '../../document/types';
import { v2 } from '../../geometry/vec';
import { makeView } from '../../drawing/viewport';
import { Check, Seg, toast, confirmDialog } from '../common';
import { Icons } from '../icons';
import { fileToImages, UploadError } from '../imageTools';
import { ACCEPT_UPLOAD } from '../Home';
import type { SiteData, SiteElement, MaterialId } from '../../site/types';
import { CATEGORIES, LIBRARY, MATERIALS, lib, makeElement, prm, type LibItem } from '../../site/library';
import { emptySite } from '../../site/migrate';
import { buildSiteModel, type SiteModel } from '../../site/section';
import { renderSitePlan } from '../../site/render/plan';
import { areaTable, elementCenter, measures, rotateEl, selectionCenter, translateEl } from '../../site/edit';
import { elementOutline } from '../../site/outline';
import { localToWorld } from '../../site/poly';
import { baseLevel } from '../../site/prims';
import { fmtArea, fmtLevel, fmtM, mToStr } from '../../site/units';
import { ZSOURCE_LABELS } from '../../site/terrain';
import { MField } from './fields';
import { setAdvanced, useSiteUi } from './siteUi';
import { provisionalScale } from './PlanEditor';

type SProject = Extract<Project, { type: 'site' }>;
type SetData = (fn: (d: SiteData) => SiteData, record?: boolean) => void;

// ---------- library previews: the real plan symbol of each element at its default size ----------
const previewCache = new Map<string, React.ReactNode>();
function LibPreview({ item }: { item: LibItem }) {
  let node = previewCache.get(item.kind);
  if (!node) {
    let geom: SiteElement['geom'];
    if (item.geom === 'point') geom = { type: 'point', p: v2(0, 0), rot: 0 };
    else if (item.geom === 'line') geom = { type: 'line', pts: [v2(-4000, -1500), v2(0, 1500), v2(4000, -1000)], curved: false };
    else if (item.geom === 'dim') geom = { type: 'dim', a: v2(-4000, -1000), b: v2(4000, -1000), offset: 1500 };
    else geom = { type: 'area', pts: [v2(-4000, -2500), v2(4000, -2500), v2(4000, 2500), v2(-4000, 2500)], curved: false };
    const e = makeElement(item.kind, geom, 'pv', item.kind === 'text' ? { name: 'טקסט' } : item.kind === 'zone' ? { name: 'אזור' } : {});
    const d: SiteData = { ...emptySite(), elements: [e] };
    const model = buildSiteModel(d);
    const pts = elementOutline(e);
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    const minX = Math.min(...xs, -500), maxX = Math.max(...xs, 500), minY = Math.min(...ys, -500), maxY = Math.max(...ys, 500);
    const W = 64, H = 48, k = Math.min((W - 8) / (maxX - minX), (H - 8) / (maxY - minY));
    const { T } = makeView((minX + maxX) / 2, (minY + maxY) / 2, k, W / 2, H / 2);
    node = <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden="true">{renderSitePlan(d, model, { T, k, pu: 0.8, bw: false, screen: false }, { areaLabels: false, dimText: () => '8.00' })}</svg>;
    previewCache.set(item.kind, node);
  }
  return <>{node}</>;
}

export function LibraryPanel() {
  const tool = useSiteUi((s) => s.tool);
  const [open, setOpen] = useState<string>('site');
  const [q, setQ] = useState('');
  const items = q.trim() ? LIBRARY.filter((l) => l.label.includes(q.trim()) || l.desc.includes(q.trim())) : null;
  const pick = (kind: string) => useSiteUi.getState().setTool({ t: 'place', kind });
  const grid = (list: LibItem[]) => (
    <div className="lib-grid">
      {list.map((l) => (
        <button key={l.kind} className={`lib-item ${tool.t === 'place' && tool.kind === l.kind ? 'on' : ''}`} onClick={() => pick(l.kind)} title={l.desc} aria-pressed={tool.t === 'place' && tool.kind === l.kind}>
          <LibPreview item={l} />
          <span>{l.label}</span>
        </button>
      ))}
    </div>
  );
  return (
    <div className="panel-section">
      <h3>ספריית אלמנטים</h3>
      <input className="input" placeholder="חיפוש: עץ, ספסל, מדרגות…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="חיפוש בספרייה" />
      {items ? (items.length ? grid(items) : <span className="small muted">לא נמצא אלמנט כזה.</span>) : CATEGORIES.map((c) => (
        <div key={c.id} className="lib-cat">
          <button className="lib-cat-head" aria-expanded={open === c.id} onClick={() => setOpen(open === c.id ? '' : c.id)}>
            <span>{c.label}</span><span className="muted small">{LIBRARY.filter((l) => l.category === c.id).length}</span>
          </button>
          {open === c.id && grid(LIBRARY.filter((l) => l.category === c.id))}
        </div>
      ))}
    </div>
  );
}

export function ActiveToolPanel() {
  const { tool, areaMode, curved } = useSiteUi();
  if (tool.t !== 'place') return null;
  const L = lib(tool.kind);
  return (
    <div className="panel-section active-tool">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h3>כלי פעיל: {L.label}</h3>
        <button className="btn sm" onClick={() => useSiteUi.getState().setTool({ t: 'select' })}>סיום</button>
      </div>
      <span className="small muted">{L.desc}</span>
      {L.geom === 'area' && (
        <Seg value={areaMode} options={[{ v: 'polygon', label: 'מצולע חופשי' }, { v: 'rect', label: 'מלבן' }]} onChange={(v) => useSiteUi.setState({ areaMode: v })} ariaLabel="צורת השרטוט" />
      )}
      {(L.geom === 'line' || (L.geom === 'area' && areaMode === 'polygon')) && (
        <Check checked={curved} onChange={(v) => useSiteUi.setState({ curved: v })}>קו מעוקל (עובר בכל הנקודות)</Check>
      )}
      <span className="small muted">גודל ומידות אפשר לשנות אחרי ההצבה, בחלונית המאפיינים.</span>
    </div>
  );
}

// ---------- properties of the selection ----------
export function PropertiesPanel({ project, model, setData }: { project: SProject; model: SiteModel; setData: SetData }) {
  const d = project.data;
  const { sel, advanced } = useSiteUi();
  const els = d.elements.filter((e) => sel.includes(e.id));
  if (!els.length) return null;
  const upd = (id: string, fn: (e: SiteElement) => SiteElement, record = true) => setData((dd) => ({ ...dd, elements: dd.elements.map((x) => (x.id === id ? fn(x) : x)) }), record);
  const remove = () => { setData((dd) => ({ ...dd, elements: dd.elements.filter((x) => !sel.includes(x.id)) })); useSiteUi.getState().select([]); };
  const duplicate = () => {
    const off = d.grid.size > 0 ? Math.max(d.grid.size, 1000) : 1000;
    const copies = els.map((e) => ({ ...translateEl(e, v2(off, -off)), id: uid() }));
    setData((dd) => ({ ...dd, elements: [...dd.elements, ...copies] }));
    useSiteUi.getState().select(copies.map((c) => c.id));
  };
  const rotateSel = (deg: number) => {
    const c = selectionCenter(els);
    const map = new Map(els.map((e) => [e.id, rotateEl(e, deg, c)]));
    setData((dd) => ({ ...dd, elements: dd.elements.map((x) => map.get(x.id) ?? x) }));
  };
  const actions = (
    <div className="row">
      <button className="btn sm" onClick={duplicate} title="שכפול (Ctrl+D)">{Icons.copy} שכפול</button>
      <button className="btn sm" onClick={() => rotateSel(15)} title="סיבוב 15° (R)">{Icons.rotate} 15°</button>
      <button className="btn sm" onClick={() => rotateSel(90)}>{Icons.rotate} 90°</button>
      <button className="btn sm danger" onClick={remove} title="מחיקה (Delete)">{Icons.trash} מחיקה</button>
    </div>
  );

  if (els.length > 1) {
    const total = els.reduce((a, e) => a + (measures(e).area ?? 0), 0);
    return (
      <div className="panel-section">
        <div className="row" style={{ justifyContent: 'space-between' }}><h3>{els.length} אלמנטים נבחרו</h3><button className="btn ghost sm" onClick={() => useSiteUi.getState().select([])}>{Icons.close}</button></div>
        {actions}
        {total > 0 && <span className="small">שטח כולל של האלמנטים: <span className="num">{fmtArea(total)}</span></span>}
        <label className="field"><span>העברה לשכבה</span>
          <select className="input" value="" onChange={(e) => { const lid = e.target.value; if (lid) setData((dd) => ({ ...dd, elements: dd.elements.map((x) => (sel.includes(x.id) ? { ...x, layer: lid } : x)) })); }}>
            <option value="">בחרי שכבה…</option>
            {d.layers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>
      </div>
    );
  }

  const e = els[0];
  const L = lib(e.kind);
  const g = e.geom;
  const ms = measures(e);
  const base = baseLevel(e, model.terrain);
  const onStart = () => useStore.getState().checkpoint(project.id);
  return (
    <div className="panel-section" data-testid="site-props">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h3>{L.label}</h3>
        <button className="btn ghost sm icon" aria-label="סגירת המאפיינים" onClick={() => useSiteUi.getState().select([])}>{Icons.close}</button>
      </div>
      {actions}
      {(e.kind !== 'dim') && (
        <label className="field"><span>{e.kind === 'text' ? 'הטקסט' : 'שם / כיתוב (לא חובה)'}</span>
          <input className="input" value={e.name} onChange={(ev) => upd(e.id, (x) => ({ ...x, name: ev.target.value }))} />
        </label>
      )}
      {(ms.area !== undefined || ms.length !== undefined) && (
        <div className="measures">
          {ms.length !== undefined && <div><span>אורך</span><b className="num">{fmtM(ms.length)}</b></div>}
          {ms.area !== undefined && <div><span>שטח</span><b className="num">{fmtArea(ms.area)}</b></div>}
          {ms.perimeter !== undefined && <div><span>היקף</span><b className="num">{fmtM(ms.perimeter)}</b></div>}
        </div>
      )}
      {L.fields.length > 0 && (
        <div className="grid2">
          {L.fields.map((f) => (
            <MField key={f.key} label={f.label} value={prm(e, f.key)} kind={f.unit === 'n' ? 'n' : 'm'} integer={f.integer} min={f.unit === 'level' ? undefined : f.min} max={f.max} allowNegative={f.unit === 'level'}
              onChange={(v) => upd(e.id, (x) => ({ ...x, params: { ...x.params, [f.key]: v } }))} />
          ))}
        </div>
      )}
      {(e.kind === 'stairs' || e.kind === 'ramp') && <StairInfo e={e} model={model} onFit={(patch) => upd(e.id, (x) => ({ ...x, params: { ...x.params, ...patch } }))} />}
      {g.type === 'point' && (
        <div className="grid3">
          <MField label="X" value={g.p.x} allowNegative onChange={(v) => upd(e.id, (x) => (x.geom.type === 'point' ? { ...x, geom: { ...x.geom, p: v2(v, x.geom.p.y) } } : x))} />
          <MField label="Y" value={g.p.y} allowNegative onChange={(v) => upd(e.id, (x) => (x.geom.type === 'point' ? { ...x, geom: { ...x.geom, p: v2(x.geom.p.x, v) } } : x))} />
          {L.footprint === 'rect' && <MField label="זווית" kind="deg" allowNegative value={g.rot} onChange={(v) => upd(e.id, (x) => (x.geom.type === 'point' ? { ...x, geom: { ...x.geom, rot: v } } : x))} />}
        </div>
      )}
      {(g.type === 'line' || g.type === 'area') && L.geom !== 'dim' && (
        <Check checked={g.curved} onChange={(v) => upd(e.id, (x) => (x.geom.type === 'line' || x.geom.type === 'area' ? { ...x, geom: { ...x.geom, curved: v } } : x))}>קו מעוקל</Check>
      )}
      {g.type === 'dim' && <MField label="מרחק קו המידה מהאלמנט" value={g.offset} allowNegative onChange={(v) => upd(e.id, (x) => (x.geom.type === 'dim' ? { ...x, geom: { ...x.geom, offset: v } } : x))} />}
      {L.solid && e.kind !== 'terrace' && (
        <div className="field">
          <span>גובה בסיס</span>
          <Seg value={e.elevMode} options={[{ v: 'ground', label: 'צמוד לקרקע' }, { v: 'absolute', label: 'מפלס קבוע' }]} onChange={(v) => upd(e.id, (x) => ({ ...x, elevMode: v, elev: v === 'absolute' ? base : 0 }))} />
          <MField label={e.elevMode === 'ground' ? 'הגבהה מעל הקרקע' : 'מפלס הבסיס'} value={e.elev} allowNegative onChange={(v) => upd(e.id, (x) => ({ ...x, elev: v }))} />
          <span className="small muted">מפלס הבסיס כרגע: <span className="num">{fmtLevel(base)}</span>{e.elevMode === 'ground' ? ' (לפי הקרקע במקום)' : ''}</span>
        </div>
      )}
      {L.solid && (
        <div className="grid2">
          <label className="field"><span>חומר</span>
            <select className="input" value={e.material} onChange={(ev) => { const m = ev.target.value as MaterialId; upd(e.id, (x) => ({ ...x, material: m, color: MATERIALS[m].color })); }}>
              {Object.entries(MATERIALS).filter(([k]) => k !== 'none').map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
            </select>
          </label>
          <label className="field"><span>צבע</span><input className="input color-input" type="color" value={e.color} onFocus={onStart} onChange={(ev) => upd(e.id, (x) => ({ ...x, color: ev.target.value }), false)} aria-label="צבע" /></label>
        </div>
      )}
      <label className="field"><span>שכבה</span>
        <select className="input" value={e.layer} onChange={(ev) => upd(e.id, (x) => ({ ...x, layer: ev.target.value }))}>
          {d.layers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </label>
      {advanced && (g.type === 'line' || g.type === 'area') && <VertexTable e={e} onChange={(pts) => upd(e.id, (x) => (x.geom.type === 'line' || x.geom.type === 'area' ? { ...x, geom: { ...x.geom, pts } } : x))} />}
      {advanced && g.type === 'dim' && (
        <div className="grid2">
          <MField label="X התחלה" value={g.a.x} allowNegative onChange={(v) => upd(e.id, (x) => (x.geom.type === 'dim' ? { ...x, geom: { ...x.geom, a: v2(v, x.geom.a.y) } } : x))} />
          <MField label="Y התחלה" value={g.a.y} allowNegative onChange={(v) => upd(e.id, (x) => (x.geom.type === 'dim' ? { ...x, geom: { ...x.geom, a: v2(x.geom.a.x, v) } } : x))} />
          <MField label="X סוף" value={g.b.x} allowNegative onChange={(v) => upd(e.id, (x) => (x.geom.type === 'dim' ? { ...x, geom: { ...x.geom, b: v2(v, x.geom.b.y) } } : x))} />
          <MField label="Y סוף" value={g.b.y} allowNegative onChange={(v) => upd(e.id, (x) => (x.geom.type === 'dim' ? { ...x, geom: { ...x.geom, b: v2(x.geom.b.x, v) } } : x))} />
        </div>
      )}
      {!advanced && (g.type === 'line' || g.type === 'area') && <span className="small muted">גררי את הריבועים הכתומים כדי להזיז קודקודים. במצב מתקדם אפשר להקליד קואורדינטות.</span>}
      <span className="small muted">מרכז: <span className="num">{mToStr(elementCenter(e).x)}, {mToStr(elementCenter(e).y)}</span> מ׳</span>
    </div>
  );
}

function StairInfo({ e, model, onFit }: { e: SiteElement; model: SiteModel; onFit: (p: Record<string, number>) => void }) {
  if (e.geom.type !== 'point') return null;
  const g = e.geom;
  const dd = prm(e, 'd'), rise = prm(e, 'rise');
  const zLo = model.terrain.z(localToWorld(g.p, g.rot, v2(0, -dd / 2))), zHi = model.terrain.z(localToWorld(g.p, g.rot, v2(0, dd / 2)));
  const diff = zHi - zLo;
  if (e.kind === 'stairs') {
    const n = Math.max(1, Math.round(prm(e, 'n')));
    const r = rise / n, t = dd / n;
    const blondel = 2 * r + t;
    const fit = () => {
      if (diff <= 0) { toast('הקרקע בקצה העליון אינה גבוהה מהקצה התחתון. בדקי את כיוון המדרגות (חץ).'); return; }
      const nn = Math.max(1, Math.ceil(diff / 170));
      onFit({ rise: diff, n: nn });
      toast(`הותאם לקרקע: הפרש ${fmtM(diff)}, ${nn} רומים של ${mToStr(diff / nn, 3)} מ׳ (עד 17 ס״מ לרום).`);
    };
    return (
      <div className="notice info" style={{ flexDirection: 'column' }}>
        <span>רום: <span className="num">{mToStr(r, 3)}</span> מ׳ · שלח: <span className="num">{mToStr(t, 3)}</span> מ׳ · 2R+T = <span className="num">{mToStr(blondel, 3)}</span> מ׳ {blondel < 600 || blondel > 650 ? '(מחוץ לטווח הנוח 0.60–0.65)' : '(בטווח הנוח)'}</span>
        <span>הקרקע בין קצות המדרגות: <span className="num">{fmtLevel(zLo)} ← {fmtLevel(zHi)}</span></span>
        <button className="btn sm" onClick={fit}>התאמת הפרש הגובה לקרקע</button>
      </div>
    );
  }
  const slope = dd > 0 ? rise / dd : 0;
  return (
    <div className="notice info" style={{ flexDirection: 'column' }}>
      <span>שיפוע: <span className="num">{(slope * 100).toFixed(2)}%</span>{slope > 0 ? ` (1:${(1 / slope).toFixed(1)})` : ''}</span>
      <span>הקרקע בין קצות הרמפה: <span className="num">{fmtLevel(zLo)} ← {fmtLevel(zHi)}</span></span>
      <button className="btn sm" onClick={() => { if (diff <= 0) { toast('הקרקע בקצה העליון אינה גבוהה מהקצה התחתון.'); return; } onFit({ rise: diff }); toast(`הותאם לקרקע: הפרש ${fmtM(diff)}, שיפוע ${((diff / dd) * 100).toFixed(2)}%.`); }}>התאמת הפרש הגובה לקרקע</button>
      <span className="small">את השיפוע המותר יש לבדוק מול התקן הרלוונטי לפרויקט.</span>
    </div>
  );
}

function VertexTable({ e, onChange }: { e: SiteElement; onChange: (pts: { x: number; y: number }[]) => void }) {
  if (e.geom.type !== 'line' && e.geom.type !== 'area') return null;
  const pts = e.geom.pts;
  const min = e.geom.type === 'area' ? 3 : 2;
  return (
    <div className="field">
      <span>קודקודים (מ׳)</span>
      <div className="vtable">
        {pts.map((p, i) => (
          <div key={i} className="vrow">
            <span className="num muted">{i + 1}</span>
            <MField ariaLabel={`X ${i + 1}`} value={p.x} allowNegative onChange={(v) => onChange(pts.map((q, j) => (j === i ? v2(v, q.y) : q)))} />
            <MField ariaLabel={`Y ${i + 1}`} value={p.y} allowNegative onChange={(v) => onChange(pts.map((q, j) => (j === i ? v2(q.x, v) : q)))} />
            <button className="btn sm ghost icon" aria-label={`מחיקת קודקוד ${i + 1}`} disabled={pts.length <= min} onClick={() => onChange(pts.filter((_, j) => j !== i))}>{Icons.trash}</button>
          </div>
        ))}
      </div>
      <button className="btn sm" onClick={() => { const a = pts[pts.length - 1], b = e.geom.type === 'area' ? pts[0] : pts[pts.length - 2]; onChange([...pts, v2((a.x + b.x) / 2 + (e.geom.type === 'area' ? 0 : a.x - b.x), (a.y + b.y) / 2 + (e.geom.type === 'area' ? 0 : a.y - b.y))]); }}>{Icons.plus} הוספת קודקוד</button>
    </div>
  );
}

// ---------- layers ----------
export function LayersPanel({ project, setData }: { project: SProject; setData: SetData }) {
  const d = project.data;
  const counts = useMemo(() => { const m = new Map<string, number>(); for (const e of d.elements) m.set(e.layer, (m.get(e.layer) ?? 0) + 1); return m; }, [d.elements]);
  const set = (id: string, patch: Partial<SiteData['layers'][number]>) => setData((dd) => ({ ...dd, layers: dd.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)) }));
  return (
    <div className="panel-section">
      <h3>שכבות</h3>
      <div className="layers">
        {d.layers.map((l) => (
          <div key={l.id} className={`layer-row ${l.visible ? '' : 'off'}`}>
            <button className="btn sm ghost icon" aria-label={l.visible ? `הסתרת ${l.name}` : `הצגת ${l.name}`} aria-pressed={l.visible} title={l.visible ? 'הסתרה' : 'הצגה'} onClick={() => set(l.id, { visible: !l.visible })}>{l.visible ? Icons.eye : Icons.eyeOff}</button>
            <button className="btn sm ghost icon" aria-label={l.locked ? `שחרור נעילה ${l.name}` : `נעילת ${l.name}`} aria-pressed={l.locked} title={l.locked ? 'שחרור נעילה' : 'נעילה'} onClick={() => set(l.id, { locked: !l.locked })}>{l.locked ? Icons.lock : Icons.unlock}</button>
            <span className="layer-name">{l.name}</span>
            <span className="muted small num">{counts.get(l.id) ?? 0}</span>
          </div>
        ))}
      </div>
      <span className="small muted">שכבה מוסתרת לא מופיעה בתוכנית, בתלת־ממד ובחתכים. שכבה נעולה מוצגת אבל אי אפשר לבחור אותה.</span>
    </div>
  );
}

// ---------- grid, snapping, north, background ----------
export function SettingsPanel({ project, model, setData }: { project: SProject; model: SiteModel; setData: SetData }) {
  const d = project.data;
  const advanced = useSiteUi((s) => s.advanced);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const upload = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    try {
      const { image } = await fileToImages(f, 1);
      setData((dd) => ({ ...dd, background: { dataUrl: image.dataUrl, pxW: image.w, pxH: image.h, mmPerPx: null, calibration: null, opacity: 0.6, visible: true, sourceName: f.name }, backgroundOrigin: v2(model.terrain.domain.minX, model.terrain.domain.minY) }));
      toast('הרקע נטען. כדי שהמידות יתאימו, כיילי אותו לפי מרחק ידוע.');
    } catch (e) {
      toast(e instanceof UploadError ? e.message : 'לא ניתן לטעון את הקובץ.');
    } finally { setBusy(false); }
  };
  const bg = d.background;
  return (
    <>
      <div className="panel-section">
        <h3>רשת והצמדה</h3>
        <div className="row">
          <Check checked={d.grid.show} onChange={(v) => setData((dd) => ({ ...dd, grid: { ...dd.grid, show: v } }))}>רשת</Check>
          <Check checked={d.grid.snap} onChange={(v) => setData((dd) => ({ ...dd, grid: { ...dd.grid, snap: v } }))}>הצמדה לרשת</Check>
        </div>
        <div className="row">
          <Check checked={d.snap.points} onChange={(v) => setData((dd) => ({ ...dd, snap: { ...dd.snap, points: v } }))}>לנקודות</Check>
          <Check checked={d.snap.lines} onChange={(v) => setData((dd) => ({ ...dd, snap: { ...dd.snap, lines: v } }))}>לקווים</Check>
        </div>
        <MField label="גודל משבצת" value={d.grid.size} min={10} onChange={(v) => setData((dd) => ({ ...dd, grid: { ...dd.grid, size: v } }))} />
        <span className="small muted">החזקת Alt בזמן גרירה מבטלת את ההצמדה.</span>
      </div>
      <div className="panel-section">
        <h3>חץ צפון</h3>
        <MField label="כיוון הצפון (0 = למעלה, נגד כיוון השעון)" kind="deg" allowNegative value={d.north} onChange={(v) => setData((dd) => ({ ...dd, north: v }))} />
      </div>
      <div className="panel-section">
        <h3>רקע: מפה או תוכנית קיימת</h3>
        <input ref={fileRef} type="file" accept={ACCEPT_UPLOAD} hidden onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ''; }} />
        {!bg ? (
          <button className="btn" disabled={busy} onClick={() => fileRef.current?.click()}>{Icons.upload} {busy ? 'טוען…' : 'העלאת מפה / תוכנית (JPG, PNG, PDF)'}</button>
        ) : (
          <>
            <span className="small muted">{bg.sourceName}</span>
            <Check checked={bg.visible} onChange={(v) => setData((dd) => ({ ...dd, background: dd.background && { ...dd.background, visible: v } }))}>הצגת הרקע</Check>
            <label className="field"><span>שקיפות</span>
              <input type="range" min={0.1} max={1} step={0.05} value={bg.opacity} aria-label="שקיפות הרקע" onChange={(e) => setData((dd) => ({ ...dd, background: dd.background && { ...dd.background, opacity: Number(e.target.value) } }), false)} />
            </label>
            {bg.mmPerPx ? <div className="notice ok">{Icons.check}<span>הרקע מכויל ({fmtM(bg.calibration?.mm ?? 0)} בין שתי נקודות). מדידה מתוך רקע היא תמיד משוערת.</span></div>
              : <div className="notice warn">{Icons.warn}<span>הרקע לא מכויל: הוא מוצג ברוחב המגרש רק כדי לראות אותו, ואין בו מידות. סמני שתי נקודות עם מרחק ידוע.</span></div>}
            <div className="row">
              <button className="btn sm" onClick={() => useSiteUi.getState().setTool({ t: 'calibrate' })}>{Icons.calibrate} כיול</button>
              <button className="btn sm" onClick={() => fileRef.current?.click()}>{Icons.upload} החלפה</button>
              <button className="btn sm danger" onClick={async () => { if (await confirmDialog('הסרת הרקע', 'להסיר את תמונת הרקע? השרטוט עצמו לא ישתנה.', 'הסרה', true)) setData((dd) => ({ ...dd, background: null })); }}>{Icons.trash} הסרה</button>
            </div>
            {advanced && (
              <div className="grid2">
                <MField label="מיקום הרקע X" value={d.backgroundOrigin.x} allowNegative onChange={(v) => setData((dd) => ({ ...dd, backgroundOrigin: v2(v, dd.backgroundOrigin.y) }))} />
                <MField label="מיקום הרקע Y" value={d.backgroundOrigin.y} allowNegative onChange={(v) => setData((dd) => ({ ...dd, backgroundOrigin: v2(dd.backgroundOrigin.x, v) }))} />
              </div>
            )}
            {!bg.mmPerPx && <span className="small muted">קנה מידה זמני לתצוגה: <span className="num">{provisionalScale(d, model).toFixed(2)}</span> מ״מ לפיקסל.</span>}
          </>
        )}
      </div>
    </>
  );
}

export function AreasPanel({ project }: { project: SProject }) {
  const d = project.data;
  const rows = useMemo(() => areaTable(d), [d]);
  const lot = rows.find((r) => r.kind === 'lot');
  const green = rows.filter((r) => ['lawn', 'planting'].includes(r.kind)).reduce((a, r) => a + r.area, 0);
  return (
    <div className="panel-section">
      <h3>טבלת שטחים</h3>
      {!rows.length ? <span className="small muted">עדיין אין שטחים. ציירי מגרש, מדשאות, רחבות או שבילים.</span> : (
        <table className="area-table">
          <thead><tr><th>סוג</th><th>כמות</th><th>שטח</th></tr></thead>
          <tbody>
            {rows.map((r) => <tr key={r.kind}><td>{r.label}</td><td className="num">{r.count}</td><td className="num">{fmtArea(r.area)}</td></tr>)}
          </tbody>
        </table>
      )}
      {lot && lot.area > 0 && green > 0 && <span className="small">שטח ירוק (מדשאות וצמחייה): <span className="num">{((green / lot.area) * 100).toFixed(1)}%</span> משטח המגרש.</span>}
      <span className="small muted">השטחים מחושבים מהגאומטריה המדויקת. שטחים חופפים נספרים בכל סוג בנפרד.</span>
    </div>
  );
}

export function ModeToggle() {
  const advanced = useSiteUi((s) => s.advanced);
  return <Seg value={advanced ? 'adv' : 'basic'} options={[{ v: 'basic', label: 'מצב בסיסי' }, { v: 'adv', label: 'מצב מתקדם' }]} onChange={(v) => setAdvanced(v === 'adv')} ariaLabel="מצב עבודה" />;
}

export const SOURCE_TEXT = ZSOURCE_LABELS;

/** The side panel of the site views. On narrow screens it can be folded, so the drawing gets the room. */
export function SitePanelAside({ label, children }: { label: string; children: ReactNode }) {
  const open = useSiteUi((s) => s.panelOpen);
  return (
    <aside className={`panel site-panel ${open ? '' : 'collapsed'}`} aria-label={label}>
      <button className="btn sm panel-toggle" aria-expanded={open} onClick={() => useSiteUi.setState({ panelOpen: !open })}>
        {open ? 'קיפול החלונית ▾' : 'פתיחת החלונית ▴'}
      </button>
      {children}
    </aside>
  );
}

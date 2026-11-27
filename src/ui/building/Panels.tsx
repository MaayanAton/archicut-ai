import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useStore } from '../../document/store';
import { uid } from '../../document/factory';
import type { Project } from '../../document/types';
import { type Vec2, v2 } from '../../geometry/vec';
import { makeView } from '../../drawing/viewport';
import { add, dot, mul, norm, polyArea, sub } from '../../site/poly';
import { fmtArea, fmtLevel, fmtM, mToStr } from '../../site/units';
import { Check, Dialog, NumberField, Seg, confirmDialog, toast } from '../common';
import { Icons } from '../icons';
import { fileToImages, UploadError, type LoadedImage } from '../imageTools';
import { ACCEPT_UPLOAD } from '../Home';
import { ImageEditDialog } from '../drawing/ImageEditDialog';
import { MField } from '../site/fields';
import {
  LEVEL_KIND_LABELS, PHASE_LABELS, ROOF_SHAPE_LABELS, SLAB_KIND_LABELS, STAIR_SHAPE_LABELS, VIEW_STATE_LABELS, WALL_KIND_LABELS,
  type BuildingData, type Furniture, type Level, type LevelKind, type Opening, type OpeningKind, type Phase, type Room, type Wall,
} from '../../building/types';
import { levelOf, sortedLevels, type BuildingModel } from '../../building/model';
import { EL_LABELS, deleteIds, duplicateIds, findEl, rectWalls, rotateIds, selectionCenter, setPhase, type ElType } from '../../building/edit';
import { checkWallOpenings, OPENINGS, openingDef, wallLength } from '../../building/openings';
import { FURNITURE, FURN_CATEGORIES, furn, searchFurniture, type FurnItem } from '../../building/furniture';
import { MATERIALS, PALETTE, material, materialsFor } from '../../building/materials';
import { stairCheck, stairGeom } from '../../building/stairs';
import { newLevel } from '../../building/migrate';
import { floorFinish, newRoom, newWall, WALL_DEFAULTS } from '../../building/factories';
import { roofFrame } from '../../building/roofs';
import { furnitureSymbol } from '../../building/render/plan';
import { AREA_EXPLAIN } from '../../building/quantities';
import { buildingFootprints, copyBuildingToSite } from '../../building/toSite';
import { setBldAdvanced, useBldUi } from './bldUi';
import type { SetB } from './PlanEditor';

type BProject = Extract<Project, { type: 'building' }>;

export function BPanelAside({ label, children }: { label: string; children: ReactNode }) {
  const open = useBldUi((s) => s.panelOpen);
  return (
    <aside className={`panel site-panel ${open ? '' : 'collapsed'}`} aria-label={label}>
      <button className="btn sm panel-toggle" aria-expanded={open} onClick={() => useBldUi.setState({ panelOpen: !open })}>{open ? 'קיפול החלונית ▾' : 'פתיחת החלונית ▴'}</button>
      {children}
    </aside>
  );
}

export function BModeToggle() {
  const adv = useBldUi((s) => s.advanced);
  return <Seg value={adv ? 'adv' : 'basic'} options={[{ v: 'basic', label: 'מצב בסיסי' }, { v: 'adv', label: 'מצב מתקדם' }]} onChange={(v) => setBldAdvanced(v === 'adv')} ariaLabel="מצב עבודה" />;
}

/** Colour picker with a small palette. Changes while dragging the picker form one undo step. */
export function ColorField({ label, value, onChange, projectId }: { label: string; value: string; onChange: (c: string, record: boolean) => void; projectId: string }) {
  return (
    <div className="field">
      <span>{label}</span>
      <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
        <input className="input color-input" style={{ width: 54 }} type="color" value={value} aria-label={label} onFocus={() => useStore.getState().checkpoint(projectId)} onChange={(e) => onChange(e.target.value, false)} />
        {PALETTE.slice(0, 10).map((c) => <button key={c} type="button" className="swatch" title={c} aria-label={`צבע ${c}`} style={{ background: c, outline: c === value ? '2px solid var(--accent)' : undefined }} onClick={() => onChange(c, true)} />)}
      </div>
    </div>
  );
}

function MatSelect({ label, value, use, onChange }: { label: string; value: string; use: 'floor' | 'wall' | 'object'; onChange: (id: string) => void }) {
  const list = materialsFor(use);
  return (
    <label className="field"><span>{label}</span>
      <select className="input" value={list.some((m) => m.id === value) ? value : ''} onChange={(e) => onChange(e.target.value)} aria-label={label}>
        {!list.some((m) => m.id === value) && <option value="">{material(value).label}</option>}
        {list.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
      </select>
    </label>
  );
}

function PhaseSelect({ value, onChange }: { value: Phase; onChange: (p: Phase) => void }) {
  return <label className="field"><span>שלב (שיפוץ)</span><Seg value={value} options={(['existing', 'demolish', 'new'] as Phase[]).map((p) => ({ v: p, label: PHASE_LABELS[p] }))} onChange={onChange} ariaLabel="שלב" /></label>;
}

// ------------------------------------------------------------------ levels

export function LevelsPanel({ project, setData }: { project: BProject; setData: SetB }) {
  const d = project.data;
  const levelId = useBldUi((s) => s.levelId) ?? d.levels[0].id;
  const ghost = useBldUi((s) => s.ghost);
  const adv = useBldUi((s) => s.advanced);
  const levels = sortedLevels(d).reverse();
  const cur = levelOf(d, levelId);
  const setLevel = (patch: Partial<Level>) => setData((dd) => ({ ...dd, levels: dd.levels.map((l) => (l.id === cur.id ? { ...l, ...patch } : l)) }));
  const [kind, setKind] = useState<LevelKind>('upper');

  const addLevel = () => {
    const s = sortedLevels(d);
    const top = s[s.length - 1], bottom = s[0];
    const id = uid();
    let lv: Level;
    if (kind === 'basement') lv = { ...newLevel(id, 'מרתף', bottom.elevation - bottom.slabThickness - 2700, 'basement') };
    else if (kind === 'mezzanine') lv = { ...newLevel(id, 'מפלס ביניים', cur.elevation + Math.round(cur.ceilingHeight / 2), 'mezzanine'), autoFloor: false, autoCeiling: false, ceilingHeight: Math.round(cur.ceilingHeight / 2) };
    else lv = { ...newLevel(id, kind === 'roof' ? 'קומת גג' : `קומה ${s.filter((l) => l.kind === 'upper').length + 1}`, top.elevation + top.ceilingHeight + 250, kind), autoCeiling: kind !== 'roof' };
    setData((dd) => ({ ...dd, levels: [...dd.levels, lv] }));
    useBldUi.setState({ levelId: id, sel: [] });
  };
  const duplicate = () => {
    const s = sortedLevels(d);
    const top = s[s.length - 1];
    const id = uid();
    const elevation = top.elevation + top.ceilingHeight + cur.slabThickness;
    const ids = [...d.walls, ...d.rooms, ...d.furniture, ...d.columns, ...d.beams, ...d.slabs].filter((x) => (x as { levelId: string }).levelId === cur.id).map((x) => x.id);
    setData((dd) => {
      const r = duplicateIds(dd, ids, v2(0, 0), uid);
      const newIds = new Set(r.ids);
      const fix = <T extends { id: string; levelId: string }>(l: T[]) => l.map((x) => (newIds.has(x.id) ? { ...x, levelId: id } : x));
      const rooms = fix(r.data.rooms).map((x) => (newIds.has(x.id) ? { ...x, name: x.name.replace(/ \(עותק\)$/, '') } : x));
      return { ...r.data, levels: [...r.data.levels, { ...cur, id, name: `${cur.name} (עותק)`, elevation, background: null }], walls: fix(r.data.walls), rooms, furniture: fix(r.data.furniture), columns: fix(r.data.columns), beams: fix(r.data.beams), slabs: fix(r.data.slabs) };
    });
    useBldUi.setState({ levelId: id, sel: [] });
    toast('הקומה שוכפלה מעל הקומה העליונה.');
  };
  const remove = async () => {
    if (d.levels.length < 2) { toast('אי אפשר למחוק את הקומה היחידה.'); return; }
    if (!(await confirmDialog('מחיקת קומה', `למחוק את "${cur.name}" ואת כל האלמנטים שבה?`, 'מחיקה', true))) return;
    const wallIds = new Set(d.walls.filter((w) => w.levelId === cur.id).map((w) => w.id));
    const keep = <T extends { levelId: string }>(l: T[]) => l.filter((x) => x.levelId !== cur.id);
    setData((dd) => ({ ...dd, levels: dd.levels.filter((l) => l.id !== cur.id), walls: keep(dd.walls), openings: dd.openings.filter((o) => !wallIds.has(o.wallId)), rooms: keep(dd.rooms), furniture: keep(dd.furniture), stairs: keep(dd.stairs), columns: keep(dd.columns), beams: keep(dd.beams), slabs: keep(dd.slabs), roofs: keep(dd.roofs), annotations: keep(dd.annotations), sheets: dd.sheets.map((sh) => ({ ...sh, items: sh.items.filter((it) => !(it.type === 'plan' && it.levelId === cur.id)) })) }));
    useBldUi.setState({ levelId: sortedLevels(d).find((l) => l.id !== cur.id)!.id, sel: [] });
  };
  const swap = (dir: 1 | -1) => {
    const s = sortedLevels(d);
    const i = s.findIndex((l) => l.id === cur.id), j = i + dir;
    if (j < 0 || j >= s.length) return;
    const other = s[j];
    setData((dd) => ({ ...dd, levels: dd.levels.map((l) => (l.id === cur.id ? { ...l, elevation: other.elevation } : l.id === other.id ? { ...l, elevation: cur.elevation } : l)) }));
  };

  return (
    <div className="panel-section">
      <h3>{Icons.layers} קומות ומפלסים</h3>
      <div className="level-list" role="radiogroup" aria-label="קומה פעילה">
        {levels.map((l) => (
          <button key={l.id} role="radio" aria-checked={l.id === cur.id} className={`level-row ${l.id === cur.id ? 'on' : ''}`} onClick={() => useBldUi.setState({ levelId: l.id, sel: [] })}>
            <span>{l.name}</span><span className="muted small ltr">{fmtLevel(l.elevation)}</span>
          </button>
        ))}
      </div>
      <div className="grid2">
        <label className="field"><span>שם הקומה</span><input className="input" value={cur.name} onChange={(e) => setLevel({ name: e.target.value })} aria-label="שם הקומה" /></label>
        <label className="field"><span>סוג</span><select className="input" value={cur.kind} onChange={(e) => setLevel({ kind: e.target.value as LevelKind })} aria-label="סוג הקומה">{Object.entries(LEVEL_KIND_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <MField label="גובה מפלס (±0.00)" value={cur.elevation} allowNegative onChange={(v) => setLevel({ elevation: v })} />
        <MField label="גובה תקרה (נטו)" value={cur.ceilingHeight} min={500} onChange={(v) => setLevel({ ceilingHeight: v })} />
        <MField label="עובי רצפה" value={cur.slabThickness} min={0} onChange={(v) => setLevel({ slabThickness: v })} />
      </div>
      <Check checked={cur.autoFloor} onChange={(v) => setLevel({ autoFloor: v })}>רצפה אוטומטית לפי קו המעטפת</Check>
      <Check checked={cur.autoCeiling} onChange={(v) => setLevel({ autoCeiling: v })}>תקרה אוטומטית (כשאין קומה או גג מעל)</Check>
      <Check checked={ghost} onChange={(v) => useBldUi.setState({ ghost: v })}>הצגת הקומה שמתחת כרקע שקוף</Check>
      <div className="row">
        <select className="input" style={{ flex: 1 }} value={kind} onChange={(e) => setKind(e.target.value as LevelKind)} aria-label="סוג קומה חדשה">
          <option value="upper">קומה נוספת מעל</option><option value="basement">מרתף מתחת</option><option value="mezzanine">מפלס ביניים</option><option value="roof">קומת גג</option>
        </select>
        <button className="btn sm primary" onClick={addLevel}>{Icons.plus} הוספה</button>
      </div>
      <div className="row">
        <button className="btn sm" onClick={duplicate}>{Icons.copy} שכפול קומה</button>
        {adv && <button className="btn sm" onClick={() => swap(1)} aria-label="החלפה עם הקומה שמעל">▲</button>}
        {adv && <button className="btn sm" onClick={() => swap(-1)} aria-label="החלפה עם הקומה שמתחת">▼</button>}
        <button className="btn sm ghost danger" onClick={remove}>{Icons.trash} מחיקה</button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ quick start

export function HouseDialog({ title, interior, onClose, onSave }: { title: string; interior: boolean; onClose: () => void; onSave: (v: { w: number; h: number; t: number; x: number; y: number }) => void }) {
  const [w, setW] = useState<number | null>(null);
  const [h, setH] = useState<number | null>(null);
  const [t, setT] = useState<number>(interior ? 100 : 250);
  const [x, setX] = useState(0), [y, setY] = useState(0);
  return (
    <Dialog title={title} onClose={onClose}>
      <p className="small" style={{ margin: 0 }}>{interior ? 'מידות פנים של החדר (בין פני הקירות). הקירות נבנים סביבן.' : 'מידות חוץ של המבנה (מפני הקיר החיצוני). הקירות נבנים פנימה.'}</p>
      <div className="grid2">
        <MField label="רוחב (מזרח–מערב)" value={w} onChange={setW} min={500} />
        <MField label="עומק (צפון–דרום)" value={h} onChange={setH} min={500} />
        <MField label="עובי קיר" value={t} onChange={setT} min={20} />
        <span />
        <MField label="פינה שמאלית־תחתונה X" value={x} allowNegative onChange={setX} />
        <MField label="פינה שמאלית־תחתונה Y" value={y} allowNegative onChange={setY} />
      </div>
      <div className="btns"><button className="btn primary" disabled={!w || !h} onClick={() => w && h && onSave({ w, h, t, x, y })}>יצירה</button><button className="btn" onClick={onClose}>ביטול</button></div>
    </Dialog>
  );
}

export function createRectHouse(d: BuildingData, levelId: string, v: { w: number; h: number; t: number; x: number; y: number }, interior: boolean): { data: BuildingData; roomId: string } {
  const kind = interior ? 'interior' : 'exterior';
  const base = newWall('x', levelId, v2(0, 0), v2(1, 0), { kind, phase: d.renovation ? d.drawPhase : 'new' });
  // Interior: the given size is between the faces, so the centre lines are half a thickness outside.
  const walls = interior
    ? rectWalls(v.x - v.t / 2, v.y - v.t / 2, v.w + v.t, v.h + v.t, v.t, levelId, base, uid, false)
    : rectWalls(v.x, v.y, v.w, v.h, v.t, levelId, base, uid, true);
  const roomId = uid();
  const room = newRoom(roomId, levelId, interior ? `חדר ${d.rooms.length + 1}` : 'חלל המבנה', v2(v.x + v.w / 2, v.y + v.h / 2), d.renovation ? { state: d.drawPhase === 'existing' ? 'existing' : 'proposed' } : {});
  return { data: { ...d, walls: [...d.walls, ...walls], rooms: [...d.rooms, room] }, roomId };
}

// ------------------------------------------------------------------ tools

const prevCache = new Map<string, ReactNode>();
export function FurnPreview({ item }: { item: FurnItem }) {
  let node = prevCache.get(item.kind);
  if (!node) {
    const f: Furniture = { id: 'p', levelId: 'p', kind: item.kind, name: '', p: v2(0, 0), rot: 0, w: item.w, d: item.d, h: item.h, elev: 0, color: item.color, color2: item.color2, material: item.material, phase: 'new' };
    const W = 60, H = 46, k = Math.min((W - 8) / item.w, (H - 8) / item.d);
    const { T } = makeView(0, 0, k, W / 2, H / 2);
    node = <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden="true">{furnitureSymbol(f, { T, k, pu: 1.4, bw: false, screen: false })}</svg>;
    prevCache.set(item.kind, node);
  }
  return <>{node}</>;
}

export function FurnitureLibrary() {
  const tool = useBldUi((s) => s.tool);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string>('living');
  const found = q.trim() ? searchFurniture(q) : null;
  const grid = (list: FurnItem[]) => (
    <div className="lib-grid">
      {list.map((f) => {
        const on = tool.t === 'furniture' && tool.kind === f.kind;
        return (
          <button key={f.kind} className={`lib-item ${on ? 'on' : ''}`} aria-pressed={on} title={`${f.label} – ${f.w}×${f.d}×${f.h} מ״מ`} onClick={() => useBldUi.getState().setTool({ t: 'furniture', kind: f.kind })}>
            <FurnPreview item={f} /><span>{f.label}</span>
          </button>
        );
      })}
    </div>
  );
  return (
    <div className="panel-section">
      <h3>ספריית ריהוט וציוד</h3>
      <input className="input" placeholder="חיפוש: ספה, מיטה, כיור…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="חיפוש רהיטים" />
      {found ? (found.length ? grid(found) : <span className="small muted">לא נמצא פריט כזה.</span>) : FURN_CATEGORIES.map((c) => (
        <div key={c.id} className="lib-cat">
          <button className="lib-cat-head" aria-expanded={open === c.id} onClick={() => setOpen(open === c.id ? '' : c.id)}><span>{c.label}</span><span className="muted small">{FURNITURE.filter((f) => f.cat === c.id).length}</span></button>
          {open === c.id && grid(FURNITURE.filter((f) => f.cat === c.id))}
        </div>
      ))}
      <span className="small muted">המידות הן ברירת מחדל מקובלת וניתנות לשינוי אחרי ההצבה.</span>
    </div>
  );
}

export function OpeningPalette() {
  const tool = useBldUi((s) => s.tool);
  const presets = useBldUi((s) => s.presets);
  const cur = tool.t === 'opening' ? openingDef(tool.kind) : null;
  const setP = (patch: Partial<typeof presets>) => useBldUi.setState({ presets: { ...presets, ...patch } });
  return (
    <div className="panel-section">
      <h3>דלתות וחלונות</h3>
      <div className="lib-grid">
        {OPENINGS.map((o) => {
          const on = tool.t === 'opening' && tool.kind === o.kind;
          return <button key={o.kind} className={`lib-item ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => { useBldUi.getState().setTool({ t: 'opening', kind: o.kind }); setP({ openW: null, openH: null, openSill: null }); }}><OpeningIcon kind={o.kind} /><span>{o.label}</span></button>;
        })}
      </div>
      {cur && (
        <div className="grid3">
          <MField label="רוחב" value={presets.openW ?? cur.w} min={300} onChange={(v) => setP({ openW: v })} />
          <MField label="גובה" value={presets.openH ?? cur.h} min={300} onChange={(v) => setP({ openH: v })} />
          {!cur.door && <MField label="גובה סף" value={presets.openSill ?? cur.sill} min={0} onChange={(v) => setP({ openSill: v })} />}
        </div>
      )}
    </div>
  );
}

function OpeningIcon({ kind }: { kind: OpeningKind }) {
  const def = openingDef(kind);
  return (
    <svg viewBox="0 0 60 46" width={60} height={46} aria-hidden="true">
      <rect x={2} y={30} width={14} height={8} fill="#353b43" /><rect x={44} y={30} width={14} height={8} fill="#353b43" />
      {def.door ? (
        def.style === 'sliding' ? <><line x1={16} y1={32} x2={34} y2={32} stroke="#222" strokeWidth={2} /><line x1={26} y1={36} x2={44} y2={36} stroke="#222" strokeWidth={2} /></>
          : def.style === 'swing2' ? <><line x1={16} y1={30} x2={16} y2={16} stroke="#222" strokeWidth={2} /><line x1={44} y1={30} x2={44} y2={16} stroke="#222" strokeWidth={2} /><path d="M16 16A14 14 0 0 1 30 30M44 16A14 14 0 0 0 30 30" fill="none" stroke="#666" strokeDasharray="2 1.5" /></>
            : <><line x1={16} y1={30} x2={16} y2={4} stroke={def.glass ? '#4f7fa8' : '#222'} strokeWidth={2} /><path d="M16 4A26 26 0 0 1 42 30" fill="none" stroke="#666" strokeDasharray="2 1.5" /></>
      ) : (
        <><line x1={16} y1={30} x2={44} y2={30} stroke="#222" /><line x1={16} y1={38} x2={44} y2={38} stroke="#222" /><line x1={16} y1={34} x2={44} y2={34} stroke="#4f7fa8" strokeWidth={def.style === 'fixed' ? 2.4 : 1.4} /></>
      )}
    </svg>
  );
}

export function WallToolPanel() {
  const presets = useBldUi((s) => s.presets);
  const setP = (patch: Partial<typeof presets>) => useBldUi.setState({ presets: { ...presets, ...patch } });
  return (
    <div className="panel-section active-tool">
      <h3>{Icons.line} שרטוט קירות</h3>
      <Seg value={presets.wallKind} options={(['exterior', 'interior', 'partition'] as const).map((k) => ({ v: k, label: WALL_KIND_LABELS[k] }))} onChange={(k) => setP({ wallKind: k, wallThickness: WALL_DEFAULTS[k].thickness })} ariaLabel="סוג קיר" />
      <div className="grid2">
        <MField label="עובי" value={presets.wallThickness} min={20} onChange={(v) => setP({ wallThickness: v })} />
        <MField label="גובה (ריק = גובה התקרה)" value={presets.wallHeight} min={100} onChange={(v) => setP({ wallHeight: v })} placeholder="לפי הקומה" />
      </div>
      <span className="small muted">קירות נצמדים לקצוות ולקירות קיימים, ובפינות ובצמתים הם מתחברים אוטומטית. אפשר להקליד אורך מדויק לקטע הבא.</span>
    </div>
  );
}

// ------------------------------------------------------------------ renovation, background, settings, warnings

export function RenovationPanel({ project, setData }: { project: BProject; setData: SetB }) {
  const d = project.data;
  const state = useBldUi((s) => s.state);
  return (
    <div className="panel-section">
      <h3>{Icons.edit} שיפוץ: קיים, הריסה וחדש</h3>
      <Check checked={d.renovation} onChange={(v) => { setData((dd) => ({ ...dd, renovation: v })); useBldUi.setState({ state: v ? 'compare' : 'proposed' }); }}>פרויקט שיפוץ (הבחנה בין מצב קיים למוצע)</Check>
      {d.renovation && (
        <>
          <label className="field"><span>תצוגה</span><Seg value={state} options={(['existing', 'demolition', 'proposed', 'compare'] as const).map((s) => ({ v: s, label: VIEW_STATE_LABELS[s] }))} onChange={(s) => useBldUi.setState({ state: s })} ariaLabel="מצב תצוגה" /></label>
          <label className="field"><span>מה משרטטים עכשיו</span><Seg value={d.drawPhase === 'existing' ? 'existing' : 'new'} options={[{ v: 'existing', label: 'מצב קיים' }, { v: 'new', label: 'אלמנטים חדשים' }]} onChange={(p) => setData((dd) => ({ ...dd, drawPhase: p as Phase }))} ariaLabel="שלב לשרטוט" /></label>
          <div className="legend-row small"><span className="lg-swatch" style={{ background: '#9aa0a6' }} />קיים <span className="lg-swatch dash" />להריסה <span className="lg-swatch" style={{ background: '#2f8f4e' }} />חדש</div>
          <span className="small muted">סימון "להריסה" הוא פעולה במודל התכנוני בלבד, ואינו אישור להריסה במבנה אמיתי. הריסת קירות מחייבת בדיקה של מהנדס מוסמך.</span>
        </>
      )}
    </div>
  );
}

export function BackgroundPanel({ project, setData }: { project: BProject; setData: SetB }) {
  const d = project.data;
  const levelId = useBldUi((s) => s.levelId) ?? d.levels[0].id;
  const adv = useBldUi((s) => s.advanced);
  const level = levelOf(d, levelId);
  const bg = level.background;
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState(false);
  const [pdf, setPdf] = useState<{ file: File; count: number; page: number | null } | null>(null);
  const setL = (patch: Partial<Level>, record = true) => setData((dd) => ({ ...dd, levels: dd.levels.map((l) => (l.id === levelId ? { ...l, ...patch } : l)) }), record);
  const apply = (file: File, img: LoadedImage, page: number, count: number) => {
    setL({ background: { dataUrl: img.dataUrl, pxW: img.w, pxH: img.h, mmPerPx: null, calibration: null, opacity: 0.6, visible: true, sourceName: count > 1 ? `${file.name} (עמוד ${page})` : file.name }, bgOrigin: v2(0, 0), bgLocked: false });
    if (!d.renovation) { setData((dd) => ({ ...dd, renovation: true, drawPhase: 'existing' })); useBldUi.setState({ state: 'existing' }); }
    toast('התוכנית נטענה כשכבת רקע. השלב הבא: כיול קנה מידה לפי מידה ידועה.');
  };
  const onFile = async (f?: File) => {
    if (!f) return;
    setBusy(true);
    try {
      const { image, pageCount } = await fileToImages(f, 1);
      if (pageCount > 1) setPdf({ file: f, count: pageCount, page: 1 });
      else apply(f, image, 1, 1);
    } catch (e) { toast(e instanceof UploadError ? e.message : 'לא ניתן לטעון את הקובץ.'); } finally { setBusy(false); }
  };
  return (
    <div className="panel-section">
      <h3>{Icons.image} תוכנית קיימת (רקע)</h3>
      <input ref={ref} type="file" accept={ACCEPT_UPLOAD} hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
      {!bg ? (
        <>
          <button className="btn sm" disabled={busy} onClick={() => ref.current?.click()}>{Icons.upload} {busy ? 'טוען…' : 'העלאת תוכנית (PDF, JPG, PNG)'}</button>
          <span className="small muted">התוכנית מוצגת כשכבת רקע שמעליה משרטטים קירות, פתחים וריהוט. אין זיהוי אוטומטי של קירות: השרטוט נעשה ידנית.</span>
        </>
      ) : (
        <>
          <div className="small">{bg.sourceName} · {bg.mmPerPx ? <span style={{ color: 'var(--ok, #2f8f4e)' }}>מכויל</span> : <b style={{ color: 'var(--danger)' }}>לא מכויל</b>}</div>
          <div className="row">
            <button className="btn sm primary" disabled={level.bgLocked} onClick={() => useBldUi.getState().setTool({ t: 'calibrate' })}>{Icons.calibrate} כיול קנה מידה</button>
            <button className="btn sm" disabled={level.bgLocked} onClick={() => setEdit(true)}>{Icons.crop} סיבוב וחיתוך</button>
          </div>
          <label className="field"><span>שקיפות ({Math.round(bg.opacity * 100)}%)</span><input type="range" min={0.1} max={1} step={0.05} value={bg.opacity} onFocus={() => useStore.getState().checkpoint(project.id)} onChange={(e) => setL({ background: { ...bg, opacity: Number(e.target.value) } }, false)} aria-label="שקיפות הרקע" /></label>
          <Check checked={bg.visible} onChange={(v) => setL({ background: { ...bg, visible: v } })}>הצגת הרקע</Check>
          <Check checked={level.bgLocked} onChange={(v) => setL({ bgLocked: v })}>נעילת שכבת המקור</Check>
          {adv && <div className="grid2"><MField label="מיקום X" value={level.bgOrigin.x} allowNegative onChange={(x) => !level.bgLocked && setL({ bgOrigin: v2(x, level.bgOrigin.y) })} /><MField label="מיקום Y" value={level.bgOrigin.y} allowNegative onChange={(y) => !level.bgLocked && setL({ bgOrigin: v2(level.bgOrigin.x, y) })} /></div>}
          <button className="btn sm ghost danger" disabled={level.bgLocked} onClick={async () => { if (await confirmDialog('הסרת הרקע', 'להסיר את תוכנית הרקע מהקומה? הקירות שנשרטטו נשארים.', 'הסרה', true)) setL({ background: null }); }}>{Icons.trash} הסרת הרקע</button>
        </>
      )}
      {edit && bg && <ImageEditDialog bg={bg} onClose={() => setEdit(false)} onSave={(img) => { setL({ background: { ...bg, dataUrl: img.dataUrl, pxW: img.w, pxH: img.h, mmPerPx: null, calibration: null } }); setEdit(false); toast('התמונה עודכנה. יש לכייל שוב את קנה המידה.'); }} />}
      {pdf && (
        <Dialog title="איזה עמוד לטעון?" onClose={() => setPdf(null)}>
          <NumberField label={`מספר עמוד (1 עד ${pdf.count})`} value={pdf.page} min={1} max={pdf.count} onChange={(v) => setPdf({ ...pdf, page: v !== null && Number.isInteger(v) ? v : null })} />
          <div className="btns"><button className="btn primary" disabled={!pdf.page || busy} onClick={async () => { if (!pdf.page) return; setBusy(true); try { const { image } = await fileToImages(pdf.file, pdf.page); apply(pdf.file, image, pdf.page, pdf.count); setPdf(null); } catch (e) { toast(e instanceof UploadError ? e.message : 'לא ניתן לטעון את העמוד.'); } finally { setBusy(false); } }}>טעינה</button></div>
        </Dialog>
      )}
    </div>
  );
}

/** One-way copy of the building's outline into a site-planning project (the two projects stay independent). */
export function SiteLinkPanel({ project }: { project: BProject }) {
  const sites = useStore((s) => s.projects).filter((p): p is Extract<Project, { type: 'site' }> => p.type === 'site');
  const [target, setTarget] = useState('');
  const fps = useMemo(() => buildingFootprints(project.data), [project.data]);
  if (!fps.length) return null;
  const siteId = sites.some((p) => p.id === target) ? target : sites[0]?.id ?? '';
  const copy = () => {
    const site = sites.find((p) => p.id === siteId);
    if (!site) return;
    const r = copyBuildingToSite(site.data, project.data, project.name, uid);
    if (!r.count) { toast('אין קו מתאר חיצוני סגור להעתקה.'); return; }
    useStore.getState().update(site.id, (p) => (p.type === 'site' ? { ...p, data: r.data } : p));
    toast(`קו המבנה הועתק לפרויקט "${site.name}" כאלמנט "מבנה"${r.moved ? ' במרכז המגרש' : ''}. אפשר להזיז ולסובב אותו שם.`);
  };
  return (
    <div className="panel-section">
      <h3>{Icons.tree} העתקה לתכנון אתר</h3>
      <span className="small">גובה המעטפת: <b className="num">{fmtM(fps[0].height)}</b> · שטח ברוטו: <b className="num">{fmtArea(fps.reduce((a, f) => a + Math.abs(polyArea(f.pts)), 0))}</b></span>
      {sites.length ? (
        <>
          <select className="input" value={siteId} onChange={(e) => setTarget(e.target.value)} aria-label="פרויקט תכנון אתר">
            {sites.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button className="btn sm" onClick={copy}>{Icons.copy} העתקת קו המבנה לפרויקט האתר</button>
        </>
      ) : <span className="small muted">אין עדיין פרויקט "תכנון אדריכלי ומתחמים". אחרי שתיצרי אחד, אפשר להעתיק אליו את קו המבנה.</span>}
      <span className="small muted">העתקה חד־פעמית: נוצר אלמנט "מבנה" פשוט (קו המתאר החיצוני של הקומה התחתונה, גובה הקירות וגג שטוח). שינויים בהמשך לא יתעדכנו שם, וגג משופע, פתחים ופנים המבנה אינם מועברים.</span>
    </div>
  );
}

export function SettingsPanel({ project, setData }: { project: BProject; setData: SetB }) {
  const d = project.data;
  return (
    <div className="panel-section">
      <h3>{Icons.settings} הגדרות</h3>
      <div className="grid2">
        <MField label="גודל משבצת" value={d.grid.size} min={10} onChange={(v) => setData((dd) => ({ ...dd, grid: { ...dd.grid, size: v } }))} />
        <MField label="מפלס הקרקע סביב המבנה" value={d.groundLevel} allowNegative onChange={(v) => setData((dd) => ({ ...dd, groundLevel: v }))} />
        <MField label="כיוון צפון" kind="deg" value={d.north} allowNegative onChange={(v) => setData((dd) => ({ ...dd, north: v }))} />
      </div>
      <Check checked={d.grid.show} onChange={(v) => setData((dd) => ({ ...dd, grid: { ...dd.grid, show: v } }))}>הצגת רשת</Check>
      <Check checked={d.grid.snap} onChange={(v) => setData((dd) => ({ ...dd, grid: { ...dd.grid, snap: v } }))}>הצמדה לרשת</Check>
      <div className="row">
        <button className="btn sm" onClick={() => useBldUi.getState().setTool({ t: 'lot' })}>{Icons.polygon} {d.lot.length ? 'שרטוט מחדש של גבול המגרש' : 'גבול מגרש'}</button>
        {d.lot.length > 0 && <button className="btn sm ghost" onClick={() => setData((dd) => ({ ...dd, lot: [] }))}>הסרת גבול המגרש</button>}
      </div>
    </div>
  );
}

export function WarningsPanel({ project, model }: { project: BProject; model: BuildingModel }) {
  const d = project.data;
  if (!model.warnings.length) return null;
  const go = (id: string) => {
    const f = findEl(d, id);
    if (!f) return;
    const lvl = f.type === 'opening' ? d.walls.find((w) => w.id === (f.el as Opening).wallId)?.levelId : (f.el as unknown as { levelId: string }).levelId;
    useBldUi.setState({ levelId: lvl ?? null, sel: [id], tool: { t: 'select' } });
  };
  const uniq = model.warnings.filter((w, i, a) => a.findIndex((x) => x.id === w.id && x.msg === w.msg) === i);
  return (
    <div className="panel-section">
      <h3 style={{ color: 'var(--danger)' }}>{Icons.warn} אזהרות ({uniq.length})</h3>
      {uniq.slice(0, 12).map((w, i) => <button key={i} className="btn sm ghost warn-row" onClick={() => go(w.id)}>{w.msg}</button>)}
    </div>
  );
}

// ------------------------------------------------------------------ properties

function Measures({ items }: { items: [string, string][] }) {
  return <div className="measures">{items.map(([k, v]) => <div key={k}><span>{k}</span><b>{v}</b></div>)}</div>;
}

export function PropertiesPanel({ project, model, setData }: { project: BProject; model: BuildingModel; setData: SetB }) {
  const d = project.data;
  const sel = useBldUi((s) => s.sel);
  const adv = useBldUi((s) => s.advanced);
  const els = sel.map((id) => findEl(d, id)).filter((x): x is NonNullable<typeof x> => !!x);
  if (!els.length) return null;
  const pid = project.id;
  const del = () => { setData((dd) => deleteIds(dd, sel)); useBldUi.getState().select([]); };
  const dup = () => { const r = duplicateIds(d, sel, v2(500, -500), uid); setData(() => r.data); useBldUi.getState().select(r.ids); };
  const rot = (deg: number) => setData((dd) => rotateIds(dd, sel, deg, selectionCenter(dd, sel)));
  const actions = (
    <div className="row">
      <button className="btn sm" onClick={dup}>{Icons.copy} שכפול</button>
      {els.some((e) => e.type !== 'opening' && e.type !== 'room') && <button className="btn sm" onClick={() => rot(90)}>{Icons.rotate} סיבוב 90°</button>}
      <button className="btn sm ghost danger" onClick={del}>{Icons.trash} מחיקה</button>
    </div>
  );
  if (els.length > 1) {
    return (
      <div className="panel-section">
        <h3>{els.length} אלמנטים נבחרו</h3>
        {d.renovation && <PhaseSelect value={'existing'} onChange={(p) => setData((dd) => setPhase(dd, sel, p))} />}
        {actions}
        <button className="btn sm ghost" onClick={() => useBldUi.getState().select([])}>ביטול הבחירה</button>
      </div>
    );
  }
  const { type, el } = els[0];
  const title = EL_LABELS[type as ElType];
  const body = (() => {
    switch (type) {
      case 'wall': return <WallProps w={el as Wall} project={project} setData={setData} adv={adv} />;
      case 'opening': return <OpeningProps o={el as Opening} project={project} setData={setData} />;
      case 'room': return <RoomProps r={el as Room} project={project} model={model} setData={setData} />;
      case 'furniture': return <FurnProps f={el as Furniture} project={project} setData={setData} adv={adv} />;
      default: return <OtherProps id={el.id} type={type} project={project} setData={setData} />;
    }
  })();
  const phaseOf = (el as { phase?: Phase }).phase;
  return (
    <div className="panel-section">
      <h3>{title}{type === 'furniture' ? `: ${furn((el as Furniture).kind).label}` : type === 'opening' ? `: ${openingDef((el as Opening).kind).label}` : ''}</h3>
      {body}
      {d.renovation && phaseOf && <PhaseSelect value={phaseOf} onChange={(p) => setData((dd) => setPhase(dd, sel, p))} />}
      {actions}
      <button className="btn sm ghost" onClick={() => useBldUi.getState().select([])}>סיום עריכה</button>
      <span className="small muted" hidden={!!pid}>{pid}</span>
    </div>
  );
}

function useUpd<T extends { id: string }>(setData: SetB, key: keyof BuildingData) {
  return (id: string, patch: Partial<T>, record = true) => setData((dd) => ({ ...dd, [key]: (dd[key] as unknown as T[]).map((x) => (x.id === id ? { ...x, ...patch } : x)) }), record);
}

function WallProps({ w, project, setData, adv }: { w: Wall; project: BProject; setData: SetB; adv: boolean }) {
  const d = project.data;
  const level = levelOf(d, w.levelId);
  const upd = useUpd<Wall>(setData, 'walls');
  const L = wallLength(w);
  const ang = (Math.atan2(w.b.y - w.a.y, w.b.x - w.a.x) * 180) / Math.PI;
  const ops = d.openings.filter((o) => o.wallId === w.id);
  const change = (patch: Partial<Wall>) => {
    const nw = { ...w, ...patch };
    const probs = checkWallOpenings(nw, ops, nw.height ?? level.ceilingHeight);
    upd(w.id, patch);
    if (probs.length && !checkWallOpenings(w, ops, w.height ?? level.ceilingHeight).length) toast(`שימי לב: ${probs[0].msg}`);
  };
  const setLen = (v: number) => { const u = norm(sub(w.b, w.a)); change({ b: add(w.a, mul(u, v)) }); };
  const setAng = (deg: number) => { const r = (deg * Math.PI) / 180; change({ b: v2(w.a.x + Math.cos(r) * L, w.a.y + Math.sin(r) * L) }); };
  return (
    <>
      <Seg value={w.kind} options={(['exterior', 'interior', 'partition'] as const).map((k) => ({ v: k, label: WALL_KIND_LABELS[k] }))} onChange={(k) => upd(w.id, { kind: k })} ariaLabel="סוג קיר" />
      <div className="grid2">
        <MField label="אורך (קו אמצע)" value={L} min={10} onChange={setLen} />
        <MField label="עובי" value={w.thickness} min={20} onChange={(v) => change({ thickness: v })} />
        <MField label="גובה (ריק = תקרה)" value={w.height} min={100} placeholder={mToStr(level.ceilingHeight, 2)} onChange={(v) => change({ height: v })} />
        <MField label="זווית" kind="deg" value={Number(ang.toFixed(4))} allowNegative onChange={setAng} />
      </div>
      {w.height !== null && <button className="btn sm ghost" onClick={() => change({ height: null })}>גובה לפי התקרה ({fmtM(level.ceilingHeight)})</button>}
      {adv && (
        <div className="grid2">
          <MField label="התחלה X" value={w.a.x} allowNegative onChange={(x) => change({ a: v2(x, w.a.y) })} />
          <MField label="התחלה Y" value={w.a.y} allowNegative onChange={(y) => change({ a: v2(w.a.x, y) })} />
          <MField label="סוף X" value={w.b.x} allowNegative onChange={(x) => change({ b: v2(x, w.b.y) })} />
          <MField label="סוף Y" value={w.b.y} allowNegative onChange={(y) => change({ b: v2(w.b.x, y) })} />
        </div>
      )}
      <div className="grid2">
        <MatSelect label="גימור פן שמאל" use="wall" value={w.left.material} onChange={(m) => upd(w.id, { left: { material: m, color: material(m).color } })} />
        <MatSelect label="גימור פן ימין" use="wall" value={w.right.material} onChange={(m) => upd(w.id, { right: { material: m, color: material(m).color } })} />
      </div>
      <ColorField label="צבע פן שמאל (לכיוון ההתחלה→סוף)" value={w.left.color} projectId={project.id} onChange={(c, r) => upd(w.id, { left: { ...w.left, color: c } }, r)} />
      <ColorField label="צבע פן ימין" value={w.right.color} projectId={project.id} onChange={(c, r) => upd(w.id, { right: { ...w.right, color: c } }, r)} />
      <Measures items={[['פתחים בקיר', String(ops.length)], ['שטח פן', fmtArea(L * (w.height ?? level.ceilingHeight) - ops.reduce((a, o) => a + o.width * o.height, 0))]]} />
      <div className="row">
        <button className="btn sm" onClick={() => useBldUi.getState().setTool({ t: 'opening', kind: 'door' })}>{Icons.plus} דלת</button>
        <button className="btn sm" onClick={() => useBldUi.getState().setTool({ t: 'opening', kind: 'window' })}>{Icons.plus} חלון</button>
        <button className="btn sm ghost" onClick={() => change({ a: w.b, b: w.a })} title="הפיכת כיוון הקיר (מחליף בין פן שמאל לימין)">⇄ הפיכת כיוון</button>
      </div>
    </>
  );
}

function OpeningProps({ o, project, setData }: { o: Opening; project: BProject; setData: SetB }) {
  const d = project.data;
  const w = d.walls.find((x) => x.id === o.wallId);
  if (!w) return null;
  const level = levelOf(d, w.levelId);
  const def = openingDef(o.kind);
  const L = wallLength(w);
  const wh = w.height ?? level.ceilingHeight;
  const change = (patch: Partial<Opening>, record = true) => {
    const no = { ...o, ...patch };
    const probs = checkWallOpenings(w, d.openings.map((x) => (x.id === o.id ? no : x)), wh).filter((p) => p.id === o.id && p.severe);
    if (probs.length) { toast(`לא ניתן: ${probs[0].msg}`); return; }
    setData((dd) => ({ ...dd, openings: dd.openings.map((x) => (x.id === o.id ? no : x)) }), record);
  };
  return (
    <>
      <label className="field"><span>סוג</span><select className="input" value={o.kind} onChange={(e) => { const nd = openingDef(e.target.value); change({ kind: nd.kind, sill: nd.door ? 0 : o.sill || nd.sill, color: nd.color, material: nd.material }); }} aria-label="סוג פתח">{OPENINGS.map((x) => <option key={x.kind} value={x.kind}>{x.label}</option>)}</select></label>
      <div className="grid2">
        <MField label="רוחב" value={o.width} min={200} onChange={(v) => change({ width: v })} />
        <MField label="גובה" value={o.height} min={200} onChange={(v) => change({ height: v })} />
        {!def.door && <MField label="גובה סף" value={o.sill} min={0} onChange={(v) => change({ sill: v })} />}
        <MField label="מרכז – מרחק מתחילת הקיר" value={o.pos} min={0} onChange={(v) => change({ pos: v })} />
        <MField label="מרווח מתחילת הקיר" value={o.pos - o.width / 2} min={0} onChange={(v) => change({ pos: v + o.width / 2 })} />
        <MField label="מרווח מסוף הקיר" value={L - o.pos - o.width / 2} min={0} onChange={(v) => change({ pos: L - v - o.width / 2 })} />
      </div>
      {def.door && (
        <>
          <label className="field"><span>כיוון פתיחה</span><Seg value={o.side} options={[{ v: 'L', label: 'לצד שמאל של הקיר' }, { v: 'R', label: 'לצד ימין' }]} onChange={(v) => change({ side: v })} ariaLabel="כיוון פתיחה" /></label>
          {def.style === 'swing' && <label className="field"><span>צד הצירים</span><Seg value={o.hinge} options={[{ v: 'start', label: 'ליד תחילת הקיר' }, { v: 'end', label: 'ליד סוף הקיר' }]} onChange={(v) => change({ hinge: v })} ariaLabel="צד הצירים" /></label>}
        </>
      )}
      <div className="grid2"><MatSelect label="חומר מסגרת" use="object" value={o.material} onChange={(m) => change({ material: m })} /></div>
      <ColorField label="צבע" value={o.color} projectId={project.id} onChange={(c, r) => change({ color: c }, r)} />
      <Measures items={[['ראש הפתח', fmtM(o.sill + o.height)], ['גובה הקיר', fmtM(wh)], ['אורך הקיר', fmtM(L)]]} />
    </>
  );
}

/** Paints the faces of the walls around a room (the side facing the room). */
function roomWallColor(d: BuildingData, model: BuildingModel, r: Room, color: string, mat: string): BuildingData {
  const lm = model.levels.find((l) => l.level.id === r.levelId);
  if (!lm || r.mode !== 'auto') return d;
  const f = lm.faces.filter((x) => x.area > 0).find((x) => insidePoly(r.seed, x.pts));
  if (!f) return d;
  const sides = new Map<string, 'left' | 'right'>();
  f.pts.forEach((p, i) => {
    const q = f.pts[(i + 1) % f.pts.length];
    const w = d.walls.find((x) => x.id === f.edges[i].wallId);
    if (!w) return;
    // The room is on the left of the face edge; same direction as the wall = the wall's left face.
    sides.set(w.id, dot(sub(q, p), sub(w.b, w.a)) > 0 ? 'left' : 'right');
  });
  return { ...d, walls: d.walls.map((w) => { const s = sides.get(w.id); return s ? { ...w, [s]: { material: mat, color } } : w; }) };
}
function insidePoly(p: Vec2, poly: Vec2[]) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c; }
  return c;
}

function RoomProps({ r, project, model, setData }: { r: Room; project: BProject; model: BuildingModel; setData: SetB }) {
  const d = project.data;
  const upd = useUpd<Room>(setData, 'rooms');
  const rm = model.levels.flatMap((l) => l.rooms).find((x) => x.room.id === r.id);
  const [wallC, setWallC] = useState('#f4f1ea');
  return (
    <>
      <label className="field"><span>שם החדר</span><input className="input" value={r.name} onChange={(e) => upd(r.id, { name: e.target.value })} aria-label="שם החדר" /></label>
      {rm?.net ? <Measures items={[['שטח נטו', fmtArea(rm.area)], ['היקף', fmtM(rm.perimeter)]]} /> : <div className="notice warn">{Icons.warn}<span>החדר אינו סגור בקירות, ולכן אין לו שטח. סגרי את הקירות סביבו.</span></div>}
      <span className="small muted">{AREA_EXPLAIN.net}</span>
      <span className="small muted">{r.mode === 'auto' ? 'החדר מזוהה אוטומטית מהקירות שסביבו ומתעדכן כשהם זזים.' : 'חדר בציור חופשי: גבולו נקבע לפי הנקודות שסומנו.'}</span>
      <Check checked={r.showArea} onChange={(v) => upd(r.id, { showArea: v })}>הצגת השטח בתוכנית</Check>
      <h3 style={{ marginTop: 6 }}>ריצוף</h3>
      <div className="grid2">
        <MatSelect label="חומר רצפה" use="floor" value={r.floor.material} onChange={(m) => upd(r.id, { floor: floorFinish(m, undefined, r.floor.angle) })} />
        <MField label="כיוון פריסה" kind="deg" value={r.floor.angle} allowNegative onChange={(v) => upd(r.id, { floor: { ...r.floor, angle: v } })} />
        <MField label="אורך אריח / לוח" value={r.floor.tileW} min={0} onChange={(v) => upd(r.id, { floor: { ...r.floor, tileW: v } })} />
        <MField label="רוחב אריח / לוח" value={r.floor.tileH} min={0} onChange={(v) => upd(r.id, { floor: { ...r.floor, tileH: v } })} />
      </div>
      <ColorField label="צבע הרצפה" value={r.floor.color} projectId={project.id} onChange={(c, rec) => upd(r.id, { floor: { ...r.floor, color: c } }, rec)} />
      {r.mode === 'auto' && (
        <>
          <h3 style={{ marginTop: 6 }}>צבע הקירות בחדר</h3>
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <input className="input color-input" style={{ width: 54 }} type="color" value={wallC} onChange={(e) => setWallC(e.target.value)} aria-label="צבע קירות החדר" />
            <button className="btn sm" onClick={() => setData((dd) => roomWallColor(dd, model, r, wallC, 'paint'))}>צביעת קירות החדר</button>
            <button className="btn sm ghost" onClick={() => setData((dd) => roomWallColor(dd, model, r, material('tile-wall').color, 'tile-wall'))}>חיפוי קרמיקה</button>
          </div>
        </>
      )}
      {d.renovation && <label className="field"><span>קיים במצב</span><Seg value={r.state} options={[{ v: 'all', label: 'בשניהם' }, { v: 'existing', label: 'קיים בלבד' }, { v: 'proposed', label: 'מוצע בלבד' }]} onChange={(v) => upd(r.id, { state: v })} ariaLabel="מצב החדר" /></label>}
    </>
  );
}

function FurnProps({ f, project, setData, adv }: { f: Furniture; project: BProject; setData: SetB; adv: boolean }) {
  const upd = useUpd<Furniture>(setData, 'furniture');
  const item = furn(f.kind);
  return (
    <>
      <div className="grid3">
        <MField label="רוחב" value={f.w} min={10} onChange={(v) => upd(f.id, { w: v })} />
        <MField label="עומק" value={f.d} min={10} onChange={(v) => upd(f.id, { d: v })} />
        <MField label="גובה" value={f.h} min={5} onChange={(v) => upd(f.id, { h: v })} />
        <MField label="גובה מהרצפה" value={f.elev} min={0} onChange={(v) => upd(f.id, { elev: v })} />
        <MField label="סיבוב" kind="deg" value={f.rot} allowNegative onChange={(v) => upd(f.id, { rot: v })} />
      </div>
      {adv && <div className="grid2"><MField label="מרכז X" value={f.p.x} allowNegative onChange={(x) => upd(f.id, { p: v2(x, f.p.y) })} /><MField label="מרכז Y" value={f.p.y} allowNegative onChange={(y) => upd(f.id, { p: v2(f.p.x, y) })} /></div>}
      <button className="btn sm ghost" onClick={() => upd(f.id, { w: item.w, d: item.d, h: item.h, elev: item.elev })}>חזרה למידות ברירת המחדל</button>
      <div className="grid2"><MatSelect label="חומר" use="object" value={f.material} onChange={(m) => upd(f.id, { material: m, color: material(m).color })} /></div>
      <ColorField label="צבע ראשי" value={f.color} projectId={project.id} onChange={(c, r) => upd(f.id, { color: c }, r)} />
      <ColorField label="צבע משני" value={f.color2} projectId={project.id} onChange={(c, r) => upd(f.id, { color2: c }, r)} />
    </>
  );
}

function OtherProps({ id, type, project, setData }: { id: string; type: ElType; project: BProject; setData: SetB }) {
  const d = project.data;
  if (type === 'stair') {
    const s = d.stairs.find((x) => x.id === id)!;
    const upd = (p: Partial<typeof s>) => setData((dd) => ({ ...dd, stairs: dd.stairs.map((x) => (x.id === id ? { ...x, ...p } : x)) }));
    const chk = stairCheck(s);
    const g = stairGeom(s);
    return (
      <>
        <Seg value={s.shape} options={(['straight', 'L', 'U'] as const).map((k) => ({ v: k, label: STAIR_SHAPE_LABELS[k] }))} onChange={(v) => upd({ shape: v })} ariaLabel="צורת המדרגות" />
        <div className="grid2">
          <MField label="רוחב" value={s.width} min={300} onChange={(v) => upd({ width: v })} />
          <MField label="הפרש גובה" value={s.rise} min={100} onChange={(v) => upd({ rise: v })} />
          <MField label="מספר רומים" kind="n" integer value={s.risers} min={2} max={60} onChange={(v) => upd({ risers: v })} />
          <MField label="עומק שלח" value={s.going} min={100} onChange={(v) => upd({ going: v })} />
          {s.shape === 'U' && <MField label="עומק משטח ביניים" value={s.landing} min={300} onChange={(v) => upd({ landing: v })} />}
          {s.shape === 'U' && <MField label="מרווח בין המהלכים" value={s.gap} min={0} onChange={(v) => upd({ gap: v })} />}
          <MField label="כיוון העלייה" kind="deg" value={s.rot} allowNegative onChange={(v) => upd({ rot: v })} />
        </div>
        {s.shape !== 'straight' && <Seg value={s.turn} options={[{ v: 'left', label: 'פנייה שמאלה' }, { v: 'right', label: 'פנייה ימינה' }]} onChange={(v) => upd({ turn: v })} ariaLabel="כיוון הפנייה" />}
        <Check checked={s.cutUpper} onChange={(v) => upd({ cutUpper: v })}>פתח ברצפת הקומה העליונה</Check>
        {!chk.errors.length && <Measures items={[['גובה רום', `${chk.riser.toFixed(1)} מ״מ`], ['2×רום+שלח', `${chk.blondel.toFixed(0)} מ״מ`], ['אורך מהלך', fmtM(g.run)]]} />}
        {chk.errors.map((e, i) => <div key={i} className="notice warn">{Icons.warn}<span>{e}</span></div>)}
        {chk.notes.map((e, i) => <div key={i} className="notice info">{Icons.info}<span>{e}</span></div>)}
        <span className="small muted">החישוב גאומטרי בלבד. המדרגות אינן מאושרות מבחינת תקנים או בטיחות ללא בדיקה של איש מקצוע מוסמך.</span>
        <ColorField label="צבע" value={s.color} projectId={project.id} onChange={(c) => upd({ color: c })} />
      </>
    );
  }
  if (type === 'roof') {
    const r = d.roofs.find((x) => x.id === id)!;
    const upd = (p: Partial<typeof r>) => setData((dd) => ({ ...dd, roofs: dd.roofs.map((x) => (x.id === id ? { ...x, ...p } : x)) }));
    const f = r.pts.length >= 3 ? roofFrame(r.pts) : null;
    return (
      <>
        <Seg value={r.shape} options={(['flat', 'shed', 'gable'] as const).map((k) => ({ v: k, label: ROOF_SHAPE_LABELS[k] }))} onChange={(v) => upd({ shape: v })} ariaLabel="סוג גג" />
        <div className="grid2">
          <MField label="גובה תחתית הגג מהרצפה" value={r.base} allowNegative onChange={(v) => upd({ base: v })} />
          <MField label="עובי" value={r.thickness} min={20} onChange={(v) => upd({ thickness: v })} />
          {r.shape !== 'flat' && <MField label="שיפוע" kind="deg" value={r.slope} min={0} max={75} onChange={(v) => upd({ slope: v })} />}
          <MField label="בליטה (כרכוב)" value={r.overhang} min={0} onChange={(v) => upd({ overhang: v })} />
          {r.shape === 'flat' && <MField label="גובה מעקה גג" value={r.parapet} min={0} onChange={(v) => upd({ parapet: v })} />}
        </div>
        {r.shape !== 'flat' && <Check checked={r.gableWalls} onChange={(v) => upd({ gableWalls: v })}>מילוי גמלונים (קירות משולשים בקצוות)</Check>}
        {r.shape !== 'flat' && <button className="btn sm" onClick={() => upd({ pts: [...r.pts.slice(1), r.pts[0]] })}>{Icons.rotate} סיבוב כיוון הרכס / השיפוע</button>}
        {f && r.shape !== 'flat' && !f.isRect && <div className="notice info">{Icons.info}<span>קו המתאר אינו מלבן; הגג המשופע נבנה על המלבן החוסם.</span></div>}
        <ColorField label="צבע" value={r.color} projectId={project.id} onChange={(c) => upd({ color: c })} />
      </>
    );
  }
  if (type === 'slab') {
    const s = d.slabs.find((x) => x.id === id)!;
    const upd = (p: Partial<typeof s>) => setData((dd) => ({ ...dd, slabs: dd.slabs.map((x) => (x.id === id ? { ...x, ...p } : x)) }));
    return (
      <>
        <label className="field"><span>סוג</span><select className="input" value={s.kind} onChange={(e) => upd({ kind: e.target.value as typeof s.kind })} aria-label="סוג">{Object.entries(SLAB_KIND_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        {s.kind !== 'void' && <div className="grid2">
          <MField label="עובי" value={s.thickness} min={10} onChange={(v) => upd({ thickness: v })} />
          <MField label={s.kind === 'ceiling' ? 'גובה תחתית מהרצפה' : 'גובה עליון מהרצפה'} value={s.top} allowNegative onChange={(v) => upd({ top: v })} />
          {s.kind === 'balcony' && <MField label="גובה מעקה (0 = ללא)" value={s.railing} min={0} onChange={(v) => upd({ railing: v })} />}
        </div>}
        <Measures items={[['שטח', fmtArea(polyArea(s.pts))]]} />
        {s.kind !== 'void' && <ColorField label="צבע" value={s.color} projectId={project.id} onChange={(c) => upd({ color: c })} />}
      </>
    );
  }
  if (type === 'column') {
    const c = d.columns.find((x) => x.id === id)!;
    const upd = (p: Partial<typeof c>) => setData((dd) => ({ ...dd, columns: dd.columns.map((x) => (x.id === id ? { ...x, ...p } : x)) }));
    return (
      <>
        <Check checked={c.round} onChange={(v) => upd({ round: v })}>עמוד עגול</Check>
        <div className="grid2">
          <MField label={c.round ? 'קוטר' : 'רוחב'} value={c.w} min={50} onChange={(v) => upd({ w: v })} />
          {!c.round && <MField label="עומק" value={c.d} min={50} onChange={(v) => upd({ d: v })} />}
          <MField label="גובה (ריק = תקרה)" value={c.height} min={100} onChange={(v) => upd({ height: v })} />
        </div>
        <span className="small muted">עמודים וקורות להמחשה אדריכלית בלבד, ללא חישוב קונסטרוקטיבי.</span>
        <ColorField label="צבע" value={c.color} projectId={project.id} onChange={(col) => upd({ color: col })} />
      </>
    );
  }
  if (type === 'beam') {
    const b = d.beams.find((x) => x.id === id)!;
    const upd = (p: Partial<typeof b>) => setData((dd) => ({ ...dd, beams: dd.beams.map((x) => (x.id === id ? { ...x, ...p } : x)) }));
    return (
      <>
        <div className="grid2"><MField label="רוחב" value={b.w} min={50} onChange={(v) => upd({ w: v })} /><MField label="גובה" value={b.h} min={50} onChange={(v) => upd({ h: v })} /></div>
        <span className="small muted">הקורה צמודה לתקרה. להמחשה אדריכלית בלבד.</span>
      </>
    );
  }
  if (type === 'annotation') {
    const a = d.annotations.find((x) => x.id === id)!;
    const upd = (p: Record<string, unknown>) => setData((dd) => ({ ...dd, annotations: dd.annotations.map((x) => (x.id === id ? ({ ...x, ...p } as typeof x) : x)) }));
    if (a.type === 'text') return <><input className="input" value={a.text} onChange={(e) => upd({ text: e.target.value })} aria-label="טקסט" /><label className="field"><span>גודל (מ״מ על הנייר)</span><NumberField value={a.size} min={1} max={20} onChange={(v) => v && upd({ size: v })} /></label></>;
    return <MField label="היסט קו המידה" value={a.offset} allowNegative onChange={(v) => upd({ offset: v })} />;
  }
  return null;
}

export { MATERIALS };
export function useLevel(project: BProject) {
  const id = useBldUi((s) => s.levelId);
  return useMemo(() => levelOf(project.data, id ?? project.data.levels[0].id), [project.data, id]);
}

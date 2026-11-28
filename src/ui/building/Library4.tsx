// 4.0: the element library of the building editor: categories that open and close, sub-groups, Hebrew search with
// synonyms, filters by room, favourites and recently used items. Favourites are kept in this browser only.

import { useMemo, useState } from 'react';
import { create } from 'zustand';
import { FURNITURE, FURN_CATEGORIES, ROOM_TAGS, searchFurniture, type FurnItem, type RoomTag } from '../../building/furniture';
import { OPENING_PRESETS, openingDef } from '../../building/openings';
import { FurnPreview } from './Panels';
import { MField } from '../site/fields';
import { useBldUi } from './bldUi';

const FAV = 'archicut-fav-items', REC = 'archicut-recent-items';
const read = (k: string): string[] => { try { const v = JSON.parse(localStorage.getItem(k) ?? '[]'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []; } catch { return []; } };
const write = (k: string, v: string[]) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } };

export const useLibPrefs = create<{ fav: string[]; recent: string[]; toggle(kind: string): void; used(kind: string): void }>((set, get) => ({
  fav: read(FAV),
  recent: read(REC),
  toggle(kind) { const f = get().fav.includes(kind) ? get().fav.filter((x) => x !== kind) : [kind, ...get().fav]; write(FAV, f); set({ fav: f }); },
  used(kind) { const r = [kind, ...get().recent.filter((x) => x !== kind)].slice(0, 12); write(REC, r); set({ recent: r }); },
}));

export function FurnitureLibrary() {
  const tool = useBldUi((s) => s.tool);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string>('living');
  const [room, setRoom] = useState<RoomTag | ''>('');
  const [view, setView] = useState<'all' | 'fav' | 'recent'>('all');
  const prefs = useLibPrefs();
  const pick = (f: FurnItem) => { prefs.used(f.kind); useBldUi.getState().setTool({ t: 'furniture', kind: f.kind }); };
  const byRoom = (l: FurnItem[]) => (room ? l.filter((f) => f.rooms?.includes(room) || (!f.rooms && roomOfCat(f) === room)) : l);
  const item = (f: FurnItem) => {
    const on = tool.t === 'furniture' && tool.kind === f.kind;
    const fav = prefs.fav.includes(f.kind);
    return (
      <div key={f.kind} style={{ position: 'relative' }}>
        <button className={`lib-item ${on ? 'on' : ''}`} style={{ width: '100%' }} aria-pressed={on} title={`${f.label} – ${f.w}×${f.d}×${f.h} מ״מ${f.note ? `. ${f.note}` : ''}`} onClick={() => pick(f)}>
          <FurnPreview item={f} /><span>{f.label}</span>
        </button>
        <button type="button" className="lib-star" aria-pressed={fav} aria-label={fav ? `הסרה מהמועדפים: ${f.label}` : `הוספה למועדפים: ${f.label}`} onClick={() => prefs.toggle(f.kind)}>{fav ? '★' : '☆'}</button>
      </div>
    );
  };
  const grid = (list: FurnItem[], grouped = false) => {
    if (!grouped) return <div className="lib-grid">{list.map(item)}</div>;
    const subs = [...new Set(list.map((f) => f.sub ?? ''))];
    return <div className="lib-grid">{subs.flatMap((s) => [s ? <div key={`h${s}`} className="lib-sub">{s}</div> : null, ...list.filter((f) => (f.sub ?? '') === s).map(item)])}</div>;
  };
  const found = q.trim() ? byRoom(searchFurniture(q)) : null;
  const special = view === 'fav' ? prefs.fav : view === 'recent' ? prefs.recent : null;
  const specialList = special ? special.map((k) => FURNITURE.find((f) => f.kind === k)).filter((f): f is FurnItem => !!f) : null;
  const count = useMemo(() => FURNITURE.length, []);
  return (
    <div className="panel-section">
      <h3>ספריית אלמנטים ({count})</h3>
      <input className="input" placeholder="חיפוש: ספה, כורסא, מנורה, קשת, אגרטל…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="חיפוש רהיטים" />
      <div className="lib-filters">
        {(['all', 'fav', 'recent'] as const).map((v) => <button key={v} type="button" className={`chip ${view === v ? 'on' : ''}`} aria-pressed={view === v} onClick={() => setView(v)}>{v === 'all' ? 'לפי קטגוריה' : v === 'fav' ? `★ מועדפים (${prefs.fav.length})` : 'אחרונים'}</button>)}
        <select className="input" style={{ width: 'auto', minHeight: 32 }} value={room} onChange={(e) => setRoom(e.target.value as RoomTag | '')} aria-label="סינון לפי חדר">
          <option value="">כל החדרים</option>
          {ROOM_TAGS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>
      </div>
      {found ? (found.length ? grid(found) : <span className="small muted">לא נמצא פריט כזה. נסי מילה אחרת (למשל "כורסה" או "כורסא").</span>)
        : specialList ? (specialList.length ? grid(specialList) : <span className="small muted">{view === 'fav' ? 'סמני ☆ ליד פריט כדי להוסיף אותו למועדפים.' : 'עדיין לא נבחרו פריטים.'}</span>)
          : FURN_CATEGORIES.map((c) => {
            const list = byRoom(FURNITURE.filter((f) => f.cat === c.id));
            if (!list.length) return null;
            return (
              <div key={c.id} className="lib-cat">
                <button className="lib-cat-head" aria-expanded={open === c.id} onClick={() => setOpen(open === c.id ? '' : c.id)}><span>{c.label}</span><span className="muted small">{list.length}</span></button>
                {open === c.id && grid(list, true)}
              </div>
            );
          })}
      <span className="small muted">המידות הן ברירת מחדל מקובלת וניתנות לשינוי אחרי ההצבה. הפריטים להמחשה תכנונית בלבד.</span>
    </div>
  );
}

/** Rooms of 3.0 items (which have no room tags), by their category. */
function roomOfCat(f: FurnItem): RoomTag | '' {
  switch (f.cat) {
    case 'living': return 'living';
    case 'bedroom': return 'bedroom';
    case 'kitchen': return 'kitchen';
    case 'bath': return 'bath';
    case 'office': return 'office';
    default: return '';
  }
}

/** 4.0 designed doors, windows, passages and niches (stored on 3.0 kinds). */
export function OpeningPresets() {
  const tool = useBldUi((s) => s.tool);
  const presets = useBldUi((s) => s.presets);
  const [g, setG] = useState<'דלתות' | 'חלונות' | 'מעברים ונישות'>('דלתות');
  const cur = tool.t === 'opening' && tool.preset ? OPENING_PRESETS.find((p) => p.id === tool.preset) : undefined;
  const setP = (patch: Partial<typeof presets>) => useBldUi.setState({ presets: { ...presets, ...patch } });
  return (
    <div className="panel-section">
      <h3>דלתות, חלונות ומעברים מעוצבים</h3>
      <div className="lib-filters">
        {(['דלתות', 'חלונות', 'מעברים ונישות'] as const).map((x) => <button key={x} type="button" className={`chip ${g === x ? 'on' : ''}`} aria-pressed={g === x} onClick={() => setG(x)}>{x}</button>)}
      </div>
      <div className="lib-grid">
        {OPENING_PRESETS.filter((p) => p.group === g).map((p) => {
          const on = tool.t === 'opening' && tool.preset === p.id;
          return (
            <button key={p.id} className={`lib-item ${on ? 'on' : ''}`} aria-pressed={on} title={p.note ?? p.label} onClick={() => { useBldUi.getState().setTool({ t: 'opening', kind: p.kind, preset: p.id }); setP({ openW: null, openH: null, openSill: null }); }}>
              <PresetIcon id={p.id} /><span>{p.label}</span>
            </button>
          );
        })}
      </div>
      {cur && (
        <div className="grid3">
          <MField label="רוחב" value={presets.openW ?? cur.w} min={300} onChange={(v) => setP({ openW: v })} />
          <MField label="גובה" value={presets.openH ?? cur.h} min={300} onChange={(v) => setP({ openH: v })} />
          {!openingDef(cur.kind).door && <MField label="גובה סף" value={presets.openSill ?? cur.sill} min={0} onChange={(v) => setP({ openSill: v })} />}
        </div>
      )}
      {cur?.note && <div className="note-demo">{cur.note}</div>}
    </div>
  );
}

/** A small elevation of a preset: its outline in a wall. */
function PresetIcon({ id }: { id: string }) {
  const p = OPENING_PRESETS.find((x) => x.id === id)!;
  const W = 60, H = 46, k = Math.min(40 / Math.max(p.w, 600), 40 / Math.max(p.sill + p.h, 2400));
  const x0 = W / 2 - (p.w * k) / 2, x1 = W / 2 + (p.w * k) / 2, yb = H - 3 - p.sill * k, yt = H - 3 - (p.sill + p.h) * k;
  let d = `M${x0} ${yb}L${x1} ${yb}L${x1} ${yt}L${x0} ${yt}Z`;
  const a = (x1 - x0) / 2, cx = (x0 + x1) / 2;
  if (p.shape === 'arch') { const r = Math.min(a, yb - yt); d = `M${x0} ${yb}L${x1} ${yb}L${x1} ${yt + r}A${a} ${r} 0 0 0 ${x0} ${yt + r}Z`; }
  else if (p.shape === 'segment' || p.shape === 'ellipse') { const r = (p.shape === 'segment' ? 0.18 : 0.3) * p.w * k; d = `M${x0} ${yb}L${x1} ${yb}L${x1} ${yt + r}A${a} ${r} 0 0 0 ${x0} ${yt + r}Z`; }
  else if (p.shape === 'pointed') { const r = 0.8 * p.w * k; d = `M${x0} ${yb}L${x1} ${yb}L${x1} ${yt + r}Q${x1} ${yt + r * 0.3} ${cx} ${yt}Q${x0} ${yt + r * 0.3} ${x0} ${yt + r}Z`; }
  else if (p.shape === 'round' || p.shape === 'oval') { const ry = (yb - yt) / 2; d = `M${x0} ${yt + ry}A${a} ${ry} 0 1 0 ${x1} ${yt + ry}A${a} ${ry} 0 1 0 ${x0} ${yt + ry}Z`; }
  const fill = p.variant === 'passage' ? '#ffffff' : p.variant === 'niche' ? '#d9d4ca' : openingDef(p.kind).glass || !openingDef(p.kind).door ? '#cfe3ee' : p.leaf ?? '#c9b9a0';
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden="true">
      <rect x={2} y={2} width={W - 4} height={H - 5} fill="#e7e2d8" stroke="#9a948a" strokeWidth={0.6} />
      <path d={d} fill={fill} stroke="#353b43" strokeWidth={1.2} />
      {p.variant === 'deco' && <path d={d} fill="none" stroke="#8a6a4a" strokeWidth={3} strokeOpacity={0.5} transform={`translate(${cx} ${(yb + yt) / 2}) scale(1.12) translate(${-cx} ${-(yb + yt) / 2})`} />}
    </svg>
  );
}

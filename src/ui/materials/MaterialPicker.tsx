// 4.0: the shared material picker (floors, walls, ceilings, furniture parts, outdoor surfaces). Basic mode: material,
// colour, size and direction. Advanced mode adds HEX, the second colour, joints, gloss, metalness and transparency.
// Favourites and recently used materials are kept in this browser (a convenience, not project data).

import { useMemo, useRef, useState } from 'react';
import { create } from 'zustand';
import { CATALOG, LAYOUT_LABELS, MAT_CATS, PALETTES, isHex, mat, searchMats, type MatCat, type MatDef, type MatUse } from '../../materials/catalog';
import { GLOSS, layoutsFor, resolveFinish, richFinish, type FinishLike } from '../../materials/finish';
import { thumbUrl } from '../../materials/texture';
import { MField } from '../site/fields';
import { Seg, toast } from '../common';
import { useStore } from '../../document/store';

// ---------------------------------------------------------------- favourites, recents, copied style

const FAV_KEY = 'archicut-fav-materials', REC_KEY = 'archicut-recent-materials';
const readList = (k: string): string[] => { try { const v = JSON.parse(localStorage.getItem(k) ?? '[]'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []; } catch { return []; } };
const writeList = (k: string, v: string[]) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } };

interface MatPrefs { fav: string[]; recent: string[]; copied: FinishLike | null; toggleFav(id: string): void; used(id: string): void; copy(f: FinishLike): void }
export const useMatPrefs = create<MatPrefs>((set, get) => ({
  fav: readList(FAV_KEY),
  recent: readList(REC_KEY),
  copied: null,
  toggleFav(id) { const f = get().fav.includes(id) ? get().fav.filter((x) => x !== id) : [id, ...get().fav]; writeList(FAV_KEY, f); set({ fav: f }); },
  used(id) { const r = [id, ...get().recent.filter((x) => x !== id)].slice(0, 12); writeList(REC_KEY, r); set({ recent: r }); },
  copy(f) { set({ copied: structuredClone(f) }); },
}));

// ---------------------------------------------------------------- helpers

/** 'floor' finishes keep their size in tileW / tileH (as in 3.0); others in tw / th. */
export type FinishKind = 'floor' | 'finish';

export function makeFinish(kind: FinishKind, id: string, color?: string, angle = 0): FinishLike & { tileW?: number; tileH?: number; angle: number } {
  const r = richFinish(id, color);
  if (kind === 'floor') {
    const { tw, th, ...rest } = r;
    return { ...rest, tileW: tw, tileH: th, angle };
  }
  return { ...r, angle };
}

const sizeOf = (f: FinishLike) => { const d = mat(f.material); return [f.tw ?? f.tileW ?? d.w, f.th ?? f.tileH ?? d.h]; };
const withSize = (kind: FinishKind, f: FinishLike, w: number, h: number): FinishLike => (kind === 'floor' ? { ...f, tileW: w, tileH: h } : { ...f, tw: w, th: h });

export function FinishThumb({ f, size = 40, title }: { f: FinishLike; size?: number; title?: string }) {
  const url = useMemo(() => thumbUrl(resolveFinish(f).spec, 56), [f]);
  const r = resolveFinish(f);
  return url
    ? <img className="mat-thumb" src={url} width={size} height={size} alt="" title={title} style={{ opacity: Math.max(0.35, r.opacity) }} />
    : <span className="mat-thumb" style={{ width: size, height: size, background: r.spec.color }} title={title} />;
}

const defThumb = (m: MatDef) => thumbUrl(resolveFinish({ material: m.id, color: m.color, v: 4 }).spec, 56);

// ---------------------------------------------------------------- picker

interface Props {
  label: string;
  value: FinishLike;
  /** Where the material goes; several uses show the materials of any of them. */
  use: MatUse | MatUse[];
  kind?: FinishKind;
  onChange: (f: FinishLike, record?: boolean) => void;
  projectId: string;
  adv: boolean;
  /** Offer a picture from the device as a custom wallpaper (walls). */
  onImage?: (img: { id: string; name: string; dataUrl: string; w: number; h: number }) => void;
  /** Start open (the wall designer opens the face being edited). */
  open?: boolean;
  testId?: string;
}

export function MaterialPicker({ label, value, use, kind = 'finish', onChange, projectId, adv, onImage, open: open0 = false, testId }: Props) {
  const [open, setOpen] = useState(open0);
  const [cat, setCat] = useState<'all' | 'fav' | 'recent' | MatCat>('all');
  const [q, setQ] = useState('');
  const prefs = useMatPrefs();
  const fileRef = useRef<HTMLInputElement>(null);
  const r = resolveFinish(value);
  const def = r.def;
  const [tw, th] = sizeOf(value);
  const rich = value.v === 4;
  const useKey = Array.isArray(use) ? use.join(',') : use;
  const fits = useMemo(() => { const us = useKey.split(',') as MatUse[]; return (m: MatDef) => m.use.some((u) => us.includes(u)); }, [useKey]);
  const cats = useMemo(() => MAT_CATS.filter((c) => CATALOG.some((m) => m.cat === c.id && fits(m))), [fits]);
  const list = useMemo(() => {
    const base = q.trim() ? searchMats(q).filter(fits) : CATALOG.filter(fits);
    if (cat === 'fav') return prefs.fav.map((id) => CATALOG.find((m) => m.id === id)).filter((m): m is MatDef => !!m && fits(m));
    if (cat === 'recent') return prefs.recent.map((id) => CATALOG.find((m) => m.id === id)).filter((m): m is MatDef => !!m && fits(m));
    return cat === 'all' ? base : base.filter((m) => m.cat === cat);
  }, [q, fits, cat, prefs.fav, prefs.recent]);
  const set = (patch: Partial<FinishLike>, record = true) => onChange({ ...(rich ? value : makeFinish(kind, value.material, value.color, value.angle ?? 0)), ...patch, v: 4 }, record);
  const pick = (m: MatDef) => { prefs.used(m.id); onChange({ ...makeFinish(kind, m.id, undefined, value.angle ?? 0) }); };
  const textured = r.textured && !r.img;
  const layouts = layoutsFor(def);
  const jointed = def.pattern === 'tile' || def.pattern === 'plank' || def.pattern === 'brick' || def.pattern === 'stone' || def.pattern === 'mosaic' || def.pattern === 'hex' || def.pattern === 'pavers';
  const two = def.color2 !== def.color || def.cat === 'wallpaper' || def.pattern === 'marble';
  const chk = () => useStore.getState().checkpoint(projectId);

  const addImage = async (file: File) => {
    try {
      const url = await new Promise<string>((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.onerror = () => rej(new Error('read')); fr.readAsDataURL(file); });
      const img = await new Promise<HTMLImageElement>((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('decode')); im.src = url; });
      // Kept small: at most 1024 px on the long side, as JPEG, inside the project only.
      const k = Math.min(1, 1024 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      const dataUrl = c.toDataURL('image/jpeg', 0.85);
      const id = `img${Date.now().toString(36)}`;
      onImage?.({ id, name: file.name.slice(0, 60), dataUrl, w: c.width, h: c.height });
      onChange({ ...makeFinish(kind, 'wp-plain', '#ffffff', 0), img: id, tw: 1000, th: Math.round((1000 * c.height) / c.width) });
      toast('התמונה נשמרה בתוך הפרויקט בלבד (לא הועלתה לשום מקום).');
    } catch { toast('לא ניתן לקרוא את התמונה. נסי קובץ JPG או PNG.'); }
  };

  return (
    <div className="mat-picker" data-testid={testId}>
      <div className="mat-current">
        <FinishThumb f={value} size={44} title={def.label} />
        <div className="mat-current-text">
          <span className="small muted">{label}</span>
          <b>{r.img ? 'תמונה אישית' : def.label}</b>
          {!rich && <span className="small muted">מראה מגרסה 3.0 – ישתנה רק אם תערכי</span>}
        </div>
        <button type="button" className="btn sm" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'סגירה' : 'בחירת חומר'}</button>
      </div>
      {open && (
        <div className="mat-body">
          <input className="input" placeholder="חיפוש: פרקט אלון, שיש, טפט פרחוני…" value={q} onChange={(e) => setQ(e.target.value)} aria-label={`חיפוש חומר – ${label}`} />
          <div className="mat-cats" role="tablist" aria-label="קטגוריות חומרים">
            {[{ id: 'all', label: 'הכול' }, { id: 'fav', label: '★ מועדפים' }, { id: 'recent', label: 'אחרונים' }, ...cats].map((c) => (
              <button key={c.id} type="button" role="tab" aria-selected={cat === c.id} className={`chip ${cat === c.id ? 'on' : ''}`} onClick={() => setCat(c.id as typeof cat)}>{c.label}</button>
            ))}
          </div>
          <div className="mat-grid">
            {list.map((m) => (
              <button key={m.id} type="button" className={`mat-item ${m.id === value.material && !r.img ? 'on' : ''}`} aria-pressed={m.id === value.material && !r.img} title={m.label} onClick={() => pick(m)}>
                {defThumb(m) ? <img src={defThumb(m)} width={46} height={46} alt="" /> : <span className="mat-thumb" style={{ width: 46, height: 46, background: m.color }} />}
                <span>{m.label}</span>
              </button>
            ))}
            {!list.length && <span className="small muted">{cat === 'fav' ? 'עדיין אין מועדפים. סמני ★ ליד חומר שאהבת.' : cat === 'recent' ? 'עדיין לא נבחרו חומרים.' : 'לא נמצא חומר כזה.'}</span>}
          </div>
          {onImage && use === 'wall' && (
            <>
              <button type="button" className="btn sm ghost" onClick={() => fileRef.current?.click()}>תמונה מהמכשיר כטפט אישי</button>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void addImage(f); e.target.value = ''; }} />
            </>
          )}
        </div>
      )}
      {/* Settings of the chosen material. */}
      <div className="mat-settings">
        <div className="field">
          <span>צבע</span>
          <div className="row" style={{ gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
            <input className="input color-input" style={{ width: 54 }} type="color" value={isHex(value.color) ? value.color : '#cccccc'} aria-label={`צבע – ${label}`} onFocus={chk} onChange={(e) => set({ color: e.target.value }, false)} />
            {(adv ? PALETTES : PALETTES.slice(0, 2)).flatMap((p) => p.colors.slice(0, adv ? 8 : 6)).map((c, i) => <button key={`${c}${i}`} type="button" className="swatch" title={c} aria-label={`צבע ${c}`} style={{ background: c, outline: c === value.color ? '2px solid var(--accent)' : undefined }} onClick={() => set({ color: c })} />)}
            <button type="button" className="btn sm ghost" title="הצבע המקורי של החומר" onClick={() => set({ color: def.color })}>מקורי</button>
          </div>
          {adv && <HexField value={value.color} onChange={(c) => set({ color: c })} label={`HEX – ${label}`} />}
        </div>
        {adv && two && (
          <div className="field"><span>צבע משני (דוגמה, עורקים)</span>
            <div className="row" style={{ gap: 4 }}>
              <input className="input color-input" style={{ width: 54 }} type="color" value={isHex(value.color2 ?? '') ? value.color2 : def.color2} aria-label={`צבע משני – ${label}`} onFocus={chk} onChange={(e) => set({ color2: e.target.value }, false)} />
              <HexField value={value.color2 ?? def.color2} onChange={(c) => set({ color2: c })} label={`HEX משני – ${label}`} />
            </div>
          </div>
        )}
        {(textured || r.img) && (
          <div className="grid3">
            <MField label={def.pattern === 'plank' ? 'אורך לוח' : 'רוחב אריח / דוגמה'} value={tw} min={20} max={20000} onChange={(v) => onChange({ ...withSize(kind, rich ? value : makeFinish(kind, value.material, value.color, value.angle ?? 0), v, th), v: 4 })} />
            <MField label={def.pattern === 'plank' ? 'רוחב לוח' : 'גובה אריח / דוגמה'} value={th} min={10} max={20000} onChange={(v) => onChange({ ...withSize(kind, rich ? value : makeFinish(kind, value.material, value.color, value.angle ?? 0), tw, v), v: 4 })} />
            <MField label="כיוון / סיבוב" kind="deg" value={value.angle ?? 0} allowNegative onChange={(v) => set({ angle: v })} />
          </div>
        )}
        {textured && layouts.length > 0 && (
          <label className="field"><span>פריסה</span>
            <select className="input" value={value.layout ?? def.layout ?? layouts[0]} onChange={(e) => set({ layout: e.target.value as FinishLike['layout'] })} aria-label={`פריסה – ${label}`}>
              {layouts.map((l) => <option key={l} value={l}>{LAYOUT_LABELS[l]}</option>)}
            </select>
          </label>
        )}
        {textured && jointed && (adv || def.cat === 'tile') && (
          <div className="grid2">
            <label className="field"><span>צבע רובה / מישק</span><input className="input color-input" type="color" value={isHex(value.grout ?? '') ? value.grout : def.grout ?? '#bdb8ae'} aria-label={`צבע רובה – ${label}`} onFocus={chk} onChange={(e) => set({ grout: e.target.value }, false)} /></label>
            <MField label="רוחב מישק" kind="n" unit="מ״מ" value={value.groutW ?? def.groutW ?? 0} min={0} max={30} onChange={(v) => set({ groutW: v })} />
          </div>
        )}
        <label className="field"><span>ברק</span><Seg value={nearestGloss(value.rough ?? def.rough)} options={GLOSS.map((g) => ({ v: g.v, label: g.label }))} onChange={(v) => set({ rough: v })} ariaLabel={`ברק – ${label}`} /></label>
        {adv && (
          <div className="grid2">
            <label className="field"><span>מתכתיות</span><input type="range" min={0} max={1} step={0.05} value={value.metal ?? def.metal} onChange={(e) => set({ metal: Number(e.target.value) }, false)} aria-label={`מתכתיות – ${label}`} /></label>
            <label className="field"><span>אטימות</span><input type="range" min={0.15} max={1} step={0.05} value={value.opacity ?? def.opacity} onChange={(e) => set({ opacity: Number(e.target.value) }, false)} aria-label={`אטימות – ${label}`} /></label>
          </div>
        )}
        <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
          <button type="button" className="btn sm ghost" aria-pressed={prefs.fav.includes(def.id)} onClick={() => prefs.toggleFav(def.id)}>{prefs.fav.includes(def.id) ? '★ במועדפים' : '☆ למועדפים'}</button>
          <button type="button" className="btn sm ghost" onClick={() => { prefs.copy(value); toast('הסגנון הועתק. בחרי משטח אחר ולחצי "הדבקת סגנון".'); }}>העתקת סגנון</button>
          <button type="button" className="btn sm ghost" disabled={!prefs.copied} onClick={() => { const c = prefs.copied; if (!c) return; onChange(kind === 'floor' ? { ...c, tileW: c.tileW ?? c.tw, tileH: c.tileH ?? c.th, angle: c.angle ?? 0, v: 4 } : { ...c, v: 4 }); }}>הדבקת סגנון</button>
          <button type="button" className="btn sm ghost" onClick={() => onChange(makeFinish(kind, def.id, undefined, 0))}>איפוס</button>
        </div>
      </div>
    </div>
  );
}

const nearestGloss = (rough: number) => GLOSS.reduce((a, g) => (Math.abs(g.v - rough) < Math.abs(a - rough) ? g.v : a), GLOSS[0].v);

function HexField({ value, onChange, label }: { value: string; onChange: (c: string) => void; label: string }) {
  const [t, setT] = useState(value);
  const [focus, setFocus] = useState(false);
  const shown = focus ? t : value;
  return (
    <input className={`input ${isHex(shown) ? '' : 'invalid'}`} style={{ width: 96, direction: 'ltr' }} value={shown} aria-label={label} maxLength={7}
      onFocus={() => { setFocus(true); setT(value); }} onBlur={() => setFocus(false)}
      onChange={(e) => { let v = e.target.value.trim(); if (v && v[0] !== '#') v = `#${v}`; setT(v); if (isHex(v)) onChange(v.toLowerCase()); }} />
  );
}

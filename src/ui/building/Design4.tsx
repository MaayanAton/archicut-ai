// 4.0 design panels of the building editor: wall faces and zones, room floor / ceiling / walls, furniture parts and
// lights, the properties every element shares (lock, hide, layer) and the layers list.

import { useState } from 'react';
import { create } from 'zustand';
import type { Project } from '../../document/types';
import { Check, Seg, confirmDialog, toast } from '../common';
import { Icons } from '../icons';
import { MField } from '../site/fields';
import { FinishThumb, MaterialPicker } from '../materials/MaterialPicker';
import type { FinishLike } from '../../materials/finish';
import { richFinish } from '../../materials/finish';
import { mat } from '../../materials/catalog';
import type { BuildingData, CeilingDesign, Finish, FloorFinish, Furniture, Room, Wall, WallZone } from '../../building/types';
import type { BuildingModel } from '../../building/model';
import { levelOf } from '../../building/model';
import { wallLength } from '../../building/openings';
import { furn } from '../../building/furniture';
import { ZONE_PRESETS, applyRoomFinish, faceRoomName, pasteWallStyle, wallStyle, type WallStyle } from '../../building/design';
import { findEl } from '../../building/edit';
import type { SetB } from './PlanEditor';

type BProject = Extract<Project, { type: 'building' }>;

/** The copied wall design (in memory for this session). */
const useWallClip = create<{ style: WallStyle | null; len: number; inner: 'L' | 'R' | null }>(() => ({ style: null, len: 0, inner: null }));

/** The face of a wall that looks into a room, when exactly one does (an outer wall). */
const innerSide = (m: BuildingModel, w: Wall): 'L' | 'R' | null => {
  const l = !!faceRoomName(m, w, 'L'), r = !!faceRoomName(m, w, 'R');
  return l === r ? null : l ? 'L' : 'R';
};
const swapFaces = (s: WallStyle): WallStyle => ({ left: s.right, right: s.left, zones: s.zones.map((z) => ({ ...z, side: z.side === 'L' ? 'R' : 'L' })) });

let zc = 0;
const zid = () => `z${Date.now().toString(36)}${(zc++).toString(36)}`;

const addImage = (setData: SetB) => (img: { id: string; name: string; dataUrl: string; w: number; h: number }) => setData((dd) => ({ ...dd, images: [...(dd.images ?? []), img] }));

// ---------------------------------------------------------------- walls

export function WallDesign({ w, project, model, setData, adv }: { w: Wall; project: BProject; model: BuildingModel; setData: SetB; adv: boolean }) {
  const d = project.data;
  const level = levelOf(d, w.levelId);
  const H = w.height ?? level.ceilingHeight;
  const L = wallLength(w);
  const clip = useWallClip();
  const [faceOpen, setFaceOpen] = useState<'L' | 'R' | null>(null);
  const updW = (fn: (x: Wall) => Wall, record = true) => setData((dd) => ({ ...dd, walls: dd.walls.map((x) => (x.id === w.id ? fn(x) : x)) }), record);
  const setFace = (side: 'L' | 'R', f: FinishLike, record = true) => updW((x) => ({ ...x, [side === 'L' ? 'left' : 'right']: f as Finish }), record);
  const zones = w.zones ?? [];
  const setZones = (zs: WallZone[], record = true) => updW((x) => ({ ...x, zones: zs.length ? zs : undefined }), record);
  const addZone = (side: 'L' | 'R', pid: string) => {
    const p = ZONE_PRESETS.find((z) => z.id === pid)!;
    const base = pid === 'dado' || pid === 'wet' ? richFinish('tile-metro') : pid === 'band' ? richFinish('wood-slats') : pid === 'upper' ? richFinish('wp-stripes-v') : richFinish('brick-exposed');
    setZones([...zones, { id: zid(), side, s0: p.along === 'half' ? 0 : null, s1: p.along === 'half' ? Math.round(L / 2) : null, z0: p.z0, z1: p.z1, finish: base, name: p.label }]);
  };
  const face = (side: 'L' | 'R') => {
    const fin = side === 'L' ? w.left : w.right;
    const room = faceRoomName(model, w, side);
    const zs = zones.filter((z) => z.side === side);
    return (
      <div className="face-box" key={side} data-testid={`face-${side}`}>
        <h4>{side === 'L' ? 'פן שמאל' : 'פן ימין'} · {room ? `פונה אל: ${room}` : 'פונה החוצה / ללא חדר'}</h4>
        <MaterialPicker label="גימור כל הפן" value={fin} use="wall" projectId={project.id} adv={adv} open={faceOpen === side} onChange={(f, r) => setFace(side, f, r)} onImage={addImage(setData)} testId={`picker-face-${side}`} />
        {zs.map((z) => (
          <div className="zone-row" key={z.id} data-testid="zone-row">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <b className="small">{z.name || 'אזור בקיר'}</b>
              <button type="button" className="btn sm ghost danger" aria-label="מחיקת האזור" onClick={() => setZones(zones.filter((x) => x.id !== z.id))}>{Icons.trash}</button>
            </div>
            <div className="grid2">
              <MField label="מגובה" value={z.z0} min={0} max={H} onChange={(v) => setZones(zones.map((x) => (x.id === z.id ? { ...x, z0: v } : x)))} />
              <MField label="עד גובה (ריק = עד למעלה)" value={z.z1} min={1} max={H} placeholder="עד למעלה" onChange={(v) => setZones(zones.map((x) => (x.id === z.id ? { ...x, z1: v } : x)))} />
              <MField label="ממרחק מתחילת הקיר (ריק = מההתחלה)" value={z.s0} min={0} max={L} placeholder="מההתחלה" onChange={(v) => setZones(zones.map((x) => (x.id === z.id ? { ...x, s0: v } : x)))} />
              <MField label="עד מרחק (ריק = עד הסוף)" value={z.s1} min={1} max={L} placeholder="עד הסוף" onChange={(v) => setZones(zones.map((x) => (x.id === z.id ? { ...x, s1: v } : x)))} />
            </div>
            {(z.s0 !== null || z.s1 !== null) && <button type="button" className="btn sm ghost" onClick={() => setZones(zones.map((x) => (x.id === z.id ? { ...x, s0: null, s1: null } : x)))}>לכל אורך הפן</button>}
            <MaterialPicker label="חומר האזור" value={z.finish} use="wall" projectId={project.id} adv={adv} onChange={(f, r) => setZones(zones.map((x) => (x.id === z.id ? { ...x, finish: f as Finish } : x)), r)} onImage={addImage(setData)} />
          </div>
        ))}
        <label className="field"><span>הוספת עיצוב חלקי לפן</span>
          <select className="input" value="" aria-label={`הוספת אזור – ${side === 'L' ? 'פן שמאל' : 'פן ימין'}`} onChange={(e) => { if (e.target.value) addZone(side, e.target.value); }}>
            <option value="">בחרי…</option>
            {ZONE_PRESETS.map((z) => <option key={z.id} value={z.id}>{z.label}</option>)}
          </select>
        </label>
      </div>
    );
  };
  return (
    <div className="panel-section" style={{ padding: 0, border: 0 }}>
      <h3 style={{ marginTop: 6 }}>עיצוב הקיר (4.0)</h3>
      <span className="small muted">לכל פן חומר משלו. חומרים אינם משנים את מידות הקיר, השטחים או הפתחים; טפט וחיפוי אינם נכנסים לתוך פתחים.</span>
      <div className="row" style={{ gap: 4 }}>
        <button type="button" className="btn sm ghost" onClick={() => setFaceOpen(faceOpen === 'L' ? null : 'L')}>חומר לפן שמאל</button>
        <button type="button" className="btn sm ghost" onClick={() => setFaceOpen(faceOpen === 'R' ? null : 'R')}>חומר לפן ימין</button>
      </div>
      {face('L')}
      {face('R')}
      <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
        <button type="button" className="btn sm" onClick={() => { useWallClip.setState({ style: wallStyle(w), len: L, inner: innerSide(model, w) }); toast('עיצוב הקיר הועתק. בחרי קיר אחר ולחצי "הדבקת עיצוב".'); }}>העתקת עיצוב הקיר</button>
        <button type="button" className="btn sm" disabled={!clip.style} onClick={() => {
          if (!clip.style) return;
          // Outer walls drawn in opposite directions: the room side of the copy goes to the room side here.
          const here = innerSide(model, w);
          const st = clip.inner && here && clip.inner !== here ? swapFaces(clip.style) : clip.style;
          updW((x) => pasteWallStyle(x, st, clip.len));
        }}>הדבקת עיצוב</button>
        <button type="button" className="btn sm ghost" onClick={() => updW((x) => ({ ...x, left: x.right, right: x.left, zones: x.zones?.map((z) => ({ ...z, side: z.side === 'L' ? 'R' : 'L' })) }))}>החלפת עיצוב בין הפנים</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- rooms

const DEFAULT_CEILING: CeilingDesign = { finish: richFinish('paint', '#f7f6f2'), drop: 0, beams: 0, beamW: 150, beamH: 200, beamDir: 0, beamColor: '#7a5238' };

export function RoomDesign({ r, project, model, setData, adv }: { r: Room; project: BProject; model: BuildingModel; setData: SetB; adv: boolean }) {
  const upd = (patch: Partial<Room>, record = true) => setData((dd) => ({ ...dd, rooms: dd.rooms.map((x) => (x.id === r.id ? { ...x, ...patch } : x)) }), record);
  const [wallF, setWallF] = useState<FinishLike>(richFinish('paint-satin', '#e9e3d6'));
  const [band, setBand] = useState<'face' | 'dado' | 'wet'>('face');
  const c = r.ceiling;
  const apply = async () => {
    const what = band === 'face' ? 'כל הפנים של קירות החדר' : band === 'dado' ? 'חיפוי עד 1.20 מ׳ בכל קירות החדר' : 'חיפוי עד 2.20 מ׳ בכל קירות החדר';
    if (!(await confirmDialog('החלה על קירות החדר', `${what} יקבלו את החומר "${mat(wallF.material).label}". רק החלק של כל קיר שפונה אל "${r.name}" ישתנה. אפשר לבטל עם "בטל".`, 'החלה'))) return;
    let n = 0;
    setData((dd) => { const res = applyRoomFinish(dd, model, r, wallF as Finish, band === 'face' ? { kind: 'face' } : { kind: 'band', z0: 0, z1: band === 'dado' ? 1200 : 2200 }); n = res.faces; return res.data; });
    toast(n ? `העיצוב הוחל על ${n} פנים של קירות.` : 'לא נמצאו קירות סביב החדר.');
  };
  return (
    <>
      <h3 style={{ marginTop: 6 }}>רצפה (4.0)</h3>
      <MaterialPicker label="חומר הרצפה" kind="floor" value={r.floor} use="floor" projectId={project.id} adv={adv} onChange={(f, rec) => upd({ floor: f as FloorFinish }, rec)} testId="picker-floor" />
      <span className="small muted">החומר אינו משנה את שטח החדר. לאזור רצפה אחר בתוך החדר: כלי "אזור רצפה" בסרגל הכלים.</span>
      <h3 style={{ marginTop: 6 }}>תקרה (להמחשה)</h3>
      <Check checked={!!c} onChange={(v) => upd({ ceiling: v ? DEFAULT_CEILING : undefined })}>עיצוב תקרה לחדר</Check>
      {c && (
        <>
          <MaterialPicker label="גימור התקרה" value={c.finish} use="ceiling" projectId={project.id} adv={adv} onChange={(f, rec) => upd({ ceiling: { ...c, finish: f as Finish } }, rec)} />
          <div className="grid2">
            <MField label="תקרה מונמכת – הנמכה" value={c.drop} min={0} max={1500} onChange={(v) => upd({ ceiling: { ...c, drop: v } })} />
            <MField label="קורות דקורטיביות (מספר)" kind="n" integer value={c.beams} min={0} max={40} onChange={(v) => upd({ ceiling: { ...c, beams: v } })} />
            {c.beams > 0 && <MField label="רוחב קורה" value={c.beamW} min={20} onChange={(v) => upd({ ceiling: { ...c, beamW: v } })} />}
            {c.beams > 0 && <MField label="גובה קורה" value={c.beamH} min={20} onChange={(v) => upd({ ceiling: { ...c, beamH: v } })} />}
            {c.beams > 0 && <MField label="כיוון הקורות" kind="deg" value={c.beamDir} allowNegative onChange={(v) => upd({ ceiling: { ...c, beamDir: v } })} />}
          </div>
          {c.beams > 0 && <label className="field"><span>צבע הקורות</span><input className="input color-input" type="color" value={c.beamColor} onChange={(e) => upd({ ceiling: { ...c, beamColor: e.target.value } }, false)} aria-label="צבע הקורות" /></label>}
          <span className="small muted">התקרה, ההנמכה והקורות הן להמחשה עיצובית בלבד ואינן תכנון הנדסי. אפשר להסתיר תקרות בתלת־ממד.</span>
        </>
      )}
      <h3 style={{ marginTop: 6 }}>עיצוב כל קירות החדר</h3>
      <MaterialPicker label="חומר לקירות החדר" value={wallF} use="wall" projectId={project.id} adv={adv} onChange={(f) => setWallF(f)} />
      <Seg value={band} options={[{ v: 'face', label: 'כל הפן' }, { v: 'dado', label: 'עד 1.20 מ׳' }, { v: 'wet', label: 'עד 2.20 מ׳' }]} onChange={setBand} ariaLabel="היקף ההחלה" />
      <button type="button" className="btn sm" onClick={() => void apply()}>החלה על קירות החדר…</button>
    </>
  );
}

// ---------------------------------------------------------------- furniture

export function FurnDesign({ f, project, setData, adv }: { f: Furniture; project: BProject; setData: SetB; adv: boolean }) {
  const it = furn(f.kind);
  const upd = (patch: Partial<Furniture>, record = true) => setData((dd) => ({ ...dd, furniture: dd.furniture.map((x) => (x.id === f.id ? { ...x, ...patch } : x)) }), record);
  const slots = it.slots ?? ['ראשי', 'משני'];
  const colors = [f.color, f.color2, f.color3 ?? f.color2];
  const setColor = (i: number, c: string, rec: boolean) => upd(i === 0 ? { color: c } : i === 1 ? { color2: c } : { color3: c }, rec);
  const mats = f.mats ?? [];
  const [open, setOpen] = useState<number | null>(null);
  return (
    <>
      {it.note && <div className="note-demo">{it.note}</div>}
      <h3 style={{ marginTop: 6 }}>חלקי הפריט</h3>
      {slots.map((name, i) => {
        const m = mats[i] ?? null;
        const fin: FinishLike = m ? { ...richFinish(m, colors[i]) } : { material: 'paint', color: colors[i] };
        return (
          <div key={i} className="zone-row">
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="row" style={{ gap: 6, alignItems: 'center' }}><FinishThumb f={fin} size={28} /><b className="small">{name}</b><span className="small muted">{m ? mat(m).label : 'צבע בלבד'}</span></span>
              <button type="button" className="btn sm ghost" aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)}>{open === i ? 'סגירה' : 'עריכה'}</button>
            </div>
            {open === i && (
              <>
                <MaterialPicker label={`חומר: ${name}`} value={fin} use="object" projectId={project.id} adv={adv} onChange={(nf, rec) => {
                  const nm = [...(f.mats ?? slots.map(() => null))];
                  while (nm.length < slots.length) nm.push(null);
                  nm[i] = nf.material === 'paint' && !m ? null : nf.material;
                  upd({ mats: nm, ...(i === 0 ? { color: nf.color } : i === 1 ? { color2: nf.color } : { color3: nf.color }) }, rec);
                }} />
                <div className="row" style={{ gap: 4 }}>
                  <input className="input color-input" style={{ width: 54 }} type="color" value={colors[i]} onChange={(e) => setColor(i, e.target.value, false)} aria-label={`צבע: ${name}`} />
                  {m && <button type="button" className="btn sm ghost" onClick={() => { const nm = [...mats]; nm[i] = null; upd({ mats: nm }); }}>ללא טקסטורה (צבע בלבד)</button>}
                </div>
              </>
            )}
          </div>
        );
      })}
      {it.light && <LightProps f={f} setData={setData} />}
      {it.mount && it.mount !== 'floor' && <span className="small muted">{it.mount === 'wall' ? 'פריט קיר: בהצבה הוא נצמד לקיר הקרוב, גבו אל הקיר.' : it.mount === 'surface' ? 'פריט משטח: בהצבה הוא מונח על השולחן או המדף שמתחתיו. אפשר לשנות גובה ידנית.' : 'פריט תקרה: בהצבה הוא נתלה מתחת לתקרה.'}</span>}
    </>
  );
}

function LightProps({ f, setData }: { f: Furniture; setData: SetB }) {
  const it = furn(f.kind);
  const l = f.light ?? { on: true, dim: 1, temp: 'warm' };
  const upd = (patch: Partial<typeof l>, record = true) => setData((dd) => ({ ...dd, furniture: dd.furniture.map((x) => (x.id === f.id ? { ...x, light: { ...l, ...patch } } : x)) }), record);
  const custom = l.temp !== 'warm' && l.temp !== 'neutral' && l.temp !== 'cold';
  return (
    <>
      <h3 style={{ marginTop: 6 }}>תאורה</h3>
      <Check checked={l.on} onChange={(v) => upd({ on: v })}>התאורה דולקת</Check>
      <label className="field"><span>עוצמה</span><input type="range" min={0.1} max={1} step={0.05} value={l.dim} onChange={(e) => upd({ dim: Number(e.target.value) }, false)} aria-label="עוצמת התאורה" /></label>
      <Seg value={custom ? 'custom' : l.temp} options={[{ v: 'warm', label: 'חמה' }, { v: 'neutral', label: 'ניטרלית' }, { v: 'cold', label: 'קרה' }, { v: 'custom', label: 'צבע' }]} onChange={(v) => upd({ temp: v === 'custom' ? '#ffb46b' : v })} ariaLabel="גוון האור" />
      {custom && <input className="input color-input" type="color" value={l.temp} onChange={(e) => upd({ temp: e.target.value }, false)} aria-label="צבע האור" />}
      <span className="small muted">{it.light?.decorative ? 'גוף תאורה דקורטיבי: נראה דולק, אך אינו מאיר את הסצנה.' : 'במצב לילה בתלת־ממד גוף התאורה מאיר את סביבתו. להמחשה בלבד – לא חישוב תאורה הנדסי.'}</span>
    </>
  );
}

// ---------------------------------------------------------------- shared properties and layers

export function ElCommon({ ids, project, setData }: { ids: string[]; project: BProject; setData: SetB }) {
  const d = project.data;
  const els = ids.map((id) => findEl(d, id)?.el as { id: string; locked?: boolean; hidden?: boolean; layer?: string } | undefined).filter((x): x is NonNullable<typeof x> => !!x);
  if (!els.length) return null;
  const lockedAll = els.every((e) => e.locked), hiddenAny = els.some((e) => e.hidden);
  const layer = els.every((e) => e.layer === els[0].layer) ? els[0].layer ?? '' : '*';
  const patchAll = (patch: Record<string, unknown>) => setData((dd) => patchEls(dd, ids, patch));
  return (
    <div className="el-common">
      <button type="button" className="btn sm ghost" aria-pressed={lockedAll} onClick={() => patchAll({ locked: lockedAll ? undefined : true })}>{lockedAll ? Icons.lock : Icons.unlock} {lockedAll ? 'נעול' : 'נעילה'}</button>
      <button type="button" className="btn sm ghost" onClick={() => { patchAll({ hidden: hiddenAny ? undefined : true }); if (!hiddenAny) toast('האלמנט הוסתר. להצגה: "הצגת אלמנטים מוסתרים" בחלונית השכבות (מצב מתקדם) או Ctrl+Z.'); }}>{Icons.eyeOff} {hiddenAny ? 'הצגה' : 'הסתרה'}</button>
      {(d.layers?.length ?? 0) > 0 && (
        <select className="input" style={{ width: 'auto' }} value={layer} onChange={(e) => patchAll({ layer: e.target.value || undefined })} aria-label="שכבה">
          {layer === '*' && <option value="*">שכבות שונות</option>}
          <option value="">ללא שכבה</option>
          {d.layers!.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      )}
    </div>
  );
}

/** Sets fields on elements of any type (undefined removes the field). */
export function patchEls(d: BuildingData, ids: string[], patch: Record<string, unknown>): BuildingData {
  const set = new Set(ids);
  const fix = <T extends { id: string }>(list: T[] | undefined): T[] | undefined => list?.map((x) => {
    if (!set.has(x.id)) return x;
    const o: Record<string, unknown> = { ...x, ...patch };
    for (const k of Object.keys(patch)) if (patch[k] === undefined) delete o[k];
    return o as T;
  });
  return {
    ...d,
    walls: fix(d.walls)!, openings: fix(d.openings)!, rooms: fix(d.rooms)!, furniture: fix(d.furniture)!, stairs: fix(d.stairs)!, columns: fix(d.columns)!,
    beams: fix(d.beams)!, slabs: fix(d.slabs)!, roofs: fix(d.roofs)!, annotations: fix(d.annotations)!, ...(d.floorZones ? { floorZones: fix(d.floorZones) } : {}),
  };
}

export function LayersPanel({ project, setData }: { project: BProject; setData: SetB }) {
  const d = project.data;
  const layers = d.layers ?? [];
  const hidden = (['walls', 'openings', 'rooms', 'furniture', 'stairs', 'columns', 'beams', 'slabs', 'roofs', 'annotations', 'floorZones'] as const).flatMap((k) => ((d[k] ?? []) as { id: string; hidden?: boolean }[]).filter((x) => x.hidden).map((x) => x.id));
  const setLayers = (ls: NonNullable<BuildingData['layers']>) => setData((dd) => ({ ...dd, layers: ls.length ? ls : undefined }));
  return (
    <div className="panel-section">
      <h3>{Icons.layers} שכבות</h3>
      <span className="small muted">שכבה מאפשרת להסתיר או לנעול קבוצת אלמנטים (למשל "ריהוט", "תאורה", "חיפויים"). לשיוך: בחרי אלמנט ובחרי לו שכבה במאפיינים.</span>
      {layers.map((l) => (
        <div key={l.id} className="row" style={{ gap: 4, alignItems: 'center' }}>
          <input className="input" value={l.name} onChange={(e) => setLayers(layers.map((x) => (x.id === l.id ? { ...x, name: e.target.value } : x)))} aria-label="שם השכבה" />
          <button type="button" className="btn sm ghost" aria-pressed={l.visible} title={l.visible ? 'הסתרת השכבה' : 'הצגת השכבה'} onClick={() => setLayers(layers.map((x) => (x.id === l.id ? { ...x, visible: !x.visible } : x)))}>{l.visible ? Icons.eye : Icons.eyeOff}</button>
          <button type="button" className="btn sm ghost" aria-pressed={l.locked} title={l.locked ? 'שחרור הנעילה' : 'נעילת השכבה'} onClick={() => setLayers(layers.map((x) => (x.id === l.id ? { ...x, locked: !x.locked } : x)))}>{l.locked ? Icons.lock : Icons.unlock}</button>
          <button type="button" className="btn sm ghost danger" aria-label="מחיקת השכבה" onClick={() => setData((dd) => ({ ...patchEls(dd, idsOnLayer(dd, l.id), { layer: undefined }), layers: (dd.layers ?? []).filter((x) => x.id !== l.id).length ? (dd.layers ?? []).filter((x) => x.id !== l.id) : undefined }))}>{Icons.trash}</button>
        </div>
      ))}
      <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
        <button type="button" className="btn sm" onClick={() => setLayers([...layers, { id: `ly${Date.now().toString(36)}`, name: `שכבה ${layers.length + 1}`, visible: true, locked: false }])}>{Icons.plus} שכבה חדשה</button>
        {hidden.length > 0 && <button type="button" className="btn sm ghost" onClick={() => setData((dd) => patchEls(dd, hidden, { hidden: undefined }))}>{Icons.eye} הצגת אלמנטים מוסתרים ({hidden.length})</button>}
      </div>
    </div>
  );
}

function idsOnLayer(d: BuildingData, layer: string): string[] {
  return (['walls', 'openings', 'rooms', 'furniture', 'stairs', 'columns', 'beams', 'slabs', 'roofs', 'annotations', 'floorZones'] as const).flatMap((k) => ((d[k] ?? []) as { id: string; layer?: string }[]).filter((x) => x.layer === layer).map((x) => x.id));
}

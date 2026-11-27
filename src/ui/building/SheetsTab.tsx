// Submission sheets of a building project: an automatic first layout, items moved by dragging, each drawing at its
// own scale, and export to PDF / SVG / PNG / print at the exact paper size. Drawings are never shrunk to fit.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../../document/store';
import { uid } from '../../document/factory';
import type { Project } from '../../document/types';
import { exportPdf, exportSvg, printSheet, sheetToCanvas } from '../../drawing/exporters';
import { downloadBlob, safeFileName } from '../../storage/storage';
import { scaleLabel } from '../../drawing/page';
import { Check, Seg, toast, confirmDialog } from '../common';
import { Icons } from '../icons';
import { MField } from '../site/fields';
import { PLAN_KIND_LABELS, type BSheet, type BSheetItem, type BuildingData, type PlanKind, type SheetPaper } from '../../building/types';
import { buildModel, sortedLevels } from '../../building/model';
import { autoBSheet, bFitScale, bItemLabel, bItemSizeFor, bSheetArea, bSheetPaper, buildBSheet, B_SHEET_SCALES } from '../../building/render/sheet';
import { renderBSnapshot } from '../../building/three';
import { BModeToggle, BPanelAside } from './Panels';
import { bSectionTitle } from './SectionsTab';
import type { SetB } from './PlanEditor';

type BProject = Extract<Project, { type: 'building' }>;

const PNG_DPI: Record<SheetPaper, number> = { A4: 300, A3: 300, A2: 200, A1: 150 };

/** Cheap fingerprint of the model, to tell when a 3D picture on a sheet is out of date. */
export function bModelKey(d: BuildingData) {
  const s = JSON.stringify([d.levels.map((l) => [l.id, l.elevation, l.ceilingHeight, l.slabThickness, l.autoFloor, l.autoCeiling]), d.walls, d.openings, d.rooms, d.slabs, d.stairs, d.roofs, d.furniture, d.columns, d.beams, d.groundLevel]);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return `${s.length}-${h >>> 0}`;
}

export function bSnapshotFor(d: BuildingData, it: Extract<BSheetItem, { type: 'view3d' }>) {
  const px = (mm: number) => Math.round((mm / 25.4) * 200);
  const model = buildModel(d, 'proposed');
  return renderBSnapshot(d, model, it.view, Math.min(px(it.w), 3000), Math.min(px(it.h), 3000), { levels: null, roofs: true, ceilings: false, furniture: true }, it.view !== 'persp');
}

export function SheetsTab({ project, setData }: { project: BProject; setData: SetB }) {
  const d = project.data;
  const [cur, setCur] = useState<string | null>(d.sheets[0]?.id ?? null);
  const [selItem, setSelItem] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const sheet = d.sheets.find((s) => s.id === cur) ?? d.sheets[0] ?? null;
  const key = useMemo(() => bModelKey(d), [d]);
  const build = useMemo(() => (sheet ? buildBSheet(d, sheet, { screen: true, selected: selItem, demo: project.demo }) : null), [d, sheet, selItem, project.demo]);
  const setSheet = (patch: Partial<BSheet>, record = true) => sheet && setData((dd) => ({ ...dd, sheets: dd.sheets.map((s) => (s.id === sheet.id ? { ...s, ...patch } : s)) }), record);
  const setItem = (id: string, patch: Partial<BSheetItem>, record = true) => sheet && setData((dd) => ({ ...dd, sheets: dd.sheets.map((s) => (s.id === sheet.id ? { ...s, items: s.items.map((it) => (it.id === id ? ({ ...it, ...patch } as BSheetItem) : it)) } : s)) }), record);

  // A 3D picture that was never taken (for example on a demo sheet) is taken once, the first time the sheet is shown.
  useEffect(() => {
    if (!sheet) return;
    const pending = sheet.items.filter((it) => it.type === 'view3d' && !it.image && !it.imageKey);
    if (!pending.length) return;
    const t = window.setTimeout(() => {
      for (const it of pending) if (it.type === 'view3d') {
        const img = bSnapshotFor(d, it);
        setItem(it.id, { image: img, imageKey: img ? key : 'no-webgl' }, false);
      }
    }, 60);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet?.id]);

  const newSheet = (auto: boolean) => {
    const base = { id: uid(), name: `גיליון ${d.sheets.length + 1}`, paper: 'A2' as const, orientation: 'landscape' as const, blackWhite: false, frame: true, ruler: true };
    let s: BSheet = { ...base, items: [] };
    if (auto) {
      s = autoBSheet(d, base, uid, '');
      const v = s.items.find((x) => x.type === 'view3d');
      if (v && v.type === 'view3d') { v.image = bSnapshotFor(d, v); v.imageKey = key; }
    }
    setData((dd) => ({ ...dd, sheets: [...dd.sheets, s] }));
    setCur(s.id);
    setSelItem(null);
  };

  const levelId = (sortedLevels(d).find((l) => l.elevation >= -1) ?? sortedLevels(d)[0]).id;
  const addItem = (type: BSheetItem['type'], extra: Record<string, unknown> = {}) => {
    if (!sheet) return;
    const area = bSheetArea(sheet);
    const base = { id: uid(), x: area.x + 6, y: area.y + 6 };
    let it: BSheetItem;
    if (type === 'plan') {
      const probe: BSheetItem = { ...base, type: 'plan', scale: 1, levelId: String(extra.levelId ?? levelId), plan: (extra.plan as PlanKind) ?? 'plan', dims: true, title: '' };
      const z = bItemSizeFor(d, probe);
      it = { ...probe, scale: bFitScale(z.w, z.h - 14, area.w - 12, area.h - 12, 14) ?? 200 };
    } else if (type === 'section') {
      const probe: BSheetItem = { ...base, type: 'section', scale: 1, sectionId: String(extra.sectionId), title: '' };
      const z = bItemSizeFor(d, probe);
      it = { ...probe, scale: bFitScale(z.w, z.h - 8, area.w - 12, area.h - 12, 8) ?? 200 };
    } else if (type === 'view3d') {
      it = { ...base, type: 'view3d', w: 120, h: 80, view: 'iso', image: null, imageKey: '', title: 'מבט תלת־ממדי' };
      it.image = bSnapshotFor(d, it);
      it.imageKey = key;
      if (!it.image) toast('המכשיר לא תומך בתלת־ממד (WebGL), ולכן אין צילום של המודל.');
    } else if (type === 'legend') it = { ...base, type: 'legend', title: 'מקרא' };
    else if (type === 'north') it = { ...base, type: 'north', size: 16 };
    else if (type === 'text') it = { ...base, type: 'text', text: 'כותרת', size: 6, bold: true };
    else if (type === 'areas') it = { ...base, type: 'areas', title: 'טבלת שטחים' };
    else if (type === 'openings') it = { ...base, type: 'openings', title: '' };
    else it = { ...base, type: 'info' };
    setSheet({ items: [...sheet.items, it] });
    setSelItem(it.id);
  };

  // ---------- preview, with drag to move items ----------
  const wrap = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState({ w: 800, h: 600 });
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setAvail({ w: el.clientWidth - 32, h: el.clientHeight - 32 }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [sheet?.id]);
  const paper = sheet ? bSheetPaper(sheet) : { w: 594, h: 420 };
  const pk = Math.max(0.1, Math.min(avail.w / paper.w, avail.h / paper.h));
  const dragRef = useRef<{ id: string; sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);
  const toPaper = (e: React.PointerEvent) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); return { x: (e.clientX - r.left) / pk, y: (e.clientY - r.top) / pk }; };
  const onDown = (e: React.PointerEvent) => {
    if (!build || !sheet) return;
    const p = toPaper(e);
    const hit = [...sheet.items].reverse().find((it) => { const b = build.boxes.get(it.id)!; return p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h; });
    setSelItem(hit?.id ?? null);
    if (hit) { dragRef.current = { id: hit.id, sx: p.x, sy: p.y, ox: hit.x, oy: hit.y, moved: false }; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); }
  };
  const onMove = (e: React.PointerEvent) => {
    const dr = dragRef.current;
    if (!dr) return;
    const p = toPaper(e);
    const dx = p.x - dr.sx, dy = p.y - dr.sy;
    if (!dr.moved && Math.hypot(dx, dy) * pk < 3) return;
    if (!dr.moved) { dr.moved = true; useStore.getState().checkpoint(project.id); }
    setItem(dr.id, { x: Math.round((dr.ox + dx) * 2) / 2, y: Math.round((dr.oy + dy) * 2) / 2 }, false);
  };
  const onUp = () => { dragRef.current = null; };

  const baseName = `${project.name} - ${sheet?.name ?? 'גיליון'}`;
  const doExport = async (kind: 'pdf' | 'svg' | 'png' | 'print') => {
    if (!sheet) return;
    const clean = buildBSheet(d, sheet, { demo: project.demo });
    if (clean.problems.length && !(await confirmDialog('יש בעיות בגיליון', `${clean.problems.length} פריטים חורגים מהגיליון או חופפים. השרטוטים לא יוקטנו. להמשיך בכל זאת?`, 'המשך'))) return;
    setBusy(kind);
    try {
      if (kind === 'pdf') await exportPdf(clean.svg, clean.paper, baseName);
      else if (kind === 'svg') exportSvg(clean.svg, baseName);
      else if (kind === 'print') printSheet(clean.svg, clean.paper);
      else {
        const c = await sheetToCanvas(clean.svg, clean.paper, PNG_DPI[sheet.paper]);
        const blob: Blob = await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('PNG'))), 'image/png'));
        downloadBlob(blob, `${safeFileName(baseName)}.png`);
      }
    } catch (e) {
      console.error(e);
      toast('הייצוא נכשל. נסי שוב, או נסי פורמט אחר.');
    } finally { setBusy(null); }
  };

  const item = sheet?.items.find((x) => x.id === selItem) ?? null;
  const itemProblems = build?.problems.filter((p) => p.id === selItem) ?? [];
  const levels = sortedLevels(d).reverse();
  const planKinds: PlanKind[] = d.renovation ? ['plan', 'furniture', 'existing', 'demolition', 'proposed'] : ['plan', 'furniture'];

  return (
    <div className="workspace">
      <BPanelAside label="גיליונות הגשה">
        <BModeToggle />
        <div className="panel-section">
          <h3>{Icons.sheet} גיליונות הגשה</h3>
          <div className="row">
            <button className="btn sm primary" onClick={() => newSheet(true)}>{Icons.plus} גיליון אוטומטי</button>
            <button className="btn sm" onClick={() => newSheet(false)}>{Icons.plus} גיליון ריק</button>
          </div>
          {d.sheets.length > 0 && (
            <select className="input" value={sheet?.id ?? ''} onChange={(e) => { setCur(e.target.value); setSelItem(null); }} aria-label="בחירת גיליון">
              {d.sheets.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
        </div>
        {sheet && (
          <>
            <div className="panel-section">
              <label className="field"><span>שם הגיליון</span><input className="input" value={sheet.name} onChange={(e) => setSheet({ name: e.target.value })} aria-label="שם הגיליון" /></label>
              <div className="field"><span>גודל דף</span><Seg value={sheet.paper} options={(['A4', 'A3', 'A2', 'A1'] as const).map((p) => ({ v: p, label: p }))} onChange={(v) => setSheet({ paper: v })} ariaLabel="גודל דף" /></div>
              <Seg value={sheet.orientation} options={[{ v: 'landscape', label: 'לרוחב' }, { v: 'portrait', label: 'לאורך' }]} onChange={(v) => setSheet({ orientation: v })} ariaLabel="כיוון הדף" />
              <div className="row">
                <Check checked={sheet.blackWhite} onChange={(v) => setSheet({ blackWhite: v })}>שחור־לבן</Check>
                <Check checked={sheet.frame} onChange={(v) => setSheet({ frame: v })}>מסגרת</Check>
                <Check checked={sheet.ruler} onChange={(v) => setSheet({ ruler: v })}>סרגל 100 מ״מ</Check>
              </div>
              <button className="btn sm danger" onClick={async () => { if (await confirmDialog('מחיקת גיליון', `למחוק את "${sheet.name}"?`, 'מחיקה', true)) { setData((dd) => ({ ...dd, sheets: dd.sheets.filter((s) => s.id !== sheet.id) })); setCur(null); } }}>{Icons.trash} מחיקת הגיליון</button>
            </div>
            <div className="panel-section">
              <h3>הוספה לגיליון</h3>
              <div className="field">
                <span>תוכניות</span>
                {levels.map((l) => (
                  <div key={l.id} className="row" style={{ flexWrap: 'wrap' }}>
                    <span className="small" style={{ minWidth: 70 }}>{l.name}:</span>
                    {planKinds.map((k) => <button key={k} className="btn sm" onClick={() => addItem('plan', { levelId: l.id, plan: k })}>{PLAN_KIND_LABELS[k].replace('תוכנית ', '')}</button>)}
                  </div>
                ))}
              </div>
              {d.sections.length ? (
                <div className="field"><span>חתכים וחזיתות</span>
                  <div className="row" style={{ flexWrap: 'wrap' }}>{d.sections.map((s) => <button key={s.id} className="btn sm" onClick={() => addItem('section', { sectionId: s.id })}>{bSectionTitle(s)}</button>)}</div>
                </div>
              ) : <span className="small muted">אין עדיין חתכים או חזיתות. יוצרים אותם בלשונית "חתכים וחזיתות".</span>}
              <div className="row" style={{ flexWrap: 'wrap' }}>
                <button className="btn sm" onClick={() => addItem('view3d')}>מבט תלת־ממדי</button>
                <button className="btn sm" onClick={() => addItem('areas')}>טבלת שטחים</button>
                <button className="btn sm" onClick={() => addItem('openings')}>רשימת דלתות וחלונות</button>
                <button className="btn sm" onClick={() => addItem('legend')}>מקרא</button>
                <button className="btn sm" onClick={() => addItem('north')}>חץ צפון</button>
                <button className="btn sm" onClick={() => addItem('text')}>טקסט / כותרת</button>
                <button className="btn sm" onClick={() => addItem('info')}>פרטי הגשה</button>
              </div>
            </div>
            {item && (
              <div className="panel-section" data-testid="bsheet-item">
                <div className="row" style={{ justifyContent: 'space-between' }}><h3>{bItemLabel(d, item)}</h3><button className="btn ghost sm icon" aria-label="סגירה" onClick={() => setSelItem(null)}>{Icons.close}</button></div>
                {itemProblems.map((p, i) => <div key={i} className="notice danger">{Icons.warn}<span>{p.msg}</span></div>)}
                <div className="grid2">
                  <MField label="מיקום X בדף" kind="n" unit="מ״מ" value={item.x} onChange={(v) => setItem(item.id, { x: v })} />
                  <MField label="מיקום Y בדף" kind="n" unit="מ״מ" value={item.y} onChange={(v) => setItem(item.id, { y: v })} />
                </div>
                {(item.type === 'plan' || item.type === 'section') && (
                  <label className="field"><span>קנה מידה</span>
                    <select className="input" value={item.scale} onChange={(e) => setItem(item.id, { scale: Number(e.target.value) })} aria-label="קנה מידה">
                      {(B_SHEET_SCALES.includes(item.scale) ? B_SHEET_SCALES : [...B_SHEET_SCALES, item.scale].sort((a, b) => a - b)).map((sc) => <option key={sc} value={sc}>{scaleLabel(sc)}</option>)}
                    </select>
                  </label>
                )}
                {item.type === 'plan' && (
                  <>
                    <label className="field"><span>קומה</span><select className="input" value={item.levelId} onChange={(e) => setItem(item.id, { levelId: e.target.value })} aria-label="קומה">{levels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
                    <label className="field"><span>סוג התוכנית</span><select className="input" value={item.plan} onChange={(e) => setItem(item.id, { plan: e.target.value as PlanKind })} aria-label="סוג התוכנית">{planKinds.map((k) => <option key={k} value={k}>{PLAN_KIND_LABELS[k]}</option>)}</select></label>
                    <Check checked={item.dims} onChange={(v) => setItem(item.id, { dims: v })}>מידות כלליות של המבנה</Check>
                  </>
                )}
                {(item.type === 'plan' || item.type === 'section' || item.type === 'view3d' || item.type === 'legend' || item.type === 'areas' || item.type === 'openings') && (
                  <label className="field"><span>כותרת</span><input className="input" value={item.title} placeholder={bItemLabel(d, { ...item, title: '' } as BSheetItem)} onChange={(e) => setItem(item.id, { title: e.target.value })} aria-label="כותרת" /></label>
                )}
                {item.type === 'view3d' && (
                  <>
                    <div className="grid2">
                      <MField label="רוחב" kind="n" unit="מ״מ" value={item.w} min={20} onChange={(v) => setItem(item.id, { w: v })} />
                      <MField label="גובה" kind="n" unit="מ״מ" value={item.h} min={20} onChange={(v) => setItem(item.id, { h: v })} />
                    </div>
                    <Seg value={item.view} options={[{ v: 'iso', label: 'איזומטרי' }, { v: 'persp', label: 'פרספקטיבה' }]} onChange={(v) => setItem(item.id, { view: v })} ariaLabel="סוג המבט" />
                    {item.imageKey !== key && <div className="notice warn">{Icons.warn}<span>המודל השתנה מאז הצילום.</span></div>}
                    <button className="btn sm" onClick={() => { const img = bSnapshotFor(d, item); if (!img) toast('אין תמיכה בתלת־ממד במכשיר הזה.'); setItem(item.id, { image: img, imageKey: key }); }}>{Icons.camera} צילום מחדש מהמודל</button>
                  </>
                )}
                {item.type === 'text' && (
                  <>
                    <label className="field"><span>טקסט</span><input className="input" value={item.text} onChange={(e) => setItem(item.id, { text: e.target.value })} aria-label="טקסט" /></label>
                    <div className="grid2">
                      <MField label="גובה אותיות" kind="n" unit="מ״מ" value={item.size} min={1} max={60} onChange={(v) => setItem(item.id, { size: v })} />
                      <Check checked={item.bold} onChange={(v) => setItem(item.id, { bold: v })}>מודגש</Check>
                    </div>
                  </>
                )}
                {item.type === 'north' && <MField label="קוטר" kind="n" unit="מ״מ" value={item.size} min={6} max={80} onChange={(v) => setItem(item.id, { size: v })} />}
                {item.type === 'info' && <InfoFields d={d} setData={setData} />}
                <button className="btn sm danger" onClick={() => { setSheet({ items: sheet.items.filter((x) => x.id !== item.id) }); setSelItem(null); }}>{Icons.trash} הסרה מהגיליון</button>
              </div>
            )}
            {!item && (
              <div className="panel-section">
                <h3>פרטי ההגשה</h3>
                <InfoFields d={d} setData={setData} />
              </div>
            )}
            <div className="panel-section">
              <h3>ייצוא והדפסה</h3>
              {build && build.problems.length > 0 ? (
                <div className="notice danger" role="alert">{Icons.warn}<span>{build.problems.length} בעיות: {[...new Set(build.problems.map((p) => `${bItemLabel(d, sheet.items.find((x) => x.id === p.id)!)}: ${p.msg}`))].join(' · ')}</span></div>
              ) : <div className="notice ok">{Icons.check}<span>כל השרטוטים נכנסים לגיליון בקנה המידה שנבחר.</span></div>}
              <button className="btn primary" disabled={!!busy} onClick={() => doExport('pdf')}>{busy === 'pdf' ? 'מכין PDF…' : 'PDF'}</button>
              <div className="grid3">
                <button className="btn" disabled={!!busy} onClick={() => doExport('svg')}>SVG</button>
                <button className="btn" disabled={!!busy} onClick={() => doExport('png')}>{busy === 'png' ? '…' : 'PNG'}</button>
                <button className="btn" disabled={!!busy} onClick={() => doExport('print')} aria-label="הדפסה">{Icons.print}</button>
              </div>
              <span className="small muted">הגיליון יוצא בגודל {sheet.paper} מדויק. בהדפסה בחרי "גודל בפועל / 100%". PNG נשמר ב-{PNG_DPI[sheet.paper]} DPI.</span>
            </div>
          </>
        )}
      </BPanelAside>
      <section className="stage">
        {sheet && build ? (
          <div className="preview-wrap" ref={wrap}>
            <div className="preview-page sheet-page" style={{ width: paper.w * pk, height: paper.h * pk }} data-testid="bsheet-preview"
              onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>{build.svg}</div>
          </div>
        ) : (
          <div className="empty-stage"><div className="notice info">{Icons.info}<span>אין עדיין גיליונות. "גיליון אוטומטי" יוצר גיליון עם התוכניות, החתכים והחזיתות, מבט תלת־ממדי, מקרא, חץ צפון, טבלת שטחים, רשימת פתחים ופרטי הגשה. אפשר להזיז ולשנות כל פריט.</span></div></div>
        )}
      </section>
    </div>
  );
}

function InfoFields({ d, setData }: { d: BuildingData; setData: SetB }) {
  const f: { key: keyof BuildingData['info']; label: string }[] = [
    { key: 'projectTitle', label: 'שם הפרויקט' }, { key: 'student', label: 'שם הסטודנטית' }, { key: 'course', label: 'קורס' },
    { key: 'lecturer', label: 'מרצה' }, { key: 'institution', label: 'מוסד' }, { key: 'date', label: 'תאריך' }, { key: 'sheetNo', label: 'גיליון מס׳' },
  ];
  return (
    <div className="grid2">
      {f.map((x) => (
        <label key={x.key} className="field" style={x.key === 'projectTitle' ? { gridColumn: '1 / -1' } : undefined}><span>{x.label}</span>
          <input className="input" value={d.info[x.key]} onChange={(e) => setData((dd) => ({ ...dd, info: { ...dd.info, [x.key]: e.target.value } }))} aria-label={x.label} />
        </label>
      ))}
      <span className="small muted" style={{ gridColumn: '1 / -1' }}>הפרטים נשמרים רק במכשיר ובקובץ הפרויקט. שדה ריק נשאר ריק בגיליון.</span>
    </div>
  );
}

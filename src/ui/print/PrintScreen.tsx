import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { navigate } from '../../App';
import { useStore } from '../../document/store';
import type { PrintSettings, Project, TitleBlock } from '../../document/types';
import { buildSheet, projectParts, SCALES, scaleLabel, suggestScale } from '../../drawing/page';
import { exportPdf, exportPng, exportSvg, printSheet } from '../../drawing/exporters';
import { fmt } from '../../geometry/vec';
import { Check, Dialog, NumberField, Seg, toast } from '../common';
import { Icons } from '../icons';

const TB_FIELDS: { key: keyof TitleBlock; label: string }[] = [
  { key: 'title', label: 'כותרת' },
  { key: 'name', label: 'שם' },
  { key: 'className', label: 'כתה' },
  { key: 'date', label: 'תאריך' },
  { key: 'exerciseNo', label: "תרגיל מס'" },
  { key: 'submitter', label: 'המוסר' },
  { key: 'grade', label: 'ציון' },
  { key: 'sheetNo', label: "דף מס'" },
];

export function PrintScreen({ id }: { id: string }) {
  const project = useStore((s) => s.projects.find((p) => p.id === id));
  if (!project) {
    return <div className="home"><div className="home-inner"><div className="notice warn">הפרויקט לא נמצא.</div><button className="btn" onClick={() => navigate({ name: 'home' })}>חזרה</button></div></div>;
  }
  return <PrintInner project={project} />;
}

function PrintInner({ project }: { project: Project }) {
  const update = useStore((s) => s.update);
  const s = project.print;
  const [busy, setBusy] = useState<string | null>(null);
  const [calibOpen, setCalibOpen] = useState(false);
  const setPrint = (patch: Partial<PrintSettings>) => update(project.id, (p) => ({ ...p, print: { ...p.print, ...patch } }), false);
  const setTb = (patch: Partial<TitleBlock>) => update(project.id, (p) => ({ ...p, titleBlock: { ...p.titleBlock, ...patch } }), false);

  const sheet = useMemo(() => buildSheet(project, s), [project, s]);
  const parts = useMemo(() => projectParts(project, s).parts, [project, s]);
  const suggestion = useMemo(() => (sheet.layout.fits ? null : suggestScale(parts, s)), [sheet.layout.fits, parts, s]);
  const otherPaper = useMemo(() => {
    if (sheet.layout.fits) return null;
    const alts: { paper: PrintSettings['paper']; orientation: PrintSettings['orientation']; label: string }[] = [
      { paper: s.paper, orientation: s.orientation === 'portrait' ? 'landscape' : 'portrait', label: s.orientation === 'portrait' ? `${s.paper} לרוחב` : `${s.paper} לאורך` },
      { paper: 'A3', orientation: s.orientation, label: `A3 ${s.orientation === 'portrait' ? 'לאורך' : 'לרוחב'}` },
      { paper: 'A3', orientation: s.orientation === 'portrait' ? 'landscape' : 'portrait', label: `A3 ${s.orientation === 'portrait' ? 'לרוחב' : 'לאורך'}` },
    ];
    return alts.find((a) => (a.paper !== s.paper || a.orientation !== s.orientation) && buildSheet(project, { ...s, ...a }).layout.fits) ?? null;
  }, [sheet.layout.fits, project, s]);

  // Preview size: fit the page in the available area.
  const wrap = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState({ w: 600, h: 800 });
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setAvail({ w: el.clientWidth - 32, h: el.clientHeight - 32 }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const pk = Math.max(0.1, Math.min(avail.w / sheet.paper.w, avail.h / sheet.paper.h));

  const baseName = `${project.name}${project.titleBlock.exerciseNo ? ` - תרגיל ${project.titleBlock.exerciseNo}` : ''}`;
  const run = async (kind: string, fn: () => Promise<void> | void) => {
    if (sheet.empty) { toast(sheet.empty); return; }
    setBusy(kind);
    try {
      await fn();
    } catch (e) {
      console.error(e);
      toast('הייצוא נכשל. נסי שוב, או נסי פורמט אחר.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <header className="topbar">
        <button className="btn ghost icon" aria-label="חזרה לשרטוט" title="חזרה לשרטוט" onClick={() => navigate({ name: 'project', id: project.id })}>{Icons.back}</button>
        <span className="title">הדפסה וייצוא · {project.name}</span>
        <div className="spacer" />
      </header>
      <div className="workspace">
        <aside className="panel" aria-label="הגדרות הדפסה">
          <div className="panel-section">
            <h3>דף</h3>
            <div className="row">
              <Seg value={s.paper} options={[{ v: 'A4', label: 'A4' }, { v: 'A3', label: 'A3' }]} onChange={(v) => setPrint({ paper: v })} ariaLabel="גודל דף" />
              <Seg value={s.orientation} options={[{ v: 'portrait', label: 'לאורך' }, { v: 'landscape', label: 'לרוחב' }]} onChange={(v) => setPrint({ orientation: v })} ariaLabel="כיוון הדף" />
            </div>
            <label className="field"><span>קנה מידה</span>
              <select className="input" value={s.scale} onChange={(e) => setPrint({ scale: Number(e.target.value) })}>
                {(SCALES.includes(s.scale) ? SCALES : [...SCALES, s.scale].sort((a, b) => a - b)).map((sc) => <option key={sc} value={sc}>{scaleLabel(sc)}{sc === 1 ? ' (גודל אמיתי)' : ''}</option>)}
              </select>
            </label>
            {project.type === 'projections' && (
              <div className="field"><span>מה להדפיס</span>
                <Seg value={s.include ?? 'both'} options={[{ v: 'both', label: 'שניהם' }, { v: 'axonometric', label: 'אקסונומטרי' }, { v: 'epure', label: 'מערכת פרוסה' }]} onChange={(v) => setPrint({ include: v })} />
              </div>
            )}
            {project.type === 'drawing' && project.data.background && project.data.layout === 'overlay' && (
              <Check checked={!!s.printBackground} onChange={(v) => setPrint({ printBackground: v })}>הדפסת תמונת הרקע מתחת לשרטוט</Check>
            )}
            <Check checked={s.blackWhite} onChange={(v) => setPrint({ blackWhite: v })}>שחור-לבן</Check>
            <Check checked={s.frame} onChange={(v) => setPrint({ frame: v })}>מסגרת שרטוט וטבלת פרטים</Check>
            <Check checked={s.ruler} onChange={(v) => setPrint({ ruler: v })}>סרגל בדיקה 100 מ״מ</Check>
          </div>

          {sheet.empty ? (
            <div className="notice warn">{Icons.warn}<span>{sheet.empty}</span></div>
          ) : !sheet.layout.fits ? (
            <div className="notice danger" role="alert">{Icons.warn}<span>
              השרטוט לא נכנס לדף בקנה מידה {scaleLabel(s.scale)}: הוא צריך <span className="num">{fmt(sheet.layout.needW, 0)}×{fmt(sheet.layout.needH, 0)}</span> מ״מ, והשטח הפנוי הוא <span className="num">{fmt(sheet.layout.area.w, 0)}×{fmt(sheet.layout.area.h, 0)}</span> מ״מ. חלקים ממנו ייחתכו.
              <span className="row" style={{ marginTop: 8 }}>
                {suggestion && <button className="btn sm" onClick={() => setPrint({ scale: suggestion })}>מעבר ל-{scaleLabel(suggestion)}</button>}
                {otherPaper && <button className="btn sm" onClick={() => setPrint({ paper: otherPaper.paper, orientation: otherPaper.orientation })}>מעבר ל-{otherPaper.label}</button>}
              </span>
            </span></div>
          ) : (
            <div className="notice ok">{Icons.check}<span>השרטוט נכנס לדף. גודל על הנייר: <span className="num">{fmt(sheet.layout.needW, 0)}×{fmt(sheet.layout.needH, 0)}</span> מ״מ.</span></div>
          )}

          <div className="panel-section">
            <h3>הדפסה ושמירה</h3>
            <button className="btn primary" disabled={!!busy} onClick={() => run('print', () => printSheet(sheet.svg, sheet.paper))}>{Icons.print} הדפסה</button>
            <div className="notice info">{Icons.info}<span>בחלון ההדפסה בחרי <b>גודל בפועל / 100%</b> (ולא "התאמה לדף"), וגודל נייר {s.paper}. לבדיקה, מדדי בסרגל את קו הבדיקה: הוא צריך להיות 100 מ״מ בדיוק.</span></div>
            <div className="grid3">
              <button className="btn" disabled={!!busy} onClick={() => run('pdf', () => exportPdf(sheet.svg, sheet.paper, baseName))}>{busy === 'pdf' ? '…' : 'PDF'}</button>
              <button className="btn" disabled={!!busy} onClick={() => run('svg', () => exportSvg(sheet.svg, baseName))}>SVG</button>
              <button className="btn" disabled={!!busy} onClick={() => run('png', () => exportPng(sheet.svg, sheet.paper, baseName))}>{busy === 'png' ? '…' : 'PNG'}</button>
            </div>
            <span className="small muted">PDF מומלץ להדפסה מדויקת. PNG נשמר ברזולוציה של 300 DPI.</span>
            <button className="btn ghost sm" onClick={() => setCalibOpen(true)}>{Icons.ruler} המדפסת מדפיסה קצת קטן או גדול?</button>
            {s.printerCorrection !== 1 && <div className="notice warn">{Icons.info}<span>מופעל תיקון מדפסת: פי <span className="num">{fmt(s.printerCorrection, 4)}</span>. <button className="btn sm" onClick={() => setPrint({ printerCorrection: 1 })}>ביטול התיקון</button></span></div>}
          </div>

          {s.frame && (
            <div className="panel-section">
              <h3>טבלת פרטים</h3>
              <div className="grid2">
                {TB_FIELDS.map((f) => (
                  <label key={f.key} className="field" style={f.key === 'title' ? { gridColumn: '1 / -1' } : undefined}><span>{f.label}</span>
                    <input className="input" value={project.titleBlock[f.key]} onChange={(e) => setTb({ [f.key]: e.target.value })} />
                  </label>
                ))}
              </div>
              <span className="small muted">קנה המידה ממולא אוטומטית. שדה ריק נשאר ריק בדף.</span>
            </div>
          )}
        </aside>
        <section className="stage">
          <div className="preview-wrap" ref={wrap}>
            <div className="preview-page" style={{ width: sheet.paper.w * pk, height: sheet.paper.h * pk }} data-testid="print-preview">{sheet.svg}</div>
          </div>
        </section>
      </div>
      {calibOpen && <PrinterCalibration current={s.printerCorrection} onClose={() => setCalibOpen(false)} onSave={(f) => { setPrint({ printerCorrection: f }); setCalibOpen(false); toast('תיקון המדפסת נשמר לפרויקט הזה'); }} />}
    </>
  );
}

function PrinterCalibration({ current, onClose, onSave }: { current: number; onClose: () => void; onSave: (f: number) => void }) {
  const [measured, setMeasured] = useState<number | null>(null);
  const ok = measured !== null && measured > 80 && measured < 120;
  return (
    <Dialog title="תיקון גודל הדפסה" onClose={onClose}>
      <p style={{ margin: 0 }}>הדפיסי דף עם סרגל הבדיקה בגודל בפועל (100%), ומדדי בסרגל אמיתי את הקו שאמור להיות 100 מ״מ. כמה יצא?</p>
      <NumberField label="האורך שמדדת" unit="מ״מ" value={measured} onChange={setMeasured} placeholder="למשל 99.5" />
      {measured !== null && !ok && <span className="small" style={{ color: 'var(--danger)' }}>הערך צריך להיות בין 80 ל-120 מ״מ. ערך רחוק כל כך בדרך כלל אומר שנבחרה "התאמה לדף".</span>}
      {ok && <div className="notice info">{Icons.info}<span>הדף יוגדל פי <span className="num">{fmt((100 / measured!) * current, 4)}</span> כדי לפצות על המדפסת. אחרי ההדפסה הבאה כדאי למדוד שוב.</span></div>}
      <div className="btns">
        <button className="btn primary" disabled={!ok} onClick={() => onSave((100 / measured!) * current)}>שמירת התיקון</button>
        <button className="btn" onClick={onClose}>ביטול</button>
      </div>
    </Dialog>
  );
}

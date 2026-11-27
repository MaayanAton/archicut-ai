import { useRef, useState } from 'react';
import { navigate } from '../App';
import { useStore } from '../document/store';
import { PROJECT_TYPE_LABELS, type Project, type ProjectType } from '../document/types';
import { exportProjectsToFile, ImportError, parseProjectFile } from '../storage/storage';
import { confirmDialog, Dialog, fmtDate, NumberField, toast } from './common';
import { Icons, Logo } from './icons';
import { fileToImages, UploadError, type LoadedImage } from './imageTools';
import { ProjectThumb } from './thumbs';

export const ACCEPT_UPLOAD = '.jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf';

/** Create a drawing project with the uploaded image (or PDF page) beside the drawing. */
export function createImageProject(file: File, image: LoadedImage, page: number, pageCount: number): string {
  const base = file.name.replace(/\.[^.]+$/, '') || 'תרגיל מתמונה';
  const name = pageCount > 1 ? `${base} – עמוד ${page}` : base;
  return useStore.getState().create('drawing', name, (p) => {
    if (p.type !== 'drawing') return p;
    return {
      ...p,
      data: {
        ...p.data,
        layout: 'side',
        grid: { size: 10, show: false, snap: false },
        background: { dataUrl: image.dataUrl, pxW: image.w, pxH: image.h, mmPerPx: null, calibration: null, opacity: 0.85, visible: true, sourceName: pageCount > 1 ? `${file.name} (עמוד ${page})` : file.name },
      },
    };
  });
}

const uploadErrorText = (e: unknown) => {
  if (!(e instanceof UploadError)) console.error(e);
  return e instanceof UploadError ? e.message : 'אירעה שגיאה בטעינת הקובץ.';
};

const TYPE_CHOICES: { type: ProjectType; icon: keyof typeof Icons; desc: string }[] = [
  { type: 'projections', icon: 'axes', desc: 'נקודות במרחב, היטלים על π1, π2, π3, תצוגה אקסונומטרית ומערכת פרוסה' },
  { type: 'section', icon: 'section', desc: 'קובייה, תיבה, גליל, חרוט, פירמידה או מנסרה, ומישור חיתוך במידות מדויקות' },
  { type: 'drawing', icon: 'pencil', desc: 'שרטוט דו-ממדי עם קווים, צורות, טקסט וקווי מידות' },
  { type: 'site', icon: 'tree', desc: 'מגרש, שבילים, צמחייה, ריהוט ומבנים, טופוגרפיה, מודל תלת־ממדי, חתכים וגיליונות הגשה' },
];

export function Home() {
  const projects = useStore((s) => s.projects);
  const storageError = useStore((s) => s.storageError);
  const [newOpen, setNewOpen] = useState(false);
  const [openOpen, setOpenOpen] = useState(false);
  const [renaming, setRenaming] = useState<Project | null>(null);
  const [busy, setBusy] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);

  const [pdfPick, setPdfPick] = useState<{ file: File; count: number; first: LoadedImage; page: number | null } | null>(null);

  const onUpload = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    try {
      const { image, pageCount } = await fileToImages(f, 1);
      if (pageCount > 1) setPdfPick({ file: f, count: pageCount, first: image, page: 1 });
      else navigate({ name: 'project', id: createImageProject(f, image, 1, 1) });
    } catch (e) {
      toast(uploadErrorText(e));
    } finally {
      setBusy(false);
    }
  };

  const loadPdfPage = async () => {
    if (!pdfPick || !pdfPick.page) return;
    const { file, count, first, page } = pdfPick;
    setBusy(true);
    try {
      const image = page === 1 ? first : (await fileToImages(file, page)).image;
      setPdfPick(null);
      navigate({ name: 'project', id: createImageProject(file, image, page, count) });
    } catch (e) {
      toast(uploadErrorText(e));
    } finally {
      setBusy(false);
    }
  };

  const onImport = async (f: File | undefined) => {
    if (!f) return;
    try {
      const list = parseProjectFile(await f.text());
      const n = useStore.getState().importProjects(list);
      toast(n === 1 ? 'הפרויקט יובא בהצלחה' : `${n} פרויקטים יובאו בהצלחה`);
      setOpenOpen(false);
    } catch (e) {
      toast(e instanceof ImportError ? e.message : 'לא ניתן לייבא את הקובץ.');
    }
  };

  const create = (type: ProjectType) => {
    const n = projects.filter((p) => p.type === type && !p.demo).length + 1;
    const id = useStore.getState().create(type, `${PROJECT_TYPE_LABELS[type]} ${n}`);
    setNewOpen(false);
    navigate({ name: 'project', id });
  };

  const remove = async (p: Project) => {
    if (await confirmDialog('מחיקת פרויקט', `למחוק את "${p.name}"? אי אפשר לשחזר את הפרויקט אחרי המחיקה (אלא מקובץ גיבוי).`, 'מחיקה', true)) {
      await useStore.getState().remove(p.id);
      toast('הפרויקט נמחק');
    }
  };

  return (
    <>
      <header className="topbar">
        <div className="brand"><Logo /> ArchiCut AI</div>
        <div className="spacer" />
        <button className="btn ghost" onClick={() => projects.length ? exportProjectsToFile(projects, `ArchiCut-גיבוי-${new Date().toISOString().slice(0, 10)}`) : toast('אין פרויקטים לגיבוי')}>
          {Icons.download}<span className="hide-mobile">גיבוי כל הפרויקטים</span>
        </button>
      </header>
      <main className="home">
        <div className="home-inner">
          <div className="hero">
            <h1>שלום, מה נשרטט היום?</h1>
            <p>שרטוט מדויק, היטלים, חתכים והדפסה בקנה מידה אמיתי.</p>
          </div>
          {storageError && <div className="notice warn" style={{ marginTop: 16 }}>{Icons.warn}<span>{storageError}</span></div>}

          <div className="actions3">
            <button className="action-card" onClick={() => uploadRef.current?.click()} disabled={busy}>
              <div className="ic">{Icons.upload}</div>
              <div><strong>{busy ? 'טוען קובץ…' : 'העלאת תמונה או תרגיל'}</strong><span>קובץ JPG, PNG או PDF. אפשר לשרטט מעליו או לצידו</span></div>
            </button>
            <button className="action-card" onClick={() => setNewOpen(true)}>
              <div className="ic">{Icons.plus}</div>
              <div><strong>שרטוט חדש</strong><span>היטלים, גוף וחתך, שרטוט חופשי או תכנון מתחם</span></div>
            </button>
            <button className="action-card" onClick={() => setOpenOpen(true)}>
              <div className="ic">{Icons.folder}</div>
              <div><strong>פתיחת פרויקט קיים</strong><span>מהרשימה או מקובץ גיבוי</span></div>
            </button>
          </div>
          <input ref={uploadRef} type="file" accept={ACCEPT_UPLOAD} hidden onChange={(e) => { onUpload(e.target.files?.[0]); e.target.value = ''; }} />
          <input ref={importRef} type="file" accept=".archicut,application/json" hidden onChange={(e) => { onImport(e.target.files?.[0]); e.target.value = ''; }} />

          <div className="section-head">
            <h2>הפרויקטים שלי</h2>
            <div className="row">
              <button className="btn sm" onClick={() => importRef.current?.click()}>{Icons.upload} ייבוא קובץ פרויקט</button>
              {!projects.some((p) => p.demo) && <button className="btn sm" onClick={() => useStore.getState().addDemos()}>{Icons.plus} הוספת פרויקטי הדגמה</button>}
            </div>
          </div>
          {projects.length === 0 ? (
            <div className="notice info">{Icons.info}<span>עדיין אין פרויקטים. אפשר להתחיל באחת הפעולות למעלה.</span></div>
          ) : (
            <ProjectGrid projects={projects} onRename={setRenaming} onRemove={remove} />
          )}
        </div>
      </main>

      {newOpen && (
        <Dialog title="שרטוט חדש" onClose={() => setNewOpen(false)}>
          <div className="choice-list">
            {TYPE_CHOICES.map((c) => (
              <button key={c.type} className="choice" onClick={() => create(c.type)}>
                <div className="ic">{Icons[c.icon]}</div>
                <div><strong>{PROJECT_TYPE_LABELS[c.type]}</strong><span>{c.desc}</span></div>
              </button>
            ))}
          </div>
        </Dialog>
      )}

      {openOpen && (
        <Dialog title="פתיחת פרויקט קיים" onClose={() => setOpenOpen(false)}>
          <button className="btn" onClick={() => importRef.current?.click()}>{Icons.upload} פתיחה מקובץ גיבוי (.archicut)</button>
          {projects.length === 0 ? <p className="muted">אין פרויקטים שמורים במכשיר הזה.</p> : (
            <div className="choice-list">
              {projects.map((p) => (
                <button key={p.id} className="choice" onClick={() => navigate({ name: 'project', id: p.id })}>
                  <div className="ic">{Icons[TYPE_CHOICES.find((c) => c.type === p.type)!.icon]}</div>
                  <div><strong>{p.name}</strong><span>{PROJECT_TYPE_LABELS[p.type]} · עודכן {fmtDate(p.updatedAt)}</span></div>
                </button>
              ))}
            </div>
          )}
        </Dialog>
      )}

      {renaming && <RenameDialog project={renaming} onClose={() => setRenaming(null)} />}

      {pdfPick && (
        <Dialog title="איזה עמוד לטעון?" onClose={() => setPdfPick(null)}>
          <p style={{ margin: 0 }}>בקובץ "{pdfPick.file.name}" יש {pdfPick.count} עמודים. בחרי את העמוד של התרגיל.</p>
          <NumberField label={`מספר עמוד (1 עד ${pdfPick.count})`} value={pdfPick.page} min={1} max={pdfPick.count}
            onChange={(v) => setPdfPick({ ...pdfPick, page: v !== null && Number.isInteger(v) && v >= 1 && v <= pdfPick.count ? v : null })} />
          {pdfPick.page === 1 && <img src={pdfPick.first.dataUrl} alt="עמוד 1" style={{ maxHeight: 240, objectFit: 'contain', border: '1px solid var(--line)', borderRadius: 8 }} />}
          <div className="small muted">כדי לעבוד על עמוד נוסף, אפשר להעלות את אותו קובץ שוב ולבחור עמוד אחר.</div>
          <div className="btns">
            <button className="btn primary" disabled={!pdfPick.page || busy} onClick={loadPdfPage}>{busy ? 'טוען…' : 'טעינת העמוד'}</button>
            <button className="btn" onClick={() => setPdfPick(null)}>ביטול</button>
          </div>
        </Dialog>
      )}
    </>
  );
}

function ProjectGrid({ projects, onRename, onRemove }: { projects: Project[]; onRename: (p: Project) => void; onRemove: (p: Project) => void }) {
  return (
    <div className="proj-grid">
      {projects.map((p) => (
        <article key={p.id} className="proj-card">
          <div className="thumb" onClick={() => navigate({ name: 'project', id: p.id })} role="button" aria-label={`פתיחת ${p.name}`}>
            <ProjectThumb project={p} />
          </div>
          <div className="body">
            <div className="name" onClick={() => navigate({ name: 'project', id: p.id })} title={p.name}>{p.name}</div>
            <div className="meta">
              <span>{PROJECT_TYPE_LABELS[p.type]}</span>·<span>{fmtDate(p.updatedAt)}</span>
              {p.demo && <span className="badge">הדגמה</span>}
            </div>
          </div>
          <div className="tools">
            <button className="btn sm ghost icon" title="שינוי שם" aria-label="שינוי שם" onClick={() => onRename(p)}>{Icons.edit}</button>
            <button className="btn sm ghost icon" title="שכפול" aria-label="שכפול" onClick={() => { useStore.getState().duplicate(p.id); toast('נוצר עותק של הפרויקט'); }}>{Icons.copy}</button>
            <button className="btn sm ghost icon" title="ייצוא קובץ פרויקט" aria-label="ייצוא קובץ פרויקט" onClick={() => exportProjectsToFile([p], p.name)}>{Icons.download}</button>
            <button className="btn sm ghost icon danger" title="מחיקה" aria-label="מחיקה" onClick={() => onRemove(p)}>{Icons.trash}</button>
          </div>
        </article>
      ))}
    </div>
  );
}

export function RenameDialog({ project, onClose }: { project: Project; onClose: () => void }) {
  const [name, setName] = useState(project.name);
  const ok = name.trim().length > 0;
  const save = () => {
    if (!ok) return;
    useStore.getState().rename(project.id, name);
    onClose();
  };
  return (
    <Dialog title="שינוי שם הפרויקט" onClose={onClose}>
      <input className={`input ${ok ? '' : 'invalid'}`} value={name} autoFocus onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} aria-label="שם הפרויקט" />
      {!ok && <span className="small" style={{ color: 'var(--danger)' }}>השם לא יכול להיות ריק</span>}
      <div className="btns">
        <button className="btn primary" disabled={!ok} onClick={save}>שמירה</button>
        <button className="btn" onClick={onClose}>ביטול</button>
      </div>
    </Dialog>
  );
}

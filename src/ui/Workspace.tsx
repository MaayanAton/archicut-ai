import { useEffect, useState } from 'react';
import { navigate } from '../App';
import { canRedo, canUndo, useStore } from '../document/store';
import { exportProjectsToFile } from '../storage/storage';
import { Icons } from './icons';
import { RenameDialog } from './Home';
import { ProjectionsView } from './projections/ProjectionsView';
import { SectionView } from './section/SectionView';
import { DrawingView } from './drawing/DrawingView';
import { SiteView } from './site/SiteView';
import { BuildingView } from './building/BuildingView';

export function Workspace({ id }: { id: string }) {
  const project = useStore((s) => s.projects.find((p) => p.id === id));
  const undoable = useStore((s) => canUndo(s, id));
  const redoable = useStore((s) => canRedo(s, id));
  const saveState = useStore((s) => s.saveState);
  const [renaming, setRenaming] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) useStore.getState().redo(id);
        else useStore.getState().undo(id);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        useStore.getState().redo(id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [id]);

  if (!project) {
    return (
      <div className="home"><div className="home-inner">
        <div className="notice warn">{Icons.warn}<span>הפרויקט לא נמצא. ייתכן שנמחק.</span></div>
        <p><button className="btn primary" onClick={() => navigate({ name: 'home' })}>חזרה למסך הבית</button></p>
      </div></div>
    );
  }

  return (
    <>
      <header className="topbar">
        <button className="btn ghost icon" aria-label="חזרה למסך הבית" title="מסך הבית" onClick={() => navigate({ name: 'home' })}>{Icons.home}</button>
        <button className="btn ghost" style={{ minWidth: 0, padding: '0 8px' }} onClick={() => setRenaming(true)} title="שינוי שם">
          <span className="title">{project.name}</span>
        </button>
        {project.demo && <span className="badge hide-mobile">הדגמה</span>}
        <span className={`save-state hide-mobile ${saveState === 'error' ? 'error' : ''}`}>
          {saveState === 'saving' ? 'שומר…' : saveState === 'error' ? 'שגיאה בשמירה' : 'נשמר במכשיר'}
        </span>
        <div className="spacer" />
        <button className="btn ghost icon" aria-label="ביטול פעולה" title="ביטול (Ctrl+Z)" disabled={!undoable} onClick={() => useStore.getState().undo(id)}>{Icons.undo}</button>
        <button className="btn ghost icon" aria-label="שחזור פעולה" title="שחזור (Ctrl+Y)" disabled={!redoable} onClick={() => useStore.getState().redo(id)}>{Icons.redo}</button>
        <button className="btn ghost icon" aria-label="שמירת קובץ פרויקט לגיבוי" title="שמירת קובץ פרויקט לגיבוי" onClick={() => exportProjectsToFile([project], project.name)}>{Icons.download}</button>
        <button className="btn primary" onClick={() => navigate({ name: 'print', id })}>{Icons.print}<span className="hide-mobile">{project.type === 'site' ? 'הדפסת תוכנית' : 'הדפסה וייצוא'}</span></button>
      </header>
      {project.type === 'projections' && <ProjectionsView project={project} />}
      {project.type === 'section' && <SectionView project={project} />}
      {project.type === 'drawing' && <DrawingView project={project} />}
      {project.type === 'site' && <SiteView project={project} />}
      {project.type === 'building' && <BuildingView project={project} />}
      {renaming && <RenameDialog project={project} onClose={() => setRenaming(false)} />}
    </>
  );
}

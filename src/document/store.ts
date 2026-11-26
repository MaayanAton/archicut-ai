// Application state: projects, current project, undo/redo history, autosave.

import { create } from 'zustand';
import type { Project, ProjectType } from './types';
import { demoProjects, newProject, uid } from './factory';
import * as storage from '../storage/storage';

const HISTORY_LIMIT = 150;

type SaveState = 'saved' | 'saving' | 'error';

interface State {
  loaded: boolean;
  storageError: string | null;
  projects: Project[];
  past: Project[];
  future: Project[];
  historyFor: string | null;
  saveState: SaveState;

  init(): Promise<void>;
  get(id: string): Project | undefined;
  create(type: ProjectType, name: string, init?: (p: Project) => Project): string;
  /** Change a project. record=false is used while dragging, after a checkpoint. */
  update(id: string, fn: (p: Project) => Project, record?: boolean): void;
  checkpoint(id: string): void;
  undo(id: string): void;
  redo(id: string): void;
  rename(id: string, name: string): void;
  duplicate(id: string): string | null;
  remove(id: string): Promise<void>;
  importProjects(list: Project[]): number;
  addDemos(): Promise<void>;
}

const dirty = new Set<string>();
let saveTimer: ReturnType<typeof setTimeout> | null = null;

let flushSave: () => Promise<void> = async () => {};

/** Keystrokes in the same text field within a short time form one undo step (typing "125" is one change). */
let lastTyping: { el: Element | null; t: number } = { el: null, t: 0 };
function continuesTyping() {
  if (typeof document === 'undefined') return false;
  const el = document.activeElement;
  const typing = !!el && el.tagName === 'INPUT' && (el as HTMLInputElement).type !== 'range' && (el as HTMLInputElement).type !== 'checkbox';
  const now = Date.now();
  const same = typing && lastTyping.el === el && now - lastTyping.t < 1500;
  lastTyping = { el: typing ? el : null, t: now };
  return same;
}

export const useStore = create<State>((set, get) => {
  const runSave = async () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = null;
    const ids = [...dirty];
    dirty.clear();
    if (!ids.length) return;
    try {
      for (const pid of ids) {
        const p = get().projects.find((x) => x.id === pid);
        if (p) await storage.saveProject(p);
      }
      set({ saveState: dirty.size ? 'saving' : 'saved' });
    } catch (e) {
      console.error(e);
      set({ saveState: 'error' });
    }
  };
  flushSave = runSave;
  const scheduleSave = (id: string) => {
    dirty.add(id);
    set({ saveState: 'saving' });
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(runSave, 150);
  };

  const replace = (p: Project) => set({ projects: get().projects.map((x) => (x.id === p.id ? p : x)) });

  const resetHistoryIfNeeded = (id: string) => {
    if (get().historyFor !== id) set({ past: [], future: [], historyFor: id });
  };

  return {
    loaded: false,
    storageError: null,
    projects: [],
    past: [],
    future: [],
    historyFor: null,
    saveState: 'saved',

    async init() {
      try {
        let projects = await storage.loadAllProjects();
        const seeded = await storage.getMeta('seeded');
        if (!projects.length && !seeded) {
          const demos = demoProjects();
          for (const p of demos) await storage.saveProject(p);
          await storage.setMeta('seeded', true);
          projects = await storage.loadAllProjects();
        }
        set({ projects, loaded: true });
      } catch (e) {
        console.error(e);
        set({
          loaded: true,
          projects: [...demoProjects()],
          storageError: 'הדפדפן לא מאפשר שמירה מקומית (אולי חלון גלישה בסתר). אפשר לעבוד, אבל העבודה לא תישמר. מומלץ לייצא קובץ פרויקט לגיבוי.',
        });
      }
    },

    get: (id) => get().projects.find((p) => p.id === id),

    create(type, name, init) {
      let p = newProject(type, name);
      if (init) p = init(p);
      set({ projects: [p, ...get().projects] });
      scheduleSave(p.id);
      return p.id;
    },

    checkpoint(id) {
      const cur = get().get(id);
      if (!cur) return;
      resetHistoryIfNeeded(id);
      set({ past: [...get().past, cur].slice(-HISTORY_LIMIT), future: [] });
    },

    update(id, fn, record = true) {
      const cur = get().get(id);
      if (!cur) return;
      if (record && !continuesTyping()) get().checkpoint(id);
      const next = { ...fn(cur), updatedAt: Date.now() };
      replace(next);
      scheduleSave(id);
    },

    undo(id) {
      resetHistoryIfNeeded(id);
      const { past, future } = get();
      const cur = get().get(id);
      if (!past.length || !cur) return;
      const prev = past[past.length - 1];
      set({ past: past.slice(0, -1), future: [cur, ...future] });
      replace({ ...prev, updatedAt: Date.now() });
      scheduleSave(id);
    },

    redo(id) {
      resetHistoryIfNeeded(id);
      const { past, future } = get();
      const cur = get().get(id);
      if (!future.length || !cur) return;
      const next = future[0];
      set({ past: [...past, cur], future: future.slice(1) });
      replace({ ...next, updatedAt: Date.now() });
      scheduleSave(id);
    },

    rename(id, name) {
      const trimmed = name.trim();
      if (!trimmed) return;
      get().update(id, (p) => ({ ...p, name: trimmed }), false);
    },

    duplicate(id) {
      const p = get().get(id);
      if (!p) return null;
      const copy = { ...structuredClone(p), id: uid(), name: `${p.name} (עותק)`, createdAt: Date.now(), updatedAt: Date.now() } as Project;
      set({ projects: [copy, ...get().projects] });
      scheduleSave(copy.id);
      return copy.id;
    },

    async remove(id) {
      set({ projects: get().projects.filter((p) => p.id !== id) });
      dirty.delete(id);
      try {
        await storage.deleteProject(id);
      } catch (e) {
        console.error(e);
        set({ saveState: 'error' });
      }
    },

    importProjects(list) {
      const existing = new Set(get().projects.map((p) => p.id));
      const added = list.map((p) => (existing.has(p.id) ? { ...p, id: uid(), name: `${p.name} (מיובא)` } : p));
      set({ projects: [...added, ...get().projects] });
      added.forEach((p) => scheduleSave(p.id));
      return added.length;
    },

    async addDemos() {
      const demos = demoProjects();
      set({ projects: [...demos, ...get().projects] });
      demos.forEach((p) => scheduleSave(p.id));
    },
  };
});

export const canUndo = (s: State, id: string) => s.historyFor === id && s.past.length > 0;
export const canRedo = (s: State, id: string) => s.historyFor === id && s.future.length > 0;

// Save at once when the page is hidden or closed, so the last change is never lost.
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => void flushSave());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flushSave();
  });
}

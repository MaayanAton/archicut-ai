// Local project storage (IndexedDB in the browser) and project file import/export.
// Nothing here talks to a server.

import { createStore, del, entries, get, set } from 'idb-keyval';
import { FILE_VERSION, type Project, type ProjectFile } from '../document/types';
import { migrateSite, SiteDataError } from '../site/migrate';

let store: ReturnType<typeof createStore> | null = null;
const db = () => (store ??= createStore('archicut-ai', 'projects'));

export async function loadAllProjects(): Promise<Project[]> {
  const all = await entries<string, Project>(db());
  return all.map(([, p]) => p).filter(isProject).map(migrateProject).filter((p): p is Project => !!p).sort((a, b) => b.updatedAt - a.updatedAt);
}

export const loadProject = (id: string) => get<Project>(id, db());
export const saveProject = (p: Project) => set(p.id, p, db());
export const deleteProject = (id: string) => del(id, db());

export async function getMeta(key: string): Promise<unknown> {
  return get(`meta:${key}`, db());
}
export async function setMeta(key: string, value: unknown) {
  return set(`meta:${key}`, value, db());
}

export function isProject(x: unknown): x is Project {
  if (!x || typeof x !== 'object') return false;
  const p = x as Record<string, unknown>;
  return (
    typeof p.id === 'string' && typeof p.name === 'string' &&
    (p.type === 'projections' || p.type === 'section' || p.type === 'drawing' || p.type === 'site') &&
    !!p.data && typeof p.data === 'object' && !!p.titleBlock && !!p.print
  );
}

export function makeProjectFile(projects: Project[]): ProjectFile {
  // Files without site projects stay at version 1, so the previous version of the app can still open them.
  const version = projects.some((p) => p.type === 'site') ? FILE_VERSION : 1;
  return { app: 'ArchiCut AI', version, exportedAt: new Date().toISOString(), projects };
}

/** Brings a stored or imported project up to date. Returns null for data that cannot be used. */
export function migrateProject(p: Project): Project | null {
  if (p.type !== 'site') return p;
  try {
    const { data } = migrateSite(p.data);
    return { ...p, data };
  } catch (e) {
    if (e instanceof SiteDataError) return null;
    throw e;
  }
}

export class ImportError extends Error {}

/** Parses a .archicut file. Throws ImportError with a Hebrew message on any problem. */
export function parseProjectFile(text: string): Project[] {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ImportError('הקובץ אינו קובץ פרויקט תקין של ArchiCut AI (לא ניתן לקרוא אותו).');
  }
  const f = json as Partial<ProjectFile>;
  if (!f || f.app !== 'ArchiCut AI' || !Array.isArray(f.projects))
    throw new ImportError('הקובץ אינו קובץ פרויקט של ArchiCut AI.');
  if (typeof f.version !== 'number' || f.version > FILE_VERSION)
    throw new ImportError('הקובץ נוצר בגרסה חדשה יותר של האפליקציה ואי אפשר לפתוח אותו כאן.');
  let newer = false;
  const valid = f.projects.filter(isProject).map((p) => {
    const m = migrateProject(p);
    if (!m) newer = true;
    return m;
  }).filter((p): p is Project => !!p);
  if (!valid.length && newer) throw new ImportError('הפרויקט בקובץ נוצר בגרסה חדשה יותר של האפליקציה ואי אפשר לפתוח אותו כאן.');
  if (!valid.length) throw new ImportError('לא נמצאו פרויקטים תקינים בקובץ.');
  return valid;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export const safeFileName = (s: string) => (s.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'project').slice(0, 80);

export function exportProjectsToFile(projects: Project[], filename: string) {
  const blob = new Blob([JSON.stringify(makeProjectFile(projects))], { type: 'application/json' });
  downloadBlob(blob, `${safeFileName(filename)}.archicut`);
}

// Local project storage (IndexedDB in the browser) and project file import/export.
// Nothing here talks to a server.

import { createStore, del, entries, get, set } from 'idb-keyval';
import { FILE_VERSION, type Project, type ProjectFile } from '../document/types';

let store: ReturnType<typeof createStore> | null = null;
const db = () => (store ??= createStore('archicut-ai', 'projects'));

export async function loadAllProjects(): Promise<Project[]> {
  const all = await entries<string, Project>(db());
  return all.map(([, p]) => p).filter(isProject).sort((a, b) => b.updatedAt - a.updatedAt);
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
    (p.type === 'projections' || p.type === 'section' || p.type === 'drawing') &&
    !!p.data && typeof p.data === 'object' && !!p.titleBlock && !!p.print
  );
}

export function makeProjectFile(projects: Project[]): ProjectFile {
  return { app: 'ArchiCut AI', version: FILE_VERSION, exportedAt: new Date().toISOString(), projects };
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
  const valid = f.projects.filter(isProject);
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

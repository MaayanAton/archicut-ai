import { describe, expect, it } from 'vitest';
import { demoProjects } from '../document/factory';
import { makeProjectFile, parseProjectFile, ImportError } from './storage';

describe('project files', () => {
  it('round-trips all demo projects without changes', () => {
    const projects = demoProjects();
    const text = JSON.stringify(makeProjectFile(projects));
    expect(parseProjectFile(text)).toEqual(projects);
  });
  it('rejects broken, foreign and future files with a clear message', () => {
    expect(() => parseProjectFile('not json')).toThrow(ImportError);
    expect(() => parseProjectFile('{"app":"Other","projects":[]}')).toThrow(/אינו קובץ פרויקט/);
    expect(() => parseProjectFile('{"app":"ArchiCut AI","version":99,"projects":[]}')).toThrow(/גרסה חדשה/);
    expect(() => parseProjectFile('{"app":"ArchiCut AI","version":1,"projects":[{"id":1}]}')).toThrow(/לא נמצאו/);
  });
});

import { defaultEpureSettings, type SpacePoint } from '../geometry/projection';
import type { SolidParams } from '../geometry/solids';
import type { DrawingData, DrawingElement, PrintSettings, Project, ProjectType, TitleBlock } from './types';

export const uid = () =>
  (globalThis.crypto && 'randomUUID' in globalThis.crypto)
    ? globalThis.crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export const emptyTitleBlock = (title = ''): TitleBlock => ({
  title, name: '', className: '', date: '', exerciseNo: '', submitter: '', grade: '', sheetNo: '',
});

export const defaultPrint = (scale = 1): PrintSettings => ({
  paper: 'A4', orientation: 'portrait', scale, blackWhite: true, ruler: true, frame: true, printerCorrection: 1,
  include: 'both', printBackground: false,
});

export const emptySolid = (kind: SolidParams['kind'] = 'cube'): SolidParams => ({
  kind, a: null, w: null, d: null, h: null, r: null, n: null, rotX: 0, rotY: 0, rotZ: 0,
});

export const emptyDrawing = (): DrawingData => ({
  elements: [], background: null, grid: { size: 10, show: true, snap: true }, layout: 'overlay',
});

export function newProject(type: ProjectType, name: string): Project {
  const base = {
    id: uid(), name, createdAt: Date.now(), updatedAt: Date.now(), demo: false,
    titleBlock: emptyTitleBlock(type === 'projections' ? 'הנדסה תיאורית' : ''),
    print: defaultPrint(1),
  };
  if (type === 'projections')
    return {
      ...base, type,
      data: { points: [], epure: { ...defaultEpureSettings }, axo: { kind: 'cavalier', sideRight: true }, showConstruction: true },
    };
  if (type === 'section')
    return { ...base, type, data: { solid: emptySolid('cube'), plane: { orientation: 'horizontal', tilt: 0, azimuth: 0, offset: 0 } } };
  return { ...base, type, data: emptyDrawing() };
}

const P = (name: string, x: number | null, y: number | null, z: number | null): SpacePoint => ({ id: uid(), name, x, y, z });

const el = <T extends Omit<DrawingElement, 'id' | 'style' | 'width'>>(e: T, style: DrawingElement['style'] = 'solid', width = 0.35) =>
  ({ id: uid(), style, width, ...e }) as unknown as DrawingElement;

/**
 * Demonstration projects. All numbers here are invented sample values for trying
 * the app, clearly labelled as such. They are NOT taken from the course exercise.
 */
export function demoProjects(): Project[] {
  const now = Date.now();
  const mk = (p: Project, offset: number): Project => ({ ...p, demo: true, createdAt: now - offset, updatedAt: now - offset });

  const proj = newProject('projections', 'הדגמה: היטלי נקודות');
  if (proj.type === 'projections') {
    proj.data.points = [
      P('A', 40, 18, 28),
      P('B', 25, 28, 12),
      P('C', 58, 0, 22), // on pi2
      P('D', 10, 20, 0), // on pi1
      P('E', 72, -14, 24), // behind pi2 (quadrant II)
    ];
    proj.titleBlock = { ...proj.titleBlock, title: 'הנדסה תיאורית – הדגמה' };
  }

  const cube = newProject('section', 'הדגמה: חתך אלכסוני בקובייה');
  if (cube.type === 'section') {
    cube.data.solid = { ...emptySolid('cube'), a: 100, rotZ: 0 };
    cube.data.plane = { orientation: 'horizontal', tilt: 45, azimuth: 0, offset: 0 };
    cube.titleBlock.title = 'חתך בקובייה – הדגמה';
  }

  const cyl = newProject('section', 'הדגמה: חתך משופע בגליל');
  if (cyl.type === 'section') {
    cyl.data.solid = { ...emptySolid('cylinder'), r: 40, h: 140 };
    cyl.data.plane = { orientation: 'horizontal', tilt: 35, azimuth: 0, offset: 0 };
    cyl.titleBlock.title = 'חתך בגליל – הדגמה';
  }

  const cone = newProject('section', 'הדגמה: חתכי חרוט');
  if (cone.type === 'section') {
    cone.data.solid = { ...emptySolid('cone'), r: 50, h: 120 };
    cone.data.plane = { orientation: 'horizontal', tilt: 40, azimuth: 0, offset: -10 };
    cone.titleBlock.title = 'חתך בחרוט – הדגמה';
  }

  const draw = newProject('drawing', 'הדגמה: חדר עם מידות');
  if (draw.type === 'drawing') {
    draw.print.scale = 50;
    draw.data.grid.size = 100;
    draw.data.elements = [
      el({ kind: 'rect', x: 0, y: 0, w: 4000, h: 3000, angle: 0 }, 'solid', 0.5),
      el({ kind: 'line', a: { x: 900, y: 0 }, b: { x: 1800, y: 0 } }, 'dashed', 0.25),
      el({ kind: 'circle', c: { x: 3000, y: 2000 }, r: 450 }, 'solid', 0.25),
      el({ kind: 'dim', a: { x: 0, y: 3000 }, b: { x: 4000, y: 3000 }, offset: 500 }, 'solid', 0.18),
      el({ kind: 'dim', a: { x: 4000, y: 3000 }, b: { x: 4000, y: 0 }, offset: 500 }, 'solid', 0.18),
      el({ kind: 'text', p: { x: 1600, y: 900 }, text: 'חדר (נתוני הדגמה)', size: 4 }, 'solid', 0.25),
    ];
    draw.titleBlock.title = 'תוכנית חדר – הדגמה';
  }

  return [mk(proj, 0), mk(cube, 1000), mk(cyl, 2000), mk(cone, 3000), mk(draw, 4000)];
}

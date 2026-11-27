// Demonstration project "פארק ציבורי לדוגמה": a 60 × 40 m public park.
// Every number here is an invented sample value for trying the app, chosen to look reasonable.
// It is not a real design, not survey data and not taken from any course exercise.

import { v2, type Vec2 } from '../geometry/vec';
import { makeElement } from './library';
import { emptySite } from './migrate';
import { buildSiteModel } from './section';
import { autoSheet } from './render/sheet';
import type { SiteData, SiteElement, SiteGeom } from './types';

export const DEMO_PARK_NAME = 'פארק ציבורי לדוגמה';

const R = (x0: number, y0: number, x1: number, y1: number): Vec2[] => [v2(x0, y0), v2(x1, y0), v2(x1, y1), v2(x0, y1)];
const P = (...xy: number[]): Vec2[] => {
  const out: Vec2[] = [];
  for (let i = 0; i < xy.length; i += 2) out.push(v2(xy[i], xy[i + 1]));
  return out;
};

export function demoParkData(ids: () => string): SiteData {
  const d = emptySite();
  const els: SiteElement[] = [];
  const add = (kind: string, geom: SiteGeom, o: Partial<SiteElement> & { params?: Record<string, number> } = {}) => {
    const e = makeElement(kind, geom, ids());
    const { params, ...rest } = o;
    els.push({ ...e, ...rest, params: { ...e.params, ...(params ?? {}) } });
  };
  const area = (kind: string, pts: Vec2[], o: Parameters<typeof add>[2] = {}, curved = false) => add(kind, { type: 'area', pts, curved }, o);
  const line = (kind: string, pts: Vec2[], o: Parameters<typeof add>[2] = {}, curved = false) => add(kind, { type: 'line', pts, curved }, o);
  const pt = (kind: string, x: number, y: number, rot = 0, o: Parameters<typeof add>[2] = {}) => add(kind, { type: 'point', p: v2(x, y), rot }, o);

  // ---- lot and zones ----
  area('lot', R(0, 0, 60000, 40000), { name: '' });
  area('zone', R(2000, 22000, 18500, 38000), { name: 'אזור משחקים' });
  area('zone', R(39000, 9500, 58000, 22000), { name: 'אזור מים וישיבה' });

  // ---- level difference: upper plaza at +0.60 with retaining walls, stairs and a ramp ----
  area('terrace', R(38000, 28000, 60000, 40000), { name: 'רחבה עליונה', params: { level: 600 } });
  // Walls stand just outside the upper plaza, on the lower ground, and rise 0.45 m above it (seat height).
  const wall = { params: { width: 250, h: 1050 } };
  line('wall', P(37875, 27875, 39450, 27875), wall);
  line('wall', P(42550, 27875, 60000, 27875), wall);
  line('wall', P(37875, 28000, 37875, 31050), wall);
  line('wall', P(37875, 32950, 37875, 40000), wall);
  // Four risers of 150 mm and treads of 350 mm, going up to the north.
  pt('stairs', 41000, 27300, 0, { params: { w: 3000, d: 1400, rise: 600, n: 4 } });
  // 8 m ramp rising 0.60 m (7.5%), going up to the east.
  pt('ramp', 34000, 32000, -90, { params: { w: 1800, d: 8000, rise: 600 } });

  // ---- entrance plaza ----
  area('plaza', R(22000, 0, 38000, 6000), { name: 'רחבת כניסה' });
  pt('palm', 24000, 2500);
  pt('palm', 36000, 2500);
  pt('bike', 35500, 4600, 0, { params: { n: 6, w: 3000 } });
  pt('drink', 24500, 4800);
  pt('bin', 26000, 5200);
  pt('bin', 34000, 5200);
  line('hedge', P(1500, 900, 21000, 900));
  line('hedge', P(39000, 900, 58500, 900));

  // ---- paths ----
  line('path', P(30000, 6000, 28500, 12000, 30500, 18500, 36000, 23500, 41000, 26600), { params: { width: 3000 } }, true);
  line('path', P(30500, 18500, 28000, 24500, 28500, 30000, 30000, 32000), { params: { width: 2000 } }, true);
  line('path', P(28500, 12000, 20000, 15000, 14000, 19500, 11000, 24000), { params: { width: 2000 } }, true);

  // ---- lawns and planting ----
  area('lawn', P(2500, 2500, 21000, 2500, 21500, 7000, 25000, 9500, 18000, 12500, 10000, 17500, 2500, 19500), {}, true);
  area('lawn', P(19500, 20000, 24500, 16000, 26500, 17500, 26500, 23500, 26500, 30000, 24000, 37500, 20000, 37500, 19500, 24000), { name: 'מדשאה מרכזית' }, true);
  area('lawn', P(39500, 2500, 57500, 2500, 57500, 8500, 40000, 8500, 38500, 6500));
  area('lawn', P(43000, 23000, 57500, 23000, 57500, 26800, 43500, 26800));
  area('planting', R(39500, 10000, 41500, 17500));
  pt('shrub', 40500, 11000);
  pt('shrub', 40500, 13500);
  pt('shrub', 40500, 16300);
  for (const [x, y] of [[23000, 7200], [24300, 7600], [37000, 7200], [35800, 7600]]) pt('flowers', x, y);

  // ---- trees ----
  for (const [x, y] of [[6000, 6000], [13000, 4500], [4000, 13000], [16000, 9500]]) pt('tree-round', x, y);
  for (const [x, y] of [[22500, 19500], [33500, 14000], [34500, 9500], [45500, 5000], [53500, 5500]]) pt('tree-round', x, y, 0, { params: { dia: 5000, h: 6000 } });
  for (const [x, y] of [[2500, 37500], [2500, 33500], [2500, 29500]]) pt('tree-conifer', x, y);
  for (const x of [44500, 48000, 51500, 55000]) pt('tree-columnar', x, 25000);
  pt('tree-round', 57500, 38000);
  pt('tree-round', 40500, 37500, 0, { params: { dia: 4500, h: 5500 } });

  // ---- playground ----
  area('sport', R(4000, 24000, 18000, 36000));
  pt('play', 9000, 32000);
  pt('play', 14000, 27500, 90, { params: { w: 3500, d: 2600, h: 2800, deck: 1000 } });
  pt('fitness', 7000, 26000);
  pt('bench', 19400, 27000, -90);
  pt('bench', 19400, 31000, -90);
  pt('bin', 19400, 29000);

  // ---- pond and seating ----
  area('pond', P(42500, 12000, 46000, 10500, 51000, 11000, 52500, 14000, 50000, 17000, 45000, 17000, 42500, 15000), { params: { depth: 600 } }, true);
  area('seating', R(41000, 18500, 54000, 21500));
  for (const x of [44000, 47500, 51000]) pt('bench', x, 19700);
  pt('bin', 53000, 19700);

  // ---- upper plaza: pergola with seating, fountain, raised bed ----
  pt('pergola', 48000, 34000, 0, { params: { w: 6000, d: 4000, h: 2800 } });
  pt('table', 46500, 34000);
  pt('table', 49500, 34000);
  pt('bench', 46500, 35000, 0, { params: { h: 450 } });
  pt('bench', 49500, 35000, 0, { params: { h: 450 } });
  pt('bench', 46500, 33000, 180, { params: { h: 450 } });
  pt('bench', 49500, 33000, 180, { params: { h: 450 } });
  pt('fountain', 54500, 33000, 0, { params: { dia: 2500 } });
  area('bed', R(39000, 36500, 44000, 39000));

  // ---- street lighting along the paths ----
  for (const [x, y] of [[31800, 7000], [27000, 12000], [32000, 19000], [37800, 23500], [26700, 26000], [20000, 13700], [12800, 21000], [42000, 30500], [56500, 30500]]) pt('lamp', x, y);

  // ---- annotation ----
  add('dim', { type: 'dim', a: v2(0, 0), b: v2(60000, 0), offset: -1600 });
  add('dim', { type: 'dim', a: v2(0, 0), b: v2(0, 40000), offset: 1600 });
  pt('text', 30000, 41500, 0, { name: 'פרויקט הדגמה – נתונים לדוגמה בלבד', params: { size: 3 } });

  d.elements = els;

  // ---- topography: manual sample points (not a survey) and one designed mound ----
  const hp = (x: number, y: number, z: number, note: string) => ({ id: ids(), p: v2(x, y), z, source: 'manual' as const, note });
  d.terrain = {
    ...d.terrain,
    base: 0,
    points: [
      hp(33000, 1500, 0, 'מפלס הכניסה (הדגמה)'),
      hp(5000, 6000, 400, 'נתון הדגמה'),
      hp(6000, 15000, 700, 'נתון הדגמה'),
      hp(14000, 9000, 300, 'נתון הדגמה'),
      hp(22000, 14000, 0, 'נתון הדגמה'),
      hp(17000, 22000, 0, 'נתון הדגמה'),
      hp(3000, 23000, 0, 'נתון הדגמה'),
      hp(36000, 26000, 0, 'נתון הדגמה'),
    ],
    mounds: [{ id: ids(), c: v2(23000, 32000), r: 4500, h: 1200 }],
    contourStep: 250,
    showContours: true,
    showPoints: true,
  };

  // ---- sections and elevation ----
  d.sections = [
    { id: ids(), label: 'A', mode: 'section', a: v2(1000, 32500), b: v2(59000, 32500), side: 1, depth: 12000, showDims: true, showLevels: true },
    { id: ids(), label: 'B', mode: 'section', a: v2(47000, 1000), b: v2(47000, 39500), side: 1, depth: 15000, showDims: true, showLevels: true },
    { id: ids(), label: 'חזית דרומית', mode: 'elevation', a: v2(0, -3000), b: v2(60000, -3000), side: 1, depth: 44000, showDims: true, showLevels: true },
  ];

  d.info = { projectTitle: `${DEMO_PARK_NAME} (הדגמה)`, student: '', course: '', lecturer: '', institution: '', date: '', sheetNo: '1' };

  // ---- sample submission sheet; the 3D picture is taken the first time the sheet is opened ----
  const model = buildSiteModel(d);
  const sheet = autoSheet(d, model, { id: ids(), name: 'גיליון הגשה לדוגמה', paper: 'A2', orientation: 'landscape', blackWhite: false, frame: true, ruler: true }, ids, '');
  d.sheets = [sheet];
  return d;
}

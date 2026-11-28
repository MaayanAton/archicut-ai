// Furniture, accessories, lights and architectural elements added in 4.0. Same rules as furniture.ts: every item
// is a set of solids computed from its width (w), depth (d) and height (h); the plan symbol is their top view, so
// plan, 3D, sections and elevations always agree. Local frame: x across the width, y across the depth (front at
// -d/2), z up from the item's bottom. Sizes are common editable defaults, not data from a standard or a course.

import type { FurnItem, Part, PartColor } from './furniture';
import { gateParts, type ArchShape } from '../library/arch';

const box = (x0: number, y0: number, x1: number, y1: number, z0: number, z1: number, c: PartColor = 1): Part => ({ t: 'box', x0: Math.min(x0, x1), y0: Math.min(y0, y1), x1: Math.max(x0, x1), y1: Math.max(y0, y1), z0, z1, c });
/** Box by its centre and size. */
const bc = (cx: number, cy: number, w: number, d: number, z0: number, z1: number, c: PartColor = 1): Part => box(cx - w / 2, cy - d / 2, cx + w / 2, cy + d / 2, z0, z1, c);
const cyl = (cx: number, cy: number, r: number, z0: number, z1: number, c: PartColor = 1): Part => ({ t: 'cyl', cx, cy, r, z0, z1, c });
const poly = (pts: [number, number][], z0: number, z1: number, c: PartColor = 1): Part => ({ t: 'poly', pts, z0, z1, c });
const ellipse = (rx: number, ry: number, n = 28, cx = 0, cy = 0): [number, number][] => Array.from({ length: n }, (_, i) => [cx + rx * Math.cos((i * 2 * Math.PI) / n), cy + ry * Math.sin((i * 2 * Math.PI) / n)] as [number, number]);
const legs = (w: number, d: number, h: number, inset = 40, s = 40, c: PartColor = 'dark'): Part[] => {
  const x = w / 2 - inset - s / 2, y = d / 2 - inset - s / 2;
  return [[-x, -y], [x, -y], [-x, y], [x, y]].map(([cx, cy]) => bc(cx, cy, s, s, 0, h, c));
};
/** A disc standing upright (in the x-z plane), thickness along y: clocks, round mirrors, portholes. */
function vdisk(cx: number, cz: number, r: number, y0: number, y1: number, c: PartColor, n = 16): Part[] {
  const out: Part[] = [];
  for (let i = 0; i < n; i++) {
    const xa = -r + (2 * r * i) / n, xb = -r + (2 * r * (i + 1)) / n;
    const ha = Math.sqrt(Math.max(0, r * r - xa * xa)), hb = Math.sqrt(Math.max(0, r * r - xb * xb));
    out.push({ t: 'slice', x0: cx + xa, x1: cx + xb, y0, y1, b0: cz - ha, b1: cz - hb, t0: cz + ha, t1: cz + hb, c });
  }
  return out;
}
/** A rounded body made of stacked cylinders (lamp shades, vases, globes). */
function stack(cx: number, cy: number, z0: number, z1: number, rAt: (t: number) => number, n: number, c: PartColor): Part[] {
  const out: Part[] = [];
  for (let i = 0; i < n; i++) { const t = (i + 0.5) / n; const r = rAt(t); if (r > 0.5) out.push(cyl(cx, cy, r, z0 + ((z1 - z0) * i) / n, z0 + ((z1 - z0) * (i + 1)) / n, c)); }
  return out;
}
const doorLines = (w: number, d: number, n: number): [number, number, number, number][] => Array.from({ length: Math.max(0, n - 1) }, (_, i) => { const x = -w / 2 + (w * (i + 1)) / n; return [x, -d / 2, x, d / 2] as [number, number, number, number]; });

function bedParts(w: number, d: number, h: number, pillows: number, head = 90, headH = 1100): Part[] {
  const mat = 520;
  const out: Part[] = [
    box(-w / 2, -d / 2, w / 2, d / 2 - head, 60, mat * 0.6, 2),
    ...legs(w, d - head, 60, 40, 60, 3).map((p) => (p.t === 'box' ? { ...p, y0: p.y0 - head / 2, y1: p.y1 - head / 2 } : p)),
    box(-w / 2 + 15, -d / 2 + 15, w / 2 - 15, d / 2 - head - 10, mat * 0.6, mat, 'white'),
    box(-w / 2 - 20, d / 2 - head, w / 2 + 20, d / 2, 0, Math.max(h, headH), 2),
    box(-w / 2 + 15, -d / 2 + 15, w / 2 - 15, -d / 2 + (d - head) * 0.4, mat, mat + 30, 1),
  ];
  const pw = (w - 60 - (pillows - 1) * 40) / pillows;
  for (let i = 0; i < pillows; i++) { const x0 = -w / 2 + 30 + i * (pw + 40); out.push(box(x0, d / 2 - head - 380, x0 + pw, d / 2 - head - 60, mat, mat + 130, 'light')); }
  return out;
}

function cabinetBody(w: number, d: number, h: number, plinth = 100, handles = 1): Part[] {
  const out: Part[] = [box(-w / 2 + 40, -d / 2 + 50, w / 2 - 40, d / 2, 0, plinth, 'dark'), box(-w / 2, -d / 2 + 20, w / 2, d / 2, plinth, h, 1)];
  const n = Math.max(1, handles);
  for (let i = 0; i < n; i++) { const x = -w / 2 + (w * (i + 0.5)) / n; out.push(box(x - 8, -d / 2, x + 8, -d / 2 + 20, Math.min(h - 200, plinth + (h - plinth) * 0.55), Math.min(h - 60, plinth + (h - plinth) * 0.55 + 160), 3)); }
  return out;
}

/** A run of kitchen base and wall cabinets along x (front at -y), with the worktop as colour 2 and handles as colour 3. */
function kitchenRun(x0: number, x1: number, yFront: number, d: number, h: number, upper: boolean, sinkAt: number | null, hobAt: number | null, orient: 'x' | 'yl' | 'yr' = 'x'): Part[] {
  // orient 'x': the run goes along x, back against +y. 'yr': along y, back against +x. 'yl': along y, back against -x.
  const out: Part[] = [];
  const P = (ax0: number, ay0: number, ax1: number, ay1: number, z0: number, z1: number, c: PartColor) => out.push(
    orient === 'x' ? box(ax0, ay0, ax1, ay1, z0, z1, c) : orient === 'yr' ? box(ay0, ax0, ay1, ax1, z0, z1, c) : box(2 * yFront + d - ay1, ax0, 2 * yFront + d - ay0, ax1, z0, z1, c));
  P(x0, yFront + 60, x1, yFront + d, 0, 100, 'dark');
  P(x0, yFront + 20, x1, yFront + d, 100, h - 40, 1);
  P(x0, yFront, x1, yFront + d, h - 40, h, 2);
  const n = Math.max(1, Math.round((x1 - x0) / 600));
  for (let i = 0; i < n; i++) { const x = x0 + ((x1 - x0) * (i + 0.5)) / n; P(x - 120, yFront + 5, x + 120, yFront + 20, h - 140, h - 110, 3); }
  if (sinkAt !== null) { P(sinkAt - 380, yFront + 70, sinkAt + 380, yFront + d - 90, h, h + 4, 'metal'); P(sinkAt - 20, yFront + d - 70, sinkAt + 20, yFront + d - 40, h, h + 300, 'metal'); }
  if (hobAt !== null) P(hobAt - 300, yFront + 60, hobAt + 300, yFront + d - 60, h, h + 6, 'dark');
  if (upper) P(x0, yFront + d - 350, x1, yFront + d, 1450, 2150, 1);
  return out;
}

function chairParts(w: number, d: number, h: number, seat = 460): Part[] {
  return [...legs(w, d, seat - 40, 25, 35, 2), box(-w / 2, -d / 2, w / 2, d / 2, seat - 40, seat, 1), box(-w / 2, d / 2 - 45, w / 2, d / 2, seat, h, 1)];
}

function plantParts(w: number, h: number, pot = 0.3): Part[] {
  const ph = h * pot;
  return [
    ...stack(0, 0, 0, ph, (t) => w * (0.22 + 0.06 * t), 3, 2),
    cyl(0, 0, w * 0.2, ph - 20, ph, 'soil'),
    cyl(0, 0, 15, ph, h * 0.55, 'dark'),
    ...stack(0, 0, h * 0.45, h, (t) => (w / 2) * Math.sqrt(Math.max(0.05, 1 - (2 * t - 1) * (2 * t - 1))), 6, 'leaf'),
  ];
}

function lampShade(cx: number, cy: number, z0: number, z1: number, r0: number, r1: number, n = 4): Part[] {
  return stack(cx, cy, z0, z1, (t) => r0 + (r1 - r0) * t, n, 1);
}

function gate(shape: ArchShape, n: number, side: number, deco: boolean, attic: number, ow: (w: number) => number, oh: (h: number) => number) {
  return (w: number, d: number, h: number): Part[] => gateParts({ w, d, h, ow: ow(w), oh: oh(h), n, shape, rise: 0, side, deco, attic, slices: 20 }) as Part[];
}

function spiralStair(w: number, h: number, steps: number): Part[] {
  const R = w / 2, out: Part[] = [cyl(0, 0, 70, 0, h + 900, 3)];
  const rise = h / steps;
  const sweep = (Math.PI * 2 * 0.85) / steps;
  for (let i = 0; i < steps; i++) {
    const a0 = i * sweep, a1 = (i + 1) * sweep + 0.02;
    const pts: [number, number][] = [[Math.cos(a0) * 60, Math.sin(a0) * 60]];
    for (let k = 0; k <= 4; k++) { const a = a0 + ((a1 - a0) * k) / 4; pts.push([Math.cos(a) * R, Math.sin(a) * R]); }
    pts.push([Math.cos(a1) * 60, Math.sin(a1) * 60]);
    out.push(poly(pts, rise * (i + 1) - 50, rise * (i + 1), 1));
    out.push(cyl(Math.cos(a0 + sweep / 2) * (R - 40), Math.sin(a0 + sweep / 2) * (R - 40), 12, rise * (i + 1), rise * (i + 1) + 900, 2));
  }
  return out;
}

function curvedStair(w: number, d: number, h: number, steps: number): Part[] {
  // Treads on a quarter circle: inner radius ri, outer radius ro, centre at the back-left corner.
  const out: Part[] = [];
  const ro = Math.min(w, d), ri = Math.max(200, ro - 1100);
  const cx = -w / 2, cy = d / 2;
  const rise = h / steps;
  for (let i = 0; i < steps; i++) {
    const a0 = -Math.PI / 2 + (i * Math.PI) / 2 / steps, a1 = -Math.PI / 2 + ((i + 1) * Math.PI) / 2 / steps;
    const pts: [number, number][] = [];
    for (let k = 0; k <= 3; k++) { const a = a0 + ((a1 - a0) * k) / 3; pts.push([cx + Math.cos(a) * ro, cy + Math.sin(a) * ro]); }
    for (let k = 3; k >= 0; k--) { const a = a0 + ((a1 - a0) * k) / 3; pts.push([cx + Math.cos(a) * ri, cy + Math.sin(a) * ri]); }
    out.push(poly(pts, Math.max(0, rise * (i + 1) - 220), rise * (i + 1), 1));
  }
  return out;
}

type Ex = Partial<FurnItem>;
const I = (kind: string, label: string, cat: FurnItem['cat'], sub: string, keywords: string, [w, d, h]: [number, number, number], elev: number, [color, color2, color3]: [string, string, string?], material: string, parts: FurnItem['parts'], ex: Ex = {}): FurnItem =>
  ({ kind, label, cat, sub, keywords, w, d, h, elev, color, color2, ...(color3 ? { color3 } : {}), material, parts, v4: true, mount: 'floor', ...ex });

const FAB = ['fabric', 'wood', 'wood'];

export const FURNITURE4: FurnItem[] = [
  // ---------------------------------------------------------------- living room
  I('sofa-u', 'ספה בצורת U', 'living', 'ספות', 'ספה U פינתית גדולה', [3200, 2200, 850], 0, ['#9aa3a0', '#7c8582', '#3a3f45'], 'fabric', (w, d, h) => {
    const dep = 900, seat = 440, back = 200;
    return [
      box(-w / 2, d / 2 - dep, w / 2, d / 2, 60, seat * 0.6, 2), box(-w / 2, -d / 2, -w / 2 + dep, d / 2 - dep, 60, seat * 0.6, 2), box(w / 2 - dep, -d / 2, w / 2, d / 2 - dep, 60, seat * 0.6, 2),
      box(-w / 2 + back, d / 2 - dep + 30, w / 2 - back, d / 2 - back, seat * 0.6, seat, 1), box(-w / 2 + back, -d / 2 + 30, -w / 2 + dep - 30, d / 2 - dep + 30, seat * 0.6, seat, 1), box(w / 2 - dep + 30, -d / 2 + 30, w / 2 - back, d / 2 - dep + 30, seat * 0.6, seat, 1),
      box(-w / 2, d / 2 - back, w / 2, d / 2, seat * 0.6, h, 1), box(-w / 2, -d / 2, -w / 2 + back, d / 2 - back, seat * 0.6, h, 1), box(w / 2 - back, -d / 2, w / 2, d / 2 - back, seat * 0.6, h, 1),
    ];
  }, { rooms: ['living'], slots: ['ריפוד', 'בסיס', 'רגליים'], mats: FAB }),
  I('sofa-modular', 'ספה מודולרית', 'living', 'ספות', 'ספה מודולרית מודולים', [3000, 1000, 780], 0, ['#c9b9a0', '#a8987f', '#3a3f45'], 'fabric', (w, d, h) => {
    const n = 3, mw = (w - 40) / n, out: Part[] = [];
    for (let i = 0; i < n; i++) { const x0 = -w / 2 + i * (mw + 20); out.push(box(x0, -d / 2, x0 + mw, d / 2, 0, 400, 2), box(x0 + 20, -d / 2 + 20, x0 + mw - 20, d / 2 - 220, 400, 470, 1), box(x0, d / 2 - 220, x0 + mw, d / 2, 400, h, 1)); }
    return out;
  }, { rooms: ['living'], slots: ['כריות', 'מודולים'], mats: ['boucle', 'fabric'] }),
  I('chaise', 'ספת שזלונג', 'living', 'ספות', 'שזלונג מיטת יום', [800, 1700, 820], 0, ['#b49a7e', '#3a3f45'], 'fabric', (w, d, h) => [
    ...legs(w, d, 120, 60, 40, 2), box(-w / 2, -d / 2, w / 2, d / 2, 120, 380, 1),
    { t: 'slice', x0: -w / 2, x1: w / 2, y0: d / 2 - 600, y1: d / 2 - 200, b0: 380, b1: 380, t0: 480, t1: 480, c: 1 },
    box(-w / 2, d / 2 - 220, w / 2, d / 2, 380, h, 1),
  ], { rooms: ['living', 'bedroom'], slots: ['ריפוד', 'רגליים'], mats: ['velvet', 'wood'] }),
  I('armchair-modern', 'כורסה מודרנית', 'living', 'כורסאות', 'כורסה כורסא מודרנית', [760, 820, 800], 0, ['#5f7a8a', '#2f3134'], 'fabric', (w, d, h) => [
    ...legs(w, d, 160, 40, 30, 2), box(-w / 2, -d / 2, w / 2, d / 2, 160, 420, 1), box(-w / 2, d / 2 - 160, w / 2, d / 2, 420, h, 1), box(-w / 2, -d / 2 + 40, -w / 2 + 70, d / 2, 420, 620, 1), box(w / 2 - 70, -d / 2 + 40, w / 2, d / 2, 420, 620, 1),
  ], { rooms: ['living', 'bedroom'], slots: ['ריפוד', 'רגליים'], mats: ['velvet', 'steel-black'] }),
  I('armchair-classic', 'כורסה קלאסית', 'living', 'כורסאות', 'כורסה כורסא קלאסית אוזניים', [850, 900, 1100], 0, ['#7a4e3a', '#4e3424'], 'leather', (w, d, h) => [
    ...legs(w, d, 140, 50, 45, 2), box(-w / 2, -d / 2, w / 2, d / 2, 140, 430, 1), box(-w / 2, d / 2 - 180, w / 2, d / 2, 430, h, 1),
    box(-w / 2, -d / 2 + 80, -w / 2 + 130, d / 2, 430, 700, 1), box(w / 2 - 130, -d / 2 + 80, w / 2, d / 2, 430, 700, 1),
    box(-w / 2, d / 2 - 420, -w / 2 + 110, d / 2 - 180, 700, h - 80, 1), box(w / 2 - 110, d / 2 - 420, w / 2, d / 2 - 180, 700, h - 80, 1),
  ], { rooms: ['living', 'office'], slots: ['ריפוד', 'רגליים'], mats: ['leather', 'walnut'] }),
  I('armchair-swivel', 'כורסה מסתובבת', 'living', 'כורסאות', 'כורסה כורסא מסתובבת', [800, 800, 780], 0, ['#d9cdb8', '#9aa1a8'], 'fabric', (w, _d, h) => [
    cyl(0, 0, w * 0.3, 0, 30, 2), cyl(0, 0, 40, 30, 220, 2), cyl(0, 0, w / 2, 220, 420, 1),
    box(-w / 2 + 40, w * 0.1, w / 2 - 40, w / 2, 420, h, 1),
  ], { rooms: ['living'], slots: ['ריפוד', 'בסיס'], mats: ['boucle', 'chrome'] }),
  I('ottoman', 'הדום', 'living', 'כורסאות', 'הדום פוף שרפרף', [600, 600, 420], 0, ['#a37c5b', '#3a3f45'], 'leather', (w, _d, h) => [cyl(0, 0, w / 2, 0, h, 1)], { rooms: ['living', 'bedroom'], mats: ['leather'] }),
  I('coffee-square', 'שולחן סלון מרובע', 'living', 'שולחנות', 'שולחן סלון מרובע קפה', [900, 900, 400], 0, ['#c9b9a0', '#2f3134'], 'wood', (w, d, h) => [...legs(w, d, h - 40, 30, 40, 2), box(-w / 2, -d / 2, w / 2, d / 2, h - 40, h, 1), box(-w / 2 + 40, -d / 2 + 40, w / 2 - 40, d / 2 - 40, 120, 140, 1)], { rooms: ['living'], slots: ['משטח', 'רגליים'], mats: ['oak-natural', 'steel-black'] }),
  I('coffee-oval', 'שולחן סלון אובלי', 'living', 'שולחנות', 'שולחן סלון אובלי אליפסה', [1300, 700, 400], 0, ['#ece9e4', '#c9a55a'], 'marble', (w, d, h) => [poly(ellipse(w / 2, d / 2), h - 30, h, 1), bc(-w / 4, 0, 60, d * 0.6, 0, h - 30, 2), bc(w / 4, 0, 60, d * 0.6, 0, h - 30, 2)], { rooms: ['living'], slots: ['משטח', 'בסיס'], mats: ['marble-white', 'brass'] }),
  I('side-table', 'שולחן צד', 'living', 'שולחנות', 'שולחן צד קטן', [450, 450, 550], 0, ['#a9784a', '#2f3134'], 'wood', (w, _d, h) => [cyl(0, 0, w * 0.32, 0, 20, 2), cyl(0, 0, 20, 20, h - 25, 2), cyl(0, 0, w / 2, h - 25, h, 1)], { rooms: ['living', 'bedroom'], slots: ['משטח', 'בסיס'], mats: ['walnut', 'steel-black'] }),
  I('sideboard', 'מזנון גבוה (קונסולה)', 'living', 'אחסון', 'מזנון קונסולה בופה', [1800, 450, 800], 0, ['#6b4a33', '#c9a55a', '#c9a55a'], 'wood', (w, d, h) => [...legs(w, d, 180, 60, 40, 2), box(-w / 2, -d / 2, w / 2, d / 2, 180, h, 1), ...[-1, 0, 1].map((i) => bc((i * w) / 3, -d / 2 + 5, 12, 10, 450, 620, 3))], { rooms: ['living', 'dining'], slots: ['גוף', 'רגליים', 'ידיות'], mats: ['walnut', 'brass', 'brass'], lines: (w, d) => doorLines(w, d, 3) }),
  I('fireplace', 'קמין דקורטיבי', 'living', 'אחסון', 'קמין אח דקורטיבי', [1500, 450, 1150], 0, ['#ece9e4', '#2a2a2c', '#ffb347'], 'marble', (w, d, h) => [
    box(-w / 2, -d / 2, w / 2, d / 2, 0, 120, 1), box(-w / 2, -d / 2 + 60, -w / 2 + 300, d / 2, 120, h - 120, 1), box(w / 2 - 300, -d / 2 + 60, w / 2, d / 2, 120, h - 120, 1),
    box(-w / 2 + 300, -d / 2 + 60, w / 2 - 300, d / 2, h - 380, h - 120, 1), box(-w / 2 - 60, -d / 2, w / 2 + 60, d / 2, h - 120, h, 1),
    box(-w / 2 + 300, 0, w / 2 - 300, d / 2, 120, h - 380, 2), bc(0, -d / 2 + 160, w * 0.3, 120, 120, 240, 'lamp'),
  ], { rooms: ['living'], slots: ['מסגרת', 'פנים התא'], mats: ['marble-white', 'steel-black'], light: { type: 'point', z: 250, power: 0.35 }, mount: 'wall', note: 'קמין דקורטיבי להמחשה בלבד: ללא ארובה וללא חישובי בטיחות.' }),
  I('vitrine-cab', 'ויטרינה', 'living', 'אחסון', 'ויטרינה ארון תצוגה זכוכית', [900, 400, 1900], 0, ['#2f3134', '#f5f5f2'], 'steel-black', (w, d, h) => {
    const out: Part[] = [box(-w / 2, -d / 2, w / 2, d / 2, 0, 80, 1), box(-w / 2, -d / 2, w / 2, d / 2, h - 40, h, 1), box(-w / 2, -d / 2, -w / 2 + 30, d / 2, 0, h, 1), box(w / 2 - 30, -d / 2, w / 2, d / 2, 0, h, 1), box(-w / 2, d / 2 - 20, w / 2, d / 2, 0, h, 2), box(-w / 2 + 30, -d / 2, w / 2 - 30, -d / 2 + 8, 80, h - 40, 'glass')];
    for (let i = 1; i < 4; i++) out.push(box(-w / 2 + 30, -d / 2 + 10, w / 2 - 30, d / 2 - 20, 80 + ((h - 120) * i) / 4, 80 + ((h - 120) * i) / 4 + 10, 'glass'));
    return out;
  }, { rooms: ['living', 'dining'], slots: ['מסגרת', 'גב'], mats: ['steel-black', 'wood'] }),

  // ---------------------------------------------------------------- bedrooms
  I('bed-queen', 'מיטת קווין', 'bedroom', 'מיטות', 'מיטה קווין זוגית', [1520, 2030, 1100], 0, ['#d8cfc2', '#8a7a68', '#3a3f45'], 'fabric', (w, d, h) => bedParts(w, d, h, 2, 100, 1200), { rooms: ['bedroom'], slots: ['מצעים', 'מסגרת וראש', 'רגליים'], mats: ['linen', 'velvet', 'wood'], lines: (w, d) => [[-w / 2, d / 2 - 900, w / 2, d / 2 - 1150]] }),
  I('bed-king', 'מיטת קינג', 'bedroom', 'מיטות', 'מיטה קינג זוגית גדולה', [1930, 2030, 1100], 0, ['#e6e0d6', '#6b4a33', '#3a3f45'], 'fabric', (w, d, h) => [...bedParts(w - 200, d, h, 2, 100, 1100), box(-w / 2, -d / 2, w / 2, d / 2 - 100, 0, 60, 2)], { rooms: ['bedroom'], slots: ['מצעים', 'בסיס וראש', 'רגליים'], mats: ['linen', 'walnut', 'wood'], lines: (w, d) => [[-w / 2 + 100, d / 2 - 900, w / 2 - 100, d / 2 - 1150]] }),
  I('bed-bunk', 'מיטת קומתיים', 'bedroom', 'מיטות', 'מיטת קומתיים ילדים', [1000, 2000, 1650], 0, ['#f2efe9', '#ffffff', '#5b8fb9'], 'wood', (w, d, h) => [
    ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sy]) => bc((sx * (w - 60)) / 2, (sy * (d - 60)) / 2, 60, 60, 0, h, 1)),
    box(-w / 2, -d / 2, w / 2, d / 2, 200, 300, 1), box(-w / 2 + 30, -d / 2 + 30, w / 2 - 30, d / 2 - 30, 300, 450, 2),
    box(-w / 2, -d / 2, w / 2, d / 2, 1150, 1250, 1), box(-w / 2 + 30, -d / 2 + 30, w / 2 - 30, d / 2 - 30, 1250, 1400, 2),
    box(-w / 2, -d / 2, -w / 2 + 30, d / 2 - 700, 1400, h, 3), box(w / 2 - 30, -d / 2, w / 2, d / 2, 1400, h, 3),
    ...[400, 650, 900].map((z) => box(-w / 2, d / 2 - 650, -w / 2 + 50, d / 2 - 60, z, z + 30, 1)),
  ], { rooms: ['kids'], slots: ['מסגרת', 'מזרנים', 'מעקה'], mats: ['oak-white', null, 'lacquer'] }),
  I('bed-kids', 'מיטת ילדים', 'bedroom', 'מיטות', 'מיטת ילדים נוער', [900, 1900, 750], 0, ['#ffffff', '#f2a33a', '#7fb6d9'], 'wood', (w, d, h) => [...bedParts(w, d, h, 1, 60, 750), box(-w / 2, -d / 2, -w / 2 + 25, d / 2 - 700, 520, 700, 3)], { rooms: ['kids'], slots: ['מצעים', 'מסגרת', 'מעקה'], mats: ['linen', 'lacquer', 'lacquer'] }),
  I('crib', 'עריסה / מיטת תינוק', 'bedroom', 'מיטות', 'עריסה מיטת תינוק לול', [700, 1300, 950], 0, ['#f5f5f2', '#ffffff'], 'wood', (w, d, h) => {
    const out: Part[] = [box(-w / 2, -d / 2, w / 2, d / 2, 250, 300, 1), box(-w / 2 + 25, -d / 2 + 25, w / 2 - 25, d / 2 - 25, 300, 420, 2), ...legs(w, d, 250, 0, 40, 1), box(-w / 2, -d / 2, w / 2, -d / 2 + 30, h - 40, h, 1), box(-w / 2, d / 2 - 30, w / 2, d / 2, h - 40, h, 1)];
    for (let i = 0; i <= 12; i++) { const y = -d / 2 + (d * i) / 12; out.push(bc(-w / 2 + 12, y, 20, 20, 300, h, 1), bc(w / 2 - 12, y, 20, 20, 300, h, 1)); }
    return out;
  }, { rooms: ['kids', 'bedroom'], mats: ['oak-white', 'linen'] }),
  I('headboard', 'ראש מיטה מעוצב', 'bedroom', 'מיטות', 'ראש מיטה קיר מרופד', [1800, 80, 1300], 0, ['#8a9aa5', '#c9a55a'], 'velvet', (w, d, h) => { const n = 6, out: Part[] = []; for (let i = 0; i < n; i++) out.push(box(-w / 2 + (w * i) / n + 6, -d / 2, -w / 2 + (w * (i + 1)) / n - 6, d / 2, 0, h, 1)); out.push(box(-w / 2 - 20, -d / 2 + 10, w / 2 + 20, d / 2, h, h + 30, 2)); return out; }, { rooms: ['bedroom'], mount: 'wall', slots: ['ריפוד', 'מסגרת'], mats: ['velvet', 'brass'] }),
  I('wardrobe-sliding', 'ארון הזזה', 'bedroom', 'ארונות', 'ארון הזזה בגדים', [2400, 650, 2500], 0, ['#ece9e4', '#3a3f45', '#c4c8cc'], 'lacquer', (w, d, h) => [box(-w / 2, -d / 2 + 60, w / 2, d / 2, 0, h, 2), box(-w / 2, -d / 2 + 30, 30, -d / 2 + 55, 40, h - 40, 1), box(-30, -d / 2, w / 2, -d / 2 + 25, 40, h - 40, 1), box(-w / 2, -d / 2, w / 2, -d / 2 + 60, h - 40, h, 3)], { rooms: ['bedroom', 'kids'], slots: ['חזיתות', 'גוף', 'מסילה'], mats: ['lacquer-gloss', 'mdf-matte', 'aluminium'], lines: (_w, d) => [[0, -d / 2, 0, -d / 2 + 60]] }),
  I('wardrobe-corner', 'ארון פינתי', 'bedroom', 'ארונות', 'ארון פינתי L', [1600, 1600, 2400], 0, ['#d9d6cf', '#3a3f45'], 'mdf-matte', (w, d, h) => [poly([[-w / 2, d / 2], [w / 2, d / 2], [w / 2, d / 2 - 600], [-w / 2 + 600, d / 2 - 600], [-w / 2 + 600, -d / 2], [-w / 2, -d / 2]], 80, h, 1), poly([[-w / 2 + 40, d / 2 - 40], [w / 2 - 40, d / 2 - 40], [w / 2 - 40, d / 2 - 560], [-w / 2 + 560, d / 2 - 560], [-w / 2 + 560, -d / 2 + 40], [-w / 2 + 40, -d / 2 + 40]], 0, 80, 'dark')], { rooms: ['bedroom'], slots: ['חזיתות', 'בסיס'], mats: ['mdf-matte', null] }),
  I('vanity', 'שולחן איפור', 'bedroom', 'שולחנות', 'שולחן איפור טואלטקה מראה', [1100, 450, 1500], 0, ['#f5f5f2', '#c9dde6', '#c9a55a'], 'lacquer', (w, d) => [...legs(w, d, 720, 20, 35, 3), box(-w / 2, -d / 2, w / 2, d / 2, 720, 760, 1), box(-w / 2, -d / 2, w / 2, d / 2, 620, 720, 1), ...vdisk(0, 1150, 300, d / 2 - 30, d / 2, 'glass'), ...vdisk(0, 1150, 330, d / 2 - 20, d / 2 + 0.5, 3)], { rooms: ['bedroom'], slots: ['גוף', 'מראה', 'מסגרת'], mats: ['lacquer', null, 'brass'] }),
  I('mirror-standing', 'מראה עומדת', 'bedroom', 'מראות', 'מראה עומדת גוף', [600, 350, 1750], 0, ['#c9dde6', '#a9784a'], 'glass', (w, d, h) => [box(-w / 2, 0, w / 2, 30, 0, h, 2), box(-w / 2 + 30, -5, w / 2 - 30, 5, 30, h - 30, 'glass'), bc(-w / 2 + 30, d / 2 - 40, 30, 80, 0, h * 0.8, 2), bc(w / 2 - 30, d / 2 - 40, 30, 80, 0, h * 0.8, 2)], { rooms: ['bedroom', 'hall'], slots: ['מראה', 'מסגרת'], mats: [null, 'oak-natural'] }),
  I('bed-bench', 'ספסל לחדר שינה', 'bedroom', 'מיטות', 'ספסל מרגלות מיטה', [1300, 420, 470], 0, ['#c9b9a0', '#2f3134'], 'fabric', (w, d, h) => [...legs(w, d, h - 120, 30, 35, 2), box(-w / 2, -d / 2, w / 2, d / 2, h - 120, h, 1)], { rooms: ['bedroom', 'hall'], slots: ['ריפוד', 'רגליים'], mats: ['velvet', 'brass'] }),
  I('walkin', 'חדר ארונות מודולרי', 'bedroom', 'ארונות', 'חדר ארונות ווק אין מודולרי', [2400, 2000, 2400], 0, ['#d9cdb8', '#3a3f45', '#9aa1a8'], 'wood', (w, d, h) => {
    const t = 550, out: Part[] = [];
    const unit = (x0: number, y0: number, x1: number, y1: number) => { out.push(box(x0, y0, x1, y1, 0, 80, 'dark'), box(x0, y0, x1, y1, h - 30, h, 1)); for (const z of [80, 900, 1600]) out.push(box(x0, y0, x1, y1, z, z + 25, 1)); out.push(box(x0, y1 - 20, x1, y1, 0, h, 2)); };
    unit(-w / 2, d / 2 - t, w / 2, d / 2); unit(-w / 2, -d / 2, -w / 2 + t, d / 2 - t); unit(w / 2 - t, -d / 2, w / 2, d / 2 - t);
    out.push(box(-w / 2 + 40, d / 2 - t / 2 - 10, w / 2 - 40, d / 2 - t / 2 + 10, 1750, 1770, 3));
    return out;
  }, { rooms: ['bedroom'], slots: ['מדפים', 'גב', 'מוטות'], mats: ['oak-light', 'mdf-matte', 'chrome'] }),

  // ---------------------------------------------------------------- kitchens
  I('kitchen-straight', 'מטבח ישר', 'kitchen', 'מטבחים שלמים', 'מטבח ישר שורה', [3600, 600, 900], 0, ['#f2f0ec', '#3b3f44', '#9aa1a8'], 'lacquer', (w, d, h) => kitchenRun(-w / 2, w / 2, -d / 2, d, h, true, -w / 4, w / 4), { rooms: ['kitchen'], slots: ['חזיתות', 'משטח עבודה', 'ידיות'], mats: ['lacquer-gloss', 'quartz', 'chrome'], lines: (w, d) => doorLines(w, d, Math.round(w / 600)) }),
  I('kitchen-l', 'מטבח בצורת L', 'kitchen', 'מטבחים שלמים', 'מטבח L פינתי', [3200, 2400, 900], 0, ['#5f6a74', '#ece9e4', '#c9a55a'], 'mdf-matte', (w, d, h) => [
    ...kitchenRun(-w / 2, w / 2, d / 2 - 600, 600, h, true, 0, null),
    ...kitchenRun(-d / 2, d / 2 - 600, -w / 2, 600, h, false, null, -d / 6, 'yl'),
  ], { rooms: ['kitchen'], slots: ['חזיתות', 'משטח עבודה', 'ידיות'], mats: ['mdf-matte', 'marble-white', 'brass'] }),
  I('kitchen-u', 'מטבח בצורת U', 'kitchen', 'מטבחים שלמים', 'מטבח U', [3000, 2600, 900], 0, ['#e9e2d3', '#3b3f44', '#3a3f45'], 'wood', (w, d, h) => [
    ...kitchenRun(-w / 2, w / 2, d / 2 - 600, 600, h, true, 0, null),
    ...kitchenRun(-d / 2, d / 2 - 600, -w / 2, 600, h, false, null, 0, 'yl'),
    ...kitchenRun(-d / 2, d / 2 - 600, w / 2 - 600, 600, h, false, null, null, 'yr'),
  ], { rooms: ['kitchen'], slots: ['חזיתות', 'משטח עבודה', 'ידיות'], mats: ['oak-light', 'granite', 'steel-black'] }),
  I('kitchen-tall', 'ארון גבוה למטבח', 'kitchen', 'ארונות מטבח', 'ארון גבוה תנור בנוי', [600, 600, 2250], 0, ['#f5f5f2', '#9aa1a8', '#9aa1a8'], 'lacquer', (w, d, h) => [...cabinetBody(w, d, h, 100, 1), box(-w / 2 + 40, -d / 2 + 10, w / 2 - 40, -d / 2 + 20, 850, 1450, 'dark')], { rooms: ['kitchen'], slots: ['חזית', 'ידית'], mats: ['lacquer-gloss', 'chrome'] }),
  I('kitchen-drawers', 'יחידת מגירות', 'kitchen', 'ארונות מטבח', 'מגירות מגירה', [600, 600, 900], 0, ['#f5f5f2', '#3b3f44', '#9aa1a8'], 'lacquer', (w, d, h) => [box(-w / 2 + 30, -d / 2 + 60, w / 2 - 30, d / 2, 0, 100, 'dark'), box(-w / 2, -d / 2 + 20, w / 2, d / 2, 100, h - 40, 1), box(-w / 2, -d / 2, w / 2, d / 2, h - 40, h, 2), ...[300, 520, 740].map((z) => box(-120, -d / 2 + 5, 120, -d / 2 + 20, z, z + 20, 3))], { rooms: ['kitchen'], slots: ['חזית', 'משטח', 'ידיות'], mats: ['lacquer', 'quartz', 'chrome'], lines: (w, d) => [[-w / 2, -d / 2 + 20, w / 2, -d / 2 + 20]] }),
  I('pantry', 'ארון מזווה', 'kitchen', 'ארונות מטבח', 'מזווה ארון', [900, 600, 2250], 0, ['#e9e2d3', '#c9a55a', '#c9a55a'], 'wood', (w, d, h) => cabinetBody(w, d, h, 100, 2), { rooms: ['kitchen'], slots: ['חזיתות', 'ידיות'], mats: ['oak-light', 'brass'], lines: (w, d) => doorLines(w, d, 2) }),
  I('peninsula', 'חצי אי', 'kitchen', 'איים', 'חצי אי בר', [2000, 900, 900], 0, ['#2f3a44', '#ece9e4'], 'mdf-matte', (w, d, h) => [box(-w / 2, -d / 2 + 300, w / 2 - 50, d / 2, 0, 100, 'dark'), box(-w / 2, -d / 2 + 300, w / 2, d / 2, 100, h - 40, 1), box(-w / 2, -d / 2, w / 2 + 20, d / 2, h - 40, h, 2)], { rooms: ['kitchen'], slots: ['חזיתות', 'משטח'], mats: ['mdf-matte', 'quartz'] }),
  I('sink-double', 'כיור כפול', 'kitchen', 'כיורים וברזים', 'כיור כפול מטבח', [1160, 500, 10], 900, ['#c4c8cc', '#8e959c'], 'metal', (w, d, h) => [box(-w / 2, -d / 2, w / 2, d / 2, 0, h, 1), box(-w / 2 + 40, -d / 2 + 40, -20, d / 2 - 90, h, h + 3, 2), box(20, -d / 2 + 40, w / 2 - 40, d / 2 - 90, h, h + 3, 2), cyl(0, d / 2 - 45, 25, h, h + 320, 'metal')], { rooms: ['kitchen'], mount: 'surface', mats: ['chrome', 'metal'] }),
  I('faucet', 'ברז', 'kitchen', 'כיורים וברזים', 'ברז נשלף מטבח רחצה', [60, 240, 350], 900, ['#d9dde1', '#d9dde1'], 'chrome', (_w, d, h) => [cyl(0, d / 2 - 30, 28, 0, h, 1), box(-15, -d / 2, 15, d / 2 - 30, h - 40, h - 10, 1), cyl(0, -d / 2 + 20, 16, h - 100, h - 40, 1)], { rooms: ['kitchen', 'bath'], mount: 'surface', mats: ['chrome'] }),
  I('fridge-double', 'מקרר כפול (מקרר־מקפיא)', 'kitchen', 'מכשירי חשמל', 'מקרר כפול דלתות מקפיא', [910, 720, 1780], 0, ['#c4c8cc', '#8e959c', '#3a3f45'], 'metal', (w, d, h) => [box(-w / 2, -d / 2, w / 2, d / 2, 0, h, 1), bc(-30, -d / 2 - 15, 20, 30, 700, 1400, 3), bc(30, -d / 2 - 15, 20, 30, 700, 1400, 3)], { rooms: ['kitchen'], slots: ['גוף', 'משני', 'ידיות'], mats: ['metal', null, 'steel-black'], lines: (_w, d) => [[0, -d / 2, 0, -d / 2 + 60]] }),
  I('microwave', 'מיקרוגל', 'kitchen', 'מכשירי חשמל', 'מיקרוגל', [500, 380, 300], 0, ['#2f3134', '#8e959c'], 'metal', (w, d, h) => [box(-w / 2, -d / 2, w / 2, d / 2, 0, h, 1), box(-w / 2 + 30, -d / 2 - 3, w / 2 - 130, -d / 2, 40, h - 40, 'glass')], { rooms: ['kitchen'], mount: 'surface', mats: ['steel-black'] }),
  I('dishwasher', 'מדיח כלים', 'kitchen', 'מכשירי חשמל', 'מדיח כלים', [600, 600, 820], 0, ['#d9dde1', '#3a3f45'], 'metal', (w, d, h) => [box(-w / 2, -d / 2, w / 2, d / 2, 0, h, 1), box(-w / 2 + 50, -d / 2 - 20, w / 2 - 50, -d / 2, h - 110, h - 80, 2)], { rooms: ['kitchen'], mats: ['chrome'] }),
  I('hood', 'קולט אדים', 'kitchen', 'מכשירי חשמל', 'קולט אדים ארובה מנדף', [900, 500, 900], 1500, ['#c4c8cc', '#3a3f45'], 'metal', (w, d, h) => [box(-w / 2, -d / 2, w / 2, d / 2, 0, 120, 1), box(-w / 2 + 80, -d / 2 + 60, w / 2 - 80, d / 2, 120, 260, 1), bc(0, d / 2 - 150, 300, 260, 260, h, 1)], { rooms: ['kitchen'], mount: 'wall', above: true, mats: ['chrome'] }),
  I('dining-oval', 'שולחן אוכל אובלי', 'kitchen', 'שולחנות אוכל', 'שולחן אוכל אובלי אליפסה', [2000, 1000, 750], 0, ['#c29a6b', '#2f3134'], 'wood', (w, d, h) => [poly(ellipse(w / 2, d / 2), h - 35, h, 1), bc(-w / 4, 0, 80, d * 0.5, 0, h - 35, 2), bc(w / 4, 0, 80, d * 0.5, 0, h - 35, 2), bc(0, 0, w / 2, 60, 80, 120, 2)], { rooms: ['dining', 'kitchen'], slots: ['משטח', 'בסיס'], mats: ['oak-natural', 'steel-black'] }),
  I('dining-chair-uph', 'כיסא אוכל מרופד', 'kitchen', 'כיסאות', 'כיסא אוכל מרופד', [480, 540, 880], 0, ['#c9b9a0', '#6b4a33'], 'fabric', (w, d, h) => chairParts(w, d, h), { rooms: ['dining', 'kitchen'], slots: ['ריפוד', 'רגליים'], mats: ['velvet', 'walnut'] }),
  I('bar-stool', 'כיסא בר', 'kitchen', 'כיסאות', 'כיסא בר שרפרף גבוה', [420, 420, 1000], 0, ['#3a3f45', '#c9a55a'], 'leather', (w, _d, h) => [cyl(0, 0, w * 0.4, 0, 20, 2), cyl(0, 0, 25, 20, 720, 2), cyl(0, 0, w * 0.32, 300, 320, 2), cyl(0, 0, w / 2, 720, 780, 1), box(-w / 2 + 20, w / 2 - 40, w / 2 - 20, w / 2, 780, h, 1)], { rooms: ['kitchen', 'dining'], slots: ['מושב', 'רגל'], mats: ['leather', 'brass'] }),

  // ---------------------------------------------------------------- bathrooms and laundry
  I('bath-free', 'אמבטיה עומדת', 'bath', 'אמבטיות', 'אמבטיה עומדת חופשית', [1700, 800, 600], 0, ['#fafafa', '#e6eef2'], 'ceramic-white', (w, d, h) => [poly(ellipse(w / 2, d / 2, 32), 60, h, 1), poly(ellipse(w / 2 - 70, d / 2 - 70, 32), h - 8, h + 1, 2), ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sy]) => cyl((sx * w) / 3, (sy * d) / 4, 35, 0, 60, 'gold'))], { rooms: ['bath'], mats: ['ceramic-white', null] }),
  I('bath-corner', 'אמבטיה פינתית', 'bath', 'אמבטיות', 'אמבטיה פינתית', [1400, 1400, 560], 0, ['#fafafa', '#e6eef2'], 'ceramic-white', (w, d, h) => { const q = (r: number): [number, number][] => [[-w / 2, d / 2], ...Array.from({ length: 13 }, (_, i) => { const a = -Math.PI / 2 + (i * Math.PI) / 2 / 12; return [-w / 2 + Math.cos(a) * r * (w / d), d / 2 + Math.sin(a) * r] as [number, number]; })]; return [poly(q(d), 0, h - 5, 1), poly(q(d - 140).map(([x, y]) => [x + 50, y - 50] as [number, number]), h - 5, h, 2)]; }, { rooms: ['bath'] }),
  I('shower-rect', 'מקלחון מלבני', 'bath', 'מקלחונים', 'מקלחון מלבני מקלחת', [1200, 800, 2000], 0, ['#f0f0ee', '#a9cde0', '#c4c8cc'], 'ceramic', (w, d, h) => [box(-w / 2, -d / 2, w / 2, d / 2, 0, 40, 1), box(-w / 2, -d / 2, w / 2, -d / 2 + 10, 40, h, 'glass'), box(-w / 2, -d / 2, -w / 2 + 10, d / 2, 40, h, 'glass'), cyl(w / 2 - 150, d / 2 - 60, 110, h - 100, h - 90, 3)], { rooms: ['bath'], slots: ['מגש', 'זכוכית', 'ראש מקלחת'], mats: ['ceramic-white', null, 'chrome'], lines: (w, d) => [[-w / 2, -d / 2, w / 2, d / 2], [-w / 2, d / 2, w / 2, -d / 2]] }),
  I('shower-corner', 'מקלחון פינתי', 'bath', 'מקלחונים', 'מקלחון פינתי עגול', [900, 900, 2000], 0, ['#f0f0ee', '#a9cde0'], 'ceramic', (w, d, h) => {
    const arc: [number, number][] = Array.from({ length: 9 }, (_, i) => { const a = Math.PI + (i * Math.PI) / 2 / 8; return [w / 2 + Math.cos(a) * w, d / 2 + Math.sin(a) * d] as [number, number]; });
    const out: Part[] = [poly([[w / 2, d / 2], ...arc], 0, 40, 1)];
    for (let i = 0; i + 1 < arc.length; i++) { const [x0, y0] = arc[i], [x1, y1] = arc[i + 1]; const nx = (y1 - y0), ny = -(x1 - x0), L = Math.hypot(nx, ny) || 1; const t = 5; out.push(poly([[x0, y0], [x1, y1], [x1 + (nx / L) * t, y1 + (ny / L) * t], [x0 + (nx / L) * t, y0 + (ny / L) * t]], 40, h, 'glass')); }
    return out;
  }, { rooms: ['bath'] }),
  I('toilet-wall', 'אסלה תלויה', 'bath', 'אסלות', 'אסלה תלויה סמויה', [370, 540, 800], 0, ['#fafafa', '#e6e6e3'], 'ceramic-white', (w, d, h) => [box(-w / 2 - 100, d / 2 - 150, w / 2 + 100, d / 2, 0, h + 300, 2), cyl(0, -d / 2 + w / 2, w / 2, 230, 420, 1), box(-w / 2, -d / 2 + w / 2, w / 2, d / 2 - 150, 230, 420, 1), box(-80, d / 2 - 152, 80, d / 2 - 150, h + 100, h + 260, 'metal')], { rooms: ['bath'], slots: ['אסלה', 'קיר גבס'], note: 'מסגרת סמויה בקיר בהמחשה.' }),
  I('basin-double', 'כיור כפול עם ארון', 'bath', 'כיורים', 'כיור כפול ארון אמבטיה', [1400, 500, 850], 0, ['#a9784a', '#fafafa', '#c9a55a'], 'wood', (w, d, h) => [box(-w / 2, -d / 2, w / 2, d / 2, 300, h - 30, 1), box(-w / 2, -d / 2, w / 2, d / 2, h - 30, h, 2), cyl(-w / 4, -20, 170, h, h + 3, 'light'), cyl(w / 4, -20, 170, h, h + 3, 'light'), cyl(-w / 4, d / 2 - 50, 18, h, h + 220, 3), cyl(w / 4, d / 2 - 50, 18, h, h + 220, 3)], { rooms: ['bath'], slots: ['ארון', 'משטח', 'ברזים'], mats: ['walnut', 'ceramic-white', 'brass'], lines: (w, d) => doorLines(w, d, 4) }),
  I('mirror-round', 'מראה עגולה', 'bath', 'מראות', 'מראה עגולה', [700, 30, 700], 1050, ['#c9dde6', '#c9a55a'], 'glass', (w, d) => [...vdisk(0, w / 2, w / 2, -d / 2, d / 2 - 5, 2), ...vdisk(0, w / 2, w / 2 - 25, -d / 2 - 2, -d / 2 + 2, 'glass')], { rooms: ['bath', 'hall', 'bedroom'], mount: 'wall', slots: ['מראה', 'מסגרת'], mats: [null, 'brass'] }),
  I('mirror-lit', 'מראה מוארת', 'bath', 'מראות', 'מראה מוארת לד', [900, 40, 800], 1000, ['#c9dde6', '#fff3c8'], 'glass', (w, d, h) => [box(-w / 2, -d / 2 + 10, w / 2, d / 2, 0, h, 'lamp'), box(-w / 2 + 30, -d / 2, w / 2 - 30, -d / 2 + 10, 30, h - 30, 'glass')], { rooms: ['bath'], mount: 'wall', light: { type: 'strip', z: 400, power: 0.25 } }),
  I('towel-rail', 'מתלה מגבות', 'bath', 'אביזרים', 'מתלה מגבות סולם', [550, 80, 900], 600, ['#d9dde1', '#d9dde1'], 'chrome', (w, d, h) => [bc(-w / 2 + 15, 0, 30, d, 0, h, 1), bc(w / 2 - 15, 0, 30, d, 0, h, 1), ...[0.1, 0.3, 0.5, 0.7, 0.9].map((t) => box(-w / 2, -15, w / 2, 15, h * t, h * t + 22, 1))], { rooms: ['bath'], mount: 'wall', mats: ['chrome'] }),
  I('bath-shelves', 'מדפים לחדר רחצה', 'bath', 'אביזרים', 'מדפים מדף אמבטיה', [600, 200, 700], 1100, ['#a9784a', '#fafafa'], 'wood', (w, d, h) => [0, 0.5, 1].map((t) => box(-w / 2, -d / 2, w / 2, d / 2, (h - 25) * t, (h - 25) * t + 25, 1)), { rooms: ['bath', 'kitchen', 'living'], mount: 'wall', mats: ['teak'] }),
  I('washer', 'מכונת כביסה', 'bath', 'כביסה', 'מכונת כביסה', [600, 600, 850], 0, ['#f5f5f2', '#a9cde0', '#3a3f45'], 'lacquer', (w, d, h) => [box(-w / 2, -d / 2, w / 2, d / 2, 0, h, 1), ...vdisk(0, h * 0.45, w * 0.3, -d / 2 - 15, -d / 2, 3), ...vdisk(0, h * 0.45, w * 0.22, -d / 2 - 18, -d / 2 - 14, 'glass'), box(-w / 2 + 30, -d / 2 - 5, w / 2 - 30, -d / 2, h - 110, h - 30, 3)], { rooms: ['bath'], mats: ['lacquer', null, 'steel-black'] }),
  I('dryer', 'מייבש כביסה', 'bath', 'כביסה', 'מייבש כביסה', [600, 600, 850], 0, ['#f5f5f2', '#a9cde0', '#9aa1a8'], 'lacquer', (w, d, h) => [box(-w / 2, -d / 2, w / 2, d / 2, 0, h, 1), ...vdisk(0, h * 0.5, w * 0.34, -d / 2 - 12, -d / 2, 3), box(-w / 2 + 30, -d / 2 - 5, w / 2 - 30, -d / 2, h - 100, h - 40, 'dark')], { rooms: ['bath'], mats: ['lacquer', null, 'chrome'] }),
  I('laundry-basket', 'סל כביסה', 'bath', 'כביסה', 'סל כביסה סלסלה', [450, 450, 600], 0, ['#c9a86f', '#e8e2d6'], 'rattan', (w, _d, h) => [cyl(0, 0, w / 2, 0, h, 1), cyl(0, 0, w / 2 - 15, h - 2, h + 1, 2)], { rooms: ['bath', 'bedroom'], mats: ['rattan'] }),

  // ---------------------------------------------------------------- work and study
  I('desk-computer', 'שולחן מחשב', 'office', 'שולחנות', 'שולחן מחשב עבודה מסך', [1400, 700, 750], 0, ['#ece9e4', '#2f3134', '#1e2227'], 'wood', (w, d, h) => [...legs(w, d, h - 30, 30, 40, 2), box(-w / 2, -d / 2, w / 2, d / 2, h - 30, h, 1), bc(0, d / 2 - 120, 620, 30, h, h + 380, 3), bc(0, d / 2 - 100, 200, 160, h, h + 15, 3), bc(0, -d / 2 + 220, 450, 150, h, h + 20, 3)], { rooms: ['office', 'kids', 'bedroom'], slots: ['משטח', 'רגליים', 'מחשב'], mats: ['oak-white', 'steel-black', null] }),
  I('desk-corner', 'שולחן פינתי', 'office', 'שולחנות', 'שולחן פינתי L עבודה', [1600, 1400, 750], 0, ['#c29a6b', '#2f3134'], 'wood', (w, d, h) => [poly([[-w / 2, d / 2], [w / 2, d / 2], [w / 2, d / 2 - 650], [-w / 2 + 650, d / 2 - 650], [-w / 2 + 650, -d / 2], [-w / 2, -d / 2]], h - 30, h, 1), bc(-w / 2 + 30, -d / 2 + 30, 40, 40, 0, h - 30, 2), bc(w / 2 - 30, d / 2 - 30, 40, 40, 0, h - 30, 2), bc(-w / 2 + 30, d / 2 - 30, 40, 40, 0, h - 30, 2), bc(w / 2 - 30, d / 2 - 620, 40, 40, 0, h - 30, 2), bc(-w / 2 + 620, -d / 2 + 30, 40, 40, 0, h - 30, 2)], { rooms: ['office'], slots: ['משטח', 'רגליים'], mats: ['oak-natural', 'steel-black'] }),
  I('file-cabinet', 'ארון מסמכים', 'office', 'אחסון', 'ארון מסמכים מגירות תיוק', [450, 600, 1300], 0, ['#9aa1a8', '#2f3134'], 'metal', (w, d, h) => [box(-w / 2, -d / 2, w / 2, d / 2, 0, h, 1), ...[0.2, 0.45, 0.7, 0.93].map((t) => box(-90, -d / 2 - 15, 90, -d / 2, h * t - 20, h * t, 2))], { rooms: ['office'], mats: ['metal', 'steel-black'], lines: (w, d) => [[-w / 2, -d / 2 + 15, w / 2, -d / 2 + 15]] }),
  I('wall-shelving', 'מדפים לקיר', 'office', 'אחסון', 'מדפים מערכת מדפים קיר', [1600, 300, 1800], 0, ['#c29a6b', '#2f3134'], 'wood', (w, d, h) => { const out: Part[] = [bc(-w / 2 + 15, d / 2 - 10, 30, 20, 0, h, 2), bc(0, d / 2 - 10, 30, 20, 0, h, 2), bc(w / 2 - 15, d / 2 - 10, 30, 20, 0, h, 2)]; for (let i = 0; i < 5; i++) out.push(box(-w / 2, -d / 2, w / 2, d / 2, 200 + ((h - 230) * i) / 4, 230 + ((h - 230) * i) / 4, 1)); return out; }, { rooms: ['office', 'living', 'kids'], mount: 'wall', slots: ['מדפים', 'מסילות'], mats: ['oak-natural', 'steel-black'] }),
  I('whiteboard', 'לוח כתיבה', 'office', 'אביזרים', 'לוח כתיבה מחיק לוח לבן', [1500, 30, 1000], 900, ['#ffffff', '#c4c8cc'], 'lacquer', (w, d, h) => [box(-w / 2, -d / 2, w / 2, d / 2, 0, h, 2), box(-w / 2 + 25, -d / 2 - 3, w / 2 - 25, -d / 2, 25, h - 25, 1), box(-w / 2 + 25, -d / 2 - 60, w / 2 - 25, -d / 2, 0, 20, 2)], { rooms: ['office', 'kids'], mount: 'wall' }),
  I('monitor', 'מסך מחשב', 'office', 'אביזרים', 'מסך מחשב צג', [620, 200, 450], 0, ['#1e2227', '#3a3f45'], 'steel-black', (w, _d, h) => [bc(0, 30, 200, 150, 0, 15, 2), bc(0, 60, 40, 30, 15, h - 300, 2), box(-w / 2, -10 + 40, w / 2, 20 + 40, h - 360, h, 1)], { rooms: ['office'], mount: 'surface', mats: ['steel-black', 'steel-black'] }),

  // ---------------------------------------------------------------- accessories and decor
  I('wall-art', 'תמונת קיר', 'decor', 'קיר', 'תמונה ציור קנבס קיר', [900, 30, 650], 1300, ['#4f7fa8', '#2f3134'], 'fabric', (w, d, h) => [box(-w / 2, -d / 2, w / 2, d / 2, 0, h, 2), box(-w / 2 + 30, -d / 2 - 2, w / 2 - 30, -d / 2 + 2, 30, h - 30, 1)], { rooms: ['living', 'bedroom', 'hall', 'dining'], mount: 'wall', slots: ['תמונה', 'מסגרת'], mats: ['wp-tropical', 'steel-black'] }),
  I('frame-table', 'מסגרת תמונה שולחנית', 'decor', 'שולחן ומדף', 'מסגרת תמונה שולחנית', [200, 60, 250], 0, ['#e9e2d3', '#c9a55a'], 'wood', (w, d, h) => [box(-w / 2, -d / 2 + 20, w / 2, -d / 2 + 35, 0, h, 2), box(-w / 2 + 20, -d / 2 + 18, w / 2 - 20, -d / 2 + 20, 20, h - 20, 1), bc(0, d / 2 - 20, 20, 30, 0, h * 0.6, 2)], { mount: 'surface', slots: ['תמונה', 'מסגרת'] }),
  I('poster', 'פוסטר', 'decor', 'קיר', 'פוסטר הדפס', [500, 10, 700], 1300, ['#e07a5f', '#f4f1ea'], 'fabric', (w, d, h) => [box(-w / 2, -d / 2, w / 2, d / 2, 0, h, 2), box(-w / 2 + 30, -d / 2 - 1, w / 2 - 30, -d / 2 + 1, 120, h - 30, 1)], { mount: 'wall', slots: ['הדפס', 'רקע'], mats: ['wp-modern', null] }),
  I('wall-clock', 'שעון קיר', 'decor', 'קיר', 'שעון קיר', [400, 40, 400], 1700, ['#f5f5f2', '#2f3134'], 'lacquer', (w, d) => [...vdisk(0, w / 2, w / 2, -d / 2, d / 2, 2), ...vdisk(0, w / 2, w / 2 - 20, -d / 2 - 2, -d / 2 + 1, 1), { t: 'box', x0: -6, x1: 6, y0: -d / 2 - 4, y1: -d / 2 - 2, z0: w / 2, z1: w / 2 + w * 0.35, c: 2 }, { t: 'box', x0: 0, x1: w * 0.25, y0: -d / 2 - 4, y1: -d / 2 - 2, z0: w / 2 - 6, z1: w / 2 + 6, c: 2 }], { mount: 'wall', slots: ['לוח', 'מסגרת ומחוגים'] }),
  I('mirror-deco', 'מראת נוי', 'decor', 'קיר', 'מראה נוי דקורטיבית שמש', [800, 40, 800], 1200, ['#c9dde6', '#c9a55a'], 'glass', (w, d) => { const out: Part[] = [...vdisk(0, w / 2, w * 0.3, -d / 2 - 2, -d / 2 + 2, 'glass', 14)]; for (let i = 0; i < 16; i++) { const a = (i * Math.PI) / 8; const r0 = w * 0.32, r1 = w / 2; const x = Math.cos(a), z = Math.sin(a); out.push({ t: 'slice', x0: Math.min(x * r0, x * r1) - 8, x1: Math.max(x * r0, x * r1) + 8, y0: -d / 2, y1: d / 2, b0: w / 2 + Math.min(z * r0, z * r1) - 8, b1: w / 2 + Math.min(z * r0, z * r1) - 8, t0: w / 2 + Math.max(z * r0, z * r1) + 8, t1: w / 2 + Math.max(z * r0, z * r1) + 8, c: 2 }); } return out; }, { mount: 'wall', slots: ['מראה', 'קרניים'], mats: [null, 'brass'] }),
  I('sculpture-table', 'פסל שולחני', 'decor', 'שולחן ומדף', 'פסל שולחני דקורטיבי', [180, 180, 350], 0, ['#ece9e4', '#2f3134'], 'marble', (w, _d, h) => [bc(0, 0, w, w, 0, 40, 2), ...stack(0, 0, 40, h, (t) => (w / 2) * (0.35 + 0.65 * Math.abs(Math.sin(t * Math.PI * 1.5))), 8, 1)], { mount: 'surface', slots: ['פסל', 'בסיס'], mats: ['marble-white', 'steel-black'] }),
  I('sculpture-floor', 'פסל רצפתי', 'decor', 'רצפה', 'פסל גדול רצפתי', [500, 500, 1500], 0, ['#b56f45', '#3a3f45'], 'copper', (w, _d, h) => [bc(0, 0, w, w, 0, 80, 2), ...stack(0, 0, 80, h, (t) => (w / 2) * (0.25 + 0.5 * Math.abs(Math.sin(t * Math.PI * 2.2))), 12, 1)], { slots: ['פסל', 'בסיס'], mats: ['copper', 'concrete'] }),
  I('vase', 'אגרטל', 'decor', 'שולחן ומדף', 'אגרטל כד', [220, 220, 380], 0, ['#4f7397', '#4f7397'], 'ceramic-white', (w, _d, h) => stack(0, 0, 0, h, (t) => (w / 2) * (0.45 + 0.55 * Math.sin(t * Math.PI) - (t > 0.85 ? 0.25 : 0)), 8, 1), { mount: 'surface', mats: ['tile-blue'] }),
  I('plant-small', 'עציץ קטן', 'decor', 'צמחים', 'עציץ קטן צמח שולחני', [250, 250, 350], 0, ['#5b8f4a', '#d8cfc0'], 'plant', (w, _d, h) => plantParts(w, h, 0.4), { mount: 'surface', slots: ['עלווה', 'עציץ'], mats: [null, 'terrazzo-chips'] }),
  I('plant-large', 'עציץ גדול (פיקוס)', 'decor', 'צמחים', 'עציץ גדול צמח פיקוס כינורי', [800, 800, 1800], 0, ['#4f7f3f', '#e9e4da'], 'plant', (w, _d, h) => [...stack(0, 0, 0, 450, (t) => w * (0.24 + 0.04 * t), 3, 2), cyl(0, 0, 25, 450, h * 0.7, 'dark'), ...stack(-w * 0.12, 0, h * 0.45, h * 0.8, (t) => w * 0.3 * Math.sin(t * Math.PI), 4, 'leaf'), ...stack(w * 0.1, w * 0.08, h * 0.6, h, (t) => w * 0.32 * Math.sin(t * Math.PI), 4, 'leaf')], { rooms: ['living', 'office', 'hall'], slots: ['עלווה', 'עציץ'], mats: [null, 'concrete'] }),
  I('flowers-vase', 'פרחים באגרטל', 'decor', 'צמחים', 'פרחים זר אגרטל', [300, 300, 550], 0, ['#e07a9a', '#f5f5f2'], 'ceramic-white', (w, _d, h) => [...stack(0, 0, 0, h * 0.4, (t) => w * 0.18 * (1 - 0.3 * t), 3, 2), cyl(0, 0, 12, h * 0.4, h * 0.75, 'leaf'), ...[[-1, 0], [1, 0], [0, 1], [0, -1], [0, 0]].map(([sx, sy]) => cyl(sx * w * 0.18, sy * w * 0.18, w * 0.13, h * 0.75, h, 1))], { mount: 'surface', slots: ['פרחים', 'אגרטל'] }),
  I('plant-snake', 'צמח פנים (סנסיווריה)', 'decor', 'צמחים', 'צמח פנים סנסיווריה לשון חמות', [350, 350, 900], 0, ['#3f6f3a', '#2f3134'], 'plant', (w, _d, h) => [...stack(0, 0, 0, 300, () => w * 0.4, 2, 2), ...[[-0.15, 0, 1], [0.12, 0.08, 0.85], [0, -0.12, 0.95], [0.18, -0.1, 0.7], [-0.1, 0.15, 0.8]].map(([x, y, s]) => bc(x * w, y * w, w * 0.1, 18, 300, 300 + (h - 300) * s, 'leaf'))], { rooms: ['living', 'bedroom', 'office'], slots: ['עלווה', 'עציץ'], mats: [null, 'concrete'] }),
  I('cushions', 'כריות נוי', 'decor', 'טקסטיל', 'כריות נוי כרית', [1200, 200, 450], 450, ['#d27a68', '#e0b04a', '#8a9aa5'], 'velvet', (w, d, h) => [bc(-w / 3, 0, 420, d, 0, h, 1), bc(0, 0, 400, d, 0, h * 0.9, 2), bc(w / 3, 0, 420, d, 0, h, 3)], { mount: 'surface', slots: ['כרית 1', 'כרית 2', 'כרית 3'], mats: ['velvet', 'linen', 'velvet'] }),
  I('throw', 'שמיכת נוי', 'decor', 'טקסטיל', 'שמיכה פלייד', [1300, 500, 30], 450, ['#b8a27e', '#b8a27e'], 'linen', (w, d, h) => [box(-w / 2, -d / 2, w / 2, d / 2, 0, h, 1), box(-w / 2, -d / 2, -w / 2 + 25, d / 2, -350, 0, 1)], { mount: 'surface', mats: ['linen'] }),
  I('rug-round', 'שטיח עגול', 'decor', 'טקסטיל', 'שטיח עגול', [2000, 2000, 10], 0, ['#c9b9a0', '#8a7a68'], 'carpet', (w, _d, h) => [cyl(0, 0, w / 2, 0, h, 1), cyl(0, 0, w / 2 - 150, h, h + 1, 2)], { rooms: ['living', 'bedroom', 'kids', 'dining'], mats: ['carpet', 'carpet'] }),
  I('rug-oval', 'שטיח אובלי', 'decor', 'טקסטיל', 'שטיח אובלי אליפסה', [2400, 1600, 10], 0, ['#8a9aa5', '#e8e2d6'], 'carpet', (w, d, h) => [poly(ellipse(w / 2, d / 2, 32), 0, h, 1), poly(ellipse(w / 2 - 150, d / 2 - 150, 32), h, h + 1, 2)], { rooms: ['living', 'bedroom'], mats: ['carpet', 'carpet'] }),
  I('blind-roller', 'וילון גלילה', 'decor', 'חלונות', 'וילון גלילה רולר', [1300, 80, 1500], 900, ['#e8e2d6', '#c4c8cc'], 'linen', (w, d, h) => [box(-w / 2, -d / 2, w / 2, d / 2, h - 90, h, 2), box(-w / 2 + 20, -5, w / 2 - 20, 5, h * 0.35, h - 90, 1), box(-w / 2 + 20, -12, w / 2 - 20, 12, h * 0.35 - 30, h * 0.35, 2)], { mount: 'wall', slots: ['בד', 'מנגנון'], mats: ['linen', 'aluminium'] }),
  I('blinds', 'תריס ונציאני', 'decor', 'חלונות', 'תריס תריסים ונציאני רפפות', [1300, 60, 1300], 900, ['#f5f5f2', '#c4c8cc'], 'aluminium', (w, d, h) => { const out: Part[] = [box(-w / 2, -d / 2, w / 2, d / 2, h - 50, h, 2)]; for (let z = 30; z < h - 60; z += 50) out.push(box(-w / 2 + 10, -d / 2 + 5, w / 2 - 10, d / 2 - 5, z, z + 8, 1)); return out; }, { mount: 'wall', mats: ['aluminium', 'aluminium'] }),
  I('books', 'ספרים', 'decor', 'שולחן ומדף', 'ספרים ערימת ספרים', [300, 220, 160], 0, ['#4f7397', '#c96f5a', '#e0b04a'], 'paint', (w, d) => [bc(0, 0, w, d, 0, 45, 1), bc(10, -5, w * 0.9, d * 0.92, 45, 85, 2), bc(-8, 4, w * 0.82, d * 0.88, 85, 120, 3), bc(4, 0, w * 0.75, d * 0.8, 120, 160, 1)], { mount: 'surface', slots: ['כריכה 1', 'כריכה 2', 'כריכה 3'] }),
  I('bowl', 'קערת נוי', 'decor', 'שולחן ומדף', 'קערת נוי קערה', [350, 350, 120], 0, ['#2f3134', '#c9a55a'], 'ceramic-white', (w, _d, h) => [cyl(0, 0, w * 0.22, 0, 20, 1), cyl(0, 0, w * 0.4, 20, h * 0.6, 1), cyl(0, 0, w / 2, h * 0.6, h, 1), cyl(0, 0, w / 2 - 15, h - 2, h + 1, 2)], { mount: 'surface' }),
  I('candles', 'נרות דקורטיביים', 'decor', 'שולחן ומדף', 'נרות נר פמוט', [250, 120, 260], 0, ['#f4f1ea', '#c9a55a'], 'paint', (w, _d, h) => [cyl(-w / 3, 0, 30, 0, h, 1), cyl(0, 0, 35, 0, h * 0.75, 1), cyl(w / 3, 0, 30, 0, h * 0.55, 1), cyl(-w / 3, 0, 8, h, h + 25, 'lamp'), cyl(0, 0, 8, h * 0.75, h * 0.75 + 25, 'lamp'), cyl(w / 3, 0, 8, h * 0.55, h * 0.55 + 25, 'lamp')], { mount: 'surface', light: { type: 'point', z: 280, power: 0.08, decorative: true } }),
  I('basket', 'סלסלה', 'decor', 'רצפה', 'סלסלה סל אחסון', [400, 400, 350], 0, ['#c9a86f', '#7a5a3c'], 'rattan', (w, _d, h) => [cyl(0, 0, w / 2, 0, h, 1), cyl(0, 0, w / 2 - 12, h - 2, h + 1, 'soil')], { mats: ['rattan'] }),
  I('coat-rack', 'מתלה מעילים', 'decor', 'רצפה', 'מתלה מעילים קולב עומד', [500, 500, 1800], 0, ['#6b4a33', '#c9a55a'], 'wood', (w, _d, h) => [cyl(0, 0, w * 0.4, 0, 25, 1), cyl(0, 0, 22, 25, h, 1), ...[0, 1, 2, 3].map((i) => { const a = (i * Math.PI) / 2; return bc(Math.cos(a) * 90, Math.sin(a) * 90, 30, 30, h - 220, h - 190, 2); })], { rooms: ['hall', 'bedroom'], slots: ['עמוד', 'ווים'], mats: ['walnut', 'brass'] }),
  I('shelf-books', 'מדף צף עם ספרים', 'decor', 'קיר', 'מדף צף ספרים', [1200, 250, 260], 1300, ['#a9784a', '#4f7397', '#c96f5a'], 'wood', (w, d) => { const out: Part[] = [box(-w / 2, -d / 2, w / 2, d / 2, 0, 35, 1)]; let x = -w / 2 + 40; let i = 0; while (x < w / 4) { const bw = 30 + (i % 3) * 8, bh = 170 + (i % 4) * 25; out.push(box(x, -d / 2 + 30, x + bw, d / 2 - 20, 35, 35 + bh, i % 2 ? 2 : 3)); x += bw + 3; i++; } return out; }, { mount: 'wall', slots: ['מדף', 'ספרים', 'ספרים'], mats: ['oak-natural', null, null] }),
  I('screen-slats', 'מחיצת סרגלים', 'decor', 'רצפה', 'מחיצה דקורטיבית סרגלים פרגוד', [1600, 300, 2400], 0, ['#a67b52', '#2f3134'], 'wood', (w, d, h) => { const out: Part[] = [box(-w / 2, -d / 2, w / 2, d / 2, 0, 40, 2), box(-w / 2, -d / 2, w / 2, d / 2, h - 40, h, 2)]; const n = Math.max(3, Math.round(w / 120)); for (let i = 0; i < n; i++) { const x = -w / 2 + 30 + ((w - 60) * i) / (n - 1); out.push(bc(x, 0, 40, d * 0.6, 40, h - 40, 1)); } return out; }, { rooms: ['living', 'hall', 'office'], slots: ['סרגלים', 'מסגרת'], mats: ['wood-slats', 'steel-black'] }),

  // ---------------------------------------------------------------- lighting
  I('chandelier', 'נברשת', 'lighting', 'תאורת תקרה', 'נברשת גוף תאורה תלוי מפואר', [900, 900, 900], 1800, ['#c9a55a', '#fff3c8'], 'brass', (w, _d, h) => { const out: Part[] = [cyl(0, 0, 10, h * 0.45, h, 1), cyl(0, 0, w * 0.12, h * 0.3, h * 0.45, 1), cyl(0, 0, w * 0.1, h * 0.1, h * 0.3, 1)]; for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4, r = w * 0.4; out.push(bc(Math.cos(a) * r / 2, Math.sin(a) * r / 2, Math.abs(Math.cos(a)) * r + 15, Math.abs(Math.sin(a)) * r + 15, h * 0.3, h * 0.33, 1), cyl(Math.cos(a) * r, Math.sin(a) * r, 22, h * 0.33, h * 0.45, 'lamp')); } return out; }, { rooms: ['living', 'dining'], mount: 'ceiling', above: true, light: { type: 'point', z: 400, power: 1 } }),
  I('pendant', 'מנורה תלויה', 'lighting', 'תאורת תקרה', 'מנורה תלויה גוף תאורה תלוי פנדנט', [380, 380, 800], 1900, ['#2f3134', '#fff3c8'], 'steel-black', (w, _d, h) => [cyl(0, 0, 6, 250, h, 1), ...lampShade(0, 0, 40, 250, w / 2, w * 0.12, 4), cyl(0, 0, w * 0.3, 20, 40, 'lamp')], { rooms: ['dining', 'kitchen', 'living', 'bedroom'], mount: 'ceiling', above: true, light: { type: 'spot', z: 30, power: 0.6 } }),
  I('ceiling-flush', 'מנורת תקרה צמודה', 'lighting', 'תאורת תקרה', 'מנורת תקרה צמודה פלפון', [500, 500, 120], 2580, ['#f5f5f2', '#fff3c8'], 'lacquer', (w, _d, h) => [cyl(0, 0, w / 2, 40, h, 1), cyl(0, 0, w / 2 - 20, 0, 40, 'lamp')], { mount: 'ceiling', above: true, light: { type: 'point', z: 20, power: 0.7 } }),
  I('spots', 'ספוטים (פס)', 'lighting', 'תאורת תקרה', 'ספוטים ספוט מסילה', [1200, 100, 200], 2500, ['#2f3134', '#fff3c8'], 'steel-black', (w, _d, h) => [bc(0, 0, w, 40, h - 40, h, 1), ...[-w / 3, 0, w / 3].map((x) => cyl(x, 0, 40, 40, h - 40, 1)), ...[-w / 3, 0, w / 3].map((x) => cyl(x, 0, 30, 30, 40, 'lamp'))], { mount: 'ceiling', above: true, light: { type: 'spot', z: 30, power: 0.6 } }),
  I('led-strip', 'פס לד', 'lighting', 'תאורה דקורטיבית', 'פס לד סטריפ', [2000, 30, 15], 2400, ['#fff3c8', '#c4c8cc'], 'aluminium', (w, d, h) => [box(-w / 2, -d / 2, w / 2, d / 2, 0, h, 'lamp')], { mount: 'wall', above: true, light: { type: 'strip', z: 0, power: 0.35 } }),
  I('sconce', 'מנורת קיר', 'lighting', 'תאורת קיר', 'מנורת קיר אפליק', [200, 200, 300], 1700, ['#c9a55a', '#fff3c8'], 'brass', (w, d, h) => [bc(0, d / 2 - 10, 100, 20, h * 0.3, h * 0.7, 1), bc(0, 0, 30, d - 20, h * 0.45, h * 0.52, 1), ...lampShade(0, -d / 4, h * 0.4, h, w * 0.3, w / 2, 3), cyl(0, -d / 4, w * 0.2, h * 0.38, h * 0.42, 'lamp')], { rooms: ['living', 'bedroom', 'hall', 'bath'], mount: 'wall', above: true, light: { type: 'point', z: 200, power: 0.35 } }),
  I('lamp-table', 'מנורת שולחן', 'lighting', 'תאורה ניידת', 'מנורת שולחן לילה אבאז׳ור', [300, 300, 480], 0, ['#f4f1ea', '#c9a55a'], 'linen', (w, _d, h) => [cyl(0, 0, w * 0.3, 0, 25, 2), ...stack(0, 0, 25, h * 0.5, (t) => w * (0.12 + 0.1 * Math.sin(t * Math.PI)), 3, 2), ...lampShade(0, 0, h * 0.5, h, w / 2, w * 0.38, 3), cyl(0, 0, w * 0.2, h * 0.5, h * 0.52, 'lamp')], { mount: 'surface', light: { type: 'point', z: 300, power: 0.3 } }),
  I('lamp-arc', 'מנורת קריאה (קשת)', 'lighting', 'תאורה ניידת', 'מנורת קריאה עומדת קשת', [1500, 400, 2000], 0, ['#2f3134', '#f4f1ea'], 'steel-black', (w, _d, h) => [bc(-w / 2 + 200, 0, 350, 350, 0, 40, 1), bc(-w / 2 + 200, 0, 30, 30, 40, h - 200, 1), { t: 'slice', x0: -w / 2 + 200, x1: w / 2 - 250, y0: -15, y1: 15, b0: h - 200, b1: h - 120, t0: h - 170, t1: h - 90, c: 1 }, ...lampShade(w / 2 - 250, 0, h - 450, h - 120, 200, 90, 3), cyl(w / 2 - 250, 0, 120, h - 470, h - 450, 'lamp')], { rooms: ['living', 'bedroom', 'office'], light: { type: 'spot', z: 1550, power: 0.5 } }),
  I('downlight', 'תאורה שקועה', 'lighting', 'תאורת תקרה', 'תאורה שקועה ספוט שקוע דאונלייט', [120, 120, 20], 2680, ['#f5f5f2', '#fff3c8'], 'lacquer', (w, _d, h) => [cyl(0, 0, w / 2, 5, h, 1), cyl(0, 0, w / 2 - 15, 0, 5, 'lamp')], { mount: 'ceiling', above: true, light: { type: 'spot', z: 0, power: 0.4 } }),
  I('island-pendants', 'תאורה מעל אי מטבח', 'lighting', 'תאורת תקרה', 'תאורה אי מטבח שלוש מנורות תלויות', [1800, 250, 900], 1800, ['#2f3134', '#fff3c8'], 'steel-black', (w, _d, h) => [bc(0, 0, w, 30, h - 20, h, 1), ...[-w / 3, 0, w / 3].flatMap((x) => [cyl(x, 0, 5, 220, h - 20, 1), ...lampShade(x, 0, 30, 220, 150, 40, 3), cyl(x, 0, 90, 10, 30, 'lamp')])], { rooms: ['kitchen', 'dining'], mount: 'ceiling', above: true, light: { type: 'spot', z: 20, power: 0.8 } }),
  I('globe-lights', 'מנורות כדור דקורטיביות', 'lighting', 'תאורה דקורטיבית', 'מנורות כדור דקורטיביות תאורה דקורטיבית', [600, 600, 900], 1700, ['#fff3c8', '#c9a55a'], 'glass', (w, _d, h) => [cyl(0, 0, 60, h - 30, h, 2), ...[[0, 0, 0.3], [-0.3, 0.1, 0.55], [0.28, -0.12, 0.45], [0.05, 0.3, 0.7]].flatMap(([x, y, t]) => [cyl(x * w, y * w, 3, h * t, h - 30, 2), ...stack(x * w, y * w, h * t - 180, h * t, (s) => 90 * Math.sqrt(Math.max(0.05, 1 - (2 * s - 1) * (2 * s - 1))), 4, 'lamp')])], { mount: 'ceiling', above: true, light: { type: 'point', z: 400, power: 0.4, decorative: true } }),

  // ---------------------------------------------------------------- architectural elements
  I('arch-gate', 'שער קשתי (קשת עומדת)', 'arch', 'שערים וקשתות', 'שער קשת קשתי כניסה עומד', [2400, 400, 3000], 0, ['#e3d6bd', '#cdbd9e', '#d8c8aa'], 'stone', gate('semi', 1, 1, true, 0, (w) => w * 0.55, (h) => h * 0.78), { cut: true, slots: ['גוף', 'פרטי נוי', 'כותרת'], mats: ['stone', 'travertine', 'stone'], note: 'הפתח הקשתי הוא פתח אמיתי בגאומטריה. האלמנט להמחשה אדריכלית, ללא חישוב קונסטרוקטיבי.' }),
  I('arch-pointed', 'שער בקשת מחודדת', 'arch', 'שערים וקשתות', 'קשת מחודדת גותית שער', [2000, 350, 3200], 0, ['#d9cfbf', '#bfb29a', '#d9cfbf'], 'stone', gate('pointed', 1, 1, true, 0, (w) => w * 0.55, (h) => h * 0.82), { cut: true, slots: ['גוף', 'פרטי נוי', 'כותרת'], mats: ['stone', 'travertine', 'stone'] }),
  I('arch-ellipse', 'מעבר בקשת אליפטית', 'arch', 'שערים וקשתות', 'קשת אליפטית מעבר', [3000, 300, 2800], 0, ['#f4f1ea', '#e2dccf', '#f4f1ea'], 'plaster', gate('ellipse', 1, 1, false, 0, (w) => w * 0.75, (h) => h * 0.86), { cut: true, slots: ['גוף', 'פרטי נוי', 'כותרת'] }),
  I('portal', 'מסגרת כניסה דקורטיבית', 'arch', 'שערים וקשתות', 'מסגרת כניסה פורטל משקוף דקורטיבי', [1800, 300, 2900], 0, ['#ece6da', '#c9b79a', '#c9b79a'], 'stone', gate('flat', 1, 1, true, 250, (w) => w * 0.6, (h) => h * 0.78), { cut: true, slots: ['גוף', 'פרטי נוי', 'כותרת'], mats: ['stone', 'marble-white', 'marble-white'] }),
  I('column-classic', 'עמוד קלאסי דקורטיבי', 'arch', 'עמודים', 'עמוד קלאסי יווני דקורטיבי', [500, 500, 2700], 0, ['#ece9e4', '#d9d4ca'], 'marble', (w, _d, h) => [bc(0, 0, w, w, 0, 120, 2), cyl(0, 0, w * 0.42, 120, 200, 2), ...stack(0, 0, 200, h - 220, (t) => w * (0.36 - 0.04 * t), 6, 1), cyl(0, 0, w * 0.42, h - 220, h - 140, 2), bc(0, 0, w * 1.05, w * 1.05, h - 140, h, 2)], { slots: ['גוף', 'בסיס וכותרת'], mats: ['marble-white', 'marble-white'], note: 'עמוד להמחשה אדריכלית, ללא חישוב קונסטרוקטיבי.' }),
  I('colonnade', 'קולונדה', 'arch', 'עמודים', 'קולונדה שורת עמודים סטיו', [6000, 500, 3200], 0, ['#ece9e4', '#d9d4ca'], 'marble', (w, d, h) => { const n = Math.max(2, Math.round(w / 1800) + 1); const out: Part[] = [box(-w / 2, -d / 2, w / 2, d / 2, h - 380, h, 2)]; for (let i = 0; i < n; i++) { const x = -w / 2 + d / 2 + ((w - d) * i) / (n - 1); out.push(bc(x, 0, d, d, 0, 100, 2), ...stack(x, 0, 100, h - 380, (t) => d * (0.38 - 0.04 * t), 4, 1)); } return out; }, { cut: true, slots: ['עמודים', 'בסיסים וקורה'], mats: ['marble-white', 'stone'] }),
  I('dome', 'ביתן עם כיפה', 'arch', 'גגות מיוחדים', 'כיפה ביתן גזיבו כיפה', [3200, 3200, 4600], 0, ['#ece6da', '#9aa3ad'], 'plaster', (w, d, h) => { const out: Part[] = []; const ch = h * 0.6; for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) out.push(...stack((sx * (w - 300)) / 2, (sy * (d - 300)) / 2, 0, ch, () => 150, 1, 1)); out.push(bc(0, 0, w, d, ch, ch + 250, 1)); out.push(...stack(0, 0, ch + 250, h, (t) => (Math.min(w, d) / 2) * Math.sqrt(Math.max(0, 1 - t * t)), 10, 2)); return out; }, { cut: true, slots: ['עמודים וקורות', 'כיפה'], mats: ['shlicht', 'copper'], note: 'כיפה מדורגת להמחשה (טבעות). ללא חישוב קונסטרוקטיבי.' }),
  I('canopy', 'גגון', 'arch', 'גגות מיוחדים', 'גגון סוכך כניסה', [2000, 1200, 250], 2400, ['#3a3f45', '#c9cdd1'], 'steel-black', (w, d, h) => [
    box(-w / 2, -d / 2, w / 2, d / 2, h - 80, h, 1), box(-w / 2 + 50, -d / 2 + 50, w / 2 - 50, d / 2 - 50, h - 92, h - 80, 'glass'),
    bc(-w / 2 + 60, d / 2 - 250, 40, 500, 0, h - 80, 1), bc(w / 2 - 60, d / 2 - 250, 40, 500, 0, h - 80, 1),
  ], { mount: 'wall', cut: true, above: true, slots: ['מסגרת', 'כיסוי'], mats: ['steel-black', null] }),
  I('roof-barrel', 'גג קשתי', 'arch', 'גגות מיוחדים', 'גג קשתי קמרון חבית', [5000, 6000, 1200], 2700, ['#8f8a83', '#d9d6cf'], 'metal-cladding', (w, d, h) => { const out: Part[] = []; const N = 24, t = 150; for (let i = 0; i < N; i++) { const xa = -w / 2 + (w * i) / N, xb = -w / 2 + (w * (i + 1)) / N; const za = h * Math.sqrt(Math.max(0, 1 - (xa / (w / 2)) ** 2)), zb = h * Math.sqrt(Math.max(0, 1 - (xb / (w / 2)) ** 2)); out.push({ t: 'slice', x0: xa, x1: xb, y0: -d / 2, y1: d / 2, b0: za, b1: zb, t0: za + t, t1: zb + t, c: 1 }); } return out; }, { cut: true, above: true, slots: ['כיסוי'], mats: ['metal-cladding'], note: 'גג קשתי להמחשה: מוצב בגובה תקרת הקומה, אינו מחליף את מנוע הגגות ואינו כולל חישוב.' }),
  I('pergola-yard', 'פרגולה לחצר', 'arch', 'הצללות', 'פרגולה עץ חצר מרפסת', [4000, 3000, 2600], 0, ['#9a6a43', '#7a5233'], 'wood', (w, d, h) => { const out: Part[] = []; for (const sx of [-1, 1]) for (const sy of [-1, 1]) out.push(bc((sx * (w - 150)) / 2, (sy * (d - 150)) / 2, 150, 150, 0, h - 260, 1)); for (const sy of [-1, 1]) out.push(bc(0, (sy * (d - 150)) / 2, w + 300, 150, h - 260, h - 60, 2)); const n = Math.max(3, Math.round(w / 400)); for (let i = 0; i < n; i++) out.push(bc(-w / 2 - 100 + ((w + 200) * i) / (n - 1), 0, 50, d + 300, h - 60, h, 2)); return out; }, { cut: true, slots: ['עמודים', 'קורות'], mats: ['teak', 'teak'] }),
  I('stair-spiral', 'מדרגות לולייניות', 'arch', 'מדרגות', 'מדרגות לולייניות ספירלה', [1600, 1600, 2950], 0, ['#c9cdd1', '#2f3134', '#2f3134'], 'steel-black', (w, _d, h) => spiralStair(w, h, 16), { slots: ['שלחים', 'מעקה', 'עמוד מרכזי'], mats: ['oak-natural', 'steel-black', 'steel-black'], note: 'מדרגות לולייניות להמחשה. אינן חותכות את הרצפה העליונה אוטומטית (אפשר להוסיף "פתח ברצפה"), והן אינן מאושרות מבחינת תקנים.' }),
  I('stair-curved', 'מדרגות מעוגלות', 'arch', 'מדרגות', 'מדרגות מעוגלות קשת רבע עיגול', [2600, 2600, 1500], 0, ['#e2dccf', '#2f3134'], 'stone', (w, d, h) => curvedStair(w, d, h, 9), { slots: ['שלחים'], mats: ['travertine'], note: 'מדרגות להמחשה, ללא בדיקת תקינות.' }),
  I('railing-glass', 'מעקה זכוכית', 'arch', 'מעקות וגדרות', 'מעקה זכוכית מרפסת', [3000, 60, 1050], 0, ['#a9cde0', '#c4c8cc'], 'glass', (w, d, h) => [box(-w / 2, -d / 2, w / 2, d / 2, 0, 80, 2), box(-w / 2, -6, w / 2, 6, 80, h - 40, 'glass'), box(-w / 2, -d / 2, w / 2, d / 2, h - 40, h, 2)], { slots: ['זכוכית', 'מאחז'], mats: [null, 'chrome'] }),
  I('railing-metal', 'מעקה מתכת', 'arch', 'מעקות וגדרות', 'מעקה מתכת ברזל', [3000, 50, 1050], 0, ['#2f3134', '#2f3134'], 'steel-black', (w, d, h) => { const out: Part[] = [box(-w / 2, -d / 2, w / 2, d / 2, h - 50, h, 1), box(-w / 2, -d / 2, w / 2, d / 2, 80, 110, 1)]; for (let x = -w / 2; x <= w / 2; x += 110) out.push(bc(x, 0, 18, 18, 0, h - 50, 1)); return out; }, { mats: ['steel-black'] }),
  I('deco-wall', 'קיר דקורטיבי (סבכה)', 'arch', 'מעקות וגדרות', 'קיר דקורטיבי סבכה מחיצה', [3000, 150, 2400], 0, ['#e9e4da', '#d3c3a1'], 'concrete', (w, d, h) => { const out: Part[] = [box(-w / 2, -d / 2, w / 2, d / 2, 0, 200, 2), box(-w / 2, -d / 2, w / 2, d / 2, h - 150, h, 2)]; const n = Math.round(w / 300), m = Math.round((h - 350) / 300); for (let i = 0; i <= n; i++) out.push(bc(-w / 2 + (w * i) / n, 0, 60, d, 200, h - 150, 1)); for (let j = 1; j < m; j++) out.push(box(-w / 2, -d / 2, w / 2, d / 2, 200 + ((h - 350) * j) / m - 30, 200 + ((h - 350) * j) / m + 30, 1)); return out; }, { slots: ['סבכה', 'מסגרת'], mats: ['concrete', 'stone'] }),
  I('fence-deco', 'גדר מעוצבת', 'arch', 'מעקות וגדרות', 'גדר מעוצבת ברזל נוי', [2500, 60, 1400], 0, ['#2f3134', '#c9a55a'], 'steel-black', (w, d, h) => { const out: Part[] = [box(-w / 2, -d / 2, -w / 2 + 120, d / 2, 0, h + 150, 1), box(w / 2 - 120, -d / 2, w / 2, d / 2, 0, h + 150, 1), box(-w / 2, -d / 2 / 2, w / 2, d / 4, 150, 180, 1), box(-w / 2, -d / 4, w / 2, d / 4, h - 200, h - 170, 1)]; for (let x = -w / 2 + 200; x < w / 2 - 150; x += 120) out.push(bc(x, 0, 18, 18, 150, h, 1), bc(x, 0, 30, 30, h, h + 50, 2)); return out; }, { slots: ['גוף', 'קישוטים'], mats: ['steel-black', 'brass'] }),

  // ---------------------------------------------------------------- protected room (for study only)
  I('safe-vent', 'פתח אוורור ומסנן (המחשה)', 'safe', 'ממ״ד', 'אוורור מסנן ממד המחשה', [500, 250, 400], 1800, ['#9aa1a8', '#3a3f45'], 'metal', (w, d, h) => [box(-w / 2, -d / 2, w / 2, d / 2, 0, h, 1), ...vdisk(0, h / 2, h * 0.3, -d / 2 - 15, -d / 2, 2)], { mount: 'wall', note: 'סמל להמחשה בלבד. אינו מייצג מערכת סינון מאושרת או דרישה של גורם מוסמך.' }),
  I('safe-sign', 'שלט ״ממ״ד – להמחשה״', 'safe', 'ממ״ד', 'שלט ממד מרחב מוגן', [400, 20, 200], 1700, ['#2f6b4f', '#ffffff'], 'lacquer', (w, d, h) => [box(-w / 2, -d / 2, w / 2, d / 2, 0, h, 1), box(-w / 2 + 30, -d / 2 - 2, w / 2 - 30, -d / 2, 40, h - 40, 2)], { mount: 'wall', note: 'שלט להמחשה בלבד.' }),
];

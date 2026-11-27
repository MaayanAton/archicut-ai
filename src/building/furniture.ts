// Parametric furniture and fixtures. Every item is a small set of boxes and cylinders computed from its width (w),
// depth (d) and height (h). The plan symbol is the top view of exactly these solids (plus a few drawing lines),
// so the 2D symbol and the 3D model always match. Local frame: x across the width (centre 0), y across the depth
// with the FRONT at -d/2 and the back at +d/2, z up from the item's bottom. Sizes are common catalogue sizes,
// offered as editable defaults.

export type PartColor = 1 | 2 | 'metal' | 'glass' | 'white' | 'dark' | 'light';

export type Part =
  | { t: 'box'; x0: number; y0: number; x1: number; y1: number; z0: number; z1: number; c: PartColor }
  | { t: 'cyl'; cx: number; cy: number; r: number; z0: number; z1: number; c: PartColor };

export type FurnCategory = 'living' | 'bedroom' | 'kitchen' | 'bath' | 'other';

export const FURN_CATEGORIES: { id: FurnCategory; label: string }[] = [
  { id: 'living', label: 'סלון' },
  { id: 'bedroom', label: 'חדרי שינה' },
  { id: 'kitchen', label: 'מטבח ופינת אוכל' },
  { id: 'bath', label: 'חדרי רחצה' },
  { id: 'other', label: 'אלמנטים נוספים' },
];

export interface FurnItem {
  kind: string;
  label: string;
  cat: FurnCategory;
  keywords: string;
  w: number;
  d: number;
  h: number;
  elev: number;
  color: string;
  color2: string;
  material: string;
  parts: (w: number, d: number, h: number) => Part[];
  /** Extra plan lines in local coordinates (pairs of points). */
  lines?: (w: number, d: number) => [number, number, number, number][];
  /** Drawn dashed in plan (items above eye level, such as upper cabinets). */
  above?: boolean;
}

const box = (x0: number, y0: number, x1: number, y1: number, z0: number, z1: number, c: PartColor = 1): Part => ({ t: 'box', x0, y0, x1, y1, z0, z1, c });
const cyl = (cx: number, cy: number, r: number, z0: number, z1: number, c: PartColor = 1): Part => ({ t: 'cyl', cx, cy, r, z0, z1, c });
const legs = (w: number, d: number, h: number, inset = 40, s = 40, c: PartColor = 'dark'): Part[] => {
  const x = w / 2 - inset - s / 2, y = d / 2 - inset - s / 2;
  return [[-x, -y], [x, -y], [-x, y], [x, y]].map(([cx, cy]) => box(cx - s / 2, cy - s / 2, cx + s / 2, cy + s / 2, 0, h, c));
};

function sofa(w: number, d: number, h: number): Part[] {
  const arm = Math.min(200, w * 0.12), seatH = Math.min(450, h * 0.55), back = Math.min(220, d * 0.25);
  return [
    box(-w / 2, -d / 2, w / 2, d / 2, 0, seatH * 0.55, 2),
    box(-w / 2 + arm, -d / 2 + 30, w / 2 - arm, d / 2 - back, seatH * 0.55, seatH, 1),
    box(-w / 2, d / 2 - back, w / 2, d / 2, seatH * 0.55, h, 1),
    box(-w / 2, -d / 2, -w / 2 + arm, d / 2, seatH * 0.55, h * 0.75, 1),
    box(w / 2 - arm, -d / 2, w / 2, d / 2, seatH * 0.55, h * 0.75, 1),
  ];
}

function cornerSofa(w: number, d: number, h: number): Part[] {
  const depth = Math.min(950, d * 0.5), seatH = Math.min(450, h * 0.55), back = 220;
  return [
    box(-w / 2, d / 2 - depth, w / 2, d / 2, 0, seatH * 0.55, 2),
    box(-w / 2, -d / 2, -w / 2 + depth, d / 2 - depth, 0, seatH * 0.55, 2),
    box(-w / 2 + back, d / 2 - depth + 30, w / 2 - 200, d / 2 - back, seatH * 0.55, seatH, 1),
    box(-w / 2 + back, -d / 2 + 30, -w / 2 + depth - 30, d / 2 - depth + 30, seatH * 0.55, seatH, 1),
    box(-w / 2, d / 2 - back, w / 2, d / 2, seatH * 0.55, h, 1),
    box(-w / 2, -d / 2, -w / 2 + back, d / 2 - back, seatH * 0.55, h, 1),
    box(w / 2 - 200, d / 2 - depth, w / 2, d / 2 - back, seatH * 0.55, h * 0.75, 1),
  ];
}

function bed(w: number, d: number, h: number, pillows: number): Part[] {
  const head = 80, mat = Math.min(h, 520);
  const out: Part[] = [
    box(-w / 2, -d / 2, w / 2, d / 2 - head, 0, mat * 0.6, 2),
    box(-w / 2 + 15, -d / 2 + 15, w / 2 - 15, d / 2 - head - 10, mat * 0.6, mat, 'white'),
    box(-w / 2, d / 2 - head, w / 2, d / 2, 0, Math.max(h, mat + 350), 2),
  ];
  const pw = (w - 60 - (pillows - 1) * 40) / pillows;
  for (let i = 0; i < pillows; i++) {
    const x0 = -w / 2 + 30 + i * (pw + 40);
    out.push(box(x0, d / 2 - head - 380, x0 + pw, d / 2 - head - 60, mat, mat + 120, 'light'));
  }
  return out;
}

function chair(w: number, d: number, h: number): Part[] {
  const seat = Math.min(460, h * 0.55);
  return [...legs(w, d, seat - 30, 30, 35), box(-w / 2, -d / 2, w / 2, d / 2, seat - 30, seat, 1), box(-w / 2, d / 2 - 50, w / 2, d / 2, seat, h, 1)];
}

function table(w: number, d: number, h: number, top = 35): Part[] {
  return [...legs(w, d, h - top, 50, 50), box(-w / 2, -d / 2, w / 2, d / 2, h - top, h, 1)];
}

function cabinet(w: number, d: number, h: number, plinth = 100): Part[] {
  return [box(-w / 2 + 50, -d / 2 + 50, w / 2 - 50, d / 2, 0, plinth, 'dark'), box(-w / 2, -d / 2, w / 2, d / 2, plinth, h, 1)];
}

const doorLines = (w: number, d: number, n: number): [number, number, number, number][] => {
  const out: [number, number, number, number][] = [];
  for (let i = 1; i < n; i++) { const x = -w / 2 + (w * i) / n; out.push([x, -d / 2, x, d / 2]); }
  return out;
};

export const FURNITURE: FurnItem[] = [
  // ---- living room ----
  { kind: 'sofa-3', label: 'ספה תלת־מושבית', cat: 'living', keywords: 'ספה סלון sofa', w: 2200, d: 900, h: 850, elev: 0, color: '#8a9aa5', color2: '#6b7a84', material: 'fabric', parts: sofa },
  { kind: 'sofa-2', label: 'ספה דו־מושבית', cat: 'living', keywords: 'ספה סלון loveseat', w: 1600, d: 900, h: 850, elev: 0, color: '#8a9aa5', color2: '#6b7a84', material: 'fabric', parts: sofa },
  { kind: 'sofa-corner', label: 'ספה פינתית', cat: 'living', keywords: 'ספה פינתית L', w: 2700, d: 2000, h: 850, elev: 0, color: '#a2ab9a', color2: '#7f8878', material: 'fabric', parts: cornerSofa },
  { kind: 'armchair', label: 'כורסה', cat: 'living', keywords: 'כורסא כורסה armchair', w: 850, d: 850, h: 850, elev: 0, color: '#c9a37a', color2: '#9c7a55', material: 'fabric', parts: sofa },
  { kind: 'coffee-table', label: 'שולחן סלון', cat: 'living', keywords: 'שולחן סלון קפה', w: 1200, d: 600, h: 420, elev: 0, color: '#a9784a', color2: '#2f3a44', material: 'wood', parts: (w, d, h) => table(w, d, h, 40) },
  { kind: 'coffee-round', label: 'שולחן סלון עגול', cat: 'living', keywords: 'שולחן סלון עגול', w: 800, d: 800, h: 420, elev: 0, color: '#a9784a', color2: '#2f3a44', material: 'wood', parts: (w, _d, h) => [cyl(0, 0, 60, 0, h - 40, 'dark'), cyl(0, 0, w / 2, h - 40, h, 1)] },
  { kind: 'tv-unit', label: 'מזנון', cat: 'living', keywords: 'מזנון טלוויזיה ארון', w: 2000, d: 450, h: 500, elev: 0, color: '#f5f5f2', color2: '#a9784a', material: 'lacquer', parts: (w, d, h) => cabinet(w, d, h, 60), lines: (w, d) => doorLines(w, d, 4) },
  { kind: 'tv', label: 'טלוויזיה', cat: 'living', keywords: 'טלוויזיה מסך tv', w: 1450, d: 80, h: 830, elev: 600, color: '#1e2227', color2: '#1e2227', material: 'metal', parts: (w, d, h) => [box(-w / 2, -d / 2, w / 2, d / 2, 0, h, 'dark')] },
  { kind: 'rug', label: 'שטיח', cat: 'living', keywords: 'שטיח', w: 2400, d: 1700, h: 10, elev: 0, color: '#d8c6a5', color2: '#b49a72', material: 'fabric', parts: (w, d, h) => [box(-w / 2, -d / 2, w / 2, d / 2, 0, h, 1)], lines: (w, d) => [[-w / 2 + 100, -d / 2 + 100, w / 2 - 100, -d / 2 + 100], [w / 2 - 100, -d / 2 + 100, w / 2 - 100, d / 2 - 100], [w / 2 - 100, d / 2 - 100, -w / 2 + 100, d / 2 - 100], [-w / 2 + 100, d / 2 - 100, -w / 2 + 100, -d / 2 + 100]] },
  { kind: 'bookcase', label: 'ספרייה', cat: 'living', keywords: 'ספרייה מדפים ספרים', w: 1200, d: 350, h: 2000, elev: 0, color: '#a9784a', color2: '#f5f5f2', material: 'wood', parts: (w, d, h) => { const out: Part[] = [box(-w / 2, d / 2 - 20, w / 2, d / 2, 0, h, 1), box(-w / 2, -d / 2, -w / 2 + 25, d / 2, 0, h, 1), box(w / 2 - 25, -d / 2, w / 2, d / 2, 0, h, 1)]; const n = Math.max(2, Math.round(h / 380)); for (let i = 0; i <= n; i++) { const z = (h - 25) * (i / n); out.push(box(-w / 2, -d / 2, w / 2, d / 2, z, z + 25, 1)); } return out; } },
  // ---- bedrooms ----
  { kind: 'bed-single', label: 'מיטת יחיד', cat: 'bedroom', keywords: 'מיטה יחיד', w: 900, d: 2000, h: 900, elev: 0, color: '#d9d4ca', color2: '#a9784a', material: 'fabric', parts: (w, d, h) => bed(w, d, h, 1), lines: (w, d) => [[-w / 2, d / 2 - 900, w / 2, d / 2 - 1150]] },
  { kind: 'bed-double', label: 'מיטה זוגית', cat: 'bedroom', keywords: 'מיטה זוגית כפולה', w: 1600, d: 2000, h: 1000, elev: 0, color: '#d9d4ca', color2: '#a9784a', material: 'fabric', parts: (w, d, h) => bed(w, d, h, 2), lines: (w, d) => [[-w / 2, d / 2 - 900, w / 2, d / 2 - 1150]] },
  { kind: 'wardrobe', label: 'ארון בגדים', cat: 'bedroom', keywords: 'ארון בגדים', w: 1800, d: 600, h: 2400, elev: 0, color: '#f5f5f2', color2: '#c9c4b8', material: 'lacquer', parts: (w, d, h) => cabinet(w, d, h, 80), lines: (w, d) => [...doorLines(w, d, Math.max(2, Math.round(w / 500))), [-w / 2, -d / 2, w / 2, d / 2]] },
  { kind: 'dresser', label: 'שידה', cat: 'bedroom', keywords: 'שידה מגירות', w: 1200, d: 450, h: 800, elev: 0, color: '#a9784a', color2: '#f5f5f2', material: 'wood', parts: (w, d, h) => cabinet(w, d, h, 80), lines: (w, d) => doorLines(w, d, 3) },
  { kind: 'nightstand', label: 'שידת לילה', cat: 'bedroom', keywords: 'שידת לילה צד', w: 450, d: 400, h: 500, elev: 0, color: '#a9784a', color2: '#f5f5f2', material: 'wood', parts: (w, d, h) => cabinet(w, d, h, 60) },
  { kind: 'desk', label: 'שולחן כתיבה', cat: 'bedroom', keywords: 'שולחן כתיבה עבודה desk', w: 1200, d: 600, h: 750, elev: 0, color: '#f5f5f2', color2: '#2f3a44', material: 'wood', parts: (w, d, h) => table(w, d, h, 30) },
  { kind: 'chair', label: 'כיסא', cat: 'bedroom', keywords: 'כיסא chair', w: 450, d: 500, h: 850, elev: 0, color: '#2f3a44', color2: '#2f3a44', material: 'wood', parts: chair },
  // ---- kitchen and dining ----
  { kind: 'kitchen-base', label: 'ארונות מטבח תחתונים', cat: 'kitchen', keywords: 'מטבח ארון תחתון משטח', w: 2400, d: 600, h: 900, elev: 0, color: '#f5f5f2', color2: '#3b3f44', material: 'lacquer', parts: (w, d, h) => [box(-w / 2, -d / 2 + 60, w / 2, d / 2, 0, 100, 'dark'), box(-w / 2, -d / 2 + 20, w / 2, d / 2, 100, h - 40, 1), box(-w / 2, -d / 2, w / 2, d / 2, h - 40, h, 2)], lines: (w, d) => doorLines(w, d, Math.max(1, Math.round(w / 600))) },
  { kind: 'kitchen-upper', label: 'ארונות מטבח עליונים', cat: 'kitchen', keywords: 'מטבח ארון עליון', w: 2400, d: 350, h: 700, elev: 1500, color: '#f5f5f2', color2: '#f5f5f2', material: 'lacquer', above: true, parts: (w, d, h) => [box(-w / 2, -d / 2, w / 2, d / 2, 0, h, 1)], lines: (w, d) => [[-w / 2, -d / 2, w / 2, d / 2], [-w / 2, d / 2, w / 2, -d / 2]] },
  { kind: 'counter', label: 'משטח עבודה', cat: 'kitchen', keywords: 'משטח עבודה שיש', w: 2000, d: 600, h: 40, elev: 860, color: '#3b3f44', color2: '#3b3f44', material: 'stone', parts: (w, d, h) => [box(-w / 2, -d / 2, w / 2, d / 2, 0, h, 1)] },
  { kind: 'island', label: 'אי מטבח', cat: 'kitchen', keywords: 'אי מטבח', w: 1800, d: 900, h: 900, elev: 0, color: '#5f6a74', color2: '#ece9e4', material: 'lacquer', parts: (w, d, h) => [box(-w / 2 + 50, -d / 2 + 50, w / 2 - 50, d / 2 - 50, 0, 100, 'dark'), box(-w / 2, -d / 2 + 250, w / 2, d / 2, 100, h - 40, 1), box(-w / 2 - 20, -d / 2, w / 2 + 20, d / 2 + 20, h - 40, h, 2)] },
  { kind: 'fridge', label: 'מקרר', cat: 'kitchen', keywords: 'מקרר', w: 900, d: 700, h: 1850, elev: 0, color: '#c4c8cc', color2: '#8e959c', material: 'metal', parts: (w, d, h) => [box(-w / 2, -d / 2, w / 2, d / 2, 0, h, 1)], lines: (w, d) => [[0, -d / 2, 0, -d / 2 + 60], [-w / 2, -d / 2 + 60, w / 2, -d / 2 + 60]] },
  { kind: 'oven', label: 'תנור', cat: 'kitchen', keywords: 'תנור אפייה', w: 600, d: 600, h: 860, elev: 0, color: '#2f3a44', color2: '#8e959c', material: 'metal', parts: (w, d, h) => [box(-w / 2, -d / 2, w / 2, d / 2, 0, h, 1), box(-w / 2 + 60, -d / 2 - 10, w / 2 - 60, -d / 2, 200, h - 200, 'glass')] },
  { kind: 'cooktop', label: 'כיריים', cat: 'kitchen', keywords: 'כיריים גז אינדוקציה', w: 600, d: 520, h: 10, elev: 900, color: '#1e2227', color2: '#8e959c', material: 'glass', parts: (w, d, h) => [box(-w / 2, -d / 2, w / 2, d / 2, 0, h, 1), ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sy]) => cyl((sx * w) / 4, (sy * d) / 4, Math.min(w, d) / 7, h, h + 4, 'metal'))] },
  { kind: 'kitchen-sink', label: 'כיור מטבח', cat: 'kitchen', keywords: 'כיור מטבח', w: 800, d: 500, h: 10, elev: 900, color: '#c4c8cc', color2: '#8e959c', material: 'metal', parts: (w, d, h) => [box(-w / 2, -d / 2, w / 2, d / 2, 0, h, 1), box(-w / 2 + 50, -d / 2 + 50, w / 2 - 50, d / 2 - 90, h, h + 3, 2), cyl(0, d / 2 - 45, 25, h, h + 300, 'metal')] },
  { kind: 'dining-table', label: 'שולחן אוכל', cat: 'kitchen', keywords: 'שולחן אוכל', w: 1800, d: 900, h: 750, elev: 0, color: '#a9784a', color2: '#2f3a44', material: 'wood', parts: (w, d, h) => table(w, d, h, 40) },
  { kind: 'dining-round', label: 'שולחן אוכל עגול', cat: 'kitchen', keywords: 'שולחן אוכל עגול', w: 1100, d: 1100, h: 750, elev: 0, color: '#a9784a', color2: '#2f3a44', material: 'wood', parts: (w, _d, h) => [cyl(0, 0, w / 4, 0, 30, 'dark'), cyl(0, 0, 50, 0, h - 40, 'dark'), cyl(0, 0, w / 2, h - 40, h, 1)] },
  { kind: 'dining-chair', label: 'כיסא אוכל', cat: 'kitchen', keywords: 'כיסא אוכל', w: 450, d: 500, h: 850, elev: 0, color: '#c9a37a', color2: '#2f3a44', material: 'wood', parts: chair },
  // ---- bathrooms ----
  { kind: 'toilet', label: 'אסלה', cat: 'bath', keywords: 'אסלה שירותים', w: 380, d: 650, h: 780, elev: 0, color: '#fafafa', color2: '#fafafa', material: 'ceramic-white', parts: (w, d, h) => [box(-w / 2, d / 2 - 180, w / 2, d / 2, 0, h, 1), cyl(0, -d / 2 + w / 2 + 40, w / 2, 0, 400, 1), box(-w / 2 * 0.8, -d / 2 + w / 2 + 40, w / 2 * 0.8, d / 2 - 180, 0, 400, 1)] },
  { kind: 'basin', label: 'כיור רחצה', cat: 'bath', keywords: 'כיור אמבטיה רחצה', w: 600, d: 450, h: 180, elev: 700, color: '#fafafa', color2: '#8e959c', material: 'ceramic-white', parts: (w, d, h) => [box(-w / 2, -d / 2, w / 2, d / 2, 0, h, 1), cyl(0, -20, Math.min(w, d) * 0.32, h, h + 3, 'light'), cyl(0, d / 2 - 50, 20, h, h + 200, 'metal')] },
  { kind: 'shower', label: 'מקלחון', cat: 'bath', keywords: 'מקלחון מקלחת', w: 900, d: 900, h: 2000, elev: 0, color: '#f0f0ee', color2: '#a9cde0', material: 'ceramic', parts: (w, d, h) => [box(-w / 2, -d / 2, w / 2, d / 2, 0, 40, 1), box(-w / 2, -d / 2, w / 2, -d / 2 + 10, 40, h, 'glass'), box(-w / 2, -d / 2, -w / 2 + 10, d / 2, 40, h, 'glass')], lines: (w, d) => [[-w / 2, -d / 2, w / 2, d / 2], [-w / 2, d / 2, w / 2, -d / 2]] },
  { kind: 'bathtub', label: 'אמבטיה', cat: 'bath', keywords: 'אמבטיה אמבט', w: 1700, d: 750, h: 560, elev: 0, color: '#fafafa', color2: '#e6eef2', material: 'ceramic-white', parts: (w, d, h) => [box(-w / 2, -d / 2, w / 2, d / 2, 0, h - 5, 1), box(-w / 2 + 70, -d / 2 + 70, w / 2 - 70, d / 2 - 70, h - 5, h, 2)] },
  { kind: 'bath-cabinet', label: 'ארון אמבטיה', cat: 'bath', keywords: 'ארון אמבטיה', w: 800, d: 460, h: 550, elev: 300, color: '#a9784a', color2: '#fafafa', material: 'wood', parts: (w, d, h) => [box(-w / 2, -d / 2, w / 2, d / 2, 0, h, 1)], lines: (w, d) => doorLines(w, d, 2) },
  { kind: 'mirror', label: 'מראה', cat: 'bath', keywords: 'מראה', w: 800, d: 30, h: 900, elev: 1000, color: '#c9dde6', color2: '#8e959c', material: 'glass', parts: (w, d, h) => [box(-w / 2, -d / 2, w / 2, d / 2, 0, h, 'glass')] },
  // ---- other ----
  { kind: 'ceiling-lamp', label: 'גוף תאורה תלוי', cat: 'other', keywords: 'תאורה מנורה גוף תאורה', w: 450, d: 450, h: 600, elev: 1900, color: '#e0b04a', color2: '#2f3a44', material: 'metal', above: true, parts: (w, _d, h) => [cyl(0, 0, 8, h * 0.4, h, 'dark'), cyl(0, 0, w / 2, 0, h * 0.4, 1)] },
  { kind: 'floor-lamp', label: 'מנורה עומדת', cat: 'other', keywords: 'מנורה עומדת תאורה', w: 400, d: 400, h: 1650, elev: 0, color: '#f4f1ea', color2: '#2f3a44', material: 'fabric', parts: (w, _d, h) => [cyl(0, 0, w * 0.35, 0, 25, 'dark'), cyl(0, 0, 12, 25, h - 300, 'dark'), cyl(0, 0, w / 2, h - 300, h, 1)] },
  { kind: 'curtain', label: 'וילון', cat: 'other', keywords: 'וילון', w: 2000, d: 120, h: 2500, elev: 0, color: '#e8e2d6', color2: '#8e959c', material: 'fabric', parts: (w, d, h) => [box(-w / 2, -d / 2, w / 2, d / 2, 0, h - 40, 1), cyl(-w / 2, 0, 12, h - 40, h, 'metal'), box(-w / 2, -10, w / 2, 10, h - 30, h - 10, 'metal')], lines: (w, d) => { const out: [number, number, number, number][] = []; const n = Math.max(3, Math.round(w / 150)); for (let i = 0; i < n; i++) { const x0 = -w / 2 + (w * i) / n, x1 = -w / 2 + (w * (i + 0.5)) / n, x2 = -w / 2 + (w * (i + 1)) / n; out.push([x0, -d / 2, x1, d / 2], [x1, d / 2, x2, -d / 2]); } return out; } },
  { kind: 'plant', label: 'עציץ', cat: 'other', keywords: 'עציץ צמח', w: 500, d: 500, h: 1200, elev: 0, color: '#5e8f4e', color2: '#b5654a', material: 'plant', parts: (w, _d, h) => [cyl(0, 0, w * 0.32, 0, h * 0.3, 2), cyl(0, 0, w / 2, h * 0.3, h, 1)] },
  { kind: 'shelf', label: 'מדף', cat: 'other', keywords: 'מדף קיר', w: 1000, d: 250, h: 30, elev: 1400, color: '#a9784a', color2: '#a9784a', material: 'wood', parts: (w, d, h) => [box(-w / 2, -d / 2, w / 2, d / 2, 0, h, 1)] },
  { kind: 'work-desk', label: 'שולחן עבודה', cat: 'other', keywords: 'שולחן עבודה משרד', w: 1600, d: 800, h: 750, elev: 0, color: '#ece9e4', color2: '#2f3a44', material: 'wood', parts: (w, d, h) => table(w, d, h, 30) },
  { kind: 'office-chair', label: 'כיסא משרדי', cat: 'other', keywords: 'כיסא משרד', w: 600, d: 600, h: 1000, elev: 0, color: '#2f3a44', color2: '#2f3a44', material: 'fabric', parts: (w, d, h) => [cyl(0, 0, w / 2 - 20, 0, 40, 'dark'), cyl(0, 0, 30, 40, 430, 'metal'), box(-w / 2 + 50, -d / 2 + 50, w / 2 - 50, d / 2 - 60, 430, 500, 1), box(-w / 2 + 70, d / 2 - 100, w / 2 - 70, d / 2 - 40, 500, h, 1)] },
  { kind: 'partition', label: 'מחיצה דקורטיבית', cat: 'other', keywords: 'מחיצה פרגוד', w: 1500, d: 60, h: 1800, elev: 0, color: '#d8c6a5', color2: '#a9784a', material: 'wood', parts: (w, d, h) => [box(-w / 2, -d / 2, w / 2, d / 2, 0, h, 1)] },
];

const BY_KIND = new Map(FURNITURE.map((f) => [f.kind, f]));
const UNKNOWN: FurnItem = { kind: 'unknown', label: 'פריט לא מוכר', cat: 'other', keywords: '', w: 500, d: 500, h: 500, elev: 0, color: '#999999', color2: '#777777', material: 'paint', parts: (w, d, h) => [box(-w / 2, -d / 2, w / 2, d / 2, 0, h, 1)] };
export const furn = (kind: string): FurnItem => BY_KIND.get(kind) ?? UNKNOWN;
export const isKnownFurniture = (kind: string) => BY_KIND.has(kind);

/** Search by Hebrew label or keyword (any word of the query). */
export function searchFurniture(q: string): FurnItem[] {
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return FURNITURE;
  return FURNITURE.filter((f) => words.every((w) => `${f.label} ${f.keywords}`.toLowerCase().includes(w)));
}

/** Resolves a part colour to a hex colour for an item. */
export function partColor(c: PartColor, color: string, color2: string): string {
  switch (c) {
    case 1: return color;
    case 2: return color2;
    case 'metal': return '#9aa1a8';
    case 'glass': return '#a9cde0';
    case 'white': return '#fbfbfa';
    case 'dark': return '#3a3f45';
    case 'light': return '#efeee9';
  }
}

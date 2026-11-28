// Library of parametric site elements. Each item defines its geometry type, default parameters and the
// fields the user can edit. The 3D solids and section cuts are generated from these numbers (prims.ts);
// nothing is a flat picture. Default sizes are common, editable starting values, not data from a course.

import type { MaterialId, SiteElement, SiteGeom, SiteLayer } from './types';
import { LIBRARY4 } from './library4';
import { matchesQuery } from '../materials/catalog';
import { richFinish } from '../materials/finish';

export type CategoryId = 'site' | 'surface' | 'plants' | 'furniture' | 'built' | 'play' | 'leisure' | 'annot';

export const CATEGORIES: { id: CategoryId; label: string }[] = [
  { id: 'site', label: 'מגרש ואזורים' },
  { id: 'surface', label: 'שבילים, משטחים וחניה' },
  { id: 'plants', label: 'עצים, שיחים וכיסוי קרקע' },
  { id: 'furniture', label: 'ריהוט רחוב ותאורה' },
  { id: 'play', label: 'משחק וספורט' },
  { id: 'leisure', label: 'מים, הצללה ופנאי' },
  { id: 'built', label: 'מבנים, גדרות ושערים' },
  { id: 'annot', label: 'מידות וטקסט' },
];

/** 4.0: colour slot of a part: 1 = the element's colour (and material), 2 = its second colour, or a fixed one. */
export type Slot = 1 | 2 | 'foliage' | 'trunk' | 'water' | 'metal' | 'wood' | 'stone' | 'concrete' | 'rubber' | 'glass' | 'lamp' | 'soil' | 'sand' | 'dark' | 'white' | 'orange' | 'pink' | 'green' | 'blue' | 'bamboo';

/** 4.0: a solid of a library item in its own frame (x across, y along the depth, z up from the base), mm. */
export type SPart =
  | { t: 'box'; x0: number; y0: number; x1: number; y1: number; z0: number; z1: number; c: Slot }
  /** Bottom and top change linearly along x (arches, slopes): real openings and slopes in every view. */
  | { t: 'slice'; x0: number; x1: number; y0: number; y1: number; b0: number; b1: number; t0: number; t1: number; c: Slot }
  | { t: 'cyl'; x: number; y: number; r: number; z0: number; z1: number; c: Slot }
  | { t: 'ell'; x: number; y: number; r: number; rz: number; zc: number; c: Slot }
  | { t: 'cone'; x: number; y: number; r: number; z0: number; z1: number; c: Slot }
  /** Prism over a local polygon; tilt: a sloping plate (bottom from z0 at y0 to z1 at y1, thickness th). */
  | { t: 'poly'; pts: [number, number][]; z0: number; z1: number; c: Slot; tilt?: { y0: number; y1: number; z0: number; z1: number; th: number } };

export const DEFAULT_LAYERS: SiteLayer[] = [
  { id: 'site', name: 'מגרש', visible: true, locked: false },
  { id: 'zones', name: 'אזורים', visible: true, locked: false },
  { id: 'topo', name: 'טופוגרפיה ומפלסים', visible: true, locked: false },
  { id: 'hardscape', name: 'שבילים ומשטחים', visible: true, locked: false },
  { id: 'plants', name: 'צמחייה', visible: true, locked: false },
  { id: 'water', name: 'מים', visible: true, locked: false },
  { id: 'built', name: 'מבנים וקירות', visible: true, locked: false },
  { id: 'furniture', name: 'ריהוט רחוב', visible: true, locked: false },
  { id: 'leisure', name: 'פנאי ומשחק', visible: true, locked: false },
  { id: 'annot', name: 'מידות וטקסט', visible: true, locked: false },
];

export const MATERIALS: Record<MaterialId, { label: string; color: string }> = {
  grass: { label: 'דשא', color: '#8fbf6a' },
  planting: { label: 'צמחייה', color: '#6fa35a' },
  soil: { label: 'אדמה', color: '#a3825f' },
  gravel: { label: 'חצץ', color: '#cfc7b6' },
  concrete: { label: 'בטון', color: '#c8c6c0' },
  paving: { label: 'ריצוף', color: '#ddd3c2' },
  stone: { label: 'אבן', color: '#bdb5a7' },
  wood: { label: 'עץ', color: '#b5835a' },
  metal: { label: 'מתכת', color: '#6c7480' },
  plaster: { label: 'טיח', color: '#ece6da' },
  water: { label: 'מים', color: '#7fb6d9' },
  foliage: { label: 'עלווה', color: '#5e9c4f' },
  bark: { label: 'גזע', color: '#7a5a3c' },
  rubber: { label: 'גומי בטיחות', color: '#d9734e' },
  glass: { label: 'זכוכית', color: '#a9c9df' },
  none: { label: 'ללא', color: '#ffffff' },
};

export type ParamUnit = 'm' | 'level' | 'n';

export interface ParamDef {
  key: string;
  label: string;
  unit: ParamUnit;
  min?: number;
  max?: number;
  integer?: boolean;
}

export interface LibItem {
  kind: string;
  label: string;
  category: CategoryId;
  geom: SiteGeom['type'];
  layer: string;
  material: MaterialId;
  params: Record<string, number>;
  fields: ParamDef[];
  /** Plan footprint of point objects. */
  footprint?: 'rect' | 'circle';
  desc: string;
  /** Element has 3D solids (false: plan only, such as zones, dimensions and text). */
  solid: boolean;
  /** Draped on the ground (lawns, paving, paths). */
  surface?: boolean;
  /** 4.0: sub-group in the library, search words, plan symbol, solids, colours, default finish, notice. */
  sub?: string;
  kw?: string;
  symbol?: 'tree' | 'shrub';
  parts?: (p: (key: string) => number) => SPart[];
  color?: string;
  color2?: string;
  /** Catalogue material id given to new elements (texture in 3D, colour in the plan). */
  finish?: string;
  note?: string;
}

const m = (label: string, key: string, min = 0, max?: number): ParamDef => ({ key, label, unit: 'm', min, max });

const TREE_FIELDS = [m('קוטר צמרת', 'dia', 100), m('גובה כולל', 'h', 100), m('גובה גזע', 'trunkH', 0), m('קוטר גזע', 'trunkD', 20)];

export const LIBRARY: LibItem[] = [
  // ----- site -----
  { kind: 'lot', sub: 'מגרש',  label: 'גבול מגרש', category: 'site', geom: 'area', layer: 'site', material: 'none', params: {}, fields: [], desc: 'גבול המתחם. ממנו נקבע שטח העבודה של הקרקע.', solid: false },
  { kind: 'zone', sub: 'מגרש',  label: 'אזור בתוכנית', category: 'site', geom: 'area', layer: 'zones', material: 'none', params: {}, fields: [], desc: 'חלוקת המתחם לאזורים עם שם ושטח. מופיע בתוכנית בלבד.', solid: false },
  { kind: 'terrace', sub: 'מגרש',  label: 'משטח במפלס', category: 'site', geom: 'area', layer: 'topo', material: 'paving', params: { level: 0 }, fields: [{ key: 'level', label: 'מפלס המשטח', unit: 'level' }], desc: 'אזור שטוח בגובה קבוע. כך יוצרים הפרשי מפלסים (טרסות).', solid: true, surface: true },

  // ----- paths and surfaces -----
  { kind: 'path', sub: 'שבילים',  label: 'שביל', category: 'surface', geom: 'line', layer: 'hardscape', material: 'paving', params: { width: 2000, thick: 100 }, fields: [m('רוחב השביל', 'width', 100), m('עובי הריצוף', 'thick', 0)], desc: 'שביל ישר או מעוקל ברוחב קבוע.', solid: true, surface: true },
  { kind: 'plaza', sub: 'רחבות ומשטחים',  label: 'רחבה', category: 'surface', geom: 'area', layer: 'hardscape', material: 'stone', params: { thick: 150 }, fields: [m('עובי הריצוף', 'thick', 0)], desc: 'רחבה ציבורית מרוצפת.', solid: true, surface: true },
  { kind: 'seating', sub: 'רחבות ומשטחים',  label: 'אזור ישיבה', category: 'surface', geom: 'area', layer: 'hardscape', material: 'paving', params: { thick: 100 }, fields: [m('עובי הריצוף', 'thick', 0)], desc: 'משטח לאזור ישיבה. את הספסלים מוסיפים מ"ריהוט רחוב".', solid: true, surface: true },
  { kind: 'gravel', sub: 'רחבות ומשטחים',  label: 'משטח חצץ', category: 'surface', geom: 'area', layer: 'hardscape', material: 'gravel', params: { thick: 80 }, fields: [m('עובי השכבה', 'thick', 0)], desc: 'משטח חצץ או מצע.', solid: true, surface: true },
  { kind: 'deck', sub: 'רחבות ומשטחים',  label: 'דק', category: 'surface', geom: 'area', layer: 'built', material: 'wood', params: { h: 400 }, fields: [m('גובה מעל הקרקע', 'h', 10)], desc: 'משטח עץ מוגבה.', solid: true },

  // ----- plants -----
  { kind: 'tree-round', sub: 'עצים', symbol: 'tree',  label: 'עץ צמרת עגולה', category: 'plants', geom: 'point', layer: 'plants', material: 'foliage', footprint: 'circle', params: { dia: 6000, h: 7000, trunkH: 2500, trunkD: 350 }, fields: TREE_FIELDS, desc: 'עץ נשיר או ירוק עד עם צמרת עגולה.', solid: true },
  { kind: 'tree-conifer', sub: 'עצים', symbol: 'tree',  label: 'עץ מחטני', category: 'plants', geom: 'point', layer: 'plants', material: 'foliage', footprint: 'circle', params: { dia: 4000, h: 9000, trunkH: 1500, trunkD: 300 }, fields: TREE_FIELDS, desc: 'עץ בעל צמרת חרוטית.', solid: true },
  { kind: 'tree-columnar', sub: 'עצים', symbol: 'tree',  label: 'עץ צר וגבוה', category: 'plants', geom: 'point', layer: 'plants', material: 'foliage', footprint: 'circle', params: { dia: 2000, h: 8000, trunkH: 1200, trunkD: 250 }, fields: TREE_FIELDS, desc: 'עץ עמודי (צר), מתאים לשדרה.', solid: true },
  { kind: 'palm', sub: 'עצים', symbol: 'tree',  label: 'דקל', category: 'plants', geom: 'point', layer: 'plants', material: 'foliage', footprint: 'circle', params: { dia: 5000, h: 9000, trunkD: 400 }, fields: [m('קוטר הנוף', 'dia', 100), m('גובה כולל', 'h', 100), m('קוטר גזע', 'trunkD', 20)], desc: 'דקל עם גזע גבוה ונוף בראשו.', solid: true },
  { kind: 'shrub', sub: 'שיחים וצמחים', symbol: 'shrub',  label: 'שיח', category: 'plants', geom: 'point', layer: 'plants', material: 'planting', footprint: 'circle', params: { dia: 1500, h: 1200 }, fields: [m('קוטר', 'dia', 100), m('גובה', 'h', 50)], desc: 'שיח בודד.', solid: true },
  { kind: 'flowers', sub: 'שיחים וצמחים', symbol: 'shrub',  label: 'פרחים', category: 'plants', geom: 'point', layer: 'plants', material: 'planting', footprint: 'circle', params: { dia: 800, h: 400 }, fields: [m('קוטר', 'dia', 50), m('גובה', 'h', 20)], desc: 'קבוצת פרחים נמוכה.', solid: true },
  { kind: 'hedge', sub: 'שיחים וצמחים',  label: 'גדר חיה', category: 'plants', geom: 'line', layer: 'plants', material: 'planting', params: { width: 800, h: 1200 }, fields: [m('עובי', 'width', 100), m('גובה', 'h', 100)], desc: 'שורת שיחים לאורך קו.', solid: true },
  { kind: 'lawn', sub: 'משטחי קרקע',  label: 'מדשאה', category: 'plants', geom: 'area', layer: 'plants', material: 'grass', params: {}, fields: [], desc: 'משטח דשא.', solid: true, surface: true },
  { kind: 'planting', sub: 'משטחי קרקע',  label: 'אזור צמחייה', category: 'plants', geom: 'area', layer: 'plants', material: 'planting', params: {}, fields: [], desc: 'אזור שתילה של צמחייה נמוכה.', solid: true, surface: true },
  { kind: 'bed', sub: 'משטחי קרקע',  label: 'ערוגה מוגבהת', category: 'plants', geom: 'area', layer: 'plants', material: 'soil', params: { h: 450 }, fields: [m('גובה הדופן', 'h', 50)], desc: 'ערוגה עם דופן בגובה ישיבה.', solid: true },

  // ----- street furniture -----
  { kind: 'bench', sub: 'ישיבה',  label: 'ספסל', category: 'furniture', geom: 'point', layer: 'furniture', material: 'wood', footprint: 'rect', params: { w: 1800, d: 650, h: 800, seatH: 450 }, fields: [m('אורך', 'w', 300), m('עומק', 'd', 200), m('גובה משענת', 'h', 0), m('גובה מושב', 'seatH', 100)], desc: 'ספסל עם משענת (גובה משענת 0 = ספסל בלי משענת).', solid: true },
  { kind: 'table', sub: 'ישיבה',  label: 'שולחן', category: 'furniture', geom: 'point', layer: 'furniture', material: 'wood', footprint: 'rect', params: { w: 1800, d: 800, h: 750 }, fields: [m('אורך', 'w', 300), m('רוחב', 'd', 300), m('גובה', 'h', 300)], desc: 'שולחן פיקניק או שולחן ישיבה.', solid: true },
  { kind: 'bin', sub: 'אשפה ומיחזור',  label: 'פח אשפה', category: 'furniture', geom: 'point', layer: 'furniture', material: 'metal', footprint: 'circle', params: { dia: 500, h: 900 }, fields: [m('קוטר', 'dia', 100), m('גובה', 'h', 100)], desc: 'פח אשפה עגול.', solid: true },
  { kind: 'lamp', sub: 'תאורה',  label: 'עמוד תאורה', category: 'furniture', geom: 'point', layer: 'furniture', material: 'metal', footprint: 'circle', params: { dia: 400, h: 4500, poleD: 120 }, fields: [m('רוחב פנס', 'dia', 50), m('גובה', 'h', 500), m('קוטר עמוד', 'poleD', 30)], desc: 'עמוד תאורה לשביל או לרחבה.', solid: true },
  { kind: 'bike', sub: 'תנועה ושילוט',  label: 'מתקן אופניים', category: 'furniture', geom: 'point', layer: 'furniture', material: 'metal', footprint: 'rect', params: { w: 2400, d: 700, h: 800, n: 5 }, fields: [m('אורך', 'w', 300), m('עומק', 'd', 200), m('גובה', 'h', 200), { key: 'n', label: 'מספר קשתות', unit: 'n', min: 1, max: 40, integer: true }], desc: 'שורת קשתות לחניית אופניים.', solid: true },
  { kind: 'drink', sub: 'ישיבה',  label: 'ברזייה', category: 'furniture', geom: 'point', layer: 'furniture', material: 'concrete', footprint: 'rect', params: { w: 450, d: 450, h: 950 }, fields: [m('רוחב', 'w', 100), m('עומק', 'd', 100), m('גובה', 'h', 300)], desc: 'ברזיית שתייה.', solid: true },

  // ----- built elements -----
  { kind: 'pergola', sub: 'הצללה',  label: 'פרגולה', category: 'built', geom: 'point', layer: 'built', material: 'wood', footprint: 'rect', params: { w: 4000, d: 3000, h: 2700, post: 150, spacing: 400 }, fields: [m('אורך', 'w', 500), m('רוחב', 'd', 500), m('גובה', 'h', 1000), m('עובי עמוד', 'post', 50), m('מרווח בין קורות', 'spacing', 100)], desc: 'פרגולה עם עמודים, קורות ושלבי הצללה.', solid: true },
  { kind: 'shed', sub: 'הצללה',  label: 'סככה', category: 'built', geom: 'point', layer: 'built', material: 'metal', footprint: 'rect', params: { w: 5000, d: 4000, h: 3000, post: 150, roof: 150 }, fields: [m('אורך', 'w', 500), m('רוחב', 'd', 500), m('גובה', 'h', 1000), m('עובי עמוד', 'post', 50), m('עובי גג', 'roof', 20)], desc: 'סככת צל עם גג מלא.', solid: true },
  { kind: 'wall', sub: 'קירות וגדרות',  label: 'קיר', category: 'built', geom: 'line', layer: 'built', material: 'concrete', params: { width: 200, h: 1200 }, fields: [m('עובי', 'width', 20), m('גובה', 'h', 50)], desc: 'קיר או קיר תמך לאורך קו.', solid: true },
  { kind: 'fence', sub: 'קירות וגדרות',  label: 'גדר', category: 'built', geom: 'line', layer: 'built', material: 'metal', params: { width: 50, h: 1500 }, fields: [m('עובי', 'width', 10), m('גובה', 'h', 100)], desc: 'גדר לאורך קו.', solid: true },
  { kind: 'gate', sub: 'שערים וקשתות',  label: 'שער', category: 'built', geom: 'point', layer: 'built', material: 'metal', footprint: 'rect', params: { w: 1500, d: 120, h: 1500 }, fields: [m('רוחב פתח', 'w', 300), m('עובי', 'd', 30), m('גובה', 'h', 300)], desc: 'שער בין שני עמודים.', solid: true },
  { kind: 'stairs', sub: 'מדרגות ורמפות',  label: 'מדרגות', category: 'built', geom: 'point', layer: 'built', material: 'stone', footprint: 'rect', params: { w: 2000, d: 1800, rise: 900, n: 6 }, fields: [m('רוחב', 'w', 300), m('אורך (מהלך)', 'd', 200), m('הפרש גובה', 'rise', 10), { key: 'n', label: 'מספר רומים', unit: 'n', min: 1, max: 60, integer: true }], desc: 'גרם מדרגות. העלייה בכיוון החץ.', solid: true },
  { kind: 'ramp', sub: 'מדרגות ורמפות',  label: 'רמפה', category: 'built', geom: 'point', layer: 'built', material: 'concrete', footprint: 'rect', params: { w: 1500, d: 6000, rise: 400 }, fields: [m('רוחב', 'w', 300), m('אורך', 'd', 300), m('הפרש גובה', 'rise', 0)], desc: 'רמפה משופעת. העלייה בכיוון החץ.', solid: true },
  { kind: 'building', sub: 'מבני ציבור',  label: 'מבנה', category: 'built', geom: 'area', layer: 'built', material: 'plaster', params: { h: 3500, wall: 250, roof: 300 }, fields: [m('גובה', 'h', 1000), m('עובי קירות', 'wall', 50), m('עובי גג', 'roof', 50)], desc: 'מבנה בסיסי עם קירות חיצוניים וגג שטוח.', solid: true },

  // ----- leisure and water -----
  { kind: 'play', sub: 'מתקני משחק',  label: 'מתקן משחקים', category: 'leisure', geom: 'point', layer: 'leisure', material: 'wood', footprint: 'rect', params: { w: 4000, d: 3000, h: 3200, deck: 1200 }, fields: [m('אורך', 'w', 1000), m('רוחב', 'd', 1000), m('גובה', 'h', 1500), m('גובה משטח', 'deck', 300)], desc: 'מגדל משחק עם משטח, גגון ומגלשה.', solid: true },
  { kind: 'fountain', sub: 'מים ובריכות',  label: 'מזרקה', category: 'leisure', geom: 'point', layer: 'water', material: 'stone', footprint: 'circle', params: { dia: 3000, h: 450, jet: 1500 }, fields: [m('קוטר', 'dia', 500), m('גובה אגן', 'h', 100), m('גובה סילון', 'jet', 0)], desc: 'מזרקה עגולה עם אגן וסילון.', solid: true },
  { kind: 'pond', sub: 'מים ובריכות',  label: 'בריכת נוי', category: 'leisure', geom: 'area', layer: 'water', material: 'water', params: { depth: 600 }, fields: [m('עומק', 'depth', 50)], desc: 'בריכה שקועה בקרקע.', solid: true },
  { kind: 'sport', sub: 'ספורט וכושר',  label: 'מגרש ספורט', category: 'leisure', geom: 'area', layer: 'leisure', material: 'rubber', params: { thick: 50 }, fields: [m('עובי משטח', 'thick', 0)], desc: 'משטח למגרש ספורט.', solid: true, surface: true },
  { kind: 'fitness', sub: 'ספורט וכושר',  label: 'מתקן כושר', category: 'leisure', geom: 'point', layer: 'leisure', material: 'metal', footprint: 'rect', params: { w: 1600, d: 900, h: 2200 }, fields: [m('אורך', 'w', 300), m('רוחב', 'd', 200), m('גובה', 'h', 500)], desc: 'מתקן כושר חוץ.', solid: true },

  // ----- annotation -----
  { kind: 'dim', label: 'קו מידה', category: 'annot', geom: 'dim', layer: 'annot', material: 'none', params: {}, fields: [], desc: 'קו מידה בין שתי נקודות.', solid: false },
  { kind: 'text', label: 'טקסט', category: 'annot', geom: 'point', layer: 'annot', material: 'none', footprint: 'rect', params: { size: 3.5 }, fields: [{ key: 'size', label: 'גובה אותיות בדף (מ״מ)', unit: 'n', min: 1, max: 40 }], desc: 'כיתוב בתוכנית.', solid: false },
  // ----- 4.0 -----
  ...LIBRARY4,
];

const BY_KIND = new Map(LIBRARY.map((l) => [l.kind, l]));
const UNKNOWN: LibItem = { kind: 'unknown', label: 'אלמנט לא מוכר', category: 'annot', geom: 'point', layer: 'annot', material: 'none', params: {}, fields: [], desc: '', solid: false };

export const lib = (kind: string): LibItem => BY_KIND.get(kind) ?? UNKNOWN;
export const isKnownKind = (kind: string) => BY_KIND.has(kind);

/** Parameter value with the library default as fallback. */
export const prm = (e: SiteElement, key: string): number => {
  const v = e.params[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : (lib(e.kind).params[key] ?? 0);
};

export function makeElement(kind: string, geom: SiteGeom, id: string, overrides: Partial<SiteElement> = {}): SiteElement {
  const L = lib(kind);
  const finish = L.finish ? richFinish(L.finish, L.color) : undefined;
  return {
    id, kind, layer: L.layer, name: '', geom,
    params: { ...L.params },
    elevMode: kind === 'terrace' ? 'absolute' : 'ground',
    elev: 0,
    color: finish?.color ?? L.color ?? MATERIALS[L.material].color,
    material: L.material,
    ...(L.color2 ? { color2: L.color2 } : {}),
    ...(finish ? { finish } : {}),
    ...overrides,
  };
}

/** 4.0: Hebrew search over the library (spelling variants and synonyms, like the building library). */
export function searchLibrary(q: string): LibItem[] {
  return LIBRARY.filter((l) => matchesQuery(`${l.label} ${l.desc} ${l.kw ?? ''} ${l.sub ?? ''} ${CATEGORIES.find((c) => c.id === l.category)?.label ?? ''}`, q));
}

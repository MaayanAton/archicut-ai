// Data model of the "building planning and interior design" module (תכנון מבנים ועיצוב פנים).
// Plain JSON only. One model feeds the plans, the 3D model, the sections and elevations, the tables and the sheets.
//
// Units: every length is in real-world millimetres (like the rest of the app). Levels (z) are absolute heights in
// millimetres where 0 is the project's ±0.00. The interface shows metres. Angles are degrees, counter-clockwise,
// 0 = along +X. The plan uses +Y as "up on the screen".

import type { Vec2 } from '../geometry/vec';
import type { BackgroundImage } from '../document/types';

/** Version of the building data inside a project. Raised when the shape changes; see migrate.ts. */
export const BUILDING_SCHEMA = 1;

/**
 * Renovation phase of an element. Projects that are not renovations keep everything as 'new' and never show phases.
 * existing = stays; demolish = exists today and is removed in the proposal; new = added by the proposal.
 */
export type Phase = 'existing' | 'demolish' | 'new';

export const PHASE_LABELS: Record<Phase, string> = { existing: 'קיים', demolish: 'להריסה', new: 'חדש' };

/** Which state of a renovation a view shows. */
export type ViewState = 'existing' | 'demolition' | 'proposed' | 'compare';

export const VIEW_STATE_LABELS: Record<ViewState, string> = {
  existing: 'מצב קיים',
  demolition: 'תוכנית הריסה',
  proposed: 'מצב מוצע',
  compare: 'השוואה',
};

export type LevelKind = 'basement' | 'ground' | 'upper' | 'mezzanine' | 'roof';

export const LEVEL_KIND_LABELS: Record<LevelKind, string> = {
  basement: 'מרתף', ground: 'קומת קרקע', upper: 'קומה נוספת', mezzanine: 'מפלס ביניים', roof: 'קומת גג',
};

export interface Level {
  id: string;
  name: string;
  kind: LevelKind;
  /** Level of the finished floor, mm (absolute). */
  elevation: number;
  /** Clear height from the floor to the ceiling, mm. Walls default to this height. */
  ceilingHeight: number;
  /** Thickness of this level's floor slab (below the elevation), mm. */
  slabThickness: number;
  /** Generate the floor slab from the outline of the walls. */
  autoFloor: boolean;
  /** Generate a ceiling slab when there is no level directly above. */
  autoCeiling: boolean;
  /** Background plan for this level (uploaded image or PDF page), placed with its bottom-left corner at bgOrigin. */
  background: BackgroundImage | null;
  bgOrigin: Vec2;
  bgLocked: boolean;
}

export interface Finish { material: string; color: string }

export type WallKind = 'exterior' | 'interior' | 'partition';

export const WALL_KIND_LABELS: Record<WallKind, string> = { exterior: 'קיר חיצוני', interior: 'קיר פנימי', partition: 'מחיצה' };

export interface Wall {
  id: string;
  levelId: string;
  /** Centre line from a to b. "Left" means left of a→b. */
  a: Vec2;
  b: Vec2;
  thickness: number;
  /** null = the level's ceiling height. */
  height: number | null;
  kind: WallKind;
  phase: Phase;
  /** Finishes of the left and right faces (paint colours, cladding). */
  left: Finish;
  right: Finish;
  /** Colour of the wall's body (seen on top and at free ends). */
  core: string;
}

export type OpeningKind =
  | 'door' | 'door-double' | 'door-sliding' | 'door-entry' | 'door-glass'
  | 'window' | 'window-sliding' | 'window-fixed' | 'window-large' | 'vitrine';

export interface Opening {
  id: string;
  wallId: string;
  kind: OpeningKind;
  /** Distance along the wall from its start (a) to the opening's centre, mm. */
  pos: number;
  width: number;
  height: number;
  /** Height of the bottom of the opening above the floor (0 for doors), mm. */
  sill: number;
  /** Which face of the wall a door swings towards: 'L' = left of a→b, 'R' = right. */
  side: 'L' | 'R';
  /** Hinge side, seen along a→b: at the end nearer a ('start') or nearer b ('end'). */
  hinge: 'start' | 'end';
  /** Frame colour and frame material. */
  color: string;
  material: string;
  phase: Phase;
}

export interface FloorFinish {
  material: string;
  color: string;
  /** Tile or plank size, mm (0 = no pattern). */
  tileW: number;
  tileH: number;
  /** Laying direction, degrees. */
  angle: number;
}

/** Room: either found automatically from the walls around a point (seed), or drawn as a polygon. */
export interface Room {
  id: string;
  levelId: string;
  name: string;
  mode: 'auto' | 'manual';
  seed: Vec2;
  pts: Vec2[];
  floor: FloorFinish;
  /** In a renovation: in which state the room exists. */
  state: 'all' | 'existing' | 'proposed';
  showArea: boolean;
}

export type SlabKind = 'floor' | 'ceiling' | 'balcony' | 'void';

export const SLAB_KIND_LABELS: Record<SlabKind, string> = { floor: 'רצפה', ceiling: 'תקרה', balcony: 'מרפסת', void: 'חלל פתוח (פתח ברצפה)' };

export interface Slab {
  id: string;
  levelId: string;
  kind: SlabKind;
  pts: Vec2[];
  thickness: number;
  /** Top of the slab relative to the level's floor, mm (floor and balcony: usually 0; ceiling: the ceiling height). */
  top: number;
  /** Balcony railing height, mm (0 = none). */
  railing: number;
  color: string;
  material: string;
  phase: Phase;
}

export type StairShape = 'straight' | 'L' | 'U';

export const STAIR_SHAPE_LABELS: Record<StairShape, string> = { straight: 'ישרות', L: 'בצורת L', U: 'בצורת U' };

export interface Stair {
  id: string;
  levelId: string;
  shape: StairShape;
  /** Middle of the first step's front edge. */
  p: Vec2;
  /** Walking direction of the first flight, degrees. */
  rot: number;
  width: number;
  /** Total height difference, mm. */
  rise: number;
  /** Number of risers. */
  risers: number;
  /** Tread depth (going), mm. */
  going: number;
  /** Landing depth for U stairs (the landing of L stairs is width × width), mm. */
  landing: number;
  /** Gap between the two flights of U stairs, mm. */
  gap: number;
  turn: 'left' | 'right';
  /** Cut an opening in the floor slab of the level the stairs reach. */
  cutUpper: boolean;
  color: string;
  material: string;
  phase: Phase;
}

export type RoofShape = 'flat' | 'shed' | 'gable';

export const ROOF_SHAPE_LABELS: Record<RoofShape, string> = { flat: 'גג שטוח', shed: 'גג חד־שיפועי', gable: 'גג דו־שיפועי' };

export interface Roof {
  id: string;
  levelId: string;
  shape: RoofShape;
  /** Outline at the wall line. Shed and gable roofs use the rectangle along pts[0]→pts[1]. */
  pts: Vec2[];
  /** Bottom of the roof at the eaves, relative to the level's floor, mm. */
  base: number;
  thickness: number;
  /** Pitch, degrees (shed and gable). */
  slope: number;
  overhang: number;
  /** Parapet height for flat roofs, mm (0 = none). */
  parapet: number;
  /** Fill the triangles under the pitched roof at the ends (gables). */
  gableWalls: boolean;
  color: string;
  material: string;
  phase: Phase;
}

export interface Furniture {
  id: string;
  levelId: string;
  /** Catalogue item, see furniture.ts. */
  kind: string;
  name: string;
  p: Vec2;
  rot: number;
  w: number;
  d: number;
  h: number;
  /** Height of the bottom above the floor, mm (upper cabinets, mirrors, lamps). */
  elev: number;
  color: string;
  color2: string;
  material: string;
  phase: Phase;
}

export interface Column {
  id: string;
  levelId: string;
  p: Vec2;
  w: number;
  d: number;
  round: boolean;
  rot: number;
  /** null = the level's ceiling height. */
  height: number | null;
  color: string;
  phase: Phase;
}

export interface Beam {
  id: string;
  levelId: string;
  a: Vec2;
  b: Vec2;
  w: number;
  h: number;
  color: string;
  phase: Phase;
}

export type Annotation =
  | { id: string; levelId: string; type: 'dim'; a: Vec2; b: Vec2; offset: number }
  | { id: string; levelId: string; type: 'text'; p: Vec2; text: string; size: number };

export interface BldSection {
  id: string;
  label: string;
  mode: 'section' | 'elevation';
  a: Vec2;
  b: Vec2;
  /** 1: looking to the left of a→b, -1: looking to the right. */
  side: 1 | -1;
  /** How far beyond the plane elements are drawn, mm. */
  depth: number;
  showDims: boolean;
  showLevels: boolean;
  showFurniture: boolean;
}

export type SheetPaper = 'A4' | 'A3' | 'A2' | 'A1';

export type PlanKind = 'plan' | 'furniture' | 'existing' | 'demolition' | 'proposed';

export const PLAN_KIND_LABELS: Record<PlanKind, string> = {
  plan: 'תוכנית קומה', furniture: 'תוכנית ריהוט', existing: 'תוכנית מצב קיים', demolition: 'תוכנית הריסה', proposed: 'תוכנית מצב מוצע',
};

export type BSheetItem =
  | { id: string; type: 'plan'; x: number; y: number; scale: number; levelId: string; plan: PlanKind; dims: boolean; title: string }
  | { id: string; type: 'section'; x: number; y: number; scale: number; sectionId: string; title: string }
  | { id: string; type: 'view3d'; x: number; y: number; w: number; h: number; view: 'iso' | 'persp'; image: string | null; imageKey: string; title: string }
  | { id: string; type: 'legend'; x: number; y: number; title: string }
  | { id: string; type: 'north'; x: number; y: number; size: number }
  | { id: string; type: 'text'; x: number; y: number; text: string; size: number; bold: boolean }
  | { id: string; type: 'areas'; x: number; y: number; title: string }
  | { id: string; type: 'openings'; x: number; y: number; title: string }
  | { id: string; type: 'info'; x: number; y: number };

export type BSheetItemType = BSheetItem['type'];

export interface SheetInfo {
  projectTitle: string;
  student: string;
  course: string;
  lecturer: string;
  institution: string;
  date: string;
  sheetNo: string;
}

export interface BSheet {
  id: string;
  name: string;
  paper: SheetPaper;
  orientation: 'portrait' | 'landscape';
  blackWhite: boolean;
  frame: boolean;
  ruler: boolean;
  items: BSheetItem[];
}

export interface BuildingData {
  schema: number;
  levels: Level[];
  walls: Wall[];
  openings: Opening[];
  rooms: Room[];
  slabs: Slab[];
  stairs: Stair[];
  roofs: Roof[];
  furniture: Furniture[];
  columns: Column[];
  beams: Beam[];
  annotations: Annotation[];
  sections: BldSection[];
  sheets: BSheet[];
  info: SheetInfo;
  /** Lot boundary (optional), drawn on the ground level. */
  lot: Vec2[];
  /** Level of the ground around the building, mm (drawn in sections and elevations). */
  groundLevel: number;
  /** A renovation project shows phases (existing / demolish / new). */
  renovation: boolean;
  /** Phase given to newly drawn elements in a renovation. */
  drawPhase: Phase;
  grid: { size: number; show: boolean; snap: boolean };
  /** Direction of north on the plan, degrees from +Y, counter-clockwise. */
  north: number;
}

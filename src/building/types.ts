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

/**
 * Finish of a surface. Version 3.0 stored only material and colour; version 4.0 adds optional fields (v: 4 and the
 * texture settings). A finish without v keeps its 3.0 look, so stored projects do not change until they are edited.
 */
export interface Finish {
  material: string;
  color: string;
  /** Set when the finish was edited in 4.0: textures, sizes and joints below are used. */
  v?: 4;
  /** Second colour of patterned materials (wallpaper print, veins). */
  color2?: string;
  /** Tile, plank or pattern size, mm. */
  tw?: number;
  th?: number;
  /** Texture rotation, degrees. */
  angle?: number;
  layout?: import('../materials/catalog').Layout;
  grout?: string;
  groutW?: number;
  /** 0 glossy … 1 matte. */
  rough?: number;
  metal?: number;
  opacity?: number;
  /** Custom local image (id in BuildingData.images), used as the texture. */
  img?: string;
}

/** Extra fields shared by every element in 4.0 (all optional, so 3.0 data stays valid). */
export interface ElExtra {
  /** A locked element is not moved, rotated or deleted by ordinary editing. */
  locked?: boolean;
  /** A hidden element is kept in the project but not drawn. */
  hidden?: boolean;
  /** Layer id (BuildingData.layers). */
  layer?: string;
}

/** Part of one face of a wall with its own finish (tiles up to 1.20 m, an accent strip...). Heights from the floor. */
export interface WallZone {
  id: string;
  side: 'L' | 'R';
  /** Along the wall from its start, mm; null = from the start / to the end of the face. */
  s0: number | null;
  s1: number | null;
  z0: number;
  /** null = up to the top of the wall. */
  z1: number | null;
  finish: Finish;
  name?: string;
}

export type WallKind = 'exterior' | 'interior' | 'partition';

export const WALL_KIND_LABELS: Record<WallKind, string> = { exterior: 'קיר חיצוני', interior: 'קיר פנימי', partition: 'מחיצה' };

export interface Wall extends ElExtra {
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
  /** 4.0: partial finishes on the faces, drawn over the face finish in order. */
  zones?: WallZone[];
}

export type OpeningKind =
  | 'door' | 'door-double' | 'door-sliding' | 'door-entry' | 'door-glass'
  | 'window' | 'window-sliding' | 'window-fixed' | 'window-large' | 'vitrine';

/** Outline of an opening in the wall's elevation (4.0). Curved shapes cut a real curved hole. */
export type OpeningShape = 'rect' | 'arch' | 'segment' | 'pointed' | 'ellipse' | 'round' | 'oval';

export const OPENING_SHAPE_LABELS: Record<OpeningShape, string> = {
  rect: 'מלבני', arch: 'קשת חצי־עגולה', segment: 'קשת שטוחה (מקטע)', pointed: 'קשת מחודדת', ellipse: 'קשת אליפטית', round: 'עגול', oval: 'אליפטי (סגלגל)',
};

/** Special kinds of openings (4.0), stored with a 3.0 kind so that 3.0 still opens the project. */
export type OpeningVariant = 'passage' | 'barn' | 'protected' | 'deco' | 'grid' | 'niche' | 'metal' | 'pivot';

export interface Opening extends ElExtra {
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
  /** 4.0: outline (default rect). */
  shape?: OpeningShape;
  /** 4.0: height of the arch above its springing line, mm (segment, pointed and elliptical arches). */
  rise?: number;
  variant?: OpeningVariant;
  /** 4.0: depth of a niche from the wall face, mm. */
  depth?: number;
  /** 4.0: glass colour and leaf colour. */
  glass?: string;
  leaf?: string;
  /** Preset the opening was made from (label in the interface). */
  preset?: string;
}

export interface FloorFinish {
  material: string;
  color: string;
  /** Tile or plank size, mm (0 = no pattern). */
  tileW: number;
  tileH: number;
  /** Laying direction, degrees. */
  angle: number;
  /** 4.0 fields, as in Finish. */
  v?: 4;
  color2?: string;
  layout?: import('../materials/catalog').Layout;
  grout?: string;
  groutW?: number;
  rough?: number;
  img?: string;
}

/** 4.0: design of a room's ceiling (for illustration only). */
export interface CeilingDesign {
  finish: Finish;
  /** Lowered ceiling: distance below the structural ceiling, mm (0 = none). */
  drop: number;
  /** Decorative beams under the ceiling (0 = none). */
  beams: number;
  beamW: number;
  beamH: number;
  /** Direction of the beams, degrees. */
  beamDir: number;
  beamColor: string;
}

/** 4.0: a part of a floor with its own finish (a rug of tiles in a parquet floor, a kitchen strip). */
export interface FloorZone extends ElExtra {
  id: string;
  levelId: string;
  name: string;
  pts: Vec2[];
  floor: FloorFinish;
}

/** Room: either found automatically from the walls around a point (seed), or drawn as a polygon. */
export interface Room extends ElExtra {
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
  /** 4.0: ceiling design. */
  ceiling?: CeilingDesign;
  /** 4.0: a protected room shown for study (ממ״ד להמחשה); never a certified design. */
  safeRoom?: boolean;
}

export type SlabKind = 'floor' | 'ceiling' | 'balcony' | 'void';

export const SLAB_KIND_LABELS: Record<SlabKind, string> = { floor: 'רצפה', ceiling: 'תקרה', balcony: 'מרפסת', void: 'חלל פתוח (פתח ברצפה)' };

export interface Slab extends ElExtra {
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

export interface Stair extends ElExtra {
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

export interface Roof extends ElExtra {
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

/** 4.0: state of a light fitting. */
export interface LightState {
  on: boolean;
  /** 0 … 1. */
  dim: number;
  /** Colour of the light: warm, neutral, cold or a custom colour. */
  temp: 'warm' | 'neutral' | 'cold' | string;
}

export interface Furniture extends ElExtra {
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
  /** 4.0: third colour and the materials of the item's parts (slot 1, 2, 3). Without mats the 3.0 look is kept. */
  color3?: string;
  mats?: (string | null)[];
  light?: LightState;
}

export interface Column extends ElExtra {
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

export interface Beam extends ElExtra {
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
  | ({ id: string; levelId: string; type: 'dim'; a: Vec2; b: Vec2; offset: number } & ElExtra)
  | ({ id: string; levelId: string; type: 'text'; p: Vec2; text: string; size: number } & ElExtra);

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
  /** 4.0: floor zones, layers and local images (custom wallpapers). All optional. */
  floorZones?: FloorZone[];
  layers?: BLayer[];
  images?: CustomImage[];
}

export interface BLayer { id: string; name: string; visible: boolean; locked: boolean }

/** A picture chosen by the user from the device (for a custom wallpaper). Kept inside the project, never uploaded. */
export interface CustomImage { id: string; name: string; dataUrl: string; w: number; h: number }

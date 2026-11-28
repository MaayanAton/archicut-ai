// Data model of the "site planning" module (תכנון אדריכלי ומתחמים).
// Plain JSON only. One shared model feeds the plan, the 3D model, the sections and the sheets.
//
// Units: every length is in real-world millimetres (like the rest of the app), every height (z) is an
// absolute level in millimetres where 0 is the project's ±0.00. The UI shows metres. Angles are degrees,
// counter-clockwise, 0 = along +X. The plan uses +Y as "up on the screen" (north when north = 0).

import type { Vec2 } from '../geometry/vec';

/** Version of the site data inside a project. Raised when the shape changes; see migrate.ts. */
export const SITE_SCHEMA = 1;

export type SiteGeom =
  | { type: 'point'; p: Vec2; rot: number }
  /** Open polyline (paths, walls, fences). curved = smooth curve through the points. */
  | { type: 'line'; pts: Vec2[]; curved: boolean }
  /** Closed polygon (lots, lawns, plazas, pools, buildings...). */
  | { type: 'area'; pts: Vec2[]; curved: boolean }
  /** Two points with an offset: dimension lines. */
  | { type: 'dim'; a: Vec2; b: Vec2; offset: number };

export type MaterialId =
  | 'grass' | 'planting' | 'soil' | 'gravel' | 'concrete' | 'paving' | 'stone' | 'wood' | 'metal'
  | 'plaster' | 'water' | 'foliage' | 'bark' | 'rubber' | 'glass' | 'none';

export interface SiteElement {
  id: string;
  /** Library item id, see library.ts. */
  kind: string;
  layer: string;
  /** Optional label shown in the plan (zones, buildings, text). */
  name: string;
  geom: SiteGeom;
  /** Kind-specific numeric parameters (millimetres, degrees or counts). Defined by the library. */
  params: Record<string, number>;
  /** 'ground': elevation is an offset above the terrain; 'absolute': elevation is an absolute level. */
  elevMode: 'ground' | 'absolute';
  elev: number;
  color: string;
  material: MaterialId;
  /** 4.0 (optional): second colour of multi-part items, and a texture finish from the shared catalogue. */
  color2?: string;
  finish?: import('../materials/finish').FinishLike;
}

export interface SiteLayer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
}

export type HeightSource = 'survey' | 'manual';

export const HEIGHT_SOURCE_LABELS: Record<HeightSource, string> = {
  survey: 'נתון מדידה',
  manual: 'הוזן ידנית',
};

export interface HeightPoint {
  id: string;
  p: Vec2;
  z: number;
  source: HeightSource;
  note: string;
}

/** Designed hill (h > 0) or depression (h < 0): a smooth bump of radius r added to the terrain. */
export interface Mound {
  id: string;
  c: Vec2;
  r: number;
  h: number;
}

export interface TerrainData {
  /** Level of the ground where nothing else is known (default ±0.00). Used at the corners of the site. */
  base: number;
  points: HeightPoint[];
  mounds: Mound[];
  /** Contour interval, mm. */
  contourStep: number;
  showContours: boolean;
  showPoints: boolean;
}

export interface SiteSection {
  id: string;
  /** Letter shown as A-A, B-B... */
  label: string;
  mode: 'section' | 'elevation';
  a: Vec2;
  b: Vec2;
  /** 1: looking to the left of a→b, -1: looking to the right. */
  side: 1 | -1;
  /** How far beyond the cutting plane elements are drawn, mm. */
  depth: number;
  showDims: boolean;
  showLevels: boolean;
}

export type SheetPaper = 'A4' | 'A3' | 'A2' | 'A1';

export type SheetItem =
  | { id: string; type: 'plan'; x: number; y: number; scale: number; contours: boolean; title: string }
  | { id: string; type: 'section'; x: number; y: number; scale: number; sectionId: string; title: string }
  | { id: string; type: 'view3d'; x: number; y: number; w: number; h: number; view: 'iso' | 'persp'; image: string | null; imageKey: string; title: string }
  | { id: string; type: 'legend'; x: number; y: number; title: string }
  | { id: string; type: 'north'; x: number; y: number; size: number }
  | { id: string; type: 'text'; x: number; y: number; text: string; size: number; bold: boolean }
  | { id: string; type: 'areas'; x: number; y: number; title: string }
  | { id: string; type: 'info'; x: number; y: number };

export type SheetItemType = SheetItem['type'];

export interface SheetInfo {
  projectTitle: string;
  student: string;
  course: string;
  lecturer: string;
  institution: string;
  date: string;
  sheetNo: string;
}

export interface SiteSheet {
  id: string;
  name: string;
  paper: SheetPaper;
  orientation: 'portrait' | 'landscape';
  blackWhite: boolean;
  frame: boolean;
  ruler: boolean;
  items: SheetItem[];
}

export interface SiteData {
  schema: number;
  elements: SiteElement[];
  layers: SiteLayer[];
  terrain: TerrainData;
  sections: SiteSection[];
  sheets: SiteSheet[];
  info: SheetInfo;
  /** Background map or plan, same structure as in drawing projects. */
  background: import('../document/types').BackgroundImage | null;
  /** Where the background image's bottom-left corner sits in the site, mm. */
  backgroundOrigin: Vec2;
  grid: { size: number; show: boolean; snap: boolean };
  snap: { points: boolean; lines: boolean };
  /** Direction of north on the plan, degrees from +Y (0 = up), counter-clockwise. */
  north: number;
}

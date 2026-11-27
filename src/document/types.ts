// Project document model. Plain JSON-serialisable data only.
// All lengths are millimetres in the real world unless stated otherwise.

import type { AxonometricSettings, EpureSettings, SpacePoint } from '../geometry/projection';
import type { PlaneControls } from '../geometry/section';
import type { SolidParams } from '../geometry/solids';
import type { Vec2 } from '../geometry/vec';
import type { SiteData } from '../site/types';

/** Version 2 added site projects. Files without site projects are still written as version 1. */
export const FILE_VERSION = 2;

export type ProjectType = 'projections' | 'section' | 'drawing' | 'site';

export const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  projections: 'הנדסה תיאורית והיטלים',
  section: 'גוף וחתך',
  drawing: 'שרטוט',
  site: 'תכנון אדריכלי ומתחמים',
};

export interface TitleBlock {
  title: string;
  name: string;
  className: string;
  date: string;
  exerciseNo: string;
  submitter: string;
  grade: string;
  sheetNo: string;
}

export type Paper = 'A4' | 'A3' | 'A2' | 'A1';

export interface PrintSettings {
  paper: Paper;
  orientation: 'portrait' | 'landscape';
  /** Scale denominator: 50 means 1:50. */
  scale: number;
  blackWhite: boolean;
  ruler: boolean;
  frame: boolean;
  /** Printer correction factor measured by the user (1 = none). */
  printerCorrection: number;
  /** Projections only: what to print. */
  include?: 'epure' | 'axonometric' | 'both';
  /** Drawing only: print the background image. */
  printBackground?: boolean;
}

export interface ProjectionsData {
  points: SpacePoint[];
  epure: EpureSettings;
  axo: AxonometricSettings;
  /** Show construction lines between projections. */
  showConstruction: boolean;
}

export interface SectionData {
  solid: SolidParams;
  plane: PlaneControls;
}

export type LineStyle = 'solid' | 'dashed' | 'dashdot' | 'hidden';

export const LINE_STYLE_LABELS: Record<LineStyle, string> = {
  solid: 'רציף',
  dashed: 'מקווקו',
  dashdot: 'נקודה-קו (ציר)',
  hidden: 'מוסתר (קווקוו קצר)',
};

interface ElBase {
  id: string;
  style: LineStyle;
  /** Line thickness on paper, mm. */
  width: number;
}

export type DrawingElement =
  | (ElBase & { kind: 'point'; p: Vec2; label: string })
  | (ElBase & { kind: 'line'; a: Vec2; b: Vec2 })
  | (ElBase & { kind: 'rect'; x: number; y: number; w: number; h: number; angle: number })
  | (ElBase & { kind: 'circle'; c: Vec2; r: number })
  | (ElBase & { kind: 'polygon'; pts: Vec2[]; closed: boolean })
  | (ElBase & { kind: 'text'; p: Vec2; text: string; size: number })
  | (ElBase & { kind: 'dim'; a: Vec2; b: Vec2; offset: number });

export type ElementKind = DrawingElement['kind'];

export interface BackgroundImage {
  dataUrl: string;
  /** Pixel size of the (already rotated and cropped) image. */
  pxW: number;
  pxH: number;
  /** Real-world millimetres per image pixel, set only by calibration. null = not calibrated. */
  mmPerPx: number | null;
  calibration: { a: Vec2; b: Vec2; mm: number } | null;
  opacity: number;
  visible: boolean;
  sourceName: string;
}

export interface DrawingData {
  elements: DrawingElement[];
  background: BackgroundImage | null;
  grid: { size: number; show: boolean; snap: boolean };
  /** Layout for image projects: drawing over the image, or image beside the drawing. */
  layout: 'overlay' | 'side';
}

interface ProjectBase {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  /** Built-in demonstration project (uses demonstration data, not real exercise data). */
  demo: boolean;
  titleBlock: TitleBlock;
  print: PrintSettings;
}

export type Project =
  | (ProjectBase & { type: 'projections'; data: ProjectionsData })
  | (ProjectBase & { type: 'section'; data: SectionData })
  | (ProjectBase & { type: 'drawing'; data: DrawingData })
  | (ProjectBase & { type: 'site'; data: SiteData });

export type ProjectData = Project['data'];

export interface ProjectFile {
  app: 'ArchiCut AI';
  version: number;
  exportedAt: string;
  projects: Project[];
}

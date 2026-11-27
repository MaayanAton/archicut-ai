// Materials for walls, floors and furniture. Each has a label, a default colour and a simple pattern that the
// 3D view draws at the real tile or plank size. This is a schematic look, not a photo-realistic rendering.

export type Pattern = 'plain' | 'tile' | 'plank' | 'stone' | 'concrete' | 'glass' | 'metal';

export interface MaterialDef {
  id: string;
  label: string;
  color: string;
  pattern: Pattern;
  /** Default tile or plank size, mm (floors). */
  tileW: number;
  tileH: number;
  /** Where it is offered. */
  use: ('floor' | 'wall' | 'object')[];
}

export const MATERIALS: MaterialDef[] = [
  { id: 'paint', label: 'צבע (טיח צבוע)', color: '#f4f1ea', pattern: 'plain', tileW: 0, tileH: 0, use: ['wall', 'object'] },
  { id: 'plaster', label: 'טיח', color: '#e9e4da', pattern: 'plain', tileW: 0, tileH: 0, use: ['wall'] },
  { id: 'parquet', label: 'פרקט', color: '#c89a64', pattern: 'plank', tileW: 1200, tileH: 180, use: ['floor', 'wall'] },
  { id: 'laminate', label: 'למינציה בגוון עץ', color: '#b98b5a', pattern: 'plank', tileW: 1380, tileH: 195, use: ['floor'] },
  { id: 'ceramic', label: 'קרמיקה', color: '#e6e2da', pattern: 'tile', tileW: 300, tileH: 300, use: ['floor', 'wall'] },
  { id: 'porcelain', label: 'גרניט פורצלן', color: '#d6d2ca', pattern: 'tile', tileW: 600, tileH: 600, use: ['floor', 'wall'] },
  { id: 'porcelain-large', label: 'אריחים גדולים', color: '#cfcac0', pattern: 'tile', tileW: 1200, tileH: 600, use: ['floor', 'wall'] },
  { id: 'terrazzo', label: 'טראצו', color: '#d9d3c7', pattern: 'tile', tileW: 400, tileH: 400, use: ['floor'] },
  { id: 'concrete', label: 'בטון', color: '#b9b8b3', pattern: 'concrete', tileW: 0, tileH: 0, use: ['floor', 'wall', 'object'] },
  { id: 'stone', label: 'אבן', color: '#dccdae', pattern: 'stone', tileW: 600, tileH: 300, use: ['floor', 'wall'] },
  { id: 'marble', label: 'שיש', color: '#ece9e4', pattern: 'tile', tileW: 600, tileH: 600, use: ['floor', 'wall', 'object'] },
  { id: 'wood', label: 'עץ', color: '#a9784a', pattern: 'plank', tileW: 2000, tileH: 150, use: ['wall', 'object', 'floor'] },
  { id: 'wood-cladding', label: 'חיפוי עץ', color: '#9b6b3f', pattern: 'plank', tileW: 2400, tileH: 120, use: ['wall'] },
  { id: 'stone-cladding', label: 'חיפוי אבן', color: '#d3c3a1', pattern: 'stone', tileW: 500, tileH: 250, use: ['wall'] },
  { id: 'brick', label: 'לבנים', color: '#b5654a', pattern: 'stone', tileW: 240, tileH: 70, use: ['wall'] },
  { id: 'tile-wall', label: 'חיפוי קרמיקה', color: '#f0f0ee', pattern: 'tile', tileW: 200, tileH: 200, use: ['wall'] },
  { id: 'glass', label: 'זכוכית', color: '#a9cde0', pattern: 'glass', tileW: 0, tileH: 0, use: ['object'] },
  { id: 'metal', label: 'מתכת', color: '#8e959c', pattern: 'metal', tileW: 0, tileH: 0, use: ['object'] },
  { id: 'aluminium', label: 'אלומיניום', color: '#c4c8cc', pattern: 'metal', tileW: 0, tileH: 0, use: ['object'] },
  { id: 'fabric', label: 'בד', color: '#8a9aa5', pattern: 'plain', tileW: 0, tileH: 0, use: ['object'] },
  { id: 'leather', label: 'עור', color: '#7a4e32', pattern: 'plain', tileW: 0, tileH: 0, use: ['object'] },
  { id: 'lacquer', label: 'צבע תעשייתי', color: '#f5f5f2', pattern: 'plain', tileW: 0, tileH: 0, use: ['object'] },
  { id: 'ceramic-white', label: 'חרסינה', color: '#fafafa', pattern: 'plain', tileW: 0, tileH: 0, use: ['object'] },
  { id: 'plant', label: 'צמח', color: '#5e8f4e', pattern: 'plain', tileW: 0, tileH: 0, use: ['object'] },
];

const BY_ID = new Map(MATERIALS.map((m) => [m.id, m]));
export const material = (id: string): MaterialDef => BY_ID.get(id) ?? MATERIALS[0];
export const materialsFor = (use: 'floor' | 'wall' | 'object') => MATERIALS.filter((m) => m.use.includes(use));

/** Colour palette offered next to the colour picker. */
export const PALETTE = ['#f4f1ea', '#ffffff', '#e8e2d6', '#d9d4ca', '#c9c4b8', '#a7a197', '#5f6a74', '#2f3a44', '#c89a64', '#a9784a', '#7a4e32', '#d8c6a5', '#b5654a', '#8a9aa5', '#5e8f4e', '#9fb9a0', '#e0b04a', '#c96f5a', '#4f7fa8', '#a9cde0'];

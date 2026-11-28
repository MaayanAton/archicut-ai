// Shared material catalogue (4.0). One list for floors, walls, ceilings, furniture and outdoor surfaces, used by the
// building and the site modules. A material is not only a colour: it has a procedural texture (pattern), a physical
// size for that texture, a laying layout, joints (grout), roughness, metalness and transparency. The textures are drawn
// by code on a canvas (texture.ts); nothing is downloaded and nothing depends on the internet.
//
// Materials of version 3.0 keep their ids, labels and colours (legacy: true), so stored projects keep their look.

export type MatUse = 'floor' | 'wall' | 'ceiling' | 'object' | 'outdoor';

export type MatCat =
  | 'paint' | 'wood' | 'tile' | 'stone' | 'floor' | 'wallpaper' | 'cladding' | 'ceiling'
  | 'fabric' | 'metal' | 'glass' | 'counter' | 'outdoor' | 'plant' | 'water';

export const MAT_CATS: { id: MatCat; label: string }[] = [
  { id: 'paint', label: 'צבע וטיח' },
  { id: 'wood', label: 'פרקט ועץ' },
  { id: 'tile', label: 'קרמיקה וגרניט פורצלן' },
  { id: 'stone', label: 'שיש ואבן' },
  { id: 'floor', label: 'רצפות נוספות' },
  { id: 'wallpaper', label: 'טפטים' },
  { id: 'cladding', label: 'חיפויי קירות' },
  { id: 'ceiling', label: 'תקרות' },
  { id: 'fabric', label: 'בדים ועור' },
  { id: 'metal', label: 'מתכות' },
  { id: 'glass', label: 'זכוכית' },
  { id: 'counter', label: 'משטחים וחזיתות' },
  { id: 'outdoor', label: 'משטחי חוץ' },
  { id: 'plant', label: 'צמחייה וקרקע' },
  { id: 'water', label: 'מים' },
];

/** Procedural texture kinds (texture.ts draws each one). */
export type PatternId =
  | 'plain' | 'plank' | 'tile' | 'hex' | 'mosaic' | 'tile-deco' | 'tile-geo' | 'tile-painted'
  | 'marble' | 'travertine' | 'granite' | 'stone' | 'flagstone' | 'concrete' | 'concrete-deco' | 'terrazzo'
  | 'carpet' | 'rubber' | 'stripes-h' | 'stripes-v' | 'wp-geo' | 'wp-floral' | 'wp-leaves' | 'wp-tropical'
  | 'wp-damask' | 'wp-luxury' | 'wp-minimal' | 'wp-kids' | 'wp-fabric' | 'wp-3d' | 'wp-ogee' | 'wp-modern'
  | 'brick' | 'slats' | 'panels' | 'plaster-deco' | 'metal' | 'metal-corrugated' | 'glass' | 'glass-deco'
  | 'grass' | 'soil' | 'sand' | 'gravel' | 'pebbles' | 'woodchips' | 'groundcover' | 'flowerbed'
  | 'pavers' | 'asphalt' | 'paving-geo' | 'paving-green' | 'stepping' | 'leather' | 'water' | 'acoustic' | 'weave';

/** Laying layout of planks and tiles. */
export type Layout = 'straight' | 'staggered' | 'herringbone' | 'chevron' | 'basket' | 'grid' | 'offset' | 'stack';

export const LAYOUT_LABELS: Record<Layout, string> = {
  straight: 'לוחות ישרים (חצי לוח)',
  staggered: 'פריסה מדורגת',
  herringbone: 'פישבון',
  chevron: 'שברון',
  basket: 'דוגמה מרובעת (קליעה)',
  grid: 'רשת ישרה',
  offset: 'פריסה בהיסט (לבנים)',
  stack: 'אנכי מוערם',
};

export const PLANK_LAYOUTS: Layout[] = ['straight', 'staggered', 'herringbone', 'chevron', 'basket'];
export const TILE_LAYOUTS: Layout[] = ['grid', 'offset', 'stack'];

export interface MatDef {
  id: string;
  label: string;
  cat: MatCat;
  /** Base colour. */
  color: string;
  /** Second colour of patterned materials (veins, print, grout of mosaics). */
  color2: string;
  pattern: PatternId;
  /** Physical size of one tile, plank or pattern repeat, mm (0 = no pattern). */
  w: number;
  h: number;
  layout?: Layout;
  /** Joint colour and width, mm (tiles, planks, bricks). */
  grout?: string;
  groutW?: number;
  /** 0 = mirror-like, 1 = fully matte. */
  rough: number;
  metal: number;
  /** 1 = opaque. */
  opacity: number;
  use: MatUse[];
  /** Search words (Hebrew synonyms). */
  kw: string;
  /** Material of version 3.0: shown with its 3.0 look until it is edited in 4.0. */
  legacy?: boolean;
  /** 3.0 pattern kind of a legacy material (used by the 3.0 texture code). */
  legacyPattern?: 'plain' | 'tile' | 'plank' | 'stone' | 'concrete' | 'glass' | 'metal';
}

type Opt = Partial<Pick<MatDef, 'layout' | 'grout' | 'groutW' | 'rough' | 'metal' | 'opacity' | 'kw' | 'legacy' | 'legacyPattern' | 'color2'>>;

const M = (id: string, label: string, cat: MatCat, color: string, pattern: PatternId, w: number, h: number, use: MatUse[], o: Opt = {}): MatDef => ({
  id, label, cat, color, color2: o.color2 ?? color, pattern, w, h, use, rough: o.rough ?? 0.75, metal: o.metal ?? 0, opacity: o.opacity ?? 1, kw: o.kw ?? '',
  ...(o.layout ? { layout: o.layout } : {}), ...(o.grout ? { grout: o.grout } : {}), ...(o.groutW !== undefined ? { groutW: o.groutW } : {}),
  ...(o.legacy ? { legacy: true, legacyPattern: o.legacyPattern } : {}),
});

const FW: MatUse[] = ['floor', 'wall'];
const WALL: MatUse[] = ['wall'];
const OBJ: MatUse[] = ['object'];
const OUT: MatUse[] = ['outdoor'];
const wood = (id: string, label: string, color: string, kw: string, o: Opt = {}) => M(id, label, 'wood', color, 'plank', 1200, 180, ['floor', 'wall', 'ceiling', 'object'], { layout: 'straight', grout: '#5a4632', groutW: 1, rough: 0.6, kw: `פרקט עץ ${kw}`, ...o });
const tile = (id: string, label: string, color: string, w: number, h: number, kw: string, o: Opt = {}) => M(id, label, 'tile', color, 'tile', w, h, FW, { layout: 'grid', grout: '#bdb8ae', groutW: 3, rough: 0.45, kw: `קרמיקה אריח ${kw}`, ...o });
const wp = (id: string, label: string, pattern: PatternId, color: string, color2: string, w: number, h: number, kw: string) => M(id, label, 'wallpaper', color, pattern, w, h, WALL, { color2, rough: 0.85, kw: `טפט ${kw}` });

export const CATALOG: MatDef[] = [
  // ---------------------------------------------------------------- 3.0 materials (kept as they were)
  M('paint', 'צבע (טיח צבוע)', 'paint', '#f4f1ea', 'plain', 0, 0, ['wall', 'ceiling', 'object'], { legacy: true, legacyPattern: 'plain', rough: 0.9, kw: 'צבע קיר טיח' }),
  M('plaster', 'טיח', 'paint', '#e9e4da', 'plain', 0, 0, ['wall', 'ceiling'], { legacy: true, legacyPattern: 'plain', rough: 0.95, kw: 'טיח חוץ' }),
  M('parquet', 'פרקט', 'wood', '#c89a64', 'plank', 1200, 180, ['floor', 'wall'], { legacy: true, legacyPattern: 'plank', layout: 'straight', grout: '#6b4d2e', groutW: 1, rough: 0.6, kw: 'פרקט עץ' }),
  M('laminate', 'למינציה בגוון עץ', 'wood', '#b98b5a', 'plank', 1380, 195, ['floor'], { legacy: true, legacyPattern: 'plank', layout: 'staggered', grout: '#6b4d2e', groutW: 1, rough: 0.55, kw: 'למינציה פרקט' }),
  M('ceramic', 'קרמיקה', 'tile', '#e6e2da', 'tile', 300, 300, FW, { legacy: true, legacyPattern: 'tile', layout: 'grid', grout: '#bdb8ae', groutW: 3, rough: 0.45, kw: 'קרמיקה אריח' }),
  M('porcelain', 'גרניט פורצלן', 'tile', '#d6d2ca', 'tile', 600, 600, FW, { legacy: true, legacyPattern: 'tile', layout: 'grid', grout: '#b5b0a6', groutW: 3, rough: 0.4, kw: 'גרניט פורצלן אריח' }),
  M('porcelain-large', 'אריחים גדולים', 'tile', '#cfcac0', 'tile', 1200, 600, FW, { legacy: true, legacyPattern: 'tile', layout: 'grid', grout: '#b0ab9f', groutW: 2, rough: 0.4, kw: 'אריח גדול פורצלן' }),
  M('terrazzo', 'טראצו', 'floor', '#d9d3c7', 'terrazzo', 400, 400, ['floor'], { legacy: true, legacyPattern: 'tile', grout: '#b9b2a4', groutW: 2, color2: '#9c8f7b', rough: 0.4, kw: 'טרצו טראצו' }),
  M('concrete', 'בטון', 'stone', '#b9b8b3', 'concrete', 1200, 1200, ['floor', 'wall', 'ceiling', 'object', 'outdoor'], { legacy: true, legacyPattern: 'concrete', rough: 0.85, kw: 'בטון חשוף' }),
  M('stone', 'אבן', 'stone', '#dccdae', 'stone', 600, 300, ['floor', 'wall', 'outdoor'], { legacy: true, legacyPattern: 'stone', layout: 'offset', grout: '#b9aa8b', groutW: 4, rough: 0.8, kw: 'אבן ירושלמית' }),
  M('marble', 'שיש', 'stone', '#ece9e4', 'marble', 600, 600, ['floor', 'wall', 'object'], { legacy: true, legacyPattern: 'tile', color2: '#a8a39b', grout: '#d9d5ce', groutW: 1, rough: 0.2, kw: 'שיש' }),
  M('wood', 'עץ', 'wood', '#a9784a', 'plank', 2000, 150, ['wall', 'object', 'floor'], { legacy: true, legacyPattern: 'plank', layout: 'straight', grout: '#5a3f26', groutW: 1, rough: 0.65, kw: 'עץ' }),
  M('wood-cladding', 'חיפוי עץ', 'cladding', '#9b6b3f', 'plank', 2400, 120, WALL, { legacy: true, legacyPattern: 'plank', layout: 'straight', grout: '#4d3420', groutW: 3, rough: 0.7, kw: 'חיפוי עץ' }),
  M('stone-cladding', 'חיפוי אבן', 'cladding', '#d3c3a1', 'stone', 500, 250, WALL, { legacy: true, legacyPattern: 'stone', layout: 'offset', grout: '#a89878', groutW: 6, rough: 0.85, kw: 'חיפוי אבן' }),
  M('brick', 'לבנים', 'cladding', '#b5654a', 'brick', 240, 70, ['wall', 'outdoor'], { legacy: true, legacyPattern: 'stone', layout: 'offset', grout: '#d8d0c2', groutW: 10, rough: 0.9, kw: 'לבנים בריקים' }),
  M('tile-wall', 'חיפוי קרמיקה', 'cladding', '#f0f0ee', 'tile', 200, 200, WALL, { legacy: true, legacyPattern: 'tile', layout: 'grid', grout: '#cfcfcb', groutW: 2, rough: 0.35, kw: 'חיפוי קרמיקה' }),
  M('glass', 'זכוכית', 'glass', '#a9cde0', 'glass', 0, 0, OBJ, { legacy: true, legacyPattern: 'glass', rough: 0.08, opacity: 0.35, kw: 'זכוכית' }),
  M('metal', 'מתכת', 'metal', '#8e959c', 'metal', 600, 600, OBJ, { legacy: true, legacyPattern: 'metal', rough: 0.35, metal: 0.7, kw: 'מתכת פלדה' }),
  M('aluminium', 'אלומיניום', 'metal', '#c4c8cc', 'metal', 600, 600, OBJ, { legacy: true, legacyPattern: 'metal', rough: 0.3, metal: 0.7, kw: 'אלומיניום' }),
  M('fabric', 'בד', 'fabric', '#8a9aa5', 'weave', 40, 40, OBJ, { legacy: true, legacyPattern: 'plain', rough: 0.95, kw: 'בד ריפוד' }),
  M('leather', 'עור', 'fabric', '#7a4e32', 'leather', 200, 200, OBJ, { legacy: true, legacyPattern: 'plain', rough: 0.5, kw: 'עור' }),
  M('lacquer', 'צבע תעשייתי', 'counter', '#f5f5f2', 'plain', 0, 0, OBJ, { legacy: true, legacyPattern: 'plain', rough: 0.35, kw: 'צבע תעשייתי פורמייקה' }),
  M('ceramic-white', 'חרסינה', 'tile', '#fafafa', 'plain', 0, 0, OBJ, { legacy: true, legacyPattern: 'plain', rough: 0.2, kw: 'חרסינה' }),
  M('plant', 'צמח', 'plant', '#5e8f4e', 'groundcover', 400, 400, OBJ, { legacy: true, legacyPattern: 'plain', rough: 0.9, kw: 'צמח עלווה' }),

  // ---------------------------------------------------------------- parquet and wood
  wood('oak-natural', 'אלון טבעי', '#c29a6b', 'אלון טבעי'),
  wood('oak-light', 'אלון בהיר', '#d9bf96', 'אלון בהיר'),
  wood('oak-dark', 'אלון כהה', '#7a5537', 'אלון כהה'),
  wood('oak-white', 'אלון מולבן', '#e4d8c5', 'אלון מולבן לבן'),
  wood('walnut', 'אגוז', '#6b4a33', 'אגוז'),
  wood('maple', 'מייפל', '#e3c79c', 'מייפל'),
  wood('teak', 'טיק', '#a67443', 'טיק'),
  wood('pine', 'אורן', '#d7b47a', 'אורן', { layout: 'staggered' }),
  wood('wood-gray', 'עץ אפור', '#9c968c', 'אפור'),
  wood('wood-black', 'עץ שחור', '#3a332e', 'שחור'),
  wood('wood-honey', 'עץ בגוון דבש', '#c98f45', 'דבש'),
  wood('wood-red', 'עץ בגוון אדמדם', '#934d33', 'אדמדם דובדבן'),
  wood('wood-rustic', 'עץ כפרי', '#a57d55', 'כפרי', { layout: 'staggered', rough: 0.8 }),
  wood('wood-aged', 'עץ מיושן', '#8f7a63', 'מיושן ממוחזר', { layout: 'staggered', rough: 0.85 }),
  wood('laminate-oak', 'למינציה דמוי אלון', '#bf9b70', 'למינציה', { layout: 'staggered', rough: 0.5 }),
  M('deck-wood', 'דק עץ', 'wood', '#9a6a43', 'plank', 2400, 140, ['floor', 'outdoor'], { layout: 'straight', grout: '#3d2a1a', groutW: 6, rough: 0.8, kw: 'דק עץ מרפסת' }),

  // ---------------------------------------------------------------- ceramic and porcelain
  tile('tile-white', 'אריח לבן', '#f2f1ed', 600, 600, 'לבן'),
  tile('tile-black', 'אריח שחור', '#2e2f31', 600, 600, 'שחור', { grout: '#55575a' }),
  tile('tile-gray-light', 'אריח אפור בהיר', '#c9c8c4', 600, 600, 'אפור בהיר'),
  tile('tile-gray-dark', 'אריח אפור כהה', '#6c6d6e', 600, 600, 'אפור כהה', { grout: '#5a5b5c' }),
  tile('tile-beige', 'אריח בז׳', '#d8c8ac', 600, 600, 'בז'),
  tile('tile-cream', 'אריח שמנת', '#ece2cc', 600, 600, 'שמנת'),
  tile('tile-brown', 'אריח חום', '#8a674a', 600, 600, 'חום', { grout: '#6d5745' }),
  tile('tile-green', 'אריח ירוק', '#7f9e86', 300, 300, 'ירוק'),
  tile('tile-blue', 'אריח כחול', '#4f7397', 300, 300, 'כחול'),
  tile('tile-terracotta', 'טרקוטה', '#b9643f', 300, 300, 'טרקוטה', { grout: '#d2c3ae', rough: 0.85 }),
  M('tile-woodlook', 'אריח דמוי עץ', 'tile', '#b48b63', 'plank', 1200, 200, FW, { layout: 'staggered', grout: '#8f7258', groutW: 2, rough: 0.5, kw: 'אריח דמוי עץ פורצלן' }),
  M('tile-concretelook', 'אריח דמוי בטון', 'tile', '#a9a7a1', 'concrete', 600, 600, FW, { grout: '#8e8c87', groutW: 2, rough: 0.6, kw: 'אריח דמוי בטון' }),
  M('tile-marblelook', 'אריח דמוי שיש', 'tile', '#efede8', 'marble', 600, 1200, FW, { color2: '#9d9a94', grout: '#d6d3cc', groutW: 2, rough: 0.2, kw: 'אריח דמוי שיש' }),
  M('tile-stonelook', 'אריח דמוי אבן', 'tile', '#cbbf9f', 'stone', 600, 600, FW, { grout: '#aaa083', groutW: 3, rough: 0.7, kw: 'אריח דמוי אבן' }),
  M('tile-deco', 'אריחים מעוטרים', 'tile', '#e9e3d6', 'tile-deco', 200, 200, FW, { color2: '#3f6383', grout: '#cfc8b8', groutW: 2, rough: 0.5, kw: 'אריח מעוטר מצויר מרוקאי מטלאכי' }),
  M('tile-geo', 'אריחים גאומטריים', 'tile', '#efece6', 'tile-geo', 200, 200, FW, { color2: '#3c3f44', grout: '#cfcbc3', groutW: 2, rough: 0.5, kw: 'אריח גאומטרי' }),
  M('mosaic', 'פסיפס', 'tile', '#6f9fb3', 'mosaic', 300, 300, FW, { color2: '#a9cfdb', grout: '#e2e2de', groutW: 2, rough: 0.3, kw: 'פסיפס מוזאיקה' }),
  M('tile-hex', 'אריחים משושים', 'tile', '#e7e3db', 'hex', 200, 200, FW, { grout: '#b9b3a8', groutW: 3, rough: 0.45, kw: 'משושה הקסגון אריח' }),
  M('tile-metro', 'אריחי מטרו', 'tile', '#f4f3ef', 'tile', 200, 100, FW, { layout: 'offset', grout: '#c8c6c0', groutW: 2, rough: 0.15, kw: 'מטרו סאבווי אריח' }),
  M('tile-painted', 'אריחים מצוירים', 'tile', '#f1ece1', 'tile-painted', 150, 150, FW, { color2: '#2f6b8f', grout: '#d3cdc0', groutW: 2, rough: 0.35, kw: 'אריח מצויר צבעוני' }),

  // ---------------------------------------------------------------- marble, stone and other floors
  M('marble-white', 'שיש לבן', 'stone', '#f2f0ec', 'marble', 800, 800, ['floor', 'wall', 'object'], { color2: '#9a9890', grout: '#e1ded8', groutW: 1, rough: 0.15, kw: 'שיש לבן קררה' }),
  M('marble-black', 'שיש שחור', 'stone', '#262628', 'marble', 800, 800, ['floor', 'wall', 'object'], { color2: '#d8d6d0', grout: '#3a3a3c', groutW: 1, rough: 0.15, kw: 'שיש שחור מרקינה' }),
  M('travertine', 'טרוורטין', 'stone', '#d9c9a9', 'travertine', 600, 400, ['floor', 'wall', 'outdoor'], { layout: 'offset', grout: '#c3b391', groutW: 2, rough: 0.6, kw: 'טרוורטין אבן' }),
  M('granite', 'גרניט', 'stone', '#8b8784', 'granite', 600, 600, ['floor', 'wall', 'object', 'outdoor'], { color2: '#3a3836', grout: '#6f6c69', groutW: 1, rough: 0.3, kw: 'גרניט' }),
  M('stone-natural', 'אבן טבעית', 'stone', '#c3b49a', 'flagstone', 1200, 1200, ['floor', 'wall', 'outdoor'], { grout: '#8f846f', groutW: 12, rough: 0.85, kw: 'אבן טבעית פלגסטון' }),
  M('concrete-polished', 'בטון מוחלק', 'floor', '#b3b1ac', 'concrete', 3000, 3000, ['floor', 'wall'], { rough: 0.3, kw: 'בטון מוחלק מלוטש' }),
  M('concrete-deco', 'בטון דקורטיבי', 'floor', '#b8a993', 'concrete-deco', 600, 600, ['floor', 'outdoor'], { grout: '#8d7f6a', rough: 0.6, kw: 'בטון מוטבע דקורטיבי' }),
  M('terrazzo-chips', 'טרצו', 'floor', '#e2ddd3', 'terrazzo', 600, 600, ['floor', 'wall', 'object'], { color2: '#8a7c68', grout: '#cbc4b6', groutW: 1, rough: 0.3, kw: 'טרצו טראצו שבבים' }),
  M('vinyl', 'ויניל', 'floor', '#b7a78f', 'plank', 1220, 180, ['floor'], { layout: 'staggered', grout: '#8f816c', groutW: 1, rough: 0.55, kw: 'ויניל spc פרקט' }),
  M('carpet', 'שטיח מקיר לקיר', 'floor', '#8d8a86', 'carpet', 200, 200, ['floor'], { rough: 1, kw: 'שטיח מקיר לקיר מוקט' }),
  M('rubber-floor', 'רצפת גומי', 'floor', '#3f4347', 'rubber', 500, 500, ['floor', 'outdoor'], { color2: '#9aa0a6', rough: 0.9, kw: 'גומי רצפה' }),

  // ---------------------------------------------------------------- paints
  M('paint-gloss', 'צבע מבריק', 'paint', '#f4f1ea', 'plain', 0, 0, ['wall', 'ceiling', 'object'], { rough: 0.25, kw: 'צבע מבריק סופרלק' }),
  M('paint-satin', 'צבע משי', 'paint', '#f1ede4', 'plain', 0, 0, ['wall', 'ceiling', 'object'], { rough: 0.55, kw: 'צבע משי חצי מבריק' }),
  M('paint-deco', 'צבע דקורטיבי (אפקט)', 'paint', '#d9cbb5', 'plaster-deco', 1200, 1200, ['wall', 'ceiling'], { color2: '#bfae94', rough: 0.85, kw: 'צבע דקורטיבי אפקט טיח' }),

  // ---------------------------------------------------------------- wallpapers
  wp('wp-plain', 'טפט חלק', 'wp-fabric', '#ece6da', '#e1d9ca', 300, 300, 'חלק'),
  wp('wp-stripes-h', 'טפט פסים אופקיים', 'stripes-h', '#e9e1d2', '#c9b79a', 530, 400, 'פסים אופקי'),
  wp('wp-stripes-v', 'טפט פסים אנכיים', 'stripes-v', '#e8ebe6', '#9fb3a5', 530, 530, 'פסים אנכי'),
  wp('wp-geo', 'טפט גאומטרי', 'wp-geo', '#f1efe9', '#3d4550', 400, 400, 'גאומטרי'),
  wp('wp-floral', 'טפט פרחוני', 'wp-floral', '#f4ede4', '#c4728a', 530, 530, 'פרחים פרחוני'),
  wp('wp-leaves', 'טפט צמחייה', 'wp-leaves', '#edf0e8', '#6c8f6a', 530, 530, 'צמחייה עלים בוטני'),
  wp('wp-tropical', 'טפט טרופי', 'wp-tropical', '#e9efe4', '#2f6f4f', 700, 700, 'טרופי ג׳ונגל מונסטרה'),
  wp('wp-luxury', 'טפט יוקרתי', 'wp-luxury', '#22303f', '#c9a55a', 530, 530, 'יוקרתי זהב ארט דקו'),
  wp('wp-minimal', 'טפט מינימליסטי', 'wp-minimal', '#f3f2ee', '#b9b6ae', 300, 300, 'מינימליסטי נקודות'),
  wp('wp-classic', 'טפט בסגנון קלאסי', 'wp-damask', '#e7dcc6', '#b39a6c', 530, 640, 'קלאסי דמשק'),
  wp('wp-modern', 'טפט בסגנון מודרני', 'wp-modern', '#e9e7e3', '#4d5b6a', 530, 530, 'מודרני אבסטרקטי'),
  wp('wp-kids', 'טפט לחדרי ילדים', 'wp-kids', '#f2f6fa', '#f2a33a', 400, 400, 'ילדים כוכבים'),
  wp('wp-brick', 'טפט דמוי לבנים', 'brick', '#b86d55', '#e5ddd0', 480, 300, 'דמוי לבנים בריקים'),
  wp('wp-wood', 'טפט דמוי עץ', 'plank', '#b38a62', '#7a5a3b', 1000, 120, 'דמוי עץ'),
  wp('wp-concrete', 'טפט דמוי בטון', 'concrete', '#b1afa9', '#8f8d88', 1000, 1000, 'דמוי בטון'),
  wp('wp-marble', 'טפט דמוי שיש', 'marble', '#efede9', '#9b9892', 800, 800, 'דמוי שיש'),
  wp('wp-fabric', 'טפט דמוי בד', 'wp-fabric', '#d8cfc0', '#c3b8a6', 120, 120, 'דמוי בד פשתן'),
  wp('wp-3d', 'טפט תלת־ממדי דקורטיבי', 'wp-3d', '#e4e2dd', '#9c9a95', 300, 260, 'תלת ממדי קוביות'),
  wp('wp-ogee', 'טפט דוגמה חוזרת', 'wp-ogee', '#eef0f2', '#7b93a8', 400, 400, 'דוגמה חוזרת מרוקאי'),
  wp('wp-dots', 'טפט נקודות בגוון לבחירה', 'wp-minimal', '#f6e8e4', '#d27a68', 160, 160, 'נקודות גוון'),

  // ---------------------------------------------------------------- claddings
  M('wood-slats', 'סרגלי עץ אנכיים', 'cladding', '#a67b52', 'slats', 60, 2400, ['wall', 'ceiling'], { color2: '#2b241e', rough: 0.7, kw: 'סרגלי עץ רפפות אקוסטי' }),
  M('panels', 'פנלים דקורטיביים', 'cladding', '#e7e2d8', 'panels', 600, 900, WALL, { color2: '#cfc8ba', rough: 0.5, kw: 'פנלים בוזרי קלאסי' }),
  M('brick-exposed', 'לבנים חשופות', 'cladding', '#a8573f', 'brick', 230, 76, ['wall', 'outdoor'], { layout: 'offset', grout: '#9b8f7f', groutW: 12, rough: 0.95, color2: '#7d3f2c', kw: 'לבנים חשופות בריקים תעשייתי' }),
  M('marble-cladding', 'חיפוי שיש', 'cladding', '#ebe8e2', 'marble', 1200, 600, WALL, { color2: '#a19d95', grout: '#dad6cf', groutW: 1, rough: 0.2, kw: 'חיפוי שיש' }),
  M('mosaic-cladding', 'חיפוי פסיפס', 'cladding', '#c7b49a', 'mosaic', 300, 300, WALL, { color2: '#8f7a61', grout: '#e9e4da', groutW: 2, rough: 0.35, kw: 'חיפוי פסיפס' }),
  M('concrete-exposed', 'בטון חשוף', 'cladding', '#a9a8a3', 'concrete-deco', 1200, 600, ['wall', 'ceiling'], { grout: '#8a8984', rough: 0.85, kw: 'בטון חשוף אדריכלי' }),
  M('shlicht', 'שליכט דקורטיבי', 'cladding', '#e6dccb', 'plaster-deco', 1500, 1500, ['wall', 'outdoor'], { color2: '#d2c4ac', rough: 0.95, kw: 'שליכט טיח דקורטיבי' }),
  M('metal-cladding', 'חיפוי מתכת', 'cladding', '#7d8287', 'metal-corrugated', 150, 150, ['wall', 'ceiling', 'outdoor'], { rough: 0.4, metal: 0.6, kw: 'חיפוי מתכת פח גלי' }),
  M('glass-deco', 'זכוכית דקורטיבית', 'glass', '#cfe0e6', 'glass-deco', 300, 300, ['wall', 'object'], { rough: 0.3, opacity: 0.6, kw: 'זכוכית דקורטיבית חלבית מחוספסת' }),
  M('rustic-cladding', 'חיפוי בסגנון כפרי', 'cladding', '#9e8466', 'plank', 1800, 200, WALL, { layout: 'staggered', grout: '#4a3b2a', groutW: 6, rough: 0.9, kw: 'כפרי עץ ממוחזר' }),
  M('industrial-cladding', 'חיפוי בסגנון תעשייתי', 'cladding', '#8f9092', 'concrete-deco', 1200, 1200, WALL, { grout: '#5f6062', rough: 0.8, kw: 'תעשייתי לופט' }),

  // ---------------------------------------------------------------- ceilings
  M('acoustic', 'תקרה אקוסטית', 'ceiling', '#f2f1ed', 'acoustic', 600, 600, ['ceiling', 'wall'], { grout: '#d8d6d0', groutW: 15, rough: 0.95, kw: 'תקרה אקוסטית מינרלית' }),
  M('gypsum', 'גבס צבוע', 'ceiling', '#f7f6f2', 'plain', 0, 0, ['ceiling', 'wall'], { rough: 0.95, kw: 'גבס תקרה' }),
  M('wood-ceiling', 'חיפוי עץ לתקרה', 'ceiling', '#b4895e', 'plank', 2400, 100, ['ceiling', 'wall'], { layout: 'straight', grout: '#3b2b1d', groutW: 8, rough: 0.7, kw: 'תקרת עץ' }),

  // ---------------------------------------------------------------- fabrics and leather
  M('linen', 'פשתן', 'fabric', '#cfc4b1', 'weave', 30, 30, OBJ, { rough: 0.95, kw: 'פשתן בד' }),
  M('velvet', 'קטיפה', 'fabric', '#4b5f70', 'weave', 20, 20, OBJ, { rough: 0.7, kw: 'קטיפה בד' }),
  M('boucle', 'בוקלה', 'fabric', '#e8e2d6', 'carpet', 60, 60, OBJ, { rough: 1, kw: 'בוקלה בד' }),
  M('leather-light', 'עור בהיר', 'fabric', '#b98a5e', 'leather', 200, 200, OBJ, { rough: 0.5, kw: 'עור קוניאק' }),
  M('rattan', 'קש / ראטן', 'fabric', '#c9a86f', 'weave', 30, 30, OBJ, { rough: 0.8, kw: 'ראטן קש נצרים' }),

  // ---------------------------------------------------------------- metals
  M('brass', 'פליז / זהב', 'metal', '#c9a55a', 'metal', 400, 400, OBJ, { rough: 0.3, metal: 0.9, kw: 'פליז זהב' }),
  M('steel-black', 'פלדה שחורה', 'metal', '#2f3134', 'metal', 400, 400, ['object', 'wall'], { rough: 0.45, metal: 0.7, kw: 'ברזל שחור פלדה' }),
  M('chrome', 'כרום', 'metal', '#d9dde1', 'metal', 400, 400, OBJ, { rough: 0.1, metal: 1, kw: 'כרום ניקל' }),
  M('copper', 'נחושת', 'metal', '#b56f45', 'metal', 400, 400, OBJ, { rough: 0.3, metal: 0.9, kw: 'נחושת' }),
  M('corten', 'פלדת קורטן', 'metal', '#8a4b2b', 'concrete', 800, 800, ['object', 'wall', 'outdoor'], { rough: 0.9, metal: 0.3, kw: 'קורטן חלודה' }),

  // ---------------------------------------------------------------- glass
  M('glass-frosted', 'זכוכית חלבית', 'glass', '#e4eef1', 'glass', 0, 0, OBJ, { rough: 0.5, opacity: 0.7, kw: 'זכוכית חלבית' }),
  M('glass-tinted', 'זכוכית כהה', 'glass', '#5e6f78', 'glass', 0, 0, OBJ, { rough: 0.08, opacity: 0.5, kw: 'זכוכית כהה מושחרת' }),

  // ---------------------------------------------------------------- worktops and fronts
  M('quartz', 'קוורץ (משטח)', 'counter', '#ecebe7', 'terrazzo', 300, 300, OBJ, { color2: '#b9b6ae', rough: 0.2, kw: 'קוורץ משטח אבן קיסר' }),
  M('formica', 'פורמייקה', 'counter', '#e9e6df', 'plain', 0, 0, OBJ, { rough: 0.5, kw: 'פורמייקה' }),
  M('mdf-matte', 'חזית מט', 'counter', '#d9d6cf', 'plain', 0, 0, OBJ, { rough: 0.8, kw: 'חזית מט אקרילי' }),
  M('lacquer-gloss', 'חזית מבריקה', 'counter', '#f6f6f3', 'plain', 0, 0, OBJ, { rough: 0.12, kw: 'חזית מבריקה פוליאסטר' }),

  // ---------------------------------------------------------------- outdoor surfaces
  M('grass-natural', 'דשא טבעי', 'plant', '#83b25e', 'grass', 600, 600, OUT, { rough: 1, kw: 'דשא מדשאה' }),
  M('grass-synthetic', 'דשא סינתטי', 'plant', '#5fa34a', 'grass', 400, 400, ['outdoor', 'floor'], { rough: 0.9, kw: 'דשא סינתטי מלאכותי' }),
  M('soil', 'אדמה', 'plant', '#8b6c4c', 'soil', 800, 800, OUT, { rough: 1, kw: 'אדמה עפר' }),
  M('sand', 'חול', 'plant', '#e3cf9f', 'sand', 600, 600, OUT, { rough: 1, kw: 'חול ארגז חול' }),
  M('gravel', 'חצץ', 'plant', '#c4bcab', 'gravel', 400, 400, OUT, { rough: 1, kw: 'חצץ' }),
  M('pebbles', 'חלוקי נחל', 'plant', '#b9b2a6', 'pebbles', 500, 500, OUT, { rough: 0.8, kw: 'חלוקי נחל' }),
  M('woodchips', 'שבבי עץ', 'plant', '#9a6e45', 'woodchips', 500, 500, OUT, { rough: 1, kw: 'שבבי עץ מאלץ חיפוי' }),
  M('groundcover', 'כיסוי קרקע צמחי', 'plant', '#5f8f47', 'groundcover', 800, 800, OUT, { color2: '#7fae5a', rough: 1, kw: 'כיסוי קרקע צמחי' }),
  M('flowerbed', 'משטח פרחים', 'plant', '#6f9a50', 'flowerbed', 800, 800, OUT, { color2: '#e07a9a', rough: 1, kw: 'פרחים ערוגה' }),
  M('pavers', 'אבנים משתלבות', 'outdoor', '#b9aa95', 'pavers', 200, 100, OUT, { color2: '#a08e78', grout: '#8f8270', groutW: 3, rough: 0.85, kw: 'אבנים משתלבות ריצוף' }),
  M('paving-stone', 'ריצוף אבן', 'outdoor', '#d3c6a8', 'stone', 600, 400, OUT, { layout: 'offset', grout: '#ad9f82', groutW: 6, rough: 0.85, kw: 'ריצוף אבן' }),
  M('paving-concrete', 'ריצוף בטון', 'outdoor', '#bdbbb5', 'tile', 400, 400, OUT, { layout: 'grid', grout: '#9a9892', groutW: 4, rough: 0.85, kw: 'ריצוף בטון מרצפות' }),
  M('asphalt', 'אספלט', 'outdoor', '#5c5e60', 'asphalt', 800, 800, OUT, { rough: 0.95, kw: 'אספלט כביש' }),
  M('stepping', 'אבני מדרך', 'outdoor', '#c9c2b2', 'stepping', 1200, 1200, OUT, { color2: '#83b25e', rough: 0.85, kw: 'אבני מדרך' }),
  M('paving-geo', 'ריצוף גאומטרי', 'outdoor', '#d1c7b6', 'paving-geo', 800, 800, OUT, { color2: '#8a8173', grout: '#9c9283', groutW: 4, rough: 0.8, kw: 'ריצוף גאומטרי' }),
  M('paving-green', 'ריצוף משולב בצמחייה', 'outdoor', '#bdb8ac', 'paving-green', 600, 600, OUT, { color2: '#7fae5a', rough: 0.9, kw: 'דשא בין אבנים אקו' }),
  M('rubber-safety', 'משטח גומי בטיחותי', 'outdoor', '#d9734e', 'rubber', 500, 500, OUT, { color2: '#f2c08a', rough: 0.95, kw: 'גומי בטיחות מתקני משחק' }),
  M('play-surface', 'משטח משחק צבעוני', 'outdoor', '#5c8fc9', 'rubber', 500, 500, OUT, { color2: '#f0d25a', rough: 0.95, kw: 'משטח משחק צבעוני' }),
  M('water-pool', 'מים', 'water', '#6fb2d6', 'water', 1000, 1000, ['outdoor', 'object'], { rough: 0.1, opacity: 0.8, kw: 'מים בריכה' }),
];

const BY_ID = new Map(CATALOG.map((m) => [m.id, m]));
export const matById = (id: string | undefined): MatDef | undefined => (id ? BY_ID.get(id) : undefined);
export const isKnownMat = (id: string) => BY_ID.has(id);
/** A material by id, with 'paint' as the fallback (a missing material never breaks a view). */
export const mat = (id: string | undefined): MatDef => (id && BY_ID.get(id)) || BY_ID.get('paint')!;

export const matsFor = (use: MatUse) => CATALOG.filter((m) => m.use.includes(use));

export const isPlankPattern = (p: PatternId) => p === 'plank';
export const isTilePattern = (p: PatternId) => p === 'tile' || p === 'stone' || p === 'brick';

// ---------------------------------------------------------------- search (Hebrew, with common synonyms)

/** Removes niqqud and geresh, unifies final letters, so "כורסא" and "כורסה" or "ארונות" and "ארון" match. */
export function normHe(s: string): string {
  return s
    .toLowerCase()
    .replace(/[֑-ׇ]/g, '')
    .replace(/[׳'"״\-–־]/g, ' ')
    .replace(/ך/g, 'כ').replace(/ם/g, 'מ').replace(/ן/g, 'נ').replace(/ף/g, 'פ').replace(/ץ/g, 'צ')
    .replace(/א(?=\s|$)/g, 'ה')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Groups of words that mean the same thing for the search. */
export const SYNONYMS: string[][] = [
  ['ספה', 'סופה', 'כורסה', 'ספות'],
  ['מנורה', 'תאורה', 'גוף תאורה', 'אור', 'נברשת', 'מנורות'],
  ['ארון', 'ארונות', 'ארונית'],
  ['שטיח', 'שטיחים'],
  ['מקלחון', 'מקלחת'],
  ['אסלה', 'שירותים', 'שרותים', 'טואלט'],
  ['כיור', 'כיורים', 'כיורי'],
  ['צמח', 'עציץ', 'צמחייה', 'צמחים', 'צמחיה', 'עציצים'],
  ['תמונה', 'פוסטר', 'מסגרת', 'ציור'],
  ['שולחן', 'שולחנות'],
  ['כיסא', 'כסא', 'כיסאות', 'כסאות'],
  ['מיטה', 'מיטות'],
  ['מטבח', 'מטבחון'],
  ['פרקט', 'עץ', 'למינציה'],
  ['קרמיקה', 'אריח', 'אריחים', 'פורצלן', 'גרניט'],
  ['טפט', 'טפטים', 'ניירות קיר'],
  ['חיפוי', 'חיפויים', 'ציפוי'],
  ['שער', 'שערים', 'קשת', 'קשתות'],
  ['ממד', 'ממ״ד', 'מרחב מוגן', 'מקלט'],
  ['עץ', 'עצים', 'אילן'],
  ['ספסל', 'ספסלים'],
  ['מזרקה', 'מזרקות', 'מים'],
  ['בריכה', 'בריכות', 'בריכת'],
  ['פרגולה', 'הצללה', 'סככה', 'צל'],
  ['גדר', 'גדרות', 'מעקה'],
  ['מגלשה', 'נדנדה', 'מתקן משחק', 'משחק', 'גן שעשועים'],
  ['כדורגל', 'כדורסל', 'מגרש', 'ספורט', 'טניס'],
  ['שיש', 'אבן'],
  ['וילון', 'וילונות', 'תריס', 'תריסים'],
  ['מראה', 'מראות'],
  ['מדף', 'מדפים', 'ספרייה'],
];

const SYN_MAP = (() => {
  const m = new Map<string, string[]>();
  for (const g of SYNONYMS) { const n = g.map(normHe); for (const w of n) m.set(w, [...new Set([...(m.get(w) ?? []), ...n])]); }
  return m;
})();

/** Variants of a query word: the word, its synonyms and a simple singular form. */
export function wordVariants(w: string): string[] {
  const n = normHe(w);
  const out = new Set<string>([n, ...(SYN_MAP.get(n) ?? [])]);
  if (n.length > 4 && (n.endsWith('ימ') || n.endsWith('ות'))) { const s = n.slice(0, -2); out.add(s); for (const x of SYN_MAP.get(s) ?? []) out.add(x); }
  return [...out];
}

/** True when every word of the query (or one of its variants) appears in the text. */
export function matchesQuery(text: string, q: string): boolean {
  const words = normHe(q).split(' ').filter(Boolean);
  if (!words.length) return true;
  const t = normHe(text);
  return words.every((w) => wordVariants(w).some((v) => t.includes(v)));
}

export function searchMats(q: string, use?: MatUse): MatDef[] {
  return CATALOG.filter((m) => (!use || m.use.includes(use)) && matchesQuery(`${m.label} ${m.kw} ${MAT_CATS.find((c) => c.id === m.cat)?.label ?? ''}`, q));
}

// ---------------------------------------------------------------- colour palettes

export const PALETTES: { id: string; label: string; colors: string[] }[] = [
  { id: 'neutral', label: 'ניטרליים', colors: ['#ffffff', '#f4f1ea', '#ece6da', '#d9d4ca', '#c9c4b8', '#a7a197', '#7d786f', '#4b4843'] },
  { id: 'warm', label: 'גוונים חמים', colors: ['#f3e2c7', '#e8c9a0', '#d9a46a', '#c98348', '#b5654a', '#a34a3a', '#e0b04a', '#c96f5a'] },
  { id: 'cool', label: 'גוונים קרים', colors: ['#e3edf2', '#c3d8e3', '#a9cde0', '#7fa7c4', '#4f7fa8', '#3c5f82', '#9fb9a0', '#5f8f7a'] },
  { id: 'pastel', label: 'צבעי פסטל', colors: ['#f6d6d6', '#f7e3c4', '#f7f0c4', '#d9efd3', '#cfe9ee', '#d6dcf5', '#e8d6f2', '#f2d9e6'] },
  { id: 'dark', label: 'צבעים כהים', colors: ['#2f3a44', '#22303f', '#3a332e', '#2e2f31', '#3d4b3a', '#4a2f2f', '#3b3550', '#1f2328'] },
];

export const isHex = (s: string) => /^#[0-9a-fA-F]{6}$/.test(s);

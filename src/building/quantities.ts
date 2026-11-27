// Tables and quantities computed from the model's geometry. They are geometric estimates for study and planning,
// not a verified bill of quantities for construction.

import type { BuildingData } from './types';
import type { BuildingModel } from './model';
import { openingDef } from './openings';
import { furn } from './furniture';
import { material } from './materials';
import { WALL_KIND_LABELS } from './types';

export interface RoomRow { id: string; level: string; name: string; area: number; perimeter: number; floor: string; closed: boolean }
export interface LevelRow { id: string; name: string; elevation: number; gross: number; net: number; rooms: number }
export interface OpeningRow { id: string; level: string; type: string; door: boolean; width: number; height: number; sill: number; wallLen: number }
export interface CountRow { key: string; label: string; count: number; detail: string }
export interface WallRow { key: string; label: string; thickness: number; count: number; length: number; faceArea: number }
export interface FloorRow { key: string; label: string; area: number; rooms: number }

const name = (d: BuildingData, id: string) => d.levels.find((l) => l.id === id)?.name ?? '';

export function quantities(d: BuildingData, m: BuildingModel) {
  const rooms: RoomRow[] = [];
  const levels: LevelRow[] = [];
  const openings: OpeningRow[] = [];
  const wallMap = new Map<string, WallRow>();
  const floorMap = new Map<string, FloorRow>();
  for (const lm of m.levels) {
    for (const r of lm.rooms) {
      const fl = material(r.room.floor.material).label;
      rooms.push({ id: r.room.id, level: lm.level.name, name: r.room.name, area: r.area, perimeter: r.perimeter, floor: fl, closed: !!r.net });
      if (r.net) {
        const k = r.room.floor.material;
        const row = floorMap.get(k) ?? { key: k, label: fl, area: 0, rooms: 0 };
        row.area += r.area; row.rooms++;
        floorMap.set(k, row);
      }
    }
    levels.push({ id: lm.level.id, name: lm.level.name, elevation: lm.level.elevation, gross: lm.grossArea, net: lm.netArea, rooms: lm.rooms.filter((r) => r.net).length });
    for (const wm of lm.walls) {
      const k = `${wm.w.kind}|${wm.w.thickness}`;
      const row = wallMap.get(k) ?? { key: k, label: WALL_KIND_LABELS[wm.w.kind], thickness: wm.w.thickness, count: 0, length: 0, faceArea: 0 };
      row.count++;
      row.length += wm.length;
      // One face: length × height minus the openings.
      row.faceArea += wm.length * wm.height - wm.openings.reduce((a, om) => a + (om.s1 - om.s0) * om.o.height, 0);
      wallMap.set(k, row);
      for (const om of wm.openings) openings.push({ id: om.o.id, level: lm.level.name, type: openingDef(om.o.kind).label, door: om.def.door, width: om.o.width, height: om.o.height, sill: om.o.sill, wallLen: wm.length });
    }
  }
  const fmap = new Map<string, CountRow>();
  for (const f of d.furniture) {
    const k = `${f.kind}|${f.w}|${f.d}|${f.h}`;
    const row = fmap.get(k) ?? { key: k, label: furn(f.kind).label, count: 0, detail: `${f.w}×${f.d}×${f.h} מ״מ` };
    row.count++;
    fmap.set(k, row);
  }
  const counts: CountRow[] = [
    { key: 'walls', label: 'קירות', count: d.walls.length, detail: '' },
    { key: 'doors', label: 'דלתות', count: openings.filter((o) => o.door).length, detail: '' },
    { key: 'windows', label: 'חלונות', count: openings.filter((o) => !o.door).length, detail: '' },
    { key: 'rooms', label: 'חדרים', count: rooms.length, detail: '' },
    { key: 'stairs', label: 'מדרגות', count: d.stairs.length, detail: '' },
    { key: 'furniture', label: 'פריטי ריהוט', count: d.furniture.length, detail: '' },
    { key: 'columns', label: 'עמודים', count: d.columns.length, detail: '' },
    { key: 'beams', label: 'קורות', count: d.beams.length, detail: '' },
  ];
  return {
    rooms, levels, openings, counts,
    furniture: [...fmap.values()].sort((a, b) => a.label.localeCompare(b.label, 'he')),
    walls: [...wallMap.values()],
    floors: [...floorMap.values()],
    totalGross: levels.reduce((a, l) => a + l.gross, 0),
    totalNet: levels.reduce((a, l) => a + l.net, 0),
    levelName: (id: string) => name(d, id),
  };
}

export const AREA_EXPLAIN = {
  net: 'שטח נטו של חדר: השטח שבין פני הקירות שמסביבו (בתוך החדר), בלי עובי הקירות. בחדר אוטומטי הוא נגזר מקווי האמצע של הקירות, מוזז פנימה בחצי עובי כל קיר.',
  gross: 'שטח ברוטו של קומה: השטח הכלוא בקו החיצוני של הקירות החיצוניים, כולל עובי כל הקירות והחללים שבתוך המבנה.',
  note: 'השטחים מחושבים מהגאומטריה שבתוכנית. אין זה חישוב שטחים לפי תקנות התכנון (כגון שטח עיקרי ושטח שירות) ואינו מחליף מדידה מוסמכת.',
  walls: 'אורך קיר נמדד לאורך קו האמצע שלו. שטח פני קיר = אורך × גובה פחות שטח הפתחים, לפן אחד.',
  floors: 'שטח ריצוף = סכום שטחי הנטו של החדרים לפי החומר שנבחר, בלי פחת חיתוך.',
  disclaimer: 'הכמויות הן אומדן גאומטרי לצורכי לימוד ותכנון בלבד, ואינן כתב כמויות מאומת לביצוע בנייה.',
};

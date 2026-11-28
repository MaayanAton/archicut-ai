// 4.0: a study template of a protected room (ממ״ד) for practising planning. Every size here is an editable
// demonstration value chosen for drawing practice: it is NOT taken from any standard or authority, and the result is
// not a certified, blast-resistant or buildable design.

import { v2 } from '../geometry/vec';
import type { BuildingData, Level } from './types';
import { rectWalls } from './edit';
import { newFurniture, newRoom, presetOpening } from './factories';
import { OPENING_PRESETS } from './openings';
import { richFinish } from '../materials/finish';

export const SAFE_ROOM_NOTE = 'תבנית לימודית להמחשה בלבד. המידות הן ערכי הדגמה הניתנים לעריכה ואינן לקוחות מתקן או מדרישות של גורם מוסמך. אין להציג את התכנון כתקני, מאושר, עמיד להדף או מתאים לבנייה ללא בדיקה ואישור של אנשי מקצוע מוסמכים.';

export interface SafeRoomOpts { x: number; y: number; w: number; d: number; t: number; furnish: boolean }

/** Demonstration values for the dialog (editable). */
export const SAFE_ROOM_DEMO: SafeRoomOpts = { x: 0, y: 0, w: 2500, d: 3000, t: 300, furnish: true };

export function addSafeRoom(d: BuildingData, level: Level, o: SafeRoomOpts, newId: () => string): { data: BuildingData; roomId: string } {
  const base = { height: null, kind: 'exterior' as const, phase: d.renovation ? d.drawPhase : ('new' as const), left: richFinish('paint', '#f1efe9'), right: richFinish('concrete-exposed'), core: '#bdbab3' };
  // Walls measured inside: the room's net size is w × d.
  const walls = rectWalls(o.x - o.t, o.y - o.t, o.w + 2 * o.t, o.d + 2 * o.t, o.t, level.id, base, newId, true);
  const door = OPENING_PRESETS.find((p) => p.id === 'door-protected')!;
  const openings = [
    { ...presetOpening(newId(), walls[0].id, door, Math.min(o.w + 2 * o.t - 700, o.t + 650), { side: 'R', hinge: 'start' }) },
    { ...presetOpening(newId(), walls[2].id, OPENING_PRESETS.find((p) => p.id === 'win-rect')!, (o.w + 2 * o.t) / 2), width: 800, height: 800, sill: 1100, variant: 'protected' as const, color: '#5d6166', preset: undefined },
  ];
  const roomId = newId();
  const room = newRoom(roomId, level.id, 'ממ״ד (להמחשה)', v2(o.x + o.w / 2, o.y + o.d / 2), { safeRoom: true, floor: { material: 'tile-gray-light', color: '#cfccc4', tileW: 600, tileH: 600, angle: 0, v: 4, grout: '#a9a59c', groutW: 2, layout: 'grid' } });
  const furn = o.furnish ? [
    newFurniture(newId(), level.id, 'safe-vent', v2(o.x + o.w - 400, o.y + o.d - 127), 0, base.phase),
    newFurniture(newId(), level.id, 'safe-sign', v2(o.x + 12, o.y + o.d / 2), 90, base.phase, { elev: 1500 }),
    newFurniture(newId(), level.id, 'bed-single', v2(o.x + 500, o.y + o.d / 2 + 200), 90, base.phase),
  ] : [];
  return {
    data: { ...d, walls: [...d.walls, ...walls], openings: [...d.openings, ...openings], rooms: [...d.rooms, room], furniture: [...d.furniture, ...furn] },
    roomId,
  };
}

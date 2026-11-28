// 4.0: smart placement of library items: on the floor, against a wall (back to the wall, facing the room), on top of
// another item (a vase on a table, books on a shelf) or under the ceiling. The geometry of the item never changes:
// only its position, rotation and height above the floor.

import { type Vec2, v2 } from '../geometry/vec';
import { closestOnSegment, dot, norm, pointInPoly, sub } from '../site/poly';
import type { BuildingData, Level } from './types';
import type { BuildingModel } from './model';
import { furnitureOutline, shownEl } from './model';
import { furn, partTop, type Mount } from './furniture';

export interface Placement { p: Vec2; rot: number; elev: number; mount: Mount; on?: string; note?: string }

/** Height of the top of a placed item above its level's floor. */
export function furnitureTop(f: BuildingData['furniture'][number]): number {
  const parts = furn(f.kind).parts(f.w, f.d, f.h);
  return f.elev + (parts.length ? Math.max(...parts.map(partTop)) : f.h);
}

/** Where an item of this kind goes when the user clicks at p. */
export function placeItem(d: BuildingData, m: BuildingModel | null, level: Level, kind: string, p: Vec2, rot: number, size?: { w: number; d: number; h: number }, ignoreId?: string): Placement {
  const it = furn(kind);
  const mount: Mount = it.mount ?? 'floor';
  const D = size?.d ?? it.d, H = size?.h ?? it.h;
  if (mount === 'wall') {
    // The nearest wall face within reach: the item's back (+y) against it.
    let best: { q: Vec2; n: Vec2; side: number; dd: number; t: number } | null = null;
    for (const w of d.walls.filter((x) => x.levelId === level.id && shownEl(d, x))) {
      const c = closestOnSegment(p, w.a, w.b);
      const reach = w.thickness / 2 + Math.max(D, 300) + 400;
      if (c.d > reach || (best && c.d >= best.dd)) continue;
      const u = norm(sub(w.b, w.a)), n = v2(-u.y, u.x);
      const side = dot(sub(p, w.a), n) >= 0 ? 1 : -1;
      best = { q: c.q, n, side, dd: c.d, t: w.thickness };
    }
    if (!best) return { p, rot, elev: it.elev, mount, note: 'לא נמצא קיר קרוב. הפריט הוצב במקום שנבחר; קרבי אותו לקיר כדי להצמיד.' };
    const out = v2(best.n.x * best.side, best.n.y * best.side); // from the wall into the room
    const off = best.t / 2 + D / 2 + 2;
    const c = v2(best.q.x + out.x * off, best.q.y + out.y * off);
    // Local +y (back) must point to the wall: (−sin r, cos r) = −out.
    const r = (Math.atan2(out.x, -out.y) * 180) / Math.PI;
    return { p: c, rot: Math.round(r * 1000) / 1000, elev: it.elev, mount };
  }
  if (mount === 'surface') {
    // The smallest item under the point that is not itself an accessory: a table, a shelf, a counter.
    const under = d.furniture
      .filter((f) => f.levelId === level.id && f.id !== ignoreId && shownEl(d, f) && (furn(f.kind).mount ?? 'floor') !== 'surface' && (furn(f.kind).mount ?? 'floor') !== 'ceiling' && pointInPoly(p, furnitureOutline(f)))
      .sort((a, b) => a.w * a.d - b.w * b.d)[0];
    if (!under) return { p, rot, elev: 0, mount, note: 'אין מתחת לנקודה שולחן או משטח. הפריט הוצב על הרצפה; אפשר לשנות את הגובה במאפיינים.' };
    return { p, rot, elev: Math.round(furnitureTop(under)), mount, on: under.id };
  }
  if (mount === 'ceiling') {
    let top = level.ceilingHeight;
    const room = m?.levels.find((l) => l.level.id === level.id)?.rooms.find((r) => r.net && pointInPoly(p, r.net));
    const cd = room?.room.ceiling;
    if (cd) top -= cd.drop > 0 ? cd.drop + 40 : 8;
    return { p, rot, elev: Math.max(0, top - H), mount };
  }
  return { p, rot, elev: it.elev, mount };
}

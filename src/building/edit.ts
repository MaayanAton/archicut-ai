// Editing operations on building data: finding, hitting, moving, rotating, copying and deleting elements, and snapping.
// Every function returns new data and never changes its input.

import { type Vec2, v2 } from '../geometry/vec';
import { add, closestOnSegment, dist, dot, norm, pointInPoly, rotatePt, sub } from '../site/poly';
import type { Annotation, BuildingData, Furniture, Opening, Phase, Room, Wall } from './types';
import type { BuildingModel } from './model';
import { columnOutline, furnitureOutline, shownEl } from './model';
import { stairGeom } from './stairs';
import { fitOpening, wallLength } from './openings';

export type ElType = 'wall' | 'opening' | 'room' | 'furniture' | 'stair' | 'column' | 'beam' | 'slab' | 'roof' | 'annotation' | 'floorZone';

export const EL_LABELS: Record<ElType, string> = {
  wall: 'קיר', opening: 'פתח', room: 'חדר', furniture: 'ריהוט', stair: 'מדרגות', column: 'עמוד', beam: 'קורה', slab: 'רצפה / מרפסת', roof: 'גג', annotation: 'הערה', floorZone: 'אזור רצפה',
};

const LISTS: [ElType, keyof BuildingData][] = [
  ['wall', 'walls'], ['opening', 'openings'], ['room', 'rooms'], ['furniture', 'furniture'], ['stair', 'stairs'], ['column', 'columns'],
  ['beam', 'beams'], ['slab', 'slabs'], ['roof', 'roofs'], ['annotation', 'annotations'], ['floorZone', 'floorZones'],
];

export function findEl(d: BuildingData, id: string): { type: ElType; el: { id: string } } | null {
  for (const [t, k] of LISTS) {
    const el = ((d[k] ?? []) as { id: string }[]).find((x) => x.id === id);
    if (el) return { type: t, el };
  }
  return null;
}

/** Level of an element (openings take their wall's level). */
export function elLevel(d: BuildingData, id: string): string | null {
  const f = findEl(d, id);
  if (!f) return null;
  if (f.type === 'opening') return d.walls.find((w) => w.id === (f.el as Opening).wallId)?.levelId ?? null;
  return (f.el as unknown as { levelId: string }).levelId;
}

/** Is an element locked (by itself or by its layer)? Locked elements are not moved, rotated or deleted. */
/** Deletes the elements that are not locked; returns the locked ones (they stay selected) and a message. */
export function deleteUnlocked(d: BuildingData, ids: string[]): { data: BuildingData; kept: string[]; note: string | null } {
  const kept = ids.filter((id) => isLocked(d, id));
  const note = !kept.length ? null : kept.length === ids.length ? 'האלמנט נעול ולכן לא נמחק. לשחרור: כפתור "נעול" במאפיינים.' : `${kept.length} אלמנטים נעולים לא נמחקו.`;
  return { data: deleteIds(d, ids), kept, note };
}

export function isLocked(d: BuildingData, id: string): boolean {
  const f = findEl(d, id);
  if (!f) return false;
  const e = f.el as { locked?: boolean; layer?: string };
  if (e.locked) return true;
  return !!e.layer && !!d.layers?.some((l) => l.id === e.layer && l.locked);
}

/** The ids that ordinary editing may change (locked ones left out). */
export const unlockedIds = (d: BuildingData, ids: string[]) => ids.filter((id) => !isLocked(d, id));

const mv = (p: Vec2, dv: Vec2) => v2(p.x + dv.x, p.y + dv.y);
const mvPts = (pts: Vec2[], dv: Vec2) => pts.map((p) => mv(p, dv));

/** Moves elements. Walls that touch a moved wall stretch with it, so joints stay closed. */
export function translateIds(d: BuildingData, ids: string[], dv: Vec2): BuildingData {
  const set = new Set(unlockedIds(d, ids));
  if (!set.size) return d;
  const movedEnds: Vec2[] = [];
  for (const w of d.walls) if (set.has(w.id)) movedEnds.push(w.a, w.b);
  const near = (p: Vec2) => movedEnds.some((q) => dist(p, q) < 5);
  return {
    ...d,
    walls: d.walls.map((w) => {
      if (set.has(w.id)) return { ...w, a: mv(w.a, dv), b: mv(w.b, dv) };
      if (w.locked) return w;
      const ma = near(w.a), mb = near(w.b);
      if (!ma && !mb) return w;
      return { ...w, a: ma ? mv(w.a, dv) : w.a, b: mb ? mv(w.b, dv) : w.b };
    }),
    rooms: d.rooms.map((r) => (set.has(r.id) ? { ...r, seed: mv(r.seed, dv), pts: mvPts(r.pts, dv) } : r)),
    furniture: d.furniture.map((f) => (set.has(f.id) ? { ...f, p: mv(f.p, dv) } : f)),
    stairs: d.stairs.map((s) => (set.has(s.id) ? { ...s, p: mv(s.p, dv) } : s)),
    columns: d.columns.map((c) => (set.has(c.id) ? { ...c, p: mv(c.p, dv) } : c)),
    beams: d.beams.map((b) => (set.has(b.id) ? { ...b, a: mv(b.a, dv), b: mv(b.b, dv) } : b)),
    slabs: d.slabs.map((s) => (set.has(s.id) ? { ...s, pts: mvPts(s.pts, dv) } : s)),
    roofs: d.roofs.map((r) => (set.has(r.id) ? { ...r, pts: mvPts(r.pts, dv) } : r)),
    annotations: d.annotations.map((a) => (set.has(a.id) ? (a.type === 'dim' ? { ...a, a: mv(a.a, dv), b: mv(a.b, dv) } : { ...a, p: mv(a.p, dv) }) : a)),
    ...(d.floorZones ? { floorZones: d.floorZones.map((z) => (set.has(z.id) ? { ...z, pts: mvPts(z.pts, dv) } : z)) } : {}),
  };
}

/** Keeps openings at the same place in the world when the wall's start point moves. */
function keepOpenings(d: BuildingData, old: Wall, nw: Wall): Opening[] {
  const u0 = norm(sub(old.b, old.a)), u1 = norm(sub(nw.b, nw.a));
  return d.openings.map((o) => {
    if (o.wallId !== old.id) return o;
    const c = add(old.a, v2(u0.x * o.pos, u0.y * o.pos));
    return { ...o, pos: dot(sub(c, nw.a), u1) };
  });
}

/** Moves one end of a wall; the ends of other walls at the same point follow. */
export function moveWallEnd(d: BuildingData, wallId: string, end: 'a' | 'b', p: Vec2): BuildingData {
  const w = d.walls.find((x) => x.id === wallId);
  if (!w || isLocked(d, wallId)) return d;
  const old = w[end];
  let openings = d.openings;
  const walls = d.walls.map((x) => {
    if (x.levelId !== w.levelId) return x;
    const ma = dist(x.a, old) < 5, mb = dist(x.b, old) < 5;
    if (!ma && !mb && x.id !== wallId) return x;
    const nx = { ...x, a: ma || (x.id === wallId && end === 'a') ? p : x.a, b: mb || (x.id === wallId && end === 'b') ? p : x.b };
    if (ma || (x.id === wallId && end === 'a')) openings = keepOpenings({ ...d, openings }, x, nx);
    return nx;
  });
  return { ...d, walls, openings };
}

export function rotateIds(d: BuildingData, ids: string[], deg: number, c: Vec2): BuildingData {
  const set = new Set(unlockedIds(d, ids));
  if (!set.size) return d;
  const R = (p: Vec2) => rotatePt(p, deg, c);
  return {
    ...d,
    walls: d.walls.map((w) => (set.has(w.id) ? { ...w, a: R(w.a), b: R(w.b) } : w)),
    rooms: d.rooms.map((r) => (set.has(r.id) ? { ...r, seed: R(r.seed), pts: r.pts.map(R) } : r)),
    furniture: d.furniture.map((f) => (set.has(f.id) ? { ...f, p: R(f.p), rot: normDeg(f.rot + deg) } : f)),
    stairs: d.stairs.map((s) => (set.has(s.id) ? { ...s, p: R(s.p), rot: normDeg(s.rot + deg) } : s)),
    columns: d.columns.map((x) => (set.has(x.id) ? { ...x, p: R(x.p), rot: normDeg(x.rot + deg) } : x)),
    beams: d.beams.map((b) => (set.has(b.id) ? { ...b, a: R(b.a), b: R(b.b) } : b)),
    slabs: d.slabs.map((s) => (set.has(s.id) ? { ...s, pts: s.pts.map(R) } : s)),
    roofs: d.roofs.map((r) => (set.has(r.id) ? { ...r, pts: r.pts.map(R) } : r)),
    annotations: d.annotations.map((a) => (set.has(a.id) ? (a.type === 'dim' ? { ...a, a: R(a.a), b: R(a.b) } : { ...a, p: R(a.p) }) : a)),
    ...(d.floorZones ? { floorZones: d.floorZones.map((z) => (set.has(z.id) ? { ...z, pts: z.pts.map(R) } : z)) } : {}),
  };
}

export const normDeg = (a: number) => { let x = a % 360; if (x <= -180) x += 360; if (x > 180) x -= 360; return Object.is(x, -0) ? 0 : Math.round(x * 1e6) / 1e6; };

/** Copies elements (walls with their openings), shifted by dv. Returns the new data and the ids of the copies. */
export function duplicateIds(d: BuildingData, ids: string[], dv: Vec2, newId: () => string): { data: BuildingData; ids: string[] } {
  const set = new Set(ids);
  const map = new Map<string, string>();
  const nid = (old: string) => { const n = newId(); map.set(old, n); return n; };
  const copy = <T extends { id: string }>(list: T[]) => list.filter((x) => set.has(x.id)).map((x) => ({ ...structuredClone(x), id: nid(x.id) }));
  const walls = copy(d.walls).map((w) => ({ ...w, a: mv(w.a, dv), b: mv(w.b, dv) }));
  const openings = d.openings.filter((o) => map.has(o.wallId) || set.has(o.id)).map((o) => (map.has(o.wallId) ? { ...o, id: newId(), wallId: map.get(o.wallId)! } : null)).filter((o): o is Opening => !!o);
  const data: BuildingData = {
    ...d,
    walls: [...d.walls, ...walls],
    openings: [...d.openings, ...openings],
    rooms: [...d.rooms, ...copy(d.rooms).map((r) => ({ ...r, name: `${r.name} (עותק)`, seed: mv(r.seed, dv), pts: mvPts(r.pts, dv) }))],
    furniture: [...d.furniture, ...copy(d.furniture).map((f) => ({ ...f, p: mv(f.p, dv) }))],
    stairs: [...d.stairs, ...copy(d.stairs).map((s) => ({ ...s, p: mv(s.p, dv) }))],
    columns: [...d.columns, ...copy(d.columns).map((c) => ({ ...c, p: mv(c.p, dv) }))],
    beams: [...d.beams, ...copy(d.beams).map((b) => ({ ...b, a: mv(b.a, dv), b: mv(b.b, dv) }))],
    slabs: [...d.slabs, ...copy(d.slabs).map((s) => ({ ...s, pts: mvPts(s.pts, dv) }))],
    roofs: [...d.roofs, ...copy(d.roofs).map((r) => ({ ...r, pts: mvPts(r.pts, dv) }))],
    annotations: [...d.annotations, ...copy(d.annotations).map((a) => (a.type === 'dim' ? { ...a, a: mv(a.a, dv), b: mv(a.b, dv) } : { ...a, p: mv(a.p, dv) }) as Annotation)],
    ...(d.floorZones ? { floorZones: [...d.floorZones, ...copy(d.floorZones).map((z) => ({ ...z, name: `${z.name} (עותק)`, pts: mvPts(z.pts, dv) }))] } : {}),
  };
  // Copies are never locked (the original may be).
  for (const k of ['walls', 'rooms', 'furniture', 'stairs', 'columns', 'beams', 'slabs', 'roofs', 'annotations', 'floorZones'] as const) {
    const list = data[k] as { id: string; locked?: boolean }[] | undefined;
    if (list) for (const x of list) if (x.locked && [...map.values()].includes(x.id)) delete x.locked;
  }
  return { data, ids: [...map.values()] };
}

/** Deletes elements; deleting a wall deletes its openings. */
export function deleteIds(d: BuildingData, ids: string[]): BuildingData {
  const set = new Set(unlockedIds(d, ids));
  if (!set.size) return d;
  const f = <T extends { id: string }>(l: T[]) => l.filter((x) => !set.has(x.id));
  return {
    ...d,
    walls: f(d.walls), openings: d.openings.filter((o) => !set.has(o.id) && !set.has(o.wallId)), rooms: f(d.rooms), furniture: f(d.furniture),
    stairs: f(d.stairs), columns: f(d.columns), beams: f(d.beams), slabs: f(d.slabs), roofs: f(d.roofs), annotations: f(d.annotations),
    ...(d.floorZones ? { floorZones: f(d.floorZones) } : {}),
  };
}

/** Sets the renovation phase of elements (openings, walls, furniture...). */
export function setPhase(d: BuildingData, ids: string[], phase: Phase): BuildingData {
  const set = new Set(ids);
  const f = <T extends { id: string; phase: Phase }>(l: T[]) => l.map((x) => (set.has(x.id) ? { ...x, phase } : x));
  return { ...d, walls: f(d.walls), openings: f(d.openings), furniture: f(d.furniture), stairs: f(d.stairs), columns: f(d.columns), beams: f(d.beams), slabs: f(d.slabs), roofs: f(d.roofs) };
}

/** Topmost element under p on a level. tol is in world mm. */
export function hitTest(d: BuildingData, m: BuildingModel, levelId: string, p: Vec2, tol: number, opts: { roofs?: boolean } = {}): string | null {
  const lm = m.levels.find((l) => l.level.id === levelId);
  if (!lm) return null;
  const vis = <T extends { levelId: string; hidden?: boolean; layer?: string }>(x: T) => x.levelId === levelId && shownEl(d, x);
  for (const a of d.annotations.filter(vis)) {
    if (a.type === 'text' && dist(a.p, p) < Math.max(tol * 2, a.size * 60)) return a.id;
    if (a.type === 'dim' && closestOnSegment(p, a.a, a.b).d < tol + Math.abs(a.offset)) {
      const n = norm(v2(-(a.b.y - a.a.y), a.b.x - a.a.x));
      const off = v2(n.x * a.offset, n.y * a.offset);
      if (closestOnSegment(p, add(a.a, off), add(a.b, off)).d < tol) return a.id;
    }
  }
  for (const wm of lm.walls) for (const om of wm.openings) {
    const c = add(wm.w.a, v2(om.u.x * om.o.pos, om.u.y * om.o.pos));
    const q = sub(p, c);
    if (Math.abs(dot(q, om.u)) <= om.o.width / 2 && Math.abs(dot(q, om.n)) <= wm.w.thickness / 2 + tol) return om.o.id;
  }
  const furnHere = d.furniture.filter(vis).sort((a, b) => a.w * a.d - b.w * b.d);
  for (const f of furnHere) if (pointInPoly(p, furnitureOutline(f))) return f.id;
  for (const c of d.columns.filter(vis)) if (c.round ? dist(p, c.p) <= c.w / 2 + tol : pointInPoly(p, columnOutline(c))) return c.id;
  for (const s of d.stairs.filter(vis)) { const g = stairGeom(s); if (g.outline.length && pointInPoly(p, g.outline)) return s.id; }
  for (const wm of lm.walls) if (pointInPoly(p, wm.outline) || closestOnSegment(p, wm.w.a, wm.w.b).d < Math.max(tol, wm.w.thickness / 2)) return wm.w.id;
  for (const b of d.beams.filter(vis)) if (closestOnSegment(p, b.a, b.b).d < b.w / 2 + tol) return b.id;
  if (opts.roofs) for (const r of d.roofs.filter(vis)) if (r.pts.length >= 3 && pointInPoly(p, r.pts)) return r.id;
  for (const z of (d.floorZones ?? []).filter(vis)) if (z.pts.length >= 3 && pointInPoly(p, z.pts)) return z.id;
  for (const r of lm.rooms) if (r.net && pointInPoly(p, r.net)) return r.room.id;
  for (const s of d.slabs.filter(vis)) if (s.pts.length >= 3 && pointInPoly(p, s.pts)) return s.id;
  if (!opts.roofs) for (const r of d.roofs.filter(vis)) if (r.pts.length >= 3 && pointInPoly(p, r.pts)) return r.id;
  return null;
}

export type SnapKind = 'end' | 'mid' | 'line' | 'grid' | 'ortho' | null;

/** Snaps a point to wall ends, wall midpoints, wall lines and the grid (in that order). */
export function snapPoint(d: BuildingData, levelId: string, w: Vec2, tol: number, opts: { grid: boolean; from?: Vec2 | null; ortho?: boolean; extra?: Vec2[] } = { grid: true }): { p: Vec2; kind: SnapKind } {
  const walls = d.walls.filter((x) => x.levelId === levelId);
  let best: { p: Vec2; kind: SnapKind; d: number } | null = null;
  const consider = (p: Vec2, kind: SnapKind) => { const dd = dist(p, w); if (dd < tol && (!best || dd < best.d - 1e-9)) best = { p, kind, d: dd }; };
  for (const x of walls) { consider(x.a, 'end'); consider(x.b, 'end'); }
  for (const p of opts.extra ?? []) consider(p, 'end');
  if (best) return best;
  for (const x of walls) consider(v2((x.a.x + x.b.x) / 2, (x.a.y + x.b.y) / 2), 'mid');
  if (best) return best;
  // Orthogonal from the previous point (walls drawn at right angles), unless the user is near a wall line.
  let p = w;
  let kind: SnapKind = null;
  if (opts.from && opts.ortho) {
    const dx = w.x - opts.from.x, dy = w.y - opts.from.y;
    const ang = Math.atan2(dy, dx), step = Math.PI / 4;
    const a = Math.round(ang / step) * step;
    const L = Math.hypot(dx, dy) * Math.cos(ang - a);
    p = v2(opts.from.x + Math.cos(a) * L, opts.from.y + Math.sin(a) * L);
    kind = 'ortho';
  }
  for (const x of walls) {
    const c = closestOnSegment(p, x.a, x.b);
    if (c.d < tol) {
      if (kind === 'ortho' && opts.from) {
        // Intersection of the ortho ray with the wall line keeps both constraints.
        const r = sub(p, opts.from), s = sub(x.b, x.a);
        const den = r.x * s.y - r.y * s.x;
        if (Math.abs(den) > 1e-9) {
          const t = ((x.a.x - opts.from.x) * s.y - (x.a.y - opts.from.y) * s.x) / den;
          const q = v2(opts.from.x + r.x * t, opts.from.y + r.y * t);
          if (closestOnSegment(q, x.a, x.b).d < 1 && dist(q, p) < tol * 2) return { p: q, kind: 'line' };
        }
      } else return { p: c.q, kind: 'line' };
    }
  }
  if (opts.grid && d.grid.snap && d.grid.size > 0) {
    const g = d.grid.size;
    if (kind === 'ortho' && opts.from) {
      // Round the length along the ortho direction to the grid.
      const L = dist(p, opts.from);
      const u = L > 0 ? norm(sub(p, opts.from)) : v2(1, 0);
      const Lr = Math.round(L / g) * g;
      return { p: v2(opts.from.x + u.x * Lr, opts.from.y + u.y * Lr), kind: 'ortho' };
    }
    return { p: v2(Math.round(p.x / g) * g, Math.round(p.y / g) * g), kind: 'grid' };
  }
  return { p, kind };
}

/** Nearest wall to p on a level (by centre line), within tol. */
export function nearestWall(d: BuildingData, levelId: string, p: Vec2, tol: number): { wall: Wall; s: number; d: number } | null {
  let best: { wall: Wall; s: number; d: number } | null = null;
  for (const w of d.walls.filter((x) => x.levelId === levelId)) {
    const c = closestOnSegment(p, w.a, w.b);
    if (c.d <= Math.max(tol, w.thickness / 2 + tol) && (!best || c.d < best.d)) best = { wall: w, s: c.t * wallLength(w), d: c.d };
  }
  return best;
}

/** Places an opening on a wall near s (snapped to 10 mm), or returns a reason why it cannot be placed. */
export function placeOpening(d: BuildingData, wall: Wall, base: Omit<Opening, 'pos' | 'wallId'>, s: number): { o: Opening } | { error: string } {
  const pos = fitOpening(wall, d.openings, base.width, Math.round(s / 10) * 10, base.id, base.phase);
  if (pos === null) return { error: `אין בקיר מקום פנוי לפתח ברוחב ${(base.width / 1000).toFixed(2)} מ׳.` };
  return { o: { ...base, wallId: wall.id, pos } };
}

/** Four walls around a rectangle. Dimensions are measured on the outside faces (outside = true) or on the centre lines. */
export function rectWalls(x: number, y: number, w: number, h: number, t: number, levelId: string, base: Omit<Wall, 'id' | 'a' | 'b' | 'levelId' | 'thickness'>, newId: () => string, outside = true): Wall[] {
  const i = outside ? t / 2 : 0;
  const pts = [v2(x + i, y + i), v2(x + w - i, y + i), v2(x + w - i, y + h - i), v2(x + i, y + h - i)];
  return pts.map((p, k) => ({ ...base, id: newId(), levelId, thickness: t, a: p, b: pts[(k + 1) % 4] }));
}

/** Centre of a selection (for rotating). */
export function selectionCenter(d: BuildingData, ids: string[]): Vec2 {
  const pts: Vec2[] = [];
  for (const id of ids) {
    const f = findEl(d, id);
    if (!f) continue;
    const e = f.el as unknown as Record<string, unknown>;
    if (f.type === 'wall' || f.type === 'beam') pts.push((e as unknown as Wall).a, (e as unknown as Wall).b);
    else if (f.type === 'furniture' || f.type === 'stair' || f.type === 'column') pts.push((e as unknown as Furniture).p);
    else if (f.type === 'room') pts.push((e as unknown as Room).seed);
    else if (f.type === 'slab' || f.type === 'roof' || f.type === 'floorZone') pts.push(...(e.pts as Vec2[]));
    else if (f.type === 'annotation') { const a = e as unknown as Annotation; if (a.type === 'dim') pts.push(a.a, a.b); else pts.push(a.p); }
  }
  if (!pts.length) return v2(0, 0);
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  return v2((Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2);
}

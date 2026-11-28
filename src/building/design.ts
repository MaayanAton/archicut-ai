// 4.0: interior design operations on walls and rooms: which room a wall face looks at, applying a finish to all the
// faces of a room (only the part of each face inside the room), copying the design of a wall, and wall presets.

import type { Vec2 } from '../geometry/vec';
import { add, mul, norm, perpL, segmentInsideIntervals, sub } from '../site/poly';
import type { BuildingData, Finish, Room, Wall, WallZone } from './types';
import type { BuildingModel } from './model';
import { wallLength } from './openings';

export type Side = 'L' | 'R';

/** Parts of a wall face (along the wall, mm from its start) that lie inside a room. */
export function faceInRoom(w: Wall, side: Side, net: Vec2[]): [number, number][] {
  const L = wallLength(w);
  if (L < 1 || net.length < 3) return [];
  const u = norm(sub(w.b, w.a)), n = perpL(u);
  const off = (side === 'L' ? 1 : -1) * (w.thickness / 2 + 30);
  const a = add(w.a, mul(n, off)), b = add(w.b, mul(n, off));
  return segmentInsideIntervals(a, b, net).map(([t0, t1]) => [t0 * L, t1 * L] as [number, number]).filter(([s0, s1]) => s1 - s0 > 50);
}

/** Names of the rooms a wall face looks at (longest part first, comma separated), or null (outside / no room). */
export function faceRoomName(m: BuildingModel, w: Wall, side: Side): string | null {
  const lm = m.levels.find((l) => l.level.id === w.levelId);
  if (!lm) return null;
  const found: { name: string; len: number }[] = [];
  for (const r of lm.rooms) {
    if (!r.net) continue;
    const len = faceInRoom(w, side, r.net).reduce((s, [a, b]) => s + b - a, 0);
    if (len > 0) found.push({ name: r.room.name, len });
  }
  return found.length ? found.sort((a, b) => b.len - a.len).map((f) => f.name).join(', ') : null;
}

/** The faces of the walls around a room: wall, side and the part of the face inside the room. */
export function roomFaces(d: BuildingData, m: BuildingModel, room: Room): { w: Wall; side: Side; parts: [number, number][]; full: boolean }[] {
  const rm = m.levels.flatMap((l) => l.rooms).find((x) => x.room.id === room.id);
  if (!rm?.net) return [];
  const out: { w: Wall; side: Side; parts: [number, number][]; full: boolean }[] = [];
  for (const w of d.walls.filter((x) => x.levelId === room.levelId)) {
    for (const side of ['L', 'R'] as const) {
      const parts = faceInRoom(w, side, rm.net);
      if (!parts.length) continue;
      const L = wallLength(w);
      const cover = parts.reduce((s, [a, b]) => s + b - a, 0);
      out.push({ w, side, parts, full: parts.length === 1 && cover >= L - 2 * w.thickness - 120 });
    }
  }
  return out;
}

let zn = 0;
const zid = () => `z${Date.now().toString(36)}${(zn++).toString(36)}`;

/**
 * Applies a finish to the faces of a room's walls. 'face': the whole face (or, for a wall shared with other rooms,
 * a zone over the part inside this room). 'band': a zone from z0 to z1 (z1 null = to the top), e.g. tiles to 1.20 m.
 */
export function applyRoomFinish(d: BuildingData, m: BuildingModel, room: Room, finish: Finish, mode: { kind: 'face' } | { kind: 'band'; z0: number; z1: number | null }): { data: BuildingData; faces: number } {
  const faces = roomFaces(d, m, room);
  if (!faces.length) return { data: d, faces: 0 };
  const byWall = new Map<string, typeof faces>();
  for (const f of faces) { if (!byWall.has(f.w.id)) byWall.set(f.w.id, []); byWall.get(f.w.id)!.push(f); }
  const walls = d.walls.map((w) => {
    const fs = byWall.get(w.id);
    if (!fs) return w;
    let nw: Wall = { ...w };
    for (const f of fs) {
      if (mode.kind === 'face' && f.full) { nw = { ...nw, [f.side === 'L' ? 'left' : 'right']: structuredClone(finish) }; continue; }
      const z0 = mode.kind === 'band' ? mode.z0 : 0, z1 = mode.kind === 'band' ? mode.z1 : null;
      const zones: WallZone[] = [...(nw.zones ?? [])];
      for (const [s0, s1] of f.parts) zones.push({ id: zid(), side: f.side, s0: f.full ? null : Math.round(s0), s1: f.full ? null : Math.round(s1), z0, z1, finish: structuredClone(finish), name: room.name });
      nw = { ...nw, zones };
    }
    return nw;
  });
  return { data: { ...d, walls }, faces: faces.length };
}

/** The design of a wall (both faces and their zones), to paste on another wall. */
export interface WallStyle { left: Finish; right: Finish; zones: WallZone[] }

export const wallStyle = (w: Wall): WallStyle => structuredClone({ left: w.left, right: w.right, zones: w.zones ?? [] });

/** Pastes a wall's design: zones keep their heights; zones limited along the wall are scaled to the new length. */
export function pasteWallStyle(w: Wall, s: WallStyle, srcLength: number): Wall {
  const L = wallLength(w), k = srcLength > 0 ? L / srcLength : 1;
  const zones = s.zones.map((z) => ({ ...structuredClone(z), id: zid(), s0: z.s0 === null ? null : Math.round(z.s0 * k), s1: z.s1 === null ? null : Math.round(z.s1 * k) }));
  return { ...w, left: structuredClone(s.left), right: structuredClone(s.right), ...(zones.length ? { zones } : { zones: undefined }) };
}

/** Ready-made zones offered in the wall designer. */
export const ZONE_PRESETS: { id: string; label: string; z0: number; z1: number | null; along?: 'half' }[] = [
  { id: 'dado', label: 'חיפוי תחתון עד 1.20 מ׳', z0: 0, z1: 1200 },
  { id: 'wet', label: 'חיפוי עד 2.20 מ׳ (חדר רחצה)', z0: 0, z1: 2200 },
  { id: 'full', label: 'חיפוי כל גובה הפן', z0: 0, z1: null },
  { id: 'upper', label: 'חלק עליון מ-1.20 מ׳', z0: 1200, z1: null },
  { id: 'band', label: 'רצועה אופקית (0.90–1.10 מ׳)', z0: 900, z1: 1100 },
  { id: 'segment', label: 'מקטע לפי רוחב (חצי הקיר)', z0: 0, z1: null, along: 'half' },
];

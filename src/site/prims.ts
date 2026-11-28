// Every site element as simple 3D solids. The 3D view, the sections and the elevations are all built
// from these solids, so they always agree with each other and with the plan's numbers.

import { type Vec2, v2 } from '../geometry/vec';
import type { SiteData, SiteElement, MaterialId } from './types';
import { MATERIALS, lib, prm } from './library';
import { centroid, insetPolygon, localToWorld, rectAround, segmentQuads, sub, dot, norm, rotatePt } from './poly';
import { elementOutline, elementPath } from './outline';
import type { TerrainModel } from './terrain';
import type { FinishLike } from '../materials/finish';
import type { SPart, Slot } from './library';

/** Height as a linear function of plan position: z = c + cx·x + cy·y. */
export interface Lin { c: number; cx: number; cy: number }
export const flat = (z: number): Lin => ({ c: z, cx: 0, cy: 0 });
export const linAt = (l: Lin, p: Vec2) => l.c + l.cx * p.x + l.cy * p.y;
/** Linear height along direction a→b: za at a, zb at b, constant across. */
export function linAlong(a: Vec2, b: Vec2, za: number, zb: number): Lin {
  const L = Math.hypot(b.x - a.x, b.y - a.y);
  if (L < 1e-9) return flat(za);
  const u = norm(sub(b, a));
  const k = (zb - za) / L;
  return { c: za - dot(a, u) * k, cx: u.x * k, cy: u.y * k };
}
const shift = (l: Lin, dz: number): Lin => ({ ...l, c: l.c + dz });

/** How a solid is drawn in a section: hatched solid, tree crown, water, or an empty space (pool basin). */
export type Role = 'solid' | 'foliage' | 'water' | 'void' | 'trunk';

interface PrimBase { id: string; role: Role; color: string; material: MaterialId; /** 4.0: texture finish (main parts only). */ tex?: FinishLike }
export type Prim =
  | (PrimBase & { t: 'prism'; poly: Vec2[]; z0: Lin; z1: Lin })
  | (PrimBase & { t: 'cyl'; c: Vec2; r: number; z0: number; z1: number })
  | (PrimBase & { t: 'ell'; c: Vec2; r: number; rz: number; zc: number })
  | (PrimBase & { t: 'cone'; c: Vec2; r: number; z0: number; z1: number });

/** A layer draped on the ground: lawn, paving, path. thick = paving depth below the ground line. */
export interface Surface { id: string; poly: Vec2[]; color: string; material: MaterialId; thick: number; kind: string; tex?: FinishLike }

export interface ElementSolids { prims: Prim[]; surfaces: Surface[] }

const C = (m: MaterialId) => MATERIALS[m].color;

/** Base level of an element: terrain at its anchor plus its offset, or an absolute level. */
export function baseLevel(e: SiteElement, t: TerrainModel): number {
  if (e.elevMode === 'absolute') return e.elev;
  const g = e.geom;
  const anchor = g.type === 'point' ? g.p : g.type === 'dim' ? g.a : centroid(elementPath(e));
  return t.z(anchor) + e.elev;
}

export function elementSolids(e: SiteElement, t: TerrainModel): ElementSolids {
  const L = lib(e.kind);
  const out: ElementSolids = { prims: [], surfaces: [] };
  if (!L.solid) return out;
  const id = e.id;
  const col = e.color, mat = e.material;
  const P = (poly: Vec2[], z0: Lin | number, z1: Lin | number, role: Role = 'solid', color = col, material = mat) =>
    out.prims.push({ t: 'prism', id, role, color, material, poly, z0: typeof z0 === 'number' ? flat(z0) : z0, z1: typeof z1 === 'number' ? flat(z1) : z1 });
  const g = e.geom;

  // ---- surfaces draped on the ground ----
  if (L.surface && g.type !== 'point' && g.type !== 'dim') {
    out.surfaces.push({ id, poly: elementOutline(e), color: col, material: mat, thick: prm(e, 'thick'), kind: e.kind, ...(e.finish ? { tex: e.finish } : {}) });
    return out;
  }
  const tex = e.finish;

  // ---- line elements: one solid per segment, following the ground at each end ----
  if (g.type === 'line') {
    const w = prm(e, 'width'), h = prm(e, 'h');
    const groundAt = (q: Vec2) => (e.elevMode === 'absolute' ? e.elev : t.z(q) + e.elev);
    if (e.kind === 'path-stepping') {
      // Separate stones along the line, each following the ground under it.
      const path = elementPath(e), sp = Math.max(prm(e, 'spacing'), w * 0.5, 100);
      let carry = sp / 2;
      for (let i = 0; i + 1 < path.length; i++) {
        const a = path[i], b = path[i + 1], L2 = Math.hypot(b.x - a.x, b.y - a.y);
        if (L2 < 1) continue;
        const u = norm(sub(b, a)), ang = (Math.atan2(u.y, u.x) * 180) / Math.PI;
        for (let s0 = carry; s0 <= L2; s0 += sp) {
          const c = v2(a.x + u.x * s0, a.y + u.y * s0), z = groundAt(c);
          out.prims.push({ t: 'prism', id, role: 'solid', color: col, material: mat, poly: rectAround(c, w * 0.6, w, ang), z0: flat(z - 20), z1: flat(z + h - 20), ...(tex ? { tex } : {}) });
          carry = s0 + sp - L2;
        }
        if (carry > sp) carry = sp;
      }
      return out;
    }
    for (const q of segmentQuads(elementPath(e), w)) {
      const bottom = linAlong(q.a, q.b, groundAt(q.a), groundAt(q.b));
      if (e.kind === 'water-channel') {
        // A channel sunk into the ground: water below the ground line, stone edges level with it.
        P(q.quad, shift(bottom, -h - 80), shift(bottom, -h), 'solid', C('stone'), 'stone');
        P(q.quad, shift(bottom, -h), shift(bottom, -60), 'water', col, 'water');
        continue;
      }
      out.prims.push({ t: 'prism', id, role: e.kind === 'hedge' ? 'foliage' : 'solid', color: col, material: mat, poly: q.quad, z0: bottom, z1: shift(bottom, h), ...(tex ? { tex } : {}) });
    }
    return out;
  }

  const base = baseLevel(e, t);

  // ---- area elements ----
  if (g.type === 'area') {
    const poly = elementOutline(e);
    if (poly.length < 3) return out;
    if (e.kind === 'deck' || e.kind === 'bed') {
      P(poly, base, base + prm(e, 'h'));
    } else if (e.kind === 'building') {
      const h = prm(e, 'h'), wall = Math.min(prm(e, 'wall'), 5000), roof = Math.min(prm(e, 'roof'), h / 2);
      const inner = insetPolygon(poly, wall);
      for (let i = 0; i < poly.length; i++) {
        const j = (i + 1) % poly.length;
        P([poly[i], poly[j], inner[j], inner[i]], base, base + h - roof);
      }
      P(poly, base + h - roof, base + h, 'solid', C('concrete'), 'concrete');
      P(inner, base, base + 150, 'solid', C('concrete'), 'concrete');
    } else if (e.kind === 'pond' || e.kind === 'pool' || e.kind === 'pool-kids') {
      const depth = prm(e, 'depth');
      const rim = base;
      const inner = insetPolygon(poly, e.kind === 'pond' ? 150 : 300);
      P(poly, rim - depth - 150, rim - depth, 'solid', C('concrete'), 'concrete');
      for (let i = 0; i < poly.length; i++) {
        const j = (i + 1) % poly.length;
        P([poly[i], poly[j], inner[j], inner[i]], rim - depth, rim + 50, 'solid', C('stone'), 'stone');
      }
      P(inner, rim - depth, rim + 50, 'void', '#ffffff', 'none');
      P(inner, rim - depth, rim - 100, 'water', col, 'water');
    }
    return out;
  }

  if (g.type !== 'point') return out;
  const p = g.p, rot = g.rot;
  if (L.parts) { partsSolids(e, L.parts((k) => prm(e, k)), base, out); return out; }
  const box = (cx: number, cy: number, w: number, d: number, z0: number, z1: number, role: Role = 'solid', color = col, material = mat) =>
    P(rectAround(localToWorld(p, rot, v2(cx, cy)), w, d, rot), base + z0, base + z1, role, color, material);

  switch (e.kind) {
    case 'tree-round': case 'tree-columnar': case 'tree-conifer': {
      const dia = prm(e, 'dia'), h = prm(e, 'h'), th = Math.min(prm(e, 'trunkH'), h * 0.95), td = prm(e, 'trunkD');
      out.prims.push({ t: 'cyl', id, role: 'trunk', color: C('bark'), material: 'bark', c: p, r: td / 2, z0: base, z1: base + Math.max(th, h * 0.3) });
      if (e.kind === 'tree-conifer') out.prims.push({ t: 'cone', id, role: 'foliage', color: col, material: mat, c: p, r: dia / 2, z0: base + th, z1: base + h });
      else out.prims.push({ t: 'ell', id, role: 'foliage', color: col, material: mat, c: p, r: dia / 2, rz: (h - th) / 2, zc: base + th + (h - th) / 2 });
      break;
    }
    case 'palm': {
      const dia = prm(e, 'dia'), h = prm(e, 'h'), td = prm(e, 'trunkD');
      const rz = Math.min(dia * 0.16, h * 0.2);
      out.prims.push({ t: 'cyl', id, role: 'trunk', color: C('bark'), material: 'bark', c: p, r: td / 2, z0: base, z1: base + h - rz });
      out.prims.push({ t: 'ell', id, role: 'foliage', color: col, material: mat, c: p, r: dia / 2, rz, zc: base + h - rz });
      break;
    }
    case 'shrub': case 'flowers': {
      const dia = prm(e, 'dia'), h = prm(e, 'h');
      out.prims.push({ t: 'ell', id, role: 'foliage', color: col, material: mat, c: p, r: dia / 2, rz: h / 2, zc: base + h / 2 });
      break;
    }
    case 'bench': {
      const w = prm(e, 'w'), d = prm(e, 'd'), h = prm(e, 'h'), sh = prm(e, 'seatH');
      const seatD = h > sh ? d * 0.8 : d;
      const sy = h > sh ? -d / 2 + seatD / 2 : 0;
      box(0, sy, w, seatD, sh - 50, sh);
      for (const sx of [-1, 1]) box(sx * (w / 2 - 120), sy, 80, seatD * 0.85, 0, sh - 50, 'solid', C('metal'), 'metal');
      if (h > sh) box(0, d / 2 - 40, w, 60, sh, h);
      break;
    }
    case 'table': {
      const w = prm(e, 'w'), d = prm(e, 'd'), h = prm(e, 'h');
      box(0, 0, w, d, h - 50, h);
      for (const sx of [-1, 1]) box(sx * Math.max(w / 2 - 200, 0), 0, 80, d * 0.7, 0, h - 50, 'solid', C('metal'), 'metal');
      break;
    }
    case 'bin': {
      out.prims.push({ t: 'cyl', id, role: 'solid', color: col, material: mat, c: p, r: prm(e, 'dia') / 2, z0: base, z1: base + prm(e, 'h') });
      break;
    }
    case 'lamp': {
      const h = prm(e, 'h'), head = prm(e, 'dia');
      out.prims.push({ t: 'cyl', id, role: 'solid', color: col, material: mat, c: p, r: prm(e, 'poleD') / 2, z0: base, z1: base + h - 200 });
      box(0, 0, head, head, h - 250, h, 'solid', '#f3e7b3', 'glass');
      break;
    }
    case 'bike': {
      const w = prm(e, 'w'), d = prm(e, 'd'), h = prm(e, 'h'), n = Math.max(1, Math.round(prm(e, 'n')));
      for (let i = 0; i < n; i++) {
        const x = n === 1 ? 0 : -w / 2 + 40 + (i * (w - 80)) / (n - 1);
        box(x, 0, 40, d, 0, h);
      }
      break;
    }
    case 'drink': case 'fitness': {
      if (e.kind === 'drink') { box(0, 0, prm(e, 'w'), prm(e, 'd'), 0, prm(e, 'h')); break; }
      const w = prm(e, 'w'), d = prm(e, 'd'), h = prm(e, 'h');
      for (const sx of [-1, 1]) box(sx * (w / 2 - 50), 0, 100, 100, 0, h);
      box(0, 0, w, 60, h - 60, h);
      box(0, 0, w * 0.6, d, 400, 480, 'solid', C('wood'), 'wood');
      break;
    }
    case 'pergola': case 'shed': {
      const w = prm(e, 'w'), d = prm(e, 'd'), h = prm(e, 'h'), post = prm(e, 'post');
      const top = e.kind === 'shed' ? prm(e, 'roof') : 260;
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) box(sx * (w / 2 - post / 2), sy * (d / 2 - post / 2), post, post, 0, h - top);
      if (e.kind === 'shed') { box(0, 0, w + 200, d + 200, h - top, h); break; }
      for (const sy of [-1, 1]) box(0, sy * (d / 2 - post / 2), w + 300, post, h - 260, h - 60);
      const sp = Math.max(prm(e, 'spacing'), 50);
      const n = Math.max(2, Math.floor((w + 200) / sp) + 1);
      for (let i = 0; i < n; i++) box(-(w + 200) / 2 + (i * (w + 200)) / (n - 1), 0, 50, d + 300, h - 60, h);
      break;
    }
    case 'gate': {
      const w = prm(e, 'w'), d = prm(e, 'd'), h = prm(e, 'h');
      for (const sx of [-1, 1]) box(sx * (w / 2 + 60), 0, 120, 120, 0, h + 100);
      box(0, 0, w - 40, d, 100, h);
      break;
    }
    case 'stairs': {
      const w = prm(e, 'w'), d = prm(e, 'd'), rise = prm(e, 'rise'), n = Math.max(1, Math.round(prm(e, 'n')));
      // Steps go up towards local +Y. The first riser is at local y = -d/2.
      const run = d / n;
      for (let i = 0; i < n; i++) box(0, -d / 2 + run * (i + 0.5), w, run, 0, (rise * (i + 1)) / n);
      break;
    }
    case 'ramp': {
      const w = prm(e, 'w'), d = prm(e, 'd'), rise = prm(e, 'rise');
      const a = localToWorld(p, rot, v2(0, -d / 2)), b = localToWorld(p, rot, v2(0, d / 2));
      const top = linAlong(a, b, base, base + rise);
      P(rectAround(p, w, d, rot), base, top);
      break;
    }
    case 'play': {
      const w = prm(e, 'w'), d = prm(e, 'd'), h = prm(e, 'h'), dk = prm(e, 'deck');
      const tw = Math.min(w * 0.45, 1800), td = Math.min(d * 0.6, 1800);
      const cx = -w / 2 + tw / 2, cy = 0;
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) box(cx + sx * (tw / 2 - 60), cy + sy * (td / 2 - 60), 120, 120, 0, h - 150);
      box(cx, cy, tw, td, dk - 80, dk);
      box(cx, cy, tw + 200, td + 200, h - 150, h, 'solid', C('rubber'), 'rubber');
      // Slide from the deck down to the ground, towards +X.
      const sl = w - tw;
      const sa = localToWorld(p, rot, v2(cx + tw / 2, 0)), sb = localToWorld(p, rot, v2(w / 2, 0));
      const slideTop = linAlong(sa, sb, base + dk, base + 300);
      P(rectAround(localToWorld(p, rot, v2(cx + tw / 2 + sl / 2, 0)), sl, 500, rot), shift(slideTop, -80), slideTop, 'solid', C('rubber'), 'rubber');
      break;
    }
    case 'fountain': {
      const r = prm(e, 'dia') / 2, h = prm(e, 'h'), jet = prm(e, 'jet');
      out.prims.push({ t: 'cyl', id, role: 'solid', color: col, material: mat, c: p, r, z0: base - 300, z1: base + h });
      out.prims.push({ t: 'cyl', id, role: 'void', color: '#ffffff', material: 'none', c: p, r: Math.max(r - 200, r * 0.5), z0: base - 100, z1: base + h });
      out.prims.push({ t: 'cyl', id, role: 'water', color: C('water'), material: 'water', c: p, r: Math.max(r - 200, r * 0.5), z0: base - 100, z1: base + h - 100 });
      if (jet > 0) out.prims.push({ t: 'cyl', id, role: 'water', color: C('water'), material: 'water', c: p, r: 80, z0: base + h - 100, z1: base + h + jet });
      break;
    }
    default:
  }
  return out;
}

// ---------------------------------------------------------------- 4.0 parts

const SLOT: Record<Exclude<Slot, 1 | 2>, { color: string; material: MaterialId; role: Role }> = {
  foliage: { color: '#5e9c4f', material: 'foliage', role: 'foliage' },
  trunk: { color: '#7a5a3c', material: 'bark', role: 'trunk' },
  water: { color: '#7fb6d9', material: 'water', role: 'water' },
  metal: { color: '#6c7480', material: 'metal', role: 'solid' },
  wood: { color: '#b5835a', material: 'wood', role: 'solid' },
  stone: { color: '#bdb5a7', material: 'stone', role: 'solid' },
  concrete: { color: '#c8c6c0', material: 'concrete', role: 'solid' },
  rubber: { color: '#d9734e', material: 'rubber', role: 'solid' },
  glass: { color: '#a9c9df', material: 'glass', role: 'solid' },
  lamp: { color: '#f3e7b3', material: 'glass', role: 'solid' },
  soil: { color: '#6e5238', material: 'soil', role: 'solid' },
  sand: { color: '#e2cfa0', material: 'gravel', role: 'solid' },
  dark: { color: '#2f3134', material: 'metal', role: 'solid' },
  white: { color: '#f4f4f0', material: 'metal', role: 'solid' },
  orange: { color: '#e8902f', material: 'metal', role: 'solid' },
  pink: { color: '#e07a9a', material: 'foliage', role: 'foliage' },
  green: { color: '#4f8a3e', material: 'metal', role: 'solid' },
  blue: { color: '#2f6e9a', material: 'metal', role: 'solid' },
  bamboo: { color: '#9bb35a', material: 'wood', role: 'trunk' },
};

/** The solids of a library item made of parts, in the plan position and rotation of the element. */
function partsSolids(e: SiteElement, parts: SPart[], base: number, out: ElementSolids) {
  if (e.geom.type !== 'point') return;
  const p = e.geom.p, rot = e.geom.rot;
  const L = lib(e.kind);
  const green = L.material === 'foliage' || L.material === 'planting';
  const W = (x: number, y: number) => localToWorld(p, rot, v2(x, y));
  for (const q of parts) {
    const s = q.c === 1 ? { color: e.color, material: e.material, role: (green ? 'foliage' : 'solid') as Role }
      : q.c === 2 ? { color: e.color2 ?? L.color2 ?? e.color, material: e.material, role: (green ? 'foliage' : 'solid') as Role }
        : SLOT[q.c];
    const base0 = { id: e.id, role: s.role, color: s.color, material: s.material, ...(q.c === 1 && e.finish ? { tex: e.finish } : {}) };
    switch (q.t) {
      case 'box':
        if (q.x1 - q.x0 < 0.5 || q.y1 - q.y0 < 0.5 || q.z1 - q.z0 < 0.5) break;
        out.prims.push({ ...base0, t: 'prism', poly: [W(q.x0, q.y0), W(q.x1, q.y0), W(q.x1, q.y1), W(q.x0, q.y1)], z0: flat(base + q.z0), z1: flat(base + q.z1) });
        break;
      case 'slice': {
        if (q.x1 - q.x0 < 0.5) break;
        const a = W(q.x0, 0), b = W(q.x1, 0);
        out.prims.push({ ...base0, t: 'prism', poly: [W(q.x0, q.y0), W(q.x1, q.y0), W(q.x1, q.y1), W(q.x0, q.y1)], z0: linAlong(a, b, base + q.b0, base + q.b1), z1: linAlong(a, b, base + q.t0, base + q.t1) });
        break;
      }
      case 'poly': {
        const poly = q.pts.map(([x, y]) => W(x, y));
        if (q.tilt) {
          const a = W(0, q.tilt.y0), b = W(0, q.tilt.y1);
          const bottom = linAlong(a, b, base + q.tilt.z0, base + q.tilt.z1);
          out.prims.push({ ...base0, t: 'prism', poly, z0: bottom, z1: shift(bottom, q.tilt.th) });
        } else if (q.z1 - q.z0 >= 0.5) out.prims.push({ ...base0, t: 'prism', poly, z0: flat(base + q.z0), z1: flat(base + q.z1) });
        break;
      }
      case 'cyl': if (q.r > 0 && q.z1 > q.z0) out.prims.push({ ...base0, t: 'cyl', c: W(q.x, q.y), r: q.r, z0: base + q.z0, z1: base + q.z1 }); break;
      case 'cone': if (q.r > 0 && q.z1 > q.z0) out.prims.push({ ...base0, t: 'cone', c: W(q.x, q.y), r: q.r, z0: base + q.z0, z1: base + q.z1 }); break;
      case 'ell': if (q.r > 0 && q.rz > 0) out.prims.push({ ...base0, t: 'ell', c: W(q.x, q.y), r: q.r, rz: q.rz, zc: base + q.zc }); break;
    }
  }
}

/** Arrow direction (up the stairs or ramp) in plan, for drawing. */
export const upDirection = (rot: number) => rotatePt(v2(0, 1), rot);

export interface SiteModel {
  terrain: TerrainModel;
  /** Visible elements only, in drawing order. */
  solids: { e: SiteElement; s: ElementSolids }[];
}

export function visibleElements(d: SiteData) {
  const hidden = new Set(d.layers.filter((l) => !l.visible).map((l) => l.id));
  return d.elements.filter((e) => !hidden.has(e.layer));
}

/** Highest point of an element's solids, for level marks. */
export function primTop(pr: Prim, at?: Vec2): number {
  if (pr.t === 'prism') { const pts = pr.poly; return Math.max(...pts.map((q) => linAt(pr.z1, at ?? q))); }
  if (pr.t === 'ell') return pr.zc + pr.rz;
  return pr.z1;
}

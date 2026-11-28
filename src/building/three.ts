// Three.js scene of a building, built only from the model's solids (the same model as the plan and sections).
// Z is up, units are millimetres. Walls with openings are separate prisms around each opening, so the holes are real.

import * as THREE from 'three';
import { type Vec2, v2 } from '../geometry/vec';
import { linAt } from '../site/prims';
import { presetDir, setupLights, type ViewPreset } from '../site/three';
import { signedArea } from '../site/poly';
import type { BuildingData, FloorFinish } from './types';
import type { BPrim, BSolid, BuildingModel } from './model';
import { material as matDef } from './materials';
import { isRich, type FinishLike } from '../materials/finish';
import { finishMaterial, finishRepeat } from '../materials/three';

// ---------------------------------------------------------------- materials

const matCache = new Map<string, THREE.Material>();
export function bMaterial(color: string, role: string): THREE.Material {
  const key = `${color}|${role}`;
  let m = matCache.get(key);
  if (!m) {
    if (role === 'glass' || role === 'railing')
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.1, metalness: 0.1, transparent: true, opacity: role === 'glass' ? 0.32 : 0.45, depthWrite: false, side: THREE.DoubleSide });
    else if (role === 'metal') m = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.6 });
    else if (role === 'lamp') m = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.9, roughness: 0.4 });
    else m = new THREE.MeshStandardMaterial({ color, roughness: role === 'roof' ? 0.9 : 0.8, metalness: 0, flatShading: true });
    matCache.set(key, m);
  }
  return m;
}

/** A tile / plank / stone pattern drawn once per (material, colour) on a canvas: one texture repeat = one tile. */
const texCache = new Map<string, THREE.Texture | null>();
function patternTexture(f: FloorFinish): THREE.Texture | null {
  const def = matDef(f.material);
  const key = `${def.pattern}|${f.color}|${f.tileW > 0 ? (f.tileW / f.tileH).toFixed(2) : 1}`;
  if (texCache.has(key)) return texCache.get(key)!;
  let tex: THREE.Texture | null = null;
  if (typeof document !== 'undefined' && (def.pattern === 'tile' || def.pattern === 'plank' || def.pattern === 'stone' || def.pattern === 'concrete')) {
    const ratio = f.tileW > 0 && f.tileH > 0 ? f.tileW / f.tileH : 1;
    const W = 256, H = Math.max(16, Math.min(512, Math.round(256 / ratio)));
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    if (g) {
      const base = new THREE.Color(f.color);
      const shade = (k: number) => { const x = base.clone(); x.offsetHSL(0, 0, k); return `#${x.getHexString()}`; };
      g.fillStyle = f.color;
      g.fillRect(0, 0, W, H);
      // A fixed pseudo-random sequence, so the look is the same every time.
      let seed = 7;
      const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
      if (def.pattern === 'plank') {
        for (let i = 0; i < 14; i++) { g.strokeStyle = shade((rnd() - 0.5) * 0.08); g.lineWidth = 1 + rnd() * 2; const y = rnd() * H; g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(W / 3, y + (rnd() - 0.5) * 6, (2 * W) / 3, y + (rnd() - 0.5) * 6, W, y); g.stroke(); }
      } else if (def.pattern === 'stone' || def.pattern === 'concrete') {
        for (let i = 0; i < 900; i++) { g.fillStyle = shade((rnd() - 0.5) * (def.pattern === 'stone' ? 0.12 : 0.06)); const r = 1 + rnd() * (def.pattern === 'stone' ? 5 : 2); g.fillRect(rnd() * W, rnd() * H, r, r); }
      }
      if (def.pattern !== 'concrete') {
        // Joints along two edges (the neighbouring tile draws the other two).
        g.fillStyle = shade(-0.22);
        const j = def.pattern === 'plank' ? 1.5 : 3;
        g.fillRect(0, 0, W, j);
        g.fillRect(0, 0, j, H);
      }
      tex = new THREE.CanvasTexture(c);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
    }
  }
  texCache.set(key, tex);
  return tex;
}

const floorMatCache = new Map<string, THREE.Material>();
function floorMaterial(f: FloorFinish): THREE.Material {
  const tex = patternTexture(f);
  if (!tex) return bMaterial(f.color, 'finish');
  const key = `${f.material}|${f.color}|${f.tileW}|${f.tileH}`;
  let m = floorMatCache.get(key);
  if (!m) { m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, metalness: 0 }); floorMatCache.set(key, m); }
  return m;
}

// ---------------------------------------------------------------- geometry

interface Buckets { add(color: string, role: string, pos: number[], uv?: number[], floor?: FloorFinish, tex?: FinishLike): void }

/** Key of a 4.0 finish's material (everything but the texture angle, which lives in the texture coordinates). */
const finishKey = (f: FinishLike) => [f.material, f.color, f.color2, f.tw ?? f.tileW, f.th ?? f.tileH, f.layout, f.grout, f.groutW, f.rough, f.metal, f.opacity, f.img].join('|');

/** 4.0 texture coordinates: one unit per texture repeat, turned by the finish's angle. (a, b) are mm in the face plane. */
function uvOf(f: FinishLike, a: number, b: number): [number, number] {
  const rep = finishRepeat(f);
  const ang = ((f.angle ?? 0) * Math.PI) / 180, ca = Math.cos(ang), sa = Math.sin(ang);
  return [(a * ca + b * sa) / rep.w, (-a * sa + b * ca) / rep.h];
}

/** Top, bottom and sides of a prism (with holes, and with linear top / bottom heights for sloped roofs). */
function prismInto(pr: Extract<BPrim, { t: 'prism' }>, out: Buckets) {
  let poly = pr.poly;
  if (poly.length < 3) return;
  if (signedArea(poly) < 0) poly = poly.slice().reverse();
  const holes = (pr.holes ?? []).filter((h) => h.length >= 3).map((h) => (signedArea(h) > 0 ? h.slice().reverse() : h));
  const all = [poly, ...holes].flat();
  // Every triangle counter-clockwise seen from above, so the top faces up and the bottom faces down.
  const tris = THREE.ShapeUtils.triangulateShape(poly.map((p) => new THREE.Vector2(p.x, p.y)), holes.map((h) => h.map((p) => new THREE.Vector2(p.x, p.y))))
    .map(([i, j, k]) => ((all[j].x - all[i].x) * (all[k].y - all[i].y) - (all[j].y - all[i].y) * (all[k].x - all[i].x) >= 0 ? [i, j, k] : [i, k, j]));
  const zb = all.map((p) => linAt(pr.z0, p)), zt = all.map((p) => linAt(pr.z1, p));
  const caps: number[] = [], top: number[] = [], uv: number[] = [];
  for (const [i, j, k] of tris) {
    top.push(all[i].x, all[i].y, zt[i], all[j].x, all[j].y, zt[j], all[k].x, all[k].y, zt[k]);
    caps.push(all[i].x, all[i].y, zb[i], all[k].x, all[k].y, zb[k], all[j].x, all[j].y, zb[j]);
  }
  const texAll: FinishLike | undefined = pr.tex ?? (pr.floor && isRich(pr.floor) ? pr.floor : undefined);
  if (texAll) {
    // 4.0: the finish on the top and bottom faces, in plan coordinates.
    for (const [i, j, k] of tris) for (const q of [all[i], all[j], all[k]]) uv.push(...uvOf(texAll, q.x, q.y));
    out.add(pr.color, pr.role, top, uv, undefined, texAll);
    const uvb: number[] = [];
    for (const [i, j, k] of tris) for (const q of [all[i], all[k], all[j]]) uvb.push(...uvOf(texAll, q.x, q.y));
    out.add(pr.color, pr.role, caps, uvb, undefined, texAll);
  } else if (pr.floor) {
    // Texture coordinates: one unit per tile, turned by the laying angle.
    const a = (-pr.floor.angle * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
    const tw = pr.floor.tileW || 1000, th = pr.floor.tileH || 1000;
    for (const [i, j, k] of tris) for (const q of [all[i], all[j], all[k]]) uv.push((q.x * ca - q.y * sa) / tw, (q.x * sa + q.y * ca) / th);
    out.add(pr.color, 'finish', top, uv, pr.floor);
  } else out.add(pr.color, pr.role, top);
  if (!texAll) out.add(pr.color, pr.role, caps);
  // Sides: outer ring counter-clockwise, holes clockwise, so every side faces out of the solid.
  let off = 0;
  for (const ring of [poly, ...holes]) {
    const n = ring.length;
    for (let i = 0; i < n; i++) {
      const p = ring[i], q = ring[(i + 1) % n];
      const ip = off + i, iq = off + ((i + 1) % n);
      const quad = [p.x, p.y, zb[ip], q.x, q.y, zb[iq], q.x, q.y, zt[iq], p.x, p.y, zb[ip], q.x, q.y, zt[iq], p.x, p.y, zt[ip]];
      let color = pr.color;
      let tex: FinishLike | undefined = texAll;
      if (pr.side || pr.sideTex) {
        // Outward normal of this side (right of p→q for a counter-clockwise ring).
        const dx = q.x - p.x, dy = q.y - p.y, len = Math.hypot(dx, dy) || 1;
        const nx = dy / len, ny = -dx / len;
        const sn = (pr.side ?? pr.sideTex)!.n;
        const dt = nx * sn.x + ny * sn.y;
        if (dt > 0.7) { if (pr.side) color = pr.side.L; tex = pr.sideTex?.L ?? tex; }
        else if (dt < -0.7) { if (pr.side) color = pr.side.R; tex = pr.sideTex?.R ?? tex; }
      }
      if (tex) {
        // Along the side (projected on its direction, so that pieces of one wall continue the pattern) and up.
        const dx = q.x - p.x, dy = q.y - p.y, len = Math.hypot(dx, dy) || 1;
        const ex = dx / len, ey = dy / len;
        const sp = p.x * ex + p.y * ey, sq = q.x * ex + q.y * ey;
        const [a1, b1] = uvOf(tex, sp, zb[ip]), [a2, b2] = uvOf(tex, sq, zb[iq]), [a3, b3] = uvOf(tex, sq, zt[iq]), [a4, b4] = uvOf(tex, sp, zt[ip]);
        out.add(color, pr.role, quad, [a1, b1, a2, b2, a3, b3, a1, b1, a3, b3, a4, b4], undefined, tex);
      } else out.add(color, pr.role, quad);
    }
    off += n;
  }
}

/** Builds one group per solid: one mesh per material. Groups are cached by their content. */
const groupCache = new Map<string, THREE.Group>();
export function solidGroup(s: BSolid): THREE.Group {
  const key = `${s.id}|${JSON.stringify(s.prims)}`;
  const hit = groupCache.get(key);
  if (hit) return hit;
  const buckets = new Map<string, { mat: THREE.Material; pos: number[]; uv: number[] | null; role: string }>();
  const out: Buckets = {
    add(color, role, pos, uv, floor, tex) {
      const k = tex ? `T|${finishKey(tex)}` : floor ? `F|${floor.material}|${color}|${floor.tileW}|${floor.tileH}` : `${color}|${role}`;
      let b = buckets.get(k);
      if (!b) {
        const mat = tex ? finishMaterial(tex) : floor ? floorMaterial(floor) : bMaterial(color, role);
        const clearTex = tex && (mat as THREE.MeshStandardMaterial).transparent;
        b = { mat, pos: [], uv: floor || tex ? [] : null, role: clearTex ? 'glass' : role };
        buckets.set(k, b);
      }
      b.pos.push(...pos);
      if (b.uv && uv) b.uv.push(...uv);
      else if (b.uv) for (let i = 0; i < pos.length / 3; i++) b.uv.push(0, 0);
    },
  };
  for (const pr of s.prims) {
    if (pr.t === 'prism') prismInto(pr, out);
    else {
      const h = pr.z1 - pr.z0;
      if (h <= 0 || pr.r <= 0) continue;
      const g = new THREE.CylinderGeometry(pr.r, pr.r, h, 20).toNonIndexed();
      g.rotateX(Math.PI / 2);
      g.translate(pr.c.x, pr.c.y, pr.z0 + h / 2);
      if (pr.tex) {
        // 4.0: around the cylinder and up, in texture repeats.
        const rep = finishRepeat(pr.tex);
        const src = g.getAttribute('uv').array as Float32Array;
        const uvs: number[] = [];
        for (let i = 0; i < src.length; i += 2) uvs.push((src[i] * 2 * Math.PI * pr.r) / rep.w, (src[i + 1] * h) / rep.h);
        out.add(pr.color, pr.role, Array.from(g.getAttribute('position').array as Float32Array), uvs, undefined, pr.tex);
      } else out.add(pr.color, pr.role, Array.from(g.getAttribute('position').array as Float32Array));
      g.dispose();
    }
  }
  const group = new THREE.Group();
  group.userData.id = s.id;
  group.userData.type = s.type;
  group.userData.levelId = s.levelId;
  for (const b of buckets.values()) {
    if (!b.pos.length) continue;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
    if (b.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, b.mat);
    mesh.userData.id = s.id;
    const clear = b.role === 'glass' || b.role === 'railing';
    mesh.castShadow = !clear;
    mesh.receiveShadow = !clear;
    if (clear) mesh.renderOrder = 2;
    group.add(mesh);
  }
  if (groupCache.size > 4000) { for (const [k, g] of groupCache) { groupCache.delete(k); g.traverse((o) => (o as THREE.Mesh).geometry?.dispose()); if (groupCache.size < 2500) break; } }
  groupCache.set(key, group);
  return group;
}

// ---------------------------------------------------------------- filtering, bounds, snapshot

export interface View3DOpts {
  /** Levels to show (ids). null = all. */
  levels: Set<string> | null;
  roofs: boolean;
  ceilings: boolean;
  furniture: boolean;
  /** Horizontal cut height (absolute, mm): everything above it is removed. */
  cutZ?: number;
}

export function visibleSolids(m: BuildingModel, o: View3DOpts): BSolid[] {
  const list = m.solids.filter((s) => (!o.levels || o.levels.has(s.levelId)) && (o.roofs || s.type !== 'roof') && (o.ceilings || s.type !== 'ceiling') && (o.furniture || s.type !== 'furniture'));
  return o.cutZ === undefined ? list : list.map((s) => cutSolid(s, o.cutZ!)).filter((s): s is BSolid => !!s);
}

/** A solid cut by a horizontal plane: everything above z is removed and the cut faces are closed (solid caps). */
function cutSolid(s: BSolid, z: number): BSolid | null {
  const prims: BPrim[] = [];
  for (const pr of s.prims) {
    if (pr.t === 'cyl') { if (pr.z0 < z) prims.push({ ...pr, z1: Math.min(pr.z1, z) }); continue; }
    const lo = Math.min(...pr.poly.map((p) => linAt(pr.z0, p)));
    if (lo >= z) continue;
    const hi = Math.max(...pr.poly.map((p) => linAt(pr.z1, p)));
    if (hi <= z) { prims.push(pr); continue; }
    // Sloped tops are not cut exactly; they are flattened at the cut (roofs are hidden in a cut view anyway).
    prims.push({ ...pr, z1: { c: z, cx: 0, cy: 0 } });
  }
  return prims.length ? { ...s, prims } : null;
}

export function solidsBounds(solids: BSolid[]): { c: THREE.Vector3; R: number; box: THREE.Box3 } {
  const box = new THREE.Box3();
  for (const s of solids) for (const pr of s.prims) {
    if (pr.t === 'prism') for (const p of pr.poly) { box.expandByPoint(new THREE.Vector3(p.x, p.y, linAt(pr.z0, p))); box.expandByPoint(new THREE.Vector3(p.x, p.y, linAt(pr.z1, p))); }
    else { box.expandByPoint(new THREE.Vector3(pr.c.x - pr.r, pr.c.y - pr.r, pr.z0)); box.expandByPoint(new THREE.Vector3(pr.c.x + pr.r, pr.c.y + pr.r, pr.z1)); }
  }
  if (box.isEmpty()) box.set(new THREE.Vector3(-1000, -1000, 0), new THREE.Vector3(10000, 8000, 3000));
  const c = box.getCenter(new THREE.Vector3());
  const R = Math.max(2000, box.getSize(new THREE.Vector3()).length() / 2);
  return { c, R, box };
}

/** A ground plane under the building (at the ground level around it). */
export function groundMesh(d: BuildingData, box: THREE.Box3): THREE.Mesh {
  const size = box.getSize(new THREE.Vector3());
  const pad = Math.max(size.x, size.y) * 0.6 + 4000;
  const c = box.getCenter(new THREE.Vector3());
  const g = new THREE.PlaneGeometry(size.x + pad * 2, size.y + pad * 2);
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: '#dfe5d6', roughness: 1 }));
  m.position.set(c.x, c.y, d.groundLevel - 30);
  m.receiveShadow = true;
  m.userData.ground = true;
  return m;
}

/** Renders a still image of the building (for submission sheets). Returns a PNG data URL, or null without WebGL. */
export function renderBSnapshot(d: BuildingData, model: BuildingModel, view: ViewPreset, pxW: number, pxH: number, o: View3DOpts, ortho = view !== 'persp'): string | null {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  } catch {
    return null;
  }
  try {
    renderer.setSize(pxW, pxH, false);
    renderer.setClearColor(0xffffff);
    renderer.shadowMap.enabled = true;
    const scene = new THREE.Scene();
    const solids = visibleSolids(model, o);
    for (const s of solids) scene.add(solidGroup(s).clone());
    const { c, R, box } = solidsBounds(solids);
    scene.add(groundMesh(d, box));
    setupLights(scene, c, R, { az: 210, alt: 50 }, true);
    const aspect = pxW / pxH;
    const dir = presetDir(view);
    let camera: THREE.Camera;
    if (!ortho) {
      const pc = new THREE.PerspectiveCamera(40, aspect, R / 100, R * 20);
      pc.up.set(0, 0, 1);
      pc.position.copy(c).addScaledVector(dir, (R * 0.9) / Math.sin(THREE.MathUtils.degToRad(20)));
      pc.lookAt(c);
      camera = pc;
    } else {
      const h = R * 0.78 * Math.max(1, 1.5 / aspect), w = h * aspect;
      const oc = new THREE.OrthographicCamera(-w, w, h, -h, -R * 10, R * 10);
      oc.up.set(0, 0, 1);
      oc.position.copy(c).addScaledVector(dir, R * 3);
      oc.lookAt(c);
      camera = oc;
    }
    renderer.render(scene, camera);
    return renderer.domElement.toDataURL('image/png');
  } finally {
    renderer.dispose();
    renderer.forceContextLoss();
  }
}

export const pt2 = (p: THREE.Vector3): Vec2 => v2(p.x, p.y);
export { presetDir, setupLights };
export type { ViewPreset };

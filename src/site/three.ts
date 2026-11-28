// Three.js scene of a site, built only from the engine's solids and terrain model.
// Z is up, units are millimetres, exactly as in the engine.

import * as THREE from 'three';
import { finishMaterial, finishRepeat } from '../materials/three';
import type { FinishLike } from '../materials/finish';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { type Vec2, v2 } from '../geometry/vec';
import type { SiteData } from './types';
import type { SiteModel } from './section';
import type { ElementSolids, Prim } from './prims';
import { linAt } from './prims';
import { insetPolygon, pointInPoly, triangulate } from './poly';
import { elementOutline } from './outline';
import type { TerrainModel } from './terrain';

const matCache = new Map<string, THREE.Material>();
export function material(color: string, role: string): THREE.Material {
  const key = `${color}|${role}`;
  let m = matCache.get(key);
  if (!m) {
    if (role === 'water') m = new THREE.MeshStandardMaterial({ color, roughness: 0.15, metalness: 0.05, transparent: true, opacity: 0.8 });
    else if (role === 'glass') m = new THREE.MeshStandardMaterial({ color, roughness: 0.3, emissive: new THREE.Color(color), emissiveIntensity: 0.25 });
    else m = new THREE.MeshStandardMaterial({ color, roughness: role === 'foliage' ? 0.9 : 0.75, metalness: 0, flatShading: role !== 'foliage' });
    matCache.set(key, m);
  }
  return m;
}

/** Subdivide triangles until every edge is shorter than step, sharing midpoints so the mesh stays watertight. */
function subdivide(pts: Vec2[], tris: [number, number, number][], step: number, maxTris = 60000) {
  const P = pts.slice();
  const mid = new Map<string, number>();
  const midOf = (a: number, b: number) => {
    const k = a < b ? `${a},${b}` : `${b},${a}`;
    let i = mid.get(k);
    if (i === undefined) { i = P.length; P.push(v2((P[a].x + P[b].x) / 2, (P[a].y + P[b].y) / 2)); mid.set(k, i); }
    return i;
  };
  let cur = tris;
  for (let iter = 0; iter < 12; iter++) {
    const next: [number, number, number][] = [];
    let split = false;
    for (const [a, b, c] of cur) {
      const l = Math.max(Math.hypot(P[a].x - P[b].x, P[a].y - P[b].y), Math.hypot(P[b].x - P[c].x, P[b].y - P[c].y), Math.hypot(P[c].x - P[a].x, P[c].y - P[a].y));
      if (l > step && cur.length * 4 < maxTris) {
        const ab = midOf(a, b), bc = midOf(b, c), ca = midOf(c, a);
        next.push([a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]);
        split = true;
      } else next.push([a, b, c]);
    }
    cur = next;
    if (!split) break;
  }
  return { P, tris: cur };
}

function draped(poly: Vec2[], t: TerrainModel, step: number, lift: number, holes: Vec2[][] = []): THREE.BufferGeometry | null {
  if (poly.length < 3) return null;
  const tri = triangulate(poly);
  if (!tri.length) return null;
  const { P, tris } = subdivide(poly, tri, step);
  const pos: number[] = [];
  const zs = P.map((p) => t.z(p) + lift);
  for (const [a, b, c] of tris) {
    if (holes.length) { const cx = (P[a].x + P[b].x + P[c].x) / 3, cy = (P[a].y + P[b].y + P[c].y) / 3; if (holes.some((h) => pointInPoly(v2(cx, cy), h))) continue; }
    pos.push(P[a].x, P[a].y, zs[a], P[b].x, P[b].y, zs[b], P[c].x, P[c].y, zs[c]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

function prismGeometry(pr: Extract<Prim, { t: 'prism' }>): THREE.BufferGeometry | null {
  const poly = pr.poly;
  if (poly.length < 3) return null;
  const tris = triangulate(poly);
  const pos: number[] = [];
  const b = poly.map((p) => linAt(pr.z0, p)), t = poly.map((p) => linAt(pr.z1, p));
  for (const [i, j, k] of tris) {
    pos.push(poly[i].x, poly[i].y, t[i], poly[j].x, poly[j].y, t[j], poly[k].x, poly[k].y, t[k]);
    pos.push(poly[i].x, poly[i].y, b[i], poly[k].x, poly[k].y, b[k], poly[j].x, poly[j].y, b[j]);
  }
  const n = poly.length;
  const ccw = tris.length ? (poly[tris[0][1]].x - poly[tris[0][0]].x) * (poly[tris[0][2]].y - poly[tris[0][0]].y) - (poly[tris[0][1]].y - poly[tris[0][0]].y) * (poly[tris[0][2]].x - poly[tris[0][0]].x) > 0 : true;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const [p, q] = ccw ? [i, j] : [j, i];
    pos.push(poly[p].x, poly[p].y, b[p], poly[q].x, poly[q].y, b[q], poly[q].x, poly[q].y, t[q]);
    pos.push(poly[p].x, poly[p].y, b[p], poly[q].x, poly[q].y, t[q], poly[p].x, poly[p].y, t[p]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

function primGeometry(pr: Prim): THREE.BufferGeometry | null {
  if (pr.t === 'prism') return prismGeometry(pr);
  if (pr.t === 'cyl') {
    const h = pr.z1 - pr.z0;
    if (h <= 0 || pr.r <= 0) return null;
    const g = new THREE.CylinderGeometry(pr.r, pr.r, h, 20);
    g.rotateX(Math.PI / 2);
    g.translate(pr.c.x, pr.c.y, pr.z0 + h / 2);
    return g;
  }
  if (pr.t === 'ell') {
    if (pr.r <= 0 || pr.rz <= 0) return null;
    const g = new THREE.SphereGeometry(1, 18, 12);
    g.scale(pr.r, pr.r, pr.rz);
    g.translate(pr.c.x, pr.c.y, pr.zc);
    return g;
  }
  const h = pr.z1 - pr.z0;
  if (h <= 0 || pr.r <= 0) return null;
  const g = new THREE.ConeGeometry(pr.r, h, 20);
  g.rotateX(Math.PI / 2);
  g.translate(pr.c.x, pr.c.y, pr.z0 + h / 2);
  return g;
}

/** 4.0: texture coordinates in repeats: horizontal faces by plan x/y, walls by their horizontal direction and z. */
function boxUV(geo: THREE.BufferGeometry, f: FinishLike): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const pos = g.getAttribute('position');
  const { w: rw, h: rh } = finishRepeat(f);
  const a = ((f.angle ?? 0) * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i + 2 < pos.count; i += 3) {
    const ax = pos.getX(i), ay = pos.getY(i), az = pos.getZ(i);
    const ux = pos.getX(i + 1) - ax, uy = pos.getY(i + 1) - ay, uz = pos.getZ(i + 1) - az;
    const vx = pos.getX(i + 2) - ax, vy = pos.getY(i + 2) - ay, vz = pos.getZ(i + 2) - az;
    const nx = Math.abs(uy * vz - uz * vy), ny = Math.abs(uz * vx - ux * vz), nz = Math.abs(ux * vy - uy * vx);
    for (let k = 0; k < 3; k++) {
      const x = pos.getX(i + k), y = pos.getY(i + k), z = pos.getZ(i + k);
      let u: number, v: number;
      if (nz >= nx && nz >= ny) { u = x * ca + y * sa; v = -x * sa + y * ca; } else if (nx >= ny) { u = y; v = z; } else { u = x; v = z; }
      uv[(i + k) * 2] = u / Math.max(rw, 1);
      uv[(i + k) * 2 + 1] = v / Math.max(rh, 1);
    }
  }
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

/** A finish material with its own polygon offset (surfaces stacked on the ground). */
const offsetMats = new WeakMap<THREE.Material, Map<number, THREE.Material>>();
function offsetMaterial(base: THREE.Material, i: number): THREE.Material {
  let m = offsetMats.get(base);
  if (!m) { m = new Map(); offsetMats.set(base, m); }
  let hit = m.get(i);
  if (!hit) { hit = base.clone(); hit.polygonOffset = true; hit.polygonOffsetFactor = -2 - i; hit.polygonOffsetUnits = -2 - i; m.set(i, hit); }
  return hit;
}

const groupCache = new WeakMap<ElementSolids, THREE.Group>();

/** One group per element (merged by material), cached per solids object. */
export function elementGroup(id: string, s: ElementSolids, t: TerrainModel, step: number): THREE.Group {
  const cached = groupCache.get(s);
  if (cached) return cached;
  const g = new THREE.Group();
  g.userData.id = id;
  const byMat = new Map<string, { color: string; role: string; geos: THREE.BufferGeometry[] }>();
  const byTex = new Map<string, { f: FinishLike; geos: THREE.BufferGeometry[] }>();
  for (const pr of s.prims) {
    if (pr.role === 'void') continue;
    const geo = primGeometry(pr);
    if (!geo) continue;
    if (pr.tex) {
      const k = JSON.stringify(pr.tex);
      if (!byTex.has(k)) byTex.set(k, { f: pr.tex, geos: [] });
      byTex.get(k)!.geos.push(boxUV(geo, pr.tex));
      continue;
    }
    const role = pr.material === 'glass' ? 'glass' : pr.role;
    const k = `${pr.color}|${role}`;
    if (!byMat.has(k)) byMat.set(k, { color: pr.color, role, geos: [] });
    byMat.get(k)!.geos.push(geo.index ? geo.toNonIndexed() : geo);
  }
  for (const { color, role, geos } of byMat.values()) {
    const geo = geos.length === 1 ? geos[0] : mergeGeometries(geos.map((x) => { x.deleteAttribute('uv'); return x; }), false);
    if (!geo) continue;
    const m = new THREE.Mesh(geo, material(color, role));
    m.castShadow = true;
    m.receiveShadow = true;
    m.userData.id = id;
    m.userData.batchable = true;
    g.add(m);
  }
  for (const { f, geos } of byTex.values()) {
    const geo = geos.length === 1 ? geos[0] : mergeGeometries(geos.map((x) => { for (const k of Object.keys(x.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') x.deleteAttribute(k); return x; }), false);
    if (!geo) continue;
    const m = new THREE.Mesh(geo, finishMaterial(f));
    m.castShadow = true;
    m.receiveShadow = true;
    m.userData.id = id;
    m.userData.batchable = true;
    g.add(m);
  }
  s.surfaces.forEach((sf, i) => {
    const geo0 = draped(sf.poly, t, step, 25 + i * 2);
    if (!geo0) return;
    const geo = sf.tex ? boxUV(geo0, sf.tex) : geo0;
    const mat = sf.tex ? offsetMaterial(finishMaterial(sf.tex), i) : new THREE.MeshStandardMaterial({ color: sf.color, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2 - i, polygonOffsetUnits: -2 - i });
    const m = new THREE.Mesh(geo, mat);
    m.receiveShadow = true;
    m.userData.id = id;
    g.add(m);
  });
  groupCache.set(s, g);
  return g;
}

/** Terrain as a solid site model: draped top inside the lots (or the site extent) and soil sides. */
export function terrainGroup(_d: SiteData, model: SiteModel): { group: THREE.Group; zMin: number; step: number } {
  const t = model.terrain;
  const lots = model.items.filter((it) => it.e.kind === 'lot').map((it) => elementOutline(it.e)).filter((p) => p.length >= 3);
  const dom = t.domain;
  const outlines = lots.length ? lots : [[v2(dom.minX, dom.minY), v2(dom.maxX, dom.minY), v2(dom.maxX, dom.maxY), v2(dom.minX, dom.maxY)]];
  const size = Math.max(dom.maxX - dom.minX, dom.maxY - dom.minY);
  const step = Math.max(size / 110, 250);
  // Holes where the ground is dug out: ponds and fountains.
  const holes: Vec2[][] = [];
  for (const it of model.items) {
    if (it.e.kind === 'pond') holes.push(insetPolygon(elementOutline(it.e), 150));
    if (it.e.kind === 'fountain' && it.e.geom.type === 'point') holes.push(elementOutline(it.e));
  }
  const group = new THREE.Group();
  let zMin = Infinity;
  for (const ol of outlines) {
    const top = draped(ol, t, step, 0, holes);
    if (!top) continue;
    const pos = top.getAttribute('position');
    for (let i = 0; i < pos.count; i++) zMin = Math.min(zMin, pos.getZ(i));
    // Colour the ground by a soft tone only; surfaces carry their own colours.
    const mesh = new THREE.Mesh(top, new THREE.MeshStandardMaterial({ color: '#cbb994', roughness: 1 }));
    mesh.receiveShadow = true;
    mesh.userData.terrain = true;
    group.add(mesh);
  }
  if (!Number.isFinite(zMin)) zMin = t.base;
  const bottom = zMin - 1500;
  for (const ol of outlines) {
    const pos: number[] = [];
    for (let i = 0; i < ol.length; i++) {
      const a = ol[i], b = ol[(i + 1) % ol.length];
      const L = Math.hypot(b.x - a.x, b.y - a.y);
      const n = Math.max(1, Math.ceil(L / step));
      for (let k = 0; k < n; k++) {
        const p = v2(a.x + ((b.x - a.x) * k) / n, a.y + ((b.y - a.y) * k) / n), q = v2(a.x + ((b.x - a.x) * (k + 1)) / n, a.y + ((b.y - a.y) * (k + 1)) / n);
        const zp = t.z(p), zq = t.z(q);
        pos.push(p.x, p.y, bottom, q.x, q.y, bottom, q.x, q.y, zq, p.x, p.y, bottom, q.x, q.y, zq, p.x, p.y, zp);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    group.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: '#9b7b57', roughness: 1, side: THREE.DoubleSide })));
  }
  return { group, zMin: bottom, step };
}

export function siteBounds(model: SiteModel, zMin: number) {
  const dom = model.terrain.domain;
  let zMax = zMin + 3000;
  for (const it of model.items) for (const pr of it.s.prims) {
    const top = pr.t === 'ell' ? pr.zc + pr.rz : pr.t === 'prism' ? Math.max(...pr.poly.map((p) => linAt(pr.z1, p))) : pr.z1;
    if (Number.isFinite(top)) zMax = Math.max(zMax, top);
  }
  const c = new THREE.Vector3((dom.minX + dom.maxX) / 2, (dom.minY + dom.maxY) / 2, (zMin + zMax) / 2);
  const R = Math.hypot(dom.maxX - dom.minX, dom.maxY - dom.minY, zMax - zMin) / 2;
  return { c, R, zMax };
}

export type ViewPreset = 'iso' | 'top' | 'south' | 'north' | 'east' | 'west' | 'persp';

/** Camera direction (from target towards camera) for each preset. */
export function presetDir(v: ViewPreset): THREE.Vector3 {
  switch (v) {
    case 'top': return new THREE.Vector3(0, -0.0001, 1);
    case 'south': return new THREE.Vector3(0, -1, 0.12).normalize();
    case 'north': return new THREE.Vector3(0, 1, 0.12).normalize();
    case 'east': return new THREE.Vector3(1, 0, 0.12).normalize();
    case 'west': return new THREE.Vector3(-1, 0, 0.12).normalize();
    case 'persp': return new THREE.Vector3(-0.55, -1, 0.55).normalize();
    default: return new THREE.Vector3(-1, -1, 1.1).normalize();
  }
}

export function setupLights(scene: THREE.Scene, c: THREE.Vector3, R: number, sun: { az: number; alt: number }, shadows: boolean) {
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7a66, 1.25));
  const dir = new THREE.DirectionalLight(0xfff6e8, 2.0);
  const az = (sun.az * Math.PI) / 180, alt = (sun.alt * Math.PI) / 180;
  dir.position.set(c.x + Math.sin(az) * Math.cos(alt) * R * 2, c.y + Math.cos(az) * Math.cos(alt) * R * 2, c.z + Math.sin(alt) * R * 2);
  dir.target.position.copy(c);
  dir.castShadow = shadows;
  if (shadows) {
    dir.shadow.mapSize.set(2048, 2048);
    const cam = dir.shadow.camera;
    cam.left = -R * 1.2; cam.right = R * 1.2; cam.top = R * 1.2; cam.bottom = -R * 1.2; cam.near = R * 0.2; cam.far = R * 5;
    dir.shadow.bias = -0.0005;
    dir.shadow.normalBias = R * 0.0004;
  }
  scene.add(dir, dir.target);
  return dir;
}

/** Renders a still image of the site (for submission sheets). Returns a PNG data URL, or null without WebGL. */
export function renderSnapshot(d: SiteData, model: SiteModel, view: 'iso' | 'persp', pxW: number, pxH: number): string | null {
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
    const { group, zMin, step } = terrainGroup(d, model);
    scene.add(group);
    for (const it of model.items) {
      const g = elementGroup(it.e.id, it.s, model.terrain, step).clone();
      g.traverse((o) => { o.visible = true; }); // the live 3D view may have hidden them behind its batch
      scene.add(g);
    }
    const { c, R } = siteBounds(model, zMin);
    setupLights(scene, c, R, { az: 210, alt: 50 }, true);
    const aspect = pxW / pxH;
    const dir = presetDir(view);
    let camera: THREE.Camera;
    if (view === 'persp') {
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

/**
 * Big projects: one mesh per material for the whole site instead of a few meshes per element, so the GPU gets
 * a handful of draw calls. The element groups stay in the scene, hidden, for picking and selection boxes.
 */
const mat0 = (m: THREE.Mesh) => (Array.isArray(m.material) ? m.material[0] : m.material);

export function batchGroup(content: THREE.Group): THREE.Group {
  content.updateMatrixWorld(true);
  const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
  for (const g of content.children) for (const o of g.children) {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.userData.batchable) continue;
    const src = mesh.geometry;
    const clean = new THREE.BufferGeometry();
    clean.setAttribute('position', src.getAttribute('position').clone());
    if (src.getAttribute('normal')) clean.setAttribute('normal', src.getAttribute('normal').clone());
    else clean.computeVertexNormals();
    if (src.getAttribute('uv') && (mat0(mesh) as THREE.MeshStandardMaterial).map) clean.setAttribute('uv', src.getAttribute('uv').clone());
    if (src.index) clean.setIndex(src.index.clone());
    const geo = clean.index ? clean.toNonIndexed() : clean;
    geo.applyMatrix4(mesh.matrixWorld);
    const mat = mesh.material as THREE.Material;
    if (!byMat.has(mat)) byMat.set(mat, []);
    byMat.get(mat)!.push(geo);
    mesh.visible = false;
  }
  const out = new THREE.Group();
  out.userData.batch = true;
  for (const [mat, geos] of byMat) {
    const merged = mergeGeometries(geos, false);
    geos.forEach((x) => x.dispose());
    if (!merged) continue;
    const m = new THREE.Mesh(merged, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    out.add(m);
  }
  return out;
}

/** Shows the element meshes again and removes the batch (before a change is drawn). */
export function unbatch(content: THREE.Group, batch: THREE.Group | null) {
  if (batch) { batch.parent?.remove(batch); batch.traverse((o) => (o as THREE.Mesh).geometry?.dispose()); }
  for (const g of content.children) for (const o of g.children) if (o.userData.batchable) o.visible = true;
}

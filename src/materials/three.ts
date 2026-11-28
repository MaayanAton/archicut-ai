// Three.js materials of 4.0 finishes: one canvas texture per pattern (cached and shared), with the finish's
// roughness, metalness and transparency. Texture coordinates are in "repeats" (see repeatMM).

import * as THREE from 'three';
import { resolveFinish, type FinishLike } from './finish';
import { drawTexture, repeatMM, texKey, type TexSpec } from './texture';

const texCache = new Map<string, THREE.Texture>();
const matCache = new Map<string, THREE.Material>();

/** Local images of the open project (custom wallpapers), by id → data URL. Set by the views. */
let images = new Map<string, string>();
export function setCustomImages(list: { id: string; dataUrl: string }[] | undefined) {
  images = new Map((list ?? []).map((i) => [i.id, i.dataUrl]));
}

/** Views that must redraw when an image texture finishes loading. */
const listeners = new Set<() => void>();
export function onTextureLoaded(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }

function canvasTexture(spec: TexSpec, maxPx: number): THREE.Texture | null {
  const key = `${texKey(spec)}|${maxPx}`;
  const hit = texCache.get(key);
  if (hit) return hit;
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  drawTexture(c, spec, maxPx);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.generateMipmaps = true;
  if (texCache.size > 160) {
    // Unused textures are released (oldest first); materials using them are dropped from the cache too.
    for (const [k, v] of texCache) { texCache.delete(k); v.dispose(); if (texCache.size < 110) break; }
    for (const [k, m] of matCache) { const mm = m as THREE.MeshStandardMaterial; if (mm.map && !(mm.map.image instanceof HTMLImageElement) && ![...texCache.values()].includes(mm.map)) { matCache.delete(k); m.dispose(); } }
  }
  texCache.set(key, t);
  return t;
}

function imageTexture(id: string): THREE.Texture | null {
  const url = images.get(id);
  if (!url || typeof document === 'undefined') return null;
  const key = `img|${id}|${url.length}`;
  const hit = texCache.get(key);
  if (hit) return hit;
  const t = new THREE.TextureLoader().load(url, () => { for (const f of listeners) f(); });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, t);
  return t;
}

/** Quality of textures: 'high' draws 512 px per repeat, 'basic' 256 px. */
let quality: 'basic' | 'high' = 'high';
export function setTextureQuality(q: 'basic' | 'high') { quality = q; }

/** Material of a finish for the 3D model. */
export function finishMaterial(f: FinishLike, side: THREE.Side = THREE.FrontSide): THREE.Material {
  const r = resolveFinish(f);
  const key = `${texKey(r.spec)}|${r.rough}|${r.metal}|${r.opacity}|${r.img ?? ''}|${quality}|${side}|${r.textured}`;
  const hit = matCache.get(key);
  if (hit) return hit;
  const map = r.img ? imageTexture(r.img) : r.textured ? canvasTexture(r.spec, quality === 'high' ? 512 : 256) : null;
  const clear = r.opacity < 0.99;
  const m = new THREE.MeshStandardMaterial({
    color: map ? 0xffffff : r.spec.color,
    map,
    roughness: r.rough,
    metalness: r.metal,
    transparent: clear,
    opacity: r.opacity,
    depthWrite: !clear,
    side: clear ? THREE.DoubleSide : side,
  });
  matCache.set(key, m);
  return m;
}

/** Size of one texture repeat of a finish, mm (for texture coordinates); images use the finish's tile size. */
export function finishRepeat(f: FinishLike): { w: number; h: number } {
  const r = resolveFinish(f);
  if (r.img) return { w: r.spec.tw, h: r.spec.th };
  return repeatMM(r.spec);
}

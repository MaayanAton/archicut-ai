import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { useStore } from '../../document/store';
import type { Project } from '../../document/types';
import { v2 } from '../../geometry/vec';
import { Check, Seg } from '../common';
import { Icons } from '../icons';
import type { SiteData, SiteElement } from '../../site/types';
import type { SiteModel } from '../../site/section';
import { elementGroup, presetDir, setupLights, siteBounds, terrainGroup, type ViewPreset } from '../../site/three';
import { translateEl } from '../../site/edit';
import { baseLevel } from '../../site/prims';
import { fmtLevel } from '../../site/units';
import { lib } from '../../site/library';
import { useSiteUi } from './siteUi';

type SProject = Extract<Project, { type: 'site' }>;

interface St {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  persp: THREE.PerspectiveCamera;
  ortho: THREE.OrthographicCamera;
  camera: THREE.Camera;
  controls: OrbitControls;
  content: THREE.Group;
  terrain: THREE.Group | null;
  lights: THREE.Object3D[];
  selBox: THREE.Box3Helper | null;
  render: () => void;
  bounds: { c: THREE.Vector3; R: number };
}

const PRESETS: { v: ViewPreset; label: string }[] = [
  { v: 'iso', label: 'איזומטרי' },
  { v: 'top', label: 'מבט על' },
  { v: 'south', label: 'מדרום' },
  { v: 'north', label: 'מצפון' },
  { v: 'east', label: 'ממזרח' },
  { v: 'west', label: 'ממערב' },
];

export function Site3D({ project, model, setData, compact = false }: { project: SProject; model: SiteModel; setData: (fn: (d: SiteData) => SiteData, record?: boolean) => void; compact?: boolean }) {
  const d = project.data;
  const host = useRef<HTMLDivElement>(null);
  const st = useRef<St | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [proj, setProj] = useState<'persp' | 'ortho'>('persp');
  const [preset, setPreset] = useState<ViewPreset>('iso');
  const [shadows, setShadows] = useState(true);
  const [sun, setSun] = useState({ az: 210, alt: 50 });
  const [walk, setWalk] = useState(false);
  const sel = useSiteUi((s) => s.sel);
  const dataRef = useRef(d);
  dataRef.current = d;
  const modelRef = useRef(model);
  modelRef.current = model;
  const walkRef = useRef({ on: false, yaw: 0, pitch: 0, pos: new THREE.Vector3(), keys: new Set<string>() });

  // ---------- renderer, once ----------
  useEffect(() => {
    const el = host.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    } catch {
      setError('המכשיר לא תומך בתצוגה תלת־ממדית (WebGL). התוכנית, החתכים והגיליונות ממשיכים לעבוד.');
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0xeef1f4);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const persp = new THREE.PerspectiveCamera(45, 1, 10, 1e7);
    persp.up.set(0, 0, 1);
    const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, -1e7, 1e7);
    ortho.up.set(0, 0, 1);
    const content = new THREE.Group();
    scene.add(content);
    const s: St = { renderer, scene, persp, ortho, camera: persp, controls: null as unknown as OrbitControls, content, terrain: null, lights: [], selBox: null, render: () => {}, bounds: { c: new THREE.Vector3(), R: 10000 } };
    s.render = () => renderer.render(scene, s.camera);
    st.current = s;

    // Selecting and moving elements. Registered before OrbitControls so a drag on the selection does not orbit.
    const ray = new THREE.Raycaster();
    const ndc = (ev: PointerEvent) => { const r = renderer.domElement.getBoundingClientRect(); return new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1); };
    const pick = (ev: PointerEvent): string | null => {
      ray.setFromCamera(ndc(ev), s.camera);
      const hit = ray.intersectObjects(content.children, true).find((h) => h.object.userData.id);
      return hit ? (hit.object.userData.id as string) : null;
    };
    let down: { x: number; y: number; id: string | null; drag: null | { plane: THREE.Plane; start: THREE.Vector3; orig: SiteElement[]; moved: boolean } } | null = null;
    const onDown = (ev: PointerEvent) => {
      if (walkRef.current.on) { down = { x: ev.clientX, y: ev.clientY, id: null, drag: null }; return; }
      const id = pick(ev);
      down = { x: ev.clientX, y: ev.clientY, id, drag: null };
      const selNow = useSiteUi.getState().sel;
      if (id && selNow.includes(id) && ev.button === 0) {
        const els = dataRef.current.elements.filter((e) => selNow.includes(e.id));
        const z = baseLevel(els[0], modelRef.current.terrain);
        const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -z);
        ray.setFromCamera(ndc(ev), s.camera);
        const start = new THREE.Vector3();
        if (ray.ray.intersectPlane(plane, start)) {
          down.drag = { plane, start, orig: els, moved: false };
          s.controls.enabled = false;
          renderer.domElement.setPointerCapture(ev.pointerId);
        }
      }
    };
    const onMove = (ev: PointerEvent) => {
      const w = walkRef.current;
      if (w.on && down && ev.buttons) {
        w.yaw -= (ev.movementX || 0) * 0.004;
        w.pitch = Math.max(-1.2, Math.min(1.2, w.pitch - (ev.movementY || 0) * 0.004));
        updateWalkCamera();
        return;
      }
      if (!down?.drag) return;
      ray.setFromCamera(ndc(ev), s.camera);
      const p = new THREE.Vector3();
      if (!ray.ray.intersectPlane(down.drag.plane, p)) return;
      let dx = p.x - down.drag.start.x, dy = p.y - down.drag.start.y;
      const dd = dataRef.current;
      if (dd.grid.snap && !ev.altKey) { const g = dd.grid.size; dx = Math.round(dx / g) * g; dy = Math.round(dy / g) * g; }
      if (!down.drag.moved) { if (Math.hypot(ev.clientX - down.x, ev.clientY - down.y) < 4) return; down.drag.moved = true; useStore.getState().checkpoint(project.id); }
      const moved = new Map(down.drag.orig.map((o) => [o.id, translateEl(o, v2(dx, dy))]));
      setData((x) => ({ ...x, elements: x.elements.map((e) => moved.get(e.id) ?? e) }), false);
    };
    const onUp = (ev: PointerEvent) => {
      if (!down) return;
      const wasDrag = down.drag?.moved;
      const click = Math.hypot(ev.clientX - down.x, ev.clientY - down.y) < 5;
      s.controls.enabled = !walkRef.current.on;
      if (!wasDrag && click && !walkRef.current.on) {
        const id = down.id;
        const ui = useSiteUi.getState();
        if (ev.shiftKey && id) ui.select(ui.sel.includes(id) ? ui.sel.filter((x) => x !== id) : [...ui.sel, id]);
        else ui.select(id ? [id] : []);
      }
      down = null;
    };
    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointermove', onMove);
    renderer.domElement.addEventListener('pointerup', onUp);
    renderer.domElement.addEventListener('pointercancel', onUp);

    const controls = new OrbitControls(persp, renderer.domElement);
    controls.enableDamping = false;
    controls.screenSpacePanning = true;
    controls.addEventListener('change', s.render);
    s.controls = controls;

    const updateWalkCamera = () => {
      const w = walkRef.current;
      const cam = s.persp;
      cam.position.copy(w.pos);
      const dir = new THREE.Vector3(Math.cos(w.pitch) * Math.cos(w.yaw), Math.cos(w.pitch) * Math.sin(w.yaw), Math.sin(w.pitch));
      cam.lookAt(w.pos.clone().add(dir));
      s.render();
    };
    (s as St & { updateWalk?: () => void }).updateWalk = updateWalkCamera;

    let raf = 0;
    const tick = () => {
      const w = walkRef.current;
      if (w.on && w.keys.size) {
        const speed = 60; // mm per frame ≈ 3.6 km/h at 60 fps
        const f = new THREE.Vector3(Math.cos(w.yaw), Math.sin(w.yaw), 0), r = new THREE.Vector3(Math.sin(w.yaw), -Math.cos(w.yaw), 0);
        if (w.keys.has('f')) w.pos.addScaledVector(f, speed);
        if (w.keys.has('b')) w.pos.addScaledVector(f, -speed);
        if (w.keys.has('r')) w.pos.addScaledVector(r, speed);
        if (w.keys.has('l')) w.pos.addScaledVector(r, -speed);
        if (w.keys.has('tl')) w.yaw += 0.03;
        if (w.keys.has('tr')) w.yaw -= 0.03;
        w.pos.z = modelRef.current.terrain.z(v2(w.pos.x, w.pos.y)) + 1600;
        updateWalkCamera();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const keyMap: Record<string, string> = { ArrowUp: 'f', KeyW: 'f', ArrowDown: 'b', KeyS: 'b', KeyA: 'l', KeyD: 'r', ArrowLeft: 'tl', ArrowRight: 'tr', KeyQ: 'tl', KeyE: 'tr' };
    const kd = (e: KeyboardEvent) => { if (!walkRef.current.on) return; const k = keyMap[e.code]; if (k) { walkRef.current.keys.add(k); e.preventDefault(); } };
    const ku = (e: KeyboardEvent) => { const k = keyMap[e.code]; if (k) walkRef.current.keys.delete(k); };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);

    const ro = new ResizeObserver(() => resize());
    const resize = () => {
      const w = el.clientWidth, h = el.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      persp.aspect = w / h;
      persp.updateProjectionMatrix();
      const r = s.bounds.R * 0.8 * Math.max(1, h / w);
      ortho.left = (-r * w) / h; ortho.right = (r * w) / h; ortho.top = r; ortho.bottom = -r;
      ortho.updateProjectionMatrix();
      s.render();
    };
    ro.observe(el);
    resize();
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      controls.dispose();
      renderer.dispose();
      el.innerHTML = '';
      st.current = null;
    };
  }, [project.id, setData]);

  // ---------- content: rebuild what changed ----------
  const lastTerrain = useRef<unknown>(null);
  const fitted = useRef(false);
  useEffect(() => {
    const s = st.current;
    if (!s) return;
    let tg: ReturnType<typeof terrainGroup> | null = null;
    if (lastTerrain.current !== model.terrain || !s.terrain) {
      if (s.terrain) { s.scene.remove(s.terrain); s.terrain.traverse((o) => (o as THREE.Mesh).geometry?.dispose()); }
      tg = terrainGroup(d, model);
      s.terrain = tg.group;
      s.terrain.userData.step = tg.step;
      s.terrain.userData.zMin = tg.zMin;
      s.scene.add(s.terrain);
      lastTerrain.current = model.terrain;
    }
    const step = s.terrain.userData.step as number;
    const keep = new Set<THREE.Object3D>();
    for (const it of model.items) {
      const g = elementGroup(it.e.id, it.s, model.terrain, step);
      keep.add(g);
      if (g.parent !== s.content) s.content.add(g);
    }
    for (const c of s.content.children.slice()) if (!keep.has(c)) { s.content.remove(c); c.traverse((o) => (o as THREE.Mesh).geometry?.dispose()); }
    const b = siteBounds(model, s.terrain.userData.zMin as number);
    s.bounds = { c: b.c, R: b.R };
    if (tg || !s.lights.length) {
      for (const l of s.lights) s.scene.remove(l);
      const before = s.scene.children.length;
      setupLights(s.scene, b.c, b.R, sun, shadows);
      s.lights = s.scene.children.slice(before);
      s.renderer.shadowMap.needsUpdate = true;
    }
    if (!fitted.current) { fitted.current = true; applyPreset('iso'); }
    s.render();
  }, [model, d]); // eslint-disable-line react-hooks/exhaustive-deps

  // Lights and shadows.
  useEffect(() => {
    const s = st.current;
    if (!s) return;
    for (const l of s.lights) s.scene.remove(l);
    const before = s.scene.children.length;
    setupLights(s.scene, s.bounds.c, s.bounds.R, sun, shadows);
    s.lights = s.scene.children.slice(before);
    s.renderer.shadowMap.enabled = shadows;
    s.scene.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m) m.needsUpdate = true; });
    s.render();
  }, [sun, shadows]);

  // Selection box.
  useEffect(() => {
    const s = st.current;
    if (!s) return;
    if (s.selBox) { s.scene.remove(s.selBox); s.selBox = null; }
    const groups = s.content.children.filter((g) => sel.includes(g.userData.id));
    if (groups.length) {
      const box = new THREE.Box3();
      for (const g of groups) box.expandByObject(g);
      s.selBox = new THREE.Box3Helper(box, new THREE.Color(0xe8590c));
      s.scene.add(s.selBox);
    }
    s.render();
  }, [sel, model]);

  const applyPreset = (v: ViewPreset, which = proj) => {
    const s = st.current;
    if (!s) return;
    setPreset(v);
    const { c, R } = s.bounds;
    const dir = presetDir(v);
    const cam = which === 'persp' ? s.persp : s.ortho;
    s.camera = cam;
    s.controls.object = cam;
    if (which === 'persp') {
      // Fit the site in the narrower of the two fields of view, so it is whole on a phone held upright too.
      const el = host.current!;
      const aspect = (el.clientWidth || 1) / (el.clientHeight || 1);
      const half = Math.min(THREE.MathUtils.degToRad(22.5), Math.atan(Math.tan(THREE.MathUtils.degToRad(22.5)) * aspect));
      cam.position.copy(c).addScaledVector(dir, (R * 0.85) / Math.sin(half));
    }
    else {
      cam.position.copy(c).addScaledVector(dir, R * 4);
      s.ortho.zoom = 1;
      const el = host.current!;
      const w = el.clientWidth || 1, h = el.clientHeight || 1;
      const r = R * 0.8 * Math.max(1, h / w);
      s.ortho.left = (-r * w) / h; s.ortho.right = (r * w) / h; s.ortho.top = r; s.ortho.bottom = -r;
      s.ortho.updateProjectionMatrix();
    }
    s.controls.target.copy(c);
    s.controls.update();
    s.render();
  };

  const startWalk = () => {
    const s = st.current;
    if (!s) return;
    const w = walkRef.current;
    if (walk) { w.on = false; setWalk(false); s.controls.enabled = true; applyPreset(preset, proj); return; }
    setProj('persp');
    s.camera = s.persp;
    s.controls.enabled = false;
    w.on = true;
    const dom = model.terrain.domain;
    w.pos.set(dom.minX + (dom.maxX - dom.minX) * 0.5, dom.minY + 1500, 0);
    w.pos.z = model.terrain.z(v2(w.pos.x, w.pos.y)) + 1600;
    w.yaw = Math.PI / 2;
    w.pitch = -0.05;
    setWalk(true);
    (s as St & { updateWalk?: () => void }).updateWalk?.();
  };
  const hold = (k: string) => ({
    onPointerDown: (e: React.PointerEvent) => { e.preventDefault(); walkRef.current.keys.add(k); },
    onPointerUp: () => walkRef.current.keys.delete(k),
    onPointerLeave: () => walkRef.current.keys.delete(k),
  });

  const selEl = sel.length === 1 ? d.elements.find((e) => e.id === sel[0]) : null;

  return (
    <div className="stage-col three-stage">
      {!compact && (
        <div className="toolbar view3d-bar" role="toolbar" aria-label="מבטים">
          <Seg value={proj} options={[{ v: 'persp', label: 'פרספקטיבה' }, { v: 'ortho', label: 'מקבילי' }]} onChange={(v) => { setProj(v); if (walk) { walkRef.current.on = false; setWalk(false); } applyPreset(preset, v); }} ariaLabel="סוג הטלה" />
          <Seg value={preset} options={PRESETS.map((p) => ({ v: p.v, label: p.label }))} onChange={(v) => { if (walk) { walkRef.current.on = false; setWalk(false); if (st.current) st.current.controls.enabled = true; } applyPreset(v); }} ariaLabel="מבט" />
          <button className={`btn sm ${walk ? 'active' : ''}`} aria-pressed={walk} onClick={startWalk}>{Icons.walk} סיור בגובה העיניים</button>
          <Check checked={shadows} onChange={setShadows}>צללים</Check>
          <label className="sun"><span className="small">כיוון שמש</span><input type="range" min={0} max={359} value={sun.az} aria-label="כיוון השמש" onChange={(e) => setSun({ ...sun, az: Number(e.target.value) })} /></label>
          <label className="sun"><span className="small">גובה שמש</span><input type="range" min={5} max={89} value={sun.alt} aria-label="גובה השמש" onChange={(e) => setSun({ ...sun, alt: Number(e.target.value) })} /></label>
        </div>
      )}
      <div className="three-wrap">
        <div className="three-host" ref={host} data-testid="site-3d" />
        {error && <div className="notice warn" style={{ margin: 16, position: 'relative' }}>{Icons.warn}<span>{error}</span></div>}
        {walk && (
          <div className="walk-pad" aria-label="שליטה בסיור">
            <button className="btn icon" aria-label="פנייה שמאלה" {...hold('tl')}>↶</button>
            <button className="btn icon" aria-label="קדימה" {...hold('f')}>▲</button>
            <button className="btn icon" aria-label="פנייה ימינה" {...hold('tr')}>↷</button>
            <button className="btn icon" aria-label="צעד שמאלה" {...hold('l')}>◀</button>
            <button className="btn icon" aria-label="אחורה" {...hold('b')}>▼</button>
            <button className="btn icon" aria-label="צעד ימינה" {...hold('r')}>▶</button>
          </div>
        )}
        <div className="three-hint small">
          {walk ? 'סיור: חיצים או W/A/S/D להליכה, Q/E לפנייה, גרירה להסתכלות. גובה העיניים 1.60 מ׳ מעל הקרקע.' : 'גרירה: סיבוב · גלגלת/צביטה: זום · קליק ימני או שתי אצבעות: הזזה · לחיצה: בחירה · גרירת אלמנט נבחר: הזזה'}
          {selEl && !walk && <> · נבחר: {selEl.name || lib(selEl.kind).label} ({fmtLevel(baseLevel(selEl, model.terrain))})</>}
        </div>
      </div>
    </div>
  );
}

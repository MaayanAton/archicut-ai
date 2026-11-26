import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Polyhedron } from '../../geometry/solids';
import type { Plane, SectionResult } from '../../geometry/section';
import { planeBasis } from '../../geometry/section';
import { Icons } from '../icons';

interface Props {
  poly: Polyhedron | null;
  plane: Plane;
  section: SectionResult | null;
  radius: number;
  showRemoved: boolean;
  /** When this changes (solid type, plane orientation) the camera returns to the starting view. */
  viewKey: string;
}

/** Distance at which a sphere of radius R fills the view with a margin, for the current aspect ratio. */
function fitDistance(camera: THREE.PerspectiveCamera, R: number) {
  const halfV = THREE.MathUtils.degToRad(camera.fov / 2);
  const halfH = Math.atan(Math.tan(halfV) * camera.aspect);
  return (R * 1.2) / Math.sin(Math.min(halfV, halfH));
}

/** Starting view direction: from the front-right-top, on the side of the removed part so the cut face is visible. */
function startDirection(n: { x: number; y: number; z: number }) {
  const v = new THREE.Vector3(2.2, 3.2, 2.0).normalize();
  const nn = new THREE.Vector3(n.x, n.y, n.z).normalize();
  let d = v.dot(nn);
  if (d < 0) { v.addScaledVector(nn, -2 * d); d = -d; }
  if (d < 0.35) v.addScaledVector(nn, 0.35 - d);
  return v.normalize();
}

function polyGeometry(poly: Polyhedron): THREE.BufferGeometry {
  const pos: number[] = [];
  for (const f of poly.faces) {
    const a = poly.vertices[f[0]];
    for (let i = 1; i < f.length - 1; i++) {
      const b = poly.vertices[f[i]], c = poly.vertices[f[i + 1]];
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** Three.js only displays what the geometry engine computed: the cap is the engine's section polygon. */
export function Section3D({ poly, plane, section, radius, showRemoved, viewKey }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const st = useRef<{
    renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; controls: OrbitControls;
    group: THREE.Group; keepPlane: THREE.Plane; cutPlane: THREE.Plane; render: () => void; resetView: () => void;
  } | null>(null);
  const view = useRef({ R: 100, n: { x: 0, y: 0, z: 1 }, userMoved: false });
  view.current.R = Math.max(radius, 1);
  view.current.n = plane.n;
  const errorRef = useRef<string | null>(null);

  // Set up renderer once.
  useEffect(() => {
    const el = host.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    } catch {
      errorRef.current = 'המכשיר לא תומך בתצוגה תלת-ממדית (WebGL). החישוב והשרטוט הדו-ממדי של החתך ממשיכים לעבוד.';
      el.innerHTML = `<div class="notice warn" style="margin:16px">${errorRef.current}</div>`;
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.localClippingEnabled = true;
    renderer.setClearColor(0xf7f6f2);
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 1, 100000);
    camera.up.set(0, 0, 1);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa0aa, 1.6));
    const dir = new THREE.DirectionalLight(0xffffff, 1.6);
    dir.position.set(1, 2, 3);
    scene.add(dir);
    const dir2 = new THREE.DirectionalLight(0xffffff, 0.6);
    dir2.position.set(-2, -1, 1);
    scene.add(dir2);
    const group = new THREE.Group();
    scene.add(group);
    const render = () => renderer.render(scene, camera);
    controls.addEventListener('change', render);
    controls.addEventListener('start', () => { view.current.userMoved = true; });
    const resetView = () => {
      const { R, n } = view.current;
      camera.near = R / 50;
      camera.far = R * 100;
      camera.position.copy(startDirection(n).multiplyScalar(fitDistance(camera, R)));
      camera.updateProjectionMatrix();
      controls.target.set(0, 0, 0);
      controls.update();
      view.current.userMoved = false;
      render();
    };
    const resize = () => {
      const w = el.clientWidth, h = el.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      if (!view.current.userMoved) resetView();
      else render();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    st.current = { renderer, scene, camera, controls, group, keepPlane: new THREE.Plane(), cutPlane: new THREE.Plane(), render, resetView };
    resize();
    return () => {
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      el.innerHTML = '';
      st.current = null;
    };
  }, []);

  // Return to the starting view when the solid's size, type or plane orientation changes.
  useEffect(() => {
    st.current?.resetView();
  }, [radius, viewKey]);

  // Rebuild the scene content.
  useEffect(() => {
    const s = st.current;
    if (!s) return;
    const g = s.group;
    g.children.slice().forEach((c) => {
      g.remove(c);
      (c as THREE.Mesh).geometry?.dispose();
    });
    // Keep the side where n·p <= d; three.js keeps fragments with normal·p + constant >= 0.
    s.keepPlane.set(new THREE.Vector3(-plane.n.x, -plane.n.y, -plane.n.z), plane.d);
    s.cutPlane.set(new THREE.Vector3(plane.n.x, plane.n.y, plane.n.z), -plane.d);
    const R = Math.max(radius, 1);

    if (poly) {
      const geo = polyGeometry(poly);
      const mat = new THREE.MeshStandardMaterial({ color: 0xc9d6f0, roughness: 0.7, metalness: 0, flatShading: poly.vertices.length < 100, clippingPlanes: [s.keepPlane], side: THREE.DoubleSide });
      g.add(new THREE.Mesh(geo, mat));
      const edges = new THREE.EdgesGeometry(geo, 25);
      g.add(new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x24324d, clippingPlanes: [s.keepPlane] })));
      if (showRemoved) {
        const ghost = new THREE.MeshBasicMaterial({ color: 0x8aa0c8, transparent: true, opacity: 0.12, depthWrite: false, clippingPlanes: [s.cutPlane], side: THREE.DoubleSide });
        g.add(new THREE.Mesh(geo.clone(), ghost));
        g.add(new THREE.LineSegments(edges.clone(), new THREE.LineBasicMaterial({ color: 0x8aa0c8, transparent: true, opacity: 0.45, clippingPlanes: [s.cutPlane] })));
      }
    }

    // Section face computed by the geometry engine.
    if (section?.kind === 'polygon') {
      const pts = section.pts3;
      const pos: number[] = [];
      for (let i = 1; i < pts.length - 1; i++) pos.push(pts[0].x, pts[0].y, pts[0].z, pts[i].x, pts[i].y, pts[i].z, pts[i + 1].x, pts[i + 1].y, pts[i + 1].z);
      const cg = new THREE.BufferGeometry();
      cg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.add(new THREE.Mesh(cg, new THREE.MeshBasicMaterial({ color: 0xf08a3c, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })));
      const outline = new THREE.BufferGeometry().setFromPoints([...pts, pts[0]].map((p) => new THREE.Vector3(p.x, p.y, p.z)));
      g.add(new THREE.Line(outline, new THREE.LineBasicMaterial({ color: 0x9a3b00 })));
    } else if (section?.kind === 'segment') {
      const lg = new THREE.BufferGeometry().setFromPoints([section.a3, section.b3].map((p) => new THREE.Vector3(p.x, p.y, p.z)));
      g.add(new THREE.Line(lg, new THREE.LineBasicMaterial({ color: 0xd9480f })));
    } else if (section?.kind === 'point') {
      const sg = new THREE.SphereGeometry(R / 60, 12, 8);
      const m = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ color: 0xd9480f }));
      m.position.set(section.point3.x, section.point3.y, section.point3.z);
      g.add(m);
    }

    // The cutting plane itself.
    const b = planeBasis(plane);
    const size = R * 1.5;
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, c]) =>
      new THREE.Vector3(b.origin.x + (b.u.x * a + b.v.x * c) * size, b.origin.y + (b.u.y * a + b.v.y * c) * size, b.origin.z + (b.u.z * a + b.v.z * c) * size));
    const pg = new THREE.BufferGeometry().setFromPoints([corners[0], corners[1], corners[2], corners[0], corners[2], corners[3]]);
    g.add(new THREE.Mesh(pg, new THREE.MeshBasicMaterial({ color: 0xf2a65a, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false })));
    const pe = new THREE.BufferGeometry().setFromPoints([...corners, corners[0]]);
    g.add(new THREE.Line(pe, new THREE.LineBasicMaterial({ color: 0xd9480f, transparent: true, opacity: 0.6 })));

    // Axes: X red, Y green, Z blue.
    const ax = new THREE.AxesHelper(R * 0.6);
    ax.position.set(-R * 1.2, -R * 1.2, -R * 0.9);
    g.add(ax);
    s.render();
  }, [poly, plane, section, radius, showRemoved]);

  return (
    <>
      <div className="three-host" ref={host} data-testid="three-view" />
      <div className="canvas-tools">
        <button className="btn icon sm" aria-label="חזרה למבט ההתחלתי" title="חזרה למבט ההתחלתי" onClick={() => st.current?.resetView()}>{Icons.fit}</button>
      </div>
    </>
  );
}

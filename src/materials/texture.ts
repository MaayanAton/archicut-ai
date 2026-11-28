// Procedural textures of the material catalogue, drawn on a canvas by code (no image files, nothing downloaded).
// One canvas = one repeat of the pattern; its physical size in millimetres (repeatMM) is what the 3D model's
// texture coordinates use, so a 600 × 600 tile is drawn exactly 600 × 600 mm in the model.

import type { Layout, PatternId } from './catalog';

export interface TexSpec {
  pattern: PatternId;
  color: string;
  color2: string;
  grout: string;
  /** Joint width, mm. */
  groutW: number;
  layout: Layout;
  /** Tile / plank / pattern size, mm. */
  tw: number;
  th: number;
}

// ---------------------------------------------------------------- colour helpers

function rgb(hex: string): [number, number, number] {
  const h = /^#?([0-9a-f]{6})$/i.exec(hex)?.[1] ?? '999999';
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
const clamp = (x: number) => Math.max(0, Math.min(255, Math.round(x)));
const css = (c: [number, number, number], a = 1) => (a >= 1 ? `rgb(${clamp(c[0])},${clamp(c[1])},${clamp(c[2])})` : `rgba(${clamp(c[0])},${clamp(c[1])},${clamp(c[2])},${a})`);
/** Lighter (k > 0) or darker (k < 0) version of a colour; k in -1..1. */
function shade(c: [number, number, number], k: number): [number, number, number] {
  return k >= 0 ? [c[0] + (255 - c[0]) * k, c[1] + (255 - c[1]) * k, c[2] + (255 - c[2]) * k] : [c[0] * (1 + k), c[1] * (1 + k), c[2] * (1 + k)];
}
const mix = (a: [number, number, number], b: [number, number, number], t: number): [number, number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Deterministic pseudo-random numbers: the same material always looks the same. */
function rng(seed: number) {
  let s = (seed % 2147483646) + 1;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}
const hash2 = (a: number, b: number) => { let h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };

// ---------------------------------------------------------------- repeat sizes

const COS45 = Math.SQRT1_2;

/** Number of plank widths in a plank length for the herringbone and basket layouts (whole numbers tile exactly). */
export const plankRatio = (s: TexSpec) => Math.max(2, Math.min(12, Math.round(s.tw / Math.max(1, s.th))));

/** Physical size of one repeat of the texture, mm. */
export function repeatMM(s: TexSpec): { w: number; h: number } {
  const tw = Math.max(5, s.tw || 600), th = Math.max(5, s.th || 600);
  switch (s.pattern) {
    case 'plank': {
      if (s.layout === 'herringbone') { const n = plankRatio(s); return { w: 2 * n * th, h: 2 * n * th }; }
      if (s.layout === 'chevron') return { w: 2 * tw * COS45, h: (4 * th) / COS45 };
      if (s.layout === 'basket') { const n = plankRatio(s); return { w: 2 * n * th, h: 2 * n * th }; }
      if (s.layout === 'staggered') return { w: tw, h: 5 * th };
      return { w: tw, h: 2 * th };
    }
    case 'tile': case 'stone': case 'brick': case 'travertine': case 'granite': case 'marble': case 'tile-deco': case 'tile-geo': case 'tile-painted': case 'pavers': case 'acoustic': case 'terrazzo':
      return { w: 2 * tw, h: 2 * th };
    case 'hex': { const r = tw / 2; return { w: 3 * r, h: Math.sqrt(3) * r }; }
    default: return { w: tw, h: th };
  }
}

// ---------------------------------------------------------------- drawing

type G = CanvasRenderingContext2D;
interface Ctx { g: G; W: number; H: number; k: number; s: TexSpec; c1: [number, number, number]; c2: [number, number, number]; cg: [number, number, number]; rnd: () => number }

/** Draws `fn` once at each wrapped position so shapes crossing an edge continue on the other side (seamless repeat). */
function wrap(x: Ctx, cx: number, cy: number, r: number, fn: (dx: number, dy: number) => void) {
  for (const ox of [0, -x.W, x.W]) for (const oy of [0, -x.H, x.H]) {
    if (cx + ox + r < 0 || cx + ox - r > x.W || cy + oy + r < 0 || cy + oy - r > x.H) continue;
    fn(ox, oy);
  }
}

function speckle(x: Ctx, n: number, size: number, amp: number, col?: [number, number, number]) {
  for (let i = 0; i < n; i++) {
    const r = 0.5 + x.rnd() * size;
    x.g.fillStyle = css(col ?? shade(x.c1, (x.rnd() - 0.5) * amp), col ? 0.5 + x.rnd() * 0.5 : 1);
    x.g.fillRect(x.rnd() * x.W, x.rnd() * x.H, r, r);
  }
}

function blobs(x: Ctx, n: number, rMin: number, rMax: number, amp: number, alpha = 0.18) {
  for (let i = 0; i < n; i++) {
    const cx = x.rnd() * x.W, cy = x.rnd() * x.H, r = rMin + x.rnd() * (rMax - rMin);
    const col = shade(x.c1, (x.rnd() - 0.5) * amp);
    wrap(x, cx, cy, r, (ox, oy) => {
      const gr = x.g.createRadialGradient(cx + ox, cy + oy, 0, cx + ox, cy + oy, r);
      gr.addColorStop(0, css(col, alpha)); gr.addColorStop(1, css(col, 0));
      x.g.fillStyle = gr; x.g.fillRect(cx + ox - r, cy + oy - r, 2 * r, 2 * r);
    });
  }
}

/** Wood grain inside a rectangle (x, y, w, h) along its length (horizontal when horiz). */
function grain(x: Ctx, rx: number, ry: number, rw: number, rh: number, horiz: boolean, base: [number, number, number], seed: number) {
  const g = x.g;
  const r = rng(seed);
  g.fillStyle = css(base);
  g.fillRect(rx, ry, rw, rh);
  const L = horiz ? rw : rh, Wd = horiz ? rh : rw;
  const lines = Math.max(3, Math.round(Wd / 2.2));
  g.save();
  g.beginPath(); g.rect(rx, ry, rw, rh); g.clip();
  for (let i = 0; i < lines; i++) {
    const t = r() * Wd, amp = (r() - 0.5) * Wd * 0.25;
    g.strokeStyle = css(shade(base, (r() - 0.55) * 0.18), 0.55);
    g.lineWidth = 0.5 + r() * 1.2;
    g.beginPath();
    if (horiz) { g.moveTo(rx, ry + t); g.bezierCurveTo(rx + L * 0.3, ry + t + amp, rx + L * 0.7, ry + t - amp, rx + L, ry + t); }
    else { g.moveTo(rx + t, ry); g.bezierCurveTo(rx + t + amp, ry + L * 0.3, rx + t - amp, ry + L * 0.7, rx + t, ry + L); }
    g.stroke();
  }
  // A knot now and then.
  if (r() < 0.35) {
    const kx = horiz ? rx + r() * rw : rx + rw / 2, ky = horiz ? ry + rh / 2 : ry + r() * rh;
    g.strokeStyle = css(shade(base, -0.25), 0.6); g.lineWidth = 0.8;
    g.beginPath(); g.ellipse(kx, ky, horiz ? Wd * 0.35 : Wd * 0.2, horiz ? Wd * 0.2 : Wd * 0.35, 0, 0, Math.PI * 2); g.stroke();
  }
  g.restore();
}

function joint(x: Ctx): number { return Math.max(0.6, (x.s.groutW || 0) * x.k); }

function planks(x: Ctx) {
  const { g, W, H, k, s } = x;
  const L = s.tw * k, Wd = s.th * k, j = joint(x);
  const tone = (i: number) => shade(x.c1, (hash2(i, 7) - 0.5) * 0.16);
  const plank = (px: number, py: number, pw: number, ph: number, horiz: boolean, id: number) => {
    grain(x, px, py, pw, ph, horiz, tone(id), id * 31 + 5);
    g.fillStyle = css(x.cg, 0.85);
    if (horiz) { g.fillRect(px, py, pw, j * 0.6); g.fillRect(px, py, j * 0.8, ph); } else { g.fillRect(px, py, j * 0.6, ph); g.fillRect(px, py, pw, j * 0.8); }
  };
  if (s.layout === 'herringbone' || s.layout === 'basket') {
    // Pixel-exact layouts computed per plank cell.
    const n = plankRatio(s), u = W / (2 * n); // u = one plank width in pixels
    if (s.layout === 'basket') {
      for (let by = 0; by < 2; by++) for (let bx = 0; bx < 2; bx++) {
        const horiz = (bx + by) % 2 === 0;
        for (let i = 0; i < n; i++) {
          if (horiz) plank(bx * n * u, by * n * u + i * u, n * u, u, true, bx * 17 + by * 5 + i);
          else plank(bx * n * u + i * u, by * n * u, u, n * u, false, bx * 13 + by * 7 + i + 40);
        }
      }
      return;
    }
    // Herringbone: horizontal planks H_k = [k, k+n) × [k, k+1) and vertical planks V_k = [k+n, k+n+1) × [k-n+1, k+1),
    // repeated by the vectors (1, 1) and (n, -n); the canvas holds a 2n × 2n square (plank-width units).
    for (let b = -3; b <= 3; b++) for (let kk = -2 * n - 2; kk <= 4 * n + 2; kk++) {
      const ox = b * n, oy = -b * n;
      const hx = kk + ox, hy = kk + oy;
      const vx = kk + n + ox, vy = kk - n + 1 + oy;
      for (const [x0, y0, w0, h0, horiz] of [[hx, hy, n, 1, true], [vx, vy, 1, n, false]] as [number, number, number, number, boolean][]) {
        for (const wx of [0, -2 * n, 2 * n]) for (const wy of [0, -2 * n, 2 * n]) {
          const X = (x0 + wx) * u, Y = (y0 + wy) * u;
          if (X > W || Y > H || X + w0 * u < 0 || Y + h0 * u < 0) continue;
          plank(X, Y, w0 * u, h0 * u, horiz, Math.abs(kk * 7 + b * 3 + (horiz ? 0 : 50)));
        }
      }
    }
    return;
  }
  if (s.layout === 'chevron') {
    // Two columns of slanted planks; each plank is a parallelogram cut at 45°.
    const C = W / 2, P = H / 4; // column width, plank height measured vertically
    for (let col = 0; col < 2; col++) for (let i = -2; i < 6; i++) {
      const dir = col === 0 ? 1 : -1;
      const x0 = col * C, y0 = i * P;
      const base = tone(col * 11 + ((i + 8) % 4));
      g.save();
      g.beginPath();
      const yA = (xx: number) => y0 + (dir === 1 ? (xx - x0) : (x0 + C - xx));
      g.moveTo(x0, yA(x0)); g.lineTo(x0 + C, yA(x0 + C)); g.lineTo(x0 + C, yA(x0 + C) + P); g.lineTo(x0, yA(x0) + P); g.closePath();
      g.clip();
      g.fillStyle = css(base); g.fillRect(x0, y0 - C, C, P + 2 * C);
      const rr = rng(col * 97 + i * 13 + 3);
      for (let l = 0; l < 8; l++) { const t = rr() * P; g.strokeStyle = css(shade(base, (rr() - 0.55) * 0.18), 0.5); g.lineWidth = 0.6 + rr(); g.beginPath(); g.moveTo(x0, yA(x0) + t); g.lineTo(x0 + C, yA(x0 + C) + t); g.stroke(); }
      g.restore();
      g.strokeStyle = css(x.cg, 0.85); g.lineWidth = j * 0.7;
      g.beginPath(); g.moveTo(x0, yA(x0)); g.lineTo(x0 + C, yA(x0 + C)); g.stroke();
    }
    g.fillStyle = css(x.cg, 0.85); g.fillRect(C - j * 0.4, 0, j * 0.8, H); g.fillRect(0, 0, j * 0.6, H);
    return;
  }
  const rows = Math.round(H / Wd);
  const offs = s.layout === 'staggered' ? [0, 0.4, 0.75, 0.2, 0.6] : [0, 0.5];
  for (let r = 0; r < rows; r++) {
    const off = offs[r % offs.length] * L;
    for (let i = -1; i < 2; i++) plank(off + i * L, r * Wd, L, Wd, true, r * 5 + i + 2);
  }
}

function tiles(x: Ctx, motif?: (cx: number, cy: number, w: number, h: number, i: number) => void, variation = 0.05) {
  const { g, W, k, s } = x;
  const tw = s.tw * k, th = s.th * k, j = joint(x);
  const offset = s.layout === 'offset';
  for (let r = 0; r < 2; r++) for (let c = -1; c < 3; c++) {
    const X = c * tw + (offset && r % 2 ? tw / 2 : 0), Y = r * th;
    if (X >= W || X + tw <= 0) continue;
    const i = r * 2 + ((c + 2) % 2);
    const base = shade(x.c1, (hash2(i, 3) - 0.5) * variation);
    g.fillStyle = css(base); g.fillRect(X, Y, tw, th);
    if (s.pattern === 'stone' || s.pattern === 'travertine' || s.pattern === 'granite' || s.pattern === 'marble') {
      g.save(); g.beginPath(); g.rect(X, Y, tw, th); g.clip();
      motif?.(X, Y, tw, th, i);
      g.restore();
    } else motif?.(X, Y, tw, th, i);
    // A light bevel on the tile edges.
    g.fillStyle = css(shade(base, 0.08), 0.6); g.fillRect(X + j, Y + j, tw - j, Math.max(0.6, j * 0.4));
  }
  if (j > 0.3 && s.groutW > 0) {
    g.fillStyle = css(x.cg);
    for (let r = 0; r < 2; r++) {
      g.fillRect(0, r * th, W, j);
      for (let c = -1; c < 3; c++) { const X = c * tw + (offset && r % 2 ? tw / 2 : 0); g.fillRect(X, r * th, j, th); }
    }
  }
}

function marbleVeins(x: Ctx, X: number, Y: number, w: number, h: number, seed: number) {
  const g = x.g, r = rng(seed);
  for (let v = 0; v < 5; v++) {
    let px = X + r() * w, py = Y;
    g.strokeStyle = css(x.c2, 0.25 + r() * 0.4); g.lineWidth = 0.5 + r() * 1.8;
    g.beginPath(); g.moveTo(px, py);
    const steps = 12;
    for (let i = 0; i < steps; i++) { px += (r() - 0.45) * w * 0.22; py += h / steps; g.lineTo(px, py); }
    g.stroke();
  }
  blobs({ ...x, rnd: r }, 6, w * 0.1, w * 0.35, 0.12, 0.12);
}

function hexTiles(x: Ctx) {
  const { g, W, H, k, s } = x;
  const R = (s.tw / 2) * k, j = joint(x);
  const hx = 1.5 * R, hy = Math.sqrt(3) * R;
  const centers: [number, number][] = [];
  for (let i = -1; i <= 3; i++) for (let jj = -1; jj <= 2; jj++) centers.push([i * hx, jj * hy + (i % 2 ? hy / 2 : 0)]);
  g.fillStyle = css(x.cg); g.fillRect(0, 0, W, H);
  centers.forEach(([cx, cy], n) => {
    g.fillStyle = css(shade(x.c1, (hash2(n, 9) - 0.5) * 0.06));
    g.beginPath();
    for (let a = 0; a < 6; a++) { const t = (a * Math.PI) / 3; const rr = R - j / 2; g.lineTo(cx + rr * Math.cos(t), cy + rr * Math.sin(t)); }
    g.closePath(); g.fill();
  });
}

function mosaic(x: Ctx) {
  const { g, W, H } = x;
  const n = 10, cw = W / n, ch = H / n, j = Math.max(0.6, joint(x));
  g.fillStyle = css(x.cg); g.fillRect(0, 0, W, H);
  for (let i = 0; i < n; i++) for (let jj = 0; jj < n; jj++) {
    const t = hash2(i, jj);
    g.fillStyle = css(shade(mix(x.c1, x.c2, t < 0.4 ? 0 : t < 0.75 ? 0.5 : 1), (hash2(jj, i + 3) - 0.5) * 0.12));
    g.fillRect(i * cw + j / 2, jj * ch + j / 2, cw - j, ch - j);
  }
}

function decoMotif(x: Ctx, kind: 'deco' | 'geo' | 'painted') {
  const g = x.g;
  return (X: number, Y: number, w: number, h: number, i: number) => {
    const cx = X + w / 2, cy = Y + h / 2, R = Math.min(w, h) / 2;
    g.save();
    g.beginPath(); g.rect(X, Y, w, h); g.clip();
    g.fillStyle = css(x.c2); g.strokeStyle = css(x.c2); g.lineWidth = Math.max(1, R * 0.06);
    if (kind === 'deco') {
      // Encaustic-style tile: corner quarter circles, a central star and a ring.
      for (const [qx, qy] of [[X, Y], [X + w, Y], [X, Y + h], [X + w, Y + h]]) { g.beginPath(); g.arc(qx, qy, R * 0.45, 0, Math.PI * 2); g.fill(); }
      g.beginPath(); g.arc(cx, cy, R * 0.62, 0, Math.PI * 2); g.stroke();
      g.beginPath();
      for (let a = 0; a < 16; a++) { const rr = a % 2 ? R * 0.22 : R * 0.5; const t = (a * Math.PI) / 8; g.lineTo(cx + rr * Math.cos(t), cy + rr * Math.sin(t)); }
      g.closePath(); g.fill();
    } else if (kind === 'geo') {
      // Triangles turned by the tile index, so four tiles make a pattern.
      g.beginPath();
      const turn = i % 4;
      const pts: [number, number][] = [[X, Y], [X + w, Y], [X, Y + h], [X + w, Y + h]];
      const [a, b, c] = [pts[turn], pts[(turn + 1) % 4], pts[(turn + 3) % 4]];
      g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(c[0], c[1]); g.closePath(); g.fill();
    } else {
      // Painted tile: a flower made of petals and a border.
      g.strokeRect(X + w * 0.08, Y + h * 0.08, w * 0.84, h * 0.84);
      for (let a = 0; a < 6; a++) { const t = (a * Math.PI) / 3; g.beginPath(); g.ellipse(cx + Math.cos(t) * R * 0.32, cy + Math.sin(t) * R * 0.32, R * 0.22, R * 0.1, t, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = css(shade(x.c2, 0.45)); g.beginPath(); g.arc(cx, cy, R * 0.12, 0, Math.PI * 2); g.fill();
    }
    g.restore();
  };
}

function bricks(x: Ctx) {
  const { g, W, H, k, s } = x;
  const bw = s.tw * k, bh = s.th * k, j = Math.max(0.8, joint(x));
  g.fillStyle = css(x.cg); g.fillRect(0, 0, W, H);
  for (let r = 0; r < 2; r++) for (let c = -1; c < 3; c++) {
    const X = c * bw + (r % 2 ? bw / 2 : 0), Y = r * bh;
    const t = hash2(r * 5 + c, 11);
    const base = shade(mix(x.c1, x.c2, t * 0.6), (hash2(c, r + 7) - 0.5) * 0.15);
    g.fillStyle = css(base); g.fillRect(X + j / 2, Y + j / 2, bw - j, bh - j);
    const rr = rng(r * 31 + c * 7 + 9);
    for (let i = 0; i < 20; i++) { g.fillStyle = css(shade(base, (rr() - 0.5) * 0.2), 0.7); g.fillRect(X + j / 2 + rr() * (bw - j), Y + j / 2 + rr() * (bh - j), 1 + rr() * 2, 1 + rr() * 2); }
  }
}

function flagstone(x: Ctx) {
  // Irregular stones: a periodic Voronoi pattern of jittered points, joints where two stones meet.
  const { g, W, H, k, s } = x;
  const n = 4;
  const pts: [number, number, number][] = [];
  for (let i = 0; i < n; i++) for (let jj = 0; jj < n; jj++) pts.push([(i + 0.2 + hash2(i, jj) * 0.6) / n, (jj + 0.2 + hash2(jj + 9, i) * 0.6) / n, hash2(i + 3, jj + 5)]);
  const img = g.createImageData(W, H);
  const jw = ((s.groutW || 8) * k) / Math.max(W, H);
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
    const u = px / W, v = py / H;
    let d1 = 9, d2 = 9, t = 0;
    for (const [qx, qy, tt] of pts) for (const ox of [-1, 0, 1]) for (const oy of [-1, 0, 1]) {
      const dx = u - qx - ox, dy = v - qy - oy, dd = Math.sqrt(dx * dx + dy * dy);
      if (dd < d1) { d2 = d1; d1 = dd; t = tt; } else if (dd < d2) d2 = dd;
    }
    const c = d2 - d1 < jw ? x.cg : shade(x.c1, (t - 0.5) * 0.25 + (hash2(px, py) - 0.5) * 0.05);
    const o = (py * W + px) * 4;
    img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
}

function wallpaper(x: Ctx) {
  const { g, W, H, s } = x;
  const c2 = css(x.c2);
  const lw = Math.max(1, W / 160);
  switch (s.pattern) {
    case 'stripes-h': case 'stripes-v': {
      const horiz = s.pattern === 'stripes-h';
      const L = horiz ? H : W;
      const bands = [0, 0.18, 0.24, 0.5, 0.68, 0.74];
      for (let i = 0; i < bands.length; i += 2) {
        const a = bands[i] * L, b = (bands[i + 1] ?? 1) * L;
        g.fillStyle = i === 2 ? css(shade(x.c2, 0.35)) : c2;
        if (horiz) g.fillRect(0, a, W, b - a); else g.fillRect(a, 0, b - a, H);
      }
      return;
    }
    case 'wp-geo': {
      g.strokeStyle = c2; g.lineWidth = lw * 1.4;
      g.beginPath(); g.moveTo(W / 2, 0); g.lineTo(W, H / 2); g.lineTo(W / 2, H); g.lineTo(0, H / 2); g.closePath(); g.stroke();
      g.beginPath(); g.moveTo(W / 2, H * 0.25); g.lineTo(W * 0.75, H / 2); g.lineTo(W / 2, H * 0.75); g.lineTo(W * 0.25, H / 2); g.closePath(); g.stroke();
      return;
    }
    case 'wp-floral': {
      const flower = (cx: number, cy: number, R: number) => wrap(x, cx, cy, R * 1.6, (ox, oy) => {
        g.fillStyle = css(shade(x.c2, 0.25));
        for (let a = 0; a < 5; a++) { const t = (a * 2 * Math.PI) / 5; g.beginPath(); g.arc(cx + ox + Math.cos(t) * R * 0.6, cy + oy + Math.sin(t) * R * 0.6, R * 0.45, 0, Math.PI * 2); g.fill(); }
        g.fillStyle = c2; g.beginPath(); g.arc(cx + ox, cy + oy, R * 0.3, 0, Math.PI * 2); g.fill();
        g.fillStyle = css(mix([110, 150, 100], x.c1, 0.2));
        g.beginPath(); g.ellipse(cx + ox + R * 1.1, cy + oy + R * 0.5, R * 0.45, R * 0.18, 0.6, 0, Math.PI * 2); g.fill();
      });
      flower(W * 0.25, H * 0.25, W * 0.09); flower(W * 0.75, H * 0.75, W * 0.09); flower(W * 0.72, H * 0.2, W * 0.05); flower(W * 0.22, H * 0.7, W * 0.05);
      return;
    }
    case 'wp-leaves': case 'wp-tropical': {
      const big = s.pattern === 'wp-tropical';
      const r = rng(17);
      const n = big ? 5 : 9;
      for (let i = 0; i < n; i++) {
        const cx = r() * W, cy = r() * H, len = (big ? 0.28 : 0.14) * W * (0.7 + r() * 0.5), ang = r() * Math.PI * 2;
        wrap(x, cx, cy, len, (ox, oy) => {
          g.save(); g.translate(cx + ox, cy + oy); g.rotate(ang);
          g.fillStyle = css(shade(x.c2, (r() - 0.5) * 0.3));
          g.beginPath(); g.ellipse(0, 0, len, len * (big ? 0.55 : 0.32), 0, 0, Math.PI * 2); g.fill();
          g.strokeStyle = css(shade(x.c2, 0.4)); g.lineWidth = lw;
          g.beginPath(); g.moveTo(-len, 0); g.lineTo(len, 0); g.stroke();
          if (big) for (let s2 = -3; s2 <= 3; s2++) { if (!s2) continue; g.strokeStyle = css(x.c1); g.lineWidth = lw * 1.6; g.beginPath(); g.moveTo(s2 * len * 0.25, 0); g.lineTo(s2 * len * 0.32, len * 0.6 * Math.sign(s2 % 2 ? 1 : -1)); g.stroke(); }
          g.restore();
        });
      }
      return;
    }
    case 'wp-damask': {
      const orn = (cx: number, cy: number, R: number) => wrap(x, cx, cy, R * 1.2, (ox, oy) => {
        g.fillStyle = c2;
        for (const sx of [1, -1]) {
          g.beginPath();
          g.moveTo(cx + ox, cy + oy - R);
          g.bezierCurveTo(cx + ox + sx * R * 0.9, cy + oy - R * 0.6, cx + ox + sx * R * 0.2, cy + oy, cx + ox + sx * R * 0.7, cy + oy + R * 0.35);
          g.bezierCurveTo(cx + ox + sx * R * 0.4, cy + oy + R * 0.9, cx + ox + sx * R * 0.1, cy + oy + R * 0.6, cx + ox, cy + oy + R);
          g.closePath(); g.fill();
        }
        g.fillStyle = css(x.c1); g.beginPath(); g.ellipse(cx + ox, cy + oy, R * 0.18, R * 0.35, 0, 0, Math.PI * 2); g.fill();
      });
      orn(W / 2, H / 2, W * 0.28); orn(0, 0, W * 0.2);
      return;
    }
    case 'wp-luxury': {
      g.strokeStyle = c2; g.lineWidth = lw * 1.2;
      const R = W / 4;
      for (let r2 = 0; r2 < 3; r2++) for (let c = 0; c < 3; c++) {
        const cx = c * 2 * R + (r2 % 2 ? R : 0), cy = r2 * R;
        for (let k2 = 1; k2 <= 4; k2++) { g.beginPath(); g.arc(cx, cy, (R * k2) / 4, Math.PI, 2 * Math.PI); g.stroke(); }
        for (let a = 0; a <= 4; a++) { const t = Math.PI + (a * Math.PI) / 4; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(t) * R, cy + Math.sin(t) * R); g.stroke(); }
      }
      return;
    }
    case 'wp-minimal': {
      g.fillStyle = c2;
      const n = 4, r = Math.max(1, W / 70);
      for (let i = 0; i < n; i++) for (let jj = 0; jj < n; jj++) { g.beginPath(); g.arc(((i + (jj % 2 ? 0.5 : 0)) * W) / n, (jj * H) / n, r, 0, Math.PI * 2); g.fill(); }
      return;
    }
    case 'wp-kids': {
      const cols = [x.c2, [94, 154, 214], [233, 109, 125], [120, 190, 120]] as [number, number, number][];
      const r = rng(5);
      for (let i = 0; i < 9; i++) {
        const cx = r() * W, cy = r() * H, R = W * (0.04 + r() * 0.05), col = css(cols[i % cols.length]);
        wrap(x, cx, cy, R, (ox, oy) => {
          g.fillStyle = col;
          if (i % 2) { g.beginPath(); for (let a = 0; a < 10; a++) { const rr = a % 2 ? R * 0.45 : R; const t = -Math.PI / 2 + (a * Math.PI) / 5; g.lineTo(cx + ox + rr * Math.cos(t), cy + oy + rr * Math.sin(t)); } g.closePath(); g.fill(); }
          else { g.beginPath(); g.arc(cx + ox, cy + oy, R * 0.6, 0, Math.PI * 2); g.fill(); }
        });
      }
      return;
    }
    case 'wp-fabric': case 'weave': {
      g.strokeStyle = css(shade(x.c1, -0.08), 0.6); g.lineWidth = 1;
      const n = Math.max(6, Math.round(W / 4));
      for (let i = 0; i < n; i++) { const t = (i * W) / n; g.beginPath(); g.moveTo(t, 0); g.lineTo(t, H); g.stroke(); g.beginPath(); g.moveTo(0, (i * H) / n); g.lineTo(W, (i * H) / n); g.stroke(); }
      speckle(x, 300, 1.2, 0.12);
      if (s.pattern === 'wp-fabric') { g.strokeStyle = css(x.c2, 0.25); for (let i = 0; i < n; i += 3) { g.beginPath(); g.moveTo((i * W) / n, 0); g.lineTo((i * W) / n, H); g.stroke(); } }
      return;
    }
    case 'wp-3d': {
      // Isometric cubes: three faces in three shades.
      const w = W / 2, h = H / 2;
      const cube = (cx: number, cy: number) => {
        const top = [[cx, cy - h / 2], [cx + w / 2, cy - h / 4], [cx, cy], [cx - w / 2, cy - h / 4]];
        const left = [[cx - w / 2, cy - h / 4], [cx, cy], [cx, cy + h / 2], [cx - w / 2, cy + h / 4]];
        const right = [[cx + w / 2, cy - h / 4], [cx, cy], [cx, cy + h / 2], [cx + w / 2, cy + h / 4]];
        for (const [poly, col] of [[top, shade(x.c1, 0.15)], [left, x.c1], [right, shade(x.c2, 0.1)]] as [number[][], [number, number, number]][]) {
          g.fillStyle = css(col); g.beginPath(); poly.forEach(([a, b]) => g.lineTo(a, b)); g.closePath(); g.fill();
        }
      };
      for (let r = -1; r <= 3; r++) for (let c = -1; c <= 3; c++) cube(c * w + (r % 2 ? w / 2 : 0), r * (h * 0.75));
      return;
    }
    case 'wp-ogee': {
      g.strokeStyle = c2; g.lineWidth = lw * 1.5;
      for (const [ox, oy] of [[0, 0], [W / 2, H / 2], [W, 0], [0, H], [W, H], [-W / 2, H / 2], [W / 2, -H / 2], [W / 2, H * 1.5], [W * 1.5, H / 2]]) {
        g.beginPath();
        g.moveTo(ox, oy - H / 2);
        g.bezierCurveTo(ox + W * 0.3, oy - H * 0.2, ox + W * 0.05, oy + H * 0.1, ox + W * 0.25, oy);
        g.bezierCurveTo(ox + W * 0.05, oy - H * 0.1 + H * 0.2, ox + W * 0.3, oy + H * 0.2, ox, oy + H / 2);
        g.bezierCurveTo(ox - W * 0.3, oy + H * 0.2, ox - W * 0.05, oy + H * 0.1, ox - W * 0.25, oy);
        g.bezierCurveTo(ox - W * 0.05, oy - H * 0.1, ox - W * 0.3, oy - H * 0.2, ox, oy - H / 2);
        g.stroke();
      }
      return;
    }
    case 'wp-modern': {
      g.fillStyle = c2;
      g.beginPath(); g.arc(0, H, W * 0.42, -Math.PI / 2, 0); g.lineTo(0, H); g.fill();
      g.fillStyle = css(shade(x.c2, 0.5));
      g.beginPath(); g.arc(W, 0, W * 0.32, Math.PI / 2, Math.PI); g.lineTo(W, 0); g.fill();
      g.strokeStyle = c2; g.lineWidth = lw * 2;
      g.beginPath(); g.arc(W * 0.65, H * 0.62, W * 0.18, 0, Math.PI * 2); g.stroke();
      return;
    }
  }
}

function outdoor(x: Ctx) {
  const { g, W, H, k, s } = x;
  switch (s.pattern) {
    case 'grass': {
      speckle(x, 500, 1.4, 0.25);
      const r = x.rnd;
      for (let i = 0; i < 900; i++) { const px = r() * W, py = r() * H, l = 2 + r() * 5; g.strokeStyle = css(shade(x.c1, (r() - 0.4) * 0.35), 0.8); g.lineWidth = 0.8; g.beginPath(); g.moveTo(px, py); g.lineTo(px + (r() - 0.5) * 2, py - l); g.stroke(); }
      return;
    }
    case 'soil': blobs(x, 30, W * 0.05, W * 0.2, 0.3, 0.25); speckle(x, 1200, 2, 0.35); return;
    case 'sand': blobs(x, 14, W * 0.1, W * 0.3, 0.12, 0.2); speckle(x, 2500, 1, 0.18); return;
    case 'asphalt': speckle(x, 3500, 1.3, 0.4); return;
    case 'gravel': case 'pebbles': case 'woodchips': {
      const big = s.pattern === 'pebbles', chips = s.pattern === 'woodchips';
      const n = big ? 160 : chips ? 420 : 700;
      g.fillStyle = css(shade(x.c1, -0.25)); g.fillRect(0, 0, W, H);
      for (let i = 0; i < n; i++) {
        const cx = x.rnd() * W, cy = x.rnd() * H, R = (big ? 6 : chips ? 3 : 2.2) * (0.6 + x.rnd()) * Math.max(1, W / 256), ang = x.rnd() * Math.PI;
        const col = shade(x.c1, (x.rnd() - 0.5) * 0.35);
        wrap(x, cx, cy, R * 2.5, (ox, oy) => {
          g.fillStyle = css(col); g.beginPath(); g.ellipse(cx + ox, cy + oy, chips ? R * 2.4 : R * 1.2, chips ? R * 0.6 : R, ang, 0, Math.PI * 2); g.fill();
          if (big) { g.fillStyle = css(shade(col, 0.3), 0.6); g.beginPath(); g.ellipse(cx + ox - R * 0.3, cy + oy - R * 0.3, R * 0.4, R * 0.3, ang, 0, Math.PI * 2); g.fill(); }
        });
      }
      return;
    }
    case 'groundcover': case 'flowerbed': {
      for (let i = 0; i < 260; i++) {
        const cx = x.rnd() * W, cy = x.rnd() * H, R = W * (0.012 + x.rnd() * 0.02), col = shade(i % 3 ? x.c1 : x.c2.map((v, ii) => (s.pattern === 'groundcover' ? v : x.c1[ii])) as [number, number, number], (x.rnd() - 0.5) * 0.3);
        wrap(x, cx, cy, R, (ox, oy) => { g.fillStyle = css(col); g.beginPath(); g.arc(cx + ox, cy + oy, R, 0, Math.PI * 2); g.fill(); });
      }
      if (s.pattern === 'flowerbed') for (let i = 0; i < 120; i++) {
        const cx = x.rnd() * W, cy = x.rnd() * H, R = W * 0.008 * (1 + x.rnd());
        const col = i % 3 === 0 ? x.c2 : i % 3 === 1 ? [240, 205, 80] as [number, number, number] : [245, 245, 240] as [number, number, number];
        wrap(x, cx, cy, R, (ox, oy) => { g.fillStyle = css(col); g.beginPath(); g.arc(cx + ox, cy + oy, R, 0, Math.PI * 2); g.fill(); });
      }
      return;
    }
    case 'pavers': {
      // Interlocking pavers in a herringbone of 2:1 blocks.
      const u = W / 4, j = Math.max(0.8, joint(x));
      g.fillStyle = css(x.cg); g.fillRect(0, 0, W, H);
      const n = 2;
      for (let b = -4; b <= 4; b++) for (let kk = -8; kk <= 12; kk++) {
        const ox = b * n, oy = -b * n;
        for (const [x0, y0, w0, h0] of [[kk + ox, kk + oy, n, 1], [kk + n + ox, kk - n + 1 + oy, 1, n]]) for (const wx of [0, -4, 4]) for (const wy of [0, -4, 4]) {
          const X = (x0 + wx) * u, Y = (y0 + wy) * u;
          if (X > W || Y > H || X + w0 * u < 0 || Y + h0 * u < 0) continue;
          const t = hash2(Math.abs(kk * 3 + b), 5);
          g.fillStyle = css(shade(mix(x.c1, x.c2, t), (hash2(kk, b + 9) - 0.5) * 0.1));
          g.fillRect(X + j / 2, Y + j / 2, w0 * u - j, h0 * u - j);
        }
      }
      return;
    }
    case 'paving-geo': {
      g.fillStyle = css(x.cg); g.fillRect(0, 0, W, H);
      const j = Math.max(1, joint(x));
      const tri = (pts: number[][], col: [number, number, number]) => { g.fillStyle = css(col); g.beginPath(); pts.forEach(([a, b]) => g.lineTo(a, b)); g.closePath(); g.fill(); };
      const q = j / 2;
      tri([[q, q], [W / 2 - q, q], [q, H / 2 - q]], x.c1); tri([[W / 2 - q, q * 2], [q * 2, H / 2 - q], [W / 2 - q, H / 2 - q]], x.c2);
      tri([[W / 2 + q, q], [W - q, q], [W - q, H / 2 - q]], x.c2); tri([[W / 2 + q, q * 2], [W / 2 + q, H / 2 - q], [W - q * 2, H / 2 - q]], x.c1);
      tri([[q, H / 2 + q], [W / 2 - q, H / 2 + q], [W / 2 - q, H - q]], x.c2); tri([[q, H / 2 + q * 2], [q, H - q], [W / 2 - q * 2, H - q]], x.c1);
      tri([[W / 2 + q, H / 2 + q], [W - q, H / 2 + q], [W / 2 + q, H - q]], x.c1); tri([[W - q, H / 2 + q * 2], [W - q, H - q], [W / 2 + q * 2, H - q]], x.c2);
      return;
    }
    case 'paving-green': {
      g.fillStyle = css(x.c1); g.fillRect(0, 0, W, H);
      const n = 3, c = W / n;
      for (let i = 0; i < n; i++) for (let jj = 0; jj < n; jj++) { g.fillStyle = css(shade(x.c2, (hash2(i, jj) - 0.5) * 0.2)); g.fillRect(i * c + c * 0.18, jj * c + c * 0.18, c * 0.64, c * 0.64); }
      return;
    }
    case 'stepping': {
      g.fillStyle = css(x.c2); g.fillRect(0, 0, W, H);
      const xx = { ...x, c1: x.c2 };
      speckle(xx, 400, 1.4, 0.25);
      g.fillStyle = css(x.c1);
      g.beginPath(); g.ellipse(W * 0.5, H * 0.5, W * 0.3, H * 0.24, 0.3, 0, Math.PI * 2); g.fill();
      g.fillStyle = css(shade(x.c1, -0.1), 0.5); g.beginPath(); g.ellipse(W * 0.55, H * 0.55, W * 0.18, H * 0.1, 0.3, 0, Math.PI * 2); g.fill();
      return;
    }
    case 'water': {
      g.strokeStyle = css(shade(x.c1, 0.35), 0.5); g.lineWidth = Math.max(1, W / 150);
      for (let i = 0; i < 9; i++) { const y = (i + 0.5) * (H / 9); g.beginPath(); for (let px = 0; px <= W; px += W / 16) g.lineTo(px, y + Math.sin((px / W) * Math.PI * 4 + i) * H * 0.012); g.stroke(); }
      return;
    }
  }
  void k;
}

/** Draws one repeat of a texture on a canvas (its size is chosen here from the repeat size). */
export function drawTexture(canvas: HTMLCanvasElement, s: TexSpec, maxPx = 512): void {
  const rep = repeatMM(s);
  const k = Math.min(maxPx / rep.w, maxPx / rep.h, 4);
  const W = Math.max(8, Math.round(rep.w * k)), H = Math.max(8, Math.round(rep.h * k));
  canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d');
  if (!g) return;
  const x: Ctx = { g, W, H, k: W / rep.w, s, c1: rgb(s.color), c2: rgb(s.color2), cg: rgb(s.grout), rnd: rng(1 + s.pattern.length * 101 + Math.round(s.tw) % 97) };
  g.fillStyle = s.color;
  g.fillRect(0, 0, W, H);
  switch (s.pattern) {
    case 'plain': case 'glass': return;
    case 'plank': planks(x); return;
    case 'tile': tiles(x); return;
    case 'stone': tiles(x, (X, Y, w, h, i) => { const r = rng(i + 11); for (let n = 0; n < 160; n++) { g.fillStyle = css(shade(x.c1, (r() - 0.5) * 0.14), 0.8); g.fillRect(X + r() * w, Y + r() * h, 1 + r() * 2.5, 1 + r() * 2.5); } }, 0.12); return;
    case 'marble': tiles(x, (X, Y, w, h, i) => marbleVeins(x, X, Y, w, h, i * 7 + 3), 0.02); return;
    case 'travertine': tiles(x, (X, Y, w, h, i) => { const r = rng(i + 5); for (let n = 0; n < 7; n++) { g.fillStyle = css(shade(x.c1, (r() - 0.5) * 0.12), 0.5); g.fillRect(X, Y + r() * h, w, 1 + r() * h * 0.06); } for (let n = 0; n < 25; n++) { g.fillStyle = css(shade(x.c1, -0.25), 0.6); g.beginPath(); g.ellipse(X + r() * w, Y + r() * h, 1 + r() * 2.5, 0.6 + r(), 0, 0, Math.PI * 2); g.fill(); } }, 0.08); return;
    case 'granite': tiles(x, (X, Y, w, h) => { for (let n = 0; n < (w * h) / 6; n++) { g.fillStyle = css(x.rnd() < 0.5 ? x.c2 : shade(x.c1, 0.35), 0.7); g.fillRect(X + x.rnd() * w, Y + x.rnd() * h, 1 + x.rnd() * 1.5, 1 + x.rnd() * 1.5); } }, 0.03); return;
    case 'acoustic': tiles(x, (X, Y, w, h) => { for (let n = 0; n < (w * h) / 30; n++) { g.fillStyle = css(shade(x.c1, -0.18), 0.6); g.fillRect(X + x.rnd() * w, Y + x.rnd() * h, 1, 1 + x.rnd() * 2); } }, 0.01); return;
    case 'terrazzo': {
      blobs(x, 8, W * 0.1, W * 0.3, 0.06);
      const cols = [x.c2, shade(x.c2, 0.4), [196, 120, 90] as [number, number, number], [120, 130, 140] as [number, number, number]];
      for (let i = 0; i < 260; i++) { const cx = x.rnd() * W, cy = x.rnd() * H, R = 1 + x.rnd() * W * 0.015; const col = cols[i % cols.length]; wrap(x, cx, cy, R, (ox, oy) => { g.fillStyle = css(col); g.beginPath(); for (let a = 0; a < 5; a++) { const t = (a * 2 * Math.PI) / 5 + i; g.lineTo(cx + ox + Math.cos(t) * R * (0.6 + hash2(i, a) * 0.6), cy + oy + Math.sin(t) * R * (0.6 + hash2(a, i) * 0.6)); } g.closePath(); g.fill(); }); }
      if (s.groutW > 0) { g.fillStyle = css(x.cg); const j = joint(x); g.fillRect(0, 0, W, j); g.fillRect(0, H / 2, W, j); g.fillRect(0, 0, j, H); g.fillRect(W / 2, 0, j, H); }
      return;
    }
    case 'hex': hexTiles(x); return;
    case 'mosaic': mosaic(x); return;
    case 'tile-deco': tiles(x, decoMotif(x, 'deco'), 0.02); return;
    case 'tile-geo': tiles(x, decoMotif(x, 'geo'), 0.02); return;
    case 'tile-painted': tiles(x, decoMotif(x, 'painted'), 0.02); return;
    case 'brick': bricks(x); return;
    case 'flagstone': flagstone(x); return;
    case 'concrete': blobs(x, 40, W * 0.05, W * 0.25, 0.12); speckle(x, 500, 1.2, 0.12); for (let i = 0; i < 25; i++) { g.fillStyle = css(shade(x.c1, -0.3), 0.6); g.beginPath(); g.arc(x.rnd() * W, x.rnd() * H, 0.6 + x.rnd() * 1.2, 0, Math.PI * 2); g.fill(); } return;
    case 'concrete-deco': {
      blobs(x, 30, W * 0.05, W * 0.25, 0.12); speckle(x, 400, 1.2, 0.12);
      g.fillStyle = css(x.cg); g.fillRect(0, 0, W, Math.max(1, W / 200)); g.fillRect(0, 0, Math.max(1, W / 200), H);
      g.fillStyle = css(shade(x.c1, -0.35));
      for (const [a, b] of [[0.2, 0.25], [0.8, 0.25], [0.2, 0.75], [0.8, 0.75]]) { g.beginPath(); g.arc(a * W, b * H, Math.max(1.2, W / 90), 0, Math.PI * 2); g.fill(); }
      return;
    }
    case 'carpet': speckle(x, 5000, 1, 0.16); return;
    case 'rubber': speckle(x, 1400, 1.6, 0.1); speckle(x, 500, 1.4, 0, x.c2); return;
    case 'leather': blobs(x, 30, W * 0.05, W * 0.15, 0.1, 0.25); for (let i = 0; i < 300; i++) { g.strokeStyle = css(shade(x.c1, -0.15), 0.3); g.lineWidth = 0.6; const px = x.rnd() * W, py = x.rnd() * H; g.beginPath(); g.moveTo(px, py); g.lineTo(px + (x.rnd() - 0.5) * 6, py + (x.rnd() - 0.5) * 6); g.stroke(); } return;
    case 'slats': {
      g.fillStyle = css(x.c2); g.fillRect(0, 0, W, H);
      grain(x, W * 0.12, 0, W * 0.76, H, false, x.c1, 9);
      g.fillStyle = css(shade(x.c1, 0.12), 0.6); g.fillRect(W * 0.12, 0, W * 0.06, H);
      return;
    }
    case 'panels': {
      const m = Math.min(W, H) * 0.12;
      g.fillStyle = css(shade(x.c1, -0.05)); g.fillRect(m, m, W - 2 * m, H - 2 * m);
      g.strokeStyle = css(shade(x.c1, -0.2)); g.lineWidth = Math.max(1, W / 120); g.strokeRect(m, m, W - 2 * m, H - 2 * m);
      g.strokeStyle = css(shade(x.c1, 0.25)); g.beginPath(); g.moveTo(m * 1.5, H - m * 1.5); g.lineTo(m * 1.5, m * 1.5); g.lineTo(W - m * 1.5, m * 1.5); g.stroke();
      g.fillStyle = css(x.c2); g.fillRect(0, 0, W, Math.max(1, W / 150)); g.fillRect(0, 0, Math.max(1, W / 150), H);
      return;
    }
    case 'plaster-deco': {
      for (let i = 0; i < 70; i++) { const cx = x.rnd() * W, cy = x.rnd() * H, R = W * (0.05 + x.rnd() * 0.12); const col = mix(x.c1, x.c2, x.rnd()); wrap(x, cx, cy, R, (ox, oy) => { g.strokeStyle = css(col, 0.35); g.lineWidth = R * 0.35; g.beginPath(); g.arc(cx + ox, cy + oy, R, x.rnd() * 6, x.rnd() * 6 + 1.4); g.stroke(); }); }
      speckle(x, 600, 1, 0.08);
      return;
    }
    case 'metal': for (let i = 0; i < H; i += 1) { g.fillStyle = css(shade(x.c1, (hash2(i, 1) - 0.5) * 0.08), 0.8); g.fillRect(0, i, W, 1); } return;
    case 'metal-corrugated': for (let i = 0; i < W; i++) { const t = Math.sin((i / W) * Math.PI * 4); g.fillStyle = css(shade(x.c1, t * 0.15)); g.fillRect(i, 0, 1, H); } return;
    case 'glass-deco': speckle(x, 1500, 1, 0.08); g.fillStyle = css(shade(x.c1, 0.4), 0.7); g.fillRect(0, 0, W, Math.max(1, W / 100)); g.fillRect(0, 0, Math.max(1, W / 100), H); return;
    case 'water': case 'grass': case 'soil': case 'sand': case 'asphalt': case 'gravel': case 'pebbles': case 'woodchips': case 'groundcover': case 'flowerbed': case 'pavers': case 'paving-geo': case 'paving-green': case 'stepping': outdoor(x); return;
    default: wallpaper(x);
  }
}

/** Key of a texture: two specs with the same key draw the same canvas. */
export const texKey = (s: TexSpec) => `${s.pattern}|${s.color}|${s.color2}|${s.grout}|${Math.round(s.groutW * 10)}|${s.layout}|${Math.round(s.tw)}|${Math.round(s.th)}`;

const thumbCache = new Map<string, string>();
/** A small preview image of a material (data URL), cached. Returns '' where there is no canvas (tests). */
export function thumbUrl(s: TexSpec, px = 56): string {
  const key = `${texKey(s)}|${px}`;
  const hit = thumbCache.get(key);
  if (hit !== undefined) return hit;
  let url = '';
  if (typeof document !== 'undefined') {
    try {
      // The preview shows about 1.2 m of the material (or two repeats of small patterns), so sizes can be compared.
      const c = document.createElement('canvas');
      drawTexture(c, s, 160);
      const out = document.createElement('canvas');
      out.width = out.height = px;
      const g = out.getContext('2d');
      if (g) {
        const rep = repeatMM(s);
        const view = s.pattern === 'plain' || s.pattern === 'glass' ? rep.w : Math.max(rep.w, Math.min(1200, rep.w * 3));
        const n = Math.max(1, view / rep.w);
        const pat = g.createPattern(c, 'repeat');
        if (pat) {
          const sc = px / n / c.width;
          pat.setTransform(new DOMMatrix([sc, 0, 0, sc, 0, 0]));
          g.fillStyle = pat;
          g.fillRect(0, 0, px, px);
        }
        url = out.toDataURL('image/png');
      }
    } catch { url = ''; }
  }
  if (thumbCache.size > 600) thumbCache.clear();
  thumbCache.set(key, url);
  return url;
}

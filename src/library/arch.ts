// Parametric arches and gates (shared by the building and the site modules).
// A gate is built from solid piers and, over each opening, thin vertical slices whose bottom follows the curve of
// the arch: the opening is a real hole in the geometry (plan, 3D, sections and elevations all see it), never a
// solid block with a drawing on it. Local frame: x across the width (centre 0), y across the depth, z up.

export type ArchShape = 'semi' | 'pointed' | 'ellipse' | 'segment' | 'flat';

export const ARCH_SHAPE_LABELS: Record<ArchShape, string> = {
  semi: 'חצי־עגולה', pointed: 'מחודדת', ellipse: 'אליפטית', segment: 'שטוחה (מקטע)', flat: 'ישרה (משקוף)',
};

/** Height of the arch above its springing line at x (−a … a, a = half the opening width) for a rise r. */
export function archCurve(shape: ArchShape, a: number, r: number, x: number): number {
  const t = Math.max(-1, Math.min(1, x / a));
  switch (shape) {
    case 'flat': return 0;
    case 'semi': case 'ellipse': return r * Math.sqrt(Math.max(0, 1 - t * t));
    case 'segment': {
      const R = (a * a + r * r) / (2 * r);
      return Math.max(0, Math.sqrt(Math.max(0, R * R - x * x)) - (R - r));
    }
    case 'pointed': {
      if (r <= a) return r * Math.sqrt(Math.max(0, 1 - t * t));
      const c = (r * r - a * a) / (2 * a);
      const R = c + a;
      const xx = Math.abs(x);
      return Math.max(0, Math.sqrt(Math.max(0, R * R - (xx + c) * (xx + c))));
    }
  }
}

/** Default rise of an arch of width w. */
export const defaultRise = (shape: ArchShape, w: number) => (shape === 'semi' ? w / 2 : shape === 'pointed' ? w * 0.8 : shape === 'ellipse' ? w * 0.3 : shape === 'segment' ? w * 0.18 : 0);

export type GPart =
  | { t: 'box'; x0: number; y0: number; x1: number; y1: number; z0: number; z1: number; c: 1 | 2 | 3 }
  | { t: 'slice'; x0: number; x1: number; y0: number; y1: number; b0: number; b1: number; t0: number; t1: number; c: 1 | 2 | 3 };

export interface GateParams {
  /** Overall width, depth and height, mm. */
  w: number; d: number; h: number;
  /** Width and height (to the top of the arch) of each opening, mm. */
  ow: number; oh: number;
  /** Number of openings side by side (1 … 7). The middle one can be larger (triumphal arch). */
  n: number;
  shape: ArchShape;
  /** Rise of the arch; 0 = default for the shape. */
  rise: number;
  /** Width of the side openings as a share of the middle one (multi-arch gates). */
  side: number;
  /** Decorative details: plinth, cornice, pilasters, keystone. */
  deco: boolean;
  /** Attic: a solid band on top (triumphal arches), mm. */
  attic: number;
  /** Number of slices per arch (smoothness). */
  slices?: number;
}

/** Openings along x (centre, width, height to apex). */
export function gateOpenings(p: GateParams): { cx: number; w: number; h: number }[] {
  const n = Math.max(1, Math.min(7, Math.round(p.n)));
  const mid = (n - 1) / 2;
  const widths = Array.from({ length: n }, (_, i) => (n > 1 && Math.abs(i - mid) > 0.1 ? p.ow * p.side : p.ow));
  const heights = widths.map((w) => (w === p.ow ? p.oh : Math.max(w, p.oh * (0.55 + 0.45 * p.side))));
  const sum = widths.reduce((a, b) => a + b, 0);
  const pier = Math.max(80, (p.w - sum) / (n + 1));
  const out: { cx: number; w: number; h: number }[] = [];
  let x = -p.w / 2 + pier;
  for (let i = 0; i < n; i++) { out.push({ cx: x + widths[i] / 2, w: widths[i], h: Math.min(heights[i], p.h - p.attic - 60) }); x += widths[i] + pier; }
  return out;
}

/** Parts of a gate. Colour 1 = body, 2 = details (plinth, cornice, keystone), 3 = attic band. */
export function gateParts(p: GateParams): GPart[] {
  const out: GPart[] = [];
  const W = p.w, D = p.d, H = p.h;
  const y0 = -D / 2, y1 = D / 2;
  const ops = gateOpenings(p);
  const N = Math.max(6, Math.min(48, Math.round(p.slices ?? 24)));
  const top = H - p.attic;
  // Piers between the openings, full height of the body.
  let x = -W / 2;
  for (const o of ops) {
    const xa = o.cx - o.w / 2;
    if (xa - x > 1) out.push({ t: 'box', x0: x, y0, x1: xa, y1, z0: 0, z1: top, c: 1 });
    x = o.cx + o.w / 2;
  }
  if (W / 2 - x > 1) out.push({ t: 'box', x0: x, y0, x1: W / 2, y1, z0: 0, z1: top, c: 1 });
  // Over each opening: slices whose bottom follows the arch.
  for (const o of ops) {
    const a = o.w / 2;
    const r = p.shape === 'flat' ? 0 : Math.min(p.rise > 0 ? p.rise : defaultRise(p.shape, o.w), o.h - 10);
    const spring = o.h - r;
    const n = p.shape === 'flat' ? 1 : N;
    for (let i = 0; i < n; i++) {
      const xa = -a + (2 * a * i) / n, xb = -a + (2 * a * (i + 1)) / n;
      const ba = spring + archCurve(p.shape, a, r, xa), bb = spring + archCurve(p.shape, a, r, xb);
      if (top - Math.max(ba, bb) < 1 && top - Math.min(ba, bb) < 1) continue;
      out.push({ t: 'slice', x0: o.cx + xa, x1: o.cx + xb, y0, y1, b0: Math.min(ba, top), b1: Math.min(bb, top), t0: top, t1: top, c: 1 });
    }
    if (p.deco && p.shape !== 'flat') {
      // Keystone at the top of the arch, slightly proud of both faces.
      const kw = Math.min(260, o.w * 0.12);
      out.push({ t: 'box', x0: o.cx - kw / 2, y0: y0 - 30, x1: o.cx + kw / 2, y1: y1 + 30, z0: o.h - 40, z1: Math.min(top, o.h + kw * 1.3), c: 2 });
    }
  }
  if (p.attic > 0) out.push({ t: 'box', x0: -W / 2 + 40, y0: y0 + 40, x1: W / 2 - 40, y1: y1 - 40, z0: top, z1: H, c: 3 });
  if (p.deco) {
    const pl = Math.min(500, H * 0.06), cor = Math.min(350, H * 0.05);
    // Plinths at the foot of each pier and a cornice band at the top of the body.
    x = -W / 2;
    for (const o of [...ops, { cx: W / 2 + 1e6, w: 0, h: 0 }]) {
      const xa = Math.min(o.cx - o.w / 2, W / 2);
      if (xa - x > 1) out.push({ t: 'box', x0: x - 40, y0: y0 - 40, x1: xa + (xa < W / 2 ? 0 : 40), y1: y1 + 40, z0: 0, z1: pl, c: 2 });
      x = o.cx + o.w / 2;
      if (x > W / 2) break;
    }
    out.push({ t: 'box', x0: -W / 2 - 80, y0: y0 - 80, x1: W / 2 + 80, y1: y1 + 80, z0: top - cor, z1: top, c: 2 });
  }
  return out;
}

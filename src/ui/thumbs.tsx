import { useMemo } from 'react';
import type { Project } from '../document/types';
import { defaultPrint } from '../document/factory';
import { projectParts } from '../drawing/page';
import { boxH, boxW, type ViewCtx } from '../drawing/viewport';
import { makeView } from '../drawing/viewport';

const W = 200, H = 120, PAD = 8;

/** Small, real preview of a project's content (same renderers as the editor and the print sheet). */
export function ProjectThumb({ project }: { project: Project }) {
  const content = useMemo((): { node?: React.ReactNode; img?: string; empty?: string } => {
    if (project.type === 'drawing' && project.data.background && project.data.layout === 'side') return { img: project.data.background.dataUrl };
    const s = { ...defaultPrint(1), blackWhite: false, printBackground: true, include: 'epure' as const };
    try {
      const { parts, empty } = projectParts(project, s);
      if (!parts.length) return { empty: empty ?? 'ריק' };
      const part = parts[0];
      const bw = Math.max(boxW(part.box), 1e-6), bh = Math.max(boxH(part.box), 1e-6);
      const k = Math.min((W - 2 * PAD) / bw, (H - 2 * PAD) / bh);
      const { T } = makeView(part.box.minX, part.box.maxY, k, (W - bw * k) / 2, (H - bh * k) / 2);
      const ctx: ViewCtx = { T, k, pu: 0.9, bw: false, screen: false };
      return { node: part.render(ctx) };
    } catch {
      return { empty: 'אין תצוגה מקדימה' };
    }
  }, [project]);

  return (
    <div className="thumb-inner" aria-hidden="true">
      {content.img ? <img src={content.img} alt="" /> : content.node ? (
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" preserveAspectRatio="xMidYMid meet">{content.node}</svg>
      ) : (
        <span className="muted small">{content.empty}</span>
      )}
    </div>
  );
}

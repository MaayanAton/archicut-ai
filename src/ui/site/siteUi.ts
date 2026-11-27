// Interface state of the site editor (not saved in the project): tool, selection, mode.

import { create } from 'zustand';
import type { Vec2 } from '../../geometry/vec';

export type SiteTab = 'plan' | '3d' | 'topo' | 'sections' | 'sheets';

export type SiteTool =
  | { t: 'select' }
  | { t: 'place'; kind: string }
  | { t: 'measure' }
  | { t: 'hpoint' }
  | { t: 'mound' }
  | { t: 'section' }
  | { t: 'calibrate' };

export interface MeasureResult { a: Vec2; b: Vec2 }

interface SiteUi {
  projectId: string | null;
  tab: SiteTab;
  tool: SiteTool;
  sel: string[];
  selHp: string | null;
  selMound: string | null;
  selSection: string | null;
  advanced: boolean;
  areaMode: 'polygon' | 'rect';
  curved: boolean;
  split: boolean;
  measure: MeasureResult | null;
  reset(projectId: string): void;
  setTool(t: SiteTool): void;
  select(ids: string[]): void;
}

const ADV_KEY = 'archicut-site-advanced';
const readAdv = () => { try { return localStorage.getItem(ADV_KEY) === '1'; } catch { return false; } };

export const useSiteUi = create<SiteUi>((set, get) => ({
  projectId: null,
  tab: 'plan',
  tool: { t: 'select' },
  sel: [],
  selHp: null,
  selMound: null,
  selSection: null,
  advanced: readAdv(),
  areaMode: 'polygon',
  curved: false,
  split: false,
  measure: null,
  reset(projectId) {
    if (get().projectId === projectId) return;
    set({ projectId, tab: 'plan', tool: { t: 'select' }, sel: [], selHp: null, selMound: null, selSection: null, measure: null });
  },
  setTool(t) { set({ tool: t, measure: null, ...(t.t !== 'select' ? { sel: [], selHp: null, selMound: null } : {}) }); },
  select(ids) { set({ sel: ids, selHp: null, selMound: null }); },
}));

export function setAdvanced(v: boolean) {
  useSiteUi.setState({ advanced: v });
  try { localStorage.setItem(ADV_KEY, v ? '1' : '0'); } catch { /* private mode */ }
}

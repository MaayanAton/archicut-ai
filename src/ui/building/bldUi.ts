// Interface state of the building editor (not saved in the project): tab, level, tool, selection, view state.

import { create } from 'zustand';
import type { OpeningKind, SlabKind, ViewState } from '../../building/types';

export type BTab = 'plan' | '3d' | 'sections' | 'tables' | 'sheets';

export type BTool =
  | { t: 'select' }
  | { t: 'wall' }
  | { t: 'room' }
  | { t: 'roomPoly' }
  | { t: 'opening'; kind: OpeningKind }
  | { t: 'furniture'; kind: string }
  | { t: 'stair' }
  | { t: 'column' }
  | { t: 'beam' }
  | { t: 'slab'; kind: SlabKind }
  | { t: 'roof' }
  | { t: 'lot' }
  | { t: 'dim' }
  | { t: 'text' }
  | { t: 'measure' }
  | { t: 'section' }
  | { t: 'calibrate' };

/** Settings that new elements get (the tool panel edits them). Sizes in mm. */
export interface Presets {
  wallThickness: number;
  wallHeight: number | null;
  wallKind: 'exterior' | 'interior' | 'partition';
  openW: number | null;
  openH: number | null;
  openSill: number | null;
  furnRot: number;
  roomName: string;
}

interface BldUi {
  projectId: string | null;
  tab: BTab;
  levelId: string | null;
  tool: BTool;
  sel: string[];
  state: ViewState;
  advanced: boolean;
  split: boolean;
  ghost: boolean;
  panelOpen: boolean;
  presets: Presets;
  /** Element to show (from the warnings list). */
  focus: string | null;
  reset(projectId: string, levelId: string, renovation: boolean): void;
  setTool(t: BTool): void;
  select(ids: string[]): void;
}

const ADV_KEY = 'archicut-building-advanced';
const readAdv = () => { try { return localStorage.getItem(ADV_KEY) === '1'; } catch { return false; } };

export const useBldUi = create<BldUi>((set, get) => ({
  projectId: null,
  tab: 'plan',
  levelId: null,
  tool: { t: 'select' },
  sel: [],
  state: 'proposed',
  advanced: readAdv(),
  split: false,
  ghost: true,
  panelOpen: typeof window === 'undefined' || window.innerWidth >= 600,
  presets: { wallThickness: 200, wallHeight: null, wallKind: 'exterior', openW: null, openH: null, openSill: null, furnRot: 0, roomName: '' },
  focus: null,
  reset(projectId, levelId, renovation) {
    if (get().projectId === projectId) return;
    set({ projectId, tab: 'plan', levelId, tool: { t: 'select' }, sel: [], state: renovation ? 'compare' : 'proposed', focus: null });
  },
  setTool(t) { set({ tool: t, ...(t.t !== 'select' ? { sel: [] } : {}) }); },
  select(ids) { set({ sel: ids }); },
}));

export function setBldAdvanced(v: boolean) {
  useBldUi.setState({ advanced: v });
  try { localStorage.setItem(ADV_KEY, v ? '1' : '0'); } catch { /* private mode */ }
}

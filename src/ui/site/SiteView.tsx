import { useCallback, useEffect, useMemo, useState } from 'react';
import { useStore } from '../../document/store';
import { uid } from '../../document/factory';
import type { Project } from '../../document/types';
import { v2 } from '../../geometry/vec';
import { Dialog, Seg } from '../common';
import { Icons } from '../icons';
import type { SiteData } from '../../site/types';
import { buildSiteModel } from '../../site/section';
import { contours as computeContours } from '../../site/terrain';
import { rotateEl, selectionCenter, translateEl } from '../../site/edit';
import { PlanEditor } from './PlanEditor';
import { ActiveToolPanel, AreasPanel, LayersPanel, LibraryPanel, ModeToggle, PropertiesPanel, SettingsPanel, SitePanelAside } from './SitePanels';
import { TerrainPanel } from './TerrainPanel';
import { Site3D } from './Site3D';
import { SectionsTab } from './SectionsTab';
import { SheetsTab } from './SheetsTab';
import { useSiteUi, type SiteTab } from './siteUi';
import { NewSiteDialog } from './NewSiteDialog';

type SProject = Extract<Project, { type: 'site' }>;

const TABS: { v: SiteTab; label: string; icon: keyof typeof import('../icons').Icons }[] = [
  { v: 'plan', label: 'תוכנית', icon: 'pencil' },
  { v: '3d', label: 'תלת־ממד', icon: 'view3d' },
  { v: 'topo', label: 'טופוגרפיה', icon: 'mountain' },
  { v: 'sections', label: 'חתכים', icon: 'section' },
  { v: 'sheets', label: 'גיליונות הגשה', icon: 'sheet' },
];

export function SiteView({ project }: { project: SProject }) {
  const d = project.data;
  const ui = useSiteUi();
  const [help, setHelp] = useState(false);
  const [lotDialog, setLotDialog] = useState(false);
  useEffect(() => { ui.reset(project.id); }, [project.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = useStore((s) => s.update);
  const setData = useCallback((fn: (dd: SiteData) => SiteData, record = true) => update(project.id, (p) => (p.type === 'site' ? { ...p, data: fn(p.data) } : p), record), [update, project.id]);

  const model = useMemo(() => buildSiteModel(d), [d]);
  const cont = useMemo(() => (d.terrain.showContours || ui.tab === 'topo' ? computeContours(model.terrain, d.terrain.contourStep) : null), [model.terrain, d.terrain.contourStep, d.terrain.showContours, ui.tab]);

  // Keyboard shortcuts on the computer.
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      if (document.querySelector('.overlay')) return;
      const s = useSiteUi.getState();
      if (s.tab !== 'plan' && s.tab !== '3d') return;
      const sel = project.data.elements.filter((x) => s.sel.includes(x.id));
      const mod = e.ctrlKey || e.metaKey;
      if ((e.key === 'Delete' || (e.key === 'Backspace' && s.tool.t === 'select')) && sel.length) {
        e.preventDefault();
        setData((dd) => ({ ...dd, elements: dd.elements.filter((x) => !s.sel.includes(x.id)) }));
        s.select([]);
      } else if (mod && e.key.toLowerCase() === 'd' && sel.length) {
        e.preventDefault();
        const off = Math.max(project.data.grid.size, 1000);
        const copies = sel.map((x) => ({ ...translateEl(x, v2(off, -off)), id: uid() }));
        setData((dd) => ({ ...dd, elements: [...dd.elements, ...copies] }));
        s.select(copies.map((c) => c.id));
      } else if (mod && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        const locked = new Set(project.data.layers.filter((l) => l.locked || !l.visible).map((l) => l.id));
        s.select(project.data.elements.filter((x) => !locked.has(x.layer)).map((x) => x.id));
      } else if (!mod && e.key.toLowerCase() === 'r' && sel.length) {
        e.preventDefault();
        const c = selectionCenter(sel);
        const deg = e.shiftKey ? -15 : 15;
        const map = new Map(sel.map((x) => [x.id, rotateEl(x, deg, c)]));
        setData((dd) => ({ ...dd, elements: dd.elements.map((x) => map.get(x.id) ?? x) }));
      } else if (e.key.startsWith('Arrow') && sel.length && s.tab === 'plan') {
        e.preventDefault();
        const g = (project.data.grid.size || 100) * (e.shiftKey ? 10 : 1);
        const dv = e.key === 'ArrowLeft' ? v2(-g, 0) : e.key === 'ArrowRight' ? v2(g, 0) : e.key === 'ArrowUp' ? v2(0, g) : v2(0, -g);
        const map = new Map(sel.map((x) => [x.id, translateEl(x, dv)]));
        setData((dd) => ({ ...dd, elements: dd.elements.map((x) => map.get(x.id) ?? x) }));
      } else if (!mod && e.key.toLowerCase() === 'v') s.setTool({ t: 'select' });
      else if (!mod && e.key.toLowerCase() === 'm') s.setTool({ t: 'measure' });
      else if (e.key === '?') setHelp(true);
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [project, setData]);

  const hasLot = d.elements.some((e) => e.kind === 'lot');
  const tab = ui.tab;
  const setTab = (v: SiteTab) => useSiteUi.setState({ tab: v, tool: { t: 'select' }, measure: null });

  const panel = (
    <SitePanelAside label="חלונית">
      <ModeToggle />
      {project.demo && <div className="notice warn">{Icons.info}<span>פרויקט הדגמה בנתונים לדוגמה בלבד. זה אינו פרויקט מהקורס. אפשר לשנות כל דבר.</span></div>}
      {tab === 'plan' && (
        <>
          {!hasLot && (
            <div className="notice info" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
              <span>מתחילים בגבול המגרש: מלבן במידות מדויקות, או מצולע חופשי.</span>
              <div className="row">
                <button className="btn sm primary" onClick={() => setLotDialog(true)}>{Icons.rect} מגרש מלבני במידות</button>
                <button className="btn sm" onClick={() => useSiteUi.getState().setTool({ t: 'place', kind: 'lot' })}>{Icons.polygon} מצולע חופשי</button>
              </div>
            </div>
          )}
          <ActiveToolPanel />
          {ui.sel.length ? <PropertiesPanel project={project} model={model} setData={setData} /> : (
            <>
              <LibraryPanel />
              <AreasPanel project={project} />
              {ui.advanced && <LayersPanel project={project} setData={setData} />}
              <SettingsPanel project={project} model={model} setData={setData} />
              {hasLot && <button className="btn sm ghost" onClick={() => setLotDialog(true)}>{Icons.plus} מגרש מלבני נוסף במידות</button>}
            </>
          )}
          {!ui.advanced && !ui.sel.length && <span className="small muted">שכבות, נעילה, קואורדינטות והזנת קודקודים זמינות במצב מתקדם.</span>}
        </>
      )}
      {tab === '3d' && (
        <>
          {ui.sel.length ? <PropertiesPanel project={project} model={model} setData={setData} /> : <div className="notice info">{Icons.info}<span>המודל נבנה אוטומטית מהתוכנית ומהקרקע. לחצי על אלמנט כדי לבחור ולערוך אותו; גרירת אלמנט נבחר מזיזה אותו גם בתוכנית.</span></div>}
          <LayersPanel project={project} setData={setData} />
        </>
      )}
      {tab === 'topo' && <TerrainPanel project={project} model={model} setData={setData} />}
      <button className="btn sm ghost" onClick={() => setHelp(true)}>{Icons.keyboard} קיצורי מקלדת</button>
    </SitePanelAside>
  );

  return (
    <div className="site-root">
      <div className="site-tabs" role="tablist" aria-label="אזורי עבודה">
        {TABS.map((t) => (
          <button key={t.v} role="tab" aria-selected={tab === t.v} className={`site-tab ${tab === t.v ? 'on' : ''}`} onClick={() => setTab(t.v)}>{Icons[t.icon]}<span>{t.label}</span></button>
        ))}
        {tab === 'plan' && <label className="check split-toggle hide-mobile"><input type="checkbox" checked={ui.split} onChange={(e) => useSiteUi.setState({ split: e.target.checked })} /><span>תוכנית ותלת־ממד זה לצד זה</span></label>}
      </div>
      {(tab === 'plan' || tab === '3d' || tab === 'topo') && (
        <div className="workspace">
          {panel}
          <section className="stage">
            {tab === 'plan' && <PlanToolbar />}
            {tab === 'topo' && <TopoToolbar />}
            {tab === '3d' ? <Site3D project={project} model={model} setData={setData} /> : (
              ui.split && tab === 'plan' ? (
                <div className="split">
                  <div><PlanEditor project={project} model={model} contours={cont} mode="plan" setData={setData} /></div>
                  <div className="hidden-mobile"><Site3D project={project} model={model} setData={setData} compact /></div>
                </div>
              ) : <PlanEditor project={project} model={model} contours={tab === 'topo' || d.terrain.showContours ? cont : null} mode={tab === 'topo' ? 'topo' : 'plan'} setData={setData} />
            )}
          </section>
        </div>
      )}
      {tab === 'sections' && <SectionsTab project={project} model={model} contours={cont} setData={setData} />}
      {tab === 'sheets' && <SheetsTab project={project} model={model} setData={setData} />}
      {help && <ShortcutsDialog onClose={() => setHelp(false)} />}
      {lotDialog && <NewSiteDialog title="מגרש מלבני במידות" onClose={() => setLotDialog(false)} onSave={(w, h, x, y) => {
        const pts = [v2(x, y), v2(x + w, y), v2(x + w, y + h), v2(x, y + h)];
        setData((dd) => ({ ...dd, elements: [...dd.elements, { id: uid(), kind: 'lot', layer: 'site', name: '', geom: { type: 'area', pts, curved: false }, params: {}, elevMode: 'ground', elev: 0, color: '#ffffff', material: 'none' }] }));
        setLotDialog(false);
      }} />}
    </div>
  );
}

function PlanToolbar() {
  const tool = useSiteUi((s) => s.tool);
  const set = useSiteUi((s) => s.setTool);
  const quick: { kind: string; label: string; icon: keyof typeof Icons }[] = [
    { kind: 'path', label: 'שביל', icon: 'line' },
    { kind: 'lawn', label: 'מדשאה', icon: 'polygon' },
    { kind: 'plaza', label: 'רחבה', icon: 'rect' },
    { kind: 'tree-round', label: 'עץ', icon: 'tree' },
    { kind: 'bench', label: 'ספסל', icon: 'rect' },
    { kind: 'wall', label: 'קיר', icon: 'line' },
    { kind: 'zone', label: 'אזור', icon: 'polygon' },
    { kind: 'dim', label: 'מידה', icon: 'dim' },
    { kind: 'text', label: 'טקסט', icon: 'text' },
  ];
  return (
    <div className="toolbar" role="toolbar" aria-label="כלי תוכנית">
      <button className={`tool ${tool.t === 'select' ? 'on' : ''}`} aria-pressed={tool.t === 'select'} onClick={() => set({ t: 'select' })}>{Icons.select}בחירה</button>
      <span className="tool-sep" />
      {quick.map((q) => (
        <button key={q.kind} className={`tool ${tool.t === 'place' && tool.kind === q.kind ? 'on' : ''}`} aria-pressed={tool.t === 'place' && tool.kind === q.kind} onClick={() => set({ t: 'place', kind: q.kind })}>{Icons[q.icon]}{q.label}</button>
      ))}
      <span className="tool-sep" />
      <button className={`tool ${tool.t === 'measure' ? 'on' : ''}`} aria-pressed={tool.t === 'measure'} onClick={() => set({ t: 'measure' })}>{Icons.ruler}מדידה</button>
      <button className={`tool ${tool.t === 'section' ? 'on' : ''}`} aria-pressed={tool.t === 'section'} onClick={() => set({ t: 'section' })}>{Icons.section}קו חתך</button>
    </div>
  );
}

function TopoToolbar() {
  const tool = useSiteUi((s) => s.tool);
  const set = useSiteUi((s) => s.setTool);
  const b = (t: 'select' | 'hpoint' | 'mound' | 'measure', label: string, icon: keyof typeof Icons) => (
    <button className={`tool ${tool.t === t ? 'on' : ''}`} aria-pressed={tool.t === t} onClick={() => set({ t } as never)}>{Icons[icon]}{label}</button>
  );
  return (
    <div className="toolbar" role="toolbar" aria-label="כלי טופוגרפיה">
      {b('select', 'בחירה', 'select')}
      <span className="tool-sep" />
      {b('hpoint', 'נקודת גובה', 'point')}
      {b('mound', 'גבעה / שקע', 'mountain')}
      <button className={`tool ${tool.t === 'place' && tool.kind === 'terrace' ? 'on' : ''}`} onClick={() => set({ t: 'place', kind: 'terrace' })}>{Icons.layers}משטח במפלס</button>
      {b('measure', 'שיפוע', 'ruler')}
    </div>
  );
}

function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const rows: [string, string][] = [
    ['V', 'כלי בחירה'], ['M', 'מדידה'], ['Esc', 'ביטול השרטוט / סיום הכלי / ביטול הבחירה'], ['Enter', 'סיום שביל, קיר או שטח'],
    ['Backspace', 'מחיקת הנקודה האחרונה בזמן שרטוט'], ['Delete', 'מחיקת הבחירה'], ['Ctrl+D', 'שכפול'], ['Ctrl+A', 'בחירת הכול'],
    ['R / Shift+R', 'סיבוב 15° / ‎-15°'], ['חיצים', 'הזזה במשבצת (עם Shift: פי 10)'], ['Shift+לחיצה', 'הוספה לבחירה'], ['Alt בזמן גרירה', 'בלי הצמדה'],
    ['Ctrl+Z / Ctrl+Y', 'ביטול / שחזור'], ['W A S D, חיצים', 'הליכה במצב סיור'],
  ];
  return (
    <Dialog title="קיצורי מקלדת" onClose={onClose}>
      <table className="area-table"><tbody>{rows.map(([k, v]) => <tr key={k}><td className="num"><kbd>{k}</kbd></td><td>{v}</td></tr>)}</tbody></table>
    </Dialog>
  );
}

export { Seg };

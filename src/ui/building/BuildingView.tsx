// The building and interior design workspace (3.0): tabs, toolbar, side panel and keyboard shortcuts.

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useStore } from '../../document/store';
import { uid } from '../../document/factory';
import type { Project } from '../../document/types';
import { v2 } from '../../geometry/vec';
import { Dialog, Seg, toast } from '../common';
import { Icons } from '../icons';
import { fmtArea } from '../../site/units';
import { SLAB_KIND_LABELS, VIEW_STATE_LABELS, type BuildingData, type SlabKind } from '../../building/types';
import { buildModel, sortedLevels } from '../../building/model';
import { openingDef } from '../../building/openings';
import { deleteIds, duplicateIds, elLevel, rotateIds, selectionCenter, translateIds } from '../../building/edit';
import { PlanEditor, type SetB } from './PlanEditor';
import {
  BModeToggle, BPanelAside, BackgroundPanel, FurnitureLibrary, HouseDialog, LevelsPanel, OpeningPalette, PropertiesPanel,
  RenovationPanel, SettingsPanel, SiteLinkPanel, WallToolPanel, WarningsPanel, createRectHouse,
} from './Panels';
import { TablesTab } from './TablesTab';
import { Building3D } from './Building3D';
import { SectionsTab } from './SectionsTab';
import { SheetsTab } from './SheetsTab';
import { useBldUi, type BTab, type BTool } from './bldUi';

type BProject = Extract<Project, { type: 'building' }>;

const TABS: { v: BTab; label: string; icon: keyof typeof Icons }[] = [
  { v: 'plan', label: 'תוכנית', icon: 'pencil' },
  { v: '3d', label: 'תלת־ממד', icon: 'view3d' },
  { v: 'sections', label: 'חתכים וחזיתות', icon: 'section' },
  { v: 'tables', label: 'טבלאות שטחים וכמויות', icon: 'table' },
  { v: 'sheets', label: 'גיליונות הגשה', icon: 'sheet' },
];

export function BuildingView({ project }: { project: BProject }) {
  const d = project.data;
  const ui = useBldUi();
  const [help, setHelp] = useState(false);
  const [house, setHouse] = useState<null | 'outside' | 'inside'>(null);
  const sorted = sortedLevels(d);
  useEffect(() => { ui.reset(project.id, (sorted.find((l) => l.elevation >= -1) ?? sorted[0]).id, d.renovation); }, [project.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // The active level must exist (it can be deleted, or undo can remove it).
  const levelId = ui.levelId && d.levels.some((l) => l.id === ui.levelId) ? ui.levelId : (sorted.find((l) => l.elevation >= -1) ?? sorted[0]).id;
  useEffect(() => { if (ui.levelId !== levelId) useBldUi.setState({ levelId }); }, [ui.levelId, levelId]);
  // The selection must exist after undo / redo.
  useEffect(() => {
    const ok = ui.sel.filter((id) => elLevel(d, id) !== null);
    if (ok.length !== ui.sel.length) useBldUi.setState({ sel: ok });
  }, [d, ui.sel]);

  const update = useStore((s) => s.update);
  const setData: SetB = useCallback((fn: (dd: BuildingData) => BuildingData, record = true) => update(project.id, (p) => (p.type === 'building' ? { ...p, data: fn(p.data) } : p), record), [update, project.id]);

  const viewState = d.renovation ? ui.state : 'proposed';
  const model = useMemo(() => buildModel(d, viewState), [d, viewState]);

  // Keyboard shortcuts on the computer.
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      if (document.querySelector('.overlay')) return;
      const s = useBldUi.getState();
      if (s.tab !== 'plan' && s.tab !== '3d') return;
      const dd = useStore.getState().projects.find((p) => p.id === project.id);
      if (!dd || dd.type !== 'building') return;
      const data = dd.data;
      const sel = s.sel.filter((id) => elLevel(data, id) !== null);
      const mod = e.ctrlKey || e.metaKey;
      if ((e.key === 'Delete' || (e.key === 'Backspace' && s.tool.t === 'select')) && sel.length) {
        e.preventDefault();
        setData((x) => deleteIds(x, sel));
        s.select([]);
      } else if (mod && e.key.toLowerCase() === 'd' && sel.length) {
        e.preventDefault();
        const off = Math.max(data.grid.size, 500);
        const r = duplicateIds(data, sel, v2(off, -off), uid);
        setData(() => r.data);
        s.select(r.ids);
      } else if (mod && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        const lid = s.levelId;
        const ids = [
          ...data.walls.filter((x) => x.levelId === lid), ...data.rooms.filter((x) => x.levelId === lid), ...data.furniture.filter((x) => x.levelId === lid),
          ...data.stairs.filter((x) => x.levelId === lid), ...data.columns.filter((x) => x.levelId === lid), ...data.beams.filter((x) => x.levelId === lid),
          ...data.slabs.filter((x) => x.levelId === lid), ...data.roofs.filter((x) => x.levelId === lid), ...data.annotations.filter((x) => x.levelId === lid),
        ].map((x) => x.id);
        s.select(ids);
      } else if (!mod && e.key.toLowerCase() === 'r' && sel.length && s.tool.t === 'select') {
        e.preventDefault();
        const deg = e.shiftKey ? 15 : 90;
        setData((x) => rotateIds(x, sel, deg, selectionCenter(x, sel)));
      } else if (e.key.startsWith('Arrow') && sel.length && s.tool.t === 'select') {
        e.preventDefault();
        const g = (data.grid.size || 100) * (e.shiftKey ? 10 : 1);
        const dv = e.key === 'ArrowLeft' ? v2(-g, 0) : e.key === 'ArrowRight' ? v2(g, 0) : e.key === 'ArrowUp' ? v2(0, g) : v2(0, -g);
        setData((x) => translateIds(x, sel, dv));
      } else if (!mod && !e.altKey) {
        const key = e.key.toLowerCase();
        const map: Record<string, BTool> = { v: { t: 'select' }, w: { t: 'wall' }, m: { t: 'measure' }, d: { t: 'opening', kind: 'door' }, n: { t: 'opening', kind: 'window' } };
        if (map[key] && s.tab === 'plan') { s.setTool(map[key]); return; }
        if (e.key === '?') setHelp(true);
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [project.id, setData]);

  const tab = ui.tab;
  const setTab = (v: BTab) => useBldUi.setState({ tab: v, tool: { t: 'select' } });
  const lm = model.levels.find((l) => l.level.id === levelId);
  const empty = !d.walls.length && !d.rooms.length && !d.furniture.length && !d.levels.some((l) => l.background);

  const toolPanel = (): ReactNode => {
    const t = ui.tool;
    if (t.t === 'wall') return <WallToolPanel />;
    if (t.t === 'opening') return <OpeningPalette />;
    if (t.t === 'furniture') return <FurnitureLibrary />;
    if (t.t === 'slab') return (
      <div className="panel-section active-tool">
        <h3>{Icons.slab} משטח: רצפה, מרפסת, תקרה או פתח</h3>
        <Seg value={t.kind} options={(['balcony', 'floor', 'ceiling', 'void'] as SlabKind[]).map((k) => ({ v: k, label: SLAB_KIND_LABELS[k] }))} onChange={(k) => ui.setTool({ t: 'slab', kind: k })} ariaLabel="סוג המשטח" />
        <span className="small muted">לחצי על פינות המשטח וסיימי ב-Enter או בלחיצה על הנקודה הראשונה. "פתח ברצפה" יוצר חלל כפול או מעבר.</span>
      </div>
    );
    if (t.t === 'room' || t.t === 'roomPoly') return (
      <div className="panel-section active-tool">
        <h3>{Icons.room} חדר</h3>
        <label className="field"><span>שם לחדר הבא (ריק = מספור אוטומטי)</span><input className="input" value={ui.presets.roomName} onChange={(e) => useBldUi.setState({ presets: { ...ui.presets, roomName: e.target.value } })} aria-label="שם החדר" placeholder="למשל: סלון" /></label>
        <Seg value={t.t} options={[{ v: 'room', label: 'זיהוי אוטומטי מהקירות' }, { v: 'roomPoly', label: 'מצולע ידני' }]} onChange={(v) => ui.setTool({ t: v } as BTool)} ariaLabel="אופן יצירת החדר" />
        <span className="small muted">{t.t === 'room' ? 'לחצי בתוך אזור שסגור בקירות. אם האזור לא סגור תופיע הודעה, והחדר לא ייווצר.' : 'חלוקה ללא קירות (למשל סלון ומטבח בחלל פתוח): לחצי על הפינות וסיימי ב-Enter.'}</span>
      </div>
    );
    return null;
  };

  const panel = (
    <BPanelAside label="חלונית">
      <BModeToggle />
      {project.demo && <div className="notice warn">{Icons.info}<span>פרויקט הדגמה לימודי בנתונים לדוגמה בלבד. זו אינה תוכנית מאושרת ואינה מהקורס. אפשר לשנות כל דבר.</span></div>}
      {tab === 'plan' && (
        <>
          {empty && ui.tool.t === 'select' && (
            <div className="notice info" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
              <span>איך מתחילים? בחרי אחת מהדרכים:</span>
              <div className="row" style={{ flexWrap: 'wrap' }}>
                <button className="btn sm primary" onClick={() => setHouse('outside')}>{Icons.house} בית חדש במידות חוץ</button>
                <button className="btn sm" onClick={() => setHouse('inside')}>{Icons.room} חדר במידות פנים</button>
                <button className="btn sm" onClick={() => ui.setTool({ t: 'wall' })}>{Icons.wall} שרטוט קירות חופשי</button>
              </div>
              <span className="small">לשיפוץ דירה קיימת: העלי את התוכנית בחלק "תוכנית קיימת (רקע)" למטה, כיילי לפי מידה ידועה ושרטטי מעליה.</span>
            </div>
          )}
          {toolPanel()}
          {ui.sel.length ? <PropertiesPanel project={project} model={model} setData={setData} /> : (
            <>
              <WarningsPanel project={project} model={model} />
              {lm && (lm.walls.length > 0 || lm.rooms.length > 0) && (
                <div className="panel-section">
                  <h3>{Icons.room} שטחים בקומה</h3>
                  <div className="measures">
                    <div><span>ברוטו (כולל קירות)</span><b className="num">{fmtArea(lm.grossArea)}</b></div>
                    <div><span>נטו (סכום החדרים)</span><b className="num">{fmtArea(lm.netArea)}</b></div>
                    <div><span>חדרים סגורים</span><b className="num">{lm.rooms.filter((r) => r.net).length}</b></div>
                  </div>
                  <button className="btn sm ghost" onClick={() => setTab('tables')}>{Icons.table} כל הטבלאות וההסברים</button>
                </div>
              )}
              <LevelsPanel project={project} setData={setData} />
              <RenovationPanel project={project} setData={setData} />
              <BackgroundPanel project={project} setData={setData} />
              <SettingsPanel project={project} setData={setData} />
              <SiteLinkPanel project={project} />
            </>
          )}
        </>
      )}
      {tab === '3d' && (
        <>
          {ui.sel.length ? <PropertiesPanel project={project} model={model} setData={setData} /> : <div className="notice info">{Icons.info}<span>המודל נבנה אוטומטית מהתוכנית: אותם קירות, פתחים, רצפות, מדרגות, גגות וריהוט. לחיצה על אלמנט בוחרת אותו לעריכה; גרירת רהיט נבחר מזיזה אותו גם בתוכנית.</span></div>}
          <LevelsPanel project={project} setData={setData} />
          {d.renovation && <RenovationPanel project={project} setData={setData} />}
        </>
      )}
      <button className="btn sm ghost" onClick={() => setHelp(true)}>{Icons.keyboard} קיצורי מקלדת</button>
    </BPanelAside>
  );

  return (
    <div className="site-root">
      <div className="site-tabs" role="tablist" aria-label="אזורי עבודה">
        {TABS.map((t) => (
          <button key={t.v} role="tab" aria-selected={tab === t.v} className={`site-tab ${tab === t.v ? 'on' : ''}`} onClick={() => setTab(t.v)}>{Icons[t.icon]}<span>{t.label}</span></button>
        ))}
        {tab === 'plan' && <label className="check split-toggle hide-mobile"><input type="checkbox" checked={ui.split} onChange={(e) => useBldUi.setState({ split: e.target.checked })} /><span>תוכנית ותלת־ממד זה לצד זה</span></label>}
      </div>
      {(tab === 'plan' || tab === '3d') && (
        <div className="workspace">
          {panel}
          <section className="stage">
            {tab === 'plan' && <PlanToolbar project={project} levelId={levelId} />}
            {tab === '3d' ? <Building3D project={project} model={model} setData={setData} levelId={levelId} /> : ui.split ? (
              <div className="split">
                <div><PlanEditor project={project} model={model} setData={setData} levelId={levelId} /></div>
                <div className="hidden-mobile"><Building3D project={project} model={model} setData={setData} levelId={levelId} compact /></div>
              </div>
            ) : <PlanEditor project={project} model={model} setData={setData} levelId={levelId} />}
          </section>
        </div>
      )}
      {tab === 'sections' && <SectionsTab project={project} model={model} setData={setData} levelId={levelId} />}
      {tab === 'tables' && <TablesTab project={project} model={model} />}
      {tab === 'sheets' && <SheetsTab project={project} setData={setData} />}
      {help && <ShortcutsDialog onClose={() => setHelp(false)} />}
      {house && <HouseDialog title={house === 'outside' ? 'בית חדש במידות חוץ' : 'חדר במידות פנים'} interior={house === 'inside'} onClose={() => setHouse(null)} onSave={(v) => {
        const r = createRectHouse(d, levelId, v, house === 'inside');
        setData(() => r.data);
        setHouse(null);
        useBldUi.setState({ sel: [r.roomId], tool: { t: 'select' } });
        toast(house === 'outside' ? 'נוצרו ארבעה קירות חיצוניים וחלל המבנה. עכשיו אפשר להוסיף קירות פנים, דלתות וחלונות.' : 'החדר נוצר.');
      }} />}
    </div>
  );
}

function PlanToolbar({ project, levelId }: { project: BProject; levelId: string }) {
  const d = project.data;
  const tool = useBldUi((s) => s.tool);
  const adv = useBldUi((s) => s.advanced);
  const state = useBldUi((s) => s.state);
  const set = useBldUi((s) => s.setTool);
  const b = (t: BTool, label: string, icon: keyof typeof Icons, on: boolean, title?: string) => (
    <button key={label} className={`tool ${on ? 'on' : ''}`} aria-pressed={on} title={title} onClick={() => set(t)}>{Icons[icon]}{label}</button>
  );
  const isOpen = (door: boolean) => tool.t === 'opening' && openingDef(tool.kind).door === door;
  const levels = sortedLevels(d).reverse();
  return (
    <div className="toolbar" role="toolbar" aria-label="כלי תוכנית">
      <select className="input level-pick" value={levelId} onChange={(e) => useBldUi.setState({ levelId: e.target.value, sel: [] })} aria-label="קומה פעילה">
        {levels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
      </select>
      {d.renovation && (
        <select className="input level-pick" value={state} onChange={(e) => useBldUi.setState({ state: e.target.value as typeof state })} aria-label="מצב תצוגה">
          {(['existing', 'demolition', 'proposed', 'compare'] as const).map((s) => <option key={s} value={s}>{VIEW_STATE_LABELS[s]}</option>)}
        </select>
      )}
      <span className="tool-sep" />
      {b({ t: 'select' }, 'בחירה', 'select', tool.t === 'select', 'בחירה והזזה (V)')}
      <span className="tool-sep" />
      {b({ t: 'wall' }, 'קירות', 'wall', tool.t === 'wall', 'שרטוט קירות (W)')}
      {b({ t: 'room' }, 'חדר', 'room', tool.t === 'room' || tool.t === 'roomPoly')}
      {b({ t: 'opening', kind: 'door' }, 'דלת', 'door', isOpen(true), 'דלת (D)')}
      {b({ t: 'opening', kind: 'window' }, 'חלון', 'window', isOpen(false), 'חלון (N)')}
      {b({ t: 'furniture', kind: tool.t === 'furniture' ? tool.kind : 'sofa-3' }, 'ריהוט', 'sofa', tool.t === 'furniture')}
      {b({ t: 'stair' }, 'מדרגות', 'stairs', tool.t === 'stair')}
      {b({ t: 'slab', kind: 'balcony' }, 'מרפסת / משטח', 'slab', tool.t === 'slab')}
      {b({ t: 'roof' }, 'גג', 'roof', tool.t === 'roof')}
      {adv && b({ t: 'column' }, 'עמוד', 'column', tool.t === 'column')}
      {adv && b({ t: 'beam' }, 'קורה', 'line', tool.t === 'beam')}
      <span className="tool-sep" />
      {b({ t: 'dim' }, 'מידה', 'dim', tool.t === 'dim')}
      {b({ t: 'text' }, 'טקסט', 'text', tool.t === 'text')}
      {b({ t: 'measure' }, 'מדידה', 'ruler', tool.t === 'measure', 'מדידה (M)')}
      {b({ t: 'section' }, 'קו חתך', 'section', tool.t === 'section')}
    </div>
  );
}

function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const rows: [string, string][] = [
    ['V', 'כלי בחירה'], ['W', 'שרטוט קירות'], ['D', 'דלת'], ['N', 'חלון'], ['M', 'מדידה'],
    ['Esc', 'ביטול השרטוט / סיום הכלי / ביטול הבחירה'], ['Enter', 'סיום קיר, חדר ידני, משטח או גג'], ['הקלדת מספר + Enter', 'אורך מדויק לקטע הקיר הבא'],
    ['Backspace', 'מחיקת הנקודה האחרונה בזמן שרטוט'], ['Delete', 'מחיקת הבחירה'], ['Ctrl+D', 'שכפול'], ['Ctrl+A', 'בחירת כל האלמנטים בקומה'],
    ['R / Shift+R', 'סיבוב הבחירה ב-90° / ב-15° (בזמן הצבת רהיט: סיבוב הרהיט)'], ['חיצים', 'הזזה במשבצת (עם Shift: פי 10)'], ['Shift+לחיצה', 'הוספה לבחירה'], ['Alt בזמן גרירה', 'בלי הצמדה'],
    ['Ctrl+Z / Ctrl+Y', 'ביטול / שחזור'],
  ];
  return (
    <Dialog title="קיצורי מקלדת" onClose={onClose}>
      <table className="area-table"><tbody>{rows.map(([k, v]) => <tr key={k}><td className="num"><kbd>{k}</kbd></td><td>{v}</td></tr>)}</tbody></table>
    </Dialog>
  );
}

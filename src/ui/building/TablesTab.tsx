// Tables: room areas, levels (net / gross), doors, windows, furniture, walls, floor finishes and counts.
// Every value comes from the same model as the plan, so the tables update with every change.

import type { Project } from '../../document/types';
import { fmt } from '../../geometry/vec';
import { fmtLevel, mToStr } from '../../site/units';
import { Icons } from '../icons';
import { downloadBlob, safeFileName } from '../../storage/storage';
import type { BuildingModel } from '../../building/model';
import { AREA_EXPLAIN, quantities } from '../../building/quantities';
import { useBldUi } from './bldUi';

type BProject = Extract<Project, { type: 'building' }>;

const m2 = (mm2: number) => fmt(mm2 / 1e6, 2);
const m = (mm: number) => mToStr(mm, 2);

export function TablesTab({ project, model }: { project: BProject; model: BuildingModel }) {
  const d = project.data;
  const q = quantities(d, model);
  const state = useBldUi((s) => s.state);
  const go = (levelName: string, id: string) => {
    const l = d.levels.find((x) => x.name === levelName);
    useBldUi.setState({ tab: 'plan', levelId: l?.id ?? null, sel: [id], tool: { t: 'select' } });
  };

  const csv = () => {
    const rows: string[][] = [['טבלה', 'פריט', 'קומה', 'ערך', 'יחידה']];
    for (const r of q.rooms) rows.push(['חדרים', r.name, r.level, r.closed ? m2(r.area) : 'לא סגור', 'מ"ר']);
    for (const l of q.levels) { rows.push(['קומות', 'ברוטו', l.name, m2(l.gross), 'מ"ר']); rows.push(['קומות', 'נטו', l.name, m2(l.net), 'מ"ר']); }
    for (const o of q.openings) rows.push([o.door ? 'דלתות' : 'חלונות', `${o.type} ${m(o.width)}×${m(o.height)}${o.door ? '' : ` סף ${m(o.sill)}`}`, o.level, '1', 'יח׳']);
    for (const f of q.furniture) rows.push(['ריהוט', `${f.label} ${f.detail}`, '', String(f.count), 'יח׳']);
    for (const w of q.walls) rows.push(['קירות', `${w.label} ${fmt(w.thickness, 0)} מ"מ`, '', m(w.length), 'מ׳']);
    for (const f of q.floors) rows.push(['ריצוף', f.label, '', m2(f.area), 'מ"ר']);
    const text = '﻿' + rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\r\n');
    downloadBlob(new Blob([text], { type: 'text/csv;charset=utf-8' }), `${safeFileName(project.name)}-טבלאות.csv`);
  };

  return (
    <div className="bld-tables">
      <div className="tables-inner">
        <div className="notice info">{Icons.info}<span>{AREA_EXPLAIN.disclaimer} {d.renovation && `הטבלאות מציגות את ה${state === 'existing' || state === 'demolition' ? 'מצב הקיים' : 'מצב המוצע'} (לפי התצוגה שנבחרה בתוכנית).`}</span></div>
        <div className="row"><button className="btn sm" onClick={csv}>{Icons.download} ייצוא הטבלאות לקובץ CSV (אקסל)</button></div>

        <section>
          <h3>שטחי קומות: ברוטו ונטו</h3>
          <table className="area-table">
            <thead><tr><th>קומה</th><th className="num">מפלס</th><th className="num">חדרים</th><th className="num">ברוטו (מ״ר)</th><th className="num">נטו (מ״ר)</th><th className="num">קירות וחללים (מ״ר)</th></tr></thead>
            <tbody>{q.levels.map((l) => <tr key={l.id}><td>{l.name}</td><td className="num ltr">{fmtLevel(l.elevation)}</td><td className="num">{l.rooms}</td><td className="num">{m2(l.gross)}</td><td className="num">{m2(l.net)}</td><td className="num">{l.gross > 0 ? m2(Math.max(0, l.gross - l.net)) : '–'}</td></tr>)}</tbody>
            <tfoot><tr><td>סה״כ</td><td /><td /><td className="num">{m2(q.totalGross)}</td><td className="num">{m2(q.totalNet)}</td><td /></tr></tfoot>
          </table>
          <p className="explain"><b>ברוטו:</b> {AREA_EXPLAIN.gross}</p>
          <p className="explain"><b>נטו:</b> {AREA_EXPLAIN.net}</p>
          <p className="explain">{AREA_EXPLAIN.note}</p>
        </section>

        <section>
          <h3>חדרים</h3>
          {q.rooms.length === 0 ? <span className="small muted">אין עדיין חדרים. בתוכנית: כלי "חדר" ולחיצה בתוך אזור סגור בקירות.</span> : (
            <table className="area-table">
              <thead><tr><th>חדר</th><th>קומה</th><th className="num">שטח נטו (מ״ר)</th><th className="num">היקף (מ׳)</th><th>ריצוף</th></tr></thead>
              <tbody>{q.rooms.map((r) => (
                <tr key={r.id}>
                  <td><button className="btn sm ghost" style={{ minHeight: 28, padding: '0 6px' }} onClick={() => go(r.level, r.id)}>{r.name || 'ללא שם'}</button></td>
                  <td>{r.level}</td>
                  <td className="num">{r.closed ? m2(r.area) : <span style={{ color: 'var(--danger)' }}>לא סגור</span>}</td>
                  <td className="num">{r.closed ? m(r.perimeter) : '–'}</td>
                  <td>{r.floor}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </section>

        <section>
          <h3>דלתות</h3>
          <OpeningsTable rows={q.openings.filter((o) => o.door)} door onGo={go} />
        </section>
        <section>
          <h3>חלונות</h3>
          <OpeningsTable rows={q.openings.filter((o) => !o.door)} door={false} onGo={go} />
        </section>

        <section>
          <h3>קירות</h3>
          {q.walls.length === 0 ? <span className="small muted">אין קירות.</span> : (
            <table className="area-table">
              <thead><tr><th>סוג</th><th className="num">עובי (ס״מ)</th><th className="num">מספר</th><th className="num">אורך כולל (מ׳)</th><th className="num">שטח פן אחד (מ״ר)</th></tr></thead>
              <tbody>{q.walls.map((w) => <tr key={w.key}><td>{w.label}</td><td className="num">{fmt(w.thickness / 10, 1)}</td><td className="num">{w.count}</td><td className="num">{m(w.length)}</td><td className="num">{m2(w.faceArea)}</td></tr>)}</tbody>
            </table>
          )}
          <p className="explain">{AREA_EXPLAIN.walls}</p>
        </section>

        <section>
          <h3>ריצוף וחיפוי רצפה</h3>
          {q.floors.length === 0 ? <span className="small muted">אין חדרים סגורים.</span> : (
            <table className="area-table">
              <thead><tr><th>חומר</th><th className="num">חדרים</th><th className="num">שטח (מ״ר)</th></tr></thead>
              <tbody>{q.floors.map((f) => <tr key={f.key}><td>{f.label}</td><td className="num">{f.rooms}</td><td className="num">{m2(f.area)}</td></tr>)}</tbody>
            </table>
          )}
          <p className="explain">{AREA_EXPLAIN.floors}</p>
        </section>

        <section>
          <h3>ריהוט וציוד</h3>
          {q.furniture.length === 0 ? <span className="small muted">אין ריהוט.</span> : (
            <table className="area-table">
              <thead><tr><th>פריט</th><th>מידות (רוחב×עומק×גובה)</th><th className="num">כמות</th></tr></thead>
              <tbody>{q.furniture.map((f) => <tr key={f.key}><td>{f.label}</td><td className="ltr" style={{ textAlign: 'start' }}>{f.detail}</td><td className="num">{f.count}</td></tr>)}</tbody>
            </table>
          )}
        </section>

        <section>
          <h3>ספירת אלמנטים</h3>
          <table className="area-table"><tbody>{q.counts.map((c) => <tr key={c.key}><td>{c.label}</td><td className="num">{c.count}</td></tr>)}</tbody></table>
        </section>
      </div>
    </div>
  );
}

function OpeningsTable({ rows, door, onGo }: { rows: ReturnType<typeof quantities>['openings']; door: boolean; onGo: (level: string, id: string) => void }) {
  if (!rows.length) return <span className="small muted">{door ? 'אין דלתות.' : 'אין חלונות.'}</span>;
  return (
    <table className="area-table">
      <thead><tr><th>#</th><th>סוג</th><th>קומה</th><th className="num">רוחב (מ׳)</th><th className="num">גובה (מ׳)</th>{!door && <th className="num">גובה סף (מ׳)</th>}</tr></thead>
      <tbody>{rows.map((o, i) => (
        <tr key={o.id}>
          <td><button className="btn sm ghost" style={{ minHeight: 28, padding: '0 6px' }} onClick={() => onGo(o.level, o.id)}>{door ? 'D' : 'W'}{i + 1}</button></td>
          <td>{o.type}</td><td>{o.level}</td><td className="num">{m(o.width)}</td><td className="num">{m(o.height)}</td>{!door && <td className="num">{m(o.sill)}</td>}
        </tr>
      ))}</tbody>
      <tfoot><tr><td>סה״כ</td><td>{rows.length}</td><td /><td /><td />{!door && <td />}</tr></tfoot>
    </table>
  );
}

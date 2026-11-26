import { useState } from 'react';
import { LINE_STYLE_LABELS, type DrawingElement, type LineStyle } from '../../document/types';
import { ELEMENT_LABELS, rotate, scaleEl } from '../../drawing/elements';
import { fmtLen } from '../../drawing/dimension';
import { type Vec2, v2, dist2 } from '../../geometry/vec';
import { NumberField } from '../common';
import { Icons } from '../icons';

const WIDTHS = [0.13, 0.18, 0.25, 0.35, 0.5, 0.7, 1.0];

interface Props {
  el: DrawingElement;
  unit: string;
  onChange: (e: DrawingElement, record: boolean) => void;
  onStart: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onClose: () => void;
}

function PointFields({ label, p, unit, set }: { label: string; p: Vec2; unit: string; set: (p: Vec2) => void }) {
  return (
    <div className="grid2">
      <NumberField label={`${label} X`} unit={unit} value={p.x} allowEmpty={false} onChange={(v) => v !== null && set(v2(v, p.y))} />
      <NumberField label={`${label} Y`} unit={unit} value={p.y} allowEmpty={false} onChange={(v) => v !== null && set(v2(p.x, v))} />
    </div>
  );
}

export function PropertiesPanel({ el, unit, onChange, onDelete, onDuplicate, onClose }: Props) {
  const [angle, setAngle] = useState<number | null>(90);
  const [factor, setFactor] = useState<number | null>(2);
  const set = (patch: Partial<DrawingElement>) => onChange({ ...el, ...patch } as DrawingElement, true);

  let fields: React.ReactNode = null;
  switch (el.kind) {
    case 'point':
      fields = (
        <>
          <PointFields label="" p={el.p} unit={unit} set={(p) => set({ p })} />
          <label className="field"><span>תווית</span><input className="input" value={el.label} onChange={(e) => set({ label: e.target.value })} /></label>
        </>
      );
      break;
    case 'line': {
      const len = dist2(el.a, el.b);
      const ang = (Math.atan2(el.b.y - el.a.y, el.b.x - el.a.x) * 180) / Math.PI;
      fields = (
        <>
          <PointFields label="התחלה" p={el.a} unit={unit} set={(a) => set({ a })} />
          <PointFields label="סוף" p={el.b} unit={unit} set={(b) => set({ b })} />
          <div className="grid2">
            <NumberField label="אורך" unit={unit} value={len} min={0.0001} allowEmpty={false}
              onChange={(v) => { if (!v || len === 0) return; const k = v / len; set({ b: v2(el.a.x + (el.b.x - el.a.x) * k, el.a.y + (el.b.y - el.a.y) * k) }); }} />
            <NumberField label="זווית" unit="°" value={ang} allowEmpty={false}
              onChange={(v) => { if (v === null) return; const r = (v * Math.PI) / 180; set({ b: v2(el.a.x + Math.cos(r) * len, el.a.y + Math.sin(r) * len) }); }} />
          </div>
        </>
      );
      break;
    }
    case 'rect':
      fields = (
        <>
          <div className="grid2">
            <NumberField label="רוחב" unit={unit} value={el.w} min={0.0001} allowEmpty={false} onChange={(v) => v && set({ w: v })} />
            <NumberField label="גובה" unit={unit} value={el.h} min={0.0001} allowEmpty={false} onChange={(v) => v && set({ h: v })} />
          </div>
          <PointFields label="פינה" p={v2(el.x, el.y)} unit={unit} set={(p) => set({ x: p.x, y: p.y })} />
          <NumberField label="זווית סיבוב" unit="°" value={el.angle} allowEmpty={false} onChange={(v) => v !== null && set({ angle: v })} />
          <div className="small muted">שטח: <span className="num">{fmtLen(el.w * el.h)}</span> {unit}²</div>
        </>
      );
      break;
    case 'circle':
      fields = (
        <>
          <PointFields label="מרכז" p={el.c} unit={unit} set={(c) => set({ c })} />
          <div className="grid2">
            <NumberField label="רדיוס" unit={unit} value={el.r} min={0.0001} allowEmpty={false} onChange={(v) => v && set({ r: v })} />
            <NumberField label="קוטר" unit={unit} value={el.r * 2} min={0.0001} allowEmpty={false} onChange={(v) => v && set({ r: v / 2 })} />
          </div>
        </>
      );
      break;
    case 'polygon':
      fields = (
        <>
          {el.pts.map((p, i) => (
            <PointFields key={i} label={`קודקוד ${i + 1}`} p={p} unit={unit} set={(q) => set({ pts: el.pts.map((x, j) => (j === i ? q : x)) })} />
          ))}
          <div className="small muted">צלעות: {el.pts.map((p, i) => (i < el.pts.length - 1 || el.closed ? fmtLen(dist2(p, el.pts[(i + 1) % el.pts.length])) : null)).filter(Boolean).join(' · ')}</div>
        </>
      );
      break;
    case 'text':
      fields = (
        <>
          <label className="field"><span>טקסט</span><input className="input" value={el.text} onChange={(e) => e.target.value.trim() && set({ text: e.target.value })} /></label>
          <NumberField label="גובה אותיות בהדפסה" unit="מ״מ" value={el.size} min={0.5} max={50} allowEmpty={false} onChange={(v) => v && set({ size: v })} />
          <PointFields label="מיקום" p={el.p} unit={unit} set={(p) => set({ p })} />
        </>
      );
      break;
    case 'dim':
      fields = (
        <>
          <PointFields label="התחלה" p={el.a} unit={unit} set={(a) => set({ a })} />
          <PointFields label="סוף" p={el.b} unit={unit} set={(b) => set({ b })} />
          <NumberField label="מרחק קו המידה מהאלמנט" unit={unit} value={el.offset} allowEmpty={false} onChange={(v) => v !== null && set({ offset: v })} />
          <div className="small">המידה: <span className="num">{fmtLen(dist2(el.a, el.b))}</span> {unit}</div>
        </>
      );
      break;
  }

  return (
    <div className="panel-section">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h3>{ELEMENT_LABELS[el.kind]} נבחר</h3>
        <button className="btn sm ghost icon" aria-label="ביטול הבחירה" onClick={onClose}>{Icons.close}</button>
      </div>
      {fields}
      {el.kind !== 'text' && el.kind !== 'point' && (
        <div className="grid2">
          <label className="field"><span>סוג קו</span>
            <select className="input" value={el.style} onChange={(e) => set({ style: e.target.value as LineStyle })}>
              {(Object.keys(LINE_STYLE_LABELS) as LineStyle[]).map((s) => <option key={s} value={s}>{LINE_STYLE_LABELS[s]}</option>)}
            </select>
          </label>
          <label className="field"><span>עובי קו (מ״מ)</span>
            <select className="input" value={el.width} onChange={(e) => set({ width: Number(e.target.value) })}>
              {WIDTHS.map((w) => <option key={w} value={w}>{w}</option>)}
            </select>
          </label>
        </div>
      )}
      {el.kind !== 'point' && el.kind !== 'text' && (
        <>
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}><NumberField label="סיבוב" unit="°" value={angle} onChange={setAngle} /></div>
            <button className="btn" disabled={angle === null} onClick={() => angle !== null && onChange(rotate(el, angle), true)}>{Icons.rotate} סובבי</button>
          </div>
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}><NumberField label="שינוי גודל (פי)" value={factor} min={0.0001} onChange={setFactor} /></div>
            <button className="btn" disabled={!factor} onClick={() => factor && onChange(scaleEl(el, factor), true)}>{Icons.fit} שני גודל</button>
          </div>
        </>
      )}
      <div className="row">
        <button className="btn" onClick={onDuplicate}>{Icons.copy} שכפול</button>
        <button className="btn danger" onClick={onDelete}>{Icons.trash} מחיקה</button>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { Dialog } from '../common';
import { fmtArea, fmtM } from '../../site/units';
import { MField } from './fields';

/** Rectangular lot with exact dimensions. */
export function NewSiteDialog({ title, onClose, onSave }: { title: string; onClose: () => void; onSave: (w: number, h: number, x: number, y: number) => void }) {
  const [w, setW] = useState<number | null>(null);
  const [h, setH] = useState<number | null>(null);
  const [x, setX] = useState<number | null>(0);
  const [y, setY] = useState<number | null>(0);
  const ok = !!w && !!h && w > 0 && h > 0 && x !== null && y !== null;
  return (
    <Dialog title={title} onClose={onClose}>
      <div className="grid2">
        <MField label="רוחב (לאורך X)" value={w} onChange={setW} min={100} placeholder="למשל 60" />
        <MField label="עומק (לאורך Y)" value={h} onChange={setH} min={100} placeholder="למשל 40" />
        <MField label="פינה שמאלית-תחתונה X" value={x} allowNegative onChange={setX} />
        <MField label="פינה שמאלית-תחתונה Y" value={y} allowNegative onChange={setY} />
      </div>
      {ok && <div className="small">שטח: <span className="num">{fmtArea(w! * h!)}</span> · היקף: <span className="num">{fmtM(2 * (w! + h!))}</span></div>}
      <div className="btns">
        <button className="btn primary" disabled={!ok} onClick={() => onSave(w!, h!, x!, y!)}>יצירת המגרש</button>
        <button className="btn" onClick={onClose}>ביטול</button>
      </div>
    </Dialog>
  );
}

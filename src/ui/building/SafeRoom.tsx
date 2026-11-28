// 4.0: dialog of the study template of a protected room (ממ״ד). Demonstration sizes only, with a clear notice.

import { useState } from 'react';
import { uid } from '../../document/factory';
import type { Project } from '../../document/types';
import { Check, Dialog, toast } from '../common';
import { MField } from '../site/fields';
import { levelOf } from '../../building/model';
import { addSafeRoom, SAFE_ROOM_DEMO, SAFE_ROOM_NOTE } from '../../building/safeRoom';
import { levelBox } from '../../building/render/plan';
import { buildModel } from '../../building/model';
import { useBldUi } from './bldUi';
import type { SetB } from './PlanEditor';

type BProject = Extract<Project, { type: 'building' }>;

export function SafeRoomDialog({ project, levelId, setData, onClose }: { project: BProject; levelId: string; setData: SetB; onClose: () => void }) {
  const d = project.data;
  const [o, setO] = useState(() => {
    // Beside what is already drawn on the level, so nothing overlaps.
    const b = levelBox(d, buildModel(d), levelId, false);
    const x = Number.isFinite(b.maxX) && b.maxX > -1e8 ? Math.round((b.maxX + 1500) / 100) * 100 : 0;
    const y = Number.isFinite(b.minY) && b.minY < 1e8 ? Math.round(b.minY / 100) * 100 : 0;
    return { ...SAFE_ROOM_DEMO, x, y };
  });
  return (
    <Dialog title="ממ״ד לימודי – תבנית להמחשה" onClose={onClose}>
      <div className="note-demo">{SAFE_ROOM_NOTE}</div>
      <div className="grid2" style={{ marginTop: 8 }}>
        <MField label="רוחב פנים (ערך הדגמה)" value={o.w} min={1000} max={8000} onChange={(v) => setO({ ...o, w: v })} />
        <MField label="עומק פנים (ערך הדגמה)" value={o.d} min={1000} max={8000} onChange={(v) => setO({ ...o, d: v })} />
        <MField label="עובי קירות (ערך הדגמה)" value={o.t} min={100} max={800} onChange={(v) => setO({ ...o, t: v })} />
      </div>
      <Check checked={o.furnish} onChange={(v) => setO({ ...o, furnish: v })}>הוספת ריהוט וסימונים להמחשה (מיטה, פתח אוורור, שלט)</Check>
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn primary" onClick={() => {
          const r = addSafeRoom(d, levelOf(d, levelId), o, uid);
          setData(() => r.data);
          useBldUi.setState({ sel: [r.roomId], tool: { t: 'select' } });
          toast('נוצרה תבנית ממ״ד להמחשה. כל המידות ניתנות לעריכה.');
          onClose();
        }}>יצירת התבנית</button>
        <button className="btn ghost" onClick={onClose}>ביטול</button>
      </div>
    </Dialog>
  );
}

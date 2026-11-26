import { useEffect, useRef, useState } from 'react';
import type { BackgroundImage } from '../../document/types';
import { Dialog, toast } from '../common';
import { Icons } from '../icons';
import { transformImage, UploadError, type LoadedImage } from '../imageTools';

/** Rotate (90 degree steps + fine angle) and crop the background image. */
export function ImageEditDialog({ bg, onClose, onSave }: { bg: BackgroundImage; onClose: () => void; onSave: (img: LoadedImage) => void }) {
  const [quarter, setQuarter] = useState(0);
  const [fine, setFine] = useState(0);
  const [preview, setPreview] = useState<LoadedImage | null>(null);
  const [crop, setCrop] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const angle = quarter * 90 + fine;
  const src: LoadedImage = { dataUrl: bg.dataUrl, w: bg.pxW, h: bg.pxH };

  useEffect(() => {
    let alive = true;
    const t = setTimeout(async () => {
      const p = await transformImage(src, angle, null);
      if (alive) { setPreview(p); setCrop(null); }
    }, 120);
    return () => { alive = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [angle, bg.dataUrl]);

  const toImgPx = (e: React.PointerEvent) => {
    const r = imgRef.current!.getBoundingClientRect();
    const k = (preview?.w ?? 1) / r.width;
    return { x: Math.min(Math.max(0, (e.clientX - r.left) * k), preview!.w), y: Math.min(Math.max(0, (e.clientY - r.top) * k), preview!.h) };
  };

  const save = async () => {
    setBusy(true);
    try {
      const out = await transformImage(src, angle, crop && crop.w > 10 && crop.h > 10 ? crop : null);
      onSave(out);
    } catch (e) {
      toast(e instanceof UploadError ? e.message : 'לא ניתן לעבד את התמונה.');
    } finally {
      setBusy(false);
    }
  };

  const [shownW, setShownW] = useState(0);
  useEffect(() => {
    const el = imgRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setShownW(el.getBoundingClientRect().width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [preview]);
  const scaleK = preview && shownW ? shownW / preview.w : 1;

  return (
    <Dialog title="סיבוב וחיתוך התמונה" onClose={onClose}>
      <div className="row">
        <button className="btn" onClick={() => setQuarter((q) => (q + 3) % 4)}><span style={{ transform: 'scaleX(-1)', display: 'inline-flex' }}>{Icons.rotate}</span> 90° שמאלה</button>
        <button className="btn" onClick={() => setQuarter((q) => (q + 1) % 4)}>{Icons.rotate} 90° ימינה</button>
      </div>
      <label className="field"><span>יישור עדין: <span className="num">{fine.toFixed(1)}°</span></span>
        <input type="range" min={-20} max={20} step={0.1} value={fine} onChange={(e) => setFine(Number(e.target.value))} aria-label="יישור עדין" />
      </label>
      <div className="small muted">לחיתוך: גררי מלבן על התמונה. בלי מלבן, התמונה נשמרת כולה.</div>
      <div style={{ background: '#eee', borderRadius: 8, padding: 8, textAlign: 'center', overflow: 'hidden' }}>
        {preview ? (
          <div style={{ position: 'relative', display: 'inline-block', touchAction: 'none', userSelect: 'none', verticalAlign: 'top' }}
            onPointerDown={(e) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); const p = toImgPx(e); dragStart.current = p; setCrop({ x: p.x, y: p.y, w: 0, h: 0 }); }}
            onPointerMove={(e) => { if (!dragStart.current) return; const p = toImgPx(e); const s0 = dragStart.current; setCrop({ x: Math.min(s0.x, p.x), y: Math.min(s0.y, p.y), w: Math.abs(p.x - s0.x), h: Math.abs(p.y - s0.y) }); }}
            onPointerUp={() => (dragStart.current = null)}>
            <img ref={imgRef} src={preview.dataUrl} alt="תצוגה מקדימה" style={{ display: 'block', maxWidth: '100%', maxHeight: '50vh', width: 'auto', height: 'auto' }} draggable={false} />
            {crop && crop.w > 2 && (
              <div style={{ position: 'absolute', left: crop.x * scaleK, top: crop.y * scaleK, width: crop.w * scaleK, height: crop.h * scaleK, border: '2px solid #e8590c', boxShadow: '0 0 0 9999px rgba(0,0,0,0.35)', pointerEvents: 'none' }} />
            )}
          </div>
        ) : <div style={{ padding: 40 }}>מעבד…</div>}
      </div>
      <div className="notice warn">{Icons.warn}<span>שינוי התמונה מבטל את הכיול. אחרי השמירה יש לכייל מחדש.</span></div>
      <div className="btns">
        <button className="btn primary" disabled={busy || !preview} onClick={save}>{busy ? 'שומר…' : 'שמירה'}</button>
        {crop && <button className="btn" onClick={() => setCrop(null)}>ביטול החיתוך</button>}
        <button className="btn" onClick={onClose}>ביטול</button>
      </div>
    </Dialog>
  );
}

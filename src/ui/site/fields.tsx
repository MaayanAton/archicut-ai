import { useEffect, useRef, useState } from 'react';
import { mmToMetersText, parseMetersToMm } from '../../site/units';
import { parseNum } from '../common';

interface Props {
  /** Value in millimetres. */
  value: number | null;
  onChange: (mm: number) => void;
  label?: string;
  unit?: string;
  min?: number;
  max?: number;
  ariaLabel?: string;
  placeholder?: string;
  /** 'm': typed in metres, stored in mm. 'n': plain number. 'deg': degrees. */
  kind?: 'm' | 'n' | 'deg';
  integer?: boolean;
  allowNegative?: boolean;
  onFocus?: () => void;
}

/** Number field for the site module. Lengths are typed in metres and stored exactly in millimetres. */
export function MField({ value, onChange, label, unit, min, max, ariaLabel, placeholder, kind = 'm', integer, allowNegative = false, onFocus }: Props) {
  const toText = (v: number | null) => (kind === 'm' ? mmToMetersText(v) : v === null || !Number.isFinite(v) ? '' : String(Number(v.toFixed(4))));
  const [text, setText] = useState(toText(value));
  const [bad, setBad] = useState<string | null>(null);
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setText(toText(value)); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  const commit = (t: string) => {
    const raw = kind === 'm' ? parseMetersToMm(t) : parseNum(t);
    if (raw === null) { setBad('שדה חובה'); return; }
    if (raw === 'invalid') { setBad('מספר לא תקין'); return; }
    let v = raw;
    if (integer && !Number.isInteger(v)) { setBad('מספר שלם בלבד'); return; }
    if (!allowNegative && v < 0 && (min === undefined || min >= 0)) { setBad('ערך שלילי אינו אפשרי'); return; }
    if (min !== undefined && v < min) { setBad(`מינימום ${kind === 'm' ? mmToMetersText(min) : min}`); return; }
    if (max !== undefined && v > max) { setBad(`מקסימום ${kind === 'm' ? mmToMetersText(max) : max}`); return; }
    setBad(null);
    if (kind === 'deg') v = ((v % 360) + 540) % 360 - 180;
    if (v !== value) onChange(v);
  };
  const u = unit ?? (kind === 'm' ? 'מ׳' : kind === 'deg' ? '°' : undefined);
  const input = (
    <div className={u ? 'input-unit' : undefined}>
      <input className={`input numeric ${bad ? 'invalid' : ''}`} inputMode="decimal" value={text} aria-label={ariaLabel ?? label} placeholder={placeholder}
        aria-invalid={!!bad} title={bad ?? undefined}
        onFocus={() => { focused.current = true; onFocus?.(); }}
        onChange={(e) => { setText(e.target.value); commit(e.target.value); }}
        onBlur={() => { focused.current = false; setBad(null); setText(toText(value)); }} />
      {u && <span className="unit">{u}</span>}
    </div>
  );
  return (
    <label className="field">
      {label && <span>{label}</span>}
      {input}
      {bad && <span className="small" style={{ color: 'var(--danger)' }}>{bad}</span>}
    </label>
  );
}

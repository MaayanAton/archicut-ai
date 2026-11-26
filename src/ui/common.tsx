import { useEffect, useRef, useState, type ReactNode } from 'react';
import { create } from 'zustand';
import { Icons } from './icons';

/** Parses user input. Accepts comma as decimal separator. Empty -> null. */
export function parseNum(s: string): number | null | 'invalid' {
  const t = s.trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : 'invalid';
}

const show = (v: number | null) => (v === null || !Number.isFinite(v) ? '' : String(Number(v.toFixed(4))));

interface NumProps {
  value: number | null;
  onChange: (v: number | null) => void;
  label?: string;
  unit?: string;
  allowEmpty?: boolean;
  min?: number;
  max?: number;
  className?: string;
  ariaLabel?: string;
  placeholder?: string;
}

/** Number field that never fills in a value by itself. An empty field stays empty and is shown as missing. */
export function NumberField({ value, onChange, label, unit, allowEmpty = true, min, max, className, ariaLabel, placeholder }: NumProps) {
  const [text, setText] = useState(show(value));
  const [bad, setBad] = useState(false);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(show(value));
  }, [value]);
  const commit = (t: string) => {
    const n = parseNum(t);
    if (n === 'invalid' || (n === null && !allowEmpty) || (typeof n === 'number' && ((min !== undefined && n < min) || (max !== undefined && n > max)))) {
      setBad(true);
      return;
    }
    setBad(false);
    if (n !== value) onChange(n);
  };
  const input = (
    <div className={unit ? 'input-unit' : undefined}>
      <input
        className={`input numeric ${bad ? 'invalid' : value === null ? 'missing' : ''} ${className ?? ''}`}
        inputMode="decimal"
        value={text}
        aria-label={ariaLabel ?? label}
        placeholder={placeholder ?? (value === null ? 'חסר' : undefined)}
        onFocus={() => (focused.current = true)}
        onChange={(e) => {
          setText(e.target.value);
          commit(e.target.value);
        }}
        onBlur={() => {
          focused.current = false;
          if (!bad) setText(show(value));
        }}
      />
      {unit && <span className="unit">{unit}</span>}
    </div>
  );
  if (!label) return input;
  return (
    <label className="field">
      <span>{label}</span>
      {input}
    </label>
  );
}

export function Seg<T extends string | number>({ value, options, onChange, ariaLabel }: { value: T; options: { v: T; label: ReactNode }[]; onChange: (v: T) => void; ariaLabel?: string }) {
  return (
    <div className="seg" role="radiogroup" aria-label={ariaLabel}>
      {options.map((o) => (
        <button key={String(o.v)} type="button" role="radio" aria-checked={o.v === value} className={o.v === value ? 'on' : ''} onClick={() => onChange(o.v)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Check({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{children}</span>
    </label>
  );
}

export function Dialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2>{title}</h2>
          <button className="btn ghost icon" onClick={onClose} aria-label="סגירה">{Icons.close}</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ----- Confirm dialog and toast, usable from anywhere -----

interface UiState {
  confirm: { title: string; text: string; ok: string; danger?: boolean; resolve: (v: boolean) => void } | null;
  toast: string | null;
}
export const useUi = create<UiState>(() => ({ confirm: null, toast: null }));

export function confirmDialog(title: string, text: string, ok = 'אישור', danger = false): Promise<boolean> {
  return new Promise((resolve) => useUi.setState({ confirm: { title, text, ok, danger, resolve } }));
}

let toastTimer: ReturnType<typeof setTimeout> | null = null;
export function toast(msg: string) {
  useUi.setState({ toast: msg });
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => useUi.setState({ toast: null }), 3500);
}

export function UiLayer() {
  const { confirm, toast: t } = useUi();
  const close = (v: boolean) => {
    confirm?.resolve(v);
    useUi.setState({ confirm: null });
  };
  return (
    <>
      {confirm && (
        <Dialog title={confirm.title} onClose={() => close(false)}>
          <p style={{ margin: 0 }}>{confirm.text}</p>
          <div className="btns">
            <button className={`btn ${confirm.danger ? 'danger solid' : 'primary'}`} onClick={() => close(true)} autoFocus>{confirm.ok}</button>
            <button className="btn" onClick={() => close(false)}>ביטול</button>
          </div>
        </Dialog>
      )}
      {t && <div className="toast" role="status">{t}</div>}
    </>
  );
}

export const fmtDate = (ms: number) =>
  new Date(ms).toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: 'numeric' });

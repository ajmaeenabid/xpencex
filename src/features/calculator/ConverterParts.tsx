import { useEffect, useRef } from 'react';
import { Delete } from 'lucide-react';
import { cn } from '../../shared/lib/utils';
import { useI18n } from '../../shared/i18n';
import { PadKey, formatTyped } from './finance';
import { clearKey, digitKey, operatorKey } from './keyStyles';

const KEYBOARD: Record<string, PadKey> = { '.': '.', ',': '.', Backspace: 'DEL', Delete: 'C' };

/** Lets a computer's keyboard type into the on-screen keypad */
export function useKeyboard(onKey: (key: PadKey) => void, onEnter?: () => void, enabled = true) {
  const latest = useRef({ onKey, onEnter });
  latest.current = { onKey, onEnter };
  useEffect(() => {
    if (!enabled) return;
    const handle = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input,textarea,[role="listbox"],[role="combobox"]')) return;
      if (e.key === 'Enter' && latest.current.onEnter) {
        e.preventDefault();
        latest.current.onEnter();
        return;
      }
      const key = /^\d$/.test(e.key) ? (e.key as PadKey) : KEYBOARD[e.key];
      if (key) {
        e.preventDefault();
        latest.current.onKey(key);
      }
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [enabled]);
}

/** The number keys for a converter. It fills whatever space is left, so the window keeps its size. */
export function Keypad({ onKey, decimals = true }: { onKey: (key: PadKey) => void; decimals?: boolean }) {
  const { t } = useI18n();
  const digit = (d: PadKey) => (
    <button key={d} type="button" onClick={() => onKey(d)} className={digitKey}>{d}</button>
  );
  return (
    <div className="flex-1 min-h-0 grid grid-cols-4 gap-2" style={{ gridTemplateRows: 'repeat(4, minmax(0, 1fr))' }}>
      {digit('7')}{digit('8')}{digit('9')}
      <button type="button" onClick={() => onKey('C')} aria-label={t('calc.clear')} className={cn(clearKey, 'row-span-2')}>C</button>
      {digit('4')}{digit('5')}{digit('6')}
      {digit('1')}{digit('2')}{digit('3')}
      <button type="button" onClick={() => onKey('DEL')} aria-label={t('calc.delete')} className={cn(operatorKey, 'row-span-2')}>
        <Delete size={22} className="mx-auto" />
      </button>
      {digit('00')}{digit('0')}
      <button type="button" disabled={!decimals} onClick={() => onKey('.')} aria-label={t('calc.point')} className={digitKey}>.</button>
    </div>
  );
}

/** A number box that's filled in with the keypad: label on the left, value on the right */
export function NumberField({ id, label, value, active, onTap, compact }: {
  id: string;
  label: string;
  value: string;
  active: boolean;
  onTap: () => void;
  compact?: boolean;
}) {
  return (
    <button
      id={id}
      type="button"
      onClick={onTap}
      aria-pressed={active}
      aria-label={`${label}: ${value || '0'}`}
      className={cn(
        'w-full h-11 shrink-0 flex items-center justify-between gap-2 px-3.5 rounded-xl border transition-colors bg-background/60',
        active ? 'border-indigo-500 ring-2 ring-indigo-600/20' : 'border-card-border',
      )}
    >
      <span className={cn('font-semibold text-muted truncate', compact ? 'text-[11px]' : 'text-xs')}>{label}</span>
      <span className={cn('flex items-center font-bold tabular-nums truncate', compact ? 'text-sm' : 'text-base', active ? 'text-indigo-700 dark:text-indigo-300' : 'text-foreground')}>
        {formatTyped(value) || <span className="text-muted/60">0</span>}
        {active && <span aria-hidden="true" className="ml-0.5 w-0.5 h-4 bg-indigo-500 animate-pulse" />}
      </span>
    </button>
  );
}

export function ResultRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-xs font-semibold text-muted">{label}</span>
      <span className={cn('font-bold tabular-nums text-right break-all', strong ? 'text-2xl text-indigo-700 dark:text-indigo-300' : 'text-sm text-foreground')}>{value}</span>
    </div>
  );
}

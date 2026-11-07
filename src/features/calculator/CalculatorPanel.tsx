import { useEffect, useRef, useState } from 'react';
import { Check, Copy, Delete, History, ReceiptText, SquareFunction } from 'lucide-react';
import { copyText } from '../../shared/lib/clipboard';
import { cn } from '../../shared/lib/utils';
import { useI18n } from '../../shared/i18n';
import { CalcState, Key, evaluate, formatExpr, formatNumber, press, toPlain, usesScience } from './calculator';
import { HistoryEntry, addHistory, isWorthKeeping, loadHistory, saveHistory } from './history';
import { clearKey, digitKey, equalsKey, functionKey, operatorKey } from './keyStyles';

const round2 = (n: number) => Math.round(n * 100) / 100;

// Keyboard keys on a computer
const KEYBOARD: Record<string, Key> = {
  '+': '+', '-': '−', '*': '×', x: '×', '/': '÷', '.': '.', ',': '.',
  Enter: '=', '=': '=', Backspace: 'DEL', Delete: 'AC',
  '%': '%', '(': '(', ')': ')', '^': '^', '!': '!',
};

interface Props {
  state: CalcState;
  setState: React.Dispatch<React.SetStateAction<CalcState>>;
  uid: string;
  onClose: () => void;
  onSaveExpense: (amount: number) => void;
}

type PadKey = { id: string; label: React.ReactNode; className: string; aria?: string; onPress: () => void; pressed?: boolean };

const superscript = (base: string, top: string) => <>{base}<sup className="text-[0.7em]">{top}</sup></>;

/** The Calculator tab: display, keypad and "Save as expense" */
export default function CalculatorPanel({ state, setState, uid, onClose, onSaveExpense }: Props) {
  const { t } = useI18n();
  const [inverse, setInverse] = useState(false); // the 2nd key: sin, cos and tan become sin⁻¹, cos⁻¹ and tan⁻¹
  const [history, setHistory] = useState<HistoryEntry[]>(() => loadHistory(uid));
  const [showHistory, setShowHistory] = useState(false);
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<number | null>(null);
  // The keyboard listener lives on, so it needs the latest of these rather than the ones it started with
  const latest = useRef({ state, history });
  latest.current = { state, history };

  useEffect(() => () => { if (copiedTimer.current) window.clearTimeout(copiedTimer.current); }, []);

  const updateHistory = (list: HistoryEntry[]) => {
    setHistory(list);
    saveHistory(uid, list);
  };

  const tap = (key: Key) => {
    setShowHistory(false);
    if (key === '=') {
      const { expr, angle } = latest.current.state;
      const answer = evaluate(expr, angle);
      if (typeof answer === 'number' && isWorthKeeping(expr)) {
        updateHistory(addHistory(latest.current.history, { expr, result: toPlain(answer) }));
      }
    }
    setState(s => press(s, key));
  };

  const useEntry = (entry: HistoryEntry) => {
    setState(s => ({ ...s, expr: entry.result, fresh: true }));
    setShowHistory(false);
  };

  const copyResult = async (n: number) => {
    if (!(await copyText(toPlain(n).replace('−', '-')))) return;
    setCopied(true);
    if (copiedTimer.current) window.clearTimeout(copiedTimer.current);
    copiedTimer.current = window.setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return onClose();
      if ((e.target as HTMLElement)?.closest('[role="listbox"],[role="combobox"]')) return; // using a dropdown
      const key = /^\d$/.test(e.key) ? (e.key as Key) : KEYBOARD[e.key];
      if (key) { e.preventDefault(); tap(key); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const value = evaluate(state.expr, state.angle);
  const result = typeof value === 'number' ? value : null;
  // Expenses are saved in the user's own currency, which the calculator's numbers are in.
  // "sin 30" isn't an amount of money, so scientific sums can't be saved until they're finished with.
  const canSave = result !== null && result > 0 && !usesScience(state.expr);
  const shown = formatNumber(result ?? 0);

  const key = (id: Key, label: React.ReactNode, className: string, aria?: string): PadKey => ({ id, label, className, aria, onPress: () => tap(id) });
  const digit = (d: Key) => key(d, d, digitKey);
  const clear = key('AC', 'AC', clearKey, t('calc.clear'));
  const del = key('DEL', <Delete size={22} className="mx-auto" />, operatorKey, t('calc.delete'));
  const percent = key('%', '%', cn(operatorKey, 'text-2xl'), t('calc.percent'));
  const divide = key('÷', '÷', operatorKey, t('calc.divide'));
  const multiply = key('×', '×', operatorKey, t('calc.multiply'));
  const minus = key('−', '−', operatorKey, t('calc.minus'));
  const plus = key('+', '+', operatorKey, t('calc.plus'));
  const equals = key('=', '=', equalsKey, t('calc.equals'));
  const point = key('.', '.', digitKey, t('calc.point'));
  const swap: PadKey = {
    id: 'swap',
    label: <SquareFunction size={22} className="mx-auto" />,
    className: cn(functionKey, 'text-indigo-800 dark:text-indigo-300'),
    aria: t(state.scientific ? 'calc.hideScientific' : 'calc.showScientific'),
    pressed: state.scientific,
    onPress: () => setState(s => ({ ...s, scientific: !s.scientific })),
  };

  const keys: PadKey[] = state.scientific ? [
    { id: '2nd', label: '2nd', className: cn(functionKey, inverse && 'bg-indigo-200 border-indigo-400 dark:bg-indigo-500/30'), aria: t('calc.second'), pressed: inverse, onPress: () => setInverse(v => !v) },
    {
      id: 'angle',
      label: state.angle,
      className: functionKey,
      aria: t(state.angle === 'deg' ? 'calc.useRadians' : 'calc.useDegrees'),
      onPress: () => setState(s => ({ ...s, angle: s.angle === 'deg' ? 'rad' : 'deg' })),
    },
    inverse ? key('sin⁻¹(', superscript('sin', '−1'), functionKey) : key('sin(', 'sin', functionKey),
    inverse ? key('cos⁻¹(', superscript('cos', '−1'), functionKey) : key('cos(', 'cos', functionKey),
    inverse ? key('tan⁻¹(', superscript('tan', '−1'), functionKey) : key('tan(', 'tan', functionKey),
    key('^', superscript('x', 'y'), functionKey, t('calc.power')),
    key('lg(', 'lg', functionKey),
    key('ln(', 'ln', functionKey),
    key('(', '(', functionKey),
    key(')', ')', functionKey),
    key('√(', '√x', functionKey, t('calc.root')),
    clear, del, percent, divide,
    key('!', 'x!', functionKey, t('calc.factorial')),
    digit('7'), digit('8'), digit('9'), multiply,
    key('1/x', '1/x', functionKey, t('calc.reciprocal')),
    digit('4'), digit('5'), digit('6'), minus,
    key('π', 'π', functionKey),
    digit('1'), digit('2'), digit('3'), plus,
    swap,
    key('e', 'e', functionKey),
    digit('0'), point, equals,
  ] : [
    clear, del, percent, divide,
    digit('7'), digit('8'), digit('9'), multiply,
    digit('4'), digit('5'), digit('6'), minus,
    digit('1'), digit('2'), digit('3'), plus,
    swap, digit('0'), point, equals,
  ];

  return (
    <div className="h-full flex flex-col gap-3">
      {/* Display: one height for any length of sum, so the keys never move */}
      <section className="relative shrink-0 px-4 py-3 rounded-2xl bg-background/60 border border-card-border text-right" aria-live="polite">
        <div className="absolute left-2 top-2 flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => setShowHistory(v => !v)}
            aria-label={t('calc.history')}
            aria-pressed={showHistory}
            title={t('calc.history')}
            className={cn('w-8 h-8 inline-flex items-center justify-center rounded-lg transition-colors', showHistory ? 'text-indigo-700 dark:text-indigo-300 bg-indigo-100 dark:bg-indigo-500/15' : 'text-muted hover:text-foreground')}
          >
            <History size={17} />
          </button>
          <button
            type="button"
            disabled={result === null}
            onClick={() => result !== null && copyResult(result)}
            aria-label={t(copied ? 'chat.copied' : 'calc.copyResult')}
            title={t(copied ? 'chat.copied' : 'calc.copyResult')}
            className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-muted hover:text-foreground disabled:opacity-40"
          >
            {copied ? <Check size={17} className="text-indigo-600 dark:text-indigo-400" /> : <Copy size={16} />}
          </button>
        </div>
        <p className="h-5 pl-16 text-sm text-muted font-semibold whitespace-nowrap overflow-x-auto no-scrollbar">
          {!state.fresh && state.expr ? formatExpr(state.expr) : ' '}
        </p>
        <p className={cn(
          'mt-1 h-11 flex items-center justify-end font-bold tabular-nums whitespace-nowrap overflow-x-auto no-scrollbar text-foreground',
          shown.length > 18 ? 'text-xl' : shown.length > 12 ? 'text-2xl' : 'text-4xl',
        )}>
          {value === 'divZero' || value === 'mathError'
            ? <span className="text-xl text-red-600 dark:text-red-400">{t(value === 'divZero' ? 'calc.divZero' : 'calc.mathError')}</span>
            : shown}
        </p>
      </section>

      {showHistory ? (
        <section aria-label={t('calc.history')} className="flex-1 min-h-0 flex flex-col rounded-2xl border border-card-border bg-background/60 overflow-hidden">
          <div className="shrink-0 flex items-center justify-between gap-3 pl-3.5 pr-1.5 py-1.5 border-b border-card-border">
            <p className="text-xs font-bold text-muted">{t('calc.history')}</p>
            <button
              type="button"
              disabled={!history.length}
              onClick={() => updateHistory([])}
              className="h-8 px-2.5 rounded-lg text-xs font-bold text-rose-600 dark:text-rose-400 disabled:opacity-40"
            >
              {t('calc.clearHistory')}
            </button>
          </div>
          {history.length ? (
            <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar">
              {history.map((entry, index) => (
                <button
                  key={`${index}-${entry.expr}`}
                  type="button"
                  onClick={() => useEntry(entry)}
                  className="w-full block px-3.5 py-2 text-right border-b border-card-border/60 last:border-b-0 hover:bg-background/70"
                >
                  <span className="block text-xs font-semibold text-muted break-all">{formatExpr(entry.expr)}</span>
                  <span className="block text-base font-bold tabular-nums text-foreground break-all">= {formatExpr(entry.result)}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="flex-1 flex items-center justify-center px-6 text-center text-xs font-medium text-muted leading-relaxed">{t('calc.noHistory')}</p>
          )}
        </section>
      ) : (
      <div
        className={cn('flex-1 min-h-0 grid auto-rows-fr', state.scientific ? 'grid-cols-5 gap-1.5' : 'grid-cols-4 gap-2')}
        style={{ gridTemplateRows: `repeat(${state.scientific ? 7 : 5}, minmax(0, 1fr))` }}
      >
        {keys.map(k => (
          <button key={k.id} type="button" onClick={k.onPress} aria-label={k.aria} aria-pressed={k.pressed} className={k.className}>
            {k.label}
          </button>
        ))}
      </div>
      )}

      <button
        type="button"
        disabled={!canSave}
        onClick={() => result !== null && onSaveExpense(round2(result))}
        className="shrink-0 w-full h-12 inline-flex items-center justify-center gap-2 rounded-xl text-sm font-bold bg-indigo-600 text-white disabled:opacity-50"
      >
        <ReceiptText size={18} />
        {t('calc.save')}
      </button>
    </div>
  );
}

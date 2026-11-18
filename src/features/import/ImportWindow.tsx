import { useRef, useState } from 'react';
import { format } from 'date-fns';
import { CheckCircle2, FileUp, Loader2 } from 'lucide-react';
import { DEFAULT_CATEGORIES } from '../../shared/constants';
import { categoryLabel, useI18n } from '../../shared/i18n';
import type { TKey } from '../../shared/i18n';
import { cn } from '../../shared/lib/utils';
import FullWindow from '../../shared/components/FullWindow';
import Select from '../../shared/components/Select';
import { btnPrimary, btnSecondary, card, labelClass, selectClass } from '../accounts/ui';
import { useCategoryRules } from '../categoryRules/categoryRuleService';
import { Steps } from '../funds/FundsWindow';
import { INCOME_CATEGORIES } from '../income/income';
import { useIncomeCategories } from '../income/incomeService';
import { incomeCategoryLabel } from '../income/incomeText';
import { useOwnCategories } from '../planned/plannedService';
import {
  AmountMeaning, Cell, ColumnKey, Columns, DateOrder, ImportEntry, ImportProblems, MAX_IMPORT_ROWS,
  buildEntries, cellText, detectDateOrder, detectMeaning, findHeaderRow, guessColumns, markDuplicates,
} from './importFile';
import { ImportError, ImportFailure, readImportFile, saveImported, savedEntriesBetween } from './importService';

type Step = 'pick' | 'match' | 'preview' | 'done';

const FAILURE_TEXT: Record<ImportFailure, TKey> = {
  type: 'import.problem.type', size: 'import.problem.size', empty: 'import.problem.empty', read: 'import.problem.read',
};
const COLUMN_TEXT: Record<ColumnKey, TKey> = {
  date: 'add.date', title: 'add.fieldTitle', amount: 'add.amount', debit: 'import.debit', credit: 'import.credit',
  type: 'import.type', category: 'add.category', notes: 'add.notes',
};
const COLUMN_ORDER: ColumnKey[] = ['date', 'title', 'amount', 'debit', 'credit', 'type', 'category', 'notes'];
const PAGE = 100;

/** Import from a file: choose it, match its columns, check the rows, then save */
export default function ImportWindow({ uid, symbol, onClose }: { uid: string; symbol: string; onClose: () => void }) {
  const { t, dateLocale } = useI18n();
  const ownExpense = useOwnCategories(uid);
  const ownIncome = useIncomeCategories(uid);
  const rules = useCategoryRules(uid);
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>('pick');
  const [header, setHeader] = useState<Cell[]>([]);
  const [rows, setRows] = useState<Cell[][]>([]);
  const [firstRow, setFirstRow] = useState(2);
  const [columns, setColumns] = useState<Columns>({});
  const [order, setOrder] = useState<DateOrder>('dmy');
  const [meaning, setMeaning] = useState<AmountMeaning>('expense');
  const [entries, setEntries] = useState<ImportEntry[]>([]);
  const [problems, setProblems] = useState<ImportProblems>({ date: 0, amount: 0, secret: 0 });
  const [ticked, setTicked] = useState<Set<number>>(new Set());
  const [shown, setShown] = useState(PAGE);
  const [added, setAdded] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const all = await readImportFile(file);
      const at = findHeaderRow(all);
      const data = all.slice(at + 1).filter(row => row.some(c => cellText(c)));
      if (data.length === 0) throw new ImportError('empty');
      if (data.length > MAX_IMPORT_ROWS) { setError(t('import.problem.tooMany', { count: data.length, max: MAX_IMPORT_ROWS })); return; }
      const guessed = guessColumns(all[at]);
      setHeader(all[at]);
      setRows(data);
      setFirstRow(at + 2);
      setColumns(guessed);
      setOrder(detectDateOrder(data, guessed.date));
      setMeaning(detectMeaning(data, guessed.amount));
      setStep('match');
    } catch (err) {
      setError(t(FAILURE_TEXT[err instanceof ImportError ? err.reason : 'read']));
    } finally {
      setBusy(false);
    }
  };

  const hasMoney = columns.amount !== undefined || columns.debit !== undefined || columns.credit !== undefined;
  const ready = columns.date !== undefined && hasMoney;

  const check = async () => {
    setBusy(true);
    setError('');
    try {
      const built = buildEntries(rows, {
        columns, order, meaning, rules, firstRow, fallbackTitle: t('import.untitled'),
        categories: [...DEFAULT_CATEGORIES.map(c => c.name), ...ownExpense],
        incomeCategories: [...INCOME_CATEGORIES, ...ownIncome.map(c => c.name)],
      });
      if (built.entries.length === 0) { setError(t('import.problem.noRows')); return; }
      const marked = markDuplicates(built.entries, await savedEntriesBetween(uid, built.entries));
      setEntries(marked);
      setProblems(built.problems);
      setTicked(new Set(marked.filter(e => !e.duplicate).map(e => e.row)));
      setShown(PAGE);
      setStep('preview');
    } catch (err) {
      console.error('Could not check the import:', err);
      setError(t('import.problem.save'));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    const chosen = entries.filter(e => ticked.has(e.row));
    if (chosen.length === 0) return;
    setBusy(true);
    setError('');
    try {
      await saveImported(uid, chosen);
      setAdded(chosen.length);
      setStep('done');
    } catch (err) {
      console.error('Could not save the import:', err);
      setError(t('import.problem.save'));
    } finally {
      setBusy(false);
    }
  };

  const toggle = (row: number) => setTicked(prev => {
    const next = new Set(prev);
    if (next.has(row)) next.delete(row); else next.add(row);
    return next;
  });
  const back = () => { setError(''); setStep(step === 'preview' ? 'match' : 'pick'); };
  const money = (n: number) => `${symbol}${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  const columnOptions = [{ value: '', label: t('import.notInFile') }, ...header.map((cell, i) => ({ value: String(i), label: cellText(cell) || t('import.columnNumber', { n: i + 1 }) }))];
  const duplicates = entries.filter(e => e.duplicate).length;
  const skipped = problems.date + problems.amount + problems.secret;
  const stepNumber = { pick: 1, match: 2, preview: 3, done: 3 }[step];

  return (
    <FullWindow
      open
      atRoot={step === 'pick' || step === 'done'}
      onClose={onClose}
      onBack={back}
      pageKey={step}
      icon={<FileUp size={18} className="shrink-0 text-indigo-600 dark:text-indigo-400" />}
      title={t('import.title')}
    >
      {step !== 'done' && <Steps step={stepNumber} total={3} />}

      {step === 'pick' && (
        <div className={cn(card, 'p-6 space-y-4 text-center')}>
          <p className="text-lg font-bold text-foreground">{t('import.pickTitle')}</p>
          <p className="text-sm text-muted font-medium leading-relaxed">{t('import.pickHint', { max: MAX_IMPORT_ROWS })}</p>
          <p className="text-xs font-semibold p-3 rounded-xl bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-200 leading-relaxed">{t('import.noBalance')}</p>
          <button onClick={() => fileRef.current?.click()} disabled={busy} className={cn(btnPrimary, 'w-full')}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : <FileUp size={16} />} {t('import.choose')}
          </button>
          <input ref={fileRef} type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={pick} />
        </div>
      )}

      {step === 'match' && (
        <div className={cn(card, 'p-5 space-y-4')}>
          <div>
            <p className="text-lg font-bold text-foreground">{t('import.matchTitle')}</p>
            <p className="text-xs text-muted font-medium">{t('import.matchHint', { count: rows.length })}</p>
          </div>
          {COLUMN_ORDER.map(key => (
            <div key={key}>
              <span className={labelClass}>{t(COLUMN_TEXT[key])}</span>
              <Select
                ariaLabel={t(COLUMN_TEXT[key])}
                className={selectClass}
                value={columns[key] === undefined ? '' : String(columns[key])}
                onChange={v => setColumns(prev => { const next = { ...prev }; if (v === '') delete next[key]; else next[key] = Number(v); return next; })}
                options={columnOptions}
              />
            </div>
          ))}
          <div>
            <span className={labelClass}>{t('import.dateOrder')}</span>
            <Select ariaLabel={t('import.dateOrder')} className={selectClass} value={order} onChange={v => setOrder(v as DateOrder)}
              options={[{ value: 'dmy', label: t('import.dayFirst') }, { value: 'mdy', label: t('import.monthFirst') }]} />
          </div>
          {columns.amount !== undefined && columns.type === undefined && (
            <div>
              <span className={labelClass}>{t('import.amountMeans')}</span>
              <Select ariaLabel={t('import.amountMeans')} className={selectClass} value={meaning} onChange={v => setMeaning(v as AmountMeaning)}
                options={[{ value: 'expense', label: t('import.allSpent') }, { value: 'income', label: t('import.allReceived') }, { value: 'signed', label: t('import.signed') }]} />
            </div>
          )}
          {!ready && <p className="text-xs font-semibold text-muted">{t('import.needColumns')}</p>}
          <button onClick={check} disabled={!ready || busy} className={cn(btnPrimary, 'w-full')}>
            {busy && <Loader2 size={16} className="animate-spin" />} {t('common.next')}
          </button>
        </div>
      )}

      {step === 'preview' && (
        <>
          <div className={cn(card, 'p-5 space-y-2')}>
            <p className="text-lg font-bold text-foreground">{t('import.previewTitle')}</p>
            <p className="text-sm text-muted font-medium">{t('import.previewCount', { chosen: ticked.size, total: entries.length })}</p>
            {duplicates > 0 && <p className="text-xs font-semibold p-3 rounded-xl bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">{t('import.duplicates', { count: duplicates })}</p>}
            {skipped > 0 && <p className="text-xs font-semibold text-muted">{t('import.skipped', { count: skipped })}</p>}
            {problems.secret > 0 && <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">{t('import.skippedSecret', { count: problems.secret })}</p>}
          </div>

          <div className={cn(card, 'divide-y divide-card-border')}>
            {entries.slice(0, shown).map(e => (
              <label key={e.row} className="flex items-center gap-3 p-3 cursor-pointer">
                <input type="checkbox" className="w-4 h-4 shrink-0 accent-indigo-600" checked={ticked.has(e.row)} onChange={() => toggle(e.row)} />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-bold text-foreground truncate">{e.title}</span>
                  <span className="block text-xs font-medium text-muted truncate">
                    {format(new Date(e.date), 'd MMM yyyy', { locale: dateLocale })} · {e.kind === 'income' ? incomeCategoryLabel(t, e.category) : categoryLabel(t, e.category)}
                    {e.duplicate && ` · ${t('import.alreadySaved')}`}
                  </span>
                </span>
                <span className={cn('shrink-0 text-sm font-bold tabular-nums', e.kind === 'income' ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground')}>
                  {e.kind === 'income' ? '+' : '-'}{money(e.amount)}
                </span>
              </label>
            ))}
          </div>
          {shown < entries.length && (
            <button onClick={() => setShown(n => n + PAGE)} className={cn(btnSecondary, 'w-full')}>{t('import.showMore')}</button>
          )}
          <button onClick={save} disabled={busy || ticked.size === 0} className={cn(btnPrimary, 'w-full')}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : null} {t('import.save', { count: ticked.size })}
          </button>
        </>
      )}

      {step === 'done' && (
        <div className={cn(card, 'p-8 space-y-3 text-center')}>
          <CheckCircle2 size={40} className="mx-auto text-emerald-500" aria-hidden="true" />
          <p className="text-lg font-bold text-foreground">{t('import.doneTitle', { count: added })}</p>
          <p className="text-sm text-muted font-medium">{t('import.doneHint')}</p>
          <button onClick={onClose} className={cn(btnPrimary, 'w-full')}>{t('common.close')}</button>
        </div>
      )}

      {error && <p role="alert" className="text-sm font-semibold text-rose-600 dark:text-rose-400">{error}</p>}
    </FullWindow>
  );
}

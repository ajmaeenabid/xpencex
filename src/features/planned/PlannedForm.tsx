import { useState } from 'react';
import { addDays, format } from 'date-fns';
import { Trash2 } from 'lucide-react';
import { DEFAULT_CATEGORIES } from '../../shared/constants';
import { categoryLabel, useI18n } from '../../shared/i18n';
import type { TKey } from '../../shared/i18n';
import { cn } from '../../shared/lib/utils';
import type { Account } from '../../shared/types';
import DateField from '../../shared/components/DateField';
import { alertDialog, confirmDialog } from '../../shared/components/Dialog';
import Select from '../../shared/components/Select';
import { CASH_ID } from '../accounts/accounts';
import AccountPicker from '../accounts/AccountPicker';
import { btnPrimary, btnSecondary, inputClass, labelClass, selectClass } from '../accounts/ui';
import { INCOME_CATEGORIES } from '../income/income';
import { useIncomeCategories } from '../income/incomeService';
import { incomeCategoryLabel } from '../income/incomeText';
import { PLANNED_REPEATS, Planned, PlannedKind, PlannedProblem, PlannedRepeat, plannedProblem } from './planned';
import { addPlanned, deletePlanned, updatePlanned, useOwnCategories } from './plannedService';
import { REPEAT_TEXT } from './plannedText';

const PROBLEM_TEXT: Record<PlannedProblem, TKey> = {
  full: 'planned.problem.full',
  title: 'planned.problem.title',
  secret: 'secret.warning',
  amount: 'add.errorAmount',
  date: 'planned.problem.date',
};

/** Adds a planned payment or expected money, or changes one */
export default function PlannedForm({ uid, plan, count, accounts, symbol, onDone }: {
  uid: string;
  plan?: Planned;
  count: number; // how many are saved now
  accounts: Account[];
  symbol: string;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const ownExpense = useOwnCategories(uid);
  const ownIncome = useIncomeCategories(uid);
  const [kind, setKind] = useState<PlannedKind>(plan?.kind || 'expense');
  const [title, setTitle] = useState(plan?.title || '');
  const [amount, setAmount] = useState(plan ? String(plan.amount) : '');
  const [category, setCategory] = useState(plan?.category || 'Bills');
  const [day, setDay] = useState(plan ? format(new Date(plan.date), 'yyyy-MM-dd') : format(addDays(new Date(), 1), 'yyyy-MM-dd'));
  const [repeat, setRepeat] = useState<PlannedRepeat>(plan?.repeat || 'once');
  const [accountId, setAccountId] = useState(plan?.accountId || (plan?.kind === 'income' ? '' : CASH_ID));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const income = kind === 'income';
  const names = income
    ? [...new Set([...INCOME_CATEGORIES, ...ownIncome.map(c => c.name)])]
    : [...new Set([...DEFAULT_CATEGORIES.map(c => c.name), ...ownExpense])];
  const options = names.map(name => ({ value: name, label: income ? incomeCategoryLabel(t, name) : categoryLabel(t, name) }));

  const switchKind = (next: PlannedKind) => {
    setKind(next);
    setCategory(next === 'income' ? 'Salary' : 'Bills');
    setAccountId(next === 'income' ? '' : CASH_ID);
  };

  const save = async () => {
    const value = parseFloat(amount);
    const problem = plannedProblem({ title, amount: value, day }, count, !plan);
    if (problem) { setError(t(PROBLEM_TEXT[problem])); return; }
    setError('');
    setBusy(true);
    const input = { kind, title, amount: value, category, repeat, day, accountId: accountId || undefined };
    try {
      await (plan ? updatePlanned(plan.id, input) : addPlanned(uid, input));
      onDone();
    } catch (err) {
      console.error('Could not save the planned payment:', err);
      alertDialog(t('planned.error'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!plan || !(await confirmDialog(t('planned.confirmDelete', { name: plan.title }), { danger: true }))) return;
    setBusy(true);
    try {
      await deletePlanned(plan.id);
      onDone();
    } catch (err) {
      console.error('Could not delete the planned payment:', err);
      alertDialog(t('planned.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div role="radiogroup" aria-label={t('planned.kind')} className="grid grid-cols-2 gap-2">
        {(['expense', 'income'] as const).map(k => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={kind === k}
            onClick={() => switchKind(k)}
            className={cn('h-11 rounded-xl text-sm font-bold border transition-colors', kind === k ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-card text-foreground border-card-border')}
          >
            {t(k === 'income' ? 'planned.kindIncome' : 'planned.kindExpense')}
          </button>
        ))}
      </div>

      <div>
        <label htmlFor="planned-title" className={labelClass}>{t('add.fieldTitle')}</label>
        <input id="planned-title" maxLength={100} className={inputClass} placeholder={t(income ? 'planned.titleIncomeHint' : 'planned.titleHint')} value={title} onChange={e => setTitle(e.target.value)} />
      </div>
      <div>
        <label htmlFor="planned-amount" className={labelClass}>{t('add.amount')} ({symbol})</label>
        <input id="planned-amount" type="number" min="0" step="0.01" inputMode="decimal" className={inputClass} value={amount} onChange={e => setAmount(e.target.value)} />
      </div>
      <div>
        <span className={labelClass}>{t('add.category')}</span>
        <Select value={category} onChange={setCategory} options={options} ariaLabel={t('add.category')} className={selectClass} />
      </div>
      <div>
        <span className={labelClass}>{t('planned.dueDate')}</span>
        <DateField value={day} onChange={setDay} ariaLabel={t('planned.dueDate')} />
      </div>
      <div>
        <span className={labelClass}>{t('agent.howOften')}</span>
        <Select value={repeat} onChange={v => setRepeat(v as PlannedRepeat)} options={PLANNED_REPEATS.map(r => ({ value: r, label: t(REPEAT_TEXT[r]) }))} ariaLabel={t('agent.howOften')} className={selectClass} />
      </div>
      {(accounts.length > 0 || !income) && (
        <div>
          <span className={labelClass}>{t(income ? 'planned.receivedIn' : 'add.paidFrom')}</span>
          <AccountPicker accounts={accounts} value={accountId} onChange={setAccountId} symbol={symbol} includeCash={!income} compact />
        </div>
      )}

      {error && <p role="alert" className="text-sm font-semibold text-rose-600 dark:text-rose-400">{error}</p>}

      <button onClick={save} disabled={busy} className={cn(btnPrimary, 'w-full')}>{t(busy ? 'common.saving' : 'common.save')}</button>
      {plan && (
        <button onClick={remove} disabled={busy} className={cn(btnSecondary, 'w-full text-rose-600 dark:text-rose-400')}>
          <Trash2 size={16} /> {t('common.delete')}
        </button>
      )}
    </div>
  );
}

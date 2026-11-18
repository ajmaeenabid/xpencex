import { useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import { Check, Edit2, FileText, Loader2, Plus, Repeat, Tag, Trash2, Wallet, X } from 'lucide-react';
import { motion } from 'motion/react';
import { useAuth } from '../../app/App';
import { MAJOR_CURRENCIES } from '../../shared/constants';
import { useI18n } from '../../shared/i18n';
import { cn } from '../../shared/lib/utils';
import { containsSecret } from '../../shared/lib/sensitiveData';
import { alertDialog, confirmDialog } from '../../shared/components/Dialog';
import DateField from '../../shared/components/DateField';
import type { Deposit } from '../../shared/types';
import AccountPicker from '../accounts/AccountPicker';
import { useAccounts } from '../accounts/accountService';
import { INCOME_CATEGORIES } from './income';
import { addIncomeCategory, deleteIncome, saveIncome, useIncomeCategories, useIncomeRules } from './incomeService';
import { incomeCategoryLabel } from './incomeText';
import QuickEntries from '../expenses/QuickEntries';
import LabelField from '../labels/LabelField';

const field = 'w-full px-4 py-4 bg-background/50 rounded-2xl border-2 border-transparent focus:border-indigo-600/20 focus:bg-background outline-none transition-all text-foreground font-medium';

/**
 * Adding or editing an income. Picking an account is optional: with one, its balance goes up; without one,
 * the income is only recorded. "Repeat monthly" adds it again every month until it is turned off.
 */
export default function IncomeForm({ income, onComplete, presetAccountId }: {
  income?: Deposit | null;
  onComplete: () => void;
  presetAccountId?: string; // opened from an account's window: that account is picked
}) {
  const { user, profile } = useAuth();
  const { t } = useI18n();
  const accounts = useAccounts(user?.uid);
  const ownCategories = useIncomeCategories(user?.uid);
  const rules = useIncomeRules(user?.uid);
  const isEditing = !!income;
  const [title, setTitle] = useState(income?.title || '');
  const [amount, setAmount] = useState(income ? String(income.amount) : '');
  const [category, setCategory] = useState(income?.category || 'Salary');
  const [date, setDate] = useState(format(income ? new Date(income.date) : new Date(), 'yyyy-MM-dd'));
  const [notes, setNotes] = useState(income?.notes || '');
  const [labels, setLabels] = useState<string[]>(income?.labels || []);
  const [accountId, setAccountId] = useState<string>(income ? income.accountId || '' : presetAccountId || '');
  const [repeat, setRepeat] = useState(!!income?.ruleId && rules.some(r => r.id === income.ruleId));
  const [newCategory, setNewCategory] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const symbol = MAJOR_CURRENCIES.find(c => c.code === profile?.currency)?.symbol || '৳';
  const ruleStillOn = !!income?.ruleId && rules.some(r => r.id === income.ruleId);
  // Repeating income: the tick starts on once its rule has loaded (and the person hasn't touched it yet)
  const repeatTouched = useRef(false);
  useEffect(() => { if (!repeatTouched.current && ruleStillOn) setRepeat(true); }, [ruleStillOn]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const value = parseFloat(amount);
    if (containsSecret(title) || containsSecret(notes)) {
      setError(t('secret.warning'));
      return;
    }
    if (!title.trim()) return setError(t('income.errorTitle'));
    if (!Number.isFinite(value) || value <= 0) return setError(t('add.errorAmount'));
    setError('');
    const isoDate = isEditing && date === format(new Date(income!.date), 'yyyy-MM-dd')
      ? income!.date
      : (date === format(new Date(), 'yyyy-MM-dd') ? new Date() : new Date(`${date}T12:00:00`)).toISOString();
    setBusy(true);
    try {
      await saveIncome(user.uid, {
        title, amount: value, category, date: isoDate, notes, accountId: accountId || null,
        repeat, labels,
      }, accounts, income ? { ...income, ruleId: ruleStillOn ? income.ruleId : undefined } : undefined);
      onComplete();
    } catch (err) {
      console.error('Could not save the income:', err);
      setError(t('income.errorSave'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!income || !(await confirmDialog(t('income.deleteConfirm'), { danger: true }))) return;
    try {
      await deleteIncome(income, accounts);
      onComplete();
    } catch (err) {
      console.error('Could not delete the income:', err);
      alertDialog(t('income.errorDelete'));
    }
  };

  const addCategory = async () => {
    const name = (newCategory || '').trim();
    if (!user || !name) return setNewCategory(null);
    if (containsSecret(name)) return setError(t('secret.warning'));
    try {
      await addIncomeCategory(user.uid, name);
      setCategory(name);
      setNewCategory(null);
    } catch (err) {
      console.error('Could not add the category:', err);
      alertDialog(t('income.errorSave'));
    }
  };

  const categories = [...INCOME_CATEGORIES, ...ownCategories.map(c => c.name).filter(n => !(INCOME_CATEGORIES as readonly string[]).includes(n))];

  return (
    <>
    {!isEditing && (
      <QuickEntries
        kind="income"
        symbol={symbol}
        form={{ title, amount: parseFloat(amount) || 0, category, accountId: accountId || undefined }}
        onPick={entry => {
          setTitle(entry.title);
          setAmount(String(entry.amount));
          setCategory(entry.category);
          setAccountId(entry.accountId && accounts.some(a => a.id === entry.accountId) ? entry.accountId : '');
        }}
      />
    )}
    <form onSubmit={submit} className="space-y-8">
      <div className="bg-card p-7 rounded-[2.5rem] shadow-soft border border-card-border space-y-6">
        <div className="space-y-2">
          <label className="text-xs font-semibold text-muted px-1">{t('add.amount')}</label>
          <div className="relative">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-emerald-50 dark:bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-600 dark:text-emerald-400 font-bold">{symbol}</div>
            <input type="number" min="0.01" step="0.01" inputMode="decimal" placeholder="0.00" required
              className={cn(field, 'pl-16 py-5 font-bold text-2xl')} value={amount} onChange={e => setAmount(e.target.value)} />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold text-muted px-1">{t('income.what')}</label>
          <div className="relative">
            <FileText size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" maxLength={100} required placeholder={t('income.whatPlaceholder')} className={cn(field, 'pl-12')} value={title} onChange={e => setTitle(e.target.value)} />
          </div>
        </div>

        <div className="space-y-3">
          <label className="text-xs font-semibold text-muted px-1 flex items-center gap-2"><Tag size={12} /> {t('add.category')}</label>
          <div className="flex flex-wrap gap-2">
            {categories.map(name => (
              <button key={name} type="button" onClick={() => setCategory(name)}
                className={cn('px-4 py-2 rounded-xl text-xs font-bold border transition-colors',
                  category === name ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-background/50 text-muted border-card-border')}>
                {incomeCategoryLabel(t, name)}
              </button>
            ))}
            {newCategory === null ? (
              <button type="button" onClick={() => setNewCategory('')} className="px-3 py-2 rounded-xl text-xs font-bold border border-dashed border-card-border text-muted inline-flex items-center gap-1">
                <Plus size={13} /> {t('income.newCategory')}
              </button>
            ) : (
              <span className="inline-flex items-center gap-1">
                <input autoFocus maxLength={50} value={newCategory} onChange={e => setNewCategory(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCategory(); } }}
                  aria-label={t('income.newCategory')} className="w-32 px-3 py-2 rounded-xl text-xs bg-background border border-card-border text-foreground outline-none" />
                <button type="button" onClick={addCategory} aria-label={t('common.save')} className="p-2 text-emerald-600"><Check size={15} /></button>
                <button type="button" onClick={() => setNewCategory(null)} aria-label={t('common.cancel')} className="p-2 text-muted"><X size={15} /></button>
              </span>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <label className="text-xs font-semibold text-muted px-1 flex items-center gap-2"><Wallet size={12} /> {t('income.into')}</label>
          <button type="button" onClick={() => setAccountId('')} aria-pressed={!accountId}
            className={cn('w-full p-3 rounded-2xl text-left text-sm font-bold border transition-colors',
              !accountId ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-background/50 text-muted border-card-border')}>
            {t('income.noAccount')}
            <span className={cn('block text-xs font-medium', !accountId ? 'text-white/80' : 'text-muted')}>{t('income.noAccountHint')}</span>
          </button>
          {accounts.length > 0 && <AccountPicker accounts={accounts} value={accountId} onChange={setAccountId} symbol={symbol} includeCash={false} />}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted px-1">{t('add.date')}</label>
            <DateField ariaLabel={t('add.date')} className={cn(field, 'py-3.5 text-sm')} value={date} onChange={setDate} />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted px-1">{t('add.notes')}</label>
            <div className="relative">
              <Edit2 size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="text" maxLength={500} placeholder={t('add.optional')} className={cn(field, 'pl-11 py-3.5 text-sm')} value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
          </div>
        </div>

        <LabelField uid={user?.uid} value={labels} onChange={setLabels} />

        <label className="flex items-center gap-3 bg-background/50 p-4 rounded-2xl cursor-pointer">
          <span className="w-10 h-10 bg-teal-50 dark:bg-teal-500/10 rounded-xl flex items-center justify-center text-teal-600 dark:text-teal-400"><Repeat size={18} /></span>
          <span className="flex-1">
            <span className="block font-bold text-sm text-foreground">{t('income.repeat')}</span>
            <span className="block text-xs text-muted font-medium">{t('income.repeatHint')}</span>
          </span>
          <input type="checkbox" className="w-5 h-5 accent-emerald-600" checked={repeat} onChange={e => { repeatTouched.current = true; setRepeat(e.target.checked); }} />
        </label>
      </div>

      {error && <p className="text-rose-500 text-sm font-bold px-2">{error}</p>}

      <motion.button type="submit" disabled={busy} whileTap={{ scale: 0.98 }}
        className="w-full py-5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-[2rem] font-bold shadow-vibrant disabled:opacity-50 flex items-center justify-center gap-3 text-lg">
        {busy ? <Loader2 className="animate-spin" size={24} /> : <>{t(isEditing ? 'income.update' : 'income.save')} <Check size={18} /></>}
      </motion.button>
      {isEditing && (
        <button type="button" onClick={remove} className="w-full py-3 text-sm font-bold text-rose-500 inline-flex items-center justify-center gap-2">
          <Trash2 size={16} /> {t('income.delete')}
        </button>
      )}
    </form>
    </>
  );
}

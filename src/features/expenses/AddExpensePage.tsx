import { useState, useEffect } from 'react';
import { db } from '../../shared/firebase';
import { collection, doc, query, where, onSnapshot, writeBatch } from 'firebase/firestore';
import { useAuth } from '../../app/App';
import { Expense, RecurringFrequency } from '../../shared/types';
import { motion } from 'motion/react';
import { Tag, FileText, Check, ArrowLeft, Edit2, Loader2, Users, Repeat, Minus, Plus, Wallet } from 'lucide-react';
import { format } from 'date-fns';
import { DEFAULT_CATEGORIES, MAJOR_CURRENCIES } from '../../shared/constants';
import { advanceDate } from './recurring';
import { CASH_ID, accountDisplayName } from '../accounts/accounts';
import { containsSecret } from '../../shared/lib/sensitiveData';
import { useI18n, categoryLabel } from '../../shared/i18n';
import { useAccounts, adjustBalance, paymentFields, shortAccount } from '../accounts/accountService';
import AccountPicker from '../accounts/AccountPicker';
import DateField from '../../shared/components/DateField';
import { confirmDialog } from '../../shared/components/Dialog';
import { shareOf } from './expense';
import { saved } from '../../shared/lib/offlineSave';

interface AddExpensePageProps {
  onComplete: () => void;
  expense?: Expense | null;
  prefillPeople?: number | null; // from the calculator's Split the bill: the amount is then the bill total
  prefillAmount?: number | null; // from the calculator's "Save as expense"
}

export default function AddExpensePage({ onComplete, expense, prefillAmount, prefillPeople }: AddExpensePageProps) {
  const { user, profile } = useAuth();
  const isEditing = !!expense;
  const [title, setTitle] = useState(expense?.title || '');
  const [amount, setAmount] = useState(expense ? expense.amount.toString() : prefillAmount ? String(prefillAmount) : '');
  const [category, setCategory] = useState(expense?.category || '');
  const [date, setDate] = useState(format(expense ? new Date(expense.date) : new Date(), 'yyyy-MM-dd'));
  const [notes, setNotes] = useState(expense?.notes || '');
  const [isSplit, setIsSplit] = useState(!!prefillPeople);
  const [people, setPeople] = useState(prefillPeople || 2);
  const [repeat, setRepeat] = useState<RecurringFrequency | 'none'>('none');
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [accountId, setAccountId] = useState(expense?.accountId || CASH_ID);
  const accounts = useAccounts(user?.uid);
  const { t } = useI18n();

  const currencySymbol = MAJOR_CURRENCIES.find(c => c.code === profile?.currency)?.symbol || '৳';

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'categories'), where('uid', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const customCats = snapshot.docs.map(doc => ({ 
        id: doc.id, 
        name: doc.data().name,
        icon: Tag,
        color: 'bg-slate-100 text-slate-600 dark:bg-slate-900/30 dark:text-slate-400'
      }));
      const allCats = [...DEFAULT_CATEGORIES, ...customCats];
      setCategories(allCats);
      setCategory(prev => prev || allCats[0]?.name || '');
    });
    return unsubscribe;
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = parseFloat(amount);
    if (!user || !title.trim() || !category) return;
    if (containsSecret(title) || containsSecret(notes)) {
      if (containsSecret(title)) setTitle('');
      if (containsSecret(notes)) setNotes('');
      setError(t('secret.warning'));
      return;
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError(t('add.errorAmount'));
      return;
    }
    setError('');

    // Keep the original timestamp when the day wasn't changed, so ordering within a day is preserved
    const isoDate = isEditing && date === format(new Date(expense!.date), 'yyyy-MM-dd')
      ? expense!.date
      : (date === format(new Date(), 'yyyy-MM-dd') ? new Date() : new Date(`${date}T12:00:00`)).toISOString();
    // When splitting, the entered amount is the bill total and only your share is recorded
    const share = isSplit ? shareOf(parsedAmount, people) : parsedAmount;
    const finalNotes = isSplit
      ? [notes.trim(), t('add.splitNote', { people, total: `${currencySymbol}${parsedAmount.toLocaleString()}` })].filter(Boolean).join(' · ')
      : notes.trim();

    // Warn, but still allow, when the account doesn't have enough money (e.g. balance not updated yet)
    const refund = isEditing && expense!.accountId === accountId ? expense!.amount : 0;
    const short = shortAccount(accounts, accountId, share, refund);
    if (short && !(await confirmDialog(
      t('add.lowBalance', { account: accountDisplayName(short), balance: `${currencySymbol}${short.balance.toLocaleString()}` })
    ))) return;

    const payment = paymentFields(accountId, accounts);

    setLoading(true);
    try {
      if (isEditing) {
        const batch = writeBatch(db);
        batch.update(doc(db, 'expenses', expense!.id), {
          title: title.trim(),
          amount: parsedAmount,
          category,
          date: isoDate,
          notes: finalNotes,
          ...payment,
        });
        // Give the old amount back to the old account, then take the new amount from the chosen one
        adjustBalance(batch, accounts, expense!.accountId, expense!.amount);
        adjustBalance(batch, accounts, accountId, -parsedAmount);
        await saved(batch.commit());
      } else {
        // The expense and its repeat rule are saved together, so one can't exist without the other
        const batch = writeBatch(db);
        let recurringId: string | undefined;
        if (repeat !== 'none') {
          const rule = doc(collection(db, 'recurring'));
          batch.set(rule, {
            uid: user.uid,
            title: title.trim(),
            amount: share,
            category,
            notes: finalNotes,
            frequency: repeat,
            nextDate: advanceDate(isoDate, repeat),
            ...payment,
            createdAt: new Date().toISOString(),
          });
          recurringId = rule.id;
        }
        batch.set(doc(collection(db, 'expenses')), {
          uid: user.uid,
          title: title.trim(),
          amount: share,
          category,
          date: isoDate,
          notes: finalNotes,
          ...(isSplit && { split: { total: parsedAmount, people } }),
          ...(recurringId && { recurringId }),
          ...payment,
          createdAt: new Date().toISOString(),
        });
        adjustBalance(batch, accounts, accountId, -share);
        await saved(batch.commit());
      }
      onComplete();
    } catch (err) {
      console.error("Error adding expense:", err);
      setError(t('add.errorSave'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8 pb-6">
      <header className="flex items-center gap-4">
        <motion.button 
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={onComplete} 
          className="p-3 bg-card rounded-2xl shadow-soft border border-card-border text-slate-500 dark:text-slate-400"
        >
          <ArrowLeft size={20} />
        </motion.button>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">{isEditing ? t('add.editTitle') : t('add.title')}</h1>
      </header>

      <form onSubmit={handleSubmit} className="space-y-8">
        <div className="bg-card p-7 rounded-[2.5rem] shadow-soft border border-card-border space-y-6 transition-all">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted px-1">{t('add.fieldTitle')}</label>
            <div className="relative group">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-indigo-50 dark:bg-indigo-500/10 rounded-xl flex items-center justify-center text-indigo-600 dark:text-indigo-400 group-focus-within:bg-indigo-600 group-focus-within:text-white transition-all">
                <FileText size={18} />
              </div>
              <input
                type="text"
                placeholder={t('add.titlePlaceholder')}
                className="w-full pl-16 pr-4 py-4 bg-background/50 rounded-2xl border-2 border-transparent focus:border-indigo-600/20 focus:bg-background outline-none transition-all text-foreground font-medium"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted px-1">{isSplit ? t('add.billTotal') : t('add.amount')}</label>
            <div className="relative group">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-emerald-50 dark:bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-600 dark:text-emerald-400 font-bold group-focus-within:bg-emerald-600 group-focus-within:text-white transition-all">
                {currencySymbol}
              </div>
              <input
                type="number"
                min="0.01"
                step="0.01"
                inputMode="decimal"
                placeholder="0.00"
                className="w-full pl-16 pr-4 py-5 bg-background/50 rounded-2xl border-2 border-transparent focus:border-emerald-600/20 focus:bg-background outline-none transition-all font-bold text-2xl text-foreground"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-4">
            <label className="text-xs font-semibold text-muted px-1 flex items-center gap-2">
              <Tag size={12} /> {t('add.category')}
            </label>
            <div className="grid grid-cols-3 gap-3">
              {categories.map((cat, idx) => {
                const Icon = cat.icon;
                const isSelected = category === cat.name;
                return (
                  <motion.button
                    key={idx}
                    type="button"
                    whileHover={{ y: -2 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setCategory(cat.name)}
                    className={`p-4 rounded-[1.5rem] text-[10px] font-bold border-2 transition-all flex flex-col items-center gap-3 ${
                      isSelected
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-vibrant'
                        : 'bg-background/50 text-muted border-transparent hover:border-card-border'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isSelected ? 'bg-white/20' : cat.color}`}>
                      <Icon size={20} />
                    </div>
                    <span className="truncate w-full text-center tracking-tight">{categoryLabel(t, cat.name)}</span>
                  </motion.button>
                );
              })}
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-xs font-semibold text-muted px-1 flex items-center gap-2">
              <Wallet size={12} /> {t('add.paidFrom')}
            </label>
            <AccountPicker accounts={accounts} value={accountId} onChange={setAccountId} symbol={currencySymbol} />
            {accounts.length === 0 && (
              <p className="text-[11px] text-muted font-medium px-1">{t('add.noAccountsHint')}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4 pt-2">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted px-1">{t('add.date')}</label>
              <div className="relative group">
                <DateField
                  ariaLabel={t('add.date')}
                  className="w-full pl-12 pr-4 py-3.5 bg-background/50 rounded-2xl border-2 border-transparent focus:border-indigo-600/20 focus:bg-background outline-none transition-all text-foreground text-sm font-medium"
                  value={date}
                  onChange={setDate}
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted px-1">{t('add.notes')}</label>
              <div className="relative group">
                <Edit2 className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-600 transition-colors" size={18} />
                <input
                  type="text"
                  placeholder={t('add.optional')}
                  className="w-full pl-12 pr-4 py-3.5 bg-background/50 rounded-2xl border-2 border-transparent focus:border-indigo-600/20 focus:bg-background outline-none transition-all text-foreground text-sm font-medium"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>
          </div>

          {!isEditing && (
            <div className="space-y-4 pt-2">
              <div className="flex items-center justify-between bg-background/50 p-4 rounded-2xl">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-amber-50 dark:bg-amber-500/10 rounded-xl flex items-center justify-center text-amber-600 dark:text-amber-400">
                    <Users size={18} />
                  </div>
                  <div>
                    <p className="font-bold text-sm text-foreground">{t('add.splitBill')}</p>
                    <p className="text-[11px] text-muted font-medium">
                      {isSplit && parseFloat(amount) > 0
                        ? t('add.yourShare', { amount: `${currencySymbol}${shareOf(parseFloat(amount), people).toLocaleString()}` })
                        : t('add.shareHint')}
                    </p>
                  </div>
                </div>
                {isSplit ? (
                  <div className="flex items-center gap-2">
                    <button type="button" aria-label={t('add.fewerPeople')} onClick={() => people > 2 ? setPeople(people - 1) : setIsSplit(false)} className="w-8 h-8 rounded-lg bg-card border border-card-border flex items-center justify-center text-muted"><Minus size={14} /></button>
                    <span className="w-6 text-center font-bold text-foreground">{people}</span>
                    <button type="button" aria-label={t('add.morePeople')} onClick={() => setPeople(Math.min(people + 1, 50))} className="w-8 h-8 rounded-lg bg-card border border-card-border flex items-center justify-center text-muted"><Plus size={14} /></button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setIsSplit(true)} className="text-indigo-600 dark:text-indigo-400 font-bold text-sm">{t('add.split')}</button>
                )}
              </div>

              <div className="bg-background/50 p-4 rounded-2xl space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-teal-50 dark:bg-teal-500/10 rounded-xl flex items-center justify-center text-teal-600 dark:text-teal-400">
                    <Repeat size={18} />
                  </div>
                  <div>
                    <p className="font-bold text-sm text-foreground">{t('add.repeat')}</p>
                    <p className="text-[11px] text-muted font-medium">{t('add.repeatHint')}</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {(['none', 'weekly', 'monthly'] as const).map(opt => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setRepeat(opt)}
                      className={`py-2 rounded-xl text-xs font-bold capitalize transition-all ${
                        repeat === opt ? 'bg-indigo-600 text-white' : 'bg-card text-muted border border-card-border'
                      }`}
                    >
                      {opt === 'none' ? t('add.repeat.none') : opt === 'weekly' ? t('add.repeat.weekly') : t('add.repeat.monthly')}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {error && <p className="text-rose-500 text-sm font-bold px-2">{error}</p>}

        <motion.button
          type="submit"
          disabled={loading}
          whileHover={{ scale: 1.02, y: -2 }}
          whileTap={{ scale: 0.98 }}
          className="w-full py-5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-[2rem] font-bold shadow-vibrant hover:shadow-indigo-500/40 disabled:opacity-50 disabled:shadow-none transition-all flex items-center justify-center gap-3 text-lg"
        >
          {loading ? (
            <Loader2 className="animate-spin" size={24} />
          ) : (
            <>
              {isEditing ? t('add.update') : t('add.save')}
              <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
                <Check size={18} />
              </div>
            </>
          )}
        </motion.button>
      </form>
    </div>
  );
}

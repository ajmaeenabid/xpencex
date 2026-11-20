import { useState, useEffect, useRef } from 'react';
import { db } from '../../shared/firebase';
import { collection, deleteField, doc, query, where, onSnapshot, writeBatch } from 'firebase/firestore';
import { useAuth } from '../../app/App';
import { Deposit, Expense, RecurringFrequency } from '../../shared/types';
import IncomeForm from '../income/IncomeForm';
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
import ReceiptField from '../receipts/ReceiptField';
import { PreparedReceipt } from '../receipts/receiptFile';
import { attachWhenSaved } from '../receipts/receiptService';
import { writeDebt } from '../debts/debtService';
import { cleanPerson } from '../debts/debts';
import QuickEntries from './QuickEntries';
import LabelField from '../labels/LabelField';
import { labelFields } from '../labels/labels';
import { ruleCategoryFor } from '../categoryRules/categoryRules';
import { noteCategoryCorrection, useCategoryRules } from '../categoryRules/categoryRuleService';
import WarrantyField from '../warranties/WarrantyField';
import { warrantyTooEarly } from '../warranties/warranties';
import { CHOICE_ON, CHOICE_ON_INCOME } from '../../shared/lib/choice';

interface AddExpensePageProps {
  onComplete: () => void;
  expense?: Expense | null;
  income?: Deposit | null; // editing an income: the income form instead
  prefillPeople?: number | null; // from the calculator's Split the bill: the amount is then the bill total
  prefillAmount?: number | null; // from the calculator's "Save as expense"
}

export default function AddExpensePage(props: AddExpensePageProps) {
  const { t } = useI18n();
  // New entries get an "Expense | Income" switch; editing keeps the form of what is being edited
  const [mode, setMode] = useState<'expense' | 'income'>(props.income ? 'income' : 'expense');
  const editing = !!props.expense || !!props.income;
  if (mode === 'expense') return <ExpenseForm {...props} modeSwitch={editing ? null : <ModeSwitch mode={mode} setMode={setMode} />} />;
  return (
    <div className="space-y-8 pb-6">
      <header className="flex items-center gap-4">
        <motion.button whileTap={{ scale: 0.9 }} onClick={props.onComplete} aria-label={t('common.back')}
          className="p-3 bg-card rounded-2xl shadow-soft border border-card-border text-slate-500 dark:text-slate-400">
          <ArrowLeft size={20} />
        </motion.button>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">{t(props.income ? 'income.editTitle' : 'income.title')}</h1>
      </header>
      {!editing && <ModeSwitch mode={mode} setMode={setMode} />}
      <IncomeForm income={props.income} onComplete={props.onComplete} />
    </div>
  );
}

function ModeSwitch({ mode, setMode }: { mode: 'expense' | 'income'; setMode: (m: 'expense' | 'income') => void }) {
  const { t } = useI18n();
  return (
    <div role="tablist" className="grid grid-cols-2 p-1 rounded-2xl bg-card border border-card-border shadow-soft">
      {(['expense', 'income'] as const).map(m => (
        <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)}
          className={`py-2.5 rounded-xl text-sm font-bold transition-colors ${mode === m ? (m === 'income' ? CHOICE_ON_INCOME : CHOICE_ON) : 'text-muted'}`}>
          {t(m === 'income' ? 'income.tab' : 'expense.tab')}
        </button>
      ))}
    </div>
  );
}

function ExpenseForm({ onComplete, expense, prefillAmount, prefillPeople, modeSwitch }: AddExpensePageProps & { modeSwitch: React.ReactNode }) {
  const { user, profile } = useAuth();
  const isEditing = !!expense;
  const [title, setTitle] = useState(expense?.title || '');
  const [amount, setAmount] = useState(expense ? expense.amount.toString() : prefillAmount ? String(prefillAmount) : '');
  const [category, setCategory] = useState(expense?.category || '');
  const [date, setDate] = useState(format(expense ? new Date(expense.date) : new Date(), 'yyyy-MM-dd'));
  const [notes, setNotes] = useState(expense?.notes || '');
  const [labels, setLabels] = useState<string[]>(expense?.labels || []);
  const [warrantyUntil, setWarrantyUntil] = useState<string | null>(expense?.warrantyUntil || null);
  const [isSplit, setIsSplit] = useState(!!prefillPeople);
  const [people, setPeople] = useState(prefillPeople || 2);
  // Split bill: who else was there. Each named person's share goes to Lend and borrow as "owes you".
  const [splitNames, setSplitNames] = useState<string[]>([]);
  const others = Array.from({ length: Math.max(0, people - 1) }, (_, i) => splitNames[i] || '');
  const [repeat, setRepeat] = useState<RecurringFrequency | 'none'>('none');
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [accountId, setAccountId] = useState(expense?.accountId || CASH_ID);
  const accounts = useAccounts(user?.uid);
  const { t } = useI18n();
  // A category rule fills the category as the title is typed, until the person picks one themselves
  const rules = useCategoryRules(user?.uid);
  const [pickedCategory, setPickedCategory] = useState(false);
  const ruleCategory = isEditing ? undefined : ruleCategoryFor(title, rules, categories.map(c => c.name));
  useEffect(() => { if (ruleCategory && !pickedCategory) setCategory(ruleCategory); }, [ruleCategory, pickedCategory]);
  // A receipt picked here is sent after the expense is saved; one already on the expense can be deleted here
  const [pendingReceipt, setPendingReceipt] = useState<PreparedReceipt | null>(null);
  const [savedReceiptId, setSavedReceiptId] = useState(expense?.receiptId);
  const previewRef = useRef<string | undefined>(undefined);
  previewRef.current = pendingReceipt?.previewUrl;
  useEffect(() => () => { if (previewRef.current) URL.revokeObjectURL(previewRef.current); }, []);

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
    if (isSplit && others.some(n => containsSecret(n))) {
      setSplitNames([]);
      setError(t('secret.warning'));
      return;
    }
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
    if (warrantyUntil && warrantyTooEarly(warrantyUntil, date)) {
      setError(t('warranty.tooEarly'));
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
    // "Cash" means the Cash wallet once it exists
    const payment = paymentFields(accountId, accounts);
    const refund = isEditing && expense!.accountId === payment.accountId ? expense!.amount : 0;
    const short = shortAccount(accounts, payment.accountId, share, refund);
    if (short && !(await confirmDialog(
      t('add.lowBalance', { account: accountDisplayName(short), balance: `${currencySymbol}${short.balance.toLocaleString()}` })
    ))) return;

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
          labels: labels.length ? labels : deleteField(),
          warrantyUntil: warrantyUntil || deleteField(),
          ...payment,
        });
        // Give the old amount back to the old account, then take the new amount from the chosen one
        // Same account: one history line with the difference; otherwise one line on each account.
        // A lend and borrow expense doesn't move the account: its entry did that.
        if (expense!.debtId) {
          // nothing to move
        } else if (expense!.accountId === payment.accountId) {
          adjustBalance(batch, accounts, payment.accountId, expense!.amount - parsedAmount, 'expenseEdit', title.trim());
        } else {
          adjustBalance(batch, accounts, expense!.accountId, expense!.amount, 'expenseEdit', title.trim());
          adjustBalance(batch, accounts, payment.accountId, -parsedAmount, 'expenseEdit', title.trim());
        }
        const write = batch.commit();
        await saved(write);
        if (pendingReceipt) attachWhenSaved(write, pendingReceipt.blob, expense!.id);
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
        const expenseRef = doc(collection(db, 'expenses'));
        batch.set(expenseRef, {
          uid: user.uid,
          title: title.trim(),
          amount: share,
          category,
          date: isoDate,
          notes: finalNotes,
          ...(isSplit && { split: { total: parsedAmount, people } }),
          ...(recurringId && { recurringId }),
          ...labelFields(labels),
          ...(warrantyUntil && { warrantyUntil }),
          ...payment,
          createdAt: new Date().toISOString(),
        });
        adjustBalance(batch, accounts, payment.accountId, -share, 'expense', title.trim());
        // Everyone named owes you their share; that money left your account too (like lending)
        if (isSplit) {
          const paidFrom = accounts.find(a => a.id === payment.accountId);
          for (const name of others.map(cleanPerson).filter(Boolean)) {
            writeDebt(batch, {
              uid: user.uid, person: name, kind: 'lent', amount: share, date: isoDate,
              note: t('add.splitDebtNote', { title: title.trim() }), account: paidFrom,
            });
          }
        }
        const write = batch.commit();
        await saved(write);
        if (pendingReceipt) attachWhenSaved(write, pendingReceipt.blob, expenseRef.id);
      }
      // Moved to another category, or a rule's category was changed: twice in a row offers a rule
      if (user && ((isEditing && expense!.category !== category) || (ruleCategory && ruleCategory !== category))) {
        await noteCategoryCorrection(user.uid, title.trim(), category, rules, t);
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
      {modeSwitch}

      {!isEditing && (
        <QuickEntries
          kind="expense"
          symbol={currencySymbol}
          form={{ title, amount: parseFloat(amount) || 0, category, accountId }}
          onPick={entry => {
            setTitle(entry.title);
            setAmount(String(entry.amount));
            setCategory(entry.category);
            setPickedCategory(true);
            // The account it used, if it still exists (Cash always does)
            if (entry.accountId && (entry.accountId === CASH_ID || accounts.some(a => a.id === entry.accountId))) setAccountId(entry.accountId);
          }}
        />
      )}

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
                    onClick={() => { setCategory(cat.name); setPickedCategory(true); }}
                    className={`p-4 rounded-[1.5rem] text-[11px] font-bold border-2 transition-all flex flex-col items-center gap-3 ${
                      isSelected
                        ? CHOICE_ON
                        : 'bg-background/50 text-muted border-transparent hover:border-card-border'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${cat.color}`}>
                      <Icon size={20} />
                    </div>
                    <span className="truncate w-full text-center tracking-tight">{categoryLabel(t, cat.name)}</span>
                  </motion.button>
                );
              })}
            </div>
            {ruleCategory && ruleCategory === category && (
              <p className="text-[12px] text-muted font-medium px-1">{t('rules.applied')}</p>
            )}
          </div>

          <div className="space-y-3">
            <label className="text-xs font-semibold text-muted px-1 flex items-center gap-2">
              <Wallet size={12} /> {t('add.paidFrom')}
            </label>
            <AccountPicker accounts={accounts} value={accountId} onChange={setAccountId} symbol={currencySymbol} />
            {accounts.length === 0 && (
              <p className="text-[12px] text-muted font-medium px-1">{t('add.noAccountsHint')}</p>
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

          <LabelField uid={user?.uid} value={labels} onChange={setLabels} />

          <WarrantyField purchaseDay={date} value={warrantyUntil} onChange={setWarrantyUntil} />

          {user && (
            <ReceiptField
              uid={user.uid}
              savedReceiptId={savedReceiptId}
              onSavedReceiptDeleted={() => setSavedReceiptId(undefined)}
              pending={pendingReceipt}
              setPending={setPendingReceipt}
            />
          )}

          {!isEditing && (
            <div className="space-y-4 pt-2">
              <div className="flex items-center justify-between bg-background/50 p-4 rounded-2xl">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-amber-50 dark:bg-amber-500/10 rounded-xl flex items-center justify-center text-amber-600 dark:text-amber-400">
                    <Users size={18} />
                  </div>
                  <div>
                    <p className="font-bold text-sm text-foreground">{t('add.splitBill')}</p>
                    <p className="text-[12px] text-muted font-medium">
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
              {isSplit && (
                <div className="bg-background/50 p-4 rounded-2xl space-y-2">
                  <p className="text-xs font-semibold text-muted">{t('add.splitWho')}</p>
                  {others.map((name, i) => (
                    <input
                      key={i}
                      type="text"
                      maxLength={60}
                      placeholder={t('add.splitPerson', { n: i + 2 })}
                      aria-label={t('add.splitPerson', { n: i + 2 })}
                      className="w-full px-4 py-3 bg-card rounded-xl border border-card-border outline-none focus:border-indigo-500 text-sm text-foreground"
                      value={name}
                      onChange={e => setSplitNames(prev => { const next = [...prev]; next[i] = e.target.value; return next; })}
                    />
                  ))}
                  <p className="text-[12px] text-muted font-medium">{t('add.splitWhoHint')}</p>
                </div>
              )}

              <div className="bg-background/50 p-4 rounded-2xl space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-teal-50 dark:bg-teal-500/10 rounded-xl flex items-center justify-center text-teal-600 dark:text-teal-400">
                    <Repeat size={18} />
                  </div>
                  <div>
                    <p className="font-bold text-sm text-foreground">{t('add.repeat')}</p>
                    <p className="text-[12px] text-muted font-medium">{t('add.repeatHint')}</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {(['none', 'weekly', 'monthly'] as const).map(opt => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setRepeat(opt)}
                      className={`py-2 rounded-xl text-xs font-bold capitalize transition-all ${
                        repeat === opt ? CHOICE_ON : 'bg-card text-muted border border-card-border'
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

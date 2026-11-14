import { useState, useEffect } from 'react';
import { db } from '../../shared/firebase';
import { collection, query, where, orderBy, onSnapshot, doc, writeBatch, updateDoc, deleteField } from 'firebase/firestore';
import { useAuth } from '../../app/App';
import { Deposit, Expense } from '../../shared/types';
import { useIncome } from '../income/incomeService';
import { IncomeRow } from '../income/IncomeRow';
import { motion, AnimatePresence } from 'motion/react';
import { Trash2, Edit2, Search, Download, Calendar, Tag, Loader2, Repeat, Users, Wallet, ThumbsUp, ThumbsDown, Receipt as ReceiptIcon, SlidersHorizontal } from 'lucide-react';
import { format } from 'date-fns';
import { MAJOR_CURRENCIES, DEFAULT_CATEGORIES } from '../../shared/constants';
import { toCSV, downloadFile } from '../reports/reportExport';
import SheetsExportButton from '../connect/SheetsExportButton';
import { expenseRows, tabTitle } from '../connect/googleApps';
import { useAccounts, adjustBalance } from '../accounts/accountService';
import { useI18n, categoryLabel } from '../../shared/i18n';
import { saved } from '../../shared/lib/offlineSave';
import { TRANSACTIONS_MONTHS, fetchAllExpenses, oldestExpenseDate, windowStart } from './expenseQueries';
import { NO_FILTERS, TransactionFilters, activeCount, dateBounds, expenseMatches, incomeMatches } from './transactionFilters';
import FilterSheet from './FilterSheet';
import FilterChips from './FilterChips';
import FullWindow from '../../shared/components/FullWindow';
import ReceiptsGallery from '../receipts/ReceiptsGallery';
import ReceiptViewer from '../receipts/ReceiptViewer';
import { useReceipts } from '../receipts/useReceipts';
import { deleteReceipt, ReceiptError } from '../receipts/receiptService';
import { receiptProblemKey } from '../receipts/receiptFile';
import { showToast } from '../../shared/lib/toast';
import { alertDialog, confirmDialog } from '../../shared/components/Dialog';

// The category chip that shows only income (not a real category name)
const INCOME_CHIP = '__income';

export default function ExpensesPage({ onEdit }: { onEdit: (expense: Expense) => void }) {
  const { user, profile, editIncome } = useAuth();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('All');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [alsoReceipt, setAlsoReceipt] = useState(false); // "Also delete its receipt" in the delete box
  const [isDeleting, setIsDeleting] = useState(false);
  const accounts = useAccounts(user?.uid);
  const { t, dateLocale } = useI18n();
  // Receipts: the window from the header button, and one receipt opened from its icon on a row
  const [receiptsOpen, setReceiptsOpen] = useState(false);
  const receipts = useReceipts(user?.uid, receiptsOpen);
  const [viewing, setViewing] = useState<Expense | null>(null);

  // The expense is already gone (on the phone at least); the receipt needs the server
  const deleteReceiptAfter = (receiptId: string) => {
    deleteReceipt(receiptId)
      .then(() => showToast('receipt.deleted'))
      .catch(err => showToast(err instanceof ReceiptError && err.code === 'offline' ? 'receipt.deleteLater' : 'receipt.problem.delete'));
  };

  const deleteRowReceipt = async (exp: Expense) => {
    if (!exp.receiptId || !(await confirmDialog(t('receipt.deleteConfirm'), { danger: true }))) return;
    try {
      await deleteReceipt(exp.receiptId);
      setViewing(null);
      showToast('receipt.deleted');
    } catch (err) {
      showToast(receiptProblemKey(err instanceof ReceiptError ? err.code : undefined));
    }
  };

  const currencySymbol = MAJOR_CURRENCIES.find(c => c.code === profile?.currency)?.symbol || '৳';

  // Only the last few months are read (Firestore counts every read); "Show older" adds 3 more months each time
  const [months, setMonths] = useState(TRANSACTIONS_MONTHS);
  const [oldest, setOldest] = useState<string | null>(null);
  // The filter sheet. A date filter reads exactly those dates instead of the recent months.
  const [filters, setFilters] = useState<TransactionFilters>(NO_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const bounds = filters.date ? dateBounds(filters.date) : null;
  const since = bounds?.from ?? windowStart(months);
  const until = bounds?.to ?? null;
  const hasOlder = !bounds && !!oldest && oldest < since;

  useEffect(() => {
    if (!user) return;
    oldestExpenseDate(user.uid).then(setOldest).catch(() => setOldest(null));
  }, [user, expenses.length]);

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'expenses'),
      where('uid', '==', user.uid),
      where('date', '>=', since),
      ...(until ? [where('date', '<', until)] : []),
      orderBy('date', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setExpenses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Expense)));
    });

    return unsubscribe;
  }, [user, since, until]);

  // Exports cover every expense that matches the search and category, not just the months on screen
  const allMatching = async () => (await fetchAllExpenses(user!.uid)).filter(matches);

  // Worth it or regret: one tap sets it, tapping the same one again clears it
  const setFeeling = async (exp: Expense, feeling: 'worth' | 'regret') => {
    try {
      await saved(updateDoc(doc(db, 'expenses', exp.id), { feeling: exp.feeling === feeling ? deleteField() : feeling }));
    } catch (error) {
      console.error('Error tagging expense:', error);
      alertDialog(t('regret.tagFailed'));
    }
  };

  const handleDelete = async (id: string) => {
    try {
      setIsDeleting(true);
      // Deleting an expense puts its money back into the account it was paid from
      const expense = expenses.find(e => e.id === id);
      const batch = writeBatch(db);
      batch.delete(doc(db, 'expenses', id));
      // A lend and borrow expense: the account movement belongs to that entry, so only the spending goes
      if (expense && !expense.debtId) adjustBalance(batch, accounts, expense.accountId, expense.amount, 'expenseDelete', expense.title);
      await saved(batch.commit());
      setDeletingId(null);
      if (expense?.receiptId && alsoReceipt) deleteReceiptAfter(expense.receiptId);
    } catch (error) {
      console.error("Error deleting expense:", error);
      alertDialog(t('expenses.deleteFailed'));
    } finally {
      setIsDeleting(false);
    }
  };

  function matches(exp: Expense) {
    const matchesSearch = exp.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         exp.category.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = filterCategory === 'All' || exp.category === filterCategory;
    return matchesSearch && matchesCategory && expenseMatches(exp, filters, bounds);
  }
  const filteredExpenses = expenses.filter(matches);
  const nothingToExport = filteredExpenses.length === 0 && !hasOlder;

  // Income in the same months, shown in green; the Income chip shows only income
  const incomes = useIncome(user?.uid, since);
  const term = searchTerm.toLowerCase();
  const shownIncomes = filterCategory === 'All' || filterCategory === INCOME_CHIP
    ? incomes.filter(d => (!term || (d.title || '').toLowerCase().includes(term) || (d.category || '').toLowerCase().includes(term)) && incomeMatches(d, filters, bounds))
    : [];
  const shownExpenses = filterCategory === INCOME_CHIP ? [] : filteredExpenses;
  type Row = { kind: 'expense'; exp: Expense; date: string } | { kind: 'income'; inc: Deposit; date: string };
  const rows: Row[] = [
    ...shownExpenses.map(exp => ({ kind: 'expense' as const, exp, date: exp.date })),
    ...shownIncomes.map(inc => ({ kind: 'income' as const, inc, date: inc.date })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  const categories = ['All', INCOME_CHIP, ...Array.from(new Set(expenses.map(e => e.category)))];

  return (
    <div className="space-y-8 pb-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">{t('expenses.title')}</h1>
          <p className="text-indigo-600 dark:text-indigo-400 font-bold text-xs">{t('expenses.count', { count: filteredExpenses.length })}</p>
        </div>
        <div className="flex items-center gap-2">
        <button
          onClick={() => setReceiptsOpen(true)}
          title={t('receipts.title')}
          aria-label={t('receipts.title')}
          className="w-10 h-10 bg-card rounded-xl shadow-soft border border-card-border flex items-center justify-center text-slate-400 hover:text-indigo-600 transition-colors"
        >
          <ReceiptIcon size={18} />
        </button>
        <button
          onClick={async () => {
            try {
              downloadFile(`xpences-transactions-${format(new Date(), 'yyyy-MM-dd')}.csv`, toCSV(await allMatching(), profile?.currency || 'BDT'), 'text/csv;charset=utf-8');
            } catch (err) {
              console.error('Could not export transactions:', err);
              alertDialog(t('expenses.exportFailed'));
            }
          }}
          disabled={nothingToExport}
          title={t('expenses.export')}
          aria-label={t('expenses.export')}
          className="w-10 h-10 bg-card rounded-xl shadow-soft border border-card-border flex items-center justify-center text-slate-400 hover:text-indigo-600 disabled:opacity-40 transition-colors"
        >
          <Download size={18} />
        </button>
        <SheetsExportButton
          variant="icon"
          disabled={nothingToExport}
          build={async () => ({
            title: t('sheets.titleExpenses', { date: format(new Date(), 'd MMM yyyy', { locale: dateLocale }) }),
            tabs: [{ title: tabTitle(t('sheet.tabExpenses')), rows: expenseRows(await allMatching(), profile?.currency || 'BDT', t, cat => categoryLabel(t, cat)) }],
          })}
        />
        </div>
      </header>

      {/* Search & Filter */}
      <div className="space-y-5">
        <div className="flex items-center gap-2">
          <div className="relative group flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-600 transition-colors" size={20} />
            <input
              type="text"
              placeholder={t('expenses.search')}
              className="w-full pl-12 pr-4 py-4 bg-card rounded-2xl border border-card-border shadow-soft focus:ring-2 focus:ring-indigo-600 outline-none transition-all text-foreground"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button
            onClick={() => setFiltersOpen(true)}
            aria-label={t('filters.title')}
            className="relative shrink-0 w-14 h-14 bg-card rounded-2xl border border-card-border shadow-soft flex items-center justify-center text-slate-500 hover:text-indigo-600"
          >
            <SlidersHorizontal size={20} />
            {activeCount(filters) > 0 && (
              <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-indigo-600 text-white text-[11px] font-bold flex items-center justify-center">{activeCount(filters)}</span>
            )}
          </button>
        </div>
        <FilterChips filters={filters} setFilters={setFilters} accounts={accounts} symbol={currencySymbol} />
        <FilterSheet open={filtersOpen} onClose={() => setFiltersOpen(false)} value={filters} onApply={setFilters} accounts={accounts} />

        <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar px-1">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setFilterCategory(cat)}
              className={`px-5 py-2.5 rounded-2xl text-xs font-bold whitespace-nowrap transition-all ${
                filterCategory === cat
                  ? 'bg-indigo-600 text-white shadow-vibrant'
                  : 'bg-card text-muted border border-card-border'
              }`}
            >
              {cat === 'All' ? t('expenses.all') : cat === INCOME_CHIP ? t('income.chip') : categoryLabel(t, cat)}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="space-y-4">
        <AnimatePresence>
          {deletingId && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-6"
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="bg-card w-full max-w-xs p-6 rounded-[2.5rem] border border-card-border shadow-2xl text-center space-y-6"
              >
                <div className="w-16 h-16 bg-rose-50 dark:bg-rose-500/10 rounded-2xl flex items-center justify-center mx-auto text-rose-500">
                  <Trash2 size={32} />
                </div>
                <div className="space-y-2">
                  <h3 className="font-bold text-xl text-foreground">{t('expenses.deleteTitle')}</h3>
                  <p className="text-sm text-muted">{t('expenses.deleteBody')}</p>
                </div>
                {expenses.find(e => e.id === deletingId)?.receiptId && (
                  <label className="flex items-center justify-center gap-2.5 cursor-pointer">
                    <input type="checkbox" className="w-4 h-4 accent-indigo-600" checked={alsoReceipt} onChange={e => setAlsoReceipt(e.target.checked)} />
                    <span className="text-sm font-medium text-foreground">{t('receipt.alsoDelete')}</span>
                  </label>
                )}
                <div className="flex gap-3">
                  <button
                    onClick={() => setDeletingId(null)}
                    disabled={isDeleting}
                    className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-muted rounded-2xl text-sm font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-all disabled:opacity-50"
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    onClick={() => handleDelete(deletingId)}
                    disabled={isDeleting}
                    className="flex-1 py-3 bg-rose-500 text-white rounded-2xl text-sm font-bold shadow-lg shadow-rose-500/30 hover:bg-rose-600 transition-all flex items-center justify-center disabled:opacity-50"
                  >
                    {isDeleting ? <Loader2 className="animate-spin" size={18} /> : t('common.delete')}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="popLayout">
          {rows.map((row, index) => {
            if (row.kind === 'income') return <IncomeRow key={`inc-${row.inc.id}`} income={row.inc} symbol={currencySymbol} onOpen={() => editIncome(row.inc)} />;
            const exp = row.exp;
            const categoryConfig = DEFAULT_CATEGORIES.find(c => c.name === exp.category);
            const Icon = categoryConfig?.icon || Tag;
            return (
              <motion.div
                key={exp.id}
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ delay: index * 0.03 }}
                className="bg-card p-4 rounded-[2rem] shadow-soft border border-card-border group hover:shadow-lg transition-all overflow-hidden relative"
              >
                {/* Subtle category tint background */}
                <div className={`absolute inset-0 opacity-[0.03] dark:opacity-[0.05] ${categoryConfig?.color?.split(' ')[0] || 'bg-slate-500'}`} />
                
                <div className="relative z-10 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-sm ${categoryConfig?.color || 'bg-slate-50 dark:bg-slate-800 text-muted'}`}>
                      <Icon size={24} />
                    </div>
                    <div>
                      <p className="font-bold text-foreground group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{exp.title}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs font-semibold text-muted">{categoryLabel(t, exp.category)}</span>
                        <span className="w-1 h-1 bg-slate-300 dark:bg-slate-700 rounded-full" />
                        <span className="flex items-center gap-1 text-xs font-semibold text-muted">
                          <Calendar size={10} />
                          {format(new Date(exp.date), 'MMM d, yyyy', { locale: dateLocale })}
                        </span>
                        {exp.recurringId && <Repeat size={10} className="text-teal-500" aria-label={t('expenses.recurring')} />}
                        {exp.split && <Users size={10} className="text-amber-500" aria-label={t('expenses.split')} />}
                      </div>
                      {exp.accountName && (
                        <p className="flex items-center gap-1 mt-1 text-[11px] font-semibold text-muted">
                          <Wallet size={10} /> {exp.accountName === 'Cash' ? t('accounts.cash') : exp.accountName}
                        </p>
                      )}
                    </div>
                  </div>
                    <div className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {exp.receiptId && (
                          <button
                            onClick={() => setViewing(exp)}
                            aria-label={t('receipt.view')}
                            className="p-1 rounded-lg text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-500/10"
                          >
                            <ReceiptIcon size={15} />
                          </button>
                        )}
                        <p className="font-bold text-foreground text-lg">-{currencySymbol}{exp.amount.toLocaleString()}</p>
                      </div>
                      <div className="flex items-center justify-end gap-2 mt-1 sm:opacity-0 sm:group-hover:opacity-100 transition-all transform sm:translate-y-2 sm:group-hover:translate-y-0">
                        <button
                          onClick={() => onEdit(exp)}
                          aria-label={t('expenses.edit')}
                          className="p-2 text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 rounded-xl transition-colors"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => { setAlsoReceipt(false); setDeletingId(exp.id); }}
                          aria-label={t('expenses.delete')}
                          className="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-xl transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                </div>
                <div className="relative z-10 mt-3 flex items-center gap-2">
                  {([['worth', ThumbsUp, 'regret.worth', 'bg-teal-600 text-white border-teal-600'], ['regret', ThumbsDown, 'regret.regret', 'bg-rose-500 text-white border-rose-500']] as const).map(([feeling, FeelIcon, label, on]) => (
                    <button
                      key={feeling}
                      onClick={() => setFeeling(exp, feeling)}
                      aria-pressed={exp.feeling === feeling}
                      className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full border text-xs font-bold transition-colors ${exp.feeling === feeling ? on : 'border-card-border text-muted hover:text-foreground'}`}
                    >
                      <FeelIcon size={13} /> {t(label)}
                    </button>
                  ))}
                </div>
                {exp.notes && (
                  <div className="relative z-10 mt-4 px-4 py-3 bg-slate-50/50 dark:bg-slate-800/30 rounded-2xl border border-slate-100 dark:border-slate-700/50">
                    <p className="text-xs text-muted italic font-medium">
                      "{exp.notes}"
                    </p>
                  </div>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>

        {filteredExpenses.length === 0 && (
          <div className="text-center py-24 bg-card rounded-[3rem] border border-dashed border-card-border">
            <div className="w-24 h-24 bg-background rounded-full flex items-center justify-center mx-auto mb-6 text-muted">
              <Search size={48} />
            </div>
            <p className="text-foreground font-bold text-lg">{t('expenses.noMatches')}</p>
            <p className="text-muted text-sm mt-1">{t('expenses.noMatchesHint')}</p>
          </div>
        )}
      </div>

      {hasOlder && (
        <div className="space-y-2 text-center">
          {(searchTerm.trim() || filterCategory !== 'All' || activeCount(filters) > 0) && (
            <p className="text-xs text-muted font-medium">{t('expenses.searchWindow', { months })}</p>
          )}
          <button
            onClick={() => setMonths(m => m + TRANSACTIONS_MONTHS)}
            className="w-full py-3 bg-card text-indigo-600 dark:text-indigo-400 border border-card-border rounded-2xl text-sm font-bold"
          >
            {t('expenses.showOlder')}
          </button>
        </div>
      )}

      <FullWindow
        open={receiptsOpen}
        atRoot
        onClose={() => setReceiptsOpen(false)}
        onBack={() => setReceiptsOpen(false)}
        pageKey="receipts"
        icon={<ReceiptIcon size={20} className="text-indigo-600 dark:text-indigo-400" />}
        title={t('receipts.title')}
      >
        <ReceiptsGallery
          receipts={receipts}
          expenses={expenses}
          onOpenExpense={(exp) => { setReceiptsOpen(false); onEdit(exp); }}
        />
      </FullWindow>

      {viewing?.receiptId && (
        <ReceiptViewer
          receiptId={viewing.receiptId}
          onClose={() => setViewing(null)}
          onDelete={() => deleteRowReceipt(viewing)}
        />
      )}
    </div>
  );
}

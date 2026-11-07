import { useState, useEffect } from 'react';
import { db } from '../../shared/firebase';
import { collection, query, where, orderBy, onSnapshot, doc, writeBatch, updateDoc, deleteField } from 'firebase/firestore';
import { useAuth } from '../../app/App';
import { Expense } from '../../shared/types';
import { motion, AnimatePresence } from 'motion/react';
import { Trash2, Edit2, Search, Download, Calendar, Tag, Loader2, Repeat, Users, Wallet, ThumbsUp, ThumbsDown } from 'lucide-react';
import { format } from 'date-fns';
import { MAJOR_CURRENCIES, DEFAULT_CATEGORIES } from '../../shared/constants';
import { toCSV, downloadFile } from '../reports/reportExport';
import { useAccounts, adjustBalance } from '../accounts/accountService';
import { useI18n, categoryLabel } from '../../shared/i18n';
import { alertDialog } from '../../shared/components/Dialog';
import { saved } from '../../shared/lib/offlineSave';

export default function ExpensesPage({ onEdit }: { onEdit: (expense: Expense) => void }) {
  const { user, profile } = useAuth();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('All');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const accounts = useAccounts(user?.uid);
  const { t, dateLocale } = useI18n();

  const currencySymbol = MAJOR_CURRENCIES.find(c => c.code === profile?.currency)?.symbol || '৳';

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'expenses'),
      where('uid', '==', user.uid),
      orderBy('date', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setExpenses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Expense)));
    });

    return unsubscribe;
  }, [user]);

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
    } catch (error) {
      console.error("Error deleting expense:", error);
      alertDialog(t('expenses.deleteFailed'));
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredExpenses = expenses.filter(exp => {
    const matchesSearch = exp.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         exp.category.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = filterCategory === 'All' || exp.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  const categories = ['All', ...Array.from(new Set(expenses.map(e => e.category)))];

  return (
    <div className="space-y-8 pb-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">{t('expenses.title')}</h1>
          <p className="text-indigo-600 dark:text-indigo-400 font-bold text-xs">{t('expenses.count', { count: filteredExpenses.length })}</p>
        </div>
        <button
          onClick={() => downloadFile(`xpencex-transactions-${format(new Date(), 'yyyy-MM-dd')}.csv`, toCSV(filteredExpenses, profile?.currency || 'BDT'), 'text/csv;charset=utf-8')}
          disabled={filteredExpenses.length === 0}
          title={t('expenses.export')}
          aria-label={t('expenses.export')}
          className="w-10 h-10 bg-card rounded-xl shadow-soft border border-card-border flex items-center justify-center text-slate-400 hover:text-indigo-600 disabled:opacity-40 transition-colors"
        >
          <Download size={18} />
        </button>
      </header>

      {/* Search & Filter */}
      <div className="space-y-5">
        <div className="relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-600 transition-colors" size={20} />
          <input
            type="text"
            placeholder={t('expenses.search')}
            className="w-full pl-12 pr-4 py-4 bg-card rounded-2xl border border-card-border shadow-soft focus:ring-2 focus:ring-indigo-600 outline-none transition-all text-foreground"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

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
              {cat === 'All' ? t('expenses.all') : categoryLabel(t, cat)}
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
          {filteredExpenses.map((exp, index) => {
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
                        <p className="flex items-center gap-1 mt-1 text-[10px] font-semibold text-muted">
                          <Wallet size={10} /> {exp.accountName === 'Cash' ? t('accounts.cash') : exp.accountName}
                        </p>
                      )}
                    </div>
                  </div>
                    <div className="text-right">
                      <p className="font-bold text-foreground text-lg">-{currencySymbol}{exp.amount.toLocaleString()}</p>
                      <div className="flex items-center justify-end gap-2 mt-1 sm:opacity-0 sm:group-hover:opacity-100 transition-all transform sm:translate-y-2 sm:group-hover:translate-y-0">
                        <button
                          onClick={() => onEdit(exp)}
                          aria-label={t('expenses.edit')}
                          className="p-2 text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 rounded-xl transition-colors"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => setDeletingId(exp.id)}
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
    </div>
  );
}

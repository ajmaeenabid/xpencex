import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { addDoc, collection, deleteDoc, deleteField, doc, FieldPath, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import { AnimatePresence, motion } from 'motion/react';
import { PanelLeftClose, PieChart, Plus, Tag, Trash2, Wallet } from 'lucide-react';
import { useAuth } from '../../app/App';
import { db } from '../../shared/firebase';
import { Category } from '../../shared/types';
import { DEFAULT_CATEGORIES, MAJOR_CURRENCIES } from '../../shared/constants';
import { useI18n, categoryLabel } from '../../shared/i18n';
import { saved } from '../../shared/lib/offlineSave';
import { alertDialog, confirmDialog } from '../../shared/components/Dialog';
import Select from '../../shared/components/Select';
import RecurringCard from '../profile/RecurringCard';
import CategoryRulesCard from '../categoryRules/CategoryRulesCard';
import WarrantiesCard from '../warranties/WarrantiesCard';
import { lockScroll } from '../../shared/lib/scrollLock';
import { useBackClose } from '../../shared/lib/backButton';

// The Expenses side panel: monthly budget, category budgets, recurring expenses and custom categories
// (moved here from Profile). Search opens it with OPEN_EXPENSE_SETTINGS and then finds a card by its
// data-section ("expenses:budget" and so on, see revealSection.ts).

export const OPEN_EXPENSE_SETTINGS = 'xpences-open-expense-settings';

const card = 'bg-card p-5 rounded-3xl shadow-sm border border-card-border space-y-4 transition-colors';
const field = 'px-3 py-3 bg-background/50 rounded-xl border-none focus:ring-2 focus:ring-indigo-600 outline-none text-sm text-foreground';

/** The person's own categories, live */
function useCustomCategories(uid: string | undefined) {
  const [categories, setCategories] = useState<Category[]>([]);
  useEffect(() => {
    if (!uid) return;
    const q = query(collection(db, 'categories'), where('uid', '==', uid));
    return onSnapshot(q, snap => setCategories(snap.docs.map(d => ({ id: d.id, ...d.data() } as Category))));
  }, [uid]);
  return categories;
}

export default function ExpenseSettingsDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const categories = useCustomCategories(user?.uid);

  // Close with Escape; the page behind doesn't scroll
  // The phone's back button does the same (src/shared/lib/backButton.ts)
  useBackClose(open, onClose);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const unlockScroll = lockScroll();
    return () => { window.removeEventListener('keydown', onKey); unlockScroll(); };
  }, [open, onClose]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[60] bg-black/30 backdrop-blur-[2px]"
          />
          <motion.aside
            key="drawer"
            role="dialog"
            aria-modal="true"
            aria-label={t('expenses.settings')}
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 38 }}
            className="fixed inset-y-0 left-0 z-[61] w-[90%] max-w-sm flex flex-col bg-background border-r border-card-border rounded-r-[2rem] shadow-2xl pt-[var(--sat)] pb-[var(--sab)]"
          >
            <div className="flex items-center justify-between gap-2 px-5 pt-5 pb-3">
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-foreground">{t('expenses.settings')}</h2>
                <p className="text-xs text-muted font-medium">{t('expenses.settingsHint')}</p>
              </div>
              <button onClick={onClose} aria-label={t('common.close')} className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-muted hover:text-foreground hover:bg-card">
                <PanelLeftClose size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-4">
              <div data-section="expenses:budget"><BudgetCard /></div>
              <div data-section="expenses:categoryBudgets"><CategoryBudgetsCard categories={categories} /></div>
              <div data-section="expenses:recurring"><RecurringCard /></div>
              <div data-section="expenses:warranties"><WarrantiesCard /></div>
              <div data-section="expenses:categories"><CategoriesCard categories={categories} /></div>
              <div data-section="expenses:categoryRules"><CategoryRulesCard categories={categories} /></div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function BudgetCard() {
  const { user, profile, refreshProfile } = useAuth();
  const { t } = useI18n();
  const [budget, setBudget] = useState(profile?.monthlyBudget?.toString() || '5000');
  const [editing, setEditing] = useState(false);

  // The profile may load after this opens
  useEffect(() => {
    if (profile?.monthlyBudget !== undefined && !editing) setBudget(profile.monthlyBudget.toString());
  }, [profile?.monthlyBudget]);

  const save = async () => {
    const value = parseFloat(budget);
    if (!user || !Number.isFinite(value) || value <= 0) {
      alertDialog(t('profile.budgetPositive'));
      return;
    }
    try {
      await saved(updateDoc(doc(db, 'users', user.uid), { monthlyBudget: value }));
      await refreshProfile();
      setEditing(false);
    } catch (err) {
      console.error('Error updating budget:', err);
    }
  };

  return (
    <div className={card}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl flex items-center justify-center text-indigo-600 dark:text-indigo-400">
            <Wallet size={20} />
          </div>
          <h3 className="font-bold text-foreground">{t('home.monthlyBudget')}</h3>
        </div>
        {!editing ? (
          <button onClick={() => setEditing(true)} className="text-indigo-600 dark:text-indigo-400 font-bold text-sm">{t('common.edit')}</button>
        ) : (
          <button onClick={save} className="text-emerald-600 dark:text-emerald-400 font-bold text-sm">{t('common.save')}</button>
        )}
      </div>
      {editing ? (
        <input type="number" className={`w-full ${field} text-base`} value={budget} onChange={e => setBudget(e.target.value)} />
      ) : (
        <p className="text-2xl font-bold text-foreground">{profile?.currency || 'BDT'} {(profile?.monthlyBudget ?? 0).toLocaleString()}</p>
      )}
    </div>
  );
}

function CategoryBudgetsCard({ categories }: { categories: Category[] }) {
  const { user, profile, refreshProfile } = useAuth();
  const { t } = useI18n();
  const [name, setName] = useState(DEFAULT_CATEGORIES[0].name);
  const [amount, setAmount] = useState('');
  const symbol = MAJOR_CURRENCIES.find(c => c.code === profile?.currency)?.symbol || '৳';
  const allNames = [...DEFAULT_CATEGORIES.map(c => c.name), ...categories.map(c => c.name)];

  // FieldPath, not a dotted string, because category names may contain spaces or dots
  const set = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = parseFloat(amount);
    if (!user || !Number.isFinite(value) || value <= 0) return;
    try {
      await saved(updateDoc(doc(db, 'users', user.uid), new FieldPath('categoryBudgets', name), value));
      await refreshProfile();
      setAmount('');
    } catch (err) {
      console.error('Error setting category budget:', err);
    }
  };

  const remove = async (category: string) => {
    if (!user) return;
    try {
      await saved(updateDoc(doc(db, 'users', user.uid), new FieldPath('categoryBudgets', category), deleteField()));
      await refreshProfile();
    } catch (err) {
      console.error('Error removing category budget:', err);
    }
  };

  return (
    <div className={card}>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 shrink-0 bg-emerald-50 dark:bg-emerald-900/30 rounded-xl flex items-center justify-center text-emerald-600 dark:text-emerald-400">
          <PieChart size={20} />
        </div>
        <div className="min-w-0">
          <h3 className="font-bold text-foreground">{t('home.categoryBudgets')}</h3>
          <p className="text-xs text-muted font-medium">{t('profile.categoryBudgetsHint')}</p>
        </div>
      </div>

      <form onSubmit={set} className="flex gap-2">
        <div className="flex-1 min-w-0">
          <Select
            ariaLabel={t('add.category')}
            value={name}
            onChange={setName}
            options={allNames.map(n => ({ value: n, label: categoryLabel(t, n) }))}
          />
        </div>
        <input
          type="number"
          min="1"
          inputMode="decimal"
          placeholder={t('profile.limit', { symbol })}
          className={`w-24 ${field}`}
          value={amount}
          onChange={e => setAmount(e.target.value)}
        />
        <button type="submit" aria-label={t('profile.setBudget')} className="shrink-0 p-3 bg-indigo-600 text-white rounded-xl">
          <Plus size={20} />
        </button>
      </form>

      <div className="space-y-2">
        {Object.entries(profile?.categoryBudgets || {}).map(([category, limit]) => (
          <div key={category} className="flex items-center justify-between p-3 bg-background/50 rounded-xl border border-card-border">
            <span className="text-sm font-bold text-muted truncate">{categoryLabel(t, category)}</span>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-sm font-bold text-foreground">{symbol}{limit.toLocaleString()}</span>
              <button
                onClick={() => remove(category)}
                aria-label={t('profile.removeBudget', { name: categoryLabel(t, category) })}
                className="p-1.5 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/40 rounded-lg transition-colors"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
        {Object.keys(profile?.categoryBudgets || {}).length === 0 && (
          <p className="text-center py-2 text-muted text-sm font-medium italic">{t('profile.noCategoryBudgets')}</p>
        )}
      </div>
    </div>
  );
}

function CategoriesCard({ categories }: { categories: Category[] }) {
  const { user } = useAuth();
  const { t } = useI18n();
  const [newName, setNewName] = useState('');

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!user || !name) return;
    const exists = [...DEFAULT_CATEGORIES.map(c => c.name), ...categories.map(c => c.name)]
      .some(n => n.toLowerCase() === name.toLowerCase());
    if (exists) {
      alertDialog(t('profile.categoryExists'));
      return;
    }
    try {
      await saved(addDoc(collection(db, 'categories'), { uid: user.uid, name, icon: 'Tag', createdAt: new Date().toISOString() }));
      setNewName('');
    } catch (err) {
      console.error('Error adding category:', err);
    }
  };

  const remove = async (id: string) => {
    if (await confirmDialog(t('profile.confirmDeleteCategory'), { danger: true })) {
      await saved(deleteDoc(doc(db, 'categories', id)));
    }
  };

  return (
    <div className={card}>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl flex items-center justify-center text-indigo-600 dark:text-indigo-400">
          <Tag size={20} />
        </div>
        <h3 className="font-bold text-foreground">{t('profile.customCategories')}</h3>
      </div>

      <form onSubmit={add} className="flex gap-2">
        <input
          type="text"
          placeholder={t('profile.newCategory')}
          className={`flex-1 min-w-0 ${field}`}
          value={newName}
          onChange={e => setNewName(e.target.value)}
        />
        <button type="submit" aria-label={t('profile.newCategory')} className="shrink-0 p-3 bg-indigo-600 text-white rounded-xl">
          <Plus size={20} />
        </button>
      </form>

      <div className="space-y-2">
        <AnimatePresence mode="popLayout">
          {categories.map(cat => (
            <motion.div
              key={cat.id}
              layout
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="flex items-center justify-between p-3 bg-background/50 rounded-xl border border-card-border"
            >
              <span className="text-sm font-bold text-muted truncate">{cat.name}</span>
              <button
                onClick={() => remove(cat.id!)}
                aria-label={t('common.delete')}
                className="p-1.5 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/40 rounded-lg transition-colors"
              >
                <Trash2 size={16} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
        {categories.length === 0 && (
          <p className="text-center py-4 text-muted text-sm font-medium italic">{t('profile.noCustomCategories')}</p>
        )}
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { db } from '../../shared/firebase';
import { collection, query, where, onSnapshot, addDoc, deleteDoc, doc, updateDoc, deleteField, FieldPath } from 'firebase/firestore';
import { useAuth } from '../../app/App';
import { Category, RecurringExpense } from '../../shared/types';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { LogOut, Pencil, Plus, Trash2, Wallet, Tag, Globe, PieChart, Repeat, Languages } from 'lucide-react';
import { MAJOR_CURRENCIES, DEFAULT_CATEGORIES } from '../../shared/constants';
import { useAccounts } from '../accounts/accountService';
import AccountsManager from '../accounts/AccountsManager';
import AdminPanel from '../admin/AdminPanel';
import AccountNotices from './AccountNotices';
import DeleteAccount from './DeleteAccount';
import PrivacyLink from '../../shared/components/PrivacyLink';
import PinSettings from '../pin/PinSettings';
import { signOutAndForget } from '../auth/deviceService';
import { useUsernameForm } from '../auth/AccessScreens';
import { RearrangeButton, RearrangeList, useRearrange } from '../../shared/components/Rearrange';

// Movable cards, in their default order
const PROFILE_SECTIONS = ['accounts', 'admin', 'notices', 'pin', 'language', 'currency', 'budget', 'categoryBudgets', 'recurring', 'categories'];
import Select from '../../shared/components/Select';
import LanguageToggle from '../../shared/components/LanguageToggle';
import { useI18n, categoryLabel } from '../../shared/i18n';
import { alertDialog, confirmDialog } from '../../shared/components/Dialog';

export default function ProfilePage({ openAccountsSignal }: { openAccountsSignal?: number }) {
  const { user, profile, refreshProfile } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [budget, setBudget] = useState(profile?.monthlyBudget?.toString() || '5000');
  const [isEditingBudget, setIsEditingBudget] = useState(false);
  const [isEditingCurrency, setIsEditingCurrency] = useState(false);
  const [recurring, setRecurring] = useState<RecurringExpense[]>([]);
  const [catBudgetName, setCatBudgetName] = useState(DEFAULT_CATEGORIES[0].name);
  const [catBudgetAmount, setCatBudgetAmount] = useState('');
  const accounts = useAccounts(user?.uid);
  const { t, dateLocale } = useI18n();
  const layout = useRearrange('profile', PROFILE_SECTIONS);
  const [isEditingName, setIsEditingName] = useState(false);
  const usernameForm = useUsernameForm(profile?.username || '', async () => {
    await refreshProfile();
    setIsEditingName(false);
  });

  const currencySymbol = MAJOR_CURRENCIES.find(c => c.code === profile?.currency)?.symbol || '৳';
  const allCategoryNames = [...DEFAULT_CATEGORIES.map(c => c.name), ...categories.map(c => c.name)];

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'recurring'), where('uid', '==', user.uid));
    return onSnapshot(q, (snapshot) => {
      setRecurring(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as RecurringExpense)));
    });
  }, [user]);

  // FieldPath, not a dotted string, because category names may contain spaces or dots
  const handleSetCategoryBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = parseFloat(catBudgetAmount);
    if (!user || !Number.isFinite(value) || value <= 0) return;
    try {
      await updateDoc(doc(db, 'users', user.uid), new FieldPath('categoryBudgets', catBudgetName), value);
      await refreshProfile();
      setCatBudgetAmount('');
    } catch (err) {
      console.error("Error setting category budget:", err);
    }
  };

  const handleRemoveCategoryBudget = async (name: string) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'users', user.uid), new FieldPath('categoryBudgets', name), deleteField());
      await refreshProfile();
    } catch (err) {
      console.error("Error removing category budget:", err);
    }
  };

  const handleDeleteRecurring = async (id: string) => {
    if (await confirmDialog(t('profile.confirmStopRecurring'), { danger: true })) {
      await deleteDoc(doc(db, 'recurring', id));
    }
  };

  // Profile may load after this component mounts
  useEffect(() => {
    if (profile?.monthlyBudget !== undefined && !isEditingBudget) setBudget(profile.monthlyBudget.toString());
  }, [profile?.monthlyBudget]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'categories'), where('uid', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setCategories(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Category)));
    });
    return unsubscribe;
  }, [user]);

  const handleLogout = () => signOutAndForget();

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newCategoryName.trim();
    if (!user || !name) return;
    const exists = [...DEFAULT_CATEGORIES.map(c => c.name), ...categories.map(c => c.name)]
      .some(n => n.toLowerCase() === name.toLowerCase());
    if (exists) {
      alertDialog(t('profile.categoryExists'));
      return;
    }
    try {
      await addDoc(collection(db, 'categories'), {
        uid: user.uid,
        name,
        icon: 'Tag',
        createdAt: new Date().toISOString(),
      });
      setNewCategoryName('');
    } catch (err) {
      console.error("Error adding category:", err);
    }
  };

  const handleDeleteCategory = async (id: string) => {
    if (await confirmDialog(t('profile.confirmDeleteCategory'), { danger: true })) {
      await deleteDoc(doc(db, 'categories', id));
    }
  };

  const handleUpdateBudget = async () => {
    const value = parseFloat(budget);
    if (!user || !Number.isFinite(value) || value <= 0) {
      alertDialog(t('profile.budgetPositive'));
      return;
    }
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        monthlyBudget: value,
      });
      await refreshProfile();
      setIsEditingBudget(false);
    } catch (err) {
      console.error("Error updating budget:", err);
    }
  };

  const handleUpdateCurrency = async (code: string) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        currency: code,
      });
      await refreshProfile();
      setIsEditingCurrency(false);
    } catch (err) {
      console.error("Error updating currency:", err);
    }
  };

  return (
    <div className="space-y-6 pb-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">{t('profile.title')}</h1>
        <div className="flex items-center gap-2">
          <RearrangeButton layout={layout} size="sm" />
          <button onClick={handleLogout} aria-label={t('profile.logout')} className="w-9 h-9 flex items-center justify-center bg-red-50 dark:bg-red-900/20 text-red-500 rounded-xl hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {/* User Info Card */}
      <div className="bg-card p-6 rounded-3xl shadow-sm border border-card-border flex items-center gap-4 transition-colors">
        <div className="w-16 h-16 bg-indigo-100 dark:bg-indigo-900/30 rounded-2xl flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold text-2xl">
          {profile?.username?.[0]?.toUpperCase() || 'U'}
        </div>
        {isEditingName ? (
          <form onSubmit={usernameForm.submit} className="flex-1 min-w-0 space-y-2">
            <input
              aria-label={t('username.label')}
              autoFocus
              autoCapitalize="none"
              autoCorrect="off"
              maxLength={20}
              className="w-full px-3 py-2 bg-background/50 rounded-xl text-sm text-foreground outline-none focus:ring-2 focus:ring-indigo-600"
              value={usernameForm.username}
              onChange={e => usernameForm.setUsername(e.target.value)}
            />
            {usernameForm.error && <p role="alert" className="text-rose-500 text-xs font-bold">{usernameForm.error}</p>}
            <div className="flex gap-3 text-sm font-bold">
              <button type="submit" disabled={usernameForm.saving} className="text-emerald-600 dark:text-emerald-400 disabled:opacity-50">{t('common.save')}</button>
              <button type="button" onClick={() => { usernameForm.setUsername(profile?.username || ''); setIsEditingName(false); }} className="text-muted">{t('common.cancel')}</button>
            </div>
          </form>
        ) : (
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-foreground truncate">{profile?.username || t('home.user')}</h2>
              <button onClick={() => { usernameForm.setUsername(profile?.username || ''); setIsEditingName(true); }} aria-label={t('username.change')} className="shrink-0 p-1 text-muted hover:text-foreground">
                <Pencil size={14} />
              </button>
            </div>
            <p className="text-sm text-muted font-medium truncate">{profile?.email}</p>
          </div>
        )}
      </div>

      {/* The cards below can be moved with the button at the top; the header and name card stay */}
      <RearrangeList layout={layout} className="space-y-6" sections={[
      { id: 'accounts', node: user && <AccountsManager uid={user.uid} accounts={accounts} symbol={currencySymbol} openSignal={openAccountsSignal} /> },

      // Appears only when the server confirms this user is the admin
      { id: 'admin', node: user && <AdminPanel /> },

      { id: 'notices', node: user && <AccountNotices uid={user.uid} /> },

      { id: 'pin', node: user && <PinSettings uid={user.uid} /> },

      { id: 'language', node: (
      <div className="bg-card p-6 rounded-3xl shadow-sm border border-card-border flex items-center justify-between gap-3 transition-colors">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 shrink-0 bg-teal-50 dark:bg-teal-900/30 rounded-xl flex items-center justify-center text-teal-600 dark:text-teal-400">
            <Languages size={20} />
          </div>
          <p className="font-bold text-foreground truncate">{t('profile.language')}</p>
        </div>
        <LanguageToggle ariaLabel={t('profile.language')} />
      </div>
      ) },

      { id: 'currency', node: (
      <div className="bg-card p-6 rounded-3xl shadow-sm border border-card-border space-y-4 transition-colors">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-50 dark:bg-blue-900/30 rounded-xl flex items-center justify-center text-blue-600 dark:text-blue-400">
              <Globe size={20} />
            </div>
            <h3 className="font-bold text-foreground">{t('profile.currency')}</h3>
          </div>
          <button onClick={() => setIsEditingCurrency(!isEditingCurrency)} className="text-indigo-600 dark:text-indigo-400 font-bold text-sm">
            {isEditingCurrency ? t('common.cancel') : t('profile.change')}
          </button>
        </div>
        
        {isEditingCurrency ? (
          <div className="grid grid-cols-2 gap-2">
            {MAJOR_CURRENCIES.map((curr) => (
              <button
                key={curr.code}
                onClick={() => handleUpdateCurrency(curr.code)}
                className={`p-3 rounded-xl text-sm font-bold border transition-all ${
                  profile?.currency === curr.code
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-background/50 text-muted border-card-border'
                }`}
              >
                {curr.code} ({curr.symbol})
              </button>
            ))}
          </div>
        ) : (
          <p className="text-xl font-bold text-foreground">
            {MAJOR_CURRENCIES.find(c => c.code === profile?.currency)?.name || profile?.currency || 'Bangladeshi Taka'} ({profile?.currency || 'BDT'})
          </p>
        )}
      </div>
      ) },

      { id: 'budget', node: (
      <div className="bg-card p-6 rounded-3xl shadow-sm border border-card-border space-y-4 transition-colors">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <Wallet size={20} />
            </div>
            <h3 className="font-bold text-foreground">{t('home.monthlyBudget')}</h3>
          </div>
          {!isEditingBudget ? (
            <button onClick={() => setIsEditingBudget(true)} className="text-indigo-600 dark:text-indigo-400 font-bold text-sm">{t('common.edit')}</button>
          ) : (
            <button onClick={handleUpdateBudget} className="text-emerald-600 dark:text-emerald-400 font-bold text-sm">{t('common.save')}</button>
          )}
        </div>
        
        {isEditingBudget ? (
          <div className="flex gap-2">
            <input
              type="number"
              className="flex-1 px-4 py-3 bg-background/50 rounded-xl border-none focus:ring-2 focus:ring-indigo-600 outline-none text-foreground"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
            />
          </div>
        ) : (
          <p className="text-2xl font-bold text-foreground">{profile?.currency || 'BDT'} {(profile?.monthlyBudget ?? 0).toLocaleString()}</p>
        )}
      </div>
      ) },

      { id: 'categoryBudgets', node: (
      <div className="bg-card p-6 rounded-3xl shadow-sm border border-card-border space-y-4 transition-colors">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-50 dark:bg-emerald-900/30 rounded-xl flex items-center justify-center text-emerald-600 dark:text-emerald-400">
            <PieChart size={20} />
          </div>
          <div>
            <h3 className="font-bold text-foreground">{t('home.categoryBudgets')}</h3>
            <p className="text-xs text-muted font-medium">{t('profile.categoryBudgetsHint')}</p>
          </div>
        </div>

        <form onSubmit={handleSetCategoryBudget} className="flex gap-2">
          <div className="flex-1 min-w-0">
            <Select
              ariaLabel={t('add.category')}
              value={catBudgetName}
              onChange={setCatBudgetName}
              options={allCategoryNames.map(name => ({ value: name, label: categoryLabel(t, name) }))}
            />
          </div>
          <input
            type="number"
            min="1"
            inputMode="decimal"
            placeholder={t('profile.limit', { symbol: currencySymbol })}
            className="w-28 px-3 py-3 bg-background/50 rounded-xl border-none focus:ring-2 focus:ring-indigo-600 outline-none text-sm text-foreground"
            value={catBudgetAmount}
            onChange={(e) => setCatBudgetAmount(e.target.value)}
          />
          <button type="submit" aria-label={t('profile.setBudget')} className="p-3 bg-indigo-600 text-white rounded-xl">
            <Plus size={20} />
          </button>
        </form>

        <div className="space-y-2">
          {Object.entries(profile?.categoryBudgets || {}).map(([name, limit]) => (
            <div key={name} className="flex items-center justify-between p-3 bg-background/50 rounded-xl border border-card-border">
              <span className="text-sm font-bold text-muted">{categoryLabel(t, name)}</span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-foreground">{currencySymbol}{limit.toLocaleString()}</span>
                <button
                  onClick={() => handleRemoveCategoryBudget(name)}
                  aria-label={t('profile.removeBudget', { name: categoryLabel(t, name) })}
                  className="p-1.5 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/40 rounded-lg transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
          {Object.keys(profile?.categoryBudgets || {}).length === 0 && (
            <p className="text-center py-2 text-slate-400 dark:text-slate-500 text-sm font-medium italic">{t('profile.noCategoryBudgets')}</p>
          )}
        </div>
      </div>
      ) },

      { id: 'recurring', node: (
      <div className="bg-card p-6 rounded-3xl shadow-sm border border-card-border space-y-4 transition-colors">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-teal-50 dark:bg-teal-900/30 rounded-xl flex items-center justify-center text-teal-600 dark:text-teal-400">
            <Repeat size={20} />
          </div>
          <div>
            <h3 className="font-bold text-foreground">{t('profile.recurring')}</h3>
            <p className="text-xs text-muted font-medium">{t('profile.recurringHint')}</p>
          </div>
        </div>
        <div className="space-y-2">
          {recurring.map(rule => (
            <div key={rule.id} className="flex items-center justify-between p-3 bg-background/50 rounded-xl border border-card-border">
              <div className="min-w-0">
                <p className="text-sm font-bold text-foreground truncate">{rule.title}</p>
                <p className="text-[11px] text-muted font-medium">
                  {currencySymbol}{rule.amount.toLocaleString()} · {rule.frequency === 'weekly' ? t('add.repeat.weekly') : t('add.repeat.monthly')} · {t('profile.next', { date: format(new Date(rule.nextDate), 'd MMM', { locale: dateLocale }) })}
                </p>
              </div>
              <button
                onClick={() => handleDeleteRecurring(rule.id)}
                aria-label={t('profile.stop', { title: rule.title })}
                className="p-1.5 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/40 rounded-lg transition-colors"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          {recurring.length === 0 && (
            <p className="text-center py-2 text-slate-400 dark:text-slate-500 text-sm font-medium italic">{t('profile.noRecurring')}</p>
          )}
        </div>
      </div>
      ) },

      { id: 'categories', node: (
      <div className="bg-card p-6 rounded-3xl shadow-sm border border-card-border space-y-6 transition-colors">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl flex items-center justify-center text-indigo-600 dark:text-indigo-400">
            <Tag size={20} />
          </div>
          <h3 className="font-bold text-foreground">{t('profile.customCategories')}</h3>
        </div>

        <form onSubmit={handleAddCategory} className="flex gap-2">
          <input
            type="text"
            placeholder={t('profile.newCategory')}
            className="flex-1 px-4 py-3 bg-background/50 rounded-xl border-none focus:ring-2 focus:ring-indigo-600 outline-none text-sm text-foreground"
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
          />
          <button
            type="submit"
            className="p-3 bg-indigo-600 text-white rounded-xl shadow-lg shadow-indigo-100 dark:shadow-indigo-900/20"
          >
            <Plus size={20} />
          </button>
        </form>

        <div className="space-y-2">
          <AnimatePresence mode="popLayout">
            {categories.map((cat) => (
              <motion.div
                key={cat.id}
                layout
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="flex items-center justify-between p-3 bg-background/50 rounded-xl border border-card-border"
              >
                <span className="text-sm font-bold text-muted">{cat.name}</span>
                <button
                  onClick={() => handleDeleteCategory(cat.id!)}
                  className="p-1.5 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/40 rounded-lg transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
          {categories.length === 0 && (
            <p className="text-center py-4 text-slate-400 dark:text-slate-500 text-sm font-medium italic">{t('profile.noCustomCategories')}</p>
          )}
        </div>
      </div>
      ) },
      ]} />

      {profile?.username && <DeleteAccount username={profile.username} />}

      {/* App Info */}
      <div className="text-center py-6">
        <p className="text-muted text-xs font-bold">XpenceX v1.0.0</p>
        <p className="mt-2"><PrivacyLink /></p>
      </div>
    </div>
  );
}

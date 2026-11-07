import { useState, useEffect } from 'react';
import { db } from '../../shared/firebase';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../../app/App';
import { Expense } from '../../shared/types';
import { motion, AnimatePresence } from 'motion/react';
import { Wallet, Clock, Tag, Sparkles, AlertTriangle, CheckCircle2, Info, Landmark, Smartphone, ChevronRight, Sun, Moon, Eye, EyeOff, HandCoins, Calculator } from 'lucide-react';
import { CalculatorSheet, SpendingCharts } from '../../app/lazyParts';
import LazyPart, { LoadingSpot } from '../../shared/components/LazyPart';
import { format, startOfMonth, startOfWeek, subMonths } from 'date-fns';
import { useAccounts } from '../accounts/accountService';
import { useLoans } from '../accounts/loanService';
import { activeLoans, nextAmount } from '../accounts/loans';
import { accountDisplayName, isMobile, MOBILE_PROVIDERS } from '../accounts/accounts';
import { MAJOR_CURRENCIES, DEFAULT_CATEGORIES } from '../../shared/constants';
import { buildInsights, sumByCategory, Insight } from './insights';
import SpendingCard from './SpendingCard';
import { RearrangeButton, RearrangeList, useRearrange } from '../../shared/components/Rearrange';
import RunwayCard from './RunwayCard';
import DebtsCard from '../debts/DebtsCard';

// Movable cards, in their default order
const HOME_SECTIONS = ['budget', 'spending', 'accounts', 'runway', 'debts', 'calculator', 'loan', 'insights', 'categoryBudgets', 'charts', 'recent'];
import { useI18n, categoryLabel } from '../../shared/i18n';

const INSIGHT_STYLES: Record<Insight['tone'], { icon: typeof Info; className: string }> = {
  danger: { icon: AlertTriangle, className: 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400' },
  warning: { icon: AlertTriangle, className: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400' },
  good: { icon: CheckCircle2, className: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400' },
  info: { icon: Info, className: 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400' },
};

export default function HomePage({ onViewAll, onManageAccounts, onSaveExpense }: { onViewAll?: () => void; onManageAccounts?: () => void; onSaveExpense?: (amount: number, people?: number) => void }) {
  const [calcOpen, setCalcOpen] = useState(false);
  // The calculator downloads on its first use, then stays, so it keeps what was typed
  const [calcUsed, setCalcUsed] = useState(false);
  useEffect(() => { if (calcOpen) setCalcUsed(true); }, [calcOpen]);
  const layout = useRearrange('home', HOME_SECTIONS);
  const { user, profile, isDarkMode, toggleDarkMode } = useAuth();
  const { t, dateLocale } = useI18n();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [summary, setSummary] = useState({ today: 0, week: 0, month: 0 });
  const accounts = useAccounts(user?.uid);
  const openLoans = activeLoans(useLoans(user?.uid));
  const nextLoan = openLoans[0];
  const totalBalance = accounts.reduce((sum, a) => sum + a.balance, 0);
  // Balances stay hidden until the user taps them; they hide again when Home is left
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const allShown = accounts.length > 0 && accounts.every(a => revealed.has(a.id));
  const toggleBalance = (id: string) => setRevealed(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const currencySymbol = MAJOR_CURRENCIES.find(c => c.code === profile?.currency)?.symbol || '৳';

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'expenses'),
      where('uid', '==', user.uid),
      // From the start of last month: covers this month's totals, a week that began last month, and month-over-month insights
      where('date', '>=', startOfMonth(subMonths(new Date(), 1)).toISOString()),
      orderBy('date', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Expense));
      setExpenses(docs);

      // Calculate summaries
      const now = new Date();
      const todayStart = new Date().setHours(0, 0, 0, 0);
      const weekStart = startOfWeek(now).getTime();
      const monthStart = startOfMonth(now).getTime();

      let today = 0, week = 0, month = 0;
      docs.forEach(exp => {
        const expDate = new Date(exp.date).getTime();
        if (expDate >= todayStart) today += exp.amount;
        if (expDate >= weekStart) week += exp.amount;
        if (expDate >= monthStart) month += exp.amount;
      });

      setSummary({ today, week, month });
    });

    return unsubscribe;
  }, [user]);

  const budget = profile?.monthlyBudget || 0;
  const remaining = budget - summary.month;
  const progress = budget > 0 ? Math.min((summary.month / budget) * 100, 100) : 0;

  const thisMonthByCategory = sumByCategory(expenses.filter(exp => new Date(exp.date).getTime() >= startOfMonth(new Date()).getTime()));
  const categoryBudgets = profile?.categoryBudgets || {};
  const fmt = (n: number) => `${currencySymbol}${Math.round(n).toLocaleString()}`;
  const insights = buildInsights(expenses, budget, categoryBudgets, fmt, new Date(), t);

  return (
    <div className="space-y-8 pb-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">
            {t('home.hi')} <span className="text-indigo-600 dark:text-indigo-400">{profile?.name?.split(' ')[0] || t('home.user')}</span>
          </h1>
          <p className="text-muted text-sm font-medium">{format(new Date(), 'EEEE, d MMMM', { locale: dateLocale })}</p>
        </div>
        <div className="flex items-center gap-2">
        <RearrangeButton layout={layout} />
        {/* Quick light / dark switch */}
        <motion.button
          onClick={toggleDarkMode}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.9 }}
          aria-label={isDarkMode ? t('theme.toLight') : t('theme.toDark')}
          title={isDarkMode ? t('theme.toLight') : t('theme.toDark')}
          className="w-12 h-12 bg-card rounded-2xl shadow-soft border border-card-border flex items-center justify-center text-indigo-600 dark:text-indigo-400 overflow-hidden"
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={isDarkMode ? 'moon' : 'sun'}
              initial={{ rotate: -90, scale: 0.5, opacity: 0 }}
              animate={{ rotate: 0, scale: 1, opacity: 1 }}
              exit={{ rotate: 90, scale: 0.5, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              {isDarkMode ? <Moon size={22} /> : <Sun size={22} />}
            </motion.span>
          </AnimatePresence>
        </motion.button>
        </div>
      </header>

      {/* The cards below can be moved with the button at the top; the header stays */}
      <RearrangeList layout={layout} className="space-y-8" sections={[
      { id: 'budget', node: (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        whileHover={{ y: -4 }}
        className="bg-gradient-to-br from-indigo-500 via-indigo-600 to-purple-600 p-7 rounded-[2.5rem] text-white shadow-vibrant relative overflow-hidden group"
      >
        <div className="relative z-10">
          <div className="flex justify-between items-start mb-6">
            <div>
              <p className="text-indigo-100/80 text-xs font-bold mb-1">{t('home.monthlyBudget')}</p>
              <h2 className="text-4xl font-bold tracking-tight">{currencySymbol} {budget.toLocaleString()}</h2>
            </div>
            <div className="w-12 h-12 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center">
              <Wallet size={24} className="text-white" />
            </div>
          </div>
          
          <div className="space-y-3">
            <div className="flex justify-between text-sm font-bold">
              <span className="text-indigo-100">{t('home.spent')} {currencySymbol}{summary.month.toLocaleString()}</span>
              <span className="text-indigo-100">{t('home.left')} {currencySymbol}{remaining.toLocaleString()}</span>
            </div>
            <div className="h-3 bg-black/20 rounded-full overflow-hidden backdrop-blur-sm">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 1, ease: "easeOut" }}
                className={`h-full rounded-full ${progress > 90 ? 'bg-rose-400' : 'bg-white shadow-[0_0_15px_rgba(255,255,255,0.5)]'}`}
              />
            </div>
          </div>
        </div>
        
        {/* Decorative shapes */}
        <div className="absolute -right-10 -top-10 w-40 h-40 bg-white/10 rounded-full blur-3xl group-hover:bg-white/20 transition-colors duration-500" />
        <div className="absolute -left-10 -bottom-10 w-40 h-40 bg-purple-500/20 rounded-full blur-3xl group-hover:bg-purple-500/30 transition-colors duration-500" />
      </motion.div>
      ) },

      // Spending today and this week, each against its share of the budget
      { id: 'spending', node: <SpendingCard spent={summary} budget={budget} symbol={currencySymbol} /> },

      { id: 'accounts', node: accounts.length > 0 ? (
        <div className="bg-card p-6 rounded-[2.5rem] shadow-soft border border-card-border space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-muted text-xs font-bold">{t('home.totalBalance')}</p>
              <button
                onClick={() => setRevealed(allShown ? new Set() : new Set(accounts.map(a => a.id)))}
                aria-label={t(allShown ? 'accounts.hideAll' : 'accounts.showAll')}
                aria-pressed={allShown}
                className={`flex items-center gap-2 text-2xl font-bold tabular-nums ${allShown && totalBalance < 0 ? 'text-rose-500' : 'text-foreground'}`}
              >
                {currencySymbol} {allShown ? totalBalance.toLocaleString() : '••••'}
                {allShown ? <EyeOff size={18} className="text-muted" /> : <Eye size={18} className="text-muted" />}
              </button>
            </div>
            <button onClick={onManageAccounts} className="flex items-center gap-0.5 text-indigo-600 dark:text-indigo-400 text-xs font-bold hover:underline">
              {t('home.manage')} <ChevronRight size={14} />
            </button>
          </div>
          <div className="flex gap-3 overflow-x-auto no-scrollbar -mx-1 px-1">
            {accounts.map(a => {
              const Icon = isMobile(a.type) ? Smartphone : Landmark;
              const color = MOBILE_PROVIDERS.find(p => p.type === a.type)?.color;
              const shown = revealed.has(a.id);
              return (
                <button
                  key={a.id}
                  onClick={() => toggleBalance(a.id)}
                  aria-label={t(shown ? 'accounts.hideBalance' : 'accounts.showBalance', { account: accountDisplayName(a) })}
                  aria-pressed={shown}
                  className="shrink-0 min-w-[9.5rem] p-3 bg-background/50 rounded-2xl border border-card-border text-left"
                >
                  <div className="flex items-center gap-1.5 mb-2">
                    <Icon size={14} style={color ? { color } : undefined} className={color ? '' : 'text-indigo-600 dark:text-indigo-400'} />
                    <span className="text-[11px] font-bold text-muted truncate max-w-[8rem]">{accountDisplayName(a)}</span>
                  </div>
                  <p className={`flex items-center gap-1.5 font-bold tabular-nums ${shown && a.balance < 0 ? 'text-rose-500' : 'text-foreground'}`}>
                    {currencySymbol}{shown ? a.balance.toLocaleString() : '••••'}
                    {shown ? <EyeOff size={14} className="text-muted" /> : <Eye size={14} className="text-muted" />}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <button
          onClick={onManageAccounts}
          className="w-full flex items-center gap-3 p-4 bg-card rounded-[2rem] shadow-soft border border-dashed border-card-border text-left"
        >
          <div className="w-10 h-10 shrink-0 bg-indigo-50 dark:bg-indigo-500/10 rounded-xl flex items-center justify-center text-indigo-600 dark:text-indigo-400">
            <Landmark size={20} />
          </div>
          <div className="flex-1">
            <p className="font-bold text-sm text-foreground">{t('home.addAccounts')}</p>
            <p className="text-xs text-muted font-medium">{t('home.addAccountsHint')}</p>
          </div>
          <ChevronRight size={18} className="text-muted" />
        </button>
      ) },

      { id: 'calculator', node: (
      <button
        onClick={() => setCalcOpen(true)}
        className="w-full flex items-center gap-3 p-4 bg-card rounded-[2rem] shadow-soft border border-card-border text-left transition-colors hover:border-indigo-500/40"
      >
        <div className="w-10 h-10 shrink-0 bg-indigo-50 dark:bg-indigo-500/10 rounded-xl flex items-center justify-center text-indigo-600 dark:text-indigo-400">
          <Calculator size={20} />
        </div>
        <p className="flex-1 min-w-0 font-bold text-sm text-foreground">{t('calc.title')}</p>
        <ChevronRight size={18} className="text-muted shrink-0" />
      </button>
      ) },

      { id: 'runway', node: accounts.length > 0 && (
        <RunwayCard
          accounts={accounts}
          expenses={expenses}
          symbol={currencySymbol}
          userSince={user?.metadata.creationTime ? new Date(user.metadata.creationTime) : undefined}
          shown={allShown}
        />
      ) },

      { id: 'debts', node: user && <DebtsCard uid={user.uid} accounts={accounts} symbol={currencySymbol} /> },

      { id: 'loan', node: nextLoan && (
        <button
          onClick={onManageAccounts}
          className="w-full flex items-center gap-3 p-4 bg-card rounded-[2rem] shadow-soft border border-card-border text-left"
        >
          <div className="w-10 h-10 shrink-0 bg-amber-50 dark:bg-amber-500/10 rounded-xl flex items-center justify-center text-amber-700 dark:text-amber-400">
            <HandCoins size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-muted text-xs font-bold">{t('loans.homeTitle')}</p>
            <p className="font-bold text-sm text-foreground truncate">
              {t('loans.homeLine', { amount: `${currencySymbol}${nextAmount(nextLoan).toLocaleString()}`, loan: nextLoan.name })}
            </p>
            <p className="text-[11px] text-muted font-medium truncate">
              {t('loans.homeWhen', { date: format(new Date(nextLoan.nextDueDate), 'd MMM', { locale: dateLocale }), account: nextLoan.accountName })}
              {openLoans.length > 1 && ` · ${t('loans.homeMore', { count: openLoans.length })}`}
            </p>
          </div>
          <ChevronRight size={18} className="text-muted shrink-0" />
        </button>
      ) },

      { id: 'insights', node: insights.length > 0 && (
        <div className="bg-card p-6 rounded-[2.5rem] shadow-soft border border-card-border space-y-4">
          <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Sparkles size={18} className="text-indigo-600 dark:text-indigo-400" />
            {t('home.insights')}
          </h3>
          {insights.map(insight => {
            const { icon: Icon, className } = INSIGHT_STYLES[insight.tone];
            return (
              <div key={insight.id} className="flex items-start gap-3">
                <div className={`w-9 h-9 shrink-0 rounded-xl flex items-center justify-center ${className}`}>
                  <Icon size={18} />
                </div>
                <div>
                  <p className="font-bold text-sm text-foreground">{insight.title}</p>
                  <p className="text-xs text-muted font-medium leading-relaxed">{insight.detail}</p>
                </div>
              </div>
            );
          })}
        </div>
      ) },

      { id: 'categoryBudgets', node: Object.keys(categoryBudgets).length > 0 && (
        <div className="bg-card p-6 rounded-[2.5rem] shadow-soft border border-card-border space-y-4">
          <h3 className="text-lg font-bold text-foreground">{t('home.categoryBudgets')}</h3>
          {Object.entries(categoryBudgets).map(([cat, limit]) => {
            const spent = thisMonthByCategory[cat] || 0;
            const pct = limit > 0 ? Math.min((spent / limit) * 100, 100) : 0;
            const barColor = spent > limit ? 'bg-rose-500' : pct >= 80 ? 'bg-amber-500' : 'bg-emerald-500';
            return (
              <div key={cat} className="space-y-1.5">
                <div className="flex justify-between text-xs font-bold">
                  <span className="text-foreground">{categoryLabel(t, cat)}</span>
                  <span className="text-muted">{fmt(spent)} / {fmt(limit)}</span>
                </div>
                <div className="h-2 bg-background rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                    className={`h-full rounded-full ${barColor}`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) },

      { id: 'charts', node: (
        <LazyPart fallback={<LoadingSpot className="min-h-[22rem] bg-card rounded-[2.5rem] shadow-soft border border-card-border" />}>
          <SpendingCharts expenses={expenses} symbol={currencySymbol} budget={budget} />
        </LazyPart>
      ) },

      { id: 'recent', node: (
      <div className="space-y-5">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-lg font-bold flex items-center gap-2 dark:text-white">
            <div className="w-8 h-8 bg-indigo-50 dark:bg-indigo-500/10 rounded-lg flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <Clock size={18} />
            </div>
            {t('home.recent')}
          </h3>
          <button onClick={onViewAll} className="text-indigo-600 dark:text-indigo-400 text-xs font-bold hover:underline">
            {t('home.viewAll')}
          </button>
        </div>

        <div className="space-y-4">
          <AnimatePresence mode="popLayout">
            {expenses.slice(0, 5).map((exp, index) => {
              const categoryConfig = DEFAULT_CATEGORIES.find(c => c.name === exp.category);
              const Icon = categoryConfig?.icon || Tag;
              return (
                <motion.div
                  key={exp.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="bg-card p-4 rounded-[1.5rem] shadow-soft border border-card-border flex items-center justify-between group hover:bg-background/80 transition-all"
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-sm ${categoryConfig?.color || 'bg-slate-50 dark:bg-slate-800 text-muted'}`}>
                      <Icon size={24} />
                    </div>
                    <div>
                      <p className="font-bold text-foreground group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{exp.title}</p>
                      <p className="text-[11px] text-muted font-bold">{categoryLabel(t, exp.category)} • {format(new Date(exp.date), 'MMM d', { locale: dateLocale })}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-foreground text-lg">-{currencySymbol}{exp.amount.toLocaleString()}</p>
                    <div className="w-full h-1 bg-indigo-600/0 group-hover:bg-indigo-600/20 rounded-full mt-1 transition-all" />
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
          {expenses.length === 0 && (
            <div className="text-center py-12 bg-card rounded-[2.5rem] border border-dashed border-card-border">
              <div className="w-16 h-16 bg-background rounded-full flex items-center justify-center mx-auto mb-4 text-muted">
                <Clock size={32} />
              </div>
              <p className="text-foreground font-bold">{t('home.noTransactions')}</p>
            </div>
          )}
        </div>
      </div>
      ) },
      ]} />

      {calcUsed && (
      <LazyPart fallback={calcOpen ? <LoadingSpot className="fixed inset-0 z-50 bg-black/40" /> : null}>
      <CalculatorSheet
        open={calcOpen}
        onClose={() => setCalcOpen(false)}
        userCurrency={profile?.currency || 'BDT'}
        onSaveExpense={(amount, people) => { setCalcOpen(false); onSaveExpense?.(amount, people); }}
        uid={user?.uid || ''}
        accounts={accounts}
        onManageAccounts={() => { setCalcOpen(false); onManageAccounts?.(); }}
      />
      </LazyPart>
      )}
    </div>
  );
}

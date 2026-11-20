import { useState, useEffect } from 'react';
import { useWidgetSync } from '../widget/widget';
import { useWidgetSettingsVersion } from '../widget/widgetSignal';
import { useReminderSync } from '../reminders/useReminderSync';
import SaveSuggestion from '../funds/SaveSuggestion';
import { EarnedCard } from '../income/IncomeCards';
import { db } from '../../shared/firebase';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../../app/App';
import { Expense } from '../../shared/types';
import { motion, AnimatePresence } from 'motion/react';
import { Banknote, Wallet, Clock, Tag, Landmark, Smartphone, ChevronRight, Sun, Moon, Eye, EyeOff, Calculator, PanelLeft } from 'lucide-react';
import { CalculatorSheet, SpendingCharts } from '../../app/lazyParts';
import LazyPart, { LoadingSpot } from '../../shared/components/LazyPart';
import { format, startOfWeek } from 'date-fns';
import { cleanStartDay, moneyMonth } from '../../shared/lib/moneyMonth';
import { useAccounts } from '../accounts/accountService';
import { useLoans } from '../accounts/loanService';
import { activeLoans } from '../accounts/loans';
import { accountDisplayName, isMobile, MOBILE_PROVIDERS } from '../accounts/accounts';
import { MAJOR_CURRENCIES, DEFAULT_CATEGORIES } from '../../shared/constants';
import { buildInsights, sumByCategory } from './insights';
import InsightsCard from './InsightsCard';
import NextLoanCard from './NextLoanCard';
import SpendingCard from './SpendingCard';
import { RearrangeButton, RearrangeList, useRearrange } from '../../shared/components/Rearrange';
import RunwayCard from './RunwayCard';
import DebtsCard from '../debts/DebtsCard';
import CashCheck from './CashCheck';
import FundsCard from '../funds/FundsCard';
import SamityCard from '../samity/SamityCard';
import UpcomingCard from '../planned/UpcomingCard';
import ShoppingCard from '../shopping/ShoppingCard';
import UnsortedCard, { useUnsortedExpenses } from '../expenses/UnsortedCard';

// Movable cards, in their default order
const HOME_SECTIONS = ['budget', 'saveNudge', 'unsorted', 'earned', 'spending', 'accounts', 'runway', 'planned', 'shopping', 'debts', 'funds', 'samity', 'calculator', 'loan', 'insights', 'categoryBudgets', 'charts', 'recent'];
import { useI18n, categoryLabel, TKey } from '../../shared/i18n';
import { CARD_SUB, CARD_TITLE } from '../../shared/lib/cardText';
import SearchWindow, { SearchBar } from '../search/SearchWindow';
import type { Place } from '../search/searchPlaces';
import { PLACES } from '../search/searchPlaces';
import { doc, updateDoc } from 'firebase/firestore';
import { saved } from '../../shared/lib/offlineSave';
import DetailSheet from '../../shared/components/DetailSheet';
import { useFunds } from '../funds/fundService';
import { fundPlan } from '../funds/funds';
import { useSamities } from '../samity/samityService';
import { samityStatus } from '../samity/samity';
import HomePanel from './HomePanel';
import { HomeCard, cardsOnHome, onHome, smartAlerts, toggleCard } from './homeCards';

export default function HomePage({ onViewAll, onManageAccounts, onSaveExpense, onGoTo, onAskAi }: {
  onViewAll?: () => void;
  onManageAccounts?: () => void;
  onSaveExpense?: (amount: number, people?: number) => void;
  onGoTo?: (place: Place) => void; // a search result: open its tab and card
  onAskAi?: (text: string) => void; // the search's Ask button: the text goes to the chat's message box
}) {
  const [calcOpen, setCalcOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  // The calculator downloads on its first use, then stays, so it keeps what was typed
  const [calcUsed, setCalcUsed] = useState(false);
  useEffect(() => { if (calcOpen) setCalcUsed(true); }, [calcOpen]);
  const layout = useRearrange('home', HOME_SECTIONS);
  // Home's side panel (homeCards.ts): which cards are on Home, kept on the account
  const [panelOpen, setPanelOpen] = useState(false);
  const [detailCard, setDetailCard] = useState<HomeCard | null>(null);
  const { user, profile, isDarkMode, toggleDarkMode } = useAuth();
  // The person's money month (Profile > Month starts on): every "this month" on Home follows it
  const startDay = cleanStartDay(profile?.monthStart);
  const { t, dateLocale } = useI18n();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [summary, setSummary] = useState({ today: 0, week: 0, month: 0 });
  const accounts = useAccounts(user?.uid);
  const openLoans = activeLoans(useLoans(user?.uid));
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
      where('date', '>=', moneyMonth(new Date(), startDay, -1).start.toISOString()),
      orderBy('date', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Expense));
      setExpenses(docs);

      // Calculate summaries
      const now = new Date();
      const todayStart = new Date().setHours(0, 0, 0, 0);
      const weekStart = startOfWeek(now).getTime();
      const monthStart = moneyMonth(now, startDay).start.getTime();

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
  }, [user, startDay]);

  const unsorted = useUnsortedExpenses(user?.uid, startDay);
  const budget = profile?.monthlyBudget || 0;
  useReminderSync({ expenses, loans: openLoans, spentThisMonth: summary.month, budget, startDay });

  // Which cards are on Home: the account's choice, shown straight away while it saves
  const [homeCards, setHomeCards] = useState<string[] | undefined>(profile?.layout?.homeCards);
  useEffect(() => { setHomeCards(profile?.layout?.homeCards); }, [profile?.layout?.homeCards]);
  const cardsOn = cardsOnHome(homeCards);
  const funds = useFunds(user?.uid || '');
  const samities = useSamities(user?.uid || '');
  const alertNow = new Date();
  const alerts = smartAlerts({
    loans: openLoans,
    samityDates: samities.flatMap(s => { const next = samityStatus(s, alertNow).nextUnpaid; return next ? [next.date] : []; }),
    goals: funds.map(f => ({ dueDate: f.dueDate, paused: f.paused, progress: fundPlan(f, alertNow).progress })),
    now: alertNow,
  });
  const toggleHomeCard = (id: HomeCard) => {
    if (!user) return;
    const next = toggleCard(homeCards, id);
    setHomeCards(next);
    saved(updateDoc(doc(db, 'users', user.uid), { 'layout.homeCards': next }))
      .catch(err => { console.error('Could not save the Home cards', err); setHomeCards(profile?.layout?.homeCards); });
  };
  // Tapping a card in the panel opens its own window, the same one its Home card opens
  const openFromPanel = (id: HomeCard) => {
    setPanelOpen(false);
    const place = (pid: string) => PLACES.find(p => p.id === pid);
    const go = (p?: Place) => { if (p) onGoTo?.(p); };
    switch (id) {
      case 'accounts': case 'loan': onManageAccounts?.(); return;
      case 'spending': case 'recent': onViewAll?.(); return;
      case 'charts': go(place('analysis')); return;
      case 'earned': go({ id: 'earnedChart', tab: 'reports', section: 'earned' }); return;
      case 'budget': go(place('budget')); return;
      case 'categoryBudgets': go(place('categoryBudgets')); return;
      case 'runway': case 'insights': setDetailCard(id); return;
      default: {
        // A card that is one button opening a window (goals, samity, lists...): tap it, on Home or in the hidden row
        window.setTimeout(() => {
          const button = document.querySelector<HTMLElement>(`[data-section="home:${id}"] > [data-card] > button, [data-home-card="${id}"] > button`);
          button?.click();
        }, 250);
      }
    }
  };
  // Cards switched off are still drawn out of sight, so their windows can open from the panel
  let offHome: { id: string; node: React.ReactNode }[] = [];
  const nodeOf: Record<string, React.ReactNode> = {};
  const homeOnly = (all: { id: string; node: React.ReactNode }[]) => {
    all.forEach(c => { nodeOf[c.id] = c.node; });
    offHome = all.filter(c => !onHome(c.id, cardsOn, alerts));
    return all.filter(c => onHome(c.id, cardsOn, alerts)).map(c => (c.node && !cardsOn.has(c.id) && alerts.has(c.id as never)
      ? { ...c, node: <div className="space-y-1"><p className="px-3 text-[11px] font-bold text-amber-600 dark:text-amber-400">{t('homeCards.alert')}</p>{c.node}</div> }
      : c));
  };
  useWidgetSync(summary.today, summary.month, budget, useWidgetSettingsVersion());
  const remaining = budget - summary.month;
  const progress = budget > 0 ? Math.min((summary.month / budget) * 100, 100) : 0;

  const thisMonthByCategory = sumByCategory(expenses.filter(exp => new Date(exp.date).getTime() >= moneyMonth(new Date(), startDay).start.getTime()));
  const categoryBudgets = profile?.categoryBudgets || {};
  const fmt = (n: number) => `${currencySymbol}${Math.round(n).toLocaleString()}`;
  const insights = buildInsights(expenses, budget, categoryBudgets, fmt, new Date(), t, startDay);

  return (
    <div className="space-y-2 pb-6">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={() => setPanelOpen(true)}
          aria-label={t('homeCards.open')}
          title={t('homeCards.open')}
          className="shrink-0 w-12 h-12 bg-card rounded-2xl shadow-soft border border-card-border flex items-center justify-center text-indigo-600 dark:text-indigo-400"
        >
          <PanelLeft size={20} />
        </button>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-foreground tracking-tight">
            {t('home.hi')} <span className="text-indigo-600 dark:text-indigo-400">{profile?.name?.split(' ')[0] || t('home.user')}</span>
          </h1>
          <p className="text-muted text-sm font-medium">{format(new Date(), 'EEEE, d MMMM', { locale: dateLocale })}</p>
        </div>
        </div>
        <div className="flex items-center gap-2">
        <span data-tour="move-cards"><RearrangeButton layout={layout} /></span>
        {/* Quick light / dark switch */}
        <motion.button
          data-tour="theme"
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

      <SearchBar onOpen={() => setSearchOpen(true)} />

      {/* The cards below can be moved with the button at the top; the header stays */}
      <RearrangeList layout={layout} className="space-y-2" sections={homeOnly([
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
                initial={{ scaleX: 0 }}
                animate={{ scaleX: progress / 100 }}
                transition={{ duration: 1, ease: "easeOut" }}
                className={`h-full w-full origin-left rounded-full ${progress > 90 ? 'bg-rose-400' : 'bg-white shadow-[0_0_15px_rgba(255,255,255,0.5)]'}`}
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
      { id: 'saveNudge', node: user && <SaveSuggestion uid={user.uid} expenses={expenses} symbol={currencySymbol} /> },
      { id: 'earned', node: user && <EarnedCard uid={user.uid} expenses={expenses} symbol={currencySymbol} /> },
      { id: 'spending', node: <SpendingCard spent={summary} budget={budget} symbol={currencySymbol} startDay={startDay} /> },

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
              const Icon = a.type === 'cash' ? Banknote : isMobile(a.type) ? Smartphone : Landmark;
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
                    <span className="text-[12px] font-bold text-muted truncate max-w-[8rem]">{accountDisplayName(a)}</span>
                  </div>
                  <p className={`flex items-center gap-1.5 font-bold tabular-nums ${shown && a.balance < 0 ? 'text-rose-500' : 'text-foreground'}`}>
                    {currencySymbol}{shown ? a.balance.toLocaleString() : '••••'}
                    {shown ? <EyeOff size={14} className="text-muted" /> : <Eye size={14} className="text-muted" />}
                  </p>
                </button>
              );
            })}
          </div>
          {/* The Cash wallet's questions, only when one is due (CashCheck.tsx) */}
          {user && <CashCheck uid={user.uid} accounts={accounts} expenses={expenses} symbol={currencySymbol} />}
        </div>
      ) : (
        <div className="space-y-2">
        <button
          onClick={onManageAccounts}
          className="w-full flex items-center gap-3 p-4 bg-card rounded-[2rem] shadow-soft border border-dashed border-card-border text-left"
        >
          <div className="w-10 h-10 shrink-0 bg-indigo-50 dark:bg-indigo-500/10 rounded-xl flex items-center justify-center text-indigo-600 dark:text-indigo-400">
            <Landmark size={20} />
          </div>
          <div className="flex-1">
            <p className={CARD_TITLE}>{t('home.addAccounts')}</p>
            <p className={CARD_SUB}>{t('home.addAccountsHint')}</p>
          </div>
          <ChevronRight size={18} className="text-muted" />
        </button>
        {/* No balance card yet, so the Cash wallet's first question gets a card of its own */}
        {user && <CashCheck uid={user.uid} accounts={accounts} expenses={expenses} symbol={currencySymbol} framed />}
        </div>
      ) },

      { id: 'calculator', node: (
      <button
        onClick={() => setCalcOpen(true)}
        className="w-full flex items-center gap-3 p-4 bg-card rounded-[2rem] shadow-soft border border-card-border text-left transition-colors hover:border-indigo-500/40"
      >
        <div className="w-10 h-10 shrink-0 bg-indigo-50 dark:bg-indigo-500/10 rounded-xl flex items-center justify-center text-indigo-600 dark:text-indigo-400">
          <Calculator size={20} />
        </div>
        <p className={`flex-1 min-w-0 ${CARD_TITLE}`}>{t('calc.title')}</p>
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
          startDay={startDay}
        />
      ) },

      { id: 'planned', node: user && (
        <UpcomingCard
          uid={user.uid}
          accounts={accounts}
          expenses={expenses}
          loans={openLoans}
          symbol={currencySymbol}
          shown={allShown}
          startDay={startDay}
          userSince={user.metadata.creationTime ? new Date(user.metadata.creationTime) : undefined}
        />
      ) },

      { id: 'unsorted', node: user && unsorted.length > 0 && <UnsortedCard uid={user.uid} entries={unsorted} symbol={currencySymbol} /> },

      { id: 'shopping', node: user && <ShoppingCard uid={user.uid} accounts={accounts} symbol={currencySymbol} /> },

      { id: 'debts', node: user && <DebtsCard uid={user.uid} accounts={accounts} symbol={currencySymbol} /> },

      { id: 'funds', node: user && <FundsCard uid={user.uid} symbol={currencySymbol} /> },

      { id: 'samity', node: user && <SamityCard uid={user.uid} accounts={accounts} symbol={currencySymbol} /> },

      { id: 'loan', node: openLoans.length > 0 && <NextLoanCard loans={openLoans} symbol={currencySymbol} onManage={onManageAccounts} /> },

      { id: 'insights', node: insights.length > 0 && <InsightsCard insights={insights} /> },

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
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: pct / 100 }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                    className={`h-full w-full origin-left rounded-full ${barColor}`}
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

      // Only the newest entry (chosen 2026-11-19); "Show all activity" opens Expenses with every entry
      { id: 'recent', node: (
      <div className="bg-card p-5 rounded-[2rem] shadow-soft border border-card-border space-y-3">
        <h3 className="text-base font-bold flex items-center gap-2 text-foreground">
          <span className="w-8 h-8 bg-indigo-50 dark:bg-indigo-500/10 rounded-lg flex items-center justify-center text-indigo-600 dark:text-indigo-400">
            <Clock size={18} />
          </span>
          {t('home.recent')}
        </h3>

        {expenses.length === 0 ? (
          <p className="py-4 text-center text-sm font-bold text-muted">{t('home.noTransactions')}</p>
        ) : (
          <>
            {expenses.slice(0, 1).map(exp => {
              const categoryConfig = DEFAULT_CATEGORIES.find(c => c.name === exp.category);
              const Icon = categoryConfig?.icon || Tag;
              return (
                <motion.div key={exp.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-12 h-12 shrink-0 rounded-2xl flex items-center justify-center ${categoryConfig?.color || 'bg-slate-50 dark:bg-slate-800 text-muted'}`}>
                      <Icon size={22} />
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-foreground truncate">{exp.title}</p>
                      <p className="text-[12px] text-muted font-bold">{categoryLabel(t, exp.category)} • {format(new Date(exp.date), 'MMM d', { locale: dateLocale })}</p>
                    </div>
                  </div>
                  <p className="shrink-0 font-bold text-foreground text-lg tabular-nums">-{currencySymbol}{exp.amount.toLocaleString()}</p>
                </motion.div>
              );
            })}
            <button
              onClick={onViewAll}
              className="w-full h-11 rounded-2xl bg-background/50 text-indigo-600 dark:text-indigo-400 text-sm font-bold flex items-center justify-center gap-1 hover:bg-background/80 transition-colors"
            >
              {t('home.showAllActivity')} <ChevronRight size={16} />
            </button>
          </>
        )}
      </div>
      ) },
      ])} />

      {/* Cards that aren't on Home, out of sight, so the panel can open their windows */}
      <div hidden>
        {offHome.map(c => <div key={c.id} data-home-card={c.id}>{c.node}</div>)}
      </div>

      <HomePanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        on={cardsOn}
        alerts={alerts}
        onToggle={toggleHomeCard}
        onOpenCard={openFromPanel}
      />
      <DetailSheet
        open={!!detailCard}
        onClose={() => setDetailCard(null)}
        icon={<PanelLeft size={20} className="text-indigo-600 dark:text-indigo-400" />}
        title={detailCard ? t(`homeCards.${detailCard}` as TKey) : ''}
      >
        {detailCard && nodeOf[detailCard]}
      </DetailSheet>

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

      <SearchWindow
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onPick={place => {
          setSearchOpen(false);
          if (place.action === 'darkMode') { toggleDarkMode(); return; } // switches light and dark
          onGoTo?.(place);
        }}
        onAsk={text => { setSearchOpen(false); onAskAi?.(text); }}
      />
    </div>
  );
}

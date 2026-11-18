import { motion } from 'motion/react';
import { ArrowRightLeft, Bell, CalendarClock, ExternalLink, HandCoins, Loader2, Pencil, PiggyBank, Repeat, Settings, ShoppingCart, Tag, Trash2, Undo2, Users, Wallet } from 'lucide-react';
import { useAuth } from '../../../app/App';
import { format } from 'date-fns';
import { isNative } from '../../../shared/lib/nativeApp';
import { REPEAT_TEXT } from '../../reminders/OwnReminders';
import { Account, ChatMessage, Deposit, Expense } from '../../../shared/types';
import { categoryLabel, useI18n } from '../../../shared/i18n';
import { cn } from '../../../shared/lib/utils';
import AccountPicker from '../../accounts/AccountPicker';
import { KIND_TEXT } from '../../debts/DebtForm';
import { isMoneyOut } from '../../debts/debts';
import type { AgentActions } from './useAgentActions';
import { isEntryAction, isGoalAction, isSamityAction, placeById } from './actions';
import { payoutAmount, roundDate } from '../../samity/samity';
import { LABELS as REMINDER_LABELS } from '../../reminders/RemindersCard';
import { timeLabel } from '../../reminders/OwnReminders';
import { REMINDER_KINDS, reminderSettings } from '../../reminders/reminders';
import { MAJOR_CURRENCIES } from '../../../shared/constants';
import type { TKey } from '../../../shared/i18n';
import { cleanStartDay } from '../../../shared/lib/moneyMonth';
import { REPEAT_TEXT as PLANNED_REPEAT_TEXT } from '../../planned/plannedText';
import { incomeCategoryLabel } from '../../income/incomeText';

const LANGUAGE_NAME = { en: 'English', bn: 'বাংলা' } as const;

const row = 'flex justify-between items-center gap-3 bg-background/50 p-3 rounded-xl';
const tick = 'mt-0.5 w-4 h-4 shrink-0 accent-indigo-600';

/** A confirm card for an action the AI prepared. Nothing changes until Confirm. */
export default function ActionCard({ msg, agent, accounts, currencySymbol, onConfirm, onCancel }: {
  msg: Pick<ChatMessage, 'id' | 'replyLang'> & { pendingAction: NonNullable<ChatMessage['pendingAction']> };
  onConfirm?: () => void; // Agent space tasks; cards inside older chats use the agent's own
  onCancel?: () => void;
  agent: AgentActions;
  accounts: Account[];
  currencySymbol: string;
}) {
  const { t, dateLocale, lang } = useI18n();
  const { profile, isDarkMode } = useAuth();
  const action = msg.pendingAction;
  const choice = agent.choiceFor(msg);
  const set = (next: Parameters<AgentActions['choose']>[1]) => agent.choose(msg.id, next);
  const money = (n: number) => `${currencySymbol}${n.toLocaleString()}`;
  const amount = 'amount' in action ? money(action.amount) : '';
  const day = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const titleOf = (e: Expense | Deposit) => ('title' in e && e.title) || t('chat.moneyReceived');

  let icon = <ArrowRightLeft size={20} />;
  let title = t('transfer.title');
  let body: React.ReactNode;
  let ready = true;

  if (isEntryAction(action)) {
    const stopping = action.kind === 'stopRecurring';
    const isDelete = stopping || action.kind.startsWith('delete');
    const entries = agent.entriesFor(action);
    const picked = entries.find(e => e.id === choice.pickedId);
    const problem = agent.entryProblem(action, choice);
    icon = stopping ? <Repeat size={20} /> : isDelete ? <Trash2 size={20} /> : <Pencil size={20} />;
    title = t(stopping ? 'agent.stopTitle' : isDelete ? 'agent.deleteTitle' : 'agent.editTitle');
    ready = !problem;
    const changes = 'changes' in action ? action.changes : {};
    // "Old -> new" for each thing the edit changes
    const changed: [string, string, string][] = picked && !isDelete ? [
      ...(changes.title !== undefined ? [[t('add.fieldTitle'), titleOf(picked), changes.title] as [string, string, string]] : []),
      ...(changes.amount !== undefined ? [[t('add.amount'), money(picked.amount), money(changes.amount)] as [string, string, string]] : []),
      ...(changes.category !== undefined ? [[t('add.category'), categoryLabel(t, (picked as Expense).category || ''), categoryLabel(t, changes.category)] as [string, string, string]] : []),
      ...(changes.day !== undefined ? [[t('add.date'), day(picked.date), day(changes.day)] as [string, string, string]] : []),
      ...(changes.labels !== undefined ? [[t('labels.title'), picked.labels?.join(', ') || '-', changes.labels.join(', ') || '-'] as [string, string, string]] : []),
    ] : [];
    body = (
      <>
        {entries.length > 1 && <p className="text-xs font-semibold text-muted">{t('agent.whichOne')}</p>}
        {entries.length === 0 && <p className="text-xs font-semibold text-muted">{t('agent.entryGone')}</p>}
        {entries.map(e => (
          <button
            key={e.id}
            type="button"
            role={entries.length > 1 ? 'radio' : undefined}
            aria-checked={entries.length > 1 ? e.id === choice.pickedId : undefined}
            onClick={() => set({ pickedId: e.id })}
            className={cn(row, 'w-full text-left border-2 transition-colors', e.id === choice.pickedId ? 'border-indigo-500' : 'border-transparent')}
          >
            <span className="min-w-0">
              <span className="block font-bold text-sm truncate">{titleOf(e)}</span>
              <span className="block text-[12px] font-medium text-muted">{day(e.date)}{'category' in e && e.category ? ` · ${categoryLabel(t, e.category)}` : ''}</span>
            </span>
            <span className="font-bold text-sm shrink-0">{money(e.amount)}</span>
          </button>
        ))}
        {changed.map(([label, before, after]) => (
          <div key={label} className={row}>
            <span className="text-xs font-semibold text-muted">{label}</span>
            <span className="text-sm text-right">
              <span className="text-muted line-through mr-2">{before}</span>
              <b className="text-indigo-600 dark:text-indigo-400">{after}</b>
            </span>
          </div>
        ))}
        {action.kind === 'deleteExpense' && (picked as Expense | undefined)?.receiptId && (
          <label className="flex items-start gap-3 bg-background/50 p-3 rounded-xl cursor-pointer">
            <input type="checkbox" className={tick} checked={!!choice.alsoReceipt} onChange={(e) => set({ alsoReceipt: e.target.checked })} />
            <span className="text-xs font-semibold text-foreground">{t('receipt.alsoDelete')}</span>
          </label>
        )}
        {stopping && <p className="text-xs font-medium text-muted leading-relaxed">{t('agent.stopHint')}</p>}
        {problem === 'agent.debtExpense' && <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">{t(problem)}</p>}
      </>
    );
  } else if (action.kind === 'transfer') {
    ready = !!choice.fromId && !!choice.toId && choice.fromId !== choice.toId;
    body = (
      <>
        <div className={row}>
          <span className="text-xs font-semibold text-muted">{t('add.amount')}</span>
          <span className="font-bold text-indigo-600 dark:text-indigo-400">{amount}</span>
        </div>
        <div className="bg-background/50 p-3 rounded-xl space-y-2">
          <span className="text-xs font-semibold text-muted">{t('transfer.from')}</span>
          <AccountPicker compact includeCash={false} accounts={accounts} value={choice.fromId || ''} onChange={(id) => set({ fromId: id })} symbol={currencySymbol} />
        </div>
        <div className="bg-background/50 p-3 rounded-xl space-y-2">
          <span className="text-xs font-semibold text-muted">{t('transfer.to')}</span>
          <AccountPicker compact includeCash={false} accounts={accounts} value={choice.toId || ''} onChange={(id) => set({ toId: id })} symbol={currencySymbol} />
        </div>
        {accounts.length < 2 && <p className="text-xs font-medium text-muted">{t('transfer.needTwo')}</p>}
        {choice.fromId && choice.fromId === choice.toId && <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">{t('transfer.same')}</p>}
      </>
    );
  } else if (action.kind === 'budget' || action.kind === 'removeBudget') {
    icon = <Wallet size={20} />;
    title = t(action.kind === 'budget' ? 'agent.budgetTitle' : 'agent.removeBudgetTitle');
    const current = action.category ? profile?.categoryBudgets?.[action.category] : profile?.monthlyBudget;
    body = (
      <>
        <div className={row}>
          <span className="text-xs font-semibold text-muted">{t('add.category')}</span>
          <span className="font-bold text-sm text-right">{action.category ? categoryLabel(t, action.category) : t('home.monthlyBudget')}</span>
        </div>
        <div className={row}>
          <span className="text-xs font-semibold text-muted">{t('agent.perMonth')}</span>
          <span className="text-sm text-right">
            {current !== undefined && <span className={cn('text-muted', action.kind === 'budget' && 'line-through mr-2')}>{money(current)}</span>}
            {action.kind === 'budget' && <b className="text-indigo-600 dark:text-indigo-400">{amount}</b>}
          </span>
        </div>
      </>
    );
  } else if (action.kind === 'reminder') {
    icon = <Bell size={20} />;
    title = t('agent.reminderTitle');
    body = (
      <>
        <div className={row}>
          <span className="text-xs font-semibold text-muted">{t('remind.own.what')}</span>
          <span className="font-bold text-sm text-right">{action.text}</span>
        </div>
        <div className={row}>
          <span className="text-xs font-semibold text-muted">{t('agent.when')}</span>
          <span className="font-bold text-sm text-right">{format(new Date(action.at), 'd MMM yyyy, h:mm a', { locale: dateLocale })}</span>
        </div>
        <div className={row}>
          <span className="text-xs font-semibold text-muted">{t('remind.own.repeat')}</span>
          <span className="font-bold text-sm text-right">{t(REPEAT_TEXT[action.repeat])}</span>
        </div>
        {!isNative() && <p className="text-xs font-medium text-muted">{t('agent.reminderAppOnly')}</p>}
      </>
    );
  } else if (isGoalAction(action) || isSamityAction(action) || action.kind === 'createGoal' || action.kind === 'createSamity') {
    const line = (label: string, value: React.ReactNode, strong = false) => (
      <div key={label} className={row}>
        <span className="text-xs font-semibold text-muted">{label}</span>
        <span className={cn('font-bold text-sm text-right', strong && 'text-indigo-600 dark:text-indigo-400')}>{value}</span>
      </div>
    );
    const note = (key: TKey) => <p className="text-xs font-medium text-muted leading-relaxed">{t(key)}</p>;
    // "Use an account": a tick, then which one (the same as the Lend and borrow card)
    const accountBox = (label: TKey) => (
      <div className="space-y-3 bg-background/50 p-3 rounded-xl">
        <label className="flex items-start gap-3 cursor-pointer">
          <input type="checkbox" className={tick} checked={!!choice.moveAccount} disabled={accounts.length === 0} onChange={(e) => set({ moveAccount: e.target.checked })} />
          <span className="text-xs font-semibold text-foreground">{t(label)}</span>
        </label>
        {choice.moveAccount && accounts.length > 0 && (
          <AccountPicker compact includeCash={false} accounts={accounts} value={choice.accountId || ''} onChange={(id) => set({ accountId: id })} symbol={currencySymbol} />
        )}
      </div>
    );
    const often = (f: 'weekly' | 'monthly') => t(f === 'weekly' ? 'add.repeat.weekly' : 'add.repeat.monthly');
    const problem = isGoalAction(action) || isSamityAction(action) ? agent.moneyProblem(action) : null;
    ready = !problem;
    let rows: React.ReactNode[] = [];
    let extra: React.ReactNode = null;

    if (action.kind === 'createGoal') {
      icon = <PiggyBank size={20} />;
      title = t('agent.goalTitle');
      rows = [line(t('agent.goalName'), action.name), line(t('agent.target'), money(action.target), true), line(t('agent.byDate'), action.day ? day(action.day) : t('agent.noEndDate'))];
    } else if (action.kind === 'createSamity') {
      icon = <Users size={20} />;
      title = t('agent.samityTitle');
      const start = new Date(`${action.startDay}T12:00:00`).toISOString();
      rows = [
        line(t('agent.samityName'), action.name),
        line(t('agent.perRound'), `${amount} · ${often(action.frequency)}`, true),
        line(t('agent.members'), action.members),
        line(t('agent.starts'), day(start)),
        line(t('agent.myTurn'), t('agent.roundValue', { n: action.myTurn, date: day(roundDate({ startDate: start, frequency: action.frequency }, action.myTurn).toISOString()) })),
        line(t('agent.pot'), money(payoutAmount(action))),
      ];
    } else if (isGoalAction(action)) {
      const fund = agent.fundFor(action);
      icon = action.kind === 'deleteGoal' ? <Trash2 size={20} /> : <PiggyBank size={20} />;
      title = t(action.kind === 'addToGoal' ? 'agent.goalAddTitle' : action.kind === 'takeFromGoal' ? 'agent.goalTakeTitle' : 'agent.goalDeleteTitle');
      if (fund) {
        rows = [line(t('agent.goalName'), fund.name), line(t('agent.savedSoFar'), `${money(fund.saved)} / ${money(fund.target)}`)];
        if (action.kind !== 'deleteGoal') rows.push(line(t('add.amount'), amount, true));
      }
      extra = action.kind === 'addToGoal' ? accountBox('agent.goalFromAccount')
        : action.kind === 'takeFromGoal' ? accountBox('agent.goalToAccount')
        : note('agent.goalDeleteHint');
    } else {
      const s = agent.samityFor(action);
      const n = s ? agent.roundFor(action, s) : undefined;
      icon = action.kind === 'deleteSamity' ? <Trash2 size={20} /> : action.kind.startsWith('undo') ? <Undo2 size={20} /> : <Users size={20} />;
      const TITLES = {
        payRound: 'agent.samityPayTitle', undoRound: 'agent.samityUndoTitle', samityPayout: 'agent.samityPayoutTitle',
        undoPayout: 'agent.samityUndoPayoutTitle', deleteSamity: 'agent.samityDeleteTitle',
      } as const;
      title = t(TITLES[action.kind]);
      if (s) {
        rows = [line(t('agent.samityName'), s.name)];
        if (n) rows.push(line(t('agent.round'), t('agent.roundValue', { n, date: day(roundDate(s, n).toISOString()) })));
        if (action.kind === 'payRound' || action.kind === 'undoRound') rows.push(line(t('add.amount'), money(s.amount), true));
        if (action.kind === 'samityPayout' || action.kind === 'undoPayout') rows.push(line(t('agent.pot'), money(payoutAmount(s)), true));
      }
      extra = action.kind === 'payRound' ? accountBox('agent.samityFromAccount')
        : action.kind === 'samityPayout' ? accountBox('agent.samityToAccount')
        : note(action.kind === 'undoRound' ? 'agent.samityUndoHint' : action.kind === 'undoPayout' ? 'agent.samityUndoPayoutHint' : 'agent.samityDeleteHint');
    }
    body = (
      <>
        {rows}
        {!problem && extra}
        {problem && <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">{t(problem[0], problem[1])}</p>}
      </>
    );
  } else if (action.kind === 'settings') {
    icon = <Settings size={20} />;
    title = t('agent.settingsTitle');
    const { changes } = action;
    const now = reminderSettings(profile?.reminders);
    const currencyName = (code: string) => {
      const c = MAJOR_CURRENCIES.find(x => x.code === code);
      return c ? `${c.symbol} ${c.code}` : code;
    };
    const onOff = (on: boolean) => t(on ? 'agent.on' : 'agent.off');
    // "Setting: old -> new" for each change; the old value is what is set right now
    const changed: [string, string, string][] = [
      ...(changes.darkMode !== undefined ? [[t('search.darkMode'), onOff(isDarkMode), onOff(changes.darkMode)] as [string, string, string]] : []),
      ...(changes.language ? [[t('profile.language'), LANGUAGE_NAME[lang], LANGUAGE_NAME[changes.language]] as [string, string, string]] : []),
      ...(changes.currency ? [[t('profile.currency'), currencyName(profile?.currency || 'BDT'), currencyName(changes.currency)] as [string, string, string]] : []),
      ...REMINDER_KINDS.filter(k => changes.reminders?.[k] !== undefined)
        .map(k => [t(REMINDER_LABELS[k]), onOff(now.on[k]), onOff(!!changes.reminders![k])] as [string, string, string]),
      ...(changes.reminderTime ? [[t('remind.set.time'), timeLabel(now.time), timeLabel(changes.reminderTime)] as [string, string, string]] : []),
      ...(changes.monthStart ? [[t('monthStart.title'), t('monthStart.day', { day: cleanStartDay(profile?.monthStart) }), t('monthStart.day', { day: changes.monthStart })] as [string, string, string]] : []),
    ];
    const currencyChanges = !!changes.currency && changes.currency !== (profile?.currency || 'BDT');
    body = (
      <>
        {changed.map(([label, before, after]) => (
          <div key={label} className={row}>
            <span className="text-xs font-semibold text-muted">{label}</span>
            <span className="text-sm text-right shrink-0">
              {before === after
                ? <b>{after}</b>
                : <><span className="text-muted line-through mr-2">{before}</span><b className="text-indigo-600 dark:text-indigo-400">{after}</b></>}
            </span>
          </div>
        ))}
        {currencyChanges && <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 leading-relaxed">{t('agent.currencyWarn')}</p>}
        {(changes.reminders || changes.reminderTime) && !isNative() && <p className="text-xs font-medium text-muted">{t('agent.reminderAppOnly')}</p>}
      </>
    );
  } else if (action.kind === 'open') {
    icon = <ExternalLink size={20} />;
    title = t('agent.openTitle');
    const place = placeById(action.place);
    ready = !!place;
    body = place ? (
      <div className={row}>
        <span className="text-xs font-semibold text-muted">{t(`search.where.${place.tab}` as TKey)}</span>
        <span className="font-bold text-sm text-right">{t(`search.${place.id}` as TKey)}</span>
      </div>
    ) : null;
  } else if (action.kind === 'addCategory') {
    icon = <Tag size={20} />;
    title = t('agent.addCategoryTitle');
    body = (
      <div className={row}>
        <span className="text-xs font-semibold text-muted">{t('add.category')}</span>
        <span className="font-bold text-sm text-right">{action.name}</span>
      </div>
    );
  } else if (action.kind === 'recurring') {
    icon = <Repeat size={20} />;
    title = t('agent.recurringTitle');
    body = (
      <>
        <div className={row}>
          <span className="text-xs font-semibold text-muted">{t('add.fieldTitle')}</span>
          <span className="font-bold text-sm text-right">{action.title}</span>
        </div>
        <div className={row}>
          <span className="text-xs font-semibold text-muted">{t('add.amount')}</span>
          <span className="font-bold text-indigo-600 dark:text-indigo-400">{amount}</span>
        </div>
        <div className={row}>
          <span className="text-xs font-semibold text-muted">{t('add.category')}</span>
          <span className="bg-indigo-600 text-white px-3 py-1 rounded-full text-xs font-semibold">{categoryLabel(t, action.category)}</span>
        </div>
        <div className={row}>
          <span className="text-xs font-semibold text-muted">{t('agent.howOften')}</span>
          <span className="font-bold text-sm text-right">{t(action.frequency === 'weekly' ? 'add.repeat.weekly' : 'add.repeat.monthly')}</span>
        </div>
        <div className="bg-background/50 p-3 rounded-xl space-y-2">
          <span className="text-xs font-semibold text-muted">{t('add.paidFrom')}</span>
          <AccountPicker compact accounts={accounts} value={choice.accountId || ''} onChange={(id) => set({ accountId: id })} symbol={currencySymbol} />
        </div>
        <p className="text-xs font-medium text-muted leading-relaxed">{t('agent.recurringHint')}</p>
      </>
    );
  } else if (action.kind === 'shopping') {
    const list = agent.shoppingLists.find(l => l.id === action.listId);
    icon = <ShoppingCart size={20} />;
    title = t(action.listId ? 'agent.shoppingAddTitle' : 'agent.shoppingTitle');
    ready = !action.listId || !!list;
    body = (
      <>
        <div className={row}>
          <span className="text-xs font-semibold text-muted">{t('shopping.listName')}</span>
          <span className="font-bold text-sm text-right">{list?.name || action.name || t('shopping.gone')}</span>
        </div>
        <div className="bg-background/50 p-3 rounded-xl space-y-1.5">
          {action.items.map(item => (
            <div key={item.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="font-semibold text-foreground min-w-0 truncate">{item.qty ? `${item.name} (${item.qty})` : item.name}</span>
              {item.price !== undefined && <span className="shrink-0 font-bold tabular-nums">{money(item.price)}</span>}
            </div>
          ))}
        </div>
      </>
    );
  } else if (action.kind === 'planned') {
    const income = action.plannedKind === 'income';
    icon = <CalendarClock size={20} />;
    title = t(income ? 'agent.plannedIncomeTitle' : 'agent.plannedTitle');
    const lines: [string, string][] = [
      [t('add.fieldTitle'), action.title],
      [t('add.category'), income ? incomeCategoryLabel(t, action.category) : categoryLabel(t, action.category)],
      [t('planned.dueDate'), day(action.day)],
      [t('agent.howOften'), t(PLANNED_REPEAT_TEXT[action.repeat])],
    ];
    body = (
      <>
        <div className={row}>
          <span className="text-xs font-semibold text-muted">{t('add.amount')}</span>
          <span className="font-bold text-indigo-600 dark:text-indigo-400">{amount}</span>
        </div>
        {lines.map(([label, value]) => (
          <div key={label} className={row}>
            <span className="text-xs font-semibold text-muted">{label}</span>
            <span className="font-bold text-sm text-right">{value}</span>
          </div>
        ))}
        {(accounts.length > 0 || !income) && (
          <div className="bg-background/50 p-3 rounded-xl space-y-2">
            <span className="text-xs font-semibold text-muted">{t(income ? 'planned.receivedIn' : 'add.paidFrom')}</span>
            <AccountPicker compact includeCash={!income} accounts={accounts} value={choice.accountId || ''} onChange={(id) => set({ accountId: id })} symbol={currencySymbol} />
          </div>
        )}
        <p className="text-xs font-medium text-muted leading-relaxed">{t('agent.plannedHint')}</p>
      </>
    );
  } else {
    icon = <HandCoins size={20} />;
    title = t('debts.title');
    const out = isMoneyOut(action.debtKind);
    body = (
      <>
        <div className={row}>
          <span className="text-xs font-semibold text-muted">{t('debts.what')}</span>
          <span className="font-bold text-sm text-right">{t(KIND_TEXT[action.debtKind])}</span>
        </div>
        <div className={row}>
          <span className="text-xs font-semibold text-muted">{t('debts.person')}</span>
          <span className="font-bold text-sm text-right">{action.person}</span>
        </div>
        <div className={row}>
          <span className="text-xs font-semibold text-muted">{t('add.amount')}</span>
          <span className="font-bold text-indigo-600 dark:text-indigo-400">{amount}</span>
        </div>
        <div className="space-y-3 bg-background/50 p-3 rounded-xl">
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" className={tick} checked={!!choice.moveAccount} disabled={accounts.length === 0} onChange={(e) => set({ moveAccount: e.target.checked })} />
            <span className="text-xs font-semibold text-foreground">{t(out ? 'debts.takeFrom' : 'debts.addTo')}</span>
          </label>
          {choice.moveAccount && accounts.length > 0 && (
            <AccountPicker compact includeCash={false} accounts={accounts} value={choice.accountId || ''} onChange={(id) => set({ accountId: id })} symbol={currencySymbol} />
          )}
          {out && (
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" className={tick} checked={!!choice.spending} onChange={(e) => set({ spending: e.target.checked })} />
              <span className="text-xs font-medium text-muted leading-relaxed">{t('debts.chatSpending')}</span>
            </label>
          )}
        </div>
      </>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card p-5 rounded-[2rem] shadow-soft border border-card-border text-foreground space-y-4 w-full"
    >
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-500/10 rounded-xl flex items-center justify-center text-indigo-600 dark:text-indigo-400">
          {icon}
        </div>
        <h4 className="font-bold">{title}</h4>
      </div>

      <div className="space-y-3">{body}</div>

      <div className="flex gap-3 pt-2">
        <button
          onClick={() => (onConfirm ? onConfirm() : agent.confirmAction(msg.id))}
          disabled={agent.isSaving || !ready}
          className="flex-1 py-3 bg-indigo-600 text-white rounded-2xl text-sm font-bold shadow-vibrant hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:shadow-none"
        >
          {agent.isSaving ? <><Loader2 size={16} className="animate-spin" /> {t('common.saving')}</> : t(action.kind === 'open' ? 'agent.open' : 'chat.confirm')}
        </button>
        <button
          onClick={() => (onCancel ? onCancel() : agent.cancelAction(msg.id))}
          disabled={agent.isSaving}
          className="flex-1 py-3 bg-slate-100 dark:bg-slate-700 text-muted rounded-2xl text-sm font-bold hover:bg-slate-200 dark:hover:bg-slate-600 transition-all disabled:opacity-50"
        >
          {t('common.cancel')}
        </button>
      </div>
    </motion.div>
  );
}

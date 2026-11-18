import { useState } from 'react';
import { User } from 'firebase/auth';
import { Account, ChatMessage, Deposit, Expense, RecurringExpense } from '../../../shared/types';
import { TFunction, TKey } from '../../../shared/i18n';
import { ReplyLanguage } from '../language';
import { accountDisplayName } from '../../accounts/accounts';
import { transferMoney, transferProblem } from '../../accounts/transfer';
import { TRANSFER_PROBLEM_TEXT, okToTakeFrom } from '../../accounts/TransferForm';
import { addDebt } from '../../debts/debtService';
import { isMoneyOut } from '../../debts/debts';
import { loadChoices, saveChoices } from '../../debts/DebtForm';
import { AgentAction, EntryAction, dateForDay, isEntryAction } from './actions';
import { paymentFields, shortAccount } from '../../accounts/accountService';
import { confirmDialog } from '../../../shared/components/Dialog';
import { deleteExpense, editExpense } from '../../expenses/expenseService';
import { deleteIncome, saveIncome } from '../../income/incomeService';
import { deleteReceipt, ReceiptError } from '../../receipts/receiptService';
import { showToast } from '../../../shared/lib/toast';
import { addCategory, addRecurring, removeCategoryBudget, saveSettings, setBudget, stopRecurring } from './agentWrites';
import { CASH_ID } from '../../accounts/accounts';
import { addOwnReminder } from '../../reminders/ownReminderService';
import { ownReminderProblem, reminderSettings, ReminderSettings } from '../../reminders/reminders';
import { clearReminders } from '../../reminders/reminderService';
import { useAuth } from '../../../app/App';
import { useI18n } from '../../../shared/i18n';
import { Place } from '../../search/searchPlaces';
import { GoalAction, SamityAction, isGoalAction, isSamityAction, placeById } from './actions';
import { Fund } from '../../funds/funds';
import { addToFund, createFund, deleteFund, takeFromFund } from '../../funds/fundService';
import { Samity, payoutAmount, samityStatus } from '../../samity/samity';
import { createSamity, deleteSamity, payRound, receivePayout, undoPayout, undoRound } from '../../samity/samityService';
import { loadMoveChoice, saveMoveChoice } from './moneyChoices';
import { TVars } from '../../../shared/i18n';
import { cleanStartDay } from '../../../shared/lib/moneyMonth';
import { plannedProblem } from '../../planned/planned';
import { addPlanned } from '../../planned/plannedService';
import { noteCategoryCorrection, useCategoryRules } from '../../categoryRules/categoryRuleService';
import { MAX_LISTS, ShoppingList, addItems } from '../../shopping/shopping';
import { createShoppingList, saveShoppingItems } from '../../shopping/shoppingService';

/** What the user changed on an action card before tapping Confirm, by message id */
export interface ActionChoice {
  fromId?: string;
  toId?: string;
  moveAccount?: boolean; // lend and borrow: the money went through an account
  accountId?: string;
  spending?: boolean; // lend and pay back: also count it as spending
  pickedId?: string; // edit or delete: which of the matching entries
  alsoReceipt?: boolean; // deleting an expense that has a receipt
}

const SAVED_DEBT: Record<string, TKey> = {
  lent: 'debts.savedLent',
  gotBack: 'debts.savedGotBack',
  borrowed: 'debts.savedBorrowed',
  paidBack: 'debts.savedPaidBack',
};

/** The card's starting choices: what the AI picked, then what the Lend and borrow form last used */
export function startChoice(action: AgentAction, accounts: Account[]): ActionChoice {
  if (isEntryAction(action)) return { pickedId: action.ids.length === 1 ? action.ids[0] : undefined, alsoReceipt: false };
  if (action.kind === 'transfer') return { fromId: action.fromId, toId: action.toId };
  if (action.kind === 'recurring') return { accountId: action.accountId || CASH_ID };
  if (action.kind === 'planned') return { accountId: action.accountId || (action.plannedKind === 'income' ? '' : CASH_ID) };
  // Goal and samity money: the account the user named, else the way the card was last used
  if (action.kind === 'addToGoal' || action.kind === 'takeFromGoal' || action.kind === 'payRound' || action.kind === 'samityPayout') {
    const remembered = loadMoveChoice(isGoalAction(action) ? 'goal' : 'samity');
    const named = 'accountId' in action ? action.accountId : undefined;
    const rememberedId = accounts.some(a => a.id === remembered.accountId) ? remembered.accountId : accounts[0]?.id;
    return { moveAccount: accounts.length > 0 && (!!named || remembered.moveAccount), accountId: named || rememberedId };
  }
  if (action.kind !== 'debt') return {};
  const remembered = loadChoices();
  const rememberedId = accounts.some(a => a.id === remembered.accountId) ? remembered.accountId : accounts[0]?.id;
  return {
    moveAccount: accounts.length > 0 && (!!action.accountId || remembered.moveAccount),
    accountId: action.accountId || rememberedId,
    spending: remembered.spending,
  };
}

/** One card to confirm: a card inside an older chat, or a task in Agent space */
export interface AgentCard {
  id: string;
  pendingAction: AgentAction;
  replyLang?: 'en' | 'bn';
}

/** What happened on Confirm. `after` runs once the result is recorded (opening a screen). */
export type Outcome =
  | { kind: 'done'; reply: string; saved?: boolean; after?: () => void }
  | { kind: 'problem'; text: string }
  | { kind: 'stopped' }; // the user backed out of a warning, or a save is already running

/** Saving what an action card shows. Nothing is written before Confirm. */
export function useAgentActions({ user, messages, accounts, expenses, incomes, recurring, categories, funds, samities, ownReminderCount, plannedCount, shoppingLists, refreshProfile, currencySymbol, tIn, t, addMessage, markResolved, onGoTo }: {
  ownReminderCount: number; // at most 20 own reminders
  plannedCount: number; // at most 50 planned payments
  shoppingLists: ShoppingList[]; // kept live
  funds: Fund[]; // savings goals, kept live
  samities: Samity[];
  onGoTo?: (place: Place) => void; // opens a screen, as Home's search does
  user: User | null;
  messages: ChatMessage[];
  accounts: Account[];
  expenses: Expense[]; // the recent entries the AI saw, kept live, so cards show what is saved now
  incomes: Deposit[];
  recurring: RecurringExpense[];
  categories: string[];
  refreshProfile: () => Promise<void> | void; // budgets live on the profile
  currencySymbol: string;
  tIn: (language?: ReplyLanguage) => TFunction;
  t: TFunction;
  addMessage: (role: 'user' | 'assistant', content: string, type?: ChatMessage['type']) => string;
  markResolved: (id: string, saved?: boolean) => void;
}) {
  const [isSaving, setIsSaving] = useState(false);
  const [choices, setChoices] = useState<Record<string, ActionChoice>>({});
  const { profile, isDarkMode, toggleDarkMode } = useAuth();
  const { lang, setLang } = useI18n();
  const categoryRules = useCategoryRules(user?.uid);

  const choiceFor = (card: AgentCard): ActionChoice => ({ ...startChoice(card.pendingAction, accounts), ...choices[card.id] });
  const choose = (id: string, next: ActionChoice) => setChoices(prev => ({ ...prev, [id]: { ...prev[id], ...next } }));
  const money = (n: number) => `${currencySymbol}${n.toLocaleString()}`;

  /** The entries an edit or delete card can still act on (one may have been deleted since) */
  const entriesFor = (action: EntryAction): (Expense | Deposit)[] => {
    // A repeating expense shows like an expense, dated with its next payment
    const rules = recurring.map(r => ({ ...r, date: r.nextDate }) as unknown as Expense);
    const list: (Expense | Deposit)[] = action.kind === 'stopRecurring' ? rules : action.kind.endsWith('Expense') ? expenses : incomes;
    return action.ids.map(id => list.find(e => e.id === id)).filter((e): e is Expense | Deposit => !!e);
  };

  /** Why an edit card can't be confirmed yet, or null */
  const entryProblem = (action: EntryAction, choice: ActionChoice): TKey | null => {
    const entry = entriesFor(action).find(e => e.id === choice.pickedId);
    if (!entriesFor(action).length) return 'agent.entryGone';
    if (!entry) return 'agent.pickOne';
    if (action.kind === 'editExpense' && (entry as Expense).debtId && action.changes.amount !== undefined) return 'agent.debtExpense';
    return null;
  };

  const fundFor = (action: GoalAction) => funds.find(f => f.id === action.fundId);
  const samityFor = (action: SamityAction) => samities.find(s => s.id === action.samityId);

  /** The round a pay or undo card works on: the one named, else the next unpaid or the last paid */
  const roundFor = (action: SamityAction, s: Samity): number | undefined => {
    if (action.kind !== 'payRound' && action.kind !== 'undoRound') return undefined;
    if ('round' in action && action.round) return action.round;
    if (action.kind === 'payRound') return samityStatus(s).nextUnpaid?.n;
    const paid = Object.keys(s.payments).map(Number).filter(n => n >= 1);
    return paid.length ? Math.max(...paid) : undefined;
  };

  /** Why a goal or samity card can't be confirmed now (it may have changed while the card waited), or null */
  const moneyProblem = (action: GoalAction | SamityAction): [TKey, TVars?] | null => {
    if (isGoalAction(action)) {
      const fund = fundFor(action);
      if (!fund) return ['agent.goalGone'];
      if (action.kind === 'takeFromGoal' && action.amount > fund.saved) return ['agent.goalNotEnough', { name: fund.name, amount: money(fund.saved) }];
      return null;
    }
    const s = samityFor(action);
    if (!s) return ['agent.samityGone'];
    const n = roundFor(action, s);
    if (action.kind === 'payRound') {
      if (!n) return ['agent.samityAllPaid', { name: s.name }];
      if (String(n) in s.payments) return ['agent.samityRoundPaid', { n }];
    }
    if (action.kind === 'undoRound' && (!n || !(String(n) in s.payments))) return ['agent.samityNothingToUndo', { name: s.name }];
    if (action.kind === 'samityPayout' && s.payout) return ['agent.samityAlreadyReceived', { name: s.name }];
    if (action.kind === 'undoPayout' && !s.payout) return ['agent.samityNothingToUndo', { name: s.name }];
    return null;
  };

  /** Saves a goal or samity card and returns what to say */
  const saveMoney = async (action: GoalAction | SamityAction, choice: ActionChoice, say: TFunction): Promise<string> => {
    const account = choice.moveAccount ? accounts.find(a => a.id === choice.accountId) : undefined;
    if (isGoalAction(action)) {
      const fund = fundFor(action)!;
      if (action.kind === 'deleteGoal') {
        await deleteFund(fund);
        return say('agent.goalDeleted', { name: fund.name });
      }
      saveMoveChoice('goal', { moveAccount: !!choice.moveAccount, accountId: choice.accountId });
      if (action.kind === 'addToGoal') {
        await addToFund(fund, action.amount, account || null);
        return say('agent.goalAdded', { amount: money(action.amount), name: fund.name });
      }
      await takeFromFund(fund, action.amount, account || null);
      return say('agent.goalTaken', { amount: money(action.amount), name: fund.name });
    }
    const s = samityFor(action)!;
    const n = roundFor(action, s)!;
    switch (action.kind) {
      case 'payRound':
        saveMoveChoice('samity', { moveAccount: !!choice.moveAccount, accountId: choice.accountId });
        await payRound(s, n, account);
        return say('agent.samityPaid', { n, name: s.name });
      case 'undoRound':
        await undoRound(s, n, accounts);
        return say('agent.samityUndone', { n, name: s.name });
      case 'samityPayout':
        saveMoveChoice('samity', { moveAccount: !!choice.moveAccount, accountId: choice.accountId });
        await receivePayout(s, account);
        return say('agent.samityPayoutSaved', { amount: money(payoutAmount(s)), name: s.name });
      case 'undoPayout':
        await undoPayout(s, accounts);
        return say('agent.samityPayoutUndone', { name: s.name });
      default:
        await deleteSamity(s);
        return say('agent.samityDeleted', { name: s.name });
    }
  };

  const saveEntry = async (action: EntryAction, choice: ActionChoice, say: TFunction) => {
    const entry = entriesFor(action).find(e => e.id === choice.pickedId)!;
    const title = (entry as Expense).title || (entry as Deposit).title || '';
    if (action.kind === 'deleteExpense') {
      const expense = entry as Expense;
      await deleteExpense(expense, accounts);
      if (expense.receiptId && choice.alsoReceipt) {
        deleteReceipt(expense.receiptId)
          .then(() => showToast('receipt.deleted'))
          .catch(err => showToast(err instanceof ReceiptError && err.code === 'offline' ? 'receipt.deleteLater' : 'receipt.problem.delete'));
      }
      return say('agent.deleted', { title, amount: money(expense.amount) });
    }
    if (action.kind === 'deleteIncome') {
      await deleteIncome(entry as Deposit, accounts);
      return say('agent.deleted', { title, amount: money(entry.amount) });
    }
    if (action.kind === 'stopRecurring') {
      await stopRecurring(entry.id);
      return say('agent.stopped', { title });
    }
    const { changes } = action as Extract<EntryAction, { changes: unknown }>;
    const date = dateForDay(changes.day, entry.date);
    if (action.kind === 'editExpense') {
      await editExpense(entry as Expense, { title: changes.title, amount: changes.amount, category: changes.category, date, labels: changes.labels }, accounts);
      // Not waited for: the card finishes now, and the question about a rule comes after it
      if (changes.category && changes.category !== (entry as Expense).category) {
        noteCategoryCorrection(user!.uid, changes.title ?? title, changes.category, categoryRules, t)
          .catch(err => console.error('Could not note the category change:', err));
      }
    } else {
      const income = entry as Deposit;
      await saveIncome(user!.uid, {
        title: changes.title ?? income.title ?? '', amount: changes.amount ?? income.amount, category: income.category || 'Other',
        date: date ?? income.date, notes: income.notes || '', accountId: income.accountId || null, repeat: !!income.ruleId, labels: changes.labels,
      }, accounts, income);
    }
    return say('agent.edited', { title: changes.title ?? title });
  };

  /**
   * Checks and saves one card. Nothing is shown here: the caller decides where the result goes
   * (a line in chat for older cards, the task's status in Agent space).
   */
  const runAction = async (card: AgentCard): Promise<Outcome> => {
    const action = card.pendingAction;
    if (!user || isSaving) return { kind: 'stopped' };
    const say = tIn(card.replyLang);
    const choice = choiceFor(card);

    if (isEntryAction(action)) {
      const problem = entryProblem(action, choice);
      if (problem) return { kind: 'problem', text: t(problem) };
      // A bigger expense from the same account warns when the balance is too low, like the Add screen
      const entry = entriesFor(action).find(e => e.id === choice.pickedId) as Expense;
      if (action.kind === 'editExpense' && action.changes.amount !== undefined && !entry.debtId) {
        const short = shortAccount(accounts, entry.accountId, action.changes.amount, entry.amount);
        if (short && !(await confirmDialog(t('add.lowBalance', { account: accountDisplayName(short), balance: money(short.balance) })))) return;
      }
    }
    if (isGoalAction(action) || isSamityAction(action)) {
      const problem = moneyProblem(action);
      if (problem) return { kind: 'problem', text: t(problem[0], problem[1]) };
      // Money leaving an account warns when its balance is too low, like the other screens
      const outAmount = action.kind === 'addToGoal' ? action.amount : action.kind === 'payRound' ? samityFor(action)!.amount : 0;
      if (outAmount && choice.moveAccount && choice.accountId && !(await okToTakeFrom(accounts, choice.accountId, outAmount, t, currencySymbol))) return { kind: 'stopped' };
    }
    if (action.kind === 'reminder') {
      // Checked again now: the time may have passed while the card waited, or the list filled up
      const problem = ownReminderProblem(action.text, new Date(action.at), action.repeat, ownReminderCount);
      if (problem) return { kind: 'problem', text: t(problem === 'full' ? 'remind.own.full' : 'remind.own.errorTime') };
    }
    if (action.kind === 'shopping') {
      if (action.listId && !shoppingLists.some(l => l.id === action.listId)) return { kind: 'problem', text: t('shopping.gone') };
      if (!action.listId && shoppingLists.length >= MAX_LISTS) return { kind: 'problem', text: t('shopping.fullLists', { max: MAX_LISTS }) };
    }
    if (action.kind === 'planned') {
      // Checked again now: the day may have passed while the card waited, or the list filled up
      const problem = plannedProblem({ title: action.title, amount: action.amount, day: action.day }, plannedCount);
      if (problem) return { kind: 'problem', text: t(problem === 'full' ? 'planned.problem.full' : 'planned.problem.date') };
    }
    if (action.kind === 'recurring') {
      const short = shortAccount(accounts, paymentFields(choice.accountId || CASH_ID, accounts).accountId, action.amount);
      if (short && !(await confirmDialog(t('add.lowBalance', { account: accountDisplayName(short), balance: money(short.balance) })))) return;
    }
    if (action.kind === 'transfer') {
      const problem = transferProblem(choice.fromId, choice.toId, action.amount, accounts);
      if (problem) return { kind: 'problem', text: t(TRANSFER_PROBLEM_TEXT[problem]) };
      if (!(await okToTakeFrom(accounts, choice.fromId!, action.amount, t, currencySymbol))) return { kind: 'stopped' };
    }

    setIsSaving(true);
    try {
      if (isEntryAction(action)) {
        const reply = await saveEntry(action, choice, say);
        return { kind: 'done', reply: reply };
      } else if (isGoalAction(action) || isSamityAction(action)) {
        const reply = await saveMoney(action, choice, say);
        return { kind: 'done', reply: reply };
      } else if (action.kind === 'createGoal') {
        await createFund(user.uid, action.name, action.target, action.day || null);
        return { kind: 'done', reply: say('agent.goalCreated', { name: action.name, amount: money(action.target) }) };
      } else if (action.kind === 'createSamity') {
        const { name, amount, frequency, members, myTurn, startDay } = action;
        await createSamity({ uid: user.uid, name, amount, frequency, members, myTurn, startDate: new Date(`${startDay}T12:00:00`).toISOString() });
        return { kind: 'done', reply: say('agent.samityCreated', { name, n: myTurn }) };
      } else if (action.kind === 'transfer') {
        const from = accounts.find(a => a.id === choice.fromId)!;
        const to = accounts.find(a => a.id === choice.toId)!;
        await transferMoney(from, to, action.amount);
        return { kind: 'done', reply: say('transfer.saved', { amount: money(action.amount), from: accountDisplayName(from), to: accountDisplayName(to) }) };
      } else if (action.kind === 'budget') {
        await setBudget(user.uid, action.amount, action.category);
        await refreshProfile();
        return { kind: 'done', reply: action.category
          ? say('agent.categoryBudgetSet', { category: action.category, amount: money(action.amount) })
          : say('agent.budgetSet', { amount: money(action.amount) }) };
      } else if (action.kind === 'removeBudget') {
        await removeCategoryBudget(user.uid, action.category);
        await refreshProfile();
        return { kind: 'done', reply: say('agent.budgetRemoved', { category: action.category }) };
      } else if (action.kind === 'addCategory') {
        // It may have been added by hand while the card waited
        if (categories.some(c => c.toLowerCase() === action.name.toLowerCase())) {
          return { kind: 'done', reply: say('profile.categoryExists'), saved: false };
        }
        await addCategory(user.uid, action.name);
        return { kind: 'done', reply: say('agent.categoryAdded', { name: action.name }) };
      } else if (action.kind === 'open') {
        const place = placeById(action.place);
        if (!place || !onGoTo) return { kind: 'problem', text: t('agent.cantDo') };
        // The screen opens only after the result is recorded, so leaving the chat doesn't lose it
        return { kind: 'done', reply: say('agent.opened', { place: say(`search.${place.id}` as TKey) }), after: () => onGoTo(place) };
      } else if (action.kind === 'settings') {
        const { changes } = action;
        // Only the changes that differ from now are written; the rest just stay as they are
        const fields: { currency?: string; reminders?: ReminderSettings; monthStart?: number } = {};
        if (changes.currency && changes.currency !== (profile?.currency || 'BDT')) fields.currency = changes.currency;
        if (changes.reminders || changes.reminderTime) {
          const now = reminderSettings(profile?.reminders);
          fields.reminders = { on: { ...now.on, ...changes.reminders }, time: changes.reminderTime || now.time };
        }
        if (changes.monthStart && changes.monthStart !== cleanStartDay(profile?.monthStart)) fields.monthStart = changes.monthStart;
        if (fields.currency || fields.reminders || fields.monthStart) {
          await saveSettings(user.uid, fields);
          await refreshProfile();
          // Same as the Reminders sheet: with everything off and no own reminders, nothing is left to ring
          if (fields.reminders && !Object.values(fields.reminders.on).some(Boolean) && ownReminderCount === 0) await clearReminders();
        }
        if (changes.darkMode !== undefined && changes.darkMode !== isDarkMode) toggleDarkMode();
        if (changes.language && changes.language !== lang) setLang(changes.language);
        return { kind: 'done', reply: say('agent.settingsSaved') };
      } else if (action.kind === 'reminder') {
        await addOwnReminder(user.uid, action.text, new Date(action.at), action.repeat);
        return { kind: 'done', reply: say('agent.reminderAdded', { text: action.text }) };
      } else if (action.kind === 'shopping') {
        const list = shoppingLists.find(l => l.id === action.listId);
        if (list) await saveShoppingItems(list.id, addItems(list.items, action.items));
        else await createShoppingList(user.uid, action.name || say('shopping.title'), addItems([], action.items));
        return { kind: 'done', reply: say('agent.shoppingSaved', { name: list?.name || action.name || say('shopping.title'), count: action.items.length }) };
      } else if (action.kind === 'planned') {
        const { plannedKind: kind, title, amount, category, day, repeat } = action;
        await addPlanned(user.uid, { kind, title, amount, category, day, repeat, accountId: choice.accountId || undefined });
        return { kind: 'done', reply: say('agent.plannedAdded', { title, amount: money(amount) }) };
      } else if (action.kind === 'recurring') {
        await addRecurring(user.uid, { ...action, accountId: choice.accountId }, accounts);
        return { kind: 'done', reply: say('agent.recurringAdded', { title: action.title, amount: money(action.amount) }) };
      } else {
        const account = choice.moveAccount ? accounts.find(a => a.id === choice.accountId) : undefined;
        const spending = !!choice.spending && isMoneyOut(action.debtKind);
        await addDebt({
          uid: user.uid, person: action.person, kind: action.debtKind, amount: action.amount,
          date: new Date().toISOString(), account, countAsSpending: spending,
        });
        // Same memory as the Lend and borrow form, so both start the same way next time
        saveChoices({ moveAccount: !!choice.moveAccount, spending: !!choice.spending, accountId: choice.accountId });
        return { kind: 'done', reply: say(SAVED_DEBT[action.debtKind], { name: action.person, amount: money(action.amount) }) };
      }
    } catch (error) {
      console.error('Error saving an action from chat:', error);
      return { kind: 'problem', text: say('chat.saveFailed') };
    } finally {
      setIsSaving(false);
    }
  };

  // Cards still inside older chats (from before Agent space): the result is a new line in that chat
  const confirmAction = async (messageId: string) => {
    const msg = messages.find(m => m.id === messageId);
    if (!msg?.pendingAction || msg.resolved) return;
    const outcome = await runAction(msg as AgentCard);
    if (outcome.kind === 'problem') addMessage('assistant', outcome.text, 'error');
    if (outcome.kind !== 'done') return;
    markResolved(messageId, outcome.saved !== false);
    addMessage('assistant', outcome.reply);
    outcome.after?.();
  };

  const cancelAction = (messageId: string) => {
    const msg = messages.find(m => m.id === messageId);
    markResolved(messageId);
    addMessage('assistant', tIn(msg?.replyLang)('agent.cancelled'));
  };

  return { isSaving, choiceFor, choose, runAction, confirmAction, cancelAction, entriesFor, entryProblem, fundFor, samityFor, roundFor, moneyProblem, shoppingLists };
}

export type AgentActions = ReturnType<typeof useAgentActions>;

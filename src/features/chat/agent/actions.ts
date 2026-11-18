// The chat's "agent": besides recording an expense or income, the AI may suggest one action.
// It never does anything itself. Every action becomes a confirm card, and only the Confirm button saves.
// Plain rules, no database calls, so they can be tested.

import { Account, Deposit, Expense, Loan, RecurringExpense, RecurringFrequency } from '../../../shared/types';
import { DEBT_KINDS, DebtKind, cleanPerson } from '../../debts/debts';
import { maskSensitive } from '../../../shared/lib/smsParser';
import { containsSecret } from '../../../shared/lib/sensitiveData';
import { round2 } from '../../../../ai-server/src/balanceLines';
import { addDays, format } from 'date-fns';
import { DEFAULT_REMINDER_TIME, MAX_REMINDER_TEXT, OWN_REPEATS, OwnRepeat, REMINDER_KINDS, ReminderKind, ReminderSettings, reminderStart } from '../../reminders/reminders';
import { MAJOR_CURRENCIES } from '../../../shared/constants';
import { PLACES, Place } from '../../search/searchPlaces';
import { en } from '../../../shared/i18n/en';
import type { Language } from '../../../shared/i18n';
import type { Fund } from '../../funds/funds';
import { Samity, samityStatus } from '../../samity/samity';
import { cleanStartDay, moneyMonth } from '../../../shared/lib/moneyMonth';
import { PLANNED_REPEATS, Planned, PlannedKind, PlannedRepeat } from '../../planned/planned';
import { INCOME_CATEGORIES } from '../../income/income';
import { cleanLabels } from '../../labels/labels';
import { MAX_ITEMS, MAX_LIST_NAME, ShoppingItem, ShoppingList, cleanShoppingText, listTotals, makeItem } from '../../shopping/shopping';

/** What an edit card may change. The date is a day (YYYY-MM-DD); the time is settled when it's saved. */
export interface EntryChanges {
  title?: string;
  amount?: number;
  category?: string; // expenses only
  day?: string;
  labels?: string[]; // the full new list; empty removes them
}

/** What a settings card may change. Only what the user asked for is filled in. */
export interface SettingChanges {
  darkMode?: boolean;
  language?: Language; // the app's buttons and menus; the AI keeps replying in the user's language
  currency?: string; // a code from MAJOR_CURRENCIES; amounts are not converted
  reminders?: Partial<Record<ReminderKind, boolean>>; // the automatic reminders, switched on or off
  reminderTime?: string; // 'HH:mm', the daily reminder, on the half hour from 06:00 to 23:30 like the Reminders sheet
  monthStart?: number; // the day the money month starts, 1-31 (Profile > Month starts on)
}

export type AgentAction =
  | { kind: 'transfer'; fromId?: string; toId?: string; amount: number }
  | { kind: 'debt'; debtKind: DebtKind; person: string; amount: number; accountId?: string }
  // ids: the entries that match, newest first (1 to 3). With more than one, the card asks which.
  | { kind: 'editExpense' | 'editIncome'; ids: string[]; changes: EntryChanges }
  | { kind: 'deleteExpense' | 'deleteIncome' | 'stopRecurring'; ids: string[] }
  // No category: the monthly budget
  | { kind: 'budget'; category?: string; amount: number }
  | { kind: 'removeBudget'; category: string }
  | { kind: 'addCategory'; name: string }
  // Saves today's expense and repeats it, like Add expense with Repeat on
  | { kind: 'recurring'; title: string; amount: number; category: string; frequency: RecurringFrequency; accountId?: string }
  // One of your own reminders (features/reminders): words, first time (ISO) and how it repeats
  | { kind: 'reminder'; text: string; at: string; repeat: OwnRepeat }
  // A future bill or expected money (features/planned). day: the due date as YYYY-MM-DD
  | { kind: 'planned'; plannedKind: PlannedKind; title: string; amount: number; category: string; day: string; repeat: PlannedRepeat; accountId?: string }
  // A new shopping list, or items for one that exists (features/shopping)
  | { kind: 'shopping'; listId?: string; name?: string; items: ShoppingItem[] }
  // Several setting changes from one message, saved together on one Confirm
  | { kind: 'settings'; changes: SettingChanges }
  // Opens a screen (a place from Home's search), only when the user taps Open
  | { kind: 'open'; place: string }
  // Savings goals (features/funds). day: the end date as YYYY-MM-DD, or none
  | { kind: 'createGoal'; name: string; target: number; day?: string }
  | { kind: 'addToGoal' | 'takeFromGoal'; fundId: string; amount: number; accountId?: string }
  | { kind: 'deleteGoal'; fundId: string }
  // Samity (features/samity). round: which round; without one, the card picks the next to pay or the last paid
  | { kind: 'createSamity'; name: string; amount: number; frequency: RecurringFrequency; members: number; myTurn: number; startDay: string }
  | { kind: 'payRound' | 'undoRound'; samityId: string; round?: number }
  | { kind: 'samityPayout' | 'undoPayout' | 'deleteSamity'; samityId: string; accountId?: string };

export type GoalAction = Extract<AgentAction, { fundId: string }>;
export type SamityAction = Extract<AgentAction, { samityId: string }>;
export const isGoalAction = (a: AgentAction): a is GoalAction => 'fundId' in a;
export const isSamityAction = (a: AgentAction): a is SamityAction => 'samityId' in a;

/** Screens the AI may open: everything Home's search can jump to, except the PIN lock and dark mode (a setting, not a screen) */
export const OPEN_PLACES: Place[] = PLACES.filter(p => p.id !== 'pin' && !p.action);
export const placeById = (id: string) => OPEN_PLACES.find(p => p.id === id);

export type EntryAction = Extract<AgentAction, { ids: string[] }>;
export const isEntryAction = (a: AgentAction): a is EntryAction => 'ids' in a;
export const MAX_MATCHES = 3;

/** What readAction needs to check codes and names against */
export interface AgentData {
  accounts: Account[];
  expenses: Expense[]; // newest first, the same list the AI saw as E1, E2...
  incomes: Deposit[]; // newest first, I1, I2...
  categories: string[];
  recurring?: RecurringExpense[]; // R1, R2...
  categoryBudgets?: Record<string, number>;
  funds?: Fund[]; // G1, G2...
  samities?: Samity[]; // S1, S2...
  shoppingLists?: ShoppingList[]; // L1, L2...
}

// ---------------------------------------------------------------------------
// What the AI is told

const TYPE_TEXT: Record<Account['type'], string> = {
  bank: 'bank', bkash: 'mobile wallet', nagad: 'mobile wallet', rocket: 'mobile wallet', cash: 'cash wallet',
};

/**
 * Each account gets a short code (A1, A2...) the AI answers with, so it never has to repeat names exactly.
 * Mobile accounts are named by provider only: the last 3 digits of the number stay on the phone.
 */
export function accountRefs(accounts: Account[]): { ref: string; account: Account; text: string }[] {
  return accounts.map((account, i) => {
    const name = account.type === 'cash' ? 'Cash' : account.type === 'bank' ? `${account.name} ${account.label}` : account.name;
    return { ref: `A${i + 1}`, account, text: `A${i + 1}: ${maskSensitive(name).slice(0, 60)} (${TYPE_TEXT[account.type]})` };
  });
}

const labelsText = (labels?: string[]) => (labels?.length ? ` | labels: ${labels.join(', ')}` : '');

/** "E1 | 2026-11-15 | Lunch | Food | 250": the recent expenses, each with its code */
export const expenseLines = (expenses: Expense[]) =>
  expenses.map((e, i) => `E${i + 1} | ${e.date.slice(0, 10)} | ${e.title} | ${e.category} | ${e.amount}${labelsText(e.labels)}`);

/** "R1 | Internet bill | 1000 | monthly | 2026-12-01": the repeating expenses, each with its code */
export const recurringLines = (rules: RecurringExpense[]) =>
  rules.map((r, i) => `R${i + 1} | ${maskSensitive(r.title).slice(0, 100)} | ${r.amount} | ${r.frequency} | ${r.nextDate.slice(0, 10)}`);

const incomeTitle = (d: Deposit) => maskSensitive(d.title || (d.source === 'monthly' ? 'Monthly deposit' : 'Money received')).slice(0, 100);

const dayOf = (d: Date) => format(d, 'yyyy-MM-dd');

/** "G1 | Eid | target 10000 | saved 2500 | by 2027-03-30": savings goals, each with its code */
export const goalLines = (funds: Fund[]) =>
  funds.map((f, i) => `G${i + 1} | ${maskSensitive(f.name).slice(0, 60)} | target ${f.target} | saved ${f.saved} | ${f.dueDate ? `by ${f.dueDate.slice(0, 10)}` : 'no end date'}${f.paused ? ' | paused' : ''}`);

/** "expense | School fee | 3000 | monthly | 2026-12-10": what is planned, soonest first */
export const plannedLines = (planned: Planned[]) =>
  [...planned].sort((a, b) => a.date.localeCompare(b.date))
    .map(p => `${p.kind} | ${maskSensitive(p.title).slice(0, 100)} | ${p.amount} | ${p.repeat} | ${p.date.slice(0, 10)}`);

/** "L1 | Weekly bazar | 3 left | Rice, Oil, Salt": shopping lists, each with its code */
export const shoppingLines = (lists: ShoppingList[]) =>
  lists.map((l, i) => `L${i + 1} | ${maskSensitive(l.name).slice(0, 60)} | ${listTotals(l.items).left} left | ${l.items.filter(x => !x.done).map(x => x.name).join(', ').slice(0, 300)}`);

/** "S1 | Office | 2000 monthly | 10 members | paid 3 of 10 | next round 4 on ... | your turn round 7 on ... | payout not yet" */
export function samityLines(samities: Samity[], now = new Date()): string[] {
  return samities.map((s, i) => {
    const st = samityStatus(s, now);
    const next = st.nextUnpaid ? `next unpaid round ${st.nextUnpaid.n} on ${dayOf(st.nextUnpaid.date)}` : 'every round paid';
    return `S${i + 1} | ${maskSensitive(s.name).slice(0, 60)} | ${s.amount} ${s.frequency} | ${s.members} members | paid ${st.paidCount} of ${s.members} | ` +
      `${next} | your turn round ${s.myTurn} on ${dayOf(st.myTurnDate)} | payout ${s.payout ? 'received' : 'not yet'}`;
  });
}

/** The settings a card can change, as they are now, so the AI can answer "is dark mode on?" */
export interface CurrentSettings {
  darkMode: boolean;
  language: Language;
  currency: string;
  reminders: ReminderSettings;
  monthStart?: number;
}

export function settingsLine(s: CurrentSettings, now = new Date()): string {
  const on = REMINDER_KINDS.filter(k => s.reminders.on[k]);
  const startDay = cleanStartDay(s.monthStart);
  const { start, end } = moneyMonth(now, startDay);
  return `Settings now: dark mode ${s.darkMode ? 'on' : 'off'}; app language ${s.language === 'bn' ? 'Bangla' : 'English'}; currency ${s.currency}; ` +
    `automatic reminders on: ${on.length ? on.join(', ') : 'none'}; daily reminder time ${s.reminders.time}; ` +
    `month starts on day ${startDay}.
` +
    `The user's money month runs from ${format(start, 'yyyy-MM-dd')} to ${format(addDays(end, -1), 'yyyy-MM-dd')}: "this month", ` +
    `"last month" and the budgets mean these money months, not calendar months.`;
}

/** The extra lines the AI sees: accounts (names and types only, no balances), active loans and recent income */
export function agentContext(
  accounts: Account[], loans: Loan[], incomes: Deposit[] = [], recurring: RecurringExpense[] = [], categoryBudgets: Record<string, number> = {},
  settings?: CurrentSettings, funds: Fund[] = [], samities: Samity[] = [], planned: Planned[] = [], shoppingLists: ShoppingList[] = [], warranties: Expense[] = [],
): string {
  const budgetLines = Object.entries(categoryBudgets).map(([name, limit]) => `${name}: ${limit}`);
  const now = new Date();
  const accountLines = accountRefs(accounts).map(r => r.text);
  const loanLines = loans
    .filter(l => l.status === 'active')
    .map(l => `${maskSensitive(l.name).slice(0, 60)} | ${l.installment} a month | next ${l.nextDueDate.slice(0, 10)} | ${l.remaining} left`);
  const incomeLines = incomes.map((d, i) => `I${i + 1} | ${d.date.slice(0, 10)} | ${incomeTitle(d)} | ${d.amount}${labelsText(d.labels)}`);
  return [
    `Accounts (code: name (type)): ${accountLines.length ? accountLines.join('; ') : 'none yet'}`,
    `Active loans (name | installment | next installment date | amount left to repay): ${loanLines.length ? '\n' + loanLines.join('\n') : 'none'}`,
    `Last ${incomeLines.length} incomes (code | date | title | amount): ${incomeLines.length ? '\n' + incomeLines.join('\n') : 'none'}`,
    `Repeating expenses (code | title | amount | how often | next date): ${recurring.length ? '\n' + recurringLines(recurring).join('\n') : 'none'}`,
    `Planned payments and expected money, not recorded yet (type | title | amount | how often | next date): ${planned.length ? '\n' + plannedLines(planned).join('\n') : 'none'}`,
    `Warranties (item | bought | warranty ends): ${warranties.length ? '\n' + warranties.map(w => `${maskSensitive(w.title).slice(0, 100)} | ${w.date.slice(0, 10)} | ${(w.warrantyUntil || '').slice(0, 10)}`).join('\n') : 'none'}`,
    `Shopping lists (code | name | items left | items still to buy): ${shoppingLists.length ? '\n' + shoppingLines(shoppingLists).join('\n') : 'none'}`,
    `Category budgets (category: monthly limit): ${budgetLines.length ? budgetLines.join('; ') : 'none'}`,
    `Savings goals (code | name | target | saved so far | end date): ${funds.length ? '\n' + goalLines(funds).join('\n') : 'none'}`,
    `Samities (code | name | amount and how often | members | rounds paid | next unpaid round | the user's turn | payout): ${samities.length ? '\n' + samityLines(samities, now).join('\n') : 'none'}`,
    ...(settings ? [settingsLine(settings)] : []),
    calendarLines(now),
  ].join('\n');
}

/**
 * Today and the next two weeks on the phone's own clock, with weekdays. Models are poor at working out
 * "next Friday" or "kal" themselves, and the prompt's other date is in UTC (6 hours behind Bangladesh).
 */
export function calendarLines(now: Date): string {
  const days = Array.from({ length: 14 }, (_, i) => format(addDays(now, i + 1), 'EEE yyyy-MM-dd'));
  return `Today on the user's phone: ${format(now, 'EEEE yyyy-MM-dd HH:mm')}. Coming days: ${days.join(', ')}`;
}

/** How the AI should ask for an action, added to the chat prompt */
export const ACTION_RULES = `
    Actions: besides recording an expense or income, you may prepare ONE action for the user to confirm on a card.
    You never do anything yourself; the app shows a card and saves only when the user taps Confirm.
    Use type "action" with an "action" object, and a short "content" saying what the card is for.
    "kind" must be exactly one of: transfer, debt, editExpense, deleteExpense, editIncome, deleteIncome,
    budget, removeBudget, addCategory, recurring, stopRecurring, reminder, planned, shopping, settings, open,
    createGoal, addToGoal, takeFromGoal, deleteGoal, createSamity, payRound, undoRound, samityPayout, undoPayout, deleteSamity.
    To record a new expense or income, use type "expense" or "income" as before, not an action.
    - Move money between two of the user's own accounts: {"kind":"transfer","from":"A1","to":"A2","amount":500}
      Use the account codes from the Accounts list. Leave "from" or "to" out if you can't tell which account.
    - Lend or borrow with a person: {"kind":"debt","debtKind":"lent"|"gotBack"|"borrowed"|"paidBack","person":"Rahim","amount":1000,"account":"A1"}
      lent = the user gave money to someone; gotBack = someone returned money to the user;
      borrowed = the user took money from someone; paidBack = the user returned money they borrowed.
      "account" is optional: only when the user said which account the money went through.
      A named person returning or repaying money ("Rahim paid me back 500", "rahim ferot dise") is a debt with
      debtKind "gotBack", never income. Income is for salary, sales, gifts and similar money with no debt behind it.
      Money the user got from one of their samities (the Samities list: "got my samity money", "samitir taka peyechi",
      "সমিতির টাকা পেয়েছি") is the samityPayout action, never income, and never a question about the amount.
    - Change one expense: {"kind":"editExpense","targets":["E3"],"changes":{"amount":250,"title":"...","category":"...","date":"YYYY-MM-DD"}}
      Put only what the user wants changed in "changes". A category must be one of the available categories.
      A correction of something already recorded ("groceries should be 1500 not 1800", "groceries ta 1500 hobe, 1800 na",
      "lunch was 150 not 200") is editExpense or editIncome on that entry, never a new expense.
    - Delete one expense: {"kind":"deleteExpense","targets":["E3"]}
    - Change one income: {"kind":"editIncome","targets":["I2"],"changes":{"amount":30000,"title":"...","date":"YYYY-MM-DD"}}
    - Delete one income: {"kind":"deleteIncome","targets":["I2"]}
      Use the codes from the expense (E1...) and income (I1...) lists. Only one entry is changed per command.
      If several entries could be the one the user means, list up to 3 codes in "targets", best match first,
      and the user picks on the card. If none match, reply as type "chat" and say you couldn't find it.
      "Delete all" or several entries at once is not possible: say they can do one at a time.
    - Set the monthly budget: {"kind":"budget","amount":20000}. Set a category budget: {"kind":"budget","category":"Food","amount":5000}
    - Remove a category budget: {"kind":"removeBudget","category":"Shopping"}. The monthly budget can be changed, not removed.
    - Add a category: {"kind":"addCategory","name":"Pets"} (short, in English, not already in the list)
    - Add a repeating expense: {"kind":"recurring","title":"Internet bill","amount":1000,"category":"Bills","frequency":"monthly"|"weekly","account":"A1"}
      This saves today's payment and repeats it. "account" is optional.
    - Stop a repeating expense: {"kind":"stopRecurring","targets":["R2"]}, using the codes from the Repeating expenses list.
    - Set a reminder: {"kind":"reminder","text":"Pay the rent","date":"YYYY-MM-DD","time":"HH:MM","repeat":"once"|"weekly"|"monthly"}
      "text" is what to remind, short, in the user's language. "date" is the first day it rings: take it from the
      "Today on the user's phone" and "Coming days" lines, not from Current Date ("tomorrow"/"kal" is the first
      coming day, "every Friday" starts on the first Fri listed, "on the 1st" is the next 1st). "time" is 24-hour; leave it out
      if the user gave none (it then rings at 9 AM). Use "monthly" or "weekly" only when the user asked for a repeat
      ("every month", "protibar", "every Friday"), otherwise "once".
    - Plan a future bill or money the user expects: {"kind":"planned","direction":"expense"|"income","title":"School fee","amount":3000,"category":"Education","date":"YYYY-MM-DD","repeat":"once"|"weekly"|"monthly"|"yearly","account":"A1"}
      Use it when the user gives an amount to pay or receive on a future day ("school fee 3000 on the 10th", "salary 30000 asbe 1 tarikh").
      Use "reminder" instead when there is no amount. Money already spent or received is an expense or income, not this.
      Take "date" from the "Today on the user's phone" and "Coming days" lines. If the amount or date is missing, reply as type "chat" and ask.
      "repeat" is "once" unless the user asked for a repeat. "account" only when the user named it.
      Use the Planned payments list to answer questions about upcoming bills. You can't mark them paid: the user does that on Home.
    - Make a shopping list: {"kind":"shopping","name":"Weekly bazar","items":[{"name":"Rice","qty":"2 kg","price":180},{"name":"Oil"}]}
      Add to a list the user already has: {"kind":"shopping","list":"L1","items":[{"name":"Salt"}]}, using the codes from the Shopping lists list.
      Use it when the user wants things to buy later ("bazar list banao: chal, tel, 2 kg alu"). "qty" and "price" only when the user said them; never guess a price.
      Things already bought are an expense, not a list. If no name was given for a new list, use a short one such as "Bazar".
    - Change settings: {"kind":"settings","darkMode":true,"language":"bn","currency":"USD","reminders":{"loan":false},"reminderTime":"21:30","monthStart":25}
      Put only what the user asked to change, all in ONE settings action even when they asked for several.
      "language" ("en" or "bn") changes the app's buttons and menus only; keep replying in the language the user writes in.
      "currency" must be one of: ${MAJOR_CURRENCIES.map(c => c.code).join(', ')}. Amounts are not converted; the card says so.
      "reminders" switches the automatic reminders on (true) or off (false): daily (add today's spending), streak (tracking streak),
      loan (installment tomorrow), samity (payment day), budget (at 80% and 100%), weekly (Sunday summary),
      monthly (report ready), goal (savings goal days), planned (planned payments and low money), warranty (warranties ending). "all" switches every one of them.
      "reminderTime" is the daily reminder's time, 24-hour, between 06:00 and 23:30.
      "monthStart" (1 to 31) is the day the user's money month starts, usually salary or allowance day
      ("my salary comes on the 25th", "start my month from the 10th"). In shorter months it falls on the last day.
      Use the "Settings now" line to answer questions about the current settings.
    - Open a screen: {"kind":"open","screen":"funds"}. "screen" must be one of these codes:
      ${OPEN_PLACES.map(p => `${p.id} (${en[`search.${p.id}` as keyof typeof en]})`).join(', ')}.
      Use it when the user wants to go to, see or open one of these. The user taps Open on the card.
    - Savings goals, using the codes from the Savings goals list:
      New goal: {"kind":"createGoal","name":"Eid","target":10000,"date":"YYYY-MM-DD"} ("date" is the end date; leave it out if none was given)
      Put money in: {"kind":"addToGoal","goal":"G1","amount":2000,"account":"A1"}. Take money out: {"kind":"takeFromGoal","goal":"G1","amount":1000,"account":"A1"}
      "account" only when the user named the account the money came from or goes back to.
      Delete a goal: {"kind":"deleteGoal","goal":"G1"}
    - Samity (rotating savings group), using the codes from the Samities list:
      New samity: {"kind":"createSamity","name":"Office","amount":2000,"frequency":"monthly"|"weekly","members":10,"myTurn":4,"start":"YYYY-MM-DD"}
      Needs the name, amount per round, number of members and the user's turn (round number); "start" is round 1's date
      (today if not given), "frequency" is monthly if not given. If the amount, members or turn is missing, reply as type
      "chat" and ask for it first.
      Paid a round: {"kind":"payRound","samity":"S1"} (add "round":5 only when the user named the round; otherwise the next unpaid one)
      Undo a paid round: {"kind":"undoRound","samity":"S1"} (add "round" only when named; otherwise the last paid one)
      Received the payout (the user's turn): {"kind":"samityPayout","samity":"S1","account":"A1"}. Undo it: {"kind":"undoPayout","samity":"S1"}
      The app knows every amount (a round is the samity's amount; the payout is amount × members), so never ask
      the user for an amount to pay a round or receive the payout ("samitir taka peyechi" is samityPayout).
      Delete a samity: {"kind":"deleteSamity","samity":"S1"}
      "account" for payRound or samityPayout only when the user named it.
    Warranties: when the user says a new purchase has a warranty ("fan 3000, 2 year warranty"), add "warrantyMonths":24 inside the "expense" object,
      or "warrantyUntil":"YYYY-MM-DD" when they gave the end date. Never guess a warranty the user did not mention.
      Use the Warranties list to answer questions such as when a warranty ends.
    Labels group entries for one event, such as "Eid 2027" or "Cox's Bazar trip". Up to 3 per entry, 30 characters each.
      Use a label ONLY when the user clearly asks to put an entry under one ("add this to Eid trip", "eta wedding e rakho"). Never guess or suggest one by yourself.
      A new expense or income: add "labels":["Eid trip"] inside the "expense" object. Reuse the spelling of a label already in the lists.
      An entry already saved: editExpense or editIncome with "changes":{"labels":["Eid trip"]}, listing every label the entry should keep.
      For "how much did the trip cost?", add up the entries with that label in the expense and income lists, and say it covers recent entries.
    The codes (A1, E1, I1, R1...) are only for the "action" object. Never show them to the user; use names in "content".
    Loans: you may answer questions about the user's loans from the Active loans list, but you can't pay, change
    or create loans. Installments are taken automatically on their date; say so if asked to pay one.
    Never handle the PIN lock, devices or deleting the account: say the user can do these in Profile.
    For anything else you can't do, reply as type "chat" and say it isn't possible from chat yet.`;

// ---------------------------------------------------------------------------
// Checking what the AI sent

const refToId = (ref: unknown, accounts: Account[]) => {
  if (typeof ref !== 'string') return undefined;
  return accountRefs(accounts).find(r => r.ref.toLowerCase() === ref.trim().toLowerCase())?.account.id;
};

const money = (value: unknown) => {
  const n = typeof value === 'string' ? parseFloat(value.replace(/[^\d.]/g, '')) : Number(value);
  return Number.isFinite(n) && n > 0 ? round2(n) : null;
};

/** The entries the codes point at ("E3" -> the 3rd expense), without repeats, at most 3 */
function entryIds(targets: unknown, letter: 'E' | 'I' | 'R', list: { id: string }[]): string[] {
  const codes = Array.isArray(targets) ? targets : [targets];
  const ids: string[] = [];
  for (const code of codes) {
    const match = typeof code === 'string' ? code.trim().toUpperCase().match(new RegExp(`^${letter}(\\d+)$`)) : null;
    const entry = match ? list[Number(match[1]) - 1] : undefined;
    if (entry && !ids.includes(entry.id)) ids.push(entry.id);
  }
  return ids.slice(0, MAX_MATCHES);
}

/** The goal or samity a code points at ("G2" -> the 2nd goal) */
function codeItem<T>(code: unknown, letter: 'G' | 'S' | 'L', list: T[]): T | undefined {
  const match = typeof code === 'string' ? code.trim().toUpperCase().match(new RegExp(`^${letter}(\\d+)$`)) : null;
  return match ? list[Number(match[1]) - 1] : undefined;
}

/** A real calendar day as YYYY-MM-DD, or undefined */
function validDay(value: unknown): string | undefined {
  const day = typeof value === 'string' ? value.trim().slice(0, 10) : '';
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && !Number.isNaN(new Date(`${day}T12:00:00`).getTime()) ? day : undefined;
}

/** A title the user can see and save: no codes, numbers hidden, at most 100 characters */
const cleanTitle = (value: unknown) => {
  if (typeof value !== 'string' || containsSecret(value)) return undefined;
  return maskSensitive(value.trim().replace(/\s+/g, ' ')).slice(0, 100) || undefined;
};

/** A new category's name: one short line, no codes or long numbers, at most 50 characters (as the database allows) */
export function cleanCategoryName(value: unknown): string | undefined {
  if (typeof value !== 'string' || containsSecret(value) || /\d{4,}/.test(value)) return undefined;
  const name = value.trim().replace(/\s+/g, ' ').slice(0, 50);
  return name && name.toUpperCase() !== 'INVALID' ? name : undefined;
}

/** Only the changes that can be saved: a real amount, a known category, a real day */
function readChanges(raw: unknown, categories: string[], withCategory: boolean): EntryChanges {
  if (!raw || typeof raw !== 'object') return {};
  const c = raw as Record<string, unknown>;
  const changes: EntryChanges = {};
  const amount = money(c.amount);
  if (amount !== null) changes.amount = amount;
  const title = cleanTitle(c.title);
  if (title) changes.title = title;
  if (withCategory && typeof c.category === 'string') {
    const category = categories.find(name => name.toLowerCase() === (c.category as string).trim().toLowerCase());
    if (category) changes.category = category;
  }
  const day = typeof c.date === 'string' ? c.date.trim().slice(0, 10) : '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(day) && !Number.isNaN(new Date(`${day}T12:00:00`).getTime())) changes.day = day;
  if (Array.isArray(c.labels)) changes.labels = cleanLabels(c.labels);
  return changes;
}

/** "21:40" -> "21:30": the nearest half hour the Reminders sheet offers (06:00 to 23:30), or undefined */
export function reminderTimeFrom(value: unknown): string | undefined {
  const m = typeof value === 'string' ? value.trim().match(/^([01]?\d|2[0-3]):([0-5]\d)$/) : null;
  if (!m) return undefined;
  const halfHours = Math.round((Number(m[1]) * 60 + Number(m[2])) / 30);
  if (halfHours < 12 || halfHours > 47) return undefined;
  return `${String(Math.floor(halfHours / 2)).padStart(2, '0')}:${halfHours % 2 ? '30' : '00'}`;
}

/** Only the setting changes the app knows: real languages, currencies from the list, known reminder kinds */
function readSettings(a: Record<string, unknown>): SettingChanges {
  const changes: SettingChanges = {};
  if (typeof a.darkMode === 'boolean') changes.darkMode = a.darkMode;
  if (a.language === 'en' || a.language === 'bn') changes.language = a.language;
  const code = typeof a.currency === 'string' ? a.currency.trim().toUpperCase() : '';
  if (MAJOR_CURRENCIES.some(c => c.code === code)) changes.currency = code;
  if (a.reminders && typeof a.reminders === 'object') {
    const asked = a.reminders as Record<string, unknown>;
    const switches: Partial<Record<ReminderKind, boolean>> = {};
    for (const kind of REMINDER_KINDS) {
      const value = typeof asked[kind] === 'boolean' ? asked[kind] : asked.all;
      if (typeof value === 'boolean') switches[kind] = value;
    }
    if (Object.keys(switches).length) changes.reminders = switches;
  }
  const time = reminderTimeFrom(a.reminderTime);
  if (time) changes.reminderTime = time;
  const monthStart = Number(a.monthStart);
  if (Number.isInteger(monthStart) && monthStart >= 1 && monthStart <= 31) changes.monthStart = monthStart;
  return changes;
}

/** The action the AI asked for, cleaned up, or null when it isn't one the app can show */
export function readAction(raw: unknown, data: AgentData): AgentAction | null {
  if (!raw || typeof raw !== 'object') return null;
  const a = raw as Record<string, unknown>;

  if (a.kind === 'stopRecurring') {
    const ids = entryIds(a.targets, 'R', data.recurring || []);
    return ids.length ? { kind: 'stopRecurring', ids } : null;
  }
  const category = (value: unknown) =>
    typeof value === 'string' ? data.categories.find(name => name.toLowerCase() === value.trim().toLowerCase()) : undefined;
  if (a.kind === 'removeBudget') {
    const name = category(a.category);
    return name && data.categoryBudgets?.[name] !== undefined ? { kind: 'removeBudget', category: name } : null;
  }
  if (a.kind === 'reminder') {
    if (typeof a.text !== 'string' || containsSecret(a.text)) return null;
    const text = maskSensitive(a.text.trim().replace(/\s+/g, ' ')).slice(0, MAX_REMINDER_TEXT);
    const day = typeof a.date === 'string' ? a.date.trim().slice(0, 10) : '';
    const time = typeof a.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(a.time.trim()) ? a.time.trim() : DEFAULT_REMINDER_TIME;
    const repeat = OWN_REPEATS.find(r => r === a.repeat) || 'once';
    if (!text || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
    const at = reminderStart(day, time);
    return Number.isNaN(at.getTime()) ? null : { kind: 'reminder', text, at: at.toISOString(), repeat };
  }
  const goal = codeItem(a.goal, 'G', data.funds || []);
  const samity = codeItem(a.samity, 'S', data.samities || []);
  const accountId = refToId(a.account, data.accounts);
  const withAccount = accountId ? { accountId } : {};
  if (a.kind === 'shopping') {
    const items = (Array.isArray(a.items) ? a.items : [])
      .map(raw => makeItem(typeof raw === 'string' ? { name: raw } : (raw as { name: unknown })))
      .filter((item): item is ShoppingItem => !!item)
      .slice(0, MAX_ITEMS);
    if (items.length === 0) return null;
    const list = codeItem(a.list, 'L', data.shoppingLists || []);
    if (list) return { kind: 'shopping', listId: list.id, items };
    const name = cleanShoppingText(a.name, MAX_LIST_NAME);
    return name ? { kind: 'shopping', name, items } : null;
  }
  if (a.kind === 'planned') {
    const title = cleanTitle(a.title);
    const amount = money(a.amount);
    const day = validDay(a.date);
    if (!title || amount === null || !day) return null;
    const plannedKind: PlannedKind = a.direction === 'income' ? 'income' : 'expense';
    const asked = typeof a.category === 'string' ? a.category.trim().toLowerCase() : '';
    const planCategory = plannedKind === 'income'
      ? INCOME_CATEGORIES.find(name => name.toLowerCase() === asked) || 'Other'
      : category(a.category) || 'Other';
    const repeat = PLANNED_REPEATS.find(r => r === a.repeat) || 'once';
    return { kind: 'planned', plannedKind, title, amount, category: planCategory, day, repeat, ...withAccount };
  }
  if (a.kind === 'createGoal') {
    const name = cleanTitle(a.name)?.slice(0, 60);
    const target = money(a.target ?? a.amount);
    const day = validDay(a.date);
    return name && target !== null ? { kind: 'createGoal', name, target, ...(day && { day }) } : null;
  }
  if (a.kind === 'addToGoal' || a.kind === 'takeFromGoal') {
    const amount = money(a.amount);
    return goal && amount !== null ? { kind: a.kind, fundId: goal.id, amount, ...withAccount } : null;
  }
  if (a.kind === 'deleteGoal') return goal ? { kind: 'deleteGoal', fundId: goal.id } : null;
  if (a.kind === 'createSamity') {
    const name = cleanTitle(a.name)?.slice(0, 60);
    const amount = money(a.amount);
    const members = Number(a.members), myTurn = Number(a.myTurn);
    if (!name || amount === null || !Number.isInteger(members) || members < 2 || members > 100) return null;
    if (!Number.isInteger(myTurn) || myTurn < 1 || myTurn > members) return null;
    const frequency = a.frequency === 'weekly' ? 'weekly' : 'monthly';
    return { kind: 'createSamity', name, amount, frequency, members, myTurn, startDay: validDay(a.start) || format(new Date(), 'yyyy-MM-dd') };
  }
  if (a.kind === 'payRound' || a.kind === 'undoRound') {
    if (!samity) return null;
    const round = Number(a.round);
    const named = Number.isInteger(round) && round >= 1 && round <= samity.members ? { round } : {};
    return { kind: a.kind, samityId: samity.id, ...named };
  }
  if (a.kind === 'samityPayout' || a.kind === 'undoPayout' || a.kind === 'deleteSamity') {
    return samity ? { kind: a.kind, samityId: samity.id, ...(a.kind === 'samityPayout' && withAccount) } : null;
  }
  if (a.kind === 'open') {
    const id = typeof a.screen === 'string' ? a.screen.trim() : '';
    return placeById(id) ? { kind: 'open', place: id } : null;
  }
  if (a.kind === 'settings') {
    const changes = readSettings(a);
    return Object.keys(changes).length ? { kind: 'settings', changes } : null;
  }
  if (a.kind === 'addCategory') {
    const name = cleanCategoryName(a.name);
    return name && !category(name) ? { kind: 'addCategory', name } : null;
  }

  if (a.kind === 'editExpense' || a.kind === 'deleteExpense' || a.kind === 'editIncome' || a.kind === 'deleteIncome') {
    const isExpense = a.kind.endsWith('Expense');
    const ids = entryIds(a.targets, isExpense ? 'E' : 'I', isExpense ? data.expenses : data.incomes);
    if (!ids.length) return null;
    if (a.kind === 'deleteExpense' || a.kind === 'deleteIncome') return { kind: a.kind, ids };
    const changes = readChanges(a.changes, data.categories, isExpense);
    return Object.keys(changes).length ? { kind: a.kind, ids, changes } : null;
  }

  const amount = money(a.amount);
  if (amount === null) return null;
  if (a.kind === 'budget') {
    if (a.category === undefined || a.category === null || a.category === '') return { kind: 'budget', amount };
    const name = category(a.category);
    return name ? { kind: 'budget', category: name, amount } : null;
  }
  if (a.kind === 'recurring') {
    const title = cleanTitle(a.title);
    const frequency = a.frequency === 'weekly' || a.frequency === 'monthly' ? a.frequency : null;
    if (!title || !frequency) return null;
    const accountId = refToId(a.account, data.accounts);
    return { kind: 'recurring', title, amount, category: category(a.category) || 'Other', frequency, ...(accountId && { accountId }) };
  }
  if (a.kind === 'transfer') {
    const fromId = refToId(a.from, data.accounts);
    const toId = refToId(a.to, data.accounts);
    return { kind: 'transfer', amount, ...(fromId && { fromId }), ...(toId && toId !== fromId && { toId }) };
  }
  if (a.kind === 'debt') {
    const debtKind = DEBT_KINDS.find(k => k === a.debtKind);
    const person = typeof a.person === 'string' ? cleanPerson(maskSensitive(a.person)) : '';
    if (!debtKind || !person || containsSecret(person)) return null;
    const accountId = refToId(a.account, data.accounts);
    return { kind: 'debt', debtKind, person, amount, ...(accountId && { accountId }) };
  }
  return null;
}

/** The ISO date to save for a changed day: the old time kept when the day is the same, else midday */
export function dateForDay(day: string | undefined, oldIso: string): string | undefined {
  if (!day || day === oldIso.slice(0, 10)) return undefined;
  return new Date(`${day}T12:00:00`).toISOString();
}

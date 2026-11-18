import { describe, expect, it } from 'vitest';
import { Account, Deposit, Expense, Loan, RecurringExpense } from '../../../shared/types';
import { AgentData, OPEN_PLACES, accountRefs, agentContext, cleanCategoryName, dateForDay, expenseLines, readAction, reminderTimeFrom, settingsLine } from './actions';
import { DEFAULT_REMINDERS } from '../../reminders/reminders';
import type { Fund } from '../../funds/funds';
import type { Samity } from '../../samity/samity';
import { transferProblem } from '../../accounts/transfer';

const account = (id: string, type: Account['type'], name: string, label = ''): Account =>
  ({ id, uid: 'u', type, name, label, balance: 1000 } as Account);
const accounts = [account('w', 'cash', 'Cash'), account('b', 'bkash', 'bKash', '123'), account('d', 'bank', 'Dutch-Bangla Bank', 'Savings')];
const expense = (id: string, title: string, amount: number, date = '2026-11-15T10:00:00.000Z') =>
  ({ id, uid: 'u', title, amount, category: 'Food', date } as Expense);
const income = (id: string, title: string, amount: number) => ({ id, uid: 'u', title, amount, date: '2026-11-01T06:00:00.000Z' } as Deposit);
const data: AgentData = {
  accounts,
  expenses: [expense('x1', 'Lunch', 200), expense('x2', 'Lunch', 150), expense('x3', 'Rickshaw', 60)],
  incomes: [income('i1', 'Salary', 30000)],
  categories: ['Food', 'Transport', 'Other'],
};

describe('accountRefs and agentContext', () => {
  it('gives each account a code, without balances or mobile number digits', () => {
    const text = agentContext(accounts, []);
    expect(text).toContain('A1: Cash (cash wallet)');
    expect(text).toContain('A2: bKash (mobile wallet)');
    expect(text).toContain('A3: Dutch-Bangla Bank Savings (bank)');
    expect(text).not.toContain('123');
    expect(text).not.toContain('1000');
  });

  it('lists only active loans, and recent income with codes', () => {
    const loan = (status: Loan['status']) => ({ name: `Car ${status}`, installment: 5000, nextDueDate: '2026-12-05T00:00:00Z', remaining: 45000, status } as Loan);
    const text = agentContext([], [loan('active'), loan('paid')], data.incomes);
    expect(text).toContain('Car active | 5000 a month | next 2026-12-05 | 45000 left');
    expect(text).not.toContain('Car paid');
    expect(text).toContain('I1 | 2026-11-01 | Salary | 30000');
  });

  it('hides a phone number someone typed into an account name', () => {
    expect(accountRefs([account('x', 'bank', 'My bank 01712345678', 'Main')])[0].text).not.toContain('01712345678');
  });

  it('numbers the expenses', () => {
    expect(expenseLines(data.expenses)[2]).toBe('E3 | 2026-11-15 | Rickshaw | Food | 60');
  });
});

describe('readAction: money moves', () => {
  it('reads a transfer and turns codes into account ids', () => {
    expect(readAction({ kind: 'transfer', from: 'A2', to: 'a1', amount: '500' }, data)).toEqual({ kind: 'transfer', fromId: 'b', toId: 'w', amount: 500 });
  });

  it('leaves out an account it cannot find, or the same account twice', () => {
    expect(readAction({ kind: 'transfer', from: 'A9', to: 'A2', amount: 10 }, data)).toEqual({ kind: 'transfer', toId: 'b', amount: 10 });
    expect(readAction({ kind: 'transfer', from: 'A2', to: 'A2', amount: 10 }, data)).toEqual({ kind: 'transfer', fromId: 'b', amount: 10 });
  });

  it('reads lend and borrow, tidying the name', () => {
    expect(readAction({ kind: 'debt', debtKind: 'lent', person: '  Rahim   Uddin ', amount: 1000, account: 'A2' }, data))
      .toEqual({ kind: 'debt', debtKind: 'lent', person: 'Rahim Uddin', amount: 1000, accountId: 'b' });
  });

  it('refuses anything it cannot show', () => {
    expect(readAction({ kind: 'transfer', amount: 0 }, data)).toBeNull();
    expect(readAction({ kind: 'debt', debtKind: 'stole', person: 'X', amount: 5 }, data)).toBeNull();
    expect(readAction({ kind: 'debt', debtKind: 'lent', person: ' ', amount: 5 }, data)).toBeNull();
    expect(readAction({ kind: 'deleteAccount', amount: 5 }, data)).toBeNull();
    expect(readAction('transfer', data)).toBeNull();
  });
});

describe('readAction: edit and delete', () => {
  it('turns codes into entries, at most 3 and no repeats', () => {
    expect(readAction({ kind: 'deleteExpense', targets: ['E1', 'e2', 'E1', 'E9'] }, data)).toEqual({ kind: 'deleteExpense', ids: ['x1', 'x2'] });
    expect(readAction({ kind: 'deleteIncome', targets: 'I1' }, data)).toEqual({ kind: 'deleteIncome', ids: ['i1'] });
    expect(readAction({ kind: 'deleteExpense', targets: ['E1', 'E2', 'E3', 'E1'] }, data)).toMatchObject({ ids: ['x1', 'x2', 'x3'] });
  });

  it('refuses codes from the wrong list or that point nowhere', () => {
    expect(readAction({ kind: 'deleteExpense', targets: ['I1'] }, data)).toBeNull();
    expect(readAction({ kind: 'deleteIncome', targets: ['I5'] }, data)).toBeNull();
  });

  it('keeps only changes that can be saved', () => {
    expect(readAction({ kind: 'editExpense', targets: ['E1'], changes: { amount: '250', category: 'food', date: '2026-11-14', junk: 1 } }, data))
      .toEqual({ kind: 'editExpense', ids: ['x1'], changes: { amount: 250, category: 'Food', day: '2026-11-14' } });
    // Unknown category and a broken date are dropped; nothing left means no card
    expect(readAction({ kind: 'editExpense', targets: ['E1'], changes: { category: 'Pets', date: 'yesterday' } }, data)).toBeNull();
    // Income has no category to change
    expect(readAction({ kind: 'editIncome', targets: ['I1'], changes: { category: 'Food', amount: 31000 } }, data))
      .toEqual({ kind: 'editIncome', ids: ['i1'], changes: { amount: 31000 } });
  });

  it('never puts a code or a phone number into a title', () => {
    expect(readAction({ kind: 'editExpense', targets: ['E1'], changes: { title: 'OTP is 482913' } }, data)).toBeNull();
    const edit = readAction({ kind: 'editExpense', targets: ['E1'], changes: { title: 'Paid 01712345678' } }, data);
    expect(edit && edit.kind === 'editExpense' && edit.changes.title).not.toContain('01712345678');
  });
});

describe('readAction: budgets, categories and repeats', () => {
  const rule = { id: 'r1', uid: 'u', title: 'Netflix', amount: 800, category: 'Other', frequency: 'monthly', nextDate: '2026-12-01T06:00:00.000Z' } as RecurringExpense;
  const more: AgentData = { ...data, recurring: [rule], categoryBudgets: { Food: 5000 } };

  it('sets the monthly budget or a known category budget', () => {
    expect(readAction({ kind: 'budget', amount: 20000 }, more)).toEqual({ kind: 'budget', amount: 20000 });
    expect(readAction({ kind: 'budget', category: 'food', amount: '5,000' }, more)).toEqual({ kind: 'budget', category: 'Food', amount: 5000 });
    expect(readAction({ kind: 'budget', category: 'Pets', amount: 500 }, more)).toBeNull();
    expect(readAction({ kind: 'budget', amount: -1 }, more)).toBeNull();
  });

  it('removes only a category budget that exists', () => {
    expect(readAction({ kind: 'removeBudget', category: 'Food' }, more)).toEqual({ kind: 'removeBudget', category: 'Food' });
    expect(readAction({ kind: 'removeBudget', category: 'Transport' }, more)).toBeNull();
    expect(readAction({ kind: 'removeBudget' }, more)).toBeNull();
  });

  it('adds only a new, clean category name', () => {
    expect(readAction({ kind: 'addCategory', name: '  Pets ' }, more)).toEqual({ kind: 'addCategory', name: 'Pets' });
    expect(readAction({ kind: 'addCategory', name: 'food' }, more)).toBeNull();
    expect(readAction({ kind: 'addCategory', name: 'INVALID' }, more)).toBeNull();
    expect(readAction({ kind: 'addCategory', name: 'Card 12345678' }, more)).toBeNull();
    expect(cleanCategoryName('x'.repeat(80))).toHaveLength(50);
  });

  it('reads a repeating expense, with Other for an unknown category', () => {
    expect(readAction({ kind: 'recurring', title: 'Internet bill', amount: 1000, category: 'Bills', frequency: 'monthly', account: 'A2' }, more))
      .toEqual({ kind: 'recurring', title: 'Internet bill', amount: 1000, category: 'Other', frequency: 'monthly', accountId: 'b' });
    expect(readAction({ kind: 'recurring', title: 'Gym', amount: 500, category: 'Transport', frequency: 'yearly' }, more)).toBeNull();
  });

  it('stops a repeating expense by its code', () => {
    expect(readAction({ kind: 'stopRecurring', targets: ['R1'] }, more)).toEqual({ kind: 'stopRecurring', ids: ['r1'] });
    expect(readAction({ kind: 'stopRecurring', targets: ['R2'] }, more)).toBeNull();
  });

  it('tells the AI about repeats and category budgets', () => {
    const text = agentContext([], [], [], [rule], { Food: 5000 });
    expect(text).toContain('R1 | Netflix | 800 | monthly | 2026-12-01');
    expect(text).toContain('Food: 5000');
  });
});

describe('dateForDay', () => {
  it('keeps the old time on the same day, and uses midday for a new day', () => {
    expect(dateForDay('2026-11-15', '2026-11-15T10:00:00.000Z')).toBeUndefined();
    expect(dateForDay(undefined, '2026-11-15T10:00:00.000Z')).toBeUndefined();
    expect(dateForDay('2026-11-14', '2026-11-15T10:00:00.000Z')).toBe(new Date('2026-11-14T12:00:00').toISOString());
  });
});

describe('transferProblem', () => {
  it('needs two different existing accounts and an amount', () => {
    expect(transferProblem(undefined, 'w', 5, accounts)).toBe('pickFrom');
    expect(transferProblem('b', 'gone', 5, accounts)).toBe('pickTo');
    expect(transferProblem('b', 'b', 5, accounts)).toBe('same');
    expect(transferProblem('b', 'w', 0, accounts)).toBe('amount');
    expect(transferProblem('b', 'w', 5, accounts)).toBeNull();
  });
});

describe('readAction: settings and screens', () => {
  const data: AgentData = { accounts: [], expenses: [], incomes: [], categories: ['Food'] };

  it('puts every asked setting on one card, and only those', () => {
    expect(readAction({ kind: 'settings', darkMode: true, language: 'bn', currency: 'usd', reminders: { loan: false } }, data))
      .toEqual({ kind: 'settings', changes: { darkMode: true, language: 'bn', currency: 'USD', reminders: { loan: false } } });
  });

  it('drops what the app does not have', () => {
    expect(readAction({ kind: 'settings', language: 'fr', currency: 'XYZ', darkMode: 'yes', reminders: { lottery: true } }, data)).toBeNull();
    expect(readAction({ kind: 'settings', currency: 'BDT', language: 'hi' }, data)).toEqual({ kind: 'settings', changes: { currency: 'BDT' } });
  });

  it('"all" switches every automatic reminder, and a named one wins over it', () => {
    const action = readAction({ kind: 'settings', reminders: { all: false, daily: true } }, data);
    expect(action?.kind === 'settings' && action.changes.reminders).toEqual(
      { daily: true, streak: false, loan: false, samity: false, budget: false, weekly: false, monthly: false, goal: false, planned: false, warranty: false });
  });

  it('keeps the daily time on the half hours the Reminders sheet offers', () => {
    expect(reminderTimeFrom('21:40')).toBe('21:30');
    expect(reminderTimeFrom('7:50')).toBe('08:00');
    expect(reminderTimeFrom('23:30')).toBe('23:30');
    expect(reminderTimeFrom('05:00')).toBeUndefined();
    expect(reminderTimeFrom('23:50')).toBeUndefined();
    expect(reminderTimeFrom('9 pm')).toBeUndefined();
  });

  it('opens only screens from the search list, never the PIN lock', () => {
    expect(readAction({ kind: 'open', screen: 'funds' }, data)).toEqual({ kind: 'open', place: 'funds' });
    expect(readAction({ kind: 'open', screen: 'pin' }, data)).toBeNull();
    expect(readAction({ kind: 'open', screen: 'darkMode' }, data)).toBeNull();
    expect(readAction({ kind: 'open', screen: 'nowhere' }, data)).toBeNull();
    expect(OPEN_PLACES.some(p => p.id === 'pin')).toBe(false);
  });

  it('tells the AI the current settings', () => {
    const line = settingsLine({ darkMode: true, language: 'bn', currency: 'BDT', reminders: { ...DEFAULT_REMINDERS, on: { ...DEFAULT_REMINDERS.on, loan: false } } });
    expect(line).toContain('dark mode on');
    expect(line).toContain('Bangla');
    expect(line).not.toContain('loan,');
    expect(agentContext([], [], [], [], {}, { darkMode: false, language: 'en', currency: 'USD', reminders: DEFAULT_REMINDERS })).toContain('currency USD');
  });
});

describe('readAction: shopping lists', () => {
  const list = { id: 's1', uid: 'u', name: 'Weekly', items: [], createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z' };
  const data: AgentData = { accounts: [], expenses: [], incomes: [], categories: [], shoppingLists: [list] };

  it('makes a new list from names and details', () => {
    const action = readAction({ kind: 'shopping', name: 'Bazar', items: ['Oil', { name: 'Rice', qty: '2 kg', price: 180 }] }, data);
    expect(action).toMatchObject({ kind: 'shopping', name: 'Bazar', items: [{ name: 'Oil' }, { name: 'Rice', qty: '2 kg', price: 180 }] });
  });

  it('adds to the list the code points at', () => {
    expect(readAction({ kind: 'shopping', list: 'L1', items: ['Salt'] }, data)).toMatchObject({ kind: 'shopping', listId: 's1' });
  });

  it('refuses no items, no name, or only secret codes', () => {
    expect(readAction({ kind: 'shopping', name: 'Bazar', items: [] }, data)).toBeNull();
    expect(readAction({ kind: 'shopping', items: ['Oil'] }, data)).toBeNull();
    expect(readAction({ kind: 'shopping', name: 'Bazar', items: ['OTP 482913'] }, data)).toBeNull();
  });
});

describe('labels from chat', () => {
  const expense = { id: 'e1', uid: 'u', title: 'Bus', amount: 500, category: 'Travel', date: '2026-11-15T12:00:00.000Z' };
  const data: AgentData = { accounts: [], expenses: [expense], incomes: [], categories: ['Travel'] };

  it('shows the AI the labels on an entry', () => {
    expect(expenseLines([{ ...expense, labels: ['Eid trip'] }])[0]).toBe('E1 | 2026-11-15 | Bus | Travel | 500 | labels: Eid trip');
  });

  it('adds a label to a saved entry, cleaned up', () => {
    expect(readAction({ kind: 'editExpense', targets: ['E1'], changes: { labels: [' Eid  trip ', 'eid trip', 'OTP 482913'] } }, data))
      .toEqual({ kind: 'editExpense', ids: ['e1'], changes: { labels: ['Eid trip'] } });
  });

  it('can remove every label', () => {
    expect(readAction({ kind: 'editExpense', targets: ['E1'], changes: { labels: [] } }, data))
      .toEqual({ kind: 'editExpense', ids: ['e1'], changes: { labels: [] } });
  });
});

describe('readAction: planned payments', () => {
  const data: AgentData = { accounts: [], expenses: [], incomes: [], categories: ['Education', 'Other'] };

  it('reads a bill with its date and category', () => {
    expect(readAction({ kind: 'planned', direction: 'expense', title: 'School fee', amount: 3000, category: 'education', date: '2026-12-10', repeat: 'monthly' }, data))
      .toEqual({ kind: 'planned', plannedKind: 'expense', title: 'School fee', amount: 3000, category: 'Education', day: '2026-12-10', repeat: 'monthly' });
  });

  it('reads expected money, and falls back to a single payment and Other', () => {
    expect(readAction({ kind: 'planned', direction: 'income', title: 'Bonus', amount: 5000, category: 'Lottery', date: '2026-12-10', repeat: 'daily' }, data))
      .toEqual({ kind: 'planned', plannedKind: 'income', title: 'Bonus', amount: 5000, category: 'Other', day: '2026-12-10', repeat: 'once' });
  });

  it('refuses a plan with no amount, no real date, or a secret code', () => {
    expect(readAction({ kind: 'planned', title: 'Rent', date: '2026-12-10' }, data)).toBeNull();
    expect(readAction({ kind: 'planned', title: 'Rent', amount: 100, date: 'soon' }, data)).toBeNull();
    expect(readAction({ kind: 'planned', title: 'OTP 482913', amount: 100, date: '2026-12-10' }, data)).toBeNull();
  });
});

describe('readAction: savings goals and samity', () => {
  const fund = { id: 'f1', uid: 'u', name: 'Eid', target: 10000, saved: 2500, createdAt: '2026-11-01T00:00:00.000Z' } as Fund;
  const samity = {
    id: 's1', uid: 'u', name: 'Office', amount: 2000, frequency: 'monthly', members: 10, myTurn: 4,
    startDate: '2026-10-01T06:00:00.000Z', payments: { 1: '', 2: '' }, createdAt: '2026-10-01T00:00:00.000Z',
  } as Samity;
  const account = { id: 'a1', uid: 'u', type: 'bkash', name: 'bKash', label: '123', balance: 5000 } as Account;
  const data: AgentData = { accounts: [account], expenses: [], incomes: [], categories: [], funds: [fund], samities: [samity] };

  it('reads goal codes, amounts and the named account', () => {
    expect(readAction({ kind: 'addToGoal', goal: 'G1', amount: '2,000', account: 'A1' }, data))
      .toEqual({ kind: 'addToGoal', fundId: 'f1', amount: 2000, accountId: 'a1' });
    expect(readAction({ kind: 'takeFromGoal', goal: 'g1', amount: 500 }, data)).toEqual({ kind: 'takeFromGoal', fundId: 'f1', amount: 500 });
    expect(readAction({ kind: 'deleteGoal', goal: 'G1' }, data)).toEqual({ kind: 'deleteGoal', fundId: 'f1' });
    expect(readAction({ kind: 'addToGoal', goal: 'G2', amount: 100 }, data)).toBeNull();
  });

  it('makes a goal with or without an end date', () => {
    expect(readAction({ kind: 'createGoal', name: 'Eid', target: 10000, date: '2027-03-30' }, data))
      .toEqual({ kind: 'createGoal', name: 'Eid', target: 10000, day: '2027-03-30' });
    expect(readAction({ kind: 'createGoal', name: 'Laptop', target: 60000, date: 'soon' }, data))
      .toEqual({ kind: 'createGoal', name: 'Laptop', target: 60000 });
    expect(readAction({ kind: 'createGoal', name: 'OTP 482913', target: 100 }, data)).toBeNull();
  });

  it('needs a whole samity: members 2 to 100 and a turn among them', () => {
    expect(readAction({ kind: 'createSamity', name: 'Office', amount: 2000, members: 10, myTurn: 4, start: '2026-12-01' }, data))
      .toEqual({ kind: 'createSamity', name: 'Office', amount: 2000, frequency: 'monthly', members: 10, myTurn: 4, startDay: '2026-12-01' });
    expect(readAction({ kind: 'createSamity', name: 'Office', amount: 2000, members: 10, myTurn: 11 }, data)).toBeNull();
    expect(readAction({ kind: 'createSamity', name: 'Office', amount: 2000, members: 1, myTurn: 1 }, data)).toBeNull();
    expect(readAction({ kind: 'createSamity', name: 'Office', members: 5, myTurn: 2 }, data)).toBeNull();
  });

  it('keeps a named round only when it exists', () => {
    expect(readAction({ kind: 'payRound', samity: 'S1' }, data)).toEqual({ kind: 'payRound', samityId: 's1' });
    expect(readAction({ kind: 'payRound', samity: 'S1', round: 5 }, data)).toEqual({ kind: 'payRound', samityId: 's1', round: 5 });
    expect(readAction({ kind: 'undoRound', samity: 'S1', round: 40 }, data)).toEqual({ kind: 'undoRound', samityId: 's1' });
    expect(readAction({ kind: 'samityPayout', samity: 'S1', account: 'A1' }, data)).toEqual({ kind: 'samityPayout', samityId: 's1', accountId: 'a1' });
    expect(readAction({ kind: 'deleteSamity', samity: 'S9' }, data)).toBeNull();
  });

  it('shows the AI goals and samities with codes, and no balances', () => {
    const text = agentContext([account], [], [], [], {}, undefined, [fund], [samity]);
    expect(text).toContain('G1 | Eid | target 10000 | saved 2500 | no end date');
    expect(text).toContain('S1 | Office | 2000 monthly | 10 members | paid 2 of 10 | next unpaid round 3');
    expect(text).toContain('your turn round 4');
    expect(text).not.toContain('5000');
  });
});

describe('money month in chat', () => {
  const data: AgentData = { accounts: [], expenses: [], incomes: [], categories: [] };

  it('lets the AI move the start of the month, 1 to 31 only', () => {
    expect(readAction({ kind: 'settings', monthStart: 25 }, data)).toEqual({ kind: 'settings', changes: { monthStart: 25 } });
    expect(readAction({ kind: 'settings', monthStart: 0 }, data)).toBeNull();
    expect(readAction({ kind: 'settings', monthStart: 32 }, data)).toBeNull();
  });

  it("tells the AI which days 'this month' covers", () => {
    const line = settingsLine({ darkMode: false, language: 'en', currency: 'BDT', reminders: DEFAULT_REMINDERS, monthStart: 25 }, new Date('2026-12-03T12:00:00'));
    expect(line).toContain('month starts on day 25');
    expect(line).toContain('from 2026-11-25 to 2026-12-24');
  });
});

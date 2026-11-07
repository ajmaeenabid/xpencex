// Balance history: every change to an account's balance also saves a history line in the same write,
// and the account keeps `historySum`, the balance its history adds up to. If the two ever differ, some
// change was made without a history line (a bug, or an old app version), and the app says so.
// Plain rules, no database calls: the app (accountService.ts) and this server (loans.ts) both use them.

export type BalanceReason =
  | 'start' // the balance when history began, for accounts made before this existed
  | 'created' // the balance an account was made with
  | 'corrected' // changed by hand in Edit account
  | 'smsBalance' // matched to the balance an SMS reported
  | 'expense' | 'expenseEdit' | 'expenseDelete'
  | 'moneyIn' | 'monthlyDeposit' | 'recurring' | 'loanReceived' | 'loanPayment'
  | 'lent' | 'gotBack' | 'borrowed' | 'paidBack' | 'debtDeleted' // lend and borrow with people
  | 'cashOut' | 'cashIn' // a Cash Out: out of the mobile or bank account, into the Cash wallet
  | 'samityPaid' | 'samityPayout' | 'samityUndo'; // samity rounds and your payout

export const BALANCE_REASONS: BalanceReason[] = [
  'start', 'created', 'corrected', 'smsBalance', 'expense', 'expenseEdit', 'expenseDelete',
  'moneyIn', 'monthlyDeposit', 'recurring', 'loanReceived', 'loanPayment',
  'lent', 'gotBack', 'borrowed', 'paidBack', 'debtDeleted', 'cashOut', 'cashIn',
  'samityPaid', 'samityPayout', 'samityUndo',
];

export interface BalanceLine {
  kind: 'set' | 'change'; // 'set': the balance became `amount`; 'change': `amount` was added (negative = taken)
  amount: number;
  reason: BalanceReason;
  previous?: number; // the balance before a 'set'
  title?: string; // what caused it, e.g. the expense's title
  at: string;
}

/** What to write: the history lines, and how `historySum` changes */
export interface BalancePlan {
  lines: BalanceLine[];
  historySum: { add: number } | { set: number };
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

const clean = (title?: string) => (title ? title.trim().slice(0, 100) : '') || undefined;

/**
 * A change to the balance. An account without history yet first gets a "start" line with its
 * balance, so its history adds up from the very first change.
 */
export function planChange(account: { balance: number; historySum?: number }, delta: number, reason: BalanceReason, title?: string, now = Date.now()): BalancePlan {
  const at = new Date(now).toISOString();
  const change: BalanceLine = { kind: 'change', amount: round2(delta), reason, at, ...(clean(title) && { title: clean(title) }) };
  if (typeof account.historySum === 'number') return { lines: [change], historySum: { add: round2(delta) } };
  const start: BalanceLine = { kind: 'set', amount: round2(account.balance), reason: 'start', at };
  return { lines: [start, change], historySum: { set: round2(account.balance + delta) } };
}

/** The balance set to a new value, for example corrected by hand or matched to an SMS */
export function planSet(account: { balance: number }, value: number, reason: BalanceReason, now = Date.now()): BalancePlan {
  return {
    lines: [{ kind: 'set', amount: round2(value), reason, previous: round2(account.balance), at: new Date(now).toISOString() }],
    historySum: { set: round2(value) },
  };
}

/**
 * Whether the balance matches its history. Null while the account has no history yet.
 * `difference` is how much the balance is above (+) or below (-) what the history adds up to.
 */
export function balanceCheck(account: { balance: number; historySum?: number }): { ok: boolean; difference: number } | null {
  if (typeof account.historySum !== 'number') return null;
  const difference = round2(account.balance - account.historySum);
  return { ok: Math.abs(difference) < 0.01, difference };
}

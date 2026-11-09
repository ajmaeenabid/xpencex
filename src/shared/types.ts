export interface UserProfile {
  uid: string;
  name?: string;
  username?: string; // chosen at first sign-in; only the server changes it
  email: string;
  photoURL?: string;
  monthlyBudget?: number;
  currency?: string;
  categoryBudgets?: Record<string, number>;
  layout?: Partial<Record<'home' | 'reports' | 'profile', string[]>>; // order of the movable cards per page
  driveBackup?: DriveBackupSettings; // Google Drive backups (src/features/connect)
  // Brand-new accounts only: 'slides' (welcome slides next), then 'tour' (button tour on Home), then 'done'.
  // Accounts made before this existed have no value and never see them.
  welcome?: 'slides' | 'tour' | 'done';
}

export interface DriveBackupSettings {
  auto?: boolean; // back up by itself while the app is open
  every?: number; // 1 to 72
  unit?: 'hours' | 'days';
  lastAt?: string; // ISO date of the last backup to Drive
}

export interface Expense {
  id: string;
  uid: string;
  title: string;
  amount: number;
  category: string;
  date: string;
  notes?: string;
  split?: { total: number; people: number };
  recurringId?: string;
  accountId?: string; // 'cash' or an Account id; missing on expenses saved before accounts existed
  accountName?: string; // kept so the expense still reads right after its account is deleted
  smsRef?: string; // set when the expense came from an SMS, so the same SMS can't be saved twice
  fee?: number; // the bKash, Nagad, Rocket or bank fee the SMS reported, already included in `amount`
  debtId?: string; // made by a lend and borrow entry, which moves the account itself
  createdAt?: string;
  feeling?: 'worth' | 'regret'; // tagged in Transactions: worth it, or a regret
}

export type AccountType = 'bank' | 'bkash' | 'nagad' | 'rocket' | 'cash';

export interface Account {
  id: string;
  uid: string;
  type: AccountType;
  name: string; // bank name, or the mobile banking provider
  label: string; // bank: the user's own account type (e.g. Savings); mobile: last 3 digits of the number
  holderName?: string; // bank only
  balance: number;
  deposit?: { amount: number; day: number }; // bank only: added automatically every month
  nextDepositDate?: string;
  createdAt?: string;
  historySum?: number; // what the balance history adds up to (see ai-server/src/balanceLines.ts)
  countedAt?: string; // Cash wallet only: when you last confirmed or counted your cash
}

export interface Deposit {
  id: string;
  uid: string;
  accountId: string;
  accountName: string;
  amount: number;
  date: string;
  title?: string; // e.g. "Bank deposit", "bKash Received Money"; monthly deposits have none
  source?: 'monthly' | 'sms' | 'chat' | 'loan';
  smsRef?: string;
}

// A loan taken against one bank or mobile banking account. The AI server takes each monthly
// installment on its day (ai-server/src/loans.ts); the app only creates and edits loans.
export interface Loan {
  id: string;
  uid: string;
  accountId: string; // installments are taken from this account
  accountName: string;
  name: string;
  lender?: string; // the bank that gave the loan (mobile banking loans come from partner banks)
  total: number; // everything to repay, interest included
  remaining: number;
  installment: number;
  day: number; // day of the month, 1 to 31
  nextDueDate: string;
  status: 'active' | 'paid' | 'stopped'; // stopped: its account was deleted
  paidCount: number;
  lastPaidAt?: string;
  lastPaidAmount?: number;
  lastPaidNegative?: boolean; // the last installment took the balance below zero
  createdAt: string;
}

export type RecurringFrequency ='weekly' | 'monthly';

export interface RecurringExpense {
  id: string;
  uid: string;
  title: string;
  amount: number;
  category: string;
  notes?: string;
  frequency: RecurringFrequency;
  nextDate: string;
  accountId?: string;
  accountName?: string;
}

export interface Category {
  id: string;
  uid: string;
  name: string;
  icon?: string;
}

export interface ChatAttachment {
  name: string;
  kind: 'image' | 'pdf' | 'sheet';
}

export interface MessageVersion {
  content: string;
  after: ChatMessage[]; // what came after it; empty for the version on screen
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  type?: 'text' | 'expense_confirmation' | 'income_confirmation' | 'error';
  pendingExpense?: Partial<Expense>;
  pendingIncome?: { title: string; amount: number; date: string; notes?: string; accountId?: string };
  // Facts read from a money SMS (never the account number): its reference and the balance it reported
  sms?: { ref: string; balance?: number; accountType?: AccountType };
  voiceDuration?: number; // seconds, set on voice messages
  spokenText?: string; // the written version of a voice message, so the assistant remembers it. Not shown.
  liveDuration?: number; // seconds, set on the marker for a live chat
  attachment?: ChatAttachment; // the label only: the file itself is never saved
  replyLang?: 'en' | 'bn'; // the language the user was using, for sentences added after this one
  // Earlier versions of an edited or resent prompt, with the replies that belong to each
  versions?: MessageVersion[];
  versionIndex?: number; // which version is showing
  versionsText?: string; // how `versions` is saved (see packMessages in features/chat/versions.ts)
  resolved?: boolean; // expense confirmation already saved or dismissed
  saved?: boolean; // the expense or money in on this card was really saved
  steps?: string[]; // what the assistant did to answer, shown collapsed above the reply
  backupModel?: string; // the main AI model was busy or retired, so this backup model answered
}

export interface Chat {
  id: string;
  uid: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
  pinned?: boolean; // kept when the history is full, and listed first
}

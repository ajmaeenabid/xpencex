import { ExtractedExpense, matchCategory } from '../../features/expenses/expense';
import { AccountType } from '../types';
import { normalizeForScan } from './sensitiveData';

export interface SmsIncome {
  title: string;
  amount: number;
  date: string;
  notes: string;
}

/** A money SMS read on the device. `ref` identifies it so the same SMS can't be saved twice. */
export type TransactionSms =
  | { kind: 'expense'; provider: string; accountType: AccountType; expense: ExtractedExpense; ref: string; balance?: number }
  | { kind: 'income'; provider: string; accountType: AccountType; income: SmsIncome; ref: string; balance?: number };

const AMOUNT = String.raw`(?:Tk\.?|BDT|৳)\s*([\d,]+(?:\.\d+)?)`;
const BALANCE = new RegExp(String.raw`bal(?:ance)?\.?\s*(?:is|:)?\s*` + AMOUNT, 'i');

const TRANSACTION_TYPES: { pattern: RegExp; label: string; category: string }[] = [
  { pattern: /mobile\s*recharge|recharge/i, label: 'Mobile Recharge', category: 'Utilities' },
  { pattern: /bill\s*pay(ment)?/i, label: 'Bill Payment', category: 'Bills' },
  { pattern: /cash\s*out/i, label: 'Cash Out', category: 'Other' },
  { pattern: /send\s*money/i, label: 'Send Money', category: 'Other' },
  { pattern: /payment/i, label: 'Payment', category: 'Shopping' },
];

const toNumber = (s: string) => parseFloat(s.replace(/,/g, ''));
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Hides account, card and phone numbers in a pasted or shared SMS before it goes anywhere:
 * the chat, the saved chat history, or the AI. Transaction IDs (letters + digits) are kept.
 */
export function maskSensitive(text: string): string {
  // Invisible characters are removed and Bangla / full-width digits become 0-9 first,
  // so disguised numbers are masked too (and amounts can be read)
  return normalizeForScan(text)
    // "A/C# 10689**0001", "A/C No: 1234567", "Account 0123-456-789"
    .replace(/\b(A\/C|Acc(?:oun)?t|AC)\b\.?\s*(?:No\.?|Number)?\s*[#:.]?\s*[0-9Xx*•][0-9Xx*•\- ]{2,}[0-9Xx*•]/gi, 'A/C ••••')
    // "Card No. 4321XXXXXXXX9876", "card ending 9876"
    .replace(/\b(card)\b\s*(?:no\.?|number|ending(?:\s+with)?)?\s*[#:]?\s*[0-9Xx*•][0-9Xx*•\- ]{2,}[0-9Xx*•]/gi, 'card ••••')
    // Any other long run of digits or masked digits (phone numbers, unlabeled account numbers)
    .replace(/(?<![\w.,])\+?(?=[0-9Xx*•]*\d)[0-9Xx*•]{8,}(?![\w]|[.,]\d)/g, '••••');
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** Dates like 23/10/2026 14:30, 20-10-26 or 20-Oct-26. Falls back to now. */
function parseSmsDate(text: string): Date {
  const numeric = text.match(/\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{4}|\d{2})\b(?:\s+(\d{1,2}):(\d{2}))?/);
  const named = text.match(/\b(\d{1,2})[\s\/-]([A-Za-z]{3})[a-z]*[\s\/-](\d{4}|\d{2})\b(?:\s+(\d{1,2}):(\d{2}))?/);
  let day: number, month: number, year: number, hour: number | undefined, minute: number | undefined;
  if (numeric) {
    [day, month, year] = [+numeric[1], +numeric[2] - 1, +numeric[3]];
    hour = numeric[4] ? +numeric[4] : undefined;
    minute = numeric[5] ? +numeric[5] : undefined;
  } else if (named && MONTHS.includes(named[2].toLowerCase())) {
    [day, month, year] = [+named[1], MONTHS.indexOf(named[2].toLowerCase()), +named[3]];
    hour = named[4] ? +named[4] : undefined;
    minute = named[5] ? +named[5] : undefined;
  } else {
    return new Date();
  }
  if (year < 100) year += 2000;
  const now = new Date();
  const sameDay = now.getFullYear() === year && now.getMonth() === month && now.getDate() === day;
  // Without a time, use the current time for today's SMS (keeps ordering) and midday otherwise
  const d = hour !== undefined
    ? new Date(year, month, day, hour, minute ?? 0)
    : sameDay ? now : new Date(year, month, day, 12, 0);
  return isNaN(d.getTime()) || d.getMonth() !== month ? new Date() : d;
}

const isoDay = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

/** bKash / Nagad / Rocket SMS */
export function parseWalletSms(text: string, categories: string[]): TransactionSms | null {
  const amountMatch = text.match(new RegExp(AMOUNT, 'i'));
  const hasTrxId = /\b(?:TrxID|TxnID|Trx\s*ID|Txn\s*ID)\b/i.test(text);
  const namesWallet = /bkash|nagad|rocket|dbbl/i.test(text);
  // A bank SMS that happens to carry a transaction ID shouldn't be read as bKash
  if (!amountMatch || !hasTrxId || (!namesWallet && /\b(A\/C|account)\b/i.test(text))) return null;

  const provider = /nagad/i.test(text) ? 'Nagad' : /rocket|dbbl/i.test(text) ? 'Rocket' : 'bKash';
  const accountType: AccountType = provider === 'Nagad' ? 'nagad' : provider === 'Rocket' ? 'rocket' : 'bkash';
  const amount = toNumber(amountMatch[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const trxId = text.match(/(?:TrxID|TxnID|Trx\s*ID|Txn\s*ID)[:\s]*([A-Z0-9]+)/i)?.[1];
  const balanceMatch = text.match(BALANCE);
  const balance = balanceMatch ? toNumber(balanceMatch[1]) : undefined;
  const date = parseSmsDate(text);
  const ref = trxId ? `trx:${trxId.toUpperCase()}` : `${provider}:${amount}:${isoDay(date)}:${balance ?? ''}`;

  if (/you have received|received\s+(?:Tk|BDT|৳)|cash\s*in|money received/i.test(text)) {
    const isCashIn = /cash\s*in/i.test(text);
    return {
      kind: 'income',
      provider,
      accountType,
      ref,
      balance,
      income: {
        title: `${provider} ${isCashIn ? 'Cash In' : 'Received Money'}`,
        amount: round2(amount),
        date: date.toISOString(),
        notes: trxId ? `TrxID ${trxId}` : '',
      },
    };
  }

  const type = TRANSACTION_TYPES.find(t => t.pattern.test(text));
  if (!type) return null;

  const feeMatch = text.match(new RegExp(String.raw`Fee:?\s*` + AMOUNT, 'i'));
  const fee = feeMatch ? toNumber(feeMatch[1]) : 0;
  const to = text.match(/\bto\s+(.+?)(?:\s+(?:is\s+)?successful|\.\s|\s+Ref\b|\s+Fee\b|$)/i)?.[1]?.trim();
  // Don't put a (masked) phone number in the title
  const toName = to && !/^[•\d+\s-]+$/.test(to) ? to : undefined;

  const notes = [trxId && `TrxID ${trxId}`, fee > 0 && `Fee ৳${fee}`].filter(Boolean).join(' · ');

  return {
    kind: 'expense',
    provider,
    accountType,
    ref,
    balance,
    expense: {
      title: `${provider} ${type.label}${toName ? ` to ${toName}` : ''}`.slice(0, 100),
      amount: round2(amount + fee),
      category: matchCategory(type.category, categories),
      date: date.toISOString(),
      notes,
      ...(fee > 0 && { fee: round2(fee) }),
    },
  };
}

/** Bank SMS, e.g. "TK 620.00 has been credited to your A/C# ••••  on 20-10-26. Your A/C balance is TK 985.46." */
export function parseBankSms(text: string, categories: string[]): TransactionSms | null {
  const mentionsAccount = /\b(A\/C|account|acct|card)\b/i.test(text);
  const isCredit = /\b(credited|deposited|cash\s*deposit)\b/i.test(text);
  const isDebit = /\b(debited|withdrawn|withdrawal|purchase|spent|transferred)\b/i.test(text);
  if (!mentionsAccount || isCredit === isDebit) return null; // neither, or confusingly both

  // The transaction amount is the first amount that isn't the balance
  const balanceMatch = text.match(BALANCE);
  const balance = balanceMatch ? toNumber(balanceMatch[1]) : undefined;
  const withoutBalance = balanceMatch ? text.replace(balanceMatch[0], '') : text;
  const amountMatch = withoutBalance.match(new RegExp(AMOUNT, 'i'));
  if (!amountMatch) return null;
  const amount = toNumber(amountMatch[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const date = parseSmsDate(text);
  const ref = `bank:${isCredit ? 'in' : 'out'}:${amount}:${isoDay(date)}:${balance ?? ''}`;

  if (isCredit) {
    return {
      kind: 'income',
      provider: 'Bank',
      accountType: 'bank',
      ref,
      balance,
      income: { title: 'Bank deposit', amount: round2(amount), date: date.toISOString(), notes: '' },
    };
  }

  const isAtm = /\bATM\b|cash\s*withdraw/i.test(text);
  const isTransfer = /transferred|fund\s*transfer|\bNPSB\b|\bBEFTN\b/i.test(text);
  const merchant = text.match(/\bat\s+([A-Za-z0-9][A-Za-z0-9 &'._-]{1,40}?)(?=\s+on\b|[.,;]|\s*$)/i)?.[1]?.trim();
  const label = isAtm ? 'ATM cash withdrawal' : isTransfer ? 'Bank transfer' : merchant ? `Card purchase at ${merchant}` : 'Bank payment';

  return {
    kind: 'expense',
    provider: 'Bank',
    accountType: 'bank',
    ref,
    balance,
    expense: {
      title: label.slice(0, 100),
      amount: round2(amount),
      category: matchCategory(isAtm || isTransfer ? 'Other' : 'Shopping', categories),
      date: date.toISOString(),
      notes: '',
    },
  };
}

/** Tries mobile banking first, then bank formats */
export function parseTransactionSms(text: string, categories: string[]): TransactionSms | null {
  return parseWalletSms(text, categories) ?? parseBankSms(text, categories);
}

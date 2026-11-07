// Lend and borrow with people (dhar/baki): plain rules, no database calls

export type DebtKind = 'lent' | 'gotBack' | 'borrowed' | 'paidBack';
export const DEBT_KINDS: DebtKind[] = ['lent', 'gotBack', 'borrowed', 'paidBack'];

export interface Debt {
  id: string;
  uid: string;
  person: string;
  kind: DebtKind;
  amount: number;
  date: string;
  note?: string;
  accountId?: string; // set when the money moved in or out of one of your accounts
  accountName?: string;
  expenseId?: string; // set when it was also counted as spending
  smsRef?: string; // set when it came from an SMS, so the same SMS can't be saved twice
  createdAt: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Lending and paying back take money out of your pocket; the other two bring it in */
export const isMoneyOut = (kind: DebtKind) => kind === 'lent' || kind === 'paidBack';

/** How an entry changes what the person owes you (negative: what you owe them) */
export function owedChange(kind: DebtKind, amount: number): number {
  return kind === 'lent' || kind === 'paidBack' ? amount : -amount;
}

/** How an entry changes the account it went through */
export const accountChange = (kind: DebtKind, amount: number) => (isMoneyOut(kind) ? -amount : amount);

/** One person's name, tidied: extra spaces removed, at most 60 characters */
export const cleanPerson = (name: string) => name.trim().replace(/\s+/g, ' ').slice(0, 60);

/** Names are matched ignoring capitals and spaces, so "rahim" and "Rahim " are one person */
export const personKey = (name: string) => cleanPerson(name).toLowerCase();

export interface Person {
  key: string;
  name: string; // as written in their latest entry
  net: number; // they owe you (+) or you owe them (-)
  entries: Debt[]; // newest first
  lastDate: string;
}

/** Everyone you lent to or borrowed from: people with money still open first, the most first */
export function people(debts: Debt[]): Person[] {
  const groups = new Map<string, Debt[]>();
  for (const d of debts) {
    const key = personKey(d.person);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) || []), d]);
  }
  return [...groups.entries()]
    .map(([key, entries]) => {
      const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
      return {
        key,
        name: cleanPerson(sorted[0].person),
        net: round2(entries.reduce((sum, d) => sum + owedChange(d.kind, d.amount), 0)),
        entries: sorted,
        lastDate: sorted[0].date,
      };
    })
    .sort((a, b) => {
      const openA = Math.abs(a.net) >= 0.01, openB = Math.abs(b.net) >= 0.01;
      if (openA !== openB) return openA ? -1 : 1;
      if (openA) return Math.abs(b.net) - Math.abs(a.net);
      return b.lastDate.localeCompare(a.lastDate);
    });
}

/** What everyone owes you, and what you owe others */
export function debtTotals(debts: Debt[]): { toGet: number; toGive: number } {
  let toGet = 0, toGive = 0;
  for (const p of people(debts)) {
    if (p.net > 0) toGet += p.net;
    else toGive -= p.net;
  }
  return { toGet: round2(toGet), toGive: round2(toGive) };
}

/** The entry that settles a person in full, or null when nothing is open */
export function settleEntry(net: number): { kind: DebtKind; amount: number } | null {
  if (Math.abs(net) < 0.01) return null;
  return net > 0 ? { kind: 'gotBack', amount: round2(net) } : { kind: 'paidBack', amount: round2(-net) };
}

/** The name in an SMS expense title such as "bKash Send Money to Rahim" */
export function personFromSms(title: string): string {
  const match = title.match(/\bto\s+(.+)$/i);
  return match ? cleanPerson(match[1]) : '';
}

// The Google Sheets tables for My Accounts, Lend & borrow, Festival fund and Samity.
// Plain rules only, so they can be tested. Text comes through `t`, so sheets follow the app language.
import { format } from 'date-fns';
import { Account, Loan } from '../../shared/types';
import type { TKey } from '../../shared/i18n';
import type { BalanceLine } from '../../../ai-server/src/balanceLines';
import { accountDisplayName } from '../accounts/accounts';
import { installmentsLeft } from '../accounts/loans';
import { Debt, people } from '../debts/debts';
import { Fund, fundPlan } from '../funds/funds';
import { Samity, payoutAmount, samityStatus } from '../samity/samity';
import { Cell, SheetTab, tabTitle } from './googleApps';

type T = (key: TKey, vars?: Record<string, string | number>) => string;

/** A saved balance history line: the shared line plus the account it belongs to */
export type SavedBalanceLine = BalanceLine & { accountId: string };

const day = (d: string | Date) => {
  const date = typeof d === 'string' ? new Date(d) : d;
  return Number.isFinite(date.getTime()) ? format(date, 'yyyy-MM-dd') : '';
};
const round2 = (n: number) => Math.round(n * 100) / 100;
const yesNo = (t: T, v: boolean) => t(v ? 'sheet.yes' : 'sheet.no');

/** My Accounts: the accounts, every balance change, and the loans */
export function accountsTabs(accounts: Account[], history: SavedBalanceLine[], loans: Loan[], currency: string, t: T): SheetTab[] {
  const names = new Map(accounts.map(a => [a.id, accountDisplayName(a)]));

  const accountRows: Cell[][] = [
    [t('sheet.account'), t('sheet.balance', { currency }), t('sheet.monthlyDeposit', { currency }), t('sheet.depositDay'), t('sheet.holder')],
    ...accounts.map(a => [accountDisplayName(a), round2(a.balance), a.deposit?.amount ?? '', a.deposit?.day ?? '', a.holderName || '']),
  ];

  const historyRows: Cell[][] = [
    [t('sheet.date'), t('sheet.account'), t('sheet.whatHappened'), t('sheet.details'), t('sheet.change', { currency }), t('sheet.newBalance', { currency })],
    ...[...history]
      .sort((a, b) => b.at.localeCompare(a.at))
      .map(line => {
        // "set" lines carry the new balance; "change" lines carry how much it moved
        const change = line.kind === 'change' ? line.amount : line.previous !== undefined ? line.amount - line.previous : '';
        const after = line.kind === 'set' ? line.amount : line.previous !== undefined ? line.previous + line.amount : '';
        return [
          day(line.at), names.get(line.accountId) || t('sheet.deletedAccount'),
          t(`balance.reason.${line.reason}` as TKey), line.title || '',
          typeof change === 'number' ? round2(change) : change, typeof after === 'number' ? round2(after) : after,
        ];
      }),
  ];

  const status = (l: Loan) => t(l.status === 'active' ? 'loans.statusActive' : l.status === 'paid' ? 'loans.paidOff' : 'loans.stopped');
  const loanRows: Cell[][] = [
    [t('sheet.name'), t('sheet.lender'), t('sheet.account'), t('sheet.total', { currency }), t('sheet.remaining', { currency }),
      t('sheet.installment', { currency }), t('sheet.dayOfMonth'), t('sheet.nextDue'), t('sheet.installmentsPaid'), t('sheet.installmentsLeft'), t('sheet.status')],
    ...loans.map(l => [
      l.name, l.lender || '', l.accountName, round2(l.total), round2(l.remaining), round2(l.installment), l.day,
      l.status === 'active' ? day(l.nextDueDate) : '', l.paidCount, l.status === 'active' ? installmentsLeft(l) : 0, status(l),
    ]),
  ];

  return [
    { title: tabTitle(t('sheet.kind.accounts')), rows: accountRows },
    ...(history.length ? [{ title: tabTitle(t('sheet.kind.balanceHistory')), rows: historyRows }] : []),
    ...(loans.length ? [{ title: tabTitle(t('sheet.kind.loans')), rows: loanRows }] : []),
  ];
}

/** Lend & borrow: where you stand with each person, then every entry */
export function debtsTabs(debts: Debt[], currency: string, t: T): SheetTab[] {
  const standing = (net: number) => t(net > 0 ? 'sheet.theyOwe' : net < 0 ? 'sheet.youOwe' : 'sheet.settled');
  const peopleRows: Cell[][] = [
    [t('sheet.person'), t('sheet.standing'), t('sheet.amount', { currency }), t('sheet.lastDate')],
    ...people(debts).map(p => [p.name, standing(p.net), round2(Math.abs(p.net)), day(p.lastDate)]),
  ];
  const entryRows: Cell[][] = [
    [t('sheet.date'), t('sheet.person'), t('sheet.what'), t('sheet.amount', { currency }), t('sheet.account'), t('sheet.notes')],
    ...[...debts]
      .sort((a, b) => b.date.localeCompare(a.date))
      .map(d => [day(d.date), d.person, t(`debts.kind.${d.kind}` as TKey), round2(d.amount), d.accountName || '', d.note || '']),
  ];
  return [
    { title: tabTitle(t('sheet.tabPeople')), rows: peopleRows },
    { title: tabTitle(t('sheet.tabEntries')), rows: entryRows },
  ];
}

/** Festival funds: each goal with what is left and how much to put aside */
export function fundsTabs(funds: Fund[], currency: string, t: T, now = new Date()): SheetTab[] {
  const rows: Cell[][] = [
    [t('sheet.name'), t('sheet.festivalDate'), t('sheet.goal', { currency }), t('sheet.saved', { currency }), t('sheet.left', { currency }),
      t('sheet.daysLeft'), t('sheet.perWeek', { currency }), t('sheet.perMonth', { currency }), t('sheet.reached')],
    ...funds.map(f => {
      const p = fundPlan(f, now);
      return [f.name, f.dueDate ? day(f.dueDate) : '', round2(f.target), round2(f.saved), round2(p.left), Math.max(0, p.daysLeft), round2(p.perWeek), round2(p.perMonth), yesNo(t, p.reached)];
    }),
  ];
  return [{ title: tabTitle(t('sheet.kind.funds')), rows }];
}

/** Samity: one line per samity, then every round */
export function samityTabs(list: Samity[], currency: string, t: T): SheetTab[] {
  const how = (s: Samity) => t(s.frequency === 'weekly' ? 'samity.weekly' : 'samity.monthly');
  const summary: Cell[][] = [
    [t('sheet.name'), t('sheet.perRound', { currency }), t('sheet.howOften'), t('sheet.members'), t('sheet.myTurn'), t('sheet.myTurnDate'),
      t('sheet.pot', { currency }), t('sheet.roundsPaid'), t('sheet.potReceived')],
    ...list.map(s => {
      const st = samityStatus(s);
      return [s.name, round2(s.amount), how(s), s.members, s.myTurn, day(st.myTurnDate), payoutAmount(s), st.paidCount, yesNo(t, !!s.payout)];
    }),
  ];
  const rounds: Cell[][] = [
    [t('sheet.samity'), t('sheet.round'), t('sheet.date'), t('sheet.paid'), t('sheet.yourTurn')],
    ...list.flatMap(s => samityStatus(s).rounds.map(r => [s.name, r.n, day(r.date), yesNo(t, r.paid), r.mine ? t('sheet.yes') : ''])),
  ];
  return [
    { title: tabTitle(t('sheet.kind.samities')), rows: summary },
    { title: tabTitle(t('sheet.tabRounds')), rows: rounds },
  ];
}

// Plain rules for linked Google apps: backup timing and the tables sent to Google Sheets.
// No network calls here, so everything can be tested.
import { format, startOfMonth } from 'date-fns';
import { DriveBackupSettings, Expense } from '../../shared/types';
import type { TKey } from '../../shared/i18n';
import { sumByCategory } from '../home/insights';
import type { BackupData } from '../profile/backup';

export type GoogleApp = 'drive' | 'sheets';
export const GOOGLE_APPS: GoogleApp[] = ['drive', 'sheets'];

// ---------------------------------------------------------------------------
// Drive backups
// ---------------------------------------------------------------------------

/** How many backups stay in Drive. The oldest go once there are more. */
export const KEEP_BACKUPS = 10;
export const MAX_EVERY = { hours: 72, days: 30 } as const;
export const DEFAULT_BACKUP: Required<Omit<DriveBackupSettings, 'lastAt'>> = { auto: true, every: 1, unit: 'days' };

const HOUR = 60 * 60 * 1000;

/** The settings with anything missing or out of range set to something sensible */
export function backupSettings(s: DriveBackupSettings | undefined) {
  const unit = s?.unit === 'hours' ? 'hours' : 'days';
  const raw = Math.round(Number(s?.every));
  const every = Number.isFinite(raw) && raw >= 1 ? Math.min(raw, MAX_EVERY[unit]) : DEFAULT_BACKUP.every;
  return { auto: s?.auto ?? DEFAULT_BACKUP.auto, every, unit, lastAt: s?.lastAt } as const;
}

export const intervalMs = (every: number, unit: 'hours' | 'days') => every * (unit === 'hours' ? HOUR : 24 * HOUR);

/** Whether an automatic backup should run now */
export function backupDue(s: DriveBackupSettings | undefined, now: Date): boolean {
  const { auto, every, unit, lastAt } = backupSettings(s);
  if (!auto) return false;
  if (!lastAt) return true;
  const last = new Date(lastAt).getTime();
  return !Number.isFinite(last) || now.getTime() - last >= intervalMs(every, unit);
}

/** The backups to delete so only the newest KEEP_BACKUPS are left */
export function oldBackups<T extends { createdTime: string }>(files: T[], keep = KEEP_BACKUPS): T[] {
  return [...files].sort((a, b) => b.createdTime.localeCompare(a.createdTime)).slice(keep);
}

export const backupFileName = (now: Date, locked: boolean) =>
  `xpencex-backup-${format(now, 'yyyy-MM-dd-HHmm')}${locked ? '-locked' : ''}.json`;

// ---------------------------------------------------------------------------
// Google Sheets tables
// ---------------------------------------------------------------------------

export type Cell = string | number | boolean;
export interface SheetTab { title: string; rows: Cell[][] }

type T = (key: TKey, vars?: Record<string, string | number>) => string;
type CategoryName = (cat: string) => string;

const day = (iso: string) => {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? format(d, 'yyyy-MM-dd') : '';
};
const round2 = (n: number) => Math.round(n * 100) / 100;

/** A tab name Google accepts: no []*?:/\ and at most 100 characters */
export const tabTitle = (s: string) => s.replace(/[[\]*?:/\\]/g, ' ').trim().slice(0, 100) || 'Sheet';

/** One row per expense, newest first, the way the Expenses screen lists them */
export function expenseRows(expenses: Expense[], currency: string, t: T, categoryName: CategoryName): Cell[][] {
  const header = [t('sheet.date'), t('sheet.title'), t('sheet.category'), t('sheet.amount', { currency }), t('sheet.paidFrom'), t('sheet.notes'), t('sheet.feeling')];
  const rows = [...expenses]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map(e => [
      day(e.date), e.title, categoryName(e.category), round2(e.amount), e.accountName || '', e.notes || '',
      e.feeling === 'worth' ? t('sheet.worth') : e.feeling === 'regret' ? t('sheet.regret') : '',
    ]);
  return [header, ...rows];
}

/** The Reports export: a summary, totals by category and by month, then every expense */
export function reportTabs(expenses: Expense[], currency: string, t: T, categoryName: CategoryName, budget?: number): SheetTab[] {
  const total = round2(expenses.reduce((s, e) => s + e.amount, 0));
  const dates = expenses.map(e => e.date).sort();

  const summary: Cell[][] = [
    [t('sheet.item'), t('sheet.value')],
    [t('sheet.totalSpent', { currency }), total],
    [t('sheet.count'), expenses.length],
    [t('sheet.average', { currency }), expenses.length ? round2(total / expenses.length) : 0],
    ...(budget ? [[t('sheet.monthlyBudget', { currency }), budget] as Cell[]] : []),
    [t('sheet.from'), dates.length ? day(dates[0]) : ''],
    [t('sheet.to'), dates.length ? day(dates[dates.length - 1]) : ''],
    [t('sheet.madeOn'), format(new Date(), 'yyyy-MM-dd HH:mm')],
  ];

  const byCat = Object.entries(sumByCategory(expenses)).sort((a, b) => b[1] - a[1]);
  const categories: Cell[][] = [
    [t('sheet.category'), t('sheet.amount', { currency }), t('sheet.share')],
    ...byCat.map(([cat, amount]) => [categoryName(cat), round2(amount), total ? `${Math.round((amount / total) * 100)}%` : '0%']),
  ];

  const months = new Map<string, number>();
  expenses.forEach(e => {
    const key = format(startOfMonth(new Date(e.date)), 'yyyy-MM');
    months.set(key, (months.get(key) || 0) + e.amount);
  });
  const monthly: Cell[][] = [
    [t('sheet.month'), t('sheet.amount', { currency })],
    ...[...months.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([m, amount]) => [m, round2(amount)]),
  ];

  return [
    { title: tabTitle(t('sheet.tabSummary')), rows: summary },
    { title: tabTitle(t('sheet.tabCategories')), rows: categories },
    { title: tabTitle(t('sheet.tabMonths')), rows: monthly },
    { title: tabTitle(t('sheet.tabExpenses')), rows: expenseRows(expenses, currency, t, categoryName) },
  ];
}

// "Export everything": one tab per kind of record. Chats are left out: they are conversations, not money.
export const EVERYTHING = ['expenses', 'accounts', 'balanceHistory', 'deposits', 'recurring', 'loans', 'debts', 'funds', 'samities', 'categories'] as const;
type Everything = (typeof EVERYTHING)[number];

// Inside details people don't need in a spreadsheet
const SKIP = new Set(['id', 'uid', 'accountId', 'debtId', 'fundId', 'samityId', 'smsRef', 'icon']);

/** "accountName" -> "Account name" */
export const humanize = (key: string) => {
  const words = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/** A value as one spreadsheet cell: numbers stay numbers, dates become yyyy-MM-dd, lists and groups become text */
export function cellOf(v: unknown): Cell {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  if (typeof v === 'string') return ISO.test(v) ? day(v) : v;
  if (Array.isArray(v)) return v.map(x => (typeof x === 'object' && x !== null ? inline(x) : String(cellOf(x)))).join('; ');
  if (typeof v === 'object') return inline(v as Record<string, unknown>);
  return String(v);
}
const inline = (o: Record<string, unknown>) =>
  Object.entries(o).filter(([k]) => !SKIP.has(k)).map(([k, x]) => `${humanize(k)}: ${cellOf(x)}`).join(', ');

/** A table from any list of records: one column per field anyone has */
export function recordRows(items: Record<string, unknown>[]): Cell[][] {
  const found: string[] = [];
  items.forEach(item => Object.keys(item).forEach(k => { if (!SKIP.has(k) && !found.includes(k)) found.push(k); }));
  // Date, name and title first, so each row is easy to recognise
  const first = ['date', 'name', 'title'].filter(k => found.includes(k));
  const keys = [...first, ...found.filter(k => !first.includes(k))];
  return [keys.map(humanize), ...items.map(item => keys.map(k => cellOf(item[k])))];
}

export function everythingTabs(data: Partial<BackupData['data']>, currency: string, t: T, categoryName: CategoryName): SheetTab[] {
  const tabs: SheetTab[] = [];
  for (const kind of EVERYTHING) {
    const items = (data[kind as Everything] || []) as Record<string, unknown>[];
    if (items.length === 0) continue;
    const rows = kind === 'expenses'
      ? expenseRows(items as unknown as Expense[], currency, t, categoryName)
      : recordRows(items);
    tabs.push({ title: tabTitle(t(`sheet.kind.${kind}` as TKey)), rows });
  }
  return tabs;
}

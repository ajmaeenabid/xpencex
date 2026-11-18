// Importing expenses and income from a CSV or Excel file (chosen 2026-11-18). The file is read on the phone and never
// sent anywhere. Entries are history only: they have no account, so no balance changes now or when they are edited later.
// Plain rules, no database calls, so they can be tested (reading and saving are in importService.ts).

import { format } from 'date-fns';
import { containsSecret } from '../../shared/lib/sensitiveData';
import { maskSensitive } from '../../shared/lib/smsParser';
import { CategoryRule, ruleCategoryFor } from '../categoryRules/categoryRules';

export const MAX_IMPORT_ROWS = 1000;
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

export type Cell = string | number | boolean | Date | null | undefined;
export type ColumnKey = 'date' | 'title' | 'amount' | 'debit' | 'credit' | 'type' | 'category' | 'notes';
export type Columns = Partial<Record<ColumnKey, number>>;
export type DateOrder = 'dmy' | 'mdy';
export type AmountMeaning = 'signed' | 'expense' | 'income'; // signed: below zero is money out, above zero is money in
export type EntryKind = 'expense' | 'income';

export interface ImportEntry {
  row: number; // its line in the file, counting from 1
  kind: EntryKind;
  title: string;
  amount: number;
  category: string;
  date: string; // ISO, midday
  notes: string;
  duplicate: boolean;
}

export interface ImportProblems { date: number; amount: number; secret: number }

const round2 = (n: number) => Math.round(n * 100) / 100;
const BANGLA_DIGITS = '০১২৩৪৫৬৭৮৯';
const latinDigits = (text: string) => text.replace(/[০-৯]/g, d => String(BANGLA_DIGITS.indexOf(d)));

export function cellText(cell: Cell): string {
  if (cell === null || cell === undefined) return '';
  return cell instanceof Date ? cell.toISOString().slice(0, 10) : String(cell).trim();
}

/** Splits CSV text into rows. Handles quotes, and commas, semicolons or tabs between the columns. */
export function parseCsv(raw: string): string[][] {
  const text = raw.replace(/^﻿/, '');
  const firstLines = text.split(/\r?\n/).slice(0, 5).join('\n').replace(/"[^"]*"/g, '');
  const count = (c: string) => firstLines.split(c).length - 1;
  const delimiter = [',', ';', '\t'].reduce((best, c) => (count(c) > count(best) ? c : best), ',');

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const endCell = () => { row.push(cell.trim()); cell = ''; };
  const endRow = () => { endCell(); if (row.some(Boolean)) rows.push(row); row = []; };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === delimiter) endCell();
    else if (c === '\n') endRow();
    else if (c !== '\r') cell += c;
  }
  endRow();
  return rows;
}

// Looked for in this order, so "Debit amount" is a debit column and not the amount
const HEADER_WORDS: [ColumnKey, RegExp][] = [
  ['date', /\bdate\b|তারিখ/i],
  ['debit', /\bdebit\b|withdrawal|\bdr\b|money out|paid out|উত্তোলন/i],
  ['credit', /\bcredit\b|\bdeposit|\bcr\b|money in|paid in|জমা/i],
  ['category', /categor|ক্যাটাগরি/i],
  ['type', /^type$|transaction type|^kind$|ধরন/i],
  ['notes', /^notes?$|\bmemo\b|\bcomments?\b|নোট/i],
  ['amount', /\bamount\b|\btotal\b|টাকা|পরিমাণ/i],
  ['title', /descri|narration|particular|\bdetails?\b|\btitle\b|merchant|remarks?|\bitem\b|\bname\b|payee|বিবরণ|শিরোনাম/i],
];

/** Which column is which, from the words in a header row */
export function guessColumns(header: Cell[]): Columns {
  const columns: Columns = {};
  header.forEach((cell, index) => {
    const text = cellText(cell);
    if (!text || /balance|ব্যালেন্স/i.test(text)) return;
    const match = HEADER_WORDS.find(([key, words]) => columns[key] === undefined && words.test(text));
    if (match) columns[match[0]] = index;
  });
  return columns;
}

/** Bank statements often start with a few lines about the account, so the header may not be the first row */
export function findHeaderRow(rows: Cell[][]): number {
  const index = rows.slice(0, 15).findIndex(row => {
    const c = guessColumns(row);
    return c.date !== undefined && (c.amount !== undefined || c.debit !== undefined || c.credit !== undefined);
  });
  return Math.max(index, 0);
}

/** An amount as a number, below zero for money out written as -500, (500) or 500 Dr. Null when there is none. */
export function parseAmount(cell: Cell): number | null {
  if (typeof cell === 'number') return Number.isFinite(cell) ? round2(cell) : null;
  let text = latinDigits(cellText(cell));
  if (!/\d/.test(text)) return null;
  const negative = /^\s*-|-\s*$|^\s*\(.*\)\s*$|\bdr\.?\s*$/i.test(text);
  text = text.replace(/[^\d.,]/g, '');
  // 1.234,56 writes the decimals after a comma; everywhere else commas only group the digits
  if (/,\d{1,2}$/.test(text) && text.includes('.')) text = text.replace(/\./g, '').replace(',', '.');
  else text = text.replace(/,/g, '');
  const value = parseFloat(text);
  return Number.isFinite(value) ? round2(negative ? -value : value) : null;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const monthNumber = (name: string) => MONTHS.indexOf(name.slice(0, 3).toLowerCase()) + 1;

function middayIso(year: number, month: number, day: number): string | null {
  const y = year < 100 ? 2000 + year : year;
  const d = new Date(y, month - 1, day, 12);
  return d.getFullYear() === y && d.getMonth() === month - 1 && d.getDate() === day ? d.toISOString() : null;
}

/** A date as ISO at midday, or null */
export function parseDate(cell: Cell, order: DateOrder = 'dmy'): string | null {
  // Excel dates arrive as moments at midnight UTC
  if (cell instanceof Date) return Number.isNaN(cell.getTime()) ? null : middayIso(cell.getUTCFullYear(), cell.getUTCMonth() + 1, cell.getUTCDate());
  if (typeof cell === 'number') {
    if (cell < 20000 || cell > 80000) return null; // Excel counts days from the end of 1899
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(cell) * 86_400_000);
    return middayIso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  const text = latinDigits(cellText(cell));
  let m = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return middayIso(+m[1], +m[2], +m[3]);
  m = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) return order === 'dmy' ? middayIso(+m[3], +m[2], +m[1]) : middayIso(+m[3], +m[1], +m[2]);
  m = text.match(/^(\d{1,2})[\s-]+([a-z]{3,9})[\s,-]+(\d{2,4})/i);
  if (m && monthNumber(m[2])) return middayIso(+m[3], monthNumber(m[2]), +m[1]);
  m = text.match(/^([a-z]{3,9})\s+(\d{1,2}),?\s+(\d{2,4})/i);
  if (m && monthNumber(m[1])) return middayIso(+m[3], monthNumber(m[1]), +m[2]);
  return null;
}

/** Day first unless the file can only be month first (Bangladesh writes the day first) */
export function detectDateOrder(rows: Cell[][], column: number | undefined): DateOrder {
  if (column === undefined) return 'dmy';
  let monthFirst = false;
  for (const row of rows) {
    const m = latinDigits(cellText(row[column])).match(/^(\d{1,2})[-/.](\d{1,2})[-/.]\d{2,4}/);
    if (m && +m[1] > 12) return 'dmy';
    if (m && +m[2] > 12) monthFirst = true;
  }
  return monthFirst ? 'mdy' : 'dmy';
}

/** With money shown below zero, the amount says the direction; otherwise it is all spending until told otherwise */
export function detectMeaning(rows: Cell[][], column: number | undefined): AmountMeaning {
  if (column === undefined) return 'expense';
  return rows.some(row => (parseAmount(row[column]) ?? 0) < 0) ? 'signed' : 'expense';
}

function kindFromType(cell: Cell): EntryKind | null {
  const text = cellText(cell).toLowerCase();
  if (/debit|\bdr\b|expense|withdraw|spent|\bout\b|খরচ/.test(text)) return 'expense';
  if (/credit|\bcr\b|income|deposit|receiv|\bin\b|আয়|জমা/.test(text)) return 'income';
  return null;
}

/** The direction and size of one row's money, or null when it has none */
function moneyIn(row: Cell[], columns: Columns, meaning: AmountMeaning): { kind: EntryKind; amount: number } | null {
  const read = (key: ColumnKey) => (columns[key] === undefined ? null : parseAmount(row[columns[key]!]));
  const debit = Math.abs(read('debit') ?? 0);
  if (debit > 0) return { kind: 'expense', amount: debit };
  const credit = Math.abs(read('credit') ?? 0);
  if (credit > 0) return { kind: 'income', amount: credit };
  const amount = read('amount');
  if (!amount) return null;
  const typed = columns.type === undefined ? null : kindFromType(row[columns.type]);
  const kind = typed ?? (meaning === 'signed' ? (amount < 0 ? 'expense' : 'income') : meaning);
  return { kind, amount: Math.abs(amount) };
}

const sameName = (list: readonly string[], name: string) => list.find(c => c.toLowerCase() === name.trim().toLowerCase());

/** Turns the file's rows into entries. `firstRow` is the line number of the first row, counting from 1. */
export function buildEntries(rows: Cell[][], { columns, order, meaning, categories, incomeCategories, rules = [], fallbackTitle, firstRow = 2 }: {
  columns: Columns;
  order: DateOrder;
  meaning: AmountMeaning;
  categories: string[];
  incomeCategories: readonly string[];
  rules?: CategoryRule[];
  fallbackTitle: string;
  firstRow?: number;
}): { entries: ImportEntry[]; problems: ImportProblems } {
  const entries: ImportEntry[] = [];
  const problems: ImportProblems = { date: 0, amount: 0, secret: 0 };
  const text = (row: Cell[], key: ColumnKey) => (columns[key] === undefined ? '' : cellText(row[columns[key]!]));

  rows.forEach((row, i) => {
    if (!row.some(c => cellText(c))) return;
    const rawTitle = text(row, 'title');
    const rawNotes = text(row, 'notes');
    if (containsSecret(rawTitle) || containsSecret(rawNotes)) { problems.secret++; return; }
    const date = columns.date === undefined ? null : parseDate(row[columns.date], order);
    if (!date) { problems.date++; return; }
    const money = moneyIn(row, columns, meaning);
    if (!money) { problems.amount++; return; }

    const title = maskSensitive(rawTitle.replace(/\s+/g, ' ')).slice(0, 100) || fallbackTitle;
    const named = text(row, 'category');
    const category = money.kind === 'income'
      ? sameName(incomeCategories, named) || 'Other'
      : sameName(categories, named) || ruleCategoryFor(rawTitle, rules, categories) || 'Other';
    entries.push({
      row: firstRow + i, kind: money.kind, title, amount: money.amount, category, date,
      notes: maskSensitive(rawNotes).slice(0, 500), duplicate: false,
    });
  });
  return { entries, problems };
}

const entryKey = (e: { kind: EntryKind; date: string; amount: number; title?: string }) =>
  `${e.kind}|${format(new Date(e.date), 'yyyy-MM-dd')}|${round2(e.amount)}|${(e.title || '').trim().toLowerCase()}`;

/** Marks rows that match an entry already saved. Each saved entry matches one row, so a real second payment stays. */
export function markDuplicates(entries: ImportEntry[], existing: { kind: EntryKind; date: string; amount: number; title?: string }[]): ImportEntry[] {
  const left = new Map<string, number>();
  for (const e of existing) left.set(entryKey(e), (left.get(entryKey(e)) || 0) + 1);
  return entries.map(entry => {
    const key = entryKey(entry);
    const count = left.get(key) || 0;
    if (count > 0) left.set(key, count - 1);
    return { ...entry, duplicate: count > 0 };
  });
}

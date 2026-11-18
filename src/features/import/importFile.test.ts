import { describe, it, expect } from 'vitest';
import {
  Cell, ImportEntry, buildEntries, detectDateOrder, detectMeaning, findHeaderRow, guessColumns, markDuplicates, parseAmount, parseCsv, parseDate,
} from './importFile';

const day = (iso: string | null) => { const d = new Date(iso!); return [d.getFullYear(), d.getMonth() + 1, d.getDate()]; };

describe('reading CSV', () => {
  it('handles quotes, commas inside quotes and line breaks', () => {
    expect(parseCsv('Date,Title\r\n2026-11-01,"Lunch, ""big"""\n')).toEqual([['Date', 'Title'], ['2026-11-01', 'Lunch, "big"']]);
  });

  it('finds semicolons and tabs, and ignores the byte-order mark and blank lines', () => {
    expect(parseCsv('﻿a;b\n\n1;2')).toEqual([['a', 'b'], ['1', '2']]);
    expect(parseCsv('a\tb\n1\t2')).toEqual([['a', 'b'], ['1', '2']]);
  });
});

describe('finding the columns', () => {
  it('reads the app\'s own export', () => {
    expect(guessColumns(['Date', 'Title', 'Category', 'Amount (BDT)', 'Paid From', 'Notes']))
      .toEqual({ date: 0, title: 1, category: 2, amount: 3, notes: 5 });
  });

  it('reads a bank statement and leaves the balance out', () => {
    expect(guessColumns(['Txn Date', 'Narration', 'Debit Amount', 'Credit Amount', 'Running Balance']))
      .toEqual({ date: 0, title: 1, debit: 2, credit: 3 });
  });

  it('reads Bangla headers', () => {
    expect(guessColumns(['তারিখ', 'বিবরণ', 'পরিমাণ'])).toEqual({ date: 0, title: 1, amount: 2 });
  });

  it('skips the lines above the header', () => {
    const rows: Cell[][] = [['Account statement'], ['Name', 'Rahim'], ['Date', 'Details', 'Amount'], ['2026-11-01', 'Bus', 50]];
    expect(findHeaderRow(rows)).toBe(2);
  });
});

describe('reading amounts', () => {
  it.each([
    [500, 500], ['1,250.50', 1250.5], ['৳1,00,000', 100000], ['Tk 75', 75], ['৫০০', 500],
    ['-300', -300], ['(300)', -300], ['300 Dr', -300], ['300-', -300], ['1.234,56', 1234.56],
  ])('%s', (cell, expected) => expect(parseAmount(cell as Cell)).toBe(expected));

  it('has nothing to read in empty cells or words', () => {
    expect(parseAmount('')).toBeNull();
    expect(parseAmount(null)).toBeNull();
    expect(parseAmount('Total')).toBeNull();
  });
});

describe('reading dates', () => {
  it('reads the common ways of writing a date', () => {
    expect(day(parseDate('2026-11-05'))).toEqual([2026, 11, 5]);
    expect(day(parseDate('05/11/2026'))).toEqual([2026, 11, 5]);
    expect(day(parseDate('05-11-26'))).toEqual([2026, 11, 5]);
    expect(day(parseDate('5 Nov 2026'))).toEqual([2026, 11, 5]);
    expect(day(parseDate('05-Nov-2026'))).toEqual([2026, 11, 5]);
    expect(day(parseDate('November 5, 2026'))).toEqual([2026, 11, 5]);
    expect(day(parseDate('০৫/১১/২০২৬'))).toEqual([2026, 11, 5]);
  });

  it('follows the chosen order', () => {
    expect(day(parseDate('05/11/2026', 'mdy'))).toEqual([2026, 5, 11]);
  });

  it('reads Excel dates on the right day', () => {
    expect(day(parseDate(new Date(Date.UTC(2026, 10, 5))))).toEqual([2026, 11, 5]);
    expect(day(parseDate(46331))).toEqual([2026, 11, 5]);
  });

  it('refuses what is not a real date', () => {
    expect(parseDate('31/02/2026')).toBeNull();
    expect(parseDate('Total')).toBeNull();
    expect(parseDate(500)).toBeNull();
  });

  it('works out the order from the file', () => {
    expect(detectDateOrder([['25/11/2026']], 0)).toBe('dmy');
    expect(detectDateOrder([['11/25/2026']], 0)).toBe('mdy');
    expect(detectDateOrder([['05/06/2026']], 0)).toBe('dmy');
  });
});

describe('building entries', () => {
  const options = {
    order: 'dmy' as const, meaning: 'expense' as const, categories: ['Food', 'Other'], incomeCategories: ['Salary', 'Other'], fallbackTitle: 'Imported',
  };

  it('uses debit and credit columns', () => {
    const { entries } = buildEntries([['01/11/2026', 'Shop', '500', ''], ['02/11/2026', 'Pay', '', '9000']], { ...options, columns: { date: 0, title: 1, debit: 2, credit: 3 } });
    expect(entries.map(e => [e.kind, e.amount])).toEqual([['expense', 500], ['income', 9000]]);
  });

  it('uses the sign of one amount column', () => {
    const { entries } = buildEntries([['01/11/2026', 'Shop', -500], ['02/11/2026', 'Pay', 9000]], { ...options, meaning: 'signed', columns: { date: 0, title: 1, amount: 2 } });
    expect(entries.map(e => [e.kind, e.amount])).toEqual([['expense', 500], ['income', 9000]]);
    expect(detectMeaning([[-5], [3]], 0)).toBe('signed');
    expect(detectMeaning([[5], [3]], 0)).toBe('expense');
  });

  it('lets a type column decide', () => {
    const { entries } = buildEntries([['01/11/2026', 'Pay', 100, 'Credit'], ['01/11/2026', 'Shop', 50, 'DR']], { ...options, columns: { date: 0, title: 1, amount: 2, type: 3 } });
    expect(entries.map(e => e.kind)).toEqual(['income', 'expense']);
  });

  it('matches categories, and uses a category rule when the file has none', () => {
    const rules = [{ id: 'r', uid: 'u', words: 'shwapno', category: 'Food', createdAt: '2026-11-01' }];
    const { entries } = buildEntries([['01/11/2026', 'x', 5, 'food'], ['01/11/2026', 'Shwapno Mirpur', 5, ''], ['01/11/2026', 'y', 5, 'Pets']], { ...options, rules, columns: { date: 0, title: 1, amount: 2, category: 3 } });
    expect(entries.map(e => e.category)).toEqual(['Food', 'Food', 'Other']);
  });

  it('counts the rows it can\'t use, and blocks secret codes', () => {
    const rows: Cell[][] = [['bad date', 'x', 5], ['01/11/2026', 'x', ''], ['01/11/2026', 'OTP 482913', 5], ['', '', ''], ['01/11/2026', '', 5]];
    const { entries, problems } = buildEntries(rows, { ...options, columns: { date: 0, title: 1, amount: 2 } });
    expect(problems).toEqual({ date: 1, amount: 1, secret: 1 });
    expect(entries.map(e => [e.title, e.row])).toEqual([['Imported', 6]]);
  });
});

describe('finding duplicates', () => {
  const entry = (row: number, title = 'Lunch'): ImportEntry => ({
    row, kind: 'expense', title, amount: 100, category: 'Food', date: new Date(2026, 10, 1, 12).toISOString(), notes: '', duplicate: false,
  });
  const saved = { kind: 'expense' as const, date: new Date(2026, 10, 1, 20).toISOString(), amount: 100, title: 'LUNCH ' };

  it('marks a row that is already saved, whatever the time or capitals', () => {
    expect(markDuplicates([entry(2)], [saved])[0].duplicate).toBe(true);
  });

  it('keeps a real second payment on the same day', () => {
    expect(markDuplicates([entry(2), entry(3)], [saved]).map(e => e.duplicate)).toEqual([true, false]);
  });

  it('leaves different entries alone', () => {
    expect(markDuplicates([entry(2, 'Dinner')], [saved])[0].duplicate).toBe(false);
    expect(markDuplicates([entry(2)], [{ ...saved, kind: 'income' }])[0].duplicate).toBe(false);
  });
});

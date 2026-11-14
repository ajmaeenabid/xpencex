import { describe, it, expect } from 'vitest';
import { receiptPickProblem, receiptProblemKey, takeFirstReceiptNote } from './receiptFile';

const MB = 1024 * 1024;

describe('receiptPickProblem', () => {
  it('takes photos of any size, because they are shrunk', () => {
    expect(receiptPickProblem('bill.jpg', 'image/jpeg', 8 * MB)).toBeNull();
    expect(receiptPickProblem('bill.PNG', '', 100)).toBeNull();
    expect(receiptPickProblem('photo', 'image/webp', 100)).toBeNull(); // camera photo with no extension
  });

  it('takes a PDF only up to 1 MB', () => {
    expect(receiptPickProblem('bill.pdf', 'application/pdf', MB)).toBeNull();
    expect(receiptPickProblem('bill.pdf', 'application/pdf', MB + 1)).toBe('size');
  });

  it('refuses spreadsheets and other files', () => {
    expect(receiptPickProblem('list.csv', 'text/csv', 10)).toBe('type');
    expect(receiptPickProblem('list.xlsx', '', 10)).toBe('type');
    expect(receiptPickProblem('song.mp3', 'audio/mpeg', 10)).toBe('type');
  });
});

describe('receiptProblemKey', () => {
  it('turns server codes into friendly notes', () => {
    expect(receiptProblemKey('too-big')).toBe('receipt.problem.size');
    expect(receiptProblemKey('wrong-type')).toBe('receipt.problem.type');
    expect(receiptProblemKey('full')).toBe('receipt.full');
    expect(receiptProblemKey(undefined)).toBe('receipt.problem.save');
  });
});

describe('takeFirstReceiptNote', () => {
  const memory = () => {
    const data: Record<string, string> = {};
    return { getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => { data[k] = v; } };
  };

  it('shows the note once per person', () => {
    const store = memory();
    expect(takeFirstReceiptNote('u1', store)).toBe(true);
    expect(takeFirstReceiptNote('u1', store)).toBe(false);
    expect(takeFirstReceiptNote('u2', store)).toBe(true);
  });

  it('stays quiet when storage is blocked', () => {
    const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => {} };
    expect(takeFirstReceiptNote('u1', broken)).toBe(false);
    expect(takeFirstReceiptNote('u1', null)).toBe(false);
  });
});

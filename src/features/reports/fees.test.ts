import { describe, it, expect } from 'vitest';
import { feeOf, feeProvider, feeSummary } from './fees';
import { parseWalletSms } from '../../shared/lib/smsParser';

const now = new Date(2026, 10, 20); // 20 Nov 2026
const e = (title: string, date: string, fee?: number, notes = '') => ({ title, date, fee, notes });

describe('fees', () => {
  it('uses the fee saved on the expense', () => {
    expect(feeOf({ fee: 18.5, notes: '' })).toBe(18.5);
  });

  it('reads older expenses from the notes the SMS reader wrote', () => {
    expect(feeOf({ notes: 'TrxID 9ABC123XY · Fee ৳5' })).toBe(5);
    expect(feeOf({ notes: 'TrxID 1 · Fee ৳12.75' })).toBe(12.75);
    expect(feeOf({ notes: 'bought rice' })).toBe(0);
    expect(feeOf({})).toBe(0);
  });

  it('knows the service from the title', () => {
    expect(feeProvider({ title: 'bKash Cash Out' })).toBe('bkash');
    expect(feeProvider({ title: 'Nagad Send Money to Rahim' })).toBe('nagad');
    expect(feeProvider({ title: 'Rocket Payment' })).toBe('rocket');
    expect(feeProvider({ title: 'Bank card purchase' })).toBe('bank');
  });

  it('adds up this month by service, and the last 6 months', () => {
    const s = feeSummary([
      e('bKash Cash Out', '2026-11-03T10:00:00.000Z', 18.5),
      e('bKash Send Money', '2026-11-10T10:00:00.000Z', 5),
      e('Nagad Cash Out', '2026-11-11T10:00:00.000Z', undefined, 'Fee ৳12.5'),
      e('bKash Cash Out', '2026-10-01T10:00:00.000Z', 20),
      e('bKash Cash Out', '2026-04-01T10:00:00.000Z', 99), // older than 6 months
      e('Lunch', '2026-11-12T10:00:00.000Z'),
    ], now);
    expect(s.thisMonth).toBe(36);
    expect(s.byProvider).toEqual({ bkash: 23.5, nagad: 12.5, rocket: 0, bank: 0 });
    expect(s.months.map(m => m.month)).toEqual(['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11']);
    expect(s.months.map(m => m.total)).toEqual([0, 0, 0, 0, 20, 36]);
  });

  it('gets the fee from a real SMS onto the expense', () => {
    const r = parseWalletSms('Cash Out Tk 2,000.00 to Agent 01712345678 successful. Fee Tk 37.00. Balance Tk 3,000.00. TrxID 9ABC123XY at 23/10/2026 14:30', ['Other']);
    expect(r?.kind).toBe('expense');
    if (r?.kind === 'expense') {
      expect(r.expense.fee).toBe(37);
      expect(r.expense.amount).toBe(2037);
    }
  });
});

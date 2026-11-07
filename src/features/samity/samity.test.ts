import { describe, it, expect } from 'vitest';
import { Samity, payoutAmount, roundDate, samityStatus } from './samity';

const samity = (extra: Partial<Samity> = {}): Samity => ({
  id: 's1', uid: 'u', name: 'Office samity', amount: 5000, frequency: 'monthly', members: 10,
  startDate: new Date(2026, 6, 5, 12).toISOString(), myTurn: 7, payments: {}, createdAt: '2026-07-01T00:00:00.000Z', ...extra,
});

describe('samity', () => {
  it('works out each round date, monthly or weekly', () => {
    expect(roundDate(samity(), 1).getMonth()).toBe(6); // July
    expect(roundDate(samity(), 7).getMonth()).toBe(0); // January next year
    expect(roundDate(samity({ frequency: 'weekly' }), 3).getDate()).toBe(19);
  });

  it('pays out every member\'s share on your turn', () => {
    expect(payoutAmount(samity())).toBe(50000);
  });

  it('shows what is paid, what is next and what is overdue', () => {
    const s = samityStatus(samity({ payments: { 1: 'acc', 2: '' } }), new Date(2026, 9, 10)); // 10 Oct: rounds 1-4 have come
    expect(s.paidCount).toBe(2);
    expect(s.nextUnpaid?.n).toBe(3);
    expect(s.overdue).toBe(2); // rounds 3 (5 Sep) and 4 (5 Oct)
    expect(s.rounds.find(r => r.mine)?.n).toBe(7);
    expect(s.finished).toBe(false);
  });

  it('is finished once every round is paid and the payout received', () => {
    const payments = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [String(i + 1), '']));
    expect(samityStatus(samity({ payments }), new Date(2027, 6, 1)).finished).toBe(false);
    expect(samityStatus(samity({ payments, payout: { at: '2027-01-05T00:00:00.000Z', accountId: '' } }), new Date(2027, 6, 1)).finished).toBe(true);
  });
});

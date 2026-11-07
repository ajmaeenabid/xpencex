import { describe, it, expect } from 'vitest';
import { isCashOut, shouldAskCashCount, unrecordedSpending } from './cash';

const now = new Date('2026-11-20T12:00:00.000Z');
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();

describe('cash wallet', () => {
  it('knows a Cash Out or ATM withdrawal', () => {
    expect(isCashOut('bKash Cash Out')).toBe(true);
    expect(isCashOut('Nagad Cashout')).toBe(true);
    expect(isCashOut('ATM cash withdrawal')).toBe(true);
    expect(isCashOut('bKash Send Money to Rahim')).toBe(false);
    expect(isCashOut('Card purchase at Shwapno')).toBe(false);
  });

  it('asks once a week when cash has gone quiet for 3 days', () => {
    const wallet = { balance: 2000, createdAt: daysAgo(30) };
    expect(shouldAskCashCount({ wallet, lastCashSpendAt: daysAgo(4), now })).toBe(true);
    expect(shouldAskCashCount({ wallet, lastCashSpendAt: daysAgo(2), now })).toBe(false);
    expect(shouldAskCashCount({ wallet: { ...wallet, countedAt: daysAgo(3) }, lastCashSpendAt: daysAgo(4), now })).toBe(false);
    expect(shouldAskCashCount({ wallet: { ...wallet, countedAt: daysAgo(8) }, lastCashSpendAt: daysAgo(4), now })).toBe(true);
  });

  it("doesn't ask about an empty or brand new wallet", () => {
    expect(shouldAskCashCount({ wallet: { balance: 0, createdAt: daysAgo(30) }, now })).toBe(false);
    expect(shouldAskCashCount({ wallet: { balance: 500, createdAt: daysAgo(1) }, now })).toBe(false);
    expect(shouldAskCashCount({ wallet: { balance: 500, createdAt: daysAgo(5) }, now })).toBe(true);
  });

  it('works out what was spent without being recorded', () => {
    expect(unrecordedSpending(2000, 1450)).toBe(550);
    expect(unrecordedSpending(2000, 2300)).toBe(0);
    expect(unrecordedSpending(100.1, 99.9)).toBe(0.2);
  });
});

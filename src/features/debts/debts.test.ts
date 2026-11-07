import { describe, it, expect } from 'vitest';
import { Debt, DebtKind, accountChange, debtTotals, people, personFromSms, settleEntry } from './debts';

let n = 0;
const d = (person: string, kind: DebtKind, amount: number, date = '2026-11-01T00:00:00.000Z'): Debt => ({
  id: String(++n), uid: 'u', person, kind, amount, date, createdAt: `2026-11-01T00:00:${String(n).padStart(2, '0')}.000Z`,
});

describe('lend and borrow', () => {
  it('works out who owes whom', () => {
    const list = people([
      d('rahim ', 'lent', 1000),
      d('Rahim', 'gotBack', 400),
      d('Karim', 'borrowed', 500),
      d('Karim', 'paidBack', 200),
      d('Mim', 'lent', 300),
      d('Mim', 'gotBack', 300),
    ]);
    expect(list.map(p => [p.name, p.net])).toEqual([['Rahim', 600], ['Karim', -300], ['Mim', 0]]);
  });

  it('adds up what you will get and what you owe', () => {
    expect(debtTotals([d('A', 'lent', 1000), d('B', 'lent', 250), d('C', 'borrowed', 800)])).toEqual({ toGet: 1250, toGive: 800 });
  });

  it('settles in the right direction', () => {
    expect(settleEntry(600)).toEqual({ kind: 'gotBack', amount: 600 });
    expect(settleEntry(-300)).toEqual({ kind: 'paidBack', amount: 300 });
    expect(settleEntry(0.004)).toBeNull();
  });

  it('moves account money the right way', () => {
    expect(accountChange('lent', 500)).toBe(-500);
    expect(accountChange('paidBack', 500)).toBe(-500);
    expect(accountChange('borrowed', 500)).toBe(500);
    expect(accountChange('gotBack', 500)).toBe(500);
  });

  it('shows the name from the latest entry', () => {
    const [p] = people([d('rahim', 'lent', 1, '2026-10-01T00:00:00.000Z'), d('Rahim', 'lent', 1, '2026-11-01T00:00:00.000Z')]);
    expect(p.name).toBe('Rahim');
  });

  it('reads the name from an SMS title', () => {
    expect(personFromSms('bKash Send Money to Rahim')).toBe('Rahim');
    expect(personFromSms('Nagad Send Money')).toBe('');
  });
});

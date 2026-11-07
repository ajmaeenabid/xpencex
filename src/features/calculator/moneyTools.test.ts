import { describe, it, expect } from 'vitest';
import { billTotal, discount, savingsGoal, splitBill } from './moneyTools';

const value = (result: ReturnType<typeof discount>, label: string) => result.rows.find(r => r.label === label)?.value;

describe('discount', () => {
  it('works out the final price and the saving', () => {
    const result = discount({ price: '1500', percent: '20' });
    expect(value(result, 'tool.finalPrice')).toBe(1200);
    expect(value(result, 'tool.youSave')).toBe(300);
    expect(result.save).toEqual({ amount: 1200 });
  });
  it('handles decimals, and no discount yet', () => {
    expect(value(discount({ price: '999.99', percent: '12.5' }), 'tool.finalPrice')).toBe(874.99);
    expect(value(discount({ price: '500', percent: '' }), 'tool.finalPrice')).toBe(500);
  });
  it('has nothing to save when empty, or free', () => {
    expect(discount({ price: '', percent: '' }).save).toBeUndefined();
    expect(discount({ price: '100', percent: '100' }).save).toBeUndefined();
  });
  it('refuses more than 100% off', () => {
    const result = discount({ price: '100', percent: '101' });
    expect(result.note?.kind).toBe('error');
    expect(result.save).toBeUndefined();
  });
});

describe('billTotal', () => {
  it('adds VAT and tip, each on the bill itself', () => {
    const result = billTotal({ amount: '1000', vat: '15', tip: '10' });
    expect(value(result, 'tool.vatAmount')).toBe(150);
    expect(value(result, 'tool.tipAmount')).toBe(100);
    expect(value(result, 'tool.total')).toBe(1250);
    expect(result.save).toEqual({ amount: 1250 });
  });
  it('works with only one of them', () => {
    expect(value(billTotal({ amount: '1000', vat: '5', tip: '' }), 'tool.total')).toBe(1050);
    expect(value(billTotal({ amount: '1000', vat: '', tip: '5' }), 'tool.total')).toBe(1050);
    expect(value(billTotal({ amount: '1000', vat: '', tip: '' }), 'tool.total')).toBe(1000);
  });
  it('refuses a rate above 100%', () => {
    expect(billTotal({ amount: '1000', vat: '150', tip: '' }).note?.kind).toBe('error');
    expect(billTotal({ amount: '1000', vat: '', tip: '150' }).save).toBeUndefined();
  });
});

describe('splitBill', () => {
  it('shares the bill, the same way Add Expense does', () => {
    const result = splitBill({ total: '2400', people: '4' });
    expect(value(result, 'tool.eachShare')).toBe(600);
    expect(result.save).toEqual({ amount: 2400, people: 4 });
    expect(value(splitBill({ total: '100', people: '3' }), 'tool.eachShare')).toBe(33.33);
  });
  it('needs at least 2 people to save a split', () => {
    expect(splitBill({ total: '100', people: '1' }).save).toBeUndefined();
    expect(splitBill({ total: '100', people: '' }).save).toBeUndefined();
    expect(value(splitBill({ total: '100', people: '0' }), 'tool.eachShare')).toBe(100);
  });
  it('stops at the 50 people Add Expense allows', () => {
    expect(splitBill({ total: '100', people: '50' }).save).toBeDefined();
    const over = splitBill({ total: '100', people: '51' });
    expect(over.note?.kind).toBe('error');
    expect(over.save).toBeUndefined();
  });
});

describe('savingsGoal', () => {
  it('works out what to save each month', () => {
    const result = savingsGoal({ goal: '50000', saved: '', months: '10' });
    expect(value(result, 'tool.perMonth')).toBe(5000);
    expect(value(result, 'tool.stillNeeded')).toBe(50000);
  });
  it('counts what is already saved', () => {
    const result = savingsGoal({ goal: '50000', saved: '20000', months: '6' });
    expect(value(result, 'tool.perMonth')).toBe(5000);
    expect(value(result, 'tool.stillNeeded')).toBe(30000);
  });
  it('rounds up, so the last month never falls short', () => {
    const perMonth = value(savingsGoal({ goal: '100', saved: '', months: '3' }), 'tool.perMonth') as number;
    expect(perMonth).toBe(33.34);
    expect(perMonth * 3).toBeGreaterThanOrEqual(100);
  });
  it('says so when the goal is already reached', () => {
    const result = savingsGoal({ goal: '500', saved: '700', months: '3' });
    expect(result.note?.kind).toBe('good');
    expect(value(result, 'tool.stillNeeded')).toBe(0);
  });
  it('shows nothing per month until there are months', () => {
    expect(value(savingsGoal({ goal: '500', saved: '', months: '' }), 'tool.perMonth')).toBe(0);
    expect(savingsGoal({ goal: '', saved: '', months: '' }).note).toBeUndefined();
  });
});

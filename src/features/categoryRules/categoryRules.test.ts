import { describe, it, expect } from 'vitest';
import { MAX_RULES, NO_CORRECTIONS, cleanWords, declineOffer, matchRule, recordCorrection, ruleCategoryFor, ruleProblem, ruleWordsFrom, titleHasWords } from './categoryRules';

const rule = (words: string, category: string, createdAt = '2026-11-01') => ({ id: words, uid: 'u', words, category, createdAt });

describe('matching a title', () => {
  it('ignores capitals and extra spaces', () => {
    expect(titleHasWords('SHWAPNO   Dhanmondi', 'shwapno')).toBe(true);
    expect(titleHasWords('Lunch at star  kabab', 'Star Kabab')).toBe(true);
  });

  it('matches whole words only', () => {
    expect(titleHasWords('Bus fare', 'bus')).toBe(true);
    expect(titleHasWords('Abus fare', 'bus')).toBe(false);
    expect(titleHasWords('Business lunch', 'bus')).toBe(false);
  });

  it('finds a later match when an earlier one is inside another word', () => {
    expect(titleHasWords('Abus and bus', 'bus')).toBe(true);
  });

  it('works with Bangla', () => {
    expect(titleHasWords('স্বপ্ন থেকে বাজার', 'স্বপ্ন')).toBe(true);
  });

  it('lets the longest wording win, then the newest', () => {
    const rules = [rule('star', 'Shopping'), rule('star kabab', 'Food')];
    expect(matchRule('Star Kabab Dhanmondi', rules)?.category).toBe('Food');
    const twins = [rule('uber', 'Travel', '2026-11-01'), rule('UBER', 'Transport', '2026-11-05')];
    expect(matchRule('Uber ride', twins)?.category).toBe('Transport');
  });

  it('skips a rule whose category was deleted, and uses the current spelling', () => {
    expect(ruleCategoryFor('Shwapno', [rule('shwapno', 'Groceries')], ['Food'])).toBeUndefined();
    expect(ruleCategoryFor('Shwapno', [rule('shwapno', 'food')], ['Food'])).toBe('Food');
    expect(ruleCategoryFor(undefined, [rule('shwapno', 'Food')], ['Food'])).toBeUndefined();
  });
});

describe('checking a rule', () => {
  it('needs real words', () => {
    expect(cleanWords('  Shwapno   Dhanmondi ')).toBe('Shwapno Dhanmondi');
    expect(cleanWords('a')).toBeUndefined();
    expect(ruleProblem('a', [])).toBe('words');
  });

  it('refuses secret codes', () => {
    expect(ruleProblem('OTP 482913', [])).toBe('secret');
  });

  it('refuses the same words twice, but allows editing a rule', () => {
    const rules = [rule('Shwapno', 'Food')];
    expect(ruleProblem('shwapno', rules)).toBe('same');
    expect(ruleProblem('shwapno', rules, 'Shwapno')).toBeNull();
  });

  it('stops at the most a person can keep', () => {
    const full = Array.from({ length: MAX_RULES }, (_, i) => rule(`shop ${i}`, 'Food'));
    expect(ruleProblem('New shop', full)).toBe('full');
    expect(ruleProblem('New shop', full, 'shop 0')).toBeNull();
  });
});

describe('words for an offer', () => {
  it('keeps the whole title people typed', () => {
    expect(ruleWordsFrom('Shwapno')).toBe('Shwapno');
    expect(ruleWordsFrom('Trip to Sylhet')).toBe('Trip to Sylhet');
  });

  it('takes the shop from a money SMS title', () => {
    expect(ruleWordsFrom('bKash Payment to Shwapno')).toBe('Shwapno');
    expect(ruleWordsFrom('Card purchase at Star Kabab')).toBe('Star Kabab');
  });

  it('makes no offer from a title with no name in it', () => {
    expect(ruleWordsFrom('bKash Send Money')).toBeUndefined();
    expect(ruleWordsFrom('Bank payment')).toBeUndefined();
    expect(ruleWordsFrom('ATM cash withdrawal')).toBeUndefined();
  });

  it('makes no offer from long numbers or hidden digits', () => {
    expect(ruleWordsFrom('bKash Send Money to 01712345678')).toBeUndefined();
    expect(ruleWordsFrom('bKash Payment to ***678')).toBeUndefined();
  });
});

describe('offering a rule', () => {
  it('asks on the second correction to the same category', () => {
    const first = recordCorrection(NO_CORRECTIONS, 'Shwapno', 'Food');
    expect(first.offer).toBe(false);
    const second = recordCorrection(first.memory, 'shwapno', 'food');
    expect(second.offer).toBe(true);
    expect(second.memory.seen).toEqual({});
  });

  it('starts counting again when the category changes', () => {
    const first = recordCorrection(NO_CORRECTIONS, 'Shwapno', 'Food');
    const second = recordCorrection(first.memory, 'Shwapno', 'Shopping');
    expect(second.offer).toBe(false);
    expect(recordCorrection(second.memory, 'Shwapno', 'Shopping').offer).toBe(true);
  });

  it('never asks again after a no', () => {
    const memory = declineOffer(NO_CORRECTIONS, 'Shwapno', 'Food');
    const first = recordCorrection(memory, 'Shwapno', 'Food');
    expect(recordCorrection(first.memory, 'Shwapno', 'Food').offer).toBe(false);
    expect(recordCorrection(first.memory, 'Shwapno', 'Shopping').offer).toBe(false);
  });

  it('remembers only the latest titles', () => {
    let memory = NO_CORRECTIONS;
    for (let i = 0; i < 60; i++) memory = recordCorrection(memory, `shop ${i}`, 'Food').memory;
    expect(Object.keys(memory.seen)).toHaveLength(40);
    expect(memory.seen['shop 59']).toBeDefined();
  });
});

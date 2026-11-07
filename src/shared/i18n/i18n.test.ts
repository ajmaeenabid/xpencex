import { describe, it, expect } from 'vitest';
import { en } from './en';
import { bn } from './bn';
import { translate, categoryLabel, tEnglish } from './index';
import { buildInsights } from '../../features/home/insights';

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();

describe('translations', () => {
  it('Bangla has a non-empty phrase for every English key', () => {
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(bn[key], key).toBeTruthy();
    }
  });

  it('Bangla phrases use exactly the same {placeholders} as English', () => {
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(placeholders(bn[key]), key).toEqual(placeholders(en[key]));
    }
  });

  it('fills in values and leaves amounts and currency untouched', () => {
    expect(translate('bn', 'home.today')).toBe('আজ');
    expect(translate('en', 'add.yourShare', { amount: '৳1,250' })).toBe('Your share: ৳1,250');
    expect(translate('bn', 'add.yourShare', { amount: '৳1,250' })).toBe('আপনার ভাগ: ৳1,250');
  });

  it('translates built-in categories but leaves custom ones as typed', () => {
    const tBn = (k: Parameters<typeof tEnglish>[0], v?: Parameters<typeof tEnglish>[1]) => translate('bn', k, v);
    expect(categoryLabel(tBn, 'Food')).toBe('খাবার');
    expect(categoryLabel(tBn, 'Gym')).toBe('Gym');
  });

  it('builds insights in Bangla with the same numbers', () => {
    const now = new Date(2026, 9, 25);
    const expenses = [{ id: '1', uid: 'u', title: 'Rent', amount: 6000, category: 'Housing', date: new Date(2026, 9, 2).toISOString() }];
    const fmt = (n: number) => `৳${Math.round(n).toLocaleString('en-US')}`;
    const tBn = (k: Parameters<typeof tEnglish>[0], v?: Parameters<typeof tEnglish>[1]) => translate('bn', k, v);
    const [first] = buildInsights(expenses, 5000, {}, fmt, now, tBn);
    expect(first.title).toBe('বাজেট ছাড়িয়ে গেছে');
    expect(first.detail).toContain('৳1,000');
  });
});

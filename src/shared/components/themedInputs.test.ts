import { describe, it, expect } from 'vitest';
import { bn as bnDates } from 'date-fns/locale';
import { matchingOptions } from './Combobox';
import { dateFromValue, monthGrid } from './DateField';

const banks = ['BRAC Bank', 'Dutch-Bangla Bank', 'Islami Bank Bangladesh', 'City Bank'];

describe('matchingOptions', () => {
  it('shows everything before anything is typed', () => {
    expect(matchingOptions(banks, '')).toEqual(banks);
    expect(matchingOptions(banks, '   ')).toEqual(banks);
  });
  it('matches any part of a name, ignoring capitals', () => {
    expect(matchingOptions(banks, 'bangla')).toEqual(['Dutch-Bangla Bank', 'Islami Bank Bangladesh']);
    expect(matchingOptions(banks, 'CITY')).toEqual(['City Bank']);
  });
  it('shows all again once a full name is chosen, so it can be changed', () => {
    expect(matchingOptions(banks, 'City Bank')).toEqual(banks);
  });
  it('shows nothing for an unknown name, which can still be typed', () => {
    expect(matchingOptions(banks, 'My local bank')).toEqual([]);
  });
});

describe('monthGrid', () => {
  it('covers the whole month in full weeks', () => {
    const days = monthGrid(new Date(2026, 10, 15));
    expect(days.length % 7).toBe(0);
    expect(days.some(d => d.getMonth() === 10 && d.getDate() === 1)).toBe(true);
    expect(days.some(d => d.getMonth() === 10 && d.getDate() === 30)).toBe(true);
  });
  it('handles February in a leap year', () => {
    expect(monthGrid(new Date(2028, 1, 1)).some(d => d.getMonth() === 1 && d.getDate() === 29)).toBe(true);
  });
  it('starts each week by the language in use', () => {
    const start = monthGrid(new Date(2026, 10, 15), bnDates)[0].getDay();
    expect(start).toBe(bnDates.options?.weekStartsOn ?? 0);
  });
});

describe('dateFromValue', () => {
  it('reads the date as written, whatever the time zone', () => {
    const d = dateFromValue('2026-11-05');
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 10, 5]);
  });
});

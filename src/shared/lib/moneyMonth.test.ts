import { describe, expect, it } from 'vitest';
import { cleanStartDay, inMoneyMonth, lastMoneyMonths, moneyMonth, moneyMonthDay, moneyMonthKey, moneyMonthStart } from './moneyMonth';

const d = (s: string) => new Date(`${s}T12:00:00`);
const day = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;

describe('money month', () => {
  it('is the calendar month when it starts on the 1st', () => {
    const m = moneyMonth(d('2026-11-16'), 1);
    expect([day(m.start), day(m.end)]).toEqual(['2026-11-01', '2026-12-01']);
    expect(moneyMonthDay(d('2026-11-16'), 1)).toEqual({ day: 16, length: 30 });
  });

  it('runs from the start day to the day before it next month', () => {
    expect(day(moneyMonthStart(d('2026-11-24'), 25))).toBe('2026-10-25');
    expect(day(moneyMonthStart(d('2026-11-25'), 25))).toBe('2026-11-25');
    const m = moneyMonth(d('2026-12-03'), 25);
    expect([day(m.start), day(m.end)]).toEqual(['2026-11-25', '2026-12-25']);
    expect(moneyMonthDay(d('2026-11-25'), 25)).toEqual({ day: 1, length: 30 });
  });

  it('moves the 29th, 30th and 31st to the last day of shorter months', () => {
    // Start day 31: Jan 31, Feb 28, Mar 31, Apr 30
    expect(day(moneyMonthStart(d('2027-03-05'), 31))).toBe('2027-02-28');
    const feb = moneyMonth(d('2027-03-05'), 31);
    expect([day(feb.start), day(feb.end)]).toEqual(['2027-02-28', '2027-03-31']);
    expect(day(moneyMonth(d('2027-03-05'), 31, 1).start)).toBe('2027-03-31');
    expect(day(moneyMonth(d('2027-03-05'), 31, 2).start)).toBe('2027-04-30');
    // Leap year
    expect(day(moneyMonthStart(d('2028-03-01'), 30))).toBe('2028-02-29');
  });

  it('crosses the year correctly', () => {
    const m = moneyMonth(d('2027-01-10'), 25);
    expect([day(m.start), day(m.end)]).toEqual(['2026-12-25', '2027-01-25']);
    expect(day(moneyMonth(d('2027-01-10'), 25, -1).start)).toBe('2026-11-25');
    expect(moneyMonthKey(d('2027-01-10'), 25)).toBe('2026-12');
  });

  it('counts a record exactly once', () => {
    const now = d('2026-11-30');
    expect(inMoneyMonth(new Date(2026, 10, 25, 0, 0).getTime(), now, 25)).toBe(true);
    expect(inMoneyMonth(new Date(2026, 10, 24, 23, 59).getTime(), now, 25)).toBe(false);
    expect(inMoneyMonth(new Date(2026, 10, 24, 23, 59).getTime(), now, 25, -1)).toBe(true);
  });

  it('lists the last months oldest first, back to back', () => {
    const months = lastMoneyMonths(3, d('2026-11-26'), 25);
    expect(months.map(m => day(m.start))).toEqual(['2026-09-25', '2026-10-25', '2026-11-25']);
    expect(months[0].end.getTime()).toBe(months[1].start.getTime());
  });

  it('cleans saved start days', () => {
    expect(cleanStartDay(25)).toBe(25);
    expect([cleanStartDay(undefined), cleanStartDay(0), cleanStartDay(32), cleanStartDay(2.5), cleanStartDay('5')]).toEqual([1, 1, 1, 1, 1]);
  });
});

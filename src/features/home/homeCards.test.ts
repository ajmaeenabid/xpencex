import { describe, expect, it } from 'vitest';
import { DAILY_CARDS, cardsOnHome, onHome, smartAlerts, toggleCard } from './homeCards';

const now = new Date(2026, 10, 20, 10);
const day = (n: number) => new Date(2026, 10, 20 + n, 12);

describe('cards on Home', () => {
  it('starts with the daily cards, Spending Analysis included', () => {
    expect([...cardsOnHome(undefined)]).toEqual([...DAILY_CARDS]);
    expect(cardsOnHome(undefined).has('charts')).toBe(true);
    expect(cardsOnHome(undefined).has('funds')).toBe(false);
  });

  it('switches a card on and off, and forgets cards the app no longer has', () => {
    const withGoals = toggleCard(undefined, 'funds');
    expect(withGoals).toContain('funds');
    expect(withGoals).toContain('budget');
    expect(toggleCard(withGoals, 'budget')).not.toContain('budget');
    expect([...cardsOnHome(['funds', 'cash', 'old-card'])]).toEqual(['funds']);
  });

  it('always lets the cards that only appear when needed through', () => {
    const on = cardsOnHome([]);
    expect(onHome('saveNudge', on, new Set())).toBe(true);
    expect(onHome('unsorted', on, new Set())).toBe(true);
    expect(onHome('funds', on, new Set())).toBe(false);
    expect(onHome('funds', on, new Set(['funds']))).toBe(true);
  });
});

describe('smart alerts', () => {
  const none = { loans: [], samityDates: [], goals: [], now };

  it('brings a loan to Home when the installment is due within 3 days', () => {
    expect(smartAlerts({ ...none, loans: [{ nextDueDate: day(2).toISOString() }] }).has('loan')).toBe(true);
    expect(smartAlerts({ ...none, loans: [{ nextDueDate: day(3).toISOString() }] }).has('loan')).toBe(true);
    expect(smartAlerts({ ...none, loans: [{ nextDueDate: day(4).toISOString() }] }).has('loan')).toBe(false);
  });

  it('brings a samity to Home on its payment day, or when it was missed', () => {
    expect(smartAlerts({ ...none, samityDates: [day(0)] }).has('samity')).toBe(true);
    expect(smartAlerts({ ...none, samityDates: [day(-2)] }).has('samity')).toBe(true);
    expect(smartAlerts({ ...none, samityDates: [day(1)] }).has('samity')).toBe(false);
  });

  it('brings a goal to Home in its last week, unless reached or paused', () => {
    const goal = { dueDate: day(5).toISOString(), progress: 0.4 };
    expect(smartAlerts({ ...none, goals: [goal] }).has('funds')).toBe(true);
    expect(smartAlerts({ ...none, goals: [{ ...goal, progress: 1 }] }).has('funds')).toBe(false);
    expect(smartAlerts({ ...none, goals: [{ ...goal, paused: true }] }).has('funds')).toBe(false);
    expect(smartAlerts({ ...none, goals: [{ ...goal, dueDate: day(10).toISOString() }] }).has('funds')).toBe(false);
    expect(smartAlerts({ ...none, goals: [{ progress: 0 }] }).has('funds')).toBe(false);
  });
});

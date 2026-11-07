import { describe, it, expect } from 'vitest';
import { healthView } from './health';

const now = Date.UTC(2026, 10, 8, 12, 0);
const minutesAgo = (m: number) => new Date(now - m * 60_000).toISOString();

describe('healthView', () => {
  it('shows a job that ran recently as fine', () => {
    expect(healthView({ loansAt: minutesAgo(30), loansError: '' }, now).loans).toEqual({ lastRun: minutesAgo(30), error: '', late: false });
  });

  it('marks a job late after 2 hours without a run, and one that never ran', () => {
    expect(healthView({ loansAt: minutesAgo(121) }, now).loans.late).toBe(true);
    expect(healthView({ loansAt: minutesAgo(119) }, now).loans.late).toBe(false);
    expect(healthView(null, now).rates).toEqual({ lastRun: null, error: '', late: true });
  });

  it('passes on the last error', () => {
    expect(healthView({ ratesAt: minutesAgo(5), ratesError: 'Rates source error 503' }, now).rates.error).toBe('Rates source error 503');
  });

  it('ignores values of the wrong type', () => {
    expect(healthView({ loansAt: 5, loansError: 7 }, now).loans).toEqual({ lastRun: null, error: '', late: true });
  });
});

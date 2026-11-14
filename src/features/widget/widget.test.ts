import { describe, it, expect, vi } from 'vitest';

vi.mock('../../app/App', () => ({ useAuth: () => ({}) }));
vi.mock('@capacitor/core', () => ({ registerPlugin: () => ({}) }));
const { widgetText } = await import('./widget');

const t = (k: string, v?: Record<string, string>) => (k === 'widget.ofBudget' ? `of ${v!.budget} budget` : 'No budget set');

describe('widgetText', () => {
  it('shows today, this month and the budget bar', () => {
    expect(widgetText(450, 12400.4, 15000, '৳', t)).toEqual({ today: '৳450', month: '৳12,400', budget: 'of ৳15,000 budget', percent: 83 });
  });

  it('has no bar without a budget', () => {
    expect(widgetText(0, 300, 0, '৳', t)).toMatchObject({ budget: 'No budget set', percent: -1 });
  });
});

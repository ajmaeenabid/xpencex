import { Expense } from '../../shared/types';

// "Worth it or regret?": totals and the strongest pattern in your regrets, worked out on the phone

export type Feeling = 'worth' | 'regret';
export const MIN_REGRETS = 5; // patterns only show once there are this many regrets
const MIN_SHARE = 0.5; // a pattern must cover at least half the regrets
const MIN_COUNT = 3;
const DAY = 24 * 60 * 60 * 1000;

export type RegretPattern =
  | { kind: 'night'; share: number } // 10 PM to 5 AM
  | { kind: 'weekend'; share: number } // Friday or Saturday, the weekend in Bangladesh
  | { kind: 'category'; share: number; category: string }
  | { kind: 'afterMoneyIn'; share: number }; // within 7 days after money came in

type Tagged = Pick<Expense, 'amount' | 'date' | 'category' | 'feeling' | 'createdAt'>;

const round2 = (n: number) => Math.round(n * 100) / 100;
// When it was actually bought: the time it was saved (a typed date is set to midday)
const when = (e: Tagged) => new Date(e.createdAt || e.date);

export function regretSummary(expenses: Tagged[], moneyInDates: string[] = [], now = new Date()) {
  const month = (d: Date) => d.getFullYear() * 12 + d.getMonth();
  const thisMonth = month(now);
  let regret = 0, worth = 0;
  for (const e of expenses) {
    if (month(new Date(e.date)) !== thisMonth) continue;
    if (e.feeling === 'regret') regret += e.amount;
    else if (e.feeling === 'worth') worth += e.amount;
  }

  const regrets = expenses.filter(e => e.feeling === 'regret');
  const candidates: RegretPattern[] = [];
  const share = (n: number) => n / regrets.length;

  if (regrets.length >= MIN_REGRETS) {
    const night = regrets.filter(e => { const h = when(e).getHours(); return h >= 22 || h < 5; }).length;
    if (night >= MIN_COUNT) candidates.push({ kind: 'night', share: share(night) });

    const weekend = regrets.filter(e => [5, 6].includes(when(e).getDay())).length;
    if (weekend >= MIN_COUNT) candidates.push({ kind: 'weekend', share: share(weekend) });

    const byCategory = new Map<string, number>();
    regrets.forEach(e => byCategory.set(e.category, (byCategory.get(e.category) || 0) + 1));
    const [topCategory, topCount] = [...byCategory.entries()].sort((a, b) => b[1] - a[1])[0];
    if (topCount >= MIN_COUNT) candidates.push({ kind: 'category', share: share(topCount), category: topCategory });

    const moneyIn = moneyInDates.map(d => new Date(d).getTime());
    const afterMoneyIn = regrets.filter(e => {
      const t = when(e).getTime();
      return moneyIn.some(m => t >= m && t - m <= 7 * DAY);
    }).length;
    if (moneyIn.length && afterMoneyIn >= MIN_COUNT) candidates.push({ kind: 'afterMoneyIn', share: share(afterMoneyIn) });
  }

  const pattern = candidates.filter(c => c.share >= MIN_SHARE).sort((a, b) => b.share - a.share)[0] ?? null;
  return { regret: round2(regret), worth: round2(worth), regretCount: regrets.length, pattern };
}

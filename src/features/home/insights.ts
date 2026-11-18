import { moneyMonth, moneyMonthDay } from '../../shared/lib/moneyMonth';
import { Expense } from '../../shared/types';
import { TFunction, tEnglish, categoryLabel } from '../../shared/i18n';

export interface Insight {
  id: string;
  tone: 'good' | 'warning' | 'danger' | 'info';
  title: string;
  detail: string;
}

export function sumByCategory(expenses: Expense[]): Record<string, number> {
  return expenses.reduce<Record<string, number>>((acc, e) => {
    acc[e.category] = (acc[e.category] || 0) + e.amount;
    return acc;
  }, {});
}

/** Straight-line projection of this (money) month's spending to its last day. `startDay`: Profile > Month starts on. */
export function forecastMonthEnd(spentSoFar: number, now: Date, startDay = 1): number {
  const { day, length } = moneyMonthDay(now, startDay);
  return (spentSoFar / day) * length;
}

export function splitMonths(expenses: Expense[], now: Date, startDay = 1) {
  const thisStart = moneyMonth(now, startDay).start.getTime();
  const lastStart = moneyMonth(now, startDay, -1).start.getTime();
  // Same number of days into last month, so early-month comparisons are fair
  const lastToDateEnd = Math.min(lastStart + (now.getTime() - thisStart), thisStart);

  const thisMonth: Expense[] = [];
  const lastMonthToDate: Expense[] = [];
  for (const e of expenses) {
    const t = new Date(e.date).getTime();
    if (t >= thisStart && t <= now.getTime()) thisMonth.push(e);
    else if (t >= lastStart && t < lastToDateEnd) lastMonthToDate.push(e);
  }
  return { thisMonth, lastMonthToDate };
}

export interface CategoryChange {
  category: string;
  now: number; // this month so far
  before: number; // the same days of last month
  change: number | null; // e.g. 0.23 for 23% more; null when there was nothing to compare with
}

/**
 * Each category this month so far against the same days of last month (a fair comparison early in the month).
 * Biggest amounts first. The Reports card shows this; Home's tip uses the same numbers.
 */
export function compareByCategory(expenses: Expense[], now: Date = new Date(), startDay = 1): CategoryChange[] {
  const { thisMonth, lastMonthToDate } = splitMonths(expenses, now, startDay);
  const thisByCat = sumByCategory(thisMonth);
  const lastByCat = sumByCategory(lastMonthToDate);
  return Object.keys({ ...thisByCat, ...lastByCat })
    .map(category => {
      const nowAmount = Math.round((thisByCat[category] || 0) * 100) / 100;
      const before = Math.round((lastByCat[category] || 0) * 100) / 100;
      return { category, now: nowAmount, before, change: before > 0 ? (nowAmount - before) / before : null };
    })
    .sort((a, b) => Math.max(b.now, b.before) - Math.max(a.now, a.before));
}

/**
 * Turns raw expenses into a short list of plain-language observations for the dashboard.
 * `expenses` should cover at least the start of last month through now.
 */
export function buildInsights(
  expenses: Expense[],
  budget: number,
  categoryBudgets: Record<string, number>,
  fmt: (n: number) => string,
  now: Date = new Date(),
  t: TFunction = tEnglish,
  startDay = 1,
): Insight[] {
  const insights: Insight[] = [];
  const { thisMonth, lastMonthToDate } = splitMonths(expenses, now, startDay);
  const spent = thisMonth.reduce((s, e) => s + e.amount, 0);
  const { day, length } = moneyMonthDay(now, startDay);
  const daysLeft = length - day;

  if (budget > 0 && spent > 0) {
    const forecast = forecastMonthEnd(spent, now, startDay);
    const pct = Math.round((spent / budget) * 100);
    if (spent > budget) {
      insights.push({ id: 'budget', tone: 'danger', title: t('insight.budgetExceeded'), detail: t('insight.budgetExceededDetail', { amount: fmt(spent - budget) }) });
    } else if (forecast > budget) {
      insights.push({ id: 'budget', tone: 'danger', title: t('insight.overspend'), detail: t('insight.overspendDetail', { forecast: fmt(forecast), over: fmt(forecast - budget) }) });
    } else if (pct >= 80) {
      insights.push({ id: 'budget', tone: 'warning', title: t('insight.budgetUsed', { pct }), detail: t('insight.budgetUsedDetail', { left: fmt(budget - spent), days: daysLeft }) });
    } else {
      insights.push({ id: 'budget', tone: 'good', title: t('insight.onTrack'), detail: t('insight.onTrackDetail', { forecast: fmt(forecast), budget: fmt(budget) }) });
    }
  }

  const thisByCat = sumByCategory(thisMonth);
  const lastByCat = sumByCategory(lastMonthToDate);

  for (const [cat, limit] of Object.entries(categoryBudgets)) {
    const catSpent = thisByCat[cat] || 0;
    if (limit <= 0) continue;
    if (catSpent > limit) {
      insights.push({ id: `cat-over-${cat}`, tone: 'danger', title: t('insight.catExceeded', { cat: categoryLabel(t, cat) }), detail: t('insight.catExceededDetail', { spent: fmt(catSpent), limit: fmt(limit) }) });
    } else if (catSpent >= limit * 0.8) {
      insights.push({ id: `cat-near-${cat}`, tone: 'warning', title: t('insight.catNear', { cat: categoryLabel(t, cat) }), detail: t('insight.catNearDetail', { left: fmt(limit - catSpent), limit: fmt(limit) }) });
    }
  }

  const changes = Object.keys({ ...thisByCat, ...lastByCat })
    .map(cat => ({ cat, now: thisByCat[cat] || 0, before: lastByCat[cat] || 0 }))
    .filter(c => c.before > 0 && c.now > 0)
    .map(c => ({ ...c, change: (c.now - c.before) / c.before }))
    .filter(c => Math.abs(c.change) >= 0.3)
    .sort((a, b) => Math.abs(b.now - b.before) - Math.abs(a.now - a.before));

  for (const c of changes.slice(0, 1)) { // the biggest change only (the full list is in Reports)
    const pct = Math.round(Math.abs(c.change) * 100);
    insights.push(c.change > 0
      ? { id: `trend-${c.cat}`, tone: 'warning', title: t('insight.up', { cat: categoryLabel(t, c.cat), pct }), detail: t('insight.trendDetail', { now: fmt(c.now), before: fmt(c.before) }) }
      : { id: `trend-${c.cat}`, tone: 'good', title: t('insight.down', { cat: categoryLabel(t, c.cat), pct }), detail: t('insight.trendDetailGood', { now: fmt(c.now), before: fmt(c.before) }) });
  }

  const biggest = [...thisMonth].sort((a, b) => b.amount - a.amount)[0];
  if (biggest && spent > 0 && biggest.amount / spent >= 0.25) {
    insights.push({ id: 'biggest', tone: 'info', title: t('insight.biggest'), detail: t('insight.biggestDetail', { title: biggest.title, amount: fmt(biggest.amount), pct: Math.round((biggest.amount / spent) * 100) }) });
  }

  const order = { danger: 0, warning: 1, good: 2, info: 3 };
  return insights.sort((a, b) => order[a.tone] - order[b.tone]).slice(0, 4);
}

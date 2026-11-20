import { google, encodeFields, Plain } from './google';

// How many new items people added across the whole app in the last hour (security review Part 3, step 5,
// 2026-11-20). The hourly cron counts every collection the app can write, without reading any document,
// and keeps the totals in meta/health. The admin panel shows the last hour, in red above the limit, so abuse
// that eats the free daily writes (20,000) shows up early. It sees new items only, not edits: the Firebase
// console's Usage tab shows those.

type Google = ReturnType<typeof google>;

/** Everything the app itself can create (firestore.rules). Server-only collections are left out. */
export const WATCHED = [
  'expenses', 'recurring', 'categories', 'accounts', 'deposits', 'chats', 'loans', 'balanceHistory', 'debts', 'funds',
  'samities', 'feedback', 'incomeRules', 'incomeCategories', 'reminders', 'tasks', 'templates', 'planned',
  'categoryRules', 'shoppingLists', 'savedFilters',
] as const;

/** ACTIVITY_ALERT_PER_HOUR in wrangler.toml; 1,000 was chosen on 2026-11-20 */
export const activityLimit = (env: { ACTIVITY_ALERT_PER_HOUR?: string }) => Number(env.ACTIVITY_ALERT_PER_HOUR) || 1000;

export type Counts = Record<string, number>;
export interface Busiest { kind: string; count: number }

/**
 * New items since the last count, overall and the busiest kinds (at most 3). A kind that shrank counts as 0,
 * so deletes elsewhere can't hide new items. The first count ever has nothing to compare with: null.
 */
export function newItems(previous: Counts | null, current: Counts): { added: number; busiest: Busiest[] } | null {
  if (!previous) return null;
  const grown = Object.entries(current)
    .map(([kind, count]) => ({ kind, count: Math.max(0, count - (typeof previous[kind] === 'number' ? previous[kind] : count)) }))
    .filter((b) => b.count > 0)
    .sort((a, b) => b.count - a.count);
  return { added: grown.reduce((sum, b) => sum + b.count, 0), busiest: grown.slice(0, 3) };
}

/** Counts every watched collection and saves the totals and what grew in meta/health */
export async function countActivity(g: Google, now = Date.now()) {
  const current: Counts = {};
  for (const kind of WATCHED) current[kind] = await g.count(kind);

  const health = await g.getTyped('meta', 'health');
  const stored = health?.data.activityCounts;
  const previous = stored && typeof stored === 'object' && !Array.isArray(stored) ? (stored as Counts) : null;
  const result = newItems(previous, current);

  const fields: Record<string, Plain> = { activityCounts: current, activityAt: new Date(now).toISOString() };
  if (result) {
    fields.activityAdded = result.added;
    fields.activityBusiest = result.busiest.map((b) => ({ kind: b.kind, count: b.count }));
  }
  await g.commit([{
    update: { name: g.docName('meta', 'health'), fields: encodeFields(fields) },
    updateMask: { fieldPaths: Object.keys(fields) },
  }]);
  return result;
}

export interface ActivityView {
  at: string | null; // when it was last counted
  added: number | null; // new items in the hour before that; null until there are two counts
  busiest: Busiest[];
  limit: number;
  over: boolean;
}

/** What the admin panel shows */
export function activityView(data: Record<string, Plain> | null, limit: number): ActivityView {
  const at = typeof data?.activityAt === 'string' ? data.activityAt : null;
  const added = typeof data?.activityAdded === 'number' ? data.activityAdded : null;
  const busiest = Array.isArray(data?.activityBusiest)
    ? (data.activityBusiest as Plain[]).flatMap((b) =>
      b && typeof b === 'object' && !Array.isArray(b) && typeof b.kind === 'string' && typeof b.count === 'number'
        ? [{ kind: b.kind, count: b.count }] : [])
    : [];
  return { at, added, busiest, limit, over: added !== null && added > limit };
}

import { google, encodeFields, Plain } from './google';

// The hourly jobs note when they last ran and whether they failed, in meta/health. Only the
// server can read or write it (firestore.rules has no rule for it), and the admin panel shows it.

type Google = ReturnType<typeof google>;
// activity: the hourly count of new items (src/activity.ts)
export type Job = 'loans' | 'rates' | 'activity';
export const JOBS: Job[] = ['loans', 'rates', 'activity'];

// The cron runs every hour, so more than this means at least one run was missed
const LATE_MS = 2 * 60 * 60 * 1000;

/** Records one run of a job. Each job writes only its own two fields, so the two jobs never overwrite each other. */
export function recordRun(g: Google, job: Job, error?: unknown, now = Date.now()) {
  const message = error === undefined ? '' : (error instanceof Error ? error.message : String(error)).slice(0, 300);
  return g.commit([{
    update: { name: g.docName('meta', 'health'), fields: encodeFields({ [`${job}At`]: new Date(now).toISOString(), [`${job}Error`]: message }) },
    updateMask: { fieldPaths: [`${job}At`, `${job}Error`] },
  }]);
}

export interface JobHealth {
  lastRun: string | null; // ISO date, or null if it has never run
  error: string; // empty when the last run worked
  late: boolean; // hasn't run for more than 2 hours (or never)
}

/** What the admin panel shows for each job */
export function healthView(data: Record<string, Plain> | null, now = Date.now()): Record<Job, JobHealth> {
  const view = {} as Record<Job, JobHealth>;
  for (const job of JOBS) {
    const at = typeof data?.[`${job}At`] === 'string' ? (data[`${job}At`] as string) : null;
    const error = typeof data?.[`${job}Error`] === 'string' ? (data[`${job}Error`] as string) : '';
    const time = at ? Date.parse(at) : NaN;
    view[job] = { lastRun: at, error, late: !Number.isFinite(time) || now - time > LATE_MS };
  }
  return view;
}

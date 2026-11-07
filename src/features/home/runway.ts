// How long the money in your accounts lasts at your recent rate of spending

const DAY = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 30;
// With fewer days of spending than this, the card says the estimate is rough
export const ROUGH_BELOW_DAYS = 7;

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface Runway {
  money: number; // all account balances together
  perDay: number; // average daily spending over the last 30 days (or fewer, for a new user)
  basedOnDays: number; // how many days that average covers
  days: number | null; // whole days the money lasts; null when nothing was spent
  runsOutOn: Date | null;
  nextDeposit: { date: Date; daysUntil: number; lasts: boolean; shortByDays: number; safePerDay: number } | null;
}

export function runway({ accounts, expenses, now = new Date(), dataSince, userSince }: {
  accounts: { balance: number; deposit?: { amount: number; day: number }; nextDepositDate?: string }[];
  expenses: { amount: number; date: string }[];
  now?: Date;
  dataSince?: Date; // the oldest date the expenses passed in cover
  userSince?: Date; // when the user joined: a new user's average covers only their days so far
}): Runway {
  const money = round2(accounts.reduce((sum, a) => sum + a.balance, 0));

  // The window: the last 30 days, but never before the data starts or before the user joined
  let start = now.getTime() - WINDOW_DAYS * DAY;
  if (dataSince) start = Math.max(start, dataSince.getTime());
  if (userSince) start = Math.max(start, userSince.getTime());
  const basedOnDays = Math.max(1, Math.min(WINDOW_DAYS, Math.ceil((now.getTime() - start) / DAY)));

  const spent = expenses.reduce((sum, e) => {
    const t = new Date(e.date).getTime();
    return t > start && t <= now.getTime() ? sum + e.amount : sum;
  }, 0);
  const perDay = round2(spent / basedOnDays);

  const days = perDay > 0 ? Math.max(0, Math.floor(money / perDay)) : null;
  const runsOutOn = days !== null ? new Date(now.getTime() + days * DAY) : null;

  // The soonest monthly deposit still to come
  const upcoming = accounts
    .filter(a => a.deposit && a.nextDepositDate && new Date(a.nextDepositDate).getTime() > now.getTime())
    .map(a => new Date(a.nextDepositDate!))
    .sort((a, b) => a.getTime() - b.getTime())[0];

  let nextDeposit: Runway['nextDeposit'] = null;
  if (upcoming) {
    const daysUntil = Math.max(1, Math.ceil((upcoming.getTime() - now.getTime()) / DAY));
    const lasts = days === null || days >= daysUntil;
    nextDeposit = {
      date: upcoming,
      daysUntil,
      lasts,
      shortByDays: lasts ? 0 : daysUntil - (days ?? 0),
      safePerDay: round2(Math.max(0, money) / daysUntil),
    };
  }

  return { money, perDay, basedOnDays, days, runsOutOn, nextDeposit };
}

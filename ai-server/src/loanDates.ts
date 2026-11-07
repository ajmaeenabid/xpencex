// Loan installment dates. Used by both the AI server (which takes the installments) and the app
// (which sets the first date), so the two always agree. Times are Bangladesh time (UTC+6):
// an installment falls at 9:00 in the morning on its day.

const BD_OFFSET_MS = 6 * 3600_000;
const PAY_HOUR_UTC = 3; // 9:00 in Bangladesh

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The installment day in a month, moved to the month's last day when it's shorter (31 -> 30 Nov) */
export function installmentDate(year: number, month: number, day: number): Date {
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(day, lastDay), PAY_HOUR_UTC));
}

/** The calendar date in Bangladesh, e.g. "2026-11-05" */
export const bdDay = (ms: number = Date.now()) => new Date(ms + BD_OFFSET_MS).toISOString().slice(0, 10);

/** First installment strictly after today, so a loan created today isn't charged the same day */
export function firstInstallmentDate(day: number, now: number = Date.now()): string {
  const bd = new Date(now + BD_OFFSET_MS);
  const thisMonth = installmentDate(bd.getUTCFullYear(), bd.getUTCMonth(), day);
  if (bdDay(thisMonth.getTime()) > bdDay(now)) return thisMonth.toISOString();
  return installmentDate(bd.getUTCFullYear(), bd.getUTCMonth() + 1, day).toISOString();
}

/** The installment after `previous`, one month later on `day` */
export function nextInstallmentDate(previous: string, day: number): string {
  const bd = new Date(Date.parse(previous) + BD_OFFSET_MS);
  return installmentDate(bd.getUTCFullYear(), bd.getUTCMonth() + 1, day).toISOString();
}

export interface LoanSchedule {
  remaining: number;
  installment: number;
  nextDueDate: string;
  day: number;
}

/**
 * Every installment that has come due (<= now), oldest first. The last one is only what is left,
 * so the loan never goes below zero. Capped so a long-forgotten loan can't create hundreds at once.
 */
export function duePayments(loan: LoanSchedule, now: number = Date.now(), max = 24) {
  const payments: { date: string; amount: number }[] = [];
  let remaining = round2(loan.remaining);
  let next = loan.nextDueDate;
  while (remaining > 0 && Date.parse(next) <= now && payments.length < max) {
    const amount = round2(Math.min(loan.installment, remaining));
    payments.push({ date: next, amount });
    remaining = round2(remaining - amount);
    next = nextInstallmentDate(next, loan.day);
  }
  return { payments, remaining, next, paidOff: remaining <= 0 };
}

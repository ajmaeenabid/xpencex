import { addMonths, addWeeks } from 'date-fns';

// A samity (rotating savings group), from one member's side: your payments each round, and your payout turn

export interface Samity {
  id: string;
  uid: string;
  name: string;
  amount: number; // each member pays this every round
  frequency: 'weekly' | 'monthly';
  members: number; // also the number of rounds: everyone gets the pot once
  startDate: string; // ISO, round 1
  myTurn: number; // the round you receive the pot
  payments: Record<string, string>; // round number -> account it was paid from ('' when none)
  payout?: { at: string; accountId: string }; // set once you received your pot
  createdAt: string;
}

/** The date of round n (1-based) */
export function roundDate(s: Pick<Samity, 'startDate' | 'frequency'>, n: number): Date {
  const start = new Date(s.startDate);
  return s.frequency === 'weekly' ? addWeeks(start, n - 1) : addMonths(start, n - 1);
}

/** The pot you receive on your turn: every member's payment for that round, yours included */
export const payoutAmount = (s: Pick<Samity, 'amount' | 'members'>) => Math.round(s.amount * s.members * 100) / 100;

export interface SamityStatus {
  rounds: { n: number; date: Date; paid: boolean; mine: boolean }[];
  paidCount: number;
  nextUnpaid: { n: number; date: Date } | null; // the earliest round you haven't paid
  overdue: number; // rounds whose day has passed and aren't paid
  myTurnDate: Date;
  finished: boolean; // every round paid and the payout received
}

export function samityStatus(s: Samity, now = new Date()): SamityStatus {
  const rounds = Array.from({ length: s.members }, (_, i) => {
    const n = i + 1;
    return { n, date: roundDate(s, n), paid: String(n) in s.payments, mine: n === s.myTurn };
  });
  const unpaid = rounds.filter(r => !r.paid);
  const today = new Date(now); today.setHours(23, 59, 59, 999);
  return {
    rounds,
    paidCount: rounds.length - unpaid.length,
    nextUnpaid: unpaid[0] ? { n: unpaid[0].n, date: unpaid[0].date } : null,
    overdue: unpaid.filter(r => r.date.getTime() <= today.getTime()).length,
    myTurnDate: roundDate(s, s.myTurn),
    finished: unpaid.length === 0 && !!s.payout,
  };
}

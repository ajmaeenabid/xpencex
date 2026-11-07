import { Account } from '../../shared/types';

// The Cash wallet: money in hand, as an account of type 'cash' (one per person)

const DAY = 24 * 60 * 60 * 1000;
// The weekly question waits this long after the last cash expense, so it doesn't ask right after you logged one
const QUIET_DAYS = 3;
const ASK_EVERY_DAYS = 7;

export const findWallet = (accounts: Account[]) => accounts.find(a => a.type === 'cash');

/** A Cash Out or ATM withdrawal SMS: money moved into your hand, not spent */
export const isCashOut = (title: string) => /cash\s*out|ATM cash withdrawal/i.test(title);

/**
 * Whether the Cash card asks "Do you still have ৳X in cash?": the wallet has money, nothing was paid
 * in cash for 3 days, and it wasn't asked (or counted) in the last 7 days.
 */
export function shouldAskCashCount({ wallet, lastCashSpendAt, now = new Date() }: {
  wallet: Pick<Account, 'balance' | 'createdAt' | 'countedAt'>;
  lastCashSpendAt?: string; // the newest expense paid from the wallet
  now?: Date;
}): boolean {
  if (wallet.balance <= 0) return false;
  const t = now.getTime();
  const since = (iso?: string) => (iso ? t - new Date(iso).getTime() : Infinity);
  // A brand new wallet, or one with recent cash spending, isn't asked about yet
  const quietFor = Math.min(since(lastCashSpendAt), since(wallet.createdAt));
  if (quietFor < QUIET_DAYS * DAY) return false;
  return since(wallet.countedAt) >= ASK_EVERY_DAYS * DAY;
}

/** After counting: the part that was spent without being recorded (0 when you have as much or more) */
export const unrecordedSpending = (walletBalance: number, counted: number) =>
  Math.max(0, Math.round((walletBalance - counted) * 100) / 100);

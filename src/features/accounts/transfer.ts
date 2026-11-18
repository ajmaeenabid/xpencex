import { writeBatch } from 'firebase/firestore';
import { db } from '../../shared/firebase';
import { saved } from '../../shared/lib/offlineSave';
import { Account } from '../../shared/types';
import { accountDisplayName } from './accounts';
import { changeBalance } from './accountService';
import { round2 } from '../../../ai-server/src/balanceLines';

/**
 * Money moved between two of your own accounts (bKash to the Cash wallet, bank to bKash...).
 * Both balances change, each with a history line. It isn't spending or income, so nothing else is saved.
 */

export type TransferProblem = 'pickFrom' | 'pickTo' | 'same' | 'amount';

/** Why a transfer can't be saved yet, or null when it can */
export function transferProblem(fromId: string | undefined, toId: string | undefined, amount: number, accounts: Pick<Account, 'id'>[]): TransferProblem | null {
  if (!fromId || !accounts.some(a => a.id === fromId)) return 'pickFrom';
  if (!toId || !accounts.some(a => a.id === toId)) return 'pickTo';
  if (fromId === toId) return 'same';
  if (!Number.isFinite(amount) || amount <= 0) return 'amount';
  return null;
}

/** The two history line titles, saved in English like other saved titles */
export const transferTitles = (from: Pick<Account, 'type' | 'name' | 'label'>, to: Pick<Account, 'type' | 'name' | 'label'>) => ({
  out: `To ${accountDisplayName(to)}`,
  in: `From ${accountDisplayName(from)}`,
});

export function transferMoney(from: Account, to: Account, amount: number) {
  const value = round2(amount);
  const titles = transferTitles(from, to);
  const batch = writeBatch(db);
  changeBalance(batch, from, -value, 'transferOut', titles.out);
  changeBalance(batch, to, value, 'transferIn', titles.in);
  return saved(batch.commit());
}

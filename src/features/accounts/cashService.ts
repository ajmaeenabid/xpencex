import { collection, doc, writeBatch } from 'firebase/firestore';
import { db } from '../../shared/firebase';
import { saved } from '../../shared/lib/offlineSave';
import { Account } from '../../shared/types';
import { round2 } from '../../../ai-server/src/balanceLines';
import { changeBalance, setBalance } from './accountService';
import { unrecordedSpending } from './cash';
import { CASH_NAME } from './accounts';

// The expense saved for cash that went without being recorded (English, like other saved titles)
export const UNRECORDED_TITLE = 'Cash spent, not recorded';

/** Makes the Cash wallet with the cash you have now (0 when skipped) */
export function createWallet(uid: string, balance: number) {
  const batch = writeBatch(db);
  const ref = doc(collection(db, 'accounts'));
  const now = new Date().toISOString();
  const amount = round2(Math.max(0, balance));
  batch.set(ref, { uid, type: 'cash', name: CASH_NAME, label: 'Wallet', balance: amount, historySum: amount, createdAt: now, countedAt: now });
  batch.set(doc(collection(db, 'balanceHistory')), { uid, accountId: ref.id, kind: 'set', amount, reason: 'created', at: now });
  return saved(batch.commit());
}

/** "Yes, I still have it": only notes the time, so the question waits another week */
export function confirmCash(wallet: Account) {
  const batch = writeBatch(db);
  batch.update(doc(db, 'accounts', wallet.id), { countedAt: new Date().toISOString() });
  return saved(batch.commit());
}

/**
 * You counted your cash. Less than the wallet says: the difference is saved as an expense, "Cash spent,
 * not recorded". More: the wallet is corrected up. Either way the question waits another week.
 */
export function countCash(wallet: Account, counted: number) {
  const batch = writeBatch(db);
  const now = new Date().toISOString();
  const missing = unrecordedSpending(wallet.balance, counted);
  if (missing > 0) {
    batch.set(doc(collection(db, 'expenses')), {
      uid: wallet.uid, title: UNRECORDED_TITLE, amount: missing, category: 'Other', date: now, notes: '',
      accountId: wallet.id, accountName: CASH_NAME, createdAt: now,
    });
    changeBalance(batch, wallet, -missing, 'expense', UNRECORDED_TITLE);
  } else if (round2(counted) > round2(wallet.balance)) {
    setBalance(batch, wallet, round2(counted), 'corrected');
  }
  batch.update(doc(db, 'accounts', wallet.id), { countedAt: now });
  return saved(batch.commit());
}

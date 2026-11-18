import { collection, doc, getDoc, getDocs, query, updateDoc, where, writeBatch } from 'firebase/firestore';
import { format } from 'date-fns';
import { db } from '../../shared/firebase';
import { callWorker } from '../../shared/lib/workerApi';
import { downloadFile } from '../reports/reportExport';
import { receiptLinks } from '../receipts/receiptDrive';
import { BACKUP_COLLECTIONS, BackupCollection, BackupData, planRestore, readBackup, writeBackup } from './backup';

/** All of the user's data, as it goes into a backup (also used for "Export everything" to Sheets) */
export async function collectBackup(uid: string): Promise<BackupData> {
  const data = {} as BackupData['data'];
  for (const c of BACKUP_COLLECTIONS) {
    const snap = await getDocs(query(collection(db, c), where('uid', '==', uid)));
    data[c] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }
  const profile = (await getDoc(doc(db, 'users', uid))).data() || {};
  return {
    app: 'Xpences',
    version: 1,
    exportedAt: new Date().toISOString(),
    profile: { ...(profile.categoryBudgets && { categoryBudgets: profile.categoryBudgets }) },
    data,
  };
}

/** The backup file's text, locked when a password is given */
export const backupText = async (uid: string, password?: string) => writeBackup(await collectBackup(uid), password || undefined);

/** Downloads all of the user's data as one file, locked when a password is given */
export async function downloadBackup(uid: string, password?: string) {
  const text = await backupText(uid, password);
  downloadFile(`xpences-backup-${format(new Date(), 'yyyy-MM-dd')}.json`, text, 'application/json');
}

export interface RestoreResult {
  added: number; skipped: number; failed: number;
  receiptLinks: { expenseId: string; receiptId: string }[]; // expenses in the backup that point to a receipt
}

// Accounts first, so expenses, history and loans that point to them line up
const ORDER: BackupCollection[] = ['accounts', 'balanceHistory', 'expenses', 'deposits', 'recurring', 'categories', 'debts', 'funds', 'samities', 'chats', 'incomeRules', 'incomeCategories', 'reminders', 'templates', 'planned', 'categoryRules', 'shoppingLists', 'savedFilters'];
const BATCH = 100;

/** Adds everything in the backup that isn't in the app yet. Nothing already there is changed. */
export async function restoreBackup(uid: string, text: string, password?: string): Promise<RestoreResult> {
  const backup = await readBackup(text, password);

  const existing: Partial<Record<BackupCollection, Set<string>>> = {};
  for (const c of BACKUP_COLLECTIONS) {
    const snap = await getDocs(query(collection(db, c), where('uid', '==', uid)));
    existing[c] = new Set(snap.docs.map(d => d.id));
  }
  const plan = planRestore(backup, uid, existing);
  let added = 0, failed = 0;

  for (const c of ORDER) {
    const items = plan.write[c];
    for (let i = 0; i < items.length; i += BATCH) {
      const chunk = items.slice(i, i + BATCH);
      try {
        const batch = writeBatch(db);
        chunk.forEach(item => batch.set(doc(db, c, item.id), item.data));
        await batch.commit();
        added += chunk.length;
      } catch {
        // One refused item stops a whole batch, so try them one by one to save the rest
        for (const item of chunk) {
          try {
            const one = writeBatch(db);
            one.set(doc(db, c, item.id), item.data);
            await one.commit();
            added++;
          } catch (err) {
            console.error('Could not restore', c, item.id, err);
            failed++;
          }
        }
      }
    }
  }

  // Loans with installments paid can only be written by the AI server (firestore.rules)
  if (plan.write.loans.length) {
    try {
      const reply = await callWorker<{ restored: number; skipped: number }>('/account/restore-loans', {
        loans: plan.write.loans.map(l => ({ id: l.id, ...l.data })),
      });
      added += reply.restored;
      failed += reply.skipped;
    } catch (err) {
      console.error('Could not restore loans:', err);
      failed += plan.write.loans.length;
    }
  }

  // Category budgets: only the ones you don't have now
  const budgets = backup.profile?.categoryBudgets;
  if (budgets && typeof budgets === 'object') {
    const current = (await getDoc(doc(db, 'users', uid))).data()?.categoryBudgets || {};
    const missing = Object.fromEntries(Object.entries(budgets).filter(([k, v]) => !(k in current) && typeof v === 'number' && v > 0));
    if (Object.keys(missing).length) {
      try { await updateDoc(doc(db, 'users', uid), { categoryBudgets: { ...current, ...missing } }); added += Object.keys(missing).length; }
      catch (err) { console.error('Could not restore category budgets:', err); }
    }
  }

  return { added, skipped: plan.skipped, failed: failed + plan.invalid, receiptLinks: receiptLinks(backup.data.expenses as Record<string, unknown>[]) };
}

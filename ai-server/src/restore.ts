import { google, encodeFields, Plain } from './google';
import type { AdminEnv } from './admin';

// Restoring loans from a user's backup. The app can only create a loan with nothing paid
// (firestore.rules), because only this server records installments. So restored loans come here:
// each one is checked, must belong to one of the user's own accounts, and is only added if it isn't there.

type Json = (body: unknown, status?: number) => Response;
const MAX_LOANS = 200;
const ID = /^[A-Za-z0-9_-]{1,100}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.*Z?$/;

const str = (v: unknown, max: number, min = 0) => (typeof v === 'string' && v.length >= min && v.length <= max ? v : null);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** A loan from a backup, cleaned and given to `uid`, or null if anything is wrong with it */
export function cleanLoan(raw: unknown, uid: string): { id: string; data: Record<string, Plain> } | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === 'string' && ID.test(r.id) ? r.id : null;
  const accountId = str(r.accountId, 100, 1);
  const accountName = str(r.accountName, 120);
  const name = str(r.name, 60, 1);
  const total = num(r.total), remaining = num(r.remaining), installment = num(r.installment), day = num(r.day), paidCount = num(r.paidCount);
  const nextDueDate = typeof r.nextDueDate === 'string' && ISO.test(r.nextDueDate) ? r.nextDueDate : null;
  const createdAt = typeof r.createdAt === 'string' && ISO.test(r.createdAt) ? r.createdAt : null;
  const status = r.status === 'active' || r.status === 'paid' || r.status === 'stopped' ? r.status : null;
  if (!id || !accountId || accountName === null || !name || !nextDueDate || !createdAt || !status) return null;
  if (total === null || total <= 0 || remaining === null || remaining < 0 || remaining > total) return null;
  if (installment === null || installment <= 0 || day === null || !Number.isInteger(day) || day < 1 || day > 31) return null;
  if (paidCount === null || !Number.isInteger(paidCount) || paidCount < 0) return null;

  const data: Record<string, Plain> = { uid, accountId, accountName, name, total, remaining, installment, day, nextDueDate, status, paidCount, createdAt };
  const lender = str(r.lender, 60);
  if (lender) data.lender = lender;
  if (typeof r.lastPaidAt === 'string' && ISO.test(r.lastPaidAt)) data.lastPaidAt = r.lastPaidAt;
  if (num(r.lastPaidAmount) !== null) data.lastPaidAmount = r.lastPaidAmount as number;
  if (typeof r.lastPaidNegative === 'boolean') data.lastPaidNegative = r.lastPaidNegative;
  return { id, data };
}

/** POST /account/restore-loans { loans: [...] } → { restored, skipped } */
export async function handleRestoreLoans(uid: string, body: Record<string, unknown>, env: AdminEnv, json: Json) {
  if (!env.FIREBASE_SERVICE_ACCOUNT) return json({ error: 'The server is not set up.' }, 500);
  const list = Array.isArray(body.loans) ? body.loans.slice(0, MAX_LOANS) : [];
  const g = google(env.FIREBASE_SERVICE_ACCOUNT, env.FIREBASE_PROJECT_ID);
  let restored = 0, skipped = 0;
  const myAccounts = new Map<string, boolean>();

  for (const raw of list) {
    const loan = cleanLoan(raw, uid);
    if (!loan) { skipped++; continue; }
    // The account must be one of this user's own (restore the accounts first)
    const accountId = loan.data.accountId as string;
    if (!myAccounts.has(accountId)) {
      const account = await g.getTyped('accounts', accountId);
      myAccounts.set(accountId, account?.data.uid === uid);
    }
    if (!myAccounts.get(accountId)) { skipped++; continue; }
    try {
      // Only added when no loan with this id exists, so nothing is ever overwritten
      await g.commit([{ update: { name: g.docName('loans', loan.id), fields: encodeFields(loan.data) }, currentDocument: { exists: false } }]);
      restored++;
    } catch {
      skipped++;
    }
  }
  return json({ restored, skipped: skipped + Math.max(0, (Array.isArray(body.loans) ? body.loans.length : 0) - MAX_LOANS) });
}

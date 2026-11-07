import { google, encode, encodeFields, TypedDoc } from './google';
import { duePayments } from './loanDates';

type Google = ReturnType<typeof google>;

// The category installments are saved under (one of the app's built-in categories)
export const LOAN_CATEGORY = 'Loan payment';

/**
 * Takes every loan installment that has come due: from the account balance, as a "Loan payment"
 * expense, and off the loan. Runs every hour (cron) for everyone, and for one user when they open
 * the app. Each loan is written only if nobody changed it since it was read, so two runs at the
 * same moment can't take the same installment twice.
 */
export async function processDueLoans(g: Google, uid?: string, now = Date.now()): Promise<number> {
  const where = uid
    ? { fieldFilter: { field: { fieldPath: 'uid' }, op: 'EQUAL', value: { stringValue: uid } } }
    : { fieldFilter: { field: { fieldPath: 'nextDueDate' }, op: 'LESS_THAN_OR_EQUAL', value: { stringValue: new Date(now).toISOString() } } };
  const loans = (await g.query({ from: [{ collectionId: 'loans' }], where, limit: 500 }))
    .filter((l) => l.data.status === 'active' && typeof l.data.nextDueDate === 'string' && Date.parse(l.data.nextDueDate) <= now);

  let taken = 0;
  for (const loan of loans) {
    try {
      taken += await payLoan(g, loan, now);
    } catch (err) {
      // Most often another run got there first; the next run tries again if anything is still due
      console.error('Loan installment not taken', loan.id, err);
    }
  }
  return taken;
}

async function payLoan(g: Google, loan: TypedDoc, now: number): Promise<number> {
  const d = loan.data as {
    uid: string; accountId: string; accountName: string; name: string;
    remaining: number; installment: number; nextDueDate: string; day: number; paidCount?: number;
  };
  const { payments, remaining, next, paidOff } = duePayments(d, now);
  if (payments.length === 0) return 0;

  const onlyIfUnchanged = { currentDocument: { updateTime: loan.updateTime } };
  const account = await g.getTyped('accounts', d.accountId);
  if (!account) {
    // The account was deleted: stop the loan instead of charging nothing
    await g.commit([{ update: { name: loan.name, fields: encodeFields({ status: 'stopped' }) }, updateMask: { fieldPaths: ['status'] }, ...onlyIfUnchanged }]);
    return 0;
  }

  const total = Math.round(payments.reduce((s, p) => s + p.amount, 0) * 100) / 100;
  const last = payments[payments.length - 1];
  const loanUpdate = {
    remaining,
    nextDueDate: next,
    paidCount: (d.paidCount || 0) + payments.length,
    lastPaidAt: last.date,
    lastPaidAmount: last.amount,
    // Shown as a warning beside the loan
    lastPaidNegative: Number(account.data.balance) - total < 0,
    status: paidOff ? 'paid' : 'active',
  };

  await g.commit([
    ...payments.map((p) => ({
      update: {
        name: g.docName('expenses'),
        fields: encodeFields({
          uid: d.uid,
          title: `Loan payment: ${d.name}`.slice(0, 100),
          amount: p.amount,
          category: LOAN_CATEGORY,
          date: p.date,
          accountId: d.accountId,
          accountName: d.accountName,
          loanId: loan.id,
        }),
      },
      currentDocument: { exists: false },
    })),
    { transform: { document: account.name, fieldTransforms: [{ fieldPath: 'balance', increment: encode(-total) }] }, currentDocument: { exists: true } },
    { update: { name: loan.name, fields: encodeFields(loanUpdate) }, updateMask: { fieldPaths: Object.keys(loanUpdate) }, ...onlyIfUnchanged },
  ]);
  return payments.length;
}

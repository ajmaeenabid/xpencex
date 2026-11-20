// The fields each kind of item may have (security review item 7, 2026-11-20). firestore.rules holds the
// same lists (expenseFields() and the others); allowedFields.test.ts checks the two stay equal.
// Backup restore keeps only these, so an old backup with a field the app no longer uses still restores.

export const ALLOWED_FIELDS = {
  expenses: ['uid', 'title', 'amount', 'category', 'date', 'notes', 'split', 'recurringId', 'plannedId', 'loanId',
    'accountId', 'accountName', 'smsRef', 'fee', 'debtId', 'createdAt', 'feeling', 'receiptId', 'labels',
    'warrantyUntil', 'categoryKept'],
  accounts: ['uid', 'type', 'name', 'label', 'holderName', 'balance', 'deposit', 'nextDepositDate', 'createdAt',
    'historySum', 'countedAt'],
  deposits: ['uid', 'accountId', 'accountName', 'amount', 'date', 'title', 'source', 'smsRef', 'category', 'notes',
    'ruleId', 'transfer', 'labels'],
  incomeRules: ['uid', 'title', 'amount', 'category', 'day', 'nextDate', 'notes', 'accountId', 'accountName', 'createdAt'],
  recurring: ['uid', 'title', 'amount', 'category', 'frequency', 'nextDate', 'notes', 'accountId', 'accountName', 'createdAt'],
  categories: ['uid', 'name', 'icon', 'createdAt'],
  incomeCategories: ['uid', 'name', 'icon', 'createdAt'],
  chats: ['uid', 'title', 'messages', 'createdAt', 'updatedAt', 'pinned'],
  loans: ['uid', 'accountId', 'accountName', 'name', 'lender', 'total', 'remaining', 'installment', 'day',
    'nextDueDate', 'status', 'paidCount', 'lastPaidAt', 'lastPaidAmount', 'lastPaidNegative', 'createdAt'],
} as const;

export type FieldListed = keyof typeof ALLOWED_FIELDS;

/** The item with only its allowed fields, for kinds that have a list; other kinds come back unchanged */
export function keepAllowedFields(collection: string, data: Record<string, unknown>): Record<string, unknown> {
  const allowed = (ALLOWED_FIELDS as Record<string, readonly string[]>)[collection];
  if (!allowed) return data;
  return Object.fromEntries(Object.entries(data).filter(([key]) => allowed.includes(key)));
}

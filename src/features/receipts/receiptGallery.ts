import type { Receipt } from '../../shared/types';
import type { TKey } from '../../shared/i18n';
import { MAX_RECEIPTS } from './receiptFile';

// The Receipts section's list: which receipts show, in what order, and how full the 100 is. Plain, so it is tested.

export type ReceiptFilter = 'all' | 'chat' | 'add' | 'none';

export const RECEIPT_FILTERS: { id: ReceiptFilter; label: TKey }[] = [
  { id: 'all', label: 'receipts.filter.all' },
  { id: 'chat', label: 'receipts.filter.chat' },
  { id: 'add', label: 'receipts.filter.add' },
  { id: 'none', label: 'receipts.filter.none' },
];

/** The amber warning starts here */
export const NEARLY_FULL = 90;

/** Newest first */
export const newestFirst = (receipts: Receipt[]) => [...receipts].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

/**
 * Whether a receipt still belongs to an expense. `expenseExists` answers for the ids that were looked up;
 * an id it doesn't know yet counts as linked, so nothing jumps to "No expense" while it loads.
 */
export function hasExpense(receipt: Receipt, expenseExists: (id: string) => boolean | undefined) {
  if (!receipt.expenseId) return false;
  return expenseExists(receipt.expenseId) !== false;
}

export function filterReceipts(receipts: Receipt[], filter: ReceiptFilter, expenseExists: (id: string) => boolean | undefined) {
  const sorted = newestFirst(receipts);
  switch (filter) {
    case 'chat': return sorted.filter(r => r.source === 'chat');
    case 'add': return sorted.filter(r => r.source === 'add');
    case 'none': return sorted.filter(r => !hasExpense(r, expenseExists));
    default: return sorted;
  }
}

/** For the "37 of 100 used" bar */
export function usage(count: number) {
  const used = Math.min(count, MAX_RECEIPTS);
  return { used, max: MAX_RECEIPTS, percent: Math.round((used / MAX_RECEIPTS) * 100), nearlyFull: used >= NEARLY_FULL };
}

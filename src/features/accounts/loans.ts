import { Loan } from '../../shared/types';
import type { TKey } from '../../shared/i18n';

export interface LoanForm {
  name: string;
  lender: string;
  total: string;
  installment: string;
  day: string;
  addMoney: boolean;
  receiveInto: string; // account id the loan money goes into
}

/** First problem with the form, as a message key; null when it can be saved */
export function loanFormError(form: LoanForm, { needsLender, editingPaidLoan }: { needsLender: boolean; editingPaidLoan?: boolean }): TKey | null {
  const total = parseFloat(form.total);
  const installment = parseFloat(form.installment);
  if (!form.name.trim()) return 'loans.errorName';
  if (needsLender && !form.lender.trim()) return 'loans.errorLender';
  if (!editingPaidLoan && (!Number.isFinite(total) || total <= 0)) return 'loans.errorTotal';
  if (!Number.isFinite(installment) || installment <= 0) return 'loans.errorInstallment';
  if (!editingPaidLoan && installment > total) return 'loans.errorTooBig';
  if (form.addMoney && !form.receiveInto) return 'loans.errorReceive';
  return null;
}

/** Share of the loan already repaid, 0 to 100 */
export const loanProgress = (loan: Pick<Loan, 'total' | 'remaining'>) =>
  loan.total > 0 ? Math.min(100, Math.max(0, Math.round(((loan.total - loan.remaining) / loan.total) * 100))) : 0;

/** How many installments are left, counting a smaller last one */
export const installmentsLeft = (loan: Pick<Loan, 'remaining' | 'installment'>) =>
  loan.installment > 0 ? Math.ceil(Math.round(loan.remaining * 100) / Math.round(loan.installment * 100)) : 0;

/** Active loans soonest first */
export const activeLoans = (loans: Loan[]) =>
  loans.filter(l => l.status === 'active').sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate));

/** The amount the next installment will take (the last one is only what is left) */
export const nextAmount = (loan: Pick<Loan, 'remaining' | 'installment'>) => Math.min(loan.installment, loan.remaining);

import { useState } from 'react';
import { format } from 'date-fns';
import { AlertTriangle, ArrowDownToLine } from 'lucide-react';
import { Account, Loan } from '../../shared/types';
import { cn } from '../../shared/lib/utils';
import Select from '../../shared/components/Select';
import { useI18n } from '../../shared/i18n';
import { firstInstallmentDate } from '../../../ai-server/src/loanDates';
import { BANGLADESH_BANKS, accountDisplayName, isMobile } from './accounts';
import { DAY_OPTIONS } from './AccountForm';
import { LoanForm as LoanFormValues, loanFormError } from './loans';
import { createLoan, updateLoan } from './loanService';
import { btnPrimary, btnSecondary, card, hintClass, inputClass, labelClass, selectClass } from './ui';
import Combobox from '../../shared/components/Combobox';

interface Props {
  uid: string;
  account: Account; // the account the installments are taken from
  accounts: Account[];
  symbol: string;
  loan?: Loan; // editing this one; a new loan when missing
  // Numbers from the loan calculator. The total includes interest; `received` is the amount borrowed.
  calculated?: { total: number; installment: number; received: number };
  onDone: () => void;
  onSaved?: () => void; // when set, called after saving instead of onDone
}

/** Add or edit a loan against one account */
export default function LoanForm({ uid, account, accounts, symbol, loan, calculated, onDone, onSaved }: Props) {
  const { t, dateLocale } = useI18n();
  const mobile = isMobile(account.type);
  const [form, setForm] = useState<LoanFormValues>(() => loan
    ? { name: loan.name, lender: loan.lender || '', total: String(loan.total), installment: String(loan.installment), day: String(loan.day), addMoney: false, receiveInto: '' }
    : { name: '', lender: mobile ? '' : account.name, total: calculated ? String(calculated.total) : '', installment: calculated ? String(calculated.installment) : '', day: '1', addMoney: true, receiveInto: account.id });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const totalLocked = !!loan && loan.paidCount > 0;
  const set = (patch: Partial<LoanFormValues>) => { setForm(f => ({ ...f, ...patch })); setError(''); };
  const day = parseInt(form.day, 10);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = loanFormError(form, { needsLender: mobile, editingPaidLoan: totalLocked });
    if (problem) return setError(t(problem));
    const name = form.name.trim().replace(/\s+/g, ' ');
    const lender = form.lender.trim().replace(/\s+/g, ' ');
    const installment = parseFloat(form.installment);
    setSaving(true);
    try {
      if (loan) {
        await updateLoan(loan, { name, lender, installment, day, ...(!totalLocked && { total: parseFloat(form.total) }) });
      } else {
        await createLoan(uid, {
          account, name, lender, total: parseFloat(form.total), installment, day,
          receiveInto: form.addMoney ? accounts.find(a => a.id === form.receiveInto) : undefined,
          received: calculated?.received,
        });
      }
      (onSaved ?? onDone)();
    } catch (err) {
      console.error('Error saving loan:', err);
      setError(t('loans.errorSave'));
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <section className={cn(card, 'p-5 space-y-5')}>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass} htmlFor="loan-name">{t('loans.name')}</label>
            <input id="loan-name" className={inputClass} placeholder={t('loans.namePlaceholder')} maxLength={60} value={form.name} onChange={(e) => set({ name: e.target.value })} />
          </div>
          <div>
            <label className={labelClass} htmlFor="loan-lender">{t('loans.lender')}</label>
            <Combobox id="loan-lender" className={inputClass} placeholder={t('loans.lenderPlaceholder')} maxLength={60} value={form.lender} onChange={(lender) => set({ lender })} options={BANGLADESH_BANKS} />
          </div>
        </div>

        <div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass} htmlFor="loan-total">{t('loans.total', { symbol })}</label>
              <input id="loan-total" type="number" min="0.01" step="0.01" inputMode="decimal" placeholder="0" disabled={totalLocked} className={inputClass} value={form.total} onChange={(e) => set({ total: e.target.value })} />
            </div>
            <div>
              <label className={labelClass} htmlFor="loan-installment">{t('loans.installment', { symbol })}</label>
              <input id="loan-installment" type="number" min="0.01" step="0.01" inputMode="decimal" placeholder="0" className={inputClass} value={form.installment} onChange={(e) => set({ installment: e.target.value })} />
            </div>
          </div>
          <p className={hintClass}>{t(totalLocked ? 'loans.totalLocked' : 'loans.totalHint')}</p>
        </div>

        <div>
          <label className={labelClass} htmlFor="loan-day">{t('loans.day')}</label>
          <Select id="loan-day" ariaLabel={t('loans.day')} value={form.day} onChange={(d) => set({ day: d })} options={DAY_OPTIONS} className={selectClass} />
          {(!loan || loan.day !== day) && (
            <p className={hintClass}>
              {t('loans.firstOn', { date: format(new Date(firstInstallmentDate(day)), 'd MMM yyyy', { locale: dateLocale }) })}
              {day > 28 && t('accounts.shortMonths')}
            </p>
          )}
        </div>
      </section>

      {!loan && (
        <section className={cn(card, 'p-5 space-y-4')}>
          <label className="flex items-center justify-between gap-4 cursor-pointer">
            <span className="flex items-start gap-3">
              <span className="w-9 h-9 shrink-0 rounded-xl bg-teal-50 dark:bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center">
                <ArrowDownToLine size={18} />
              </span>
              <span>
                <span className="block text-sm font-bold text-foreground">{t('loans.addMoney')}</span>
                <span className="block text-[12px] text-muted font-medium">
                  {calculated ? t('loans.receivedHint', { amount: `${symbol}${calculated.received.toLocaleString()}` }) : t('loans.addMoneyHint')}
                </span>
              </span>
            </span>
            <input type="checkbox" className="w-5 h-5 shrink-0 accent-indigo-600" checked={form.addMoney} onChange={(e) => set({ addMoney: e.target.checked })} />
          </label>
          {form.addMoney && (
            <div>
              <label className={labelClass} htmlFor="loan-into">{t('loans.receiveInto')}</label>
              <Select
                id="loan-into"
                ariaLabel={t('loans.receiveInto')}
                value={form.receiveInto}
                onChange={(id) => set({ receiveInto: id })}
                options={accounts.map(a => ({ value: a.id, label: accountDisplayName(a) }))}
                className={selectClass}
              />
            </div>
          )}
        </section>
      )}

      {error && (
        <p role="alert" className="flex items-start gap-2 px-1 text-rose-600 dark:text-rose-400 text-xs font-bold">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" /> {error}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <button type="button" onClick={onDone} className={btnSecondary}>{t('common.cancel')}</button>
        <button type="submit" disabled={saving} className={btnPrimary}>
          {saving ? t('common.saving') : loan ? t('accounts.saveChanges') : t('loans.save')}
        </button>
      </div>
    </form>
  );
}

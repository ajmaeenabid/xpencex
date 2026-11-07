import { useState } from 'react';
import { collection, deleteField, doc, setDoc, updateDoc } from 'firebase/firestore';
import { format } from 'date-fns';
import { AlertTriangle, CalendarClock } from 'lucide-react';
import { db } from '../../shared/firebase';
import { Account, AccountType } from '../../shared/types';
import { cn } from '../../shared/lib/utils';
import Select from '../../shared/components/Select';
import { useI18n, TKey } from '../../shared/i18n';
import { BANGLADESH_BANKS, MOBILE_PROVIDERS, findDuplicate, firstDepositDate, isMobile } from './accounts';
import { btnPrimary, btnSecondary, card, hintClass, inputClass, labelClass, selectClass } from './ui';
import Combobox from '../../shared/components/Combobox';
import { saved } from '../../shared/lib/offlineSave';

export const DAY_OPTIONS = Array.from({ length: 31 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }));

// Bank is a word to translate; bKash, Nagad and Rocket are brand names
export const ACCOUNT_TYPES: { type: AccountType; name: string; key?: TKey }[] = [{ type: 'bank', name: 'Bank', key: 'accounts.bank' }, ...MOBILE_PROVIDERS];

interface Props {
  uid: string;
  accounts: Account[];
  symbol: string;
  account?: Account; // editing this one; a new account when missing
  onSaved: (accountId: string) => void;
  onCancel: () => void;
}

/** Add or edit a bank or mobile banking account */
export default function AccountForm({ uid, accounts, symbol, account, onSaved, onCancel }: Props) {
  const { t, dateLocale } = useI18n();
  const editing = !!account;
  const [form, setForm] = useState({
    type: account?.type || ('bank' as AccountType),
    bankName: account?.type === 'bank' ? account.name : '',
    holderName: account?.holderName || '',
    label: account?.label || '',
    balance: account ? String(account.balance) : '',
    hasDeposit: !!account?.deposit,
    depositAmount: account?.deposit ? String(account.deposit.amount) : '',
    depositDay: account?.deposit ? String(account.deposit.day) : '1',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const mobile = isMobile(form.type);
  const set = (patch: Partial<typeof form>) => { setForm(f => ({ ...f, ...patch })); setError(''); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = mobile ? MOBILE_PROVIDERS.find(p => p.type === form.type)!.name : form.bankName.trim().replace(/\s+/g, ' ');
    const label = form.label.trim().replace(/\s+/g, ' ');
    const balance = parseFloat(form.balance);

    if (!mobile && !name) return setError(t('accounts.errorBankName'));
    if (!mobile && !form.holderName.trim()) return setError(t('accounts.errorHolder'));
    if (!mobile && !label) return setError(t('accounts.errorType'));
    if (mobile && !/^\d{3}$/.test(label)) return setError(t('accounts.errorDigits'));
    if (!Number.isFinite(balance)) return setError(t('accounts.errorBalance'));

    let deposit: { amount: number; day: number } | null = null;
    if (!mobile && form.hasDeposit) {
      const amount = parseFloat(form.depositAmount);
      const day = parseInt(form.depositDay, 10);
      if (!Number.isFinite(amount) || amount <= 0) return setError(t('accounts.errorDeposit'));
      deposit = { amount, day };
    }

    if (findDuplicate(accounts, { type: form.type, name, label }, account?.id)) return setError(t('accounts.duplicate'));

    setSaving(true);
    try {
      if (account) {
        // Only reschedule when the deposit day changed or the deposit was just turned on
        const reschedule = deposit && (!account.deposit || account.deposit.day !== deposit.day);
        await saved(updateDoc(doc(db, 'accounts', account.id), {
          balance,
          ...(!mobile && { holderName: form.holderName.trim() }),
          ...(deposit
            ? { deposit, ...(reschedule && { nextDepositDate: firstDepositDate(deposit.day) }) }
            : { deposit: deleteField(), nextDepositDate: deleteField() }),
        }));
        onSaved(account.id);
      } else {
        const ref = doc(collection(db, 'accounts'));
        await saved(setDoc(ref, {
          uid,
          type: form.type,
          name,
          label,
          balance,
          ...(!mobile && { holderName: form.holderName.trim() }),
          ...(deposit && { deposit, nextDepositDate: firstDepositDate(deposit.day) }),
          createdAt: new Date().toISOString(),
        }));
        onSaved(ref.id);
      }
    } catch (err) {
      console.error('Error saving account:', err);
      setError(t('accounts.errorSave'));
      setSaving(false);
    }
  };

  const depositDay = parseInt(form.depositDay, 10);

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <section className={cn(card, 'p-5 space-y-5')}>
        <div>
          <p className={labelClass}>{t('accounts.kind')}</p>
          <div className="grid grid-cols-4 gap-1 p-1 bg-background/60 rounded-xl border border-card-border">
            {ACCOUNT_TYPES.map(type => (
              <button
                key={type.type}
                type="button"
                disabled={editing}
                aria-pressed={form.type === type.type}
                onClick={() => set({ type: type.type, label: '' })}
                className={cn(
                  'h-9 rounded-lg text-xs font-bold transition-colors disabled:cursor-not-allowed',
                  form.type === type.type ? 'bg-indigo-600 text-white shadow-sm' : 'text-muted hover:text-foreground disabled:opacity-50'
                )}
              >
                {type.key ? t(type.key) : type.name}
              </button>
            ))}
          </div>
          {editing && <p className={hintClass}>{t('accounts.kindLocked')}</p>}
        </div>

        {mobile ? (
          <div>
            <label className={labelClass} htmlFor="acc-digits">{t('accounts.lastDigits')}</label>
            <input
              id="acc-digits"
              inputMode="numeric"
              maxLength={3}
              placeholder="123"
              disabled={editing}
              className={inputClass}
              value={form.label}
              onChange={(e) => set({ label: e.target.value.replace(/\D/g, '') })}
            />
          </div>
        ) : (
          <>
            <div>
              <label className={labelClass} htmlFor="acc-bank">{t('accounts.bankName')}</label>
              <Combobox id="acc-bank" placeholder={t('accounts.bankPlaceholder')} disabled={editing} className={inputClass} value={form.bankName} onChange={(bankName) => set({ bankName })} options={BANGLADESH_BANKS} />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass} htmlFor="acc-holder">{t('accounts.holder')}</label>
                <input id="acc-holder" placeholder={t('accounts.holderPlaceholder')} className={inputClass} value={form.holderName} onChange={(e) => set({ holderName: e.target.value })} maxLength={60} />
              </div>
              <div>
                <label className={labelClass} htmlFor="acc-label">{t('accounts.type')}</label>
                <input id="acc-label" placeholder={t('accounts.typePlaceholder')} disabled={editing} className={inputClass} value={form.label} onChange={(e) => set({ label: e.target.value })} maxLength={40} />
              </div>
            </div>
          </>
        )}

        <div>
          <label className={labelClass} htmlFor="acc-balance">{t('accounts.balance', { symbol })}</label>
          <input id="acc-balance" type="number" step="0.01" inputMode="decimal" placeholder="0.00" className={inputClass} value={form.balance} onChange={(e) => set({ balance: e.target.value })} />
        </div>
      </section>

      {!mobile && (
        <section className={cn(card, 'p-5 space-y-4')}>
          <label className="flex items-center justify-between gap-4 cursor-pointer">
            <span className="flex items-start gap-3">
              <span className="w-9 h-9 shrink-0 rounded-xl bg-teal-50 dark:bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center">
                <CalendarClock size={18} />
              </span>
              <span>
                <span className="block text-sm font-bold text-foreground">{t('accounts.deposit')}</span>
                <span className="block text-[11px] text-muted font-medium">{t('accounts.depositHint')}</span>
              </span>
            </span>
            <input type="checkbox" className="w-5 h-5 shrink-0 accent-indigo-600" checked={form.hasDeposit} onChange={(e) => set({ hasDeposit: e.target.checked })} />
          </label>
          {form.hasDeposit && (
            <div className="grid grid-cols-2 gap-4 pt-1">
              <div>
                <label className={labelClass} htmlFor="acc-dep-amount">{t('add.amount')}</label>
                <input id="acc-dep-amount" type="number" min="0.01" step="0.01" inputMode="decimal" placeholder={`${symbol} 0`} className={inputClass} value={form.depositAmount} onChange={(e) => set({ depositAmount: e.target.value })} />
              </div>
              <div>
                <label className={labelClass} htmlFor="acc-dep-day">{t('accounts.day')}</label>
                <Select id="acc-dep-day" ariaLabel={t('accounts.day')} value={form.depositDay} onChange={(day) => set({ depositDay: day })} options={DAY_OPTIONS} className={selectClass} />
              </div>
              <p className={cn(hintClass, 'col-span-2 mt-0')}>
                {t('accounts.nextDeposit', { date: format(new Date(firstDepositDate(depositDay)), 'd MMM yyyy', { locale: dateLocale }) })}
                {depositDay > 28 && t('accounts.shortMonths')}
              </p>
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
        <button type="button" onClick={onCancel} className={btnSecondary}>{t('common.cancel')}</button>
        <button type="submit" disabled={saving} className={btnPrimary}>
          {saving ? t('common.saving') : editing ? t('accounts.saveChanges') : t('accounts.add')}
        </button>
      </div>
    </form>
  );
}

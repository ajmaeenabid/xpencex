import { useState } from 'react';
import { format } from 'date-fns';
import { Account } from '../../shared/types';
import { useI18n, TKey } from '../../shared/i18n';
import Combobox from '../../shared/components/Combobox';
import Select from '../../shared/components/Select';
import DateField from '../../shared/components/DateField';
import AccountPicker from '../accounts/AccountPicker';
import { btnPrimary, btnSecondary, hintClass, inputClass, labelClass, selectClass } from '../accounts/ui';
import { DEBT_KINDS, DebtKind, cleanPerson, isMoneyOut } from './debts';
import { addDebt } from './debtService';

export const KIND_TEXT: Record<DebtKind, TKey> = {
  lent: 'debts.kind.lent',
  gotBack: 'debts.kind.gotBack',
  borrowed: 'debts.kind.borrowed',
  paidBack: 'debts.kind.paidBack',
};

// The two ticks remember the last choice on this phone, so the next entry is quick
const CHOICES_KEY = 'xpencex.debtChoices';
interface Choices { moveAccount: boolean; spending: boolean; accountId?: string }
export function loadChoices(): Choices {
  try {
    const saved = JSON.parse(localStorage.getItem(CHOICES_KEY) || '{}');
    return { moveAccount: saved.moveAccount === true, spending: saved.spending === true, accountId: typeof saved.accountId === 'string' ? saved.accountId : undefined };
  } catch {
    return { moveAccount: false, spending: false };
  }
}
export function saveChoices(choices: Choices) {
  try { localStorage.setItem(CHOICES_KEY, JSON.stringify(choices)); } catch { /* storage blocked: just not remembered */ }
}

/** A new lend or borrow entry, with the two ticks: move the money through an account, and count it as spending */
export default function DebtForm({ uid, accounts, symbol, names, person: startPerson = '', kind: startKind = 'lent', amount: startAmount, onDone }: {
  uid: string;
  accounts: Account[];
  symbol: string;
  names: string[]; // people already in the list, offered as you type
  person?: string;
  kind?: DebtKind;
  amount?: number;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const remembered = loadChoices();
  const [person, setPerson] = useState(startPerson);
  const [kind, setKind] = useState<DebtKind>(startKind);
  const [amount, setAmount] = useState(startAmount ? String(startAmount) : '');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [note, setNote] = useState('');
  const [moveAccount, setMoveAccount] = useState(remembered.moveAccount && accounts.length > 0);
  const [accountId, setAccountId] = useState(accounts.some(a => a.id === remembered.accountId) ? remembered.accountId! : accounts[0]?.id || '');
  const [spending, setSpending] = useState(remembered.spending);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = cleanPerson(person);
    const value = parseFloat(amount);
    if (!name) return setError(t('debts.errorPerson'));
    if (!Number.isFinite(value) || value <= 0) return setError(t('debts.errorAmount'));
    const account = moveAccount ? accounts.find(a => a.id === accountId) : undefined;
    const iso = (date === format(new Date(), 'yyyy-MM-dd') ? new Date() : new Date(`${date}T12:00:00`)).toISOString();

    setSaving(true);
    setError('');
    try {
      await addDebt({ uid, person: name, kind, amount: Math.round(value * 100) / 100, date: iso, note, account, countAsSpending: spending && isMoneyOut(kind) });
      saveChoices({ moveAccount, spending, accountId });
      onDone();
    } catch (err) {
      console.error('Error saving lend or borrow entry:', err);
      setError(t('debts.errorSave'));
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="space-y-5">
      <div>
        <label className={labelClass} htmlFor="debt-person">{t('debts.person')}</label>
        <Combobox id="debt-person" value={person} onChange={setPerson} options={names} maxLength={60} placeholder={t('debts.personPlaceholder')} className={inputClass} />
      </div>

      <div>
        <label className={labelClass} htmlFor="debt-kind">{t('debts.what')}</label>
        <Select id="debt-kind" value={kind} onChange={(v) => setKind(v as DebtKind)} options={DEBT_KINDS.map(k => ({ value: k, label: t(KIND_TEXT[k]) }))} className={selectClass} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass} htmlFor="debt-amount">{t('debts.amount', { symbol })}</label>
          <input id="debt-amount" type="number" step="0.01" min="0" inputMode="decimal" placeholder="0.00" className={inputClass} value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div>
          <span className={labelClass}>{t('debts.date')}</span>
          <DateField value={date} onChange={setDate} ariaLabel={t('debts.date')} />
        </div>
      </div>

      <div>
        <label className={labelClass} htmlFor="debt-note">{t('debts.note')}</label>
        <input id="debt-note" maxLength={200} className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('debts.notePlaceholder')} />
      </div>

      <div className="space-y-3 p-4 rounded-2xl bg-background/50 border border-card-border">
        <label className="flex items-start gap-3 cursor-pointer">
          <input type="checkbox" className="mt-0.5 w-4 h-4 shrink-0 accent-indigo-600" checked={moveAccount} disabled={accounts.length === 0} onChange={(e) => setMoveAccount(e.target.checked)} />
          <span className="text-sm font-semibold text-foreground">
            {t(isMoneyOut(kind) ? 'debts.takeFrom' : 'debts.addTo')}
            <span className="block text-[12px] text-muted font-medium">{t(accounts.length ? 'debts.moveHint' : 'debts.noAccounts')}</span>
          </span>
        </label>
        {moveAccount && accounts.length > 0 && (
          <AccountPicker compact includeCash={false} accounts={accounts} value={accountId} onChange={setAccountId} symbol={symbol} />
        )}
        {isMoneyOut(kind) && (
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" className="mt-0.5 w-4 h-4 shrink-0 accent-indigo-600" checked={spending} onChange={(e) => setSpending(e.target.checked)} />
            <span className="text-sm font-semibold text-foreground">
              {t('debts.countSpending')}
              <span className="block text-[12px] text-muted font-medium">{t('debts.countSpendingHint')}</span>
            </span>
          </label>
        )}
      </div>

      {error && <p role="alert" className="text-sm font-semibold text-rose-600 dark:text-rose-400">{error}</p>}
      <p className={hintClass}>{t('debts.formHint')}</p>

      <div className="grid grid-cols-2 gap-3">
        <button type="button" onClick={onDone} className={btnSecondary}>{t('common.cancel')}</button>
        <button type="submit" disabled={saving} className={btnPrimary}>{saving ? t('common.saving') : t('debts.save')}</button>
      </div>
    </form>
  );
}

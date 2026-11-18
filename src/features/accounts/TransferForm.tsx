import { useState } from 'react';
import { Account } from '../../shared/types';
import { useI18n, TKey } from '../../shared/i18n';
import { confirmDialog } from '../../shared/components/Dialog';
import AccountPicker from './AccountPicker';
import { accountDisplayName } from './accounts';
import { shortAccount } from './accountService';
import { TransferProblem, transferMoney, transferProblem } from './transfer';
import { btnPrimary, btnSecondary, hintClass, inputClass, labelClass } from './ui';

export const TRANSFER_PROBLEM_TEXT: Record<TransferProblem, TKey> = {
  pickFrom: 'transfer.pickFrom',
  pickTo: 'transfer.pickTo',
  same: 'transfer.same',
  amount: 'transfer.amountError',
};

/** Asks before a transfer would take the account below zero. False means the user said no. */
export async function okToTakeFrom(accounts: Account[], fromId: string, amount: number, t: ReturnType<typeof useI18n>['t'], symbol: string) {
  const short = shortAccount(accounts, fromId, amount);
  return !short || confirmDialog(t('add.lowBalance', { account: accountDisplayName(short), balance: `${symbol}${short.balance.toLocaleString()}` }));
}

/** Move money between two of your own accounts, by hand (My Accounts > Transfer) */
export default function TransferForm({ accounts, symbol, onDone }: { accounts: Account[]; symbol: string; onDone: () => void }) {
  const { t } = useI18n();
  const [fromId, setFromId] = useState(accounts[0]?.id || '');
  const [toId, setToId] = useState(accounts[1]?.id || '');
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = parseFloat(amount);
    const problem = transferProblem(fromId, toId, value, accounts);
    if (problem) return setError(t(TRANSFER_PROBLEM_TEXT[problem]));
    if (!(await okToTakeFrom(accounts, fromId, value, t, symbol))) return;
    setSaving(true);
    setError('');
    try {
      await transferMoney(accounts.find(a => a.id === fromId)!, accounts.find(a => a.id === toId)!, value);
      onDone();
    } catch (err) {
      console.error('Error moving money:', err);
      setError(t('transfer.errorSave'));
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="space-y-5">
      <div>
        <span className={labelClass}>{t('transfer.from')}</span>
        <AccountPicker compact includeCash={false} accounts={accounts} value={fromId} onChange={setFromId} symbol={symbol} />
      </div>
      <div>
        <span className={labelClass}>{t('transfer.to')}</span>
        <AccountPicker compact includeCash={false} accounts={accounts} value={toId} onChange={setToId} symbol={symbol} />
      </div>
      <div>
        <label className={labelClass} htmlFor="transfer-amount">{t('transfer.amount', { symbol })}</label>
        <input id="transfer-amount" type="number" step="0.01" min="0" inputMode="decimal" placeholder="0.00" className={inputClass} value={amount} onChange={(e) => setAmount(e.target.value)} />
      </div>

      {error && <p role="alert" className="text-sm font-semibold text-rose-600 dark:text-rose-400">{error}</p>}
      <p className={hintClass}>{t('transfer.hint')}</p>

      <div className="grid grid-cols-2 gap-3">
        <button type="button" onClick={onDone} className={btnSecondary}>{t('common.cancel')}</button>
        <button type="submit" disabled={saving} className={btnPrimary}>{saving ? t('common.saving') : t('transfer.save')}</button>
      </div>
    </form>
  );
}

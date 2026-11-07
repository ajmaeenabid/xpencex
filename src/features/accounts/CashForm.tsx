import { useState } from 'react';
import { writeBatch } from 'firebase/firestore';
import { db } from '../../shared/firebase';
import { saved } from '../../shared/lib/offlineSave';
import { Account } from '../../shared/types';
import { cn } from '../../shared/lib/utils';
import { useI18n } from '../../shared/i18n';
import { round2 } from '../../../ai-server/src/balanceLines';
import { setBalance } from './accountService';
import { btnPrimary, btnSecondary, card, hintClass, inputClass, labelClass } from './ui';

/** Editing the Cash wallet: only its balance, which shows in its history as "Corrected by you" */
export default function CashForm({ wallet, symbol, onSaved, onCancel }: { wallet: Account; symbol: string; onSaved: () => void; onCancel: () => void }) {
  const { t } = useI18n();
  const [balance, setValue] = useState(String(wallet.balance));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = parseFloat(balance);
    if (!Number.isFinite(value)) return setError(t('accounts.errorBalance'));
    if (round2(value) === round2(wallet.balance)) return onSaved();
    setSaving(true);
    try {
      const batch = writeBatch(db);
      setBalance(batch, wallet, round2(value), 'corrected');
      await saved(batch.commit());
      onSaved();
    } catch (err) {
      console.error('Error saving the cash wallet:', err);
      setError(t('accounts.errorSave'));
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="space-y-5">
      <section className={cn(card, 'p-5 space-y-2')}>
        <label className={labelClass} htmlFor="cash-balance">{t('cash.inHand', { symbol })}</label>
        <input id="cash-balance" type="number" step="0.01" inputMode="decimal" className={inputClass} value={balance} onChange={(e) => { setValue(e.target.value); setError(''); }} />
        <p className={hintClass}>{t('cash.editHint')}</p>
      </section>
      {error && <p role="alert" className="px-1 text-rose-600 dark:text-rose-400 text-xs font-bold">{error}</p>}
      <div className="grid grid-cols-2 gap-3">
        <button type="button" onClick={onCancel} className={btnSecondary}>{t('common.cancel')}</button>
        <button type="submit" disabled={saving} className={btnPrimary}>{saving ? t('common.saving') : t('debts.save')}</button>
      </div>
    </form>
  );
}

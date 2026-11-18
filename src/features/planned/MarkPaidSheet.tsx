import { useState } from 'react';
import { format } from 'date-fns';
import { CheckCircle2 } from 'lucide-react';
import { useI18n } from '../../shared/i18n';
import type { Account } from '../../shared/types';
import DetailSheet from '../../shared/components/DetailSheet';
import DateField from '../../shared/components/DateField';
import { alertDialog, confirmDialog } from '../../shared/components/Dialog';
import { CASH_ID, accountDisplayName } from '../accounts/accounts';
import AccountPicker from '../accounts/AccountPicker';
import { paymentFields, shortAccount } from '../accounts/accountService';
import { btnPrimary, inputClass, labelClass } from '../accounts/ui';
import { IconBox } from '../home/TapCard';
import type { Planned } from './planned';
import { markPlannedDone } from './plannedService';

/** The short check before a planned payment is recorded: amount, date and account can still be corrected */
export default function MarkPaidSheet({ plan, accounts, symbol, onClose }: { plan: Planned; accounts: Account[]; symbol: string; onClose: () => void }) {
  const { t } = useI18n();
  const income = plan.kind === 'income';
  const [amount, setAmount] = useState(String(plan.amount));
  const [day, setDay] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [accountId, setAccountId] = useState(plan.accountId || (income ? '' : CASH_ID));
  const [busy, setBusy] = useState(false);
  const value = parseFloat(amount);

  const save = async () => {
    if (!(value > 0) || busy) return;
    if (!income) {
      const short = shortAccount(accounts, paymentFields(accountId, accounts).accountId, value);
      if (short && !(await confirmDialog(t('add.lowBalance', { account: accountDisplayName(short), balance: `${symbol}${short.balance.toLocaleString()}` })))) return;
    }
    setBusy(true);
    try {
      await markPlannedDone(plan, { amount: value, day, accountId: accountId || undefined }, accounts);
      onClose();
    } catch (err) {
      console.error('Could not record the planned payment:', err);
      alertDialog(t('planned.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <DetailSheet
      open
      onClose={onClose}
      icon={<IconBox Icon={CheckCircle2} tone="good" size="lg" />}
      title={plan.title}
      about={t(income ? 'planned.confirmReceived' : 'planned.confirmPaid')}
      footer={<button onClick={save} disabled={busy || !(value > 0)} className={`${btnPrimary} w-full`}>{t(busy ? 'common.saving' : income ? 'planned.markReceived' : 'planned.markPaid')}</button>}
    >
      <div>
        <label htmlFor="planned-paid-amount" className={labelClass}>{t('add.amount')}</label>
        <input id="planned-paid-amount" type="number" min="0" step="0.01" inputMode="decimal" className={inputClass} value={amount} onChange={e => setAmount(e.target.value)} />
      </div>
      <div>
        <span className={labelClass}>{t('add.date')}</span>
        <DateField value={day} onChange={setDay} ariaLabel={t('add.date')} />
      </div>
      {(accounts.length > 0 || !income) && (
        <div>
          <span className={labelClass}>{t(income ? 'planned.receivedIn' : 'add.paidFrom')}</span>
          <AccountPicker accounts={accounts} value={accountId} onChange={setAccountId} symbol={symbol} includeCash={!income} compact />
        </div>
      )}
    </DetailSheet>
  );
}

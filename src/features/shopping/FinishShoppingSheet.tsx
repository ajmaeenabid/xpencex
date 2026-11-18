import { useState } from 'react';
import { format } from 'date-fns';
import { ShoppingCart } from 'lucide-react';
import { DEFAULT_CATEGORIES } from '../../shared/constants';
import { categoryLabel, useI18n } from '../../shared/i18n';
import { containsSecret } from '../../shared/lib/sensitiveData';
import type { Account } from '../../shared/types';
import DateField from '../../shared/components/DateField';
import DetailSheet from '../../shared/components/DetailSheet';
import { alertDialog, confirmDialog } from '../../shared/components/Dialog';
import Select from '../../shared/components/Select';
import { CASH_ID, accountDisplayName } from '../accounts/accounts';
import AccountPicker from '../accounts/AccountPicker';
import { paymentFields, shortAccount } from '../accounts/accountService';
import { btnPrimary, inputClass, labelClass, selectClass } from '../accounts/ui';
import { ruleCategoryFor } from '../categoryRules/categoryRules';
import { useCategoryRules } from '../categoryRules/categoryRuleService';
import { IconBox } from '../home/TapCard';
import { useOwnCategories } from '../planned/plannedService';
import { ShoppingList, boughtNote, listTotals } from './shopping';
import { finishShopping } from './shoppingService';

/** The last check before the ticked items become one expense */
export default function FinishShoppingSheet({ list, accounts, symbol, onClose }: { list: ShoppingList; accounts: Account[]; symbol: string; onClose: () => void }) {
  const { t } = useI18n();
  const own = useOwnCategories(list.uid);
  const rules = useCategoryRules(list.uid);
  const names = [...new Set([...DEFAULT_CATEGORIES.map(c => c.name), ...own])];
  const totals = listTotals(list.items);
  const [title, setTitle] = useState(list.name);
  const [amount, setAmount] = useState(totals.spent > 0 ? String(totals.spent) : '');
  const [picked, setPicked] = useState<string | null>(null);
  const [day, setDay] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [accountId, setAccountId] = useState(CASH_ID);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const category = picked || ruleCategoryFor(title, rules, names) || 'Food';
  const value = parseFloat(amount);

  const save = async () => {
    if (containsSecret(title)) { setError(t('secret.warning')); return; }
    if (!title.trim()) { setError(t('planned.problem.title')); return; }
    if (!(value > 0)) { setError(t('add.errorAmount')); return; }
    setError('');
    const short = shortAccount(accounts, paymentFields(accountId, accounts).accountId, value);
    if (short && !(await confirmDialog(t('add.lowBalance', { account: accountDisplayName(short), balance: `${symbol}${short.balance.toLocaleString()}` })))) return;
    setBusy(true);
    try {
      await finishShopping(list, { title, amount: value, category, day, accountId }, accounts);
      onClose();
    } catch (err) {
      console.error('Could not save the shopping:', err);
      alertDialog(t('shopping.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <DetailSheet
      open
      onClose={onClose}
      icon={<IconBox Icon={ShoppingCart} tone="good" size="lg" />}
      title={t('shopping.finishTitle')}
      about={t('shopping.finishHint', { count: totals.bought })}
      footer={<button onClick={save} disabled={busy} className={`${btnPrimary} w-full`}>{t(busy ? 'common.saving' : 'shopping.saveExpense')}</button>}
    >
      <p className="text-xs font-medium text-muted leading-relaxed">{boughtNote(list.items)}</p>
      {totals.unpriced > 0 && <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">{t('shopping.unpriced', { count: totals.unpriced })}</p>}
      <div>
        <label htmlFor="shopping-title" className={labelClass}>{t('add.fieldTitle')}</label>
        <input id="shopping-title" maxLength={100} className={inputClass} value={title} onChange={e => setTitle(e.target.value)} />
      </div>
      <div>
        <label htmlFor="shopping-amount" className={labelClass}>{t('add.amount')} ({symbol})</label>
        <input id="shopping-amount" type="number" min="0" step="0.01" inputMode="decimal" className={inputClass} value={amount} onChange={e => setAmount(e.target.value)} />
      </div>
      <div>
        <span className={labelClass}>{t('add.category')}</span>
        <Select ariaLabel={t('add.category')} className={selectClass} value={category} onChange={setPicked} options={names.map(n => ({ value: n, label: categoryLabel(t, n) }))} />
      </div>
      <div>
        <span className={labelClass}>{t('add.date')}</span>
        <DateField value={day} onChange={setDay} ariaLabel={t('add.date')} />
      </div>
      <div>
        <span className={labelClass}>{t('add.paidFrom')}</span>
        <AccountPicker compact accounts={accounts} value={accountId} onChange={setAccountId} symbol={symbol} />
      </div>
      {error && <p role="alert" className="text-sm font-semibold text-rose-600 dark:text-rose-400">{error}</p>}
    </DetailSheet>
  );
}

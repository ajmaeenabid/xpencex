import { useState } from 'react';
import { ChevronRight, HandHeart } from 'lucide-react';
import { Account } from '../../shared/types';
import { useI18n } from '../../shared/i18n';
import { debtTotals } from './debts';
import { useDebts } from './debtService';
import DebtsWindow from './DebtsWindow';
import { CARD_SUB, CARD_TITLE } from '../../shared/lib/cardText';

/** Home card: what people owe you and what you owe; opens the Lend & borrow window */
export default function DebtsCard({ uid, accounts, symbol }: { uid: string; accounts: Account[]; symbol: string }) {
  const { t } = useI18n();
  const debts = useDebts(uid);
  const [open, setOpen] = useState(false);
  const { toGet, toGive } = debtTotals(debts);
  const money = (n: number) => `${symbol}${n.toLocaleString()}`;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-3 p-4 bg-card rounded-[2rem] shadow-soft border border-card-border text-left"
      >
        <div className="w-10 h-10 shrink-0 bg-indigo-50 dark:bg-indigo-500/10 rounded-xl flex items-center justify-center text-indigo-600 dark:text-indigo-400">
          <HandHeart size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <p className={CARD_TITLE}>{t('debts.title')}</p>
          {toGet > 0 || toGive > 0 ? (
            <p className={CARD_SUB}>
              {toGet > 0 && <span className="text-teal-600 dark:text-teal-400">{t('debts.cardGet', { amount: money(toGet) })}</span>}
              {toGet > 0 && toGive > 0 && ' · '}
              {toGive > 0 && <span className="text-rose-500">{t('debts.cardGive', { amount: money(toGive) })}</span>}
            </p>
          ) : (
            <p className={CARD_SUB}>{t('debts.cardEmpty')}</p>
          )}
        </div>
        <ChevronRight size={18} className="text-muted shrink-0" />
      </button>
      <DebtsWindow open={open} onClose={() => setOpen(false)} uid={uid} accounts={accounts} debts={debts} symbol={symbol} />
    </>
  );
}

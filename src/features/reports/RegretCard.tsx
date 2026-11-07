import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { ThumbsDown, ThumbsUp } from 'lucide-react';
import { db } from '../../shared/firebase';
import { Expense } from '../../shared/types';
import { useI18n, categoryLabel } from '../../shared/i18n';
import { MIN_REGRETS, regretSummary } from './regret';

/** Reports card: this month's worth-it vs regret spending, and the strongest pattern in your regrets */
export default function RegretCard({ uid, expenses, symbol }: { uid: string; expenses: Expense[]; symbol: string }) {
  const { t } = useI18n();
  // Money in (salary, allowance, received money), for the "week after money came in" pattern
  const [moneyIn, setMoneyIn] = useState<string[]>([]);
  useEffect(() => onSnapshot(query(collection(db, 'deposits'), where('uid', '==', uid)), snap => setMoneyIn(snap.docs.map(d => d.data().date as string))), [uid]);

  const s = useMemo(() => regretSummary(expenses, moneyIn), [expenses, moneyIn]);
  const money = (n: number) => `${symbol}${n.toLocaleString()}`;
  const percent = s.pattern ? Math.round(s.pattern.share * 100) : 0;
  const patternText = !s.pattern ? null
    : s.pattern.kind === 'night' ? t('regret.night', { percent })
    : s.pattern.kind === 'weekend' ? t('regret.weekend', { percent })
    : s.pattern.kind === 'afterMoneyIn' ? t('regret.afterMoneyIn', { percent })
    : t('regret.category', { percent, category: categoryLabel(t, s.pattern.category) });

  return (
    <div className="bg-card p-6 rounded-3xl shadow-sm border border-card-border space-y-4">
      <div>
        <h3 className="text-lg font-bold text-foreground">{t('regret.title')}</h3>
        <p className="text-xs text-muted font-medium">{t('regret.hint')}</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 rounded-xl bg-background/50">
          <p className="flex items-center gap-1.5 text-[11px] text-muted font-semibold"><ThumbsUp size={12} className="text-teal-600 dark:text-teal-400" /> {t('regret.worth')}</p>
          <p className="text-lg font-bold text-foreground tabular-nums">{money(s.worth)}</p>
        </div>
        <div className="p-3 rounded-xl bg-background/50">
          <p className="flex items-center gap-1.5 text-[11px] text-muted font-semibold"><ThumbsDown size={12} className="text-rose-500" /> {t('regret.regret')}</p>
          <p className="text-lg font-bold text-foreground tabular-nums">{money(s.regret)}</p>
        </div>
      </div>
      <p className="text-sm font-semibold text-foreground leading-relaxed">
        {patternText ?? (s.regretCount < MIN_REGRETS ? t('regret.needMore', { count: MIN_REGRETS - s.regretCount }) : t('regret.noPattern'))}
      </p>
    </div>
  );
}

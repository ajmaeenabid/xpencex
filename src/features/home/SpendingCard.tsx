import { motion } from 'motion/react';
import { useI18n, TKey } from '../../shared/i18n';
import { spendingLines, SpendingLine, LineStatus } from './spendingLines';

const LABEL: Record<SpendingLine['key'], TKey> = { today: 'home.today', week: 'home.thisWeek' };
// Same colours as the category budget bars on Home
const COLOR: Record<LineStatus, string> = { ok: 'bg-emerald-500', near: 'bg-amber-500', over: 'bg-rose-500' };

/** Spending today and this week, each as a line filled against its share of the budget */
export default function SpendingCard({ spent, budget, symbol, startDay = 1 }: { spent: { today: number; week: number; month: number }; budget: number; symbol: string; startDay?: number }) {
  const { t } = useI18n();
  return (
    <div className="bg-card p-6 rounded-[2.5rem] shadow-soft border border-card-border space-y-4">
      {spendingLines(spent, budget, new Date(), startDay).map(line => (
        <div key={line.key} className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-xs font-bold text-muted">{t(LABEL[line.key])}</p>
            <p className="text-sm font-bold tabular-nums text-foreground">
              {symbol}{Math.round(line.spent).toLocaleString()}
              {line.limit > 0 && <span className="text-xs font-semibold text-muted"> / {symbol}{line.limit.toLocaleString()}</span>}
            </p>
          </div>
          {/* Without a budget there is nothing to fill against, so only the amounts show */}
          {line.limit > 0 && <div
            className="h-2 rounded-full bg-background/80 border border-card-border overflow-hidden"
            role="progressbar"
            aria-label={t(LABEL[line.key])}
            aria-valuenow={line.percent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <motion.div
              className={`h-full rounded-full ${COLOR[line.status]}`}
              initial={{ width: 0 }}
              animate={{ width: `${line.percent}%` }}
              transition={{ duration: 0.8, ease: [0.23, 1, 0.32, 1] }}
            />
          </div>}
        </div>
      ))}
    </div>
  );
}

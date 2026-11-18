import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { moneyMonth } from '../../shared/lib/moneyMonth';
import { AlertTriangle, CalendarClock, CheckCircle2, Hourglass } from 'lucide-react';
import { Account, Expense } from '../../shared/types';
import { cn } from '../../shared/lib/utils';
import { useI18n } from '../../shared/i18n';
import DetailSheet, { DetailLine } from '../../shared/components/DetailSheet';
import { HIDDEN } from '../accounts/ui';
import { ROUGH_BELOW_DAYS, runway } from './runway';
import TapCard, { ChipTone, IconBox, TONE_CLASS } from './TapCard';

/** How long the money in your accounts lasts at your recent spending. Tap for the full picture. */
export default function RunwayCard({ accounts, expenses, symbol, userSince, shown, startDay = 1 }: {
  accounts: Account[];
  expenses: Expense[]; // Home's expenses, which start at the beginning of last month
  symbol: string;
  userSince?: Date;
  shown: boolean; // balances revealed on Home
  startDay?: number; // Home's expenses start at the beginning of last money month
}) {
  const { t, dateLocale } = useI18n();
  const [open, setOpen] = useState(false);
  const r = useMemo(
    () => runway({ accounts, expenses, userSince, dataSince: moneyMonth(new Date(), startDay, -1).start }),
    [accounts, expenses, userSince, startDay],
  );
  const money = (n: number) => `${symbol}${Math.round(n).toLocaleString()}`;
  // The year is added when it isn't this year, so "18 Dec" 400 days away isn't mistaken for this December
  const day = (d: Date) => format(d, d.getFullYear() === new Date().getFullYear() ? 'd MMM' : 'd MMM yyyy', { locale: dateLocale });

  const hasMoney = r.money > 0;
  const counting = hasMoney && r.days !== null;
  const headline = !hasMoney ? t('runway.empty') : r.days === null ? t('runway.noSpending') : t('runway.days', { days: r.days });
  const bad = !hasMoney || r.days === 0;

  // The small coloured label under the headline
  let chip: string | undefined;
  let tone: ChipTone = 'info';
  if (counting && r.nextDeposit) {
    chip = r.nextDeposit.lasts
      ? t('runway.chipLasts', { date: day(r.nextDeposit.date) })
      : t('runway.chipShort', { days: r.nextDeposit.shortByDays });
    tone = r.nextDeposit.lasts ? 'good' : 'warning';
  } else if (counting && r.runsOutOn && r.days! > 0) {
    chip = t('runway.chipRunsOut', { date: day(r.runsOutOn) });
    tone = r.days! <= 7 ? 'warning' : 'info';
  }
  if (bad) tone = 'danger';

  return (
    <>
      <TapCard
        Icon={Hourglass}
        iconTone={bad ? 'danger' : 'info'}
        label={t('runway.title')}
        headline={headline}
        headlineTone={bad ? 'bad' : undefined}
        chip={chip}
        chipTone={tone}
        chipIcon={tone === 'good' ? CheckCircle2 : tone === 'info' ? CalendarClock : AlertTriangle}
        onOpen={() => setOpen(true)}
      />

      <DetailSheet
        open={open}
        onClose={() => setOpen(false)}
        icon={<IconBox Icon={Hourglass} tone={bad ? 'danger' : 'info'} size="lg" />}
        title={t('runway.title')}
        about={t('runway.about')}
      >
        <p className={cn('text-2xl font-bold', bad ? 'text-rose-500' : 'text-foreground')}>{headline}</p>

        <DetailLine label={t('runway.lineMoney')} value={shown ? money(r.money) : `${symbol}${HIDDEN}`} tone={r.money <= 0 ? 'bad' : undefined} />
        {counting && <DetailLine label={t('runway.linePerDay')} value={t('runway.perDay', { amount: money(r.perDay) })} />}
        {counting && r.runsOutOn && r.days! > 0 && <DetailLine label={t('runway.lineRunsOut')} value={day(r.runsOutOn)} />}

        {hasMoney && r.nextDeposit && (
          <p className={cn('text-sm font-semibold leading-relaxed p-3 rounded-xl', TONE_CLASS[r.nextDeposit.lasts ? 'good' : 'warning'])}>
            {r.nextDeposit.lasts
              ? t('runway.lasts', { date: day(r.nextDeposit.date), safe: money(r.nextDeposit.safePerDay) })
              : t('runway.short', { days: r.nextDeposit.shortByDays, date: day(r.nextDeposit.date), safe: money(r.nextDeposit.safePerDay) })}
          </p>
        )}

        {r.days !== null && r.basedOnDays < ROUGH_BELOW_DAYS && (
          <p className="text-xs text-muted font-medium">{t('runway.rough', { days: r.basedOnDays })}</p>
        )}
        {!shown && hasMoney && <p className="text-xs text-muted font-medium">{t('runway.hiddenHint')}</p>}
      </DetailSheet>
    </>
  );
}

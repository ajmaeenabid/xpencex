import { useState } from 'react';
import { differenceInCalendarDays, format } from 'date-fns';
import { AlertTriangle, CalendarClock, HandCoins } from 'lucide-react';
import { Loan } from '../../shared/types';
import { useI18n } from '../../shared/i18n';
import DetailSheet from '../../shared/components/DetailSheet';
import { nextAmount } from '../accounts/loans';
import TapCard, { ChipTone, IconBox, TONE_CLASS } from './TapCard';

// A payment this close shows as a warning
const SOON_DAYS = 3;

/** The next loan payment on Home. Tap to see every active loan. */
export default function NextLoanCard({ loans, symbol, onManage }: {
  loans: Loan[]; // active loans, soonest first
  symbol: string;
  onManage?: () => void;
}) {
  const { t, dateLocale } = useI18n();
  const [open, setOpen] = useState(false);
  const money = (n: number) => `${symbol}${n.toLocaleString()}`;
  const day = (iso: string) => format(new Date(iso), 'd MMM', { locale: dateLocale });

  const dueIn = (loan: Loan) => differenceInCalendarDays(new Date(loan.nextDueDate), new Date());
  const whenText = (days: number) =>
    days <= 0 ? t('loans.dueToday') : days === 1 ? t('loans.dueTomorrow') : t('loans.dueInDays', { days });
  const toneFor = (days: number): ChipTone => (days <= SOON_DAYS ? 'warning' : 'info');

  const next = loans[0];
  if (!next) return null;
  const nextDays = dueIn(next);

  return (
    <>
      <TapCard
        Icon={HandCoins}
        iconTone="warning"
        label={t('loans.homeTitle')}
        headline={t('loans.homeHeadline', { amount: money(nextAmount(next)), date: day(next.nextDueDate) })}
        chip={`${next.name} · ${whenText(nextDays)}`}
        chipTone={toneFor(nextDays)}
        chipIcon={nextDays <= SOON_DAYS ? AlertTriangle : CalendarClock}
        onOpen={() => setOpen(true)}
      />

      <DetailSheet
        open={open}
        onClose={() => setOpen(false)}
        icon={<IconBox Icon={HandCoins} tone="warning" size="lg" />}
        title={t('loans.homeTitle')}
        about={t('loans.homeAbout')}
        footer={onManage && (
          <button onClick={() => { setOpen(false); onManage(); }} className="w-full py-3 bg-indigo-600 text-white rounded-xl text-sm font-bold">
            {t('loans.manage')}
          </button>
        )}
      >
        {loans.map(loan => {
          const days = dueIn(loan);
          return (
            <div key={loan.id} className="p-4 rounded-2xl bg-background/50 border border-card-border space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold text-sm text-foreground truncate">{loan.name}</p>
                  {loan.lender && <p className="text-[11px] text-muted font-medium truncate">{loan.lender}</p>}
                </div>
                <p className="font-bold text-lg text-foreground tabular-nums shrink-0">{money(nextAmount(loan))}</p>
              </div>
              <p className="text-xs text-muted font-medium">{t('loans.homeWhen', { date: day(loan.nextDueDate), account: loan.accountName })}</p>
              <div className="flex flex-wrap gap-2">
                <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${TONE_CLASS[toneFor(days)]}`}>{whenText(days)}</span>
                <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-background text-muted border border-card-border">
                  {t('loans.homeLeft', { amount: money(loan.remaining) })}
                </span>
              </div>
            </div>
          );
        })}
      </DetailSheet>
    </>
  );
}

import { useState } from 'react';
import { CalendarClock, CheckCircle2, PiggyBank } from 'lucide-react';
import { useI18n } from '../../shared/i18n';
import TapCard, { ChipTone } from '../home/TapCard';
import { fundPlan, goalStage, sortFunds } from './funds';
import { useFunds } from './fundService';
import FundsWindow from './FundsWindow';

/** Home row for savings goals: the nearest goal at a glance. Tap to open the Savings goals window. */
export default function FundsCard({ uid, symbol }: { uid: string; symbol: string }) {
  const { t } = useI18n();
  const funds = sortFunds(useFunds(uid));
  const [open, setOpen] = useState(false);
  const money = (n: number) => `${symbol}${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  // Goals still in progress come first; paused goals never show here
  const nearest = funds.find(f => goalStage(f) === 'active') ?? funds.find(f => goalStage(f) === 'reached');
  const plan = nearest && fundPlan(nearest);

  let chip: string | undefined;
  let tone: ChipTone = 'info';
  if (nearest && plan) {
    if (plan.reached) { chip = t('funds.dayReached'); tone = 'good'; }
    else if (!plan.passed) { chip = plan.daysLeft === 0 ? t('funds.dayToday') : t('funds.daysLeft', { days: plan.daysLeft }); tone = plan.daysLeft <= 14 ? 'warning' : 'info'; }
  }

  return (
    <>
      <TapCard
        Icon={PiggyBank}
        iconTone="warning"
        label={t('funds.title')}
        headline={nearest ? t('funds.progress', { name: nearest.name, saved: money(nearest.saved), target: money(nearest.target) }) : t('funds.empty')}
        chip={chip}
        chipTone={tone}
        chipIcon={tone === 'good' ? CheckCircle2 : CalendarClock}
        onOpen={() => setOpen(true)}
      />
      <FundsWindow open={open} onClose={() => setOpen(false)} uid={uid} funds={funds} symbol={symbol} />
    </>
  );
}

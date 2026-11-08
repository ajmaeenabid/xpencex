import { useState } from 'react';
import { format } from 'date-fns';
import { AlertTriangle, CheckCircle2, Gift, Users } from 'lucide-react';
import { Account } from '../../shared/types';
import { useI18n } from '../../shared/i18n';
import TapCard, { ChipTone } from '../home/TapCard';
import { samityStatus } from './samity';
import { useSamities } from './samityService';
import SamityWindow from './SamityWindow';

/** Home row for samities: the next payment, and anything not ticked. Tap to open the Samity window. */
export default function SamityCard({ uid, accounts, symbol }: { uid: string; accounts: Account[]; symbol: string }) {
  const { t, dateLocale } = useI18n();
  const all = useSamities(uid);
  const list = [...all].sort((a, b) => Number(samityStatus(a).finished) - Number(samityStatus(b).finished) || a.createdAt.localeCompare(b.createdAt));
  const [open, setOpen] = useState(false);
  const money = (n: number) => `${symbol}${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  const day = (d: Date) => format(d, 'd MMM', { locale: dateLocale });

  // The soonest payment across every samity
  const next = list
    .map(s => ({ s, due: samityStatus(s).nextUnpaid }))
    .filter(x => x.due)
    .sort((a, b) => a.due!.date.getTime() - b.due!.date.getTime())[0];
  const late = list.reduce((sum, s) => sum + samityStatus(s).overdue, 0);
  const allDone = list.length > 0 && list.every(s => samityStatus(s).finished);

  let chip: string | undefined;
  let tone: ChipTone = 'info';
  let ChipIcon = Gift;
  if (late > 0) { chip = t('samity.chipLate', { count: late }); tone = 'danger'; ChipIcon = AlertTriangle; }
  else if (allDone) { chip = t('samity.chipDone'); tone = 'good'; ChipIcon = CheckCircle2; }
  else if (next && !next.s.payout) { chip = t('samity.chipPotNamed', { name: next.s.name, n: next.s.myTurn }); }

  const headline = list.length === 0
    ? t('samity.empty')
    : next ? t('samity.homeNext', { amount: money(next.s.amount), name: next.s.name, date: day(next.due!.date) })
      : t('samity.allPaid');

  return (
    <>
      <TapCard
        Icon={Users}
        label={t('samity.title')}
        headline={headline}
        chip={chip}
        chipTone={tone}
        chipIcon={ChipIcon}
        onOpen={() => setOpen(true)}
      />
      <SamityWindow open={open} onClose={() => setOpen(false)} uid={uid} list={list} accounts={accounts} symbol={symbol} />
    </>
  );
}

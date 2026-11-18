import { useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { format, subDays } from 'date-fns';
import { useAuth } from '../../app/App';
import { useI18n } from '../../shared/i18n';
import { db } from '../../shared/firebase';
import { saved } from '../../shared/lib/offlineSave';
import { cleanStartDay, moneyMonth } from '../../shared/lib/moneyMonth';
import Select from '../../shared/components/Select';

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

/**
 * Profile: the day the money month starts (e.g. salary day). Every "this month" in the app follows it
 * (shared/lib/moneyMonth.ts). The AI can change it too, with a settings card.
 */
export default function MonthStartCard() {
  const { user, profile, refreshProfile } = useAuth();
  const { t, dateLocale } = useI18n();
  const startDay = cleanStartDay(profile?.monthStart);
  const [busy, setBusy] = useState(false);
  const { start, end } = moneyMonth(new Date(), startDay);
  const range = `${format(start, 'd MMM', { locale: dateLocale })} – ${format(subDays(end, 1), 'd MMM', { locale: dateLocale })}`;

  const choose = async (value: string) => {
    const day = Number(value);
    if (!user || day === startDay) return;
    setBusy(true);
    try {
      await saved(updateDoc(doc(db, 'users', user.uid), { monthStart: day }));
      await refreshProfile();
    } catch (err) {
      console.error('Could not save the month start day', err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-card p-6 rounded-3xl shadow-sm border border-card-border space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 shrink-0 bg-indigo-50 dark:bg-indigo-500/10 rounded-xl flex items-center justify-center text-indigo-600 dark:text-indigo-400">
          <CalendarDays size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-foreground">{t('monthStart.title')}</h3>
          <p className="text-xs text-muted font-medium">{t('monthStart.now', { range })}</p>
        </div>
        <div className="w-24 shrink-0">
          <Select
            value={String(startDay)}
            onChange={choose}
            ariaLabel={t('monthStart.title')}
            options={DAYS.map(d => ({ value: String(d), label: t('monthStart.day', { day: d }) }))}
          />
        </div>
      </div>
      <p className="text-xs text-muted leading-relaxed">{t(busy ? 'common.saving' : startDay > 28 ? 'monthStart.hintShort' : 'monthStart.hint')}</p>
    </div>
  );
}

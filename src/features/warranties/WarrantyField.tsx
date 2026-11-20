import { useEffect, useState } from 'react';
import { addYears, format } from 'date-fns';
import { ShieldCheck } from 'lucide-react';
import { useI18n } from '../../shared/i18n';
import { cn } from '../../shared/lib/utils';
import DateField from '../../shared/components/DateField';
import { WARRANTY_PRESETS, warrantyEnd, warrantyOnDay } from './warranties';
import { CHOICE_ON } from '../../shared/lib/choice';

type Mode = 'none' | 'date' | (typeof WARRANTY_PRESETS)[number];

/** The optional warranty on an expense: none, 6 months, 1 year, 2 years, or a chosen end date */
export default function WarrantyField({ purchaseDay, value, onChange }: {
  purchaseDay: string; // yyyy-MM-dd
  value: string | null; // ISO
  onChange: (until: string | null) => void;
}) {
  const { t, dateLocale } = useI18n();
  const [mode, setMode] = useState<Mode>(value ? 'date' : 'none');
  const [day, setDay] = useState(format(value ? new Date(value) : addYears(new Date(`${purchaseDay}T12:00:00`), 1), 'yyyy-MM-dd'));

  // A length follows the purchase date when that changes
  useEffect(() => {
    if (typeof mode === 'number') onChange(warrantyEnd(`${purchaseDay}T12:00:00`, mode));
  }, [purchaseDay, mode]);

  const pick = (next: Mode) => {
    setMode(next);
    if (next === 'none') onChange(null);
    if (next === 'date') onChange(warrantyOnDay(day));
  };

  const chips: { id: Mode; label: string }[] = [
    { id: 'none', label: t('warranty.none') },
    { id: 6, label: t('warranty.months6') },
    { id: 12, label: t('warranty.year1') },
    { id: 24, label: t('warranty.years2') },
    { id: 'date', label: t('warranty.chooseDate') },
  ];

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-muted px-1 flex items-center gap-2"><ShieldCheck size={12} /> {t('warranty.optional')}</p>
      <div className="flex flex-wrap gap-2">
        {chips.map(chip => (
          <button key={chip.id} type="button" onClick={() => pick(chip.id)} aria-pressed={mode === chip.id}
            className={cn('px-3 py-2 rounded-xl text-xs font-bold border transition-colors', mode === chip.id ? CHOICE_ON : 'bg-background/50 text-muted border-card-border')}>
            {chip.label}
          </button>
        ))}
      </div>
      {mode === 'date' && <DateField value={day} onChange={d => { setDay(d); onChange(warrantyOnDay(d)); }} ariaLabel={t('warranty.endsOn')} />}
      {value && mode !== 'date' && (
        <p className="text-[12px] text-muted font-medium px-1">{t('warranty.ends', { date: format(new Date(value), 'd MMM yyyy', { locale: dateLocale }) })}</p>
      )}
    </div>
  );
}

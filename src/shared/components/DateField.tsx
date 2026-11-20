import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, startOfMonth, startOfWeek } from 'date-fns';
import type { Locale } from 'date-fns';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../lib/utils';
import { useI18n } from '../i18n';
import { useBackClose } from '../lib/backButton';

interface Props {
  value: string; // yyyy-MM-dd
  onChange: (value: string) => void;
  ariaLabel: string;
  className?: string;
}

/** Noon, so a time zone can never tip the date into the day before or after */
export const dateFromValue = (value: string) => new Date(`${value}T12:00:00`);

/** Every day to show for a month, starting and ending on full weeks */
export function monthGrid(month: Date, locale?: Locale): Date[] {
  return eachDayOfInterval({
    start: startOfWeek(startOfMonth(month), { locale }),
    end: endOfWeek(endOfMonth(month), { locale }),
  });
}

/** A date box with the app's own calendar. The browser's date picker can't be themed. */
export default function DateField({ value, onChange, ariaLabel, className }: Props) {
  const { t, dateLocale } = useI18n();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => startOfMonth(dateFromValue(value)));
  const buttonRef = useRef<HTMLButtonElement>(null);
  const selected = dateFromValue(value);
  const today = new Date();
  const days = monthGrid(month, dateLocale);

  // The phone's back button does the same (src/shared/lib/backButton.ts)
  useBackClose(open, () => setOpen(false));
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setOpen(false);
      buttonRef.current?.focus();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open]);

  const choose = (day: Date) => {
    onChange(format(day, 'yyyy-MM-dd'));
    setOpen(false);
    buttonRef.current?.focus();
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${ariaLabel}: ${format(selected, 'd MMMM yyyy', { locale: dateLocale })}`}
        onClick={() => {
          setMonth(startOfMonth(selected));
          setOpen(o => !o);
        }}
        // The calendar icon sits inside the button, so the box needs its own position and room for the icon
        className={cn(
          'relative text-left',
          className || 'w-full h-12 px-4 bg-background/60 rounded-xl border border-card-border text-sm text-foreground outline-none focus:border-indigo-500',
          'pl-11',
        )}
      >
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"><Calendar size={18} /></span>
        {format(selected, 'd MMM yyyy', { locale: dateLocale })}
      </button>
      {open && createPortal(
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-3">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t('date.pick')}
            className="relative w-full max-w-[20rem] p-3 rounded-[1.5rem] border border-card-border bg-[var(--card-solid)] text-foreground shadow-2xl"
          >
          <div className="flex items-center justify-between pb-2">
            <button type="button" onClick={() => setMonth(m => addMonths(m, -1))} aria-label={t('date.prev')} className="w-9 h-9 inline-flex items-center justify-center rounded-xl text-muted hover:text-foreground hover:bg-background/60">
              <ChevronLeft size={18} />
            </button>
            <p className="text-sm font-bold" aria-live="polite">{format(month, 'MMMM yyyy', { locale: dateLocale })}</p>
            <button type="button" onClick={() => setMonth(m => addMonths(m, 1))} aria-label={t('date.next')} className="w-9 h-9 inline-flex items-center justify-center rounded-xl text-muted hover:text-foreground hover:bg-background/60">
              <ChevronRight size={18} />
            </button>
          </div>
          <div className="grid grid-cols-7" aria-hidden="true">
            {days.slice(0, 7).map(day => (
              <span key={day.toISOString()} className="h-8 flex items-center justify-center text-[12px] font-bold text-muted">
                {format(day, 'EEEEE', { locale: dateLocale })}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-y-0.5">
            {days.map(day => {
              const isChosen = isSameDay(day, selected);
              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  onClick={() => choose(day)}
                  aria-label={format(day, 'd MMMM yyyy', { locale: dateLocale })}
                  aria-pressed={isChosen}
                  className={cn(
                    'h-10 rounded-xl text-sm font-semibold tabular-nums transition-colors',
                    isChosen ? 'bg-indigo-600 text-white'
                      : isSameDay(day, today) ? 'text-indigo-600 dark:text-indigo-400 border border-indigo-500/50'
                      : isSameMonth(day, month) ? 'text-foreground hover:bg-background/70'
                      : 'text-muted/50 hover:bg-background/70',
                  )}
                >
                  {format(day, 'd', { locale: dateLocale })}
                </button>
              );
            })}
          </div>
          <button type="button" onClick={() => choose(today)} className="w-full mt-2 h-9 rounded-xl text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:bg-background/60">
            {t('date.today')}
          </button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

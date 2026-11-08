import { useI18n } from '../../shared/i18n';
import { cn } from '../../shared/lib/utils';
import { CalendarLogo } from '../../shared/components/GoogleLogos';
import { CalendarEvent, calendarLink } from './calendar';

/** Opens Google Calendar with this event filled in; the person checks it and taps Save there */
export default function AddToCalendarButton({ event, className }: { event: CalendarEvent; className?: string }) {
  const { t } = useI18n();
  return (
    <a
      href={calendarLink(event)}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'inline-flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-bold bg-card text-foreground border border-card-border hover:border-indigo-500/40 transition-colors',
        className,
      )}
    >
      <CalendarLogo size={15} className="shrink-0" /> {t('calendar.add')}
    </a>
  );
}

import { formatDistanceToNow } from 'date-fns';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { cn } from '../../shared/lib/utils';
import { useI18n, TKey } from '../../shared/i18n';
import { AdminHealth, HEALTH_JOBS } from './admin';

const JOB_NAME: Record<keyof AdminHealth, TKey> = {
  loans: 'admin.healthLoans',
  rates: 'admin.healthRates',
};

/** When the server's hourly jobs last ran, with a red warning if one failed or stopped running */
export default function HealthBox({ health }: { health: AdminHealth }) {
  const { t, dateLocale } = useI18n();
  return (
    <div className="p-3 rounded-2xl bg-background/50 border border-card-border space-y-2">
      <p className="text-xs font-bold text-foreground">{t('admin.healthTitle')}</p>
      {HEALTH_JOBS.map((job) => {
        const { lastRun, error, late } = health[job];
        const problem = late || !!error;
        const detail = error
          ? t('admin.healthFailed', { error })
          : !lastRun
            ? t('admin.healthNever')
            : late
              ? t('admin.healthLate')
              : t('admin.healthOk', { time: formatDistanceToNow(new Date(lastRun), { addSuffix: true, locale: dateLocale }) });
        return (
          <div key={job} role={problem ? 'alert' : undefined} className={cn('flex items-start gap-2 text-xs font-medium', problem ? 'text-rose-600 dark:text-rose-400' : 'text-muted')}>
            {problem ? <AlertTriangle size={14} className="shrink-0 mt-px" /> : <CheckCircle2 size={14} className="shrink-0 mt-px text-emerald-600 dark:text-emerald-400" />}
            <p><b className="font-bold">{t(JOB_NAME[job])}:</b> {detail}</p>
          </div>
        );
      })}
    </div>
  );
}

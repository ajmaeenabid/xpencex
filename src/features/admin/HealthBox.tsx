import { formatDistanceToNow } from 'date-fns';
import { Activity, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { cn } from '../../shared/lib/utils';
import { useI18n, TKey } from '../../shared/i18n';
import { ActivityView, AdminHealth, HEALTH_JOBS } from './admin';

const JOB_NAME: Record<keyof AdminHealth, TKey> = {
  loans: 'admin.healthLoans',
  rates: 'admin.healthRates',
  activity: 'admin.healthActivity',
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
      {health.activity && <ActivityLine activity={health.activity} />}
    </div>
  );
}

/** New items in the last hour across the app: a quiet line, red above the limit (chosen 2026-11-20) */
function ActivityLine({ activity }: { activity: ActivityView }) {
  const { t } = useI18n();
  const { added, busiest, limit, over } = activity;
  const text = added === null
    ? t('admin.activityWaiting')
    : over
      ? t('admin.activityOver', {
        count: added.toLocaleString(),
        limit: limit.toLocaleString(),
        busiest: busiest.map(b => `${b.kind} ${b.count.toLocaleString()}`).join(', '),
      })
      : t('admin.activityLine', { count: added.toLocaleString() });
  return (
    <div role={over ? 'alert' : undefined} className={cn('flex items-start gap-2 text-xs font-medium pt-2 border-t border-card-border', over ? 'text-rose-600 dark:text-rose-400' : 'text-muted')}>
      {over ? <AlertTriangle size={14} className="shrink-0 mt-px" /> : <Activity size={14} className="shrink-0 mt-px" />}
      <p>{text}</p>
    </div>
  );
}

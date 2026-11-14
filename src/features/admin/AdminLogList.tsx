import { format } from 'date-fns';
import { useI18n, TKey } from '../../shared/i18n';
import { AdminAction, AdminLogEntry } from './admin';

const LOG_TEXT: Record<AdminAction, TKey> = {
  suspended: 'admin.logSuspended',
  restored: 'admin.logRestored',
  delete: 'admin.logDelete',
  deviceApproved: 'admin.logDeviceApproved',
  deviceRefused: 'admin.logDeviceRefused',
  deviceRemoved: 'admin.logDeviceRemoved',
};

/** The admin's action record: what was done, to whom (or "Deleted user"), and when */
export default function AdminLogList({ log }: { log: AdminLogEntry[] }) {
  const { t, dateLocale } = useI18n();
  if (log.length === 0) return <p className="text-center py-10 text-sm text-muted font-medium">{t('admin.logEmpty')}</p>;
  return (
    <>
      {log.filter(entry => LOG_TEXT[entry.action]).map((entry, i) => (
        <div key={`${entry.at}-${i}`} className="flex items-center justify-between gap-3 p-3 bg-background/50 rounded-xl border border-card-border">
          <p className="text-sm font-bold text-foreground truncate">{t(LOG_TEXT[entry.action], { user: entry.username || t('admin.deletedUser') })}</p>
          <p className="text-[12px] text-muted font-medium shrink-0">{entry.at && format(new Date(entry.at), 'd MMM, h:mm a', { locale: dateLocale })}</p>
        </div>
      ))}
    </>
  );
}

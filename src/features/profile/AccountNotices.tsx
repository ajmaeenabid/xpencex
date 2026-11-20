import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { format } from 'date-fns';
import { Ban, ChevronRight, RotateCcw, ShieldAlert, ShieldCheck, ShieldX, SmartphoneNfc, LucideIcon } from 'lucide-react';
import { db } from '../../shared/firebase';
import { useI18n, TKey } from '../../shared/i18n';
import { cn } from '../../shared/lib/utils';
import FullWindow from '../../shared/components/FullWindow';
import { AccountNotice, latestNotices } from '../admin/admin';
import { ROW_BUTTON, RowLook } from '../../shared/lib/cardText';

/** How each kind of notice looks: a short title, an icon and its colour */
const KINDS: Record<AccountNotice['type'], { title: TKey; icon: LucideIcon; tone: string }> = {
  suspended: { title: 'notices.kindSuspended', icon: Ban, tone: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400' },
  restored: { title: 'notices.kindRestored', icon: RotateCcw, tone: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400' },
  deviceApproved: { title: 'notices.kindDeviceApproved', icon: ShieldCheck, tone: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400' },
  deviceRefused: { title: 'notices.kindDeviceRefused', icon: ShieldX, tone: 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400' },
  deviceRemoved: { title: 'notices.kindDeviceRemoved', icon: SmartphoneNfc, tone: 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400' },
};

/**
 * Profile row for what the admin did to this account (written by the server, read-only here).
 * The row shows how many notices there are and the newest date; tapping it opens a window with all of them.
 */
export default function AccountNotices({ uid, look = 'card' }: { uid: string; look?: RowLook }) {
  const { t, dateLocale } = useI18n();
  const [notices, setNotices] = useState<AccountNotice[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'notices'), where('uid', '==', uid));
    return onSnapshot(
      q,
      snap => setNotices(snap.docs.map(d => ({ id: d.id, ...d.data() }) as AccountNotice).filter(n => KINDS[n.type])),
      err => console.error('Error loading account notices:', err),
    );
  }, [uid]);

  const all = latestNotices(notices, Infinity);
  const newest = all[0];
  const summary = newest
    ? t(all.length === 1 ? 'notices.countOne' : 'notices.count', { n: all.length, date: format(new Date(newest.at), 'd MMM', { locale: dateLocale }) })
    : t('notices.nothingYet');

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={ROW_BUTTON[look]}
      >
        <div className="w-10 h-10 shrink-0 bg-amber-50 dark:bg-amber-500/10 rounded-xl flex items-center justify-center text-amber-600 dark:text-amber-400">
          <ShieldAlert size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-foreground">{t('notices.title')}</h3>
          <p className="text-xs text-muted font-medium truncate">{summary}</p>
        </div>
        <ChevronRight size={20} className="text-muted shrink-0" />
      </button>

      <FullWindow
        open={open}
        atRoot
        above={look === 'row'}
        onClose={() => setOpen(false)}
        onBack={() => setOpen(false)}
        pageKey="notices"
        icon={<ShieldAlert size={18} className="shrink-0 text-amber-600 dark:text-amber-400" />}
        title={t('notices.title')}
        subtitle={newest ? summary : undefined}
      >
        {all.length === 0 ? (
          <p className="text-center text-sm text-muted font-medium py-16 px-6">{t('notices.empty')}</p>
        ) : (
          <ul className="space-y-3">
            {all.map(n => {
              const kind = KINDS[n.type];
              return (
                <li key={n.id} className="bg-card p-4 rounded-3xl border border-card-border shadow-sm flex gap-3">
                  <div className={cn('w-10 h-10 shrink-0 rounded-xl flex items-center justify-center', kind.tone)}>
                    <kind.icon size={20} />
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-foreground">{t(kind.title)}</p>
                    <p className="text-xs text-muted font-medium">{format(new Date(n.at), 'd MMM yyyy, h:mm a', { locale: dateLocale })}</p>
                    {n.type === 'deviceApproved' && (
                      <p className="mt-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400">{t('notices.notYou')}</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </FullWindow>
    </>
  );
}

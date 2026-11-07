import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { format } from 'date-fns';
import { ShieldAlert } from 'lucide-react';
import { db } from '../../shared/firebase';
import { useI18n, TKey } from '../../shared/i18n';
import { AccountNotice, latestNotices } from '../admin/admin';

const NOTICE_TEXT: Record<AccountNotice['type'], TKey> = {
  suspended: 'notices.suspended',
  restored: 'notices.restored',
  deviceApproved: 'notices.deviceApproved',
  deviceRefused: 'notices.deviceRefused',
  deviceRemoved: 'notices.deviceRemoved',
};

/** Tells the user what the admin did to their account (written by the server, read-only here) */
export default function AccountNotices({ uid }: { uid: string }) {
  const { t, dateLocale } = useI18n();
  const [notices, setNotices] = useState<AccountNotice[]>([]);

  useEffect(() => {
    const q = query(collection(db, 'notices'), where('uid', '==', uid));
    return onSnapshot(
      q,
      snap => setNotices(snap.docs.map(d => ({ id: d.id, ...d.data() }) as AccountNotice).filter(n => NOTICE_TEXT[n.type])),
      err => console.error('Error loading account notices:', err),
    );
  }, [uid]);

  if (notices.length === 0) return null;

  return (
    <div className="bg-card p-6 rounded-3xl shadow-sm border border-card-border space-y-3">
      <h3 className="flex items-center gap-2 font-bold text-foreground">
        <ShieldAlert size={18} className="text-amber-600 dark:text-amber-400" /> {t('notices.title')}
      </h3>
      <ul className="space-y-2">
        {latestNotices(notices).map(n => (
          <li key={n.id} className="text-xs text-muted font-medium">
            {t(NOTICE_TEXT[n.type], { date: format(new Date(n.at), 'd MMM yyyy, h:mm a', { locale: dateLocale }) })}
          </li>
        ))}
      </ul>
    </div>
  );
}

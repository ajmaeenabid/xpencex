import { useEffect, useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { Bell, BellOff, ChevronRight } from 'lucide-react';
import { useAuth } from '../../app/App';
import { db } from '../../shared/firebase';
import { useI18n, TKey } from '../../shared/i18n';
import { cn } from '../../shared/lib/utils';
import { saved } from '../../shared/lib/offlineSave';
import { isNative } from '../../shared/lib/nativeApp';
import { CARD_SUB, CARD_TITLE } from '../../shared/lib/cardText';
import DetailSheet from '../../shared/components/DetailSheet';
import Select from '../../shared/components/Select';
import { REMINDER_KINDS, ReminderKind, reminderSettings } from './reminders';
import { clearReminders, remindersAllowed } from './reminderService';

const LABELS: Record<ReminderKind, TKey> = {
  daily: 'remind.set.daily', streak: 'remind.set.streak', loan: 'remind.set.loan', samity: 'remind.set.samity',
  budget: 'remind.set.budget', weekly: 'remind.set.weekly', monthly: 'remind.set.monthly', goal: 'remind.set.goal',
};

// Every half hour from 6 AM to 11:30 PM
const TIMES = Array.from({ length: 36 }, (_, i) => {
  const h = 6 + Math.floor(i / 2), m = i % 2 ? '30' : '00';
  return `${String(h).padStart(2, '0')}:${m}`;
});
const timeLabel = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};

const tile = 'w-10 h-10 shrink-0 bg-indigo-50 dark:bg-indigo-500/10 rounded-xl flex items-center justify-center text-indigo-600 dark:text-indigo-400';

/**
 * Profile: one short row (what's on, and when the daily one comes); tapping it opens a sheet with
 * a switch for each kind and the daily time. All on unless switched off.
 */
export default function RemindersCard() {
  const { user, profile, refreshProfile } = useAuth();
  const { t } = useI18n();
  const settings = reminderSettings(profile?.reminders);
  const [open, setOpen] = useState(false);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  // Checked again on opening, in case notifications were switched on or off in the phone's Settings
  useEffect(() => { remindersAllowed(false).then(setAllowed); }, [open]);

  const save = async (next: typeof settings) => {
    if (!user) return;
    setBusy(true);
    try {
      await saved(updateDoc(doc(db, 'users', user.uid), { reminders: next }));
      await refreshProfile();
      if (!Object.values(next.on).some(Boolean)) await clearReminders();
    } catch (err) {
      console.error('Could not save reminder settings', err);
    } finally {
      setBusy(false);
    }
  };

  const allow = async () => setAllowed(await remindersAllowed(true));

  const onCount = REMINDER_KINDS.filter(k => settings.on[k]).length;
  const summary = !isNative() ? t('remind.set.appOnly')
    : allowed === false ? t('remind.set.rowBlocked')
    : onCount === 0 ? t('remind.set.rowOff')
    : t(settings.on.daily ? 'remind.set.rowOn' : 'remind.set.rowNoDaily', { time: timeLabel(settings.time), on: onCount, total: REMINDER_KINDS.length });

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full bg-card p-6 rounded-3xl shadow-sm border border-card-border flex items-center gap-3 text-left transition-colors hover:border-indigo-500/40"
      >
        <div className={tile}>{allowed === false && isNative() ? <BellOff size={20} /> : <Bell size={20} />}</div>
        <div className="flex-1 min-w-0">
          <h3 className={CARD_TITLE}>{t('remind.set.title')}</h3>
          <p className={cn(CARD_SUB, allowed === false && isNative() && 'text-amber-600 dark:text-amber-400')}>{summary}</p>
        </div>
        <ChevronRight size={20} className="text-muted shrink-0" />
      </button>

      <DetailSheet
        open={open}
        onClose={() => setOpen(false)}
        icon={<div className={tile}><Bell size={20} /></div>}
        title={t('remind.set.title')}
        about={t('remind.set.hint')}
      >
        {isNative() && allowed === false && (
          <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 space-y-2">
            <p className="flex items-start gap-2 text-xs font-semibold text-amber-800 dark:text-amber-200"><BellOff size={14} className="shrink-0 mt-px" /> {t('remind.set.blocked')}</p>
            <button onClick={allow} className="h-9 px-3 rounded-xl bg-amber-500 text-white text-xs font-bold">{t('remind.set.allow')}</button>
          </div>
        )}
        {!isNative() && <p className="text-xs text-muted font-medium">{t('remind.set.appOnly')}</p>}

        <div className="rounded-2xl border border-card-border bg-background/40 divide-y divide-card-border">
          {REMINDER_KINDS.map(kind => (
            <div key={kind} className="px-4 py-3 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-foreground">{t(LABELS[kind])}</span>
                <button
                  role="switch"
                  aria-checked={settings.on[kind]}
                  aria-label={t(LABELS[kind])}
                  disabled={busy}
                  onClick={() => save({ ...settings, on: { ...settings.on, [kind]: !settings.on[kind] } })}
                  className={cn('relative shrink-0 w-12 h-7 rounded-full transition-colors disabled:opacity-50', settings.on[kind] ? 'bg-indigo-600' : 'bg-background border border-card-border')}
                >
                  <span className={cn('absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-all', settings.on[kind] ? 'left-6' : 'left-1')} />
                </button>
              </div>
              {/* The daily time sits right under its own switch */}
              {kind === 'daily' && settings.on.daily && (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold text-muted">{t('remind.set.time')}</span>
                  <Select
                    ariaLabel={t('remind.set.time')}
                    value={settings.time}
                    onChange={time => save({ ...settings, time })}
                    options={TIMES.map(v => ({ value: v, label: timeLabel(v) }))}
                    className="w-36"
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </DetailSheet>
    </>
  );
}

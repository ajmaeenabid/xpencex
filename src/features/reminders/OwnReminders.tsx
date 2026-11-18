import { useState } from 'react';
import { format } from 'date-fns';
import { Plus, Trash2 } from 'lucide-react';
import { useI18n, TKey } from '../../shared/i18n';
import Select from '../../shared/components/Select';
import DateField from '../../shared/components/DateField';
import { confirmDialog } from '../../shared/components/Dialog';
import { DEFAULT_REMINDER_TIME, MAX_OWN_REMINDERS, MAX_REMINDER_TEXT, OWN_REPEATS, OwnReminder, OwnRepeat, ownOccurrences, ownReminderProblem, reminderStart } from './reminders';
import { addOwnReminder, cleanReminderText, deleteOwnReminder } from './ownReminderService';

// Every half hour from 6 AM to 11:30 PM
export const TIMES = Array.from({ length: 36 }, (_, i) => {
  const h = 6 + Math.floor(i / 2), m = i % 2 ? '30' : '00';
  return `${String(h).padStart(2, '0')}:${m}`;
});
export const timeLabel = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};

export const REPEAT_TEXT: Record<OwnRepeat, TKey> = { once: 'remind.own.once', weekly: 'remind.own.weekly', monthly: 'remind.own.monthly' };
const PROBLEM_TEXT: Record<'text' | 'time' | 'repeat' | 'full', TKey> = {
  text: 'remind.own.errorText', time: 'remind.own.errorTime', repeat: 'remind.own.errorTime', full: 'remind.own.full',
};

const field = 'w-full h-11 px-3 rounded-xl bg-card border border-card-border text-sm text-foreground outline-none focus:border-indigo-500';

/** Profile > Reminders: your own reminders, with a small form to add one */
export default function OwnReminders({ uid, reminders }: { uid: string; reminders: OwnReminder[] }) {
  const { t, dateLocale } = useI18n();
  const [text, setText] = useState('');
  const [day, setDay] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [time, setTime] = useState(DEFAULT_REMINDER_TIME);
  const [repeat, setRepeat] = useState<OwnRepeat>('once');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const full = reminders.length >= MAX_OWN_REMINDERS;

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const words = cleanReminderText(text);
    if (words === null) {
      setText('');
      return setError(t('secret.warning'));
    }
    const at = reminderStart(day, time);
    const problem = ownReminderProblem(words, at, repeat, reminders.length);
    if (problem) return setError(t(PROBLEM_TEXT[problem]));
    setSaving(true);
    setError('');
    try {
      await addOwnReminder(uid, words, at, repeat);
      setText('');
    } catch (err) {
      console.error('Could not add a reminder', err);
      setError(t('remind.own.errorSave'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (r: OwnReminder) => {
    if (!(await confirmDialog(t('remind.own.confirmDelete', { text: r.text }), { danger: true }))) return;
    try {
      await deleteOwnReminder(r.id);
    } catch (err) {
      console.error('Could not delete a reminder', err);
    }
  };

  const nextTime = (r: OwnReminder) => {
    const next = ownOccurrences(r, new Date(), 1)[0];
    return next ? format(next, 'd MMM, h:mm a', { locale: dateLocale }) : t('remind.own.done');
  };

  return (
    <div className="space-y-3">
      <div>
        <h4 className="text-sm font-bold text-foreground">{t('remind.own.title')}</h4>
        <p className="text-[12px] text-muted font-medium">{t('remind.own.hint', { max: MAX_OWN_REMINDERS })}</p>
      </div>

      {reminders.length > 0 && (
        <div className="rounded-2xl border border-card-border bg-background/40 divide-y divide-card-border">
          {reminders.map(r => (
            <div key={r.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground truncate">{r.text}</p>
                <p className="text-[12px] text-muted font-medium">{nextTime(r)} · {t(REPEAT_TEXT[r.repeat])}</p>
              </div>
              <button onClick={() => remove(r)} aria-label={t('remind.own.delete', { text: r.text })} className="p-1.5 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/40 rounded-lg transition-colors">
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      {full ? (
        <p className="text-xs font-semibold text-muted">{t('remind.own.full')}</p>
      ) : (
        <form onSubmit={add} className="space-y-3 p-4 rounded-2xl border border-card-border bg-background/40">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={MAX_REMINDER_TEXT}
            placeholder={t('remind.own.placeholder')}
            aria-label={t('remind.own.what')}
            className={field}
          />
          <div className="grid grid-cols-2 gap-3">
            <DateField value={day} onChange={setDay} ariaLabel={t('remind.own.date')} />
            <Select ariaLabel={t('remind.set.time')} value={time} onChange={setTime} options={TIMES.map(v => ({ value: v, label: timeLabel(v) }))} />
          </div>
          <Select ariaLabel={t('remind.own.repeat')} value={repeat} onChange={(v) => setRepeat(v as OwnRepeat)} options={OWN_REPEATS.map(v => ({ value: v, label: t(REPEAT_TEXT[v]) }))} />
          {error && <p role="alert" className="text-xs font-semibold text-rose-600 dark:text-rose-400">{error}</p>}
          <button type="submit" disabled={saving || !text.trim()} className="w-full h-11 rounded-xl bg-indigo-600 text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50">
            <Plus size={16} /> {saving ? t('common.saving') : t('remind.own.add')}
          </button>
        </form>
      )}
    </div>
  );
}

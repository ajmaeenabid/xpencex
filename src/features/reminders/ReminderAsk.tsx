import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { Bell } from 'lucide-react';
import { useI18n } from '../../shared/i18n';
import { remindersAllowed } from './reminderService';

const askedKey = (uid: string) => `xpences-reminders-asked:${uid}`;

/** Whether this phone was already asked about reminders for this person */
export function wasAsked(uid: string) {
  try { return localStorage.getItem(askedKey(uid)) === '1'; } catch { return true; }
}
export function markAsked(uid: string) {
  try { localStorage.setItem(askedKey(uid), '1'); } catch { /* asked again next time */ }
}

/**
 * Right after the button tour, for a new person: a short explanation first, then Android's own question.
 * People who say yes here usually say yes to Android too.
 */
export default function ReminderAsk({ uid, onDone }: { uid: string; onDone: () => void }) {
  const { t } = useI18n();
  const finish = async (allow: boolean) => {
    markAsked(uid);
    if (allow) await remindersAllowed(true);
    onDone();
  };
  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="w-full max-w-sm p-6 rounded-[2rem] bg-[var(--card-solid)] border border-card-border shadow-2xl space-y-4 text-center">
        <span className="mx-auto w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center"><Bell size={26} /></span>
        <h2 className="text-lg font-bold text-foreground">{t('remind.ask.title')}</h2>
        <p className="text-sm text-muted font-medium leading-relaxed">{t('remind.ask.body')}</p>
        <div className="grid gap-2">
          <button onClick={() => finish(true)} className="h-12 rounded-2xl bg-indigo-600 text-white font-bold">{t('remind.ask.allow')}</button>
          <button onClick={() => finish(false)} className="h-11 rounded-2xl text-muted font-bold">{t('remind.ask.notNow')}</button>
        </div>
        <p className="text-xs text-muted font-medium">{t('remind.ask.later')}</p>
      </motion.div>
    </div>,
    document.body,
  );
}

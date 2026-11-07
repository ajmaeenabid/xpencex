import { AnimatePresence, motion } from 'motion/react';
import { Info, ShieldAlert, X } from 'lucide-react';
import { cn } from '../../shared/lib/utils';
import { useI18n, TKey } from '../../shared/i18n';
import { isGentleNote } from './limits';

const LIMIT_NOTE_FADE_SECONDS = 1.2;

/** The warning about a code or PIN that was thrown away, and the short limit notes above the message box */
export default function ChatNotices({ secretWarning, setSecretWarning, limitNote, setLimitNote, limitNoteVars }: {
  secretWarning: boolean;
  setSecretWarning: (show: boolean) => void;
  limitNote: TKey | null;
  setLimitNote: (note: TKey | null) => void;
  limitNoteVars?: Record<string, string | number>;
}) {
  const { t } = useI18n();
  return (
    <>
      <AnimatePresence>
        {secretWarning && (
          <motion.div
            role="alert"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="mb-2 flex items-start gap-3 p-3 rounded-2xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-300"
          >
            <ShieldAlert size={18} className="shrink-0 mt-0.5" />
            <p className="flex-1 text-xs font-semibold leading-relaxed">{t('secret.warning')}</p>
            <button onClick={() => setSecretWarning(false)} aria-label={t('common.dismiss')} className="p-0.5 opacity-70 hover:opacity-100">
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Only ever about something just tapped. It fades out slowly, then the space it took closes up. */}
      <AnimatePresence>
        {limitNote && (
          <motion.div
            key="limit-note"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, height: 'auto', transition: { duration: 0.2 } }}
            exit={{
              opacity: 0,
              height: 0,
              transition: {
                opacity: { duration: LIMIT_NOTE_FADE_SECONDS, ease: 'easeOut' },
                height: { delay: LIMIT_NOTE_FADE_SECONDS, duration: 0.25, ease: 'easeInOut' },
              },
            }}
            className="overflow-hidden"
          >
            <div
              role="alert"
              className={cn(
                'mb-2 flex items-start gap-2.5 px-3 py-2.5 rounded-2xl border',
                isGentleNote(limitNote)
                  ? 'bg-indigo-50 dark:bg-indigo-500/10 border-indigo-200 dark:border-indigo-500/30 text-indigo-700 dark:text-indigo-300'
                  : 'bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-300'
              )}
            >
              <Info size={16} className="shrink-0 mt-px" />
              <p className="flex-1 text-xs font-semibold leading-relaxed">{t(limitNote, limitNoteVars)}</p>
              <button onClick={() => setLimitNote(null)} aria-label={t('common.dismiss')} className="p-0.5 opacity-70 hover:opacity-100"><X size={14} /></button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

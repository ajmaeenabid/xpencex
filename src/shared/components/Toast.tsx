import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Info } from 'lucide-react';
import { useI18n, TKey } from '../i18n';
import { onToast } from '../lib/toast';

const SHOW_MS = 3000;

/** Short notes at the top middle of the screen, such as "Saved on this phone". Goes once, next to DialogHost. */
export function ToastHost() {
  const { t } = useI18n();
  const [note, setNote] = useState<{ key: TKey; id: number } | null>(null);

  useEffect(() => {
    onToast((key) => setNote({ key, id: Date.now() }));
    return () => onToast(null);
  }, []);

  useEffect(() => {
    if (!note) return;
    const timer = window.setTimeout(() => setNote(null), SHOW_MS);
    return () => window.clearTimeout(timer);
  }, [note]);

  return createPortal(
    <div className="fixed top-[calc(1rem+var(--sat))] inset-x-0 z-[110] flex justify-center px-4 pointer-events-none">
      <AnimatePresence>
        {note && (
          <motion.div
            key={note.id}
            role="status"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="max-w-sm flex items-start gap-2.5 px-3.5 py-2.5 rounded-2xl border shadow-soft bg-[var(--card-solid)] border-indigo-200 dark:border-indigo-500/30 text-indigo-700 dark:text-indigo-300"
          >
            <Info size={16} className="shrink-0 mt-px" />
            <p className="text-xs font-semibold leading-relaxed">{t(note.key)}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>,
    document.body,
  );
}

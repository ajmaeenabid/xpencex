import { ReactNode, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import { useI18n } from '../i18n';

/**
 * A sheet that slides up over the page with the full story behind a short Home card.
 * `about` is one plain line that says what the card is for, shown under the title.
 */
export default function DetailSheet({ open, onClose, icon, title, about, children, footer }: {
  open: boolean;
  onClose: () => void;
  icon: ReactNode;
  title: string;
  about?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const { t } = useI18n();

  // Above the full-screen windows (z-60) it can open from, below dialogs (z-100).
  // Close with Escape, and stop the page behind from scrolling
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; };
  }, [open, onClose]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <div key="sheet" className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 34 }}
            className="relative w-full max-w-md max-h-[88dvh] flex flex-col bg-card text-foreground border border-card-border rounded-t-[2rem] sm:rounded-[2rem] shadow-2xl"
          >
            <div className="flex items-start gap-3 px-5 pt-5 pb-4">
              <div className="shrink-0">{icon}</div>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-bold">{title}</h2>
                {about && <p className="text-xs text-muted font-medium leading-relaxed">{about}</p>}
              </div>
              <button onClick={onClose} aria-label={t('common.close')} className="shrink-0 p-2 rounded-xl text-muted hover:text-foreground hover:bg-background/60">
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-3">{children}</div>
            {footer && <div className="px-5 pb-6 pt-1">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/** One "label ..... value" line inside a DetailSheet */
export function DetailLine({ label, value, tone }: { label: string; value: ReactNode; tone?: 'bad' }) {
  return (
    <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-background/50 border border-card-border">
      <span className="text-xs text-muted font-bold">{label}</span>
      <span className={`text-sm font-bold tabular-nums text-right ${tone === 'bad' ? 'text-rose-500' : 'text-foreground'}`}>{value}</span>
    </div>
  );
}

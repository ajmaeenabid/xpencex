import { ReactNode, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, X } from 'lucide-react';
import { useI18n } from '../i18n';

const iconButton = 'inline-flex items-center justify-center w-10 h-10 rounded-xl text-muted hover:text-foreground hover:bg-background/60 transition-colors';

/** Pages inside a FullWindow: the last one is on screen, Back returns to the one before */
export function usePages<P>(first: P) {
  const [history, setHistory] = useState<P[]>([first]);
  return {
    page: history[history.length - 1],
    atRoot: history.length === 1,
    depth: history.length,
    go: (next: P) => setHistory(h => [...h, next]),
    back: () => setHistory(h => (h.length > 1 ? h.slice(0, -1) : h)),
    reset: () => setHistory([first]),
  };
}

/**
 * A window that covers the whole screen, bottom bar included, with a header (close or back,
 * title, an action on the right) and a scrolling body. Escape goes back a page, or closes.
 */
export default function FullWindow({ open, atRoot, onClose, onBack, pageKey, icon, title, subtitle, action, children, above = false }: {
  open: boolean;
  atRoot: boolean;
  onClose: () => void;
  onBack: () => void;
  pageKey: string | number; // changes when the page changes, so the body slides
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  above?: boolean; // opens from another full-screen window (like the admin screen), so it sits over it
}) {
  const { t } = useI18n();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (atRoot) onClose(); else onBack();
    };
    window.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; };
  }, [open, atRoot, onClose, onBack]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="window"
          role="dialog"
          aria-modal="true"
          aria-label={title}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
          className={`fixed inset-0 ${above ? 'z-[65]' : 'z-[60]'} flex flex-col bg-background text-foreground`}
        >
          <header className="shrink-0 bg-card/80 backdrop-blur-xl border-b border-card-border">
            <div className="max-w-2xl mx-auto flex items-center gap-3 px-4 sm:px-6 h-16">
              <button onClick={atRoot ? onClose : onBack} aria-label={t(atRoot ? 'common.close' : 'common.back')} className={iconButton}>
                {atRoot ? <X size={20} /> : <ArrowLeft size={20} />}
              </button>
              {icon}
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-bold truncate">{title}</h2>
                {subtitle && <p className="text-xs text-muted font-medium truncate">{subtitle}</p>}
              </div>
              {action}
            </div>
          </header>
          <div className="flex-1 overflow-y-auto">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={pageKey}
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.18 }}
                className="max-w-2xl mx-auto px-4 sm:px-6 py-6 pb-12 space-y-5"
              >
                {children}
              </motion.div>
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bot, Sparkles } from 'lucide-react';
import { haptic } from '../../shared/components/BottomNav';
import { useI18n } from '../../shared/i18n';

const HINT_KEY = 'chatFabHintShown';

/** Floating shortcut on the Home screen that opens the AI chat. */
export default function ChatButton({ onOpen }: { onOpen: () => void }) {
  const { t } = useI18n();
  const [showHint, setShowHint] = useState(false);

  // Introduce the button once per session, then keep it compact
  useEffect(() => {
    let alreadyShown = false;
    try { alreadyShown = sessionStorage.getItem(HINT_KEY) === '1'; } catch { /* storage blocked */ }
    if (alreadyShown) return;
    const show = window.setTimeout(() => setShowHint(true), 600);
    const hide = window.setTimeout(() => setShowHint(false), 4600);
    try { sessionStorage.setItem(HINT_KEY, '1'); } catch { /* storage blocked */ }
    return () => { window.clearTimeout(show); window.clearTimeout(hide); };
  }, []);

  const open = () => {
    haptic();
    onOpen();
  };

  return (
    <div className="fixed bottom-[calc(7.25rem+var(--sab))] inset-x-0 z-40 pointer-events-none">
      <div className="max-w-md mx-auto px-5 flex justify-end items-center gap-3">
        <AnimatePresence>
          {showHint && (
            <motion.button
              onClick={open}
              initial={{ opacity: 0, x: 12, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 12, scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 400, damping: 28 }}
              className="pointer-events-auto relative bg-card border border-card-border rounded-2xl rounded-br-md px-4 py-2.5 shadow-soft text-left"
            >
              <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <Sparkles size={12} className="text-indigo-600 dark:text-indigo-400" />
                {t('chatButton.title')}
              </p>
              <p className="text-[10px] text-muted font-medium">{t('chatButton.subtitle')}</p>
            </motion.button>
          )}
        </AnimatePresence>

        <motion.div
          className="pointer-events-auto relative"
          initial={{ scale: 0, rotate: -30, opacity: 0 }}
          animate={{ scale: 1, rotate: 0, opacity: 1 }}
          exit={{ scale: 0, rotate: 30, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 420, damping: 20 }}
        >
          {/* Soft pulse ring, outside the button because glossy buttons clip their overflow */}
          <span className="absolute inset-0 rounded-full animate-glow pointer-events-none" aria-hidden />
          <motion.button
            data-tour="chat-bubble"
            onClick={open}
            onHoverStart={() => setShowHint(true)}
            onHoverEnd={() => setShowHint(false)}
            aria-label={t('chatButton.open')}
            whileHover={{ scale: 1.08, y: -2 }}
            whileTap={{ scale: 0.88 }}
            className="relative w-14 h-14 rounded-full bg-gradient-to-br from-indigo-600 to-purple-600 text-white flex items-center justify-center shadow-vibrant"
          >
            <motion.span
              animate={{ rotate: [0, -10, 10, -6, 0] }}
              transition={{ duration: 1.2, repeat: Infinity, repeatDelay: 4, ease: 'easeInOut' }}
            >
              <Bot size={26} />
            </motion.span>
          </motion.button>
          <span className="absolute top-0.5 right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-400 border-2 border-white dark:border-slate-900 pointer-events-none" aria-hidden />
        </motion.div>
      </div>
    </div>
  );
}

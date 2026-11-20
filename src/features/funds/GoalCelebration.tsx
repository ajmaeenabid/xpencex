import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'motion/react';
import { PartyPopper } from 'lucide-react';
import { useI18n } from '../../shared/i18n';
import { useBackClose } from '../../shared/lib/backButton';

const SHOW_MS = 4000;
const COLOURS = ['bg-amber-400', 'bg-indigo-500', 'bg-emerald-400', 'bg-rose-400'];
const PIECES = Array.from({ length: 36 }, (_, i) => ({
  left: (i * 37) % 100,
  drift: ((i * 53) % 120) - 60,
  spin: 240 + ((i * 71) % 480),
  delay: (i % 9) * 0.06,
  time: 1.8 + ((i * 13) % 9) / 10,
  colour: COLOURS[i % COLOURS.length],
}));

/** The one-time "goal reached" moment. Tap anywhere to close. No confetti when the phone is set to reduce motion. */
export default function GoalCelebration({ name, onDone }: { name: string; onDone: () => void }) {
  // The phone's back button closes it (src/shared/lib/backButton.ts)
  useBackClose(true, onDone);
  const { t } = useI18n();
  const still = useReducedMotion();
  useEffect(() => {
    const timer = setTimeout(onDone, SHOW_MS);
    return () => clearTimeout(timer);
  }, [onDone]);

  return createPortal(
    <button type="button" onClick={onDone} aria-label={t('common.close')} className="fixed inset-0 z-[110] flex items-center justify-center overflow-hidden bg-black/30 p-5">
      {!still && PIECES.map((p, i) => (
        <motion.span
          key={i}
          aria-hidden="true"
          className={`absolute -top-4 h-3 w-2 rounded-sm ${p.colour}`}
          style={{ left: `${p.left}%` }}
          initial={{ y: 0, x: 0, rotate: 0, opacity: 1 }}
          animate={{ y: '110vh', x: p.drift, rotate: p.spin, opacity: [1, 1, 0] }}
          transition={{ duration: p.time, delay: p.delay, ease: 'easeIn' }}
        />
      ))}
      <motion.span
        role="status"
        className="relative flex w-full max-w-xs flex-col items-center gap-2 rounded-3xl border border-card-border bg-card p-6 text-center shadow-sm"
        initial={still ? false : { scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
      >
        <PartyPopper size={36} className="text-amber-500" aria-hidden="true" />
        <span className="text-xl font-bold text-foreground">{t('funds.partyTitle')}</span>
        <span className="text-sm font-semibold text-muted">{t('funds.partyBody', { name })}</span>
      </motion.span>
    </button>,
    document.body,
  );
}

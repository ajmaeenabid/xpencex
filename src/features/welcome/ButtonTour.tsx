import { useEffect, useLayoutEffect, useState } from 'react';
import { motion } from 'motion/react';
import { useI18n, TKey } from '../../shared/i18n';
import { haptic } from '../../shared/components/BottomNav';

// The button tour a brand-new account sees once, on Home, right after the welcome slides.
// Each step dims the screen, rings one button (found by its data-tour mark) and explains it in a bubble.

const STEPS: { target: string; text: TKey }[] = [
  { target: 'home', text: 'tour.home' },
  { target: 'chat', text: 'tour.chat' },
  { target: 'add', text: 'tour.add' },
  { target: 'expenses', text: 'tour.expenses' },
  { target: 'reports', text: 'tour.reports' },
  { target: 'profile', text: 'tour.profile' },
  { target: 'search', text: 'tour.search' },
  { target: 'move-cards', text: 'tour.moveCards' },
  { target: 'theme', text: 'tour.theme' },
];

const PAD = 8; // space between the button and its ring
const GAP = 14; // space between the ring and the bubble
const EDGE = 16; // the bubble keeps this far from the screen's sides

type Box = { x: number; y: number; w: number; h: number };

const findTarget = (name: string) => {
  const el = document.querySelector<HTMLElement>(`[data-tour="${name}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 ? { x: r.left - PAD, y: r.top - PAD, w: r.width + PAD * 2, h: r.height + PAD * 2 } : null;
};

export default function ButtonTour({ onDone }: { onDone: () => void }) {
  const { t } = useI18n();
  // Only the steps whose button is on screen (for example the chat bubble hides while typing).
  // Looked up once the screen is drawn and Home has settled, not while this is first drawn.
  const [steps, setSteps] = useState<typeof STEPS | null>(null);
  const [index, setIndex] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const step = steps?.[index];
  const last = !!steps && index === steps.length - 1;

  // Home's top buttons are part of the tour, so start at the top of the page
  useLayoutEffect(() => { window.scrollTo(0, 0); }, []);

  useEffect(() => {
    const found = window.setTimeout(() => setSteps(STEPS.filter(s => findTarget(s.target))), 500);
    return () => window.clearTimeout(found);
  }, []);

  useEffect(() => {
    if (!steps) return;
    if (!step) { onDone(); return; }
    const measure = () => setBox(findTarget(step.target));
    measure();
    // Measure again once anything that was still moving in (like the chat bubble) has settled
    const later = window.setTimeout(measure, 400);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, { passive: true });
    return () => {
      window.clearTimeout(later);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure);
    };
  }, [steps, step]);

  if (!steps || !step) return null;

  const next = () => { haptic(); if (last) onDone(); else setIndex(i => i + 1); };
  const skip = () => { haptic(); onDone(); };

  // The bubble goes above a button in the lower half of the screen, below one in the upper half
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(320, vw - EDGE * 2);
  const below = !!box && box.y + box.h / 2 < vh / 2;
  const centre = box ? box.x + box.w / 2 : vw / 2;
  const left = Math.min(Math.max(centre - width / 2, EDGE), vw - EDGE - width);
  const arrowLeft = Math.min(Math.max(centre - left, 22), width - 22);

  return (
    <div className="fixed inset-0 z-[170]" role="dialog" aria-modal="true" aria-label={t(step.text)}>
      {/* Catches taps, so nothing behind the tour is pressed by accident */}
      <div className="absolute inset-0" onClick={e => e.stopPropagation()} />

      {/* The dimmed screen with a lit, glowing hole around the button */}
      {box && (
        <motion.div
          aria-hidden="true"
          initial={false}
          animate={{ left: box.x, top: box.y, width: box.w, height: box.h }}
          transition={{ type: 'spring', stiffness: 380, damping: 34 }}
          className="fixed rounded-[22px] pointer-events-none ring-2 ring-indigo-400"
          style={{ boxShadow: '0 0 0 9999px rgba(25, 12, 6, 0.62), 0 0 24px 4px color-mix(in srgb, var(--color-indigo-400) 55%, transparent)' }}
        />
      )}

      {box && (
        <motion.div
          key={index}
          initial={{ opacity: 0, y: below ? -8 : 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          className="fixed bg-card text-foreground rounded-3xl shadow-2xl border border-card-border p-4"
          style={below ? { left, width, top: box.y + box.h + GAP } : { left, width, bottom: vh - box.y + GAP }}
        >
          {/* The little arrow pointing at the button */}
          <span
            aria-hidden="true"
            className="absolute w-4 h-4 rotate-45 bg-card border-card-border"
            style={below
              ? { left: arrowLeft - 8, top: -8, borderLeftWidth: 1, borderTopWidth: 1 }
              : { left: arrowLeft - 8, bottom: -8, borderRightWidth: 1, borderBottomWidth: 1 }}
          />
          <p className="relative text-[15px] leading-relaxed font-semibold">{t(step.text)}</p>
          <div className="relative mt-3 flex items-center gap-2">
            <span className="text-xs text-muted font-bold tabular-nums">{t('tour.step', { n: index + 1, total: steps.length })}</span>
            <span className="flex-1" />
            {!last && <button onClick={skip} className="px-3 py-2 rounded-xl text-sm font-bold text-muted hover:text-foreground">{t('tour.skip')}</button>}
            <button onClick={next} className="px-4 py-2 rounded-xl text-sm font-bold bg-indigo-600 text-white">{t(last ? 'tour.done' : 'tour.next')}</button>
          </div>
        </motion.div>
      )}
    </div>
  );
}

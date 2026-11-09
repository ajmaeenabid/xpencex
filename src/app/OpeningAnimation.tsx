import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { logoSvg } from '../shared/brand/logoSvg';

// Plays once every time the app is opened fresh, over the app while it gets ready behind it (about 2 seconds,
// no skip). It starts exactly like the phone's opening screen (the logo in the middle of a cream screen,
// see scripts/make-icons.mjs), so the switch is seamless:
//   0.3s  the right eye opens and winks again, then the taka sign hops (timed in logoSvg.ts)
//   0.85s the logo moves up and the first X appears below it
//   1.15s "pences" appears letter by letter, pushing the first X to the left, until "Xpences" stands in the middle
//   2.0s  fades into the app

const SHOW_MS = 2000;
const LETTERS = ['p', 'e', 'n', 'c', 'e', 's'];
const LOGO_HTML = logoSvg({ animated: true });

export default function OpeningAnimation() {
  const [show, setShow] = useState(true);
  const still = useReducedMotion();

  useEffect(() => {
    const timer = window.setTimeout(() => setShow(false), SHOW_MS);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="opening"
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-indigo-50"
          aria-hidden="true"
        >
          {/* Same size as on the phone's opening screen: 30% of the screen's shorter side */}
          <div className="w-[30vmin] h-[30vmin] max-w-48 max-h-48" dangerouslySetInnerHTML={{ __html: LOGO_HTML }} />

          {/* Grows from nothing, which moves the logo up so the pair stays in the middle */}
          <motion.div
            initial={still ? false : { height: 0 }}
            animate={{ height: 'auto' }}
            transition={{ delay: 0.85, duration: 0.35, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            {/* Letters line up by their top, not their baseline: a half-shown letter would otherwise change the height and make the logo jump */}
            <div className="pt-5 flex items-start text-5xl leading-[1.2] font-bold tracking-tighter text-slate-800 whitespace-nowrap">
              <motion.span
                initial={still ? false : { opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.95, duration: 0.25, ease: 'easeOut' }}
                className="inline-block text-indigo-600"
              >
                X
              </motion.span>
              {LETTERS.map((letter, i) => (
                <motion.span
                  key={i}
                  initial={still ? false : { width: 0, opacity: 0 }}
                  animate={{ width: 'auto', opacity: 1 }}
                  transition={{ delay: 1.15 + i * 0.09, duration: 0.22, ease: 'easeOut' }}
                  className="inline-block overflow-hidden"
                >
                  {letter}
                </motion.span>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

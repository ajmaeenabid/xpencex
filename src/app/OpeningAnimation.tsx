import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { logoSvg } from '../shared/brand/logoSvg';
import { useI18n } from '../shared/i18n';
import { appStartup } from './startup';
import HangingBanner from './HangingBanner';

// Plays once every time the app is opened fresh, over the app while it gets ready behind it (about 2 seconds,
// no skip). It starts exactly like the phone's opening screen (the logo in the middle of a cream screen,
// see scripts/make-icons.mjs), so the switch is seamless:
//   0.3s  the right eye opens and winks again, then the taka sign hops (timed in logoSvg.ts)
//   0.85s the logo moves up and the first X appears below it
//   1.15s "pences" appears letter by letter, pushing the first X to the left, until "Xpences" stands in the middle.
//         A "খরচ" paper sign tied to the tail of the p comes in with it and swings as the word moves (HangingBanner.tsx)
//   2.0s  fades into the app, or, if the app is still checking the sign-in (slow internet after a long break),
//         the logo pulses gently until it is ready, so no separate loading spinner appears
//   5s    a short "getting ready" line shows below, so a long wait doesn't look stuck
//   20s   gives up waiting and shows the app's own loading screen, in case something is wrong

const SHOW_MS = 2000;
const HINT_MS = 5000;
const GIVE_UP_MS = 20000;
const LETTERS = ['p', 'e', 'n', 'c', 'e', 's'];
const LOGO_HTML = logoSvg({ animated: true });

export default function OpeningAnimation() {
  const { t } = useI18n();
  const [played, setPlayed] = useState(false); // the 2 second animation has finished
  const [ready, setReady] = useState(appStartup.isReady());
  const [slow, setSlow] = useState(false);
  const [gaveUp, setGaveUp] = useState(false);
  const still = useReducedMotion();
  const pRef = useRef<HTMLSpanElement>(null); // the p, whose tail holds the banner's rope

  useEffect(() => {
    const timers = [
      window.setTimeout(() => setPlayed(true), SHOW_MS),
      window.setTimeout(() => setSlow(true), HINT_MS),
      window.setTimeout(() => setGaveUp(true), GIVE_UP_MS),
    ];
    const stop = appStartup.onReady(() => setReady(true));
    return () => { timers.forEach(window.clearTimeout); stop(); };
  }, []);

  const show = !gaveUp && !(played && ready);
  const waiting = played && !ready; // finished playing, the app isn't ready yet

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
          <motion.div
            animate={waiting && !still ? { scale: [1, 1.05, 1] } : { scale: 1 }}
            transition={waiting ? { repeat: Infinity, duration: 1.4, ease: 'easeInOut' } : { duration: 0.2 }}
            className="w-[30vmin] h-[30vmin] max-w-48 max-h-48"
            dangerouslySetInnerHTML={{ __html: LOGO_HTML }}
          />

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
                  ref={i === 0 ? pRef : undefined}
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

          <HangingBanner letterRef={pRef} still={!!still} />

          {/* Only during a long wait. Placed apart near the bottom, so the logo stays exactly where the phone's opening screen put it. */}
          <motion.p
            initial={false}
            animate={{ opacity: waiting && slow ? 1 : 0 }}
            transition={{ duration: 0.4 }}
            className="absolute inset-x-0 bottom-[18%] px-6 text-center text-sm font-medium text-slate-500"
          >
            {t('opening.wait')}
          </motion.p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

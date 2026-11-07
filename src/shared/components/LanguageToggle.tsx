import { useId, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useI18n, Language } from '../i18n';

const OPTIONS: { code: Language; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'bn', label: 'বাংলা' },
];

/**
 * English / Bangla switch. The orange pill flows to the chosen side like a drop of water: two small
 * droplets trail behind and merge into it (an SVG "goo" filter blends them), it wobbles as it lands,
 * and a ripple spreads out. With reduced motion turned on, it simply slides.
 */
export default function LanguageToggle({ ariaLabel }: { ariaLabel: string }) {
  const { lang, setLang } = useI18n();
  const reduce = useReducedMotion();
  const filterId = `goo-${useId().replace(/:/g, '')}`;
  const [ripple, setRipple] = useState(0); // bumped on each change, so the ripple replays
  const index = OPTIONS.findIndex(o => o.code === lang);
  const left = `${index * 50}%`;

  const choose = (code: Language) => {
    if (code === lang) return;
    setLang(code);
    setRipple(n => n + 1);
  };

  return (
    <div role="radiogroup" aria-label={ariaLabel} className="relative shrink-0 inline-grid grid-cols-2 p-1 rounded-full bg-background/60 border border-card-border">
      <svg aria-hidden="true" width="0" height="0" className="absolute">
        <filter id={filterId}>
          <feGaussianBlur in="SourceGraphic" stdDeviation="3.5" result="blur" />
          <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -8" result="goo" />
          <feComposite in="SourceGraphic" in2="goo" operator="atop" />
        </filter>
      </svg>

      {/* The liquid: pill plus trailing droplets, blended by the filter */}
      <div aria-hidden="true" className="absolute inset-1 pointer-events-none" style={reduce ? undefined : { filter: `url(#${filterId})` }}>
        {!reduce && [
          { size: 'w-3.5 h-3.5', stiffness: 170, damping: 16 },
          { size: 'w-2.5 h-2.5', stiffness: 120, damping: 14 },
        ].map((drop, i) => (
          <motion.span
            key={i}
            className="absolute top-0 bottom-0 w-1/2 flex items-center justify-center"
            initial={false}
            animate={{ left }}
            transition={{ type: 'spring', stiffness: drop.stiffness, damping: drop.damping }}
          >
            <span className={`${drop.size} rounded-full bg-indigo-600`} />
          </motion.span>
        ))}
        <motion.span
          className="absolute top-0 bottom-0 w-1/2"
          initial={false}
          animate={{ left }}
          transition={{ type: 'spring', stiffness: 260, damping: 22 }}
        >
          <motion.span
            key={lang}
            className="block w-full h-full rounded-full bg-indigo-600 shadow-sm"
            initial={reduce || ripple === 0 ? false : { scaleX: 1.22, scaleY: 0.82 }}
            animate={{ scaleX: 1, scaleY: 1 }}
            transition={{ type: 'spring', stiffness: 380, damping: 9, delay: 0.08 }}
          />
        </motion.span>
      </div>

      {/* Ripple where the drop lands, outside the filter so it stays a clean ring */}
      <AnimatePresence>
        {!reduce && ripple > 0 && (
          <motion.span
            key={ripple}
            aria-hidden="true"
            className="absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-full border-2 border-indigo-500 pointer-events-none"
            style={{ left: `calc(${left} + 4px)` }}
            initial={{ opacity: 0.6, scale: 0.9 }}
            animate={{ opacity: 0, scale: 1.45 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.7, ease: 'easeOut', delay: 0.12 }}
          />
        )}
      </AnimatePresence>

      {OPTIONS.map(option => (
        <button
          key={option.code}
          role="radio"
          aria-checked={lang === option.code}
          onClick={() => choose(option.code)}
          className={`relative z-10 w-[4.75rem] h-8 rounded-full text-xs font-bold transition-colors duration-300 ${lang === option.code ? 'text-white' : 'text-muted hover:text-foreground'}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

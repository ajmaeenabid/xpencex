import { ReactNode } from 'react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';

/** A round progress meter with something in the middle (a percent, or "4/10") */
export default function ProgressRing({ value, size = 56, stroke = 6, colorClass, children, label }: {
  value: number; // 0 to 1
  size?: number;
  stroke?: number;
  colorClass: string; // a text colour class such as 'text-amber-500'; the ring draws in that colour
  children?: ReactNode;
  label: string; // read out by screen readers
}) {
  const r = (size - stroke) / 2;
  const length = 2 * Math.PI * r;
  const shown = Math.min(1, Math.max(0, value));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} stroke="currentColor" className="text-black/10 dark:text-white/10" />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={length}
          className={colorClass}
          initial={{ strokeDashoffset: length }}
          animate={{ strokeDashoffset: length * (1 - shown) }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
      </svg>
      <div className={cn('absolute inset-0 flex items-center justify-center text-foreground')}>{children}</div>
    </div>
  );
}

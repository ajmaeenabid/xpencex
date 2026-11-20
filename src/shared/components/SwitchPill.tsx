import { RefObject, useLayoutEffect, useState } from 'react';
import { motion, MotionValue, useMotionValue, useMotionValueEvent, useTransform } from 'motion/react';
import { cn } from '../lib/utils';

// The soft glow behind the chosen side of a two-way switch ("Chats | Agent space", "Expenses | Reports").
// It is driven by the pages' own position (SidePager), so it moves exactly with them and follows a finger
// mid-swipe, never behind (chosen 2026-11-20).

type Box = { left: number; width: number };

export default function SwitchPill({ progress, tabs, className }: {
  progress: MotionValue<number>; // 0 = first tab, 1 = second, in between while sliding
  tabs: [RefObject<HTMLElement | null>, RefObject<HTMLElement | null>];
  className?: string;
}) {
  const [boxes, setBoxes] = useState<[Box, Box] | null>(null);
  useLayoutEffect(() => {
    const measure = () => {
      const [a, b] = tabs.map(t => t.current);
      if (a && b) setBoxes([{ left: a.offsetLeft, width: a.offsetWidth }, { left: b.offsetLeft, width: b.offsetWidth }]);
    };
    measure();
    const parent = tabs[0].current?.parentElement;
    if (!parent || typeof ResizeObserver === 'undefined') return;
    const watch = new ResizeObserver(measure);
    watch.observe(parent);
    return () => watch.disconnect();
  }, [tabs]);

  const left = useTransform(() => (boxes ? boxes[0].left + (boxes[1].left - boxes[0].left) * progress.get() : 0));
  const width = useTransform(() => (boxes ? boxes[0].width + (boxes[1].width - boxes[0].width) * progress.get() : 0));
  if (!boxes) return null;
  return (
    <motion.span
      aria-hidden
      className={cn('absolute top-0.5 bottom-0.5 rounded-full pointer-events-none bg-indigo-500/15 dark:bg-indigo-400/20 ring-1 ring-indigo-500/25 dark:ring-indigo-300/25', className)}
      style={{ left, width }}
    />
  );
}

/** Which side the switch is nearer to while sliding (for the tab's text colour): 0 or 1 */
export function useNearSide(progress: MotionValue<number> | null, fallback: 0 | 1): 0 | 1 {
  const stand = useMotionValue<number>(fallback);
  const source = progress ?? stand;
  const [near, setNear] = useState<0 | 1>(source.get() > 0.5 ? 1 : 0);
  useMotionValueEvent(source, 'change', p => setNear(p > 0.5 ? 1 : 0));
  return progress ? near : fallback;
}

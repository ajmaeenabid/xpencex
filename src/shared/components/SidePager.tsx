import { createContext, forwardRef, ReactNode, useCallback, useContext, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { animate, motion, MotionValue, useMotionValue, useMotionValueEvent, useReducedMotion, useTransform } from 'motion/react';
import { EDGE_PX, dragAxis, ownsSideways, pagerOffset, pagerTarget } from '../lib/swipe';
import { cn } from '../lib/utils';

// Two pages side by side that slide like pages of a book (chosen 2026-11-20): Chats | Agent space and
// Expenses | Reports. While a finger moves sideways the pages follow it; on lifting they finish the move or
// snap back. Tapping a tab slides over in about 0.3 s. Only touch drags it, so mouse and pen leave it alone.
// The other page is hidden while nothing moves, so it takes no room and can't be reached by mistake.

// What the pages inside can read: how far the pager has moved, so a header can stay still and a switch's
// highlight can move with the pages (PagerStill, SwitchPill)
interface PagerState { x: MotionValue<number>; width: MotionValue<number>; progress: MotionValue<number> }
const PagerContext = createContext<PagerState | null>(null);
const PaneContext = createContext(0);

/** 0 on the first page, 1 on the second, in between while moving; null outside a pager */
export const usePagerProgress = () => useContext(PagerContext)?.progress ?? null;

export interface SidePagerHandle {
  /** Slides to a page, then calls onSettle with it */
  slideTo: (side: 0 | 1) => void;
}

const SLIDE = { type: 'tween', duration: 0.3, ease: [0.25, 0.8, 0.25, 1] } as const;

const SidePager = forwardRef<SidePagerHandle, {
  side: 0 | 1; // the page shown now
  onSettle: (side: 0 | 1) => void; // called once a move has finished
  enabled?: boolean;
  // For pages that scroll the whole screen (Spending): how far down a page was, so while moving it shows
  // from there, as the screen will once the move ends. Pages that scroll inside themselves leave it out.
  scrollOf?: (side: 0 | 1) => number;
  // Follows the move: 0 on the first page, 1 on the second (a switch outside the pager can use it)
  progress?: MotionValue<number>;
  className?: string;
  trackClassName?: string; // e.g. h-full, for pages that fill a fixed height (the chat)
  paneClassName?: string;
  children: [ReactNode, ReactNode];
}>(function SidePager({ side, onSettle, enabled = true, scrollOf, progress: progressProp, className, trackClassName, paneClassName, children }, ref) {
  const reduceMotion = useReducedMotion();
  const box = useRef<HTMLDivElement>(null);
  const width = useRef(0);
  const x = useMotionValue(0);
  const widthValue = useMotionValue(0);
  const ownProgress = useMotionValue<number>(side);
  const progress = progressProp ?? ownProgress;
  useMotionValueEvent(x, 'change', at => {
    const w = widthValue.get();
    if (w > 0) progress.set(Math.min(1, Math.max(0, -at / w)));
  });
  // Both pages show while one is moving; `windowY` is how far the screen was scrolled when it started
  const [moving, setMoving] = useState<{ windowY: number } | null>(null);
  const drag = useRef<{ x: number; y: number; t: number; axis: 'x' | 'y' | null } | null>(null);

  const measure = () => { width.current = box.current?.offsetWidth || window.innerWidth; widthValue.set(width.current); };
  // The page shown follows `side` when it changes from elsewhere (a link, the bottom bar), without sliding
  useLayoutEffect(() => {
    measure();
    if (!moving) x.set(-side * width.current);
  }, [side]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onResize = () => { measure(); if (!moving) x.set(-side * width.current); };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [side, moving, x]);

  const settle = useCallback((target: 0 | 1) => {
    const done = () => { setMoving(null); if (target !== side) onSettle(target); };
    if (reduceMotion) { x.set(-target * width.current); done(); return; }
    animate(x, -target * width.current, SLIDE).then(done);
  }, [onSettle, reduceMotion, side, x]);

  useImperativeHandle(ref, () => ({
    slideTo: (target) => {
      if (target === side && !moving) return;
      measure();
      setMoving({ windowY: window.scrollY });
      // Wait one frame so the other page is drawn before it slides in
      requestAnimationFrame(() => settle(target));
    },
  }), [moving, settle, side]);

  const onTouchStart = (e: React.TouchEvent) => {
    drag.current = null;
    if (!enabled || e.touches.length !== 1) return;
    const touch = e.touches[0];
    if (touch.clientX < EDGE_PX || touch.clientX > window.innerWidth - EDGE_PX) return; // Android's back gesture
    if (ownsSideways(e.target, e.currentTarget)) return; // typing, or a row that scrolls sideways
    drag.current = { x: touch.clientX, y: touch.clientY, t: Date.now(), axis: null };
  };

  const onTouchMove = (e: React.TouchEvent) => {
    const d = drag.current;
    if (!d) return;
    const touch = e.touches[0];
    const dx = touch.clientX - d.x, dy = touch.clientY - d.y;
    if (!d.axis) {
      d.axis = dragAxis(dx, dy);
      if (d.axis === 'x') { measure(); setMoving({ windowY: window.scrollY }); }
    }
    if (d.axis === 'x') x.set(pagerOffset(side, dx, width.current));
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.axis !== 'x') return;
    const touch = e.changedTouches[0];
    settle(pagerTarget(side, touch.clientX - d.x, touch.clientY - d.y, Date.now() - d.t, width.current));
  };

  // While moving, a page that isn't the current one is pulled up to where it was scrolled, so it slides in
  // showing that part, as it will look once the screen scrolls there when the move ends
  const shift = (pane: 0 | 1) =>
    moving && scrollOf && pane !== side ? moving.windowY - scrollOf(pane) : 0;

  return (
    <PagerContext.Provider value={{ x, width: widthValue, progress }}>
    <div
      ref={box}
      className={cn('overflow-x-clip', className)}
      style={{ touchAction: 'pan-y' }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={() => { if (drag.current?.axis === 'x') settle(side); drag.current = null; }}
    >
      <motion.div className={cn('flex items-start', trackClassName)} style={{ x }}>
        {([0, 1] as const).map(pane => (
          <div
            key={pane}
            aria-hidden={pane !== side || undefined}
            inert={pane !== side ? true : undefined}
            className={cn('w-full shrink-0 min-w-0', paneClassName, pane !== side && !moving && 'invisible h-0 overflow-hidden')}
            style={shift(pane) ? { transform: `translateY(${shift(pane)}px)` } : undefined}
          >
            <PaneContext.Provider value={pane}>{children[pane]}</PaneContext.Provider>
          </div>
        ))}
      </motion.div>
    </div>
    </PagerContext.Provider>
  );
});

/**
 * Keeps its contents still while the pages slide (a page's title row and switch): it moves back by as much as
 * its page moves, and the two pages' copies cross-fade, so only what is below it slides (chosen 2026-11-20).
 */
export function PagerStill({ children, className }: { children: ReactNode; className?: string }) {
  const pager = useContext(PagerContext);
  const pane = useContext(PaneContext);
  const zero = useMotionValue(0);
  const x = pager?.x ?? zero, width = pager?.width ?? zero, progress = pager?.progress ?? zero;
  const back = useTransform(() => (pager ? -(x.get() + pane * width.get()) : 0));
  const opacity = useTransform(() => (pager ? (pane === 0 ? 1 - progress.get() : progress.get()) : 1));
  const pointerEvents = useTransform(() => (opacity.get() > 0.5 ? 'auto' : 'none'));
  return (
    <motion.div className={cn('relative z-10', className)} style={{ x: back, opacity, pointerEvents }}>
      {children}
    </motion.div>
  );
}

export default SidePager;

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowUpDown, Check, GripHorizontal } from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../../app/App';
import { useI18n } from '../i18n';
import { cn } from '../lib/utils';
import { dropIndex, mergeOrder, moveTo, placeVisible } from '../lib/sectionOrder';

// Long-press a card this long to pick it up; moving more than this first counts as scrolling
const HOLD_MS = 350;
const MOVE_TOLERANCE = 10;
// Near the top or bottom of the screen, a lifted card scrolls the page (the bottom bar covers the last part)
const EDGE_TOP = 100;
const EDGE_BOTTOM = 170;
const SLIDE = 'transform 200ms ease';

export type PageLayout = 'home' | 'reports' | 'profile';

export interface Section {
  id: string;
  node: React.ReactNode; // null or false: not shown right now (keeps its place in the order)
}

/** The card order for one page: loaded from the user's profile, saved back after every move */
export function useRearrange(page: PageLayout, defaultIds: string[]) {
  const { user, profile, refreshProfile } = useAuth();
  const [editing, setEditing] = useState(false);
  const [order, setOrder] = useState(() => mergeOrder(profile?.layout?.[page], defaultIds));
  const orderRef = useRef(order);
  orderRef.current = order;

  /** Changes the order and saves it */
  const commit = (change: (full: string[]) => string[]) => {
    const next = change(orderRef.current);
    orderRef.current = next;
    setOrder(next);
    if (!user) return;
    updateDoc(doc(db, 'users', user.uid), { [`layout.${page}`]: next })
      .then(refreshProfile)
      .catch(err => console.error('Could not save the card order:', err));
  };

  return { page, editing, toggle: () => setEditing(e => !e), order, commit };
}

export type RearrangeState = ReturnType<typeof useRearrange>;

/** The button at the top of a page that unlocks and locks moving its cards */
export function RearrangeButton({ layout, size = 'md' }: { layout: RearrangeState; size?: 'md' | 'sm' }) {
  const { t } = useI18n();
  const icon = size === 'sm' ? 18 : 22;
  return (
    <motion.button
      onClick={layout.toggle}
      whileTap={{ scale: 0.9 }}
      aria-pressed={layout.editing}
      aria-label={t(layout.editing ? 'layout.lock' : 'layout.unlock')}
      title={t(layout.editing ? 'layout.lock' : 'layout.unlock')}
      className={cn(
        'shrink-0 flex items-center justify-center transition-colors',
        size === 'sm' ? 'w-9 h-9 rounded-xl' : 'w-12 h-12 rounded-2xl',
        layout.editing ? 'bg-indigo-600 text-white' : 'bg-card shadow-soft border border-card-border text-indigo-600 dark:text-indigo-400'
      )}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={layout.editing ? 'done' : 'move'}
          initial={{ scale: 0.5, opacity: 0, rotate: -45 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          exit={{ scale: 0.5, opacity: 0, rotate: 45 }}
          transition={{ duration: 0.18 }}
        >
          {layout.editing ? <Check size={icon} /> : <ArrowUpDown size={icon} />}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  );
}

/** A card being dragged. Measured once when it is lifted; the cards only move by CSS while dragging. */
interface Drag {
  els: HTMLElement[]; // the cards on screen, top to bottom (cards with nothing to show are left out)
  centers: number[]; // their middles on the page, before the drag
  from: number;
  to: number;
  shift: number; // how far the others slide to make room: the lifted card's height and the gap
  startY: number;
  startScroll: number;
  lastY: number;
  raf: number;
}

/**
 * A page's movable cards. While unlocked, long-press a card to lift it and drag it up or down;
 * the others slide out of the way, and near the screen's edge the page scrolls. A short touch still
 * scrolls the page as usual. Nothing re-renders during the drag; the new order is saved on letting go.
 */
export function RearrangeList({ layout, sections, className }: { layout: RearrangeState; sections: Section[]; className?: string }) {
  const { t } = useI18n();
  const byId = new Map(sections.map(s => [s.id, s.node]));
  const visible = layout.order.filter(id => byId.get(id));
  const listRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [lifted, setLifted] = useState<string | null>(null);
  const settle = useRef<HTMLElement[] | null>(null); // cards to put back in place once the new order is drawn
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const stopListening = useRef<() => void>(() => {});

  // Once a card is lifted, stop the finger from also scrolling the page
  useEffect(() => {
    if (!layout.editing) return;
    const block = (e: TouchEvent) => { if (drag.current && e.cancelable) e.preventDefault(); };
    document.addEventListener('touchmove', block, { passive: false });
    return () => document.removeEventListener('touchmove', block);
  }, [layout.editing]);

  // The new order is drawn: clear the slides before the screen shows it, so nothing jumps
  useLayoutEffect(() => {
    if (lifted || !settle.current) return;
    for (const el of settle.current) { el.style.transition = ''; el.style.transform = ''; el.style.zIndex = ''; }
    settle.current = null;
  }, [lifted, layout.order]);

  const follow = (clientY: number) => {
    const d = drag.current;
    if (!d) return;
    d.lastY = clientY;
    const dy = clientY - d.startY + window.scrollY - d.startScroll;
    d.els[d.from].style.transform = `translateY(${dy}px) scale(1.03)`;
    const to = dropIndex(d.centers, d.from, d.centers[d.from] + dy);
    if (to === d.to) return;
    d.to = to;
    d.els.forEach((el, i) => {
      if (i === d.from) return;
      const s = d.from < to && i > d.from && i <= to ? -d.shift : to < d.from && i >= to && i < d.from ? d.shift : 0;
      el.style.transform = s ? `translateY(${s}px)` : '';
    });
  };

  const onMove = (e: PointerEvent) => follow(e.clientY);

  const scrollNearEdge = () => {
    const d = drag.current;
    if (!d) return;
    const y = d.lastY;
    const bottom = window.innerHeight - EDGE_BOTTOM;
    const speed = y < EDGE_TOP ? -Math.ceil((EDGE_TOP - y) / 6) : y > bottom ? Math.ceil((y - bottom) / 6) : 0;
    if (speed) { window.scrollBy(0, speed); follow(y); }
    d.raf = requestAnimationFrame(scrollNearEdge);
  };

  const onDrop = () => {
    const d = drag.current;
    if (!d) return;
    stopListening.current();
    drag.current = null;
    if (d.to !== d.from) {
      settle.current = d.els;
      const shown = d.els.map(el => el.dataset.id!);
      layoutRef.current.commit(full => placeVisible(full, moveTo(shown, d.from, d.to)));
    } else {
      // Not moved: glide back into place
      const el = d.els[d.from];
      el.style.transition = SLIDE;
      el.style.transform = '';
      window.setTimeout(() => { el.style.transition = ''; el.style.zIndex = ''; }, 220);
      d.els.forEach(other => { if (other !== el) other.style.transition = ''; });
    }
    setLifted(null);
  };

  const lift = (id: string, clientY: number) => {
    const els = Array.from(listRef.current?.children || [])
      .filter((el): el is HTMLElement => el instanceof HTMLElement && !!el.dataset.id && el.offsetHeight > 0);
    const from = els.findIndex(el => el.dataset.id === id);
    if (from < 0) return;
    const boxes = els.map(el => { const r = el.getBoundingClientRect(); return { top: r.top + window.scrollY, height: r.height }; });
    const gap = boxes.length > 1 ? Math.max(0, boxes[1].top - (boxes[0].top + boxes[0].height)) : 0;
    drag.current = {
      els, centers: boxes.map(b => b.top + b.height / 2), from, to: from, shift: boxes[from].height + gap,
      startY: clientY, startScroll: window.scrollY, lastY: clientY, raf: 0,
    };
    els.forEach((el, i) => { el.style.transition = i === from ? 'none' : SLIDE; });
    els[from].style.zIndex = '30';
    els[from].style.transform = 'scale(1.03)';
    navigator.vibrate?.(12);
    setLifted(id);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onDrop);
    window.addEventListener('pointercancel', onDrop);
    drag.current.raf = requestAnimationFrame(scrollNearEdge);
    // These exact listeners, so letting go (or leaving the page) removes them
    stopListening.current = () => {
      cancelAnimationFrame(drag.current?.raf ?? 0);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onDrop);
      window.removeEventListener('pointercancel', onDrop);
    };
  };

  // Leaving the page mid-drag: stop listening
  useEffect(() => () => { stopListening.current(); drag.current = null; }, []);

  return (
    <>
      <AnimatePresence initial={false}>
        {layout.editing && (
          <motion.p
            key="hint"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <span className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 text-xs font-bold text-indigo-700 dark:text-indigo-300">
              <GripHorizontal size={16} /> {t('layout.hint')}
            </span>
          </motion.p>
        )}
      </AnimatePresence>
      <div ref={listRef} className={className}>
        {visible.map(id => (
          <Row key={id} id={id} section={`${layout.page}:${id}`} editing={layout.editing} lifted={lifted === id} onLift={lift}>
            {byId.get(id)}
          </Row>
        ))}
      </div>
    </>
  );
}

function Row({ id, section, editing, lifted, onLift, children }: {
  id: string; section: string; editing: boolean; lifted: boolean; onLift: (id: string, clientY: number) => void; children: React.ReactNode;
}) {
  const timer = useRef<number | undefined>(undefined);
  const start = useRef({ x: 0, y: 0 });
  const latestY = useRef(0);

  const cancelHold = () => { window.clearTimeout(timer.current); timer.current = undefined; };
  useEffect(() => cancelHold, []);

  const onPointerDown = (e: React.PointerEvent) => {
    if (!editing || e.button > 0) return;
    start.current = { x: e.clientX, y: e.clientY };
    latestY.current = e.clientY;
    cancelHold();
    timer.current = window.setTimeout(() => {
      timer.current = undefined;
      onLift(id, latestY.current);
    }, HOLD_MS);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (timer.current === undefined) return;
    latestY.current = e.clientY;
    if (Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > MOVE_TOLERANCE) cancelHold(); // scrolling
  };

  return (
    <div
      data-id={id}
      // "page:card", so search can find this card and scroll to it (goToPlace in App.tsx)
      data-section={section}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={cancelHold}
      onPointerCancel={cancelHold}
      onContextMenu={editing ? (e: React.MouseEvent) => e.preventDefault() : undefined}
      className={cn(
        // A card that renders nothing (for example the admin panel for other users) leaves no empty box
        'relative [&:has(>[data-card]:empty)]:hidden',
        editing && 'select-none [-webkit-touch-callout:none] cursor-grab',
        lifted && 'cursor-grabbing'
      )}
    >
      {editing && (
        <>
          <span aria-hidden="true" className={cn(
            'pointer-events-none absolute -inset-1.5 rounded-[2.4rem] border-2 border-dashed transition-colors',
            lifted ? 'border-indigo-500 bg-indigo-500/5 shadow-2xl' : 'border-indigo-400/60'
          )} />
          <span aria-hidden="true" className="pointer-events-none absolute -top-3 left-1/2 -translate-x-1/2 z-10 flex items-center justify-center w-10 h-6 rounded-full bg-indigo-600 text-white shadow-md">
            <GripHorizontal size={16} />
          </span>
        </>
      )}
      {/* While moving cards, their own buttons don't react, so nothing opens by accident */}
      <div data-card="" className={cn(editing && 'pointer-events-none')}>{children}</div>
    </div>
  );
}

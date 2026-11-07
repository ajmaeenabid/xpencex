import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, Reorder, useDragControls } from 'motion/react';
import { ArrowUpDown, Check, GripHorizontal } from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../../app/App';
import { useI18n } from '../i18n';
import { cn } from '../lib/utils';
import { mergeOrder, placeVisible } from '../lib/sectionOrder';

// Long-press a card this long to pick it up; moving more than this first counts as scrolling
const HOLD_MS = 350;
const MOVE_TOLERANCE = 10;

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

  const save = () => {
    if (!user) return;
    updateDoc(doc(db, 'users', user.uid), { [`layout.${page}`]: orderRef.current })
      .then(refreshProfile)
      .catch(err => console.error('Could not save the card order:', err));
  };

  return { editing, toggle: () => setEditing(e => !e), order, setOrder, save };
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

/**
 * A page's movable cards. While unlocked, long-press a card to lift it and drag it up or down;
 * the others slide out of the way. A short touch still scrolls the page as usual.
 */
export function RearrangeList({ layout, sections, className }: { layout: RearrangeState; sections: Section[]; className?: string }) {
  const { t } = useI18n();
  const byId = new Map(sections.map(s => [s.id, s.node]));
  const visible = layout.order.filter(id => byId.get(id));
  const lifted = useRef(false);

  // Once a card is lifted, stop the finger from also scrolling the page
  useEffect(() => {
    if (!layout.editing) return;
    const block = (e: TouchEvent) => { if (lifted.current && e.cancelable) e.preventDefault(); };
    document.addEventListener('touchmove', block, { passive: false });
    return () => document.removeEventListener('touchmove', block);
  }, [layout.editing]);

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
      <Reorder.Group
        as="div"
        axis="y"
        values={visible}
        onReorder={(next: string[]) => layout.setOrder(full => placeVisible(full, next))}
        className={className}
      >
        {visible.map(id => (
          <Row key={id} id={id} editing={layout.editing} lifted={lifted} onDrop={layout.save}>
            {byId.get(id)}
          </Row>
        ))}
      </Reorder.Group>
    </>
  );
}

function Row({ id, editing, lifted, onDrop, children }: {
  id: string; editing: boolean; lifted: React.MutableRefObject<boolean>; onDrop: () => void; children: React.ReactNode;
}) {
  const controls = useDragControls();
  const timer = useRef<number | undefined>(undefined);
  const start = useRef({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);

  const cancelHold = () => { window.clearTimeout(timer.current); timer.current = undefined; };
  useEffect(() => cancelHold, []);

  const onPointerDown = (e: React.PointerEvent) => {
    if (!editing) return;
    const event = e.nativeEvent;
    start.current = { x: e.clientX, y: e.clientY };
    cancelHold();
    timer.current = window.setTimeout(() => {
      timer.current = undefined;
      lifted.current = true;
      setDragging(true);
      navigator.vibrate?.(12);
      controls.start(event);
    }, HOLD_MS);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (timer.current === undefined) return;
    if (Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > MOVE_TOLERANCE) cancelHold(); // scrolling
  };
  const drop = () => {
    lifted.current = false;
    setDragging(false);
    onDrop();
  };

  return (
    <Reorder.Item
      as="div"
      value={id}
      dragListener={false}
      dragControls={controls}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={cancelHold}
      onPointerCancel={cancelHold}
      onDragEnd={drop}
      onContextMenu={editing ? (e: React.MouseEvent) => e.preventDefault() : undefined}
      animate={{ scale: dragging ? 1.03 : editing ? 0.97 : 1 }}
      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
      className={cn(
        // A card that renders nothing (for example the admin panel for other users) leaves no empty box
        'relative [&:has(>[data-card]:empty)]:hidden',
        editing && 'select-none [-webkit-touch-callout:none] cursor-grab',
        dragging && 'cursor-grabbing z-30'
      )}
    >
      {editing && (
        <>
          <span aria-hidden="true" className={cn(
            'pointer-events-none absolute -inset-1.5 rounded-[2.4rem] border-2 border-dashed transition-colors',
            dragging ? 'border-indigo-500 bg-indigo-500/5 shadow-2xl' : 'border-indigo-400/60'
          )} />
          <span aria-hidden="true" className="pointer-events-none absolute -top-3 left-1/2 -translate-x-1/2 z-10 flex items-center justify-center w-10 h-6 rounded-full bg-indigo-600 text-white shadow-md">
            <GripHorizontal size={16} />
          </span>
        </>
      )}
      {/* While moving cards, their own buttons don't react, so nothing opens by accident */}
      <div data-card="" className={cn(editing && 'pointer-events-none')}>{children}</div>
    </Reorder.Item>
  );
}

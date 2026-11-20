import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '../lib/utils';
import { useBackClose } from '../lib/backButton';

export interface SelectOption {
  value: string;
  label: string;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  id?: string;
  ariaLabel?: string;
  /** 'field' matches the app's form inputs; 'pill' is the small rounded chip used on charts */
  variant?: 'field' | 'pill';
  className?: string;
}

const LIST_MAX_HEIGHT = 264;
const GAP = 6;
const KEYBOARD_SETTLE_MS = 600; // how long the phone keyboard takes to slide away

/**
 * The app's own dropdown, used instead of the browser's <select> so the list matches the theme
 * (the browser's list can't be restyled, e.g. its blue hover). Works with mouse, touch and keyboard.
 */
export default function Select({ value, onChange, options, id, ariaLabel, variant = 'field', className }: Props) {
  const [open, setOpen] = useState(false);
  // The phone's back button closes the list first (src/shared/lib/backButton.ts)
  useBackClose(open, () => setOpen(false));
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState<{ left: number; width: number; top?: number; bottom?: number }>({ left: 0, width: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  const selectedIndex = Math.max(0, options.findIndex(o => o.value === value));
  const selected = options[selectedIndex];

  // Place the list under the button, or above it when there isn't room below
  const place = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.max(rect.width, variant === 'pill' ? 170 : 0);
    const left = Math.min(Math.max(8, variant === 'pill' ? rect.right - width : rect.left), window.innerWidth - width - 8);
    const spaceBelow = window.innerHeight - rect.bottom;
    if (spaceBelow < Math.min(LIST_MAX_HEIGHT, options.length * 44) + GAP && rect.top > spaceBelow) {
      setPosition({ left, width, bottom: window.innerHeight - rect.top + GAP });
    } else {
      setPosition({ left, width, top: rect.bottom + GAP });
    }
  };

  const openList = () => {
    place();
    setActiveIndex(selectedIndex);
    setOpen(true);
  };

  const choose = (index: number) => {
    const option = options[index];
    if (option) onChange(option.value);
    setOpen(false);
    triggerRef.current?.focus();
  };

  // Show the highlighted option without the user having to scroll
  useLayoutEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIndex]);

  // Close when tapping outside, or when the page scrolls or resizes underneath. On a phone, tapping the button
  // while typing closes the keyboard first: the screen gets taller and the page may shift. That must not close
  // the list (it took two taps to open), so a change of height only moves it, and so does a scroll just after opening.
  useEffect(() => {
    if (!open) return;
    const openedAt = Date.now();
    const width = window.innerWidth;
    const settling = () => Date.now() - openedAt < KEYBOARD_SETTLE_MS;
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!listRef.current?.contains(target) && !triggerRef.current?.contains(target)) setOpen(false);
    };
    const onScroll = (e: Event) => {
      if (listRef.current?.contains(e.target as Node)) return;
      if (settling()) place(); else setOpen(false);
    };
    const onResize = () => {
      if (window.innerWidth === width) place(); else setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
        openList();
      }
      return;
    }
    const last = options.length - 1;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex(i => Math.min(last, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex(i => Math.max(0, i - 1)); }
    else if (e.key === 'Home') { e.preventDefault(); setActiveIndex(0); }
    else if (e.key === 'End') { e.preventDefault(); setActiveIndex(last); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(activeIndex); }
    else if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } // don't also close a popup behind it
    else if (e.key === 'Tab') { setOpen(false); }
    else if (e.key.length === 1) {
      // Jump to the next option starting with the typed letter
      const letter = e.key.toLowerCase();
      const from = activeIndex + 1;
      const order = [...options.slice(from), ...options.slice(0, from)];
      const match = order.find(o => o.label.toLowerCase().startsWith(letter));
      if (match) setActiveIndex(options.indexOf(match));
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? `${listId}-${activeIndex}` : undefined}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
        className={cn(
          // min-w-0 lets it shrink inside narrow grids and rows instead of spilling over its neighbours
          'min-w-0 flex items-center justify-between gap-2 text-left outline-none transition-all',
          variant === 'field'
            ? 'w-full px-4 py-3 bg-background/50 rounded-xl text-sm text-foreground font-medium border border-transparent hover:border-card-border focus-visible:ring-2 focus-visible:ring-indigo-600'
            : 'shrink-0 pl-3 pr-2 py-1.5 rounded-full text-xs font-semibold bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 focus-visible:ring-2 focus-visible:ring-indigo-600',
          open && variant === 'field' && 'ring-2 ring-indigo-600',
          className
        )}
      >
        <span className="min-w-0 truncate">{selected?.label}</span>
        <ChevronDown size={variant === 'pill' ? 14 : 16} className={cn('shrink-0 transition-transform duration-200', open && 'rotate-180', variant === 'field' && 'text-muted')} />
      </button>

      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.ul
              ref={listRef}
              id={listId}
              role="listbox"
              aria-label={ariaLabel}
              initial={{ opacity: 0, scale: 0.96, y: position.top !== undefined ? -6 : 6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
              style={{ position: 'fixed', left: position.left, width: position.width, top: position.top, bottom: position.bottom, maxHeight: LIST_MAX_HEIGHT }}
              className={cn(
                'z-[70] overflow-y-auto no-scrollbar p-1.5 rounded-2xl border border-card-border shadow-2xl',
                'bg-[var(--card-solid)] text-foreground',
                position.top !== undefined ? 'origin-top' : 'origin-bottom'
              )}
            >
              {options.map((option, index) => {
                const isSelected = option.value === value;
                const isActive = index === activeIndex;
                return (
                  <li
                    key={option.value}
                    id={`${listId}-${index}`}
                    data-index={index}
                    role="option"
                    aria-selected={isSelected}
                    onPointerEnter={() => setActiveIndex(index)}
                    onClick={() => choose(index)}
                    className={cn(
                      'flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-sm cursor-pointer select-none transition-colors',
                      isActive && 'bg-indigo-500/10 dark:bg-indigo-400/15',
                      isSelected ? 'font-semibold text-indigo-600 dark:text-indigo-400' : 'font-medium'
                    )}
                  >
                    <span className="truncate">{option.label}</span>
                    {isSelected && <Check size={15} className="shrink-0" />}
                  </li>
                );
              })}
            </motion.ul>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}

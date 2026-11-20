import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../lib/utils';
import { useBackClose } from '../lib/backButton';

interface Props {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  disabled?: boolean;
  maxLength?: number;
  className?: string;
}

const LIST_MAX_HEIGHT = 264;
const GAP = 6;

/** Options that match what's typed. Everything shows when nothing is typed or a full name is already chosen. */
export function matchingOptions(options: string[], typed: string): string[] {
  const words = typed.trim().toLowerCase();
  if (!words || options.some(o => o.toLowerCase() === words)) return options;
  return options.filter(o => o.toLowerCase().includes(words));
}

/**
 * A text box with suggestions, in the app's own style. The browser's <datalist> does the same job,
 * but the phone draws its list and the app can't theme it. Any typed value is still allowed.
 */
export default function Combobox({ id, value, onChange, options, placeholder, disabled, maxLength, className }: Props) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [position, setPosition] = useState<{ left: number; width: number; top?: number; bottom?: number; maxHeight: number }>({ left: 0, width: 0, maxHeight: LIST_MAX_HEIGHT });
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  const matches = matchingOptions(options, value);
  const showing = open && matches.length > 0;
  // The phone's back button closes the list first (src/shared/lib/backButton.ts)
  useBackClose(showing, () => setOpen(false));

  const place = () => {
    const rect = inputRef.current?.getBoundingClientRect();
    if (!rect) return;
    // The phone's keyboard takes up part of the window, and visualViewport knows how much
    const viewHeight = window.visualViewport?.height ?? window.innerHeight;
    const below = viewHeight - rect.bottom - GAP * 2;
    const above = rect.top - GAP * 2;
    const left = Math.min(Math.max(8, rect.left), window.innerWidth - rect.width - 8);
    if (below < Math.min(LIST_MAX_HEIGHT, matches.length * 44) && above > below) {
      setPosition({ left, width: rect.width, bottom: window.innerHeight - rect.top + GAP, maxHeight: Math.min(LIST_MAX_HEIGHT, above) });
    } else {
      setPosition({ left, width: rect.width, top: rect.bottom + GAP, maxHeight: Math.min(LIST_MAX_HEIGHT, Math.max(120, below)) });
    }
  };

  useLayoutEffect(() => { if (showing) place(); }, [showing, matches.length]);

  useEffect(() => {
    if (!open) return;
    const onOutside = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!inputRef.current?.contains(target) && !listRef.current?.contains(target)) setOpen(false);
    };
    const onScroll = (e: Event) => { if (!listRef.current?.contains(e.target as Node)) place(); };
    document.addEventListener('pointerdown', onOutside);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', place);
    window.visualViewport?.addEventListener('resize', place);
    return () => {
      document.removeEventListener('pointerdown', onOutside);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', place);
      window.visualViewport?.removeEventListener('resize', place);
    };
  }, [open]);

  useEffect(() => {
    if (activeIndex >= 0) listRef.current?.querySelector(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const choose = (option: string) => {
    onChange(option);
    setOpen(false);
    setActiveIndex(-1);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!showing) return setOpen(true);
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex(i => (i + step + matches.length) % matches.length);
    } else if (e.key === 'Enter' && showing && activeIndex >= 0) {
      e.preventDefault();
      choose(matches[activeIndex]);
    } else if (e.key === 'Escape' && showing) {
      e.stopPropagation();
      setOpen(false);
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        id={id}
        role="combobox"
        aria-expanded={showing}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        placeholder={placeholder}
        disabled={disabled}
        maxLength={maxLength}
        className={className}
        value={value}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActiveIndex(-1);
        }}
        onKeyDown={onKeyDown}
      />
      {showing && createPortal(
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          style={{ left: position.left, width: position.width, top: position.top, bottom: position.bottom, maxHeight: position.maxHeight }}
          className="fixed z-[70] overflow-y-auto no-scrollbar p-1.5 rounded-2xl border border-card-border bg-[var(--card-solid)] text-foreground shadow-2xl"
        >
          {matches.map((option, index) => (
            <li
              key={option}
              role="option"
              data-index={index}
              aria-selected={option === value}
              // Keeps the typing box focused, so the phone's keyboard doesn't jump
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(option)}
              className={cn(
                'px-3 py-2.5 rounded-xl text-sm font-semibold cursor-pointer',
                index === activeIndex || option === value
                  ? 'bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300'
                  : 'hover:bg-background/70',
              )}
            >
              {option}
            </li>
          ))}
        </ul>,
        document.body,
      )}
    </>
  );
}

// The phone's back button (chosen 2026-11-20). Every open window, sheet, dialog or dropdown adds itself here
// while it is open; back closes only the newest one, the same as its X or arrow button. With nothing open,
// App.tsx goes to Home, or puts the app in the background from Home.
import { useEffect, useRef } from 'react';

type Handler = () => void;

export function createBackStack() {
  const open: { id: number; handler: Handler }[] = [];
  let nextId = 0;
  return {
    /** Adds a window; call what it returns when the window closes */
    add(handler: Handler) {
      const id = nextId++;
      open.push({ id, handler });
      return () => {
        const at = open.findIndex(entry => entry.id === id);
        if (at >= 0) open.splice(at, 1);
      };
    },
    /** Closes the newest window. False when nothing is open. */
    back(): boolean {
      const top = open[open.length - 1];
      if (!top) return false;
      top.handler();
      return true;
    },
    get size() { return open.length; },
  };
}

const shared = createBackStack();
export const handleBack = () => shared.back();

/**
 * While `active`, the back button runs `onBack` (closing this window, or one page back inside it).
 * Windows opened later sit on top, so back reaches them first.
 */
export function useBackClose(active: boolean, onBack: Handler) {
  const latest = useRef(onBack);
  latest.current = onBack;
  useEffect(() => {
    if (!active) return;
    return shared.add(() => latest.current());
  }, [active]);
}

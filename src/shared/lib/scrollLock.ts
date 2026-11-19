// Stops the page behind a window or sheet from scrolling. Windows can sit on top of each other and refresh at the
// same moment, so they share one count: the page scrolls again only when the last of them has let go.

export function createScrollLock(style: { overflow: string }) {
  let holders = 0;
  let before = '';
  return () => {
    if (holders === 0) {
      before = style.overflow;
      style.overflow = 'hidden';
    }
    holders += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      holders -= 1;
      if (holders === 0) style.overflow = before;
    };
  };
}

let shared: ReturnType<typeof createScrollLock> | null = null;

/** Locks the page's scrolling. Call what it returns to let go. */
export function lockScroll() {
  shared ??= createScrollLock(document.body.style);
  return shared();
}

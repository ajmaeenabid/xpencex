import { useEffect, useState } from 'react';

// Whether the on-screen keyboard is open. Phones shrink the visible screen when it opens, so this
// compares the screen's height with the tallest it has been, and only counts it while someone is typing.

const isTyping = (el: Element | null) =>
  !!el && (el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && !['checkbox', 'radio', 'button', 'submit', 'range', 'color', 'file'].includes(el.type)) || (el as HTMLElement).isContentEditable);

/**
 * For buttons used while typing (like the chat's attach button). A tap normally takes the focus from the text
 * box, so the keyboard starts closing and the screen grows; the button moves away under the finger and the tap
 * is lost. Keeping the focus where it is keeps the keyboard and the button still, so the tap always works.
 */
export const keepTyping = {
  onPointerDown: (e: { preventDefault: () => void }) => e.preventDefault(),
  onMouseDown: (e: { preventDefault: () => void }) => e.preventDefault(),
};

/** True when the screen got noticeably shorter while a text box has the focus */
export const keyboardLooksOpen = (height: number, tallest: number, typing: boolean) => typing && height < tallest * 0.8;

export function useKeyboardOpen() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const height = () => window.visualViewport?.height ?? window.innerHeight;
    let tallest = height();
    let width = window.innerWidth;

    const check = () => {
      // Turning the phone resets what "full height" means
      if (window.innerWidth !== width) { width = window.innerWidth; tallest = height(); }
      const h = height();
      if (h > tallest) tallest = h;
      setOpen(keyboardLooksOpen(h, tallest, isTyping(document.activeElement)));
    };
    // Focus changes come before the keyboard finishes moving, so check again a moment later
    const soon = () => { check(); window.setTimeout(check, 350); };

    window.addEventListener('resize', check);
    window.visualViewport?.addEventListener('resize', check);
    document.addEventListener('focusin', soon);
    document.addEventListener('focusout', soon);
    return () => {
      window.removeEventListener('resize', check);
      window.visualViewport?.removeEventListener('resize', check);
      document.removeEventListener('focusin', soon);
      document.removeEventListener('focusout', soon);
    };
  }, []);

  return open;
}

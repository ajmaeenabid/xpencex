// After search switches tab: find the card ("page:card", data-section in Rearrange.tsx), scroll it to the
// middle of the screen and light it up for a moment (.search-flash in index.css). With `open`, also tap
// the card's own button, for cards that are one row opening a window (Reminders, Lend and borrow...).
// The page may still be loading (Reports downloads on first visit), so it keeps looking for a few seconds.

const LOOK_FOR_MS = 3000;
const FLASH_MS = 1800;

export function revealSection(section: string, open: boolean) {
  const started = Date.now();
  const look = () => {
    const el = document.querySelector<HTMLElement>(`[data-section="${section}"]`);
    // offsetParent is null while the card's page is still hidden
    if (!el || el.offsetParent === null) {
      if (Date.now() - started < LOOK_FOR_MS) window.setTimeout(look, 100);
      return;
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('search-flash');
    window.setTimeout(() => el.classList.remove('search-flash'), FLASH_MS);
    if (open) {
      const button = el.querySelector<HTMLElement>(':scope > [data-card] > button');
      if (button) window.setTimeout(() => button.click(), 450);
    }
  };
  // Wait for the tab switch, which puts back that tab's own scroll position first
  window.setTimeout(look, 200);
}

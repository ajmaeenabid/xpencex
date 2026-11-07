import type { TKey } from '../i18n';

// Short notes at the top of the screen that hide by themselves (see components/Toast.tsx)

type Listener = (key: TKey) => void;
let listener: Listener | null = null;

/** Shows a short note for 3 seconds */
export function showToast(key: TKey) {
  listener?.(key);
}

/** Used by ToastHost only */
export function onToast(next: Listener | null) {
  listener = next;
}

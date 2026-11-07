import { showToast } from './toast';

/** How long to wait for the server before moving on (the save is already on the phone by then) */
export const SERVER_WAIT_MS = 5000;

export type SaveResult = 'saved' | 'onPhone';

/**
 * Firestore puts a save on the phone at once, but its promise only finishes when the server has it,
 * which never happens offline. This finishes as soon as the server answers, straight away when the
 * phone is offline, or after `waitMs` on a connection that hangs. A refusal from the server within
 * that time still throws, so screens show their error as before.
 */
export function waitForServer(write: Promise<unknown>, { online = isOnline(), waitMs = SERVER_WAIT_MS } = {}): Promise<SaveResult> {
  let movedOn = false;
  const server = write.then(() => 'saved' as const);
  // Firebase undoes a refused save on the phone by itself; this only records it
  server.catch((err) => { if (movedOn) console.error('The server refused a save made while offline:', err); });
  if (!online) {
    movedOn = true;
    return Promise.resolve('onPhone');
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<SaveResult>((resolve) => {
    timer = setTimeout(() => { movedOn = true; resolve('onPhone'); }, waitMs);
  });
  return Promise.race([server, timeout]).finally(() => clearTimeout(timer));
}

/** Saves, and says "Saved on this phone..." when it is waiting to sync */
export async function saved(write: Promise<unknown>): Promise<SaveResult> {
  const result = await waitForServer(write);
  if (result === 'onPhone') showToast('save.onPhone');
  return result;
}

/** False only when the phone knows it has no connection */
export const isOnline = () => typeof navigator === 'undefined' || navigator.onLine !== false;

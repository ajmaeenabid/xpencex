import { auth } from '../firebase';
import { callWorker } from './workerApi';
import { isOnline } from './offlineSave';
import { appVersion, isNative } from './nativeApp';
import { containsSecret } from './sensitiveData';
import { maskSensitive } from './smsParser';
import { deviceLabelFrom } from '../../../ai-server/src/deviceRules';

// When something breaks on a phone, a short report goes to the AI server (ai-server/src/errorReports.ts) and,
// in the phone app, to Firebase Crashlytics. It holds the error, the screen, the app version and the phone model:
// no money data and no messages. Anything that looks like a code or password is never sent, and numbers are hidden.

let screen = 'start';
/** The screen people are on, so a report says where it happened (App.tsx sets it when the tab changes) */
export const setErrorScreen = (name: string) => { screen = name; };

// The same error is sent once per app session; the server also counts repeats per day
const sentThisSession = new Set<string>();

type Recorder = (message: string, screen: string) => void;
let crashlytics: Recorder | null = null;
/** Set by the phone app's Crashlytics setup (crashlytics.ts), so app errors reach it too */
export const setCrashlyticsRecorder = (recorder: Recorder) => { crashlytics = recorder; };

/** The text that may leave the phone, or null when it might hold something private */
export function safeText(text: string, max: number): string | null {
  if (containsSecret(text)) return null;
  return maskSensitive(text).slice(0, max);
}

function describe(error: unknown): { message: string; stack: string } {
  if (error instanceof Error) return { message: `${error.name}: ${error.message}`, stack: error.stack || '' };
  if (typeof error === 'string') return { message: error, stack: '' };
  try {
    return { message: JSON.stringify(error).slice(0, 300), stack: '' };
  } catch {
    return { message: String(error), stack: '' };
  }
}

/** Sends one report. Never throws and never waits: reporting must not break the app further. */
export function reportError(error: unknown, where = screen) {
  try {
    const { message: raw, stack: rawStack } = describe(error);
    const message = safeText(raw, 300);
    if (!message) return;
    const key = `${where}|${message}`;
    if (sentThisSession.has(key)) return;
    sentThisSession.add(key);

    crashlytics?.(message, where);

    if (!auth.currentUser || !isOnline()) return; // the server needs a signed-in person
    const stack = safeText(rawStack, 1500) || '';
    appVersion()
      .catch(() => '')
      .then(version => callWorker('/errors/report', {
        message, stack, screen: where, version: version || (isNative() ? '' : 'web'), device: deviceLabelFrom(navigator.userAgent),
      }))
      .catch(() => { /* nothing more to do */ });
  } catch {
    // never let reporting cause another error
  }
}

/** Catches errors nothing else caught. Installed once, in main.tsx. */
export function installErrorReports() {
  window.addEventListener('error', (e) => reportError(e.error ?? e.message));
  window.addEventListener('unhandledrejection', (e) => reportError(e.reason));
}

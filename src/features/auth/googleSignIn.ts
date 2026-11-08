import { initializeApp } from 'firebase/app';
import {
  Auth, GoogleAuthProvider, browserPopupRedirectResolver, getAdditionalUserInfo, inMemoryPersistence,
  initializeAuth, signInWithPopup, signInWithRedirect, signOut,
} from 'firebase/auth';
import firebaseConfig from '../../../firebase-config.json';
import { auth } from '../../shared/firebase';

// Every Google sign-in in the app lives in this file. The phone app (Capacitor) can't use pop-ups,
// so that version only needs a native Google plugin here and nothing else changes.

// Always show the account list, and ask Google for a fresh login. Google decides whether that means
// a password, a fingerprint or nothing; the app never sees the password.
const provider = () => {
  const google = new GoogleAuthProvider();
  google.setCustomParameters({ prompt: 'select_account', max_age: '0' });
  return google;
};

/** Sign-in from the login page */
export async function signInWithGoogle() {
  try {
    await signInWithPopup(auth, provider());
  } catch (err: any) {
    if (err?.code !== 'auth/popup-blocked') throw err;
    await signInWithRedirect(auth, provider());
  }
}

export const signInWasCancelled = (err: any) =>
  err?.code === 'auth/popup-closed-by-user' || err?.code === 'auth/cancelled-popup-request';

export class WrongGoogleAccountError extends Error {}

// A second, separate sign-in that is never saved. The main session must stay as it is, because
// signing in on it would drop this device's pass and stop every screen from loading its data.
let confirmAuth: Auth | null = null;
const getConfirmAuth = () => {
  confirmAuth ??= initializeAuth(initializeApp(firebaseConfig, 'confirm-with-google'), {
    persistence: inMemoryPersistence,
    popupRedirectResolver: browserPopupRedirectResolver,
  });
  return confirmAuth;
};

/** Asks the person to confirm with Google now, for serious actions. The token proves it to the server. */
export async function freshGoogleToken() {
  const confirm = getConfirmAuth();
  const result = await signInWithPopup(confirm, provider());
  try {
    if (result.user.uid !== auth.currentUser?.uid) {
      // Picking an account that has never used XpenceX would otherwise leave an empty login behind
      if (getAdditionalUserInfo(result)?.isNewUser) await result.user.delete();
      throw new WrongGoogleAccountError();
    }
    return await result.user.getIdToken();
  } finally {
    await signOut(confirm).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Linking Google apps (Drive, Sheets). This asks Google for a one-time code that the AI server swaps
// for a lasting permission (ai-server/src/googleApps.ts). On the web it uses Google's own pop-up;
// the phone app will swap in a native plugin here that returns a server auth code ({ native: true }).
// ---------------------------------------------------------------------------

const GIS_URL = 'https://accounts.google.com/gsi/client';
let gisLoading: Promise<void> | null = null;

/** Loads Google's pop-up library. Called early, so the pop-up opens straight from the tap. */
export function preloadGoogleApps() {
  gisLoading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GIS_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => { gisLoading = null; reject(new Error('Could not load Google')); };
    document.head.appendChild(script);
  });
  return gisLoading;
}

export class GoogleAppsCancelled extends Error {}

/** Opens Google's permission screen for the signed-in account and returns the one-time code */
export async function googleAppsCode(scope: string): Promise<{ code: string; native?: boolean }> {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
  if (!clientId) throw new Error('VITE_GOOGLE_CLIENT_ID is not set');
  await preloadGoogleApps();
  return new Promise((resolve, reject) => {
    const client = (window as any).google.accounts.oauth2.initCodeClient({
      client_id: clientId,
      scope,
      ux_mode: 'popup',
      // Suggests the account already signed in; the server still refuses any other account
      login_hint: auth.currentUser?.email || undefined,
      callback: (reply: { code?: string; error?: string }) => {
        if (reply.code) resolve({ code: reply.code });
        else reject(reply.error === 'access_denied' ? new GoogleAppsCancelled() : new Error(reply.error || 'Google refused'));
      },
      error_callback: (err: { type?: string }) =>
        reject(err?.type === 'popup_closed' ? new GoogleAppsCancelled() : new Error(err?.type || 'Google pop-up failed')),
    });
    client.requestCode();
  });
}

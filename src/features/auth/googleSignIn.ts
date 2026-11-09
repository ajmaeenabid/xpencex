import { initializeApp } from 'firebase/app';
import {
  Auth, GoogleAuthProvider, UserCredential, browserPopupRedirectResolver, getAdditionalUserInfo, inMemoryPersistence,
  initializeAuth, signInWithCredential, signInWithPopup, signInWithRedirect, signOut,
} from 'firebase/auth';
import { Capacitor } from '@capacitor/core';
import firebaseConfig from '../../../firebase-config.json';
import { auth } from '../../shared/firebase';

// Every Google sign-in in the app lives in this file. In the browser (development) it uses Google's
// pop-ups. In the phone app, pop-ups don't work, so the phone's own Google sign-in (the Capacitor
// SocialLogin plugin) is used instead; the rest of the app can't tell the difference.

/** True inside the installed phone app, false in a browser */
export const isNativeApp = () => Capacitor.isNativePlatform();

const WEB_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

// Always show the account list, and ask Google for a fresh login. Google decides whether that means
// a password, a fingerprint or nothing; the app never sees the password.
const provider = () => {
  const google = new GoogleAuthProvider();
  google.setCustomParameters({ prompt: 'select_account', max_age: '0' });
  return google;
};

// ---------------------------------------------------------------------------
// The phone's own Google sign-in. 'online' gives an ID token that signs in to Firebase; 'offline'
// gives a one-time code the AI server swaps for Drive and Sheets access (ai-server/src/googleApps.ts).
// ---------------------------------------------------------------------------
let nativeMode: 'online' | 'offline' | null = null;
const CANCELLED = 'native-cancelled';

async function nativeGoogle(mode: 'online' | 'offline', scopes?: string[]) {
  if (!WEB_CLIENT_ID) throw new Error('VITE_GOOGLE_CLIENT_ID is not set');
  const { SocialLogin } = await import('@capgo/capacitor-social-login');
  if (nativeMode !== mode) {
    // Sign-in needs nothing beyond Google's built-in email and profile, so it skips the extra permission step
    await SocialLogin.initialize({ google: { webClientId: WEB_CLIENT_ID, mode, skipAuthOnlyAuthorizationAfterSignIn: mode === 'online' } });
    nativeMode = mode;
  }
  try {
    // Extra permissions (Drive for linking) only when asked; plain sign-in passes none
    const { result } = await SocialLogin.login({ provider: 'google', options: scopes ? { scopes } : {} });
    return result;
  } catch (err: any) {
    // Closing Google's sheet is not an error worth showing
    if (err?.code === 'USER_CANCELLED' || /cancel/i.test(String(err?.message))) throw Object.assign(new Error('cancelled'), { code: CANCELLED });
    throw err;
  }
}

/** A Firebase sign-in from the phone's Google account picker */
async function nativeCredential() {
  // Email, profile and openid are always included by Google; asking for them again isn't allowed here
  const result = await nativeGoogle('online');
  if (result.responseType !== 'online' || !result.idToken) throw new Error('Google gave no sign-in token');
  return GoogleAuthProvider.credential(result.idToken);
}

/** Lets the account picker show again next time, after signing out */
export async function forgetNativeGoogle() {
  if (!isNativeApp() || nativeMode !== 'online') return;
  const { SocialLogin } = await import('@capgo/capacitor-social-login');
  await SocialLogin.logout({ provider: 'google' }).catch(() => {});
}

/** Sign-in from the login page */
export async function signInWithGoogle() {
  if (isNativeApp()) {
    await signInWithCredential(auth, await nativeCredential());
    return;
  }
  try {
    await signInWithPopup(auth, provider());
  } catch (err: any) {
    if (err?.code !== 'auth/popup-blocked') throw err;
    await signInWithRedirect(auth, provider());
  }
}

export const signInWasCancelled = (err: any) =>
  err?.code === 'auth/popup-closed-by-user' || err?.code === 'auth/cancelled-popup-request' || err?.code === CANCELLED;

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
  const result: UserCredential = isNativeApp()
    ? await signInWithCredential(confirm, await nativeCredential())
    : await signInWithPopup(confirm, provider());
  try {
    if (result.user.uid !== auth.currentUser?.uid) {
      // Picking an account that has never used Xpences would otherwise leave an empty login behind
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
// for a lasting permission (ai-server/src/googleApps.ts). In the browser it uses Google's pop-up; in
// the phone app, the phone's own Google sheet, whose code is marked { native: true } for the server.
// ---------------------------------------------------------------------------

const GIS_URL = 'https://accounts.google.com/gsi/client';
let gisLoading: Promise<void> | null = null;

/** Loads Google's pop-up library. Called early, so the pop-up opens straight from the tap. */
export function preloadGoogleApps() {
  if (isNativeApp()) return Promise.resolve();
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
  if (isNativeApp()) {
    try {
      const result = await nativeGoogle('offline', scope.split(' '));
      if (result.responseType !== 'offline' || !result.serverAuthCode) throw new Error('Google gave no code');
      return { code: result.serverAuthCode, native: true };
    } catch (err: any) {
      if (err?.code === CANCELLED) throw new GoogleAppsCancelled();
      throw err;
    }
  }

  if (!WEB_CLIENT_ID) throw new Error('VITE_GOOGLE_CLIENT_ID is not set');
  await preloadGoogleApps();
  return new Promise((resolve, reject) => {
    const client = (window as any).google.accounts.oauth2.initCodeClient({
      client_id: WEB_CLIENT_ID,
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

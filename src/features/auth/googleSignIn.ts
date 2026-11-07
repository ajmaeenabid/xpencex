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

import { signInWithCustomToken } from 'firebase/auth';
import { auth } from '../../shared/firebase';
import { callWorker } from '../../shared/lib/workerApi';
import { freshGoogleToken } from '../auth/googleSignIn';
import { AdminHealth, AdminLogEntry, AdminUser } from './admin';

/** The admin confirms with Google; the server only accepts admin changes for 10 minutes after this */
export async function confirmWithGoogle() {
  const { token } = await callWorker<{ token: string }>('/admin/unlock', { googleToken: await freshGoogleToken() });
  await signInWithCustomToken(auth, token); // the new pass carries the time the confirmation ends
}

export const listLog = () => callWorker<{ entries: AdminLogEntry[] }>('/admin/log').then(r => r.entries);

export const getHealth = () => callWorker<{ health: AdminHealth }>('/admin/health').then(r => r.health);

// The server decides who is an admin (ADMIN_UIDS); the app only asks, so it can't be faked here
export const checkIsAdmin = () => callWorker<{ admin: boolean }>('/admin/me').then(r => r.admin).catch(() => false);

export const listUsers = () => callWorker<{ users: AdminUser[] }>('/admin/users').then(r => r.users);

/** Lets a waiting device in, and removes any old devices the admin picked to replace */
export const approveDevice = (uid: string, requestId: string, replace: string[]) => callWorker('/admin/device-approve', { uid, requestId, replace });

export const refuseDevice = (uid: string, requestId: string) => callWorker('/admin/device-refuse', { uid, requestId });

export const removeDevice = (uid: string, deviceId: string) => callWorker('/admin/device-remove', { uid, deviceId });

export const setSuspended = (uid: string, suspended: boolean) => callWorker('/admin/suspend', { uid, suspended });

export const deleteUser = (uid: string, confirm: string) => callWorker('/admin/delete', { uid, confirm });

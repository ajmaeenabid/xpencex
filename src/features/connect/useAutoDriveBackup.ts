import { useEffect, useRef } from 'react';
import { DriveBackupSettings } from '../../shared/types';
import { isOnline } from '../../shared/lib/offlineSave';
import { backupDue } from './googleApps';
import { loadGoogleApps } from './googleAppsService';
import { backUpToDrive } from './drive';

const CHECK_EVERY_MS = 10 * 60 * 1000;
// After a failed try, wait before trying again, so a Google problem doesn't repeat every check
const AFTER_FAILURE_MS = 60 * 60 * 1000;

/**
 * Automatic Drive backups. A web app can't run while it is closed, so this checks when the app opens
 * and every 10 minutes while it is open, and backs up when the chosen time has passed.
 */
export function useAutoDriveBackup(uid: string | undefined, settings: DriveBackupSettings | undefined, onDone: () => void) {
  const state = useRef({ running: false, lastRun: 0, failedAt: 0 });
  const latest = useRef({ settings, onDone });
  latest.current = { settings, onDone };

  useEffect(() => {
    if (!uid) return;
    const check = async () => {
      const s = state.current;
      const now = Date.now();
      if (s.running || !isOnline() || now - s.failedAt < AFTER_FAILURE_MS) return;
      // The profile may not have the new time yet, so the time of this session's own backup also counts
      const known = latest.current.settings;
      const lastAt = [known?.lastAt, s.lastRun ? new Date(s.lastRun).toISOString() : undefined].filter(Boolean).sort().pop();
      if (!backupDue({ ...known, lastAt }, new Date(now))) return;

      s.running = true;
      try {
        const status = await loadGoogleApps();
        if (!status.apps.drive) return;
        await backUpToDrive(uid);
        s.lastRun = Date.now();
        latest.current.onDone();
      } catch (err) {
        console.error('Automatic Drive backup failed:', err);
        s.failedAt = Date.now();
      } finally {
        s.running = false;
      }
    };
    const first = window.setTimeout(check, 15_000); // after the app has settled
    const timer = window.setInterval(check, CHECK_EVERY_MS);
    return () => { window.clearTimeout(first); window.clearInterval(timer); };
  }, [uid]);
}

import { useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { useAuth } from '../../app/App';
import { db } from '../../shared/firebase';
import { useI18n } from '../../shared/i18n';
import { cn } from '../../shared/lib/utils';
import { isOnline, saved } from '../../shared/lib/offlineSave';
import { showToast } from '../../shared/lib/toast';
import { linkGoogleApp, useGoogleApps } from '../connect/googleAppsService';
import { GoogleAppsCancelled } from '../auth/googleSignIn';

/**
 * "Include receipts in Drive backup". Off until turned on; the same setting shows in the Receipts section and in
 * Profile > Connected apps. Without Google Drive linked, it offers to link it first.
 */
export default function ReceiptsBackupSwitch({ uid }: { uid: string }) {
  const { t } = useI18n();
  const { profile, refreshProfile } = useAuth();
  const { status } = useGoogleApps();
  const [busy, setBusy] = useState(false);
  const on = profile?.driveBackup?.receipts === true;
  const linked = !!status?.apps.drive;

  const toggle = async () => {
    setBusy(true);
    try {
      await saved(updateDoc(doc(db, 'users', uid), { 'driveBackup.receipts': !on }));
      await refreshProfile();
    } catch (err) {
      console.error('Could not change the receipts backup setting', err);
      showToast('receipts.backupSwitchFailed');
    } finally {
      setBusy(false);
    }
  };

  const linkDrive = async () => {
    if (!isOnline()) return showToast('google.offlineToast');
    setBusy(true);
    try {
      await linkGoogleApp('drive');
    } catch (err) {
      if (!(err instanceof GoogleAppsCancelled)) {
        console.error('Could not link Google Drive', err);
        showToast('receipts.linkFailed');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-3 rounded-xl bg-background/60 border border-card-border space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-foreground">{t('receipts.backupSwitch')}</p>
          <p className="text-[12px] text-muted font-medium leading-relaxed">{t(linked ? 'receipts.backupHint' : 'receipts.linkFirst')}</p>
        </div>
        {linked && (
          <button
            role="switch"
            aria-checked={on}
            aria-label={t('receipts.backupSwitch')}
            onClick={toggle}
            disabled={busy}
            className={cn('relative shrink-0 w-12 h-7 rounded-full transition-colors disabled:opacity-50', on ? 'bg-indigo-600' : 'bg-background border border-card-border')}
          >
            <span className={cn('absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-all', on ? 'left-6' : 'left-1')} />
          </button>
        )}
      </div>
      {status && !linked && (
        <button onClick={linkDrive} disabled={busy || status.notSetUp} className="w-full h-10 rounded-xl bg-indigo-600 text-white text-sm font-bold disabled:opacity-50">
          {busy ? t('common.pleaseWait') : t('receipts.linkDrive')}
        </button>
      )}
    </div>
  );
}

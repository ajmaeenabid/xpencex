import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { doc, updateDoc } from 'firebase/firestore';
import { CheckCircle2, ChevronRight, CloudUpload, History, Lock, RotateCcw } from 'lucide-react';
import { DriveLogo, GoogleG, LogoTile, SheetsLogo } from '../../shared/components/GoogleLogos';
import { db } from '../../shared/firebase';
import { useAuth } from '../../app/App';
import { useI18n, categoryLabel, TKey } from '../../shared/i18n';
import { cn } from '../../shared/lib/utils';
import { isOnline, saved } from '../../shared/lib/offlineSave';
import { CARD_SUB, CARD_TITLE } from '../../shared/lib/cardText';
import DetailSheet from '../../shared/components/DetailSheet';
import { alertDialog, confirmDialog, confirmWithTick } from '../../shared/components/Dialog';
import { GoogleAppsCancelled, WrongGoogleAccountError, preloadGoogleApps } from '../auth/googleSignIn';
import { BackupError, isLocked } from '../profile/backup';
import { collectBackup, restoreBackup } from '../profile/backupService';
import { GoogleApp, MAX_EVERY, backupSettings, everythingTabs } from './googleApps';
import { GoogleNoPermissionError, GoogleNotLinkedError, linkGoogleApp, unlinkGoogleApp, useGoogleApps } from './googleAppsService';
import { DriveBackup, backUpToDrive, listDriveBackups, listDriveReceipts, readDriveBackup, restoreReceiptsFromDrive } from './drive';
import ReceiptsBackupSwitch from '../receipts/ReceiptsBackupSwitch';
import { readBackup } from '../profile/backup';
import { receiptLinks } from '../receipts/receiptDrive';
import SheetsExportButton from './SheetsExportButton';

const field = 'w-full h-11 px-3 rounded-xl bg-background/60 border border-card-border text-sm text-foreground outline-none focus:border-indigo-500';
const btn = 'inline-flex items-center justify-center gap-2 h-11 px-4 rounded-xl text-sm font-bold transition-colors disabled:opacity-50';

const APPS: Record<GoogleApp, { Logo: typeof DriveLogo; name: TKey; about: TKey }> = {
  drive: { Logo: DriveLogo, name: 'google.drive', about: 'google.driveAbout' },
  sheets: { Logo: SheetsLogo, name: 'google.sheets', about: 'google.sheetsAbout' },
};

/** Profile row: link or unlink Google Drive and Google Sheets, with Drive backups and "Export everything" */
export default function ConnectedAppsCard({ uid }: { uid: string }) {
  const { t, dateLocale } = useI18n();
  const { profile, refreshProfile } = useAuth();
  const { status, error: statusError, retry } = useGoogleApps();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => { if (open) preloadGoogleApps().catch(() => {}); }, [open]);

  const explain = (err: unknown) => {
    if (err instanceof GoogleAppsCancelled) return '';
    if (err instanceof WrongGoogleAccountError) return t('google.wrongAccount');
    if (err instanceof GoogleNoPermissionError) return t('google.noPermission');
    if (err instanceof GoogleNotLinkedError) return t('google.relink');
    console.error('Google apps action failed:', err);
    return t('google.error');
  };

  const act = async (key: string, action: () => Promise<unknown>) => {
    if (!isOnline()) return setMessage(t('google.offline'));
    setBusy(key);
    setMessage('');
    try {
      await action();
    } catch (err) {
      setMessage(explain(err));
    } finally {
      setBusy('');
    }
  };

  const link = (app: GoogleApp) => act(`link-${app}`, () => linkGoogleApp(app));
  const unlink = async (app: GoogleApp) => {
    const last = status && !status.apps[app === 'drive' ? 'sheets' : 'drive'];
    if (!(await confirmDialog(t(last ? 'google.confirmUnlinkLast' : 'google.confirmUnlink', { app: t(APPS[app].name) }), { danger: true }))) return;
    act(`unlink-${app}`, () => unlinkGoogleApp(app));
  };

  const linkedCount = status ? (Object.values(status.apps).filter(Boolean).length) : 0;
  const rowSub = !status ? t('google.rowHint')
    : linkedCount === 0 ? t('google.rowHint')
    : t('google.rowLinked', { apps: (['drive', 'sheets'] as GoogleApp[]).filter(a => status.apps[a]).map(a => t(APPS[a].name)).join(', ') });

  return (
    <>
      <button
        onClick={() => { setMessage(''); setOpen(true); }}
        className="w-full bg-card p-6 rounded-3xl shadow-sm border border-card-border flex items-center gap-3 text-left transition-colors hover:border-indigo-500/40"
      >
        <LogoTile><GoogleG size={20} /></LogoTile>
        <div className="flex-1 min-w-0">
          <h3 className={CARD_TITLE}>{t('google.title')}</h3>
          <p className={CARD_SUB}>{rowSub}</p>
        </div>
        <ChevronRight size={20} className="text-muted shrink-0" />
      </button>

      <DetailSheet
        open={open}
        onClose={() => setOpen(false)}
        icon={<LogoTile size="lg"><GoogleG size={22} /></LogoTile>}
        title={t('google.title')}
        about={t('google.about', { email: profile?.email || '' })}
      >
        {statusError && (
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-500/10 text-sm font-semibold text-rose-600 dark:text-rose-300">
            {t('google.statusError')} <button onClick={retry} className="underline">{t('admin.retry')}</button>
          </div>
        )}
        {status?.notSetUp && (
          <p className="p-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 text-sm font-semibold text-amber-700 dark:text-amber-300">{t('google.notSetUp')}</p>
        )}
        {message && <p role="alert" className="text-sm font-semibold text-rose-500">{message}</p>}

        {(['drive', 'sheets'] as GoogleApp[]).map(app => {
          const { Logo, name, about } = APPS[app];
          const on = !!status?.apps[app];
          return (
            <div key={app} className="p-4 rounded-2xl bg-background/50 border border-card-border space-y-3">
              <div className="flex items-start gap-3">
                <LogoTile><Logo size={22} /></LogoTile>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-foreground">{t(name)}</p>
                  <p className="text-xs text-muted font-medium leading-relaxed">{t(about)}</p>
                </div>
                <span className={cn('shrink-0 px-2.5 py-1 rounded-full text-[12px] font-bold', on ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' : 'bg-background text-muted border border-card-border')}>
                  {t(on ? 'google.linked' : 'google.notLinked')}
                </span>
              </div>

              {on && app === 'drive' && <DriveSection uid={uid} busy={busy} act={act} />}
              {on && app === 'sheets' && (
                <SheetsExportButton
                  variant="plain"
                  className="w-full"
                  build={async () => {
                    const backup = await collectBackup(uid);
                    return {
                      title: t('sheets.titleEverything', { date: format(new Date(), 'd MMM yyyy', { locale: dateLocale }) }),
                      tabs: everythingTabs(backup.data, profile?.currency || 'BDT', t, cat => categoryLabel(t, cat)),
                    };
                  }}
                />
              )}

              <button
                onClick={() => (on ? unlink(app) : link(app))}
                disabled={!status || status.notSetUp || !!busy}
                className={cn(btn, 'w-full', on ? 'bg-card text-rose-600 dark:text-rose-400 border border-card-border' : 'bg-indigo-600 text-white')}
              >
                {busy === `link-${app}` || busy === `unlink-${app}` ? t('common.pleaseWait') : t(on ? 'google.unlink' : 'google.link', { app: t(name) })}
              </button>
            </div>
          );
        })}

        <p className="text-[12px] text-muted font-medium leading-relaxed">{t('google.onlyOwnFiles')} {t('google.removeInGoogle')}</p>
      </DetailSheet>
    </>
  );
}

// Drive: backup timing, back up now, and restore from a Drive backup
function DriveSection({ uid, busy, act }: { uid: string; busy: string; act: (key: string, action: () => Promise<unknown>) => Promise<void> }) {
  const { t, dateLocale } = useI18n();
  const { profile, refreshProfile } = useAuth();
  const settings = backupSettings(profile?.driveBackup);
  const [every, setEvery] = useState(String(settings.every));
  const [password, setPassword] = useState('');
  const [backups, setBackups] = useState<DriveBackup[] | null>(null);
  const [pending, setPending] = useState<string | null>(null); // a locked backup's text, waiting for its password
  const [restorePassword, setRestorePassword] = useState('');
  // Locked backup: "Also restore receipts" next to its password, when Drive has receipts
  const [pendingHasReceipts, setPendingHasReceipts] = useState(false);
  const [restoreReceipts, setRestoreReceipts] = useState(true);
  const [note, setNote] = useState('');
  // 0 to 100 while backing up; stays at 100 with "Backed up successfully" until the next action
  const [progress, setProgress] = useState<number | null>(null);

  const saveSettings = (changes: { auto?: boolean; every?: number; unit?: 'hours' | 'days' }) => act('settings', async () => {
    const next = { ...settings, ...changes };
    const clamped = Math.min(Math.max(1, Math.round(next.every)), MAX_EVERY[next.unit]);
    setEvery(String(clamped));
    await saved(updateDoc(doc(db, 'users', uid), {
      'driveBackup.auto': next.auto, 'driveBackup.every': clamped, 'driveBackup.unit': next.unit,
    }));
    await refreshProfile();
  });

  const backUp = () => act('backup', async () => {
    setNote('');
    setProgress(0);
    try {
      // Never goes back: each step only moves the bar forward
      const { receiptsFailed } = await backUpToDrive(uid, password || undefined, p => setProgress(old => Math.max(old ?? 0, p)));
      if (receiptsFailed) setNote(receiptsFailed > 0 ? t('drive.receiptsFailed', { count: receiptsFailed }) : t('drive.receiptsNotChecked'));
    } catch (err) {
      setProgress(null);
      throw err;
    }
    setPassword('');
    await refreshProfile();
    if (backups) setBackups(await listDriveBackups());
  });

  const restore = async (text: string, withPassword?: string, withReceipts = false) => act('restore', async () => {
    try {
      const r = await restoreBackup(uid, text, withPassword);
      setPending(null);
      setRestorePassword('');
      let summary = t('backup.restored', { added: r.added, skipped: r.skipped }) + (r.failed ? ' ' + t('backup.restoredFailed', { failed: r.failed }) : '');
      if (withReceipts) {
        try {
          const rr = await restoreReceiptsFromDrive(uid, r.receiptLinks, withPassword);
          summary += ' ' + t('drive.receiptsRestored', { count: rr.restored });
          if (rr.full) summary += ' ' + t('drive.receiptsFull', { count: rr.full });
          if (rr.wrongPassword) summary += ' ' + t('drive.receiptsWrongPassword', { count: rr.wrongPassword });
          if (rr.failed) summary += ' ' + t('drive.receiptsRestoreFailed', { count: rr.failed });
        } catch (err) {
          console.error('Could not restore receipts:', err);
          summary += ' ' + t('drive.receiptsRestoreError');
        }
      }
      alertDialog(summary);
    } catch (err) {
      const reason = err instanceof BackupError ? err.reason : null;
      if (reason === 'needsPassword') return setPending(text);
      if (reason === 'wrongPassword' || reason === 'notBackup') return setNote(t(reason === 'wrongPassword' ? 'backup.wrongPassword' : 'backup.notBackup'));
      throw err;
    }
  });

  const pick = (b: DriveBackup) => act(`pick-${b.id}`, async () => {
    setNote('');
    const text = await readDriveBackup(b.id);
    const inDrive = await listDriveReceipts().catch(() => []);
    if (isLocked(text)) {
      // How many are linked is only known once it is unlocked, so the tick shows without a number
      setPendingHasReceipts(inDrive.length > 0);
      setRestoreReceipts(true);
      setPending(text);
      return;
    }
    const ids = new Set(inDrive.map(f => f.receiptId));
    const found = receiptLinks((await readBackup(text)).data.expenses as Record<string, unknown>[]).filter(l => ids.has(l.receiptId)).length;
    if (found === 0) return restore(text);
    const answer = await confirmWithTick(t('drive.restoreAsk'), t('drive.alsoReceiptsCount', { count: found }), { ticked: true });
    if (answer.ok) await restore(text, undefined, answer.ticked);
  });

  const when = (iso: string) => format(new Date(iso), 'd MMM yyyy, h:mm a', { locale: dateLocale });

  return (
    <div className="space-y-3">
      {/* Automatic backups */}
      <div className="p-3 rounded-xl bg-card border border-card-border space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-bold text-foreground">{t('drive.auto')}</p>
            <p className="text-[12px] text-muted font-medium leading-relaxed">{t('drive.autoHint')}</p>
          </div>
          <button
            role="switch"
            aria-checked={settings.auto}
            aria-label={t('drive.auto')}
            onClick={() => saveSettings({ auto: !settings.auto })}
            disabled={busy === 'settings'}
            className={cn('relative shrink-0 w-12 h-7 rounded-full transition-colors disabled:opacity-50', settings.auto ? 'bg-indigo-600' : 'bg-background border border-card-border')}
          >
            <span className={cn('absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-all', settings.auto ? 'left-6' : 'left-1')} />
          </button>
        </div>

        {settings.auto && (
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-muted shrink-0">{t('drive.every')}</span>
            <input
              type="number"
              min={1}
              max={MAX_EVERY[settings.unit]}
              inputMode="numeric"
              aria-label={t('drive.everyLabel')}
              className={cn(field, 'w-20')}
              value={every}
              onChange={e => setEvery(e.target.value)}
              onBlur={() => { const n = Number(every); if (n !== settings.every) saveSettings({ every: Number.isFinite(n) ? n : settings.every }); }}
            />
            <select
              aria-label={t('drive.unitLabel')}
              className={cn(field, 'flex-1')}
              value={settings.unit}
              onChange={e => saveSettings({ unit: e.target.value as 'hours' | 'days', every: Number(every) || settings.every })}
            >
              <option value="hours">{t('drive.hours')}</option>
              <option value="days">{t('drive.days')}</option>
            </select>
          </div>
        )}

        <p className="flex items-center gap-1.5 text-xs font-semibold text-muted">
          <History size={14} className="shrink-0" />
          {settings.lastAt ? t('drive.lastBackup', { when: when(settings.lastAt) }) : t('drive.noBackupYet')}
        </p>
      </div>

      <ReceiptsBackupSwitch uid={uid} />

      {/* Back up now */}
      <div className="space-y-2">
        <input
          type="password"
          autoComplete="new-password"
          placeholder={t('backup.passwordOptional')}
          aria-label={t('backup.passwordOptional')}
          className={field}
          value={password}
          onChange={e => setPassword(e.target.value)}
        />
        {password && <p className="text-[12px] text-amber-700 dark:text-amber-300 font-semibold">{t('backup.passwordWarn')}</p>}
        <div className="grid grid-cols-2 gap-2">
          <button onClick={backUp} disabled={!!busy} className={cn(btn, 'bg-indigo-600 text-white')}>
            <CloudUpload size={16} /> {busy === 'backup' ? t('common.pleaseWait') : t('drive.backUpNow')}
          </button>
          <button
            onClick={() => act('list', async () => { setNote(''); setProgress(null); setBackups(await listDriveBackups()); })}
            disabled={!!busy}
            className={cn(btn, 'bg-card text-foreground border border-card-border')}
          >
            <RotateCcw size={16} /> {busy === 'list' ? t('common.pleaseWait') : t('drive.restore')}
          </button>
        </div>
        {progress !== null && (
          <div className="space-y-1.5" role="status" aria-live="polite">
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
              aria-label={t('drive.backingUp')}
              className="h-2.5 rounded-full bg-background/60 border border-card-border overflow-hidden"
            >
              <div
                className={cn('h-full rounded-full transition-[width] duration-500 ease-out', progress >= 100 ? 'bg-emerald-500' : 'bg-indigo-600')}
                style={{ width: `${progress}%` }}
              />
            </div>
            {progress >= 100 ? (
              <p className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 size={14} className="shrink-0" /> {t('drive.done')}
              </p>
            ) : (
              <p className="flex justify-between text-xs font-semibold text-muted">
                <span>{t('drive.backingUp')}</span>
                <span className="tabular-nums">{progress}%</span>
              </p>
            )}
          </div>
        )}
        {note && <p role="status" className="text-xs font-semibold text-foreground">{note}</p>}
      </div>

      {/* Restore: pick a backup */}
      {backups && (
        <div className="space-y-2">
          <p className="text-xs font-bold text-muted">{t('drive.pickBackup')}</p>
          {backups.length === 0 && <p className="text-xs text-muted font-medium">{t('drive.noBackups')}</p>}
          {backups.map(b => (
            <button
              key={b.id}
              onClick={() => pick(b)}
              disabled={!!busy}
              className="w-full flex items-center justify-between gap-3 p-3 rounded-xl bg-card border border-card-border text-left disabled:opacity-50"
            >
              <span className="flex items-center gap-2 min-w-0 text-sm font-semibold text-foreground">
                {b.locked && <Lock size={14} className="shrink-0 text-muted" />}
                <span className="truncate">{when(b.createdTime)}</span>
              </span>
              <span className="shrink-0 text-xs font-bold text-indigo-600 dark:text-indigo-400">
                {busy === `pick-${b.id}` || (busy === 'restore' && !pending) ? t('common.pleaseWait') : t('drive.restoreThis')}
              </span>
            </button>
          ))}
          {pending && (
            <div className="p-3 rounded-xl bg-card border border-card-border space-y-2">
              <p className="text-xs font-semibold text-foreground">{t('drive.lockedAsk')}</p>
              <input
                type="password"
                autoComplete="off"
                aria-label={t('backup.passwordOptional')}
                className={field}
                value={restorePassword}
                onChange={e => setRestorePassword(e.target.value)}
              />
              {pendingHasReceipts && (
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input type="checkbox" className="w-4 h-4 accent-indigo-600" checked={restoreReceipts} onChange={e => setRestoreReceipts(e.target.checked)} />
                  <span className="text-xs font-semibold text-foreground">{t('drive.alsoReceipts')}</span>
                </label>
              )}
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => { setPending(null); setRestorePassword(''); }} className={cn(btn, 'bg-card text-muted border border-card-border')}>{t('common.cancel')}</button>
                <button onClick={() => restore(pending, restorePassword, pendingHasReceipts && restoreReceipts)} disabled={!restorePassword || !!busy} className={cn(btn, 'bg-indigo-600 text-white')}>
                  {busy === 'restore' ? t('common.pleaseWait') : t('drive.restoreThis')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

import { useRef, useState } from 'react';
import { DatabaseBackup, Download, Upload } from 'lucide-react';
import { useI18n } from '../../shared/i18n';
import { isOnline } from '../../shared/lib/offlineSave';
import { alertDialog } from '../../shared/components/Dialog';
import { BackupError, isLocked } from './backup';
import { downloadBackup, restoreBackup } from './backupService';

const field = 'w-full h-11 px-3 rounded-xl bg-background/60 border border-card-border text-sm text-foreground outline-none focus:border-indigo-500';
const btn = 'flex-1 inline-flex items-center justify-center gap-2 h-11 px-4 rounded-xl text-sm font-bold transition-colors disabled:opacity-50';

/** Profile card: download all your data as one file (optionally locked with a password), and restore it */
export default function BackupCard({ uid }: { uid: string }) {
  const { t } = useI18n();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<'' | 'download' | 'restore'>('');
  const [pending, setPending] = useState<string | null>(null); // a locked file waiting for its password
  const [restorePassword, setRestorePassword] = useState('');
  const [message, setMessage] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const download = async () => {
    if (!isOnline()) return setMessage(t('backup.offline'));
    setBusy('download');
    setMessage('');
    try {
      await downloadBackup(uid, password);
      setMessage(t(password ? 'backup.downloadedLocked' : 'backup.downloaded'));
      setPassword('');
    } catch (err) {
      console.error('Backup failed:', err);
      setMessage(t('backup.downloadError'));
    } finally {
      setBusy('');
    }
  };

  const restore = async (text: string, withPassword?: string) => {
    if (!isOnline()) return setMessage(t('backup.offline'));
    setBusy('restore');
    setMessage('');
    try {
      const r = await restoreBackup(uid, text, withPassword);
      setPending(null);
      setRestorePassword('');
      alertDialog(t('backup.restored', { added: r.added, skipped: r.skipped }) + (r.failed ? ' ' + t('backup.restoredFailed', { failed: r.failed }) : ''));
    } catch (err) {
      const reason = err instanceof BackupError ? err.reason : null;
      if (reason === 'needsPassword') setPending(text);
      else setMessage(t(reason === 'wrongPassword' ? 'backup.wrongPassword' : reason === 'notBackup' ? 'backup.notBackup' : 'backup.restoreError'));
      if (reason !== 'needsPassword') console.error('Restore failed:', err);
    } finally {
      setBusy('');
    }
  };

  const picked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) return setMessage(t('backup.notBackup'));
    const text = await file.text();
    try {
      if (isLocked(text)) { setPending(text); setMessage(''); return; }
    } catch {
      return setMessage(t('backup.notBackup'));
    }
    restore(text);
  };

  return (
    <div className="bg-card p-6 rounded-3xl shadow-sm border border-card-border space-y-4">
      <div className="flex items-start gap-3">
        <span className="w-10 h-10 shrink-0 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center"><DatabaseBackup size={20} /></span>
        <div>
          <h3 className="font-bold text-foreground">{t('backup.title')}</h3>
          <p className="text-xs text-muted font-medium leading-relaxed">{t('backup.hint')}</p>
        </div>
      </div>

      <div className="space-y-2">
        <input type="password" autoComplete="new-password" className={field} placeholder={t('backup.passwordOptional')} aria-label={t('backup.passwordOptional')} value={password} onChange={(e) => setPassword(e.target.value)} />
        {password && <p className="text-[12px] text-amber-700 dark:text-amber-300 font-semibold">{t('backup.passwordWarn')}</p>}
        <div className="flex gap-2">
          <button onClick={download} disabled={!!busy} className={`${btn} bg-indigo-600 text-white`}><Download size={16} /> {busy === 'download' ? t('backup.working') : t('backup.download')}</button>
          <button onClick={() => fileRef.current?.click()} disabled={!!busy} className={`${btn} bg-card text-foreground border border-card-border`}><Upload size={16} /> {busy === 'restore' ? t('backup.working') : t('backup.restore')}</button>
        </div>
        <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={picked} />
      </div>

      {pending && (
        <div className="space-y-2 p-3 rounded-xl bg-background/50">
          <p className="text-xs font-semibold text-foreground">{t('backup.needsPassword')}</p>
          <input type="password" autoComplete="off" className={field} aria-label={t('backup.needsPassword')} value={restorePassword} onChange={(e) => setRestorePassword(e.target.value)} />
          <div className="flex gap-2">
            <button onClick={() => { setPending(null); setRestorePassword(''); }} className={`${btn} bg-background/60 text-muted border border-card-border`}>{t('common.cancel')}</button>
            <button onClick={() => restore(pending, restorePassword)} disabled={!restorePassword || !!busy} className={`${btn} bg-indigo-600 text-white`}>{t('backup.restore')}</button>
          </div>
        </div>
      )}

      <p className="text-[12px] text-muted font-medium leading-relaxed">{t('backup.restoreHint')}</p>
      {message && <p role="status" className="text-xs font-semibold text-foreground">{message}</p>}
    </div>
  );
}

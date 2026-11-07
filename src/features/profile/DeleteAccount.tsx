import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useI18n } from '../../shared/i18n';
import { WorkerError, callWorker } from '../../shared/lib/workerApi';
import { WrongGoogleAccountError, freshGoogleToken, signInWasCancelled } from '../auth/googleSignIn';
import { signOutAndForget } from '../auth/deviceService';

/** Lets people delete their own account and data, which Google Play requires of every app with accounts */
export default function DeleteAccount({ username }: { username: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const remove = async () => {
    setBusy(true);
    setError('');
    try {
      await callWorker('/account/delete', { googleToken: await freshGoogleToken() });
      await signOutAndForget();
    } catch (err) {
      if (!signInWasCancelled(err)) {
        console.error('Could not delete the account:', err);
        const isAdmin = err instanceof WorkerError && err.status === 400;
        setError(t(err instanceof WrongGoogleAccountError ? 'google.wrongAccount' : isAdmin ? 'account.deleteAdmin' : 'account.deleteError'));
      }
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="w-full flex items-center justify-center gap-2 py-3 text-sm font-bold text-rose-600 dark:text-rose-400">
        <Trash2 size={16} /> {t('account.delete')}
      </button>
    );
  }

  return (
    <div className="p-5 rounded-3xl bg-rose-50 dark:bg-rose-500/10 space-y-3">
      <p className="text-sm font-bold text-rose-600 dark:text-rose-300">{t('account.deleteWarn')}</p>
      <input
        aria-label={t('admin.deleteType', { user: username })}
        placeholder={t('admin.deleteType', { user: username })}
        autoCapitalize="none"
        autoCorrect="off"
        className="w-full px-3 py-2.5 bg-card rounded-xl text-sm text-foreground outline-none focus:ring-2 focus:ring-rose-500"
        value={typed}
        onChange={e => setTyped(e.target.value)}
      />
      {error && <p role="alert" className="text-rose-600 dark:text-rose-300 text-xs font-bold">{error}</p>}
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => { setOpen(false); setTyped(''); setError(''); }} className="py-2.5 rounded-xl text-sm font-bold bg-card text-muted border border-card-border">{t('common.cancel')}</button>
        <button onClick={remove} disabled={busy || typed.trim() !== username} className="py-2.5 rounded-xl text-sm font-bold bg-rose-600 text-white disabled:opacity-50">
          {busy ? t('common.pleaseWait') : t('account.deleteConfirm')}
        </button>
      </div>
    </div>
  );
}

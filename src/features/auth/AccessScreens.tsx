import { useEffect, useState } from 'react';
import { AtSign, CloudOff, Hourglass, ShieldAlert, Smartphone } from 'lucide-react';
import { auth } from '../../shared/firebase';
import { useI18n, TKey } from '../../shared/i18n';
import { DeviceStatus, askForDevice, saveUsername, signOutAndForget, usernameWasTaken } from './deviceService';
import { UsernameProblem, usernameProblem } from './username';

// How often a waiting device asks whether the admin has answered
const CHECK_SECONDS = 15;

const PROBLEM_TEXT: Record<UsernameProblem, TKey> = {
  format: 'username.errorFormat',
  reserved: 'username.errorReserved',
  secret: 'username.errorSecret',
};

const primaryClass = 'w-full py-4 bg-indigo-600 text-white rounded-[2rem] font-bold disabled:opacity-50';

function Screen({ icon, title, body, children }: { icon: React.ReactNode; title: string; body: string; children: React.ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-sm bg-card/70 backdrop-blur-xl p-8 rounded-[3rem] shadow-soft border border-card-border space-y-6">
        <div className="space-y-3">
          <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-500/10 rounded-xl flex items-center justify-center text-indigo-600 dark:text-indigo-400">{icon}</div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">{title}</h1>
          <p className="text-sm text-muted font-medium">{body}</p>
          <p className="text-xs text-muted font-medium break-all">{auth.currentUser?.email}</p>
        </div>
        {children}
        <button onClick={() => signOutAndForget()} className="w-full text-center text-sm font-bold text-muted hover:text-foreground">
          {t('access.logout')}
        </button>
      </div>
    </div>
  );
}

/** The username box and its checks, also used to change the name in Profile */
export function useUsernameForm(initial: string, onSaved: () => Promise<void> | void) {
  const { t } = useI18n();
  const [username, setUsername] = useState(initial);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = usernameProblem(username);
    if (problem) return setError(t(PROBLEM_TEXT[problem]));
    setError('');
    setSaving(true);
    try {
      await saveUsername(username);
      await onSaved();
    } catch (err) {
      console.error('Could not save the username:', err);
      setError(t(usernameWasTaken(err) ? 'username.errorTaken' : 'username.errorSave'));
    } finally {
      setSaving(false);
    }
  };

  return { username, setUsername: (v: string) => { setUsername(v); setError(''); }, error, saving, submit };
}

function UsernameScreen({ recheck }: { recheck: () => Promise<void> }) {
  const { t } = useI18n();
  const form = useUsernameForm('', recheck);
  return (
    <Screen icon={<AtSign size={22} />} title={t('username.title')} body={t('username.body')}>
      <form onSubmit={form.submit} className="space-y-4">
        <input
          aria-label={t('username.label')}
          placeholder={t('username.label')}
          autoFocus
          autoCapitalize="none"
          autoCorrect="off"
          maxLength={20}
          className="w-full px-4 py-4 bg-background/50 rounded-2xl border-2 border-transparent focus:border-indigo-600/20 focus:bg-background outline-none transition-all text-foreground font-medium"
          value={form.username}
          onChange={e => form.setUsername(e.target.value)}
          required
        />
        <p className="text-xs text-muted font-medium px-1">{t('username.hint')}</p>
        {form.error && <p role="alert" className="text-rose-500 text-xs font-bold px-1">{form.error}</p>}
        <button type="submit" disabled={form.saving} className={primaryClass}>
          {form.saving ? t('common.saving') : t('username.save')}
        </button>
      </form>
    </Screen>
  );
}

function DeviceScreen({ status, recheck }: { status: 'new' | 'pending' | 'refused'; recheck: () => Promise<void> }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // While waiting, keep asking so the app opens by itself once the admin approves
  useEffect(() => {
    if (status !== 'pending') return;
    const timer = setInterval(() => { if (!document.hidden) recheck(); }, CHECK_SECONDS * 1000);
    return () => clearInterval(timer);
  }, [status]);

  const ask = async () => {
    setBusy(true);
    setError('');
    try {
      await askForDevice();
      await recheck();
    } catch (err) {
      console.error('Could not ask for permission:', err);
      setError(t('access.askError'));
    } finally {
      setBusy(false);
    }
  };

  const text = {
    new: { title: 'access.newTitle', body: 'access.newBody' },
    pending: { title: 'access.pendingTitle', body: 'access.pendingBody' },
    refused: { title: 'access.refusedTitle', body: 'access.refusedBody' },
  } as const;
  const Icon = status === 'pending' ? Hourglass : status === 'refused' ? ShieldAlert : Smartphone;

  return (
    <Screen icon={<Icon size={22} />} title={t(text[status].title)} body={t(text[status].body)}>
      {error && <p role="alert" className="text-rose-500 text-xs font-bold px-1">{error}</p>}
      {status === 'pending' ? (
        <button onClick={() => { setBusy(true); recheck().finally(() => setBusy(false)); }} disabled={busy} className={primaryClass}>
          {busy ? t('common.pleaseWait') : t('access.checkNow')}
        </button>
      ) : (
        <button onClick={ask} disabled={busy} className={primaryClass}>
          {busy ? t('common.pleaseWait') : t('access.ask')}
        </button>
      )}
    </Screen>
  );
}

/** What someone sees after signing in with Google until this device is allowed to use the account */
export default function AccessScreen({ status, recheck }: { status: Exclude<DeviceStatus, 'approved'>; recheck: () => Promise<void> }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  if (status === 'needsUsername') return <UsernameScreen recheck={recheck} />;
  if (status !== 'offline') return <DeviceScreen status={status} recheck={recheck} />;
  return (
    <Screen icon={<CloudOff size={22} />} title={t('access.offlineTitle')} body={t('access.offlineBody')}>
      <button onClick={() => { setBusy(true); recheck().finally(() => setBusy(false)); }} disabled={busy} className={primaryClass}>
        {busy ? t('common.pleaseWait') : t('admin.retry')}
      </button>
    </Screen>
  );
}

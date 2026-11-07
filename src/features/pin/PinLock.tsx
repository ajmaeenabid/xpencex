import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Lock } from 'lucide-react';
import { useI18n } from '../../shared/i18n';
import { signOutAndForget } from '../auth/deviceService';
import { PIN_LENGTH, awayTooLong, checkPin, cleanPin, isValidPin, lockPin, markUnlocked, removePin, triesLeft } from './pin';
import { confirmDialog } from '../../shared/components/Dialog';

/** Locks again when the app has been in the background too long. Returns a function that re-renders after unlocking. */
export function useBackgroundLock() {
  const [, setTick] = useState(0);
  useEffect(() => {
    let hiddenAt: number | null = null;
    const onChange = () => {
      if (document.hidden) {
        hiddenAt = Date.now();
      } else {
        if (awayTooLong(hiddenAt)) {
          lockPin();
          setTick(n => n + 1);
        }
        hiddenAt = null;
      }
    };
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);
  return () => setTick(n => n + 1);
}

/** Covers everything on screen, including the admin panel, and keeps the app's work underneath intact */
export default function PinLock({ uid, onUnlocked }: { uid: string; onUnlocked: () => void }) {
  const { t } = useI18n();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  const change = async (input: string) => {
    const next = cleanPin(input);
    setPin(next);
    setError('');
    if (!isValidPin(next) || checking) return;
    setChecking(true);
    const result = await checkPin(uid, next);
    setChecking(false);
    if (result === 'ok') {
      markUnlocked(uid);
      onUnlocked();
    } else if (result === 'blocked') {
      await signOutAndForget();
    } else {
      setPin('');
      setError(t('pin.wrong', { count: triesLeft(uid) }));
    }
  };

  const forgot = async () => {
    if (!(await confirmDialog(t('pin.forgotConfirm'), { danger: true }))) return;
    removePin(uid);
    await signOutAndForget();
  };

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={t('pin.lockTitle')} className="fixed inset-0 z-[200] flex items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div className="w-14 h-14 mx-auto bg-indigo-50 dark:bg-indigo-500/10 rounded-2xl flex items-center justify-center text-indigo-600 dark:text-indigo-400">
          <Lock size={26} />
        </div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">{t('pin.lockTitle')}</h1>
        <input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          aria-label={t('pin.label')}
          maxLength={PIN_LENGTH}
          disabled={checking}
          className="w-full px-4 py-4 text-center text-2xl tracking-[0.5em] bg-card rounded-2xl border border-card-border focus:ring-2 focus:ring-indigo-600 outline-none text-foreground"
          value={pin}
          onChange={e => change(e.target.value)}
        />
        {error && <p role="alert" className="text-rose-500 text-xs font-bold">{error}</p>}
        <button onClick={forgot} className="text-sm font-bold text-muted hover:text-foreground">{t('pin.forgot')}</button>
      </div>
    </div>,
    document.body,
  );
}

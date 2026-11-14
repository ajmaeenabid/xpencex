import { useEffect, useState } from 'react';
import { cn } from '../../shared/lib/utils';
import { fingerprintAvailable, fingerprintOn, setFingerprintOn, verifyFingerprint } from './fingerprint';
import { Fingerprint, Lock } from 'lucide-react';
import { useI18n } from '../../shared/i18n';
import { PIN_LENGTH, checkPin, cleanPin, hasPin, isValidPin, removePin, savePin, triesLeft } from './pin';
import { signOutAndForget } from '../auth/deviceService';

type Mode = 'set' | 'change' | 'remove' | null;

const inputClass = 'w-full px-4 py-3 bg-background/50 rounded-xl text-sm text-foreground outline-none focus:ring-2 focus:ring-indigo-600';

/** The Profile card that turns the PIN on, changes it or turns it off */
export default function PinSettings({ uid }: { uid: string }) {
  const { t } = useI18n();
  const [enabled, setEnabled] = useState(() => hasPin(uid));
  const [mode, setMode] = useState<Mode>(null);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [fingerReady, setFingerReady] = useState(false);
  const [finger, setFinger] = useState(() => fingerprintOn(uid));
  useEffect(() => { fingerprintAvailable().then(setFingerReady); }, []);

  const toggleFinger = async () => {
    if (finger) { setFingerprintOn(uid, false); setFinger(false); return; }
    // Turning it on checks the finger once, so it is known to work
    if (await verifyFingerprint({ title: t('pin.fingerTitle'), subtitle: t('pin.fingerConfirm'), cancel: t('common.cancel') })) {
      setFingerprintOn(uid, true);
      setFinger(true);
    }
  };

  const close = () => { setMode(null); setCurrent(''); setNext(''); setAgain(''); setError(''); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (mode !== 'remove') {
      if (!isValidPin(next)) return setError(t('pin.tooShort', { count: PIN_LENGTH }));
      if (next !== again) return setError(t('pin.mismatch'));
    }
    setBusy(true);
    try {
      if (mode !== 'set') {
        const result = await checkPin(uid, current);
        if (result === 'blocked') return await signOutAndForget();
        if (result === 'wrong') {
          setCurrent('');
          return setError(t('pin.wrong', { count: triesLeft(uid) }));
        }
      }
      if (mode === 'remove') { removePin(uid); setFingerprintOn(uid, false); setFinger(false); }
      else await savePin(uid, next);
      setEnabled(mode !== 'remove');
      close();
    } finally {
      setBusy(false);
    }
  };

  const pinInput = (label: string, value: string, set: (v: string) => void) => (
    <input
      type="password"
      inputMode="numeric"
      autoComplete="off"
      aria-label={label}
      placeholder={label}
      maxLength={PIN_LENGTH}
      className={inputClass}
      value={value}
      onChange={e => { set(cleanPin(e.target.value)); setError(''); }}
      required
    />
  );

  return (
    <div className="bg-card p-6 rounded-3xl shadow-sm border border-card-border space-y-4 transition-colors">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 shrink-0 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl flex items-center justify-center text-indigo-600 dark:text-indigo-400">
          <Lock size={20} />
        </div>
        <div className="min-w-0">
          <h3 className="font-bold text-foreground">{t('pin.title')}</h3>
          <p className="text-xs text-muted font-medium">{t(enabled ? 'pin.onHint' : 'pin.offHint')}</p>
        </div>
      </div>

      {mode ? (
        <form onSubmit={submit} className="space-y-2">
          {mode !== 'set' && pinInput(t('pin.current'), current, setCurrent)}
          {mode !== 'remove' && pinInput(t('pin.new'), next, setNext)}
          {mode !== 'remove' && pinInput(t('pin.again'), again, setAgain)}
          {error && <p role="alert" className="text-rose-500 text-xs font-bold">{error}</p>}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button type="button" onClick={close} className="py-2.5 rounded-xl text-sm font-bold bg-background/50 text-muted border border-card-border">{t('common.cancel')}</button>
            <button type="submit" disabled={busy} className="py-2.5 rounded-xl text-sm font-bold bg-indigo-600 text-white disabled:opacity-50">
              {busy ? t('common.pleaseWait') : t(mode === 'remove' ? 'pin.turnOff' : 'common.save')}
            </button>
          </div>
        </form>
      ) : enabled ? (
        <div className="space-y-3">
        {fingerReady && (
          <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-background/50 border border-card-border">
            <span className="flex items-center gap-2 text-sm font-semibold text-foreground"><Fingerprint size={18} className="text-indigo-600 dark:text-indigo-400" /> {t('pin.fingerSwitch')}</span>
            <button
              role="switch"
              aria-checked={finger}
              aria-label={t('pin.fingerSwitch')}
              onClick={toggleFinger}
              className={cn('relative shrink-0 w-12 h-7 rounded-full transition-colors', finger ? 'bg-indigo-600' : 'bg-background border border-card-border')}
            >
              <span className={cn('absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-all', finger ? 'left-6' : 'left-1')} />
            </button>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setMode('change')} className="py-2.5 rounded-xl text-sm font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300">{t('pin.change')}</button>
          <button onClick={() => setMode('remove')} className="py-2.5 rounded-xl text-sm font-bold bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300">{t('pin.turnOff')}</button>
        </div>
        </div>
      ) : (
        <button onClick={() => setMode('set')} className="w-full py-2.5 rounded-xl text-sm font-bold bg-indigo-600 text-white">{t('pin.turnOn')}</button>
      )}
    </div>
  );
}

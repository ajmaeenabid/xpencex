import { useEffect, useState } from 'react';
import { getRedirectResult } from 'firebase/auth';
import { motion } from 'motion/react';
import { Wallet } from 'lucide-react';
import { auth } from '../../shared/firebase';
import { useI18n } from '../../shared/i18n';
import { signInWasCancelled, signInWithGoogle } from './googleSignIn';
import { takeRemovedNote } from './deviceService';
import PrivacyLink from '../../shared/components/PrivacyLink';

/** Google's own "G" mark, which their sign-in rules ask apps to show on the button */
export function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" width="22" height="22" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.7 1.2 9.2 3.6l6.9-6.9C35.9 2.4 30.5 0 24 0 14.6 0 6.5 5.4 2.6 13.2l8 6.2C12.5 13.7 17.8 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.6c0-1.6-.1-3.1-.4-4.6H24v9.1h12.4c-.5 2.9-2.2 5.4-4.6 7l7.2 5.6c4.2-3.9 7.1-9.7 7.1-17.1z" />
      <path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-8-6.2C1 16.5 0 20.1 0 24s1 7.5 2.6 10.8l8-6.2z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.2-5.6c-2 1.4-4.6 2.2-8.7 2.2-6.2 0-11.5-4.2-13.4-9.9l-8 6.2C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}

export default function LoginPage() {
  const { t, lang, setLang } = useI18n();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [removed] = useState(takeRemovedNote);

  const showError = (err: any) => {
    if (signInWasCancelled(err)) return;
    console.error('Google sign-in failed:', err);
    setError(t(err?.code === 'auth/user-disabled' ? 'login.errorSuspended' : err?.code === 'auth/network-request-failed' ? 'login.errorNetwork' : 'login.errorGoogle'));
  };

  // A blocked pop-up falls back to a full-page sign-in, which reports any error when it comes back here
  useEffect(() => { getRedirectResult(auth).catch(showError); }, []);

  const handleGoogle = async () => {
    setError('');
    setLoading(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      showError(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6 py-12 transition-colors duration-300 relative overflow-hidden">
      {/* Decorative background elements */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute -top-[10%] -left-[10%] w-[50%] h-[50%] bg-indigo-500/10 rounded-full blur-[120px]" />
        <div className="absolute -bottom-[10%] -right-[10%] w-[50%] h-[50%] bg-purple-500/10 rounded-full blur-[120px]" />
      </div>

      <div className="absolute top-5 right-5 z-20 flex p-1 rounded-full bg-card/70 backdrop-blur-xl border border-card-border text-xs font-bold">
        {(['en', 'bn'] as const).map(code => (
          <button
            key={code}
            onClick={() => setLang(code)}
            aria-pressed={lang === code}
            className={`px-3 py-1.5 rounded-full transition-colors ${lang === code ? 'bg-indigo-600 text-white' : 'text-muted hover:text-foreground'}`}
          >
            {code === 'en' ? 'English' : 'বাংলা'}
          </button>
        ))}
      </div>

      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="mb-10 flex flex-col items-center relative z-10"
      >
        <div className="w-24 h-24 bg-gradient-to-br from-indigo-400 via-indigo-500 to-purple-500 rounded-[2rem] flex items-center justify-center shadow-vibrant mb-6 rotate-12 group hover:rotate-0 transition-transform duration-500 animate-float">
          <Wallet className="text-white -rotate-12 group-hover:rotate-0 transition-transform duration-500" size={48} />
        </div>
        <h1 className="text-5xl font-bold text-foreground tracking-tighter">
          Xpence<span className="text-indigo-600 dark:text-indigo-400">X</span>
        </h1>
      </motion.div>

      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="w-full max-w-sm bg-card/70 backdrop-blur-xl p-8 rounded-[3rem] shadow-soft border border-card-border transition-all relative z-10 space-y-5"
      >
        <div className="space-y-1">
          <h2 className="text-2xl font-bold text-foreground tracking-tight">{t('login.welcome')}</h2>
          <p className="text-sm text-muted font-medium">{t('login.body')}</p>
        </div>

        {removed && <p role="status" className="text-amber-700 dark:text-amber-300 text-xs font-bold px-1">{t('login.deviceRemoved')}</p>}

        {error && <p role="alert" className="text-rose-500 text-xs font-bold px-1">{error}</p>}

        <motion.button
          onClick={handleGoogle}
          disabled={loading}
          whileTap={{ scale: 0.98 }}
          className="w-full py-4 bg-white text-slate-800 border border-slate-300 rounded-[2rem] font-bold shadow-sm disabled:opacity-50 transition-all flex items-center justify-center gap-3"
        >
          <GoogleMark />
          {loading ? t('common.pleaseWait') : t('login.google')}
        </motion.button>
      </motion.div>

      <div className="mt-6 relative z-10">
        <PrivacyLink />
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { getRedirectResult } from 'firebase/auth';
import { motion } from 'motion/react';
import { logoDataUri } from '../../shared/brand/logoSvg';
import { auth } from '../../shared/firebase';
import { useI18n } from '../../shared/i18n';
import { isNativeApp, signInWasCancelled, signInWithGoogle } from './googleSignIn';
import { takeSignOutNote } from './deviceService';
import PrivacyLink from '../../shared/components/PrivacyLink';
import { GoogleG } from '../../shared/components/GoogleLogos';
import { CHOICE_ON } from '../../shared/lib/choice';

/** Google's own "G" mark, which their sign-in rules ask apps to show on the button */
export const GoogleMark = () => <GoogleG size={22} />;

export default function LoginPage() {
  const { t, lang, setLang } = useI18n();
  const [error, setError] = useState('');
  // The short technical reason, shown small under the message so a screenshot says what went wrong
  const [errorCode, setErrorCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [signOutNote] = useState(takeSignOutNote);

  const showError = (err: any) => {
    if (signInWasCancelled(err)) return;
    console.error('Google sign-in failed:', err);
    setErrorCode(String(err?.code || err?.message || '').slice(0, 120));
    setError(t(err?.code === 'auth/user-disabled' ? 'login.errorSuspended' : err?.code === 'auth/network-request-failed' ? 'login.errorNetwork' : 'login.errorGoogle'));
  };

  // A blocked pop-up falls back to a full-page sign-in, which reports any error when it comes back here
  // (Only in a browser: the phone app signs in through the phone's own Google sheet, never by redirect.)
  useEffect(() => { if (!isNativeApp()) getRedirectResult(auth).catch(showError); }, []);

  const handleGoogle = async () => {
    setError('');
    setErrorCode('');
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
            className={`px-3 py-1.5 rounded-full transition-colors ${lang === code ? CHOICE_ON : 'text-muted hover:text-foreground'}`}
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
        <div className="w-24 h-24 mb-6 rotate-12 hover:rotate-0 transition-transform duration-500 animate-float">
          <img src={logoDataUri()} alt="" className="w-full h-full rounded-[22%] shadow-vibrant" />
        </div>
        <h1 className="text-5xl font-bold text-foreground tracking-tighter">
          <span className="text-indigo-600 dark:text-indigo-400">X</span>pences
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

        {signOutNote && <p role="status" className="text-amber-700 dark:text-amber-300 text-xs font-bold px-1">{t(signOutNote === 'paused' ? 'login.accountPaused' : 'login.deviceRemoved')}</p>}

        {error && (
          <div role="alert" className="px-1 space-y-0.5">
            <p className="text-rose-500 text-xs font-bold">{error}</p>
            {errorCode && <p className="text-muted text-[11px] font-medium break-all">{errorCode}</p>}
          </div>
        )}

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

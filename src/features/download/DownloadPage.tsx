import { useEffect, useState } from 'react';
import { Download, ShieldAlert, ShieldCheck, Smartphone, WifiOff } from 'lucide-react';
import { useI18n } from '../../shared/i18n';
import LanguageToggle from '../../shared/components/LanguageToggle';
import PrivacyLink from '../../shared/components/PrivacyLink';
import { APK_PATH, ReleaseInfo, SITE_URL, VERSION_PATH } from '../../shared/release';

/**
 * What a browser shows at the website: Xpences is only used as the installed Android app,
 * so this page offers the app file and explains how to install it.
 */
export default function DownloadPage() {
  const { t, lang } = useI18n();
  const [release, setRelease] = useState<ReleaseInfo | null>(null);

  useEffect(() => {
    fetch(VERSION_PATH, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(setRelease)
      .catch(() => setRelease(null));
  }, []);

  const notes = release?.notes?.[lang === 'bn' ? 'bn' : 'en'];

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <div className="max-w-md mx-auto px-5 py-8 space-y-8">
        <div className="flex justify-end"><LanguageToggle ariaLabel={t('profile.language')} /></div>

        <header className="text-center space-y-4">
          <img src="/icon-192.png" alt="" className="w-24 h-24 mx-auto rounded-[1.75rem] shadow-vibrant" />
          <div>
            <h1 className="text-3xl font-bold tracking-tight"><span className="text-indigo-600 dark:text-indigo-400">X</span>pences</h1>
            <p className="text-muted font-medium mt-1">{t('download.tagline')}</p>
          </div>
        </header>

        <div className="p-6 rounded-[2rem] bg-card border border-card-border shadow-soft space-y-4 text-center">
          <a
            href={APK_PATH}
            download="Xpences.apk"
            className="w-full inline-flex items-center justify-center gap-2 h-14 rounded-2xl bg-indigo-600 text-white text-base font-bold shadow-vibrant"
          >
            <Download size={20} /> {t('download.button')}
          </a>
          <p className="text-xs text-muted font-semibold">
            {release
              ? t('download.version', { version: release.versionName, size: release.sizeMb ? `${release.sizeMb} MB` : '' }).replace(/ · $/, '')
              : t('download.android')}
          </p>
          {notes && <p className="text-sm text-foreground/80 font-medium">{notes}</p>}
        </div>

        {/* Fake copies of the app could be passed around in groups and chats, so say where the real one lives */}
        <p className="flex items-start gap-3 p-4 rounded-2xl bg-card border border-indigo-200 dark:border-indigo-900 text-sm font-semibold leading-relaxed">
          <ShieldAlert size={18} className="shrink-0 mt-0.5 text-indigo-600 dark:text-indigo-400" />
          {t('download.official', { site: new URL(SITE_URL).host })}
        </p>

        <section className="space-y-3">
          <h2 className="font-bold text-lg">{t('download.howTitle')}</h2>
          <ol className="space-y-3">
            {(['download.step1', 'download.step2', 'download.step3'] as const).map((key, i) => (
              <li key={key} className="flex gap-3 p-4 rounded-2xl bg-card border border-card-border">
                <span className="w-7 h-7 shrink-0 rounded-full bg-indigo-600 text-white text-sm font-bold flex items-center justify-center">{i + 1}</span>
                <p className="text-sm font-medium leading-relaxed">{t(key)}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="grid gap-3">
          <Fact Icon={Smartphone} text={t('download.onlyApp')} />
          <Fact Icon={WifiOff} text={t('download.offline')} />
          <Fact Icon={ShieldCheck} text={t('download.safe')} />
        </section>

        {release?.certSha256 && (
          <details className="p-4 rounded-2xl bg-card border border-card-border text-sm">
            <summary className="font-bold cursor-pointer">{t('download.checkTitle')}</summary>
            <div className="mt-3 space-y-3 text-muted font-medium leading-relaxed">
              <p>{t('download.checkIntro')}</p>
              <Code label={t('download.certLabel')} value={release.certSha256} />
              {release.apkSha256 && <Code label={t('download.fileLabel')} value={release.apkSha256} />}
              <p>{t('download.checkHow')}</p>
            </div>
          </details>
        )}

        <footer className="text-center text-sm"><PrivacyLink /></footer>
      </div>
    </div>
  );
}

function Code({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold">{label}</p>
      <p className="mt-1 font-mono text-xs text-foreground break-all select-all">{value}</p>
    </div>
  );
}

function Fact({ Icon, text }: { Icon: typeof Smartphone; text: string }) {
  return (
    <p className="flex items-start gap-3 text-sm text-muted font-medium">
      <Icon size={18} className="shrink-0 mt-0.5 text-indigo-600 dark:text-indigo-400" /> {text}
    </p>
  );
}

import { useEffect, useState } from 'react';
import { Download, Sparkles } from 'lucide-react';
import { useI18n } from '../../shared/i18n';
import DetailSheet from '../../shared/components/DetailSheet';
import { isNative, openInBrowser } from '../../shared/lib/nativeApp';
import { APK_PATH, ReleaseInfo, SITE_URL, VERSION_PATH, isNewer } from '../../shared/release';

const SEEN_KEY = 'updateSeen';

/**
 * In the phone app: when the website has a newer app file, says so once per app start,
 * with a button that downloads it in the phone's browser. Installing it keeps all data.
 */
export default function UpdateNotice() {
  const { t, lang } = useI18n();
  const [latest, setLatest] = useState<ReleaseInfo | null>(null);

  useEffect(() => {
    if (!isNative()) return;
    let stopped = false;
    (async () => {
      try {
        const { App } = await import('@capacitor/app');
        const installed = Number((await App.getInfo()).build) || 0;
        const res = await fetch(`${SITE_URL}${VERSION_PATH}`, { cache: 'no-store' });
        if (!res.ok) return;
        const info = (await res.json()) as ReleaseInfo;
        // "Later" hides it until the app is opened again
        let seen = '';
        try { seen = sessionStorage.getItem(SEEN_KEY) || ''; } catch { /* storage blocked */ }
        if (!stopped && isNewer(info, installed) && seen !== String(info.versionCode)) setLatest(info);
      } catch {
        // Offline or the site is unreachable: try again next time
      }
    })();
    return () => { stopped = true; };
  }, []);

  const later = () => {
    try { if (latest) sessionStorage.setItem(SEEN_KEY, String(latest.versionCode)); } catch { /* storage blocked */ }
    setLatest(null);
  };

  const notes = latest?.notes?.[lang === 'bn' ? 'bn' : 'en'];

  return (
    <DetailSheet
      open={!!latest}
      onClose={later}
      icon={<div className="w-11 h-11 rounded-2xl flex items-center justify-center bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300"><Sparkles size={20} /></div>}
      title={t('update.title')}
      about={t('update.about', { version: latest?.versionName || '' })}
      footer={
        <div className="grid grid-cols-2 gap-2">
          <button onClick={later} className="py-3 rounded-xl text-sm font-bold bg-card text-foreground border border-card-border">{t('update.later')}</button>
          <button
            onClick={() => { openInBrowser(`${SITE_URL}${APK_PATH}`).catch(err => console.error('Could not open the download:', err)); later(); }}
            className="flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold bg-indigo-600 text-white"
          >
            <Download size={16} /> {t('update.download')}
          </button>
        </div>
      }
    >
      {notes && <p className="text-sm font-medium text-foreground/90 leading-relaxed">{notes}</p>}
      <p className="text-sm font-medium text-foreground/90 leading-relaxed">{t('update.howTo')}</p>
      <p className="text-xs text-muted font-medium leading-relaxed">{t('update.keepData')}</p>
    </DetailSheet>
  );
}

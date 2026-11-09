import { useEffect, useState } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';
import { LogoTile, SheetsLogo } from '../../shared/components/GoogleLogos';
import { useI18n } from '../../shared/i18n';
import { cn } from '../../shared/lib/utils';
import { isOnline } from '../../shared/lib/offlineSave';
import DetailSheet from '../../shared/components/DetailSheet';
import { alertDialog } from '../../shared/components/Dialog';
import { GoogleAppsCancelled, WrongGoogleAccountError, preloadGoogleApps } from '../auth/googleSignIn';
import { SheetTab } from './googleApps';
import { GoogleNoPermissionError, GoogleNotLinkedError, linkGoogleApp, useGoogleApps } from './googleAppsService';
import { createSpreadsheet } from './sheets';

const SHEETS_GREEN = 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300';

/**
 * "Export to Google Sheets" for any screen. `build` makes the tabs when tapped, so the data is current.
 * If Sheets isn't linked yet, it offers to link it first.
 */
export default function SheetsExportButton({ build, disabled, emptyMessage, variant = 'wide', className }: {
  build: () => Promise<{ title: string; tabs: SheetTab[] }> | { title: string; tabs: SheetTab[] };
  disabled?: boolean;
  // When set, there is nothing to export yet: the button stays tappable and says this instead
  emptyMessage?: string;
  variant?: 'wide' | 'icon' | 'plain';
  className?: string;
}) {
  const { t } = useI18n();
  const { status } = useGoogleApps();
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false); // "Link Google Sheets first"
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => { preloadGoogleApps().catch(() => {}); }, []);

  const explain = (err: unknown) => {
    if (err instanceof GoogleAppsCancelled) return '';
    if (err instanceof WrongGoogleAccountError) return t('google.wrongAccount');
    if (err instanceof GoogleNoPermissionError) return t('google.noPermission');
    if (err instanceof GoogleNotLinkedError) return t('google.relink');
    console.error('Sheets export failed:', err);
    return t('sheets.error');
  };

  const run = async () => {
    setError('');
    setBusy(true);
    try {
      const { title, tabs } = await build();
      setUrl(await createSpreadsheet(title, tabs));
    } catch (err) {
      setError(explain(err));
      if (err instanceof GoogleNotLinkedError) setAsking(true);
    } finally {
      setBusy(false);
    }
  };

  const start = () => {
    setError('');
    if (emptyMessage) { alertDialog(emptyMessage); return; }
    if (!isOnline()) return setError(t('google.offline'));
    if (status?.notSetUp) return setError(t('google.notSetUp'));
    if (!status?.apps.sheets) return setAsking(true);
    run();
  };

  const linkThenRun = async () => {
    setError('');
    setBusy(true);
    try {
      await linkGoogleApp('sheets');
      setAsking(false);
      await run();
    } catch (err) {
      setError(explain(err));
    } finally {
      setBusy(false);
    }
  };

  const icon = (size: number) => (busy ? <Loader2 size={size} className="shrink-0 animate-spin" /> : <SheetsLogo size={size} className="shrink-0" />);
  const label = busy ? t('sheets.making') : t('sheets.export');

  return (
    <>
      {variant === 'icon' ? (
        <button
          onClick={start}
          disabled={disabled || busy}
          title={t('sheets.export')}
          aria-label={t('sheets.export')}
          className={cn('w-10 h-10 bg-card rounded-xl shadow-soft border border-card-border flex items-center justify-center text-slate-400 hover:text-emerald-600 disabled:opacity-40 transition-colors', className)}
        >
          {icon(20)}
        </button>
      ) : (
        <button
          onClick={start}
          disabled={disabled || busy}
          className={cn(
            'flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-bold disabled:opacity-50',
            variant === 'wide' ? 'bg-card text-foreground border border-card-border' : SHEETS_GREEN,
            className,
          )}
        >
          {icon(18)} {label}
        </button>
      )}

      {/* An error with nothing open shows as a small line under the button's screen */}
      {error && !asking && !url && (
        <DetailSheet open onClose={() => setError('')} icon={<SheetIcon />} title={t('sheets.export')}>
          <p role="alert" className="text-sm font-semibold text-rose-500">{error}</p>
        </DetailSheet>
      )}

      <DetailSheet
        open={asking}
        onClose={() => { setAsking(false); setError(''); }}
        icon={<SheetIcon />}
        title={t('sheets.linkTitle')}
        about={t('sheets.linkAbout')}
        footer={
          <button onClick={linkThenRun} disabled={busy} className="w-full py-3 bg-indigo-600 text-white rounded-xl text-sm font-bold disabled:opacity-50">
            {busy ? t('common.pleaseWait') : t('sheets.linkAndExport')}
          </button>
        }
      >
        <p className="text-xs text-muted font-medium leading-relaxed">{t('google.onlyOwnFiles')}</p>
        {error && <p role="alert" className="text-sm font-semibold text-rose-500">{error}</p>}
      </DetailSheet>

      <DetailSheet
        open={!!url}
        onClose={() => setUrl(null)}
        icon={<SheetIcon />}
        title={t('sheets.readyTitle')}
        about={t('sheets.readyAbout')}
        footer={url && (
          <a href={url} target="_blank" rel="noopener noreferrer" onClick={() => setUrl(null)} className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-600 text-white rounded-xl text-sm font-bold">
            <ExternalLink size={16} /> {t('sheets.open')}
          </a>
        )}
      >
        <span />
      </DetailSheet>
    </>
  );
}

function SheetIcon() {
  return <LogoTile size="lg"><SheetsLogo size={24} /></LogoTile>;
}

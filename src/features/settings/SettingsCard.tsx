import { ReactNode, useCallback, useEffect, useState } from 'react';
import { CalendarDays, ChevronRight, DatabaseBackup, Fingerprint, Globe, Languages, LayoutGrid, Lock, Moon, Settings, Sun } from 'lucide-react';
import { useAuth } from '../../app/App';
import { TKey, useI18n } from '../../shared/i18n';
import { cn } from '../../shared/lib/utils';
import { MAJOR_CURRENCIES } from '../../shared/constants';
import { CARD_SUB, CARD_TITLE, ROW_BUTTON } from '../../shared/lib/cardText';
import { cleanStartDay } from '../../shared/lib/moneyMonth';
import FullWindow, { usePages } from '../../shared/components/FullWindow';
import LanguageToggle from '../../shared/components/LanguageToggle';
import { hasPin } from '../pin/pin';
import { fingerprintOn } from '../pin/fingerprint';
import { widgetHidden } from '../widget/widget';
import { widgetSettingsChanged } from '../widget/widgetSignal';
import { isNative } from '../../shared/lib/nativeApp';
import PinSettings from '../pin/PinSettings';
import AccountNotices from '../profile/AccountNotices';
import MonthStartCard from '../profile/MonthStartCard';
import BackupCard from '../profile/BackupCard';
import RemindersCard from '../reminders/RemindersCard';
import ConnectedAppsCard from '../connect/ConnectedAppsCard';
import WidgetCard from '../widget/WidgetCard';
import CurrencyCard from './CurrencyCard';
import { OPEN_SETTINGS, SettingsPage, settingsSummary, takeSettingsRequest } from './settings';

type Page = 'list' | SettingsPage;

const PAGE_TITLE: Record<SettingsPage, TKey> = {
  pin: 'settings.pinTitle', currency: 'profile.currency', monthStart: 'monthStart.title', backup: 'backup.title', widget: 'widget.title',
};

const tile = (colour: string) => cn('w-10 h-10 shrink-0 rounded-xl flex items-center justify-center', colour);
const PEACH = 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400';

/** One labelled group of rows in a rounded box, with lines between the rows */
function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="px-2 text-[12px] font-bold uppercase tracking-wider text-muted">{title}</h3>
      <div className="bg-card rounded-3xl border border-card-border shadow-sm overflow-hidden divide-y divide-card-border">{children}</div>
    </section>
  );
}

/** A row search can find and light up: "settings:<id>" (see revealSection.ts), with the row itself as the card */
function Spot({ id, children }: { id: string; children: ReactNode }) {
  return <div data-section={`settings:${id}`}><div data-card>{children}</div></div>;
}

/**
 * Profile's Settings row and the full-screen Settings window it opens. Everything that used to be a separate
 * Profile card (lock, account activity, theme, language, currency, month start, reminders, backup, connected
 * apps, widget) is here, in groups. Search opens it with openSettings() (settings.ts).
 */
export default function SettingsCard({ uid }: { uid: string }) {
  const { profile, isDarkMode, toggleDarkMode } = useAuth();
  const { t, lang } = useI18n();
  const [open, setOpen] = useState(false);
  const nav = usePages<Page>('list');

  const currency = profile?.currency || 'BDT';
  const symbol = MAJOR_CURRENCIES.find(c => c.code === currency)?.symbol || '৳';
  const pinOn = hasPin(uid);
  const inApp = isNative(); // the home screen widget exists only in the phone app

  const close = useCallback(() => { setOpen(false); nav.reset(); }, [nav]);

  // Opened by search or the chat: go straight to the page asked for
  useEffect(() => {
    const take = () => {
      const request = takeSettingsRequest();
      if (!request) return;
      nav.reset();
      // The widget page only has something to show in the phone app
      if (request.page && (request.page !== 'widget' || inApp)) nav.go(request.page);
      setOpen(true);
    };
    take(); // a request made before this card was on screen
    window.addEventListener(OPEN_SETTINGS, take);
    return () => window.removeEventListener(OPEN_SETTINGS, take);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pageRow = (page: SettingsPage, icon: ReactNode, title: string, value?: string) => (
    <Spot id={page}>
      <button onClick={() => nav.go(page)} className={ROW_BUTTON.row}>
        {icon}
        <span className="flex-1 min-w-0">
          <span className={cn(CARD_TITLE, 'block')}>{title}</span>
          {value && <span className={cn(CARD_SUB, 'block')}>{value}</span>}
        </span>
        <ChevronRight size={20} className="text-muted shrink-0" />
      </button>
    </Spot>
  );

  const list = (
    <div className="space-y-6">
      <Group title={t('settings.security')}>
        {pageRow('pin', <span className={tile(PEACH)}>{pinOn && fingerprintOn(uid) ? <Fingerprint size={20} /> : <Lock size={20} />}</span>,
          t('settings.pinTitle'), pinOn ? t(fingerprintOn(uid) ? 'settings.pinFinger' : 'settings.on') : t('settings.off'))}
        <Spot id="notices"><AccountNotices uid={uid} look="row" /></Spot>
      </Group>

      <Group title={t('settings.app')}>
        <Spot id="theme">
          <div className="px-4 py-3.5 flex items-center gap-3">
            <span className={tile('bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300')}>{isDarkMode ? <Moon size={20} /> : <Sun size={20} />}</span>
            <span className={cn(CARD_TITLE, 'flex-1 min-w-0')}>{t('settings.theme')}</span>
            <div role="radiogroup" aria-label={t('settings.theme')} className="shrink-0 inline-grid grid-cols-2 p-1 rounded-full bg-background/60 border border-card-border">
              {([false, true] as const).map(dark => (
                <button
                  key={String(dark)}
                  role="radio"
                  aria-checked={isDarkMode === dark}
                  onClick={() => { if (isDarkMode !== dark) toggleDarkMode(); }}
                  className={cn('px-3.5 py-1.5 rounded-full text-sm font-bold transition-colors', isDarkMode === dark ? 'bg-indigo-600 text-white' : 'text-muted')}
                >
                  {t(dark ? 'settings.dark' : 'settings.light')}
                </button>
              ))}
            </div>
          </div>
        </Spot>
        <Spot id="language">
          <div className="px-4 py-3.5 flex items-center gap-3">
            <span className={tile('bg-teal-50 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400')}><Languages size={20} /></span>
            <span className={cn(CARD_TITLE, 'flex-1 min-w-0')}>{t('profile.language')}</span>
            <LanguageToggle ariaLabel={t('profile.language')} />
          </div>
        </Spot>
        {pageRow('currency', <span className={tile('bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400')}><Globe size={20} /></span>,
          t('profile.currency'), `${symbol} ${currency}`)}
        {pageRow('monthStart', <span className={tile(PEACH)}><CalendarDays size={20} /></span>,
          t('monthStart.title'), t('settings.dayValue', { day: cleanStartDay(profile?.monthStart) }))}
      </Group>

      <Group title={t('settings.notifications')}>
        <Spot id="reminders"><RemindersCard look="row" /></Spot>
      </Group>

      <Group title={t('settings.data')}>
        {pageRow('backup', <span className={tile(PEACH)}><DatabaseBackup size={20} /></span>,
          t('backup.title'), profile?.driveBackup?.auto ? t('settings.driveOn') : undefined)}
        <Spot id="connectedApps"><ConnectedAppsCard uid={uid} look="row" /></Spot>
      </Group>

      {inApp && (
        <Group title={t('settings.phone')}>
          {pageRow('widget', <span className={tile(PEACH)}><LayoutGrid size={20} /></span>,
            t('widget.title'), t(widgetHidden(uid) ? 'settings.amountsHidden' : 'settings.amountsShown'))}
        </Group>
      )}
    </div>
  );

  const page = nav.page;
  const body = page === 'list' ? list : (
    <Spot id={`${page}Page`}>
      {page === 'pin' && <PinSettings uid={uid} />}
      {page === 'currency' && <CurrencyCard />}
      {page === 'monthStart' && <MonthStartCard />}
      {page === 'backup' && <BackupCard uid={uid} symbol={symbol} />}
      {page === 'widget' && <WidgetCard onHiddenChange={widgetSettingsChanged} />}
    </Spot>
  );

  return (
    <>
      <button onClick={() => setOpen(true)} className={ROW_BUTTON.card}>
        <span className={tile(PEACH)}><Settings size={20} /></span>
        <span className="flex-1 min-w-0">
          <span className={cn(CARD_TITLE, 'block')}>{t('settings.title')}</span>
          <span className={cn(CARD_SUB, 'block')}>{settingsSummary({ pin: pinOn, lang, currency, symbol, dark: isDarkMode }, t)}</span>
        </span>
        <ChevronRight size={20} className="text-muted shrink-0" />
      </button>

      <FullWindow
        open={open}
        atRoot={nav.atRoot}
        onClose={close}
        onBack={nav.back}
        pageKey={page}
        icon={<Settings size={18} className="shrink-0 text-indigo-600 dark:text-indigo-400" />}
        title={page === 'list' ? t('settings.title') : t(PAGE_TITLE[page])}
      >
        {body}
      </FullWindow>
    </>
  );
}

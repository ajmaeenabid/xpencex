import { useState, useEffect } from 'react';
import WidgetCard from '../widget/WidgetCard';
import { widgetSettingsChanged } from '../widget/widgetSignal';
import RemindersCard from '../reminders/RemindersCard';
import { db } from '../../shared/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { useAuth } from '../../app/App';
import { LogOut, Pencil, Globe, Languages } from 'lucide-react';
import { MAJOR_CURRENCIES } from '../../shared/constants';
import { useAccounts } from '../accounts/accountService';
import AccountsManager from '../accounts/AccountsManager';
import BackupCard from './BackupCard';
import AdminRow from '../admin/AdminRow';
import ConnectedAppsCard from '../connect/ConnectedAppsCard';
import FeedbackCard from '../feedback/FeedbackCard';
import AccountNotices from './AccountNotices';
import DeleteAccount from './DeleteAccount';
import PrivacyLink from '../../shared/components/PrivacyLink';
import { appVersion } from '../../shared/lib/nativeApp';
import PinSettings from '../pin/PinSettings';
import { signOutAndForget } from '../auth/deviceService';
import { useUsernameForm } from '../auth/AccessScreens';
import { RearrangeButton, RearrangeList, useRearrange } from '../../shared/components/Rearrange';

import LanguageToggle from '../../shared/components/LanguageToggle';
import { useI18n } from '../../shared/i18n';
import { saved } from '../../shared/lib/offlineSave';
import MonthStartCard from './MonthStartCard';

// Movable cards, in their default order. Budgets, recurring expenses and categories are in the
// Expenses side panel now (features/expenses/ExpenseSettings.tsx).
const PROFILE_SECTIONS = ['accounts', 'admin', 'notices', 'reminders', 'widget', 'pin', 'language', 'currency', 'monthStart', 'connectedApps', 'backup', 'feedback'];

export default function ProfilePage({ openAccountsSignal }: { openAccountsSignal?: number }) {
  const { user, profile, refreshProfile } = useAuth();
  const [version, setVersion] = useState('');
  useEffect(() => { appVersion().then(setVersion).catch(() => { /* shows just the name */ }); }, []);
  const [isEditingCurrency, setIsEditingCurrency] = useState(false);
  const accounts = useAccounts(user?.uid);
  const { t } = useI18n();
  const layout = useRearrange('profile', PROFILE_SECTIONS);
  const [isEditingName, setIsEditingName] = useState(false);
  const usernameForm = useUsernameForm(profile?.username || '', async () => {
    await refreshProfile();
    setIsEditingName(false);
  });

  const currencySymbol = MAJOR_CURRENCIES.find(c => c.code === profile?.currency)?.symbol || '৳';

  const handleLogout = () => signOutAndForget();

  const handleUpdateCurrency = async (code: string) => {
    if (!user) return;
    try {
      await saved(updateDoc(doc(db, 'users', user.uid), {
        currency: code,
      }));
      await refreshProfile();
      setIsEditingCurrency(false);
    } catch (err) {
      console.error("Error updating currency:", err);
    }
  };

  return (
    <div className="space-y-6 pb-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">{t('profile.title')}</h1>
        <div className="flex items-center gap-2">
          <RearrangeButton layout={layout} size="sm" />
          <button onClick={handleLogout} aria-label={t('profile.logout')} className="w-9 h-9 flex items-center justify-center bg-red-50 dark:bg-red-900/20 text-red-500 rounded-xl hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {/* User Info Card */}
      <div className="bg-card p-6 rounded-3xl shadow-sm border border-card-border flex items-center gap-4 transition-colors">
        <div className="w-16 h-16 bg-indigo-100 dark:bg-indigo-900/30 rounded-2xl flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold text-2xl">
          {profile?.username?.[0]?.toUpperCase() || 'U'}
        </div>
        {isEditingName ? (
          <form onSubmit={usernameForm.submit} className="flex-1 min-w-0 space-y-2">
            <input
              aria-label={t('username.label')}
              autoFocus
              autoCapitalize="none"
              autoCorrect="off"
              maxLength={20}
              className="w-full px-3 py-2 bg-background/50 rounded-xl text-sm text-foreground outline-none focus:ring-2 focus:ring-indigo-600"
              value={usernameForm.username}
              onChange={e => usernameForm.setUsername(e.target.value)}
            />
            {usernameForm.error && <p role="alert" className="text-rose-500 text-xs font-bold">{usernameForm.error}</p>}
            <div className="flex gap-3 text-sm font-bold">
              <button type="submit" disabled={usernameForm.saving} className="text-emerald-600 dark:text-emerald-400 disabled:opacity-50">{t('common.save')}</button>
              <button type="button" onClick={() => { usernameForm.setUsername(profile?.username || ''); setIsEditingName(false); }} className="text-muted">{t('common.cancel')}</button>
            </div>
          </form>
        ) : (
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-foreground truncate">{profile?.username || t('home.user')}</h2>
              <button onClick={() => { usernameForm.setUsername(profile?.username || ''); setIsEditingName(true); }} aria-label={t('username.change')} className="shrink-0 p-1 text-muted hover:text-foreground">
                <Pencil size={14} />
              </button>
            </div>
            <p className="text-sm text-muted font-medium truncate">{profile?.email}</p>
          </div>
        )}
      </div>

      {/* The cards below can be moved with the button at the top; the header and name card stay */}
      <RearrangeList layout={layout} className="space-y-6" sections={[
      { id: 'accounts', node: user && <AccountsManager uid={user.uid} accounts={accounts} symbol={currencySymbol} openSignal={openAccountsSignal} /> },

      // Appears only for the admin; the admin screen itself downloads when the row is tapped
      { id: 'admin', node: user && <AdminRow uid={user.uid} /> },

      { id: 'notices', node: user && <AccountNotices uid={user.uid} /> },

      { id: 'pin', node: user && <PinSettings uid={user.uid} /> },

      { id: 'language', node: (
      <div className="bg-card p-6 rounded-3xl shadow-sm border border-card-border flex items-center justify-between gap-3 transition-colors">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 shrink-0 bg-teal-50 dark:bg-teal-900/30 rounded-xl flex items-center justify-center text-teal-600 dark:text-teal-400">
            <Languages size={20} />
          </div>
          <p className="font-bold text-foreground truncate">{t('profile.language')}</p>
        </div>
        <LanguageToggle ariaLabel={t('profile.language')} />
      </div>
      ) },

      { id: 'currency', node: (
      <div className="bg-card p-6 rounded-3xl shadow-sm border border-card-border space-y-4 transition-colors">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-50 dark:bg-blue-900/30 rounded-xl flex items-center justify-center text-blue-600 dark:text-blue-400">
              <Globe size={20} />
            </div>
            <h3 className="font-bold text-foreground">{t('profile.currency')}</h3>
          </div>
          <button onClick={() => setIsEditingCurrency(!isEditingCurrency)} className="text-indigo-600 dark:text-indigo-400 font-bold text-sm">
            {isEditingCurrency ? t('common.cancel') : t('profile.change')}
          </button>
        </div>
        
        {isEditingCurrency ? (
          <div className="grid grid-cols-2 gap-2">
            {MAJOR_CURRENCIES.map((curr) => (
              <button
                key={curr.code}
                onClick={() => handleUpdateCurrency(curr.code)}
                className={`p-3 rounded-xl text-sm font-bold border transition-all ${
                  profile?.currency === curr.code
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-background/50 text-muted border-card-border'
                }`}
              >
                {curr.code} ({curr.symbol})
              </button>
            ))}
          </div>
        ) : (
          <p className="text-xl font-bold text-foreground">
            {MAJOR_CURRENCIES.find(c => c.code === profile?.currency)?.name || profile?.currency || 'Bangladeshi Taka'} ({profile?.currency || 'BDT'})
          </p>
        )}
      </div>
      ) },

      { id: 'monthStart', node: <MonthStartCard /> },
      { id: 'reminders', node: <RemindersCard /> },
      { id: 'widget', node: <WidgetCard onHiddenChange={widgetSettingsChanged} /> },
      { id: 'connectedApps', node: user && <ConnectedAppsCard uid={user.uid} /> },

      { id: 'backup', node: user && <BackupCard uid={user.uid} symbol={currencySymbol} /> },

      { id: 'feedback', node: user && <FeedbackCard uid={user.uid} /> },

      ]} />

      {profile?.username && <DeleteAccount username={profile.username} />}

      {/* App Info: the real version of the installed app */}
      <div className="text-center py-6">
        <p className="text-muted text-xs font-bold">Xpences{version && ` v${version}`}</p>
        <p className="mt-2"><PrivacyLink /></p>
      </div>
    </div>
  );
}

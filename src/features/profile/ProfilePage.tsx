import { useState, useEffect } from 'react';
import { useAuth } from '../../app/App';
import { LogOut, Pencil } from 'lucide-react';
import { MAJOR_CURRENCIES } from '../../shared/constants';
import { useAccounts } from '../accounts/accountService';
import AccountsManager from '../accounts/AccountsManager';
import AdminRow from '../admin/AdminRow';
import FeedbackCard from '../feedback/FeedbackCard';
import DeleteAccount from './DeleteAccount';
import PrivacyLink from '../../shared/components/PrivacyLink';
import { appVersion } from '../../shared/lib/nativeApp';
import { signOutAndForget } from '../auth/deviceService';
import { useUsernameForm } from '../auth/AccessScreens';
import { RearrangeButton, RearrangeList, useRearrange } from '../../shared/components/Rearrange';
import { useI18n } from '../../shared/i18n';
import SettingsCard from '../settings/SettingsCard';

// Movable cards, in their default order. Budgets, recurring expenses and categories are in the
// Expenses side panel (features/expenses/ExpenseSettings.tsx); PIN, language, currency, reminders, backup and the
// other settings are in the Settings window (features/settings/SettingsCard.tsx).
const PROFILE_SECTIONS = ['accounts', 'settings', 'admin', 'feedback'];

export default function ProfilePage({ openAccountsSignal }: { openAccountsSignal?: number }) {
  const { user, profile, refreshProfile } = useAuth();
  const [version, setVersion] = useState('');
  useEffect(() => { appVersion().then(setVersion).catch(() => { /* shows just the name */ }); }, []);
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

  return (
    <div className="space-y-2 pb-6">
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
      <RearrangeList layout={layout} className="space-y-2" sections={[
      { id: 'accounts', node: user && <AccountsManager uid={user.uid} accounts={accounts} symbol={currencySymbol} openSignal={openAccountsSignal} /> },

      { id: 'settings', node: user && <SettingsCard uid={user.uid} /> },

      // Appears only for the admin; the admin screen itself downloads when the row is tapped
      { id: 'admin', node: user && <AdminRow uid={user.uid} /> },

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

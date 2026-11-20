import { useState } from 'react';
import { Globe } from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { useAuth } from '../../app/App';
import { db } from '../../shared/firebase';
import { MAJOR_CURRENCIES } from '../../shared/constants';
import { useI18n } from '../../shared/i18n';
import { saved } from '../../shared/lib/offlineSave';

/** The currency amounts are shown in (moved here from Profile; it lives on the Settings window's Currency page) */
export default function CurrencyCard() {
  const { user, profile, refreshProfile } = useAuth();
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);

  const choose = async (code: string) => {
    if (!user) return;
    try {
      await saved(updateDoc(doc(db, 'users', user.uid), { currency: code }));
      await refreshProfile();
      setEditing(false);
    } catch (err) {
      console.error('Error updating currency:', err);
    }
  };

  return (
    <div className="bg-card p-6 rounded-3xl shadow-sm border border-card-border space-y-4 transition-colors">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-50 dark:bg-blue-900/30 rounded-xl flex items-center justify-center text-blue-600 dark:text-blue-400">
            <Globe size={20} />
          </div>
          <h3 className="font-bold text-foreground">{t('profile.currency')}</h3>
        </div>
        <button onClick={() => setEditing(!editing)} className="text-indigo-600 dark:text-indigo-400 font-bold text-sm">
          {editing ? t('common.cancel') : t('profile.change')}
        </button>
      </div>

      {editing ? (
        <div className="grid grid-cols-2 gap-2">
          {MAJOR_CURRENCIES.map(curr => (
            <button
              key={curr.code}
              onClick={() => choose(curr.code)}
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
  );
}

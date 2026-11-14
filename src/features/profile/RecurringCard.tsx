import { useEffect, useState } from 'react';
import { collection, deleteDoc, doc, onSnapshot, query, where } from 'firebase/firestore';
import { format } from 'date-fns';
import { Repeat, Trash2 } from 'lucide-react';
import { useAuth } from '../../app/App';
import { db } from '../../shared/firebase';
import { MAJOR_CURRENCIES } from '../../shared/constants';
import { useI18n } from '../../shared/i18n';
import { saved } from '../../shared/lib/offlineSave';
import { confirmDialog } from '../../shared/components/Dialog';
import type { RecurringExpense } from '../../shared/types';
import { RepeatingIncomeList } from '../income/IncomeCards';

/** Profile: recurring expenses (each with Stop), and repeating income below them */
export default function RecurringCard() {
  const { user, profile } = useAuth();
  const { t, dateLocale } = useI18n();
  const [recurring, setRecurring] = useState<RecurringExpense[]>([]);
  const currencySymbol = MAJOR_CURRENCIES.find(c => c.code === profile?.currency)?.symbol || '৳';

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'recurring'), where('uid', '==', user.uid));
    return onSnapshot(q, (snapshot) => {
      setRecurring(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as RecurringExpense)));
    });
  }, [user]);

  const handleDeleteRecurring = async (id: string) => {
    if (await confirmDialog(t('profile.confirmStopRecurring'), { danger: true })) {
      await saved(deleteDoc(doc(db, 'recurring', id)));
    }
  };

  return (
      <div className="bg-card p-6 rounded-3xl shadow-sm border border-card-border space-y-4 transition-colors">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-teal-50 dark:bg-teal-900/30 rounded-xl flex items-center justify-center text-teal-600 dark:text-teal-400">
            <Repeat size={20} />
          </div>
          <div>
            <h3 className="font-bold text-foreground">{t('profile.recurring')}</h3>
            <p className="text-xs text-muted font-medium">{t('profile.recurringHint')}</p>
          </div>
        </div>
        <div className="space-y-2">
          {recurring.map(rule => (
            <div key={rule.id} className="flex items-center justify-between p-3 bg-background/50 rounded-xl border border-card-border">
              <div className="min-w-0">
                <p className="text-sm font-bold text-foreground truncate">{rule.title}</p>
                <p className="text-[12px] text-muted font-medium">
                  {currencySymbol}{rule.amount.toLocaleString()} · {rule.frequency === 'weekly' ? t('add.repeat.weekly') : t('add.repeat.monthly')} · {t('profile.next', { date: format(new Date(rule.nextDate), 'd MMM', { locale: dateLocale }) })}
                </p>
              </div>
              <button
                onClick={() => handleDeleteRecurring(rule.id)}
                aria-label={t('profile.stop', { title: rule.title })}
                className="p-1.5 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/40 rounded-lg transition-colors"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          {recurring.length === 0 && (
            <p className="text-center py-2 text-slate-400 dark:text-slate-500 text-sm font-medium italic">{t('profile.noRecurring')}</p>
          )}
          <RepeatingIncomeList symbol={currencySymbol} />
        </div>
      </div>
      
  );
}

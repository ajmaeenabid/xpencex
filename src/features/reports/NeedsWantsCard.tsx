import { useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { ArrowDownRight, ArrowRight, ArrowUpRight, Scale } from 'lucide-react';
import { useAuth } from '../../app/App';
import { useStartDay } from '../../app/useStartDay';
import { DEFAULT_CATEGORIES } from '../../shared/constants';
import { db } from '../../shared/firebase';
import { categoryLabel, useI18n } from '../../shared/i18n';
import type { TKey } from '../../shared/i18n';
import { saved } from '../../shared/lib/offlineSave';
import { cn } from '../../shared/lib/utils';
import type { Expense } from '../../shared/types';
import DetailSheet from '../../shared/components/DetailSheet';
import { alertDialog } from '../../shared/components/Dialog';
import { btnPrimary } from '../accounts/ui';
import { IconBox } from '../home/TapCard';
import { useOwnCategories } from '../planned/plannedService';
import { SpendingGroup, SpendingType, SpendingTypes, compareGroups, groupChange, groupOf } from './needsWants';
import { CHOICE_ON } from '../../shared/lib/choice';

const GROUP_TEXT: Record<SpendingGroup, TKey> = { need: 'needs.needs', want: 'needs.wants', unsorted: 'needs.unsorted' };
// Checked for colour blindness and contrast against each theme's card
const COLOURS = { light: { need: '#00897B', want: '#D4561C', unsorted: '#9A8478' }, dark: { need: '#10978A', want: '#E2622B', unsorted: '#9A8478' } };

/** Reports: how this month's spending splits into needs and wants */
export default function NeedsWantsCard({ uid, expenses, symbol }: { uid: string; expenses: Expense[]; symbol: string }) {
  const { t } = useI18n();
  const { profile, isDarkMode } = useAuth();
  const startDay = useStartDay();
  const [sorting, setSorting] = useState(false);
  const own = profile?.spendingTypes || {};
  const { current, before } = compareGroups(expenses, new Date(), startDay, own);
  const colours = COLOURS[isDarkMode ? 'dark' : 'light'];
  const money = (n: number) => `${symbol}${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  const groups = (['need', 'want', 'unsorted'] as const).filter(g => g !== 'unsorted' || current.unsorted.amount > 0);

  return (
    <div className="bg-card p-6 rounded-3xl shadow-sm border border-card-border">
      <h3 className="text-lg font-bold text-foreground">{t('needs.title')}</h3>
      <p className="text-xs text-muted font-medium mb-4">{t('compare.hint')}</p>

      {current.total === 0 ? (
        <p className="text-sm text-muted font-medium text-center py-4">{t('needs.empty')}</p>
      ) : (
        <div className="space-y-3">
          <div className="flex gap-0.5 h-3 rounded-full overflow-hidden" role="img" aria-label={groups.map(g => `${t(GROUP_TEXT[g])} ${current[g].percent}%`).join(', ')}>
            {groups.filter(g => current[g].amount > 0).map(g => (
              <span key={g} style={{ width: `${(current[g].amount / current.total) * 100}%`, backgroundColor: colours[g] }} />
            ))}
          </div>

          {groups.map(g => {
            const change = g === 'unsorted' ? null : groupChange(current[g].amount, before[g].amount);
            const up = change !== null && change > 0.005;
            const down = change !== null && change < -0.005;
            const Icon = up ? ArrowUpRight : down ? ArrowDownRight : ArrowRight;
            const tone = g !== 'want' || (!up && !down) ? 'text-muted' : up ? 'text-rose-500' : 'text-teal-600 dark:text-teal-400';
            return (
              <div key={g} className="p-3 rounded-xl bg-background/50 space-y-1">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="w-2.5 h-2.5 shrink-0 rounded-full" style={{ backgroundColor: colours[g] }} aria-hidden="true" />
                    <span className="text-sm font-bold text-foreground">{t(GROUP_TEXT[g])}</span>
                  </span>
                  <span className="shrink-0 text-sm font-bold text-foreground tabular-nums">{money(current[g].amount)} · {current[g].percent}%</span>
                </div>
                <p className="text-[12px] text-muted font-medium truncate">{current[g].categories.slice(0, 3).map(c => categoryLabel(t, c.category)).join(', ')}</p>
                {change !== null && (
                  <p className={cn('text-[12px] font-bold inline-flex items-center gap-0.5', tone)}>
                    <Icon size={13} /> {t('needs.change', { percent: Math.round(Math.abs(change) * 100) })}
                  </p>
                )}
                {g === 'unsorted' && <button onClick={() => setSorting(true)} className="block text-xs font-bold text-indigo-600 dark:text-indigo-400">{t('needs.choose')}</button>}
              </div>
            );
          })}
        </div>
      )}

      <button onClick={() => setSorting(true)} className="mt-3 text-xs font-bold text-indigo-600 dark:text-indigo-400">{t('needs.changeGroups')}</button>
      {sorting && <SortSheet uid={uid} own={own} expenses={expenses} onClose={() => setSorting(false)} />}
    </div>
  );
}

function SortSheet({ uid, own, expenses, onClose }: { uid: string; own: SpendingTypes; expenses: Expense[]; onClose: () => void }) {
  const { t } = useI18n();
  const { refreshProfile } = useAuth();
  const custom = useOwnCategories(uid);
  const [draft, setDraft] = useState<SpendingTypes>(own);
  const [busy, setBusy] = useState(false);
  const names = [...new Set([...DEFAULT_CATEGORIES.map(c => c.name), ...custom, ...expenses.map(e => e.category)])];
  // Not sorted first, because those are the ones waiting for a choice
  const ordered = [...names.filter(n => groupOf(n, draft) === 'unsorted'), ...names.filter(n => groupOf(n, draft) !== 'unsorted')];

  const save = async () => {
    setBusy(true);
    try {
      await saved(updateDoc(doc(db, 'users', uid), { spendingTypes: draft }));
      await refreshProfile();
      onClose();
    } catch (err) {
      console.error('Could not save needs and wants:', err);
      alertDialog(t('needs.error'));
    } finally {
      setBusy(false);
    }
  };

  const button = (name: string, type: SpendingType) => {
    const on = groupOf(name, draft) === type;
    return (
      <button type="button" onClick={() => setDraft(prev => ({ ...prev, [name]: type }))} aria-pressed={on}
        className={cn('px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors', on ? CHOICE_ON : 'bg-card text-muted border-card-border')}>
        {t(type === 'need' ? 'needs.need' : 'needs.want')}
      </button>
    );
  };

  return (
    <DetailSheet
      open
      onClose={onClose}
      icon={<IconBox Icon={Scale} size="lg" />}
      title={t('needs.sortTitle')}
      about={t('needs.sortHint')}
      footer={<button onClick={save} disabled={busy} className={`${btnPrimary} w-full`}>{t(busy ? 'common.saving' : 'common.save')}</button>}
    >
      {ordered.map(name => (
        <div key={name} className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-background/50">
          <span className="text-sm font-bold text-foreground truncate">{categoryLabel(t, name)}</span>
          <span className="shrink-0 flex gap-1.5">{button(name, 'need')}{button(name, 'want')}</span>
        </div>
      ))}
    </DetailSheet>
  );
}

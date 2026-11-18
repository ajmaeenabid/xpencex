import { useEffect, useState } from 'react';
import { collection, doc, getDocs, limit, onSnapshot, orderBy, query, updateDoc, where } from 'firebase/firestore';
import { format } from 'date-fns';
import { Shapes, Sparkles } from 'lucide-react';
import { DEFAULT_CATEGORIES } from '../../shared/constants';
import { db } from '../../shared/firebase';
import { categoryLabel, useI18n } from '../../shared/i18n';
import { saved } from '../../shared/lib/offlineSave';
import { cn } from '../../shared/lib/utils';
import type { Expense } from '../../shared/types';
import DetailSheet from '../../shared/components/DetailSheet';
import { alertDialog } from '../../shared/components/Dialog';
import { btnSecondary } from '../accounts/ui';
import { noteCategoryCorrection, useCategoryRules } from '../categoryRules/categoryRuleService';
import TapCard, { IconBox } from '../home/TapCard';
import { useOwnCategories } from '../planned/plannedService';
import { windowStart } from './expenseQueries';
import { OTHER_CATEGORY, UNSORTED_MONTHS, needsCategory, suggestCategory } from './unsorted';

/** Expenses from the last 3 money months that still need a category, newest first */
export function useUnsortedExpenses(uid: string | undefined, startDay: number) {
  const [list, setList] = useState<Expense[]>([]);
  const since = windowStart(UNSORTED_MONTHS, new Date(), startDay);
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      query(collection(db, 'expenses'), where('uid', '==', uid), where('category', '==', OTHER_CATEGORY), where('date', '>=', since), orderBy('date', 'desc')),
      snap => setList(snap.docs.map(d => ({ id: d.id, ...d.data() } as Expense)).filter(needsCategory)),
      err => console.error('Could not load entries to sort', err),
    );
  }, [uid, since]);
  return list;
}

/** Home: how many entries need a category. Shown only while there are some. */
export default function UnsortedCard({ uid, entries, symbol }: { uid: string; entries: Expense[]; symbol: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <>
      <TapCard Icon={Shapes} iconTone="warning" label={t('unsorted.title')} headline={t('unsorted.count', { count: entries.length })} onOpen={() => setOpen(true)} />
      {open && entries[0] && <SortSheet uid={uid} entries={entries} symbol={symbol} onClose={() => setOpen(false)} />}
    </>
  );
}

function SortSheet({ uid, entries, symbol, onClose }: { uid: string; entries: Expense[]; symbol: string; onClose: () => void }) {
  const { t, dateLocale } = useI18n();
  const own = useOwnCategories(uid);
  const rules = useCategoryRules(uid);
  const [history, setHistory] = useState<Expense[]>([]);
  const [busy, setBusy] = useState(false);
  const entry = entries[0];
  const names = [...new Set([...DEFAULT_CATEGORIES.map(c => c.name), ...own])].filter(n => n !== OTHER_CATEGORY);
  const suggestion = suggestCategory(entry.title, history, names, rules);

  // Read once when the sheet opens: the suggestions come from the latest entries (Firestore counts every read)
  useEffect(() => {
    let alive = true;
    getDocs(query(collection(db, 'expenses'), where('uid', '==', uid), orderBy('date', 'desc'), limit(200)))
      .then(snap => { if (alive) setHistory(snap.docs.map(d => d.data() as Expense)); })
      .catch(err => console.error('Could not read past entries', err));
    return () => { alive = false; };
  }, [uid]);

  const change = async (fields: { category: string } | { categoryKept: true }) => {
    setBusy(true);
    try {
      await saved(updateDoc(doc(db, 'expenses', entry.id), fields));
      if ('category' in fields) await noteCategoryCorrection(uid, entry.title, fields.category, rules, t);
    } catch (err) {
      console.error('Could not sort the entry:', err);
      alertDialog(t('unsorted.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <DetailSheet
      open
      onClose={onClose}
      icon={<IconBox Icon={Shapes} tone="warning" size="lg" />}
      title={t('unsorted.sortTitle')}
      about={t('unsorted.left', { count: entries.length })}
      footer={<button onClick={() => change({ categoryKept: true })} disabled={busy} className={`${btnSecondary} w-full`}>{t('unsorted.keep')}</button>}
    >
      <div className="p-3 rounded-xl bg-background/50 border border-card-border">
        <div className="flex items-center justify-between gap-3">
          <p className="font-bold text-foreground truncate">{entry.title}</p>
          <p className="shrink-0 font-bold text-foreground tabular-nums">{symbol}{entry.amount.toLocaleString()}</p>
        </div>
        <p className="text-xs font-medium text-muted">{format(new Date(entry.date), 'd MMM yyyy', { locale: dateLocale })}</p>
      </div>

      {suggestion && (
        <button onClick={() => change({ category: suggestion })} disabled={busy} className="w-full flex items-center justify-center gap-2 h-11 rounded-xl bg-indigo-600 text-white text-sm font-bold disabled:opacity-50">
          <Sparkles size={15} /> {t('unsorted.suggested', { category: categoryLabel(t, suggestion) })}
        </button>
      )}

      <div className="grid grid-cols-2 gap-2">
        {names.filter(n => n !== suggestion).map(name => (
          <button key={name} onClick={() => change({ category: name })} disabled={busy}
            className={cn('min-h-10 px-3 py-2 rounded-xl text-xs font-bold border border-card-border bg-background/50 text-foreground disabled:opacity-50')}>
            {categoryLabel(t, name)}
          </button>
        ))}
      </div>
    </DetailSheet>
  );
}

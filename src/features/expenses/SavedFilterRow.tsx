import { useEffect, useRef, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import { Bookmark, BookmarkPlus, Trash2 } from 'lucide-react';
import { db } from '../../shared/firebase';
import { useI18n } from '../../shared/i18n';
import type { TKey } from '../../shared/i18n';
import { saved as savedWrite } from '../../shared/lib/offlineSave';
import { cn } from '../../shared/lib/utils';
import DetailSheet from '../../shared/components/DetailSheet';
import { alertDialog, confirmDialog } from '../../shared/components/Dialog';
import { btnPrimary, btnSecondary, inputClass } from '../accounts/ui';
import {
  ALL_CATEGORIES, MAX_FILTER_NAME, SavedFilter, SavedFilterProblem, applySaved, cleanFilterName, isFiltering, isShowing, readFilters, savedFilterProblem,
} from './savedFilters';
import { NO_FILTERS, TransactionFilters } from './transactionFilters';

const HOLD_MS = 500;
const PROBLEM_TEXT: Record<SavedFilterProblem, TKey> = {
  full: 'filters.savedFull', secret: 'secret.warning', name: 'filters.savedNeedName', same: 'filters.savedSame',
};

function useSavedFilters(uid: string | undefined) {
  const [list, setList] = useState<SavedFilter[]>([]);
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      query(collection(db, 'savedFilters'), where('uid', '==', uid)),
      snap => setList(snap.docs.map(d => ({ id: d.id, ...d.data() } as SavedFilter)).sort((a, b) => a.createdAt.localeCompare(b.createdAt))),
      err => console.error('Could not load saved filters', err),
    );
  }, [uid]);
  return list;
}

/** Saved filters on the Expenses screen: tap to apply, tap again to clear, press and hold to rename or delete */
export default function SavedFilterRow({ uid, filters, category, accountIds, onApply, saveSignal = 0 }: {
  uid: string;
  saveSignal?: number; // goes up when the Filters sheet's "Save this filter" is tapped: open the naming sheet
  filters: TransactionFilters;
  category: string;
  accountIds: string[];
  onApply: (filters: TransactionFilters, category: string) => void;
}) {
  const { t } = useI18n();
  const list = useSavedFilters(uid);
  const [sheet, setSheet] = useState<{ editing?: SavedFilter } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const held = useRef(false);
  const showing = list.find(s => isShowing(s, filters, category));
  const canSave = isFiltering(filters, category) && !showing;
  // From the Filters sheet: the filters are applied by now, so name them (unless exactly these are already saved)
  useEffect(() => { if (saveSignal > 0 && canSave) setSheet({}); }, [saveSignal]); // eslint-disable-line react-hooks/exhaustive-deps
  if (list.length === 0 && !canSave) return null;

  const startHold = (item: SavedFilter) => {
    held.current = false;
    timer.current = window.setTimeout(() => { held.current = true; setSheet({ editing: item }); }, HOLD_MS);
  };
  const stopHold = () => window.clearTimeout(timer.current);
  const tap = (item: SavedFilter) => {
    if (held.current) { held.current = false; return; }
    if (showing?.id === item.id) onApply(NO_FILTERS, ALL_CATEGORIES);
    else onApply(applySaved(item, accountIds), item.category);
  };

  return (
    <div className="space-y-1.5">
      <div className="flex gap-2 overflow-x-auto no-scrollbar px-1">
        {list.map(item => (
          <button
            key={item.id}
            onClick={() => tap(item)}
            onPointerDown={() => startHold(item)}
            onPointerUp={stopHold}
            onPointerLeave={stopHold}
            onPointerCancel={stopHold}
            onContextMenu={e => { e.preventDefault(); stopHold(); held.current = true; setSheet({ editing: item }); }}
            aria-pressed={showing?.id === item.id}
            className={cn('shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap border select-none transition-colors',
              showing?.id === item.id ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-card text-foreground border-card-border')}
          >
            <Bookmark size={13} /> {item.name}
          </button>
        ))}
        {canSave && (
          <button onClick={() => setSheet({})} className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap border border-dashed border-card-border text-indigo-600 dark:text-indigo-400">
            <BookmarkPlus size={13} /> {t('filters.saveThis')}
          </button>
        )}
      </div>
      {list.length > 0 && <p className="px-1 text-[11px] text-muted font-medium">{t('filters.savedHold')}</p>}
      {sheet && <NameSheet key={sheet.editing?.id || 'new'} uid={uid} list={list} editing={sheet.editing} filters={filters} category={category} onClose={() => setSheet(null)} />}
    </div>
  );
}

function NameSheet({ uid, list, editing, filters, category, onClose }: {
  uid: string;
  list: SavedFilter[];
  editing?: SavedFilter;
  filters: TransactionFilters;
  category: string;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(editing?.name || '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await savedWrite(work());
      onClose();
    } catch (err) {
      console.error('Could not change the saved filter:', err);
      alertDialog(t('filters.savedError'));
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    const problem = savedFilterProblem(name, list, editing?.id);
    if (problem) { setError(t(PROBLEM_TEXT[problem])); return; }
    const clean = cleanFilterName(name)!;
    run(() => (editing
      ? updateDoc(doc(db, 'savedFilters', editing.id), { name: clean })
      : addDoc(collection(db, 'savedFilters'), { uid, name: clean, filters: readFilters(filters), category: category.slice(0, 60), createdAt: new Date().toISOString() })));
  };

  const remove = async () => {
    if (editing && await confirmDialog(t('filters.savedConfirmDelete', { name: editing.name }), { danger: true })) {
      run(() => deleteDoc(doc(db, 'savedFilters', editing.id)));
    }
  };

  return (
    <DetailSheet
      open
      onClose={onClose}
      icon={<BookmarkPlus size={20} className="text-indigo-600 dark:text-indigo-400" />}
      title={t(editing ? 'filters.savedEdit' : 'filters.saveThis')}
      footer={(
        <div className="flex gap-2">
          {editing && <button onClick={remove} disabled={busy} className={cn(btnSecondary, 'text-rose-600 dark:text-rose-400')}><Trash2 size={15} /> {t('common.delete')}</button>}
          <button onClick={save} disabled={busy} className={cn(btnPrimary, 'flex-1')}>{t(busy ? 'common.saving' : 'common.save')}</button>
        </div>
      )}
    >
      <input autoFocus maxLength={MAX_FILTER_NAME} aria-label={t('filters.savedName')} placeholder={t('filters.savedName')} className={inputClass} value={name} onChange={e => setName(e.target.value)} />
      {error && <p role="alert" className="text-sm font-semibold text-rose-600 dark:text-rose-400">{error}</p>}
    </DetailSheet>
  );
}

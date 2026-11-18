import { useState } from 'react';
import { Check, Pencil, Plus, Sparkles, Star, X } from 'lucide-react';
import { useAuth } from '../../app/App';
import { categoryLabel, TKey, useI18n } from '../../shared/i18n';
import { cn } from '../../shared/lib/utils';
import { showToast } from '../../shared/lib/toast';
import { confirmDialog } from '../../shared/components/Dialog';
import { addTemplate, deleteTemplate, useRecentForSuggestions, useTemplates } from './templateService';
import { QuickEntry, TemplateKind, favouriteProblem, quickRow, suggestions } from './templates';

const PROBLEM: Record<'incomplete' | 'full' | 'exists', TKey> = {
  incomplete: 'quick.needFields', full: 'quick.full', exists: 'quick.exists',
};

/**
 * The Add screen's "Quick add" row: your favourites, then entries you add often. Tapping one fills the form;
 * nothing is saved until Save. "Save as favourite" keeps what's in the form; Edit pins suggestions or removes favourites.
 */
export default function QuickEntries({ kind, form, onPick, symbol }: {
  kind: TemplateKind;
  form: { title: string; amount: number; category: string; accountId?: string };
  onPick: (entry: QuickEntry) => void;
  symbol: string;
}) {
  const { user } = useAuth();
  const { t } = useI18n();
  const templates = useTemplates(user?.uid);
  const recent = useRecentForSuggestions(user?.uid, kind);
  const row = quickRow(templates, suggestions(recent, kind), kind);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const money = (n: number) => `${symbol}${n.toLocaleString()}`;

  const keep = async (entry: { title: string; amount: number; category: string; accountId?: string }) => {
    if (!user || busy) return;
    const problem = favouriteProblem(entry, templates, kind);
    if (problem) { showToast(PROBLEM[problem]); return; }
    setBusy(true);
    try {
      await addTemplate(user.uid, { kind, ...entry });
      showToast('quick.saved');
    } catch (err) {
      console.error('Could not save the favourite', err);
      showToast('quick.saveFailed');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (entry: QuickEntry) => {
    if (!entry.templateId || !(await confirmDialog(t('quick.confirmRemove', { title: entry.title })))) return;
    deleteTemplate(entry.templateId).catch(err => console.error('Could not remove the favourite', err));
  };

  const hasFavourites = row.some(r => r.templateId);

  return (
    <section aria-labelledby={`quick-${kind}`} className="space-y-2">
      <div className="flex items-center gap-2 px-1">
        <h2 id={`quick-${kind}`} className="flex-1 text-xs font-semibold text-muted">{t('quick.title')}</h2>
        {row.length > 0 && (
          <button type="button" onClick={() => setEditing(e => !e)} className="inline-flex items-center gap-1 text-xs font-bold text-muted hover:text-foreground">
            {editing ? <><Check size={13} /> {t('quick.done')}</> : <><Pencil size={13} /> {t('quick.edit')}</>}
          </button>
        )}
        <button
          type="button"
          onClick={() => keep(form)}
          disabled={busy}
          className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 dark:text-indigo-400 disabled:opacity-50"
        >
          <Star size={13} /> {t('quick.save')}
        </button>
      </div>

      {row.length === 0 ? (
        <p className="px-1 text-xs text-muted leading-relaxed">{t('quick.empty')}</p>
      ) : (
        // Scrolls sideways on its own, so swiping it never switches screens
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1">
          {row.map(entry => {
            const saved = !!entry.templateId;
            return (
              <div key={entry.key} className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => (editing ? (saved ? remove(entry) : keep(entry)) : onPick(entry))}
                  aria-label={editing
                    ? t(saved ? 'quick.remove' : 'quick.pin', { title: entry.title })
                    : t('quick.use', { title: entry.title, amount: money(entry.amount), category: categoryLabel(t, entry.category) })}
                  className={cn(
                    'flex flex-col items-start gap-0.5 pl-3 pr-3 py-2 rounded-2xl border text-left transition-colors max-w-[11rem]',
                    saved ? 'bg-card border-card-border shadow-sm' : 'bg-background/60 border-dashed border-card-border',
                    editing && 'pr-8',
                  )}
                >
                  <span className="flex items-center gap-1 text-sm font-bold text-foreground max-w-full">
                    {saved ? <Star size={12} className="shrink-0 text-amber-500 fill-amber-400" /> : <Sparkles size={12} className="shrink-0 text-indigo-500" />}
                    <span className="truncate">{entry.title}</span>
                  </span>
                  <span className="text-[11px] font-semibold text-muted tabular-nums">{money(entry.amount)} · {categoryLabel(t, entry.category)}</span>
                </button>
                {editing && (
                  <span aria-hidden="true" className={cn(
                    'absolute right-1.5 top-1.5 w-5 h-5 rounded-full flex items-center justify-center pointer-events-none',
                    saved ? 'bg-rose-100 text-rose-600 dark:bg-rose-500/20 dark:text-rose-300' : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300',
                  )}>
                    {saved ? <X size={12} /> : <Plus size={12} />}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
      {editing && <p className="px-1 text-[11px] text-muted">{t(hasFavourites ? 'quick.editHint' : 'quick.editHintPin')}</p>}
    </section>
  );
}

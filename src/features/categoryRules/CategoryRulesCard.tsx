import { useState } from 'react';
import { Check, Pencil, Plus, Trash2, Wand2, X } from 'lucide-react';
import { useAuth } from '../../app/App';
import { DEFAULT_CATEGORIES } from '../../shared/constants';
import { categoryLabel, useI18n } from '../../shared/i18n';
import type { TKey } from '../../shared/i18n';
import type { Category } from '../../shared/types';
import { alertDialog, confirmDialog } from '../../shared/components/Dialog';
import Select from '../../shared/components/Select';
import { CategoryRule, MAX_WORDS, RuleProblem, ruleProblem } from './categoryRules';
import { addCategoryRule, deleteCategoryRule, updateCategoryRule, useCategoryRules } from './categoryRuleService';

const PROBLEM_TEXT: Record<RuleProblem, TKey> = {
  full: 'rules.problem.full',
  secret: 'secret.warning',
  words: 'rules.problem.words',
  same: 'rules.problem.same',
};

/** Expenses side panel: titles that always go in a chosen category */
export default function CategoryRulesCard({ categories }: { categories: Category[] }) {
  const { user } = useAuth();
  const { t } = useI18n();
  const rules = useCategoryRules(user?.uid);
  const names = [...new Set([...DEFAULT_CATEGORIES.map(c => c.name), ...categories.map(c => c.name)])];
  const [words, setWords] = useState('');
  const [category, setCategory] = useState(names[0]);
  const [editing, setEditing] = useState<string | undefined>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const reset = () => { setWords(''); setEditing(undefined); setError(''); };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || busy) return;
    const problem = ruleProblem(words, rules, editing);
    if (problem) { setError(t(PROBLEM_TEXT[problem])); return; }
    setBusy(true);
    try {
      await (editing ? updateCategoryRule(editing, words, category) : addCategoryRule(user.uid, words, category));
      reset();
    } catch (err) {
      console.error('Could not save the category rule:', err);
      alertDialog(t('rules.error'));
    } finally {
      setBusy(false);
    }
  };

  const edit = (rule: CategoryRule) => { setEditing(rule.id); setWords(rule.words); setCategory(rule.category); setError(''); };

  const remove = async (rule: CategoryRule) => {
    if (!(await confirmDialog(t('rules.confirmDelete', { words: rule.words }), { danger: true }))) return;
    try {
      await deleteCategoryRule(rule.id);
      if (editing === rule.id) reset();
    } catch (err) {
      console.error('Could not delete the category rule:', err);
      alertDialog(t('rules.error'));
    }
  };

  const sorted = [...rules].sort((a, b) => a.words.localeCompare(b.words));

  return (
    <div className="bg-card p-5 rounded-3xl shadow-sm border border-card-border space-y-4 transition-colors">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 shrink-0 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl flex items-center justify-center text-indigo-600 dark:text-indigo-400">
          <Wand2 size={20} />
        </div>
        <div className="min-w-0">
          <h3 className="font-bold text-foreground">{t('rules.title')}</h3>
          <p className="text-xs text-muted font-medium">{t('rules.hint')}</p>
        </div>
      </div>

      <form onSubmit={save} className="space-y-2">
        <input
          type="text"
          maxLength={MAX_WORDS}
          aria-label={t('rules.words')}
          placeholder={t('rules.wordsHint')}
          className="w-full px-3 py-3 bg-background/50 rounded-xl border-none focus:ring-2 focus:ring-indigo-600 outline-none text-sm text-foreground"
          value={words}
          onChange={e => setWords(e.target.value)}
        />
        <div className="flex gap-2">
          <div className="flex-1 min-w-0">
            <Select ariaLabel={t('add.category')} value={category} onChange={setCategory} options={names.map(n => ({ value: n, label: categoryLabel(t, n) }))} />
          </div>
          {editing && (
            <button type="button" onClick={reset} aria-label={t('common.cancel')} className="shrink-0 p-3 bg-background/50 text-muted rounded-xl"><X size={20} /></button>
          )}
          <button type="submit" disabled={busy} aria-label={t(editing ? 'common.save' : 'rules.add')} className="shrink-0 p-3 bg-indigo-600 text-white rounded-xl disabled:opacity-50">
            {editing ? <Check size={20} /> : <Plus size={20} />}
          </button>
        </div>
        {error && <p role="alert" className="text-xs font-semibold text-rose-500">{error}</p>}
      </form>

      <div className="space-y-2">
        {sorted.map(rule => (
          <div key={rule.id} className="flex items-center justify-between gap-2 p-3 bg-background/50 rounded-xl border border-card-border">
            <span className="min-w-0">
              <span className="block text-sm font-bold text-foreground truncate">{rule.words}</span>
              <span className="block text-xs font-medium text-muted truncate">{categoryLabel(t, rule.category)}</span>
            </span>
            <span className="shrink-0 flex items-center gap-1">
              <button onClick={() => edit(rule)} aria-label={t('rules.edit', { words: rule.words })} className="p-1.5 text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 rounded-lg"><Pencil size={16} /></button>
              <button onClick={() => remove(rule)} aria-label={t('rules.delete', { words: rule.words })} className="p-1.5 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/40 rounded-lg"><Trash2 size={16} /></button>
            </span>
          </div>
        ))}
        {rules.length === 0 && <p className="text-center py-2 text-muted text-sm font-medium italic">{t('rules.none')}</p>}
      </div>
    </div>
  );
}

import { useState } from 'react';
import { Plus, Tag, X } from 'lucide-react';
import { useI18n } from '../../shared/i18n';
import { containsSecret } from '../../shared/lib/sensitiveData';
import { MAX_LABELS, MAX_LABEL_LENGTH, cleanLabel, cleanLabels, hasLabel, sameLabel } from './labels';
import { useRecentLabels } from './labelService';

/** The optional labels on the Add screen: tap a recent one, or type a new one */
export default function LabelField({ uid, value, onChange }: { uid?: string; value: string[]; onChange: (labels: string[]) => void }) {
  const { t } = useI18n();
  const recent = useRecentLabels(uid);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const full = value.length >= MAX_LABELS;

  const add = (raw: string) => {
    if (!raw.trim()) return;
    if (containsSecret(raw)) { setText(''); setError(t('secret.warning')); return; }
    const label = cleanLabel(raw);
    if (!label) return;
    // "eid trip" joins "Eid trip" instead of starting a second label
    onChange(cleanLabels([...value, recent.find(r => sameLabel(r, label)) || label]));
    setText('');
    setError('');
  };

  return (
    <div className="space-y-3">
      <label htmlFor="entry-label" className="text-xs font-semibold text-muted px-1 flex items-center gap-2">
        <Tag size={12} /> {t('labels.optional')}
      </label>

      {value.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {value.map(label => (
            <button key={label} type="button" onClick={() => onChange(value.filter(l => l !== label))} aria-label={t('labels.remove', { name: label })}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 text-white text-xs font-bold">
              {label} <X size={13} />
            </button>
          ))}
        </div>
      )}

      {full ? (
        <p className="text-[12px] text-muted font-medium px-1">{t('labels.max')}</p>
      ) : (
        <>
          <div className="flex gap-2">
            <input
              id="entry-label"
              type="text"
              maxLength={MAX_LABEL_LENGTH}
              placeholder={t('labels.placeholder')}
              className="flex-1 min-w-0 px-4 py-3 bg-background/50 rounded-2xl border-2 border-transparent focus:border-indigo-600/20 focus:bg-background outline-none transition-all text-foreground text-sm font-medium"
              value={text}
              onChange={e => setText(e.target.value)}
              onBlur={() => add(text)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(text); } }}
            />
            <button type="button" onClick={() => add(text)} aria-label={t('labels.add')} className="shrink-0 w-12 rounded-2xl bg-background/50 border border-card-border text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <Plus size={18} />
            </button>
          </div>
          {recent.some(r => !hasLabel(value, r)) && (
            <div className="flex flex-wrap gap-2">
              {recent.filter(r => !hasLabel(value, r)).map(label => (
                <button key={label} type="button" onClick={() => add(label)} className="px-3 py-1.5 rounded-xl bg-background/50 border border-card-border text-muted text-xs font-bold">
                  {label}
                </button>
              ))}
            </div>
          )}
        </>
      )}
      {error && <p role="alert" className="text-xs font-semibold text-rose-500 px-1">{error}</p>}
    </div>
  );
}

/** The small labels shown under an entry in a list */
export function EntryLabels({ labels }: { labels?: string[] }) {
  if (!labels?.length) return null;
  return (
    <span className="flex flex-wrap gap-1 mt-1.5">
      {labels.map(label => (
        <span key={label} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300 text-[11px] font-bold">
          <Tag size={10} /> {label}
        </span>
      ))}
    </span>
  );
}

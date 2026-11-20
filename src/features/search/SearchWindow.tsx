import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowLeft, ArrowLeftRight, Banknote, Bell, Calculator, ChartBar, ChartColumn, ChartPie, ChevronRight, Cloud, Coins,
  CreditCard, DatabaseBackup, FileDown, Gauge, HandCoins, History, Hourglass, Landmark, Languages, List, Lock,
  MessageCircleHeart, MessageSquare, Moon, PiggyBank, Plus, Receipt, Repeat, Scale, Search, ShieldCheck, Smartphone,
  Sparkles, Tags, Target, Users, Wallet, X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useI18n, TKey } from '../../shared/i18n';
import { en } from '../../shared/i18n/en';
import { PLACES, Place, SUGGESTED, searchPlaces } from './searchPlaces';
import { Recent, addRecent, loadRecents, removeRecent, saveRecents } from './recentSearches';
import { useAuth } from '../../app/App';
import { lockScroll } from '../../shared/lib/scrollLock';
import { useBackClose } from '../../shared/lib/backButton';

const ICONS: Record<string, LucideIcon> = {
  add: Plus, expenses: List, chat: MessageSquare,
  homeBudget: Gauge, homeAccounts: Wallet, cash: Banknote, calculator: Calculator, debts: HandCoins, funds: PiggyBank,
  samity: Users, runway: Hourglass, recent: History,
  pdf: FileDown, compare: ArrowLeftRight, analysis: ChartColumn, byAccount: CreditCard, fees: Receipt, regret: Scale,
  monthly: ChartBar, breakdown: ChartPie,
  accounts: Landmark, pin: Lock, language: Languages, currency: Coins, budget: Target, categoryBudgets: Target,
  recurring: Repeat, reminders: Bell, widget: Smartphone, google: Cloud, backup: DatabaseBackup,
  feedback: MessageCircleHeart, categories: Tags, activity: ShieldCheck, darkMode: Moon,
};

/**
 * "Ask AI or search": covers the screen with a search box. Results open their screen or setting;
 * the Ask button on the right (shown once something is typed) takes the text to the AI chat's message box.
 */
export default function SearchWindow({ open, onClose, onPick, onAsk }: {
  open: boolean;
  onClose: () => void;
  onPick: (place: Place) => void;
  onAsk: (text: string) => void;
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const uid = user?.uid || '';
  const [query, setQuery] = useState('');
  const [recents, setRecents] = useState<Recent[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const keepRecents = (next: Recent[]) => { setRecents(next); if (uid) saveRecents(uid, next); };

  // Starts empty each time, with the keyboard up; Escape closes; the page behind doesn't scroll
  // The phone's back button does the same (src/shared/lib/backButton.ts)
  useBackClose(open, onClose);
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setRecents(uid ? loadRecents(uid, PLACES.map(p => p.id)) : []);
    const focus = window.setTimeout(() => inputRef.current?.focus(), 60);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const unlockScroll = lockScroll();
    return () => { window.clearTimeout(focus); window.removeEventListener('keydown', onKey); unlockScroll(); };
  }, [open]);

  const title = (p: Place) => t(`search.${p.id}` as TKey);
  const results = useMemo(() => searchPlaces(query, PLACES, p => ({
    title: title(p),
    // The app's language and English, so "bkash" or "pdf" also work in Bangla
    words: `${t(`search.${p.id}.kw` as TKey)} ${en[`search.${p.id}.kw` as keyof typeof en] || ''}`,
  })), [query, t]);
  const typed = query.trim();
  // Popular leaves out places already in the recent list
  const recentIds = new Set(recents.flatMap(r => (r.kind === 'place' ? [r.id] : [])));
  const shown = typed ? results : SUGGESTED.filter(id => !recentIds.has(id)).map(id => PLACES.find(p => p.id === id)!).filter(Boolean);

  const ask = () => {
    if (typed) keepRecents(addRecent(recents, { kind: 'text', text: typed }));
    onAsk(typed);
  };
  const pick = (p: Place) => {
    keepRecents(addRecent(recents, { kind: 'place', id: p.id }));
    onPick(p);
  };
  const remove = (r: Recent) => keepRecents(removeRecent(recents, r));
  const fillText = (text: string) => { setQuery(text); inputRef.current?.focus(); };

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="search"
          role="dialog"
          aria-modal="true"
          aria-label={t('search.bar')}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[70] bg-background text-foreground flex flex-col pt-[var(--sat)] pb-[var(--sab)]"
        >
          <div className="max-w-md w-full mx-auto px-4 pt-4">
            <form
              onSubmit={e => { e.preventDefault(); if (results[0]) pick(results[0]); else ask(); }}
              className="flex items-center gap-1 h-14 pl-1 pr-1.5 rounded-full bg-card border border-card-border shadow-soft"
            >
              <button type="button" onClick={onClose} aria-label={t('search.back')} className="shrink-0 w-11 h-11 rounded-full flex items-center justify-center text-muted hover:text-foreground">
                <ArrowLeft size={22} />
              </button>
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={t('search.placeholder')}
                aria-label={t('search.placeholder')}
                enterKeyHint="search"
                maxLength={300}
                className="input-bare flex-1 min-w-0 bg-transparent text-base font-medium text-foreground placeholder:text-muted"
              />
              {typed && (
                <button type="button" onClick={() => { setQuery(''); inputRef.current?.focus(); }} aria-label={t('common.close')} className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-muted hover:text-foreground">
                  <X size={18} />
                </button>
              )}
              {/* Always there, like the ✨ on Home's row: with text it goes to the chat's message box, empty it opens the chat */}
              <button
                type="button"
                onClick={ask}
                aria-label={t('search.askLabel')}
                className="shrink-0 h-11 px-4 rounded-full bg-indigo-600 text-white text-sm font-bold flex items-center gap-1.5 shadow-vibrant"
              >
                <Sparkles size={16} /> {t('search.ask')}
              </button>
            </form>
          </div>

          <div className="flex-1 overflow-y-auto">
            <div className="max-w-md mx-auto px-4 pt-5 pb-8">
              {/* Before typing: recent searches first (each with a cross to remove it), then the popular ones */}
              {!typed && recents.length > 0 && (
                <>
                  <p className="px-2 pb-2 text-xs font-bold text-muted uppercase tracking-wide">{t('search.recentTitle')}</p>
                  <ul className="space-y-1 pb-5">
                    {recents.map(r => {
                      const place = r.kind === 'place' ? PLACES.find(p => p.id === r.id) : undefined;
                      const label = place ? title(place) : r.kind === 'text' ? r.text : '';
                      const Icon = place ? ICONS[place.id] || Search : History;
                      return (
                        <li key={r.kind === 'place' ? `p:${r.id}` : `t:${r.text}`} className="flex items-center gap-1">
                          <button
                            onClick={() => (place ? pick(place) : r.kind === 'text' && fillText(r.text))}
                            className="flex-1 min-w-0 flex items-center gap-3 p-2.5 rounded-2xl text-left hover:bg-card active:bg-card transition-colors"
                          >
                            <span className="w-10 h-10 shrink-0 rounded-xl bg-background/70 border border-card-border text-muted flex items-center justify-center"><Icon size={20} /></span>
                            <span className="flex-1 min-w-0">
                              <span className="block text-sm font-bold text-foreground truncate">{label}</span>
                              <span className="block text-xs font-semibold text-muted truncate">
                                {place ? t(`search.where.${place.tab}` as TKey) : t('search.recentAsked')}
                              </span>
                            </span>
                          </button>
                          <button
                            onClick={() => remove(r)}
                            aria-label={t('search.removeRecent', { name: label })}
                            className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-muted hover:text-foreground hover:bg-card"
                          >
                            <X size={18} />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}

              {!typed && shown.length > 0 && <p className="px-2 pb-2 text-xs font-bold text-muted uppercase tracking-wide">{t('search.suggested')}</p>}

              {shown.length > 0 ? (
                <ul className="space-y-1">
                  {shown.map(p => {
                    const Icon = ICONS[p.id] || Search;
                    return (
                      <li key={p.id}>
                        <button onClick={() => pick(p)} className="w-full flex items-center gap-3 p-2.5 rounded-2xl text-left hover:bg-card active:bg-card transition-colors">
                          <span className="w-10 h-10 shrink-0 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center"><Icon size={20} /></span>
                          <span className="flex-1 min-w-0">
                            <span className="block text-sm font-bold text-foreground truncate">{title(p)}</span>
                            <span className="block text-xs font-semibold text-muted truncate">{t(`search.where.${p.tab}` as TKey)}</span>
                          </span>
                          <ChevronRight size={18} className="shrink-0 text-muted" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : typed && (
                <div className="pt-10 text-center space-y-4">
                  <p className="text-sm font-medium text-muted">{t('search.none')}</p>
                  <button onClick={ask} className="inline-flex items-center gap-2 max-w-full px-4 py-3 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 text-sm font-bold">
                    <Sparkles size={16} className="shrink-0" /> <span className="truncate">{t('search.noneAsk', { text: typed })}</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/** The row at the top of Home that opens the search */
export function SearchBar({ onOpen }: { onOpen: () => void }) {
  const { t } = useI18n();
  return (
    <button
      data-tour="search"
      onClick={onOpen}
      className="w-full h-14 flex items-center gap-3 pl-5 pr-2 rounded-full bg-card border border-card-border shadow-soft text-left transition-colors hover:border-indigo-500/40"
    >
      <Search size={20} className="shrink-0 text-muted" />
      <span className="flex-1 min-w-0 truncate text-[15px] font-semibold text-muted">{t('search.bar')}</span>
      <span className="shrink-0 w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-vibrant">
        <Sparkles size={18} />
      </span>
    </button>
  );
}

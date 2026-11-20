import { createPortal } from 'react-dom';
import { useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  BarChart3, Calculator, CalendarClock, Clock, HandCoins, Hourglass, Landmark, Lightbulb, LucideIcon, PanelLeftClose, PiggyBank,
  ShoppingCart, Target, TrendingUp, Users, Wallet, Gauge,
} from 'lucide-react';
import { TKey, useI18n } from '../../shared/i18n';
import { cn } from '../../shared/lib/utils';
import { lockScroll } from '../../shared/lib/scrollLock';
import { DAILY_CARDS, HomeCard, PANEL_CARDS } from './homeCards';
import { useBackClose } from '../../shared/lib/backButton';

const ICONS: Record<HomeCard, LucideIcon> = {
  budget: Wallet, accounts: Landmark, earned: TrendingUp, spending: Gauge, planned: CalendarClock, charts: BarChart3, recent: Clock,
  runway: Hourglass, funds: PiggyBank, debts: HandCoins, samity: Users, loan: Landmark, shopping: ShoppingCart, calculator: Calculator,
  insights: Lightbulb, categoryBudgets: Target,
};

/**
 * Home's side panel: every card, with a switch to show it on Home. Tapping a card opens its own window
 * (the same one its Home card opens), so a card can be used without putting it on Home.
 */
export default function HomePanel({ open, onClose, on, alerts, onToggle, onOpenCard }: {
  open: boolean;
  onClose: () => void;
  on: Set<string>;
  alerts: Set<string>; // panel cards on Home right now because they need you
  onToggle: (id: HomeCard) => void;
  onOpenCard: (id: HomeCard) => void;
}) {
  const { t } = useI18n();

  // The phone's back button does the same (src/shared/lib/backButton.ts)
  useBackClose(open, onClose);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const unlockScroll = lockScroll();
    return () => { window.removeEventListener('keydown', onKey); unlockScroll(); };
  }, [open, onClose]);

  const row = (id: HomeCard) => {
    const Icon = ICONS[id];
    const name = t(`homeCards.${id}` as TKey);
    const shown = on.has(id);
    return (
      <div key={id} className="flex items-center gap-2 pr-3">
        <button onClick={() => onOpenCard(id)} className="flex-1 min-w-0 flex items-center gap-3 pl-3 py-3 text-left">
          <span className="w-9 h-9 shrink-0 rounded-xl flex items-center justify-center bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
            <Icon size={18} />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-bold text-foreground truncate">{name}</span>
            {!shown && alerts.has(id) && <span className="block text-[11px] font-semibold text-amber-600 dark:text-amber-400 truncate">{t('homeCards.alert')}</span>}
          </span>
        </button>
        <button
          role="switch"
          aria-checked={shown}
          aria-label={t('homeCards.show', { name })}
          onClick={() => onToggle(id)}
          className={cn('relative shrink-0 w-11 h-6 rounded-full transition-colors', shown ? 'bg-indigo-600' : 'bg-background border border-card-border')}
        >
          <span className={cn('absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all', shown ? 'left-[1.375rem]' : 'left-0.5')} />
        </button>
      </div>
    );
  };

  const group = (title: string, ids: readonly HomeCard[]) => (
    <section className="space-y-2">
      <h3 className="px-2 text-[12px] font-bold uppercase tracking-wider text-muted">{title}</h3>
      <div className="bg-card rounded-3xl border border-card-border shadow-sm overflow-hidden divide-y divide-card-border">{ids.map(row)}</div>
    </section>
  );

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div key="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 z-[60] bg-black/30 backdrop-blur-[2px]" />
          <motion.aside
            key="drawer"
            role="dialog"
            aria-modal="true"
            aria-label={t('homeCards.title')}
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 38 }}
            className="fixed inset-y-0 left-0 z-[61] w-[90%] max-w-sm flex flex-col bg-background border-r border-card-border rounded-r-[2rem] shadow-2xl pt-[var(--sat)] pb-[var(--sab)]"
          >
            <div className="flex items-center justify-between gap-2 px-5 pt-5 pb-3">
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-foreground">{t('homeCards.title')}</h2>
                <p className="text-xs text-muted font-medium">{t('homeCards.hint')}</p>
              </div>
              <button onClick={onClose} aria-label={t('common.close')} className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-muted hover:text-foreground hover:bg-card">
                <PanelLeftClose size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-5">
              {group(t('homeCards.daily'), DAILY_CARDS)}
              {group(t('homeCards.more'), PANEL_CARDS)}
              <p className="px-2 text-[11px] text-muted font-medium">{t('homeCards.saved')}</p>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}

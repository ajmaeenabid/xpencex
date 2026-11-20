import { motion } from 'motion/react';
import { List, PieChart } from 'lucide-react';
import { useI18n } from '../../shared/i18n';
import { cn } from '../../shared/lib/utils';
import { SpendingSide } from './spending';

/** "Expenses | Reports" at the top of the Spending tab, in the same style as the chat's "Chats | Agent space" */
export default function SpendingSwitch({ side, onSide }: { side: SpendingSide; onSide: (side: SpendingSide) => void }) {
  const { t } = useI18n();
  const tabs = [
    { id: 'expenses' as const, label: t('spending.expenses'), icon: List },
    { id: 'reports' as const, label: t('spending.reports'), icon: PieChart },
  ];
  return (
    <div className="flex justify-center">
      <div
        role="tablist"
        aria-label={t('spending.switch')}
        className="inline-flex items-center gap-0.5 p-0.5 rounded-full bg-card/40 backdrop-blur-md border border-white/40 dark:border-white/10 shadow-[0_2px_12px_rgba(0,0,0,0.06)]"
      >
        {tabs.map(tab => {
          const on = side === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={on}
              onClick={() => onSide(tab.id)}
              className={cn(
                'relative z-10 h-8 px-4 flex items-center gap-1.5 rounded-full text-sm font-bold transition-colors',
                on ? 'text-indigo-700 dark:text-indigo-200' : 'text-muted hover:text-foreground',
              )}
            >
              {/* Each page has its own copy of the switch, so the glow fades in rather than sliding across */}
              {on && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="absolute inset-0 -z-10 rounded-full bg-indigo-500/15 dark:bg-indigo-400/20 ring-1 ring-indigo-500/25 dark:ring-indigo-300/25"
                />
              )}
              <Icon size={14} />
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

import { Home, List, Plus, MessageSquare, User } from 'lucide-react';
import { isSpendingTab } from '../../features/spending/spending';
import { cn } from '../lib/utils';
import { motion } from 'motion/react';
import { useI18n } from '../i18n';

interface BottomNavProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

// A short tick on phones that support it, so taps feel physical
export const haptic = () => {
  try { navigator.vibrate?.(8); } catch { /* not supported */ }
};

export default function BottomNav({ activeTab, setActiveTab }: BottomNavProps) {
  const { t } = useI18n();
  const tabs = [
    { id: 'home', icon: Home, label: t('nav.home') },
    { id: 'chat', icon: MessageSquare, label: t('nav.chat') },
    { id: 'add', icon: Plus, label: t('nav.add'), isSpecial: true },
    // Spending: Expenses and Reports together, so there are two tabs on each side of the + button.
    // It lights up on both pages; App opens it on the side used last.
    { id: 'expenses', icon: List, label: t('nav.spending') },
    { id: 'profile', icon: User, label: t('nav.profile') },
  ];

  const go = (id: string) => {
    if (id !== activeTab) haptic();
    setActiveTab(id);
  };

  return (
    <nav
      aria-label={t('nav.main')}
      className="glass-bar fixed bottom-[calc(1.5rem+var(--sab))] left-4 right-4 max-w-md mx-auto px-2 py-2.5 flex justify-between items-center z-50 rounded-[2.5rem]"
    >
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id || (tab.id === 'expenses' && isSpendingTab(activeTab));

        if (tab.isSpecial) {
          return (
            <div key={tab.id} className="flex-1 flex justify-center">
              <motion.button
                data-tour={tab.id}
                onClick={() => go(tab.id)}
                aria-label={t('nav.addExpense')}
                aria-current={isActive ? 'page' : undefined}
                whileHover={{ scale: 1.08, rotate: 90 }}
                whileTap={{ scale: 0.88 }}
                transition={{ type: 'spring', stiffness: 400, damping: 18 }}
                className="flex flex-col items-center justify-center bg-gradient-to-br from-indigo-600 to-purple-600 text-white w-14 h-14 rounded-2xl shadow-vibrant"
              >
                <Icon size={28} />
              </motion.button>
            </div>
          );
        }

        return (
          <motion.button
            key={tab.id}
            data-tour={tab.id}
            onClick={() => go(tab.id)}
            aria-label={tab.label}
            aria-current={isActive ? 'page' : undefined}
            whileTap={{ scale: 0.9 }}
            className={cn(
              "flex-1 flex flex-col items-center justify-center py-2 px-1 rounded-2xl relative min-w-0",
              isActive ? "text-indigo-600 dark:text-indigo-400" : "text-muted hover:text-foreground"
            )}
          >
            {/* Highlight that slides between tabs */}
            {isActive && (
              <motion.span
                layoutId="activeTabPill"
                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                className="glass-bubble absolute inset-0 rounded-2xl"
              />
            )}
            <motion.span
              className="relative"
              animate={isActive ? { y: -1, scale: 1.12 } : { y: 0, scale: 1 }}
              transition={{ type: 'spring', stiffness: 500, damping: 25 }}
            >
              <Icon size={20} />
            </motion.span>
            <span className={cn(
              "relative text-[11px] mt-1 font-semibold transition-all duration-300 truncate w-full text-center",
              isActive ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1"
            )}>
              {tab.label}
            </span>
          </motion.button>
        );
      })}
    </nav>
  );
}

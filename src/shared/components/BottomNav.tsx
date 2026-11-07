import { Home, List, Plus, PieChart, MessageSquare, User } from 'lucide-react';
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
    { id: 'expenses', icon: List, label: t('nav.expenses') },
    { id: 'reports', icon: PieChart, label: t('nav.reports') },
    { id: 'profile', icon: User, label: t('nav.profile') },
  ];

  const go = (id: string) => {
    if (id !== activeTab) haptic();
    setActiveTab(id);
  };

  return (
    <nav
      aria-label={t('nav.main')}
      className="fixed bottom-6 left-4 right-4 max-w-md mx-auto bg-white/[0.03] dark:bg-white/[0.02] backdrop-blur-md backdrop-saturate-200 border border-white/30 dark:border-white/15 px-2 py-2.5 flex justify-between items-center z-50 rounded-[2.5rem] shadow-[0_8px_32px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.25)] transition-all duration-300"
    >
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;

        if (tab.isSpecial) {
          return (
            <div key={tab.id} className="flex-1 flex justify-center">
              <motion.button
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
                className="absolute inset-0 rounded-2xl bg-indigo-500/12 dark:bg-indigo-400/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]"
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
              "relative text-[10px] mt-1 font-semibold transition-all duration-300 truncate w-full text-center",
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

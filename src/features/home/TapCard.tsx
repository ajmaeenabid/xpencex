import { ReactNode } from 'react';
import { ChevronRight, LucideIcon } from 'lucide-react';
import { cn } from '../../shared/lib/utils';
import { CARD_SUB, CARD_TITLE } from '../../shared/lib/cardText';

export type ChipTone = 'good' | 'warning' | 'danger' | 'info';

export const TONE_CLASS: Record<ChipTone, string> = {
  good: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
  warning: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
  danger: 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300',
  info: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300',
};

/** The coloured square with an icon that starts a card and its sheet */
export function IconBox({ Icon, tone = 'info', size = 'md' }: { Icon: LucideIcon; tone?: ChipTone; size?: 'md' | 'lg' }) {
  return (
    <div className={cn('shrink-0 flex items-center justify-center rounded-2xl', size === 'lg' ? 'w-11 h-11' : 'w-10 h-10', TONE_CLASS[tone])}>
      <Icon size={20} />
    </div>
  );
}

/**
 * A short Home card: what it is, one big headline, and a small coloured status.
 * Tapping it opens the full details.
 */
export default function TapCard({ Icon, iconTone, label, headline, headlineTone, chip, chipTone = 'info', chipIcon: ChipIcon, onOpen }: {
  Icon: LucideIcon;
  iconTone?: ChipTone;
  label: string;
  headline: ReactNode;
  headlineTone?: 'bad';
  chip?: ReactNode;
  chipTone?: ChipTone;
  chipIcon?: LucideIcon;
  onOpen: () => void;
}) {
  return (
    <button
      onClick={onOpen}
      className="w-full flex items-center gap-3 p-5 bg-card rounded-[2rem] shadow-soft border border-card-border text-left transition-colors hover:border-indigo-500/40"
    >
      <IconBox Icon={Icon} tone={iconTone} />
      <div className="flex-1 min-w-0 space-y-1">
        <p className={CARD_TITLE}>{label}</p>
        <p className={cn(CARD_SUB, headlineTone === 'bad' && 'text-rose-500')}>{headline}</p>
        {chip && (
          <span className={cn('inline-flex items-center gap-1 max-w-full px-2.5 py-1 rounded-full text-[11px] font-bold', TONE_CLASS[chipTone])}>
            {ChipIcon && <ChipIcon size={12} className="shrink-0" />}
            <span className="truncate">{chip}</span>
          </span>
        )}
      </div>
      <ChevronRight size={20} className="text-muted shrink-0" />
    </button>
  );
}

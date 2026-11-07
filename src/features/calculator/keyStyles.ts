import { cn } from '../../shared/lib/utils';

// The keys shared by the calculator and the converter keypads. Every key has its own visible border,
// so they stand out from the window in the light theme as well as the dark one.
const base = 'h-full min-h-0 rounded-2xl font-bold border shadow-sm transition-colors active:scale-[0.97] select-none disabled:opacity-40 disabled:active:scale-100';

export const digitKey = cn(base, 'text-xl bg-[var(--card-solid)] text-foreground border-indigo-200 hover:bg-indigo-50 dark:bg-background/70 dark:border-card-border dark:hover:bg-background');

// The font draws × ÷ − + small, so operators get a larger size to match the digits
export const operatorKey = cn(base, 'text-3xl font-semibold bg-indigo-100 text-indigo-800 border-indigo-300 hover:bg-indigo-200 dark:bg-indigo-500/15 dark:text-indigo-300 dark:border-indigo-400/30 dark:hover:bg-indigo-500/25');

export const functionKey = cn(base, 'text-sm bg-indigo-50 text-foreground border-indigo-300 hover:bg-indigo-100 dark:bg-background/40 dark:border-card-border dark:hover:bg-background/70');

export const clearKey = cn(base, 'text-base bg-red-100 text-red-700 border-red-300 hover:bg-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-400/30 dark:hover:bg-red-950/60');

export const equalsKey = cn(base, 'text-3xl bg-indigo-600 text-white border-transparent');

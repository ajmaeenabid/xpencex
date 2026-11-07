// Shared look for the My Accounts window, so every form, card and button lines up the same way

export const card = 'bg-card rounded-3xl border border-card-border shadow-sm';
export const inputClass = 'w-full h-12 px-4 bg-background/60 rounded-xl border border-card-border focus:border-indigo-500 focus:ring-2 focus:ring-indigo-600/20 outline-none text-sm text-foreground disabled:opacity-60 disabled:cursor-not-allowed transition-colors';
// Passed to <Select> so dropdowns line up with the text fields
export const selectClass = 'h-12 py-0 bg-background/60 border-card-border';
export const labelClass = 'block text-xs font-semibold text-muted mb-1.5';
export const hintClass = 'text-[11px] text-muted font-medium mt-1.5';

const button = 'inline-flex items-center justify-center gap-2 h-11 px-4 rounded-xl text-sm font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
export const btnPrimary = `${button} bg-indigo-600 text-white hover:bg-indigo-700`;
export const btnSecondary = `${button} bg-card text-foreground border border-card-border hover:bg-background/60`;
// Red outline, readable on the card in both themes; fills in lightly on hover
export const btnDanger = `${button} bg-white dark:bg-transparent text-red-700 dark:text-red-300 border-2 border-red-300 dark:border-red-400/60 hover:bg-red-50 hover:border-red-400 dark:hover:bg-red-950/40`;
export const btnSmall = 'inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-xl text-xs font-bold transition-colors';
export const iconButton = 'inline-flex items-center justify-center w-10 h-10 rounded-xl text-muted hover:text-foreground hover:bg-background/60 transition-colors';

export const HIDDEN = '••••';

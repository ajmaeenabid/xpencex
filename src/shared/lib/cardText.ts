// Text styles shared by the Home cards, so every row reads the same way:
// a clear title first, then a smaller grey line under it.
export const CARD_TITLE = 'text-base font-bold text-foreground leading-snug truncate';
export const CARD_SUB = 'text-[13px] font-semibold text-muted leading-snug truncate';

// A card that is one row opening a sheet can stand on its own ('card', a whole card on a page) or sit as one row
// in a grouped list such as Settings ('row', no card of its own; the list draws the box and the lines between rows)
export type RowLook = 'card' | 'row';
export const ROW_BUTTON: Record<RowLook, string> = {
  card: 'w-full bg-card p-6 rounded-3xl shadow-sm border border-card-border flex items-center gap-3 text-left transition-colors hover:border-indigo-500/40',
  row: 'w-full px-4 py-3.5 flex items-center gap-3 text-left transition-colors hover:bg-background/50 focus-visible:bg-background/50 outline-none',
};

// The Spending tab (chosen 2026-11-19, demo https://claude.ai/artifact/Pd1CjbjzLpevwY7zayAkp5): Expenses and
// Reports share one bottom bar tab, so the bar has two tabs on each side of the + button. They stay two pages
// ('expenses' and 'reports', so every link to either keeps working), with a switch at the top of both.

export type SpendingSide = 'expenses' | 'reports';

/** Both pages count as the Spending tab in the bottom bar */
export const isSpendingTab = (tab: string): tab is SpendingSide => tab === 'expenses' || tab === 'reports';

const KEY = 'xpences-spending-side';
type Store = Pick<Storage, 'getItem' | 'setItem'>;
const safeStorage = (): Store | null => { try { return window.localStorage; } catch { return null; } };

/** The side used last, which the tab opens on (Expenses the first time) */
export function lastSpendingSide(store: Store | null = safeStorage()): SpendingSide {
  try { return store?.getItem(KEY) === 'reports' ? 'reports' : 'expenses'; } catch { return 'expenses'; }
}

export function rememberSpendingSide(side: SpendingSide, store: Store | null = safeStorage()) {
  try { store?.setItem(KEY, side); } catch { /* opens on Expenses next time */ }
}

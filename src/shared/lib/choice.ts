// How a SELECTED choice looks everywhere in the app: filter chips, category tiles, account pickers, two-way
// toggles (chosen 2026-11-20). Soft peach, like the selected Expenses / Reports tab, so it never looks like a
// main button: solid glossy orange (bg-indigo-600, styled in index.css) stays for actions such as Save and +.
// The ring draws the outline, so it looks the same whether or not the button has a border of its own.

export const CHOICE_ON =
  'bg-indigo-500/15 text-indigo-700 border-transparent ring-1 ring-inset ring-indigo-500/35 ' +
  'dark:bg-indigo-400/20 dark:text-indigo-200 dark:ring-indigo-300/30';

// The Income side of the Expense / Income switch keeps its green
export const CHOICE_ON_INCOME =
  'bg-emerald-500/15 text-emerald-700 border-transparent ring-1 ring-inset ring-emerald-500/35 ' +
  'dark:bg-emerald-400/20 dark:text-emerald-200 dark:ring-emerald-300/30';

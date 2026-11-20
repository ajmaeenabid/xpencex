// "Ask AI or search" on Home: every screen, tool and setting a person can jump to.
// Tapping a result opens its tab, scrolls its card into view and lights it up (goToPlace in App.tsx);
// `open` also taps the card, for cards that are one row opening a window.
// Each place has a title and search words in both languages (search.<id> and search.<id>.kw in i18n);
// the English words are always searched too, so "bkash" or "pdf" work in Bangla as well.

import type { SettingsPage } from '../settings/settings';

export type PlaceTab = 'home' | 'expenses' | 'add' | 'reports' | 'profile' | 'chat';

export interface Place {
  id: string;
  tab: PlaceTab;
  section?: string; // the card's id on that page (RearrangeList)
  open?: boolean;
  panel?: boolean; // the card is in the Expenses side panel (ExpenseSettings.tsx), which opens first
  // the setting is in the Settings window on Profile (features/settings), which opens first: on one of its
  // pages, or (true) on its list; `section` is then the row or page there ("settings:<section>")
  settings?: SettingsPage | true;
  action?: 'darkMode';
}

export const PLACES: Place[] = [
  { id: 'add', tab: 'add' },
  { id: 'expenses', tab: 'expenses' },
  { id: 'chat', tab: 'chat' },

  { id: 'homeBudget', tab: 'home', section: 'budget' },
  { id: 'homeAccounts', tab: 'home', section: 'accounts' },
  { id: 'cash', tab: 'home', section: 'accounts' }, // the Cash wallet's questions are in the balance card
  { id: 'calculator', tab: 'home', section: 'calculator', open: true },
  { id: 'debts', tab: 'home', section: 'debts', open: true },
  { id: 'funds', tab: 'home', section: 'funds', open: true },
  { id: 'samity', tab: 'home', section: 'samity', open: true },
  { id: 'runway', tab: 'home', section: 'runway' },
  { id: 'planned', tab: 'home', section: 'planned', open: true },
  { id: 'shopping', tab: 'home', section: 'shopping', open: true },
  { id: 'recent', tab: 'home', section: 'recent' },

  { id: 'pdf', tab: 'reports', section: 'export' },
  { id: 'compare', tab: 'reports', section: 'compare' },
  { id: 'analysis', tab: 'reports', section: 'analysis' },
  { id: 'needsWants', tab: 'reports', section: 'needsWants' },
  { id: 'labels', tab: 'reports', section: 'labels' },
  { id: 'byAccount', tab: 'reports', section: 'accounts' },
  { id: 'fees', tab: 'reports', section: 'fees' },
  { id: 'regret', tab: 'reports', section: 'regret' },
  { id: 'monthly', tab: 'reports', section: 'monthly' },
  { id: 'breakdown', tab: 'reports', section: 'breakdown' },

  { id: 'accounts', tab: 'profile', section: 'accounts', open: true },
  { id: 'settings', tab: 'profile', section: 'settings', open: true },
  { id: 'pin', tab: 'profile', section: 'pinPage', settings: 'pin' },
  { id: 'language', tab: 'profile', section: 'language', settings: true },
  { id: 'currency', tab: 'profile', section: 'currencyPage', settings: 'currency' },
  { id: 'monthStart', tab: 'profile', section: 'monthStartPage', settings: 'monthStart' },
  { id: 'budget', tab: 'expenses', section: 'budget', panel: true },
  { id: 'categoryBudgets', tab: 'expenses', section: 'categoryBudgets', panel: true },
  { id: 'recurring', tab: 'expenses', section: 'recurring', panel: true },
  { id: 'warranties', tab: 'expenses', section: 'warranties', panel: true },
  { id: 'reminders', tab: 'profile', section: 'reminders', open: true, settings: true },
  { id: 'widget', tab: 'profile', section: 'widgetPage', settings: 'widget' },
  { id: 'google', tab: 'profile', section: 'connectedApps', open: true, settings: true },
  { id: 'backup', tab: 'profile', section: 'backupPage', settings: 'backup' },
  { id: 'importFile', tab: 'profile', section: 'backupPage', settings: 'backup' },
  { id: 'feedback', tab: 'profile', section: 'feedback', open: true },
  { id: 'categories', tab: 'expenses', section: 'categories', panel: true },
  { id: 'categoryRules', tab: 'expenses', section: 'categoryRules', panel: true },
  { id: 'activity', tab: 'profile', section: 'notices', settings: true },

  { id: 'darkMode', tab: 'home', action: 'darkMode' },
];

/** Shown before anything is typed */
export const SUGGESTED = ['add', 'reminders', 'budget', 'accounts', 'pdf', 'funds'];

/** Lower case, accents and punctuation gone, so "Lend & borrow" and "lend borrow" match */
export function normalize(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}\p{M}]+/gu, ' ').trim();
}

export interface PlaceText {
  title: string; // in the app's language
  words: string; // search words in the app's language, and the English ones
}

/**
 * The places matching what was typed, best first. Every typed word must start a word of the title
 * or the search words. A title that starts with the text comes first, then title matches, then the rest.
 */
export function searchPlaces(query: string, places: Place[], text: (p: Place) => PlaceText): Place[] {
  const q = normalize(query);
  if (!q) return [];
  const parts = q.split(' ');
  const scored: { place: Place; score: number; order: number }[] = [];
  places.forEach((place, order) => {
    const { title, words } = text(place);
    const titleWords = normalize(title).split(' ');
    const allWords = [...titleWords, ...normalize(words).split(' ')];
    if (!parts.every(part => allWords.some(w => w.startsWith(part)))) return;
    const inTitle = parts.every(part => titleWords.some(w => w.startsWith(part)));
    const score = normalize(title).startsWith(q) ? 0 : inTitle ? 1 : 2;
    scored.push({ place, score, order });
  });
  return scored.sort((a, b) => a.score - b.score || a.order - b.order).map(s => s.place);
}

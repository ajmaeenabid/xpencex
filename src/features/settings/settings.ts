// The Settings window on Profile (chosen 2026-11-19, demo https://claude.ai/artifact/HTmbJZRSDfxHdi2vPZyAeT).
// Settings that used to be separate Profile cards now live in one full-screen window, in groups. Theme and
// Language switch right in its list; the rows below open a page holding the card they used to be.

/** The pages inside Settings that hold a card; the other rows switch in place or open their own sheet */
export const SETTINGS_PAGES = ['pin', 'currency', 'monthStart', 'backup', 'widget'] as const;
export type SettingsPage = (typeof SETTINGS_PAGES)[number];

export const OPEN_SETTINGS = 'xpences-open-settings';

// Search can ask for Settings before Profile has ever been shown, so the request waits here until the window
// is there to take it
let waiting: { page?: SettingsPage } | null = null;

/** Opens Settings, on one of its pages if given (search and the chat's "open a screen" card use this) */
export function openSettings(page?: SettingsPage) {
  waiting = { page };
  window.dispatchEvent(new Event(OPEN_SETTINGS));
}

/** The open request not yet handled, if any; taking it clears it */
export function takeSettingsRequest(): { page?: SettingsPage } | null {
  const request = waiting;
  waiting = null;
  return request;
}

/** The short line under "Settings" on Profile: "PIN lock on · English · ৳ BDT · Light" */
export function settingsSummary(
  s: { pin: boolean; lang: 'en' | 'bn'; currency: string; symbol: string; dark: boolean },
  t: (key: 'settings.pinOn' | 'settings.pinOff' | 'settings.light' | 'settings.dark') => string,
): string {
  return [
    t(s.pin ? 'settings.pinOn' : 'settings.pinOff'),
    s.lang === 'bn' ? 'বাংলা' : 'English',
    `${s.symbol} ${s.currency}`,
    t(s.dark ? 'settings.dark' : 'settings.light'),
  ].join(' · ');
}

import { describe, expect, it, vi } from 'vitest';
import { OPEN_SETTINGS, openSettings, settingsSummary, takeSettingsRequest } from './settings';

const words: Record<string, string> = { 'settings.pinOn': 'PIN lock on', 'settings.pinOff': 'No PIN', 'settings.light': 'Light', 'settings.dark': 'Dark' };
const t = (k: string) => words[k];

describe('settings summary', () => {
  it('lists PIN, language, currency and theme', () => {
    expect(settingsSummary({ pin: true, lang: 'en', currency: 'BDT', symbol: '৳', dark: false }, t)).toBe('PIN lock on · English · ৳ BDT · Light');
    expect(settingsSummary({ pin: false, lang: 'bn', currency: 'USD', symbol: '$', dark: true }, t)).toBe('No PIN · বাংলা · $ USD · Dark');
  });
});

describe('opening Settings from search', () => {
  it('keeps the request until the window takes it, once', () => {
    vi.stubGlobal('window', new EventTarget()); // the tests run without a browser
    const heard = vi.fn();
    window.addEventListener(OPEN_SETTINGS, heard);
    openSettings('backup');
    expect(heard).toHaveBeenCalledTimes(1);
    expect(takeSettingsRequest()).toEqual({ page: 'backup' });
    expect(takeSettingsRequest()).toBeNull();
    window.removeEventListener(OPEN_SETTINGS, heard);
    vi.unstubAllGlobals();
  });
});

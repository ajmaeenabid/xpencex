import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { bn as bnDates, enUS as enDates } from 'date-fns/locale';
import type { Locale } from 'date-fns';
import { en, Messages } from './en';
import { bn } from './bn';

export type Language = 'en' | 'bn';
export type TKey = keyof Messages;
export type TVars = Record<string, string | number>;
export type TFunction = (key: TKey, vars?: TVars) => string;

const DICTIONARIES: Record<Language, Messages> = { en, bn };
const STORAGE_KEY = 'xpencex-language';

/** Looks up a phrase and fills in {placeholders}. Falls back to English if a phrase is missing. */
export function translate(lang: Language, key: TKey, vars?: TVars): string {
  const template = DICTIONARIES[lang][key] ?? en[key] ?? key;
  return vars ? template.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? `{${name}}`)) : template;
}

/** English, for code that runs outside React (and for tests) */
export const tEnglish: TFunction = (key, vars) => translate('en', key, vars);

/** Built-in category names are shown translated; the stored value stays English so data never changes */
export function categoryLabel(t: TFunction, name: string): string {
  const key = `category.${name}` as TKey;
  return key in en ? t(key) : name;
}

function readSaved(): Language {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'bn' ? 'bn' : 'en';
  } catch {
    return 'en'; // storage blocked: just use English
  }
}

interface I18n {
  lang: Language;
  setLang: (lang: Language) => void;
  t: TFunction;
  /** For date-fns `format(..., { locale })`: month and day names in the chosen language */
  dateLocale: Locale;
}

const I18nContext = createContext<I18n>({
  lang: 'en',
  setLang: () => {},
  t: tEnglish,
  dateLocale: enDates,
});

/**
 * App-wide language (English or Bangla). Only words change: amounts, currency symbols and
 * digits stay exactly as they are.
 */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>(readSaved);

  const setLang = useCallback((next: Language) => {
    setLangState(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* storage blocked */ }
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const value = useMemo<I18n>(() => ({
    lang,
    setLang,
    t: (key, vars) => translate(lang, key, vars),
    dateLocale: lang === 'bn' ? bnDates : enDates,
  }), [lang, setLang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useI18n = () => useContext(I18nContext);

import { describe, expect, it } from 'vitest';
import { en } from '../../shared/i18n/en';
import { bn } from '../../shared/i18n/bn';
import { PLACES, Place, SUGGESTED, normalize, searchPlaces } from './searchPlaces';

const texts = (dict: Record<string, string>) => (p: Place) => ({
  title: dict[`search.${p.id}`],
  words: `${dict[`search.${p.id}.kw`]} ${(en as Record<string, string>)[`search.${p.id}.kw`]}`,
});
const ids = (q: string, dict: Record<string, string> = en) => searchPlaces(q, PLACES, texts(dict)).map(p => p.id);

describe('searchPlaces', () => {
  it('has a title and search words for every place, in both languages', () => {
    for (const dict of [en, bn] as Record<string, string>[]) {
      for (const p of PLACES) {
        expect(dict[`search.${p.id}`], p.id).toBeTruthy();
        expect(dict[`search.${p.id}.kw`], p.id).toBeTruthy();
      }
    }
  });

  it('suggests only real places, and ids are unique', () => {
    const all = PLACES.map(p => p.id);
    expect(new Set(all).size).toBe(all.length);
    for (const id of SUGGESTED) expect(all).toContain(id);
  });

  it('finds by the start of any word, title matches first', () => {
    expect(ids('remind')[0]).toBe('reminders');
    expect(ids('notif')).toContain('reminders');
    expect(ids('pdf')[0]).toBe('pdf');
    expect(ids('calc')[0]).toBe('calculator');
  });

  it('needs every typed word to match', () => {
    expect(ids('dark mode')).toEqual(['darkMode']);
    expect(ids('xyzzy')).toEqual([]);
    expect(ids('   ')).toEqual([]);
  });

  it('ignores case and punctuation', () => {
    expect(ids('LEND & borrow')[0]).toBe('debts');
    expect(normalize('  Lend & Borrow! ')).toBe('lend borrow');
  });

  it('finds Bangla titles, and English words in Bangla', () => {
    expect(ids('রিমাইন্ডার', bn)).toContain('reminders');
    expect(ids('bkash', bn).length).toBeGreaterThan(0);
  });
});

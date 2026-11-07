import { describe, it, expect, beforeEach } from 'vitest';
import { KeyValueStore, MAX_PIN_TRIES, awayTooLong, checkPin, cleanPin, hasPin, isPinLocked, isValidPin, lockPin, markUnlocked, removePin, savePin, triesLeft } from './pin';

const memoryStore = (): KeyValueStore & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: k => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: k => void data.delete(k),
  };
};

describe('PIN', () => {
  let store: ReturnType<typeof memoryStore>;
  beforeEach(() => {
    store = memoryStore();
    lockPin();
  });

  it('reads only six digits, including Bangla ones', () => {
    expect(cleanPin('12a3')).toBe('123');
    expect(cleanPin('১২৩৪৫৬')).toBe('123456');
    expect(cleanPin('12345678')).toBe('123456');
    expect(isValidPin('123456')).toBe(true);
    expect(isValidPin('12345')).toBe(false);
  });

  it('never saves the PIN itself', async () => {
    await savePin('u', '482913', store);
    expect([...store.data.values()].join('')).not.toContain('482913');
  });

  it('accepts the right PIN and clears wrong tries', async () => {
    await savePin('u', '482913', store);
    expect(await checkPin('u', '000000', store)).toBe('wrong');
    expect(triesLeft('u', store)).toBe(MAX_PIN_TRIES - 1);
    expect(await checkPin('u', '482913', store)).toBe('ok');
    expect(triesLeft('u', store)).toBe(MAX_PIN_TRIES);
  });

  it('removes the PIN after too many wrong tries', async () => {
    await savePin('u', '482913', store);
    for (let i = 1; i < MAX_PIN_TRIES; i++) expect(await checkPin('u', '000000', store)).toBe('wrong');
    expect(await checkPin('u', '000000', store)).toBe('blocked');
    expect(hasPin('u', store)).toBe(false);
  });

  it('keeps each account on a phone separate', async () => {
    await savePin('u', '482913', store);
    expect(hasPin('other', store)).toBe(false);
    removePin('u', store);
    expect(hasPin('u', store)).toBe(false);
  });

  it('is locked after a restart until unlocked, and not at all without a PIN', async () => {
    expect(isPinLocked('u', store)).toBe(false);
    await savePin('u', '482913', store);
    expect(isPinLocked('u', store)).toBe(false); // just set up, so no need to ask straight away
    lockPin();
    expect(isPinLocked('u', store)).toBe(true);
    markUnlocked('u');
    expect(isPinLocked('u', store)).toBe(false);
  });

  it('locks after 20 seconds in the background', () => {
    const now = 1_000_000;
    expect(awayTooLong(null, now)).toBe(false);
    expect(awayTooLong(now - 19_000, now)).toBe(false);
    expect(awayTooLong(now - 20_000, now)).toBe(true);
  });
});

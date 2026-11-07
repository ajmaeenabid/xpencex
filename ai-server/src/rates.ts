import { google, encodeFields } from './google';

type Google = ReturnType<typeof google>;

// One shared copy of exchange rates for every user, in meta/exchangeRates (apps can read, not write).
// Free source with no key that includes BDT; its terms ask for a credit, which the calculator shows.
const SOURCE_URL = 'https://open.er-api.com/v6/latest/USD';
export const RATES_MAX_AGE_DAYS = 10;

export const ratesAreStale = (updatedAt: unknown, now = Date.now()) =>
  typeof updatedAt !== 'string' || now - Date.parse(updatedAt) > RATES_MAX_AGE_DAYS * 86_400_000;

/** Downloads fresh rates when the saved ones are older than 10 days (or missing). Returns true if it updated. */
export async function refreshRates(g: Google, now = Date.now()): Promise<boolean> {
  const saved = await g.getTyped('meta', 'exchangeRates');
  if (saved && !ratesAreStale(saved.data.updatedAt, now)) return false;

  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`Rates source error ${res.status}`);
  const data = (await res.json()) as { result?: string; rates?: Record<string, number>; time_last_update_unix?: number };
  if (data.result !== 'success' || !data.rates || typeof data.rates.BDT !== 'number') throw new Error('Rates source sent an unexpected reply');

  // Keep only sensible numbers, so one bad value can't break the calculator
  const rates = Object.fromEntries(Object.entries(data.rates).filter(([code, v]) => /^[A-Z]{3}$/.test(code) && typeof v === 'number' && v > 0));
  await g.commit([{
    update: {
      name: g.docName('meta', 'exchangeRates'),
      fields: encodeFields({
        base: 'USD',
        rates,
        updatedAt: new Date(now).toISOString(),
        sourceUpdatedAt: data.time_last_update_unix ? new Date(data.time_last_update_unix * 1000).toISOString() : new Date(now).toISOString(),
        source: 'open.er-api.com',
      }),
    },
  }]);
  return true;
}

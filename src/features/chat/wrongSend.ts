// Help after sending money to the wrong number: each provider's helpline and contacts.
//
// SOURCE: typed in from a search-results summary the user provided on 8 Nov 2026, NOT read from the
// providers' own pages (their sites refused automated reading). Confirm every number in each provider's
// own app (Help or Contact) before a public launch, then update CHECKED_ON.

export type WrongSendProvider = 'bkash' | 'nagad' | 'rocket';

export const CHECKED_ON = '2026-11-08';

export const WRONG_SEND: Record<WrongSendProvider, { name: string; helplines: string[]; ussd: string; email: string }> = {
  bkash: { name: 'bKash', helplines: ['16247', '02-55663001'], ussd: '*247#', email: 'support@bkash.com' },
  nagad: { name: 'Nagad', helplines: ['16167', '096 096 16167'], ussd: '*167#', email: 'info@nagad.com.bd' },
  rocket: { name: 'Rocket', helplines: ['16216', '09666716216'], ussd: '*322#', email: 'rocket@dutchbanglabank.com' },
};

/** Which provider a Send Money expense came from, by the title the SMS reader gave it */
export function wrongSendProvider(title: string): WrongSendProvider | null {
  if (!/send\s*money/i.test(title)) return null;
  const t = title.toLowerCase();
  if (t.startsWith('bkash')) return 'bkash';
  if (t.startsWith('nagad')) return 'nagad';
  if (t.startsWith('rocket')) return 'rocket';
  return null;
}

/** A number as a tel: link (digits only; '+' kept) */
export const telLink = (number: string) => `tel:${number.replace(/[^\d+]/g, '')}`;

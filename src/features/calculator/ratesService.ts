import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../shared/firebase';
import { callWorker } from '../../shared/lib/workerApi';
import { ratesAreStale } from '../../../ai-server/src/rates';

export interface ExchangeRates {
  rates: Record<string, number>; // units per 1 USD
  updatedAt: string;
  sourceUpdatedAt: string;
}

let refreshAsked = false; // ask the server at most once per session

/**
 * The shared exchange rates (meta/exchangeRates), kept live and available offline. The server
 * refreshes them every 10 days; if they are missing or older, this asks it to do so now.
 */
export function useExchangeRates(enabled: boolean) {
  const [rates, setRates] = useState<ExchangeRates | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    return onSnapshot(
      doc(db, 'meta', 'exchangeRates'),
      snap => {
        const data = snap.data() as ExchangeRates | undefined;
        if (data?.rates) setRates(data);
        if (!refreshAsked && ratesAreStale(data?.updatedAt)) {
          refreshAsked = true;
          callWorker('/rates/refresh').catch(err => {
            console.error('Rate refresh failed:', err);
            if (!data?.rates) setFailed(true);
          });
        }
      },
      err => { console.error('Error loading exchange rates:', err); setFailed(true); },
    );
  }, [enabled]);

  return { rates, failed: failed && !rates };
}

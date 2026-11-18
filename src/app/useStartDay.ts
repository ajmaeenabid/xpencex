import { useAuth } from './App';
import { cleanStartDay } from '../shared/lib/moneyMonth';

/** The day the person's money month starts (Profile > Month starts on), 1 when not set. See shared/lib/moneyMonth.ts */
export function useStartDay(): number {
  return cleanStartDay(useAuth().profile?.monthStart);
}

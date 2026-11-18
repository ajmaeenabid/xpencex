import { describe, expect, it } from 'vitest';
import { LIVE_ACTION_RULES, liveAction } from './useLiveChat';
import type { AgentData } from './agent/actions';
import type { Account } from '../../shared/types';

const accounts = [
  { id: 'a1', uid: 'u', type: 'bkash', name: 'bKash', label: '123', balance: 0 },
  { id: 'a2', uid: 'u', type: 'cash', name: 'Cash', label: 'Wallet', balance: 0 },
] as Account[];
const data: AgentData = { accounts, expenses: [], incomes: [], categories: ['Food'] };

describe('live chat actions', () => {
  it('reads the action from JSON text or an object, with the same checks as typed chat', () => {
    expect(liveAction({ action: '{"kind":"transfer","from":"A1","to":"A2","amount":500}' }, data))
      .toEqual({ kind: 'transfer', fromId: 'a1', toId: 'a2', amount: 500 });
    expect(liveAction({ action: { kind: 'open', screen: 'funds' } }, data)).toEqual({ kind: 'open', place: 'funds' });
    expect(liveAction({ action: '{"kind":"open","screen":"pin"}' }, data)).toBeNull();
    expect(liveAction({ action: 'not json' }, data)).toBeNull();
    expect(liveAction({}, data)).toBeNull();
  });

  it('never lets a spoken yes confirm, and fits well inside the server limit (40,000 characters)', () => {
    expect(LIVE_ACTION_RULES).toContain('only the tap saves');
    expect(LIVE_ACTION_RULES.length).toBeLessThan(20_000);
  });
});

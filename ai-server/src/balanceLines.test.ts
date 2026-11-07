import { describe, it, expect } from 'vitest';
import { BALANCE_REASONS, balanceCheck, planChange, planSet } from './balanceLines';

const now = Date.UTC(2026, 10, 8, 10, 0);

/** Applies a plan the way Firestore would, to the account's two numbers */
function apply(account: { balance: number; historySum?: number }, delta: number | null, plan: ReturnType<typeof planChange>, setTo?: number) {
  const balance = setTo !== undefined ? setTo : account.balance + (delta ?? 0);
  const historySum = 'set' in plan.historySum ? plan.historySum.set : (account.historySum ?? 0) + plan.historySum.add;
  return { balance, historySum };
}

describe('balance history', () => {
  it('starts history with the current balance on the first change', () => {
    const plan = planChange({ balance: 1000 }, -250, 'expense', 'Lunch', now);
    expect(plan.lines).toEqual([
      { kind: 'set', amount: 1000, reason: 'start', at: '2026-11-08T10:00:00.000Z' },
      { kind: 'change', amount: -250, reason: 'expense', title: 'Lunch', at: '2026-11-08T10:00:00.000Z' },
    ]);
    expect(plan.historySum).toEqual({ set: 750 });
  });

  it('adds to the history total once history exists', () => {
    expect(planChange({ balance: 750, historySum: 750 }, 500, 'moneyIn', undefined, now)).toEqual({
      lines: [{ kind: 'change', amount: 500, reason: 'moneyIn', at: '2026-11-08T10:00:00.000Z' }],
      historySum: { add: 500 },
    });
  });

  it('records a hand correction with the old balance', () => {
    expect(planSet({ balance: 980 }, 1000, 'corrected', now)).toEqual({
      lines: [{ kind: 'set', amount: 1000, reason: 'corrected', previous: 980, at: '2026-11-08T10:00:00.000Z' }],
      historySum: { set: 1000 },
    });
  });

  it('adds up after a run of changes, including the first one', () => {
    let account: { balance: number; historySum?: number } = { balance: 5000 };
    for (const delta of [-120.5, -80.25, 3000, -0.1, -0.2]) {
      const plan = planChange(account, delta, 'expense', undefined, now);
      account = apply(account, delta, plan);
    }
    expect(balanceCheck(account)).toEqual({ ok: true, difference: 0 });
  });

  it('notices a change made without a history line', () => {
    const account = { balance: 900, historySum: 1000 };
    expect(balanceCheck(account)).toEqual({ ok: false, difference: -100 });
  });

  it("has nothing to check before history starts", () => {
    expect(balanceCheck({ balance: 100 })).toBeNull();
  });

  it('keeps titles short and drops empty ones', () => {
    expect(planChange({ balance: 0, historySum: 0 }, 1, 'expense', 'x'.repeat(150)).lines[0].title).toHaveLength(100);
    expect(planChange({ balance: 0, historySum: 0 }, 1, 'expense', '   ').lines[0]).not.toHaveProperty('title');
  });
});

describe('balance history and firestore.rules', () => {
  it('allow exactly the same reasons', async () => {
    const fsModule = 'node:fs'; // kept in a variable: the server's own type check has no Node types
    const { readFileSync } = (await import(/* @vite-ignore */ fsModule)) as { readFileSync: (path: string, enc: string) => string };
    let rules = '';
    for (const path of ['firestore.rules', '../firestore.rules']) {
      try { rules = readFileSync(path, 'utf8'); break; } catch { /* try the next place */ }
    }
    const block = rules.slice(rules.indexOf('function isValidBalanceLine'));
    const list = block.match(/data\.reason in \[([^\]]*)\]/)?.[1] ?? '';
    const inRules = [...list.matchAll(/'([A-Za-z]+)'/g)].map((m) => m[1]).sort();
    expect(inRules).toEqual([...BALANCE_REASONS].sort());
  });
});

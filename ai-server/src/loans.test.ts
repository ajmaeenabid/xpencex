import { describe, it, expect } from 'vitest';
import { duePages, LOAN_PAGE } from './loans';
import type { TypedDoc } from './google';

// A pretend Firestore that holds `count` due loans and answers the paged queries
function fakeLoans(count: number) {
  const loans: TypedDoc[] = Array.from({ length: count }, (_, i) => ({
    name: `loans/${String(i).padStart(5, '0')}`,
    id: String(i),
    updateTime: '',
    data: { nextDueDate: '2026-11-01T00:00:00.000Z', status: 'active' },
  }));
  const queries: Record<string, unknown>[] = [];
  const g = {
    async query(q: Record<string, unknown>) {
      queries.push(q);
      const start = q.startAt as { values: { referenceValue?: string }[] } | undefined;
      const afterName = start?.values.find((v) => v.referenceValue)?.referenceValue;
      const from = afterName ? loans.findIndex((l) => l.name === afterName) + 1 : 0;
      return loans.slice(from, from + (q.limit as number));
    },
  };
  return { g: g as never, queries };
}

const collect = async (count: number) => {
  const { g, queries } = fakeLoans(count);
  const seen: string[] = [];
  for await (const page of duePages(g, undefined, Date.UTC(2026, 10, 8))) seen.push(...page.map((l) => l.id));
  return { seen, queries };
};

describe('loan job pages', () => {
  it('reads every due loan once, even past 500', async () => {
    const { seen, queries } = await collect(1234);
    expect(seen).toHaveLength(1234);
    expect(new Set(seen).size).toBe(1234);
    expect(queries).toHaveLength(3);
  });

  it('asks once more when the last page is exactly full, then stops', async () => {
    const { seen, queries } = await collect(LOAN_PAGE * 2);
    expect(seen).toHaveLength(LOAN_PAGE * 2);
    expect(queries).toHaveLength(3);
  });

  it('starts each page after the last loan of the one before', async () => {
    const { queries } = await collect(LOAN_PAGE + 1);
    expect(queries[0].startAt).toBeUndefined();
    expect(queries[1].startAt).toEqual({ values: [{ stringValue: '2026-11-01T00:00:00.000Z' }, { referenceValue: 'loans/00499' }], before: false });
  });

  it('needs one query for a small number of loans', async () => {
    expect((await collect(3)).queries).toHaveLength(1);
  });
});

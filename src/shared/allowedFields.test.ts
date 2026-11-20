import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ALLOWED_FIELDS, keepAllowedFields } from './allowedFields';

const rules = readFileSync('firestore.rules', 'utf8');

/** The list a rules function such as expenseFields() returns */
function rulesList(name: string) {
  const body = rules.match(new RegExp(`function ${name}\\(\\) \\{\\s*return \\[([^\\]]*)\\]`))?.[1];
  if (!body) throw new Error(`${name}() is missing from firestore.rules`);
  return [...body.matchAll(/'(\w+)'/g)].map(m => m[1]);
}

const RULES_FUNCTION: Record<keyof typeof ALLOWED_FIELDS, string> = {
  expenses: 'expenseFields', accounts: 'accountFields', deposits: 'depositFields', incomeRules: 'incomeRuleFields',
  recurring: 'recurringFields', categories: 'categoryFields', incomeCategories: 'categoryFields', chats: 'chatFields',
  loans: 'loanFields',
};

describe('allowed fields', () => {
  it('match the lists in firestore.rules', () => {
    for (const [collection, fn] of Object.entries(RULES_FUNCTION)) {
      expect([...ALLOWED_FIELDS[collection as keyof typeof ALLOWED_FIELDS]].sort(), collection).toEqual(rulesList(fn).sort());
    }
  });

  it('are used by the create rule of each collection', () => {
    for (const [collection, fn] of Object.entries(RULES_FUNCTION)) {
      const block = rules.match(new RegExp(`match /${collection}/\\{\\w+\\} \\{([\\s\\S]*?)\\n    \\}`))?.[1] || '';
      expect(block, collection).toContain(`onlyFields(${fn}())`);
    }
  });

  it('drop fields the app no longer uses, and leave other kinds alone', () => {
    expect(keepAllowedFields('categories', { uid: 'a', name: 'Food', oldThing: 1 })).toEqual({ uid: 'a', name: 'Food' });
    expect(keepAllowedFields('funds', { uid: 'a', anything: 1 })).toEqual({ uid: 'a', anything: 1 });
  });
});

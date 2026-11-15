import { describe, expect, it, vi } from 'vitest';

vi.mock('../../shared/firebase', () => ({ auth: {} }));

import { parseReply } from './aiService';

describe('parseReply', () => {
  it('keeps an income whose title came back empty (Groq gpt-oss-120b did this)', () => {
    const result = parseReply('{"language":"en","type":"income","content":"Recorded.","expense":{"title":"","amount":30000,"category":"Other","date":"2026-11-15"}}');
    expect(result.type).toBe('income');
    expect(result.expense).toMatchObject({ title: 'Money received', amount: 30000 });
  });

  it('keeps the title the model gave', () => {
    const result = parseReply('{"type":"income","content":"","expense":{"title":"Salary","amount":30000}}');
    expect(result.expense?.title).toBe('Salary');
  });
});

import { describe, expect, it } from 'vitest';
import { activityLimit, activityView, newItems } from './activity';

describe('new items in the last hour', () => {
  it('has nothing to compare with on the very first count', () => {
    expect(newItems(null, { expenses: 10 })).toBeNull();
  });

  it('adds up what grew and names the busiest kinds', () => {
    const result = newItems(
      { expenses: 100, chats: 10, funds: 2, debts: 5, reminders: 1 },
      { expenses: 3100, chats: 12, funds: 2, debts: 9, reminders: 2 },
    );
    expect(result).toEqual({
      added: 3007,
      busiest: [{ kind: 'expenses', count: 3000 }, { kind: 'debts', count: 4 }, { kind: 'chats', count: 2 }],
    });
  });

  it("doesn't let deletes in one kind hide new items in another", () => {
    expect(newItems({ expenses: 500, chats: 50 }, { expenses: 100, chats: 1550 })?.added).toBe(1500);
  });

  it('treats a kind seen for the first time as unchanged', () => {
    expect(newItems({ expenses: 5 }, { expenses: 5, planned: 40 })?.added).toBe(0);
  });
});

describe('activity view', () => {
  it('turns red only above the limit', () => {
    const data = { activityAt: '2026-11-20T10:00:00.000Z', activityAdded: 1001, activityBusiest: [{ kind: 'expenses', count: 1001 }] };
    expect(activityView(data, 1000)).toEqual({
      at: '2026-11-20T10:00:00.000Z', added: 1001, busiest: [{ kind: 'expenses', count: 1001 }], limit: 1000, over: true,
    });
    expect(activityView({ ...data, activityAdded: 1000 }, 1000).over).toBe(false);
  });

  it('copes with nothing counted yet or odd stored values', () => {
    expect(activityView(null, 1000)).toEqual({ at: null, added: null, busiest: [], limit: 1000, over: false });
    expect(activityView({ activityAdded: 'lots', activityBusiest: [5, { kind: 'x' }] }, 1000)).toMatchObject({ added: null, busiest: [] });
  });

  it('uses 1,000 an hour unless wrangler.toml says otherwise', () => {
    expect(activityLimit({})).toBe(1000);
    expect(activityLimit({ ACTIVITY_ALERT_PER_HOUR: '250' })).toBe(250);
  });
});

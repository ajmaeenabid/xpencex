import { describe, it, expect } from 'vitest';
import { addHistory, isWorthKeeping } from './history';

const entry = (n: number) => ({ expr: `${n}+1`, result: String(n + 1) });

describe('addHistory', () => {
  it('puts the newest first', () => {
    expect(addHistory([entry(1)], entry(2))[0]).toEqual(entry(2));
  });
  it('does not repeat the same sum twice in a row', () => {
    expect(addHistory([entry(1)], entry(1))).toHaveLength(1);
    expect(addHistory([entry(2), entry(1)], entry(1))).toHaveLength(3);
  });
  it('keeps the latest 20', () => {
    let list = [entry(0)];
    for (let i = 1; i <= 30; i++) list = addHistory(list, entry(i));
    expect(list).toHaveLength(20);
    expect(list[0]).toEqual(entry(30));
    expect(list[19]).toEqual(entry(11));
  });
});

describe('isWorthKeeping', () => {
  it('keeps real sums, not a number on its own', () => {
    expect(isWorthKeeping('5+5')).toBe(true);
    expect(isWorthKeeping('sin(30)')).toBe(true);
    expect(isWorthKeeping('5!')).toBe(true);
    expect(isWorthKeeping('200')).toBe(false);
    expect(isWorthKeeping('−3.5')).toBe(false);
    expect(isWorthKeeping('')).toBe(false);
  });
});

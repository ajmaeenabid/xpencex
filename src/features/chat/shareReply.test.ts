import { describe, it, expect } from 'vitest';
import { columnWidths, hasTable, markdownToPlain, parseBlocks, parseInline, wrapRuns } from './shareReply';

const reply = `Your food costs came to ৳1000.

## This month

- **Lunch:** the biggest part
- Dinner

| Item | Cost |
| --- | --- |
| Lunch | ৳300 |
| **Total** | **৳1000** |

Try cooking at home.`;

describe('parseBlocks', () => {
  it('finds each kind of block in order', () => {
    expect(parseBlocks(reply).map(b => b.kind)).toEqual(['paragraph', 'heading', 'bullet', 'bullet', 'table', 'paragraph']);
  });
  it('reads a table into rows and cells, leaving out the divider', () => {
    const table = parseBlocks(reply).find(b => b.kind === 'table');
    if (table?.kind !== 'table') throw new Error('no table');
    expect(table.rows).toHaveLength(3);
    expect(table.rows[1].map(c => c[0].text)).toEqual(['Lunch', '৳300']);
    expect(table.rows[2][0][0]).toEqual({ text: 'Total', bold: true });
  });
  it('does not mistake a line with a bar for a table', () => {
    expect(hasTable('Food | drinks are high this week')).toBe(false);
    expect(hasTable(reply)).toBe(true);
  });
  it('reads a table written without outer bars', () => {
    expect(hasTable('Item | Cost\n--- | ---\nTea | 20')).toBe(true);
  });
  it('reads Bangla text', () => {
    const [block] = parseBlocks('আপনার **মোট** খরচ');
    if (block.kind !== 'paragraph') throw new Error('not a paragraph');
    expect(block.runs).toEqual([{ text: 'আপনার ', bold: false }, { text: 'মোট', bold: true }, { text: ' খরচ', bold: false }]);
  });
});

describe('parseInline', () => {
  it('keeps the words of links and code, without their marks', () => {
    expect(parseInline('see [the guide](http://x.y) and `code`')).toEqual([{ text: 'see the guide and code', bold: false }]);
  });
});

describe('markdownToPlain', () => {
  it('removes marks and keeps lists together', () => {
    expect(markdownToPlain('## Plan\n\n- **Day 1:** beach\n- Day 2\n\nEnjoy!')).toBe('Plan\n\n• Day 1: beach\n• Day 2\n\nEnjoy!');
  });
});

describe('wrapRuns', () => {
  const measure = (text: string) => text.length * 10;
  it('breaks lines between words', () => {
    const lines = wrapRuns([{ text: 'aaa bbb ccc', bold: false }], 80, measure);
    expect(lines.map(l => l.map(r => r.text).join(''))).toEqual(['aaa bbb ', 'ccc']);
  });
  it('gives a very long word its own line instead of losing it', () => {
    const lines = wrapRuns([{ text: 'a verylongwordindeed b', bold: false }], 50, measure);
    expect(lines.map(l => l.map(r => r.text).join('').trim())).toEqual(['a', 'verylongwordindeed', 'b']);
  });
  it('keeps bold pieces bold across a line break', () => {
    const lines = wrapRuns([{ text: 'aaa ', bold: false }, { text: 'bbb', bold: true }], 40, measure);
    expect(lines[1][0]).toEqual({ text: 'bbb', bold: true });
  });
  it('handles empty text', () => {
    expect(wrapRuns([], 100, measure)).toEqual([[]]);
  });
});

describe('columnWidths', () => {
  const sum = (list: number[]) => list.reduce((a, b) => a + b, 0);
  it('shares out spare room', () => {
    expect(columnWidths([100, 100], 400, 50)).toEqual([200, 200]);
  });
  it('always fills the width exactly, even when squeezed', () => {
    expect(sum(columnWidths([900, 300, 300], 600, 90))).toBeCloseTo(600);
  });
  it('keeps a narrow column readable next to a very wide one', () => {
    const [, narrow] = columnWidths([5000, 20], 600, 90);
    expect(narrow).toBeGreaterThan(60);
  });
});

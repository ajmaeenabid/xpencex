import { describe, it, expect } from 'vitest';
import { restoreLineBreaks } from './markdownRepair';

describe('restoreLineBreaks', () => {
  it('rebuilds a table that arrived on one line (real reply from the app)', () => {
    const raw =
      "Here is your weekly spending report for the current week.This week, you've spent a total of 419.97 BDT across Food and Transport.Here's a breakdown of your recent expenses:" +
      '| Date | Title | Category | Amount (BDT) ||---|---|---|---|| 2026-10-24 | food | Food | 200.00 || 2026-10-24 | bus | Transport | 19.97 || **Total** | | | **419.97** |' +
      "You've spent 419.97 BDT so far this week.";
    const lines = restoreLineBreaks(raw).split('\n');

    expect(lines).toContain('| Date | Title | Category | Amount (BDT) |');
    expect(lines).toContain('|---|---|---|---|');
    expect(lines).toContain('| 2026-10-24 | bus | Transport | 19.97 |');
    expect(lines).toContain('| **Total** | | | **419.97** |');
    expect(lines).toContain("You've spent 419.97 BDT so far this week.");
    expect(lines).toContain('Here is your weekly spending report for the current week.');
    // A blank line before the table so Markdown recognises it
    const header = lines.indexOf('| Date | Title | Category | Amount (BDT) |');
    expect(lines[header - 1]).toBe('');
  });

  it('puts glued list items and headings on their own lines', () => {
    const raw = 'Here is your plan for the trip, with every day covered in detail below.#### Day 1 Arrive and rest.- **Hotel:** 1,500 BDT.- **Food:** 600 BDT.';
    const out = restoreLineBreaks(raw);
    expect(out).toContain('\n\n#### Day 1');
    expect(out).toContain('\n- **Hotel:** 1,500 BDT.');
    expect(out).toContain('\n- **Food:** 600 BDT.');
  });

  it('leaves answers that already have line breaks alone', () => {
    const ok = 'Summary line.\n\n| A | B |\n|---|---|\n| 1 | 2 |';
    expect(restoreLineBreaks(ok)).toBe(ok);
  });

  it('does not split numbers like 419.97', () => {
    const raw = 'You spent 419.97 BDT this week and 1,250.50 BDT last week, which is a nice drop overall for you.';
    expect(restoreLineBreaks(raw)).toBe(raw);
  });
});

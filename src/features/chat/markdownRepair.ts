/**
 * Sometimes the AI sends its whole answer on one line, which breaks tables and lists:
 * "...expenses:| Date | Title ||---|---|| 2026-10-24 | food |...". When a long answer has no
 * line breaks at all, this puts them back so the Markdown (tables, lists, headings) renders properly.
 * Answers that already contain line breaks are returned untouched.
 */
export function restoreLineBreaks(text: string): string {
  if (text.includes('\n') || text.length < 120) return text;

  let s = text;

  // Table rows: "||" is where one row ends and the next begins
  s = s.replace(/\|\|/g, '|\n|');

  // Headings and list items that were glued onto the previous sentence
  s = s.replace(/([^\n#])\s*(#{1,4} )/g, '$1\n\n$2');
  s = s.replace(/([.!?:)])\s*([-*] \*\*)/g, '$1\n$2');
  s = s.replace(/([.!?:)])\s*(\d+\. \*\*)/g, '$1\n$2');

  const lines = s.split('\n').flatMap(line => {
    const trimmed = line.trim();
    if (!trimmed.includes('|')) return [line];

    const out: string[] = [];
    let row = trimmed;

    // Text before the first row of a table, e.g. "Here's a breakdown:| Date | Title |"
    const firstBar = row.indexOf('|');
    if (firstBar > 0) {
      out.push(row.slice(0, firstBar).trim(), '');
      row = row.slice(firstBar);
    }
    // Text after the last row, e.g. "| Total | 419.97 |You've spent..."
    const lastBar = row.lastIndexOf('|');
    const after = row.slice(lastBar + 1).trim();
    if (after) {
      out.push(row.slice(0, lastBar + 1), '', after);
    } else {
      out.push(row);
    }
    return out;
  });
  s = lines.join('\n');

  // Sentences glued together without a space ("week.This week") become separate paragraphs,
  // outside tables only
  s = s
    .split('\n')
    .map(line => (line.trim().startsWith('|') ? line : line.replace(/([a-z)][.!?])(?=[A-Z][a-z])/g, '$1\n\n')))
    .join('\n');

  return s.replace(/\n{3,}/g, '\n\n').trim();
}

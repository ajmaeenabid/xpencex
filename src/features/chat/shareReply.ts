import { copyText } from '../../shared/lib/clipboard';

export { copyText };

// Copying and sharing an AI reply. A table can't survive as plain text in other apps,
// so a reply with a table is drawn as a picture, which keeps it looking like a table.

export type Run = { text: string; bold: boolean };
export type Block =
  | { kind: 'heading'; runs: Run[] }
  | { kind: 'paragraph'; runs: Run[] }
  | { kind: 'bullet'; runs: Run[] }
  | { kind: 'table'; rows: Run[][][] };

const TABLE_DIVIDER = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const isTableRow = (line: string) => line.includes('|');

const cellsOf = (line: string) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());

/** Tidies links and code marks, and splits text into plain and **bold** pieces */
export function parseInline(text: string): Run[] {
  const clean = text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]*)`/g, '$1');
  const runs = clean.split('**').map((piece, i) => ({ text: piece, bold: i % 2 === 1 }));
  return runs.filter(r => r.text);
}

export function parseBlocks(markdown: string): Block[] {
  const lines = markdown.split(/\r?\n/);
  const blocks: Block[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    if (isTableRow(line) && i + 1 < lines.length && TABLE_DIVIDER.test(lines[i + 1])) {
      const rows = [cellsOf(line)];
      i += 2;
      while (i < lines.length && lines[i].trim() && isTableRow(lines[i])) rows.push(cellsOf(lines[i++]));
      i--;
      blocks.push({ kind: 'table', rows: rows.map(row => row.map(parseInline)) });
      continue;
    }
    const heading = line.match(/^\s*#{1,6}\s+(.*)$/);
    if (heading) { blocks.push({ kind: 'heading', runs: parseInline(heading[1]) }); continue; }
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    if (bullet) { blocks.push({ kind: 'bullet', runs: parseInline(bullet[1]) }); continue; }
    blocks.push({ kind: 'paragraph', runs: parseInline(line.trim()) });
  }
  return blocks;
}

export const hasTable = (markdown: string) => parseBlocks(markdown).some(b => b.kind === 'table');

/** Readable text with the Markdown marks removed, for sharing a reply that has no table */
export function markdownToPlain(markdown: string): string {
  const text = (runs: Run[]) => runs.map(r => r.text).join('');
  return parseBlocks(markdown).map(block => {
    if (block.kind === 'bullet') return `• ${text(block.runs)}`;
    if (block.kind === 'table') return block.rows.map(row => row.map(text).join(' | ')).join('\n');
    return text(block.runs);
  }).join('\n\n').replace(/(• [^\n]*)\n\n(?=• )/g, '$1\n');
}

type Measure = (text: string, bold: boolean) => number;

/** Breaks text into lines that fit a width. A single word wider than the line gets its own line. */
export function wrapRuns(runs: Run[], width: number, measure: Measure): Run[][] {
  const lines: Run[][] = [];
  let line: Run[] = [];
  let used = 0;
  for (const run of runs) {
    for (const word of run.text.split(/(?<=\s)/)) {
      const wide = measure(word, run.bold);
      const wideWithoutSpace = measure(word.trimEnd(), run.bold);
      if (line.length && used + wideWithoutSpace > width) {
        lines.push(line);
        line = [];
        used = 0;
      }
      line.push({ text: word, bold: run.bold });
      used += wide;
    }
  }
  if (line.length) lines.push(line);
  return lines.length ? lines : [[]];
}

/** Each column's width: what it needs when that fits, otherwise a fair share with a sensible minimum */
export function columnWidths(needed: number[], available: number, minimum: number): number[] {
  const total = needed.reduce((sum, n) => sum + n, 0);
  if (total <= available) {
    const spare = (available - total) / needed.length;
    return needed.map(n => n + spare);
  }
  const floored = needed.map(n => Math.max(minimum, (n / total) * available));
  const scale = available / floored.reduce((sum, n) => sum + n, 0);
  return floored.map(n => n * scale);
}

// The same colours as the app (src/app/index.css). A picture has to read well wherever it's sent,
// so it stays light even when someone is using night mode.
const COLOURS = { page: '#FFF9F4', text: '#2B1A12', accent: '#E8602B', line: '#E8D5C6', head: '#FFF4EC' };
const PAGE_WIDTH = 720;
const MARGIN = 32;
const FONT_SIZE = 22;
const LINE_HEIGHT = 32;
const CELL_PADDING = 12;
const MAX_PIXELS_TALL = 16000; // browsers refuse much taller pictures

/** Lays the reply out, and paints it when a canvas is given. Returns the height it takes. */
function layOut(blocks: Block[], ctx: CanvasRenderingContext2D, family: string, paint: boolean): number {
  const fontFor = (bold: boolean, size = FONT_SIZE) => `${bold ? 700 : 400} ${size}px ${family}`;
  const measure: Measure = (text, bold) => {
    ctx.font = fontFor(bold);
    return ctx.measureText(text).width;
  };
  const drawLine = (runs: Run[], x: number, y: number, colour = COLOURS.text) => {
    if (!paint) return;
    let at = x;
    ctx.fillStyle = colour;
    for (const run of runs) {
      ctx.font = fontFor(run.bold);
      ctx.fillText(run.text, at, y);
      at += ctx.measureText(run.text).width;
    }
  };
  const contentWidth = PAGE_WIDTH - MARGIN * 2;
  let y = MARGIN;

  for (const block of blocks) {
    if (block.kind === 'table') {
      const columns = Math.max(...block.rows.map(r => r.length));
      const textOf = (cell: Run[] | undefined) => cell ?? [];
      const needed = Array.from({ length: columns }, (_, c) =>
        Math.max(...block.rows.map(r => textOf(r[c]).reduce((sum, run) => sum + measure(run.text, c === -1 || run.bold), 0))) + CELL_PADDING * 2);
      // The header row is bold, so it needs a little more room
      block.rows[0].forEach((cell, c) => {
        const wide = cell.reduce((sum, run) => sum + measure(run.text, true), 0) + CELL_PADDING * 2;
        needed[c] = Math.max(needed[c], wide);
      });
      const widths = columnWidths(needed, contentWidth, 90);
      const top = y;
      block.rows.forEach((row, r) => {
        const cells = widths.map((width, c) => {
          const runs = textOf(row[c]).map(run => (r === 0 ? { ...run, bold: true } : run));
          return wrapRuns(runs, width - CELL_PADDING * 2, measure);
        });
        const height = Math.max(...cells.map(lines => lines.length)) * LINE_HEIGHT + CELL_PADDING * 2 - 4;
        if (paint) {
          if (r === 0) {
            ctx.fillStyle = COLOURS.head;
            ctx.fillRect(MARGIN, y, contentWidth, height);
          }
          ctx.strokeStyle = COLOURS.line;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(MARGIN, y);
          ctx.lineTo(MARGIN + contentWidth, y);
          ctx.stroke();
        }
        let x = MARGIN;
        cells.forEach((lines, c) => {
          lines.forEach((line, l) => drawLine(line, x + CELL_PADDING, y + CELL_PADDING + LINE_HEIGHT * l + FONT_SIZE - 2));
          x += widths[c];
        });
        y += height;
      });
      if (paint) {
        ctx.strokeStyle = COLOURS.line;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(MARGIN, top, contentWidth, y - top);
        let x = MARGIN;
        widths.slice(0, -1).forEach(width => {
          x += width;
          ctx.beginPath();
          ctx.moveTo(x, top);
          ctx.lineTo(x, y);
          ctx.stroke();
        });
      }
      y += 20;
      continue;
    }

    const indent = block.kind === 'bullet' ? 26 : 0;
    const runs = block.kind === 'heading' ? block.runs.map(run => ({ ...run, bold: true })) : block.runs;
    const lines = wrapRuns(runs, contentWidth - indent, measure);
    if (block.kind === 'bullet' && paint) {
      ctx.fillStyle = COLOURS.accent;
      ctx.beginPath();
      ctx.arc(MARGIN + 8, y + FONT_SIZE - 9, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    lines.forEach((line, l) => {
      drawLine(line, MARGIN + indent, y + LINE_HEIGHT * l + FONT_SIZE, block.kind === 'heading' ? COLOURS.accent : COLOURS.text);
    });
    y += lines.length * LINE_HEIGHT + (block.kind === 'bullet' ? 8 : 16);
  }
  return y + MARGIN - 16;
}

/** The reply as a picture */
async function replyPicture(markdown: string): Promise<File> {
  const family = getComputedStyle(document.body).fontFamily || 'sans-serif';
  // A browser only loads a font once it's used, and bold may not be yet. Without this, the picture
  // comes out in the regular font. Passing the text also loads the Bangla font when it's needed.
  await Promise.all([400, 700].map(weight =>
    document.fonts?.load(`${weight} ${FONT_SIZE}px ${family}`, markdown).catch(() => [])));
  const blocks = parseBlocks(markdown);
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('No canvas');
  const height = layOut(blocks, context, family, false);
  const scale = height * 2 > MAX_PIXELS_TALL ? 1 : 2;
  canvas.width = PAGE_WIDTH * scale;
  canvas.height = Math.min(MAX_PIXELS_TALL, Math.ceil(height * scale));
  context.scale(scale, scale);
  context.fillStyle = COLOURS.page;
  context.fillRect(0, 0, PAGE_WIDTH, height);
  context.textBaseline = 'alphabetic';
  layOut(blocks, context, family, true);
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('No picture');
  return new File([blob], 'xpences-reply.png', { type: 'image/png' });
}

function savePicture(file: File) {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export type ShareOutcome = 'shared' | 'cancelled' | 'saved' | 'copied' | 'failed';

const wasCancelled = (err: unknown) => err instanceof Error && err.name === 'AbortError';

/** Opens the phone's share sheet. Where that isn't available, saves the picture or copies the text. */
export async function shareReply(markdown: string): Promise<ShareOutcome> {
  try {
    if (hasTable(markdown)) {
      const file = await replyPicture(markdown);
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
        return 'shared';
      }
      savePicture(file);
      return 'saved';
    }
    const text = markdownToPlain(markdown);
    if (navigator.share) {
      await navigator.share({ text });
      return 'shared';
    }
    return (await copyText(text)) ? 'copied' : 'failed';
  } catch (err) {
    if (wasCancelled(err)) return 'cancelled';
    console.error('Could not share the reply', err);
    return 'failed';
  }
}

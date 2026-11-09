import { format } from 'date-fns';
import { Expense } from '../../shared/types';
import { sumByCategory } from '../home/insights';
import { isNative, shareFile } from '../../shared/lib/nativeApp';

function csvCell(value: unknown): string {
  const s = String(value ?? '');
  // Quote anything with separators/quotes, and neutralise spreadsheet formula injection
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCSV(expenses: Expense[], currency: string): string {
  const header = ['Date', 'Title', 'Category', `Amount (${currency})`, 'Paid From', 'Notes'];
  const rows = expenses.map(e => [format(new Date(e.date), 'yyyy-MM-dd'), e.title, e.category, e.amount.toFixed(2), e.accountName || '', e.notes || '']);
  return [header, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n');
}

export function downloadFile(filename: string, content: string, mime: string) {
  // The phone app can't download; it shares the file instead (save to Files, Drive, WhatsApp...)
  if (isNative()) {
    shareFile(filename, '﻿' + content, filename).catch(err => console.error('Could not share the file:', err));
    return;
  }
  // BOM so Excel opens UTF-8 (e.g. ৳) correctly
  const blob = new Blob(['﻿' + content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export function buildReportHtml(opts: {
  title: string;
  expenses: Expense[];
  symbol: string;
  name?: string;
  budget?: number;
}): string {
  const { title, expenses, symbol, name, budget } = opts;
  const money = (n: number) => `${symbol}${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const byCat = Object.entries(sumByCategory(expenses)).sort((a, b) => b[1] - a[1]);

  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,600;1,600&family=Hind+Siliguri:wght@600&display=swap">
<style>
  body{font-family:"EB Garamond","Hind Siliguri",Garamond,serif;font-weight:600;font-variant-numeric:lining-nums tabular-nums;color:#111;margin:32px}
  b,strong,h1,h2,th{font-weight:600}
  h1{margin:0 0 4px;font-size:22px} .muted{color:#666;font-size:12px}
  .stats{display:flex;gap:24px;margin:20px 0} .stat b{display:block;font-size:20px}
  table{width:100%;border-collapse:collapse;margin-top:12px;font-size:12px}
  th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #ddd} td.num,th.num{text-align:right}
  h2{font-size:15px;margin-top:28px}
</style></head><body>
<h1>${escapeHtml(title)} · Xpences</h1>
<div class="muted">${name ? escapeHtml(name) + ' · ' : ''}Generated ${format(new Date(), 'd MMM yyyy, HH:mm')}</div>
<div class="stats">
  <div class="stat">Total spent<b>${money(total)}</b></div>
  <div class="stat">Transactions<b>${expenses.length}</b></div>
  ${budget ? `<div class="stat">Budget<b>${money(budget)}</b></div><div class="stat">${total > budget ? 'Over by' : 'Remaining'}<b>${money(Math.abs(budget - total))}</b></div>` : ''}
</div>
<h2>By category</h2>
<table><tr><th>Category</th><th class="num">Amount</th><th class="num">Share</th></tr>
${byCat.map(([c, v]) => `<tr><td>${escapeHtml(c)}</td><td class="num">${money(v)}</td><td class="num">${total ? ((v / total) * 100).toFixed(1) : 0}%</td></tr>`).join('')}
</table>
<h2>Transactions</h2>
<table><tr><th>Date</th><th>Title</th><th>Category</th><th class="num">Amount</th></tr>
${expenses.map(e => `<tr><td>${format(new Date(e.date), 'd MMM yyyy')}</td><td>${escapeHtml(e.title)}</td><td>${escapeHtml(e.category)}</td><td class="num">${money(e.amount)}</td></tr>`).join('')}
</table>
<script>window.onload=()=>window.print()</script>
</body></html>`;
}

/** Opens the report in a new tab and triggers the browser's print dialog ("Save as PDF"). */
export function printReport(html: string): boolean {
  // The phone app has no print window: the report is shared as a page, which opens in the phone's
  // browser, where Print > Save as PDF works
  if (isNative()) {
    shareFile('xpences-report.html', html, 'Xpences report').catch(err => console.error('Could not share the report:', err));
    return true;
  }
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  return true;
}

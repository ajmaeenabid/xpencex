import type { TKey } from '../../shared/i18n';
import { shareOf } from '../expenses/expense';

// The everyday money tools in the Converter tab, kept free of React so they can be tested.

export type MoneyToolId = 'discount' | 'bill' | 'split' | 'savings';
export type ToolValues = Record<string, string>;

export const emptyToolValues: Record<MoneyToolId, ToolValues> = {
  discount: { price: '', percent: '' },
  bill: { amount: '', vat: '', tip: '' },
  split: { total: '', people: '2' },
  savings: { goal: '', saved: '', months: '' },
};

const MAX_PEOPLE = 50; // the most Add Expense can split a bill between
const round2 = (n: number) => Math.round(n * 100) / 100;
const roundUp = (n: number) => Math.ceil(n * 100 - 1e-7) / 100;
/** A box left empty counts as 0 */
const num = (value: string | undefined) => {
  const n = parseFloat(value || '');
  return Number.isFinite(n) ? n : 0;
};

export type ToolRow = { label: TKey; value: number; strong?: boolean };

export interface ToolResult {
  rows: ToolRow[];
  note?: { text: TKey; kind: 'error' | 'good' };
  // What "Save as expense" would use. Missing while there's nothing sensible to save.
  save?: { amount: number; people?: number };
}

export function discount(values: ToolValues): ToolResult {
  const price = num(values.price);
  const percent = num(values.percent);
  if (percent > 100) {
    return { rows: [{ label: 'tool.finalPrice', value: 0, strong: true }, { label: 'tool.youSave', value: 0 }], note: { text: 'tool.errPercent', kind: 'error' } };
  }
  const saved = round2((price * percent) / 100);
  const final = round2(price - saved);
  return {
    rows: [{ label: 'tool.finalPrice', value: final, strong: true }, { label: 'tool.youSave', value: saved }],
    save: final > 0 ? { amount: final } : undefined,
  };
}

/** VAT and tip are each a share of the bill itself, so the tip isn't charged on the VAT */
export function billTotal(values: ToolValues): ToolResult {
  const amount = num(values.amount);
  const vatRate = num(values.vat);
  const tipRate = num(values.tip);
  const rows = (vat: number, tip: number, total: number): ToolRow[] => [
    { label: 'tool.total', value: total, strong: true },
    { label: 'tool.vatAmount', value: vat },
    { label: 'tool.tipAmount', value: tip },
  ];
  if (vatRate > 100 || tipRate > 100) return { rows: rows(0, 0, 0), note: { text: 'tool.errPercent', kind: 'error' } };
  const vat = round2((amount * vatRate) / 100);
  const tip = round2((amount * tipRate) / 100);
  const total = round2(amount + vat + tip);
  return { rows: rows(vat, tip, total), save: total > 0 ? { amount: total } : undefined };
}

export function splitBill(values: ToolValues): ToolResult {
  const total = num(values.total);
  const people = Math.floor(num(values.people));
  if (people > MAX_PEOPLE) return { rows: [{ label: 'tool.eachShare', value: 0, strong: true }], note: { text: 'tool.errPeople', kind: 'error' } };
  if (people < 2) return { rows: [{ label: 'tool.eachShare', value: total, strong: true }] };
  return {
    rows: [{ label: 'tool.eachShare', value: shareOf(total, people), strong: true }],
    save: total > 0 ? { amount: total, people } : undefined,
  };
}

export function savingsGoal(values: ToolValues): ToolResult {
  const goal = num(values.goal);
  const saved = num(values.saved);
  const months = Math.floor(num(values.months));
  const remaining = Math.max(0, round2(goal - saved));
  const rows = (perMonth: number): ToolRow[] => [
    { label: 'tool.perMonth', value: perMonth, strong: true },
    { label: 'tool.stillNeeded', value: remaining },
  ];
  if (goal > 0 && remaining === 0) return { rows: rows(0), note: { text: 'tool.goalReached', kind: 'good' } };
  // Rounded up, so the last month never falls short of the goal
  return { rows: rows(months > 0 ? roundUp(remaining / months) : 0) };
}

export const MONEY_TOOLS: Record<MoneyToolId, (values: ToolValues) => ToolResult> = {
  discount,
  bill: billTotal,
  split: splitBill,
  savings: savingsGoal,
};

export interface ExtractedExpense {
  title: string;
  amount: number;
  category: string;
  date: string;
  notes?: string;
}

// Gemini may return "2026-10-23", a string amount, or junk; Firestore rules need a full ISO date and a positive number
export function normalizeExpense(raw: any): ExtractedExpense | null {
  if (!raw) return null;
  const amount = typeof raw.amount === 'string' ? parseFloat(raw.amount.replace(/[^\d.]/g, '')) : Number(raw.amount);
  if (!raw.title || !Number.isFinite(amount) || amount <= 0) return null;
  let date = raw.date ? new Date(raw.date) : new Date();
  if (isNaN(date.getTime())) date = new Date();
  return {
    title: String(raw.title).slice(0, 100),
    amount: Math.round(amount * 100) / 100,
    category: String(raw.category || 'Other').slice(0, 50),
    date: date.toISOString(),
    notes: raw.notes ? String(raw.notes).slice(0, 500) : '',
  };
}

// Picks the category from the list that matches case-insensitively, falling back to "Other"
export function matchCategory(name: string, categories: string[]): string {
  return categories.find(c => c.toLowerCase() === name.toLowerCase()) || 'Other';
}

/** Your part of a split bill */
export const shareOf = (total: number, people: number) => Math.round((total / people) * 100) / 100;

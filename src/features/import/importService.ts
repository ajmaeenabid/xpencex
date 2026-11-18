// Reading an import file on the phone, checking it against saved entries, and saving the rows the person ticked.
import { collection, doc, getDocs, orderBy, query, where, writeBatch } from 'firebase/firestore';
import { addDays, startOfDay } from 'date-fns';
import { db } from '../../shared/firebase';
import { saved } from '../../shared/lib/offlineSave';
import { Cell, EntryKind, ImportEntry, MAX_IMPORT_BYTES, parseCsv } from './importFile';

const BATCH = 400;

export type ImportFailure = 'type' | 'size' | 'empty' | 'read';

export class ImportError extends Error {
  constructor(public reason: ImportFailure) {
    super(reason);
  }
}

/** Every row of a CSV file, or of the first Excel sheet that has anything in it */
export async function readImportFile(file: File): Promise<Cell[][]> {
  const extension = file.name.toLowerCase().split('.').pop();
  if (extension !== 'csv' && extension !== 'xlsx') throw new ImportError('type');
  if (file.size > MAX_IMPORT_BYTES) throw new ImportError('size');
  let rows: Cell[][];
  try {
    if (extension === 'csv') {
      rows = parseCsv(await file.text());
    } else {
      // Loaded only when someone picks an Excel file, so the app itself stays small
      const { default: readXlsxFile } = await import('read-excel-file/browser');
      const sheets = await readXlsxFile(file);
      rows = (sheets.find(s => s.data.length > 0)?.data || []) as Cell[][];
    }
  } catch (err) {
    console.error('Could not read the import file:', err);
    throw new ImportError('read');
  }
  if (rows.length < 2) throw new ImportError('empty');
  return rows;
}

/** Saved expenses and income between the first and last day in the file, to spot rows already there */
export async function savedEntriesBetween(uid: string, entries: ImportEntry[]) {
  if (entries.length === 0) return [];
  const times = entries.map(e => new Date(e.date).getTime());
  const from = startOfDay(new Date(Math.min(...times))).toISOString();
  const to = addDays(startOfDay(new Date(Math.max(...times))), 1).toISOString();
  const read = (name: 'expenses' | 'deposits') =>
    getDocs(query(collection(db, name), where('uid', '==', uid), where('date', '>=', from), where('date', '<', to), orderBy('date', 'desc')));
  const [spent, received] = await Promise.all([read('expenses'), read('deposits')]);
  const list = (snap: typeof spent, kind: EntryKind) => snap.docs.map(d => {
    const data = d.data();
    return { kind, date: String(data.date), amount: Number(data.amount), title: typeof data.title === 'string' ? data.title : '' };
  });
  return [...list(spent, 'expense'), ...list(received, 'income')];
}

/** Saves the entries as history only: no account is set, so no balance moves */
export function saveImported(uid: string, entries: ImportEntry[]) {
  const commits: Promise<void>[] = [];
  const createdAt = new Date().toISOString();
  for (let i = 0; i < entries.length; i += BATCH) {
    const batch = writeBatch(db);
    for (const e of entries.slice(i, i + BATCH)) {
      const base = { uid, title: e.title, amount: e.amount, category: e.category, date: e.date, notes: e.notes };
      if (e.kind === 'expense') batch.set(doc(collection(db, 'expenses')), { ...base, createdAt });
      else batch.set(doc(collection(db, 'deposits')), { ...base, source: 'manual' });
    }
    commits.push(batch.commit());
  }
  return saved(Promise.all(commits));
}

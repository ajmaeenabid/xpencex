import { SheetTab } from './googleApps';
import { googleFetch } from './googleAppsService';

// Exports to Google Sheets. Each export makes a new spreadsheet in the person's own Drive.
// Values are sent as plain values (RAW), so text that starts with "=" can never run as a formula.

const API = 'https://sheets.googleapis.com/v4/spreadsheets';

const sheets = (url: string, body: unknown) =>
  googleFetch('sheets', url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

const quoted = (title: string) => `'${title.replace(/'/g, "''")}'`;

/** Makes a spreadsheet with these tabs and returns its web address */
export async function createSpreadsheet(title: string, tabs: SheetTab[]): Promise<string> {
  // Google refuses two tabs with the same name
  const seen = new Map<string, number>();
  const named = tabs.map(tab => {
    const n = (seen.get(tab.title) || 0) + 1;
    seen.set(tab.title, n);
    return { ...tab, title: n > 1 ? `${tab.title} ${n}` : tab.title };
  });

  const made = await (await sheets(API, {
    properties: { title },
    sheets: named.map((tab, i) => ({ properties: { sheetId: i, title: tab.title, gridProperties: { frozenRowCount: 1 } } })),
  })).json();
  const id: string = made.spreadsheetId;

  await sheets(`${API}/${id}/values:batchUpdate`, {
    valueInputOption: 'RAW',
    data: named.map(tab => ({ range: `${quoted(tab.title)}!A1`, values: tab.rows })),
  });

  // Bold headings and columns sized to fit. Only looks: the sheet is already complete without it.
  await sheets(`${API}/${id}:batchUpdate`, {
    requests: named.flatMap((tab, i) => [
      { repeatCell: { range: { sheetId: i, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: 'userEnteredFormat.textFormat.bold' } },
      { autoResizeDimensions: { dimensions: { sheetId: i, dimension: 'COLUMNS', startIndex: 0, endIndex: Math.max(1, tab.rows[0]?.length || 1) } } },
    ]),
  }).catch(err => console.error('Could not format the sheet:', err));

  return made.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${id}/edit`;
}

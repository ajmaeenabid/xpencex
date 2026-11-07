import { describe, it, expect } from 'vitest';
import { cleanSheetText, fitWithin, identifyFile, rowsToCsv, prepareAttachment } from './attachments';
import { MAX_FILE_BYTES } from './limits';

describe('identifyFile', () => {
  it('accepts images, PDF, CSV and new Excel files', () => {
    expect(identifyFile('a.JPG', '')).toEqual({ kind: 'image', format: 'image/jpeg' });
    expect(identifyFile('a.webp', '')?.kind).toBe('image');
    expect(identifyFile('a.pdf', '')?.kind).toBe('pdf');
    expect(identifyFile('a.csv', '')).toEqual({ kind: 'sheet', format: 'csv' });
    expect(identifyFile('a.xlsx', '')).toEqual({ kind: 'sheet', format: 'xlsx' });
  });
  it('refuses everything else, including old .xls files', () => {
    expect(identifyFile('a.zip', 'application/zip')).toBeNull();
    expect(identifyFile('a.docx', '')).toBeNull();
    expect(identifyFile('a.xls', 'application/vnd.ms-excel')).toBeNull();
  });
  it('accepts a camera photo that has no extension', () => {
    expect(identifyFile('photo', 'image/jpeg')?.kind).toBe('image');
    expect(identifyFile('photo', 'application/zip')).toBeNull();
  });
});

describe('rowsToCsv', () => {
  it('quotes cells that would break the columns', () => {
    expect(rowsToCsv([['Tea, milk', 20], ['say "hi"', null]])).toBe('"Tea, milk",20\n"say ""hi""",');
  });
  it('writes dates plainly', () => {
    expect(rowsToCsv([[new Date(Date.UTC(2026, 10, 5))]])).toBe('2026-11-05');
  });
});

describe('cleanSheetText', () => {
  it('hides account numbers before anything is sent', () => {
    const clean = cleanSheetText('Paid,01712345678,500');
    expect(clean?.text).not.toContain('01712345678');
    expect(clean?.text).toContain('500');
  });
  it('refuses text holding a one-time code', () => {
    expect(cleanSheetText('Your OTP is 482913')).toBeNull();
  });
  it('cuts very long files and says so', () => {
    const clean = cleanSheetText('a,b\n'.repeat(60_000));
    expect(clean?.cut).toBe(true);
    expect(clean?.text.length).toBe(200_000);
  });
});

describe('fitWithin', () => {
  it('shrinks the longest side and keeps the shape', () => {
    expect(fitWithin(4000, 3000, 2000)).toEqual({ width: 2000, height: 1500 });
    expect(fitWithin(3000, 4000, 2000)).toEqual({ width: 1500, height: 2000 });
  });
  it('never enlarges a small picture', () => {
    expect(fitWithin(800, 600, 2000)).toEqual({ width: 800, height: 600 });
  });
});

describe('prepareAttachment', () => {
  it('refuses PDF and spreadsheet files over 5 MB', async () => {
    expect(await prepareAttachment(new File([new Uint8Array(MAX_FILE_BYTES + 1)], 'big.pdf'))).toEqual({ problem: 'size' });
    expect(await prepareAttachment(new File([new Uint8Array(MAX_FILE_BYTES + 1)], 'big.csv'))).toEqual({ problem: 'size' });
  });
  it('says a photo is too big when it cannot be shrunk', async () => {
    // Not a real picture, so it can't be read
    expect(await prepareAttachment(new File([new Uint8Array(MAX_FILE_BYTES + 1)], 'big.jpg'))).toEqual({ problem: 'size' });
  });
  it('accepts a file of exactly 5 MB', async () => {
    const exact = new File([new Uint8Array(MAX_FILE_BYTES)], 'ok.pdf');
    expect(await prepareAttachment(exact)).toMatchObject({ kind: 'pdf', mimeType: 'application/pdf' });
  });
  it('refuses unsupported types', async () => {
    expect(await prepareAttachment(new File(['x'], 'a.zip'))).toEqual({ problem: 'type' });
  });
  it('sends a CSV as text with numbers masked', async () => {
    const prepared = await prepareAttachment(new File(['Tea,01712345678,20'], 'spend.csv'));
    if ('problem' in prepared) throw new Error('should be accepted');
    expect(prepared.mimeType).toBe('text/plain');
    expect(atob(prepared.data)).not.toContain('01712345678');
  });
  it('refuses an empty CSV and one holding a code', async () => {
    expect(await prepareAttachment(new File(['  '], 'a.csv'))).toEqual({ problem: 'empty' });
    expect(await prepareAttachment(new File(['Your OTP is 482913'], 'a.csv'))).toEqual({ problem: 'secret' });
  });
});

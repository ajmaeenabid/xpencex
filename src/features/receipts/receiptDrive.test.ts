import { describe, it, expect } from 'vitest';
import type { Receipt } from '../../shared/types';
import {
  DriveReceipt, ReceiptLockError, driveReceiptName, receiptLinks, receiptLocker, receiptUnlocker, receiptsToBackUp, receiptsToRestore,
} from './receiptDrive';

const receipt = (id: string, type: Receipt['type'] = 'image/jpeg'): Receipt => ({ id, uid: 'u1', type, size: 10, source: 'add', createdAt: '2026-11-11T00:00:00.000Z' });
const file = (receiptId: string, locked: boolean): DriveReceipt => ({ fileId: `f-${receiptId}-${locked}`, receiptId, locked, type: 'image/jpeg', source: 'chat' });

describe('driveReceiptName', () => {
  it('names files by receipt, with a locked ending when locked', () => {
    expect(driveReceiptName(receipt('r1'), false)).toBe('receipt-r1.jpg');
    expect(driveReceiptName(receipt('r2', 'application/pdf'), false)).toBe('receipt-r2.pdf');
    expect(driveReceiptName(receipt('r3'), true)).toBe('receipt-r3.locked');
  });
});

describe('receiptsToBackUp', () => {
  it('sends only receipts without a copy locked the same way', () => {
    const all = [receipt('a'), receipt('b'), receipt('c')];
    const inDrive = [file('a', false), file('b', true)];
    expect(receiptsToBackUp(all, inDrive, false).map(r => r.id)).toEqual(['b', 'c']);
    expect(receiptsToBackUp(all, inDrive, true).map(r => r.id)).toEqual(['a', 'c']);
  });
});

describe('receiptsToRestore', () => {
  const links = [
    { expenseId: 'e1', receiptId: 'a' }, // in the app already
    { expenseId: 'e2', receiptId: 'b' }, // missing, Drive has both copies
    { expenseId: 'e3', receiptId: 'c' }, // missing, Drive has nothing
    { expenseId: 'e4', receiptId: 'd' }, // missing, Drive has a locked copy
  ];
  const inDrive = [file('b', true), file('b', false), file('d', true), file('z', false)];

  it('brings back only missing receipts that Drive has, preferring the normal copy', () => {
    const plan = receiptsToRestore(links, new Set(['a']), inDrive);
    expect(plan.map(p => [p.expenseId, p.receiptId, p.file.locked])).toEqual([['e2', 'b', false], ['e4', 'd', true]]);
  });

  it('never brings back a receipt that no expense in the backup points to', () => {
    expect(receiptsToRestore(links, new Set(), inDrive).some(p => p.receiptId === 'z')).toBe(false);
  });
});

describe('receiptLinks', () => {
  it('finds expenses that point to a receipt', () => {
    expect(receiptLinks([{ id: 'e1', receiptId: 'r1' }, { id: 'e2' }, { id: 'e3', receiptId: '' }])).toEqual([{ expenseId: 'e1', receiptId: 'r1' }]);
  });
});

describe('locking', () => {
  it('opens with the same password and refuses another', async () => {
    const bytes = new Uint8Array([1, 2, 3, 250, 251]);
    const lock = await receiptLocker('secret');
    const text = await lock(bytes);
    expect(text).not.toContain('AQID'); // not readable as is
    expect(Array.from(await receiptUnlocker('secret')(text))).toEqual(Array.from(bytes));
    await expect(receiptUnlocker('other')(text)).rejects.toBeInstanceOf(ReceiptLockError);
    await expect(receiptUnlocker('secret')('not a receipt')).rejects.toBeInstanceOf(ReceiptLockError);
  }, 20000);
});

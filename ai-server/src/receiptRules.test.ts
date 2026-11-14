import { describe, it, expect } from 'vitest';
import { MAX_RECEIPTS, MAX_RECEIPT_BYTES, detectReceiptType, isReceiptSource, isSafeId, receiptKey, uploadProblem } from './receiptRules';

const bytes = (...b: number[]) => new Uint8Array(b);
const jpg = bytes(0xff, 0xd8, 0xff, 0xe0, 1, 2, 3);
const png = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0);
const webp = bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50);
const pdf = new TextEncoder().encode('%PDF-1.7 ...');

describe('detectReceiptType', () => {
  it('knows photos and PDFs by their first bytes', () => {
    expect(detectReceiptType(jpg)).toBe('image/jpeg');
    expect(detectReceiptType(png)).toBe('image/png');
    expect(detectReceiptType(webp)).toBe('image/webp');
    expect(detectReceiptType(pdf)).toBe('application/pdf');
  });

  it('refuses anything else, even when it is only renamed', () => {
    expect(detectReceiptType(new TextEncoder().encode('<html>'))).toBeNull();
    expect(detectReceiptType(bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x41, 0x56, 0x49, 0x20))).toBeNull(); // a RIFF video
    expect(detectReceiptType(bytes(0xff, 0xd8))).toBeNull();
    expect(detectReceiptType(bytes())).toBeNull();
  });
});

describe('uploadProblem', () => {
  it('lets a small photo through while there is room', () => {
    expect(uploadProblem(jpg, 0)).toBeNull();
    expect(uploadProblem(jpg, MAX_RECEIPTS - 1)).toBeNull();
  });

  it('stops empty, too big, wrong type and full', () => {
    expect(uploadProblem(bytes(), 0)).toBe('empty');
    const big = new Uint8Array(MAX_RECEIPT_BYTES + 1);
    big.set(jpg);
    expect(uploadProblem(big, 0)).toBe('too-big');
    expect(uploadProblem(new TextEncoder().encode('hello'), 0)).toBe('wrong-type');
    expect(uploadProblem(jpg, MAX_RECEIPTS)).toBe('full');
  });

  it('allows exactly 1 MB', () => {
    const exact = new Uint8Array(MAX_RECEIPT_BYTES);
    exact.set(pdf);
    expect(uploadProblem(exact, 0)).toBeNull();
  });
});

describe('ids and places', () => {
  it('accepts only plain ids, so nobody can reach another folder', () => {
    expect(isSafeId('abc_DEF-123')).toBe(true);
    expect(isSafeId('../other')).toBe(false);
    expect(isSafeId('a/b')).toBe(false);
    expect(isSafeId('')).toBe(false);
    expect(isSafeId(42)).toBe(false);
  });

  it('keeps each person in their own folder', () => {
    expect(receiptKey('u1', 'r1')).toBe('users/u1/r1');
  });

  it('knows where a receipt came from', () => {
    expect(isReceiptSource('add')).toBe(true);
    expect(isReceiptSource('chat')).toBe(true);
    expect(isReceiptSource('other')).toBe(false);
  });
});

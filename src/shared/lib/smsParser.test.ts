import { describe, it, expect } from 'vitest';
import { parseWalletSms, parseBankSms, parseTransactionSms, maskSensitive } from './smsParser';

const CATS = ['Food', 'Shopping', 'Bills', 'Utilities', 'Other'];

describe('parseWalletSms', () => {
  it('parses a bKash merchant payment including the fee', () => {
    const r = parseWalletSms('Payment Tk 1,200.00 to Daraz Bangladesh successful. Fee Tk 5.00. Balance Tk 3,000.00. TrxID 9ABC123XY at 23/10/2026 14:30', CATS);
    expect(r?.kind).toBe('expense');
    if (r?.kind !== 'expense') return;
    expect(r.provider).toBe('bKash');
    expect(r.accountType).toBe('bkash');
    expect(r.expense.amount).toBe(1205);
    expect(r.expense.title).toBe('bKash Payment to Daraz Bangladesh');
    expect(r.expense.category).toBe('Shopping');
    expect(r.expense.notes).toContain('TrxID 9ABC123XY');
    expect(r.balance).toBe(3000);
    expect(r.ref).toBe('trx:9ABC123XY');
    const d = new Date(r.expense.date);
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 9, 23, 14]);
  });

  it('detects Nagad and maps recharge to Utilities', () => {
    const r = parseWalletSms('Nagad: Mobile Recharge Tk. 50 to 01712345678 is successful. TxnID: 7XYZ99', CATS);
    expect(r?.kind).toBe('expense');
    if (r?.kind !== 'expense') return;
    expect(r.provider).toBe('Nagad');
    expect(r.expense.category).toBe('Utilities');
    expect(r.expense.amount).toBe(50);
  });

  it('falls back to Other when the mapped category is missing', () => {
    const r = parseWalletSms('Bill Payment Tk 800 to DESCO successful. TrxID AB12', ['Food', 'Other']);
    expect(r?.kind === 'expense' && r.expense.category).toBe('Other');
  });

  it('reads received money and cash in as income', () => {
    const r = parseWalletSms('You have received Tk 500.00 from 01712345678. Fee Tk 0.00. Balance Tk 1,500.00. TrxID 9ABC123', CATS);
    expect(r?.kind).toBe('income');
    if (r?.kind !== 'income') return;
    expect(r.income.amount).toBe(500);
    expect(r.income.title).toBe('bKash Received Money');
    expect(r.balance).toBe(1500);

    const cashIn = parseWalletSms('Cash In Tk 2,000.00 from 01812345678 successful. Balance Tk 2,500.00. TrxID 8QWE45', CATS);
    expect(cashIn?.kind === 'income' && cashIn.income.title).toBe('bKash Cash In');
  });

  it('reads a real bKash "received" SMS after the phone number is hidden', () => {
    const sms = maskSensitive('You have received Tk 200.00 from 01521790146. Fee Tk 0.00. Balance Tk 2,710.99. TrxID DJK5AE01ZF at 20/10/2026 14:45');
    expect(sms).not.toContain('01521790146');
    const r = parseWalletSms(sms, CATS);
    expect(r?.kind).toBe('income');
    if (r?.kind !== 'income') return;
    expect(r.provider).toBe('bKash');
    expect(r.income.amount).toBe(200);
    expect(r.balance).toBe(2710.99);
    expect(r.ref).toBe('trx:DJK5AE01ZF');
    const d = new Date(r.income.date);
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]).toEqual([2026, 9, 20, 14, 45]);
  });

  it('returns null for ordinary chat text', () => {
    expect(parseWalletSms('I spent 200 taka on food', CATS)).toBeNull();
    expect(parseWalletSms('Payment Tk 200 for lunch', CATS)).toBeNull();
  });
});

describe('parseBankSms', () => {
  it('reads a bank credit SMS (sample from a real bank)', () => {
    const sms = maskSensitive('TK 620.00 has been credited to your A/C# 10689**0001 on 20-10-26. Your A/C balance is TK 985.46. For Enquiry call: 16221');
    const r = parseBankSms(sms, CATS);
    expect(r?.kind).toBe('income');
    if (r?.kind !== 'income') return;
    expect(r.accountType).toBe('bank');
    expect(r.income.amount).toBe(620);
    expect(r.balance).toBe(985.46);
    const d = new Date(r.income.date);
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 9, 20]);
    expect(JSON.stringify(r)).not.toContain('10689');
  });

  it('reads a debit with a merchant and keeps the balance separate from the amount', () => {
    const r = parseBankSms('Your A/C ****1234 has been debited by BDT 1,250.00 for purchase at SHWAPNO on 21-Oct-26. Available balance BDT 8,000.00', CATS);
    expect(r?.kind).toBe('expense');
    if (r?.kind !== 'expense') return;
    expect(r.expense.amount).toBe(1250);
    expect(r.expense.title).toBe('Card purchase at SHWAPNO');
    expect(r.expense.category).toBe('Shopping');
    expect(r.balance).toBe(8000);
  });

  it('labels ATM withdrawals', () => {
    const r = parseBankSms('TK 5,000.00 withdrawn from your A/C at ATM on 22-10-26. Balance TK 3,000.00', CATS);
    expect(r?.kind === 'expense' && r.expense.title).toBe('ATM cash withdrawal');
  });

  it('gives the same SMS the same reference, so it can only be saved once', () => {
    const sms = 'TK 620.00 has been credited to your A/C on 20-10-26. Your A/C balance is TK 985.46.';
    expect(parseBankSms(sms, CATS)?.ref).toBe(parseBankSms(sms, CATS)?.ref);
  });

  it('ignores text that is not a bank transaction', () => {
    expect(parseBankSms('Your OTP is 123456. Do not share it.', CATS)).toBeNull();
    expect(parseTransactionSms('How much did I spend on food?', CATS)).toBeNull();
  });
});

describe('maskSensitive', () => {
  it('hides account, card and phone numbers but keeps amounts, dates and transaction IDs', () => {
    const masked = maskSensitive('TK 620.00 credited to your A/C# 10689**0001 on 20-10-26. Card No. 4321XXXXXXXX9876. From 01712345678. TrxID 9ABC123XY. Call 16221');
    expect(masked).not.toMatch(/10689|0001|4321|9876|01712345678/);
    expect(masked).toContain('A/C ••••');
    expect(masked).toContain('card ••••');
    expect(masked).toContain('TK 620.00');
    expect(masked).toContain('20-10-26');
    expect(masked).toContain('TrxID 9ABC123XY');
    expect(masked).toContain('16221');
  });

  it('hides a plain account number with no label', () => {
    expect(maskSensitive('Sent to 1234567890123 today')).toBe('Sent to •••• today');
  });

  it('leaves large amounts alone', () => {
    expect(maskSensitive('Balance TK 12,345,678.00')).toBe('Balance TK 12,345,678.00');
  });
});

describe('Bangla digits in SMS', () => {
  it('reads an amount written in Bangla digits once the text is masked', () => {
    const sms = maskSensitive('You have received Tk ৫০০.০০ from ০১৭১২৩৪৫৬৭৮. Balance Tk ১,২০০.০০. TrxID 7BNG12');
    expect(sms).not.toContain('01712345678');
    const r = parseWalletSms(sms, CATS);
    expect(r?.kind === 'income' && r.income.amount).toBe(500);
    expect(r?.balance).toBe(1200);
  });
});

describe('Fee and balance with converted digits', () => {
  it('keeps amount, fee and balance apart in a Bangla-digit bKash SMS', () => {
    const r = parseWalletSms(maskSensitive('Payment Tk ১,২০০.০০ to Daraz successful. Fee Tk ৫.০০. Balance Tk ১০৫০০.০০. TrxID 9ABC12 at ২০/১০/২০২৬ ১৪:৪৫'), CATS);
    expect(r?.kind).toBe('expense');
    if (r?.kind !== 'expense') return;
    expect(r.expense.amount).toBe(1205); // 1,200 + 5 fee
    expect(r.balance).toBe(10500);
    expect(r.expense.notes).toContain('Fee ৳5');
    const d = new Date(r.expense.date);
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]).toEqual([2026, 9, 20, 14, 45]);
  });
});

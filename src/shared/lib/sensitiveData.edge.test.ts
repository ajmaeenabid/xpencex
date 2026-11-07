// Bangladeshi edge cases suggested in an external review, adapted to this codebase's function names
import { describe, it, expect } from 'vitest';
import { containsSecret } from './sensitiveData';
import { maskSensitive } from './smsParser';

describe('Secret detector: Bangladeshi edge cases', () => {
  it('blocks a distant OTP in a mixed Bangla/English alert', () => {
    const msg = 'bKash Alert: আপনার অ্যাকাউন্ট সুরক্ষার জন্য ক্যাশ আউট বা সেন্ড মানি করার ওটিপি কোডটি কারো সাথে শেয়ার করবেন না। Your safety code is 8392.';
    expect(containsSecret(msg)).toBe(true);
  });

  it('blocks a code that comes first in Banglish', () => {
    expect(containsSecret('93021 holo apnar Nagad account er verification code. Kawk bolben na.')).toBe(true);
  });

  it('blocks a PIN sitting near a deceptive reference number', () => {
    expect(containsSecret('Rocket System Update: Use temporary PIN 94821 to log in. Ref No: 482910.')).toBe(true);
  });

  it('blocks an OTP written one digit at a time', () => {
    expect(containsSecret('City Bank Internet Banking OTP is 4 8 2 9 1 0. Valid for 3 mins.')).toBe(true);
    expect(containsSecret('Your OTP: 4-8-2-9')).toBe(true);
  });

  it('blocks NID numbers next to an NID label', () => {
    expect(containsSecret('Smart NID Copy Verified. NID No: 19922614902100342. Keep this safe.')).toBe(true);
    expect(containsSecret('National ID number 1234567890')).toBe(true);
    expect(containsSecret('আমার জাতীয় পরিচয়পত্র নং 1992261490210')).toBe(true);
  });
});

describe('Secret detector: things that must NOT be blocked', () => {
  it.each([
    // Transaction IDs are letters + digits, never mistaken for codes or passwords
    'You have received Tk 200.00 from ••••. Balance Tk 2,710.99. TrxID BL8A9KJS2 at 20/10/2026 14:45',
    'Cash Out Tk 1,000.00 successful. TrxID DJK5AE01ZF. Never share your PIN.',
    // Rocket transaction IDs can be all digits: still not a code when labelled TxnId
    'Rocket: Cash In Tk 500.00. TxnId: 8392016745. Never share your PIN or OTP, call 16216',
    'Rocket: Send money Tk 300 successful, TxnId 4829 never share PIN',
    // Promotions and tracking messages
    'Get 2000 bonus points with promo code SAVE20 this week!',
    'Order 12345 shipped. Use the tracking code on our website.',
    // An NID mentioned without a number, and ordinary amounts
    'Please bring your NID card to the branch.',
    'apnar balance Tk 2500, share korben na',
  ])('allows: %s', (text) => {
    expect(containsSecret(text)).toBe(false);
  });
});

describe('Masking: Bangladeshi accounts and phones', () => {
  it('fully masks an account number that is already partly masked', () => {
    const out = maskSensitive('DBBL A/C 10689**0001 has been credited Tk. 5,000.');
    expect(out).toContain('A/C ••••');
    expect(out).not.toContain('10689');
    expect(out).toContain('Tk. 5,000');
  });

  it('masks +880 and 01 phone numbers', () => {
    for (const msg of ['Money sent to +8801712345678 successfully.', 'Money sent to 01712345678 successfully.', 'Call 8801712345678 now']) {
      const out = maskSensitive(msg);
      expect(out).toContain('••••');
      expect(out).not.toContain('1712345678');
    }
  });
});

describe('Bangla numerals (০-৯)', () => {
  it('blocks codes written in Bangla digits', () => {
    expect(containsSecret('আপনার ওটিপি ৪৮২৯১৩')).toBe(true);
    expect(containsSecret('আপনার বিকাশ পিন ১২৩৪')).toBe(true);
    expect(containsSecret('Your OTP is ৩০৯-৮৪২')).toBe(true);
    expect(containsSecret('আপনার জাতীয় পরিচয়পত্র নং ১৯৯২২৬১৪৯০২১০')).toBe(true);
  });

  it('allows ordinary Bangla amounts and dates', () => {
    expect(containsSecret('আমি খাবারে ৫০০ টাকা খরচ করেছি')).toBe(false);
    expect(containsSecret('বিকাশ কখনো আপনার পিন জানতে চায় না। হেল্পলাইন ১৬২৪৭')).toBe(false);
  });

  it('masks phone numbers written in Bangla digits and keeps amounts readable', () => {
    const out = maskSensitive('৳৫০০ পাঠানো হয়েছে ০১৭১২৩৪৫৬৭৮ নম্বরে');
    expect(out).toContain('••••');
    expect(out).not.toMatch(/01712345678|০১৭১২৩৪৫৬৭৮/);
    expect(out).toContain('৳500');
  });
});

describe('Boundaries suggested in the second review', () => {
  it('blocks a spaced banking OTP', () => {
    expect(containsSecret('Your OTP code is 9 1 0 2 4 8. Please use it within 3 minutes.')).toBe(true);
  });

  it('allows an instruction that mentions a PIN but holds no code, even next to a date', () => {
    expect(containsSecret('Enter your PIN code. Date of transaction: 25-10-2026')).toBe(false);
    expect(containsSecret('Your OTP was used on 20-10-2026 at the branch')).toBe(false);
  });

  it('blocks a registered NID but allows a mention of the card', () => {
    expect(containsSecret('Your registered NID: 19922614902100342')).toBe(true);
    expect(containsSecret('Please bring your NID card to the local branch')).toBe(false);
  });
});

describe('Disguised secrets (third review)', () => {
  it('blocks an OTP inside Markdown bold', () => {
    expect(containsSecret('Your security OTP code is: **390214**')).toBe(true);
  });

  it('blocks an NID with unusual punctuation after the label', () => {
    expect(containsSecret('জাতীয় পরিচয়পত্র নং >>> 19922614902100342')).toBe(true);
    expect(containsSecret('NID => 1992261490')).toBe(true);
  });

  it('blocks codes and keywords split by invisible characters', () => {
    expect(containsSecret('Your OTP is 4\u200B8\u200B2\u200B9\u200B1\u200B3')).toBe(true);
    expect(containsSecret('Your O\u200BT\u200BP is 482913')).toBe(true);
    expect(containsSecret('P\u00ADI\u00ADN 4821')).toBe(true);
  });

  it('blocks full-width digits', () => {
    expect(containsSecret('Your OTP is ４８２９１３')).toBe(true);
  });

  it('masks every account number in a multi-party transfer', () => {
    const out = maskSensitive('Debited from A/C 106892201 and Credited to A/C 990231452');
    expect(out).toBe('Debited from A/C •••• and Credited to A/C ••••');
  });

  it('masks a phone number hidden with invisible characters', () => {
    expect(maskSensitive('Sent to 0171\u200B2345\u200B678')).toBe('Sent to ••••');
  });

  it('does not mistake fees and balances for codes, in either digit system', () => {
    expect(containsSecret('Payment Tk ১,২০০.০০ to Daraz successful. Fee Tk ৫.০০. Balance Tk ১০৫০০.০০. TrxID 9ABC12 at ২০/১০/২০২৬ ১৪:৪৫')).toBe(false);
    expect(containsSecret('Cash Out Tk 500.00 successful. Fee Tk 9.25. Balance Tk 10500.00. Never share your PIN. TrxID 8XYZ')).toBe(false);
  });
});

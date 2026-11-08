import { describe, expect, it } from 'vitest';
import { MAX_FEEDBACK, checkFeedback } from './feedback';

describe('checkFeedback', () => {
  it('trims and keeps ordinary comments', () => {
    expect(checkFeedback('  Love the samity tracker!  ')).toEqual({ ok: true, text: 'Love the samity tracker!' });
  });

  it('squeezes long runs of empty lines', () => {
    const r = checkFeedback('Line one\n\n\n\n\nLine two');
    expect(r).toEqual({ ok: true, text: 'Line one\n\nLine two' });
  });

  it('refuses empty and too long comments', () => {
    expect(checkFeedback('   ')).toEqual({ ok: false, reason: 'empty' });
    expect(checkFeedback('a'.repeat(MAX_FEEDBACK + 1))).toEqual({ ok: false, reason: 'tooLong' });
  });

  it('blocks codes and passwords', () => {
    expect(checkFeedback('My OTP is 482913, it did not work')).toEqual({ ok: false, reason: 'secret' });
  });

  it('hides phone and account numbers', () => {
    const r = checkFeedback('Call me on 01712345678 about it');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.text).not.toContain('01712345678');
  });
});

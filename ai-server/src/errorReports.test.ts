import { describe, it, expect } from 'vitest';
import { cleanReport, cutoffFor, fingerprint, scrub } from './errorReports';

describe('scrub', () => {
  it('hides long numbers and email addresses', () => {
    expect(scrub('Card 4111 1111 1111 1111 failed')).toBe('Card [number] failed');
    expect(scrub('Call 01712-345678')).toBe('Call [number]');
    expect(scrub('Sent by someone@example.com')).toBe('Sent by [email]');
    expect(scrub('Line 42 of file')).toBe('Line 42 of file'); // short numbers stay, they help find the bug
  });
});

describe('cleanReport', () => {
  it('keeps only known fields, cut to size and scrubbed', () => {
    const r = cleanReport({ message: 'x'.repeat(500), stack: 'at a', screen: 'home', version: '1.0.3', device: 'Android 15', extra: 'dropped' });
    expect(r!.message.length).toBe(300);
    expect(r).not.toHaveProperty('extra');
  });

  it('drops a report with no message', () => {
    expect(cleanReport({ message: '   ' })).toBeNull();
    expect(cleanReport({ message: 42 })).toBeNull();
  });
});

describe('fingerprint', () => {
  it('treats the same message on the same screen as one error', () => {
    expect(fingerprint({ message: 'Boom', screen: 'home' })).toBe(fingerprint({ message: 'Boom', screen: 'home' }));
    expect(fingerprint({ message: 'Boom', screen: 'home' })).not.toBe(fingerprint({ message: 'Boom', screen: 'chat' }));
  });
});

describe('cutoffFor', () => {
  it('is 30 days back', () => {
    expect(cutoffFor(new Date('2026-11-11T00:00:00.000Z'))).toBe('2026-10-12T00:00:00.000Z');
  });
});

import { describe, expect, it } from 'vitest';
import { withSafetyHeaders } from './safety';

describe('safety headers', () => {
  it('adds nosniff to every reply and keeps its body, status and other headers', async () => {
    const res = withSafetyHeaders(new Response('{"ok":true}', { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': '30' } }));
    expect(res.status).toBe(429);
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('Retry-After')).toBe('30');
    expect(await res.text()).toBe('{"ok":true}');
  });

  it('keeps a reply with no body, like the browser pre-check', () => {
    const res = withSafetyHeaders(new Response(null, { status: 204 }));
    expect(res.status).toBe(204);
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });
});

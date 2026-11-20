import { afterEach, describe, expect, it, vi } from 'vitest';
import { base64Url, buildMessage, mailLanguage, sendWelcomeEmail, welcomeHtml, welcomePlain } from './welcomeEmail';

const decode = (b64: string) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\r\n/g, '')), c => c.charCodeAt(0)));

describe('welcome email', () => {
  it('writes in the app language, or guesses Bangla from a Bangla name', () => {
    expect(mailLanguage('bn', 'rahim')).toBe('bn');
    expect(mailLanguage(undefined, 'রহিম')).toBe('bn');
    expect(mailLanguage(undefined, 'rahim')).toBe('en');
    expect(mailLanguage('fr', 'rahim')).toBe('en');
  });

  it('fills in the name and address, made safe for HTML', () => {
    const html = welcomeHtml('en', 'Rahim<b>', 'rahim@example.com');
    expect(html).toContain('Hi Rahim&lt;b&gt;, welcome to Xpences!');
    expect(html).toContain('rahim@example.com');
    expect(html).not.toContain('<b>');
    expect(html).toContain('https://xpencex.xpence.workers.dev/icon-192.png');
    expect(welcomeHtml('bn', 'রহিম', 'r@example.com')).toContain('হ্যালো রহিম, Xpences-এ স্বাগতম!');
  });

  it('has a plain-text copy with the link', () => {
    expect(welcomePlain('en', 'Rahim', 'r@example.com')).toContain('Open Xpences: https://xpencex.xpence.workers.dev');
  });

  it('packages a Bangla subject and both versions for Gmail', () => {
    const message = buildMessage({ fromName: 'Xpences', fromAddress: 'admin@gmail.com', to: 'r@example.com',
      subject: 'Xpences-এ স্বাগতম, রহিম!', html: '<p>হ্যালো</p>', text: 'হ্যালো', boundary: 'b1' });
    const subject = message.match(/^Subject: =\?UTF-8\?B\?(.+)\?=$/m)?.[1];
    expect(decode(subject!)).toBe('Xpences-এ স্বাগতম, রহিম!');
    expect(message).toContain('Content-Type: multipart/alternative; boundary="b1"');
    const parts = message.split('--b1');
    expect(decode(parts[1].split('\r\n\r\n')[1])).toBe('হ্যালো');
    expect(decode(parts[2].split('\r\n\r\n')[1])).toBe('<p>হ্যালো</p>');
  });

  it('refuses an address that could add extra mail headers', () => {
    expect(() => buildMessage({ fromName: 'X', fromAddress: 'a@gmail.com', to: 'r@example.com\r\nBcc: x@y.z',
      subject: 's', html: 'h', text: 't', boundary: 'b' })).toThrow();
  });

  it('makes base64url without padding or + /', () => {
    expect(base64Url('??>>')).not.toMatch(/[+/=]/);
  });
});

describe('sending', () => {
  afterEach(() => vi.unstubAllGlobals());
  const env = { GMAIL_CLIENT_ID: 'id', GMAIL_CLIENT_SECRET: 'secret', GMAIL_REFRESH_TOKEN: 'refresh', MAIL_FROM_ADDRESS: 'admin@gmail.com' };

  it('sends nothing while the mail secrets are missing', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    expect(await sendWelcomeEmail({}, 'r@example.com', 'Rahim', 'en')).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('gets a Gmail token, then sends the message as the admin Gmail', async () => {
    const fetchSpy = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'tok' })))
      .mockResolvedValueOnce(new Response('{}'));
    vi.stubGlobal('fetch', fetchSpy);
    expect(await sendWelcomeEmail(env, 'r@example.com', 'Rahim', 'en')).toBe(true);
    expect(fetchSpy.mock.calls[0][0]).toBe('https://oauth2.googleapis.com/token');
    const [url, init] = fetchSpy.mock.calls[1];
    expect(url).toBe('https://gmail.googleapis.com/gmail/v1/users/me/messages/send');
    expect(init.headers.Authorization).toBe('Bearer tok');
    const raw = JSON.parse(init.body).raw as string;
    const message = decode(raw.replace(/-/g, '+').replace(/_/g, '/'));
    expect(message).toContain('To: <r@example.com>');
    expect(message).toContain('<admin@gmail.com>');
  });

  it('reports a failed send so it can be logged', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'tok' })))
      .mockResolvedValueOnce(new Response('quota', { status: 429 })));
    await expect(sendWelcomeEmail(env, 'r@example.com', 'Rahim', 'en')).rejects.toThrow(/429/);
  });
});

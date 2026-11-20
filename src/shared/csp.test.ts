import { describe, expect, it } from 'vitest';
import { appCsp } from './csp';

const csp = appCsp({ aiServer: 'https://ai.example.workers.dev', authDomain: 'demo.firebaseapp.com', site: 'https://site.example.dev' });
const directive = (name: string) => csp.split('; ').find(d => d.startsWith(`${name} `)) || '';

describe('the app safety rule (CSP)', () => {
  it('runs only our own code, plus the live chat microphone code made in the app', () => {
    expect(directive('script-src')).toBe("script-src 'self' blob: https://apis.google.com");
    expect(csp).not.toContain('unsafe-eval');
  });

  it('lets the app reach the AI server, live chat, Firebase, Drive, Sheets and the update notice', () => {
    const connect = directive('connect-src');
    for (const place of ['https://ai.example.workers.dev', 'wss://ai.example.workers.dev', 'https://identitytoolkit.googleapis.com',
      'https://securetoken.googleapis.com', 'https://firestore.googleapis.com', 'https://www.googleapis.com',
      'https://sheets.googleapis.com', 'https://site.example.dev']) {
      expect(connect).toContain(place);
    }
  });

  it('blocks plugins and form posts to other sites', () => {
    expect(directive('object-src')).toBe("object-src 'none'");
    expect(directive('form-action')).toBe("form-action 'self'");
  });

  it('still builds without an AI server address', () => {
    expect(appCsp({ authDomain: 'demo.firebaseapp.com', site: 'https://site.example.dev' })).not.toContain('wss://');
  });
});

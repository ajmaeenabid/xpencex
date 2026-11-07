import { describe, it, expect } from 'vitest';
import { savedLoginClaims } from './savedLogin';

const b64url = (text: string) => btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const token = (claims: object) => `${b64url('{"alg":"RS256"}')}.${b64url(JSON.stringify(claims))}.signature`;
const saved = (accessToken: unknown) => ({ uid: 'mim', stsTokenManager: { accessToken, refreshToken: 'r', expirationTime: 0 } });

describe('savedLoginClaims', () => {
  it('reads the device pass from an expired saved login, without the internet', () => {
    const claims = savedLoginClaims(saved(token({ sub: 'mim', user_id: 'mim', deviceId: 'phone-1', exp: 1 })), 'mim');
    expect(claims?.deviceId).toBe('phone-1');
  });

  it("ignores a login that belongs to someone else", () => {
    expect(savedLoginClaims(saved(token({ sub: 'zara', user_id: 'zara', deviceId: 'phone-1' })), 'mim')).toBeNull();
  });

  it('returns null for anything missing or broken', () => {
    for (const bad of [null, {}, saved(undefined), saved(42), saved(''), saved('abc'), saved('a.%%%.c'), saved(`a.${b64url('[1,2]')}.c`)]) {
      expect(savedLoginClaims(bad, 'mim')).toBeNull();
    }
  });

  it('reads names written in Bangla correctly', () => {
    const json = JSON.stringify({ sub: 'mim', name: 'মিম', deviceId: 'd' });
    const bytes = new TextEncoder().encode(json);
    const payload = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(savedLoginClaims(saved(`h.${payload}.s`), 'mim')?.name).toBe('মিম');
  });
});

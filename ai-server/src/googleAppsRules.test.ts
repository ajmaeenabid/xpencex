import { describe, expect, it } from 'vitest';
import { DRIVE_FILE_SCOPE, anyOn, appsAfter, grantedDriveFile, idTokenEmail, isGoogleApp, lockToken, sameAccount, unlockToken } from './googleAppsRules';

const b64url = (o: object) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const idToken = (payload: object) => `x.${b64url(payload)}.sig`;
const KEY = btoa(String.fromCharCode(...new Uint8Array(32).map((_, i) => i)));

describe('google apps rules', () => {
  it('knows the two apps only', () => {
    expect(isGoogleApp('drive')).toBe(true);
    expect(isGoogleApp('sheets')).toBe(true);
    expect(isGoogleApp('gmail')).toBe(false);
    expect(isGoogleApp(undefined)).toBe(false);
  });

  it('checks the Drive permission was really given', () => {
    expect(grantedDriveFile(`openid email ${DRIVE_FILE_SCOPE}`)).toBe(true);
    expect(grantedDriveFile('openid email')).toBe(false);
    expect(grantedDriveFile(`${DRIVE_FILE_SCOPE}.readonly`)).toBe(false);
    expect(grantedDriveFile(undefined)).toBe(false);
  });

  it('reads the email from the id token, lower-cased', () => {
    expect(idTokenEmail(idToken({ email: 'Me@Gmail.com', email_verified: true }))).toBe('me@gmail.com');
    expect(idTokenEmail(idToken({ email: 'me@gmail.com', email_verified: false }))).toBeNull();
    expect(idTokenEmail('not-a-token')).toBeNull();
    expect(idTokenEmail(42)).toBeNull();
  });

  it('allows only the account the person signed in with', () => {
    expect(sameAccount('me@gmail.com', 'Me@Gmail.com')).toBe(true);
    expect(sameAccount('other@gmail.com', 'me@gmail.com')).toBe(false);
    expect(sameAccount(null, 'me@gmail.com')).toBe(false);
    expect(sameAccount('me@gmail.com', undefined)).toBe(false);
  });

  it('removes the link once no app is left on', () => {
    const both = { drive: true, sheets: true };
    expect(anyOn(appsAfter(both, 'drive', false))).toBe(true);
    expect(anyOn(appsAfter({ drive: true, sheets: false }, 'drive', false))).toBe(false);
  });

  it('locks and unlocks the refresh token', async () => {
    const locked = await lockToken('1//refresh-token', KEY);
    expect(locked).not.toContain('refresh');
    expect(await unlockToken(locked, KEY)).toBe('1//refresh-token');
    const otherKey = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));
    await expect(unlockToken(locked, otherKey)).rejects.toThrow();
  });
});

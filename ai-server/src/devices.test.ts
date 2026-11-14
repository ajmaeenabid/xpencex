import { describe, it, expect } from 'vitest';
import { usernameProfileFields } from './devices';
import { mayAutoApprove } from './deviceRules';

describe('usernameProfileFields', () => {
  it('starts a new profile on the welcome slides', () => {
    const fields = usernameProfileFields('u1', 'abid', { email: 'a@example.com', now: '2026-11-11T00:00:00.000Z' });
    expect(fields).toEqual({
      uid: 'u1', username: 'abid', name: 'abid',
      email: 'a@example.com', currency: 'BDT', monthlyBudget: 5000,
      createdAt: '2026-11-11T00:00:00.000Z', welcome: 'slides',
    });
  });

  it('only changes the name on an existing profile, so the welcome step is left alone', () => {
    const fields = usernameProfileFields('u1', 'abid2', null);
    expect(fields).toEqual({ uid: 'u1', username: 'abid2', name: 'abid2' });
    expect('welcome' in fields).toBe(false);
  });
});

describe('mayAutoApprove', () => {
  const base = { deviceCount: 0, everHadDevice: false, isAdmin: false, setting: 'false' };

  it("lets a brand-new account's first device in when the setting allows it", () => {
    expect(mayAutoApprove(base)).toBe(true);
  });

  it('makes every other device wait for the admin', () => {
    expect(mayAutoApprove({ ...base, deviceCount: 1 })).toBe(false); // an extra phone
    expect(mayAutoApprove({ ...base, everHadDevice: true })).toBe(false); // all its devices were removed
    expect(mayAutoApprove({ ...base, setting: 'true' })).toBe(false); // approval switched back on
    expect(mayAutoApprove({ ...base, setting: undefined })).toBe(false); // not set means approval is needed
  });

  it("always lets the admin's own first device in", () => {
    expect(mayAutoApprove({ ...base, isAdmin: true, setting: 'true', everHadDevice: true })).toBe(true);
    expect(mayAutoApprove({ ...base, isAdmin: true, deviceCount: 1 })).toBe(false);
  });
});

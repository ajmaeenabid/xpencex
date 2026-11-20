import { describe, it, expect } from 'vitest';
import { usernameProblem } from './username';
// The server's own rules, shared with the app
import {
  canAskAgain, cleanUsername, deviceIdFor, deviceLabelFrom, firstDeviceNeedsApproval, isFreshGoogleSignIn, isReservedUsername, isValidUsername,
  proofMessage, usernameKey, verifyDeviceProof,
} from '../../../ai-server/src/deviceRules';

const toB64url = (bytes: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function makeProof(uid: string, signedAt = Date.now()) {
  const key = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
  const { x, y } = await crypto.subtle.exportKey('jwk', key.publicKey);
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key.privateKey, new TextEncoder().encode(proofMessage(uid, signedAt)));
  return { x: x!, y: y!, signedAt, signature: toB64url(signature) };
}

describe('device proof', () => {
  it('accepts a real signature and gives the device its id', async () => {
    const proof = await makeProof('alice');
    expect(await verifyDeviceProof('alice', proof)).toBe(await deviceIdFor('alice', proof.x, proof.y));
  });

  it('gives the same phone a different id for each account', async () => {
    const proof = await makeProof('alice');
    expect(await deviceIdFor('alice', proof.x, proof.y)).not.toBe(await deviceIdFor('bob', proof.x, proof.y));
  });

  it('refuses a proof signed for someone else', async () => {
    expect(await verifyDeviceProof('bob', await makeProof('alice'))).toBeNull();
  });

  it('refuses another device claiming the key', async () => {
    const mine = await makeProof('alice');
    const other = await makeProof('alice', mine.signedAt);
    expect(await verifyDeviceProof('alice', { ...mine, signature: other.signature })).toBeNull();
  });

  it('refuses an old proof and rubbish', async () => {
    const old = Date.now() - 2 * 3600_000;
    expect(await verifyDeviceProof('alice', await makeProof('alice', old))).toBeNull();
    expect(await verifyDeviceProof('alice', null)).toBeNull();
    expect(await verifyDeviceProof('alice', { x: 'a', y: 'b', signedAt: Date.now(), signature: 'c' })).toBeNull();
  });
});

describe('device approval settings', () => {
  it('turns off first-device approval only for the exact word "false"', () => {
    expect(firstDeviceNeedsApproval('true')).toBe(true);
    expect(firstDeviceNeedsApproval(undefined)).toBe(true);
    expect(firstDeviceNeedsApproval('flase')).toBe(true);
    expect(firstDeviceNeedsApproval('false')).toBe(false);
  });

  it('makes a refused device wait before asking again', () => {
    const now = Date.parse('2026-11-03T10:00:00.000Z');
    expect(canAskAgain('2026-11-03T09:59:30.000Z', now)).toBe(false);
    expect(canAskAgain('2026-11-03T09:57:00.000Z', now)).toBe(true);
    expect(canAskAgain(undefined, now)).toBe(true);
  });

  it('names devices with fixed words only', () => {
    expect(deviceLabelFrom('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36')).toBe('Android, Chrome');
    expect(deviceLabelFrom('Mozilla/5.0 (Linux; Android 14; wv) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36')).toBe('Android, App');
    expect(deviceLabelFrom('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Version/17.0 Mobile/15E148 Safari/604.1')).toBe('iPhone, Safari');
    expect(deviceLabelFrom('<b>trust me</b>')).toBe('Unknown device, Browser');
  });

  it('only counts a recent sign-in through Google as confirming', () => {
    const now = 1_000_000_000_000;
    const google = { sign_in_provider: 'google.com' };
    expect(isFreshGoogleSignIn({ firebase: google, auth_time: now / 1000 - 30 }, now)).toBe(true);
    expect(isFreshGoogleSignIn({ firebase: google, auth_time: now / 1000 - 600 }, now)).toBe(false);
    expect(isFreshGoogleSignIn({ firebase: { sign_in_provider: 'custom' }, auth_time: now / 1000 }, now)).toBe(false);
    expect(isFreshGoogleSignIn({ auth_time: now / 1000 }, now)).toBe(false);
  });
});

describe('usernames', () => {
  it('accepts names in English and Bangla', () => {
    for (const name of ['abid', 'Abid_19', 'a.b.c', 'আবিদ', 'রহিম২৩']) expect(isValidUsername(name), name).toBe(true);
  });

  it('refuses bad names', () => {
    for (const name of ['ab', 'has space', '_abid', 'a'.repeat(21), 'abid@mail', 'a/b', '01712345678', 'Admin', 'XPENCEX']) {
      expect(isValidUsername(name), name).toBe(false);
    }
  });

  it('refuses other alphabets and names that mix English and Bangla letters', () => {
    // Russian а and о, Greek ο, and an English-Bangla mix
    for (const name of ['аdmin', 'rоhim', 'abοd', 'rahimরহিম', 'আবিদabid']) expect(isValidUsername(name), name).toBe(false);
    // Digits of either kind go with either alphabet
    for (const name of ['rahim২৩', 'রহিম23', 'rahim_bd', 'রহিম.বিডি']) expect(isValidUsername(name), name).toBe(true);
  });

  it('catches look-alikes of reserved names', () => {
    for (const name of ['adm1n', 'ADMlN', 'supp0rt', 'xpence5', 'ad.min', 'x_pences', '0fficia1']) expect(isReservedUsername(name), name).toBe(true);
    for (const name of ['rahim2', 'admin2', 'helper', 'abid']) expect(isReservedUsername(name), name).toBe(false);
  });

  it('treats capital letters as the same name', () => {
    expect(usernameKey('  AbiD ')).toBe('abid');
    expect(cleanUsername('  AbiD ')).toBe('AbiD');
    expect(cleanUsername(5)).toBe('');
  });

  it('explains what is wrong with a name', () => {
    expect(usernameProblem('abid')).toBeNull();
    expect(usernameProblem('ab')).toBe('format');
    expect(usernameProblem('support')).toBe('reserved');
    expect(usernameProblem('otp 552190')).toBe('secret');
  });
});

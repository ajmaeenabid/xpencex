import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { verifyFirebaseToken } from './auth';

// A pretend Google: our own RSA keys, published the way Google publishes its public keys
const PROJECT = 'xpensex-test';
const now = () => Math.floor(Date.now() / 1000);

const b64url = (data: Uint8Array | string) =>
  btoa(typeof data === 'string' ? data : String.fromCharCode(...data)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const rsa = async () => (await crypto.subtle.generateKey(
  { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
  true,
  ['sign', 'verify'],
)) as CryptoKeyPair;

let google: CryptoKeyPair;
let stranger: CryptoKeyPair; // a key Google never published
let keyFetches = 0;

async function sign(payload: Record<string, unknown>, opts: { kid?: string; alg?: string; key?: CryptoKey } = {}) {
  const h = b64url(JSON.stringify({ alg: opts.alg ?? 'RS256', kid: opts.kid ?? 'google-key', typ: 'JWT' }));
  const p = b64url(JSON.stringify(payload));
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', opts.key ?? google.privateKey, new TextEncoder().encode(`${h}.${p}`));
  return `${h}.${p}.${b64url(new Uint8Array(sig))}`;
}

/** What a real Firebase login token for this project looks like */
const goodPayload = (extra: Record<string, unknown> = {}) => ({
  iss: `https://securetoken.google.com/${PROJECT}`,
  aud: PROJECT,
  sub: 'user-1',
  iat: now(),
  exp: now() + 3600,
  deviceId: 'phone-1',
  ...extra,
});

beforeAll(async () => {
  google = await rsa();
  stranger = await rsa();
  const jwk = await crypto.subtle.exportKey('jwk', google.publicKey);
  vi.stubGlobal('fetch', vi.fn(async () => {
    keyFetches++;
    return new Response(JSON.stringify({ keys: [{ ...jwk, kid: 'google-key' }] }));
  }));
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe('verifyFirebaseToken', () => {
  it('accepts a real token and returns the user and their claims', async () => {
    const result = await verifyFirebaseToken(await sign(goodPayload()), PROJECT);
    expect(result?.uid).toBe('user-1');
    expect(result?.claims.deviceId).toBe('phone-1');
  });

  it("refuses a token signed with a key that isn't Google's", async () => {
    expect(await verifyFirebaseToken(await sign(goodPayload(), { key: stranger.privateKey }), PROJECT)).toBeNull();
  });

  it('refuses a token whose contents were changed after signing', async () => {
    const [h, , sig] = (await sign(goodPayload())).split('.');
    const forged = b64url(JSON.stringify(goodPayload({ sub: 'someone-else' })));
    expect(await verifyFirebaseToken(`${h}.${forged}.${sig}`, PROJECT)).toBeNull();
  });

  it('refuses a device pass that was added after signing', async () => {
    const [h, , sig] = (await sign(goodPayload({ deviceId: undefined }))).split('.');
    const forged = b64url(JSON.stringify(goodPayload({ deviceId: 'stolen', adminUntil: now() + 600 })));
    expect(await verifyFirebaseToken(`${h}.${forged}.${sig}`, PROJECT)).toBeNull();
  });

  it('refuses an expired token, or one with no expiry', async () => {
    expect(await verifyFirebaseToken(await sign(goodPayload({ exp: now() - 1 })), PROJECT)).toBeNull();
    expect(await verifyFirebaseToken(await sign(goodPayload({ exp: undefined })), PROJECT)).toBeNull();
    expect(await verifyFirebaseToken(await sign(goodPayload({ exp: String(now() + 3600) })), PROJECT)).toBeNull();
  });

  it('refuses a token made for another Firebase project', async () => {
    expect(await verifyFirebaseToken(await sign(goodPayload({ aud: 'other-project' })), PROJECT)).toBeNull();
    expect(await verifyFirebaseToken(await sign(goodPayload({ iss: 'https://securetoken.google.com/other-project' })), PROJECT)).toBeNull();
    expect(await verifyFirebaseToken(await sign(goodPayload({ iss: 'https://evil.example.com' })), PROJECT)).toBeNull();
  });

  it('refuses a token with no user id', async () => {
    expect(await verifyFirebaseToken(await sign(goodPayload({ sub: '' })), PROJECT)).toBeNull();
    expect(await verifyFirebaseToken(await sign(goodPayload({ sub: undefined })), PROJECT)).toBeNull();
    expect(await verifyFirebaseToken(await sign(goodPayload({ sub: 42 })), PROJECT)).toBeNull();
  });

  it('refuses other signing methods and unknown key ids', async () => {
    expect(await verifyFirebaseToken(await sign(goodPayload(), { alg: 'none' }), PROJECT)).toBeNull();
    expect(await verifyFirebaseToken(await sign(goodPayload(), { alg: 'HS256' }), PROJECT)).toBeNull();
    expect(await verifyFirebaseToken(await sign(goodPayload(), { kid: 'made-up' }), PROJECT)).toBeNull();
  });

  it("refuses an unsigned token (alg 'none' with no signature)", async () => {
    const h = b64url(JSON.stringify({ alg: 'none', kid: 'google-key' }));
    const p = b64url(JSON.stringify(goodPayload()));
    expect(await verifyFirebaseToken(`${h}.${p}.`, PROJECT)).toBeNull();
    expect(await verifyFirebaseToken(`${h}.${p}`, PROJECT)).toBeNull();
  });

  it('returns null instead of crashing on rubbish', async () => {
    for (const junk of ['', 'abc', 'a.b.c', '...', '%%%.%%%.%%%', 'x'.repeat(5000)]) {
      expect(await verifyFirebaseToken(junk, PROJECT)).toBeNull();
    }
  });

  it("downloads Google's keys once, not on every request", async () => {
    const before = keyFetches;
    await verifyFirebaseToken(await sign(goodPayload()), PROJECT);
    await verifyFirebaseToken(await sign(goodPayload()), PROJECT);
    expect(keyFetches).toBe(before);
  });
});

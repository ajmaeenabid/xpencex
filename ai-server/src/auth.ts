// Moved unchanged from index.ts so it can be tested; index.ts imports it from here.
// ---------------------------------------------------------------------------
// Firebase login check: the app sends the user's ID token, we verify its signature
// against Google's public keys and return the user's id and claims.
// ---------------------------------------------------------------------------
const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
let jwksCache: { keys: (JsonWebKey & { kid: string })[]; expires: number } | null = null;

async function getKeys() {
  if (jwksCache && jwksCache.expires > Date.now()) return jwksCache.keys;
  const res = await fetch(JWKS_URL);
  const data = (await res.json()) as { keys: (JsonWebKey & { kid: string })[] };
  jwksCache = { keys: data.keys, expires: Date.now() + 60 * 60 * 1000 };
  return data.keys;
}

function b64urlToBytes(s: string) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=');
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

const decodeJson = (s: string) => JSON.parse(new TextDecoder().decode(b64urlToBytes(s)));

type Verified = { uid: string; claims: Record<string, unknown> };

export async function verifyFirebaseToken(token: string, projectId: string): Promise<Verified | null> {
  try {
    const [h, p, sig] = token.split('.');
    if (!h || !p || !sig) return null;
    const header = decodeJson(h);
    const payload = decodeJson(p);
    if (header.alg !== 'RS256') return null;

    const jwk = (await getKeys()).find((k) => k.kid === header.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlToBytes(sig), new TextEncoder().encode(`${h}.${p}`));
    if (!ok) return null;

    const now = Math.floor(Date.now() / 1000);
    if (payload.aud !== projectId || payload.iss !== `https://securetoken.google.com/${projectId}`) return null;
    if (typeof payload.exp !== 'number' || payload.exp < now) return null;
    return typeof payload.sub === 'string' && payload.sub ? { uid: payload.sub, claims: payload } : null;
  } catch {
    return null;
  }
}

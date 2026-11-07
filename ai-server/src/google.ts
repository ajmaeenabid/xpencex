// ---------------------------------------------------------------------------
// Trusted calls to Firebase as the project's service account (the "Admin" identity).
// The key lives only in the FIREBASE_SERVICE_ACCOUNT secret. These calls skip
// firestore.rules, so they are only used by the admin routes after the caller is checked.
// ---------------------------------------------------------------------------

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

let tokenCache: { token: string; expires: number } | null = null;

const b64url = (bytes: Uint8Array | string) =>
  btoa(typeof bytes === 'string' ? bytes : String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

async function signJwt(sa: ServiceAccount, payload: Record<string, unknown>) {
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify(payload));
  const pem = sa.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${claims}`)));
  return `${header}.${claims}.${b64url(sig)}`;
}

async function accessToken(serviceAccountJson: string): Promise<string> {
  if (tokenCache && tokenCache.expires > Date.now()) return tokenCache.token;
  const sa = JSON.parse(serviceAccountJson) as ServiceAccount;

  const now = Math.floor(Date.now() / 1000);
  const assertion = await signJwt(sa, {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  });

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  if (!res.ok) throw new Error(`Google token error ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache = { token: data.access_token, expires: Date.now() + (data.expires_in - 60) * 1000 };
  return data.access_token;
}

export interface AuthUser {
  localId: string;
  email?: string;
  disabled?: boolean;
  createdAt?: string; // milliseconds, as a string
  lastLoginAt?: string;
}

// How many documents one query reads at a time
const PAGE = 500;

// Collections that hold a user's data, each document tagged with their uid
const USER_COLLECTIONS = ['expenses', 'recurring', 'categories', 'accounts', 'deposits', 'chats', 'notices', 'loans', 'devices', 'deviceRequests', 'usernames', 'balanceHistory', 'debts', 'funds', 'samities'];

export type Fields = Record<string, string>;
type FirestoreDoc = { name?: string; fields?: Record<string, { stringValue?: string }> };
const fromFirestore = (doc: FirestoreDoc): Fields =>
  Object.fromEntries(Object.entries(doc.fields || {}).map(([k, v]) => [k, v.stringValue ?? '']));
const toFirestore = (fields: Fields) =>
  Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, { stringValue: v }]));

// Any Firestore value, for documents that hold numbers too (loans, accounts)
type Value = {
  stringValue?: string; integerValue?: string; doubleValue?: number; booleanValue?: boolean; nullValue?: null;
  timestampValue?: string; mapValue?: { fields?: Record<string, Value> }; arrayValue?: { values?: Value[] };
};
export type Plain = string | number | boolean | null | Plain[] | { [key: string]: Plain };

export function decode(v: Value): Plain {
  if (v.stringValue !== undefined) return v.stringValue;
  if (v.integerValue !== undefined) return Number(v.integerValue);
  if (v.doubleValue !== undefined) return v.doubleValue;
  if (v.booleanValue !== undefined) return v.booleanValue;
  if (v.timestampValue !== undefined) return v.timestampValue;
  if (v.mapValue) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, decode(x)]));
  if (v.arrayValue) return (v.arrayValue.values || []).map(decode);
  return null;
}

export function encode(v: Plain): Value {
  if (v === null) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encode) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, encode(x)])) } };
}

export const encodeFields = (data: Record<string, Plain>) =>
  Object.fromEntries(Object.entries(data).map(([k, v]) => [k, encode(v)]));

export interface TypedDoc {
  name: string; // full path, used for writes
  id: string;
  updateTime: string; // used so a write only applies if nobody changed the document meanwhile
  data: Record<string, Plain>;
}

export function google(serviceAccountJson: string, projectId: string) {
  const call = async <T>(url: string, body?: unknown, method = 'POST'): Promise<T> => {
    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${await accessToken(serviceAccountJson)}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Google API error ${res.status}: ${await res.text()}`);
    return (await res.json()) as T;
  };

  const authApi = `https://identitytoolkit.googleapis.com/v1/projects/${projectId}`;
  const dbPath = `projects/${projectId}/databases/(default)/documents`;
  const dbApi = `https://firestore.googleapis.com/v1/${dbPath}`;

  return {
    async listUsers(): Promise<AuthUser[]> {
      const users: AuthUser[] = [];
      let pageToken = '';
      do {
        const page = await call<{ users?: AuthUser[]; nextPageToken?: string }>(
          `${authApi}/accounts:batchGet?maxResults=500${pageToken ? `&nextPageToken=${encodeURIComponent(pageToken)}` : ''}`,
          undefined,
          'GET',
        );
        users.push(...(page.users || []));
        pageToken = page.nextPageToken || '';
      } while (pageToken);
      return users;
    },

    async getUser(uid: string): Promise<AuthUser | null> {
      const data = await call<{ users?: AuthUser[] }>(`${authApi}/accounts:lookup`, { localId: [uid] });
      return data.users?.[0] || null;
    },

    // validSince = now signs the user out of every device (their old sessions stop working)
    updateUser(uid: string, changes: { disableUser?: boolean; signOutEverywhere?: boolean }) {
      return call(`${authApi}/accounts:update`, {
        localId: uid,
        ...(changes.disableUser !== undefined && { disableUser: changes.disableUser }),
        ...(changes.signOutEverywhere && { validSince: String(Math.floor(Date.now() / 1000)) }),
      });
    },

    /** A one-time sign-in pass for this user. The claims travel in their login token, where firestore.rules can read them. */
    customToken(uid: string, claims: Record<string, unknown>) {
      const sa = JSON.parse(serviceAccountJson) as ServiceAccount;
      const now = Math.floor(Date.now() / 1000);
      return signJwt(sa, {
        iss: sa.client_email,
        sub: sa.client_email,
        aud: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',
        iat: now,
        exp: now + 3600,
        uid,
        claims,
      });
    },

    /** Adds a document with text fields only, e.g. an admin log entry */
    addDoc(collectionId: string, fields: Fields) {
      return call(`${dbApi}:commit`, {
        writes: [{
          update: { name: `${dbPath}/${collectionId}/${crypto.randomUUID()}`, fields: toFirestore(fields) },
          currentDocument: { exists: false },
        }],
      });
    },

    /** Creates or replaces a document with a known id */
    setDoc(collectionId: string, id: string, fields: Fields) {
      return call(`${dbApi}:commit`, { writes: [{ update: { name: `${dbPath}/${collectionId}/${id}`, fields: toFirestore(fields) } }] });
    },

    async getDoc(collectionId: string, id: string): Promise<Fields | null> {
      const rows = await call<{ document?: FirestoreDoc }[]>(`${dbApi}:runQuery`, {
        structuredQuery: {
          from: [{ collectionId }],
          where: { fieldFilter: { field: { fieldPath: '__name__' }, op: 'EQUAL', value: { referenceValue: `${dbPath}/${collectionId}/${id}` } } },
          limit: 1,
        },
      });
      const doc = rows.find((r) => r.document)?.document;
      return doc ? fromFirestore(doc) : null;
    },

    deleteDoc(collectionId: string, id: string) {
      return call(`${dbApi}:commit`, { writes: [{ delete: `${dbPath}/${collectionId}/${id}` }] });
    },

    /** Full path of a document, or of a new one with a random id */
    docName: (collectionId: string, id: string = crypto.randomUUID().replace(/-/g, '')) => `${dbPath}/${collectionId}/${id}`,

    /** Runs a query and returns documents with every field type */
    async query(structuredQuery: unknown): Promise<TypedDoc[]> {
      const rows = await call<{ document?: { name: string; updateTime: string; fields?: Record<string, Value> } }[]>(`${dbApi}:runQuery`, { structuredQuery });
      return rows.flatMap((r) => (r.document ? [{
        name: r.document.name,
        id: r.document.name.split('/').pop()!,
        updateTime: r.document.updateTime,
        data: Object.fromEntries(Object.entries(r.document.fields || {}).map(([k, v]) => [k, decode(v)])),
      }] : []));
    },

    async getTyped(collectionId: string, id: string): Promise<TypedDoc | null> {
      const docs = await this.query({
        from: [{ collectionId }],
        where: { fieldFilter: { field: { fieldPath: '__name__' }, op: 'EQUAL', value: { referenceValue: `${dbPath}/${collectionId}/${id}` } } },
        limit: 1,
      });
      return docs[0] || null;
    },

    /** Applies several writes together: all of them happen or none do */
    commit(writes: unknown[]) {
      return call(`${dbApi}:commit`, { writes });
    },

    /** Every document in a collection, read 500 at a time */
    async listAll(collectionId: string): Promise<Fields[]> {
      const all: Fields[] = [];
      let after: string | undefined;
      for (;;) {
        const rows = await call<{ document?: FirestoreDoc }[]>(`${dbApi}:runQuery`, {
          structuredQuery: {
            from: [{ collectionId }],
            orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }],
            ...(after && { startAt: { values: [{ referenceValue: after }], before: false } }),
            limit: PAGE,
          },
        });
        const docs = rows.flatMap((r) => (r.document ? [r.document] : []));
        all.push(...docs.map(fromFirestore));
        if (docs.length < PAGE || !docs[docs.length - 1].name) return all;
        after = docs[docs.length - 1].name;
      }
    },

    /** This user's documents in a collection whose fields are all text */
    async listByUid(collectionId: string, uid: string): Promise<Fields[]> {
      const rows = await call<{ document?: FirestoreDoc }[]>(`${dbApi}:runQuery`, {
        structuredQuery: {
          from: [{ collectionId }],
          where: { fieldFilter: { field: { fieldPath: 'uid' }, op: 'EQUAL', value: { stringValue: uid } } },
          limit: 100,
        },
      });
      return rows.flatMap((r) => (r.document ? [fromFirestore(r.document)] : []));
    },

    /** Newest documents first, sorted by their text field `at` (an ISO date) */
    async latest(collectionId: string, limit: number): Promise<Fields[]> {
      const rows = await call<{ document?: { fields?: Record<string, { stringValue?: string }> } }[]>(`${dbApi}:runQuery`, {
        structuredQuery: { from: [{ collectionId }], orderBy: [{ field: { fieldPath: 'at' }, direction: 'DESCENDING' }], limit },
      });
      return rows.flatMap((r) => (r.document ? [fromFirestore(r.document)] : []));
    },

    deleteLogin(uid: string) {
      return call(`${authApi}/accounts:delete`, { localId: uid });
    },

    /** Deletes every document the user owns, then their profile. Returns how many were removed. */
    async deleteUserData(uid: string): Promise<number> {
      let removed = 0;
      for (const collectionId of USER_COLLECTIONS) {
        for (;;) {
          const rows = await call<{ document?: { name: string } }[]>(`${dbApi}:runQuery`, {
            structuredQuery: {
              from: [{ collectionId }],
              where: { fieldFilter: { field: { fieldPath: 'uid' }, op: 'EQUAL', value: { stringValue: uid } } },
              select: { fields: [{ fieldPath: '__name__' }] },
              limit: 400,
            },
          });
          const names = rows.flatMap((r) => (r.document ? [r.document.name] : []));
          if (names.length === 0) break;
          await call(`${dbApi}:commit`, { writes: names.map((name) => ({ delete: name })) });
          removed += names.length;
        }
      }
      await call(`${dbApi}:commit`, { writes: [{ delete: `${dbPath}/users/${uid}` }] });
      return removed + 1;
    },
  };
}

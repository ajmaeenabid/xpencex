import { describe, it, expect, vi, beforeEach } from 'vitest';
import { proofMessage } from '../../../ai-server/src/deviceRules';
import { deviceIsApproved, handleDevice, handleUsername } from '../../../ai-server/src/devices';
import { handleAdmin, handleDeleteAccount } from '../../../ai-server/src/admin';

// The server's approval steps, run against a small pretend database
type Doc = Record<string, any>;
const db = new Map<string, Map<string, Doc>>();
const col = (name: string) => db.get(name) ?? db.set(name, new Map()).get(name)!;
const logins = new Map<string, { localId: string; email: string; disabled?: boolean }>();

vi.mock('../../../ai-server/src/google', async (original) => {
  const real = await original<typeof import('../../../ai-server/src/google')>();
  const pathOf = (name: string) => name.split('/') as [string, string];
  return {
    ...real,
    google: () => ({
      getDoc: async (c: string, id: string) => col(c).get(id) ?? null,
      setDoc: async (c: string, id: string, f: Doc) => void col(c).set(id, f),
      deleteDoc: async (c: string, id: string) => void col(c).delete(id),
      addDoc: async (c: string, f: Doc) => void col(c).set(crypto.randomUUID(), f),
      listByUid: async (c: string, uid: string) => [...col(c).values()].filter((d) => d.uid === uid),
      listAll: async (c: string) => [...col(c).values()],
      latest: async (c: string) => [...col(c).values()],
      getTyped: async (c: string, id: string) => (col(c).has(id) ? { data: col(c).get(id) } : null),
      customToken: async (uid: string, claims: Doc) => JSON.stringify({ uid, claims }),
      docName: (c: string, id: string) => `${c}/${id}`,
      getUser: async (uid: string) => logins.get(uid) ?? null,
      listUsers: async () => [...logins.values()],
      updateUser: async (uid: string, change: { disableUser?: boolean }) => void Object.assign(logins.get(uid)!, { disabled: change.disableUser }),
      deleteLogin: async (uid: string) => void logins.delete(uid),
      deleteUserData: async (uid: string) => {
        for (const c of ['devices', 'deviceRequests', 'usernames', 'notices']) {
          for (const [id, d] of col(c)) if (d.uid === uid) col(c).delete(id);
        }
        col('users').delete(uid);
        return 1;
      },
      commit: async (writes: any[]) => {
        for (const w of writes) {
          if (w.delete) { const [c, id] = pathOf(w.delete); col(c).delete(id); continue; }
          const [c, id] = pathOf(w.update.name);
          if (w.currentDocument?.exists === false && col(c).has(id)) throw new Error('ALREADY_EXISTS');
          const fields = Object.fromEntries(Object.entries(w.update.fields).map(([k, v]) => [k, real.decode(v as any)]));
          col(c).set(id, w.updateMask ? { ...col(c).get(id), ...fields } : fields);
        }
      },
    }),
  };
});

const env = { FIREBASE_PROJECT_ID: 'p', FIREBASE_SERVICE_ACCOUNT: '{}', ADMIN_UIDS: 'boss', REQUIRE_FIRST_DEVICE_APPROVAL: 'true' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const read = async (res: Response): Promise<Doc> => ({ status: res.status, ...(await res.json() as Doc) });
const b64 = (bytes: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** A pretend phone with its own secret key */
async function phone() {
  const key = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
  const { x, y } = await crypto.subtle.exportKey('jwk', key.publicKey);
  return async (uid: string) => {
    const signedAt = Date.now();
    const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key.privateKey, new TextEncoder().encode(proofMessage(uid, signedAt)));
    return { x, y, signedAt, signature: b64(sig) };
  };
}

const open = async (uid: string, p: Awaited<ReturnType<typeof phone>>, settings: Doc = env, path = '/device/open') =>
  read(await handleDevice(path, uid, { proof: await p(uid) }, 'Mozilla/5.0 (Linux; Android 14) Chrome/130.0 Safari/537.36', settings as typeof env, json));
const pick = async (uid: string, username: string, claims: Doc = {}) => read(await handleUsername(uid, claims, { username }, env, json));
const passFrom = (r: Doc) => JSON.parse(r.token).claims as Doc;

const noGoogle = async () => null;
const confirmed = async () => ({ firebase: { sign_in_provider: 'google.com' }, auth_time: Date.now() / 1000 });
const admin = async (path: string, body: Doc, claims: Doc = { deviceId: 'bossPhone', adminUntil: Date.now() / 1000 + 60 }, verify = noGoogle as any) =>
  read(await handleAdmin(path, 'boss', claims, body, env, json, async () => {}, verify));

describe('device approval, start to finish', () => {
  beforeEach(() => {
    db.clear();
    logins.clear();
    for (const uid of ['boss', 'mim', 'zara']) logins.set(uid, { localId: uid, email: `${uid}@gmail.com` });
  });

  it('asks for a username before anything else', async () => {
    expect((await open('mim', await phone())).status).toBe('needsUsername');
  });

  it('refuses a wrong device proof', async () => {
    const res = await read(await handleDevice('/device/open', 'mim', { proof: { x: 'a', y: 'b', signedAt: Date.now(), signature: 'c' } }, '', env, json));
    expect(res.status).toBe(400);
  });

  it("lets the admin's first device straight in, but makes the second one ask", async () => {
    await pick('boss', 'abid');
    const first = await open('boss', await phone());
    expect(first.status).toBe('approved');
    expect(passFrom(first).deviceId).toBe(first.deviceId);
    expect((await open('boss', await phone())).status).toBe('new');
  });

  it('makes a new user wait during testing, and lets them in once the setting is off', async () => {
    await pick('mim', 'mim_r');
    expect((await open('mim', await phone())).status).toBe('new');
    expect((await open('mim', await phone(), { ...env, REQUIRE_FIRST_DEVICE_APPROVAL: 'false' })).status).toBe('approved');
    // Only the first device: a second one asks, even with the setting off
    expect((await open('mim', await phone(), { ...env, REQUIRE_FIRST_DEVICE_APPROVAL: 'false' })).status).toBe('new');
  });

  it('never gives a pass before the admin approves, then opens by itself', async () => {
    await pick('mim', 'mim_r');
    const p = await phone();
    expect((await open('mim', p, env, '/device/request')).status).toBe('pending');
    const waiting = await open('mim', p);
    expect(waiting.status).toBe('pending');
    expect(waiting.token).toBeUndefined();

    const { users } = await admin('/admin/users', {});
    const row = users.find((u: Doc) => u.uid === 'mim');
    expect(row.username).toBe('mim_r');
    expect(row.email).toBe('mim@gmail.com');
    expect(row.deviceRequest.label).toBe('Android, Chrome');

    expect((await admin('/admin/device-approve', { uid: 'mim', requestId: row.deviceRequest.id, replace: [] })).status).toBe(200);
    const opened = await open('mim', p);
    expect(opened.status).toBe('approved');
    expect(await deviceIsApproved('mim', passFrom(opened), env)).toBe(true);
    expect([...col('notices').values()].some((n) => n.uid === 'mim' && n.type === 'deviceApproved')).toBe(true);
  });

  it('can replace a lost phone while approving, which locks the old one out', async () => {
    await pick('mim', 'mim_r');
    const oldPhone = await phone();
    const newPhone = await phone();
    await open('mim', oldPhone, env, '/device/request');
    const first = (await admin('/admin/users', {})).users.find((u: Doc) => u.uid === 'mim').deviceRequest.id;
    await admin('/admin/device-approve', { uid: 'mim', requestId: first, replace: [] });
    const oldPass = passFrom(await open('mim', oldPhone));

    await open('mim', newPhone, env, '/device/request');
    const second = (await admin('/admin/users', {})).users.find((u: Doc) => u.uid === 'mim').deviceRequest.id;
    await admin('/admin/device-approve', { uid: 'mim', requestId: second, replace: [first] });

    expect(await deviceIsApproved('mim', oldPass, env)).toBe(false);
    expect((await open('mim', oldPhone)).status).toBe('new');
    expect((await open('mim', newPhone)).status).toBe('approved');
  });

  it('lets a refused device ask again only after a wait', async () => {
    await pick('mim', 'mim_r');
    const p = await phone();
    await open('mim', p, env, '/device/request');
    const id = (await admin('/admin/users', {})).users.find((u: Doc) => u.uid === 'mim').deviceRequest.id;
    await admin('/admin/device-refuse', { uid: 'mim', requestId: id });
    expect((await open('mim', p)).status).toBe('refused');
    expect((await open('mim', p, env, '/device/request')).status).toBe(429);
  });

  it('removes a device at once, but never the one the admin is using', async () => {
    await pick('boss', 'abid');
    const mine = await open('boss', await phone());
    const claims = { ...passFrom(mine), adminUntil: Date.now() / 1000 + 60 };
    expect((await admin('/admin/device-remove', { uid: 'boss', deviceId: mine.deviceId }, claims)).status).toBe(400);
    expect(col('devices').has(mine.deviceId)).toBe(true);
  });

  it("doesn't count a pass for someone else's device", async () => {
    await pick('boss', 'abid');
    const mine = await open('boss', await phone());
    expect(await deviceIsApproved('mim', passFrom(mine), env)).toBe(false);
    expect(await deviceIsApproved('mim', {}, env)).toBe(false);
  });
});

describe('admin confirmation', () => {
  beforeEach(() => {
    db.clear();
    logins.clear();
    logins.set('boss', { localId: 'boss', email: 'boss@gmail.com' });
    logins.set('mim', { localId: 'mim', email: 'mim@gmail.com' });
  });

  it('keeps non-admins out', async () => {
    const res = await read(await handleAdmin('/admin/users', 'mim', { deviceId: 'x', adminUntil: Date.now() / 1000 + 60 }, {}, env, json, async () => {}, noGoogle));
    expect(res.status).toBe(403);
  });

  it('needs a Google confirmation, which runs out', async () => {
    expect((await admin('/admin/users', {}, { deviceId: 'x' })).status).toBe(401);
    expect((await admin('/admin/users', {}, { deviceId: 'x', adminUntil: Date.now() / 1000 - 1 })).status).toBe(401);
    expect((await admin('/admin/unlock', { googleToken: 't' }, { deviceId: 'x' })).status).toBe(401);
    const unlocked = await admin('/admin/unlock', { googleToken: 't' }, { deviceId: 'x' }, confirmed);
    expect(passFrom(unlocked).deviceId).toBe('x');
    expect(passFrom(unlocked).adminUntil).toBeGreaterThan(Date.now() / 1000);
  });

  it('protects the admin account from suspend and delete', async () => {
    expect((await admin('/admin/suspend', { uid: 'boss', suspended: true })).status).toBe(400);
    expect((await admin('/admin/delete', { uid: 'boss', confirm: 'boss@gmail.com' })).status).toBe(400);
  });

  it('needs the exact name to delete', async () => {
    await pick('mim', 'mim_r');
    expect((await admin('/admin/delete', { uid: 'mim', confirm: 'wrong' })).status).toBe(400);
    expect((await admin('/admin/delete', { uid: 'mim', confirm: 'mim_r' })).status).toBe(200);
    expect(logins.has('mim')).toBe(false);
  });
});

describe('usernames and deleting your own account', () => {
  beforeEach(() => {
    db.clear();
    logins.clear();
    for (const uid of ['boss', 'mim', 'zara']) logins.set(uid, { localId: uid, email: `${uid}@gmail.com` });
  });

  it('keeps names unique, ignoring capital letters', async () => {
    expect((await pick('mim', 'Rahim')).username).toBe('Rahim');
    expect((await pick('zara', 'rahim')).status).toBe(409);
    expect((await pick('zara', 'bad name')).status).toBe(400);
    expect((await pick('zara', 'admin')).status).toBe(400);
  });

  it('creates the profile with the first name', async () => {
    await pick('mim', 'Rahim');
    expect(col('users').get('mim')).toMatchObject({ uid: 'mim', username: 'Rahim', name: 'Rahim', email: 'mim@gmail.com', currency: 'BDT' });
  });

  it('frees the old name after a change, which needs an approved device', async () => {
    await pick('mim', 'Rahim');
    expect((await pick('mim', 'Karim')).status).toBe(403); // no approved device yet
    col('devices').set('d', { id: 'd', uid: 'mim', label: 'x', at: 'y' });
    expect((await pick('mim', 'Karim', { deviceId: 'd' })).username).toBe('Karim');
    expect(col('users').get('mim')!.username).toBe('Karim');
    expect((await pick('zara', 'rahim')).username).toBe('rahim');
    // Keeping your own name with new capitals is fine
    expect((await pick('mim', 'KARIM', { deviceId: 'd' })).username).toBe('KARIM');
  });

  it('deletes your own account only after a Google confirmation', async () => {
    await pick('mim', 'Rahim');
    expect((await read(await handleDeleteAccount('mim', {}, env, json, async () => {}, noGoogle))).status).toBe(401);
    expect(logins.has('mim')).toBe(true);
    expect((await read(await handleDeleteAccount('mim', {}, env, json, async () => {}, confirmed as any))).status).toBe(200);
    expect(logins.has('mim')).toBe(false);
    expect(col('usernames').size).toBe(0);
  });

  it("won't delete the admin's own account", async () => {
    expect((await read(await handleDeleteAccount('boss', {}, env, json, async () => {}, confirmed as any))).status).toBe(400);
    expect(logins.has('boss')).toBe(true);
  });
});

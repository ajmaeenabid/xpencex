import { google, AuthUser, encodeFields } from './google';
import { deleteErrorReports, listErrorReports } from './errorReports';
import { isFreshGoogleSignIn } from './deviceRules';
import { healthView } from './health';

export interface AdminEnv {
  FIREBASE_PROJECT_ID: string;
  FIREBASE_SERVICE_ACCOUNT?: string;
  ADMIN_UIDS?: string;
}

type Json = (body: unknown, status?: number) => Response;
type G = ReturnType<typeof google>;
type VerifyGoogle = (token: unknown) => Promise<Record<string, unknown> | null>;

export const adminUids = (env: AdminEnv) =>
  (env.ADMIN_UIDS || '').split(',').map((id) => id.trim()).filter(Boolean);

// How long after confirming with Google the admin may make changes
const CONFIRM_SECONDS = 10 * 60;

type Action = 'suspended' | 'restored' | 'delete' | 'deviceApproved' | 'deviceRefused' | 'deviceRemoved';

/** The username the user chose, or their Gmail address if they haven't picked one yet */
async function nameOf(g: G, target: AuthUser) {
  const [name] = await g.listByUid('usernames', target.localId);
  return name?.username || target.email || target.localId;
}

/** Removes a person completely: their login and everything they saved */
async function removeUser(g: G, uid: string, onDeleted: (uid: string) => Promise<void>) {
  // Block the login first, so nothing new is written while the data is removed
  await g.updateUser(uid, { disableUser: true, signOutEverywhere: true });
  // Before the data goes: daily counts, and the Google link (it must be revoked while its token is still there)
  await onDeleted(uid);
  const removed = await g.deleteUserData(uid);
  await g.deleteLogin(uid);
  await forgetInLog(g, uid);
  return removed;
}

/** The admin log keeps what happened and when, but nothing that says who, once a person is deleted */
async function forgetInLog(g: G, uid: string) {
  const entries = await g.query({
    from: [{ collectionId: 'adminLog' }],
    where: { fieldFilter: { field: { fieldPath: 'targetUid' }, op: 'EQUAL', value: { stringValue: uid } } },
    limit: 500,
  });
  if (entries.length === 0) return;
  await g.commit(entries.map((e) => ({
    update: { name: e.name, fields: encodeFields({ targetUid: '', username: '' }) },
    updateMask: { fieldPaths: ['targetUid', 'username'] },
  })));
}

/**
 * Admin routes. Only uids listed in ADMIN_UIDS (a server setting the app can't change) get in.
 * They return login details only, plus the comments people chose to send the admin:
 * never expenses, accounts, chats or settings.
 */
export async function handleAdmin(path: string, callerUid: string, claims: Record<string, unknown>, body: Record<string, unknown>, env: AdminEnv, json: Json, onDeleted: (uid: string) => Promise<void>, verifyGoogle: VerifyGoogle) {
  const admins = adminUids(env);
  const isAdmin = admins.includes(callerUid);
  if (path === '/admin/me') return json({ admin: isAdmin });
  if (!isAdmin) return json({ error: 'Not allowed.' }, 403);
  if (!env.FIREBASE_SERVICE_ACCOUNT) return json({ error: 'The admin key is not set up on the server.' }, 500);

  const g = google(env.FIREBASE_SERVICE_ACCOUNT, env.FIREBASE_PROJECT_ID);

  // The admin confirms with Google, and this device's pass then carries the time that confirmation ends
  if (path === '/admin/unlock') {
    const fresh = await verifyGoogle(body.googleToken);
    if (!fresh || !isFreshGoogleSignIn(fresh)) return json({ error: 'Please confirm with Google.', reauth: true }, 401);
    return json({ token: await g.customToken(callerUid, { deviceId: claims.deviceId, adminUntil: Math.floor(Date.now() / 1000) + CONFIRM_SECONDS }) });
  }

  // So a phone left signed in can't be used to make changes
  const adminUntil = typeof claims.adminUntil === 'number' ? claims.adminUntil : 0;
  if (Date.now() / 1000 > adminUntil) return json({ error: 'Please confirm with Google.', reauth: true }, 401);

  // Every change goes into adminLog (nobody can read or edit it from the app; the admin sees it through
  // /admin/log). Users get a notice in their Profile, except for a delete, which removes them.
  const record = async (action: Action, target: AuthUser, username: string) => {
    const at = new Date().toISOString();
    try {
      // A delete is logged without the person's id or name (the app shows "Deleted user")
      const forgotten = action === 'delete';
      await g.addDoc('adminLog', { action, adminUid: callerUid, targetUid: forgotten ? '' : target.localId, username: forgotten ? '' : username, at });
      if (action !== 'delete') await g.addDoc('notices', { uid: target.localId, type: action, at });
    } catch (err) {
      console.error('Could not write the admin log', action, target.localId, err);
    }
  };

  // When the hourly jobs last ran, and whether they failed
  if (path === '/admin/health') {
    const health = await g.getTyped('meta', 'health');
    return json({ health: healthView(health?.data ?? null) });
  }

  // Error reports from people's phones (src/errorReports.ts), newest first, with the username only
  if (path === '/admin/errors') return json({ reports: await listErrorReports(g) });
  if (path === '/admin/errors/delete') {
    if (body.all === true) return json({ removed: await deleteErrorReports(g) });
    if (typeof body.id !== 'string' || !/^[a-f0-9]{32}$/.test(body.id)) return json({ error: 'Bad request.' }, 400);
    await g.deleteDoc('errorReports', body.id);
    return json({ removed: 1 });
  }

  if (path === '/admin/log') {
    const entries = await g.latest('adminLog', 50);
    return json({ entries: entries.map(({ action, username, at }) => ({ action, username, at })) });
  }

  // Comments people sent from Profile > Send feedback, newest first, with who sent them
  if (path === '/admin/comments') {
    const [docs, names, users] = await Promise.all([
      g.query({ from: [{ collectionId: 'feedback' }], orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' }], limit: 500 }),
      g.listAll('usernames'),
      g.listUsers(),
    ]);
    const usernames = new Map(names.map((n) => [n.uid, n.username]));
    const emails = new Map(users.map((u) => [u.localId, u.email || '']));
    return json({
      comments: docs.map((d) => {
        const uid = String(d.data.uid || '');
        return { id: d.id, uid, username: usernames.get(uid) || '', email: emails.get(uid) || '', text: String(d.data.text || ''), at: String(d.data.createdAt || '') };
      }),
    });
  }

  if (path === '/admin/users') {
    const [users, names, devices, requests] = await Promise.all([g.listUsers(), g.listAll('usernames'), g.listAll('devices'), g.listAll('deviceRequests')]);
    const usernames = new Map(names.map((n) => [n.uid, n.username]));
    const open = new Map(requests.filter((r) => r.status === 'pending').map((r) => [r.uid, { id: r.id, label: r.label, at: r.at }]));
    return json({
      users: users.map((u) => ({
        uid: u.localId,
        username: usernames.get(u.localId) || '',
        email: u.email || '',
        createdAt: Number(u.createdAt) || null,
        lastLoginAt: Number(u.lastLoginAt) || null,
        disabled: !!u.disabled,
        isAdmin: admins.includes(u.localId),
        devices: devices.filter((d) => d.uid === u.localId).map((d) => ({ id: d.id, label: d.label, at: d.at })),
        deviceRequest: open.get(u.localId) || null,
      })),
    });
  }

  // Every other route acts on one user, who must exist
  const uid = typeof body.uid === 'string' ? body.uid : '';
  if (!uid) return json({ error: 'Bad request.' }, 400);
  const target = await g.getUser(uid);
  if (!target) return json({ error: 'That user no longer exists.' }, 404);
  const username = await nameOf(g, target);

  // These also work on the admin's own account, so the admin can add a second device
  if (path === '/admin/device-approve' || path === '/admin/device-refuse') {
    const requestId = typeof body.requestId === 'string' ? body.requestId : '';
    const request = requestId ? await g.getDoc('deviceRequests', requestId) : null;
    if (request?.uid !== uid || request.status !== 'pending') return json({ error: 'That request is no longer waiting.' }, 400);

    if (path === '/admin/device-refuse') {
      await g.setDoc('deviceRequests', requestId, { ...request, status: 'refused', decidedAt: new Date().toISOString() });
      await record('deviceRefused', target, username);
      return json({ ok: true });
    }

    // The admin may swap out old devices at the same time, for example after a lost phone
    const replace = Array.isArray(body.replace) ? body.replace.filter((id): id is string => typeof id === 'string') : [];
    const mine = new Set((await g.listByUid('devices', uid)).map((d) => d.id));
    if (replace.some((id) => !mine.has(id) || id === claims.deviceId)) return json({ error: 'Bad request.' }, 400);
    await g.commit([
      { update: { name: g.docName('devices', requestId), fields: encodeFields({ id: requestId, uid, label: request.label, at: new Date().toISOString() }) } },
      // From now on this account's new devices always need approval (see mayAutoApprove in deviceRules.ts)
      { update: { name: g.docName('deviceHistory', uid), fields: encodeFields({ uid, firstDeviceAt: new Date().toISOString() }) } },
      { delete: g.docName('deviceRequests', requestId) },
      ...replace.map((id) => ({ delete: g.docName('devices', id) })),
    ]);
    await record('deviceApproved', target, username);
    return json({ ok: true });
  }

  if (path === '/admin/device-remove') {
    const deviceId = typeof body.deviceId === 'string' ? body.deviceId : '';
    const device = deviceId ? await g.getDoc('devices', deviceId) : null;
    if (device?.uid !== uid) return json({ error: 'That device is no longer listed.' }, 400);
    if (deviceId === claims.deviceId) return json({ error: "You can't remove the device you are using." }, 400);
    await g.deleteDoc('devices', deviceId);
    await record('deviceRemoved', target, username);
    return json({ ok: true });
  }

  // The rest can't be used on an admin (you can't lock yourself out)
  if (admins.includes(uid)) return json({ error: "Admin accounts can't be changed here." }, 400);

  if (path === '/admin/suspend') {
    const suspended = body.suspended === true;
    await g.updateUser(uid, { disableUser: suspended, signOutEverywhere: suspended });
    await record(suspended ? 'suspended' : 'restored', target, username);
    return json({ ok: true });
  }

  if (path === '/admin/delete') {
    // The app asks the admin to type the name; check it here too, so a slip can't delete the wrong person
    if (body.confirm !== username) return json({ error: "The username doesn't match." }, 400);
    const removed = await removeUser(g, uid, onDeleted);
    await record('delete', target, username);
    return json({ ok: true, removed });
  }

  return json({ error: 'Not found.' }, 404);
}

/** A person deletes their own account from Profile, after confirming with Google. Google Play requires this. */
export async function handleDeleteAccount(uid: string, body: Record<string, unknown>, env: AdminEnv, json: Json, onDeleted: (uid: string) => Promise<void>, verifyGoogle: VerifyGoogle) {
  if (!env.FIREBASE_SERVICE_ACCOUNT) return json({ error: 'The server is not set up.' }, 500);
  const fresh = await verifyGoogle(body.googleToken);
  if (!fresh || !isFreshGoogleSignIn(fresh)) return json({ error: 'Please confirm with Google.', reauth: true }, 401);
  if (adminUids(env).includes(uid)) return json({ error: 'admin' }, 400);
  await removeUser(google(env.FIREBASE_SERVICE_ACCOUNT, env.FIREBASE_PROJECT_ID), uid, onDeleted);
  return json({ ok: true });
}

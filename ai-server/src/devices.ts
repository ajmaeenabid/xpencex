import { google, encodeFields } from './google';
import { MailEnv, mailLanguage, sendWelcomeEmail } from './welcomeEmail';
import { adminUids } from './admin';
import type { AdminEnv } from './admin';
import { OPEN_REQUESTS_LIMIT, canAskAgain, isActiveDevice, cleanUsername, deviceLabelFrom, mayAutoApprove, isValidUsername, usernameKey, verifyDeviceProof } from './deviceRules';

// ---------------------------------------------------------------------------
// Which devices may use an account.
//
// 1. On first sign-in a device makes a secret key that never leaves it. It proves it holds the key
//    by signing a short message.
// 2. An approved device gets a sign-in pass (a custom token) carrying its id. firestore.rules and
//    this server refuse anyone without a pass whose device is still listed in devices/{id}, so
//    signing in with Google alone shows no data.
// 3. A new device asks for permission. The request waits in deviceRequests/{id} for the admin.
//
// Both collections are written only by this server; see firestore.rules.
// ---------------------------------------------------------------------------

export interface DeviceEnv extends AdminEnv {
  REQUIRE_FIRST_DEVICE_APPROVAL?: string;
}

type Json = (body: unknown, status?: number) => Response;

/** Every route except /device/* needs a pass from a device that is still approved */
export async function deviceIsApproved(uid: string, claims: Record<string, unknown>, env: AdminEnv) {
  if (typeof claims.deviceId !== 'string' || !claims.deviceId || !env.FIREBASE_SERVICE_ACCOUNT) return false;
  // getTyped, not getDoc: `paused` is a true/false value, which getDoc would read as text
  const device = await google(env.FIREBASE_SERVICE_ACCOUNT, env.FIREBASE_PROJECT_ID).getTyped('devices', claims.deviceId);
  return isActiveDevice(device?.data, uid);
}

export async function handleDevice(path: string, uid: string, body: Record<string, unknown>, userAgent: string, env: DeviceEnv, json: Json) {
  if (!env.FIREBASE_SERVICE_ACCOUNT) return json({ error: 'Device approval is not set up on the server.' }, 500);
  const g = google(env.FIREBASE_SERVICE_ACCOUNT, env.FIREBASE_PROJECT_ID);
  const deviceId = await verifyDeviceProof(uid, body.proof);
  if (!deviceId) return json({ error: 'Bad request.' }, 400);

  const approved = async () => json({ status: 'approved', deviceId, token: await g.customToken(uid, { deviceId }) });

  // The admin sees the username beside each request, so it is chosen before anything else
  const names = await g.listByUid('usernames', uid);
  if (names.length === 0) return json({ status: 'needsUsername' });

  const device = (await g.getTyped('devices', deviceId))?.data;
  // A suspended account's phones are paused: the app signs out and says the account is paused
  if (device?.uid === uid && device.paused === true) return json({ status: 'paused' });
  if (isActiveDevice(device, uid)) {
    // Accounts approved before the history existed get it now (see mayAutoApprove)
    if (path === '/device/open') await rememberFirstDevice(g, uid).catch((err) => console.error('Could not save device history', err));
    return approved();
  }

  const label = deviceLabelFrom(userAgent);
  const request = await g.getDoc('deviceRequests', deviceId);

  if (path === '/device/open') {
    // Nobody could approve the admin's first device, so it never waits. This is also how the admin
    // recovers a lost phone: delete their devices documents in Firebase Console and sign in again.
    const devices = await g.listByUid('devices', uid);
    const everHadDevice = !!(await g.getDoc('deviceHistory', uid));
    if (mayAutoApprove({ deviceCount: devices.length, everHadDevice, isAdmin: adminUids(env).includes(uid), setting: env.REQUIRE_FIRST_DEVICE_APPROVAL })) {
      await g.setDoc('devices', deviceId, { id: deviceId, uid, label, at: new Date().toISOString() });
      await rememberFirstDevice(g, uid);
      if (request) await g.deleteDoc('deviceRequests', deviceId);
      return approved();
    }
    return json({ status: request?.status === 'refused' ? 'refused' : request ? 'pending' : 'new' });
  }

  if (path === '/device/request') {
    if (request?.status === 'pending') return json({ status: 'pending' });
    if (request && !canAskAgain(request.decidedAt)) return json({ error: 'Please wait a couple of minutes before asking again.' }, 429);
    const waiting = (await g.listByUid('deviceRequests', uid)).filter((r) => r.status === 'pending');
    if (waiting.length >= OPEN_REQUESTS_LIMIT) return json({ error: 'Too many requests are waiting.' }, 429);
    await g.setDoc('deviceRequests', deviceId, { id: deviceId, uid, label, status: 'pending', at: new Date().toISOString() });
    return json({ status: 'pending' });
  }

  return json({ error: 'Not found.' }, 404);
}

/**
 * What the username step writes to users/{uid}. A new user picks a username before their phone is approved,
 * so this is usually where their profile is first made. A new profile gets `welcome: 'slides'` so the app
 * shows the welcome slides and the button tour, the same as when the app makes the profile itself.
 * `newProfile` is null when the profile already exists: then only the name changes.
 */
export function usernameProfileFields(uid: string, username: string, newProfile: { email: string; now: string } | null) {
  return {
    uid, username, name: username,
    ...(newProfile && {
      email: newProfile.email, currency: 'BDT', monthlyBudget: 5000, createdAt: newProfile.now, welcome: 'slides',
    }),
  };
}

/** Sets or changes the username. Each name has one usernames/{name} document, which keeps names unique. */
/**
 * Saves the username. A brand-new account's first one also sends the welcome email (src/welcomeEmail.ts), in the
 * background through `later` (the Worker's waitUntil), so saving never waits on Gmail and never fails because of it.
 */
export async function handleUsername(uid: string, claims: Record<string, unknown>, body: Record<string, unknown>, env: AdminEnv & MailEnv, json: Json, later?: (job: Promise<unknown>) => void) {
  if (!env.FIREBASE_SERVICE_ACCOUNT) return json({ error: 'The server is not set up.' }, 500);
  const g = google(env.FIREBASE_SERVICE_ACCOUNT, env.FIREBASE_PROJECT_ID);
  const username = cleanUsername(body.username);
  if (!isValidUsername(username)) return json({ error: 'invalid' }, 400);

  const key = usernameKey(username);
  const [mine] = await g.listByUid('usernames', uid);
  // Choosing the first one happens before approval; changing it needs an approved device
  if (mine && !(await deviceIsApproved(uid, claims, env))) return json({ error: 'Not allowed.' }, 403);

  const owner = await g.getDoc('usernames', key);
  if (owner && owner.uid !== uid) return json({ error: 'taken' }, 409);

  const profile = await g.getTyped('users', uid);
  const login = profile ? null : await g.getUser(uid);
  const fields = usernameProfileFields(uid, username, profile ? null : { email: login?.email || '', now: new Date().toISOString() });

  try {
    await g.commit([
      {
        update: { name: g.docName('usernames', key), fields: encodeFields({ uid, username }) },
        // If two people pick the same free name at once, only one of these succeeds
        ...(!owner && { currentDocument: { exists: false } }),
      },
      ...(mine && usernameKey(mine.username) !== key ? [{ delete: g.docName('usernames', usernameKey(mine.username)) }] : []),
      { update: { name: g.docName('users', uid), fields: encodeFields(fields) }, updateMask: { fieldPaths: Object.keys(fields) } },
    ]);
  } catch (err) {
    if (err instanceof Error && /ALREADY_EXISTS|FAILED_PRECONDITION/.test(err.message)) return json({ error: 'taken' }, 409);
    throw err;
  }
  if (!mine && later) {
    const email = typeof claims.email === 'string' ? claims.email : login?.email || '';
    later(sendWelcomeEmail(env, email, username, mailLanguage(body.lang, username))
      .then((sent) => { if (sent) console.log('Welcome email sent'); })
      .catch((err) => console.error('Welcome email failed', err)));
  }
  return json({ username });
}

/**
 * Records that this account has had a device (deviceHistory/{uid}; only this server reads or writes it).
 * From then on a new device always waits for the admin, even when the account has no devices left.
 */
export async function rememberFirstDevice(g: ReturnType<typeof google>, uid: string) {
  if (await g.getDoc('deviceHistory', uid)) return;
  await g.setDoc('deviceHistory', uid, { uid, firstDeviceAt: new Date().toISOString() });
}

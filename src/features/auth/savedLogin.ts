/**
 * The claims (such as the device pass) inside the login this phone saved, read without renewing it.
 * Renewing needs the internet, so this is how an approved phone still opens offline. It only unlocks
 * the screens: the data is the copy already on the phone, and the server checks everything once online.
 * `userJson` is Firebase's `user.toJSON()`.
 */
export function savedLoginClaims(userJson: unknown, uid: string): Record<string, unknown> | null {
  const token = (userJson as { stsTokenManager?: { accessToken?: unknown } } | null)?.stsTokenManager?.accessToken;
  if (typeof token !== 'string') return null;
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '=');
    const claims = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))));
    if (!claims || typeof claims !== 'object') return null;
    // Only this user's own login counts
    return claims.sub === uid || claims.user_id === uid ? claims : null;
  } catch {
    return null;
  }
}

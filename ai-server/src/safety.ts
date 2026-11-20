// Headers every reply from this server carries (security review item 5, 2026-11-20).
// nosniff: browsers must use the type we send and never guess, so a receipt or text can't be run as a page.

export const SAFETY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
};

/** The same reply with the safety headers added. A live chat connection (101) is returned untouched. */
export function withSafetyHeaders(res: Response): Response {
  if (res.status === 101 || (res as Response & { webSocket?: unknown }).webSocket) return res;
  const headers = new Headers(res.headers);
  for (const [name, value] of Object.entries(SAFETY_HEADERS)) headers.set(name, value);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

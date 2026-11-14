import { auth } from '../firebase';

// Same server as the AI chat (see /ai-server). It checks the login token on every call.
const BASE = ((import.meta.env.VITE_AI_WORKER_URL as string | undefined) || '').replace(/\/+$/, '');

export class WorkerError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/**
 * POSTs to a route on our server with the signed-in user's token and returns the raw reply.
 * Used directly for files (receipts); callWorker below is the usual JSON version.
 */
export async function workerFetch(path: string, body: BodyInit, contentType: string, { signedIn = true } = {}): Promise<Response> {
  const token = signedIn ? await auth.currentUser?.getIdToken() : undefined;
  if (signedIn && !token) throw new WorkerError(401, 'Not signed in');
  if (!BASE) throw new WorkerError(0, 'VITE_AI_WORKER_URL is not set');
  try {
    return await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': contentType, ...(token && { Authorization: `Bearer ${token}` }) },
      body,
    });
  } catch {
    throw new WorkerError(-1, 'Server unreachable');
  }
}

/** POSTs to a route on our server with the signed-in user's token and returns the JSON reply */
export async function callWorker<T>(path: string, body: object = {}, options: { signedIn?: boolean } = {}): Promise<T> {
  const res = await workerFetch(path, JSON.stringify(body), 'application/json', options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new WorkerError(res.status, data.error || res.statusText);
  return data as T;
}

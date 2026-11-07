import { auth } from '../firebase';

// Same server as the AI chat (see /ai-server). It checks the login token on every call.
const BASE = ((import.meta.env.VITE_AI_WORKER_URL as string | undefined) || '').replace(/\/+$/, '');

export class WorkerError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** POSTs to a route on our server with the signed-in user's token and returns the JSON reply */
export async function callWorker<T>(path: string, body: object = {}, { signedIn = true } = {}): Promise<T> {
  const token = signedIn ? await auth.currentUser?.getIdToken() : undefined;
  if (signedIn && !token) throw new WorkerError(401, 'Not signed in');
  if (!BASE) throw new WorkerError(0, 'VITE_AI_WORKER_URL is not set');
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
      body: JSON.stringify(body),
    });
  } catch {
    throw new WorkerError(-1, 'Server unreachable');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new WorkerError(res.status, data.error || res.statusText);
  return data as T;
}

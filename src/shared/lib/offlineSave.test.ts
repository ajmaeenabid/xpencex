import { describe, it, expect, vi, afterEach } from 'vitest';
import { waitForServer } from './offlineSave';

const never = () => new Promise<void>(() => {});

afterEach(() => {
  vi.useRealTimers();
});

describe('waitForServer', () => {
  it('reports saved when the server answers', async () => {
    expect(await waitForServer(Promise.resolve(), { online: true })).toBe('saved');
  });

  it("moves on at once when the phone is offline, even though the server hasn't answered", async () => {
    expect(await waitForServer(never(), { online: false })).toBe('onPhone');
  });

  it('moves on after the wait on a connection that hangs', async () => {
    vi.useFakeTimers();
    const result = waitForServer(never(), { online: true, waitMs: 5000 });
    await vi.advanceTimersByTimeAsync(4999);
    let done = false;
    result.then(() => { done = true; });
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await result).toBe('onPhone');
  });

  it('still throws a refusal that arrives in time, so the screen shows its error', async () => {
    await expect(waitForServer(Promise.reject(new Error('permission-denied')), { online: true })).rejects.toThrow('permission-denied');
  });

  it("doesn't crash on a refusal that arrives after moving on", async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    let refuse!: (e: Error) => void;
    const write = new Promise<void>((_, reject) => { refuse = reject; });
    expect(await waitForServer(write, { online: false })).toBe('onPhone');
    refuse(new Error('permission-denied'));
    await new Promise((r) => setTimeout(r, 0));
    expect(errors).toHaveBeenCalled();
    errors.mockRestore();
  });
});

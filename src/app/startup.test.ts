import { describe, it, expect, vi } from 'vitest';
import { createReadySignal } from './startup';

describe('createReadySignal', () => {
  it('tells waiting listeners once, when the app is ready', () => {
    const signal = createReadySignal();
    const listener = vi.fn();
    signal.onReady(listener);
    expect(listener).not.toHaveBeenCalled();
    signal.markReady();
    signal.markReady();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(signal.isReady()).toBe(true);
  });

  it('answers at once when the app was already ready', () => {
    const signal = createReadySignal();
    signal.markReady();
    const listener = vi.fn();
    signal.onReady(listener);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('can stop listening', () => {
    const signal = createReadySignal();
    const listener = vi.fn();
    const stop = signal.onReady(listener);
    stop();
    signal.markReady();
    expect(listener).not.toHaveBeenCalled();
  });
});

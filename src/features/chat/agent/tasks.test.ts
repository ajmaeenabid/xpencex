import { describe, expect, it } from 'vitest';
import { AgentTask, MAX_FINISHED_TASKS, placeForAction, splitTasks, taskTitle, tasksToExpire, tasksToPrune } from './tasks';
import { OPEN_PLACES } from './actions';

const NOW = new Date('2026-11-16T12:00:00.000Z');
const task = (id: string, extra: Partial<AgentTask> = {}): AgentTask => ({
  id, uid: 'u', chatId: 'c', messageId: 'm', title: 'Move 500', action: { kind: 'transfer', amount: 500 },
  status: 'waiting', createdAt: '2026-11-15T12:00:00.000Z', ...extra,
});

describe('Agent space tasks', () => {
  it("uses the AI's words for the title, never a code, and hides numbers", () => {
    expect(taskTitle(' Move ৳500  from bKash to Cash ', 'fallback')).toBe('Move ৳500 from bKash to Cash');
    expect(taskTitle('OTP is 482913', 'fallback')).toBe('fallback');
    expect(taskTitle('', 'fallback')).toBe('fallback');
    expect(taskTitle('Send to 01712345678', 'fallback')).not.toContain('01712345678');
  });

  it('expires waiting tasks after 7 days, and only waiting ones', () => {
    const old = task('old', { createdAt: '2026-11-08T11:00:00.000Z' });
    const recent = task('recent', { createdAt: '2026-11-10T12:00:00.000Z' });
    const oldDone = task('done', { createdAt: '2026-11-01T00:00:00.000Z', status: 'done' });
    expect(tasksToExpire([old, recent, oldDone], NOW).map(t => t.id)).toEqual(['old']);
  });

  it('lists waiting oldest first and finished newest first, and keeps 100 finished', () => {
    const finished = Array.from({ length: MAX_FINISHED_TASKS + 2 }, (_, i) =>
      task(`f${i}`, { status: 'done', doneAt: new Date(NOW.getTime() - i * 60_000).toISOString() }));
    const waiting = [task('w2', { createdAt: '2026-11-16T10:00:00.000Z' }), task('w1', { createdAt: '2026-11-16T09:00:00.000Z' })];
    const split = splitTasks([...waiting, ...finished]);
    expect(split.waiting.map(t => t.id)).toEqual(['w1', 'w2']);
    expect(split.finished[0].id).toBe('f0');
    expect(tasksToPrune([...waiting, ...finished]).map(t => t.id)).toEqual([`f${MAX_FINISHED_TASKS}`, `f${MAX_FINISHED_TASKS + 1}`]);
  });

  it('points every result at a real screen', () => {
    const places = [
      placeForAction({ kind: 'transfer', amount: 1 }),
      placeForAction({ kind: 'budget', amount: 1, category: 'Food' }),
      placeForAction({ kind: 'budget', amount: 1 }),
      placeForAction({ kind: 'reminder', text: 'x', at: NOW.toISOString(), repeat: 'once' }),
      placeForAction({ kind: 'settings', changes: { currency: 'USD' } }),
      placeForAction({ kind: 'addToGoal', fundId: 'f', amount: 1 }),
      placeForAction({ kind: 'payRound', samityId: 's' }),
      placeForAction({ kind: 'debt', debtKind: 'lent', person: 'Rahim', amount: 1 }),
    ];
    for (const id of places) expect(OPEN_PLACES.some(p => p.id === id), id).toBe(true);
    expect(placeForAction({ kind: 'settings', changes: { darkMode: true } })).toBeUndefined();
    expect(placeForAction({ kind: 'open', place: 'funds' })).toBeUndefined();
  });
});

import { describe, it, expect } from 'vitest';
import { BACKUP_COLLECTIONS, BackupData, BackupError, isLocked, planRestore, readBackup, writeBackup } from './backup';

const empty = Object.fromEntries(BACKUP_COLLECTIONS.map(c => [c, []])) as unknown as BackupData['data'];
const backup = (data: Partial<BackupData['data']> = {}): BackupData => ({
  app: 'Xpences', version: 1, exportedAt: '2026-11-08T10:00:00.000Z', profile: { categoryBudgets: { Food: 3000 } },
  data: { ...empty, ...data },
});

describe('backup file', () => {
  it('round-trips without a password', async () => {
    const b = backup({ expenses: [{ id: 'e1', uid: 'old', title: 'চা', amount: 20 }] });
    const text = await writeBackup(b);
    expect(isLocked(text)).toBe(false);
    expect(await readBackup(text)).toEqual(b);
  });

  it('locks with a password and opens only with the right one', async () => {
    const b = backup({ accounts: [{ id: 'a1', uid: 'old', balance: 5000 }] });
    const text = await writeBackup(b, 'my secret');
    expect(isLocked(text)).toBe(true);
    expect(text).not.toContain('5000');
    expect(await readBackup(text, 'my secret')).toEqual(b);
    await expect(readBackup(text)).rejects.toMatchObject({ reason: 'needsPassword' });
    await expect(readBackup(text, 'wrong')).rejects.toMatchObject({ reason: 'wrongPassword' });
  }, 20_000);

  it('refuses files that are not Xpences backups', async () => {
    for (const bad of ['', 'hello', '{"app":"Other"}', '[1,2]']) {
      await expect(readBackup(bad)).rejects.toBeInstanceOf(BackupError);
    }
  });

  it('still reads backups made before the rename, which say XpenceX', async () => {
    expect((await readBackup(JSON.stringify({ ...backup(), app: 'XpenceX' }))).data.expenses).toEqual(backup().data.expenses);
  });

  it('reads a file saved with a byte order mark', async () => {
    expect((await readBackup('﻿' + JSON.stringify(backup()))).app).toBe('Xpences');
  });
});

describe('restore plan', () => {
  it('adds only what is missing, given to the current user', () => {
    const plan = planRestore(backup({
      expenses: [{ id: 'e1', uid: 'old', amount: 1 }, { id: 'e2', uid: 'old', amount: 2 }],
      accounts: [{ id: 'a1', uid: 'old', balance: 10 }],
    }), 'me', { expenses: new Set(['e1']) });
    expect(plan.write.expenses).toEqual([{ id: 'e2', data: { uid: 'me', amount: 2 } }]);
    expect(plan.write.accounts).toEqual([{ id: 'a1', data: { uid: 'me', balance: 10 } }]);
    expect(plan.skipped).toBe(1);
  });

  it('ignores items without a usable id', () => {
    const plan = planRestore(backup({ expenses: [{ id: '../x', amount: 1 }, { amount: 2 } as never, null as never] }), 'me', {});
    expect(plan.write.expenses).toHaveLength(0);
    expect(plan.invalid).toBe(3);
  });

  it('running it twice adds nothing the second time', () => {
    const b = backup({ debts: [{ id: 'd1', uid: 'old' }] });
    const first = planRestore(b, 'me', {});
    const second = planRestore(b, 'me', { debts: new Set(first.write.debts.map(w => w.id)) });
    expect(second.write.debts).toHaveLength(0);
    expect(second.skipped).toBe(1);
  });
});

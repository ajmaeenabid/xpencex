import { describe, it, expect } from 'vitest';
import { AdminComment, AdminUser, deleteConfirmed, displayName, groupComments, latestNotices, userStatus, visibleUsers } from './admin';

const device = { id: 'd1', label: 'Android, Chrome', at: '2026-10-30T10:00:00.000Z' };

const user = (patch: Partial<AdminUser>): AdminUser => ({
  uid: patch.username || 'u', username: 'user', email: `${patch.username || 'user'}@gmail.com`, createdAt: null, lastLoginAt: null,
  disabled: false, isAdmin: false, devices: [device], deviceRequest: null, ...patch,
});

describe('admin panel helpers', () => {
  it('shows suspended first, then whether they have a device yet', () => {
    expect(userStatus(user({}))).toBe('active');
    expect(userStatus(user({ devices: [] }))).toBe('waiting');
    expect(userStatus(user({ disabled: true, devices: [] }))).toBe('suspended');
  });

  it('lists admins first, then by username, and searches usernames and Gmail', () => {
    const users = [user({ username: 'zara' }), user({ username: 'abid', isAdmin: true }), user({ username: 'mim', email: 'someone@gmail.com' })];
    expect(visibleUsers(users, '').map(u => u.username)).toEqual(['abid', 'mim', 'zara']);
    expect(visibleUsers(users, ' ZA ').map(u => u.username)).toEqual(['zara']);
    expect(visibleUsers(users, 'someone').map(u => u.username)).toEqual(['mim']);
  });

  it('puts device requests first and can show only them', () => {
    const users = [user({ username: 'abid', isAdmin: true }), user({ username: 'mim' }), user({ username: 'zara', deviceRequest: device })];
    expect(visibleUsers(users, '').map(u => u.username)).toEqual(['abid', 'zara', 'mim']);
    expect(visibleUsers(users, '', 'requests').map(u => u.username)).toEqual(['zara']);
    expect(visibleUsers(users, 'mim', 'requests')).toEqual([]);
  });

  it('uses the Gmail address until a username is picked', () => {
    expect(displayName(user({ username: '', email: 'new@gmail.com' }))).toBe('new@gmail.com');
    expect(displayName(user({ username: 'rahim' }))).toBe('rahim');
  });

  it('needs the exact name to delete', () => {
    const u = user({ username: 'rahim' });
    expect(deleteConfirmed(u, ' rahim ')).toBe(true);
    expect(deleteConfirmed(u, 'Rahim')).toBe(false);
    expect(deleteConfirmed(u, 'rahi')).toBe(false);
    expect(deleteConfirmed(user({ username: '', email: 'new@gmail.com' }), 'new@gmail.com')).toBe(true);
  });

  it('shows the newest account notices first', () => {
    const n = (id: string, at: string) => ({ id, uid: 'u', type: 'restored' as const, at });
    const notices = [n('a', '2026-10-01T10:00:00.000Z'), n('b', '2026-10-29T10:00:00.000Z'), n('c', '2026-10-15T10:00:00.000Z')];
    expect(latestNotices(notices, 2).map(x => x.id)).toEqual(['b', 'c']);
  });
});

describe('groupComments', () => {
  const c = (id: string, uid: string, at: string, text = 'Nice app', username = ''): AdminComment =>
    ({ id, uid, username, email: `${uid}@mail.com`, text, at });

  it('groups by person, most recent writer first, newest comment first', () => {
    const groups = groupComments([
      c('1', 'a', '2026-11-01T10:00:00Z', 'Old', 'rahim'),
      c('2', 'b', '2026-11-05T10:00:00Z'),
      c('3', 'a', '2026-11-03T10:00:00Z', 'Newer', 'rahim'),
    ]);
    expect(groups.map(g => g.uid)).toEqual(['b', 'a']);
    expect(groups[1].name).toBe('@rahim');
    expect(groups[1].comments.map(x => x.text)).toEqual(['Newer', 'Old']);
    expect(groups[0].name).toBe('b@mail.com');
  });

  it('searches names, emails and the comment text', () => {
    const all = [c('1', 'a', '2026-11-01T10:00:00Z', 'Samity is great', 'rahim'), c('2', 'b', '2026-11-02T10:00:00Z', 'Bug in reports')];
    expect(groupComments(all, 'bug').map(g => g.uid)).toEqual(['b']);
    expect(groupComments(all, 'RAHIM').map(g => g.uid)).toEqual(['a']);
    expect(groupComments(all, 'zzz')).toEqual([]);
  });
});

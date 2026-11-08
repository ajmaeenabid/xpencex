// What the admin panel knows about a user: login details only, never their data
export interface AdminDevice {
  id: string;
  label: string;
  at: string;
}

export interface AdminUser {
  uid: string;
  username: string; // empty until they pick one at first sign-in
  email: string;
  createdAt: number | null;
  lastLoginAt: number | null;
  disabled: boolean;
  isAdmin: boolean;
  devices: AdminDevice[];
  // A device waiting for permission to use this account
  deviceRequest: AdminDevice | null;
}

export type UserFilter = 'all' | 'requests';

export type AdminAction = 'suspended' | 'restored' | 'delete' | 'deviceApproved' | 'deviceRefused' | 'deviceRemoved';

export interface AdminLogEntry {
  action: AdminAction;
  username: string; // empty once that person was deleted
  at: string;
}

/** When one of the server's hourly jobs last ran (see ai-server/src/health.ts) */
export interface JobHealth {
  lastRun: string | null;
  error: string;
  late: boolean;
}

export const HEALTH_JOBS = ['loans', 'rates'] as const;
export type AdminHealth = Record<(typeof HEALTH_JOBS)[number], JobHealth>;

// A notice the server leaves in a user's Profile when the admin changes their account
export interface AccountNotice {
  id: string;
  uid: string;
  type: Exclude<AdminAction, 'delete'>;
  at: string;
}

/** Newest first, at most `limit` */
export const latestNotices = (notices: AccountNotice[], limit = 5) =>
  [...notices].sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);

export type UserStatus = 'active' | 'suspended' | 'waiting';

export const userStatus = (u: AdminUser): UserStatus =>
  u.disabled ? 'suspended' : u.devices.length === 0 ? 'waiting' : 'active';

/** The name shown for a user: their username, or their Gmail until they pick one */
export const displayName = (u: AdminUser) => u.username || u.email;

/** Admins first, then users with a waiting device, then by name; filtered by a username or Gmail search */
export function visibleUsers(users: AdminUser[], search: string, filter: UserFilter = 'all'): AdminUser[] {
  const q = search.trim().toLowerCase();
  return users
    .filter(u => (filter === 'all' || u.deviceRequest) && (!q || u.username.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)))
    .sort((a, b) =>
      Number(b.isAdmin) - Number(a.isAdmin) ||
      Number(!!b.deviceRequest) - Number(!!a.deviceRequest) ||
      displayName(a).localeCompare(displayName(b)));
}

/** Delete needs the exact name typed, ignoring spaces around it */
export const deleteConfirmed = (u: AdminUser, typed: string) => typed.trim() === displayName(u);

/** A comment someone sent from Profile > Send feedback, as the admin sees it */
export interface AdminComment {
  id: string;
  uid: string;
  username: string;
  email: string;
  text: string;
  at: string; // ISO
}

export interface CommentGroup {
  uid: string;
  name: string; // @username, or the email when there is none
  email: string;
  comments: AdminComment[]; // newest first
  latest: string;
}

/** Comments grouped by person: whoever wrote most recently first, each person's newest comment first */
export function groupComments(comments: AdminComment[], search = ''): CommentGroup[] {
  const q = search.trim().toLowerCase();
  const groups = new Map<string, CommentGroup>();
  for (const c of comments) {
    const name = c.username ? `@${c.username}` : c.email || c.uid;
    if (q && ![name, c.email, c.text].some(v => v.toLowerCase().includes(q))) continue;
    const g = groups.get(c.uid) ?? { uid: c.uid, name, email: c.email, comments: [], latest: '' };
    g.comments.push(c);
    if (c.at > g.latest) g.latest = c.at;
    groups.set(c.uid, g);
  }
  for (const g of groups.values()) g.comments.sort((a, b) => b.at.localeCompare(a.at));
  return [...groups.values()].sort((a, b) => b.latest.localeCompare(a.latest));
}

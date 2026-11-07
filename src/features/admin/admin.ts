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
  username: string;
  at: string;
}

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

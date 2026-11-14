import { useEffect, useState } from 'react';
import AdminLogList from './AdminLogList';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { format } from 'date-fns';
import { ShieldCheck, X, Search, Smartphone, Ban, RotateCcw, Trash2, Check, AlertTriangle, ShieldAlert, Lock, Users, History, LogOut, MessageSquareText, ChevronRight, Bug } from 'lucide-react';
import { cn } from '../../shared/lib/utils';
import { WorkerError } from '../../shared/lib/workerApi';
import { useI18n, TKey } from '../../shared/i18n';
import { WrongGoogleAccountError, signInWasCancelled } from '../auth/googleSignIn';
import { AdminAction, AdminHealth, AdminLogEntry, AdminUser, UserFilter, UserStatus, deleteConfirmed, displayName, userStatus, visibleUsers } from './admin';
import { approveDevice, confirmWithGoogle, deleteUser, getHealth, listLog, listUsers, refuseDevice, removeDevice, setSuspended } from './adminService';
import HealthBox from './HealthBox';
import CommentsWindow from './CommentsWindow';
import ErrorsWindow from './ErrorsWindow';
import { confirmDialog } from '../../shared/components/Dialog';

// The server refuses admin changes 10 minutes after confirming with Google
const needsConfirm = (err: unknown) => err instanceof WorkerError && err.status === 401;

const STATUS: Record<UserStatus, { key: TKey; className: string }> = {
  active: { key: 'admin.statusActive', className: 'bg-teal-50 text-teal-700 dark:bg-teal-500/10 dark:text-teal-300' },
  suspended: { key: 'admin.statusSuspended', className: 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300' },
  waiting: { key: 'admin.statusWaiting', className: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300' },
};

const actionClass = 'flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold disabled:opacity-50';

/** The admin screen to manage who can use the app. Opened from the Profile row in AdminRow.tsx. */
export default function AdminPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, dateLocale } = useI18n();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [done, setDone] = useState('');
  const [filter, setFilter] = useState<UserFilter>('all');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  // Old devices the admin ticked to replace when approving a new one
  const [replacing, setReplacing] = useState<string[]>([]);
  // Every time the panel opens, the admin confirms with Google again
  const [unlocked, setUnlocked] = useState(false);
  const [lockError, setLockError] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [view, setView] = useState<'users' | 'log'>('users');
  const [log, setLog] = useState<AdminLogEntry[]>([]);
  const [health, setHealth] = useState<AdminHealth | null>(null);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [errorsOpen, setErrorsOpen] = useState(false);

  const lock = () => setUnlocked(false);

  const load = async () => {
    setLoading(true);
    setLoadError(false);
    // On its own, so a problem here never stops the user list from loading
    getHealth().then(setHealth).catch(err => console.error('Could not load job health:', err));
    try {
      const [nextUsers, nextLog] = await Promise.all([listUsers(), listLog()]);
      setUsers(nextUsers);
      setLog(nextLog);
    } catch (err) {
      console.error('Error loading users:', err);
      if (needsConfirm(err)) lock();
      else setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  const unlock = async () => {
    setUnlocking(true);
    setLockError('');
    try {
      await confirmWithGoogle();
      setUnlocked(true);
      load();
    } catch (err) {
      if (!signInWasCancelled(err)) {
        console.error('Admin confirmation failed:', err);
        setLockError(t(err instanceof WrongGoogleAccountError ? 'google.wrongAccount' : 'admin.confirmError'));
      }
    } finally {
      setUnlocking(false);
    }
  };

  // Everything resets on close, so the next open starts on the lock step with a clean screen
  const closePopup = () => {
    onClose(); setExpanded(null); setDeleting(null); setTyped(''); setActionError(''); setSearch('');
    setDone(''); setFilter('all'); setLockError(''); setView('users'); setCommentsOpen(false); setErrorsOpen(false);
    lock();
  };

  // Close with the Escape key, and stop the page behind from scrolling
  useEffect(() => {
    if (!open) return;
    // While Comments is open, Escape belongs to it
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !commentsOpen && !errorsOpen) closePopup(); };
    window.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; };
  }, [open, commentsOpen, errorsOpen]);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setActionError('');
    setDone('');
    try {
      await action();
      await load();
    } catch (err) {
      console.error('Admin action failed:', err);
      if (needsConfirm(err)) lock();
      else setActionError(t('admin.actionError'));
    } finally {
      setBusy(false);
    }
  };

  const handleApprove = (u: AdminUser) => {
    if (!u.deviceRequest) return;
    const request = u.deviceRequest;
    run(async () => {
      await approveDevice(u.uid, request.id, replacing);
      setReplacing([]);
      setExpanded(null);
      setDone(t('admin.deviceApprovedDone', { user: displayName(u) }));
    });
  };

  const handleRefuse = async (u: AdminUser) => {
    if (!u.deviceRequest) return;
    const request = u.deviceRequest;
    if (!(await confirmDialog(t('admin.confirmRefuse', { user: displayName(u) }), { danger: true }))) return;
    run(() => refuseDevice(u.uid, request.id));
  };

  const handleRemoveDevice = async (u: AdminUser, deviceId: string, label: string) => {
    if (!(await confirmDialog(t('admin.confirmRemoveDevice', { device: label, user: displayName(u) }), { danger: true }))) return;
    run(() => removeDevice(u.uid, deviceId));
  };

  const handleSuspend = async (u: AdminUser) => {
    if (!(await confirmDialog(t(u.disabled ? 'admin.confirmRestore' : 'admin.confirmSuspend', { user: displayName(u) }), { danger: !u.disabled }))) return;
    run(() => setSuspended(u.uid, !u.disabled));
  };

  const handleDelete = (u: AdminUser) => {
    if (!deleteConfirmed(u, typed)) return;
    run(async () => {
      await deleteUser(u.uid, typed.trim());
      setDeleting(null);
      setTyped('');
      setExpanded(null);
    });
  };

  const lockView = (
    <div className="px-5 pt-2 pb-6 space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 shrink-0 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl flex items-center justify-center text-indigo-600 dark:text-indigo-400">
          <Lock size={18} />
        </div>
        <div>
          <p className="text-sm font-bold text-foreground">{t('admin.lockTitle')}</p>
          <p className="text-xs text-muted font-medium">{t('admin.lockBody')}</p>
        </div>
      </div>
      {lockError && <p role="alert" className="text-rose-600 dark:text-rose-400 text-xs font-bold">{lockError}</p>}
      <button onClick={unlock} disabled={unlocking} className="w-full py-3 bg-indigo-600 text-white rounded-xl text-sm font-bold disabled:opacity-50">
        {unlocking ? t('common.pleaseWait') : t('admin.unlock')}
      </button>
    </div>
  );

  const when = (ms: number | null) => (ms ? format(new Date(ms), 'd MMM yyyy', { locale: dateLocale }) : '');
  const shown = visibleUsers(users, search, filter);
  const requestCount = users.filter(u => u.deviceRequest).length;

  const userRow = (u: AdminUser) => {
    const status = STATUS[userStatus(u)];
    const isOpen = expanded === u.uid;
    return (
      <div key={u.uid} className="bg-background/50 rounded-xl border border-card-border">
        <button
          onClick={() => { setExpanded(isOpen ? null : u.uid); setDeleting(null); setTyped(''); setActionError(''); setReplacing([]); }}
          aria-expanded={isOpen}
          className="w-full flex items-center gap-3 p-3 text-left"
        >
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-foreground truncate">
              {u.username ? `@${u.username}` : t('admin.noUsername')}
              {u.isAdmin && <span className="ml-2 text-[11px] font-bold text-indigo-600 dark:text-indigo-400">{t('admin.you')}</span>}
            </p>
            <p className="text-xs text-muted font-medium truncate">{u.email}</p>
            <p className="text-[12px] text-muted font-medium truncate">
              {[u.createdAt && t('admin.joined', { date: when(u.createdAt) }), u.lastLoginAt ? t('admin.lastSeen', { date: when(u.lastLoginAt) }) : t('admin.neverSeen')].filter(Boolean).join(' · ')}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <span className={cn('px-2 py-1 rounded-lg text-[11px] font-bold', status.className)}>{t(status.key)}</span>
            {u.deviceRequest && (
              <span className="px-2 py-1 rounded-lg text-[11px] font-bold bg-indigo-600 text-white">{t('admin.requested')}</span>
            )}
          </div>
        </button>

        {isOpen && (
          <div className="px-3 pb-3 space-y-2">
            {u.deviceRequest && (
              <div className="space-y-2 p-3 rounded-xl bg-indigo-50 dark:bg-indigo-500/10">
                <p className="text-xs font-bold text-foreground">
                  {t('admin.requestBody', { device: u.deviceRequest.label, date: format(new Date(u.deviceRequest.at), 'd MMM, h:mm a', { locale: dateLocale }) })}
                </p>
                {u.devices.length > 0 && <p className="text-[12px] text-muted font-medium">{t('admin.replaceHint')}</p>}
                {u.devices.map(d => (
                  <label key={d.id} className="flex items-center gap-2 text-xs font-medium text-foreground">
                    <input
                      type="checkbox"
                      checked={replacing.includes(d.id)}
                      onChange={(e) => setReplacing(e.target.checked ? [...replacing, d.id] : replacing.filter(id => id !== d.id))}
                    />
                    {t('admin.replaceDevice', { device: d.label, date: format(new Date(d.at), 'd MMM yyyy', { locale: dateLocale }) })}
                  </label>
                ))}
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => handleRefuse(u)} disabled={busy} className={cn(actionClass, 'bg-card text-muted border border-card-border')}>{t('admin.refuse')}</button>
                  <button onClick={() => handleApprove(u)} disabled={busy} className={cn(actionClass, 'bg-indigo-600 text-white')}><Check size={14} /> {t('admin.approve')}</button>
                </div>
              </div>
            )}

            <p className="text-[12px] font-bold text-muted">{t('admin.devices')}</p>
            {u.devices.length === 0 && <p className="text-[12px] text-muted font-medium">{t('admin.noDevices')}</p>}
            {u.devices.map(d => (
              <div key={d.id} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-card border border-card-border">
                <p className="flex items-center gap-2 min-w-0 text-xs font-medium text-foreground">
                  <Smartphone size={14} className="shrink-0 text-muted" />
                  <span className="truncate">{d.label} · {format(new Date(d.at), 'd MMM yyyy', { locale: dateLocale })}</span>
                </p>
                <button onClick={() => handleRemoveDevice(u, d.id, d.label)} disabled={busy} className="shrink-0 text-[12px] font-bold text-rose-600 dark:text-rose-400 disabled:opacity-50">{t('admin.removeDevice')}</button>
              </div>
            ))}

            {u.isAdmin ? (
              <p className="text-[12px] text-muted font-medium">{t('admin.ownAccount')}</p>
            ) : deleting === u.uid ? (
              <div className="space-y-2 p-3 rounded-xl bg-rose-50 dark:bg-rose-500/10">
                <p className="text-xs font-bold text-rose-600 dark:text-rose-300">{t('admin.deleteWarn', { user: displayName(u) })}</p>
                <input
                  aria-label={t('admin.deleteType', { user: displayName(u) })}
                  placeholder={t('admin.deleteType', { user: displayName(u) })}
                  className="w-full px-3 py-2 bg-card rounded-lg text-sm text-foreground outline-none focus:ring-2 focus:ring-rose-500"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  autoCapitalize="none"
                  autoCorrect="off"
                />
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => { setDeleting(null); setTyped(''); }} className={cn(actionClass, 'bg-card text-muted border border-card-border')}>{t('common.cancel')}</button>
                  <button onClick={() => handleDelete(u)} disabled={busy || !deleteConfirmed(u, typed)} className={cn(actionClass, 'bg-rose-600 text-white')}>
                    <Trash2 size={14} /> {t('admin.delete')}
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => handleSuspend(u)} disabled={busy} className={cn(actionClass, 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300')}>
                  {u.disabled ? <RotateCcw size={14} /> : <Ban size={14} />} {t(u.disabled ? 'admin.restore' : 'admin.suspend')}
                </button>
                <button onClick={() => { setDeleting(u.uid); setTyped(''); }} disabled={busy} className={cn(actionClass, 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300')}>
                  <Trash2 size={14} /> {t('common.delete')}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {/* Rendered on <body> so it covers the whole screen, including the bottom bar. Profile stays
          mounted underneath, so exiting returns to the same spot. */}
      {createPortal(
        <AnimatePresence>
          {/* Step 1: a small popup asks for the password */}
          {open && !unlocked && (
            <div key="lock" className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
              <motion.div
                key="scrim"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={closePopup}
                className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              />
              <motion.div
                key="sheet"
                role="dialog"
                aria-modal="true"
                aria-label={t('admin.title')}
                initial={{ y: 40, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 40, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 380, damping: 34 }}
                className="relative w-full max-w-md max-h-[88dvh] flex flex-col bg-card text-foreground border border-card-border rounded-t-[2rem] sm:rounded-[2rem] shadow-2xl"
              >
                <div className="flex items-center justify-between px-5 pt-5 pb-3">
                  <h2 className="text-lg font-bold">{t('admin.title')}</h2>
                  <button onClick={closePopup} aria-label={t('common.close')} className="p-2 rounded-xl text-muted hover:text-foreground hover:bg-background/60">
                    <X size={18} />
                  </button>
                </div>
                {lockView}
              </motion.div>
            </div>
          )}

          {/* Step 2: the admin screen fills the whole window */}
          {open && unlocked && (
            <motion.div
              key="admin"
              role="dialog"
              aria-modal="true"
              aria-label={t('admin.title')}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
              className="fixed inset-0 z-[60] flex flex-col bg-background text-foreground"
            >
              <header className="shrink-0 bg-card/80 backdrop-blur-xl border-b border-card-border">
                <div className="max-w-2xl mx-auto flex items-center justify-between gap-3 px-5 py-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 shrink-0 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                      <ShieldCheck size={20} />
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-lg font-bold truncate">{t('admin.title')}</h2>
                      {users.length > 0 && <p className="text-xs text-muted font-medium">{t('admin.count', { count: users.length })}</p>}
                    </div>
                  </div>
                  <button onClick={closePopup} className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-500 text-xs font-bold hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors">
                    <LogOut size={16} /> {t('admin.exit')}
                  </button>
                </div>
              </header>

              <div className="flex-1 overflow-y-auto">
                <div className="max-w-2xl mx-auto">
                <div className="px-5 pt-4 space-y-3">
                  <p className="flex items-start gap-2 text-[12px] text-muted font-medium">
                    <ShieldAlert size={14} className="shrink-0 mt-px text-indigo-600 dark:text-indigo-400" /> {t('admin.privacyNote')}
                  </p>
                  {health && <HealthBox health={health} />}
                  <button
                    onClick={() => setCommentsOpen(true)}
                    className="w-full flex items-center gap-3 p-4 rounded-2xl bg-card border border-card-border text-left transition-colors hover:border-indigo-500/40"
                  >
                    <span className="w-10 h-10 shrink-0 rounded-xl flex items-center justify-center bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300"><MessageSquareText size={20} /></span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-bold text-foreground">{t('comments.title')}</span>
                      <span className="block text-xs text-muted font-medium">{t('comments.hint')}</span>
                    </span>
                    <ChevronRight size={18} className="shrink-0 text-muted" />
                  </button>
                  <button
                    onClick={() => setErrorsOpen(true)}
                    className="w-full flex items-center gap-3 p-4 rounded-2xl bg-card border border-card-border text-left transition-colors hover:border-indigo-500/40"
                  >
                    <span className="w-10 h-10 shrink-0 rounded-xl flex items-center justify-center bg-rose-50 text-rose-500 dark:bg-rose-500/10 dark:text-rose-300"><Bug size={20} /></span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-bold text-foreground">{t('errors.title')}</span>
                      <span className="block text-xs text-muted font-medium">{t('errors.hint')}</span>
                    </span>
                    <ChevronRight size={18} className="shrink-0 text-muted" />
                  </button>
                  <div role="tablist" className="p-1 grid grid-cols-2 gap-1 bg-background/60 rounded-2xl">
                    {([
                      { id: 'users', label: t('admin.tabUsers'), Icon: Users },
                      { id: 'log', label: t('admin.tabLog'), Icon: History },
                    ] as const).map(({ id, label, Icon }) => (
                      <button
                        key={id}
                        role="tab"
                        aria-selected={view === id}
                        onClick={() => setView(id)}
                        className={cn('flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-colors', view === id ? 'bg-indigo-600 text-white' : 'text-muted hover:text-foreground')}
                      >
                        <Icon size={14} /> {label}
                      </button>
                    ))}
                  </div>
                  {view === 'users' && <div className="relative">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                    <input
                      aria-label={t('admin.search')}
                      placeholder={t('admin.search')}
                      className="w-full pl-9 pr-4 py-2.5 bg-background/50 rounded-xl text-sm text-foreground outline-none focus:ring-2 focus:ring-indigo-600"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      autoCapitalize="none"
                    />
                  </div>}
                  {view === 'users' && (
                    <div className="flex gap-2">
                      {([
                        { id: 'all', label: t('admin.filterAll') },
                        { id: 'requests', label: t('admin.filterRequests', { count: requestCount }) },
                      ] as const).map(({ id, label }) => (
                        <button
                          key={id}
                          onClick={() => setFilter(id)}
                          aria-pressed={filter === id}
                          className={cn(
                            'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-colors',
                            filter === id ? 'bg-indigo-600 text-white border-indigo-600' : 'text-muted border-card-border hover:text-foreground'
                          )}
                        >
                          {id === 'requests' && <Smartphone size={12} />} {label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="px-5 pt-3 pb-10 space-y-2">
                  {done && (
                    <div role="status" className="flex items-start justify-between gap-2 p-3 rounded-xl bg-teal-50 dark:bg-teal-500/10 text-teal-700 dark:text-teal-300">
                      <p className="flex items-start gap-2 text-xs font-bold"><Check size={14} className="shrink-0 mt-px" /> {done}</p>
                      <button onClick={() => setDone('')} aria-label={t('common.dismiss')} className="p-1 text-muted hover:text-foreground"><X size={14} /></button>
                    </div>
                  )}

                  {actionError && (
                    <p role="alert" className="flex items-start gap-2 text-rose-600 dark:text-rose-400 text-xs font-bold">
                      <AlertTriangle size={14} className="shrink-0 mt-0.5" /> {actionError}
                    </p>
                  )}

                  {loading && users.length === 0 ? (
                    <p className="text-center py-10 text-sm text-muted font-medium">{t('admin.loading')}</p>
                  ) : loadError ? (
                    <div className="text-center py-10 space-y-3">
                      <p className="text-sm text-muted font-medium">{t('admin.loadError')}</p>
                      <button onClick={load} className="text-indigo-600 dark:text-indigo-400 font-bold text-sm">{t('admin.retry')}</button>
                    </div>
                  ) : view === 'log' ? (
                    <AdminLogList log={log} />
                  ) : shown.length === 0 ? (
                    <p className="text-center py-10 text-sm text-muted font-medium">{t(filter === 'requests' && !search.trim() ? 'admin.noRequests' : 'admin.none')}</p>
                  ) : (
                    shown.map(userRow)
                  )}
                </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
      <CommentsWindow open={open && unlocked && commentsOpen} onClose={() => setCommentsOpen(false)} onLocked={lock} />
      <ErrorsWindow open={open && unlocked && errorsOpen} onClose={() => setErrorsOpen(false)} onLocked={lock} />
    </>
  );
}

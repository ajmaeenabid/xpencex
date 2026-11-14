import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Bug, RefreshCw, Trash2 } from 'lucide-react';
import { useI18n } from '../../shared/i18n';
import { cn } from '../../shared/lib/utils';
import { WorkerError, callWorker } from '../../shared/lib/workerApi';
import { confirmDialog } from '../../shared/components/Dialog';
import FullWindow from '../../shared/components/FullWindow';

/** One error report as the admin sees it: the username, never the user id (ai-server/src/errorReports.ts) */
export interface ErrorReport {
  id: string;
  username: string;
  message: string;
  stack: string;
  screen: string;
  version: string;
  device: string;
  count: number;
  firstAt: string;
  lastAt: string;
}

const card = 'bg-card rounded-3xl border border-card-border shadow-sm';

/** The admin's Error reports window: newest first, each with where and how often it happened. Kept 30 days. */
export default function ErrorsWindow({ open, onClose, onLocked }: {
  open: boolean;
  onClose: () => void;
  onLocked: () => void; // the Google confirmation ran out
}) {
  const { t, dateLocale } = useI18n();
  const [reports, setReports] = useState<ErrorReport[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const when = (iso: string) => (iso ? format(new Date(iso), 'd MMM yyyy, h:mm a', { locale: dateLocale }) : '');

  const run = async (action: () => Promise<void>) => {
    setLoading(true);
    setError(false);
    try {
      await action();
    } catch (err) {
      if (err instanceof WorkerError && err.status === 401) { onClose(); onLocked(); return; }
      console.error('Error reports failed:', err);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  const load = () => run(async () => { setReports((await callWorker<{ reports: ErrorReport[] }>('/admin/errors')).reports); });
  const remove = (id: string) => run(async () => {
    await callWorker('/admin/errors/delete', { id });
    setReports(r => (r || []).filter(x => x.id !== id));
  });
  const removeAll = async () => {
    if (!(await confirmDialog(t('errors.deleteAllConfirm'), { danger: true }))) return;
    run(async () => { await callWorker('/admin/errors/delete', { all: true }); setReports([]); });
  };

  useEffect(() => { if (open) load(); }, [open]);

  let body: React.ReactNode;
  if (loading && !reports) {
    body = <p className="text-center py-16 text-sm text-muted font-medium">{t('errors.loading')}</p>;
  } else if (error) {
    body = (
      <div className="text-center py-16 space-y-3">
        <p className="text-sm text-muted font-medium">{t('errors.loadError')}</p>
        <button onClick={load} className="text-indigo-600 dark:text-indigo-400 font-bold text-sm">{t('admin.retry')}</button>
      </div>
    );
  } else if (!reports || reports.length === 0) {
    body = <p className="text-center py-16 text-sm text-muted font-medium">{t('errors.none')}</p>;
  } else {
    body = (
      <>
        <p className="text-xs text-muted font-medium">{t('errors.about')}</p>
        <div className="space-y-3">
          {reports.map(r => (
            <div key={r.id} className={cn(card, 'p-4 space-y-2')}>
              <div className="flex items-start gap-2">
                <p className="flex-1 text-sm font-bold text-foreground break-words">{r.message}</p>
                {r.count > 1 && <span className="shrink-0 px-2 py-0.5 rounded-full text-[12px] font-bold bg-rose-500 text-white">{t('errors.times', { count: r.count })}</span>}
              </div>
              <p className="text-[12px] text-muted font-semibold">
                {[r.username || t('errors.noName'), r.screen, r.version && `v${r.version}`, r.device].filter(Boolean).join(' · ')}
              </p>
              <p className="text-[12px] text-muted font-medium">{t('errors.when', { first: when(r.firstAt), last: when(r.lastAt) })}</p>
              <div className="flex items-center gap-4">
                {r.stack && (
                  <button onClick={() => setOpenId(openId === r.id ? null : r.id)} className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
                    {t(openId === r.id ? 'errors.hideDetails' : 'errors.showDetails')}
                  </button>
                )}
                <button onClick={() => remove(r.id)} disabled={loading} className="inline-flex items-center gap-1 text-xs font-bold text-muted hover:text-rose-500 disabled:opacity-50">
                  <Trash2 size={13} /> {t('common.delete')}
                </button>
              </div>
              {openId === r.id && <pre className="text-[11px] text-muted whitespace-pre-wrap break-words bg-background/60 rounded-xl p-3 max-h-60 overflow-auto">{r.stack}</pre>}
            </div>
          ))}
        </div>
        <button onClick={removeAll} disabled={loading} className="w-full h-11 rounded-xl text-sm font-bold text-rose-600 dark:text-rose-400 bg-card border border-card-border disabled:opacity-50">
          {t('errors.deleteAll')}
        </button>
      </>
    );
  }

  return (
    <FullWindow
      open={open}
      above
      atRoot
      onClose={onClose}
      onBack={onClose}
      pageKey="errors"
      icon={<Bug size={18} className="shrink-0 text-rose-500" />}
      title={t('errors.title')}
      subtitle={reports ? t('errors.count', { count: reports.length }) : undefined}
      action={(
        <button onClick={load} disabled={loading} aria-label={t('comments.refresh')} title={t('comments.refresh')} className="inline-flex items-center justify-center w-10 h-10 rounded-xl text-muted hover:text-foreground hover:bg-background/60 disabled:opacity-50">
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
        </button>
      )}
    >
      {body}
    </FullWindow>
  );
}

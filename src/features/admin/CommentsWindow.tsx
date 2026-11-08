import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { ChevronRight, MessageSquareText, RefreshCw, Search } from 'lucide-react';
import { useI18n } from '../../shared/i18n';
import { cn } from '../../shared/lib/utils';
import { WorkerError } from '../../shared/lib/workerApi';
import FullWindow, { usePages } from '../../shared/components/FullWindow';
import { AdminComment, groupComments } from './admin';
import { listComments } from './adminService';

type Page = { page: 'people' } | { page: 'person'; uid: string };

const card = 'bg-card rounded-3xl border border-card-border shadow-sm';

/**
 * The admin's Comments window: everyone who sent feedback, whoever wrote last first.
 * Tap a person to read all of their comments.
 */
export default function CommentsWindow({ open, onClose, onLocked }: {
  open: boolean;
  onClose: () => void;
  onLocked: () => void; // the 10-minute Google confirmation ran out
}) {
  const { t, dateLocale } = useI18n();
  const nav = usePages<Page>({ page: 'people' });
  const [comments, setComments] = useState<AdminComment[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState('');
  const when = (iso: string) => (iso ? format(new Date(iso), 'd MMM yyyy, h:mm a', { locale: dateLocale }) : '');

  const load = async () => {
    setLoading(true);
    setError(false);
    try {
      setComments(await listComments());
    } catch (err) {
      if (err instanceof WorkerError && err.status === 401) { onClose(); onLocked(); return; }
      console.error('Could not load comments:', err);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (open) load(); }, [open]);

  const close = () => { onClose(); nav.reset(); setSearch(''); };
  const groups = groupComments(comments || [], search);

  let title = t('comments.title');
  let subtitle: string | undefined = comments ? t('comments.count', { count: comments.length }) : undefined;
  let body: React.ReactNode;

  if (loading && !comments) {
    body = <p className="text-center py-16 text-sm text-muted font-medium">{t('comments.loading')}</p>;
  } else if (error) {
    body = (
      <div className="text-center py-16 space-y-3">
        <p className="text-sm text-muted font-medium">{t('comments.loadError')}</p>
        <button onClick={load} className="text-indigo-600 dark:text-indigo-400 font-bold text-sm">{t('admin.retry')}</button>
      </div>
    );
  } else if (nav.page.page === 'people') {
    body = (
      <>
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            aria-label={t('comments.search')}
            placeholder={t('comments.search')}
            className="w-full pl-9 pr-4 h-11 bg-card rounded-xl border border-card-border text-sm text-foreground outline-none focus:border-indigo-500"
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoCapitalize="none"
          />
        </div>
        {groups.length === 0 ? (
          <p className="text-center py-12 text-sm text-muted font-medium">{t(search.trim() ? 'comments.noMatch' : 'comments.none')}</p>
        ) : (
          <div className="space-y-3">
            {groups.map(g => (
              <button key={g.uid} onClick={() => nav.go({ page: 'person', uid: g.uid })} className={cn(card, 'w-full p-4 flex items-start gap-3 text-left transition-colors hover:border-indigo-500/40')}>
                <div className="w-10 h-10 shrink-0 rounded-full bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 flex items-center justify-center font-bold uppercase">
                  {g.name.replace('@', '').charAt(0)}
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-bold text-foreground truncate">{g.name}</p>
                    <span className="shrink-0 px-2 py-0.5 rounded-full text-[11px] font-bold bg-indigo-600 text-white">{g.comments.length}</span>
                  </div>
                  {g.email && g.name !== g.email && <p className="text-[11px] text-muted font-medium truncate">{g.email}</p>}
                  <p className="text-sm text-foreground/80 line-clamp-2 break-words">{g.comments[0].text}</p>
                  <p className="text-[11px] text-muted font-semibold">{when(g.latest)}</p>
                </div>
                <ChevronRight size={18} className="text-muted shrink-0 mt-2.5" />
              </button>
            ))}
          </div>
        )}
      </>
    );
  } else {
    const uid = nav.page.uid;
    const g = groupComments(comments || []).find(x => x.uid === uid);
    title = g?.name || t('comments.title');
    subtitle = g ? t('comments.count', { count: g.comments.length }) : undefined;
    body = !g ? (
      <p className="text-center py-16 text-sm text-muted font-medium">{t('comments.none')}</p>
    ) : (
      <>
        {g.email && g.name !== g.email && <p className="text-xs text-muted font-semibold">{g.email}</p>}
        <div className="space-y-3">
          {g.comments.map(c => (
            <div key={c.id} className={cn(card, 'p-4 space-y-2')}>
              <p className="text-sm text-foreground whitespace-pre-wrap break-words leading-relaxed">{c.text}</p>
              <p className="text-[11px] text-muted font-semibold">{when(c.at)}</p>
            </div>
          ))}
        </div>
      </>
    );
  }

  return (
    <FullWindow
      open={open}
      above
      atRoot={nav.atRoot}
      onClose={close}
      onBack={nav.back}
      pageKey={nav.depth + nav.page.page}
      icon={<MessageSquareText size={18} className="shrink-0 text-indigo-600 dark:text-indigo-400" />}
      title={title}
      subtitle={subtitle}
      action={nav.atRoot && (
        <button onClick={load} disabled={loading} aria-label={t('comments.refresh')} title={t('comments.refresh')} className="inline-flex items-center justify-center w-10 h-10 rounded-xl text-muted hover:text-foreground hover:bg-background/60 disabled:opacity-50">
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
        </button>
      )}
    >
      {body}
    </FullWindow>
  );
}

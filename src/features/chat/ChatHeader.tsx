import { Ghost, PanelLeft, ShieldAlert, SquarePen, X } from 'lucide-react';
import { useI18n } from '../../shared/i18n';

/**
 * The chat's top bar (history, title, temporary chat, new chat), and the note when this chat can't be saved.
 * In a temporary chat the title says so, and the ghost button becomes "Leave".
 */
export default function ChatHeader({ title, canStartNew, onOpenHistory, onNewChat, showNotSaved, onDismissNotSaved, temporary, canStartTemporary, onStartTemporary, onLeaveTemporary }: {
  title: string;
  canStartNew: boolean;
  onOpenHistory: () => void;
  onNewChat: () => void;
  showNotSaved: boolean; // history is full of pinned chats, so this one isn't kept
  onDismissNotSaved: () => void;
  temporary: boolean;
  canStartTemporary: boolean;
  onStartTemporary: () => void;
  onLeaveTemporary: () => void;
}) {
  const { t } = useI18n();
  const iconButton = 'p-2.5 rounded-xl text-muted hover:text-foreground hover:bg-card transition-colors disabled:opacity-40';
  return (
    <>
      <header className="flex items-center gap-2 pb-2 shrink-0">
        <button onClick={onOpenHistory} aria-label={t('chat.openHistory')} className={iconButton}>
          <PanelLeft size={20} />
        </button>

        {temporary ? (
          <div className="flex-1 min-w-0 flex justify-center">
            <span className="inline-flex items-center gap-1.5 max-w-full px-3 py-1 rounded-full bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900 text-xs font-bold">
              <Ghost size={14} className="shrink-0" />
              <span className="truncate">{t('chat.temp.title')}</span>
            </span>
          </div>
        ) : (
          <h2 className="flex-1 min-w-0 truncate text-center text-sm font-bold text-foreground">{title}</h2>
        )}

        {temporary ? (
          <button
            onClick={onLeaveTemporary}
            aria-label={t('chat.temp.leave')}
            title={t('chat.temp.leave')}
            className="h-9 px-3 rounded-xl inline-flex items-center gap-1 text-xs font-bold text-foreground bg-card border border-card-border hover:bg-background/60 transition-colors"
          >
            <X size={14} /> {t('chat.temp.leaveShort')}
          </button>
        ) : (
          <>
            <button
              onClick={onStartTemporary}
              disabled={!canStartTemporary}
              aria-label={t('chat.temp.start')}
              title={t('chat.temp.start')}
              className={iconButton}
            >
              <Ghost size={20} />
            </button>
            <button onClick={onNewChat} disabled={!canStartNew} aria-label={t('chat.newChat')} title={t('chat.newChat')} className={iconButton}>
              <SquarePen size={20} />
            </button>
          </>
        )}
      </header>

      {temporary && (
        <p className="self-center mb-2 text-[12px] font-semibold text-muted text-center">{t('chat.temp.note')}</p>
      )}

      {showNotSaved && !temporary && (
        <div role="alert" className="self-center max-w-full mb-2 flex items-start gap-2 pl-3 pr-2 py-2 rounded-2xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-300">
          <ShieldAlert size={15} className="shrink-0 mt-px" />
          <p className="text-xs font-semibold leading-relaxed text-center">{t('chat.notSaved')}</p>
          <button onClick={onDismissNotSaved} aria-label={t('common.dismiss')} className="p-0.5 opacity-70 hover:opacity-100">
            <X size={14} />
          </button>
        </div>
      )}
    </>
  );
}

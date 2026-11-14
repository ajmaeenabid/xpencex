import { PanelLeft, ShieldAlert, SquarePen, X } from 'lucide-react';
import { useI18n } from '../../shared/i18n';

/** The chat's top bar (history, title, new chat), and the note when this chat can't be saved */
export default function ChatHeader({ title, canStartNew, onOpenHistory, onNewChat, showNotSaved, onDismissNotSaved }: {
  title: string;
  canStartNew: boolean;
  onOpenHistory: () => void;
  onNewChat: () => void;
  showNotSaved: boolean; // history is full of pinned chats, so this one isn't kept
  onDismissNotSaved: () => void;
}) {
  const { t } = useI18n();
  return (
    <>
      <header className="flex items-center gap-2 pb-2 shrink-0">
        <button
          onClick={onOpenHistory}
          aria-label={t('chat.openHistory')}
          className="p-2.5 rounded-xl text-muted hover:text-foreground hover:bg-card transition-colors"
        >
          <PanelLeft size={20} />
        </button>
        <h2 className="flex-1 min-w-0 truncate text-center text-sm font-bold text-foreground">{title}</h2>
        <button
          onClick={onNewChat}
          disabled={!canStartNew}
          aria-label={t('chat.newChat')}
          title={t('chat.newChat')}
          className="p-2.5 rounded-xl text-muted hover:text-foreground hover:bg-card transition-colors disabled:opacity-40"
        >
          <SquarePen size={20} />
        </button>
      </header>

      {showNotSaved && (
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

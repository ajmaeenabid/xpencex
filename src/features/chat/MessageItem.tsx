import { AnimatePresence, motion } from 'motion/react';
import { AudioLines, ChevronRight, Info, Mic, Paperclip } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChatMessage } from '../../shared/types';
import { cn } from '../../shared/lib/utils';
import { containsSecret } from '../../shared/lib/sensitiveData';
import { useI18n } from '../../shared/i18n';
import ErrorBoundary from '../../shared/components/ErrorBoundary';
import { restoreLineBreaks } from './markdownRepair';
import { actionsFor, switchVersion } from './versions';
import { formatClock as formatTime } from './limits';
import { CopyButton, EditButton, ResendButton, ShareButton, VersionArrows } from './MessageActions';
import { CardActions, ExpenseCard, IncomeCard, WithExpense, WithIncome } from './ConfirmCards';

/** Tables can be wider than a phone screen, so they scroll sideways on their own */
const markdownComponents = {
  table: ({ children }: { children?: React.ReactNode }) => (
    <div className="chat-md-table"><table>{children}</table></div>
  ),
};

/** One message: its bubble, its copy/resend/edit/share buttons, and a confirm card when it has one */
export default function MessageItem({
  msg, editingId, setEditingId, editValue, setEditValue, blockSecret, saveEdit, openSteps, setOpenSteps,
  photoPreviews, busy, setMessages, answerAgain, cards,
}: {
  msg: ChatMessage;
  editingId: string | null;
  setEditingId: (id: string | null) => void;
  editValue: string;
  setEditValue: (value: string) => void;
  blockSecret: () => void;
  saveEdit: (message: ChatMessage) => void;
  openSteps: Set<string>;
  setOpenSteps: React.Dispatch<React.SetStateAction<Set<string>>>;
  photoPreviews: Record<string, string>;
  busy: boolean;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  answerAgain: (id: string, newText?: string) => void;
  cards: CardActions;
}) {
  const { t } = useI18n();
  return (
    <div className={`space-y-2 ${msg.role === 'user' && editingId !== msg.id ? 'max-w-[85%]' : 'w-full'}`}>
      <div className={
        msg.role === 'user'
          ? 'px-4 py-3 rounded-3xl rounded-tr-lg bg-gradient-to-br from-indigo-300 to-indigo-400 text-[#3B1A0B] shadow-sm'
          : msg.type === 'error'
            ? 'px-1 text-rose-500'
            : 'px-1 text-foreground'
      }>
        {editingId === msg.id ? (
          <div className="space-y-3">
            <textarea
              autoFocus
              rows={3}
              value={editValue}
              aria-label={t('chat.editLabel')}
              onChange={(e) => {
                if (containsSecret(e.target.value)) {
                  setEditValue('');
                  blockSecret();
                } else {
                  setEditValue(e.target.value);
                }
              }}
              className="block w-full resize-none bg-white/35 rounded-xl p-2.5 border-none outline-none text-[15px] leading-6 font-medium text-[#3B1A0B]"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setEditingId(null)}
                className="h-9 px-4 rounded-full text-sm font-bold bg-white/40 text-[#3B1A0B]"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={() => saveEdit(msg)}
                disabled={!editValue.trim()}
                className="h-9 px-4 rounded-full text-sm font-bold bg-[#3B1A0B] text-white disabled:opacity-50"
              >
                {t('chat.editSave')}
              </button>
            </div>
          </div>
        ) : msg.liveDuration !== undefined ? (
          <div className="flex items-center gap-2.5 min-w-[9rem]" aria-label={t('chat.liveLabel', { time: formatTime(msg.liveDuration) })}>
            <AudioLines size={18} className="shrink-0" />
            <span className="flex-1 text-sm font-bold">{t('chat.live')}</span>
            <span className="text-sm font-bold tabular-nums">{formatTime(msg.liveDuration)}</span>
          </div>
        ) : msg.voiceDuration !== undefined ? (
          <div className="flex items-center gap-3 min-w-[11rem]" aria-label={t('chat.voiceLabel', { time: formatTime(msg.voiceDuration) })}>
            <div className="w-9 h-9 shrink-0 rounded-full bg-white/45 flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
              <Mic size={16} />
            </div>
            <div className="flex-1 flex items-center gap-[3px] h-6" aria-hidden>
              {Array.from({ length: 18 }).map((_, i) => (
                <span
                  key={i}
                  className="w-[3px] rounded-full bg-[#3B1A0B]/55"
                  style={{ height: `${30 + ((i * 37 + 11) % 70)}%` }}
                />
              ))}
            </div>
            <span className="text-sm font-bold tabular-nums">{formatTime(msg.voiceDuration)}</span>
          </div>
        ) : (
          <>
            {msg.role === 'assistant' && msg.backupModel && (
              <p className="mb-2 flex items-center gap-1.5 text-[13px] font-medium text-muted">
                <Info size={14} className="shrink-0 text-indigo-600 dark:text-indigo-400" />
                {t('chat.backupModel', { model: msg.backupModel })}
              </p>
            )}
            {msg.role === 'assistant' && msg.steps && msg.steps.length > 0 && (
              <div className="mb-2">
                <button
                  onClick={() => setOpenSteps(prev => {
                    const next = new Set(prev);
                    next.has(msg.id) ? next.delete(msg.id) : next.add(msg.id);
                    return next;
                  })}
                  aria-expanded={openSteps.has(msg.id)}
                  className="flex items-center gap-1 text-[13px] font-medium text-muted hover:text-foreground transition-colors"
                >
                  {msg.steps[0]}{msg.steps.length > 1 && t('chat.moreSteps', { count: msg.steps.length - 1 })}
                  <ChevronRight size={14} className={cn('transition-transform', openSteps.has(msg.id) && 'rotate-90')} />
                </button>
                <AnimatePresence initial={false}>
                  {openSteps.has(msg.id) && (
                    <motion.ul
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden mt-1.5 ml-1 pl-3 border-l-2 border-card-border space-y-1"
                    >
                      {msg.steps.map((step, i) => (
                        <li key={i} className="text-xs text-muted font-medium">{step}</li>
                      ))}
                    </motion.ul>
                  )}
                </AnimatePresence>
              </div>
            )}
            {msg.attachment && (
              <div className="mb-1.5" aria-label={t('chat.attachedFile', { name: msg.attachment.name })}>
                {photoPreviews[msg.id] ? (
                  <img src={photoPreviews[msg.id]} alt={msg.attachment.name} className="max-h-48 rounded-2xl object-cover" />
                ) : msg.content !== msg.attachment.name && (
                  <p className="flex items-center gap-1.5 text-xs font-semibold opacity-80">
                    <Paperclip size={13} className="shrink-0" />
                    <span className="truncate">{msg.attachment.name}</span>
                  </p>
                )}
              </div>
            )}
            <div className="chat-md">
              <ErrorBoundary fallback={<p className="text-sm text-muted italic">{t('chat.cantDisplay')}</p>}>
                {/* restoreLineBreaks also repairs older saved replies that arrived on a single line */}
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                  {typeof msg.content === 'string' ? restoreLineBreaks(msg.content) : JSON.stringify(msg.content)}
                </ReactMarkdown>
              </ErrorBoundary>
            </div>
          </>
        )}
      </div>

      {editingId !== msg.id && (() => {
        const actions = actionsFor(msg);
        const versionCount = msg.versions?.length ?? 1;
        if (!actions.copy && !actions.resend && !actions.edit && !actions.share && versionCount < 2) return null;
        return (
          <div className={cn('flex flex-wrap items-center -mt-1', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
            {versionCount > 1 && (
              <VersionArrows
                current={msg.versionIndex ?? 0}
                total={versionCount}
                disabled={busy}
                onChange={(target) => setMessages(prev => switchVersion(prev, msg.id, target))}
              />
            )}
            {actions.copy && <CopyButton text={restoreLineBreaks(msg.content)} />}
            {actions.resend && <ResendButton onClick={() => answerAgain(msg.id)} disabled={busy} />}
            {actions.edit && (
              <EditButton
                disabled={busy}
                onClick={() => {
                  setEditingId(msg.id);
                  setEditValue(msg.content);
                }}
              />
            )}
            {actions.share && <ShareButton text={restoreLineBreaks(msg.content)} />}
          </div>
        );
      })()}

      {msg.type === 'expense_confirmation' && msg.pendingExpense && !msg.resolved && (
        <ExpenseCard msg={msg as WithExpense} cards={cards} />
      )}

      {msg.type === 'income_confirmation' && msg.pendingIncome && !msg.resolved && (
        <IncomeCard msg={msg as WithIncome} cards={cards} />
      )}
    </div>
  );
}

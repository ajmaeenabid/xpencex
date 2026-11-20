import { useRef } from 'react';
import { motion, MotionValue } from 'motion/react';
import SwitchPill, { useNearSide } from '../../../shared/components/SwitchPill';
import { AlertCircle, ArrowUpRight, CheckCircle2, Clock, History, Inbox, MessageSquare, RotateCw, TimerOff, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import { Account } from '../../../shared/types';
import { TKey, useI18n } from '../../../shared/i18n';
import { cn } from '../../../shared/lib/utils';
import ActionCard from './ActionCard';
import type { AgentActions } from './useAgentActions';
import { AgentTask, MAX_FINISHED_TASKS, TASK_EXPIRY_DAYS, TaskStatus, placeForAction, splitTasks } from './tasks';
import { OPEN_PLACES } from './actions';

/** The look of each status: icon, colour and label */
const STATUS: Record<TaskStatus, { icon: typeof Clock; tone: string; label: TKey }> = {
  waiting: { icon: Clock, tone: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10', label: 'agent.space.waitingOne' },
  done: { icon: CheckCircle2, tone: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10', label: 'agent.space.done' },
  cancelled: { icon: XCircle, tone: 'text-muted bg-slate-100 dark:bg-slate-700/50', label: 'agent.space.cancelled' },
  expired: { icon: TimerOff, tone: 'text-muted bg-slate-100 dark:bg-slate-700/50', label: 'agent.space.expired' },
};

const placeExists = (id?: string) => !!id && OPEN_PLACES.some(p => p.id === id);
const smallButton = 'shrink-0 inline-flex items-center gap-1 h-8 px-3 rounded-full text-xs font-bold transition-colors';

/** "Chats | Agent space" at the top of the chat, with how many tasks are waiting */
export function ChatSwitch({ view, setView, waiting, progress }: {
  view: 'chats' | 'agent';
  setView: (v: 'chats' | 'agent') => void;
  waiting: number;
  progress?: MotionValue<number>; // the pages' position (SidePager): the glow moves with them, even mid-swipe
}) {
  const { t } = useI18n();
  const near = useNearSide(progress ?? null, view === 'agent' ? 1 : 0);
  const refs = [useRef<HTMLButtonElement>(null), useRef<HTMLButtonElement>(null)] as const;
  const tabs = [
    { id: 'chats' as const, label: t('agent.space.tabChats'), icon: MessageSquare },
    { id: 'agent' as const, label: t('agent.space.tabAgent'), icon: Inbox },
  ];
  return (
    // A small frosted pill, centred: the page shows faintly through it, and the chosen side glows softly
    <div
      role="tablist"
      aria-label={t('agent.space.switchLabel')}
      className="relative self-center inline-flex items-center gap-0.5 p-0.5 mb-2 rounded-full shrink-0 bg-card/40 backdrop-blur-md border border-white/40 dark:border-white/10 shadow-[0_2px_12px_rgba(0,0,0,0.06)]"
    >
      {progress && <SwitchPill progress={progress} tabs={[refs[0], refs[1]]} />}
      {tabs.map((tab, i) => {
        const on = progress ? near === i : view === tab.id;
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            ref={refs[i]}
            role="tab"
            aria-selected={on}
            onClick={() => setView(tab.id)}
            className={cn(
              'relative z-10 h-7 px-3 flex items-center gap-1.5 rounded-full text-xs font-bold transition-colors',
              on ? 'text-indigo-700 dark:text-indigo-200' : 'text-muted hover:text-foreground',
            )}
          >
            {!progress && on && (
              <motion.span
                layoutId="chat-switch-pill"
                className="absolute inset-0 -z-10 rounded-full bg-indigo-500/15 dark:bg-indigo-400/20 ring-1 ring-indigo-500/25 dark:ring-indigo-300/25"
                transition={{ type: 'spring', stiffness: 500, damping: 38 }}
              />
            )}
            <Icon size={13} />
            {tab.label}
            {tab.id === 'agent' && waiting > 0 && (
              <span aria-label={t('agent.space.waitingBadge', { n: waiting })} className="min-w-4 h-4 px-1 rounded-full text-[10px] leading-4 font-bold text-center bg-amber-500/90 text-white">
                {waiting}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** The short line a task leaves in its chat. It follows the task: waiting, then done, cancelled or expired. */
export function TaskLine({ task, title, failed, onRetry, onReview, onSeeIt }: {
  task: AgentTask | undefined; // undefined once it has left the history (only the newest 100 are kept), or if it was never saved
  title: string; // the line's own words, used when the task is gone
  failed?: boolean; // saving the task failed: offer Try again
  onRetry?: () => void;
  onReview: () => void;
  onSeeIt: (placeId: string) => void;
}) {
  const { t } = useI18n();
  if (!task && failed) {
    return (
      <div className="w-full flex items-center gap-3 p-3 rounded-2xl bg-card border border-rose-200 dark:border-rose-500/30 shadow-sm">
        <span className="w-9 h-9 shrink-0 rounded-xl flex items-center justify-center text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10"><AlertCircle size={18} /></span>
        <span className="flex-1 min-w-0">
          <span className="block text-[11px] font-bold uppercase tracking-wide text-rose-600 dark:text-rose-400">{t('agent.space.notSaved')}</span>
          <span className="block text-sm font-semibold leading-snug text-foreground">{title}</span>
        </span>
        {onRetry && (
          <button onClick={onRetry} className={cn(smallButton, 'bg-rose-600 text-white hover:bg-rose-700')}>
            <RotateCw size={13} /> {t('agent.space.tryAgain')}
          </button>
        )}
      </div>
    );
  }
  const status = task?.status;
  const look = status ? STATUS[status] : STATUS.cancelled;
  const Icon = status ? look.icon : History;
  const place = task?.status === 'done' && task.saved !== false ? placeForAction(task.action) : undefined;
  const text = task?.status === 'done' && task.result ? task.result : task?.title || title;

  return (
    <div id={task ? `task-${task.id}` : undefined} className="w-full flex items-center gap-3 p-3 rounded-2xl bg-card border border-card-border shadow-sm">
      <span className={cn('w-9 h-9 shrink-0 rounded-xl flex items-center justify-center', look.tone)}><Icon size={18} /></span>
      <span className="flex-1 min-w-0">
        <span className="block text-[11px] font-bold uppercase tracking-wide text-muted">{status ? t(status === 'waiting' ? 'agent.space.readyLine' : look.label) : t('agent.space.oldTask')}</span>
        <span className={cn('block text-sm font-semibold leading-snug', status === 'cancelled' || status === 'expired' ? 'text-muted' : 'text-foreground')}>{text}</span>
      </span>
      {status === 'waiting' && (
        <button onClick={onReview} className={cn(smallButton, 'bg-indigo-600 text-white hover:bg-indigo-700')}>{t('agent.space.review')}</button>
      )}
      {place && placeExists(place) && (
        <button onClick={() => onSeeIt(place)} className={cn(smallButton, 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300')}>
          {t('agent.space.seeIt')} <ArrowUpRight size={14} />
        </button>
      )}
    </div>
  );
}

/** Agent space: every waiting task from every chat, each with its card, and the history of finished ones */
export default function AgentSpace({ tasks, chatTitle, agent, accounts, currencySymbol, onConfirm, onCancel, onGoToChat, onSeeIt }: {
  tasks: AgentTask[];
  chatTitle: (chatId: string) => string | undefined;
  agent: AgentActions;
  accounts: Account[];
  currencySymbol: string;
  onConfirm: (task: AgentTask) => void;
  onCancel: (task: AgentTask) => void;
  onGoToChat: (task: AgentTask) => void;
  onSeeIt: (placeId: string) => void;
}) {
  const { t, dateLocale } = useI18n();
  const { waiting, finished } = splitTasks(tasks);
  const when = (iso: string) => format(new Date(iso), 'd MMM, h:mm a', { locale: dateLocale });
  const from = (task: AgentTask) => {
    const name = chatTitle(task.chatId);
    return name ? t('agent.space.from', { chat: name }) : t('agent.space.fromChat');
  };

  return (
    <div className="flex-1 overflow-y-auto px-1 py-3 space-y-7 no-scrollbar">
      <section className="space-y-3" aria-labelledby="agent-waiting">
        <h3 id="agent-waiting" className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted">
          <Clock size={14} /> {t('agent.space.waiting')} {waiting.length > 0 && <span className="text-amber-600 dark:text-amber-400">{waiting.length}</span>}
        </h3>
        {waiting.length === 0 && (
          <div className="flex flex-col items-center text-center gap-2 py-8 px-6 rounded-3xl border border-dashed border-card-border">
            <span className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center"><Inbox size={22} /></span>
            <p className="text-sm font-bold text-foreground">{t('agent.space.emptyTitle')}</p>
            <p className="text-xs font-medium text-muted leading-relaxed">{t('agent.space.empty')}</p>
          </div>
        )}
        {waiting.map(task => (
          <div key={task.id} id={`agent-task-${task.id}`} className="space-y-2 scroll-mt-2">
            <div className="flex items-center gap-2 px-1">
              <span className="flex-1 min-w-0 truncate text-xs font-semibold text-muted">{from(task)} · {when(task.createdAt)}</span>
              <button onClick={() => onGoToChat(task)} className={cn(smallButton, 'h-7 bg-card border border-card-border text-muted hover:text-foreground')}>
                <MessageSquare size={13} /> {t('agent.space.goToChat')}
              </button>
            </div>
            {task.title && <p className="px-1 text-sm font-medium text-foreground leading-relaxed">{task.title}</p>}
            <ActionCard
              msg={{ id: task.id, replyLang: task.replyLang, pendingAction: task.action }}
              agent={agent}
              accounts={accounts}
              currencySymbol={currencySymbol}
              onConfirm={() => onConfirm(task)}
              onCancel={() => onCancel(task)}
            />
          </div>
        ))}
      </section>

      <section className="space-y-2" aria-labelledby="agent-history">
        <h3 id="agent-history" className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted">
          <History size={14} /> {t('agent.space.history')}
        </h3>
        {finished.length === 0 && <p className="px-1 text-xs font-medium text-muted">{t('agent.space.historyEmpty')}</p>}
        {finished.map(task => {
          const look = STATUS[task.status];
          const Icon = look.icon;
          const place = task.status === 'done' && task.saved !== false ? placeForAction(task.action) : undefined;
          return (
            <div key={task.id} className="flex items-start gap-3 p-3 rounded-2xl bg-card border border-card-border">
              <span className={cn('w-8 h-8 shrink-0 rounded-xl flex items-center justify-center', look.tone)}><Icon size={16} /></span>
              <span className="flex-1 min-w-0 space-y-0.5">
                <span className={cn('block text-sm font-semibold leading-snug', task.status === 'done' ? 'text-foreground' : 'text-muted')}>
                  {task.status === 'done' && task.result ? task.result : task.title}
                </span>
                <span className="block text-[11px] font-medium text-muted">
                  {t(look.label)} · {when(task.doneAt || task.createdAt)} · {from(task)}
                </span>
              </span>
              {place && placeExists(place) && (
                <button onClick={() => onSeeIt(place)} aria-label={t('agent.space.seeIt')} className={cn(smallButton, 'h-7 px-2.5 bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300')}>
                  <ArrowUpRight size={14} />
                </button>
              )}
            </div>
          );
        })}
        <p className="px-1 pt-1 text-[11px] font-medium text-muted">{t('agent.space.keep', { max: MAX_FINISHED_TASKS, days: TASK_EXPIRY_DAYS })}</p>
      </section>
    </div>
  );
}

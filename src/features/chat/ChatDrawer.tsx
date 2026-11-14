import { AnimatePresence, motion } from 'motion/react';
import { PanelLeftClose, Pencil, Pin, PinOff, Plus, Trash2 } from 'lucide-react';
import { isToday, isYesterday, differenceInCalendarDays } from 'date-fns';
import { Chat } from '../../shared/types';
import { cn } from '../../shared/lib/utils';
import { useI18n, TFunction, TKey } from '../../shared/i18n';
import type { Expense, Receipt } from '../../shared/types';
import ReceiptsGallery from '../receipts/ReceiptsGallery';

// Sidebar sections, newest first, like the Claude app
function groupChats(chats: Chat[], t: TFunction) {
  const order: TKey[] = ['chat.group.today', 'chat.group.yesterday', 'chat.group.week', 'chat.group.older'];
  const buckets: Partial<Record<TKey, Chat[]>> = {};
  chats.filter(c => !c.pinned).forEach(c => {
    const d = new Date(c.updatedAt);
    const key: TKey = isToday(d) ? 'chat.group.today'
      : isYesterday(d) ? 'chat.group.yesterday'
      : differenceInCalendarDays(new Date(), d) <= 7 ? 'chat.group.week'
      : 'chat.group.older';
    (buckets[key] ||= []).push(c);
  });
  const pinned = chats.filter(c => c.pinned);
  return [
    ...(pinned.length ? [{ label: t('chat.group.pinned'), items: pinned }] : []),
    ...order.filter(k => buckets[k]).map(k => ({ label: t(k), items: buckets[k]! })),
  ];
}

/** The chat history drawer: pinned chats first, then chats by day, each with pin, rename and delete */
export default function ChatDrawer({
  sidebarOpen, setSidebarOpen, chats, activeId, busy, pinFullNote, startNewChat, openChat, togglePin, deleteChat,
  renamingId, setRenamingId, renameValue, setRenameValue, commitRename, receipts, onOpenExpense, tab, setTab,
}: {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  chats: Chat[];
  activeId: string;
  busy: boolean;
  pinFullNote: boolean;
  startNewChat: () => void;
  openChat: (chat: Chat) => void;
  togglePin: (chat: Chat) => void;
  deleteChat: (chat: Chat) => void;
  renamingId: string | null;
  setRenamingId: (id: string | null) => void;
  renameValue: string;
  setRenameValue: (value: string) => void;
  commitRename: () => void;
  receipts: Receipt[] | null; // for the Receipts tab
  onOpenExpense: (expense: Expense) => void;
  tab: 'chats' | 'receipts';
  setTab: (tab: 'chats' | 'receipts') => void;
}) {
  const { t } = useI18n();
  const groups = groupChats(chats, t);

  const chatRow = (chat: Chat) => {
    const isActive = chat.id === activeId;
    return (
      <div
        key={chat.id}
        className={cn(
          'group flex items-center gap-1 rounded-xl pl-3 pr-1 transition-colors',
          isActive ? 'bg-indigo-500/12 dark:bg-indigo-400/15' : 'hover:bg-background/60',
          busy && !isActive && 'opacity-50'
        )}
      >
        {renamingId === chat.id ? (
          <input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') setRenamingId(null);
            }}
            maxLength={80}
            aria-label={t('chat.chatName')}
            className="flex-1 min-w-0 my-1.5 px-2 py-1.5 rounded-lg bg-background border border-indigo-400/60 outline-none text-sm font-semibold text-foreground"
          />
        ) : (
          <button
            onClick={() => openChat(chat)}
            disabled={busy && !isActive}
            className={cn(
              'flex-1 min-w-0 py-3 text-left text-sm truncate',
              isActive ? 'font-bold text-indigo-600 dark:text-indigo-400' : 'font-medium text-foreground'
            )}
          >
            {chat.title}
          </button>
        )}
        {renamingId !== chat.id && (
          <>
            <button
              onClick={() => togglePin(chat)}
              aria-label={t(chat.pinned ? 'chat.unpin' : 'chat.pin', { title: chat.title })}
              aria-pressed={!!chat.pinned}
              title={chat.pinned ? t('chat.unpin', { title: '' }).trim() : t('chat.pin', { title: '' }).trim()}
              className={cn('p-2 rounded-lg hover:text-indigo-600 dark:hover:text-indigo-400', chat.pinned ? 'text-indigo-600 dark:text-indigo-400' : 'text-muted')}
            >
              {chat.pinned ? <PinOff size={14} /> : <Pin size={14} />}
            </button>
            <button
              onClick={() => { setRenamingId(chat.id); setRenameValue(chat.title); }}
              aria-label={t('chat.renameLabel', { title: chat.title })}
              title={t('chat.rename')}
              className="p-2 rounded-lg text-muted hover:text-indigo-600 dark:hover:text-indigo-400"
            >
              <Pencil size={14} />
            </button>
            <button
              onClick={() => deleteChat(chat)}
              disabled={busy && isActive}
              aria-label={t('chat.deleteLabel', { title: chat.title })}
              title={t('common.delete')}
              className="p-2 rounded-lg text-muted hover:text-rose-500 disabled:opacity-40"
            >
              <Trash2 size={14} />
            </button>
          </>
        )}
      </div>
    );
  };

  return (
    <AnimatePresence>
      {sidebarOpen && (
        <>
          <motion.div
            key="scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSidebarOpen(false)}
            className="absolute inset-0 z-20 bg-black/30 backdrop-blur-[2px]"
          />
          <motion.aside
            key="drawer"
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 38 }}
            aria-label={t('chat.history')}
            className="absolute inset-y-0 left-0 z-30 w-[82%] max-w-xs flex flex-col bg-card border-r border-card-border rounded-r-[2rem] shadow-2xl"
          >
            <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-3">
              {/* Chats and Receipts tabs */}
              <div role="tablist" className="flex-1 grid grid-cols-2 p-1 rounded-xl bg-background/60">
                {([['chats', t('chat.chats')], ['receipts', receipts ? t('receipts.tabCount', { count: receipts.length }) : t('receipts.tab')]] as const).map(([id, label]) => (
                  <button
                    key={id}
                    role="tab"
                    aria-selected={tab === id}
                    onClick={() => setTab(id)}
                    className={cn('py-1.5 rounded-lg text-sm font-bold transition-colors', tab === id ? 'bg-card text-foreground shadow-soft' : 'text-muted')}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button onClick={() => setSidebarOpen(false)} aria-label={t('chat.closeHistory')} className="p-2 rounded-xl text-muted hover:text-foreground">
                <PanelLeftClose size={18} />
              </button>
            </div>
            {tab === 'receipts' ? (
              <div className="flex-1 overflow-y-auto px-4 pb-24 no-scrollbar">
                <ReceiptsGallery receipts={receipts} onOpenExpense={(e) => { setSidebarOpen(false); onOpenExpense(e); }} />
              </div>
            ) : (<>
            <div className="px-3 pb-3">
              <button
                onClick={startNewChat}
                disabled={busy}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-600 text-white text-sm font-bold shadow-vibrant disabled:opacity-50 disabled:shadow-none"
              >
                <Plus size={16} /> {t('chat.newChat')}
              </button>
            </div>
            <p className="px-4 pb-3 text-[12px] leading-relaxed font-medium text-muted">{t('chat.pinTip')}</p>
            {pinFullNote && <p role="status" className="px-4 pb-3 text-[12px] leading-relaxed font-bold text-rose-500">{t('chat.pinFull')}</p>}
            <div className="flex-1 overflow-y-auto px-2 pb-24 no-scrollbar">
              {chats.length === 0 ? (
                <p className="text-xs text-muted font-medium text-center px-6 pt-8 leading-relaxed">
                  {t('chat.emptyHistory')}
                </p>
              ) : (
                groups.map(group => (
                  <div key={group.label} className="mb-3">
                    <p className="px-3 py-1.5 text-xs font-semibold text-muted">{group.label}</p>
                    {group.items.map(chatRow)}
                  </div>
                ))
              )}
            </div>
            </>)}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

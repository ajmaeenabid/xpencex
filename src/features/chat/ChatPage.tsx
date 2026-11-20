import { useState, useEffect, useRef } from 'react';
import ChatHeader from './ChatHeader';
import { useAuth } from '../../app/App';
import { ChatMessage, Expense, AccountType } from '../../shared/types';
import { processInput, processAudioInput, processAttachment, transcribeVoice, ChatTurn } from './aiService';
import { blockedBy, chatUsage } from './limits';
import { ReplyLanguage, scriptLanguage } from './language';
import { motion, AnimatePresence, useMotionValue } from 'motion/react';
import SidePager, { SidePagerHandle } from '../../shared/components/SidePager';
import { X, Sparkles, ShieldAlert, PanelLeft, SquarePen } from 'lucide-react';
import { MAJOR_CURRENCIES } from '../../shared/constants';
import { parseTransactionSms, maskSensitive } from '../../shared/lib/smsParser';
import { containsSecret } from '../../shared/lib/sensitiveData';
import { useI18n, TFunction, TKey, translate } from '../../shared/i18n';
import { useAccounts } from '../accounts/accountService';
import { chatIsFull, startVersion } from './versions';
import { cleanSpokenText, memoryBoundary, memoryFor } from './chatHistory';
import { useChatData } from './useChatData';
import { useLimitNotes } from './useLimitNotes';
import { useAttachments } from './useAttachments';
import { OnRecorded, useVoiceRecorder } from './useVoiceRecorder';
import { useLiveChat } from './useLiveChat';
import { useConfirmActions } from './useConfirmActions';
import { useAgentActions } from './agent/useAgentActions';
import { AgentData, agentContext, readAction } from './agent/actions';
import { useLoans } from '../accounts/loanService';
import { useOwnReminders } from '../reminders/ownReminderService';
import { reminderSettings } from '../reminders/reminders';
import { useFunds } from '../funds/fundService';
import { useSamities } from '../samity/samityService';
import { usePlanned } from '../planned/plannedService';
import { useCategoryRules } from '../categoryRules/categoryRuleService';
import { useShoppingLists } from '../shopping/shoppingService';
import { useWarranties } from '../warranties/warrantyService';
import { ruleCategoryFor } from '../categoryRules/categoryRules';
import type { Place } from '../search/searchPlaces';
import { useChatHistory } from './useChatHistory';
import ChatDrawer from './ChatDrawer';
import { useReceipts } from '../receipts/useReceipts';
import { useChatReceipts } from '../receipts/useChatReceipts';
import ChatWelcome from './ChatWelcome';
import MessageItem from './MessageItem';
import ChatNotices from './ChatNotices';
import AttachMenu from './AttachMenu';
import ChatComposer from './ChatComposer';
import { CardActions } from './ConfirmCards';
import { isOnline } from '../../shared/lib/offlineSave';
import { cn } from '../../shared/lib/utils';
import { alertDialog } from '../../shared/components/Dialog';
import AgentSpace, { ChatSwitch } from './agent/AgentSpace';
import { createTask, finishTask, newTaskId, useTasks } from './agent/taskService';
import { AgentTask, taskTitle } from './agent/tasks';
import { AgentAction, OPEN_PLACES } from './agent/actions';
import { useKeyboardOpen } from '../../shared/lib/keyboard';

// Money questions get a status that says the assistant is looking at the user's data
const MONEY_QUESTION = /spen|expens|budget|report|total|sav|cost|money|taka|tk|৳|balance|month|week|afford|plan/i;

/** `active` is false while another tab is showing: the chat stays mounted so the conversation and any pending reply survive */
export default function ChatPage({ active = true, incomingText, onIncomingHandled, draftText, onDraftHandled, onOpenExpense, onGoTo }: {
  onOpenExpense: (expense: Expense) => void; // from a receipt in the drawer's Receipts tab
  onGoTo?: (place: Place) => void; // the Open button on an "open a screen" card
  active?: boolean;
  incomingText?: string | null; // an SMS shared into the app; read once, in a fresh chat
  onIncomingHandled?: () => void;
  draftText?: string | null; // typed in Home's search, then Ask: put in the message box, not sent
  onDraftHandled?: () => void;
}) {
  const { user, profile, refreshProfile, isDarkMode } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  // What the assistant is doing right now, shown while waiting for a reply
  const { t, lang } = useI18n();
  const keyboardOpen = useKeyboardOpen();
  const [status, setStatus] = useState<TKey>('chat.status.thinking');
  const [openSteps, setOpenSteps] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const usage = chatUsage(messages);
  const currencySymbol = MAJOR_CURRENCIES.find(c => c.code === profile?.currency)?.symbol || '৳';
  const accounts = useAccounts(user?.uid);
  const { categories, spendingContext, recentExpenses, recentIncome, recurring } = useChatData(user, profile);
  const categoryBudgets = profile?.categoryBudgets || {};
  const loans = useLoans(user?.uid);
  const ownReminders = useOwnReminders(user?.uid);
  // ChatPage only shows when someone is signed in, so the id is always there
  const funds = useFunds(user?.uid || '');
  const samities = useSamities(user?.uid || '');
  const planned = usePlanned(user?.uid);
  const shoppingLists = useShoppingLists(user?.uid);
  const warranties = useWarranties(user?.uid);
  // The person's category rules decide the category on the cards made from SMS and the AI
  const categoryRules = useCategoryRules(user?.uid);
  const ruleCategory = (title?: string) => ruleCategoryFor(title, categoryRules, categories);
  // Typed and voice messages also see account names and loans, so they can prepare action cards (agent/actions.ts)
  const aiContext = [spendingContext, agentContext(accounts, loans, recentIncome, recurring, categoryBudgets, {
    darkMode: isDarkMode, language: lang, currency: profile?.currency || 'BDT', reminders: reminderSettings(profile?.reminders), monthStart: profile?.monthStart,
  }, funds, samities, planned, shoppingLists, warranties)].join('\n');
  const {
    limits, setLimits, limitNote, setLimitNote, limitNoteVars, setLimitNoteVars, warnedRef, warnOnce, explainIfBlocked, explainIfNoAiLeft,
  } = useLimitNotes(user, active, usage, categories);

  // Shown when the user pastes, types or shares an OTP / PIN: the text is thrown away and this warns them
  const [secretWarning, setSecretWarning] = useState(false);
  const secretTimerRef = useRef<number | null>(null);
  const blockSecret = () => {
    setInput('');
    setSecretWarning(true);
    if (secretTimerRef.current) window.clearTimeout(secretTimerRef.current);
    secretTimerRef.current = window.setTimeout(() => setSecretWarning(false), 12000);
  };

  // Pre-select an account when the user has exactly one of that kind (one bank, one bKash...)
  const suggestAccount = (type?: AccountType) => {
    const matches = accounts.filter(a => a.type === type);
    return matches.length === 1 ? matches[0].id : undefined;
  };

  const markResolved = (id: string, saved = false) =>
    setMessages(prev => prev.map(m => (m.id === id ? { ...m, resolved: true, ...(saved && { saved: true }) } : m)));

  // Earlier messages sent along with a new question (voice notes and live chat markers have no text, so they're skipped)
  const recentHistory = (list: ChatMessage[] = messages): ChatTurn[] => memoryFor(list, Date.now());

  const addMessage = (role: 'user' | 'assistant', content: string, type: ChatMessage['type'] = 'text', pending?: Partial<Expense>, extra?: Partial<ChatMessage>) => {
    const newMessage: ChatMessage = {
      id: Math.random().toString(36).substr(2, 9),
      role,
      content,
      timestamp: Date.now(),
      type,
      pendingExpense: pending,
      ...extra,
    };
    setMessages(prev => [...prev, newMessage]);
    return newMessage.id;
  };

  // Sentences follow the language the user just used; card labels and buttons stay in the app's language
  const tIn = (language?: ReplyLanguage): TFunction => (key, vars) => translate(language || lang, key, vars);

  // Agent space: every action the AI prepares becomes a task there; the chat keeps one short line for it
  const tasks = useTasks(user?.uid);
  const [view, setView] = useState<'chats' | 'agent'>('chats');
  // Moves between Chats and Agent space by sliding (src/shared/components/SidePager.tsx)
  const chatPager = useRef<SidePagerHandle>(null);
  // The pages' position, which the switch's glow follows (so it never lags behind the pages)
  const pagerProgress = useMotionValue<number>(0);
  const slideView = (next: 'chats' | 'agent') => {
    if (chatPager.current) chatPager.current.slideTo(next === 'agent' ? 1 : 0);
    else setView(next);
  };
  const waitingCount = tasks.filter(task => task.status === 'waiting').length;
  const makeTask = (action: AgentAction, words: string | undefined, replyLang: ReplyLanguage) => {
    if (!user) return;
    const title = taskTitle(words, tIn(replyLang)('agent.taskFallback'));
    const taskId = newTaskId();
    // The line keeps the action too, so a task that couldn't be saved can be tried again from it
    const messageId = addMessage('assistant', title, 'task_link', undefined, { taskId, replyLang, pendingAction: action });
    saveTaskFor(messageId, taskId, title, action, replyLang);
  };
  const setTaskFailed = (messageId: string, failed: boolean) =>
    setMessages(prev => prev.map(m => (m.id === messageId ? { ...m, taskFailed: failed } : m)));
  const saveTaskFor = (messageId: string, taskId: string, title: string, action: AgentAction, replyLang?: ReplyLanguage) => {
    if (!user) return Promise.resolve();
    return createTask(taskId, { uid: user.uid, chatId: activeId, messageId, title, action, replyLang })
      .then(() => setTaskFailed(messageId, false))
      .catch(err => {
        console.error('Could not save the task', err);
        setTaskFailed(messageId, true);
      });
  };
  /** "Try again" on a line whose task couldn't be saved */
  const retryTask = (msg: ChatMessage) => {
    if (msg.taskId && msg.pendingAction) saveTaskFor(msg.id, msg.taskId, msg.content, msg.pendingAction, msg.replyLang);
  };

  // What the AI's action codes (A1, E1, G1...) point at: the same lists it was shown
  const agentData = (): AgentData => ({ accounts, expenses: recentExpenses, incomes: recentIncome, categories, recurring, categoryBudgets, funds, samities, shoppingLists });

  // Shows an AI reply: a confirm card for money, or the written answer
  /** Shows the AI's answer. Returns the id of the expense card it made, if it made one. */
  const showResult = (result: Awaited<ReturnType<typeof processInput>>, askKey: TKey): string | null => {
    const replyLang = result.language || lang;
    const say = tIn(replyLang);
    const action = result.type === 'action' ? readAction(result.action, agentData()) : null;
    if (action) {
      makeTask(action, result.content, replyLang);
    } else if (result.type === 'action') {
      // An action the app can't show (or one with no amount): say so instead of showing nothing
      addMessage('assistant', say('agent.cantDo'), 'text', undefined, { backupModel: result.backup, replyLang });
    } else if (result.type === 'income' && result.expense?.amount) {
      const { title, amount, date, notes, labels } = result.expense;
      addMessage('assistant', say('chat.aiIncome', { amount: `${currencySymbol}${amount.toLocaleString()}` }), 'income_confirmation', undefined,
        { pendingIncome: { title: title || say('chat.moneyReceived'), amount, date: date || new Date().toISOString(), notes, labels }, backupModel: result.backup, replyLang });
    } else if (result.type === 'expense' && result.expense) {
      const ruled = ruleCategory(result.expense.title);
      if (result.expense.category === 'INVALID' && !ruled) {
        addMessage('assistant', say('chat.noCategory'), 'error', undefined, { backupModel: result.backup, replyLang });
      } else {
        // A "new" category that the user already has (in other capitals) is just that category
        const existing = ruled || categories.find(c => c.toLowerCase() === result.expense!.category.toLowerCase());
        const expense = existing ? { ...result.expense, category: existing } : result.expense;
        return addMessage('assistant', say(askKey), 'expense_confirmation', expense,
          { backupModel: result.backup, replyLang, ...(result.newCategory && !existing && { newCategory: true }) });
      }
    } else {
      addMessage('assistant', result.content, 'text', undefined, { steps: result.steps, backupModel: result.backup, replyLang });
    }
    return null;
  };

  const {
    cameraInputRef, galleryInputRef, filesInputRef, attachMenuOpen, setAttachMenuOpen,
    attachment, setAttachment, photoPreviews, setPhotoPreviews, openPicker, handleFilePicked, removeAttachment,
  } = useAttachments({ explainIfBlocked, setSecretWarning, setLimitNote, warnOnce, limits, usage });

  const {
    isRecording, recordingSeconds, isPaused, startRecording: startVoiceRecording, pauseRecording, resumeRecording, stopRecording,
  } = useVoiceRecorder({ explainIfBlocked, addMessage, setLimitNote, t });

  const { liveState, liveSeconds, liveCaption, liveRef, startLive } = useLiveChat({
    loading, isRecording, setLimitNote, explainIfBlocked, setLimits, lang, categories, spendingContext: aiContext,
    recentHistory: () => recentHistory(), addMessage, setMessages, setSecretWarning, currencySymbol, tIn, t, agentData,
    onAction: makeTask, ruleCategory,
  });

  // "Keep this receipt" on expense cards made from a photo or PDF
  const chatReceipts = useChatReceipts(user?.uid, t);
  const { isConfirming, accountChoices, setAccountChoices, categoryChoices, setCategoryChoices, syncChoices, setSyncChoices, debtChoices, setDebtChoices, confirmIncome, confirmExpense } = useConfirmActions({
    user, messages, accounts, categories, currencySymbol, tIn, t, addMessage, markResolved, afterExpenseSaved: chatReceipts.afterSaved,
  });

  // Opening a screen leaves the chat, which ends a live chat anyway: end it first, cleanly
  const goTo = onGoTo && ((place: Place) => { liveRef.current?.finish('user'); onGoTo(place); });

  const agent = useAgentActions({ user, messages, accounts, expenses: recentExpenses, incomes: recentIncome, recurring, categories, funds, samities, ownReminderCount: ownReminders.length, plannedCount: planned.length, shoppingLists, refreshProfile, currencySymbol, tIn, t, addMessage, markResolved, onGoTo: goTo,
  });

  // Per-chat messages and anything only meant for the chat being left
  const resetChatExtras = () => {
    setAttachment(null);
    setLimitNote(null);
    setEditingId(null);
    warnedRef.current.clear();
    setPhotoPreviews(prev => {
      Object.values(prev).forEach(url => URL.revokeObjectURL(url));
      return {};
    });
  };

  const {
    chats, chatsLoaded, activeId, activeIsSaved, newChatPlan, saveError, pinFullNote, notSavedClosedFor, setNotSavedClosedFor,
    sidebarOpen, setSidebarOpen, renamingId, setRenamingId, renameValue, setRenameValue,
    togglePin, startNewChat, openChat, commitRename, deleteChat,
    temporary, startTemporaryChat, leaveTemporaryChat,
  } = useChatHistory({
    user, t, messages, setMessages, setInput, setLimitNote, setLimitNoteVars, resetChatExtras, loading, isRecording, liveState,
  });

  /** Confirm in Agent space: saved like any card, then the task (and its line in chat) shows the result */
  const confirmTask = async (task: AgentTask) => {
    const outcome = await agent.runAction({ id: task.id, pendingAction: task.action, replyLang: task.replyLang });
    if (outcome.kind === 'problem') { alertDialog(outcome.text); return; }
    if (outcome.kind !== 'done') return;
    await finishTask(task, 'done', outcome.reply, outcome.saved !== false).catch(err => console.error('Could not update the task', err));
    outcome.after?.();
  };
  const cancelTask = (task: AgentTask) =>
    finishTask(task, 'cancelled', tIn(task.replyLang)('agent.cancelled')).catch(err => console.error('Could not update the task', err));

  /** "Go to chat": the task's chat, scrolled to its line */
  const goToChat = (task: AgentTask) => {
    if (task.chatId !== activeId) {
      const chat = chats.find(c => c.id === task.chatId);
      if (!chat) { alertDialog(t('agent.space.chatGone')); return; }
      openChat(chat);
    }
    slideView('chats');
    window.setTimeout(() => document.getElementById(`task-${task.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 350);
  };
  /** "Review" on a chat line: Agent space, scrolled to that task's card */
  const reviewTask = (taskId: string) => {
    slideView('agent');
    window.setTimeout(() => document.getElementById(`agent-task-${taskId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 350);
  };
  const seeIt = (placeId: string) => {
    const place = OPEN_PLACES.find(p => p.id === placeId);
    if (place && goTo) goTo(place);
  };

  // Read only while the drawer is open, for its Receipts tab
  const receipts = useReceipts(user?.uid, sidebarOpen);
  const [drawerTab, setDrawerTab] = useState<'chats' | 'receipts'>('chats');
  const openReceipts = () => { setDrawerTab('receipts'); setSidebarOpen(true); };
  // Coming back from the drawer: a card that was full may have room now
  useEffect(() => { if (!sidebarOpen) chatReceipts.recheckFull(); }, [sidebarOpen]);

  // Grow the message box with its content, up to a limit. A hidden chat measures 0, so skip
  // measuring until it's visible (and re-measure when it becomes visible).
  useEffect(() => {
    const el = textareaRef.current;
    if (!el || !active) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 24), 140)}px`;
  }, [input, isRecording, active]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async (text: string = input) => {
    if (attachment) return sendAttachment(text);
    if (!text.trim() || loading) return;
    // An OTP, PIN or password is dropped here: it's never shown, saved, or sent to the AI
    if (containsSecret(text)) {
      blockSecret();
      return;
    }

    // Account, card and phone numbers are hidden first, so they never reach the screen,
    // the saved chat history, or the AI
    const userText = maskSensitive(text.trim());
    // Offline, only a wallet or bank SMS can be answered (it's read on the phone). The text stays in the box.
    if (!isOnline() && !parseTransactionSms(userText, categories)) {
      setLimitNote('chat.offline');
      return;
    }
    if (explainIfNoAiLeft(userText)) return;
    setInput('');
    addMessage('user', userText);
    await answerPrompt(userText, recentHistory());
  };

  // Answers a prompt that's already in the chat, from a new send, a resend or an edit
  const answerPrompt = async (userText: string, history: ChatTurn[]) => {
    setLoading(true);

    // bKash/Nagad/Rocket and bank SMS are read on the device: instant, free, and private
    const sms = parseTransactionSms(userText, categories);
    if (sms) {
      const replyLang = scriptLanguage(userText);
      const say = tIn(replyLang);
      const accountId = suggestAccount(sms.accountType);
      const smsInfo = { ref: sms.ref, balance: sms.balance, accountType: sms.accountType };
      const source = sms.provider === 'Bank' ? say('chat.bankSource') : `**${sms.provider}**`;
      if (sms.kind === 'income') {
        const ask = sms.provider === 'Bank' ? say('chat.askBank') : say('chat.askAccount');
        addMessage('assistant', say('chat.smsIncome', { source, amount: `${currencySymbol}${sms.income.amount.toLocaleString()}`, ask }), 'income_confirmation', undefined,
          { pendingIncome: { ...sms.income, accountId }, sms: smsInfo, replyLang });
      } else {
        addMessage('assistant', say('chat.smsExpense', { source }), 'expense_confirmation', { ...sms.expense, category: ruleCategory(sms.expense.title) || sms.expense.category, accountId }, { sms: smsInfo, replyLang });
      }
      setLoading(false);
      return;
    }

    setStatus(MONEY_QUESTION.test(userText) ? 'chat.status.checking' : 'chat.status.thinking');
    try {
      showResult(await processInput(userText, categories, aiContext, history, lang), 'chat.confirmExpenseAsk');
    } catch (error) {
      addMessage('assistant', t('chat.genericError'), 'error');
    } finally {
      setLoading(false);
    }
  };

  // Resending uses the same words; editing passes new ones. The old version stays behind the arrows.
  const answerAgain = (id: string, newText?: string) => {
    const index = messages.findIndex(m => m.id === id);
    if (index < 0 || busy) return;
    const text = newText ?? messages[index].content;
    if (!isOnline() && !parseTransactionSms(text, categories)) {
      setLimitNote('chat.offline');
      return;
    }
    if (explainIfNoAiLeft(text)) return;
    if (chatIsFull(messages)) {
      setLimitNote('limit.chat.full');
      return;
    }
    const history = recentHistory(messages.slice(0, index));
    setEditingId(null);
    setMessages(prev => startVersion(prev, id, text));
    answerPrompt(text, history);
  };

  const saveEdit = (message: ChatMessage) => {
    if (containsSecret(editValue)) {
      setEditValue('');
      blockSecret();
      return;
    }
    const text = maskSensitive(editValue.trim());
    if (!text) return;
    if (text === message.content) {
      setEditingId(null);
      return;
    }
    answerAgain(message.id, text);
  };

  // A finished voice message: shown as a voice note, then answered
  const sendVoice: OnRecorded = async (base64Audio, mimeType, voiceDuration) => {
    setLoading(true);
    setStatus('chat.status.listening');
    const voiceId = addMessage('user', t('chat.voiceMessage'), 'text', undefined, { voiceDuration });

    try {
      // Written out first (Groq or Cloudflare), so the answer can come from the normal text chain.
      // When that fails, Gemini listens to the recording as before.
      const written = await transcribeVoice(base64Audio, mimeType);
      if ('reply' in written) {
        showResult(written.reply, 'chat.confirmVoiceAsk');
        return;
      }
      const { words } = written;
      if (words && containsSecret(words)) {
        // Same as a typed OTP or PIN: the message goes, nothing is sent on
        setMessages(prev => prev.filter(m => m.id !== voiceId));
        blockSecret();
        return;
      }
      const heard = words ? cleanSpokenText(words, containsSecret, maskSensitive) : null;
      const result = heard
        ? await processInput(heard, categories, aiContext, recentHistory(), lang, true)
        : await processAudioInput(base64Audio, mimeType, categories, aiContext, recentHistory(), lang);
      const spokenText = heard ?? cleanSpokenText(result.heard, containsSecret, maskSensitive);
      if (spokenText) setMessages(prev => prev.map(m => (m.id === voiceId ? { ...m, spokenText } : m)));
      showResult(result, 'chat.confirmVoiceAsk');
    } catch (error) {
      addMessage('assistant', t('chat.audioError'), 'error');
    } finally {
      setLoading(false);
    }
  };

  // While another tab is showing: close the drawer and discard an unfinished recording.
  // When coming back: jump to the latest message.
  useEffect(() => {
    if (active) {
      requestAnimationFrame(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      });
    } else {
      setSidebarOpen(false);
      setAttachMenuOpen(false);
      stopRecording(true);
      liveRef.current?.finish('user');
      // A temporary chat is gone once you leave the chat
      leaveTemporaryChat();
    }
  }, [active]);

  // Nothing holding an OTP / PIN may stay in the open conversation (the save that follows removes it from the database)
  useEffect(() => {
    if (!messages.some(m => containsSecret(m.content || ''))) return;
    setMessages(prev => prev.filter(m => !containsSecret(m.content || '')));
    setSecretWarning(true);
  }, [messages]);

  // A shared SMS: wait until the chat is showing and categories are loaded, then read it in a new chat
  useEffect(() => {
    if (!incomingText || !active || !user || categories.length === 0 || loading || isRecording || liveState || attachment) return;
    const text = incomingText;
    onIncomingHandled?.();
    if (messages.length > 0) startNewChat();
    setTimeout(() => handleSend(text), 0);
  }, [incomingText, active, user, categories.length, attachment]);

  // From Home's search: the typed text waits in the message box, ready to edit or send
  useEffect(() => {
    if (!draftText || !active) return;
    setInput(draftText);
    onDraftHandled?.();
    window.setTimeout(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(draftText.length, draftText.length);
    }, 50);
  }, [draftText, active]);

  const sendAttachment = async (text: string) => {
    if (!attachment || loading) return;
    if (containsSecret(text)) {
      blockSecret();
      return;
    }
    if (explainIfBlocked('file')) return;
    const file = attachment;
    const message = maskSensitive(text.trim());
    const history = recentHistory();
    setInput('');
    setAttachment(null);
    const id = addMessage('user', message || file.name, 'text', undefined, { attachment: { name: file.name, kind: file.kind } });
    if (file.previewUrl) setPhotoPreviews(prev => ({ ...prev, [id]: file.previewUrl! }));
    setLoading(true);
    setStatus('chat.status.file');
    try {
      const cardId = showResult(await processAttachment(file, message, categories, spendingContext, history, lang), 'chat.receiptAsk');
      if (cardId) chatReceipts.offerFor(cardId, file).catch(err => console.error('Could not get the receipt ready', err));
    } catch (error) {
      addMessage('assistant', t('chat.genericError'), 'error');
    } finally {
      setLoading(false);
    }
  };

  const firstName = profile?.name?.split(' ')[0];
  const activeChat = chats.find(c => c.id === activeId);
  const headerTitle = activeChat?.title || t('chat.newChat');
  const busy = loading || isRecording || !!liveState;
  const voiceBlocked = blockedBy('voice', limits, usage);
  const liveBlocked = blockedBy('live', limits, usage);
  const fileBlocked = blockedBy('file', limits, usage);

  const memoryStart = memoryBoundary(messages, Date.now());
  const memoryLine = (
    <p className="basis-full mb-4 text-center text-[12px] font-medium text-muted">{t('chat.memoryNote')}</p>
  );

  const cards: CardActions = {
    messages, currencySymbol, accounts, categories, accountChoices, setAccountChoices, categoryChoices, setCategoryChoices, syncChoices, setSyncChoices, debtChoices, setDebtChoices,
    isConfirming, confirmExpense, confirmIncome, markResolved, addMessage, tIn,
    receiptFor: chatReceipts.receiptFor, toggleReceipt: chatReceipts.toggle, openReceipts, agent,
    tasks, onReviewTask: reviewTask, onSeeIt: seeIt, onRetryTask: retryTask,
  };

  // How tall the floating message box is, so the message list leaves that much room at its end
  const composerRef = useRef<HTMLDivElement>(null);
  const [composerHeight, setComposerHeight] = useState(120);
  useEffect(() => {
    const box = composerRef.current;
    if (!box || typeof ResizeObserver === 'undefined') return;
    const watch = new ResizeObserver(() => setComposerHeight(box.offsetHeight));
    watch.observe(box);
    return () => watch.disconnect();
  }, []);


  return (
    // The screen minus the phone's status and navigation bars, the space above (pt-6) and the bottom bar
    // (6rem). While typing, the bottom bar is hidden, so the message box sits just above the keyboard.
    <div
      className={cn('relative flex flex-col overflow-hidden', keyboardOpen ? 'h-[calc(100dvh-var(--sat)-2.25rem)]' : 'h-[calc(100dvh-var(--sat)-var(--sab)-7.5rem)]')}
    >
      {/* Chat history drawer */}
      <ChatDrawer
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        chats={chats}
        activeId={activeId}
        busy={busy}
        pinFullNote={pinFullNote}
        startNewChat={startNewChat}
        openChat={openChat}
        togglePin={togglePin}
        deleteChat={deleteChat}
        renamingId={renamingId}
        setRenamingId={setRenamingId}
        renameValue={renameValue}
        setRenameValue={setRenameValue}
        commitRename={commitRename}
        receipts={receipts}
        onOpenExpense={onOpenExpense}
        tab={drawerTab}
        setTab={setDrawerTab}
      />

      <ChatHeader
        title={headerTitle}
        canStartNew={!busy && messages.length > 0}
        onOpenHistory={() => setSidebarOpen(true)}
        onNewChat={startNewChat}
        showNotSaved={chatsLoaded && !activeIsSaved && !newChatPlan.canSave && notSavedClosedFor !== activeId}
        onDismissNotSaved={() => setNotSavedClosedFor(activeId)}
        temporary={temporary}
        canStartTemporary={!busy}
        onStartTemporary={startTemporaryChat}
        onLeaveTemporary={leaveTemporaryChat}
      />

      <ChatSwitch view={view} setView={slideView} waiting={waitingCount} progress={pagerProgress} />

      {saveError && (
        <div role="alert" className="mb-2 px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 text-xs font-semibold">
          {saveError}
        </div>
      )}


      {/* Chats and Agent space side by side: they slide like pages and follow the finger (chosen 2026-11-20) */}
      <SidePager
        ref={chatPager}
        side={view === 'agent' ? 1 : 0}
        onSettle={side => setView(side ? 'agent' : 'chats')}
        progress={pagerProgress}
        enabled={!sidebarOpen && !editingId}
        className="flex-1 min-h-0"
        trackClassName="h-full items-stretch"
        paneClassName="h-full"
      >
        <div className="relative h-full flex flex-col">
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-1 pt-3 space-y-6 no-scrollbar"
            style={{ paddingBottom: composerHeight + 12 }}
          >

            {messages.length === 0 && (
              <ChatWelcome firstName={firstName} handleSend={handleSend} />
            )}

            <AnimatePresence mode="popLayout">
              {messages.map((msg, index) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex flex-wrap ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {index === memoryStart && memoryLine}
                  <MessageItem
                    msg={msg}
                    editingId={editingId}
                    setEditingId={setEditingId}
                    editValue={editValue}
                    setEditValue={setEditValue}
                    blockSecret={blockSecret}
                    saveEdit={saveEdit}
                    openSteps={openSteps}
                    setOpenSteps={setOpenSteps}
                    photoPreviews={photoPreviews}
                    busy={busy}
                    setMessages={setMessages}
                    answerAgain={answerAgain}
                    cards={cards}
                  />
                </motion.div>
              ))}
            </AnimatePresence>

            {memoryStart === messages.length && memoryLine}

            {loading && (
              <div className="flex items-center gap-2 px-1" role="status" aria-live="polite">
                <motion.span
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2.4, repeat: Infinity, ease: 'linear' }}
                  className="text-indigo-600 dark:text-indigo-400"
                >
                  <Sparkles size={16} />
                </motion.span>
                <span className="status-shimmer text-sm font-semibold">{t(status)}…</span>
              </div>
            )}
          </div>

          {/* The message box floats over the messages, with no band of its own around it (chosen 2026-11-20):
              the list gets that much room at its end, so the last message still scrolls clear of the box */}
          <div ref={composerRef} className={cn('absolute inset-x-0 bottom-0 px-4 pb-4 pt-2 pointer-events-none [&>*]:pointer-events-auto')}>
            <ChatNotices
              secretWarning={secretWarning}
              setSecretWarning={setSecretWarning}
              limitNote={limitNote}
              setLimitNote={setLimitNote}
              limitNoteVars={limitNoteVars}
            />
            <AttachMenu
              cameraInputRef={cameraInputRef}
              galleryInputRef={galleryInputRef}
              filesInputRef={filesInputRef}
              handleFilePicked={handleFilePicked}
              attachMenuOpen={attachMenuOpen}
              setAttachMenuOpen={setAttachMenuOpen}
              openPicker={openPicker}
            />
            <ChatComposer
              isRecording={isRecording}
              isPaused={isPaused}
              recordingSeconds={recordingSeconds}
              startRecording={() => startVoiceRecording(sendVoice)}
              pauseRecording={pauseRecording}
              resumeRecording={resumeRecording}
              stopRecording={stopRecording}
              liveState={liveState}
              liveSeconds={liveSeconds}
              liveCaption={liveCaption}
              liveRef={liveRef}
              startLive={startLive}
              attachment={attachment}
              removeAttachment={removeAttachment}
              setAttachMenuOpen={setAttachMenuOpen}
              input={input}
              setInput={setInput}
              textareaRef={textareaRef}
              handleSend={handleSend}
              blockSecret={blockSecret}
              loading={loading}
              explainIfBlocked={explainIfBlocked}
              fileBlocked={fileBlocked}
              voiceBlocked={voiceBlocked}
              liveBlocked={liveBlocked}
            />
          </div>
        </div>
        <div className="h-full flex flex-col">
          <AgentSpace
            tasks={tasks}
            chatTitle={id => chats.find(c => c.id === id)?.title}
            agent={agent}
            accounts={accounts}
            currencySymbol={currencySymbol}
            onConfirm={confirmTask}
            onCancel={cancelTask}
            onGoToChat={goToChat}
            onSeeIt={seeIt}
          />
        </div>
      </SidePager>
    </div>
  );
}
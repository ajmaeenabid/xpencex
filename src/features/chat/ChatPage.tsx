import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../app/App';
import { ChatMessage, Expense, AccountType } from '../../shared/types';
import { processInput, processAudioInput, processAttachment, ChatTurn } from './aiService';
import { blockedBy, chatUsage } from './limits';
import { ReplyLanguage, scriptLanguage } from './language';
import { motion, AnimatePresence } from 'motion/react';
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
import { useChatHistory } from './useChatHistory';
import ChatDrawer from './ChatDrawer';
import ChatWelcome from './ChatWelcome';
import MessageItem from './MessageItem';
import ChatNotices from './ChatNotices';
import AttachMenu from './AttachMenu';
import ChatComposer from './ChatComposer';
import { CardActions } from './ConfirmCards';
import { isOnline } from '../../shared/lib/offlineSave';

// Money questions get a status that says the assistant is looking at the user's data
const MONEY_QUESTION = /spen|expens|budget|report|total|sav|cost|money|taka|tk|৳|balance|month|week|afford|plan/i;

/** `active` is false while another tab is showing: the chat stays mounted so the conversation and any pending reply survive */
export default function ChatPage({ active = true, incomingText, onIncomingHandled }: {
  active?: boolean;
  incomingText?: string | null; // an SMS shared into the app; read once, in a fresh chat
  onIncomingHandled?: () => void;
}) {
  const { user, profile } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  // What the assistant is doing right now, shown while waiting for a reply
  const { t, lang } = useI18n();
  const [status, setStatus] = useState<TKey>('chat.status.thinking');
  const [openSteps, setOpenSteps] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const usage = chatUsage(messages);
  const currencySymbol = MAJOR_CURRENCIES.find(c => c.code === profile?.currency)?.symbol || '৳';
  const accounts = useAccounts(user?.uid);
  const { categories, spendingContext } = useChatData(user, profile);
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

  // Shows an AI reply: a confirm card for money, or the written answer
  const showResult = (result: Awaited<ReturnType<typeof processInput>>, askKey: TKey) => {
    const replyLang = result.language || lang;
    const say = tIn(replyLang);
    if (result.type === 'income' && result.expense?.amount) {
      const { title, amount, date, notes } = result.expense;
      addMessage('assistant', say('chat.aiIncome', { amount: `${currencySymbol}${amount.toLocaleString()}` }), 'income_confirmation', undefined,
        { pendingIncome: { title: title || say('chat.moneyReceived'), amount, date: date || new Date().toISOString(), notes }, backupModel: result.backup, replyLang });
    } else if (result.type === 'expense' && result.expense) {
      if (result.expense.category === 'INVALID') {
        addMessage('assistant', say('chat.noCategory'), 'error', undefined, { backupModel: result.backup, replyLang });
      } else {
        addMessage('assistant', say(askKey), 'expense_confirmation', result.expense, { backupModel: result.backup, replyLang });
      }
    } else {
      addMessage('assistant', result.content, 'text', undefined, { steps: result.steps, backupModel: result.backup, replyLang });
    }
  };

  const {
    cameraInputRef, galleryInputRef, filesInputRef, attachMenuOpen, setAttachMenuOpen,
    attachment, setAttachment, photoPreviews, setPhotoPreviews, openPicker, handleFilePicked, removeAttachment,
  } = useAttachments({ explainIfBlocked, setSecretWarning, setLimitNote, warnOnce, limits, usage });

  const {
    isRecording, recordingSeconds, isPaused, startRecording: startVoiceRecording, pauseRecording, resumeRecording, stopRecording,
  } = useVoiceRecorder({ explainIfBlocked, addMessage, setLimitNote, t });

  const { liveState, liveSeconds, liveCaption, liveRef, startLive } = useLiveChat({
    loading, isRecording, setLimitNote, explainIfBlocked, setLimits, lang, categories, spendingContext,
    recentHistory: () => recentHistory(), addMessage, setMessages, setSecretWarning, currencySymbol, tIn, t,
  });

  const { isConfirming, accountChoices, setAccountChoices, syncChoices, setSyncChoices, debtChoices, setDebtChoices, confirmIncome, confirmExpense } = useConfirmActions({
    user, messages, accounts, currencySymbol, tIn, t, addMessage, markResolved,
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
  } = useChatHistory({
    user, t, messages, setMessages, setInput, setLimitNote, setLimitNoteVars, resetChatExtras, loading, isRecording, liveState,
  });

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
        addMessage('assistant', say('chat.smsExpense', { source }), 'expense_confirmation', { ...sms.expense, accountId }, { sms: smsInfo, replyLang });
      }
      setLoading(false);
      return;
    }

    setStatus(MONEY_QUESTION.test(userText) ? 'chat.status.checking' : 'chat.status.thinking');
    try {
      showResult(await processInput(userText, categories, spendingContext, history, lang), 'chat.confirmExpenseAsk');
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
      const result = await processAudioInput(base64Audio, mimeType, categories, spendingContext, recentHistory(), lang);
      const spokenText = cleanSpokenText(result.heard, containsSecret, maskSensitive);
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
      showResult(await processAttachment(file, message, categories, spendingContext, history, lang), 'chat.receiptAsk');
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
    <p className="basis-full mb-4 text-center text-[11px] font-medium text-muted">{t('chat.memoryNote')}</p>
  );

  const cards: CardActions = {
    messages, currencySymbol, accounts, accountChoices, setAccountChoices, syncChoices, setSyncChoices, debtChoices, setDebtChoices,
    isConfirming, confirmExpense, confirmIncome, markResolved, addMessage, tIn,
  };

  return (
    <div className="relative flex flex-col h-[calc(100dvh-7.5rem)] overflow-hidden">
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
      />

      <header className="flex items-center gap-2 pb-2 shrink-0">
        <button
          onClick={() => setSidebarOpen(true)}
          aria-label={t('chat.openHistory')}
          className="p-2.5 rounded-xl text-muted hover:text-foreground hover:bg-card transition-colors"
        >
          <PanelLeft size={20} />
        </button>
        <h2 className="flex-1 min-w-0 truncate text-center text-sm font-bold text-foreground">{headerTitle}</h2>
        <button
          onClick={startNewChat}
          disabled={busy || messages.length === 0}
          aria-label={t('chat.newChat')}
          title={t('chat.newChat')}
          className="p-2.5 rounded-xl text-muted hover:text-foreground hover:bg-card transition-colors disabled:opacity-40"
        >
          <SquarePen size={20} />
        </button>
      </header>

      {chatsLoaded && !activeIsSaved && !newChatPlan.canSave && notSavedClosedFor !== activeId && (
        <div role="alert" className="self-center max-w-full mb-2 flex items-start gap-2 pl-3 pr-2 py-2 rounded-2xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-300">
          <ShieldAlert size={15} className="shrink-0 mt-px" />
          <p className="text-xs font-semibold leading-relaxed text-center">{t('chat.notSaved')}</p>
          <button onClick={() => setNotSavedClosedFor(activeId)} aria-label={t('common.dismiss')} className="p-0.5 opacity-70 hover:opacity-100">
            <X size={14} />
          </button>
        </div>
      )}

      {saveError && (
        <div role="alert" className="mb-2 px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 text-xs font-semibold">
          {saveError}
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-1 py-3 space-y-6 no-scrollbar">
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

      <div className="px-4 pb-4 pt-2">
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
  );
}
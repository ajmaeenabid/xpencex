import { useState, useEffect, useRef } from 'react';
import { db } from '../../shared/firebase';
import { collection, query, where, orderBy, limit, onSnapshot, doc, setDoc, updateDoc, deleteDoc, writeBatch, getDocs, increment } from 'firebase/firestore';
import { useAuth } from '../../app/App';
import { ChatMessage, Chat, Expense, AccountType } from '../../shared/types';
import { processInput, processAudioInput, processAttachment, fetchLimits, onLimitsChange, ChatTurn } from './aiService';
import { FILE_PICKER_ACCEPT, IMAGE_PICKER_ACCEPT, PreparedAttachment, prepareAttachment } from './attachments';
import { MAX_LIVE_SECONDS, MAX_VOICE_SECONDS, TIME_WARNING_SECONDS, Limits, MediaKind, aiMessagesLeft, blockedBy, chatUsage, formatClock, isGentleNote, warningFor } from './limits';
import { ReplyLanguage, liveLanguageRules, scriptLanguage } from './language';
import { LiveEndReason, LiveSession, LiveState } from './liveSession';
import type { ToolCall } from './liveAudio';
import { cn } from '../../shared/lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, ArrowUp, Camera, X, Check, Loader2, Sparkles, ChevronRight, Info, ShieldAlert, Plus, Pencil, Trash2, PanelLeft, PanelLeftClose, SquarePen, Pause, Play, AudioLines, Image as ImageIcon, Paperclip, FileText, Square, Pin, PinOff } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { isToday, isYesterday, differenceInCalendarDays } from 'date-fns';
import { DEFAULT_CATEGORIES, MAJOR_CURRENCIES } from '../../shared/constants';
import { parseTransactionSms, maskSensitive } from '../../shared/lib/smsParser';
import { normalizeExpense } from '../expenses/expense';
import { containsSecret } from '../../shared/lib/sensitiveData';
import { useI18n, TFunction, TKey, categoryLabel, translate } from '../../shared/i18n';
import { CASH_ID, accountDisplayName } from '../accounts/accounts';
import { useAccounts, adjustBalance, paymentFields, shortAccount } from '../accounts/accountService';
import AccountPicker from '../accounts/AccountPicker';
import ErrorBoundary from '../../shared/components/ErrorBoundary';
import { restoreLineBreaks } from './markdownRepair';
import { actionsFor, chatIsFull, packMessages, savedInAnotherVersion, startVersion, switchVersion, unpackMessages } from './versions';
import { canPinMore, cleanSpokenText, memoryBoundary, memoryFor, planNewChat } from './chatHistory';
import { CopyButton, EditButton, ResendButton, ShareButton, VersionArrows } from './MessageActions';
import { alertDialog, confirmDialog } from '../../shared/components/Dialog';

const WAVE_BARS = 24;
const LIMIT_NOTE_MS = 3000;
const LIMIT_NOTE_FADE_SECONDS = 1.2;

const newChatId = () => doc(collection(db, 'chats')).id;

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

// Money questions get a status that says the assistant is looking at the user's data
const MONEY_QUESTION = /spen|expens|budget|report|total|sav|cost|money|taka|tk|৳|balance|month|week|afford|plan/i;

/** Tables can be wider than a phone screen, so they scroll sideways on their own */
const markdownComponents = {
  table: ({ children }: { children?: React.ReactNode }) => (
    <div className="chat-md-table"><table>{children}</table></div>
  ),
};

/** `active` is false while another tab is showing: the chat stays mounted so the conversation and any pending reply survive */
export default function ChatPage({ active = true, incomingText, onIncomingHandled }: {
  active?: boolean;
  incomingText?: string | null; // an SMS shared into the app; read once, in a fresh chat
  onIncomingHandled?: () => void;
}) {
  const { user, profile } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [loading, setLoading] = useState(false);
  // What the assistant is doing right now, shown while waiting for a reply
  const { t, lang } = useI18n();
  const [status, setStatus] = useState<TKey>('chat.status.thinking');
  const [openSteps, setOpenSteps] = useState<Set<string>>(new Set());
  const [isConfirming, setIsConfirming] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);
  const [pendingExpense, setPendingExpense] = useState<Partial<Expense> | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [chatsLoaded, setChatsLoaded] = useState(false);
  // The chat whose "won't be saved" message was closed; it only ever goes with the X
  const [notSavedClosedFor, setNotSavedClosedFor] = useState<string | null>(null);
  const [pinFullNote, setPinFullNote] = useState(false);
  const [activeId, setActiveId] = useState(newChatId);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  // Chats that already exist in Firestore, so the title is only set on the first save
  const savedIdsRef = useRef<Set<string>>(new Set());
  // Set when messages were just loaded from history, so opening a chat doesn't re-save it
  const skipSaveRef = useRef(false);
  const [spendingContext, setSpendingContext] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const filesInputRef = useRef<HTMLInputElement>(null);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [attachment, setAttachment] = useState<PreparedAttachment | null>(null);
  // Photos stay visible while the chat is open. Only the file's name is ever saved.
  const [photoPreviews, setPhotoPreviews] = useState<Record<string, string>>({});
  // How much of each daily limit is used, from the server
  const [limits, setLimits] = useState<Limits | null>(null);
  // A one-off limit message, such as a file that's too big
  const [limitNote, setLimitNote] = useState<TKey | null>(null);
  const [limitNoteVars, setLimitNoteVars] = useState<Record<string, string | number> | undefined>();
  // Each "only 1 left" note shows once per chat, so it doesn't nag
  const warnedRef = useRef<Set<TKey>>(new Set());
  const [isPaused, setIsPaused] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const recordedMsRef = useRef(0); // speaking time before the latest pause
  const [liveState, setLiveState] = useState<LiveState | null>(null);
  const [liveSeconds, setLiveSeconds] = useState(0);
  const [liveCaption, setLiveCaption] = useState('');
  const liveRef = useRef<LiveSession | null>(null);
  const liveTimerRef = useRef<number | null>(null);
  const liveMarkerRef = useRef<string | null>(null);
  const liveStartedRef = useRef(0);
  const liveLanguageRef = useRef<ReplyLanguage>('en');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<number | null>(null);
  const recordingStartRef = useRef(0);
  const recordingDurationRef = useRef(0);
  const cancelRecordingRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const usage = chatUsage(messages);
  const currencySymbol = MAJOR_CURRENCIES.find(c => c.code === profile?.currency)?.symbol || '৳';
  const accounts = useAccounts(user?.uid);
  // "Paid from" choice for each confirmation card, by message id
  const [accountChoices, setAccountChoices] = useState<Record<string, string>>({});
  // Shown when the user pastes, types or shares an OTP / PIN: the text is thrown away and this warns them
  const [secretWarning, setSecretWarning] = useState(false);
  const secretTimerRef = useRef<number | null>(null);
  const blockSecret = () => {
    setInput('');
    setSecretWarning(true);
    if (secretTimerRef.current) window.clearTimeout(secretTimerRef.current);
    secretTimerRef.current = window.setTimeout(() => setSecretWarning(false), 12000);
  };

  // "Also match the balance the SMS reported" tick box, by message id
  const [syncChoices, setSyncChoices] = useState<Record<string, boolean>>({});

  // Pre-select an account when the user has exactly one of that kind (one bank, one bKash...)
  const suggestAccount = (type?: AccountType) => {
    const matches = accounts.filter(a => a.type === type);
    return matches.length === 1 ? matches[0].id : undefined;
  };

  // True when this SMS was already saved (as an expense or as money in)
  const alreadySaved = async (ref: string) => {
    if (!user) return false;
    const [spent, received] = await Promise.all([
      getDocs(query(collection(db, 'expenses'), where('uid', '==', user.uid), where('smsRef', '==', ref), limit(1))),
      getDocs(query(collection(db, 'deposits'), where('uid', '==', user.uid), where('smsRef', '==', ref), limit(1))),
    ]);
    return !spent.empty || !received.empty;
  };

  useEffect(() => {
    if (!user) return;
    onLimitsChange(setLimits);
    return () => onLimitsChange(null);
  }, [user]);

  // Limit messages appear when something is tapped, and don't stay on the screen
  useEffect(() => {
    if (!limitNote) return;
    const timer = window.setTimeout(() => setLimitNote(null), LIMIT_NOTE_MS);
    return () => window.clearTimeout(timer);
  }, [limitNote]);

  // Refreshed each time the chat opens, because the limits reset at midnight
  useEffect(() => {
    if (!user || !active) return;
    fetchLimits().then(setLimits).catch(err => console.error('Could not load limits', err));
  }, [user, active]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'categories'), where('uid', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const customCats = snapshot.docs.map(doc => doc.data().name);
      setCategories([...DEFAULT_CATEGORIES.map(c => c.name), ...customCats]);
    });
    return unsubscribe;
  }, [user]);

  // This user's saved chats, newest first (sorted here to avoid needing a composite index)
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'chats'), where('uid', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Chat));
      list.forEach(c => savedIdsRef.current.add(c.id));
      // Remove any message holding an OTP / PIN from saved chats (e.g. saved before this protection existed)
      list.forEach(c => {
        const all = c.messages || [];
        const clean = all.filter(m => !containsSecret(m.content || ''));
        if (clean.length === all.length) return;
        c.messages = clean;
        const ref = doc(db, 'chats', c.id);
        (clean.length ? updateDoc(ref, { messages: JSON.parse(JSON.stringify(clean)) }) : deleteDoc(ref))
          .catch(err => console.error('Could not remove a sensitive message', err));
      });
      setChats(list.sort((a, b) => b.updatedAt - a.updatedAt));
      setChatsLoaded(true);
    }, (err) => {
      console.error('Could not load chats', err);
      setSaveError(t('chat.loadError', { code: err.code || 'unknown' }));
    });
    return unsubscribe;
  }, [user]);

  // Whether a chat that isn't saved yet can be, and what would have to go to make room
  const newChatPlan = planNewChat(chats.filter(c => c.id !== activeId));
  const activeIsSaved = savedIdsRef.current.has(activeId);

  const saveChat = () => {
    if (!user || messages.length === 0) return;
    // Never write an OTP / PIN to the database, not even briefly; it's removed first, then this saves again
    if (messages.some(m => containsSecret(m.content || ''))) return;
    const isNew = !savedIdsRef.current.has(activeId);
    if (isNew && (!chatsLoaded || !newChatPlan.canSave)) return;
    const firstUser = messages.find(m => m.role === 'user')?.content || t('chat.newChat');
    savedIdsRef.current.add(activeId);
    setDoc(doc(db, 'chats', activeId), {
      uid: user.uid,
      messages: packMessages(messages),
      updatedAt: Date.now(),
      ...(isNew && { title: firstUser.length > 40 ? `${firstUser.slice(0, 40)}…` : firstUser, createdAt: Date.now() }),
    }, { merge: true })
      .then(() => {
        setSaveError('');
        if (isNew) removeToMakeRoom(newChatPlan.remove);
      })
      .catch(err => {
        console.error('Could not save chat', err);
        setSaveError(err?.code === 'permission-denied'
          ? t('chat.rulesError')
          : t('chat.saveError', { code: err?.code || 'unknown' }));
      });
  };

  // Only runs once the new chat is safely saved, so nothing is lost if saving fails
  const removeToMakeRoom = (remove: Chat[]) => {
    if (!remove.length) return;
    remove.forEach(chat => {
      savedIdsRef.current.delete(chat.id);
      deleteDoc(doc(db, 'chats', chat.id)).catch(err => console.error('Could not remove an old chat', err));
    });
    if (remove.length === 1) {
      setLimitNoteVars({ title: remove[0].title });
      setLimitNote('chat.removedOne');
    } else {
      setLimitNoteVars({ count: remove.length });
      setLimitNote('chat.removedMany');
    }
  };

  // Save the conversation after every change
  useEffect(() => {
    if (skipSaveRef.current) { skipSaveRef.current = false; return; }
    saveChat();
  }, [messages]);

  // A chat that couldn't be saved gets saved as soon as there's room, or once the history has loaded
  useEffect(() => {
    if (chatsLoaded && newChatPlan.canSave && !savedIdsRef.current.has(activeId)) saveChat();
  }, [chatsLoaded, newChatPlan.canSave]);

  const togglePin = (chat: Chat) => {
    if (!chat.pinned && !canPinMore(chats)) {
      setPinFullNote(true);
      return;
    }
    setPinFullNote(false);
    updateDoc(doc(db, 'chats', chat.id), { pinned: !chat.pinned })
      .catch(err => console.error('Could not pin chat', err));
  };

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

  const startNewChat = () => {
    if (loading || isRecording || liveState) return;
    skipSaveRef.current = messages.length > 0;
    setMessages([]);
    setActiveId(newChatId());
    setInput('');
    setSidebarOpen(false);
    resetChatExtras();
  };

  const openChat = (chat: Chat) => {
    if (chat.id === activeId) { setSidebarOpen(false); return; }
    if (loading || isRecording || liveState) return;
    skipSaveRef.current = true;
    setActiveId(chat.id);
    setMessages(unpackMessages(chat.messages || []));
    setInput('');
    setSidebarOpen(false);
    resetChatExtras();
  };

  const commitRename = async () => {
    const id = renamingId;
    const title = renameValue.trim();
    setRenamingId(null);
    if (!id || !title || title === chats.find(c => c.id === id)?.title) return;
    try { await updateDoc(doc(db, 'chats', id), { title: title.slice(0, 80) }); }
    catch (err) { console.error('Could not rename chat', err); }
  };

  const deleteChat = async (chat: Chat) => {
    if (!(await confirmDialog(t('chat.confirmDelete', { title: chat.title }), { danger: true }))) return;
    try {
      await deleteDoc(doc(db, 'chats', chat.id));
      savedIdsRef.current.delete(chat.id);
      if (chat.id === activeId) {
        skipSaveRef.current = messages.length > 0;
        setMessages([]);
        setActiveId(newChatId());
        resetChatExtras();
      }
    } catch (err) { console.error('Could not delete chat', err); }
  };

  const markResolved = (id: string, saved = false) =>
    setMessages(prev => prev.map(m => (m.id === id ? { ...m, resolved: true, ...(saved && { saved: true }) } : m)));

  // Give the assistant a compact view of recent spending so "show my weekly report" style questions work
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'expenses'), where('uid', '==', user.uid), orderBy('date', 'desc'), limit(100));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const lines = snapshot.docs.map(d => {
        const e = d.data() as Expense;
        return `${e.date.slice(0, 10)} | ${e.title} | ${e.category} | ${e.amount}`;
      });
      setSpendingContext(
        `Currency: ${profile?.currency || 'BDT'}. Monthly budget: ${profile?.monthlyBudget ?? 'not set'}.\n` +
        `Last ${lines.length} expenses (date | title | category | amount):\n${lines.join('\n')}`
      );
    });
    return unsubscribe;
  }, [user, profile?.currency, profile?.monthlyBudget]);

  // Grow the message box with its content, up to a limit. A hidden chat measures 0, so skip
  // measuring until it's visible (and re-measure when it becomes visible).
  useEffect(() => {
    const el = textareaRef.current;
    if (!el || !active) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 24), 140)}px`;
  }, [input, isRecording, active]);

  // Release the microphone and timer if the user leaves the chat mid-recording
  useEffect(() => () => {
    if (recordingTimerRef.current) window.clearInterval(recordingTimerRef.current);
    cancelRecordingRef.current = true;
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    liveRef.current?.finish('user');
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

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
        setPendingExpense(result.expense);
      }
    } else {
      addMessage('assistant', result.content, 'text', undefined, { steps: result.steps, backupModel: result.backup, replyLang });
    }
  };

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

  const startRecording = async () => {
    if (explainIfBlocked('voice')) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());
        if (cancelRecordingRef.current) return;
        const mimeType = mediaRecorder.mimeType.split(';')[0] || 'audio/webm';
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64Audio = reader.result as string;
          setLoading(true);
          setStatus('chat.status.listening');
          const voiceId = addMessage('user', t('chat.voiceMessage'), 'text', undefined, { voiceDuration: recordingDurationRef.current });
          
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
        reader.readAsDataURL(audioBlob);
      };

      cancelRecordingRef.current = false;
      mediaRecorder.start();
      recordedMsRef.current = 0;
      setRecordingSeconds(0);
      setIsPaused(false);
      setIsRecording(true);
      runRecordingTimer();
    } catch (error) {
      console.error("Error starting recording:", error);
      alertDialog(t('chat.micError'));
    }
  };

  // Only speaking time counts, so the clock stands still during a pause
  const spokenMs = () =>
    recordedMsRef.current + (mediaRecorderRef.current?.state === 'recording' ? Date.now() - recordingStartRef.current : 0);

  const runRecordingTimer = () => {
    recordingStartRef.current = Date.now();
    recordingTimerRef.current = window.setInterval(() => {
      const elapsed = Math.floor(spokenMs() / 1000);
      setRecordingSeconds(elapsed);
      if (elapsed >= MAX_VOICE_SECONDS) {
        stopRecording();
        setLimitNote('limit.voice.time');
      }
    }, 250);
  };

  const pauseRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (recorder?.state !== 'recording') return;
    recordedMsRef.current = spokenMs();
    recorder.pause();
    if (recordingTimerRef.current) window.clearInterval(recordingTimerRef.current);
    recordingTimerRef.current = null;
    setIsPaused(true);
  };

  const resumeRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (recorder?.state !== 'paused') return;
    recorder.resume();
    setIsPaused(false);
    runRecordingTimer();
  };

  // Stops the recording and sends it, or discards it when `cancel` is true
  const stopRecording = (cancel = false) => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;
    const elapsedMs = spokenMs();
    const tooShort = elapsedMs < 800;
    recordingDurationRef.current = Math.max(1, Math.round(elapsedMs / 1000));
    cancelRecordingRef.current = cancel || tooShort;
    if (recordingTimerRef.current) window.clearInterval(recordingTimerRef.current);
    recordingTimerRef.current = null;
    recorder.stop();
    setIsRecording(false);
    setIsPaused(false);
    if (tooShort && !cancel) addMessage('assistant', t('chat.tooShort'), 'error');
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

  const formatTime = formatClock;

  const warnOnce = (key: TKey | null) => {
    if (!key || warnedRef.current.has(key)) return;
    warnedRef.current.add(key);
    setLimitNote(key);
  };

  // Tapping something at its limit says why, instead of doing nothing. With 1 left, it says so once and carries on.
  const explainIfBlocked = (kind: MediaKind) => {
    const reason = blockedBy(kind, limits, usage);
    if (reason) {
      setLimitNote(reason);
      return true;
    }
    // The file menu would cover this note, so files show it once a file is picked
    if (kind !== 'file') warnOnce(warningFor(kind, limits, usage));
    return false;
  };

  // A wallet or bank SMS is read on the phone, so it doesn't need one of the daily AI messages
  const explainIfNoAiLeft = (text: string) => {
    const left = aiMessagesLeft(limits);
    if (left === null || left > 1 || parseTransactionSms(text, categories)) return false;
    if (left === 0) {
      setLimitNote('limit.ai.done');
      return true;
    }
    warnOnce('limit.ai.warn');
    return false;
  };

  const openPicker = (input: React.RefObject<HTMLInputElement | null>) => {
    setAttachMenuOpen(false);
    input.current?.click();
  };

  // A picked file waits above the message box, where it can be removed or get a message, until Send
  const handleFilePicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset so picking the same file again still fires onChange
    e.target.value = '';
    if (!file || explainIfBlocked('file')) return;
    const prepared = await prepareAttachment(file);
    if ('problem' in prepared) {
      if (prepared.problem === 'secret') {
        setSecretWarning(true);
        return;
      }
      setLimitNote(({ size: 'limit.file.size', type: 'limit.file.type', empty: 'limit.file.empty', read: 'limit.file.read' } as const)[prepared.problem]);
      return;
    }
    setLimitNote(null);
    warnOnce(warningFor('file', limits, usage));
    if (attachment?.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
    setAttachment(prepared);
  };

  const removeAttachment = () => {
    if (attachment?.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
    setAttachment(null);
  };

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

  // Live chat ---------------------------------------------------------------------------------

  // What was said goes through the same privacy checks as typed text before it's shown or saved
  const cleanSpeech = (text: string) => {
    if (containsSecret(text)) {
      setSecretWarning(true);
      return null;
    }
    return maskSensitive(text);
  };

  const handleLiveTool = (session: LiveSession, call: ToolCall) => {
    const say = tIn(liveLanguageRef.current);
    const replyLang = liveLanguageRef.current;
    const found = normalizeExpense({
      ...call.args,
      title: typeof call.args.title === 'string' ? cleanSpeech(call.args.title) || undefined : undefined,
      category: call.args.category || 'Other',
    });
    if (!found) {
      session.respondToTool(call, translate('en', 'chat.liveInvalidReply'));
      return;
    }
    if (call.name === 'record_income') {
      addMessage('assistant', say('chat.aiIncome', { amount: `${currencySymbol}${found.amount.toLocaleString()}` }), 'income_confirmation', undefined,
        { pendingIncome: { title: found.title || say('chat.moneyReceived'), amount: found.amount, date: found.date || new Date().toISOString() }, replyLang });
    } else {
      addMessage('assistant', say('chat.confirmVoiceAsk'), 'expense_confirmation', found, { replyLang });
    }
    session.respondToTool(call, translate('en', 'chat.liveExpenseReply'));
  };

  const endLive = (reason: LiveEndReason) => {
    if (liveTimerRef.current) window.clearInterval(liveTimerRef.current);
    liveTimerRef.current = null;
    liveRef.current = null;
    const markerId = liveMarkerRef.current;
    liveMarkerRef.current = null;
    setLiveState(null);
    setLiveCaption('');
    const notes: Partial<Record<LiveEndReason, TKey>> = {
      time: 'limit.live.time',
      limit: 'limit.live.dayDone',
      mic: 'chat.liveMicError',
      busy: 'chat.liveBusy',
      network: 'chat.liveNetwork',
      device: 'chat.liveDevice',
      auth: 'chat.liveAuth',
    };
    if (notes[reason]) setLimitNote(notes[reason]!);
    fetchLimits().then(setLimits).catch(() => {});
    // Set once at the end, because every change to the messages is a write to the database
    const seconds = Math.min(MAX_LIVE_SECONDS, Math.max(1, Math.round((Date.now() - liveStartedRef.current) / 1000)));
    if (markerId) setMessages(prev => prev.map(m => (m.id === markerId ? { ...m, liveDuration: seconds } : m)));
  };

  const startLive = () => {
    if (loading || isRecording || liveState) return;
    setLimitNote(null);
    if (explainIfBlocked('live')) return;
    liveLanguageRef.current = lang;
    const instruction = `
    You are XpenceX Assistant, a friendly money helper in a live voice conversation.
    ${liveLanguageRules(lang)}
    Keep answers short: one to three spoken sentences, with no lists or tables. The conversation lasts one minute at most.
    Never repeat an OTP, PIN, password or verification code, or an account, card or phone number. If you hear one, warn the user not to share it.
    When the user says they spent money, call record_expense. When they say they received money, call record_income.
    These only show a card on their screen and save nothing, so then tell them to check it and tap Confirm. Never say it has been saved.
    Available categories: ${categories.join(', ')}
    Current Date: ${new Date().toISOString()}
    User's recent spending (use this to answer questions about reports, totals and budget advice):
    ${spendingContext || 'No data available.'}
    Conversation so far (oldest first):
    ${recentHistory().map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.slice(0, 500)}`).join('\n') || 'None.'}`;

    let connected = false;
    const session: LiveSession = new LiveSession(instruction, {
      onState: (state) => {
        setLiveState(state);
        if (state === 'connecting' || connected) return;
        // Connected: only now does this count, and the clock starts
        connected = true;
        const startedAt = Date.now();
        liveStartedRef.current = startedAt;
        liveMarkerRef.current = addMessage('user', t('chat.live'), 'text', undefined, { liveDuration: 1 });
        setLiveSeconds(0);
        liveTimerRef.current = window.setInterval(() => {
          const seconds = Math.floor((Date.now() - startedAt) / 1000);
          setLiveSeconds(seconds);
          if (seconds >= MAX_LIVE_SECONDS) session.finish('time');
        }, 1000);
      },
      onCaption: (_who, text) => {
        const clean = cleanSpeech(text);
        setLiveCaption(clean ?? '');
      },
      onTurn: (who, text) => {
        const clean = cleanSpeech(text);
        if (!clean) return;
        if (who === 'user') liveLanguageRef.current = scriptLanguage(clean);
        addMessage(who, clean, 'text', undefined, { replyLang: liveLanguageRef.current });
      },
      onToolCall: (call) => handleLiveTool(session, call),
      onLimits: setLimits,
      onEnd: endLive,
    });
    liveRef.current = session;
    session.start();
  };

  // Money in: add it to the chosen account and log it, so Reports can show it
  const confirmIncome = async (messageId: string) => {
    const msg = messages.find(m => m.id === messageId);
    const income = msg?.pendingIncome;
    if (!user || isConfirming || !income || msg.resolved) return;
    const account = accounts.find(a => a.id === (accountChoices[messageId] || income.accountId));
    if (!account) return;
    const sms = msg.sms;
    const syncTo = sms?.balance !== undefined && syncChoices[messageId] ? sms.balance : undefined;

    setIsConfirming(true);
    try {
      if (sms && await alreadySaved(sms.ref)) {
        markResolved(messageId);
        addMessage('assistant', "You've already saved this SMS, so I didn't add it again.");
        return;
      }
      const say = tIn(msg.replyLang);
      const batch = writeBatch(db);
      batch.set(doc(collection(db, 'deposits')), {
        uid: user.uid,
        accountId: account.id,
        accountName: accountDisplayName(account),
        amount: income.amount,
        date: income.date || new Date().toISOString(),
        title: income.title,
        source: sms ? 'sms' : 'chat',
        ...(sms && { smsRef: sms.ref }),
      });
      batch.update(doc(db, 'accounts', account.id), syncTo !== undefined ? { balance: syncTo } : { balance: increment(income.amount) });
      await batch.commit();
      markResolved(messageId, true);
      addMessage('assistant', say('chat.incomeSaved', { amount: `${currencySymbol}${income.amount.toLocaleString()}`, account: accountDisplayName(account) }) +
        (syncTo !== undefined ? ' ' + say('chat.balanceMatched', { balance: `${currencySymbol}${syncTo.toLocaleString()}` }) : ''));
    } catch (error) {
      console.error('Error saving money in:', error);
      addMessage('assistant', tIn(msg.replyLang)('chat.saveFailed'), 'error');
    } finally {
      setIsConfirming(false);
    }
  };

  // Tick box offered when an SMS states the account's new balance
  const balanceSync = (msg: ChatMessage, accountId: string | undefined) =>
    msg.sms?.balance !== undefined && accountId && accountId !== CASH_ID && (
      <label className="flex items-start gap-3 bg-background/50 p-3 rounded-xl cursor-pointer">
        <input
          type="checkbox"
          className="mt-0.5 w-4 h-4 shrink-0 accent-indigo-600"
          checked={!!syncChoices[msg.id]}
          onChange={(e) => setSyncChoices(prev => ({ ...prev, [msg.id]: e.target.checked }))}
        />
        <span className="text-xs font-medium text-muted leading-relaxed">
          {t('chat.syncBefore')} <b className="text-foreground">{currencySymbol}{msg.sms.balance.toLocaleString()}</b>{t('chat.syncAfter')}
        </span>
      </label>
    );

  const confirmExpense = async (messageId: string, expense: Partial<Expense>) => {
    if (!user || isConfirming || messages.find(m => m.id === messageId)?.resolved) return;
    const accountId = accountChoices[messageId] || expense.accountId || CASH_ID;
    const amount = expense.amount || 0;
    const sms = messages.find(m => m.id === messageId)?.sms;
    const say = tIn(messages.find(m => m.id === messageId)?.replyLang);
    const syncTo = sms?.balance !== undefined && syncChoices[messageId] && accounts.some(a => a.id === accountId) ? sms.balance : undefined;

    if (sms && await alreadySaved(sms.ref)) {
      markResolved(messageId);
      addMessage('assistant', "You've already saved this SMS, so I didn't add it again.");
      return;
    }

    const short = syncTo === undefined ? shortAccount(accounts, accountId, amount) : null;
    if (short && !(await confirmDialog(
      t('add.lowBalance', { account: accountDisplayName(short), balance: `${currencySymbol}${short.balance.toLocaleString()}` })
    ))) return;
    const payment = paymentFields(accountId, accounts);

    setIsConfirming(true);
    try {
      const batch = writeBatch(db);
      batch.set(doc(collection(db, 'expenses')), {
        uid: user.uid,
        title: expense.title,
        amount,
        category: expense.category,
        date: expense.date || new Date().toISOString(),
        notes: expense.notes || '',
        ...payment,
        ...(sms && { smsRef: sms.ref }),
        createdAt: new Date().toISOString(),
      });
      if (syncTo !== undefined) batch.update(doc(db, 'accounts', accountId), { balance: syncTo });
      else adjustBalance(batch, accounts, accountId, -amount);
      await batch.commit();
      markResolved(messageId, true);
      addMessage('assistant', payment.accountName
        ? say('chat.expenseSavedFrom', { title: expense.title || '', amount: `${currencySymbol}${amount}`, account: payment.accountId === CASH_ID ? say('accounts.cash') : payment.accountName })
        : say('chat.expenseSaved', { title: expense.title || '', amount: `${currencySymbol}${amount}` }));
      setPendingExpense(null);
    } catch (error) {
      addMessage('assistant', say('chat.expenseSaveFailed'), 'error');
    } finally {
      setIsConfirming(false);
    }
  };

  const firstName = profile?.name?.split(' ')[0];
  const activeChat = chats.find(c => c.id === activeId);
  const headerTitle = activeChat?.title || t('chat.newChat');
  const busy = loading || isRecording || !!liveState;
  const voiceBlocked = blockedBy('voice', limits, usage);
  const liveBlocked = blockedBy('live', limits, usage);
  const fileBlocked = blockedBy('file', limits, usage);
  const groups = groupChats(chats, t);

  const memoryStart = memoryBoundary(messages, Date.now());
  const memoryLine = (
    <p className="basis-full mb-4 text-center text-[11px] font-medium text-muted">{t('chat.memoryNote')}</p>
  );

  const duplicateWarning = (
    <p role="status" className="flex items-start gap-2 bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-300 p-3 rounded-xl text-xs font-semibold leading-relaxed">
      <Info size={15} className="shrink-0 mt-px" />
      {t('chat.duplicateWarn')}
    </p>
  );

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
    <div className="relative flex flex-col h-[calc(100dvh-7.5rem)] overflow-hidden">
      {/* Chat history drawer */}
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
              <div className="flex items-center justify-between px-4 pt-4 pb-3">
                <h2 className="font-bold text-foreground tracking-tight">{t('chat.chats')}</h2>
                <button onClick={() => setSidebarOpen(false)} aria-label={t('chat.closeHistory')} className="p-2 rounded-xl text-muted hover:text-foreground">
                  <PanelLeftClose size={18} />
                </button>
              </div>
              <div className="px-3 pb-3">
                <button
                  onClick={startNewChat}
                  disabled={busy}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-600 text-white text-sm font-bold shadow-vibrant disabled:opacity-50 disabled:shadow-none"
                >
                  <Plus size={16} /> {t('chat.newChat')}
                </button>
              </div>
              <p className="px-4 pb-3 text-[11px] leading-relaxed font-medium text-muted">{t('chat.pinTip')}</p>
              {pinFullNote && <p role="status" className="px-4 pb-3 text-[11px] leading-relaxed font-bold text-rose-500">{t('chat.pinFull')}</p>}
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
            </motion.aside>
          </>
        )}
      </AnimatePresence>

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
          <div className="min-h-full flex flex-col items-center justify-center text-center space-y-8 pb-6">
            <div className="space-y-4">
              <motion.div
                initial={{ scale: 0, rotate: -20 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 18 }}
                className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-600 text-white flex items-center justify-center shadow-vibrant"
              >
                <Sparkles size={26} />
              </motion.div>
              <h3 className="font-bold text-3xl text-foreground tracking-tight">
                {firstName ? t('chat.hiName', { name: firstName }) : t('chat.hi')}
                <br />
                <span className="text-indigo-600 dark:text-indigo-400">{t('chat.howHelp')}</span>
              </h3>
              <p className="text-sm text-muted px-6 leading-relaxed">
                {t('chat.welcomeHint')}
              </p>
            </div>
            <div className="w-full flex flex-col gap-2">
              {[t('chat.hint1'), t('chat.hint2'), t('chat.hint3'), "Payment Tk 450.00 to Foodpanda successful. Fee Tk 0.00. TrxID 9K7ABC12 at 23/10/2026 13:05"].map((hint, i) => (
                <button
                  key={i}
                  onClick={() => handleSend(hint)}
                  className="px-4 py-3 bg-card/60 rounded-2xl text-xs font-semibold text-muted border border-card-border hover:border-indigo-500/60 hover:text-foreground transition-all text-left line-clamp-2"
                >
                  {hint}
                </button>
              ))}
            </div>
          </div>
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
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-card p-5 rounded-[2rem] shadow-soft border border-card-border text-foreground space-y-4 w-full"
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-500/10 rounded-xl flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                        <Check size={20} />
                      </div>
                      <h4 className="font-bold">{t('chat.confirmTitle')}</h4>
                    </div>

                    <div className="space-y-3">
                      <div className="flex justify-between items-center bg-background/50 p-3 rounded-xl">
                        <span className="text-xs font-semibold text-muted">{t('add.fieldTitle')}</span>
                        <span className="font-bold text-sm">{msg.pendingExpense.title}</span>
                      </div>
                      <div className="flex justify-between items-center bg-background/50 p-3 rounded-xl">
                        <span className="text-xs font-semibold text-muted">{t('add.amount')}</span>
                        <span className="font-bold text-indigo-600 dark:text-indigo-400">{currencySymbol}{msg.pendingExpense.amount}</span>
                      </div>
                      <div className="flex justify-between items-center bg-background/50 p-3 rounded-xl">
                        <span className="text-xs font-semibold text-muted">{t('add.category')}</span>
                        <span className="bg-indigo-600 text-white px-3 py-1 rounded-full text-xs font-semibold">{categoryLabel(t, msg.pendingExpense.category || '')}</span>
                      </div>
                      <div className="bg-background/50 p-3 rounded-xl space-y-2">
                        <span className="text-xs font-semibold text-muted">{t('add.paidFrom')}</span>
                        <AccountPicker
                          compact
                          accounts={accounts}
                          value={accountChoices[msg.id] || msg.pendingExpense.accountId || CASH_ID}
                          onChange={(id) => setAccountChoices(prev => ({ ...prev, [msg.id]: id }))}
                          symbol={currencySymbol}
                        />
                      </div>
                      {balanceSync(msg, accountChoices[msg.id] || msg.pendingExpense.accountId)}
                      {savedInAnotherVersion(messages, msg.id) && duplicateWarning}
                    </div>

                    <div className="flex gap-3 pt-2">
                      <button
                        onClick={() => confirmExpense(msg.id, msg.pendingExpense!)}
                        disabled={isConfirming}
                        className="flex-1 py-3 bg-indigo-600 text-white rounded-2xl text-sm font-bold shadow-vibrant hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:shadow-none"
                      >
                        {isConfirming ? (
                          <>
                            <Loader2 size={16} className="animate-spin" />
                            Saving…
                          </>
                        ) : (
                          t('chat.confirm')
                        )}
                      </button>
                      <button
                        onClick={() => {
                          markResolved(msg.id);
                          addMessage('assistant', tIn(msg.replyLang)('chat.tryAgain'));
                        }}
                        disabled={isConfirming}
                        className="flex-1 py-3 bg-slate-100 dark:bg-slate-700 text-muted rounded-2xl text-sm font-bold hover:bg-slate-200 dark:hover:bg-slate-600 transition-all disabled:opacity-50"
                      >
                        {t('common.edit')}
                      </button>
                    </div>
                    <button
                      onClick={() => {
                        markResolved(msg.id);
                        addMessage('assistant', tIn(msg.replyLang)('chat.cancelledExpense'));
                      }}
                      disabled={isConfirming}
                      className="w-full py-2.5 text-sm font-bold text-muted hover:text-rose-500 transition-colors disabled:opacity-50"
                    >
                      {t('common.cancel')}
                    </button>
                  </motion.div>
                )}

                {msg.type === 'income_confirmation' && msg.pendingIncome && !msg.resolved && (() => {
                  const income = msg.pendingIncome;
                  const chosen = accountChoices[msg.id] || income.accountId;
                  const choices = msg.sms?.accountType === 'bank' ? accounts.filter(a => a.type === 'bank') : accounts;
                  const pickerAccounts = choices.length ? choices : accounts;
                  return (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-card p-5 rounded-[2rem] shadow-soft border border-card-border text-foreground space-y-4 w-full"
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 bg-teal-50 dark:bg-teal-500/10 rounded-xl flex items-center justify-center text-teal-600 dark:text-teal-400">
                          <Plus size={20} />
                        </div>
                        <h4 className="font-bold">{t('chat.moneyReceived')}</h4>
                      </div>

                      <div className="space-y-3">
                        <div className="flex justify-between items-center bg-background/50 p-3 rounded-xl">
                          <span className="text-xs font-semibold text-muted">{t('add.amount')}</span>
                          <span className="font-bold text-teal-600 dark:text-teal-400">+{currencySymbol}{income.amount.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between items-center gap-3 bg-background/50 p-3 rounded-xl">
                          <span className="text-xs font-semibold text-muted">{t('chat.what')}</span>
                          <span className="font-bold text-sm text-right">{income.title}</span>
                        </div>
                        <div className="flex justify-between items-center bg-background/50 p-3 rounded-xl">
                          <span className="text-xs font-semibold text-muted">{t('add.date')}</span>
                          <span className="font-bold text-sm">{new Date(income.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                        </div>
                        <div className="bg-background/50 p-3 rounded-xl space-y-2">
                          <span className="text-xs font-semibold text-muted">{msg.sms?.accountType === 'bank' ? t('chat.addToBank') : t('chat.addTo')}</span>
                          {pickerAccounts.length > 0 ? (
                            <AccountPicker
                              compact
                              includeCash={false}
                              accounts={pickerAccounts}
                              value={chosen || ''}
                              onChange={(id) => setAccountChoices(prev => ({ ...prev, [msg.id]: id }))}
                              symbol={currencySymbol}
                            />
                          ) : (
                            <p className="text-xs text-muted font-medium">{t('chat.noAccountsYet')}</p>
                          )}
                        </div>
                        {balanceSync(msg, chosen)}
                        {savedInAnotherVersion(messages, msg.id) && duplicateWarning}
                      </div>

                      <div className="flex gap-3 pt-2">
                        <button
                          onClick={() => confirmIncome(msg.id)}
                          disabled={isConfirming || !chosen}
                          className="flex-1 py-3 bg-indigo-600 text-white rounded-2xl text-sm font-bold shadow-vibrant hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:shadow-none"
                        >
                          {isConfirming ? <><Loader2 size={16} className="animate-spin" /> {t('common.saving')}</> : chosen ? t('chat.addMoney') : t('chat.pickAccount')}
                        </button>
                        <button
                          onClick={() => {
                            markResolved(msg.id);
                            addMessage('assistant', tIn(msg.replyLang)('chat.cancelledIncome'));
                          }}
                          disabled={isConfirming}
                          className="flex-1 py-3 bg-slate-100 dark:bg-slate-700 text-muted rounded-2xl text-sm font-bold hover:bg-slate-200 dark:hover:bg-slate-600 transition-all disabled:opacity-50"
                        >
                          {t('common.cancel')}
                        </button>
                      </div>
                    </motion.div>
                  );
                })()}
              </div>
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
        <AnimatePresence>
          {secretWarning && (
            <motion.div
              role="alert"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="mb-2 flex items-start gap-3 p-3 rounded-2xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-300"
            >
              <ShieldAlert size={18} className="shrink-0 mt-0.5" />
              <p className="flex-1 text-xs font-semibold leading-relaxed">{t('secret.warning')}</p>
              <button onClick={() => setSecretWarning(false)} aria-label={t('common.dismiss')} className="p-0.5 opacity-70 hover:opacity-100">
                <X size={14} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
        {/* Only ever about something just tapped. It fades out slowly, then the space it took closes up. */}
        <AnimatePresence>
          {limitNote && (
            <motion.div
              key="limit-note"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, height: 'auto', transition: { duration: 0.2 } }}
              exit={{
                opacity: 0,
                height: 0,
                transition: {
                  opacity: { duration: LIMIT_NOTE_FADE_SECONDS, ease: 'easeOut' },
                  height: { delay: LIMIT_NOTE_FADE_SECONDS, duration: 0.25, ease: 'easeInOut' },
                },
              }}
              className="overflow-hidden"
            >
              <div
                role="alert"
                className={cn(
                  'mb-2 flex items-start gap-2.5 px-3 py-2.5 rounded-2xl border',
                  isGentleNote(limitNote)
                    ? 'bg-indigo-50 dark:bg-indigo-500/10 border-indigo-200 dark:border-indigo-500/30 text-indigo-700 dark:text-indigo-300'
                    : 'bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-300'
                )}
              >
                <Info size={16} className="shrink-0 mt-px" />
                <p className="flex-1 text-xs font-semibold leading-relaxed">{t(limitNote, limitNoteVars)}</p>
                <button onClick={() => setLimitNote(null)} aria-label={t('common.dismiss')} className="p-0.5 opacity-70 hover:opacity-100"><X size={14} /></button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <input type="file" ref={cameraInputRef} className="hidden" accept={IMAGE_PICKER_ACCEPT} capture="environment" onChange={handleFilePicked} />
        <input type="file" ref={galleryInputRef} className="hidden" accept={IMAGE_PICKER_ACCEPT} onChange={handleFilePicked} />
        <input type="file" ref={filesInputRef} className="hidden" accept={FILE_PICKER_ACCEPT} onChange={handleFilePicked} />
        <AnimatePresence>
          {attachMenuOpen && (
            <>
              <motion.div
                key="attach-scrim"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setAttachMenuOpen(false)}
                className="absolute inset-0 z-20 bg-black/30 backdrop-blur-[2px]"
              />
              <motion.div
                key="attach-menu"
                role="menu"
                aria-label={t('chat.attach')}
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 24 }}
                transition={{ type: 'spring', stiffness: 420, damping: 36 }}
                className="absolute inset-x-3 bottom-3 z-30 p-3 rounded-[1.75rem] bg-card border border-card-border shadow-2xl"
              >
                <div className="flex items-center justify-between px-2 pb-2">
                  <h3 className="text-sm font-bold text-foreground">{t('chat.attach')}</h3>
                  <button onClick={() => setAttachMenuOpen(false)} aria-label={t('common.cancel')} className="p-1.5 rounded-lg text-muted hover:text-foreground"><X size={16} /></button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { label: t('chat.attachCamera'), icon: Camera, input: cameraInputRef },
                    { label: t('chat.attachGallery'), icon: ImageIcon, input: galleryInputRef },
                    { label: t('chat.attachFiles'), icon: FileText, input: filesInputRef },
                  ]).map(option => (
                    <button
                      key={option.label}
                      role="menuitem"
                      onClick={() => openPicker(option.input)}
                      className="flex flex-col items-center gap-2 py-4 rounded-2xl bg-background/60 text-foreground text-xs font-bold hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                    >
                      <option.icon size={22} />
                      {option.label}
                    </button>
                  ))}
                </div>
                <p className="px-2 pt-2.5 text-[11px] text-muted font-medium">{t('chat.attachFilesHint')}</p>
              </motion.div>
            </>
          )}
        </AnimatePresence>
        <div
          className={cn(
            "rounded-[1.75rem] border bg-card transition-all duration-300 shadow-soft",
            isRecording || liveState
              ? "border-rose-400/50 shadow-[0_0_0_4px_rgba(238,85,120,0.12),0_16px_36px_-14px_rgba(238,85,120,0.45)]"
              : "border-card-border focus-within:border-indigo-400/60 focus-within:shadow-[0_0_0_4px_rgba(249,124,69,0.14),0_16px_36px_-14px_rgba(232,96,43,0.4)]"
          )}
        >
          <AnimatePresence mode="wait" initial={false}>
            {isRecording ? (
              <motion.div
                key="recording"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
                className="px-5 pt-4 pb-2"
              >
                <div className="flex items-center gap-3">
                  <span className="relative flex w-3 h-3 shrink-0">
                    {!isPaused && <span className="absolute inline-flex w-full h-full rounded-full bg-rose-400 opacity-70 animate-ping" />}
                    <span className={cn('relative inline-flex w-3 h-3 rounded-full', isPaused ? 'bg-slate-400' : 'bg-rose-500')} />
                  </span>
                  <span className="font-bold tabular-nums text-foreground text-lg tracking-tight">
                    {formatTime(recordingSeconds)}
                  </span>
                  <div className="flex-1 flex items-center justify-end gap-[3px] h-8 overflow-hidden" aria-hidden>
                    {Array.from({ length: WAVE_BARS }).map((_, i) => (
                      <motion.span
                        key={i}
                        className="w-[3px] rounded-full bg-gradient-to-t from-indigo-500 to-purple-500"
                        animate={isPaused ? { height: '22%' } : { height: ['22%', `${35 + ((i * 37) % 60)}%`, '22%'] }}
                        transition={isPaused ? { duration: 0.2 } : { duration: 0.9 + (i % 5) * 0.12, repeat: Infinity, ease: 'easeInOut', delay: i * 0.04 }}
                      />
                    ))}
                  </div>
                </div>
                <p className="text-[11px] text-muted font-medium mt-2">
                  {isPaused ? t('chat.paused') : (
                    <>{t('chat.recordingBefore')} <span className="font-bold text-indigo-600 dark:text-indigo-400">{t('chat.send')}</span> {t('chat.recordingAfter')}</>
                  )}
                  {MAX_VOICE_SECONDS - recordingSeconds <= TIME_WARNING_SECONDS && (
                    <span className="font-bold text-rose-500">{t('chat.secondsLeft', { seconds: Math.max(0, MAX_VOICE_SECONDS - recordingSeconds) })}</span>
                  )}
                </p>
              </motion.div>
            ) : liveState ? (
              <motion.div
                key="live"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
                className="px-5 pt-4 pb-2"
              >
                <div className="flex items-center gap-3">
                  <span className="relative flex w-3 h-3 shrink-0">
                    {liveState !== 'connecting' && <span className="absolute inline-flex w-full h-full rounded-full bg-rose-400 opacity-70 animate-ping" />}
                    <span className={cn('relative inline-flex w-3 h-3 rounded-full', liveState === 'connecting' ? 'bg-slate-400' : 'bg-rose-500')} />
                  </span>
                  <span role="status" className="flex-1 font-bold text-foreground">
                    {t(liveState === 'connecting' ? 'chat.liveConnecting' : liveState === 'speaking' ? 'chat.liveSpeaking' : 'chat.liveListening')}
                  </span>
                  <span className="font-bold tabular-nums text-foreground text-lg tracking-tight">
                    {formatTime(Math.max(0, MAX_LIVE_SECONDS - liveSeconds))}
                  </span>
                </div>
                <p className="text-xs text-muted font-medium mt-2 leading-relaxed line-clamp-3 min-h-[1.25rem]">
                  {liveCaption || t('chat.liveHint')}
                </p>
                {liveState !== 'connecting' && MAX_LIVE_SECONDS - liveSeconds <= TIME_WARNING_SECONDS && (
                  <p className="text-[11px] font-bold text-rose-500 mt-1">{t('chat.liveEndingSoon', { seconds: Math.max(0, MAX_LIVE_SECONDS - liveSeconds) })}</p>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="text"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="px-5 pt-4 pb-1"
              >
                {attachment && (
                  <div className="mb-3 inline-flex max-w-full items-center gap-2.5 p-1.5 pr-2 rounded-2xl bg-background/70 border border-card-border">
                    {attachment.previewUrl ? (
                      <img src={attachment.previewUrl} alt="" className="w-11 h-11 shrink-0 rounded-xl object-cover" />
                    ) : (
                      <span className="w-11 h-11 shrink-0 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                        <FileText size={20} />
                      </span>
                    )}
                    <span className="min-w-0 truncate text-xs font-semibold text-foreground">{attachment.name}</span>
                    <button
                      onClick={removeAttachment}
                      disabled={loading}
                      aria-label={t('chat.removeAttachment', { name: attachment.name })}
                      className="p-1 shrink-0 rounded-lg text-muted hover:text-rose-500 disabled:opacity-40"
                    >
                      <X size={16} />
                    </button>
                  </div>
                )}
                <textarea
                  ref={textareaRef}
                  rows={1}
                  placeholder={t('chat.placeholder')}
                  aria-label={t('chat.message')}
                  className="block w-full resize-none bg-transparent border-none outline-none text-[15px] leading-6 text-foreground font-medium placeholder:text-muted/70 max-h-36 no-scrollbar"
                  value={input}
                  onChange={(e) => {
                    if (containsSecret(e.target.value)) blockSecret();
                    else setInput(e.target.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                />
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex items-center justify-between gap-2 px-3 pb-3 pt-1">
            {liveState ? (
              <span />
            ) : isRecording ? (
              <button
                onClick={() => stopRecording(true)}
                aria-label={t('chat.cancelRecording')}
                className="h-10 px-4 rounded-full flex items-center gap-1.5 text-sm font-bold text-muted border border-card-border bg-background/50 hover:text-rose-500"
              >
                <X size={16} /> {t('common.cancel')}
              </button>
            ) : (
              <button
                onClick={() => { if (!explainIfBlocked('file')) setAttachMenuOpen(true); }}
                aria-label={t('chat.attach')}
                title={t('chat.attach')}
                aria-disabled={!!fileBlocked}
                disabled={loading}
                className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center text-muted border border-card-border bg-background/50 hover:text-indigo-600 dark:hover:text-indigo-400 disabled:opacity-50",
                  fileBlocked && "opacity-50"
                )}
              >
                <Camera size={18} />
              </button>
            )}

            <div className="flex items-center gap-2">
              {liveState ? (
                <button
                  onClick={() => liveRef.current?.finish('user')}
                  aria-label={t('chat.endLive')}
                  className="h-10 px-5 rounded-full flex items-center gap-1.5 bg-rose-500 hover:bg-rose-600 text-white text-sm font-bold"
                >
                  <Square size={14} fill="currentColor" /> {t('chat.liveEnd')}
                </button>
              ) : (
                <>
                  {isRecording ? (
                    <button
                      onClick={isPaused ? resumeRecording : pauseRecording}
                      aria-label={isPaused ? t('chat.resumeRecording') : t('chat.pauseRecording')}
                      className="h-10 px-4 rounded-full flex items-center gap-1.5 text-sm font-bold text-foreground border border-card-border bg-background/50 hover:text-indigo-600 dark:hover:text-indigo-400"
                    >
                      {isPaused ? <Play size={16} /> : <Pause size={16} />}
                      {isPaused ? t('chat.resume') : t('chat.pause')}
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={startRecording}
                        disabled={loading}
                        aria-label={t('chat.recordVoice')}
                        aria-disabled={!!voiceBlocked}
                        title={t('chat.voiceMessage')}
                        className={cn(
                          "w-10 h-10 rounded-full flex items-center justify-center text-muted border border-card-border bg-background/50 hover:text-indigo-600 dark:hover:text-indigo-400 disabled:opacity-50",
                          voiceBlocked && "opacity-50"
                        )}
                      >
                        <Mic size={18} />
                      </button>
                      <button
                        onClick={startLive}
                        disabled={loading}
                        aria-label={t('chat.startLive')}
                        aria-disabled={!!liveBlocked}
                        title={t('chat.live')}
                        className={cn(
                          "w-10 h-10 rounded-full flex items-center justify-center text-muted border border-card-border bg-background/50 hover:text-indigo-600 dark:hover:text-indigo-400 disabled:opacity-50",
                          liveBlocked && "opacity-50"
                        )}
                      >
                        <AudioLines size={18} />
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => (isRecording ? stopRecording() : handleSend())}
                    disabled={isRecording ? false : (!input.trim() && !attachment) || loading}
                    aria-label={isRecording ? t('chat.sendVoice') : t('chat.sendMessage')}
                    className={cn(
                      "h-10 rounded-full bg-gradient-to-br from-indigo-600 to-purple-600 text-white flex items-center justify-center gap-1.5 font-bold text-sm disabled:opacity-40 disabled:shadow-none",
                      isRecording ? "px-5 animate-glow" : "w-10"
                    )}
                  >
                    <ArrowUp size={18} strokeWidth={2.6} />
                    {isRecording && t('chat.send')}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

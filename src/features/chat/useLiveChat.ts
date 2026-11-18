import { useEffect, useRef, useState } from 'react';
import { ChatMessage, Expense } from '../../shared/types';
import { TFunction, TKey, translate } from '../../shared/i18n';
import { containsSecret } from '../../shared/lib/sensitiveData';
import { maskSensitive } from '../../shared/lib/smsParser';
import { normalizeExpense } from '../expenses/expense';
import { ChatTurn, fetchLimits } from './aiService';
import { ReplyLanguage, liveLanguageRules, scriptLanguage } from './language';
import { LiveEndReason, LiveSession, LiveState } from './liveSession';
import type { ToolCall } from './liveAudio';
import { Limits, MAX_LIVE_SECONDS, MediaKind } from './limits';
import { ACTION_RULES, AgentAction, AgentData, readAction } from './agent/actions';

/** How live chat asks for an action: a tool call instead of typed chat's JSON reply, and never confirmed by voice */
export const LIVE_ACTION_RULES = `
    ${ACTION_RULES}
    In this live voice chat you don't write JSON replies. To prepare an action, call prepare_action with the action
    object above as JSON text in "action", one action per call, with "summary": one short sentence in the user's
    language saying what the card is for (names, never codes). The card waits in the app's Agent space. Then tell the user to check the card and tap Confirm.
    Never say an action is done, and never treat a spoken "yes" or "confirm" as confirming it: only the tap saves.
    Where the rules above say to reply as type "chat", just answer out loud. New spending or income still goes
    through record_expense or record_income, not prepare_action.`;

/** The action inside a prepare_action call (JSON text, or an object some models send), checked like typed chat */
export function liveAction(args: Record<string, unknown>, data: AgentData) {
  let raw: unknown = args.action;
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch { return null; }
  }
  return readAction(raw, data);
}

type AddMessage = (role: 'user' | 'assistant', content: string, type?: ChatMessage['type'], pending?: Partial<Expense>, extra?: Partial<ChatMessage>) => string;

/** Live voice chat with the assistant: starting, the clock, captions, expense cards, and ending */
export function useLiveChat({
  loading, isRecording, setLimitNote, explainIfBlocked, setLimits, lang, categories, spendingContext,
  recentHistory, addMessage, setMessages, setSecretWarning, currencySymbol, tIn, t, agentData, onAction, ruleCategory,
}: {
  ruleCategory: (title?: string) => string | undefined; // the person's category rule for a title, if there is one
  agentData: () => AgentData; // what action codes point at (accounts, entries, goals...), read when a call comes in
  onAction: (action: AgentAction, words: string | undefined, replyLang: ReplyLanguage) => void; // becomes an Agent space task
  loading: boolean;
  isRecording: boolean;
  setLimitNote: (note: TKey | null) => void;
  explainIfBlocked: (kind: MediaKind) => boolean;
  setLimits: (limits: Limits | null) => void;
  lang: ReplyLanguage;
  categories: string[];
  spendingContext: string;
  recentHistory: () => ChatTurn[];
  addMessage: AddMessage;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  setSecretWarning: (show: boolean) => void;
  currencySymbol: string;
  tIn: (language?: ReplyLanguage) => TFunction;
  t: TFunction;
}) {
  const [liveState, setLiveState] = useState<LiveState | null>(null);
  const [liveSeconds, setLiveSeconds] = useState(0);
  const [liveCaption, setLiveCaption] = useState('');
  const liveRef = useRef<LiveSession | null>(null);
  const liveTimerRef = useRef<number | null>(null);
  const liveMarkerRef = useRef<string | null>(null);
  const liveStartedRef = useRef(0);
  const liveLanguageRef = useRef<ReplyLanguage>('en');

  // End a live chat if the user leaves the chat
  useEffect(() => () => {
    liveRef.current?.finish('user');
  }, []);

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
    if (call.name === 'prepare_action') {
      const action = liveAction(call.args, agentData());
      if (!action) {
        session.respondToTool(call, translate('en', 'chat.liveActionInvalid'));
        return;
      }
      const summary = typeof call.args.summary === 'string' ? cleanSpeech(call.args.summary) ?? undefined : undefined;
      onAction(action, summary, replyLang);
      session.respondToTool(call, translate('en', 'chat.liveExpenseReply'));
      return;
    }
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
      addMessage('assistant', say('chat.confirmVoiceAsk'), 'expense_confirmation', { ...found, category: ruleCategory(found.title) || found.category }, { replyLang });
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
    You are Xpences Assistant, a friendly money helper in a live voice conversation.
    ${liveLanguageRules(lang)}
    Keep answers short: one to three spoken sentences, with no lists or tables. The conversation lasts one minute at most.
    Never repeat an OTP, PIN, password or verification code, or an account, card or phone number. If you hear one, warn the user not to share it.
    When the user says they spent money, call record_expense. When they say they received money, call record_income.
    These only show a card on their screen and save nothing, so then tell them to check it and tap Confirm. Never say it has been saved.
    Available categories: ${categories.join(', ')}
    Current Date: ${new Date().toISOString()}
    User's recent spending, accounts, loans, goals and settings (use this to answer questions about reports, totals and budget advice):
    ${spendingContext || 'No data available.'}
    ${LIVE_ACTION_RULES}
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

  return { liveState, liveSeconds, liveCaption, liveRef, startLive };
}

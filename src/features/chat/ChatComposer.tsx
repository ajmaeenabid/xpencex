import { AnimatePresence, motion } from 'motion/react';
import { ArrowUp, AudioLines, Camera, FileText, Mic, Pause, Play, Square, X } from 'lucide-react';
import { cn } from '../../shared/lib/utils';
import { containsSecret } from '../../shared/lib/sensitiveData';
import { useI18n, TKey } from '../../shared/i18n';
import { MAX_LIVE_SECONDS, MAX_VOICE_SECONDS, TIME_WARNING_SECONDS, MediaKind, formatClock as formatTime } from './limits';
import { LiveSession, LiveState } from './liveSession';
import { PreparedAttachment } from './attachments';

const WAVE_BARS = 24;

/** The message box: typing, the voice recorder, the live chat panel, and their buttons */
export default function ChatComposer({
  isRecording, isPaused, recordingSeconds, startRecording, pauseRecording, resumeRecording, stopRecording,
  liveState, liveSeconds, liveCaption, liveRef, startLive,
  attachment, removeAttachment, setAttachMenuOpen, input, setInput, textareaRef, handleSend, blockSecret,
  loading, explainIfBlocked, fileBlocked, voiceBlocked, liveBlocked,
}: {
  isRecording: boolean;
  isPaused: boolean;
  recordingSeconds: number;
  startRecording: () => void;
  pauseRecording: () => void;
  resumeRecording: () => void;
  stopRecording: (cancel?: boolean) => void;
  liveState: LiveState | null;
  liveSeconds: number;
  liveCaption: string;
  liveRef: React.RefObject<LiveSession | null>;
  startLive: () => void;
  attachment: PreparedAttachment | null;
  removeAttachment: () => void;
  setAttachMenuOpen: (open: boolean) => void;
  input: string;
  setInput: (text: string) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  handleSend: (text?: string) => void;
  blockSecret: () => void;
  loading: boolean;
  explainIfBlocked: (kind: MediaKind) => boolean;
  fileBlocked: TKey | null;
  voiceBlocked: TKey | null;
  liveBlocked: TKey | null;
}) {
  const { t } = useI18n();
  return (
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
  );
}

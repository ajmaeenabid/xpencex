import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, ChevronLeft, ChevronRight, Copy, Pencil, RefreshCw, Share2 } from 'lucide-react';
import { useI18n } from '../../shared/i18n';
import { copyText, ShareOutcome, shareReply } from './shareReply';

const FEEDBACK_MS = 2000;
const NOTE_MS = 5000;

function ActionButton({ label, onClick, disabled, children }: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="w-8 h-8 rounded-lg flex items-center justify-center text-muted hover:text-foreground hover:bg-card/70 transition-colors disabled:opacity-40"
    >
      {children}
    </button>
  );
}

export function CopyButton({ text }: { text: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);
  const copy = async () => {
    if (!(await copyText(text))) return;
    setCopied(true);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), FEEDBACK_MS);
  };
  return (
    <ActionButton label={copied ? t('chat.copied') : t('chat.copy')} onClick={copy}>
      {copied ? <Check size={15} className="text-indigo-600 dark:text-indigo-400" /> : <Copy size={15} />}
    </ActionButton>
  );
}

export function ResendButton({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  const { t } = useI18n();
  return <ActionButton label={t('chat.resend')} onClick={onClick} disabled={disabled}><RefreshCw size={15} /></ActionButton>;
}

export function EditButton({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  const { t } = useI18n();
  return <ActionButton label={t('chat.editMessage')} onClick={onClick} disabled={disabled}><Pencil size={15} /></ActionButton>;
}

export function ShareButton({ text }: { text: string }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<ShareOutcome | null>(null);
  const timer = useRef<number | null>(null);
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);
  const share = async () => {
    setBusy(true);
    const outcome = await shareReply(text);
    setBusy(false);
    if (outcome === 'shared' || outcome === 'cancelled') return;
    setNote(outcome);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setNote(null), NOTE_MS);
  };
  return (
    <>
      <ActionButton label={t('chat.share')} onClick={share} disabled={busy}><Share2 size={15} /></ActionButton>
      {note && (
        <span role="status" className="ml-1 text-[12px] font-semibold text-muted">
          {t(note === 'saved' ? 'chat.shareSaved' : note === 'copied' ? 'chat.shareCopied' : 'chat.shareFailed')}
        </span>
      )}
    </>
  );
}

/** "< 2 / 3 >" under a prompt that has more than one version */
export function VersionArrows({ current, total, disabled, onChange }: {
  current: number;
  total: number;
  disabled: boolean;
  onChange: (index: number) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex items-center text-muted" role="group" aria-label={t('chat.versionLabel', { current: current + 1, total })}>
      <ActionButton label={t('chat.prevVersion')} onClick={() => onChange(current - 1)} disabled={disabled || current === 0}>
        <ChevronLeft size={15} />
      </ActionButton>
      <span className="text-xs font-semibold tabular-nums px-0.5">{current + 1} / {total}</span>
      <ActionButton label={t('chat.nextVersion')} onClick={() => onChange(current + 1)} disabled={disabled || current === total - 1}>
        <ChevronRight size={15} />
      </ActionButton>
    </div>
  );
}

import { useState } from 'react';
import { format } from 'date-fns';
import { CheckCheck, ChevronRight, Clock, MessageSquareHeart, Send } from 'lucide-react';
import { useI18n } from '../../shared/i18n';
import { cn } from '../../shared/lib/utils';
import { CARD_SUB, CARD_TITLE } from '../../shared/lib/cardText';
import DetailSheet from '../../shared/components/DetailSheet';
import { MAX_FEEDBACK, checkFeedback } from './feedback';
import { sendFeedback, useMyFeedback } from './feedbackService';

const iconTile = 'w-10 h-10 shrink-0 rounded-xl flex items-center justify-center bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400';

/** Profile row: write a comment about the app for the admin. Works offline; it is sent when the internet is back. */
export default function FeedbackCard({ uid }: { uid: string }) {
  const { t, dateLocale } = useI18n();
  const mine = useMyFeedback(uid);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [thanks, setThanks] = useState('');
  const waiting = mine.filter(m => m.pending).length;

  const send = async () => {
    setError('');
    setThanks('');
    const check = checkFeedback(text);
    if (check.ok === false) {
      if (check.reason === 'secret') setError(t('feedback.secret'));
      else if (check.reason === 'tooLong') setError(t('feedback.tooLong', { max: MAX_FEEDBACK }));
      return;
    }
    setBusy(true);
    try {
      const result = await sendFeedback(uid, check.text);
      setText('');
      setThanks(t(result === 'onPhone' ? 'feedback.savedOffline' : 'feedback.thanks'));
    } catch (err) {
      console.error('Could not send the comment:', err);
      setError(t('feedback.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        onClick={() => { setThanks(''); setError(''); setOpen(true); }}
        className="w-full bg-card p-6 rounded-3xl shadow-sm border border-card-border flex items-center gap-3 text-left transition-colors hover:border-indigo-500/40"
      >
        <div className={iconTile}><MessageSquareHeart size={20} /></div>
        <div className="flex-1 min-w-0">
          <h3 className={CARD_TITLE}>{t('feedback.title')}</h3>
          <p className={CARD_SUB}>{waiting ? t('feedback.rowWaiting', { count: waiting }) : t('feedback.rowHint')}</p>
        </div>
        <ChevronRight size={20} className="text-muted shrink-0" />
      </button>

      <DetailSheet
        open={open}
        onClose={() => setOpen(false)}
        icon={<div className={cn(iconTile, 'w-11 h-11 rounded-2xl')}><MessageSquareHeart size={20} /></div>}
        title={t('feedback.title')}
        about={t('feedback.about')}
        footer={
          <button
            onClick={send}
            disabled={busy || !text.trim()}
            className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-600 text-white rounded-xl text-sm font-bold disabled:opacity-50"
          >
            <Send size={16} /> {busy ? t('common.pleaseWait') : t('feedback.send')}
          </button>
        }
      >
        <div className="space-y-1.5">
          <textarea
            value={text}
            onChange={e => { setText(e.target.value); setError(''); setThanks(''); }}
            maxLength={MAX_FEEDBACK}
            rows={5}
            placeholder={t('feedback.placeholder')}
            aria-label={t('feedback.title')}
            className="w-full p-3 rounded-xl bg-background/60 border border-card-border text-sm text-foreground outline-none focus:border-indigo-500 resize-none"
          />
          <p className="text-right text-[12px] text-muted font-semibold tabular-nums">{text.length}/{MAX_FEEDBACK}</p>
        </div>
        {error && <p role="alert" className="text-sm font-semibold text-rose-500">{error}</p>}
        {thanks && <p role="status" className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">{thanks}</p>}

        {mine.length > 0 && (
          <div className="space-y-2 pt-2">
            <p className="text-xs font-bold text-muted">{t('feedback.yours')}</p>
            {mine.map(m => (
              <div key={m.id} className="p-3 rounded-xl bg-background/50 border border-card-border space-y-1.5">
                <p className="text-sm text-foreground whitespace-pre-wrap break-words">{m.text}</p>
                <p className={cn('flex items-center gap-1.5 text-[12px] font-bold', m.pending ? 'text-amber-600 dark:text-amber-400' : 'text-muted')}>
                  {m.pending ? <Clock size={12} /> : <CheckCheck size={12} />}
                  {m.pending ? t('feedback.waiting') : t('feedback.sentOn', { date: format(new Date(m.createdAt), 'd MMM yyyy, h:mm a', { locale: dateLocale }) })}
                </p>
              </div>
            ))}
          </div>
        )}
      </DetailSheet>
    </>
  );
}

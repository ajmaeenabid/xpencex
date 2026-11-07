import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { format } from 'date-fns';
import { Mail, Phone, X } from 'lucide-react';
import { useI18n, TKey } from '../../shared/i18n';
import { CHECKED_ON, WRONG_SEND, WrongSendProvider, telLink } from './wrongSend';

const STEPS: TKey[] = ['wrongSend.step1', 'wrongSend.step2', 'wrongSend.step3', 'wrongSend.step4', 'wrongSend.step5'];

/** "Sent to the wrong number?": the provider's helpline to call straight away, and safe steps */
export default function WrongSendSheet({ provider, onClose }: { provider: WrongSendProvider | null; onClose: () => void }) {
  const { t, dateLocale } = useI18n();
  const info = provider ? WRONG_SEND[provider] : null;

  return createPortal(
    <AnimatePresence>
      {info && (
        <motion.div key="wrong-send" className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-3" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={t('wrongSend.title', { provider: info.name })}
            initial={{ y: 30 }} animate={{ y: 0 }} exit={{ y: 30 }}
            className="relative w-full max-w-md max-h-[85vh] overflow-y-auto p-5 rounded-[1.75rem] bg-[var(--card-solid)] border border-card-border shadow-2xl space-y-4"
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-base font-bold text-foreground">{t('wrongSend.title', { provider: info.name })}</h3>
              <button onClick={onClose} aria-label={t('common.close')} className="p-1.5 rounded-lg text-muted hover:text-foreground"><X size={18} /></button>
            </div>
            <p className="text-sm font-semibold text-rose-600 dark:text-rose-400">{t('wrongSend.now')}</p>

            <div className="space-y-2">
              {info.helplines.map(number => (
                <a key={number} href={telLink(number)} className="flex items-center justify-center gap-2 h-12 rounded-2xl bg-indigo-600 text-white text-sm font-bold">
                  <Phone size={16} /> {t('wrongSend.call', { number })}
                </a>
              ))}
              <p className="text-xs text-muted font-medium">{t('wrongSend.ussd', { code: info.ussd })}</p>
              <a href={`mailto:${info.email}`} className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 dark:text-indigo-400"><Mail size={13} /> {info.email}</a>
            </div>

            <ol className="space-y-2 list-decimal pl-5">
              {STEPS.map(step => <li key={step} className="text-sm text-foreground leading-relaxed">{t(step)}</li>)}
            </ol>

            <p className="text-[11px] text-muted font-medium leading-relaxed">
              {t('wrongSend.checked', { date: format(new Date(`${CHECKED_ON}T12:00:00`), 'd MMM yyyy', { locale: dateLocale }) })}
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { useI18n } from '../i18n';
import { cn } from '../lib/utils';

// The app's own pop-up questions, used instead of the browser's confirm() and alert(), which
// the phone draws in its own style and the app can't theme.

type Request = {
  message: string;
  kind: 'confirm' | 'alert';
  danger: boolean;
  tick?: string; // an extra tick box under the question
  ticked?: boolean; // whether that tick starts on
  okLabel?: string; // instead of "Confirm"
  resolve: (answer: boolean, ticked?: boolean) => void;
};

let enqueue: ((request: Request) => void) | null = null;

/** Asks a yes or no question. `danger` is for something that can't be undone. `okLabel` renames the yes button. */
export function confirmDialog(message: string, { danger = false, okLabel }: { danger?: boolean; okLabel?: string } = {}): Promise<boolean> {
  return new Promise(resolve => {
    if (enqueue) enqueue({ message, kind: 'confirm', danger, okLabel, resolve });
    else resolve(window.confirm(message));
  });
}

/** A yes or no question with one extra tick box (unticked unless `ticked`), e.g. "Also delete its receipt" */
export function confirmWithTick(message: string, tick: string, { danger = false, ticked = false } = {}): Promise<{ ok: boolean; ticked: boolean }> {
  return new Promise(resolve => {
    if (enqueue) enqueue({ message, kind: 'confirm', danger, tick, ticked, resolve: (ok, on) => resolve({ ok, ticked: ok && !!on }) });
    else resolve({ ok: window.confirm(message), ticked: false });
  });
}

/** Tells the person something, and waits for OK */
export function alertDialog(message: string): Promise<void> {
  return new Promise(resolve => {
    if (enqueue) enqueue({ message, kind: 'alert', danger: false, resolve: () => resolve() });
    else {
      window.alert(message);
      resolve();
    }
  });
}

/** Goes once near the top of the app, inside the language provider */
export function DialogHost() {
  const { t } = useI18n();
  const [queue, setQueue] = useState<Request[]>([]);
  const answerRef = useRef<HTMLButtonElement>(null);
  const current = queue[0];
  const [ticked, setTicked] = useState(false);

  useEffect(() => {
    enqueue = (request) => setQueue(q => [...q, request]);
    return () => { enqueue = null; };
  }, []);

  const answer = (value: boolean) => {
    current?.resolve(value, ticked);
    setTicked(false);
    setQueue(q => q.slice(1));
  };

  useEffect(() => { setTicked(!!current?.ticked); }, [current]);

  useEffect(() => {
    if (!current) return;
    answerRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      answer(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [current]);

  return createPortal(
    <AnimatePresence>
      {current && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-5">
          <motion.div
            key="scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => answer(false)}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          />
          <motion.div
            key="dialog"
            role="alertdialog"
            aria-modal="true"
            aria-label={current.message}
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="relative w-full max-w-sm p-6 rounded-[2rem] bg-[var(--card-solid)] text-foreground border border-card-border shadow-2xl space-y-5"
          >
            <p className="text-sm font-semibold leading-relaxed whitespace-pre-line">{current.message}</p>
            {current.tick && (
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" className="w-4 h-4 shrink-0 accent-indigo-600" checked={ticked} onChange={e => setTicked(e.target.checked)} />
                <span className="text-sm font-medium text-foreground">{current.tick}</span>
              </label>
            )}
            <div className={cn('grid gap-3', current.kind === 'confirm' ? 'grid-cols-2' : 'grid-cols-1')}>
              {current.kind === 'confirm' && (
                <button
                  type="button"
                  onClick={() => answer(false)}
                  className="h-11 rounded-xl text-sm font-bold bg-background/60 text-foreground border border-card-border hover:bg-background"
                >
                  {t('common.cancel')}
                </button>
              )}
              <button
                ref={answerRef}
                type="button"
                onClick={() => answer(true)}
                className={cn(
                  'h-11 rounded-xl text-sm font-bold text-white',
                  current.danger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-indigo-600 hover:bg-indigo-700',
                )}
              >
                {current.okLabel || t(current.kind === 'alert' ? 'dialog.ok' : 'dialog.confirm')}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

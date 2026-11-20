import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { ShieldCheck, X } from 'lucide-react';
import { useI18n } from '../i18n';
import { isNative, openExternal, openInBrowser } from '../lib/nativeApp';
import { lockScroll } from '../lib/scrollLock';
import { useBackClose } from '../lib/backButton';

/**
 * Opens the privacy policy in a window inside the app, in the app's language. The policy pages
 * (public/privacy.html, privacy-bn.html) ship inside the app, so this works offline too.
 * It used to open in a new tab, but in the phone app that sent Chrome to https://localhost, which
 * only exists inside the app, so people saw an error page.
 */
export default function PrivacyLink() {
  const { t, lang } = useI18n();
  const [open, setOpen] = useState(false);

  // The phone's back button does the same (src/shared/lib/backButton.ts)
  useBackClose(open, () => setOpen(false));
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    const unlockScroll = lockScroll();
    return () => { window.removeEventListener('keydown', onKey); unlockScroll(); };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-semibold text-muted underline underline-offset-2 hover:text-foreground transition-colors"
      >
        {t('common.privacyPolicy')}
      </button>
      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              key="privacy"
              role="dialog"
              aria-modal="true"
              aria-label={t('common.privacyPolicy')}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
              className="fixed inset-0 z-[70] flex flex-col bg-background text-foreground"
            >
              <header className="shrink-0 bg-card/80 backdrop-blur-xl border-b border-card-border">
                <div className="max-w-2xl mx-auto flex items-center gap-3 px-4 sm:px-6 h-16">
                  <button
                    onClick={() => setOpen(false)}
                    aria-label={t('common.close')}
                    className="inline-flex items-center justify-center w-10 h-10 rounded-xl text-muted hover:text-foreground hover:bg-background/60 transition-colors"
                  >
                    <X size={20} />
                  </button>
                  <ShieldCheck size={20} className="text-indigo-600 dark:text-indigo-400" />
                  <h2 className="text-base font-bold truncate">{t('common.privacyPolicy')}</h2>
                </div>
              </header>
              <iframe
                src={lang === 'bn' ? '/privacy-bn.html' : '/privacy.html'}
                title={t('common.privacyPolicy')}
                onLoad={e => sendOutsideLinksOut(e.currentTarget)}
                className="flex-1 w-full border-0 bg-background"
              />
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}

/**
 * Links inside the policy to other sites (Google's terms) and the email address can't open inside
 * the window, so they open in the phone's browser or email app, or a new tab on a computer.
 * The link to the other language stays in the window.
 */
function sendOutsideLinksOut(frame: HTMLIFrameElement) {
  const page = frame.contentDocument;
  if (!page) return;
  page.addEventListener('click', (e) => {
    const link = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
    if (!link) return;
    const url = new URL(link.href, page.baseURI);
    if (url.origin === window.location.origin) return;
    e.preventDefault();
    if (!isNative()) {
      if (url.protocol === 'mailto:') window.location.href = url.href;
      else window.open(url.href, '_blank', 'noopener');
    } else if (url.protocol === 'mailto:') {
      openInBrowser(url.href).catch(err => console.error('Could not open the email app:', err));
    } else {
      openExternal(url.href).catch(err => console.error('Could not open the link:', err));
    }
  });
}

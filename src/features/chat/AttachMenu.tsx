import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Camera, FileText, Image as ImageIcon, X } from 'lucide-react';
import { useI18n } from '../../shared/i18n';
import { FILE_PICKER_ACCEPT, IMAGE_PICKER_ACCEPT } from './attachments';
import { keepTyping } from '../../shared/lib/keyboard';

type InputRef = React.RefObject<HTMLInputElement | null>;

/** The hidden file pickers and the Camera / Gallery / Files sheet */
export default function AttachMenu({
  cameraInputRef, galleryInputRef, filesInputRef, handleFilePicked, attachMenuOpen, setAttachMenuOpen, openPicker,
}: {
  cameraInputRef: InputRef;
  galleryInputRef: InputRef;
  filesInputRef: InputRef;
  handleFilePicked: (e: React.ChangeEvent<HTMLInputElement>) => void;
  attachMenuOpen: boolean;
  setAttachMenuOpen: (open: boolean) => void;
  openPicker: (input: InputRef) => void;
}) {
  const { t } = useI18n();
  return (
    <>
      <input type="file" ref={cameraInputRef} className="hidden" accept={IMAGE_PICKER_ACCEPT} capture="environment" onChange={handleFilePicked} />
      <input type="file" ref={galleryInputRef} className="hidden" accept={IMAGE_PICKER_ACCEPT} onChange={handleFilePicked} />
      <input type="file" ref={filesInputRef} className="hidden" accept={FILE_PICKER_ACCEPT} onChange={handleFilePicked} />
      {/* Over the whole screen (not only the chat area), so the dimming has no light frame round it */}
      {createPortal(
      <AnimatePresence>
        {attachMenuOpen && (
          <>
            <motion.div
              key="attach-scrim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              // Closing keeps the focus in the message box, so the keyboard stays up (keepTyping)
              {...keepTyping}
              onClick={() => setAttachMenuOpen(false)}
              className="fixed inset-0 z-[60] bg-black/30 backdrop-blur-[2px]"
            />
            <motion.div
              key="attach-menu"
              role="menu"
              {...keepTyping}
              aria-label={t('chat.attach')}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 24 }}
              transition={{ type: 'spring', stiffness: 420, damping: 36 }}
              className="fixed inset-x-3 bottom-[calc(0.75rem+var(--sab))] z-[61] max-w-md mx-auto p-3 rounded-[1.75rem] bg-[var(--card-solid)] border border-card-border shadow-2xl"
            >
              <div className="flex items-center justify-between px-2 pb-2">
                <h3 className="text-sm font-bold text-foreground">{t('chat.attach')}</h3>
                <button {...keepTyping} onClick={() => setAttachMenuOpen(false)} aria-label={t('common.cancel')} className="p-1.5 rounded-lg text-muted hover:text-foreground"><X size={16} /></button>
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
                    {...keepTyping}
                    onClick={() => openPicker(option.input)}
                    className="flex flex-col items-center gap-2 py-4 rounded-2xl bg-background/60 text-foreground text-xs font-bold hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                  >
                    <option.icon size={22} />
                    {option.label}
                  </button>
                ))}
              </div>
              <p className="px-2 pt-2.5 text-[12px] text-muted font-medium">{t('chat.attachFilesHint')}</p>
            </motion.div>
          </>
        )}
      </AnimatePresence>,
      document.body)}
    </>
  );
}

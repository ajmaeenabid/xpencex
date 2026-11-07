import { useRef, useState } from 'react';
import { TKey } from '../../shared/i18n';
import { PreparedAttachment, prepareAttachment } from './attachments';
import { Limits, MediaKind, warningFor } from './limits';

/** The file waiting to be sent, the photos shown in this chat, and the Camera / Gallery / Files sheet */
export function useAttachments({ explainIfBlocked, setSecretWarning, setLimitNote, warnOnce, limits, usage }: {
  explainIfBlocked: (kind: MediaKind) => boolean;
  setSecretWarning: (show: boolean) => void;
  setLimitNote: (note: TKey | null) => void;
  warnOnce: (key: TKey | null) => void;
  limits: Limits | null;
  usage: Record<MediaKind, number>;
}) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const filesInputRef = useRef<HTMLInputElement>(null);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [attachment, setAttachment] = useState<PreparedAttachment | null>(null);
  // Photos stay visible while the chat is open. Only the file's name is ever saved.
  const [photoPreviews, setPhotoPreviews] = useState<Record<string, string>>({});

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

  return {
    cameraInputRef, galleryInputRef, filesInputRef, attachMenuOpen, setAttachMenuOpen,
    attachment, setAttachment, photoPreviews, setPhotoPreviews, openPicker, handleFilePicked, removeAttachment,
  };
}

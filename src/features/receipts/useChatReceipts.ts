import { useEffect, useRef, useState } from 'react';
import { MAX_RECEIPT_BYTES } from '../../../ai-server/src/receiptRules';
import { alertDialog } from '../../shared/components/Dialog';
import { isOnline } from '../../shared/lib/offlineSave';
import type { TFunction } from '../../shared/i18n';
import { MAX_RECEIPTS, PreparedReceipt, prepareReceipt, takeFirstReceiptNote } from './receiptFile';
import { attachWhenSaved, countReceipts } from './receiptService';

// "Keep this receipt" on a chat expense card made from a photo or PDF. The file lives only in this
// chat's memory (chats save just the file's name), so the option is there until the card is saved or
// the chat is left. Ticked by default; greyed when the PDF is over 1 MB or 100 receipts are kept.

export type ChatReceipt =
  | { status: 'ready'; receipt: PreparedReceipt; keep: boolean }
  | { status: 'tooBig' }
  | { status: 'full'; receipt: PreparedReceipt };

/** A sent file as the chat holds it: base64 bytes and their type */
export type SentFile = { name: string; kind: string; mimeType: string; data: string };

function toFile({ name, mimeType, data }: SentFile): File {
  const bytes = Uint8Array.from(atob(data), c => c.charCodeAt(0));
  return new File([bytes], name || 'receipt', { type: mimeType });
}

export function useChatReceipts(uid: string | undefined, t: TFunction) {
  const [byCard, setByCard] = useState<Record<string, ChatReceipt>>({});
  const urls = useRef<string[]>([]);
  useEffect(() => () => urls.current.forEach(u => URL.revokeObjectURL(u)), []);

  /** Gets the file sent with this card ready to keep. Only photos and PDFs count. */
  const offerFor = async (cardId: string, file: SentFile) => {
    if (!uid || (file.kind !== 'image' && file.kind !== 'pdf')) return;
    if (file.kind === 'pdf' && Math.floor((file.data.length * 3) / 4) > MAX_RECEIPT_BYTES) {
      setByCard(prev => ({ ...prev, [cardId]: { status: 'tooBig' } }));
      return;
    }
    const prepared = await prepareReceipt(toFile(file));
    if ('problem' in prepared) {
      if (prepared.problem === 'size') setByCard(prev => ({ ...prev, [cardId]: { status: 'tooBig' } }));
      return; // a photo that can't be read just gets no option
    }
    if (prepared.previewUrl) urls.current.push(prepared.previewUrl);
    let full = false;
    try {
      if (isOnline()) full = (await countReceipts(uid)) >= MAX_RECEIPTS;
    } catch {
      // the server checks again when it is sent
    }
    setByCard(prev => ({ ...prev, [cardId]: full ? { status: 'full', receipt: prepared } : { status: 'ready', receipt: prepared, keep: true } }));
  };

  const toggle = (cardId: string) => setByCard(prev => {
    const current = prev[cardId];
    return current?.status === 'ready' ? { ...prev, [cardId]: { ...current, keep: !current.keep } } : prev;
  });

  /** After "Open receipts" (someone may have deleted one): count again, and offer the tick, left unticked, where there is room */
  const recheckFull = async () => {
    const fullCards = Object.entries(byCard).filter(([, c]) => c.status === 'full');
    if (!uid || fullCards.length === 0) return;
    try {
      if ((await countReceipts(uid)) >= MAX_RECEIPTS) return;
      setByCard(prev => {
        const next = { ...prev };
        for (const [id, c] of fullCards) if (c.status === 'full') next[id] = { status: 'ready', receipt: c.receipt, keep: false };
        return next;
      });
    } catch {
      // still shown as full
    }
  };

  /** Called once the card's expense is saved: sends the receipt when it is ticked */
  const afterSaved = (cardId: string, expenseId: string, write: Promise<unknown>) => {
    const current = byCard[cardId];
    setByCard(prev => { const next = { ...prev }; delete next[cardId]; return next; });
    if (current?.status !== 'ready' || !current.keep || !uid) return;
    if (takeFirstReceiptNote(uid)) alertDialog(t('receipt.cardNote'));
    attachWhenSaved(write, current.receipt.blob, expenseId, 'chat');
  };

  return { receiptFor: (cardId: string): ChatReceipt | undefined => byCard[cardId], offerFor, toggle, recheckFull, afterSaved };
}

import { useRef, useState } from 'react';
import { Camera, FileText, Image as ImageIcon, Loader2, Receipt as ReceiptIcon, X } from 'lucide-react';
import { useI18n } from '../../shared/i18n';
import { alertDialog, confirmDialog } from '../../shared/components/Dialog';
import { isOnline } from '../../shared/lib/offlineSave';
import { showToast } from '../../shared/lib/toast';
import { IMAGE_PICKER_ACCEPT } from '../chat/attachments';
import { MAX_RECEIPTS, PreparedReceipt, prepareReceipt, receiptProblemKey, takeFirstReceiptNote } from './receiptFile';
import { countReceipts, deleteReceipt, ReceiptError } from './receiptService';
import ReceiptViewer from './ReceiptViewer';
import ReceiptsGallery from './ReceiptsGallery';
import FullWindow from '../../shared/components/FullWindow';
import { useReceipts } from './useReceipts';

const FILES_ACCEPT = `${IMAGE_PICKER_ACCEPT},application/pdf,.jpg,.jpeg,.png,.webp,.pdf`;

/**
 * The receipt part of Add Expense. A picked receipt waits here (`pending`) and is sent once the expense is
 * saved, because it needs the expense to belong to. A receipt already on the expense can be viewed or deleted.
 */
export default function ReceiptField({ uid, savedReceiptId, onSavedReceiptDeleted, pending, setPending }: {
  uid: string;
  savedReceiptId?: string;
  onSavedReceiptDeleted: () => void;
  pending: PreparedReceipt | null;
  setPending: (receipt: PreparedReceipt | null) => void;
}) {
  const { t } = useI18n();
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<HTMLInputElement>(null);
  const [choosing, setChoosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const receipts = useReceipts(uid, galleryOpen);

  const startAdding = async () => {
    if (!isOnline()) {
      await alertDialog(t('receipt.needsInternet'));
      return;
    }
    if (takeFirstReceiptNote(uid)) await alertDialog(t('receipt.cardNote'));
    setChoosing(true);
  };

  const pick = (input: React.RefObject<HTMLInputElement | null>) => {
    setChoosing(false);
    input.current?.click();
  };

  const handlePicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // so picking the same file again still works
    if (!file) return;
    setBusy(true);
    try {
      // Checked now, so nobody fills in a receipt that can't be kept
      if ((await countReceipts(uid)) >= MAX_RECEIPTS) {
        if (await confirmDialog(t('receipt.full'), { okLabel: t('receipt.openReceipts') })) setGalleryOpen(true);
        return;
      }
      const prepared = await prepareReceipt(file);
      if ('problem' in prepared) {
        showToast(receiptProblemKey(prepared.problem));
        return;
      }
      if (pending?.previewUrl) URL.revokeObjectURL(pending.previewUrl);
      setPending(prepared);
    } catch (err) {
      console.error('Could not get the receipt ready', err);
      showToast(isOnline() ? 'receipt.problem.save' : 'receipt.needsInternet');
    } finally {
      setBusy(false);
    }
  };

  const removePending = () => {
    if (pending?.previewUrl) URL.revokeObjectURL(pending.previewUrl);
    setPending(null);
  };

  const deleteSaved = async () => {
    if (!savedReceiptId) return;
    if (!(await confirmDialog(t('receipt.deleteConfirm'), { danger: true }))) return;
    setBusy(true);
    try {
      await deleteReceipt(savedReceiptId);
      setViewing(false);
      onSavedReceiptDeleted();
      showToast('receipt.deleted');
    } catch (err) {
      showToast(receiptProblemKey(err instanceof ReceiptError ? err.code : undefined));
    } finally {
      setBusy(false);
    }
  };

  const options = [
    { label: t('chat.attachCamera'), icon: Camera, input: cameraRef },
    { label: t('chat.attachGallery'), icon: ImageIcon, input: galleryRef },
    { label: t('chat.attachFiles'), icon: FileText, input: filesRef },
  ];

  return (
    <div className="bg-background/50 p-4 rounded-2xl space-y-3">
      <input type="file" ref={cameraRef} className="hidden" accept={IMAGE_PICKER_ACCEPT} capture="environment" onChange={handlePicked} />
      <input type="file" ref={galleryRef} className="hidden" accept={IMAGE_PICKER_ACCEPT} onChange={handlePicked} />
      <input type="file" ref={filesRef} className="hidden" accept={FILES_ACCEPT} onChange={handlePicked} />

      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-500/10 rounded-xl flex items-center justify-center text-indigo-600 dark:text-indigo-400">
          <ReceiptIcon size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm text-foreground">{t('receipt.title')}</p>
          <p className="text-[12px] text-muted font-medium">{t('receipt.hint')}</p>
        </div>
        {busy ? (
          <Loader2 className="animate-spin text-muted" size={18} />
        ) : savedReceiptId ? (
          <button type="button" onClick={() => setViewing(true)} className="text-indigo-600 dark:text-indigo-400 font-bold text-sm">{t('receipt.view')}</button>
        ) : choosing ? (
          <button type="button" onClick={() => setChoosing(false)} className="text-muted font-bold text-sm">{t('common.cancel')}</button>
        ) : !pending ? (
          <button type="button" onClick={startAdding} className="text-indigo-600 dark:text-indigo-400 font-bold text-sm">{t('receipt.add')}</button>
        ) : null}
      </div>

      {choosing && (
        <div className="grid grid-cols-3 gap-2">
          {options.map(option => (
            <button
              key={option.label}
              type="button"
              onClick={() => pick(option.input)}
              className="flex flex-col items-center gap-1.5 py-3 rounded-xl bg-card border border-card-border text-foreground text-xs font-bold hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
            >
              <option.icon size={20} />
              {option.label}
            </button>
          ))}
        </div>
      )}

      {pending && (
        <div className="flex items-center gap-3 p-2 rounded-xl bg-card border border-card-border">
          {pending.previewUrl ? (
            <img src={pending.previewUrl} alt="" className="w-14 h-14 rounded-lg object-cover" />
          ) : (
            <div className="w-14 h-14 rounded-lg bg-background flex items-center justify-center text-muted"><FileText size={22} /></div>
          )}
          <p className="flex-1 text-xs text-muted font-medium">{t('receipt.pendingNote')}</p>
          <button type="button" onClick={removePending} aria-label={t('receipt.remove')} className="p-2 rounded-lg text-muted hover:text-foreground">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Over the form, so what was typed stays; no "Open expense" here, as that would leave this form */}
      <FullWindow
        open={galleryOpen}
        atRoot
        onClose={() => setGalleryOpen(false)}
        onBack={() => setGalleryOpen(false)}
        pageKey="receipts"
        icon={<ReceiptIcon size={20} className="text-indigo-600 dark:text-indigo-400" />}
        title={t('receipts.title')}
      >
        <ReceiptsGallery receipts={receipts} />
      </FullWindow>

      {viewing && savedReceiptId && (
        <ReceiptViewer receiptId={savedReceiptId} onClose={() => setViewing(false)} onDelete={deleteSaved} />
      )}
    </div>
  );
}

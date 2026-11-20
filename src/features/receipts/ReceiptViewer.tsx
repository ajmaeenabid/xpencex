import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { FileText, Loader2, Trash2, X } from 'lucide-react';
import { useI18n } from '../../shared/i18n';
import { isNative, shareBinaryFile } from '../../shared/lib/nativeApp';
import { bytesToBase64 } from '../chat/liveAudio';
import { openReceipt, ReceiptError } from './receiptService';
import { receiptProblemKey } from './receiptFile';
import { useBackClose } from '../../shared/lib/backButton';

/** What the viewer shows about the receipt's expense: its details, or that it has none */
export type ReceiptDetails = { title: string; amount: string; date: string } | 'none';

/**
 * A receipt on the whole screen. Photos show here; a PDF opens in the phone's PDF app.
 * From the Receipts section it also shows its expense, with a button to open that expense.
 */
export default function ReceiptViewer({ receiptId, onClose, onDelete, details, onOpenExpense }: {
  receiptId: string;
  onClose: () => void;
  onDelete?: () => void;
  details?: ReceiptDetails;
  onOpenExpense?: () => void;
}) {
  // The phone's back button closes it (src/shared/lib/backButton.ts)
  useBackClose(true, onClose);
  const { t } = useI18n();
  const [file, setFile] = useState<{ blob: Blob; url: string } | null>(null);
  const [problem, setProblem] = useState('');

  useEffect(() => {
    let url = '';
    let stopped = false;
    openReceipt(receiptId)
      .then(blob => {
        if (stopped) return;
        url = URL.createObjectURL(blob);
        setFile({ blob, url });
      })
      .catch(err => {
        if (!stopped) setProblem(t(err instanceof ReceiptError && err.code === 'missing' ? 'receipt.missing' : receiptProblemKey(err?.code)));
      });
    return () => {
      stopped = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [receiptId]);

  const openPdf = async () => {
    if (!file) return;
    if (isNative()) {
      const base64 = bytesToBase64(new Uint8Array(await file.blob.arrayBuffer()));
      await shareBinaryFile(`receipt-${receiptId.slice(0, 8)}.pdf`, base64, t('receipt.title'))
        .catch(err => console.error('Could not open the PDF', err));
    } else {
      window.open(file.url, '_blank');
    }
  };

  const isPdf = file?.blob.type === 'application/pdf';

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[80] bg-black/90 flex flex-col pt-[var(--sat)] pb-[var(--sab)]"
      role="dialog"
      aria-label={t('receipt.title')}
    >
      <div className="flex items-center justify-between p-4 text-white">
        <h2 className="font-bold">{t('receipt.title')}</h2>
        <div className="flex items-center gap-2">
          {onDelete && (
            <button onClick={onDelete} aria-label={t('receipt.delete')} className="p-2 rounded-xl bg-white/10 hover:bg-white/20">
              <Trash2 size={18} />
            </button>
          )}
          <button onClick={onClose} aria-label={t('common.close')} className="p-2 rounded-xl bg-white/10 hover:bg-white/20">
            <X size={18} />
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0 flex items-center justify-center p-4 overflow-auto">
        {problem ? (
          <p className="text-white/80 text-sm font-medium text-center max-w-xs">{problem}</p>
        ) : !file ? (
          <Loader2 className="animate-spin text-white" size={28} />
        ) : isPdf ? (
          <button onClick={openPdf} className="flex flex-col items-center gap-3 px-8 py-6 rounded-3xl bg-white/10 text-white hover:bg-white/20">
            <FileText size={40} />
            <span className="font-bold text-sm">{t('receipt.openPdf')}</span>
          </button>
        ) : (
          <img src={file.url} alt={t('receipt.title')} className="max-w-full max-h-full object-contain rounded-xl" />
        )}
      </div>
      {details && (
        <div className="m-4 mt-0 p-4 rounded-2xl bg-white/10 text-white flex items-center gap-3">
          {details === 'none' ? (
            <p className="flex-1 text-sm font-medium text-white/80">{t('receipts.noExpense')}</p>
          ) : (
            <>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm truncate">{details.title}</p>
                <p className="text-xs text-white/70 font-medium">{details.amount} · {details.date}</p>
              </div>
              {onOpenExpense && (
                <button onClick={onOpenExpense} className="shrink-0 px-3 py-2 rounded-xl bg-white text-slate-900 text-xs font-bold">
                  {t('receipts.openExpense')}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </motion.div>,
    document.body,
  );
}

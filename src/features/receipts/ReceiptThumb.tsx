import { useEffect, useRef, useState } from 'react';
import { FileText, ImageOff } from 'lucide-react';
import type { Receipt } from '../../shared/types';
import { openReceipt } from './receiptService';

/**
 * A receipt's small picture in the grid. It loads only once it scrolls into view, and the phone keeps
 * the copy (receiptService), so opening the grid again costs nothing. PDFs show an icon.
 */
export default function ReceiptThumb({ receipt }: { receipt: Receipt }) {
  const box = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const isPdf = receipt.type === 'application/pdf';

  useEffect(() => {
    if (isPdf || !box.current) return;
    if (typeof IntersectionObserver === 'undefined') { setVisible(true); return; }
    const watcher = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setVisible(true); watcher.disconnect(); }
    }, { rootMargin: '200px' });
    watcher.observe(box.current);
    return () => watcher.disconnect();
  }, [isPdf]);

  useEffect(() => {
    if (!visible) return;
    let made = '';
    let stopped = false;
    openReceipt(receipt.id)
      .then(blob => { if (!stopped) { made = URL.createObjectURL(blob); setUrl(made); } })
      .catch(() => { if (!stopped) setFailed(true); });
    return () => { stopped = true; if (made) URL.revokeObjectURL(made); };
  }, [visible, receipt.id]);

  return (
    <div ref={box} className="aspect-square w-full rounded-xl overflow-hidden bg-background border border-card-border flex items-center justify-center text-muted">
      {isPdf ? <FileText size={26} />
        : url ? <img src={url} alt="" className="w-full h-full object-cover" />
        : failed ? <ImageOff size={20} />
        : <div className="w-full h-full animate-pulse bg-card-border/40" />}
    </div>
  );
}

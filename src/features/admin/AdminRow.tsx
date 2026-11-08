import { useEffect, useState } from 'react';
import { ShieldCheck, ChevronRight } from 'lucide-react';
import { useI18n } from '../../shared/i18n';
import LazyPart from '../../shared/components/LazyPart';
import { AdminPanel } from '../../app/lazyParts';
import { checkIsAdmin, rememberedIsAdmin } from './adminService';

/**
 * Profile row, shown only to the admin. It is part of the main app so it appears together with the
 * other rows; the admin screen it opens downloads on its own (lazyParts) the first time it is needed.
 */
export default function AdminRow({ uid }: { uid: string }) {
  const { t } = useI18n();
  const [isAdmin, setIsAdmin] = useState(() => rememberedIsAdmin(uid));
  const [open, setOpen] = useState(false);
  // Kept mounted after the first open so the closing animation can play
  const [opened, setOpened] = useState(false);

  useEffect(() => { checkIsAdmin(uid).then(setIsAdmin); }, [uid]);

  if (!isAdmin) return null;

  return (
    <>
      <button
        onClick={() => { setOpened(true); setOpen(true); }}
        className="w-full bg-card p-6 rounded-3xl shadow-sm border border-card-border flex items-center gap-3 text-left transition-colors hover:border-indigo-500/40"
      >
        <div className="w-10 h-10 shrink-0 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl flex items-center justify-center text-indigo-600 dark:text-indigo-400">
          <ShieldCheck size={20} />
        </div>
        <h3 className="flex-1 min-w-0 font-bold text-foreground">{t('admin.title')}</h3>
        <ChevronRight size={20} className="text-muted shrink-0" />
      </button>
      {opened && (
        <LazyPart fallback={null}>
          <AdminPanel open={open} onClose={() => setOpen(false)} />
        </LazyPart>
      )}
    </>
  );
}

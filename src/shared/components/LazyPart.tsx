import { ReactNode, Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import ErrorBoundary from './ErrorBoundary';
import { useI18n } from '../i18n';
import { cn } from '../lib/utils';

/** Shown while a part of the app downloads. Usually for under a second, or not at all after the warm up. */
export function LoadingSpot({ className }: { className?: string }) {
  return (
    <div role="status" className={cn('flex items-center justify-center py-16', className)}>
      <Loader2 size={28} className="animate-spin text-indigo-600 dark:text-indigo-400" />
    </div>
  );
}

/** Shown in place of a part that couldn't download (offline, or a new version went live). The rest of the app keeps working. */
function LoadFailed() {
  const { t } = useI18n();
  return (
    <div role="alert" className="flex flex-col items-center gap-3 py-10 px-6 text-center">
      <p className="text-sm font-semibold text-foreground">{t('crash.title')}</p>
      <button
        onClick={() => window.location.reload()}
        className="px-5 py-2.5 rounded-2xl bg-indigo-600 text-white text-sm font-bold"
      >
        {t('crash.reload')}
      </button>
    </div>
  );
}

/**
 * Wraps a part that loads on its own (see src/app/lazyParts.ts): a spinner while it downloads,
 * and a small message with Reload if it can't.
 */
export default function LazyPart({ children, fallback, quietOnError = false }: {
  children: ReactNode;
  fallback?: ReactNode;
  /** Show nothing if it can't load, for parts most people never see */
  quietOnError?: boolean;
}) {
  return (
    <ErrorBoundary fallback={quietOnError ? null : <LoadFailed />}>
      <Suspense fallback={fallback === undefined ? <LoadingSpot /> : fallback}>{children}</Suspense>
    </ErrorBoundary>
  );
}

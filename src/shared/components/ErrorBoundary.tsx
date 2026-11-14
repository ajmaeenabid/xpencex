import { Component, ReactNode } from 'react';
import { reportError } from '../lib/errorReports';
import { useI18n } from '../i18n';

interface Props {
  children: ReactNode;
  /** What to show instead of the broken part. Defaults to a full-screen message with a Reload button. */
  fallback?: ReactNode;
}

/**
 * Catches a crash while drawing part of the screen, so one bad piece (e.g. an odd AI reply)
 * shows a message instead of blanking the whole app.
 */
export default class ErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error('Display error:', error);
    reportError(error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    if (this.props.fallback !== undefined) return this.props.fallback;
    return <CrashScreen />;
  }
}

function CrashScreen() {
  const { t } = useI18n();
  return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background text-foreground">
        <div className="max-w-sm text-center space-y-4">
          <h1 className="text-xl font-bold">{t('crash.title')}</h1>
          <p className="text-sm text-muted font-medium">{t('crash.body')}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-3 rounded-2xl bg-indigo-600 text-white text-sm font-bold"
          >
            {t('crash.reload')}
          </button>
        </div>
      </div>
  );
}

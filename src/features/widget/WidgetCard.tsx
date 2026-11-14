import { useState } from 'react';
import { LayoutGrid } from 'lucide-react';
import { useAuth } from '../../app/App';
import { useI18n } from '../../shared/i18n';
import { cn } from '../../shared/lib/utils';
import { isNative } from '../../shared/lib/nativeApp';
import { setWidgetHidden, widgetHidden } from './widget';

/** Profile: how to add the home screen widget, and "Hide amounts" (off unless turned on) */
export default function WidgetCard({ onHiddenChange }: { onHiddenChange: () => void }) {
  const { user } = useAuth();
  const { t } = useI18n();
  const [hide, setHide] = useState(() => (user ? widgetHidden(user.uid) : false));
  if (!isNative() || !user) return null;

  const toggle = () => {
    setWidgetHidden(user.uid, !hide);
    setHide(!hide);
    onHiddenChange();
  };

  return (
    <div className="bg-card p-6 rounded-3xl shadow-sm border border-card-border space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-500/10 rounded-xl flex items-center justify-center text-indigo-600 dark:text-indigo-400"><LayoutGrid size={20} /></div>
        <div>
          <h3 className="font-bold text-foreground">{t('widget.title')}</h3>
          <p className="text-xs text-muted font-medium">{t('widget.howTo')}</p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3">
        <span>
          <span className="block text-sm font-semibold text-foreground">{t('widget.hide')}</span>
          <span className="block text-xs text-muted font-medium">{t('widget.hideHint')}</span>
        </span>
        <button
          role="switch"
          aria-checked={hide}
          aria-label={t('widget.hide')}
          onClick={toggle}
          className={cn('relative shrink-0 w-12 h-7 rounded-full transition-colors', hide ? 'bg-indigo-600' : 'bg-background border border-card-border')}
        >
          <span className={cn('absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-all', hide ? 'left-6' : 'left-1')} />
        </button>
      </div>
    </div>
  );
}

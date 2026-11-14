import { useEffect } from 'react';
import { registerPlugin } from '@capacitor/core';
import { useAuth } from '../../app/App';
import { MAJOR_CURRENCIES } from '../../shared/constants';
import { useI18n } from '../../shared/i18n';
import { isNative } from '../../shared/lib/nativeApp';

// The home screen widget (android/app/src/main/java/com/xpence/app/XpencesWidget.java), chosen 2026-11-11:
// today's spending, this month against the budget, and "+ Add". The app sends it finished words and amounts in
// its language. "Hide amounts" (Profile, off by default) shows dots instead; it is kept on this phone only.

interface WidgetBridge {
  update(data: {
    today: string; month: string; budget: string; percent: number; hide: boolean;
    todayLabel: string; monthLabel: string; addLabel: string; openLabel: string;
  }): Promise<void>;
  clear(): Promise<void>;
}
const bridge = registerPlugin<WidgetBridge>('WidgetBridge');

const hideKey = (uid: string) => `xpences-widget-hide:${uid}`;
export const widgetHidden = (uid: string) => {
  try { return localStorage.getItem(hideKey(uid)) === '1'; } catch { return false; }
};
export const setWidgetHidden = (uid: string, hide: boolean) => {
  try { if (hide) localStorage.setItem(hideKey(uid), '1'); else localStorage.removeItem(hideKey(uid)); } catch { /* not kept */ }
};

/** The words the widget shows for these numbers (plain, so it is tested) */
export function widgetText(today: number, month: number, budget: number, symbol: string, t: (k: 'widget.ofBudget' | 'widget.noBudget', v?: Record<string, string>) => string) {
  const money = (n: number) => `${symbol}${Math.round(n).toLocaleString()}`;
  return {
    today: money(today),
    month: money(month),
    budget: budget > 0 ? t('widget.ofBudget', { budget: money(budget) }) : t('widget.noBudget'),
    percent: budget > 0 ? Math.round((month / budget) * 100) : -1,
  };
}

/** Keeps the widget up to date with Home's numbers (Home stays open in the background) */
export function useWidgetSync(today: number, month: number, budget: number, hideVersion = 0) {
  const { user, profile } = useAuth();
  const { t } = useI18n();
  const symbol = MAJOR_CURRENCIES.find(c => c.code === profile?.currency)?.symbol || '৳';
  useEffect(() => {
    if (!isNative() || !user) return;
    const text = widgetText(today, month, budget, symbol, t);
    bridge.update({
      ...text,
      hide: widgetHidden(user.uid),
      todayLabel: t('widget.today'), monthLabel: t('widget.month'), addLabel: t('widget.add'), openLabel: t('widget.open'),
    }).catch(err => console.error('Could not update the widget', err));
  }, [user?.uid, today, month, budget, symbol, t, hideVersion]);
}

/** Signing out: the widget stops showing this person's numbers */
export async function clearWidget() {
  if (!isNative()) return;
  await bridge.clear().catch(() => {});
}

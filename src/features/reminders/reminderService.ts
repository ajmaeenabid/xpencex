import { isNative } from '../../shared/lib/nativeApp';
import type { TFunction } from '../../shared/i18n';
import type { PlannedReminder, ReminderText } from './reminders';

// Puts the planned reminders on the phone (Capacitor Local Notifications). Only in the installed app.
// Planning again replaces everything planned before, so the list always matches the latest data.

const CHANNEL = 'reminders';
// INEXACT: every reminder is scheduled with isExactNotification: false. The plugin otherwise treats each one
// as exact and, since the app has no exact-alarm permission (removed in AndroidManifest.xml, Google Play
// limits it), opens the "Alarms & reminders" settings screen and waits there, so nothing gets scheduled.
// Inexact reminders come within about an hour of their time on Android 12+.
const BUDGET_IDS = { 80: 9080, 100: 9100 } as const;
const SHORTFALL_ID = 9200;

/** Sent on window when the person allows notifications in the app */
export const REMINDERS_ALLOWED = 'xpences-reminders-allowed';

// Handed back inside a list: a Capacitor plugin can't be returned from an async function on its own,
// because awaiting it asks it for .then(), which Capacitor answers with "not implemented" (every call failed)
const plugin = async () => [(await import('@capacitor/local-notifications')).LocalNotifications] as const;

/** Whether reminders may show. `ask` shows Android's question when it hasn't been answered yet. */
export async function remindersAllowed(ask: boolean): Promise<boolean> {
  if (!isNative()) return false;
  try {
    const [ln] = await plugin();
    let { display } = await ln.checkPermissions();
    if (display !== 'granted' && ask && display !== 'denied') {
      ({ display } = await ln.requestPermissions());
      // Just allowed: Home plans the reminders now (useReminderSync)
      if (display === 'granted') window.dispatchEvent(new Event(REMINDERS_ALLOWED));
    }
    return display === 'granted';
  } catch (err) {
    console.error('Could not check notification permission', err);
    return false;
  }
}

/** The words of a reminder, in the app's language */
export function reminderWords(text: ReminderText, t: TFunction, money: (n: number) => string, monthName: (yyyyMm: string) => string): { title: string; body: string } {
  switch (text.key) {
    case 'daily': return { title: t('remind.daily.title'), body: t('remind.daily.body') };
    case 'streak': return { title: t('remind.streak.title', { days: text.days }), body: t('remind.streak.body') };
    case 'loan': return { title: t('remind.loan.title'), body: t('remind.loan.body', { name: text.name, amount: money(text.amount) }) };
    case 'samity': return { title: t('remind.samity.title'), body: t('remind.samity.body', { name: text.name, amount: money(text.amount) }) };
    case 'goal': return { title: t('remind.goal.title', { days: text.days, name: text.name }), body: t('remind.goal.body', { name: text.name, percent: text.percent }) };
    case 'warranty': return { title: t('remind.warranty.title', { days: text.days }), body: t('remind.warranty.body', { name: text.name }) };
    case 'planned': {
      const title = text.income
        ? t(text.today ? 'remind.planned.incomeToday' : 'remind.planned.incomeTomorrow', { name: text.name })
        : t(text.today ? 'remind.planned.dueToday' : 'remind.planned.dueTomorrow', { name: text.name });
      return { title, body: t(text.income ? 'remind.planned.incomeBody' : 'remind.planned.dueBody', { amount: money(text.amount) }) };
    }
    case 'weekly': {
      const body = text.change === null
        ? t('remind.weekly.bodyFirst', { amount: money(text.spent) })
        : t(text.change <= 0 ? 'remind.weekly.bodyLess' : 'remind.weekly.bodyMore', { amount: money(text.spent), percent: Math.round(Math.abs(text.change) * 100) });
      return { title: t('remind.weekly.title'), body };
    }
    case 'monthly': return { title: t('remind.monthly.title', { month: monthName(text.month) }), body: t('remind.monthly.body') };
    case 'own': return { title: t('remind.own.notify'), body: text.text };
    case 'budget': return { title: t(text.percent === 100 ? 'remind.budget100.title' : 'remind.budget80.title'), body: t(text.percent === 100 ? 'remind.budget100.body' : 'remind.budget80.body') };
  }
}

/** Replaces every planned reminder with this list */
export async function scheduleReminders(plan: PlannedReminder[], words: (r: PlannedReminder) => { title: string; body: string }) {
  if (!isNative()) return;
  try {
    const [ln] = await plugin();
    await ln.createChannel({ id: CHANNEL, name: 'Reminders', importance: 3 }).catch(() => {});
    const pending = (await ln.getPending()).notifications.filter(n => n.id !== BUDGET_IDS[80] && n.id !== BUDGET_IDS[100] && n.id !== SHORTFALL_ID);
    if (pending.length) await ln.cancel({ notifications: pending.map(n => ({ id: n.id })) });
    if (plan.length === 0) return;
    await ln.schedule({
      notifications: plan.map(r => ({
        id: r.id,
        ...words(r),
        channelId: CHANNEL,
        schedule: { at: r.at, allowWhileIdle: true },
        // See INEXACT: without this the plugin waits on a settings screen and schedules nothing
        isExactNotification: false,
        extra: { tab: r.tab },
      })),
    });
  } catch (err) {
    console.error('Could not schedule reminders', err);
  }
}

/** Sends the budget alert straight away */
export async function sendBudgetAlert(percent: 80 | 100, words: { title: string; body: string }) {
  if (!isNative()) return;
  try {
    const [ln] = await plugin();
    await ln.schedule({ notifications: [{ id: BUDGET_IDS[percent], ...words, channelId: CHANNEL, schedule: { at: new Date(Date.now() + 1000) }, isExactNotification: false, extra: { tab: 'home' } }] });
  } catch (err) {
    console.error('Could not send the budget alert', err);
  }
}

/** Sends the "money may run short" alert straight away */
export async function sendShortfallAlert(words: { title: string; body: string }) {
  if (!isNative()) return;
  try {
    const [ln] = await plugin();
    await ln.schedule({ notifications: [{ id: SHORTFALL_ID, ...words, channelId: CHANNEL, schedule: { at: new Date(Date.now() + 1000) }, isExactNotification: false, extra: { tab: 'home' } }] });
  } catch (err) {
    console.error('Could not send the low money alert', err);
  }
}

/** Removes every reminder (all switched off, or logging out) */
export async function clearReminders() {
  if (!isNative()) return;
  try {
    const [ln] = await plugin();
    const pending = (await ln.getPending()).notifications;
    if (pending.length) await ln.cancel({ notifications: pending.map(n => ({ id: n.id })) });
  } catch {
    // nothing scheduled
  }
}

/** Tapping a reminder opens its screen */
export async function onReminderTap(open: (tab: string) => void): Promise<() => void> {
  if (!isNative()) return () => {};
  const [ln] = await plugin();
  const handle = await ln.addListener('localNotificationActionPerformed', (e) => {
    const tab = e.notification.extra?.tab;
    if (typeof tab === 'string') open(tab);
  });
  return () => { handle.remove(); };
}

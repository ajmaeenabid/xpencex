// Agent space: every action the AI prepares becomes a task. It waits for the user's Confirm, then stays as
// history. Plain rules, no database calls, so they can be tested (the saves are in taskService.ts).
// The owner's choices (2026-11-16): agent actions only (expense and income cards stay in chat), waiting tasks
// expire after 7 days, the newest 100 finished tasks are kept, and there is no "Confirm all".

import type { AgentAction } from './actions';
import { containsSecret } from '../../../shared/lib/sensitiveData';
import { maskSensitive } from '../../../shared/lib/smsParser';

export type TaskStatus = 'waiting' | 'done' | 'cancelled' | 'expired';

export interface AgentTask {
  id: string;
  uid: string;
  chatId: string; // the chat it came from, for "Go to chat"
  messageId: string; // the short line in that chat
  title: string; // what the AI said the card is for, in the user's language
  action: AgentAction;
  status: TaskStatus;
  createdAt: string;
  doneAt?: string;
  result?: string; // what was done ("Done. I moved ...") or why it couldn't be
  replyLang?: 'en' | 'bn';
  saved?: boolean; // something was really saved (false when, say, the category already existed)
}

export const TASK_EXPIRY_DAYS = 7;
export const MAX_FINISHED_TASKS = 100;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The card's line: the AI's words, with codes blocked and numbers hidden like every other text, at most 200 characters */
export function taskTitle(aiWords: string | undefined, fallback: string): string {
  const words = (aiWords || '').trim().replace(/\s+/g, ' ');
  if (!words || containsSecret(words)) return fallback;
  return maskSensitive(words).slice(0, 200);
}

/** Waiting tasks older than a week: they go to history as Expired */
export const tasksToExpire = (tasks: AgentTask[], now = new Date()) =>
  tasks.filter(t => t.status === 'waiting' && now.getTime() - new Date(t.createdAt).getTime() > TASK_EXPIRY_DAYS * DAY_MS);

const finishedAt = (t: AgentTask) => new Date(t.doneAt || t.createdAt).getTime();

/** Waiting ones oldest first (the order they were asked), finished ones newest first */
export function splitTasks(tasks: AgentTask[]): { waiting: AgentTask[]; finished: AgentTask[] } {
  const waiting = tasks.filter(t => t.status === 'waiting').sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const finished = tasks.filter(t => t.status !== 'waiting').sort((a, b) => finishedAt(b) - finishedAt(a));
  return { waiting, finished };
}

/** Finished tasks beyond the newest 100, to delete */
export const tasksToPrune = (tasks: AgentTask[]) => splitTasks(tasks).finished.slice(MAX_FINISHED_TASKS);

/**
 * Where the result of a finished task can be seen (a place id from Home's search), for the
 * "See it" button in chat and Agent space. None for opening a screen, which already went there.
 */
export function placeForAction(action: AgentAction): string | undefined {
  switch (action.kind) {
    case 'transfer': return 'accounts';
    case 'debt': return 'debts';
    case 'editExpense': case 'deleteExpense': case 'editIncome': case 'deleteIncome': return 'expenses';
    case 'budget': return action.category ? 'categoryBudgets' : 'budget';
    case 'removeBudget': return 'categoryBudgets';
    case 'addCategory': return 'categories';
    case 'recurring': case 'stopRecurring': return 'recurring';
    case 'reminder': return 'reminders';
    case 'planned': return 'planned';
    case 'shopping': return 'shopping';
    case 'settings': {
      const c = action.changes;
      if (c.currency) return 'currency';
      if (c.monthStart) return 'monthStart';
      if (c.reminders || c.reminderTime) return 'reminders';
      if (c.language) return 'language';
      return undefined; // dark mode shows everywhere at once
    }
    case 'createGoal': case 'addToGoal': case 'takeFromGoal': case 'deleteGoal': return 'funds';
    case 'createSamity': case 'payRound': case 'undoRound': case 'samityPayout': case 'undoPayout': case 'deleteSamity': return 'samity';
    default: return undefined;
  }
}

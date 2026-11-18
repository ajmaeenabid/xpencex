// Saving Agent space tasks (firestore.rules: tasks). Every write goes through saved(), so nothing waits forever offline.
import { useEffect, useState } from 'react';
import { collection, deleteDoc, doc, onSnapshot, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { db } from '../../../shared/firebase';
import { saved } from '../../../shared/lib/offlineSave';
import type { AgentAction } from './actions';
import { AgentTask, TaskStatus, tasksToExpire, tasksToPrune } from './tasks';

/** This person's tasks, kept live. Week-old waiting tasks are marked Expired, and history is kept to 100. */
export function useTasks(uid: string | undefined) {
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      query(collection(db, 'tasks'), where('uid', '==', uid)),
      snap => setTasks(snap.docs.map(d => ({ id: d.id, ...d.data() } as AgentTask))),
      err => console.error('Could not load tasks', err),
    );
  }, [uid]);

  // Tidy up once the list is in: each write changes the list, which runs this again with less to do
  useEffect(() => {
    tasksToExpire(tasks).forEach(t => finishTask(t, 'expired').catch(() => {}));
    tasksToPrune(tasks).forEach(t => saved(deleteDoc(doc(db, 'tasks', t.id))).catch(() => {}));
  }, [tasks]);

  return tasks;
}

/** A new waiting task. The id is made first, so the chat line can point at it straight away. */
export function newTaskId() {
  return doc(collection(db, 'tasks')).id;
}

export function createTask(id: string, task: { uid: string; chatId: string; messageId: string; title: string; action: AgentAction; replyLang?: 'en' | 'bn' }) {
  // The database refuses empty values, and actions leave unused fields out anyway
  const action = JSON.parse(JSON.stringify(task.action));
  return saved(setDoc(doc(db, 'tasks', id), {
    uid: task.uid, chatId: task.chatId, messageId: task.messageId, title: task.title, action,
    status: 'waiting', createdAt: new Date().toISOString(), ...(task.replyLang && { replyLang: task.replyLang }),
  }));
}

/** Done, cancelled or expired: written once, never changed again */
export function finishTask(task: AgentTask, status: Exclude<TaskStatus, 'waiting'>, result?: string, wasSaved?: boolean) {
  return saved(updateDoc(doc(db, 'tasks', task.id), {
    status, doneAt: new Date().toISOString(),
    ...(result && { result: result.slice(0, 300) }),
    ...(wasSaved !== undefined && { saved: wasSaved }),
  }));
}

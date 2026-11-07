import { useEffect, useRef, useState } from 'react';
import { User } from 'firebase/auth';
import { collection, deleteDoc, doc, onSnapshot, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { db } from '../../shared/firebase';
import { Chat, ChatMessage } from '../../shared/types';
import { TFunction, TKey } from '../../shared/i18n';
import { containsSecret } from '../../shared/lib/sensitiveData';
import { confirmDialog } from '../../shared/components/Dialog';
import { packMessages, unpackMessages } from './versions';
import { canPinMore, planNewChat } from './chatHistory';
import { LiveState } from './liveSession';

const newChatId = () => doc(collection(db, 'chats')).id;

/** Saved chats: loading, saving after every change, the 20-chat limit, pins, rename, delete, and switching chats */
export function useChatHistory({
  user, t, messages, setMessages, setInput, setLimitNote, setLimitNoteVars, resetChatExtras, loading, isRecording, liveState,
}: {
  user: User | null;
  t: TFunction;
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  setInput: (text: string) => void;
  setLimitNote: (note: TKey | null) => void;
  setLimitNoteVars: (vars: Record<string, string | number> | undefined) => void;
  resetChatExtras: () => void;
  loading: boolean;
  isRecording: boolean;
  liveState: LiveState | null;
}) {
  const [chats, setChats] = useState<Chat[]>([]);
  const [chatsLoaded, setChatsLoaded] = useState(false);
  // The chat whose "won't be saved" message was closed; it only ever goes with the X
  const [notSavedClosedFor, setNotSavedClosedFor] = useState<string | null>(null);
  const [pinFullNote, setPinFullNote] = useState(false);
  const [activeId, setActiveId] = useState(newChatId);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  // Chats that already exist in Firestore, so the title is only set on the first save
  const savedIdsRef = useRef<Set<string>>(new Set());
  // Set when messages were just loaded from history, so opening a chat doesn't re-save it
  const skipSaveRef = useRef(false);

  // This user's saved chats, newest first (sorted here to avoid needing a composite index)
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'chats'), where('uid', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Chat));
      list.forEach(c => savedIdsRef.current.add(c.id));
      // Remove any message holding an OTP / PIN from saved chats (e.g. saved before this protection existed)
      list.forEach(c => {
        const all = c.messages || [];
        const clean = all.filter(m => !containsSecret(m.content || ''));
        if (clean.length === all.length) return;
        c.messages = clean;
        const ref = doc(db, 'chats', c.id);
        (clean.length ? updateDoc(ref, { messages: JSON.parse(JSON.stringify(clean)) }) : deleteDoc(ref))
          .catch(err => console.error('Could not remove a sensitive message', err));
      });
      setChats(list.sort((a, b) => b.updatedAt - a.updatedAt));
      setChatsLoaded(true);
    }, (err) => {
      console.error('Could not load chats', err);
      setSaveError(t('chat.loadError', { code: err.code || 'unknown' }));
    });
    return unsubscribe;
  }, [user]);

  // Whether a chat that isn't saved yet can be, and what would have to go to make room
  const newChatPlan = planNewChat(chats.filter(c => c.id !== activeId));
  const activeIsSaved = savedIdsRef.current.has(activeId);

  const saveChat = () => {
    if (!user || messages.length === 0) return;
    // Never write an OTP / PIN to the database, not even briefly; it's removed first, then this saves again
    if (messages.some(m => containsSecret(m.content || ''))) return;
    const isNew = !savedIdsRef.current.has(activeId);
    if (isNew && (!chatsLoaded || !newChatPlan.canSave)) return;
    const firstUser = messages.find(m => m.role === 'user')?.content || t('chat.newChat');
    savedIdsRef.current.add(activeId);
    setDoc(doc(db, 'chats', activeId), {
      uid: user.uid,
      messages: packMessages(messages),
      updatedAt: Date.now(),
      ...(isNew && { title: firstUser.length > 40 ? `${firstUser.slice(0, 40)}…` : firstUser, createdAt: Date.now() }),
    }, { merge: true })
      .then(() => {
        setSaveError('');
        if (isNew) removeToMakeRoom(newChatPlan.remove);
      })
      .catch(err => {
        console.error('Could not save chat', err);
        setSaveError(err?.code === 'permission-denied'
          ? t('chat.rulesError')
          : t('chat.saveError', { code: err?.code || 'unknown' }));
      });
  };

  // Only runs once the new chat is safely saved, so nothing is lost if saving fails
  const removeToMakeRoom = (remove: Chat[]) => {
    if (!remove.length) return;
    remove.forEach(chat => {
      savedIdsRef.current.delete(chat.id);
      deleteDoc(doc(db, 'chats', chat.id)).catch(err => console.error('Could not remove an old chat', err));
    });
    if (remove.length === 1) {
      setLimitNoteVars({ title: remove[0].title });
      setLimitNote('chat.removedOne');
    } else {
      setLimitNoteVars({ count: remove.length });
      setLimitNote('chat.removedMany');
    }
  };

  // Save the conversation after every change
  useEffect(() => {
    if (skipSaveRef.current) { skipSaveRef.current = false; return; }
    saveChat();
  }, [messages]);

  // A chat that couldn't be saved gets saved as soon as there's room, or once the history has loaded
  useEffect(() => {
    if (chatsLoaded && newChatPlan.canSave && !savedIdsRef.current.has(activeId)) saveChat();
  }, [chatsLoaded, newChatPlan.canSave]);

  const togglePin = (chat: Chat) => {
    if (!chat.pinned && !canPinMore(chats)) {
      setPinFullNote(true);
      return;
    }
    setPinFullNote(false);
    updateDoc(doc(db, 'chats', chat.id), { pinned: !chat.pinned })
      .catch(err => console.error('Could not pin chat', err));
  };

  const startNewChat = () => {
    if (loading || isRecording || liveState) return;
    skipSaveRef.current = messages.length > 0;
    setMessages([]);
    setActiveId(newChatId());
    setInput('');
    setSidebarOpen(false);
    resetChatExtras();
  };

  const openChat = (chat: Chat) => {
    if (chat.id === activeId) { setSidebarOpen(false); return; }
    if (loading || isRecording || liveState) return;
    skipSaveRef.current = true;
    setActiveId(chat.id);
    setMessages(unpackMessages(chat.messages || []));
    setInput('');
    setSidebarOpen(false);
    resetChatExtras();
  };

  const commitRename = async () => {
    const id = renamingId;
    const title = renameValue.trim();
    setRenamingId(null);
    if (!id || !title || title === chats.find(c => c.id === id)?.title) return;
    try { await updateDoc(doc(db, 'chats', id), { title: title.slice(0, 80) }); }
    catch (err) { console.error('Could not rename chat', err); }
  };

  const deleteChat = async (chat: Chat) => {
    if (!(await confirmDialog(t('chat.confirmDelete', { title: chat.title }), { danger: true }))) return;
    try {
      await deleteDoc(doc(db, 'chats', chat.id));
      savedIdsRef.current.delete(chat.id);
      if (chat.id === activeId) {
        skipSaveRef.current = messages.length > 0;
        setMessages([]);
        setActiveId(newChatId());
        resetChatExtras();
      }
    } catch (err) { console.error('Could not delete chat', err); }
  };

  return {
    chats, chatsLoaded, activeId, activeIsSaved, newChatPlan, saveError, pinFullNote, notSavedClosedFor, setNotSavedClosedFor,
    sidebarOpen, setSidebarOpen, renamingId, setRenamingId, renameValue, setRenameValue,
    togglePin, startNewChat, openChat, commitRename, deleteChat,
  };
}

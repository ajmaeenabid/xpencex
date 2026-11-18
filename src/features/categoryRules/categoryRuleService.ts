// Saving category rules (firestore.rules: categoryRules). Every save goes through saved(), so nothing waits forever offline.
import { useEffect, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import { db } from '../../shared/firebase';
import { categoryLabel } from '../../shared/i18n';
import type { TFunction } from '../../shared/i18n';
import { saved } from '../../shared/lib/offlineSave';
import { alertDialog, confirmDialog } from '../../shared/components/Dialog';
import {
  CategoryRule, CorrectionMemory, MAX_RULES, NO_CORRECTIONS, cleanWords, declineOffer, matchRule, normalizeWords, recordCorrection, ruleWordsFrom,
} from './categoryRules';

export function useCategoryRules(uid: string | undefined) {
  const [rules, setRules] = useState<CategoryRule[]>([]);
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      query(collection(db, 'categoryRules'), where('uid', '==', uid)),
      snap => setRules(snap.docs.map(d => ({ id: d.id, ...d.data() } as CategoryRule))),
      err => console.error('Could not load category rules', err),
    );
  }, [uid]);
  return rules;
}

export function addCategoryRule(uid: string, words: string, category: string) {
  const clean = cleanWords(words);
  if (!clean) return Promise.reject(new Error('words'));
  return saved(addDoc(collection(db, 'categoryRules'), { uid, words: clean, category: category.slice(0, 50), createdAt: new Date().toISOString() }));
}

export function updateCategoryRule(id: string, words: string, category: string) {
  const clean = cleanWords(words);
  if (!clean) return Promise.reject(new Error('words'));
  return saved(updateDoc(doc(db, 'categoryRules', id), { words: clean, category: category.slice(0, 50) }));
}

export const deleteCategoryRule = (id: string) => saved(deleteDoc(doc(db, 'categoryRules', id)));

// Corrections are only counted on this phone: they decide when to ask, and the rule itself is kept on the account
const memoryKey = (uid: string) => `xpences-category-corrections:${uid}`;

function loadMemory(uid: string): CorrectionMemory {
  try {
    const saved = JSON.parse(localStorage.getItem(memoryKey(uid)) || 'null');
    return saved?.seen && Array.isArray(saved.declined) ? saved : NO_CORRECTIONS;
  } catch {
    return NO_CORRECTIONS;
  }
}

function saveMemory(uid: string, memory: CorrectionMemory) {
  try { localStorage.setItem(memoryKey(uid), JSON.stringify(memory)); } catch { /* counted again next time */ }
}

/** Call after someone moves an entry to another category. On the second time, asks whether to make it a rule. */
export async function noteCategoryCorrection(uid: string, title: string, category: string, rules: CategoryRule[], t: TFunction) {
  const words = ruleWordsFrom(title);
  if (!words || matchRule(title, rules)?.category.toLowerCase() === category.toLowerCase()) return;
  const same = rules.find(r => normalizeWords(r.words) === normalizeWords(words));
  if (!same && rules.length >= MAX_RULES) return;

  const { memory, offer } = recordCorrection(loadMemory(uid), words, category);
  if (!offer) { saveMemory(uid, memory); return; }
  const yes = await confirmDialog(t('rules.offer', { words, category: categoryLabel(t, category) }), { okLabel: t('rules.offerYes') });
  saveMemory(uid, yes ? memory : declineOffer(memory, words, category));
  if (!yes) return;
  try {
    await (same ? updateCategoryRule(same.id, words, category) : addCategoryRule(uid, words, category));
  } catch (err) {
    console.error('Could not save the category rule:', err);
    alertDialog(t('rules.error'));
  }
}

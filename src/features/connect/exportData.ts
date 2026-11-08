import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../shared/firebase';

/** All of this user's documents in one collection, read fresh when an export is tapped */
export async function loadMine<T>(uid: string, collectionName: string): Promise<T[]> {
  const snap = await getDocs(query(collection(db, collectionName), where('uid', '==', uid)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as T);
}

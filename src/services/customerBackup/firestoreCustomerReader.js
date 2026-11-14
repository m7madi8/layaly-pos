import {
  collection,
  documentId,
  getDocsFromServer,
  limit,
  orderBy,
  query,
  startAfter,
} from 'firebase/firestore';
import { db, isDemoMode, isFirebaseConfigured } from '../../firebaseClient';
import { backupError } from './backupModel';

/**
 * قراءة خادمية مباشرة لمجموعة العملاء. لا تستخدم حالة React ولا دليل الصفحات المحمّل.
 */
export function createFirestoreCustomerPageReader(tenantUid) {
  return async ({ pageSize, cursor }) => {
    if (isDemoMode || !isFirebaseConfigured || !db) {
      throw backupError(
        'backup-incomplete',
        'قراءة Firestore غير متاحة في وضع التجربة أو قبل ضبط المشروع.'
      );
    }
    const base = collection(db, 'users', tenantUid, 'customers');
    const q = cursor
      ? query(base, orderBy(documentId()), startAfter(cursor), limit(pageSize))
      : query(base, orderBy(documentId()), limit(pageSize));
    const snap = await getDocsFromServer(q);
    const last = snap.docs.length ? snap.docs[snap.docs.length - 1] : null;
    return {
      docs: snap.docs.map((row) => ({ id: row.id, data: row.data() })),
      cursor: last,
      lastId: last ? last.id : null,
    };
  };
}

export function currentFirebaseProjectId() {
  return String(process.env.REACT_APP_FIREBASE_PROJECT_ID || '').trim();
}

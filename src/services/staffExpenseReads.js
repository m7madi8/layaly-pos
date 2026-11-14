import { db, collection, query, where, getDocs } from '../firebaseClient';

/** Staff-scoped expenses (payroll, benefits, linked operating) — avoids full expenses collection scans. */
export async function listExpensesForStaffMember(uid, staffMemberId) {
  const sid = String(staffMemberId || '').trim();
  if (!uid || !sid) return [];
  const q = query(collection(db, 'users', uid, 'expenses'), where('staffMemberId', '==', sid));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
import {
  db,
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  serverTimestamp,
  query,
  orderBy,
} from '../firebaseClient';
import {
  DEFAULT_CAFE_STAFF,
  normalizeStaffName,
  staffNameKey,
  roundMoney,
} from '../utils/employeeBenefitAccounting';

const staffCol = (uid) => collection(db, 'users', uid, 'staffMembers');
const staffRef = (uid, id) => doc(db, 'users', uid, 'staffMembers', id);

export async function listStaffMembers(uid) {
  const snap = await getDocs(query(staffCol(uid), orderBy('name', 'asc')));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * يضيف الموظفين الافتراضيين مرة واحدة — يطابق بالاسم دون تكرار.
 */
export async function ensureDefaultStaffMembers(uid) {
  const existing = await listStaffMembers(uid);
  const byKey = new Map(existing.map((s) => [staffNameKey(s.name), s]));

  for (const row of DEFAULT_CAFE_STAFF) {
    const name = normalizeStaffName(row.name);
    const key = staffNameKey(name);
    const limit = roundMoney(row.benefitLimitILS);
    const found = byKey.get(key);
    if (found) {
      if (found.benefitLimitILS == null || found.benefitLimitILS === '') {
        await updateDoc(staffRef(uid, found.id), {
          benefitLimitILS: limit,
          active: true,
          updatedAt: serverTimestamp(),
        });
      }
      continue;
    }
    const ref = await addDoc(staffCol(uid), {
      name,
      benefitLimitILS: limit,
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    byKey.set(key, { id: ref.id, name, benefitLimitILS: limit });
  }

  return listStaffMembers(uid);
}

export async function updateStaffBenefitLimit(uid, staffId, benefitLimitILS) {
  const limit = roundMoney(benefitLimitILS);
  if (!(limit > 0)) throw new Error('الحد يجب أن يكون أكبر من صفر');
  await updateDoc(staffRef(uid, staffId), {
    benefitLimitILS: limit,
    updatedAt: serverTimestamp(),
  });
}

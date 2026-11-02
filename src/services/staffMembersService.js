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
  writeBatch,
} from '../firebaseClient';
import {
  DEFAULT_CAFE_STAFF,
  normalizeStaffName,
  staffNameKey,
  roundMoney,
  uniqueStaffMembersByName,
} from '../utils/employeeBenefitAccounting';

const staffCol = (uid) => collection(db, 'users', uid, 'staffMembers');
const staffRef = (uid, id) => doc(db, 'users', uid, 'staffMembers', id);

const ensureInflight = new Map();

function staffCreatedMs(staff) {
  if (staff?.createdAt?.toMillis) return staff.createdAt.toMillis();
  if (staff?.createdAtMs) return Number(staff.createdAtMs) || 0;
  return 0;
}

export async function listStaffMembers(uid) {
  const snap = await getDocs(query(staffCol(uid), orderBy('name', 'asc')));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * يحذف سجلات staffMembers المكرّرة (نفس الاسم بعد التطبيع) ويبقي الأقدم أو الأكمل.
 */
export async function dedupeStaffMembers(uid) {
  const existing = await listStaffMembers(uid);
  const groups = new Map();
  for (const s of existing) {
    const key = staffNameKey(s.name);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  }

  const toDelete = [];
  for (const group of groups.values()) {
    if (group.length <= 1) continue;
    group.sort((a, b) => staffCreatedMs(a) - staffCreatedMs(b));
    const keep = uniqueStaffMembersByName(group)[0] || group[0];
    for (const s of group) {
      if (s.id !== keep.id) toDelete.push(s.id);
    }
  }

  if (toDelete.length === 0) return 0;

  const BATCH = 450;
  for (let i = 0; i < toDelete.length; i += BATCH) {
    const batch = writeBatch(db);
    for (const id of toDelete.slice(i, i + BATCH)) {
      batch.delete(staffRef(uid, id));
    }
    await batch.commit();
  }
  return toDelete.length;
}

/**
 * يضيف الموظفين الافتراضيين مرة واحدة — يطابق بالاسم دون تكرار.
 * يمنع سباق التحميل المزدوج (Strict Mode) وينظّف التكرار القديم.
 */
export async function ensureDefaultStaffMembers(uid) {
  if (!uid) return [];
  if (ensureInflight.has(uid)) return ensureInflight.get(uid);

  const job = (async () => {
    await dedupeStaffMembers(uid);
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

    await dedupeStaffMembers(uid);
    return listStaffMembers(uid);
  })();

  ensureInflight.set(uid, job);
  try {
    return await job;
  } finally {
    ensureInflight.delete(uid);
  }
}

export async function updateStaffBenefitLimit(uid, staffId, benefitLimitILS) {
  const limit = roundMoney(benefitLimitILS);
  if (!(limit > 0)) throw new Error('الحد يجب أن يكون أكبر من صفر');
  await updateDoc(staffRef(uid, staffId), {
    benefitLimitILS: limit,
    updatedAt: serverTimestamp(),
  });
}

export { uniqueStaffMembersByName };

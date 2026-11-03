import {
  db,
  collection,
  doc,
  addDoc,
  updateDoc,
  serverTimestamp,
} from '../firebaseClient';
import { normalizeStaffName, roundMoney, staffNameKey } from '../utils/employeeBenefitAccounting';
import { DEFAULT_STAFF_PERMISSIONS, normalizeStaffPermissionsPatch } from '../utils/staffPermissions';
import { listStaffMembers, dedupeStaffMembers } from './staffMembersService';
import { migrateEmployeeProfilesV1 } from './migrateEmployeeProfiles';

const staffCol = (uid) => collection(db, 'users', uid, 'staffMembers');
const staffRef = (uid, id) => doc(db, 'users', uid, 'staffMembers', id);

export async function ensureEmployeeModule(uid) {
  await dedupeStaffMembers(uid);
  await migrateEmployeeProfilesV1(uid);
  return listStaffMembers(uid);
}

export async function listEmployees(uid) {
  return listStaffMembers(uid);
}

export async function createEmployee(uid, { name, benefitLimitILS = 20, phone = '', notes = '', baseSalary = null }) {
  const normalized = normalizeStaffName(name);
  if (!normalized) throw new Error('أدخل اسم الموظف');
  const existing = await listStaffMembers(uid);
  if (existing.some((s) => staffNameKey(s.name) === staffNameKey(normalized))) {
    throw new Error('يوجد موظف بنفس الاسم');
  }
  const limit = roundMoney(benefitLimitILS);
  if (!(limit > 0)) throw new Error('حد الاستفادة يجب أن يكون أكبر من صفر');
  const ref = await addDoc(staffCol(uid), {
    name: normalized,
    benefitLimitILS: limit,
    active: true,
    status: 'active',
    phone: String(phone || '').trim(),
    notes: String(notes || '').trim(),
    baseSalary: baseSalary != null && baseSalary !== '' ? roundMoney(baseSalary) : null,
    permissions: { ...DEFAULT_STAFF_PERMISSIONS },
    profileVersion: 1,
    createdAt: serverTimestamp(),
    createdAtMs: Date.now(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateEmployee(uid, staffId, patch) {
  const data = {};
  if (patch.name != null) {
    const n = normalizeStaffName(patch.name);
    if (!n) throw new Error('اسم غير صالح');
    data.name = n;
  }
  if (patch.benefitLimitILS != null) {
    const limit = roundMoney(patch.benefitLimitILS);
    if (!(limit > 0)) throw new Error('حد الاستفادة يجب أن يكون أكبر من صفر');
    data.benefitLimitILS = limit;
  }
  if (patch.phone != null) data.phone = String(patch.phone || '').trim();
  if (patch.notes != null) data.notes = String(patch.notes || '').trim();
  if (patch.baseSalary != null) {
    data.baseSalary = patch.baseSalary === '' ? null : roundMoney(patch.baseSalary);
  }
  if (patch.active != null || patch.status != null) {
    const inactive = patch.status === 'inactive' || patch.active === false;
    data.active = !inactive;
    data.status = inactive ? 'inactive' : 'active';
  }
  if (patch.permissions != null) {
    data.permissions = normalizeStaffPermissionsPatch(patch.permissions);
  }
  data.updatedAt = serverTimestamp();
  await updateDoc(staffRef(uid, staffId), data);
}

export async function getEmployee(uid, staffId) {
  const all = await listStaffMembers(uid);
  return all.find((s) => s.id === staffId) || null;
}

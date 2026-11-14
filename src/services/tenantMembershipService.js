import {
  db,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  writeBatch,
  collection,
  query,
  where,
  getDocs,
} from '../firebaseClient';

export const TENANT_ROLES = {
  ADMIN: 'admin',
  CASHIER: 'cashier',
};

const userTenantsRef = (authUid) => doc(db, 'userTenants', authUid);
const tenantRef = (tenantId) => doc(db, 'tenants', tenantId);
const memberRef = (tenantId, authUid) => doc(db, 'tenants', tenantId, 'members', authUid);
const joinRequestRef = (tenantId, authUid) => doc(db, 'tenants', tenantId, 'joinRequests', authUid);

function mapUiRole(memberRole) {
  return memberRole === TENANT_ROLES.ADMIN ? 'admin' : 'employee';
}

/** Idempotent bootstrap for legacy single-UID cafés (data lives at users/{authUid}). */
export async function bootstrapLegacyTenantAsAdmin(authUid) {
  if (!authUid) return null;
  const tenantId = authUid;
  const tenantSnap = await getDoc(tenantRef(tenantId));
  const batch = writeBatch(db);
  if (!tenantSnap.exists()) {
    batch.set(tenantRef(tenantId), {
      schemaVersion: 1,
      primaryDataRoot: tenantId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
  batch.set(
    memberRef(tenantId, authUid),
    {
      role: TENANT_ROLES.ADMIN,
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
  batch.set(
    userTenantsRef(authUid),
    {
      tenantId,
      role: TENANT_ROLES.ADMIN,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
  await batch.commit();
  return { tenantId, role: TENANT_ROLES.ADMIN, uiRole: mapUiRole(TENANT_ROLES.ADMIN) };
}

export async function resolveTenantAuthContext(authUid) {
  if (!authUid) return null;

  const indexSnap = await getDoc(userTenantsRef(authUid));
  if (indexSnap.exists()) {
    const { tenantId, role } = indexSnap.data() || {};
    if (!tenantId) return null;
    const memSnap = await getDoc(memberRef(tenantId, authUid));
    if (!memSnap.exists() || memSnap.data()?.active !== true) return null;
    const memberRole = memSnap.data()?.role || role;
    if (String(role) !== String(memberRole)) {
      return null;
    }
    return { tenantId, role: memberRole, uiRole: mapUiRole(memberRole) };
  }

  let legacyProfile;
  try {
    legacyProfile = await getDoc(doc(db, 'users', authUid));
  } catch {
    return null;
  }
  if (!legacyProfile.exists()) {
    return null;
  }

  const tenantSnap = await getDoc(tenantRef(authUid));
  if (!tenantSnap.exists()) {
    return {
      tenantId: authUid,
      role: TENANT_ROLES.ADMIN,
      uiRole: mapUiRole(TENANT_ROLES.ADMIN),
    };
  }

  try {
    return await bootstrapLegacyTenantAsAdmin(authUid);
  } catch (err) {
    const indexAfter = await getDoc(userTenantsRef(authUid));
    if (indexAfter.exists()) {
      const { tenantId, role } = indexAfter.data() || {};
      if (!tenantId) return null;
      const memSnap = await getDoc(memberRef(tenantId, authUid));
      if (!memSnap.exists() || memSnap.data()?.active !== true) return null;
      const memberRole = memSnap.data()?.role || role;
      return { tenantId, role: memberRole, uiRole: mapUiRole(memberRole) };
    }
    console.error('Tenant bootstrap:', err);
    return {
      tenantId: authUid,
      role: TENANT_ROLES.ADMIN,
      uiRole: mapUiRole(TENANT_ROLES.ADMIN),
    };
  }
}

export async function getTenantInviteCode(tenantId) {
  const snap = await getDoc(tenantRef(tenantId));
  return snap.exists() ? String(snap.data()?.inviteCode || '').trim() : '';
}

export async function setTenantInviteCode(tenantId, inviteCode) {
  await setDoc(
    tenantRef(tenantId),
    {
      inviteCode: String(inviteCode || '').trim(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function submitCashierJoinRequest(tenantId, authUid, { inviteCode, email } = {}) {
  const tSnap = await getDoc(tenantRef(tenantId));
  if (!tSnap.exists()) throw new Error('المقهى غير موجود');
  const expected = String(tSnap.data()?.inviteCode || '').trim();
  if (!expected || expected !== String(inviteCode || '').trim()) {
    throw new Error('رمز الانضمام غير صحيح');
  }
  await setDoc(joinRequestRef(tenantId, authUid), {
    email: String(email || '').trim(),
    status: 'pending',
    createdAt: serverTimestamp(),
    createdAtMs: Date.now(),
  });
}

export async function listPendingJoinRequests(tenantId) {
  const snap = await getDocs(
    query(collection(db, 'tenants', tenantId, 'joinRequests'), where('status', '==', 'pending'))
  );
  return snap.docs.map((d) => ({ id: d.id, authUid: d.id, ...d.data() }));
}

export async function approveCashierJoinRequest(tenantId, cashierAuthUid, adminAuthUid) {
  if (!tenantId || !cashierAuthUid || !adminAuthUid) throw new Error('بيانات غير مكتملة');
  const memAdmin = await getDoc(memberRef(tenantId, adminAuthUid));
  if (!memAdmin.exists() || memAdmin.data()?.role !== TENANT_ROLES.ADMIN || memAdmin.data()?.active !== true) {
    throw new Error('صلاحية مدير فقط');
  }

  const batch = writeBatch(db);
  batch.set(memberRef(tenantId, cashierAuthUid), {
    role: TENANT_ROLES.CASHIER,
    active: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.set(userTenantsRef(cashierAuthUid), {
    tenantId,
    role: TENANT_ROLES.CASHIER,
    updatedAt: serverTimestamp(),
  });
  batch.delete(joinRequestRef(tenantId, cashierAuthUid));
  await batch.commit();
}

export async function adminLinkCashierMember(tenantId, cashierAuthUid, adminAuthUid) {
  const memAdmin = await getDoc(memberRef(tenantId, adminAuthUid));
  if (!memAdmin.exists() || memAdmin.data()?.role !== TENANT_ROLES.ADMIN) {
    throw new Error('صلاحية مدير فقط');
  }
  const batch = writeBatch(db);
  batch.set(memberRef(tenantId, cashierAuthUid), {
    role: TENANT_ROLES.CASHIER,
    active: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.set(userTenantsRef(cashierAuthUid), {
    tenantId,
    role: TENANT_ROLES.CASHIER,
    updatedAt: serverTimestamp(),
  });
  await batch.commit();
}

export function memberRoleToUiRole(memberRole) {
  return mapUiRole(memberRole);
}
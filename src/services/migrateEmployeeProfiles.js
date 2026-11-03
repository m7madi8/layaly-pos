import { db, doc, getDocs, collection, writeBatch, serverTimestamp, getDoc, setDoc } from '../firebaseClient';

const PROFILE_FLAG = 'employeeProfileV1';

/**
 * Idempotent: enrich staffMembers docs; verify employeeBenefits staffMemberId refs.
 */
export async function migrateEmployeeProfilesV1(uid) {
  if (!uid) return { migrated: 0, orphans: 0, skipped: true };

  const userRef = doc(db, 'users', uid);
  const userSnap = await getDoc(userRef);
  if (userSnap.exists() && userSnap.data()[PROFILE_FLAG]) {
    return { migrated: 0, orphans: 0, skipped: true };
  }

  const staffSnap = await getDocs(collection(db, 'users', uid, 'staffMembers'));
  const staffIds = new Set(staffSnap.docs.map((d) => d.id));
  let migrated = 0;

  const batch = writeBatch(db);
  for (const d of staffSnap.docs) {
    const data = d.data();
    const patch = {};
    if (data.active === undefined) patch.active = true;
    if (data.status === undefined) patch.status = data.active === false ? 'inactive' : 'active';
    if (data.profileVersion === undefined) patch.profileVersion = 1;
    if (Object.keys(patch).length) {
      patch.updatedAt = serverTimestamp();
      batch.update(doc(db, 'users', uid, 'staffMembers', d.id), patch);
      migrated += 1;
    }
  }
  await batch.commit();

  const benSnap = await getDocs(collection(db, 'users', uid, 'employeeBenefits'));
  let orphans = 0;
  for (const d of benSnap.docs) {
    const sid = d.data().staffMemberId;
    if (sid && !staffIds.has(sid)) orphans += 1;
  }

  await setDoc(
    userRef,
    { [PROFILE_FLAG]: true, employeeProfileMigratedAt: serverTimestamp() },
    { merge: true }
  );

  return { migrated, orphans, skipped: false };
}

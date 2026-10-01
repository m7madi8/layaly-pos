import { db, doc, collection, addDoc, updateDoc, runTransaction, serverTimestamp } from '../firebaseClient';

export const ASSET_STATUS = {
  available: 'متاحة',
  outside: 'بالخارج',
  maintenance: 'صيانة',
  lost: 'مفقودة',
};

const assetsCol = (uid) => collection(db, 'users', uid, 'externalAssets');
const assetRef = (uid, id) => doc(db, 'users', uid, 'externalAssets', id);
const movementsCol = (uid) => collection(db, 'users', uid, 'assetMovements');
const movementRef = (uid, id) => doc(db, 'users', uid, 'assetMovements', id);

export async function createExternalAsset(uid, { name, code, type = 'shisha', notes = '' }) {
  const trimmed = String(name || '').trim();
  if (!trimmed) throw new Error('أدخل اسم الأرجيلة أو رقمها');
  await addDoc(assetsCol(uid), {
    name: trimmed,
    code: String(code || '').trim(),
    type,
    notes,
    status: 'available',
    currentMovementId: null,
    createdAt: serverTimestamp(),
  });
}

export async function setExternalAssetStatus(uid, assetId, status) {
  if (!ASSET_STATUS[status] || status === 'outside') throw new Error('حالة غير صالحة');
  await updateDoc(assetRef(uid, assetId), { status, updatedAt: serverTimestamp() });
}

/** إخراج أرجيلة — يفشل إذا لم تكن متاحة (يمنع إخراج نفس الأرجيلة مرتين) */
export async function checkoutExternalAsset(uid, { assetId, person, customerId, customerName, notes, saleProduct, actor }) {
  const who = String(person || customerName || '').trim();
  if (!who) throw new Error('اكتب اسم الشخص الذي أخذ الأرجيلة');
  const newRef = doc(movementsCol(uid));
  await runTransaction(db, async (tx) => {
    const aRef = assetRef(uid, assetId);
    const snap = await tx.get(aRef);
    if (!snap.exists()) throw new Error('الأرجيلة غير موجودة');
    const asset = snap.data();
    if (asset.status !== 'available') {
      throw new Error(`«${asset.name}» ليست متاحة حالياً (${ASSET_STATUS[asset.status] || asset.status})`);
    }
    tx.set(newRef, {
      assetId,
      assetName: asset.name,
      assetCode: asset.code || '',
      person: who,
      customerId: customerId || null,
      customerName: customerName || '',
      notes: String(notes || '').trim(),
      saleProductId: saleProduct?.id || null,
      saleProductName: saleProduct?.name || '',
      salePrice: Number(saleProduct?.price) || 0,
      status: 'outside',
      checkoutAtMs: Date.now(),
      returnedAtMs: null,
      orderId: null,
      orderNumber: null,
      checkedOutBy: actor || null,
      createdAt: serverTimestamp(),
    });
    tx.update(aRef, { status: 'outside', currentMovementId: newRef.id, updatedAt: serverTimestamp() });
  });
  return newRef.id;
}

export async function returnExternalAsset(uid, movementId, { notes, actor }) {
  await runTransaction(db, async (tx) => {
    const mRef = movementRef(uid, movementId);
    const mSnap = await tx.get(mRef);
    if (!mSnap.exists()) throw new Error('حركة الإخراج غير موجودة');
    const movement = mSnap.data();
    if (movement.status !== 'outside') throw new Error('تم تسجيل إرجاع هذه الأرجيلة مسبقاً');
    const aRef = assetRef(uid, movement.assetId);
    const aSnap = await tx.get(aRef);

    tx.update(mRef, {
      status: 'returned',
      returnedAtMs: Date.now(),
      returnNotes: String(notes || '').trim(),
      returnedBy: actor || null,
      updatedAt: serverTimestamp(),
    });
    if (aSnap.exists() && aSnap.data().currentMovementId === movementId) {
      tx.update(aRef, { status: 'available', currentMovementId: null, updatedAt: serverTimestamp() });
    }
  });
}

export { movementRef as assetMovementRef };

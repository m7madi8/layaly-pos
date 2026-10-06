import { db, doc, collection, addDoc, updateDoc, runTransaction, serverTimestamp } from '../firebaseClient';
import { serializeCartItem } from '../utils/openBillCart';

const openBillsCol = (uid) => collection(db, 'users', uid, 'openBills');
export const openBillRef = (uid, id) => doc(db, 'users', uid, 'openBills', id);

export { serializeCartItem, restoreCartItem, formatOpenBillAge } from '../utils/openBillCart';

export function buildOpenBillPayload({
  currentOrder,
  discountAmount,
  subtotal,
  total,
  actor,
  existing,
}) {
  const items = (currentOrder.items || []).map(serializeCartItem);
  const playstationSessionIds = items.filter((i) => i.sessionId).map((i) => i.sessionId);
  const nowMs = Date.now();
  return {
    customerId: currentOrder.customerId,
    customerName: currentOrder.customer || '',
    notes: currentOrder.notes || '',
    items,
    itemCount: items.reduce((s, i) => s + (Number(i.quantity) || 0), 0),
    subtotal: Number(subtotal) || 0,
    discount: Number(discountAmount) || 0,
    discountAmount: Number(discountAmount) || 0,
    discountType: 'amount',
    total: Number(total) || 0,
    status: 'open',
    assetMovementIds: currentOrder.assetMovementIds || [],
    playstationSessionIds,
    updatedAt: serverTimestamp(),
    updatedAtMs: nowMs,
    updatedBy: actor || null,
    ...(existing
      ? {}
      : {
          createdAt: serverTimestamp(),
          createdAtMs: nowMs,
          createdBy: actor || null,
        }),
  };
}

/** إنشاء أو تحديث فاتورة معلقة — لا يخصم مخزوناً ولا يسجّل ديناً ولا كاش */
export async function suspendOpenBill(uid, { billId, currentOrder, discountAmount, subtotal, total, actor }) {
  if (!currentOrder?.customerId) {
    throw new Error('الفواتير المعلقة للعملاء المسجلين فقط — اختر عميلاً من القائمة');
  }
  if (!currentOrder.items?.length) {
    throw new Error('لا يمكن تعليق فاتورة فارغة');
  }

  if (billId) {
    await runTransaction(db, async (tx) => {
      const ref = openBillRef(uid, billId);
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error('الفاتورة المعلقة غير موجودة');
      const data = snap.data();
      if (data.status !== 'open') throw new Error('هذه الفاتورة لم تعد مفتوحة');
      tx.update(
        ref,
        buildOpenBillPayload({
          currentOrder,
          discountAmount,
          subtotal,
          total,
          actor,
          existing: true,
        })
      );
    });
    return billId;
  }

  const payload = buildOpenBillPayload({
    currentOrder,
    discountAmount,
    subtotal,
    total,
    actor,
    existing: false,
  });
  const ref = await addDoc(openBillsCol(uid), payload);
  return ref.id;
}

/** إغلاق بعد نجاح completeOrder فقط */
export async function closeOpenBill(uid, billId, { orderId, orderNumber, actor }) {
  if (!billId) return;
  await runTransaction(db, async (tx) => {
    const ref = openBillRef(uid, billId);
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const data = snap.data();
    if (data.status !== 'open') {
      if (data.closedOrderId && data.closedOrderId === orderId) return;
      throw new Error('تم إغلاق هذه الفاتورة المعلقة مسبقاً');
    }
    tx.update(ref, {
      status: 'closed',
      closedAt: serverTimestamp(),
      closedAtMs: Date.now(),
      closedBy: actor || null,
      closedOrderId: orderId || null,
      closedOrderNumber: orderNumber || null,
      updatedAt: serverTimestamp(),
      updatedAtMs: Date.now(),
    });
  });
}

export async function cancelOpenBill(uid, billId, { actor } = {}) {
  await updateDoc(openBillRef(uid, billId), {
    status: 'cancelled',
    cancelledAt: serverTimestamp(),
    cancelledAtMs: Date.now(),
    cancelledBy: actor || null,
    updatedAt: serverTimestamp(),
    updatedAtMs: Date.now(),
  });
}

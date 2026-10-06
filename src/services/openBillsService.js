import { db, doc, collection, addDoc, updateDoc, getDocs, query, orderBy, runTransaction, serverTimestamp } from '../firebaseClient';
import { serializeCartItem, mergeOpenBillItems } from '../utils/openBillCart';

const openBillsCol = (uid) => collection(db, 'users', uid, 'openBills');
export const openBillRef = (uid, id) => doc(db, 'users', uid, 'openBills', id);

export { serializeCartItem, restoreCartItem, formatOpenBillAge } from '../utils/openBillCart';

/** فاتورة مفتوحة واحدة لكل عميل — الأحدث إن وُجدت أكثر من واحدة */
export async function findOpenBillForCustomer(uid, customerId) {
  if (!customerId) return null;
  const snap = await getDocs(query(openBillsCol(uid), orderBy('updatedAtMs', 'desc')));
  return (
    snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .find((b) => b.status === 'open' && b.customerId === customerId) || null
  );
}

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

/**
 * إنشاء أو تحديث فاتورة معلقة.
 * إذا لم يُمرَّر billId ووجد للعميل فاتورة مفتوحة: تُدمج الأصناف الجديدة فيها (نفس الفاتورة).
 * إذا وُجد billId: تُستبدل السلة بالكامل (وضع التعديل على فاتورة مفتوحة).
 */
export async function suspendOpenBill(uid, { billId, currentOrder, discountAmount, subtotal, total, actor, knownOpenBillId }) {
  if (!currentOrder?.customerId) {
    throw new Error('الفواتير المعلقة للعملاء المسجلين فقط — اختر عميلاً من القائمة');
  }
  if (!currentOrder.items?.length) {
    throw new Error('لا يمكن تعليق فاتورة فارغة');
  }

  const incomingItems = (currentOrder.items || []).map(serializeCartItem);
  // billId = تعديل فاتورة مفتوحة (استبدال السلة). بدونها: دمج على فاتورة العميل إن وُجدت.
  const editingBillId = billId || null;
  let targetBillId = editingBillId;
  let shouldMerge = false;

  if (!targetBillId) {
    const mergeExisting =
      (knownOpenBillId
        ? { id: knownOpenBillId }
        : null) || (await findOpenBillForCustomer(uid, currentOrder.customerId));
    if (mergeExisting?.id) {
      targetBillId = mergeExisting.id;
      shouldMerge = true;
    }
  }

  if (targetBillId) {
    await runTransaction(db, async (tx) => {
      const ref = openBillRef(uid, targetBillId);
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error('الفاتورة المعلقة غير موجودة');
      const data = snap.data();
      if (data.status !== 'open') throw new Error('هذه الفاتورة لم تعد مفتوحة');

      // حماية: لا تدمج على فاتورة عميل آخر
      if (shouldMerge && data.customerId && data.customerId !== currentOrder.customerId) {
        throw new Error('فاتورة معلقة لعميل آخر — اختر العميل الصحيح');
      }

      let items = incomingItems;
      let nextSubtotal = Number(subtotal) || 0;
      let nextDiscount = Number(discountAmount) || 0;
      let nextTotal = Number(total) || 0;

      if (shouldMerge || (!editingBillId && data.customerId === currentOrder.customerId)) {
        items = mergeOpenBillItems(Array.isArray(data.items) ? data.items : [], incomingItems);
        nextSubtotal = items.reduce((s, i) => s + (Number(i.price) || 0) * (Number(i.quantity) || 1), 0);
        const prevDiscount = Number(data.discountAmount ?? data.discount) || 0;
        nextDiscount = Math.min(nextSubtotal, Math.max(Number(discountAmount) || 0, prevDiscount));
        nextTotal = Math.max(0, nextSubtotal - nextDiscount);
        shouldMerge = true;
      }

      const mergedOrder = {
        ...currentOrder,
        items: items.map((i) => ({ ...i, quantity: Number(i.quantity) || 1 })),
        assetMovementIds: Array.from(
          new Set([...(data.assetMovementIds || []), ...(currentOrder.assetMovementIds || [])])
        ),
        notes: (currentOrder.notes || '').trim() || data.notes || '',
      };

      tx.update(
        ref,
        buildOpenBillPayload({
          currentOrder: mergedOrder,
          discountAmount: nextDiscount,
          subtotal: nextSubtotal,
          total: nextTotal,
          actor,
          existing: true,
        })
      );
    });
    return targetBillId;
  }

  // آخر حماية قبل الإنشاء: لا فاتورة ثانية لنفس العميل
  const again = await findOpenBillForCustomer(uid, currentOrder.customerId);
  if (again?.id) {
    return suspendOpenBill(uid, {
      billId: null,
      knownOpenBillId: again.id,
      currentOrder,
      discountAmount,
      subtotal,
      total,
      actor,
    });
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

const { docExists, serverTimestamp } = require('./inventoryLayerEngine');

function buildOpenBillPayload(db, { currentOrder, discountAmount, subtotal, total, actor, existing }) {
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
    updatedAt: serverTimestamp(db),
    updatedAtMs: nowMs,
    updatedBy: actor || null,
    ...(existing
      ? {}
      : {
          createdAt: serverTimestamp(db),
          createdAtMs: nowMs,
          createdBy: actor || null,
        }),
  };
}

async function findOpenBillForCustomer(db, uid, customerId) {
  if (!customerId) return null;
  const snap = await db
    .collection(`users/${uid}/openBills`)
    .orderBy('updatedAtMs', 'desc')
    .get();
  return (
    snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .find((b) => b.status === 'open' && b.customerId === customerId) || null
  );
}

async function suspendOpenBill(db, uid, input, { actor }) {
  const { billId, currentOrder, discountAmount, subtotal, total, knownOpenBillId } = input;
  if (!currentOrder?.customerId) {
    throw new Error('الفواتير المعلقة للعملاء المسجلين فقط — اختر عميلاً من القائمة');
  }
  if (!currentOrder.items?.length) throw new Error('لا يمكن تعليق فاتورة فارغة');

  const incomingItems = (currentOrder.items || []).map(serializeCartItem);
  const editingBillId = billId || null;
  let targetBillId = editingBillId;
  let shouldMerge = false;

  if (!targetBillId) {
    const mergeExisting =
      (knownOpenBillId ? { id: knownOpenBillId } : null) ||
      (await findOpenBillForCustomer(db, uid, currentOrder.customerId));
    if (mergeExisting?.id) {
      targetBillId = mergeExisting.id;
      shouldMerge = true;
    }
  }

  if (targetBillId) {
    await db.runTransaction(async (tx) => {
      const ref = db.doc(`users/${uid}/openBills/${targetBillId}`);
      const snap = await tx.get(ref);
      if (!docExists(snap)) throw new Error('الفاتورة المعلقة غير موجودة');
      const data = snap.data();
      if (data.status !== 'open') throw new Error('هذه الفاتورة لم تعد مفتوحة');
      if (shouldMerge && data.customerId && data.customerId !== currentOrder.customerId) {
        throw new Error('فاتورة معلقة لعميل آخر — اختر العميل الصحيح');
      }

      let items = incomingItems;
      let nextSubtotal = Number(subtotal) || 0;
      let nextDiscount = Number(discountAmount) || 0;
      let nextTotal = Number(total) || 0;

      if (editingBillId) {
        nextSubtotal = Number(subtotal) || 0;
        nextDiscount = Number(discountAmount) || 0;
        nextTotal = Number(total) || 0;
      } else if (shouldMerge || data.customerId === currentOrder.customerId) {
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
        buildOpenBillPayload(db, {
          currentOrder: mergedOrder,
          discountAmount: nextDiscount,
          subtotal: nextSubtotal,
          total: nextTotal,
          actor,
          existing: true,
        })
      );
    });
    return { billId: targetBillId };
  }

  const again = await findOpenBillForCustomer(db, uid, currentOrder.customerId);
  if (again?.id) {
    return suspendOpenBill(db, uid, {
      billId: null,
      knownOpenBillId: again.id,
      currentOrder,
      discountAmount,
      subtotal,
      total,
    }, { actor });
  }

  const payload = buildOpenBillPayload(db, {
    currentOrder,
    discountAmount,
    subtotal,
    total,
    actor,
    existing: false,
  });
  const ref = await db.collection(`users/${uid}/openBills`).add(payload);
  return { billId: ref.id };
}

async function closeOpenBill(db, uid, billId, { orderId, orderNumber, actor }) {
  if (!billId) return { ok: true };
  await db.runTransaction(async (tx) => {
    const ref = db.doc(`users/${uid}/openBills/${billId}`);
    const snap = await tx.get(ref);
    if (!docExists(snap)) return;
    const data = snap.data();
    if (data.status !== 'open') {
      if (data.closedOrderId && data.closedOrderId === orderId) return;
      throw new Error('تم إغلاق هذه الفاتورة المعلقة مسبقاً');
    }
    tx.update(ref, {
      status: 'closed',
      closedAt: serverTimestamp(db),
      closedAtMs: Date.now(),
      closedBy: actor || null,
      closedOrderId: orderId || null,
      closedOrderNumber: orderNumber || null,
      updatedAt: serverTimestamp(db),
      updatedAtMs: Date.now(),
    });
  });
  return { ok: true };
}

async function cancelOpenBill(db, uid, billId, { actor } = {}) {
  const ref = db.doc(`users/${uid}/openBills/${billId}`);
  await ref.update({
    status: 'cancelled',
    cancelledAt: serverTimestamp(db),
    cancelledAtMs: Date.now(),
    cancelledBy: actor || null,
    updatedAt: serverTimestamp(db),
    updatedAtMs: Date.now(),
  });
  return { ok: true };
}

module.exports = { suspendOpenBill, closeOpenBill, cancelOpenBill };

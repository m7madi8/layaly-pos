const admin = require('firebase-admin');

/** Same Firestore package as `db` (avoids duplicate firebase-admin in Jest vs functions/). */
function serverTimestamp(db) {
  const FV = db?.constructor?.FieldValue || admin.firestore.FieldValue;
  return FV.serverTimestamp();
}
const {
  roundMoney,
  getProductType,
  amountFromWeight,
  costFromWeight,
  stockUnitsForItem,
} = require('./productPricing');
const { money, effectiveDebt, debtDeltasByCustomer, replaceOrderDebtEntry } = require('./orderAccounting');
const { externalHookahUnitPrice } = require('./hookahExternalSale');
const {
  appendCashMovementInTx,
  shiftSnapFromDoc,
  getOpenShiftDocInTx,
} = require('./cashShiftEngine');
const { buildRequestFingerprint } = require('./idempotency');

const { computePaymentBreakdown, applyDiscount } = require('./pricingAndPayment');

function validateAddons(product, selectedAddonNames) {
  const names = Array.isArray(selectedAddonNames) ? selectedAddonNames.map(String) : [];
  const groups = product.addOns || [];
  if (names.length === 0) return { addons: [], price: 0, cost: 0 };
  const optionsByName = new Map();
  for (const g of groups) {
    for (const opt of g.options || []) {
      if (opt?.name) optionsByName.set(String(opt.name), opt);
    }
  }
  const resolved = [];
  let price = 0;
  let cost = 0;
  for (const n of names) {
    const opt = optionsByName.get(n);
    if (!opt) throw new Error(`إضافة غير صالحة: ${n}`);
    resolved.push({ name: opt.name, price: Number(opt.price) || 0, cost: Number(opt.cost) || 0 });
    price += Number(opt.price) || 0;
    cost += Number(opt.cost) || 0;
  }
  return { addons: resolved, price: roundMoney(price), cost: roundMoney(cost) };
}

async function resolveCartLines(db, uid, lines, sessionCache) {
  const resolved = [];
  for (const line of lines) {
    const productId = String(line.productId || '').trim();
    const quantity = Number(line.quantity);
    if (!productId || !(quantity > 0)) throw new Error('كمية أو صنف غير صالح');

    const pSnap = await db.doc(`users/${uid}/products/${productId}`).get();
    if (!pSnap.exists) throw new Error('صنف غير موجود');
    const product = pSnap.data();
    const type = getProductType(product);
    const lineId = line.lineId ? String(line.lineId) : productId;

    let unitPrice = 0;
    let lineCost = 0;
    let weightGrams;
    let sessionId;
    let durationMinutes;
    let billableMinutes;
    let selectedAddons = [];
    let displayName = product.name;

    if (type === 'weight') {
      weightGrams = Number(line.weightGrams);
      if (!(weightGrams > 0)) throw new Error('وزن غير صالح');
      unitPrice = amountFromWeight(product, weightGrams);
      lineCost = costFromWeight(product, weightGrams);
    } else if (type === 'time') {
      sessionId = String(line.sessionId || '').trim();
      if (!sessionId) throw new Error('جلسة البلايستيشن مطلوبة');
      let session = sessionCache.get(sessionId);
      if (!session) {
        const sSnap = await db.doc(`users/${uid}/playstationSessions/${sessionId}`).get();
        if (!sSnap.exists) throw new Error('جلسة البلايستيشن غير موجودة');
        session = sSnap.data();
        sessionCache.set(sessionId, session);
      }
      if (session.status !== 'ended') throw new Error('أنهِ جلسة البلايستيشن قبل الحفظ');
      unitPrice = roundMoney(Number(session.price) || 0);
      durationMinutes = session.durationMinutes;
      billableMinutes = session.billableMinutes;
      lineCost = 0;
      displayName = `${product.name} · ${session.stationName || ''}`;
    } else {
      const ext = externalHookahUnitPrice(product, lineId);
      const base = ext != null ? ext : roundMoney(Number(product.price) || 0);
      const addonResolved = validateAddons(product, line.selectedAddonNames);
      selectedAddons = addonResolved.addons;
      unitPrice = roundMoney(base + addonResolved.price);
      lineCost = roundMoney((Number(product.cost) || 0) + addonResolved.cost);
    }

    resolved.push({
      product,
      productId,
      type,
      quantity,
      lineId,
      unitPrice,
      lineCost,
      selectedAddons,
      weightGrams,
      sessionId,
      durationMinutes,
      billableMinutes,
      name: displayName,
    });
  }
  return resolved;
}

/**
 * Trusted complete order — single Firestore transaction.
 */
async function executeCompleteOrder(db, uid, payload, { isAdmin, actor }) {
  const idempotencyKey = String(payload.idempotencyKey || '').trim();
  const editingOrderId = payload.editingOrderId ? String(payload.editingOrderId) : null;
  if (!editingOrderId && !idempotencyKey) throw new Error('مفتاح idempotency مطلوب');

  const requestFingerprint = idempotencyKey ? buildRequestFingerprint(payload) : null;

  if (idempotencyKey) {
    const idemRef = db.doc(`users/${uid}/idempotency/${idempotencyKey}`);
    const idemSnap = await idemRef.get();
    if (idemSnap.exists && idemSnap.data().orderId) {
      if (idemSnap.data().requestFingerprint && idemSnap.data().requestFingerprint !== requestFingerprint) {
        throw new Error('مفتاح idempotency مستخدم لطلب مختلف');
      }
      return {
        orderId: idemSnap.data().orderId,
        orderNumber: idemSnap.data().orderNumber,
        total: idemSnap.data().total,
        duplicate: true,
      };
    }
  }

  const lines = Array.isArray(payload.lines) ? payload.lines : [];
  if (lines.length === 0) throw new Error('السلة فارغة');

  const sessionCache = new Map();
  const resolvedLines = await resolveCartLines(db, uid, lines, sessionCache);

  const subtotal = roundMoney(
    resolvedLines.reduce((s, l) => s + l.unitPrice * l.quantity, 0)
  );
  const cost = roundMoney(
    resolvedLines.reduce((s, l) => s + l.lineCost * l.quantity, 0)
  );

  const profileSnap = await db.doc(`users/${uid}`).get();
  const rounding = Boolean(profileSnap.data()?.settings?.rounding);

  let { total, discountAmount, finalDiscount, discountType } = applyDiscount(
    subtotal,
    payload.discount || { type: 'amount', value: 0 },
    rounding
  );

  if (payload.payment?.customPrice != null && payload.payment.customPrice !== '') {
    if (!isAdmin) throw new Error('تعديل السعر النهائي يتطلب صلاحية مدير');
    const custom = Number(payload.payment.customPrice);
    if (!(custom >= 0)) throw new Error('سعر غير صالح');
    const adjustment = total - custom;
    discountAmount = roundMoney(discountAmount + adjustment);
    finalDiscount = discountAmount;
    discountType = 'amount';
    total = rounding ? Math.round(custom) : roundMoney(custom);
  }

  const customerId = payload.customerId ? String(payload.customerId) : '';
  const pay = computePaymentBreakdown({
    payment: payload.payment,
    total,
    customerId,
    isAdmin,
  });

  const customerName = String(payload.customerName || payload.customer || 'ضيف').trim() || 'ضيف';
  const notes = String(payload.notes || '');
  const assetMovementIds = Array.isArray(payload.assetMovementIds) ? payload.assetMovementIds.map(String) : [];

  const orderItems = resolvedLines.map((l) => {
    const line = {
      id: l.productId,
      name: l.name,
      price: l.unitPrice,
      cost: l.lineCost,
      quantity: l.quantity,
      selectedAddons: l.selectedAddons || [],
    };
    if (l.type === 'weight') {
      Object.assign(line, {
        productType: 'weight',
        lineId: l.lineId,
        weightGrams: l.weightGrams,
        unitPrice: l.unitPrice,
      });
    } else if (l.type === 'time') {
      Object.assign(line, {
        productType: 'time',
        lineId: l.lineId,
        sessionId: l.sessionId,
        durationMinutes: l.durationMinutes || 0,
        billableMinutes: l.billableMinutes || 0,
      });
    }
    return line;
  });

  let result = null;

  await db.runTransaction(async (tx) => {
    if (idempotencyKey) {
      const idemRef = db.doc(`users/${uid}/idempotency/${idempotencyKey}`);
      const idemInTx = await tx.get(idemRef);
      if (idemInTx.exists && idemInTx.data().orderId) {
        if (idemInTx.data().requestFingerprint && idemInTx.data().requestFingerprint !== requestFingerprint) {
          throw new Error('مفتاح idempotency مستخدم لطلب مختلف');
        }
        result = {
          orderId: idemInTx.data().orderId,
          orderNumber: idemInTx.data().orderNumber,
          total: idemInTx.data().total,
          duplicate: true,
        };
        return;
      }
    }

    let orderRef;
    let existingOrderData = null;
    let orderNumber;
    let currentCount = 0;

    if (editingOrderId) {
      orderRef = db.doc(`users/${uid}/orders/${editingOrderId}`);
      const existingDoc = await tx.get(orderRef);
      if (!existingDoc.exists) throw new Error('الطلب غير موجود');
      existingOrderData = existingDoc.data();
      if (existingOrderData.status === 'cancelled') throw new Error('لا يمكن تعديل طلب ملغى');
      orderNumber = existingOrderData.orderNumber;
    } else {
      const counterRef = db.doc(`users/${uid}/counters/orders`);
      const counterDoc = await tx.get(counterRef);
      if (counterDoc.exists) currentCount = counterDoc.data().count || 0;
      orderRef = db.collection(`users/${uid}/orders`).doc();
    }

    const productIds = new Set(orderItems.map((i) => i.id));
    if (existingOrderData && existingOrderData.status !== 'cancelled') {
      for (const i of existingOrderData.items || []) productIds.add(i.id);
    }

    const productDocs = {};
    for (const pid of productIds) {
      const pRef = db.doc(`users/${uid}/products/${pid}`);
      const pDoc = await tx.get(pRef);
      if (pDoc.exists) productDocs[pid] = { ref: pRef, data: pDoc.data() };
    }

    const ingredientIds = new Set();
    for (const item of orderItems) {
      const pData = productDocs[item.id]?.data;
      for (const ing of pData?.ingredients || []) {
        if (ing.ingredientId) ingredientIds.add(ing.ingredientId);
      }
    }
    const ingredientDocs = {};
    for (const ingId of ingredientIds) {
      const ingRef = db.doc(`users/${uid}/ingredients/${ingId}`);
      const ingDoc = await tx.get(ingRef);
      if (ingDoc.exists) ingredientDocs[ingId] = { ref: ingRef, data: ingDoc.data() };
    }

    const newSessionIds = new Set(orderItems.filter((i) => i.sessionId).map((i) => i.sessionId));
    const oldSessionIds = new Set(
      (existingOrderData?.items || []).filter((i) => i.sessionId).map((i) => i.sessionId)
    );
    for (const sessionId of newSessionIds) {
      const sRef = db.doc(`users/${uid}/playstationSessions/${sessionId}`);
      const sSnap = await tx.get(sRef);
      if (!sSnap.exists) throw new Error('جلسة البلايستيشن غير موجودة');
      const s = sSnap.data();
      if (s.status !== 'ended') throw new Error('أنهِ جلسة البلايستيشن قبل الحفظ');
      if (s.billed && s.orderId !== orderRef.id) {
        throw new Error('جلسة مضافة لطلب آخر');
      }
    }

    const balanceDeltas = debtDeltasByCustomer(existingOrderData, {
      customerId: customerId || null,
      debtAmount: pay.debtAmount,
      status: pay.finalStatus,
    });
    const affectedCustomerIds = new Set(Object.keys(balanceDeltas));
    if (existingOrderData?.customerId) affectedCustomerIds.add(existingOrderData.customerId);
    if (customerId && pay.debtAmount > 0) affectedCustomerIds.add(customerId);

    const customerDocs = {};
    for (const cid of affectedCustomerIds) {
      const cRef = db.doc(`users/${uid}/customers/${cid}`);
      const cSnap = await tx.get(cRef);
      if (cSnap.exists) customerDocs[cid] = { ref: cRef, data: cSnap.data() };
      else if (cid === customerId && pay.debtAmount > 0) throw new Error('العميل غير موجود');
    }

    let openShiftDoc = null;
    if (!editingOrderId && pay.cashPaid > 0) {
      openShiftDoc = await getOpenShiftDocInTx(tx, db, uid);
      if (!openShiftDoc) throw new Error('لا توجد وردية كاش مفتوحة لتسجيل النقد');
    }

    if (existingOrderData && existingOrderData.status !== 'cancelled') {
      for (const item of existingOrderData.items || []) {
        const units = stockUnitsForItem(item);
        if (productDocs[item.id] && units > 0) {
          productDocs[item.id].data.stock = (productDocs[item.id].data.stock || 0) + units;
        }
      }
    }

    for (const item of orderItems) {
      if (!productDocs[item.id]) throw new Error(`الصنف "${item.name}" غير موجود`);
      const units = stockUnitsForItem(item);
      if (units <= 0) continue;
      const p = productDocs[item.id];
      if ((p.data.stock || 0) < units) throw new Error(`مخزون "${item.name}" غير كافٍ`);
      p.data.stock -= units;
    }

    for (const item of orderItems) {
      const pData = productDocs[item.id]?.data;
      for (const ing of pData?.ingredients || []) {
        if (!ing.ingredientId || !ingredientDocs[ing.ingredientId]) continue;
        const ingData = ingredientDocs[ing.ingredientId];
        const usage = (Number(ing.usageQty) || 0) * item.quantity;
        const nextStock = (ingData.data.stock || 0) - usage;
        if (nextStock < -0.0001) throw new Error('مخزون المكوّن غير كافٍ');
        ingData.data.stock = nextStock;
      }
    }

    for (const pid of productIds) {
      if (productDocs[pid] && getProductType(productDocs[pid].data) !== 'time' && getProductType(productDocs[pid].data) !== 'service') {
        tx.update(productDocs[pid].ref, { stock: productDocs[pid].data.stock });
      }
    }
    for (const ingId of ingredientIds) {
      if (ingredientDocs[ingId]) {
        tx.update(ingredientDocs[ingId].ref, { stock: ingredientDocs[ingId].data.stock });
      }
    }

    if (!editingOrderId) {
      const newCount = currentCount + 1;
      orderNumber = String(newCount).padStart(4, '0');
      tx.set(db.doc(`users/${uid}/counters/orders`), { count: newCount }, { merge: true });
    }

    const editedAtMs = Date.now();
    const orderPayload = {
      orderNumber,
      customer: customerName,
      customerId: customerId || null,
      notes,
      assetMovementIds,
      items: orderItems,
      status: pay.finalStatus,
      paymentMethod: pay.paymentMethod,
      paymentType: pay.paymentType,
      cashPaid: pay.cashPaid,
      debtAmount: pay.debtAmount,
      subtotal,
      discount: finalDiscount,
      discountAmount,
      discountType,
      tax: 0,
      serviceCharge: 0,
      taxAmount: 0,
      serviceChargeAmount: 0,
      total,
      cost,
      profit: roundMoney(total - cost),
      userId: uid,
      ...(existingOrderData
        ? {
            timestamp: existingOrderData.timestamp || serverTimestamp(db),
            updatedAt: serverTimestamp(db),
            lastEditedAt: serverTimestamp(db),
            lastEditedAtMs: editedAtMs,
            lastEditedBy: actor || null,
            editCount: (Number(existingOrderData.editCount) || 0) + 1,
          }
        : { timestamp: serverTimestamp(db), createdAt: serverTimestamp(db) }),
    };

    tx.set(orderRef, orderPayload, { merge: true });

    for (const sessionId of newSessionIds) {
      tx.update(db.doc(`users/${uid}/playstationSessions/${sessionId}`), {
        billed: true,
        orderId: orderRef.id,
        orderNumber,
      });
    }
    for (const sessionId of oldSessionIds) {
      if (!newSessionIds.has(sessionId)) {
        tx.update(db.doc(`users/${uid}/playstationSessions/${sessionId}`), {
          billed: false,
          orderId: null,
          orderNumber: null,
        });
      }
    }

    for (const movementId of assetMovementIds) {
      tx.update(db.doc(`users/${uid}/assetMovements/${movementId}`), {
        orderId: orderRef.id,
        orderNumber,
      });
    }

    if (openShiftDoc) {
      appendCashMovementInTx(tx, db, uid, shiftSnapFromDoc(openShiftDoc), {
        type: 'sale',
        amount: pay.cashPaid,
        reason: orderNumber ? `بيع طلب #${orderNumber}` : 'بيع كاش',
        actor,
        orderId: orderRef.id,
        orderNumber,
      });
    }

    for (const cid of affectedCustomerIds) {
      const customerDoc = customerDocs[cid];
      if (!customerDoc) continue;
      const keepsDebt = cid === customerId && pay.debtAmount > 0;
      const hadEntry = existingOrderData?.customerId === cid;
      const delta = balanceDeltas[cid] || 0;
      if (!delta && !keepsDebt && !hadEntry) continue;
      const entry = keepsDebt
        ? { id: `tx_${editedAtMs}`, type: 'order_debt', orderNumber, amount: pay.debtAmount, cashPaid: pay.cashPaid, total }
        : null;
      tx.update(customerDoc.ref, {
        balance: money((Number(customerDoc.data.balance) || 0) + delta),
        transactions: replaceOrderDebtEntry(customerDoc.data.transactions, orderNumber, entry),
        updatedAt: serverTimestamp(db),
      });
    }

    if (idempotencyKey) {
      tx.set(db.doc(`users/${uid}/idempotency/${idempotencyKey}`), {
        orderId: orderRef.id,
        orderNumber,
        total,
        requestFingerprint,
        status: 'completed',
        createdAtMs: Date.now(),
      });
    }

    result = { orderId: orderRef.id, orderNumber, total, duplicate: false };
  });

  return result;
}

async function executeCancelOrder(db, uid, { orderId }, { actor }) {
  const orderRef = db.doc(`users/${uid}/orders/${orderId}`);
  const orderSnap = await orderRef.get();
  if (!orderSnap.exists) throw new Error('الطلب غير موجود');
  const orderData = orderSnap.data();
  if (orderData.status === 'cancelled') {
    return { orderId, orderNumber: orderData.orderNumber, alreadyCancelled: true };
  }

  await db.runTransaction(async (tx) => {
    const fresh = await tx.get(orderRef);
    if (!fresh.exists) throw new Error('الطلب غير موجود');
    const data = fresh.data();
    if (data.status === 'cancelled') return;

    const restoreByProduct = {};
    for (const item of data.items || []) {
      const units = stockUnitsForItem(item);
      if (units > 0) restoreByProduct[item.id] = (restoreByProduct[item.id] || 0) + units;
    }

    const productRestoreDocs = [];
    for (const [productId, units] of Object.entries(restoreByProduct)) {
      const pRef = db.doc(`users/${uid}/products/${productId}`);
      const pDoc = await tx.get(pRef);
      if (pDoc.exists) {
        productRestoreDocs.push({ ref: pRef, stock: (pDoc.data().stock || 0) + units });
      }
    }

    const reversedDebt = effectiveDebt(data);
    let customerCancel = null;
    if (reversedDebt > 0 && data.customerId) {
      const cRef = db.doc(`users/${uid}/customers/${data.customerId}`);
      const cSnap = await tx.get(cRef);
      if (cSnap.exists) {
        const cData = cSnap.data();
        customerCancel = {
          ref: cRef,
          balance: money((Number(cData.balance) || 0) - reversedDebt),
          transactions: replaceOrderDebtEntry(cData.transactions, data.orderNumber, null),
        };
      }
    }

    const cashToReverse = Math.max(0, Number(data.cashPaid) || 0);
    let openShiftDoc = null;
    if (cashToReverse > 0) {
      openShiftDoc = await getOpenShiftDocInTx(tx, db, uid);
      if (!openShiftDoc) throw new Error('لا توجد وردية كاش مفتوحة لرد النقد');
    }

    for (const { ref, stock } of productRestoreDocs) {
      tx.update(ref, { stock });
    }

    if (customerCancel) {
      tx.update(customerCancel.ref, {
        balance: customerCancel.balance,
        transactions: customerCancel.transactions,
        updatedAt: serverTimestamp(db),
      });
    }

    for (const item of data.items || []) {
      if (item.sessionId) {
        tx.update(db.doc(`users/${uid}/playstationSessions/${item.sessionId}`), {
          billed: false,
          orderId: null,
          orderNumber: null,
        });
      }
    }

    if (openShiftDoc) {
      appendCashMovementInTx(tx, db, uid, shiftSnapFromDoc(openShiftDoc), {
        type: 'refund',
        amount: cashToReverse,
        reason: data.orderNumber ? `مرتجع طلب #${data.orderNumber}` : 'مرتجع كاش',
        actor,
        orderId,
        orderNumber: data.orderNumber,
      });
    }

    tx.update(orderRef, {
      status: 'cancelled',
      cancelledAt: serverTimestamp(db),
      cancelledBy: actor || null,
      updatedAt: serverTimestamp(db),
    });
  });

  return { orderId, orderNumber: orderData.orderNumber, alreadyCancelled: false };
}

module.exports = {
  executeCompleteOrder,
  executeCancelOrder,
};

/**
 * Pure helpers for identifying and previewing test (dummy) sales removal.
 * Shared by client demo path and Cloud Functions.
 */

export const TEST_DATA_NOTES_MARKER = '[TEST]';

export function isOrderMarkedAsTest(order, registryOrderIds = new Set()) {
  if (!order || order.testDataPurgedAt) return false;
  if (order.isTestData === true) return true;
  if (registryOrderIds.has(order.id)) return true;
  const notes = String(order.notes || '');
  if (notes.includes(TEST_DATA_NOTES_MARKER)) return true;
  return false;
}

export function isSessionMarkedAsTest(session, registrySessionIds = new Set()) {
  if (!session || session.testDataPurgedAt) return false;
  if (session.isTestData === true) return true;
  if (registrySessionIds.has(session.id)) return true;
  return false;
}

export function customerHasDebtEntryForOrder(customer, orderNumber) {
  const num = String(orderNumber ?? '');
  if (!customer || !num) return false;
  return (customer.transactions || []).some(
    (t) => t.type === 'order_debt' && String(t.orderNumber ?? '') === num
  );
}

export function effectiveOrderDebt(order) {
  if (!order || order.status === 'cancelled' || !order.customerId) return 0;
  return Math.max(0, Math.round((Number(order.debtAmount) || 0) * 100) / 100);
}

/**
 * @param {object} params
 * @param {object[]} params.orders
 * @param {object[]} params.sessions
 * @param {Map<string, object>} params.customersById
 * @param {object[]} params.cashMovements
 * @param {Map<string, object>} params.shiftsById
 * @param {Set<string>} params.registryOrderIds
 * @param {Set<string>} params.registrySessionIds
 */
export function buildTestRemovalPreview({
  orders,
  sessions,
  customersById,
  cashMovements,
  shiftsById,
  registryOrderIds,
  registrySessionIds,
}) {
  let salesTotal = 0;
  let paymentRecords = 0;
  let cashMovementCount = 0;
  let customerBalanceTouches = 0;
  const conflicts = [];

  for (const order of orders) {
    if (!isOrderMarkedAsTest(order, registryOrderIds)) continue;

    const orderMovements = cashMovements.filter((m) => m.orderId === order.id);
    cashMovementCount += orderMovements.length;
    paymentRecords += orderMovements.length > 0 ? 1 : Number(order.cashPaid) > 0 || effectiveOrderDebt(order) > 0 ? 1 : 0;

    for (const m of orderMovements) {
      const shift = shiftsById.get(m.shiftId);
      if (!shift) {
        conflicts.push({
          code: 'cash_shift_missing',
          orderId: order.id,
          orderNumber: order.orderNumber,
          message: `حركة صندوق #${m.id} مرتبطة بوردية غير موجودة — يتطلب مراجعة يدوية`,
        });
      } else if (shift.status !== 'open') {
        conflicts.push({
          code: 'cash_on_closed_shift',
          orderId: order.id,
          orderNumber: order.orderNumber,
          shiftId: m.shiftId,
          message: `طلب #${order.orderNumber || order.id}: نقد على وردية مغلقة — لن يُحذف تلقائياً`,
        });
      }
    }

    const debt = effectiveOrderDebt(order);
    if (debt > 0 && order.customerId) {
      const customer = customersById.get(order.customerId);
      if (customerHasDebtEntryForOrder(customer, order.orderNumber)) {
        customerBalanceTouches += 1;
      } else if (customer && (Number(customer.balance) || 0) > 0) {
        conflicts.push({
          code: 'customer_debt_ambiguous',
          orderId: order.id,
          orderNumber: order.orderNumber,
          customerId: order.customerId,
          message: `طلب #${order.orderNumber}: دين بدون سجل مطابق في ملف العميل — لن يُعدَّل الرصيد`,
        });
      }
    }

    if (order.status !== 'cancelled') {
      salesTotal += Math.max(0, Number(order.total) || 0);
    }
  }

  const standaloneSessions = [];
  for (const session of sessions) {
    if (!isSessionMarkedAsTest(session, registrySessionIds)) continue;
    if (session.status === 'active') {
      conflicts.push({
        code: 'ps_session_active',
        sessionId: session.id,
        message: `جلسة بلايستيشن نشطة (${session.stationName || session.id}) — أوقفها أو ألغها أولاً`,
      });
      continue;
    }
    if (session.billed && session.orderId && !orders.find((o) => o.id === session.orderId && isOrderMarkedAsTest(o, registryOrderIds))) {
      conflicts.push({
        code: 'ps_billed_real_order',
        sessionId: session.id,
        orderId: session.orderId,
        message: `جلسة مرتبطة بطلب غير معلَّم كوهمي — تخطَّى الجلسة`,
      });
      continue;
    }
    if (!session.billed || isSessionMarkedAsTest(session, registrySessionIds)) {
      standaloneSessions.push(session);
    }
  }

  const blockedOrderIds = new Set(
    conflicts.filter((c) => c.code === 'cash_on_closed_shift').map((c) => c.orderId)
  );

  const eligibleOrders = orders.filter(
    (o) => isOrderMarkedAsTest(o, registryOrderIds) && !blockedOrderIds.has(o.id)
  );
  const eligibleSessionIds = new Set([
    ...standaloneSessions.map((s) => s.id),
    ...(eligibleOrders.flatMap((o) => (o.items || []).map((i) => i.sessionId).filter(Boolean))),
  ]);

  return {
    counts: {
      productOrders: eligibleOrders.filter((o) => !(o.items || []).some((i) => i.sessionId || i.productType === 'time')).length,
      playstationOrders: eligibleOrders.filter((o) => (o.items || []).some((i) => i.sessionId || i.productType === 'time')).length,
      standalonePlaystationSessions: standaloneSessions.length,
      salesTotal: Math.round(salesTotal * 100) / 100,
      paymentRecords,
      cashMovements: cashMovementCount,
      customerBalanceTouches,
    },
    eligibleOrderIds: eligibleOrders.map((o) => o.id),
    eligibleSessionIds: [...eligibleSessionIds],
    conflicts,
    blockedOrderIds: [...blockedOrderIds],
    sampleOrders: eligibleOrders.slice(0, 8).map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      total: o.total,
      customer: o.customer,
      status: o.status,
    })),
  };
}

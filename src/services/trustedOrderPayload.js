/**
 * Maps POS cart state to trusted completeOrder callable payload (no client prices).
 */

import { newIdempotencyKey } from '../utils/idempotencyKey';

export function buildTrustedCompleteOrderPayload({
  currentOrder,
  discount,
  discountType,
  payment,
  status,
  editingOrderId,
  idempotencyKey,
}) {
  const paymentType = payment.paymentType || (status === 'unpaid' ? 'pending' : 'cash');
  return {
    idempotencyKey: editingOrderId ? undefined : idempotencyKey || newIdempotencyKey(),
    editingOrderId: editingOrderId || null,
    customerId: payment.customerId || currentOrder.customerId || '',
    customerName: currentOrder.customer || '',
    notes: currentOrder.notes || '',
    assetMovementIds: currentOrder.assetMovementIds || [],
    lines: (currentOrder.items || []).map((item) => ({
      productId: item.id,
      quantity: item.quantity,
      lineId: item.cartItemId || item.lineId || item.id,
      weightGrams: item.weightGrams,
      sessionId: item.sessionId,
      selectedAddonNames: (item.selectedAddons || []).map((a) => a.name),
    })),
    discount: {
      type: discountType === 'percentage' ? 'percentage' : 'amount',
      value: Number(discount) || 0,
    },
    payment: {
      paymentType,
      statusIntent: status === 'unpaid' ? 'unpaid' : 'paid',
      cashPaid: payment.cashPaid,
      customPrice: payment.customPrice,
      method: payment.method,
    },
  };
}

import {
  db,
  doc,
  runTransaction,
  serverTimestamp,
} from '../firebaseClient';
import { assertFirestoreDocRef } from '../utils/firestoreIds';
import {
  cashShiftRef,
  recordCashDepositInTransaction,
  readOpenCashShiftInTransaction,
} from './cashShiftService';

const money = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Record customer debt repayment (cash → cash drawer deposit; card → shift counter only).
 * Not counted as sales revenue.
 */
export async function recordCustomerDebtPayment(
  uid,
  { customerId, amount, channel = 'cash', description, actor, shiftId = null }
) {
  const amt = money(amount);
  if (!(amt > 0)) throw new Error('أدخل مبلغاً أكبر من صفر');
  const payChannel = channel === 'card' ? 'card' : 'cash';

  const customerRef = assertFirestoreDocRef(
    doc(db, 'users', uid, 'customers', customerId),
    'معرّف العميل غير صالح'
  );

  await runTransaction(db, async (tx) => {
    const cSnap = await tx.get(customerRef);
    if (!cSnap.exists()) throw new Error('العميل غير موجود');
    const customer = cSnap.data();
    const balanceBefore = Number(customer.balance) || 0;
    const paymentId = `pay_${Date.now()}`;
    const entry = {
      id: paymentId,
      type: 'payment',
      paymentChannel: payChannel,
      amount: amt,
      description: String(description || '').trim() || 'دفعة على الحساب',
      date: new Date().toISOString(),
    };
    const transactions = [...(customer.transactions || []), entry].slice(-100);
    const newBalance = money(balanceBefore - amt);

    let shiftCtx = null;
    if (payChannel === 'cash' || payChannel === 'card') {
      shiftCtx = await readOpenCashShiftInTransaction(tx, uid, shiftId || null);
      if (!shiftCtx) {
        throw new Error('لا توجد وردية كاش مفتوحة — افتح الوردية لتسجيل الدفعة');
      }
    }

    tx.update(customerRef, {
      balance: newBalance,
      transactions,
      updatedAt: serverTimestamp(),
    });

    if (payChannel === 'cash' && shiftCtx) {
      await recordCashDepositInTransaction(tx, uid, {
        amount: amt,
        reason: `دفعة عميل (كاش) — ${customer.name || 'عميل'}`,
        actor,
        shiftId: shiftCtx.shiftId,
        shiftSnap: shiftCtx.shiftSnap,
      });
    }

    if (payChannel === 'card' && shiftCtx) {
      const shift = shiftCtx.shiftSnap.data();
      const cardDebtRepayments = money((Number(shift.cardDebtRepayments) || 0) + amt);
      const cardDebtRepaymentCount = (Number(shift.cardDebtRepaymentCount) || 0) + 1;
      tx.update(cashShiftRef(uid, shiftCtx.shiftId), {
        cardDebtRepayments,
        cardDebtRepaymentCount,
        updatedAt: serverTimestamp(),
        updatedAtMs: Date.now(),
      });
    }
  });
}
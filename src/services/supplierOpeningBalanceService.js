import { db, doc, collection, runTransaction, serverTimestamp } from '../firebaseClient';
import { roundMoney } from '../utils/supplierAccounting';

/**
 * Opening balance for supplier — no inventory / purchase invoice.
 * @param {'payable'|'receivable'} nature — cafe owes trader vs trader owes cafe
 */
export async function recordSupplierOpeningBalance(uid, supplierId, { amount, nature, note, actor, asOfDateMs, idempotencyKey }) {
  const amt = roundMoney(Math.abs(Number(amount) || 0));
  if (!(amt > 0)) throw new Error('أدخل مبلغ الرصيد');
  if (!supplierId) throw new Error('اختر التاجر');
  const signed = nature === 'receivable' ? -amt : amt;
  const idemKey = String(idempotencyKey || '').trim();

  const sRef = doc(db, 'users', uid, 'suppliers', supplierId);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(sRef);
    if (!snap.exists()) throw new Error('التاجر غير موجود');
    if (snap.data().openingBalanceRecorded) {
      throw new Error('تم تسجيل رصيد افتتاحي لهذا التاجر — لا يمكن التكرار');
    }

    if (idemKey) {
      const prior = await tx.get(doc(db, 'users', uid, 'idempotency', `opening_bal_${idemKey}`));
      if (prior.exists()) {
        return { duplicate: true, openingBalanceId: prior.data().openingBalanceId };
      }
    }

    const prev = roundMoney(snap.data().balance);
    const obRef = doc(collection(db, 'users', uid, 'supplierOpeningBalances'));

    tx.update(sRef, {
      balance: roundMoney(prev + signed),
      openingBalanceRecorded: true,
      openingBalanceAmount: signed,
      openingBalanceNature: nature === 'receivable' ? 'receivable' : 'payable',
      updatedAt: serverTimestamp(),
    });

    tx.set(obRef, {
      supplierId,
      amount: signed,
      nature: nature === 'receivable' ? 'receivable' : 'payable',
      note: String(note || '').trim(),
      asOfDateMs: asOfDateMs || Date.now(),
      createdBy: actor || null,
      createdAt: serverTimestamp(),
      createdAtMs: Date.now(),
    });

    if (idemKey) {
      tx.set(doc(db, 'users', uid, 'idempotency', `opening_bal_${idemKey}`), {
        openingBalanceId: obRef.id,
        createdAtMs: Date.now(),
      });
    }

    return { duplicate: false, openingBalanceId: obRef.id };
  });
}

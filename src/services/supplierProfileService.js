import { db, doc, updateDoc, deleteDoc, serverTimestamp } from '../firebaseClient';
import { isSupplierPaymentExpense } from '../utils/supplierAccounting';
import { resolveExpenseSection } from '../expenseConfig';
import { purchaseIncreasesSupplierDebt } from '../utils/purchasePayment';

const supplierRef = (uid, id) => doc(db, 'users', uid, 'suppliers', id);

export function supplierHasFinancialActivity(supplier, supplierId, expenses) {
  if (!supplierId) return false;
  if (supplier?.openingBalanceRecorded) return true;
  const bal = Number(supplier?.balance);
  if (Number.isFinite(bal) && Math.abs(bal) > 0.009) return true;
  for (const e of expenses || []) {
    if (String(e.supplierId || '') !== String(supplierId)) continue;
    const amt = Number(e.amount) || 0;
    if (!(amt > 0)) continue;
    if (isSupplierPaymentExpense(e)) return true;
    if (resolveExpenseSection(e) === 'purchase' && purchaseIncreasesSupplierDebt(e)) return true;
    if (resolveExpenseSection(e) === 'purchase') return true;
  }
  return false;
}

export async function updateSupplierProfile(uid, supplierId, patch, { actor } = {}) {
  if (!uid || !supplierId) throw new Error('معرّف التاجر غير صالح');
  const name = String(patch.name || '').trim();
  if (!name) throw new Error('أدخل اسم التاجر');
  const data = {
    name,
    contactPerson: String(patch.contactPerson || '').trim(),
    phone: String(patch.phone || '').trim(),
    email: String(patch.email || '').trim(),
    address: String(patch.address || '').trim(),
    updatedAt: serverTimestamp(),
    lastEditedBy: actor || null,
  };
  await updateDoc(supplierRef(uid, supplierId), data);
  return data;
}

/**
 * بدون حركات مالية: حذف المستند. مع حركات: أرشفة (soft delete) للحفاظ على التقارير.
 */
export async function removeSupplierProfile(uid, supplier, expenses, { actor } = {}) {
  if (!uid || !supplier?.id) throw new Error('التاجر غير موجود');
  const hasActivity = supplierHasFinancialActivity(supplier, supplier.id, expenses);
  if (hasActivity) {
    await updateDoc(supplierRef(uid, supplier.id), {
      archived: true,
      archivedAtMs: Date.now(),
      archivedBy: actor || null,
      updatedAt: serverTimestamp(),
    });
    return { mode: 'archived', message: 'تم أرشفة التاجر — السجلات المالية السابقة محفوظة.' };
  }
  await deleteDoc(supplierRef(uid, supplier.id));
  return { mode: 'deleted', message: 'تم حذف ملف التاجر.' };
}

export function listActiveSuppliers(suppliers) {
  return (suppliers || []).filter((s) => s && s.archived !== true);
}

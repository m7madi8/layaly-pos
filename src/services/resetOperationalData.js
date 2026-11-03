const BATCH_SIZE = 450;

/** لا تُحذف أبداً عند التهيئة (الأصناف + قائمة موظفي الاستفادة وحدودهم). */
const PRESERVED_SUBCOLLECTIONS = ['products', 'staffMembers'];

const SUBCOLLECTIONS_TO_WIPE = [
  'orders',
  'openBills',
  'orderEdits',
  'expenses',
  'customers',
  'suppliers',
  'cashShifts',
  'cashMovements',
  'vaultMovements',
  'playstationSessions',
  'externalAssets',
  'assetMovements',
  /** سجل الاستفادات — staffMembers (الاسم + benefitLimitILS) يبقى */
  'employeeBenefits',
  'staffBenefitDaily',
  'employeeBenefitIdempotency',
  'supplierPaymentIdempotency',
  'cashShiftIdempotency',
  'idempotency',
  'maintenance',
];

async function deleteAllInSubcollection(uid, subcollection, apis) {
  const { db, collection, doc, getDocs, writeBatch } = apis;
  const colRef = collection(db, 'users', uid, subcollection);
  const snap = await getDocs(colRef);
  const ids = snap.docs.map((d) => d.id);
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batch = writeBatch(db);
    const chunk = ids.slice(i, i + BATCH_SIZE);
    for (const id of chunk) {
      batch.delete(doc(db, 'users', uid, subcollection, id));
    }
    await batch.commit();
  }
  return ids.length;
}

async function zeroIngredientStocks(uid, apis) {
  const { db, collection, doc, getDocs, writeBatch, serverTimestamp } = apis;
  const snap = await getDocs(collection(db, 'users', uid, 'ingredients'));
  if (snap.empty) return 0;
  let updated = 0;
  for (let i = 0; i < snap.docs.length; i += BATCH_SIZE) {
    const batch = writeBatch(db);
    const chunk = snap.docs.slice(i, i + BATCH_SIZE);
    for (const d of chunk) {
      batch.update(doc(db, 'users', uid, 'ingredients', d.id), {
        stock: 0,
        updatedAt: serverTimestamp(),
      });
      updated += 1;
    }
    await batch.commit();
  }
  return updated;
}

async function countSubcollectionDocs(uid, subcollection, apis) {
  const { db, collection, getDocs } = apis;
  const snap = await getDocs(collection(db, 'users', uid, subcollection));
  return snap.size;
}

/**
 * تهيئة تشغيلية: حذف السجلات التشغيلية (مبيعات، صندوق، خزنة، عملاء، تجار، مصروفات…).
 * لا يحذف ولا يعدّل products (الأسماء، الأسعار، الصور، المخزون، الوصفات).
 * لا يحذف staffMembers — تبقى أسماء الموظفين وحد الاستفادة اليومي؛ يُمسح سجل الاستفادات وعداد اليوم فقط.
 * يصفّر مخزون المكوّنات (ingredients) فقط إن وُجد.
 */
export async function resetOperationalData(uid, apis) {
  const { db, doc, setDoc, serverTimestamp } = apis;
  const wiped = {};

  for (const sub of SUBCOLLECTIONS_TO_WIPE) {
    if (PRESERVED_SUBCOLLECTIONS.includes(sub)) continue;
    wiped[sub] = await deleteAllInSubcollection(uid, sub, apis);
  }

  await setDoc(doc(db, 'users', uid, 'counters', 'orders'), { count: 0 }, { merge: true });

  await setDoc(
    doc(db, 'users', uid, 'vault', 'main'),
    {
      balance: 0,
      totalCapitalIn: 0,
      updatedAt: serverTimestamp(),
      updatedAtMs: Date.now(),
    },
    { merge: true }
  );

  const ingredientsStockZeroed = await zeroIngredientStocks(uid, apis);

  await setDoc(
    doc(db, 'users', uid),
    {
      starterAssetsV1: false,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  return {
    wiped,
    productsPreserved: true,
    staffMembersPreserved: await countSubcollectionDocs(uid, 'staffMembers', apis),
    ingredientsStockZeroed,
  };
}

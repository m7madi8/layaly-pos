const BATCH_SIZE = 450;

async function deleteAllInSubcollection(uid, subcollection, { db, collection, doc, getDocs, writeBatch }) {
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

/**
 * يحذف الطلبات والفواتير المعلقة وسجل التعديلات.
 * لا يمسّ المنتجات ولا المخزون.
 * @param {object} [options]
 * @param {boolean} [options.preserveCustomerLedgers=true] — الإبقاء على balance و transactions لكل عميل
 */
export async function resetSalesAndCustomerLedgers(uid, apis, options = {}) {
  const preserveCustomerLedgers = options.preserveCustomerLedgers !== false;
  const { db, collection, doc, getDocs, writeBatch, setDoc, serverTimestamp } = apis;

  const ordersDeleted = await deleteAllInSubcollection(uid, 'orders', apis);
  const openBillsDeleted = await deleteAllInSubcollection(uid, 'openBills', apis);
  const orderEditsDeleted = await deleteAllInSubcollection(uid, 'orderEdits', apis);

  await setDoc(doc(db, 'users', uid, 'counters', 'orders'), { count: 0 }, { merge: true });

  let customersReset = 0;
  let customersPreserved = 0;

  const custSnap = await getDocs(collection(db, 'users', uid, 'customers'));
  const customerDocs = custSnap.docs;
  customersPreserved = customerDocs.length;

  if (!preserveCustomerLedgers) {
    for (let i = 0; i < customerDocs.length; i += BATCH_SIZE) {
      const batch = writeBatch(db);
      const chunk = customerDocs.slice(i, i + BATCH_SIZE);
      for (const d of chunk) {
        batch.update(doc(db, 'users', uid, 'customers', d.id), {
          balance: 0,
          transactions: [],
          updatedAt: serverTimestamp(),
        });
        customersReset += 1;
      }
      await batch.commit();
    }
    customersPreserved = 0;
  }

  return {
    ordersDeleted,
    openBillsDeleted,
    orderEditsDeleted,
    customersReset,
    customersPreserved,
    preserveCustomerLedgers,
  };
}

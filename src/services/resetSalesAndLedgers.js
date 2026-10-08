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
 * يحذف كل الطلبات والفواتير المعلقة وسجل التعديلات، ويصفّر ديون/حركات العملاء مع الإبقاء على ملفاتهم (الاسم، الجوال، …).
 * لا يمسّ المنتجات ولا المخزون.
 */
export async function resetSalesAndCustomerLedgers(uid, apis) {
  const { db, collection, doc, getDocs, writeBatch, setDoc, serverTimestamp } = apis;

  const ordersDeleted = await deleteAllInSubcollection(uid, 'orders', apis);
  const openBillsDeleted = await deleteAllInSubcollection(uid, 'openBills', apis);
  const orderEditsDeleted = await deleteAllInSubcollection(uid, 'orderEdits', apis);

  await setDoc(doc(db, 'users', uid, 'counters', 'orders'), { count: 0 }, { merge: true });

  const custSnap = await getDocs(collection(db, 'users', uid, 'customers'));
  const customerDocs = custSnap.docs;
  let customersReset = 0;

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

  return {
    ordersDeleted,
    openBillsDeleted,
    orderEditsDeleted,
    customersReset,
  };
}

/**
 * Financial ops integration — Firebase emulators (firestore, auth, functions).
 * Run: npm run test:functions:financial
 */
const admin = require('firebase-admin');
const { initializeApp } = require('firebase/app');
const { getAuth, connectAuthEmulator, signInWithCustomToken } = require('firebase/auth');
const { getFunctions, connectFunctionsEmulator, httpsCallable } = require('firebase/functions');
const { executePartialOrderReturn } = require('../../functions/lib/partialOrderReturnEngine');

const PROJECT_ID = 'layali-rules-test';
const canRun = process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST;

describe('financial ops (emulator)', () => {
  if (!canRun) {
    test('FAIL — emulators not configured (use npm run test:functions:financial from L: drive)', () => {
      throw new Error('FIRESTORE_EMULATOR_HOST and FIREBASE_AUTH_EMULATOR_HOST required');
    });
    return;
  }

  let uid;
  let clientApp;
  let db;

  beforeAll(async () => {
    if (!admin.apps.length) {
      admin.initializeApp({ projectId: PROJECT_ID });
    }
    db = admin.firestore();
    uid = `fin_${Date.now()}`;
    await db.doc(`users/${uid}`).set({ securityMode: 'hardened', businessName: 'Fin Test' });
    await db.doc(`users/${uid}/products/p1`).set({
      name: 'Item',
      price: 20,
      cost: 5,
      stock: 50,
      productType: 'standard',
    });
    await db.doc(`users/${uid}/inventoryLayers/l1`).set({
      productId: 'p1',
      initialQuantity: 50,
      remainingQuantity: 40,
      unitCost: 5,
      purchaseDateMs: 1000,
    });
    const shiftRef = db.collection(`users/${uid}/cashShifts`).doc();
    await shiftRef.set({
      status: 'open',
      openingBalance: 100,
      cashSales: 0,
      cashWithdrawals: 0,
      cashDeposits: 0,
      cashRefunds: 0,
    });
    const orderRef = db.collection(`users/${uid}/orders`).doc('ord1');
    await orderRef.set({
      orderNumber: '0001',
      status: 'paid',
      cashPaid: 40,
      debtAmount: 0,
      total: 40,
      items: [
        {
          id: 'p1',
          name: 'Item',
          price: 20,
          quantity: 2,
          inventoryConsumption: [{ layerId: 'l1', quantity: 2, unitCost: 5 }],
        },
      ],
    });

    await admin.auth().createUser({ uid, email: `${uid}@test.local` });
    await admin.auth().setCustomUserClaims(uid, { role: 'admin' });
    const customToken = await admin.auth().createCustomToken(uid, { role: 'admin' });

    clientApp = initializeApp({ projectId: PROJECT_ID, apiKey: 'fake', authDomain: 'localhost' }, `fin_${uid}`);
    const auth = getAuth(clientApp);
    connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true });
    await signInWithCustomToken(auth, customToken);

    const fns = getFunctions(clientApp, 'europe-west1');
    connectFunctionsEmulator(fns, '127.0.0.1', 5001);
  });

  test('partial return engine — success and idempotency', async () => {
    const idem = `ret_${Date.now()}`;
    const r1 = await executePartialOrderReturn(
      db,
      uid,
      {
        orderId: 'ord1',
        productId: 'p1',
        quantity: 1,
        refundAmount: 20,
        refundCash: true,
        restock: true,
        reason: 'test return',
        idempotencyKey: idem,
      },
      { actor: { role: 'admin', uid } }
    );
    expect(r1.duplicate).toBe(false);
    expect(r1.returnId).toBeTruthy();

    const r2 = await executePartialOrderReturn(
      db,
      uid,
      {
        orderId: 'ord1',
        productId: 'p1',
        quantity: 1,
        refundAmount: 20,
        refundCash: true,
        restock: true,
        reason: 'test return',
        idempotencyKey: idem,
      },
      { actor: { role: 'admin', uid } }
    );
    expect(r2.duplicate).toBe(true);

    const orderSnap = await db.doc(`users/${uid}/orders/ord1`).get();
    expect(orderSnap.data().returnTotal).toBe(20);
    const prodSnap = await db.doc(`users/${uid}/products/p1`).get();
    expect(prodSnap.data().stock).toBe(51);
  });

  test('cashier cannot call admin payroll callable', async () => {
    await admin.auth().setCustomUserClaims(uid, { role: 'cashier' });
    const customToken = await admin.auth().createCustomToken(uid, { role: 'cashier' });
    const auth = getAuth(clientApp);
    await signInWithCustomToken(auth, customToken);
    const fns = getFunctions(clientApp, 'europe-west1');
    const createAccrual = httpsCallable(fns, 'createPayrollAccrual');
    await expect(
      createAccrual({ staffMemberId: 's1', staffName: 'X', amount: 100 })
    ).rejects.toMatchObject({ code: 'functions/permission-denied' });
  });
});

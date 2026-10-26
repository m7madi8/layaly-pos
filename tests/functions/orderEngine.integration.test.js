/**
 * Integration tests — require Java + Firebase emulators (firestore, auth, functions).
 * Run: npm run test:functions:integration
 *
 * Skips gracefully when emulators are not reachable.
 */
const admin = require('firebase-admin');
const { initializeApp } = require('firebase/app');
const { getAuth, connectAuthEmulator, signInWithCustomToken } = require('firebase/auth');
const { getFunctions, connectFunctionsEmulator, httpsCallable } = require('firebase/functions');

const PROJECT_ID = 'layali-rules-test';
const canRun = process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST;

describe('completeOrder integration (emulator)', () => {
  if (!canRun) {
    test('skipped — emulators not configured (use firebase emulators:exec)', () => {
      expect(true).toBe(true);
    });
    return;
  }

  let uid;
  let clientApp;

  beforeAll(async () => {
    if (!admin.apps.length) {
      admin.initializeApp({ projectId: PROJECT_ID });
    }
    const db = admin.firestore();
    uid = `test_${Date.now()}`;
    await db.doc(`users/${uid}`).set({ securityMode: 'legacy', businessName: 'Test Café' });
    await db.doc(`users/${uid}/products/p1`).set({
      name: 'قهوة',
      price: 10,
      cost: 2,
      stock: 100,
      productType: 'standard',
      addOns: [],
    });
    await db.doc(`users/${uid}/counters/orders`).set({ count: 0 });
    await db.collection(`users/${uid}/cashShifts`).add({
      status: 'open',
      openingBalance: 0,
      cashSales: 0,
      cashWithdrawals: 0,
      cashDeposits: 0,
      cashRefunds: 0,
    });

    await admin.auth().createUser({ uid, email: `${uid}@test.local` });
    await admin.auth().setCustomUserClaims(uid, { role: 'admin' });
    const customToken = await admin.auth().createCustomToken(uid);

    clientApp = initializeApp({
      projectId: PROJECT_ID,
      apiKey: 'fake',
      authDomain: 'localhost',
    });
    const auth = getAuth(clientApp);
    connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true });
    await signInWithCustomToken(auth, customToken);

    const fns = getFunctions(clientApp, 'europe-west1');
    connectFunctionsEmulator(fns, '127.0.0.1', 5001);
  });

  test('valid cash sale with server pricing', async () => {
    const fns = getFunctions(clientApp, 'europe-west1');
    const completeOrder = httpsCallable(fns, 'completeOrder');
    const idem = `idem_${Date.now()}`;
    const res = await completeOrder({
      idempotencyKey: idem,
      customerName: 'ضيف',
      lines: [{ productId: 'p1', quantity: 2, lineId: 'p1' }],
      discount: { type: 'amount', value: 0 },
      payment: { paymentType: 'cash', statusIntent: 'paid' },
    });
    expect(res.data.orderNumber).toBe('0001');
    expect(res.data.total).toBe(20);
    const dup = await completeOrder({
      idempotencyKey: idem,
      customerName: 'ضيف',
      lines: [{ productId: 'p1', quantity: 2, lineId: 'p1' }],
      discount: { type: 'amount', value: 0 },
      payment: { paymentType: 'cash', statusIntent: 'paid' },
    });
    expect(dup.data.duplicate).toBe(true);
  });
});

/**
 * Concurrency / race scenarios on Firestore emulator.
 */
const admin = require('firebase-admin');
const { executeOpenCashShift, executeCloseCashShift } = require('../../functions/lib/cashShiftEngine');
const { executeCompleteOrder } = require('../../functions/lib/orderEngine');

const PROJECT_ID = 'layali-rules-test';
const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;

let db;
let uid;
let emulatorUp = false;

async function probeEmulator() {
  if (!EMULATOR_HOST) return false;
  try {
    if (!admin.apps.length) admin.initializeApp({ projectId: PROJECT_ID });
    db = admin.firestore();
    await Promise.race([
      db.collection('_probe').doc('conc').get(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2500)),
    ]);
    return true;
  } catch {
    return false;
  }
}

async function seed() {
  uid = `conc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await db.doc(`users/${uid}`).set({ securityMode: 'legacy' });
  await db.doc(`users/${uid}/products/p1`).set({
    name: 'قهوة',
    price: 10,
    stock: 100,
    productType: 'standard',
    addOns: [],
  });
  await db.doc(`users/${uid}/counters/orders`).set({ count: 0 });
  await db.doc(`users/${uid}/vault/main`).set({ balance: 0, totalCapitalIn: 0 });
}

const actor = { role: 'admin' };
const line = [{ productId: 'p1', quantity: 1, lineId: 'p1' }];

describe('financial concurrency (Firestore emulator)', () => {
  jest.setTimeout(60000);

  beforeAll(async () => {
    emulatorUp = await probeEmulator();
  });

  afterAll(async () => {
    if (admin.apps.length) await Promise.all(admin.apps.map((app) => app.delete()));
  });

  beforeEach(async () => {
    if (!emulatorUp) return;
    await seed();
  });

  test('environment gate', () => {
    if (!EMULATOR_HOST || !emulatorUp) {
      throw new Error('Firestore emulator required — see docs/EMULATOR-TEST-SETUP.md');
    }
    expect(emulatorUp).toBe(true);
  });

  test('parallel sale + close: sale fails or succeeds atomically without orphan cash', async () => {
    if (!emulatorUp) return;
    const { shiftId } = await executeOpenCashShift(db, uid, { openingBalance: 50 }, { actor });
    const salePromise = executeCompleteOrder(
      db,
      uid,
      {
        idempotencyKey: `race_sale_${Date.now()}`,
        lines: line,
        payment: { paymentType: 'cash', statusIntent: 'paid' },
      },
      { isAdmin: true, actor }
    );
    const closePromise = executeCloseCashShift(
      db,
      uid,
      { shiftId, actualClosingBalance: 60 },
      { actor }
    );

    const results = await Promise.allSettled([salePromise, closePromise]);
    const orders = await db.collection(`users/${uid}/orders`).get();
    const shift = (await db.doc(`users/${uid}/cashShifts/${shiftId}`).get()).data();
    const moves = await db.collection(`users/${uid}/cashMovements`).get();

    const saleOk = results[0].status === 'fulfilled';
    const closeOk = results[1].status === 'fulfilled';

    if (saleOk) {
      expect(orders.size).toBe(1);
      const order = orders.docs[0].data();
      expect(order.cashPaid).toBe(10);
    } else {
      expect(orders.size).toBe(0);
    }

    if (closeOk) {
      expect(shift.status).toBe('closed');
    }

    if (saleOk && closeOk) {
      const saleMoves = moves.docs.filter((d) => d.data().type === 'sale');
      expect(saleMoves.length).toBeLessThanOrEqual(1);
      expect(shift.cashSales).toBeLessThanOrEqual(10);
    }

    if (!saleOk && closeOk) {
      expect(orders.size).toBe(0);
    }
  });

  test('duplicate idempotency key under retry does not duplicate orders', async () => {
    if (!emulatorUp) return;
    await executeOpenCashShift(db, uid, { openingBalance: 0 }, { actor });
    const key = `idem_retry_${Date.now()}`;
    const payload = {
      idempotencyKey: key,
      lines: line,
      payment: { paymentType: 'cash', statusIntent: 'paid' },
    };
    const [a, b] = await Promise.all([
      executeCompleteOrder(db, uid, payload, { isAdmin: true, actor }),
      executeCompleteOrder(db, uid, payload, { isAdmin: true, actor }),
    ]);
    expect(a.orderId).toBe(b.orderId);
    expect((await db.collection(`users/${uid}/orders`).get()).size).toBe(1);
    expect((await db.collection(`users/${uid}/cashMovements`).where('type', '==', 'sale').get()).size).toBe(1);
  });
});

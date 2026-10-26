/**
 * Financial persistence tests — call orderEngine directly against Firestore emulator.
 * Requires: Java + `firebase emulators:start --only firestore --project layali-rules-test`
 * Env: FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
 */
const admin = require('firebase-admin');
const { executeCompleteOrder, executeCancelOrder } = require('../../functions/lib/orderEngine');

const PROJECT_ID = 'layali-rules-test';
const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;

let db;
let uid;
let emulatorUp = false;

async function probeEmulator() {
  if (!EMULATOR_HOST) return false;
  try {
    if (!admin.apps.length) {
      admin.initializeApp({ projectId: PROJECT_ID });
    }
    db = admin.firestore();
    await Promise.race([
      db.collection('_probe').doc('ping').get(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('emulator timeout')), 2500)),
    ]);
    return true;
  } catch {
    return false;
  }
}

async function seedBase() {
  uid = `fin_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await db.doc(`users/${uid}`).set({ securityMode: 'legacy', settings: { rounding: false } });
  await db.doc(`users/${uid}/products/p1`).set({
    name: 'قهوة',
    price: 10,
    cost: 2,
    stock: 5,
    productType: 'standard',
    addOns: [],
  });
  await db.doc(`users/${uid}/customers/c1`).set({ name: 'عميل', balance: 0, transactions: [] });
  await db.doc(`users/${uid}/counters/orders`).set({ count: 0 });
  const shiftRef = await db.collection(`users/${uid}/cashShifts`).add({
    status: 'open',
    openingBalance: 0,
    cashSales: 0,
    cashWithdrawals: 0,
    cashDeposits: 0,
    cashRefunds: 0,
  });
  return shiftRef.id;
}

function lineCoffee(qty = 1) {
  return [{ productId: 'p1', quantity: qty, lineId: 'p1' }];
}

describe('orderEngine financial persistence (Firestore emulator)', () => {
  jest.setTimeout(30000);

  beforeAll(async () => {
    emulatorUp = await probeEmulator();
  });

  afterAll(async () => {
    if (admin.apps.length) {
      await Promise.all(admin.apps.map((app) => app.delete()));
    }
  });

  beforeEach(async () => {
    if (!emulatorUp) return;
    await seedBase();
  });

  test('environment gate', () => {
    if (!EMULATOR_HOST) {
      console.warn('SKIP: FIRESTORE_EMULATOR_HOST not set — see docs/EMULATOR-TEST-SETUP.md');
      expect(true).toBe(true);
      return;
    }
    if (!emulatorUp) {
      throw new Error(
        'Firestore emulator not reachable — start with: subst L: "<project>" ; firebase emulators:start --only firestore --project layali-rules-test (Java 21+). See docs/EMULATOR-TEST-SETUP.md'
      );
    }
    expect(emulatorUp).toBe(true);
  });

  test('1 cash sale: order, stock, cash movement', async () => {
    if (!emulatorUp) return;
    const idem = `k_${Date.now()}`;
    const res = await executeCompleteOrder(
      db,
      uid,
      {
        idempotencyKey: idem,
        lines: lineCoffee(2),
        discount: { type: 'amount', value: 0 },
        payment: { paymentType: 'cash', statusIntent: 'paid' },
      },
      { isAdmin: true, actor: { role: 'admin' } }
    );
    expect(res.total).toBe(20);
    const order = (await db.doc(`users/${uid}/orders/${res.orderId}`).get()).data();
    expect(order.cashPaid).toBe(20);
    expect(order.status).toBe('paid');
    const product = (await db.doc(`users/${uid}/products/p1`).get()).data();
    expect(product.stock).toBe(3);
    const moves = await db.collection(`users/${uid}/cashMovements`).get();
    expect(moves.size).toBe(1);
    expect(moves.docs[0].data().amount).toBe(20);
  });

  test('10 duplicate idempotency returns same order', async () => {
    if (!emulatorUp) return;
    const idem = `dup_${Date.now()}`;
    const payload = {
      idempotencyKey: idem,
      lines: lineCoffee(1),
      discount: { type: 'amount', value: 0 },
      payment: { paymentType: 'cash', statusIntent: 'paid' },
    };
    const a = await executeCompleteOrder(db, uid, payload, { isAdmin: true, actor: { role: 'admin' } });
    const b = await executeCompleteOrder(db, uid, payload, { isAdmin: true, actor: { role: 'admin' } });
    expect(b.duplicate).toBe(true);
    expect(b.orderId).toBe(a.orderId);
    const orders = await db.collection(`users/${uid}/orders`).get();
    expect(orders.size).toBe(1);
  });

  test('11 idempotency key reuse with different payload fails', async () => {
    if (!emulatorUp) return;
    const idem = `mis_${Date.now()}`;
    await executeCompleteOrder(
      db,
      uid,
      {
        idempotencyKey: idem,
        lines: lineCoffee(1),
        discount: { type: 'amount', value: 0 },
        payment: { paymentType: 'cash', statusIntent: 'paid' },
      },
      { isAdmin: true, actor: { role: 'admin' } }
    );
    await expect(
      executeCompleteOrder(
        db,
        uid,
        {
          idempotencyKey: idem,
          lines: lineCoffee(2),
          discount: { type: 'amount', value: 0 },
          payment: { paymentType: 'cash', statusIntent: 'paid' },
        },
        { isAdmin: true, actor: { role: 'admin' } }
      )
    ).rejects.toThrow(/idempotency/);
  });

  test('2 debt sale updates customer balance', async () => {
    if (!emulatorUp) return;
    const res = await executeCompleteOrder(
      db,
      uid,
      {
        idempotencyKey: `debt_${Date.now()}`,
        customerId: 'c1',
        lines: lineCoffee(1),
        discount: { type: 'amount', value: 0 },
        payment: { paymentType: 'debt', statusIntent: 'unpaid' },
      },
      { isAdmin: true, actor: { role: 'admin' } }
    );
    expect(res.total).toBe(10);
    const cust = (await db.doc(`users/${uid}/customers/c1`).get()).data();
    expect(cust.balance).toBe(10);
    const moves = await db.collection(`users/${uid}/cashMovements`).get();
    expect(moves.size).toBe(0);
  });

  test('8 insufficient stock rolls back (no order created)', async () => {
    if (!emulatorUp) return;
    await expect(
      executeCompleteOrder(
        db,
        uid,
        {
          idempotencyKey: `stock_${Date.now()}`,
          lines: lineCoffee(100),
          discount: { type: 'amount', value: 0 },
          payment: { paymentType: 'cash', statusIntent: 'paid' },
        },
        { isAdmin: true, actor: { role: 'admin' } }
      )
    ).rejects.toThrow(/مخزون/);
    const orders = await db.collection(`users/${uid}/orders`).get();
    expect(orders.size).toBe(0);
    const product = (await db.doc(`users/${uid}/products/p1`).get()).data();
    expect(product.stock).toBe(5);
  });

  test('13 cancel cash sale refunds cash movement', async () => {
    if (!emulatorUp) return;
    const res = await executeCompleteOrder(
      db,
      uid,
      {
        idempotencyKey: `cx_${Date.now()}`,
        lines: lineCoffee(1),
        discount: { type: 'amount', value: 0 },
        payment: { paymentType: 'cash', statusIntent: 'paid' },
      },
      { isAdmin: true, actor: { role: 'admin' } }
    );
    await executeCancelOrder(db, uid, { orderId: res.orderId }, { actor: { role: 'admin' } });
    const order = (await db.doc(`users/${uid}/orders/${res.orderId}`).get()).data();
    expect(order.status).toBe('cancelled');
    const product = (await db.doc(`users/${uid}/products/p1`).get()).data();
    expect(product.stock).toBe(5);
    const moves = await db.collection(`users/${uid}/cashMovements`).get();
    const types = moves.docs.map((d) => d.data().type);
    expect(types).toContain('sale');
    expect(types).toContain('refund');
  });

  test('3 mixed sale: cash movement and debt balance', async () => {
    if (!emulatorUp) return;
    const res = await executeCompleteOrder(
      db,
      uid,
      {
        idempotencyKey: `mix_${Date.now()}`,
        customerId: 'c1',
        lines: lineCoffee(2),
        discount: { type: 'amount', value: 0 },
        payment: { paymentType: 'mixed', cashPaid: 12, statusIntent: 'partial' },
      },
      { isAdmin: true, actor: { role: 'admin' } }
    );
    expect(res.total).toBe(20);
    const order = (await db.doc(`users/${uid}/orders/${res.orderId}`).get()).data();
    expect(order.cashPaid).toBe(12);
    expect(order.debtAmount).toBe(8);
    const cust = (await db.doc(`users/${uid}/customers/c1`).get()).data();
    expect(cust.balance).toBe(8);
    const moves = await db.collection(`users/${uid}/cashMovements`).get();
    expect(moves.size).toBe(1);
    expect(moves.docs[0].data().amount).toBe(12);
  });

  test('5 client line price ignored — server catalog price used', async () => {
    if (!emulatorUp) return;
    const res = await executeCompleteOrder(
      db,
      uid,
      {
        idempotencyKey: `price_${Date.now()}`,
        lines: [{ productId: 'p1', quantity: 1, lineId: 'p1', unitPrice: 0.01, price: 0.01 }],
        discount: { type: 'amount', value: 0 },
        payment: { paymentType: 'cash', statusIntent: 'paid' },
      },
      { isAdmin: true, actor: { role: 'admin' } }
    );
    expect(res.total).toBe(10);
    const order = (await db.doc(`users/${uid}/orders/${res.orderId}`).get()).data();
    expect(order.items[0].price).toBe(10);
    expect(order.total).toBe(10);
  });

  test('4 compliment without admin is rejected', async () => {
    if (!emulatorUp) return;
    await expect(
      executeCompleteOrder(
        db,
        uid,
        {
          idempotencyKey: `comp_${Date.now()}`,
          lines: lineCoffee(1),
          discount: { type: 'amount', value: 0 },
          payment: { paymentType: 'compliment', statusIntent: 'paid' },
        },
        { isAdmin: false, actor: { role: 'cashier' } }
      )
    ).rejects.toThrow(/مدير|compliment|مجاني/i);
    const orders = await db.collection(`users/${uid}/orders`).get();
    expect(orders.size).toBe(0);
  });

  test('16 cancel debt sale reverses balance only', async () => {
    if (!emulatorUp) return;
    const res = await executeCompleteOrder(
      db,
      uid,
      {
        idempotencyKey: `debtcx_${Date.now()}`,
        customerId: 'c1',
        lines: lineCoffee(2),
        discount: { type: 'amount', value: 0 },
        payment: { paymentType: 'debt', statusIntent: 'unpaid' },
      },
      { isAdmin: true, actor: { role: 'admin' } }
    );
    await executeCancelOrder(db, uid, { orderId: res.orderId }, { actor: { role: 'admin' } });
    const cust = (await db.doc(`users/${uid}/customers/c1`).get()).data();
    expect(cust.balance).toBe(0);
    const moves = await db.collection(`users/${uid}/cashMovements`).get();
    expect(moves.size).toBe(0);
    const product = (await db.doc(`users/${uid}/products/p1`).get()).data();
    expect(product.stock).toBe(5);
  });

  test('17 double cancel is safe', async () => {
    if (!emulatorUp) return;
    const res = await executeCompleteOrder(
      db,
      uid,
      {
        idempotencyKey: `dc_${Date.now()}`,
        lines: lineCoffee(1),
        discount: { type: 'amount', value: 0 },
        payment: { paymentType: 'cash', statusIntent: 'paid' },
      },
      { isAdmin: true, actor: { role: 'admin' } }
    );
    await executeCancelOrder(db, uid, { orderId: res.orderId }, { actor: { role: 'admin' } });
    const again = await executeCancelOrder(db, uid, { orderId: res.orderId }, { actor: { role: 'admin' } });
    expect(again.alreadyCancelled).toBe(true);
    const refunds = (await db.collection(`users/${uid}/cashMovements`).where('type', '==', 'refund').get()).size;
    expect(refunds).toBe(1);
  });
});

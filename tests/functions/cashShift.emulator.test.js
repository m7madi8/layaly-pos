/**
 * Cash shift lifecycle — Firestore emulator persistence tests.
 * Requires FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
 */
const admin = require('firebase-admin');
const { executeOpenCashShift, executeCloseCashShift, executeCashShiftMovement } = require('../../functions/lib/cashShiftEngine');
const { executeCompleteOrder, executeCancelOrder } = require('../../functions/lib/orderEngine');
const { computeExpectedCash } = require('../../functions/lib/cashShiftMath');

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
      db.collection('_probe').doc('cash').get(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2500)),
    ]);
    return true;
  } catch {
    return false;
  }
}

async function seedCatalog() {
  uid = `shift_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await db.doc(`users/${uid}`).set({ securityMode: 'legacy' });
  await db.doc(`users/${uid}/products/p1`).set({
    name: 'قهوة',
    price: 10,
    cost: 2,
    stock: 50,
    productType: 'standard',
    addOns: [],
  });
  await db.doc(`users/${uid}/customers/c1`).set({ name: 'عميل', balance: 0, transactions: [] });
  await db.doc(`users/${uid}/counters/orders`).set({ count: 0 });
  await db.doc(`users/${uid}/vault/main`).set({ balance: 0, totalCapitalIn: 0 });
}

function lineCoffee(qty = 1) {
  return [{ productId: 'p1', quantity: qty, lineId: 'p1' }];
}

const actor = { role: 'admin' };

describe('cash shift lifecycle (Firestore emulator)', () => {
  jest.setTimeout(45000);

  beforeAll(async () => {
    emulatorUp = await probeEmulator();
  });

  afterAll(async () => {
    if (admin.apps.length) await Promise.all(admin.apps.map((app) => app.delete()));
  });

  beforeEach(async () => {
    if (!emulatorUp) return;
    await seedCatalog();
  });

  test('environment gate', () => {
    if (!EMULATOR_HOST) {
      throw new Error('FIRESTORE_EMULATOR_HOST not set — see docs/EMULATOR-TEST-SETUP.md');
    }
    if (!emulatorUp) {
      throw new Error('Firestore emulator not reachable');
    }
    expect(emulatorUp).toBe(true);
  });

  test('1 open shift with valid opening balance', async () => {
    if (!emulatorUp) return;
    const { shiftId } = await executeOpenCashShift(db, uid, { openingBalance: 500, shiftPeriod: 1 }, { actor });
    const shift = (await db.doc(`users/${uid}/cashShifts/${shiftId}`).get()).data();
    expect(shift.status).toBe('open');
    expect(shift.openingBalance).toBe(500);
    expect(shift.expectedClosingBalance).toBe(500);
  });

  test('2 reject negative opening balance', async () => {
    if (!emulatorUp) return;
    await expect(executeOpenCashShift(db, uid, { openingBalance: -10 }, { actor })).rejects.toThrow(/رصيد/);
    const shifts = await db.collection(`users/${uid}/cashShifts`).get();
    expect(shifts.size).toBe(0);
  });

  test('4 reject second open shift', async () => {
    if (!emulatorUp) return;
    await executeOpenCashShift(db, uid, { openingBalance: 100 }, { actor });
    await expect(executeOpenCashShift(db, uid, { openingBalance: 200 }, { actor })).rejects.toThrow(/مفتوحة/);
    const open = await db.collection(`users/${uid}/cashShifts`).where('status', '==', 'open').get();
    expect(open.size).toBe(1);
  });

  test('open idempotency prevents duplicate shifts', async () => {
    if (!emulatorUp) return;
    const key = `open_${Date.now()}`;
    const a = await executeOpenCashShift(db, uid, { openingBalance: 50, idempotencyKey: key }, { actor });
    const b = await executeOpenCashShift(db, uid, { openingBalance: 50, idempotencyKey: key }, { actor });
    expect(b.duplicate).toBe(true);
    expect(b.shiftId).toBe(a.shiftId);
    expect((await db.collection(`users/${uid}/cashShifts`).get()).size).toBe(1);
  });

  test('5 cash sale hits open shift', async () => {
    if (!emulatorUp) return;
    const { shiftId } = await executeOpenCashShift(db, uid, { openingBalance: 100 }, { actor });
    await executeCompleteOrder(
      db,
      uid,
      {
        idempotencyKey: `s_${Date.now()}`,
        lines: lineCoffee(2),
        discount: { type: 'amount', value: 0 },
        payment: { paymentType: 'cash', statusIntent: 'paid' },
      },
      { isAdmin: true, actor }
    );
    const shift = (await db.doc(`users/${uid}/cashShifts/${shiftId}`).get()).data();
    expect(shift.cashSales).toBe(20);
    expect(shift.expectedClosingBalance).toBe(120);
    const moves = await db.collection(`users/${uid}/cashMovements`).where('shiftId', '==', shiftId).get();
    expect(moves.size).toBe(1);
    expect(moves.docs[0].data().type).toBe('sale');
  });

  test('6 mixed payment records cash portion only', async () => {
    if (!emulatorUp) return;
    await executeOpenCashShift(db, uid, { openingBalance: 0 }, { actor });
    await executeCompleteOrder(
      db,
      uid,
      {
        idempotencyKey: `mix_${Date.now()}`,
        customerId: 'c1',
        lines: lineCoffee(2),
        payment: { paymentType: 'mixed', cashPaid: 12 },
      },
      { isAdmin: true, actor }
    );
    const shift = (await db.collection(`users/${uid}/cashShifts`).where('status', '==', 'open').get()).docs[0];
    expect(shift.data().cashSales).toBe(12);
    expect(shift.data().expectedClosingBalance).toBe(12);
  });

  test('7 debt and compliment add no cash sales', async () => {
    if (!emulatorUp) return;
    await executeOpenCashShift(db, uid, { openingBalance: 0 }, { actor });
    await executeCompleteOrder(
      db,
      uid,
      {
        idempotencyKey: `debt_${Date.now()}`,
        customerId: 'c1',
        lines: lineCoffee(1),
        payment: { paymentType: 'debt', statusIntent: 'unpaid' },
      },
      { isAdmin: true, actor }
    );
    await executeCompleteOrder(
      db,
      uid,
      {
        idempotencyKey: `comp_${Date.now()}`,
        lines: lineCoffee(1),
        payment: { paymentType: 'compliment', statusIntent: 'paid' },
      },
      { isAdmin: true, actor }
    );
    const shift = (await db.collection(`users/${uid}/cashShifts`).where('status', '==', 'open').get()).docs[0];
    expect(shift.data().cashSales).toBe(0);
    expect((await db.collection(`users/${uid}/cashMovements`).get()).size).toBe(0);
  });

  test('8 cancel refund recorded once', async () => {
    if (!emulatorUp) return;
    await executeOpenCashShift(db, uid, { openingBalance: 0 }, { actor });
    const res = await executeCompleteOrder(
      db,
      uid,
      {
        idempotencyKey: `cr_${Date.now()}`,
        lines: lineCoffee(1),
        payment: { paymentType: 'cash', statusIntent: 'paid' },
      },
      { isAdmin: true, actor }
    );
    await executeCancelOrder(db, uid, { orderId: res.orderId }, { actor });
    await executeCancelOrder(db, uid, { orderId: res.orderId }, { actor });
    const refunds = await db.collection(`users/${uid}/cashMovements`).where('type', '==', 'refund').get();
    expect(refunds.size).toBe(1);
  });

  test('9 deposit and withdrawal', async () => {
    if (!emulatorUp) return;
    const { shiftId } = await executeOpenCashShift(db, uid, { openingBalance: 100 }, { actor });
    await executeCashShiftMovement(db, uid, { shiftId, type: 'deposit', amount: 50, reason: 'تعبئة' }, { actor });
    await executeCashShiftMovement(db, uid, { shiftId, type: 'withdrawal', amount: 30, reason: 'مصروف' }, { actor });
    const shift = (await db.doc(`users/${uid}/cashShifts/${shiftId}`).get()).data();
    expect(shift.cashDeposits).toBe(50);
    expect(shift.cashWithdrawals).toBe(30);
    expect(shift.expectedClosingBalance).toBe(computeExpectedCash(shift));
  });

  test('10 expected closing on close', async () => {
    if (!emulatorUp) return;
    const { shiftId } = await executeOpenCashShift(db, uid, { openingBalance: 100 }, { actor });
    await executeCashShiftMovement(db, uid, { shiftId, type: 'deposit', amount: 20 }, { actor });
    await executeCloseCashShift(db, uid, { shiftId, actualClosingBalance: 120 }, { actor });
    const shift = (await db.doc(`users/${uid}/cashShifts/${shiftId}`).get()).data();
    expect(shift.status).toBe('closed');
    expect(shift.actualClosingBalance).toBe(120);
    expect(shift.expectedClosingBalance).toBe(120);
    expect(shift.difference).toBe(0);
    const vault = (await db.doc(`users/${uid}/vault/main`).get()).data();
    expect(vault.balance).toBe(0);
  });

  test('11 reject cash sale without open shift', async () => {
    if (!emulatorUp) return;
    await expect(
      executeCompleteOrder(
        db,
        uid,
        {
          idempotencyKey: `nos_${Date.now()}`,
          lines: lineCoffee(1),
          payment: { paymentType: 'cash', statusIntent: 'paid' },
        },
        { isAdmin: true, actor }
      )
    ).rejects.toThrow(/وردية/);
    expect((await db.collection(`users/${uid}/orders`).get()).size).toBe(0);
  });

  test('11b reject sale on closed shift', async () => {
    if (!emulatorUp) return;
    const { shiftId } = await executeOpenCashShift(db, uid, { openingBalance: 0 }, { actor });
    await executeCloseCashShift(db, uid, { shiftId, actualClosingBalance: 0 }, { actor });
    await expect(
      executeCompleteOrder(
        db,
        uid,
        {
          idempotencyKey: `cls_${Date.now()}`,
          lines: lineCoffee(1),
          payment: { paymentType: 'cash', statusIntent: 'paid' },
        },
        { isAdmin: true, actor }
      )
    ).rejects.toThrow(/وردية/);
  });

  test('14 movement idempotency', async () => {
    if (!emulatorUp) return;
    const { shiftId } = await executeOpenCashShift(db, uid, { openingBalance: 0 }, { actor });
    const key = `mov_${Date.now()}`;
    const a = await executeCashShiftMovement(
      db,
      uid,
      { shiftId, type: 'deposit', amount: 25, idempotencyKey: key },
      { actor }
    );
    const b = await executeCashShiftMovement(
      db,
      uid,
      { shiftId, type: 'deposit', amount: 25, idempotencyKey: key },
      { actor }
    );
    expect(b.duplicate).toBe(true);
    expect(b.movementId).toBe(a.movementId);
    expect((await db.collection(`users/${uid}/cashMovements`).get()).size).toBe(1);
  });

  test('15 failed movement leaves shift unchanged', async () => {
    if (!emulatorUp) return;
    const { shiftId } = await executeOpenCashShift(db, uid, { openingBalance: 10 }, { actor });
    await expect(
      executeCashShiftMovement(db, uid, { shiftId, type: 'withdrawal', amount: 999 }, { actor })
    ).rejects.toThrow(/سالب/);
    const shift = (await db.doc(`users/${uid}/cashShifts/${shiftId}`).get()).data();
    expect(shift.cashWithdrawals).toBe(0);
    expect(shift.expectedClosingBalance).toBe(10);
    expect((await db.collection(`users/${uid}/cashMovements`).get()).size).toBe(0);
  });
});

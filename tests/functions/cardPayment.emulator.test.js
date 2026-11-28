/**
 * Card payment lifecycle — Firestore emulator (admin SDK / trusted engine).
 */
const admin = require('firebase-admin');
const { executeOpenCashShift, executeCloseCashShift } = require('../../functions/lib/cashShiftEngine');
const { executeCompleteOrder, executeCancelOrder } = require('../../functions/lib/orderEngine');

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
      db.collection('_probe').doc('card').get(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2500)),
    ]);
    return true;
  } catch {
    return false;
  }
}

async function seedCatalog() {
  uid = `card_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await db.doc(`users/${uid}`).set({ securityMode: 'legacy' });
  await db.doc(`users/${uid}/products/p1`).set({
    name: 'قهوة',
    price: 15,
    cost: 2,
    stock: 100,
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

describe('card payment lifecycle (Firestore emulator)', () => {
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
    if (!EMULATOR_HOST) throw new Error('FIRESTORE_EMULATOR_HOST not set');
    if (!emulatorUp) throw new Error('Firestore emulator not reachable');
    expect(emulatorUp).toBe(true);
  });

  test('card sale increments cardSales not cashSales', async () => {
    if (!emulatorUp) return;
    const { shiftId } = await executeOpenCashShift(
      db,
      uid,
      { onDutyStaffIds: ['on-duty-1'], openingBalance: 0 },
      { actor }
    );
    await executeCompleteOrder(
      db,
      uid,
      {
        idempotencyKey: `card_${Date.now()}`,
        lines: lineCoffee(2),
        payment: { paymentType: 'card', statusIntent: 'paid' },
      },
      { isAdmin: true, actor }
    );
    const shift = (await db.doc(`users/${uid}/cashShifts/${shiftId}`).get()).data();
    expect(shift.cardSales).toBe(30);
    expect(shift.cardSaleCount).toBe(1);
    expect(shift.cashSales).toBe(0);
    expect((await db.collection(`users/${uid}/cashMovements`).get()).size).toBe(0);
  });

  test('card order cancel does not add cash refund movement', async () => {
    if (!emulatorUp) return;
    const { shiftId } = await executeOpenCashShift(
      db,
      uid,
      { onDutyStaffIds: ['on-duty-1'], openingBalance: 0 },
      { actor }
    );
    const res = await executeCompleteOrder(
      db,
      uid,
      {
        idempotencyKey: `cardc_${Date.now()}`,
        lines: lineCoffee(1),
        payment: { paymentType: 'card', statusIntent: 'paid' },
      },
      { isAdmin: true, actor }
    );
    await executeCancelOrder(db, uid, { orderId: res.orderId }, { actor });
    const shift = (await db.doc(`users/${uid}/cashShifts/${shiftId}`).get()).data();
    expect(shift.cashRefunds).toBe(0);
    expect(shift.cardSales).toBe(0);
    expect(shift.cardSaleCount).toBe(0);
    const order = (await db.doc(`users/${uid}/orders/${res.orderId}`).get()).data();
    expect(order.status).toBe('cancelled');
  });

  test('shift close with only card sales leaves vault unchanged', async () => {
    if (!emulatorUp) return;
    const { shiftId } = await executeOpenCashShift(
      db,
      uid,
      { onDutyStaffIds: ['on-duty-1'], openingBalance: 0, shiftPeriod: 1 },
      { actor }
    );
    await executeCompleteOrder(
      db,
      uid,
      {
        idempotencyKey: `cardclose_${Date.now()}`,
        lines: lineCoffee(1),
        payment: { paymentType: 'card', statusIntent: 'paid' },
      },
      { isAdmin: true, actor }
    );
    await executeCloseCashShift(db, uid, { shiftId, actualClosingBalance: 0 }, { actor });
    const vault = (await db.doc(`users/${uid}/vault/main`).get()).data();
    expect(vault.balance).toBe(0);
    const shift = (await db.doc(`users/${uid}/cashShifts/${shiftId}`).get()).data();
    expect(shift.vaultTransferOnClose).toBe(0);
    expect(shift.vaultCloseMovementId).toBeNull();
  });

  test('first shift cash surplus uses deterministic vault movement id', async () => {
    if (!emulatorUp) return;
    const { shiftId } = await executeOpenCashShift(
      db,
      uid,
      { onDutyStaffIds: ['on-duty-1'], openingBalance: 100, shiftPeriod: 1 },
      { actor }
    );
    await executeCloseCashShift(db, uid, { shiftId, actualClosingBalance: 80 }, { actor });
    const movId = `from_cash_close_${shiftId}`;
    const mov = await db.doc(`users/${uid}/vaultMovements/${movId}`).get();
    expect(mov.exists).toBe(true);
    expect(mov.data().amount).toBe(20);
    const shift = (await db.doc(`users/${uid}/cashShifts/${shiftId}`).get()).data();
    expect(shift.vaultCloseMovementId).toBe(movId);
  });
});
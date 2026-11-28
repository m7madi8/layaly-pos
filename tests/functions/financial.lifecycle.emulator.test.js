/**
 * End-to-end financial flows on Firestore emulator (trusted engine paths).
 */
const admin = require('firebase-admin');
const { executeOpenCashShift, executeCloseCashShift } = require('../../functions/lib/cashShiftEngine');
const { executeCompleteOrder, executeCancelOrder } = require('../../functions/lib/orderEngine');
const { executePartialOrderReturn } = require('../../functions/lib/partialOrderReturnEngine');
const { closeVaultMovementId, closeCashDrawerMovementId } = require('../../functions/lib/vaultCloseIds');

const PROJECT_ID = 'layali-rules-test';
const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;

let db;
let uid;

async function probe() {
  if (!EMULATOR_HOST) return false;
  try {
    if (!admin.apps.length) admin.initializeApp({ projectId: PROJECT_ID });
    db = admin.firestore();
    await db.collection('_probe').doc('finlife').get();
    return true;
  } catch {
    return false;
  }
}

async function seed() {
  uid = `life_${Date.now()}`;
  await db.doc(`users/${uid}`).set({ securityMode: 'legacy' });
  await db.doc(`users/${uid}/products/p1`).set({
    name: 'قهوة',
    price: 20,
    cost: 2,
    stock: 100,
    productType: 'standard',
    addOns: [],
  });
  await db.doc(`users/${uid}/customers/c1`).set({ name: 'عميل', balance: 0, transactions: [] });
  await db.doc(`users/${uid}/counters/orders`).set({ count: 0 });
  await db.doc(`users/${uid}/vault/main`).set({ balance: 0, totalCapitalIn: 0 });
}

const actor = { role: 'admin' };
const line = (qty = 1) => [{ productId: 'p1', quantity: qty, lineId: 'p1' }];

describe('financial lifecycle (emulator)', () => {
  jest.setTimeout(120000);
  let up = false;

  beforeAll(async () => {
    up = await probe();
    if (!up) throw new Error('Firestore emulator required');
  });

  afterAll(async () => {
    if (admin.apps.length) await Promise.all(admin.apps.map((a) => a.delete()));
  });

  beforeEach(async () => {
    await seed();
  });

  test('cash sale updates shift cashSales', async () => {
    const { shiftId } = await executeOpenCashShift(db, uid, { onDutyStaffIds: ['s1'], openingBalance: 0 }, { actor });
    await executeCompleteOrder(
      db,
      uid,
      { idempotencyKey: `cash_${Date.now()}`, lines: line(1), payment: { paymentType: 'cash', statusIntent: 'paid' } },
      { isAdmin: true, actor }
    );
    const shift = (await db.doc(`users/${uid}/cashShifts/${shiftId}`).get()).data();
    expect(shift.cashSales).toBe(20);
  });

  test('debt sale increases customer balance', async () => {
    await executeOpenCashShift(db, uid, { onDutyStaffIds: ['s1'], openingBalance: 0 }, { actor });
    await executeCompleteOrder(
      db,
      uid,
      {
        idempotencyKey: `debt_${Date.now()}`,
        lines: line(1),
        payment: { paymentType: 'debt', statusIntent: 'debt' },
        customerId: 'c1',
      },
      { isAdmin: true, actor }
    );
    const cust = (await db.doc(`users/${uid}/customers/c1`).get()).data();
    expect(cust.balance).toBe(20);
  });

  test('close shift with vault creates deterministic movement ids', async () => {
    const { shiftId } = await executeOpenCashShift(
      db,
      uid,
      { onDutyStaffIds: ['s1'], openingBalance: 100, shiftPeriod: 1 },
      { actor }
    );
    await executeCloseCashShift(db, uid, { shiftId, actualClosingBalance: 80 }, { actor });
    const vaultMov = await db.doc(`users/${uid}/vaultMovements/${closeVaultMovementId(shiftId)}`).get();
    const drawerMov = await db.doc(`users/${uid}/cashMovements/${closeCashDrawerMovementId(shiftId)}`).get();
    expect(vaultMov.exists).toBe(true);
    expect(drawerMov.exists).toBe(true);
    expect(vaultMov.data().amount).toBe(20);
  });

  test('two-shift day: shift1 vault then shift2 zero vault', async () => {
    const s1 = await executeOpenCashShift(db, uid, { onDutyStaffIds: ['s1'], openingBalance: 50, shiftPeriod: 1 }, { actor });
    await executeCloseCashShift(db, uid, { shiftId: s1.shiftId, actualClosingBalance: 40 }, { actor });
    const s2 = await executeOpenCashShift(db, uid, { onDutyStaffIds: ['s1'], openingBalance: 0, shiftPeriod: 2 }, { actor });
    await executeCompleteOrder(
      db,
      uid,
      { idempotencyKey: `c2_${Date.now()}`, lines: line(1), payment: { paymentType: 'card', statusIntent: 'paid' } },
      { isAdmin: true, actor }
    );
    await executeCloseCashShift(db, uid, { shiftId: s2.shiftId, actualClosingBalance: 0 }, { actor });
    const sh2 = (await db.doc(`users/${uid}/cashShifts/${s2.shiftId}`).get()).data();
    expect(sh2.vaultTransferOnClose).toBe(0);
    expect(sh2.cardSales).toBe(20);
  });

  test('duplicate cancel is idempotent on order', async () => {
    await executeOpenCashShift(db, uid, { onDutyStaffIds: ['s1'], openingBalance: 0 }, { actor });
    const res = await executeCompleteOrder(
      db,
      uid,
      { idempotencyKey: `dup_${Date.now()}`, lines: line(1), payment: { paymentType: 'card', statusIntent: 'paid' } },
      { isAdmin: true, actor }
    );
    await executeCancelOrder(db, uid, { orderId: res.orderId }, { actor });
    const again = await executeCancelOrder(db, uid, { orderId: res.orderId }, { actor });
    expect(again.alreadyCancelled).toBe(true);
  });

  test('partial cash refund uses open shift', async () => {
    const { shiftId } = await executeOpenCashShift(db, uid, { onDutyStaffIds: ['s1'], openingBalance: 0 }, { actor });
    const res = await executeCompleteOrder(
      db,
      uid,
      { idempotencyKey: `pr_${Date.now()}`, lines: line(2), payment: { paymentType: 'cash', statusIntent: 'paid' } },
      { isAdmin: true, actor }
    );
    await executePartialOrderReturn(
      db,
      uid,
      {
        orderId: res.orderId,
        productId: 'p1',
        quantity: 1,
        refundAmount: 20,
        refundCash: true,
        reason: 'عينة',
        shiftId,
      },
      { actor }
    );
    const shift = (await db.doc(`users/${uid}/cashShifts/${shiftId}`).get()).data();
    expect(shift.cashRefunds).toBe(20);
  });
});
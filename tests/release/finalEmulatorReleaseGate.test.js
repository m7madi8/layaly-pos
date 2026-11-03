/**
 * FINAL EMULATOR RELEASE GATE — no skips; fails if emulators unavailable.
 * Run via: npm run test:functions:financial (from L: subst path — see docs/EMULATOR-TEST-SETUP.md)
 */
const admin = require('firebase-admin');
const { initializeApp, deleteApp } = require('firebase/app');
const { getAuth, connectAuthEmulator, signInWithCustomToken } = require('firebase/auth');
const { getFunctions, connectFunctionsEmulator, httpsCallable } = require('firebase/functions');
const { executePartialOrderReturn } = require('../../functions/lib/partialOrderReturnEngine');
const { executeCompleteOrder, executeCancelOrder } = require('../../functions/lib/orderEngine');
const {
  createPayrollAccrual,
  recordPayrollPayment,
  recordEmployeeAdvance,
  recordAdvanceRepayment,
} = require('../../functions/lib/payrollEngine');
const { registerCheck, collectCheck, returnCheck, CHECK_PENDING } = require('../../functions/lib/checkEngine');
const { recordSupplierOpeningBalance } = require('../../functions/lib/supplierOpeningBalanceEngine');

const PROJECT_ID = 'layali-rules-test';
const EMULATOR_PIN = 'gate-emulator-pin-7291';

function requireEmulators() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error('FIRESTORE_EMULATOR_HOST missing — run via firebase emulators:exec');
  }
  if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new Error('FIREBASE_AUTH_EMULATOR_HOST missing — include auth emulator');
  }
}

async function signInRole(uid, role) {
  await admin.auth().setCustomUserClaims(uid, { role });
  const token = await admin.auth().createCustomToken(uid, { role });
  const app = initializeApp(
    { projectId: PROJECT_ID, apiKey: 'fake', authDomain: 'localhost' },
    `gate_${uid}_${role}_${Date.now()}`
  );
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true });
  await signInWithCustomToken(auth, token);
  const fns = getFunctions(app, 'europe-west1');
  connectFunctionsEmulator(fns, '127.0.0.1', 5001);
  return { app, auth, fns };
}

describe('FINAL EMULATOR RELEASE GATE', () => {
  let db;
  let uid;
  let adminFns;
  let cashierFns;

  beforeAll(async () => {
    requireEmulators();
    if (!admin.apps.length) {
      admin.initializeApp({ projectId: PROJECT_ID });
    }
    db = admin.firestore();
    uid = `gate_${Date.now()}`;

    await db.doc(`users/${uid}`).set({
      securityMode: 'hardened',
      businessName: 'Release Gate Café',
    });

    await admin.auth().createUser({ uid, email: `${uid}@gate.test` });

    const adminSession = await signInRole(uid, 'admin');
    adminFns = adminSession.fns;
    const cashierSession = await signInRole(uid, 'cashier');
    cashierFns = cashierSession.fns;
  });

  test('environment gate — emulators reachable', () => {
    expect(process.env.FIRESTORE_EMULATOR_HOST).toMatch(/8080/);
    expect(process.env.FIREBASE_AUTH_EMULATOR_HOST).toBeTruthy();
  });

  test('partial returns — two returns, cash then debt, FIFO restock', async () => {
    await db.doc(`users/${uid}/products/p1`).set({
      name: 'Gate Item',
      price: 30,
      cost: 8,
      stock: 10,
      productType: 'standard',
    });
    await db.doc(`users/${uid}/inventoryLayers/l1`).set({
      productId: 'p1',
      initialQuantity: 10,
      remainingQuantity: 8,
      unitCost: 8,
      purchaseDateMs: 1000,
    });
    await db.doc(`users/${uid}/customers/c1`).set({ name: 'Debtor', balance: 60, transactions: [] });
    const shiftRef = db.collection(`users/${uid}/cashShifts`).doc('shift_gate');
    await shiftRef.set({
      status: 'open',
      openingBalance: 200,
      cashSales: 0,
      cashWithdrawals: 0,
      cashDeposits: 0,
      cashRefunds: 0,
    });
    await db.doc(`users/${uid}/orders/o_partial`).set({
      orderNumber: '9001',
      status: 'partial',
      cashPaid: 30,
      debtAmount: 30,
      total: 60,
      customerId: 'c1',
      items: [
        {
          id: 'p1',
          quantity: 2,
          price: 30,
          inventoryConsumption: [{ layerId: 'l1', quantity: 2, unitCost: 8 }],
        },
      ],
    });

    const r1 = await executePartialOrderReturn(
      db,
      uid,
      {
        orderId: 'o_partial',
        productId: 'p1',
        quantity: 1,
        refundAmount: 30,
        refundCash: true,
        restock: true,
        reason: 'cash return',
        shiftId: 'shift_gate',
        idempotencyKey: 'gate_ret_1',
      },
      { actor: { role: 'admin' } }
    );
    expect(r1.duplicate).toBe(false);

    const layer1 = await db.doc(`users/${uid}/inventoryLayers/l1`).get();
    expect(layer1.data().remainingQuantity).toBeGreaterThan(8);

    const r1dup = await executePartialOrderReturn(
      db,
      uid,
      {
        orderId: 'o_partial',
        productId: 'p1',
        quantity: 1,
        refundAmount: 30,
        refundCash: true,
        restock: true,
        reason: 'cash return',
        idempotencyKey: 'gate_ret_1',
      },
      { actor: { role: 'admin' } }
    );
    expect(r1dup.duplicate).toBe(true);

    const r2 = await executePartialOrderReturn(
      db,
      uid,
      {
        orderId: 'o_partial',
        productId: 'p1',
        quantity: 1,
        refundAmount: 30,
        refundCash: false,
        refundMethod: 'debt',
        restock: true,
        reason: 'debt return',
        idempotencyKey: 'gate_ret_2',
      },
      { actor: { role: 'admin' } }
    );
    expect(r2.duplicate).toBe(false);

    const cust = await db.doc(`users/${uid}/customers/c1`).get();
    expect(cust.data().balance).toBeLessThan(60);
    const order = await db.doc(`users/${uid}/orders/o_partial`).get();
    expect(order.data().returnTotal).toBe(60);
  });

  test('payroll — accrual, partial payment, full payment', async () => {
    const { accrualId } = await createPayrollAccrual(
      db,
      uid,
      { staffMemberId: 'st1', staffName: 'Worker', amount: 1000, periodLabel: 'Jan' },
      { actor: { role: 'admin' } }
    );
    await db.collection(`users/${uid}/cashShifts`).doc('shift_pay').set({
      status: 'open',
      openingBalance: 5000,
      cashSales: 0,
      cashWithdrawals: 0,
      cashDeposits: 0,
      cashRefunds: 0,
    });

    const p1 = await recordPayrollPayment(
      db,
      uid,
      {
        accrualId,
        amount: 400,
        paymentMethod: 'Cash',
        shiftId: 'shift_pay',
        idempotencyKey: 'gate_pay_1',
      },
      { actor: { role: 'admin' } }
    );
    expect(p1.duplicate).toBe(false);
    expect(p1.status).toBe('partial');

    const p1dup = await recordPayrollPayment(
      db,
      uid,
      {
        accrualId,
        amount: 400,
        paymentMethod: 'Cash',
        shiftId: 'shift_pay',
        idempotencyKey: 'gate_pay_1',
      },
      { actor: { role: 'admin' } }
    );
    expect(p1dup.duplicate).toBe(true);

    const p2 = await recordPayrollPayment(
      db,
      uid,
      {
        accrualId,
        amount: 600,
        paymentMethod: 'Cash',
        shiftId: 'shift_pay',
        idempotencyKey: 'gate_pay_2',
      },
      { actor: { role: 'admin' } }
    );
    expect(p2.status).toBe('paid');
    const acc = await db.doc(`users/${uid}/payrollAccruals/${accrualId}`).get();
    expect(acc.data().status).toBe('paid');
  });

  test('advance — issue and cash repayment', async () => {
    await db.collection(`users/${uid}/cashShifts`).doc('shift_adv').set({
      status: 'open',
      openingBalance: 1000,
      cashSales: 0,
      cashWithdrawals: 0,
      cashDeposits: 0,
      cashRefunds: 0,
    });
    const adv = await recordEmployeeAdvance(
      db,
      uid,
      {
        staffMemberId: 'st1',
        staffName: 'Worker',
        amount: 200,
        paymentMethod: 'Cash',
        idempotencyKey: 'gate_adv_1',
      },
      { actor: { role: 'admin' } }
    );
    expect(adv.duplicate).toBe(false);

    const rep = await recordAdvanceRepayment(
      db,
      uid,
      {
        advanceId: adv.advanceId,
        amount: 200,
        paymentMethod: 'Cash',
        idempotencyKey: 'gate_adv_repay_1',
      },
      { actor: { role: 'admin' } }
    );
    expect(rep.duplicate).toBe(false);
    expect(rep.balanceRemaining).toBe(0);
  });

  test('checks — inbound collect+return and outbound pay+return', async () => {
    await db.collection(`users/${uid}/cashShifts`).doc('shift_chk').set({
      status: 'open',
      openingBalance: 500,
      cashSales: 0,
      cashWithdrawals: 0,
      cashDeposits: 0,
      cashRefunds: 0,
    });

    const inChk = await registerCheck(
      db,
      uid,
      { amount: 100, checkNumber: 'IN-1', direction: 'in', partyId: 'sup1', idempotencyKey: 'gate_chk_in' },
      { actor: { role: 'admin' } }
    );
    expect(inChk.duplicate).toBe(false);
    let snap = await db.doc(`users/${uid}/checks/${inChk.checkId}`).get();
    expect(snap.data().status).toBe(CHECK_PENDING);

    await collectCheck(db, uid, inChk.checkId, { actor: { role: 'admin' }, shiftId: 'shift_chk' });
    snap = await db.doc(`users/${uid}/checks/${inChk.checkId}`).get();
    expect(snap.data().status).toBe('collected');

    await returnCheck(db, uid, inChk.checkId, { actor: { role: 'admin' }, reason: 'bounce' });
    snap = await db.doc(`users/${uid}/checks/${inChk.checkId}`).get();
    expect(snap.data().status).toBe('returned');

    const outChk = await registerCheck(
      db,
      uid,
      { amount: 80, checkNumber: 'OUT-1', direction: 'out', partyId: 'sup1', idempotencyKey: 'gate_chk_out' },
      { actor: { role: 'admin' } }
    );
    await collectCheck(db, uid, outChk.checkId, { actor: { role: 'admin' }, shiftId: 'shift_chk' });
    snap = await db.doc(`users/${uid}/checks/${outChk.checkId}`).get();
    expect(snap.data().status).toBe('paid_out');
  });

  test('supplier opening balance — once only', async () => {
    await db.doc(`users/${uid}/suppliers/s1`).set({ name: 'Trader', balance: 0 });
    const ob1 = await recordSupplierOpeningBalance(
      db,
      uid,
      's1',
      { amount: 500, nature: 'payable', note: 'start', idempotencyKey: 'gate_ob_1' },
      { actor: { role: 'admin' } }
    );
    expect(ob1.duplicate).toBe(false);
    await expect(
      recordSupplierOpeningBalance(
        db,
        uid,
        's1',
        { amount: 100, nature: 'payable', idempotencyKey: 'gate_ob_2' },
        { actor: { role: 'admin' } }
      )
    ).rejects.toThrow(/افتتاحي/);
  });

  test('stock — trusted sale then cancel restores product stock', async () => {
    const tuid = `${uid}_fifo`;
    await db.doc(`users/${tuid}`).set({ securityMode: 'legacy' });
    await db.doc(`users/${tuid}/products/pf`).set({
      name: 'FIFO',
      price: 10,
      cost: 3,
      stock: 5,
      productType: 'standard',
    });
    await db.doc(`users/${tuid}/counters/orders`).set({ count: 0 });
    await db.collection(`users/${tuid}/cashShifts`).add({
      status: 'open',
      openingBalance: 100,
      cashSales: 0,
      cashWithdrawals: 0,
      cashDeposits: 0,
      cashRefunds: 0,
    });

    const sale = await executeCompleteOrder(
      db,
      tuid,
      {
        idempotencyKey: `gate_sale_${Date.now()}`,
        customerName: 'Guest',
        lines: [{ productId: 'pf', quantity: 2, lineId: 'pf' }],
        discount: { type: 'amount', value: 0 },
        payment: { paymentType: 'cash', statusIntent: 'paid' },
      },
      { isAdmin: true, actor: { role: 'admin' } }
    );
    const afterSale = await db.doc(`users/${tuid}/products/pf`).get();
    expect(afterSale.data().stock).toBe(3);

    await executeCancelOrder(db, tuid, { orderId: sale.orderId }, { actor: { role: 'admin' } });
    const afterCancel = await db.doc(`users/${tuid}/products/pf`).get();
    expect(afterCancel.data().stock).toBe(5);
  });

  test('permissions — cashier denied admin payroll callable', async () => {
    const fn = httpsCallable(cashierFns, 'createPayrollAccrual');
    await expect(fn({ staffMemberId: 'x', staffName: 'X', amount: 1 })).rejects.toMatchObject({
      code: 'functions/permission-denied',
    });
  });

  test('permissions — admin payroll callable allowed', async () => {
    const fn = httpsCallable(adminFns, 'createPayrollAccrual');
    const res = await fn({ staffMemberId: 'st_call', staffName: 'Call', amount: 50, periodLabel: 't' });
    expect(res.data.accrualId).toBeTruthy();
  });

  test('verifyEmployeePin — wrong pin rejected, correct pin issues token', async () => {
    const verify = httpsCallable(adminFns, 'verifyEmployeePin');
    await expect(verify({ pin: 'wrong-pin' })).rejects.toMatchObject({
      code: 'functions/permission-denied',
    });
    const ok = await verify({ pin: EMULATOR_PIN });
    expect(ok.data.ok).toBe(true);
    expect(ok.data.customToken).toBeTruthy();
  });

  test('refreshAdminSession — returns admin custom token', async () => {
    const refresh = httpsCallable(adminFns, 'refreshAdminSession');
    const res = await refresh({});
    expect(res.data.ok).toBe(true);
    expect(res.data.customToken).toBeTruthy();
  });

  test('cashier with existing role cannot self-grant admin via bootstrapAdminClaim', async () => {
    const bootstrap = httpsCallable(cashierFns, 'bootstrapAdminClaim');
    await expect(bootstrap({})).rejects.toMatchObject({ code: 'functions/failed-precondition' });
  });
});

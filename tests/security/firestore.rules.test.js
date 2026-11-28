/**
 * Spark tenant membership rules — firestore.rules
 * Run: npm run test:rules (Firebase Emulator required)
 */
const fs = require('fs');
const path = require('path');
const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = require('@firebase/rules-unit-testing');

const PROJECT_ID = 'layali-rules-test';
const rulesPath = path.resolve(__dirname, '../../firestore.rules');

let testEnv;

beforeAll(async () => {
  const rules = fs.readFileSync(rulesPath, 'utf8');
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules, host: '127.0.0.1', port: 8080 },
  });
});

afterAll(async () => {
  if (testEnv) await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

function dbAs(uid) {
  return testEnv.authenticatedContext(uid).firestore();
}

/** Trusted fixture — not the operation under test. */
async function seedTenant(tenantId, adminUid, cashierUid = null) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await db.doc(`users/${tenantId}`).set({ businessName: 'Test Café', createdAtMs: Date.now() });
    await db.doc(`tenants/${tenantId}`).set({ schemaVersion: 1, inviteCode: 'JOIN1', createdAtMs: Date.now() });
    await db.doc(`tenants/${tenantId}/members/${adminUid}`).set({ role: 'admin', active: true });
    await db.doc(`userTenants/${adminUid}`).set({ tenantId, role: 'admin' });
    if (cashierUid) {
      await db.doc(`tenants/${tenantId}/members/${cashierUid}`).set({ role: 'cashier', active: true });
      await db.doc(`userTenants/${cashierUid}`).set({ tenantId, role: 'cashier' });
    }
  });
}

async function seedSupplier(tenantId, supplierId, data) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await db.doc(`users/${tenantId}/suppliers/${supplierId}`).set(data);
  });
}

async function seedShiftCloseFixtures(tenantId, adminUid, cashierUid, shiftId = 'shift-open') {
  await seedTenant(tenantId, adminUid, cashierUid);
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await db.doc(`users/${tenantId}/vault/main`).set({ balance: 50, totalCapitalIn: 50 });
    await db.doc(`users/${tenantId}/cashShifts/${shiftId}`).set({
      status: 'open',
      shiftPeriod: 1,
      cashSales: 0,
      openingBalance: 0,
    });
  });
}

function closeVaultMovementId(shiftId) {
  return `from_cash_close_${shiftId}`;
}

function closeCashDrawerMovementId(shiftId) {
  return `shift_close_vault_${shiftId}`;
}

/** Legitimate atomic shift close (mirror client order: shift → movement → vault). */
async function runLegitShiftClose(firestore, tenantId, shiftId, amount, prevBalance = 50) {
  const movId = closeVaultMovementId(shiftId);
  const closedAtMs = Date.now();
  await firestore.runTransaction(async (tx) => {
    const shiftRef = firestore.doc(`users/${tenantId}/cashShifts/${shiftId}`);
    const vaultRef = firestore.doc(`users/${tenantId}/vault/main`);
    const movRef = firestore.doc(`users/${tenantId}/vaultMovements/${movId}`);
    tx.update(shiftRef, {
      status: 'closed',
      vaultTransferOnClose: amount,
      vaultCloseMovementId: movId,
      closedAtMs,
    });
    tx.set(movRef, {
      type: 'from_cash_close',
      amount,
      reason: 'إغلاق الشفت',
      shiftId,
      createdBy: { role: 'cashier' },
      employeeId: 'cashier',
      createdAt: new Date(),
      createdAtMs: Date.now(),
    });
    tx.set(
      vaultRef,
      {
        balance: prevBalance + amount,
        totalCapitalIn: 50,
        lastVaultCloseShiftId: shiftId,
        lastVaultCloseAmount: amount,
        lastVaultCloseMovementId: movId,
        updatedAtMs: Date.now(),
      },
      { merge: true }
    );
    tx.set(firestore.doc(`users/${tenantId}/cashMovements/${closeCashDrawerMovementId(shiftId)}`), {
      shiftId,
      type: 'withdrawal',
      amount,
      reason: 'إغلاق',
      toVault: true,
      isClosingWithdrawal: true,
      createdAtMs: Date.now(),
    });
  });
}

test('legacy unmigrated owner retains full write', async () => {
  const owner = dbAs('legacyOwner1');
  await assertSucceeds(owner.doc('users/legacyOwner1').set({ businessName: 'Legacy' }));
  await assertSucceeds(owner.collection('users/legacyOwner1/orders').doc('o1').set({ total: 10, status: 'paid' }));
});

test('cashier can read/write orders under tenant', async () => {
  const tenantId = 'cafe1';
  const adminUid = 'admin1';
  const cashierUid = 'cash1';
  await seedTenant(tenantId, adminUid, cashierUid);
  const cashierDb = dbAs(cashierUid);
  await assertSucceeds(
    cashierDb.collection(`users/${tenantId}/orders`).doc('o1').set({ total: 5, status: 'paid' })
  );
});

test('cashier cannot write vault without shift close transaction', async () => {
  const tenantId = 'cafe2';
  const adminUid = 'admin2';
  const cashierUid = 'cash2';
  await seedTenant(tenantId, adminUid, cashierUid);
  const cashierDb = dbAs(cashierUid);
  await assertFails(
    cashierDb.doc(`users/${tenantId}/vault/main`).set({ balance: 99 })
  );
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await context.firestore().doc(`users/${tenantId}/vault/main`).set({ balance: 50, totalCapitalIn: 0 });
  });
  await assertFails(
    cashierDb.doc(`users/${tenantId}/vault/main`).update({
      balance: 60,
      lastVaultCloseShiftId: 'fake',
      lastVaultCloseAmount: 10,
      lastVaultCloseMovementId: 'from_cash_close_fake',
      updatedAtMs: Date.now(),
    })
  );
});

test('admin can record a vault movement when closing a shift', async () => {
  const tenantId = 'cafe2b';
  const adminUid = 'admin2b';
  await seedTenant(tenantId, adminUid);
  const adminDb = dbAs(adminUid);
  await assertSucceeds(
    adminDb.collection(`users/${tenantId}/vaultMovements`).doc('m1').set({
      type: 'from_cash_close',
      amount: 217.5,
      reason: 'إغلاق الشفت الأول — للخزنة',
      shiftId: 'shift1',
      createdBy: { role: 'admin' },
      employeeId: 'admin',
      createdAt: new Date(),
      createdAtMs: Date.now(),
    })
  );
});

test('cashier atomic shift close credits vault once', async () => {
  const tenantId = 'cafe2c';
  const shiftId = 'shift-open';
  await seedShiftCloseFixtures(tenantId, 'admin2c', 'cash2c', shiftId);
  const cashierDb = dbAs('cash2c');
  await assertSucceeds(runLegitShiftClose(cashierDb, tenantId, shiftId, 20));
  const vault = (await cashierDb.doc(`users/${tenantId}/vault/main`).get()).data();
  expect(vault.balance).toBe(70);
  await assertFails(runLegitShiftClose(cashierDb, tenantId, shiftId, 20));
});

test('cashier cannot patch supplier balance only', async () => {
  const tenantId = 'cafe3';
  const adminUid = 'admin3';
  const cashierUid = 'cash3';
  await seedTenant(tenantId, adminUid, cashierUid);
  await seedSupplier(tenantId, 's1', { name: 'S', balance: 10 });
  const cashierDb = dbAs(cashierUid);
  await assertFails(
    cashierDb.collection(`users/${tenantId}/suppliers`).doc('s1').update({ balance: 0, updatedAt: new Date() })
  );
});

test('cashier can update supplier non-balance fields', async () => {
  const tenantId = 'cafe3b';
  const adminUid = 'admin3b';
  const cashierUid = 'cash3b';
  await seedTenant(tenantId, adminUid, cashierUid);
  await seedSupplier(tenantId, 's1', { name: 'S', balance: 10 });
  const cashierDb = dbAs(cashierUid);
  await assertSucceeds(
    cashierDb.collection(`users/${tenantId}/suppliers`).doc('s1').update({ name: 'S2', phone: '0599' })
  );
});

test('member cannot change own role', async () => {
  const tenantId = 'cafe4';
  const adminUid = 'admin4';
  const cashierUid = 'cash4';
  await seedTenant(tenantId, adminUid, cashierUid);
  const cashierDb = dbAs(cashierUid);
  await assertFails(
    cashierDb.doc(`tenants/${tenantId}/members/${cashierUid}`).update({ role: 'admin', active: true })
  );
});

test('cross-tenant read denied', async () => {
  const tenantId = 'cafe5';
  const adminUid = 'admin5';
  const other = 'intruder5';
  await seedTenant(tenantId, adminUid);
  const intruder = dbAs(other);
  await assertFails(intruder.collection(`users/${tenantId}/orders`).doc('x').get());
});

test('cashier can submit a valid join request', async () => {
  const tenantId = 'cafe6';
  const adminUid = 'admin6';
  const cashierUid = 'cash6';
  await seedTenant(tenantId, adminUid);
  const cashierDb = dbAs(cashierUid);
  await assertSucceeds(
    cashierDb.doc(`tenants/${tenantId}/joinRequests/${cashierUid}`).set({
      email: 'c@test',
      status: 'pending',
      createdAtMs: Date.now(),
    })
  );
});

test('cashier cannot create admin membership for another user', async () => {
  const tenantId = 'cafe7';
  const adminUid = 'admin7';
  const cashierUid = 'cash7';
  await seedTenant(tenantId, adminUid, cashierUid);
  const cashierDb = dbAs(cashierUid);
  await assertFails(
    cashierDb.doc(`tenants/${tenantId}/members/newuser7`).set({ role: 'admin', active: true })
  );
});

test('forged join request with extra fields is denied', async () => {
  const tenantId = 'cafe8';
  const adminUid = 'admin8';
  const cashierUid = 'cash8';
  await seedTenant(tenantId, adminUid);
  const cashierDb = dbAs(cashierUid);
  await assertFails(
    cashierDb.doc(`tenants/${tenantId}/joinRequests/${cashierUid}`).set({
      email: 'c@test',
      status: 'pending',
      createdAtMs: Date.now(),
      role: 'admin',
    })
  );
});

test('cashier cannot create sensitive payroll expense', async () => {
  const tenantId = 'cafe9';
  const adminUid = 'admin9';
  const cashierUid = 'cash9';
  await seedTenant(tenantId, adminUid, cashierUid);
  const cashierDb = dbAs(cashierUid);
  await assertFails(
    cashierDb.collection(`users/${tenantId}/expenses`).doc('e1').set({
      amount: 50,
      payrollAccrualId: 'fake',
      section: 'salaries',
    })
  );
});

test('legitimate tenant owner can bootstrap after users profile', async () => {
  const authUid = 'bootstrapAdmin';
  const adminDb = dbAs(authUid);
  await assertSucceeds(adminDb.doc(`users/${authUid}`).set({ businessName: 'Bootstrap' }));
  await assertSucceeds(
    adminDb.doc(`tenants/${authUid}`).set({ schemaVersion: 1, inviteCode: 'JOIN', createdAtMs: 1 })
  );
  await assertSucceeds(
    adminDb.doc(`tenants/${authUid}/members/${authUid}`).set({ role: 'admin', active: true })
  );
  await assertSucceeds(
    adminDb.doc(`userTenants/${authUid}`).set({ tenantId: authUid, role: 'admin' })
  );
});

test('intruder cannot self-enroll as admin on existing tenant', async () => {
  const tenantId = 'cafe10';
  const adminUid = 'admin10';
  const intruder = 'intruder10';
  await seedTenant(tenantId, adminUid);
  const intruderDb = dbAs(intruder);
  await assertFails(
    intruderDb.doc(`tenants/${tenantId}/members/${intruder}`).set({ role: 'admin', active: true })
  );
});

test('orphan shift close with vault transfer is rejected', async () => {
  const tenantId = 'shiftforge1';
  await seedShiftCloseFixtures(tenantId, 'adm_sf', 'cash_sf');
  const db = dbAs('cash_sf');
  const shiftId = 'shift-open';
  await assertFails(
    db.doc(`users/${tenantId}/cashShifts/${shiftId}`).update({
      status: 'closed',
      vaultTransferOnClose: 500,
      vaultCloseMovementId: closeVaultMovementId(shiftId),
      closedAtMs: Date.now(),
    })
  );
});

test('shift close without vault transfer remains allowed', async () => {
  const tenantId = 'shiftzero';
  await seedShiftCloseFixtures(tenantId, 'adm_z', 'cash_z');
  const db = dbAs('cash_z');
  await assertSucceeds(
    db.doc(`users/${tenantId}/cashShifts/shift-open`).update({
      status: 'closed',
      vaultTransferOnClose: 0,
      vaultCloseMovementId: null,
      closedAtMs: Date.now(),
    })
  );
});

test('cashier operational shift patch allowed', async () => {
  const tenantId = 'shiftop1';
  await seedShiftCloseFixtures(tenantId, 'adm_so', 'cash_so');
  const db = dbAs('cash_so');
  await assertSucceeds(
    db.doc(`users/${tenantId}/cashShifts/shift-open`).update({
      status: 'open',
      cardSales: 10,
      cardSaleCount: 1,
    })
  );
});

describe('malicious client financial writes', () => {
  test('cashier cannot forge vault balance on create', async () => {
    const tenantId = 'mal1';
    const db = dbAs('cash1');
    await seedTenant(tenantId, 'adm1', 'cash1');
    await assertFails(db.doc(`users/${tenantId}/vault/main`).set({ balance: 9999, totalCapitalIn: 0, updatedAtMs: 1 }));
  });

  test('cashier cannot decrease vault balance', async () => {
    const tenantId = 'mal2';
    await seedShiftCloseFixtures(tenantId, 'adm2', 'cash2');
    const db = dbAs('cash2');
    await assertFails(
      db.doc(`users/${tenantId}/vault/main`).update({
        balance: 10,
        totalCapitalIn: 50,
        updatedAt: new Date(),
        updatedAtMs: Date.now(),
      })
    );
  });

  test('cashier cannot create standalone from_cash_close movement', async () => {
    const tenantId = 'mal7';
    await seedShiftCloseFixtures(tenantId, 'adm7', 'cash7');
    const db = dbAs('cash7');
    const movId = closeVaultMovementId('shift-open');
    await assertFails(
      db.doc(`users/${tenantId}/vaultMovements/${movId}`).set({
        type: 'from_cash_close',
        amount: 20,
        reason: 'إغلاق',
        shiftId: 'shift-open',
        createdBy: { role: 'cashier' },
        employeeId: 'cashier',
        createdAt: new Date(),
        createdAtMs: Date.now(),
      })
    );
  });

  test('cashier cannot create capital movement', async () => {
    const tenantId = 'malcap';
    await seedShiftCloseFixtures(tenantId, 'adm_cap', 'cash_cap');
    const db = dbAs('cash_cap');
    await assertFails(
      db.collection(`users/${tenantId}/vaultMovements`).doc('cap1').set({
        type: 'capital',
        amount: 50,
        reason: 'رأس مال',
        shiftId: 'shift-open',
        createdAt: new Date(),
        createdAtMs: Date.now(),
      })
    );
  });

  test('cashier cannot replay vault credit after shift closed', async () => {
    const tenantId = 'mal8';
    const shiftId = 'shift-open';
    await seedShiftCloseFixtures(tenantId, 'adm8', 'cash8', shiftId);
    const db = dbAs('cash8');
    await runLegitShiftClose(db, tenantId, shiftId, 5);
    const movId = closeVaultMovementId(shiftId);
    await assertFails(
      db.doc(`users/${tenantId}/vaultMovements/${movId}`).set({
        type: 'from_cash_close',
        amount: 5,
        reason: 'إعادة',
        shiftId,
        createdBy: { role: 'cashier' },
        employeeId: 'cashier',
        createdAt: new Date(),
        createdAtMs: Date.now(),
      })
    );
    await assertFails(runLegitShiftClose(db, tenantId, shiftId, 5));
  });

  test('cashier cannot use wrong deterministic movement id', async () => {
    const tenantId = 'malid';
    await seedShiftCloseFixtures(tenantId, 'adm_id', 'cash_id');
    const db = dbAs('cash_id');
    const shiftId = 'shift-open';
    await assertFails(
      db.runTransaction(async (tx) => {
        const movId = 'from_cash_close_wrong';
        tx.update(db.doc(`users/${tenantId}/cashShifts/${shiftId}`), {
          status: 'closed',
          vaultTransferOnClose: 10,
          vaultCloseMovementId: movId,
          closedAtMs: Date.now(),
        });
        tx.set(db.doc(`users/${tenantId}/vaultMovements/${movId}`), {
          type: 'from_cash_close',
          amount: 10,
          reason: 'x',
          shiftId,
          createdBy: { role: 'cashier' },
          employeeId: 'cashier',
          createdAt: new Date(),
          createdAtMs: Date.now(),
        });
      })
    );
  });

  test('fabricated business summary with totals denied', async () => {
    const tenantId = 'malbd';
    const closedAtMs = 1_700_000_000_000;
    await seedTenant(tenantId, 'adm_bd', 'cash_bd');
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await db.doc(`users/${tenantId}/cashShifts/s1`).set({
        status: 'closed',
        shiftPeriod: 1,
        closedAtMs: closedAtMs - 1000,
      });
      await db.doc(`users/${tenantId}/cashShifts/s2`).set({
        status: 'closed',
        shiftPeriod: 2,
        closedAtMs,
      });
    });
    const db = dbAs('cash_bd');
    await assertFails(
      db.collection(`users/${tenantId}/businessDaySummaries`).doc('x').set({
        businessDayKey: '2024-01-01',
        closedAtMs,
        shift1Id: 's1',
        shift2Id: 's2',
        totalSales: 99999,
        createdAt: new Date(),
      })
    );
    await assertSucceeds(
      db.collection(`users/${tenantId}/businessDaySummaries`).doc('ok').set({
        businessDayKey: '2024-01-01',
        closedAtMs,
        shift1Id: 's1',
        shift2Id: 's2',
        createdAt: new Date(),
      })
    );
  });

  test('cross-tenant vault movement denied', async () => {
    await seedShiftCloseFixtures('tenantA', 'admA', 'cashA');
    await seedShiftCloseFixtures('tenantB', 'admB', 'cashB', 'shift-b');
    const db = dbAs('cashA');
    await assertFails(
      db.runTransaction(async (tx) => {
        const shiftId = 'shift-b';
        const movId = closeVaultMovementId(shiftId);
        tx.update(db.doc('users/tenantB/cashShifts/shift-b'), {
          status: 'closed',
          vaultTransferOnClose: 5,
          vaultCloseMovementId: movId,
          closedAtMs: Date.now(),
        });
        tx.set(db.doc(`users/tenantB/vaultMovements/${movId}`), {
          type: 'from_cash_close',
          amount: 5,
          reason: 'x',
          shiftId,
          createdBy: { role: 'cashier' },
          employeeId: 'cashier',
          createdAt: new Date(),
          createdAtMs: Date.now(),
        });
      })
    );
  });
});
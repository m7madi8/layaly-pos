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

test('cashier cannot write vault', async () => {
  const tenantId = 'cafe2';
  const adminUid = 'admin2';
  const cashierUid = 'cash2';
  await seedTenant(tenantId, adminUid, cashierUid);
  const cashierDb = dbAs(cashierUid);
  await assertFails(
    cashierDb.doc(`users/${tenantId}/vault/main`).set({ balance: 99 })
  );
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
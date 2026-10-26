/**
 * Firestore Security Rules tests — hardened rules only (firestore.rules.hardened).
 * Run: npm run test:rules (Firebase Emulator Suite required).
 */
const fs = require('fs');
const path = require('path');
const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = require('@firebase/rules-unit-testing');

const PROJECT_ID = 'layali-rules-test';
const rulesPath = path.resolve(__dirname, '../../firestore.rules.hardened');

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

function authedDb(uid, claims = {}) {
  return testEnv
    .authenticatedContext(uid, claims)
    .firestore();
}

test('legacy mode: owner can write orders', async () => {
  const db = authedDb('owner1');
  await assertSucceeds(
    db.doc('users/owner1').set({ securityMode: 'legacy', businessName: 'Test' })
  );
  await assertSucceeds(
    db.collection('users/owner1/orders').doc('o1').set({ total: 10, status: 'paid' })
  );
});

test('hardened mode: client cannot write cashShifts', async () => {
  const adminDb = authedDb('owner2b', { role: 'admin' });
  await assertSucceeds(
    adminDb.doc('users/owner2b').set({ securityMode: 'hardened', businessName: 'Test' })
  );
  const cashierDb = authedDb('owner2b', { role: 'cashier' });
  await assertFails(
    cashierDb.collection('users/owner2b/cashShifts').doc('s1').set({ status: 'open', openingBalance: 0 })
  );
});

test('hardened mode: client cannot create orders', async () => {
  const adminDb = authedDb('owner2', { role: 'admin' });
  await assertSucceeds(
    adminDb.doc('users/owner2').set({ securityMode: 'hardened', businessName: 'Test' })
  );

  const cashierDb = authedDb('owner2', { role: 'cashier' });
  await assertFails(
    cashierDb.collection('users/owner2/orders').doc('o2').set({ total: 5, status: 'paid' })
  );
});

test('hardened mode: cashier can update products', async () => {
  const adminDb = authedDb('owner3', { role: 'admin' });
  await assertSucceeds(
    adminDb.doc('users/owner3').set({ securityMode: 'hardened', businessName: 'Test' })
  );

  const cashierDb = authedDb('owner3', { role: 'cashier' });
  await assertSucceeds(
    cashierDb.collection('users/owner3/products').doc('p1').set({ name: 'قهوة', price: 5 })
  );
});

test('hardened mode: cashier cannot write vault', async () => {
  const adminDb = authedDb('owner4', { role: 'admin' });
  await assertSucceeds(
    adminDb.doc('users/owner4').set({ securityMode: 'hardened', businessName: 'Test' })
  );

  const cashierDb = authedDb('owner4', { role: 'cashier' });
  await assertFails(
    cashierDb.doc('users/owner4/vault/main').set({ balance: 100 })
  );
});

test('hardened mode: client cannot write cashShiftIdempotency', async () => {
  const adminDb = authedDb('owner5b', { role: 'admin' });
  await assertSucceeds(
    adminDb.doc('users/owner5b').set({ securityMode: 'hardened', businessName: 'Test' })
  );
  const cashierDb = authedDb('owner5b', { role: 'cashier' });
  await assertFails(
    cashierDb.doc('users/owner5b/cashShiftIdempotency/k1').set({ shiftId: 'fake' })
  );
});

test('hardened mode: client cannot write idempotency records', async () => {
  const adminDb = authedDb('owner5', { role: 'admin' });
  await assertSucceeds(
    adminDb.doc('users/owner5').set({ securityMode: 'hardened', businessName: 'Test' })
  );
  const cashierDb = authedDb('owner5', { role: 'cashier' });
  await assertFails(
    cashierDb.doc('users/owner5/idempotency/key1').set({ orderId: 'fake', total: 1 })
  );
});

test('cross-tenant: cannot read another user orders', async () => {
  const a = authedDb('tenantA');
  await assertSucceeds(a.doc('users/tenantA').set({ securityMode: 'legacy' }));
  await assertSucceeds(a.collection('users/tenantA/orders').doc('x').set({ total: 1 }));

  const b = authedDb('tenantB');
  await assertFails(b.collection('users/tenantA/orders').doc('x').get());
});

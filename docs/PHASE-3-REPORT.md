# Phase 3 — Verification & financial integrity report

**Date:** 2026-10-26 (updated after live emulator run)  
**Deploy / production flags:** Not changed.  
**Production readiness:** **Not production-ready.**

---

## Executive summary (post-emulator)

| Check | Result |
|-------|--------|
| `test:functions:unit` | **15/15 pass** |
| `test:functions:emulator` (real Firestore) | **12/12 pass** — persisted state asserted |
| Rules tests (`jest.rules.config.js`, emulator up) | **6/6 pass** |
| `npm run test:rules` (`emulators:exec`) | Not run — use `subst L:` if project path is Arabic |
| Default POS checkout | Still **client-trusted** |

**Bugs fixed to unblock emulator:** duplicate `firebase-admin` `FieldValue` mismatch; cash-shift reads after writes in transactions; Jest `ReadableStream` for rules tests.

---

## 1. Files inspected and changed (this phase)

**Inspected:** `functions/lib/orderEngine.js`, `pricingAndPayment.js`, `idempotency.js`, `authz.js`, `hookahExternalSale.js`, `functions/index.js`, `trustedOrderPayload.js`, `secureFunctions.js`, `firestore.rules.hardened`, existing tests, legacy `App.js` checkout/cancel paths.

**Changed / added:**

| File | Change |
|------|--------|
| `functions/lib/idempotency.js` | **New** — request fingerprint for idempotency keys |
| `functions/lib/orderEngine.js` | Reject idempotency key reuse with different payload; store `requestFingerprint` |
| `functions/lib/pricingAndPayment.js` | Cap percentage discount at 100%; floor total at 0 |
| `tests/functions/idempotency.unit.test.js` | **New** |
| `tests/functions/hookahPricing.unit.test.js` | **New** |
| `tests/functions/orderEngine.emulator.test.js` | **New** — persistence tests (require emulator) |
| `tests/functions/orderEngine.unit.test.js` | Extended payment/discount cases |
| `tests/security/firestore.rules.test.js` | Idempotency write denial (hardened) |
| `docs/EMULATOR-TEST-SETUP.md` | **New** |
| `package.json` | `firebase-admin` devDep; test scripts |
| `functions/` | `npm install` (local, not deployed) |
| `tests/functions/orderEngine.emulator.test.js` | `afterAll` cleanup; **+4 scenarios** (mixed, price ignore, compliment, debt cancel); gate **fails** if emulator down |
| `functions/lib/orderEngine.js` | `serverTimestamp(db)`; shift reads before writes (complete + cancel) |
| `tests/security/jest.setup.js`, `jest.rules.config.js` | `ReadableStream` for rules Jest on Node |
| `docs/EMULATOR-TEST-SETUP.md` | Java **21+**, `subst` for Arabic paths |

---

## 2. Implementation vs documentation — discrepancies

| Topic | Map / Phase 2 report | Actual code (verified) |
|-------|----------------------|---------------------------|
| `orderEdits` on trusted edit | Not implemented | **Still missing** in `executeCompleteOrder` |
| Idempotency same key, different cart | Not specified | **Was missing** → **fixed** with fingerprint |
| Percentage discount > 100% | Implied safe totals | **Was possible negative total** → **fixed** |
| Product reads before transaction | — | `resolveCartLines` reads catalog **outside** txn (TOCTOU window; txn re-reads stock inside) |
| Legacy auth bridge | Documented | Any authed UID if `securityMode !== 'hardened'` |
| Callable ≠ automatic security | — | Correct; relies on engine + rules + claims |
| External نخلة pricing | Documented | Implemented in `hookahExternalSale.js` (unit-tested) |
| PlayStation / mixed / compliment | Documented | In engine; **emulator persistence not run** (no Java) |

---

## 3. Tests executed — actual results

| Command | Exit | Result |
|---------|------|--------|
| `npm run test:functions:unit` | 0 | **15/15 passed** (payment, discount, idempotency fingerprint, hookah) |
| `npm run test:functions:emulator` | 0 | **12/12 pass** with `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080` (emulator on `subst L:`) |
| `npm run test:functions:integration` | **Not run** | Same as emulator; use `L:\` for `emulators:exec` on Arabic path |
| `npx jest -c jest.rules.config.js` | 0 | **6/6 pass** (emulator already running) |
| `npm run test:rules` | **Not run** | Wrapper needs `subst L:` — direct Jest used instead |
| `npm test -- --watchAll=false` | 1 | **74 passed**, `App.test.js` failed (`TextEncoder` / jspdf — pre-existing) |
| `npm run build` | 0 | **Compiled successfully** |

### Emulator prerequisites (exact)

1. Install **JDK 21+** (Firebase CLI requirement).  
2. `subst L: "<project path>"` then start emulator from `L:\`.  
3. `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080` → `npm run test:functions:emulator`.  

See [`docs/EMULATOR-TEST-SETUP.md`](./EMULATOR-TEST-SETUP.md).

### Financial scenarios — verification status

| # | Scenario | Unit | Emulator persistence |
|---|----------|------|----------------------|
| 1 | Cash sale | — | **Pass** (order, stock, 1 cash movement) |
| 2 | Debt sale | — | **Pass** (balance +10, 0 cash movements) |
| 3 | Mixed | Unit | **Pass** (cash 12, debt 8, 1 movement) |
| 4 | Compliment | Unit | **Pass** (non-admin rejected, 0 orders) |
| 5–6 | Manipulated line price | % cap unit | **Pass** (total 10 from catalog, not 0.01) |
| 7 | Invalid product/qty | — | Partial (stock test only) |
| 8 | Insufficient stock | — | **Pass** (0 orders, stock unchanged) |
| 9 | Mid-txn failure | — | **Not tested** explicitly |
| 10–11 | Idempotency | Unit fingerprint | **Pass** (dup + mismatch) |
| 12 | Concurrent | — | **Not tested** |
| 13–17 | Cancel cash / debt / double | — | **Pass** (cash refund + debt reverse + 1 refund) |
| 18–19 | PS / نخلة | Hookah unit | **Not tested** on emulator |
| 20 | Ledger reconciliation | — | **Partial** (per-scenario balances only) |

### Financial invariants verified (honest summary)

- **Verified offline:** Server-side payment split math, discount caps, idempotency fingerprint stability, external نخلة fixed price logic, compliment requires admin in engine code paths covered by unit tests.
- **Not verified end-to-end:** No persisted Firestore state was asserted for checkout/cancel on this machine (emulator unavailable). Atomic rollback, concurrency, and cancel refund ceilings depend on `runTransaction` behavior and remain **design assumptions** until emulator integration runs.

### Phase 3 — Rules / authorization tests

- **Workflow documented:** [`docs/EMULATOR-TEST-SETUP.md`](./EMULATOR-TEST-SETUP.md); `npm run test:rules` uses `firebase emulators:exec`.
- **Test file:** `tests/security/firestore.rules.test.js` (hardened vs legacy, idempotency denial).
- **Executed:** **No** — `firebase emulators:exec` failed: `Could not spawn java -version`.

---

## 4. Bugs found and fixed (this phase)

1. **Idempotency key reuse with different payload** → fingerprint + reject.  
2. **Percentage discount > 100%** → cap at 100% and floor total at 0.  
3. **`serverTimestamp` with two `firebase-admin` copies** (root vs `functions/`) → `serverTimestamp(db)` from `db.constructor.FieldValue`.  
4. **Cash shift query after writes** in `completeOrder` / `cancelOrder` → read open shift before any write (Firestore txn rule).  
5. **Rules Jest** → `ReadableStream` setup for `@firebase/rules-unit-testing`.

---

## 5. Remaining client-trusted operations (write-path audit)

| Write path | Collections / docs | Classification | Hardened rules | Risk if left as-is |
|------------|-------------------|----------------|----------------|---------------------|
| Legacy checkout / cancel (`App.js` transactions) | `orders`, `products`, `ingredients`, `customers`, `cashMovements`, `counters` | **Client-side only** (default) | **Blocked** | Tampered totals, stock, debt, cash |
| Trusted `completeOrder` / `cancelOrder` callables | Same + `idempotency` | **Server-protected** (when flag on) | Orders/cash/debt via rules + callables | Safe only when flag + claims + deployed functions |
| Order edit + `orderEdits` (`App.js` ~2320) | `orders`, stock, `orderEdits` | **Client-side only** | **Blocked** | Edit without audit or wrong refunds |
| Trusted order edit | Updates order without `orderEdits` | **Incomplete** | — | Audit gap vs legacy |
| Open bills (`openBillsService.js`) | `openBills`, linked orders | **Client-side only** | **Blocked** | Bill manipulation |
| Cash shifts (`cashShiftService.js`) | `cashShifts`, `cashMovements` | **Client-side only** | **Blocked** | Shift/cash theft |
| Vault (`vaultService.js`) | `vault`, `vaultMovements` | **Client-side only** (+ client PIN) | **Blocked** | Vault balance drift |
| PlayStation sessions (`playstationService.js`) | `playstationSessions`, locks | **Client-side only** | **Blocked** | Session billing bypass (trusted path bills in engine) |
| External assets (`externalAssetsService.js`) | asset movements | **Client-side only** | **Blocked** | Asset status fraud |
| Customer / catalog CRUD (`App.js`, views) | `customers`, `products`, … | **Client-side only** | Mostly **blocked** for financial fields | Price/stock tampering |
| Reset sales/ledgers UI (`resetSalesAndLedgers.js`) | Many subcollections | **Client-side only** | **Blocked** | Destructive wipe by any authed user |
| `resetSalesAndCustomerLedgers` callable | Same | **Server-protected** (admin claim) | N/A | Not default UI path; not emulator-tested |

**Smallest safe remediation sequence (recommended):** (1) Java + run emulator/rules CI locally; (2) deploy functions to **staging** only; (3) enable `REACT_APP_TRUSTED_ORDERS` on staging; (4) migrate cash shifts + open bills to callables; (5) employee PIN via `verifyEmployeePin` + claims; (6) flip `securityMode` + hardened rules on staging; (7) production only after full matrix green.

**Enabling hardened rules before migration:** **Breaks** checkout, bills, shifts, vault, catalog edits, and legacy cancel — **do not enable in production** until paths above are server-backed or read-only client flows.

---

## 6. Authorization & employee-session risks

- **localStorage `layali-user-role`:** UI only; does not affect callables when hardened; **legacy bridge** allows any Firebase authed user to call order functions without claims.  
- **Employee PIN** still compared in **client** (`authSecrets.js`); extractable from bundle if env weak. `verifyEmployeePin` callable exists but **employee login does not require it**.  
- **Vault PIN** same pattern.  
- **Admin impersonation:** Anyone with Firebase credentials can call APIs; employee “role” is not server-bound today.  
- **Hardened rules:** Would block direct financial writes but **would break** app until all paths use callables (open bills, shifts, vault, catalog, legacy checkout).

---

## 7. Can hardened rules be enabled now?

**No.** Enabling `firestore.rules.hardened` + `securityMode: 'hardened'` would deny:

- Legacy checkout/cancel transactions  
- Open bills, shifts, vault, counter writes from client  
- Idempotency writes from client (intended)  

Without `REACT_APP_TRUSTED_ORDERS=true` and migrated shifts/bills/vault, **daily operations would stop**.

---

## 8. Next phase prerequisites

1. Install Java; run `npm run test:functions:integration` and `npm run test:rules`.  
2. Wire `orderEdits` in trusted `completeOrder` for parity.  
3. Migrate open bills + cash shifts to callables.  
4. Employee login: require `verifyEmployeePin` + custom token / dual Firebase user (see remediation plan).  
5. Remove PINs from production frontend bundle; Functions-only secrets.  
6. Pilot with `TRUSTED_ORDERS` on emulator/staging only.  
7. Fix `App.test.js` (TextEncoder polyfill) for CI signal.

---

## 9. Production-readiness verdict

**Not production-ready** for a security-sensitive multi-staff POS.

**Evidence:** Default checkout remains client-trusted; employee/admin separation is not server-enforced on callables in legacy mode; hardened rules **incompatible** with current client writes; concurrent/PS/نخلة paths not emulator-tested.

**Conditional progress:** Trusted **order engine** passed **12** emulator persistence tests + **6** rules tests; **15** unit tests. This validates the callable engine in isolation, **not** full app security or production deployment.

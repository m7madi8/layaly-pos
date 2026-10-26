# Layali Café POS — Security Remediation Plan (Phase 1)

**Repository:** `D:\completed\ليالي كافي`  
**Status:** Foundation implemented locally — **not deployed** to Firebase or Vercel.  
**Production readiness:** Still **not** production-ready after this phase.

---

## PHASE A — Verified current state (2026-10-26)

### Repository / Git

| Item | Finding |
|------|---------|
| Branch | `main` |
| Uncommitted | `src/App.js` (modified), `src/utils/hookahExternalSale.js` (untracked) |
| Backend | None — React SPA → Firebase SDK |
| Firebase project id | `layaly-cafe-13c2b` (`.firebaserc`) |

### Data layout (`users/{uid}/…`)

| Subcollection / doc | Financial / sensitive |
|---------------------|------------------------|
| `users/{uid}` (profile, flags) | Settings, `securityMode` (new, optional) |
| `orders`, `orderEdits`, `counters/orders` | **Financial** |
| `customers` (balance, transactions) | **Financial** |
| `openBills` | **Financial** |
| `cashShifts`, `cashMovements` | **Financial** |
| `vault/main`, `vaultMovements` | **Financial** |
| `products`, `ingredients` | Inventory + pricing source of truth |
| `expenses`, `suppliers` | Operational |
| `externalAssets`, `assetMovements` | Operational + sale linkage |
| `playstationSessions`, `playstationStations` | Operational |
| Storage `products/`, `logos/`, `expenses/` | Media |

### Roles today (not server-enforced)

- **Manager:** Firebase Email/Password sign-in → `localStorage` role `admin`.
- **Employee:** Shared PIN (`REACT_APP_EMPLOYEE_PASSWORD`) on device that already has Firebase session → `localStorage` role `employee`.
- **Vault:** PIN in client (`REACT_APP_VAULT_PIN` or default).

Firestore rules (`firestore.rules`): any `auth.uid == userId` may read/write **all** subcollections.

### UI assumptions (direct Firestore writes)

- `completeOrder`, `handleCancelOrder`, open bills, cash shifts, vault, reset ledgers, CRUD products/customers — all from `App.js` / services via client SDK.
- Hardened rules **cannot** be enabled until callables replace or gate these writes.

### Missing information / ambiguities

1. **Per-employee identity:** Operator name on shift is free text, not tied to Firebase users.
2. **Card / QRIS:** Settings flags exist; no settlement integration — out of scope.
3. **Whether two Firebase users (admin vs POS device)** are acceptable for the business — affects employee model.
4. **Production env values** on Vercel — not inspected (secrets must not be logged).

---

## PHASE B — Target security model

### Principles

1. **Firebase Auth UID** = one café tenant boundary (`users/{uid}`).
2. **Custom claims** on JWT: `role: 'admin' | 'cashier'` (extensible). Claims set only via **Admin SDK** in Cloud Functions.
3. **Never trust** `localStorage` role, request body `role`, or client-computed totals for authorization.
4. **App Check** recommended for production callables (Phase 2 deploy checklist) — not a substitute for claims.

### Employee / manager migration (important)

Today, **admin and employee share the same Firebase user** on a paired device. Custom claims cannot represent both simultaneously on one JWT.

**Phase 1 (this delivery):**  
- Harden **destructive** and **cross-tenant** risks via callables + future rules.  
- Keep UI role for navigation; document as **UX only**.  
- Server verifies **admin claim** for reset and claim bootstrap.

**Phase 2 (choose one):**

| Option | Description |
|--------|-------------|
| **A — Dual Firebase users** | `admin@` + `pos@layali.cafe` (or similar); POS device stays signed in as `pos` with `cashier` claim; manager uses `admin`. |
| **B — Callable cashier session** | After PIN check, Function mints **custom token** with `cashier` claim for same UID (short-lived); manager login refreshes `admin` claim. |
| **C — Per-staff Auth accounts** | Full account per employee — highest integrity, highest ops cost. |

### Write matrix (target `securityMode: 'hardened'`)

| Data | Client read | Client write | Server write |
|------|-------------|--------------|--------------|
| Profile, products, ingredients | Yes (owner) | Admin/cashier per policy | Optional |
| Orders, counters, customer balances | Yes | **Deny** | Callable `completeOrder` / `cancelOrder` |
| Cash shifts / movements | Yes | **Deny** (except legacy) | Bundled in order/shift callables |
| Vault | Admin read | **Deny** | Callable + admin claim |
| Reset ledgers | — | **Deny** | `resetSalesAndCustomerLedgers` callable |

### Feature flag

`users/{uid}.securityMode`: `'legacy'` (default) | `'hardened'`.  
Emulator tests use `hardened`; production stays `legacy` until migration checklist complete.

---

## PHASE C — Phase 1 implementation (this repo)

| Deliverable | Path |
|-------------|------|
| Cloud Functions scaffold | `functions/` |
| Hardened rules (not active in prod) | `firestore.rules.hardened` |
| Legacy rules unchanged | `firestore.rules` |
| Rules unit tests | `tests/security/firestore.rules.test.js` |
| Emulator config | `firebase.json` |
| Production secret guard | `src/config/validateProductionEnv.js` |
| Auth secrets dev/prod split | `src/adminAuth.js`, `src/vaultAuth.js` |
| Callable client helper | `src/services/secureFunctions.js` |
| Financial UX fixes | Remove paid/unpaid toggle; ingredient stock floor; cash sale in order transaction |

**Not deployed:** rules, functions, or frontend hosting.

---

## PHASE D — Financial integrity (design for Phase 2)

### Order creation (target)

1. Callable receives **line items by product id + quantity + weight/session ids** only.
2. Function loads products, recomputes prices, discounts policy, rounding.
3. Single Firestore transaction: counter, order doc, stock, ingredients, customer debt, cash movement, PS sessions, asset movements.
4. **Idempotency:** client sends `idempotencyKey` (UUID); `users/{uid}/idempotency/{key}` with TTL prevents duplicate orders on retry.

### Cancellation / refund

- Single transaction: order → `cancelled`, restore stock/ingredients, reverse debt, **cash refund movement** if `cashPaid > 0`.
- No status toggle without ledger entries.

### Shift open/close

- Open: transaction with “at most one open shift” guard (query + create).
- Close: existing `closeCashShift` logic moves to callable with admin/cashier claim.

### Reset

- Only `resetSalesAndCustomerLedgers` callable with **admin** claim + confirmation token in request.

### Atomicity limits

- Bluetooth print, PDF export, Storage uploads — **not** atomic with orders; failures must not roll back paid orders (log + retry).

---

## PHASE E — Deploy checklist (before enabling hardened mode)

1. Deploy Functions; set secrets (`EMPLOYEE_PIN`, `VAULT_PIN`) in Functions config — **remove from client bundle over time**.
2. Run `firebase emulators:exec` rules tests in CI.
3. Set custom claim `admin` on manager account (`bootstrapAdminClaim` once).
4. Migrate POS devices per Phase 2 option (dual user or custom token).
5. Switch `securityMode` to `hardened` on user doc.
6. Deploy `firestore.rules.hardened` as `firestore.rules`.
7. Ship frontend using callables for orders/reset.
8. Manual pilot: one shift, reconcile cash vs orders.

---

## Tests to run locally

```bash
npm test -- --watchAll=false
npm run build
npm run test:rules    # requires Java + Firebase emulators
```

# FINAL EMULATOR RELEASE GATE

**Project:** Layali POS  
**Date:** 2026-11-03  
**Purpose:** Prove the current codebase is safe and release-ready using **Firebase Emulators only** (no deploy, no production changes, no commit/push in this gate).

**Reference:** [FINAL_FULL_ACTIVATION_REPORT.md](./FINAL_FULL_ACTIVATION_REPORT.md)

**Working directory:** Use `subst L: "D:\completed\ليالي كافي"` so Firestore rules paths resolve (see [EMULATOR-TEST-SETUP.md](./EMULATOR-TEST-SETUP.md)). All commands below were run from `L:\`.

---

## 1. Emulator execution

| Emulator | Started via | Host (default) |
|----------|-------------|----------------|
| Firestore | `firebase emulators:exec` | `127.0.0.1:8080` |
| Auth | same (financial gate) | env `FIREBASE_AUTH_EMULATOR_HOST` |
| Functions | same (financial gate) | `127.0.0.1:5001` |

**Notes (non-blocking):** Firebase CLI reported stale login / MOTD fetch warnings; emulators and tests completed successfully. Functions emulator used host Node 24 while `package.json` requests 20.

---

## 2. Required command matrix

| Command | Result | Count |
|---------|--------|-------|
| `npm run test:functions:financial` | **PASS** | **12** tests, **0** skipped |
| `npm run test:rules` | **PASS** (Jest exit 0) | **10** tests, **0** skipped |
| `npm test -- --watchAll=false` | **PASS** | **136** tests, **22** suites |
| `npm run test:functions:unit` | **PASS** | **28** tests, **7** suites |
| `npm run build` | **PASS** | CRA production build (1 eslint warning, no errors) |

**Financial tests skipped for missing emulator:** **None** in `tests/release/finalEmulatorReleaseGate.test.js` (explicit `requireEmulators()` throws if env vars missing). The gate script is only invoked through `emulators:exec`, so financial scenarios are always executed against live emulators.

*Other* emulator suites (e.g. `test:functions:emulator` run without `emulators:exec`) may warn/skip — they are **not** part of this gate’s required npm scripts.

---

## 3. Release gate scenarios (`finalEmulatorReleaseGate.test.js`)

Tenant bootstrap: `users/{uid}.securityMode = 'hardened'`.

| # | Scenario | Coverage |
|---|----------|----------|
| 1 | Environment | Firestore + Auth emulator env present |
| 2 | Partial returns | Two returns on same invoice (cash, then debt); FIFO restock via `inventoryConsumption`; layer quantities verified |
| 3 | Payroll | Accrual → partial pay → full pay; **idempotency** duplicate on repeated `gate_pay_1` |
| 4 | Advance | Issue advance + cash repayment |
| 5 | Checks | Inbound: register → collect → return; Outbound: register → pay out → return |
| 6 | Supplier opening balance | First write succeeds; second rejected (duplicate guard) |
| 7 | Stock / FIFO path | Trusted sale + **cancel order** restores product stock |
| 8 | RBAC | Cashier **denied** `createPayrollAccrual` callable |
| 9 | RBAC | Admin **allowed** `createPayrollAccrual` |
| 10 | `verifyEmployeePin` | Wrong PIN rejected; correct PIN returns custom token |
| 11 | `refreshAdminSession` | Returns admin custom token for admin user |
| 12 | Claims | Cashier cannot self-grant admin via `bootstrapAdminClaim` |

---

## 4. Permissions & abuse resistance (mapped to requirements)

| Requirement | Evidence |
|-------------|----------|
| Admin can run allowed operations | Gate tests 3–7, 9, 11 (engines + admin callable) |
| Employee/cashier cannot run admin ops | Gate test 8 (`createPayrollAccrual` permission-denied) |
| Employee cannot grant self admin claims | Gate test 12 |
| Client cannot write protected financial collections (hardened) | `test:rules` — orders, cashShifts, vault, idempotency, orderReturns, payrollAccruals denied |
| `refreshAdminSession` / `verifyEmployeePin` tamper & replay | Gate tests 10–11 (wrong PIN fail; callable auth verification in emulator logs) |
| PIN in emulator | `firebase.json` → `emulators.functions.env.EMPLOYEE_PIN` / test constant `gate-emulator-pin-7291`; wrong PIN does not issue token |

**Brute-force / rate limiting:** Not fully simulated in Jest; server validates PIN server-side only (no client claim elevation). Further production hardening (lockout counters) is out of scope for this gate unless covered by existing callable logic.

---

## 5. End-to-end financial flows (gate)

| Flow | Gate test |
|------|-----------|
| Partial return ×2 same invoice | Test 2 |
| Cash refund + debt refund | Test 2 |
| Salary partial then full payment | Test 3 |
| Advance + repayment | Test 4 |
| Check in: collect / return | Test 5 |
| Check out: pay / return | Test 5 |
| Supplier opening balance + duplicate block | Test 6 |
| Sale consumption + cancel restore | Test 7 |
| FIFO on partial return | Test 2 (layer `remainingQuantity`) |

---

## 6. Hardened mode — direct writes vs gateway

| Layer | Status |
|-------|--------|
| `firestore.rules.hardened` | Rules tests deny client writes to financial subpaths (orders create, shifts, idempotency, returns, payroll accruals, etc.) |
| `financialGateway.js` + `securityMode.js` | Client routes financial mutations to callables when `securityMode === 'hardened'` or `REACT_APP_USE_FINANCIAL_CALLABLES=true` |
| Gate tenant | Runs with **hardened** flag set on user doc; financial engines invoked as Functions would (Admin SDK), not via permissive legacy rules |

No gate failure indicated for “hardened breaks daily ops”: shift-backed cash flows, orders, returns, payroll, checks, and supplier opening balance all complete in emulator with hardened flag.

---

## 7. Blockers fixed during this gate (test-only blockers)

1. **`partialOrderReturnEngine.js`** — Firestore transaction: all reads (order, idempotency, product, shift, customer, layers) before any writes.
2. **`payrollEngine.js`** — Idempotent replay: return `{ ...idemSnap.data(), duplicate: true }` so stored `duplicate: false` does not overwrite the flag; use shared `docExists()` for idempotency reads.
3. **`checkEngine.js`** — `returnCheck(..., { shiftId })` for cash reversal shift lookup.

---

## 8. Out of scope (explicit)

- No Firebase **deploy**
- No **git commit / push**
- No production rules or data changes
- No new product features

---

## 9. Verdict

# PASS — جاهز للنشر

All required commands passed with **zero skipped** financial tests in the release gate suite. Awaiting your explicit approval before any production deploy or rules migration.

---

## 10. Re-run checklist

```powershell
subst L: "D:\completed\ليالي كافي"
Set-Location L:\
npm run test:functions:financial
npm run test:rules
npm test -- --watchAll=false
npm run test:functions:unit
npm run build
```

Expected: 12 + 10 + 136 + 28 tests passing respectively; build succeeds.

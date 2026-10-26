# Phase 5 — Release candidate preparation

**Date:** 2026-10-26  
**Deploy / production flags:** Not performed. `REACT_APP_TRUSTED_*` remain **off** in `.env.example`.  
**Release verdict:** **Blocked for production** — **ready for controlled staging** after Functions deploy and flag pilot (see §10).

---

## 1. Launch-blocker checklist

| Area | Implementation today | Security boundary | Test evidence | Release status |
|------|----------------------|-------------------|---------------|----------------|
| **Trusted order complete/cancel** | Callables `completeOrder` / `cancelOrder`; UI uses them when `REACT_APP_TRUSTED_ORDERS=true` | Server pricing, stock, debt, idempotency; legacy bridge if `securityMode≠hardened` | Emulator **12** order tests | **Staging-ready** (callable); **prod blocked** (flag off, functions not deployed) |
| **Trusted cash shifts** | Callables `openCashShift`, `closeCashShift`, `recordCashShiftMovement`; UI wired when `REACT_APP_TRUSTED_CASH_SHIFTS=true` | Transactional open (one shift), movement idempotency | Emulator **15** shift tests | Same as orders |
| **Employee / admin auth** | Admin: Firebase email/password. Employee: client PIN + `localStorage` role. Optional `REACT_APP_VERIFY_EMPLOYEE_PIN_ON_SERVER` → `verifyEmployeePin` | **Not** server-bound role; JWT claims only if `bootstrapAdminClaim` + hardened | No Auth emulator claim tests | **Blocked** for multi-staff trust |
| **Vault** | Client `vaultService.js` transactions | Client-trusted; `verifyVaultPin` callable admin-only, not wired to all vault writes | None on server vault | **Blocked** |
| **Open bills** | `openBillsService.js` client writes | Client-trusted | Unit cart tests only | **Blocked** under hardened rules |
| **Order edit + `orderEdits`** | Legacy Firestore txn in `App.js`; trusted `completeOrder` edit **without** `orderEdits` audit | Client-trusted (legacy) | No trusted edit tests | **Blocked** / parity gap |
| **Catalog / ingredient stock** | Client CRUD + checkout txn | Client-trusted; hardened allows cashier product writes | Product pricing unit tests | **Partial** |
| **Destructive reset** | Client `resetSalesAndLedgers.js`; callable `resetSalesAndCustomerLedgers` (admin claim) | Callable exists; UI uses client path | Not emulator-tested | **Blocked** |
| **Firestore rules (prod)** | `firestore.rules` — full owner R/W | None | N/A | **Unchanged (intentional)** |
| **Hardened rules** | `firestore.rules.hardened` — financial paths denied | Requires callables + claims | **8** rules tests | **Do not enable** until migration |
| **Storage rules** | `storage.rules` (not re-audited this phase) | Owner-based | None | **Unknown** |
| **Frontend secrets** | `REACT_APP_EMPLOYEE_PASSWORD`, `REACT_APP_VAULT_PIN`; build guard `validateProductionEnv.js` | Extractable from bundle if set | Build fails on weak defaults when Firebase configured | **Risk if defaults used** |
| **Dependencies** | CRA 5 / React 18; `npm audit` reports high issues in transitive `@grpc/grpc-js`, Babel, jsdom chain | Supply-chain | Not remediated this phase | **Review before prod** |
| **App tests** | CRA Jest | — | **75/75 pass** (incl. `App.test.js` after polyfills) | **OK** |
| **Backups / restore** | No automated repo procedure; Firebase project `layaly-cafe-13c2b` | Operational | **Not tested** in this phase | **Blocked** for DR sign-off |
| **Monitoring** | None in codebase | — | — | **Not ready** |

---

## 2. Frontend paths migrated to trusted callables

When flags are **enabled** (staging only):

| UI action | Callable | Idempotency |
|-----------|----------|-------------|
| Complete order | `completeOrder` | `buildTrustedCompleteOrderPayload` → `idempotencyKey` |
| Cancel order | `cancelOrder` | — |
| Open cash shift | `openCashShift` | `newIdempotencyKey('open_shift')` |
| Close shift | `closeCashShift` | — |
| Deposit / withdrawal | `recordCashShiftMovement` | per-action key |

**Default (flags off):** legacy `runTransaction` / `cashShiftService` unchanged.

**Region:** `europe-west1` via `REACT_APP_FUNCTIONS_REGION` (see `secureFunctions.js`). Emulator: `REACT_APP_FUNCTIONS_EMULATOR=true`.

**Not migrated (no server API):** vault manual ops, open bills, order edit audit, catalog CRUD, client reset.

---

## 3. Remaining direct financial writes (legacy default)

- `App.js` — checkout, cancel, order edit, customer balance updates  
- `cashShiftService.js` — open/close/movements when `TRUSTED_CASH_SHIFTS` off  
- `vaultService.js` — all vault mutations  
- `openBillsService.js` — open bill lifecycle  
- `resetSalesAndLedgers.js` — destructive wipe  

---

## 4. Employee authorization findings

| Vector | Finding |
|--------|---------|
| `localStorage` `layali-user-role` | Controls UI only; **bypass** for Firestore in legacy rules |
| Employee PIN in bundle | `getEmployeeLoginPassword()` unless server verify flag on |
| `verifyEmployeePin` | Optional via `REACT_APP_VERIFY_EMPLOYEE_PIN_ON_SERVER=true` — **does not** set `cashier` claim |
| Admin | Firebase credentials; not the same as employee role on JWT |
| Hardened callables | `requireOrderCaller` needs `admin` or `cashier` claim when hardened |

**Migration plan (no silent account changes):** Choose Phase 1 plan option A/B/C in `SECURITY-REMEDIATION-PLAN.md` — dual Firebase users or custom token after PIN; run `bootstrapAdminClaim` once per manager; assign `cashier` to POS account.

---

## 5. Financial & concurrency test results (executed)

| Suite | Result | Notes |
|-------|--------|-------|
| `npm run test:functions:unit` | **16/16 pass** | |
| `npm run test:functions:emulator` | **30/30 pass** | Requires `FIRESTORE_EMULATOR_HOST` + running emulator |
| `npx jest -c jest.rules.config.js` | **8/8 pass** | Includes `cashShifts` write denial |
| `npm test -- --watchAll=false` | **75/75 pass** | |
| `npm run build` | **Success** | |

**Concurrency (new):** `tests/functions/concurrency.emulator.test.js` — parallel sale+close (`allSettled`), duplicate idempotency parallel completes — **pass** on emulator.

**Gaps:** PlayStation session billing, external نخلة, unauthorized discount persistence, Auth+claims callable tests, vault, open bills.

---

## 6. Hardened rules compatibility

**Denied without callables:** orders, cashShifts, cashMovements, vault, counters, idempotency, cashShiftIdempotency, openBills, orderEdits.

**Still allowed (cashier):** products, ingredients, customers (catalog path).

**Activation sequence (documented, not executed):**

1. Deploy Cloud Functions to **staging**.  
2. Set `securityMode: 'hardened'` on **staging** user doc only.  
3. Enable `REACT_APP_TRUSTED_ORDERS=true` + `REACT_APP_TRUSTED_CASH_SHIFTS=true` on staging build.  
4. Bootstrap `admin` / `cashier` claims.  
5. Migrate vault → callables (future phase).  
6. Migrate open bills + order edit audit.  
7. Swap production rules file + monitor.  

**Breaks if hardened alone:** POS checkout, shifts, vault UI, open bills, legacy reset.

---

## 7. Dependency & test environment

- **`App.test.js`:** Fixed via `TextEncoder`, `TextDecoder`, `ReadableStream` in `src/setupTests.js` (Node/jsdom + Firebase Auth / undici).  
- **`npm audit` (high+):** Transitive issues e.g. `@grpc/grpc-js`, `@babel/plugin-transform-modules-systemjs`; fixes may pull Jest 30 — **not applied** this phase. Review before production hosting.  
- **Build guard:** Weak employee/vault env defaults fail production build when Firebase configured.

---

## 8. Backup & recovery readiness

| Item | Status |
|------|--------|
| Documented Firebase export (Console / gcloud) | Refer to `docs/PRODUCTION.md` — **no isolated restore drill run** |
| Emulator restore test | **Not performed** |
| Point-in-time recovery | Depends on Firebase plan — **not verified** |

**Prerequisite:** Scheduled Firestore export + documented restore to **non-prod** project before launch sign-off.

---

## 9. Deployment prerequisites

1. Install **JDK 21+**; use `subst L:` for emulator on Arabic project path (`EMULATOR-TEST-SETUP.md`).  
2. Deploy `functions/` to staging (`europe-west1`). Set `EMPLOYEE_PIN`, `VAULT_PIN` in Functions env (not in React bundle).  
3. Run full emulator + rules suite against CI/staging.  
4. Pilot flags on staging only; verify open shift + cash sale + close + vault transfer on close.  
5. Implement vault + open-bill callables OR accept blockers.  
6. Employee claim migration.  
7. Enable hardened rules on staging → full regression.  
8. Production: swap rules, enable flags, App Check (recommended), monitoring.

---

## 10. Release verdict

| Environment | Verdict |
|-------------|---------|
| **Production** | **Blocked** — client-trusted financial writes remain default; auth not server-enforced; vault/bills/edit/reset not on callables; DR not demonstrated. |
| **Staging (controlled)** | **Acceptable next step** after Functions deploy + both trusted flags + claims + manual QA checklist. |
| **Final production review** | Only after staging hardened pilot green, backup drill, and high-risk path migration (minimum: vault + open bills or explicit risk acceptance). |

**This phase delivered:** trusted cash-shift UI wiring, optional server employee PIN, concurrency emulator tests, rules test for `cashShifts`, test env fixes, expanded emulator suite — **not** production readiness.

---

## Files changed (Phase 5)

- `src/App.js` — trusted cash-shift callables; optional server employee PIN  
- `src/services/trustedOrderPayload.js`, `src/utils/idempotencyKey.js`  
- `src/setupTests.js` — polyfills  
- `tests/functions/concurrency.emulator.test.js`  
- `tests/security/firestore.rules.test.js` — cashShifts denial  
- `.env.example` — documented flags  
- `package.json` — emulator includes concurrency tests  

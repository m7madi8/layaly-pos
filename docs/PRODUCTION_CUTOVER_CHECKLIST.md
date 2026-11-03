# Production Cutover Checklist — Layali Café POS

**Date:** 2026-11-03  
**Target production:** Firebase `layaly-cafe-13c2b` · Vercel `layaly-pos` · https://layaly-pos.vercel.app  
**Architecture target:** Hardened (Cloud Functions + `firestore.rules.hardened` + `securityMode: 'hardened'`)  
**Legend:** PASS · FAIL · BLOCKED · NOT VERIFIED  

---

## Phase 1 — Production Preflight

| # | Check | Status | Evidence |
|---|--------|--------|----------|
| 1.1 | Firebase CLI authenticated | **PASS** | `firebase login:list` → logged in; `layaly-cafe-13c2b (current)` |
| 1.2 | No wrong Firebase project in `.firebaserc` | **PASS** | `default` → `layaly-cafe-13c2b` only |
| 1.3 | Vercel `REACT_APP_FIREBASE_PROJECT_ID` | **PASS** | Production env present (encrypted); prior audit confirmed `layaly-cafe-13c2b` |
| 1.4 | `REACT_APP_DEMO_MODE` not enabled | **PASS** | On Vercel Production; prior pull confirmed `false` |
| 1.5 | `REACT_APP_TRUSTED_ORDERS` on Vercel | **PASS** | Listed on Production (added ~2026-11-03); **live bundle NOT VERIFIED** — recent prod builds **Error** |
| 1.6 | `REACT_APP_TRUSTED_CASH_SHIFTS` on Vercel | **PASS** | Listed on Production |
| 1.7 | `REACT_APP_VERIFY_EMPLOYEE_PIN_ON_SERVER` on Vercel | **PASS** | Listed on Production |
| 1.8 | `REACT_APP_RESTAURANT_TEMPLATE` | **NOT VERIFIED** | Not used in `src/` — N/A |
| 1.9 | `REACT_APP_USE_FINANCIAL_CALLABLES` | **NOT VERIFIED** | Optional; gateways use `securityMode: 'hardened'` primarily |
| 1.10 | Functions region `europe-west1` | **PASS** | `functions/index.js` + client default |
| 1.11 | Deployed Cloud Functions inventory | **FAIL** | `firebase functions:list` fails; HTTP probes 404; dry-run showed **no Blaze** |
| 1.12 | Deployed Firestore indexes | **FAIL** | `firebase firestore:indexes` → `indexes: []` vs repo `checks` composite |
| 1.13 | Deployed Firestore rules vs repo | **NOT VERIFIED** | Console rules not fetched; repo deploy file `firestore.rules` = legacy owner-only (matches backup) |
| 1.14 | `firestore.rules.hardened` in repo | **PASS** | Present; rules tests target hardened file |
| 1.15 | Storage rules in repo | **PASS** | `storage.rules` — auth-scoped paths |
| 1.16 | Staging Firebase project | **BLOCKED** | [STAGING-CONNECTION-STATUS.md](./STAGING-CONNECTION-STATUS.md) — none configured |
| 1.17 | Production SPA reachable | **PASS** | https://layaly-pos.vercel.app serves login (last **Ready** deploy ~17m before audit window) |
| 1.18 | Latest Vercel Production build | **FAIL** | `vercel ls --prod`: deployments at 4m/12m **Error**; alias may lag on older **Ready** build |

**Phase 1 gate:** **FAIL** — backend not deployed; production bundle may not include new trusted env flags.

---

## Phase 2 — Backup & Restore Verification

| # | Check | Status | Evidence |
|---|--------|--------|----------|
| 2.1 | Firestore full export to GCS | **BLOCKED** | `gcloud` / `gsutil` **not installed** on operator machine |
| 2.2 | Storage export / inventory | **NOT VERIFIED** | No automated pass; product/logo images under `storage.rules` paths |
| 2.3 | Backup stored outside repo | **FAIL** | No export executed in this session |
| 2.4 | Export metadata documented | **FAIL** | — |
| 2.5 | Restore test on **separate** project | **BLOCKED** | Requires export + target project |
| 2.6 | Rules/index snapshot in git | **PASS** | `firestore.rules.legacy.backup-20261103`, hardened file, `firestore.indexes.json` |

**Phase 2 gate:** **BLOCKED** — **stop production Firebase mutations** per runbook until 2.1 + 2.5 complete.

**Operator actions:**

1. Upgrade/install [Google Cloud SDK](https://cloud.google.com/sdk) **or** Firebase Console → Firestore → **Export** to a GCS bucket (Blaze).
2. Record `gs://…/path` and timestamp in operator log.
3. Import into a **dedicated non-production** project; spot-check `users/{uid}`, orders, shifts counts.
4. Set `$env:LAYALI_BACKUP_BUCKET` and re-run `scripts/production-go-live.ps1` **after** Blaze upgrade.

---

## Phase 3 — Cloud Functions (repo readiness)

| # | Check | Status | Evidence |
|---|--------|--------|----------|
| 3.1 | Node 20 in `functions/package.json` | **PASS** | `engines.node: 20` |
| 3.2 | Dependencies install | **NOT VERIFIED** | `npm ci` in `functions/` not run this session |
| 3.3 | No secrets in repo | **PASS** | PINs via `process.env.EMPLOYEE_PIN` / `VAULT_PIN` only |
| 3.4 | 30 callables defined (v2 `onCall`, `europe-west1`) | **PASS** | See [Function inventory](#cloud-functions-inventory-repo) below |
| 3.5 | Deploy to production | **BLOCKED** | `firebase deploy --only functions --dry-run` → **Blaze plan required** |
| 3.6 | Post-deploy inventory | **NOT VERIFIED** | — |
| 3.7 | Runtime secrets `EMPLOYEE_PIN`, `VAULT_PIN` | **NOT VERIFIED** | Must set in Firebase Console / Secret Manager after deploy |

**Phase 3 gate:** **BLOCKED** on Blaze + Phase 2.

---

## Phase 4 — Firestore Indexes

| # | Check | Status | Evidence |
|---|--------|--------|----------|
| 4.1 | Repo index: `checks` (`partyId`, `createdAtMs`) | **PASS** | `firestore.indexes.json` |
| 4.2 | Deploy indexes | **NOT VERIFIED** | Dry-run **OK**; **not executed** (waiting Phase 2) |
| 4.3 | Index READY in Console | **NOT VERIFIED** | — |

---

## Phase 5 — Security Rules

| # | Check | Status | Evidence |
|---|--------|--------|----------|
| 5.1 | Compare prod vs legacy vs hardened | **NOT VERIFIED** | Prod rules not downloaded; repo legacy = owner read/write all subcollections |
| 5.2 | Hardened rules emulator tests | **PASS** | `npm run test:rules` → **10/10** (run from `L:\` subst path) |
| 5.3 | Deploy hardened rules | **NOT VERIFIED** | **Do not deploy** until Functions live + backup + cutover sequence |
| 5.4 | Storage rules deploy | **NOT VERIFIED** | — |

---

## Phase 6 — Financial Emulator Gate

| Suite | Command | Result |
|-------|---------|--------|
| Functions unit | `npm run test:functions:unit` | **PASS 28/28** |
| Rules (hardened) | `npm run test:rules` (from `L:\`) | **PASS 10/10** |
| Financial release gate | `npm run test:functions:financial` | **PASS 12/12** |
| Cash shift emulator | `emulators:exec` + cashShift tests | **PASS** (in combined run) |
| Concurrency | `concurrency.emulator.test.js` | **PASS** |
| Financial ops | `financialOps.emulator.test.js` | **PASS** |
| Frontend unit | `npm test -- --watchAll=false` | **PASS 155/155** |

**Phase 6 gate:** **PASS** (local/emulator only — not production).

---

## Phase 7 — Staging End-to-End

| # | Check | Status |
|---|--------|--------|
| 7.1 | Separate Firebase staging project | **BLOCKED** |
| 7.2 | Full 15-step operational cycle | **NOT VERIFIED** |
| 7.3 | Dashboard vs ledger reconciliation | **NOT VERIFIED** |

**Phase 7 gate:** **BLOCKED** — create/configure staging per [STAGING-CONNECTION-STATUS.md](./STAGING-CONNECTION-STATUS.md).

---

## Phase 8 — Hardened Cutover

| # | Check | Status |
|---|--------|--------|
| 8.1 | Functions deployed & callable | **FAIL** |
| 8.2 | Vercel trusted flags in **built** bundle | **NOT VERIFIED** |
| 8.3 | `users/{ownerUid}.securityMode = 'hardened'` | **NOT VERIFIED** — must be **last** |
| 8.4 | Admin/cashier custom claims | **NOT VERIFIED** |
| 8.5 | No silent legacy fallback for financial paths | **NOT VERIFIED** in prod |

**Phase 8 gate:** **BLOCKED** — phases 2–3–7 incomplete.

---

## Phase 9 — Vercel Production

| # | Check | Status |
|---|--------|--------|
| 9.1 | Env vars for trusted/PIN | **PASS** (names on Vercel) |
| 9.2 | Successful production build after env change | **FAIL** (recent **Error** deploys) |
| 9.3 | Bundle project id | **NOT VERIFIED** on latest alias |
| 9.4 | Redeploy after backend cutover | **NOT VERIFIED** |

---

## Phase 10 — Production Smoke (read-only)

| # | Check | Status |
|---|--------|--------|
| 10.1 | Login page | **PASS** |
| 10.2 | Authenticated reads (dashboard, orders, …) | **NOT VERIFIED** (no credentials used) |
| 10.3 | Production write tests | **Skipped** (policy) |

---

## Cloud Functions inventory (repo)

All **HTTPS callable** (`onCall`), region **`europe-west1`**, Admin SDK + Firestore transactions where noted in engines.

| Function | Frontend entry | Auth | Money / stock | Idempotency |
|----------|----------------|------|---------------|-------------|
| `bootstrapAdminClaim` | Admin bootstrap | Signed-in user | No | N/A |
| `verifyEmployeePin` | `callVerifyEmployeePin` | Signed-in | No | N/A |
| `refreshAdminSession` | `callRefreshAdminSession` | Signed-in | No | N/A |
| `verifyVaultPin` | vault flows | Admin claim | No | N/A |
| `completeOrder` | `callCompleteOrder` / trusted orders | `requireOrderCaller` | **Yes** | Yes (engine) |
| `cancelOrder` | `callCancelOrder` | `requireOrderCaller` | **Yes** | Yes |
| `openCashShift` | `callOpenCashShift` | `requireOrderCaller` | **Yes** | Yes |
| `closeCashShift` | `callCloseCashShift` | `requireOrderCaller` | **Yes** | Yes |
| `recordCashShiftMovement` | `callRecordCashShiftMovement` | `requireOrderCaller` | **Yes** | Key in payload |
| `partialOrderReturn` | `financialGateway` | `requireOrderCaller` | **Yes** | Yes |
| `suspendOpenBill` / `closeOpenBill` / `cancelOpenBill` | `operationalGateway` | `requireOrderCaller` | **Yes** | Engine |
| `recordEmployeeBenefit` / `cancelEmployeeBenefit` | `operationalGateway` | Admin | **Yes** | Yes |
| `vaultAddCapital` / `vaultManualDeposit` | `operationalGateway` | Admin | **Yes** | Engine |
| Payroll (4) + checks (3) + `recordSupplierOpeningBalance` | `financialGateway` | Admin | **Yes** | Yes |
| Test-data helpers (4) | admin tools | Admin | **Yes** | Engine |
| `resetSalesAndCustomerLedgers` | admin reset | Admin | **Yes** | N/A |

**Deployed in Firebase production:** **NOT VERIFIED** (0 confirmed live).

---

## Overall cutover status

| Phase | Status |
|-------|--------|
| 1 Preflight | **FAIL** |
| 2 Backup | **BLOCKED** |
| 3 Functions | **BLOCKED** (Blaze) |
| 4 Indexes | Pending Phase 2 |
| 5 Rules | Emulator PASS; prod deploy pending |
| 6 Emulator gate | **PASS** |
| 7 Staging E2E | **BLOCKED** |
| 8 Hardened cutover | **BLOCKED** |
| 9 Vercel | **FAIL** (build errors) |
| 10 Prod smoke | Partial |

**Cannot proceed to production Firebase deploy until:** Blaze upgrade + verified Firestore backup/restore + operator sign-off.

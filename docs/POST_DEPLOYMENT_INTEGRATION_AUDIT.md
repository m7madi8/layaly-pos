# Post-Deployment Integration Audit — Layali POS

**Audit date:** 2026-11-03  
**Production frontend:** https://layaly-pos.vercel.app  
**Vercel project:** `m7madi8s-projects/layaly-pos`  
**Firebase project (target):** `layaly-cafe-13c2b`  
**Functions region (code):** `europe-west1`  

**Scope:** Read-only / non-mutating checks only. No production rules deploy, no fake sales, no financial writes, no hardened cutover during this audit.

---

## Executive summary

| Layer | Finding |
|--------|---------|
| **Vercel production SPA** | Deployed and loads (login shell). |
| **Firebase client config in build** | Points at **`layaly-cafe-13c2b`**; `REACT_APP_DEMO_MODE=false`. |
| **Trusted / PIN / template env flags** | **Missing** on Vercel Production → current build uses **legacy client** order/shift paths and **client-side** employee PIN (unless server flag added later). |
| **Cloud Functions** | **Strong evidence of non-deployment** (HTTP 404 on Gen1-style URLs, zero function logs). CLI `functions:list` **failed** — inventory **not verified** via API. |
| **Firestore indexes (deployed)** | **Empty** vs repo **`checks`** composite index → **drift**. |
| **Hardened security stack** | **Not operational** (no verified Functions + no verified hardened rules + no verified `securityMode: 'hardened'`). |

**New Vercel build required now?** **No** — for continuing **legacy client-trusted** operation with existing env. **Yes, later** — after backend cutover, add missing env vars and redeploy **once** (CRA bakes `REACT_APP_*` at build time).

**Final verdict:** **PARTIALLY OPERATIONAL** (production frontend + Firebase client SDK configured; server-trusted financial stack **not** verified and likely **absent**).

---

## 1. Vercel environment audit

### 1.1 Production variables present (`vercel env ls production`)

| Variable | Listed on Production | Notes |
|----------|----------------------|--------|
| `REACT_APP_FIREBASE_API_KEY` | Yes | Encrypted at rest (not reproduced here). |
| `REACT_APP_FIREBASE_AUTH_DOMAIN` | Yes | Verified via controlled pull: `layaly-cafe-13c2b.firebaseapp.com`. |
| `REACT_APP_FIREBASE_PROJECT_ID` | Yes | Verified: **`layaly-cafe-13c2b`**. |
| `REACT_APP_FIREBASE_STORAGE_BUCKET` | Yes | Present (value not logged). |
| `REACT_APP_FIREBASE_MESSAGING_SENDER_ID` | Yes | Present (value not logged). |
| `REACT_APP_FIREBASE_APP_ID` | Yes | Present (value not logged). |
| `REACT_APP_DEMO_MODE` | Yes | Verified: **`false`**. |
| `REACT_APP_EMPLOYEE_PASSWORD` | Yes | Client PIN path (value not logged). |
| `REACT_APP_VAULT_PIN` | Yes | Client vault PIN (value not logged). |

### 1.2 Required flags — existence on Production

| Variable | On Vercel Production | Correctness vs codebase |
|----------|----------------------|-------------------------|
| `REACT_APP_TRUSTED_ORDERS` | **No** | Required `=== 'true'` in `src/services/secureFunctions.js` → **disabled** in current build. |
| `REACT_APP_TRUSTED_CASH_SHIFTS` | **No** | Same → **disabled**. |
| `REACT_APP_VERIFY_EMPLOYEE_PIN_ON_SERVER` | **No** | `App.js` only uses server PIN when `=== 'true'` → **client PIN path**. |
| `REACT_APP_RESTAURANT_TEMPLATE` | **No** | **Not referenced anywhere in `src/`** — N/A (nothing to set). |

Also **not** on Production (relevant to gateways): `REACT_APP_USE_FINANCIAL_CALLABLES`, `REACT_APP_FUNCTIONS_REGION` (bundle falls back to **`europe-west1`**).

### 1.3 Build-time verification (production JS bundle)

Evidence from deployed `static/js/main.*.js` (no secret values extracted):

- Embedded Firebase **project id:** `layaly-cafe-13c2b`.
- Callable **names** present in bundle: `completeOrder`, `openCashShift`, `verifyEmployeePin`, etc. (code paths exist).
- **No** inlined `REACT_APP_TRUSTED_ORDERS === 'true'`, `REACT_APP_VERIFY_EMPLOYEE_PIN_ON_SERVER === 'true'`, or `REACT_APP_DEMO_MODE === 'true'` patterns detected → matches missing Vercel env vars.

---

## 2. Firebase backend audit

### 2.1 CLI / project access

- `firebase projects:list` with `NODE_OPTIONS=--use-system-ca`: **`layaly-cafe-13c2b (current)`** — **PASS** (authenticated CLI to correct project).
- `firebase functions:list --project layaly-cafe-13c2b`: **FAIL** — `"Failed to list functions for layaly-cafe-13c2b"` (JSON error, no function inventory returned).

### 2.2 Deployment probes (read-only)

| Check | Result |
|--------|--------|
| POST `https://europe-west1-layaly-cafe-13c2b.cloudfunctions.net/completeOrder` | **404** Page not found |
| POST `https://europe-west1-layaly-cafe-13c2b.cloudfunctions.net/openCashShift` | **404** Page not found |
| `firebase functions:log --project layaly-cafe-13c2b --lines 5` | **No log entries found** |

**Interpretation:** Callable endpoints are **not** reachable at standard Gen1 URLs, consistent with **Functions not deployed** (or entirely different deployment not confirmed). **Do not assume** local `functions/index.js` is live in production.

### 2.3 Source of truth — exports in repo (`functions/index.js`)

**30** `onCall` exports in **`europe-west1`**:

`bootstrapAdminClaim`, `verifyEmployeePin`, `refreshAdminSession`, `verifyVaultPin`, `resetSalesAndCustomerLedgers`, `completeOrder`, `openCashShift`, `closeCashShift`, `recordCashShiftMovement`, `previewRemoveTestSales`, `executeRemoveTestSales`, `updateTestDataRegistry`, `markOrdersAsTestData`, `cancelOrder`, `partialOrderReturn`, `createPayrollAccrual`, `recordPayrollPayment`, `recordEmployeeAdvance`, `recordAdvanceRepayment`, `registerCheck`, `collectCheck`, `returnCheck`, `recordSupplierOpeningBalance`, `suspendOpenBill`, `closeOpenBill`, `cancelOpenBill`, `recordEmployeeBenefit`, `cancelEmployeeBenefit`, `vaultAddCapital`, `vaultManualDeposit`.

| Function group | Deployed status |
|----------------|-----------------|
| Orders (`completeOrder`, `cancelOrder`, …) | **NOT VERIFIED** (404 + list failure) |
| Cash shifts (`openCashShift`, `closeCashShift`, `recordCashShiftMovement`) | **NOT VERIFIED** |
| Open bills (`suspendOpenBill`, `closeOpenBill`, `cancelOpenBill`) | **NOT VERIFIED** |
| Employee PIN (`verifyEmployeePin`, `verifyVaultPin`) | **NOT VERIFIED** |
| Admin claims (`bootstrapAdminClaim`, `refreshAdminSession`) | **NOT VERIFIED** |
| Financial ops (payroll, checks, returns, vault, benefits, supplier OB) | **NOT VERIFIED** |

**Required action:** After backup/restore gate per [PRODUCTION_DEPLOYMENT_RUNBOOK.md](./PRODUCTION_DEPLOYMENT_RUNBOOK.md), deploy Functions from repo and re-run `functions:list` or Console verification. Use `NODE_OPTIONS=--use-system-ca` on Windows if TLS errors recur.

---

## 3. Firestore index audit

| Item | Repo (`firestore.indexes.json`) | Deployed (`firebase firestore:indexes --project layaly-cafe-13c2b`) |
|------|----------------------------------|---------------------------------------------------------------------|
| Composite index | **`checks`**: `partyId` ASC + `createdAtMs` DESC | **`indexes: []`** (empty) |

**Status:** **FAIL** — deployed indexes **do not** include repo definition. Checks queries that need this composite may **fail at runtime** until indexes are deployed (after explicit approval).

**Action:** Deploy indexes only after project/backup gates; monitor Firebase Console → Firestore → Indexes until **Enabled**.

---

## 4. Frontend–backend integration

| Integration point | Expected when hardened | Production build behavior (evidence) |
|-------------------|------------------------|--------------------------------------|
| Firebase project | `layaly-cafe-13c2b` | **PASS** — bundle + Vercel `REACT_APP_FIREBASE_PROJECT_ID`. |
| Functions region | `europe-west1` | **PASS** — default in `secureFunctions.js`; region string in bundle. |
| Callable names | Match `functions/index.js` | **PASS** — names aligned in `secureFunctions.js` / gateways. |
| Trusted orders | `REACT_APP_TRUSTED_ORDERS=true` + Functions | **FAIL** — flag absent → `App.js` uses **client** order completion. |
| Trusted cash shifts | `REACT_APP_TRUSTED_CASH_SHIFTS=true` + Functions | **FAIL** — flag absent → client shift paths. |
| Financial gateways | `securityMode: 'hardened'` or `REACT_APP_USE_FINANCIAL_CALLABLES=true` | **NOT VERIFIED / likely legacy** — neither flag on Vercel; profile `securityMode` not inspected in prod. |
| Employee PIN | Optional server `verifyEmployeePin` | **Client path** — `REACT_APP_VERIFY_EMPLOYEE_PIN_ON_SERVER` not set. |
| Open bills / inventory / vault / payroll | Server when hardened | **Client services** until hardened profile + Functions + rules cutover. |
| Version skew | Frontend newer than Functions | **BLOCKED** — cannot compare deployed function revision without inventory. |

---

## 5. Security verification

| Control | Status | Evidence |
|---------|--------|----------|
| Hardened mode (`securityMode: 'hardened'`) | **NOT VERIFIED** | Not enabled during audit; enabling prematurely would **break** client writes without Functions + rules. |
| `firestore.rules.hardened` in production | **NOT VERIFIED** | `firebase.json` deploy target is `firestore.rules` (minimal owner rules in repo); hardened file is **separate** — cutover not performed. |
| Storage rules | **NOT VERIFIED (deployed)** | Repo `storage.rules`: auth-scoped writes under `products/`, `logos/`, `expenses/` per `userId`. |
| Admin / employee authorization (custom claims) | **NOT VERIFIED** | Depends on deployed `bootstrapAdminClaim` / rules — Functions not verified. |
| Direct client financial writes | **Legacy mode expected** | With trusted flags off and hardened mode not verified, app **intends** client-trusted writes (pre-cutover). |
| Secrets in audit output | **PASS** | No API keys, PINs, or tokens printed. |

**Do not** set `securityMode: 'hardened'` or deploy hardened rules until Functions are verified live and backup/restore gate is complete.

---

## 6. Production smoke tests (safe)

| Test | Result |
|------|--------|
| GET https://layaly-pos.vercel.app | **PASS** — Arabic login shell renders (“ليالي كافيه — نظام نقاط البيع”). |
| Production bundle Firebase project id | **PASS** — `layaly-cafe-13c2b`. |
| Demo mode | **PASS** — `REACT_APP_DEMO_MODE=false`. |
| Authenticated Firestore read/write flows | **NOT VERIFIED** — requires real credentials; no test transactions run. |
| Callable invocation (auth) | **NOT VERIFIED** — would be a write/auth probe; endpoints 404 anyway. |

---

## 7. Component status table

| Component | Status | Evidence | Required action |
|-----------|--------|----------|-----------------|
| Vercel Production deploy | **PASS** | URL loads; WebFetch/login UI | None for hosting |
| Firebase env vars (core 6 + demo) | **PASS** | `vercel env ls`; project id/auth domain verified | Keep values in sync with Firebase Console |
| `REACT_APP_TRUSTED_ORDERS` | **FAIL** | Absent from Vercel Production; not `true` in bundle | Add `true` **after** Functions verified; then **one** redeploy |
| `REACT_APP_TRUSTED_CASH_SHIFTS` | **FAIL** | Same | Same |
| `REACT_APP_VERIFY_EMPLOYEE_PIN_ON_SERVER` | **FAIL** | Absent | Add when `verifyEmployeePin` deployed + PIN secrets in Functions config |
| `REACT_APP_RESTAURANT_TEMPLATE` | **NOT VERIFIED** | No code reference | None (N/A) |
| Firebase CLI project binding | **PASS** | `layaly-cafe-13c2b (current)` | Use `--use-system-ca` on Windows for TLS |
| Cloud Functions inventory | **BLOCKED** | `functions:list` error | Fix CLI/API access or verify in Google Cloud Console |
| Cloud Functions deployment | **FAIL** | HTTP **404** on `completeOrder` / `openCashShift`; no logs | Deploy `functions/` per runbook |
| Repo vs deployed Functions | **NOT VERIFIED** | No deployed list | Post-deploy diff (30 callables) |
| Firestore indexes (deployed) | **FAIL** | Deployed `[]` vs repo `checks` index | Deploy indexes after approval |
| Firestore rules (deployed) | **NOT VERIFIED** | No rules fetch command run | Compare Console rules to intended cutover file |
| Frontend → Firebase project | **PASS** | Bundle + env project id | None |
| Trusted order integration | **FAIL** | Flags off; Functions 404 | Backend + env + redeploy |
| Trusted cash shift integration | **FAIL** | Flags off; Functions 404 | Backend + env + redeploy |
| Hardened financial gateways | **NOT VERIFIED** | No hardened profile check | Complete cutover sequence in runbook |
| Open bills / benefits / vault callables | **NOT VERIFIED** | Functions not confirmed | Deploy + test on staging/emulator first |
| Employee PIN (server) | **FAIL** | Env off; Functions not verified | Deploy + enable flag |
| Storage rules | **NOT VERIFIED** | Repo only | Console compare |
| Production financial smoke | **NOT VERIFIED** | Intentionally skipped | Use emulator/staging for write tests |

---

## 8. Recommended sequence (no action taken in this audit)

1. **Backup + restore verification** for `layaly-cafe-13c2b`.
2. **`firebase deploy --only functions`** (with TLS fix if needed) → verify all **30** callables in Console.
3. **`firebase deploy --only firestore:indexes`** → wait until `checks` index **Enabled**.
4. **Staging/emulator** write tests for orders, shifts, open bills, payroll, checks.
5. **Hardened cutover:** deploy `firestore.rules.hardened`, then set `users/{ownerUid}.securityMode = 'hardened'` **last**.
6. **Vercel:** add `REACT_APP_TRUSTED_ORDERS`, `REACT_APP_TRUSTED_CASH_SHIFTS`, optional `REACT_APP_VERIFY_EMPLOYEE_PIN_ON_SERVER`, optional `REACT_APP_USE_FINANCIAL_CALLABLES` as needed → **single** production redeploy.

---

## 9. Final verdict

**PARTIALLY OPERATIONAL**

- **What works with evidence:** Production frontend on Vercel; Firebase Web SDK configuration targets **`layaly-cafe-13c2b`**; demo mode off; legacy client-trusted code paths are what the **current** build activates.
- **What does not meet cutover goals:** Server-trusted orders/shifts, callable-backed financial gateways, hardened Firestore rules, and deployed Function inventory are **not** verified and are **inconsistent** with a hardened production posture.

This is **not** **READY FOR DAILY PRODUCTION USE** under the **hardened / server-trusted** model. Whether legacy client-trusted POS is acceptable for daily use is a **business risk decision** outside this audit’s pass criteria.

---

*Audit performed without modifying production data, rules, or Vercel deployment. Temporary local env pull used only to confirm non-secret identifiers; file removed afterward.*

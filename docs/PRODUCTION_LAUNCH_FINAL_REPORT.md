# Production Launch — Final Report

**Date:** 2026-11-03  
**Operator session:** Automated cutover execution (Layali Café POS)  
**Production URL:** https://layaly-pos.vercel.app  
**Firebase project:** `layaly-cafe-13c2b`  
**Vercel project:** `m7madi8s-projects/layaly-pos`  

---

## Final verdict

## **BLOCKED — PARTIALLY OPERATIONAL**

The release candidate **passes all local/emulator financial and rules gates**, and Vercel **production environment names** now include trusted-order/shift and server-PIN flags. **Production cutover to FULLY OPERATIONAL hardened architecture was not completed** because mandatory gates failed:

1. **Firestore backup + restore verification** — not performed (no `gcloud`/`gsutil`; no GCS export logged).  
2. **Firebase Blaze (pay-as-you-go)** — required for Cloud Functions; deploy dry-run rejected on Spark.  
3. **Cloud Functions** — **not deployed** to `layaly-cafe-13c2b` (inventory unconfirmed; APIs were not fully enabled until dry-run).  
4. **Staging Firebase E2E** — no staging project configured.  
5. **Vercel production builds** — recent deployments **Error**; production alias may still serve an **older Ready** build **without** baked trusted flags.

**No production Firestore data, sales, inventory, shifts, or financial records were modified in this session.**

---

## 1. Phase status summary

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Production preflight | **FAIL** — backend/index drift; Vercel build failures |
| 2 | Backup & restore | **BLOCKED** — tooling + no export |
| 3 | Cloud Functions | **BLOCKED** — **Blaze plan required** |
| 4 | Firestore indexes | **NOT EXECUTED** — waiting Phase 2 |
| 5 | Security rules | **Emulator PASS**; production deploy **NOT EXECUTED** |
| 6 | Financial emulator gate | **PASS** |
| 7 | Staging E2E | **BLOCKED** — no staging project |
| 8 | Hardened cutover | **NOT EXECUTED** |
| 9 | Vercel production | **FAIL** — env added; builds failing |
| 10 | Production smoke | **Partial** — login shell only |
| 11 | This report | **Complete** |

Detail checklist: [PRODUCTION_CUTOVER_CHECKLIST.md](./PRODUCTION_CUTOVER_CHECKLIST.md).

---

## 2. Cloud Functions — deployed vs repo

| Item | Result |
|------|--------|
| **Repo exports** | **30** callables in `functions/index.js`, region `europe-west1` |
| **`firebase functions:list`** | **Failed** (CLI error) |
| **Deploy dry-run** | Failed: *project must be on the Blaze plan* ([upgrade URL](https://console.firebase.google.com/project/layaly-cafe-13c2b/usage/details)) |
| **Production inventory** | **NOT VERIFIED** — treat as **not deployed** |

Expected names after deploy (same as emulator load list):  
`bootstrapAdminClaim`, `verifyEmployeePin`, `refreshAdminSession`, `verifyVaultPin`, `resetSalesAndCustomerLedgers`, `completeOrder`, `openCashShift`, `closeCashShift`, `recordCashShiftMovement`, `previewRemoveTestSales`, `executeRemoveTestSales`, `updateTestDataRegistry`, `markOrdersAsTestData`, `cancelOrder`, `partialOrderReturn`, `createPayrollAccrual`, `recordPayrollPayment`, `recordEmployeeAdvance`, `recordAdvanceRepayment`, `registerCheck`, `collectCheck`, `returnCheck`, `recordSupplierOpeningBalance`, `suspendOpenBill`, `closeOpenBill`, `cancelOpenBill`, `recordEmployeeBenefit`, `cancelEmployeeBenefit`, `vaultAddCapital`, `vaultManualDeposit`.

---

## 3. Firestore indexes

| Source | State |
|--------|--------|
| **Production (CLI)** | `indexes: []` |
| **Repository** | 1 composite: collection `checks`, fields `partyId` ASC, `createdAtMs` DESC |
| **Deploy** | Dry-run OK; **not applied** (Phase 2 gate) |

---

## 4. Firestore & Storage rules

| Asset | Production | Repository target |
|-------|------------|-------------------|
| **Firestore active deploy file** | **NOT VERIFIED** in Console | Deploy path: `firestore.rules` (legacy owner access) |
| **Hardened rules** | **Not deployed** | `firestore.rules.hardened` — **10/10** emulator tests PASS |
| **Legacy backup** | N/A | `firestore.rules.legacy.backup-20261103` |
| **Storage** | **NOT VERIFIED** | `storage.rules` — per-user write paths |

**Hardened cutover was not applied** — `securityMode: 'hardened'` was **not** set on any user document.

---

## 5. Emulator test results (2026-11-03, from `L:\` subst)

| Command | Result |
|---------|--------|
| `npm run test:functions:unit` | **28/28 PASS** |
| `npm run test:rules` | **10/10 PASS** |
| `npm run test:functions:financial` | **12/12 PASS** (orders, shifts, payroll, checks, returns, PIN, authz, stock) |
| `emulators:exec` + cashShift / concurrency / financialOps | **20/20 PASS** |
| `npm test -- --watchAll=false` | **155/155 PASS** |

**Note:** Run rules/financial tests from **`subst L:`** path on Windows — Arabic path breaks Firestore emulator rules file load.

---

## 6. Staging E2E

| Result | Reason |
|--------|--------|
| **NOT RUN** | No staging Firebase project or `.env.staging.local` — see [STAGING-CONNECTION-STATUS.md](./STAGING-CONNECTION-STATUS.md) |

---

## 7. Vercel production environment (names only)

| Variable | Production configured |
|----------|------------------------|
| `REACT_APP_FIREBASE_*` (6) | Yes |
| `REACT_APP_DEMO_MODE` | Yes (expected `false`) |
| `REACT_APP_EMPLOYEE_PASSWORD` | Yes |
| `REACT_APP_VAULT_PIN` | Yes |
| `REACT_APP_TRUSTED_ORDERS` | Yes (added this session) |
| `REACT_APP_TRUSTED_CASH_SHIFTS` | Yes |
| `REACT_APP_VERIFY_EMPLOYEE_PIN_ON_SERVER` | Yes |
| `REACT_APP_USE_FINANCIAL_CALLABLES` | No (optional when hardened on profile) |
| `REACT_APP_RESTAURANT_TEMPLATE` | N/A (not in code) |

**Build status:** `vercel ls --prod` showed **Error** on newest production deployments; last **Ready** deploy predates some env changes → **trusted flags may not be in the live bundle**.

**Action:** Fix failing Vercel build (inspect deployment logs in dashboard), then **one** successful `vercel --prod` **after** backend is live.

---

## 8. Hardened mode — sensitive paths

| Path | Production state |
|------|------------------|
| Trusted orders (`completeOrder` / `cancelOrder`) | **Legacy client** (Functions absent; bundle likely old) |
| Trusted cash shifts | **Legacy client** |
| Financial gateways (payroll, checks, returns, open bills, vault, benefits) | **Legacy client** until `securityMode: 'hardened'` |
| Employee PIN server | Env name present; **Functions + redeploy** required |
| Firestore direct financial writes | **Allowed** under legacy rules model |

**Hardened is not active in production.**

---

## 9. Production smoke (read-only)

| Test | Result |
|------|--------|
| HTTPS login page | **PASS** |
| Authenticated module reads | **NOT VERIFIED** |
| Callable / CORS / Permission smoke | **NOT VERIFIED** (no backend) |

---

## 10. Remaining risks

| Risk | Severity |
|------|----------|
| No verified Firestore backup before cutover | **Critical** |
| Spark plan blocks Functions | **Critical** |
| Client-trusted financial writes remain authoritative | **High** until hardened |
| Missing `checks` index in production | **Medium** when checks UI used |
| Vercel prod build failures | **High** for env/bundle alignment |
| No staging E2E | **Medium** |
| `functions:list` CLI failure | **Low** (use Console after Blaze) |

---

## 11. Rollback procedures

| Scenario | Action |
|----------|--------|
| Hardened rules break POS | Restore `firestore.rules.legacy.backup-20261103` as `firestore.rules` → `firebase deploy --only firestore:rules` |
| Wrong `securityMode` | Set `users/{uid}.securityMode` back to absent/`legacy` (admin SDK / Console) |
| Bad Functions deploy | Disable/delete function revision in Console; redeploy previous artifact from git tag |
| Bad Vercel deploy | Vercel Dashboard → Promote last **Ready** deployment (`layaly-l3uf6fsdl-…` or documented good ID) |
| Data corruption | Restore from **verified** GCS export only (accepts data loss after backup time) |

---

## 12. Production data changes

**None.** No deploy to Functions, rules, indexes, or `securityMode` was committed on production data in this session.

---

## 13. Unblock sequence (operator)

1. **Upgrade** `layaly-cafe-13c2b` to **Blaze**: [usage/details](https://console.firebase.google.com/project/layaly-cafe-13c2b/usage/details).  
2. **Export Firestore** to GCS (Console or `gcloud firestore export`).  
3. **Restore test** into a **separate** Firebase project; document counts.  
4. (Recommended) **Create staging project** + `.env.staging.local` + run Phase 7 cycle.  
5. From repo root with `$env:NODE_OPTIONS="--use-system-ca"` and `subst L:`:  
   - `npm run test:functions:financial` && `npm run test:rules`  
   - `firebase deploy --only functions --project layaly-cafe-13c2b`  
   - Set Functions secrets **`EMPLOYEE_PIN`** and **`VAULT_PIN`** (align with operational policy, not repo defaults).  
   - `firebase deploy --only firestore:indexes` → wait **Enabled**  
   - Backup legacy rules → copy hardened → `firebase deploy --only firestore:rules`  
   - Manager: `refreshAdminSession` / one-time `bootstrapAdminClaim`  
   - Fix Vercel build → `vercel --prod`  
   - **Last:** set `users/{ownerUid}.securityMode = 'hardened'`  
6. Read-only production smoke; **no test sales** without explicit approval.

Script helper: `scripts/production-go-live.ps1` (requires `LAYALI_BACKUP_BUCKET` or manual export confirmation).

---

## References

- [POST_DEPLOYMENT_INTEGRATION_AUDIT.md](./POST_DEPLOYMENT_INTEGRATION_AUDIT.md)  
- [PRODUCTION_DEPLOYMENT_RUNBOOK.md](./PRODUCTION_DEPLOYMENT_RUNBOOK.md)  
- [FINAL_EMULATOR_RELEASE_GATE.md](./FINAL_EMULATOR_RELEASE_GATE.md)  

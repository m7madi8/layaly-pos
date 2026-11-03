# FINAL PRODUCTION RELEASE REPORT — Layali POS

**Date:** 2026-11-03  
**Project ID:** `layaly-cafe-13c2b`  
**Vercel:** `layaly-pos` → `https://layali-pos.vercel.app`  
**Functions region:** `europe-west1`

---

## Executive verdict

### **PRODUCTION GO-LIVE: BLOCKED — Firebase CLI not authenticated (2026-11-03)**

Attempt to `firebase deploy --only functions --project layaly-cafe-13c2b` failed with:

`Authentication Error: Your credentials are no longer valid. Please run firebase login --reauth`

**Local readiness:** release gate **12/12 PASS**, rules **10/10**, unit **28/28**, frontend **136/136**, **build OK** (last run this session).

**No production deploy, rules change, or `securityMode` update was applied.**

### Previous status (same root cause)

Local **code, tests, and build** for hardened cutover are in place. **No production deploy** was executed because mandatory gates failed:

| Gate | Result |
|------|--------|
| Firebase CLI authenticated access to production | **FAIL** — `firebase login --reauth` required |
| Firestore full export + restore proof | **NOT RUN** — blocked by auth / no GCS export executed |
| Vercel production deploy | **NOT RUN** — CLI TLS/auth error on `vercel whoami` |
| `firebase deploy --only functions` | **NOT RUN** |
| Hardened rules on production | **NOT RUN** |
| `securityMode: hardened` on owner doc | **NOT RUN** |

**Per MASTER EXECUTION PROMPT §12:** deployment stopped; production was **not** partially hardened.

---

## 1. Fixes implemented (this session)

### Hardened gaps closed (server + gateway)

| Area | Change |
|------|--------|
| **Open bills** | `functions/lib/openBillsEngine.js` + callables `suspendOpenBill`, `closeOpenBill`, `cancelOpenBill` |
| **Employee benefits** | `functions/lib/employeeBenefitEngine.js`, `employeeBenefitAccounting.js` + `recordEmployeeBenefit`, `cancelEmployeeBenefit` |
| **Vault (manual)** | `functions/lib/vaultEngine.js` + `vaultAddCapital`, `vaultManualDeposit` (admin + server `VAULT_PIN`) |
| **Inventory FIFO (benefits)** | `consumeInventoryLayersFifo` in `functions/lib/inventoryLayerEngine.js` |
| **Client routing** | `src/services/operationalGateway.js` + `App.js` wired for bills, benefits, vault when `securityMode: hardened` |
| **Rules** | `firestore.rules.hardened` — added `openBills`, `employeeBenefitIdempotency` to financial deny list |
| **Rollback artifact** | `firestore.rules.legacy.backup-20261103` (copy of current legacy rules) |

Existing financial callables (orders, shifts, returns, payroll, checks, opening balance) unchanged in behavior; release gate still **12/12 PASS**.

---

## 2. Test results (executed 2026-11-03)

| Suite | Command | Result |
|-------|---------|--------|
| Release gate (financial E2E emulator) | `npm run test:functions:financial` | **12/12 PASS**, 0 skipped |
| Firestore rules | `npm run test:rules` | **10/10 PASS** |
| Functions unit | `npm run test:functions:unit` | **28/28 PASS** |
| Frontend unit | `npm test -- --watchAll=false` | **136/136 PASS** |
| Production build | `npm run build` | **SUCCESS** (eslint warning in `EmployeesView.js` only) |

**Not yet automated in release gate:** full 30-scenario checklist from MASTER prompt (open bill suspend/complete, benefit types, vault deposit) — engines exist; recommend extending `tests/release/finalEmulatorReleaseGate.test.js` before next deploy attempt.

---

## 3. Backup & restore

| Step | Status |
|------|--------|
| Verify active project | `.firebaserc` → `layaly-cafe-13c2b`; CLI `firebase use` shows same; **`firebase projects:list` failed (auth)** |
| Firestore export to GCS | **Not executed** |
| Test import to non-production project | **Not executed** |
| Document counts / spot checks | **Not executed** |

**Backup readiness:** **NOT CONFIRMED** — do not deploy until export + test restore complete.

Suggested export (after `firebase login --reauth`):

```bash
firebase use layaly-cafe-13c2b
gcloud firestore export gs://<YOUR_BUCKET>/layali-backup-YYYYMMDD-HHMM --project=layaly-cafe-13c2b
```

---

## 4. Secrets & environment (names only)

| Secret / flag | Where |
|---------------|--------|
| `EMPLOYEE_PIN` | Cloud Functions runtime |
| `VAULT_PIN` | Cloud Functions runtime |
| `REACT_APP_TRUSTED_ORDERS` | Vercel production = `true` before hardened rules |
| `REACT_APP_TRUSTED_CASH_SHIFTS` | Vercel production = `true` before hardened rules |
| `REACT_APP_VERIFY_EMPLOYEE_PIN_ON_SERVER` | Vercel production = `true` recommended |
| `REACT_APP_USE_FINANCIAL_CALLABLES` | Optional if using `securityMode: hardened` |

Values were **not** read from `.env.local` or logged. Confirm Vercel production env matches Firebase project id **`layaly-cafe-13c2b`**.

---

## 5. Production deployment status

| Phase | Status |
|-------|--------|
| Cloud Functions deploy | **Not done** |
| Admin claims bootstrap / refresh | **Not done** (requires live Functions + manager login) |
| Vercel production redeploy | **Not done** |
| Hardened Firestore rules publish | **Not done** |
| `users/{ownerUid}.securityMode = hardened` | **Not done** |
| Post-deploy smoke | **Not done** |

---

## 6. Rollback (prepared, not used)

1. Vercel: rollback to previous deployment in dashboard.  
2. Rules: deploy `firestore.rules.legacy.backup-20261103` as `firestore.rules` → `firebase deploy --only firestore:rules`.  
3. Tenant: set `securityMode: 'legacy'` on owner user doc.  
4. Functions: redeploy previous git revision if needed.  
5. Data: restore from verified GCS export only if corruption (accepts data loss after backup timestamp).

---

## 7. Status matrix

| Domain | Implementation | Automated test | Production live |
|--------|----------------|----------------|-----------------|
| POS / orders | Trusted callables + gateway | Unit + gate (sale/cancel) | Legacy rules still on prod |
| Shifts | Trusted callables + gateway | Unit + emulator paths | Not deployed |
| Employees / benefits | **Server engine + gateway** | Client accounting unit tests | Not deployed |
| Open bills | **Server engine + gateway** | Not in gate yet | Not deployed |
| Inventory / FIFO | Server layers + client | Partial in gate | Unchanged prod data |
| Returns | Callable + gateway | Gate 12/12 | Not deployed |
| Payroll / advances | Callable + gateway | Gate | Not deployed |
| Merchants / opening balance | Callable + gateway | Gate | Not deployed |
| Checks | Callable + gateway | Gate | Not deployed |
| Vault | **Callable + gateway** (close shift still server vault credit) | Not in gate yet | Not deployed |
| Reports | Client aggregates | Unit tests | Unchanged |
| Security | Hardened rules file ready | Rules 10/10 | **Legacy rules on prod** |

---

## 8. What you must do to complete go-live

1. **`firebase login --reauth`** (and fix Vercel CLI / network CA if needed).  
2. **Firestore export + test restore** on a separate Firebase project.  
3. Set Functions secrets **`EMPLOYEE_PIN`**, **`VAULT_PIN`** (match operational policy; not in git).  
4. Follow **`docs/PRODUCTION_DEPLOYMENT_RUNBOOK.md`** order: Functions → Vercel env + deploy → smoke on legacy rules → hardened rules → `securityMode: hardened`.  
5. Manager: **`refreshAdminSession`** after deploy; verify ID token `role: admin`.  
6. Post-deploy smoke checklist (runbook §8).  
7. Optional: extend release gate tests for open bills, benefits, vault.

---

## 9. Historical data

**No production Firestore documents were modified or deleted** in this session. No deploy, no rules publish, no `securityMode` change.

---

## 10. Launch timestamp

**Production launch:** *not executed* — blocked at backup/auth gates (2026-11-03).

When completed, record: Functions deploy time, Vercel deployment ID, rules deploy time, `securityMode` update time, smoke sign-off.

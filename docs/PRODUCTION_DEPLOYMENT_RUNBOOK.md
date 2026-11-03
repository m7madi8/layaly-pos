# PRODUCTION DEPLOYMENT RUNBOOK — Layali POS

**Date prepared:** 2026-11-03  
**Prerequisite:** [FINAL_EMULATOR_RELEASE_GATE.md](./FINAL_EMULATOR_RELEASE_GATE.md) — **PASS**  
**Status:** **Preparation only** — no deploy, no production data/rules changes, no commit/push performed for this document.

---

## Executive summary

This runbook describes how to cut over **`layaly-cafe-13c2b`** from **legacy Firestore rules + client-trusted financial writes** to **Cloud Functions + hardened rules + `securityMode: 'hardened'`**, with frontend on **Vercel** (`layaly-pos` → `https://layaly-pos.vercel.app`).

**Stop line:** Do **not** run any production-changing command until you **explicitly approve** after reviewing this document and completing backup **restore verification** (export alone is not enough).

---

## 1. Gate reference (emulator)

From [FINAL_EMULATOR_RELEASE_GATE.md](./FINAL_EMULATOR_RELEASE_GATE.md):

| Check | Result |
|-------|--------|
| `npm run test:functions:financial` | 12/12 pass, 0 skipped |
| `npm run test:rules` | 10/10 pass (`firestore.rules.hardened`) |
| `npm test -- --watchAll=false` | 136 pass |
| `npm run test:functions:unit` | 28 pass |
| `npm run build` | Success |

Re-run this matrix from `L:\` (subst path) **immediately before** production deploy day.

---

## 2. Firebase production — current state (repository + docs)

### 2.1 Project identity

| Item | Value |
|------|--------|
| **Firebase project ID** | **`layaly-cafe-13c2b`** (`.firebaserc` → `projects.default`) |
| **Rules test project** | `layali-rules-test` (emulators only — **not** production) |
| **Functions region** | `europe-west1` (`functions/index.js`, optional `REACT_APP_FUNCTIONS_REGION`) |

### 2.2 Hosting

| Item | Finding |
|------|---------|
| **Firebase Hosting** | **Not configured** in `firebase.json` (no `hosting` block) |
| **Production SPA** | **Vercel** project **`layaly-pos`** → production alias **`https://layaly-pos.vercel.app`** (see `docs/PRODUCTION-DEPLOYMENT-REPORT.md`) |
| **Mobile shell** | Expo WebView loads the same Vercel URL (`docs/MOBILE-EXPO.md`) |
| **Build** | CRA `npm run build`; env vars baked at **build time** on Vercel |

### 2.3 Firestore

| Item | Production today | Target after cutover |
|------|------------------|----------------------|
| **Active rules file** | [`firestore.rules`](../firestore.rules) — full owner read/write on all subcollections | [`firestore.rules.hardened`](../firestore.rules.hardened) published as production rules |
| **Indexes** | [`firestore.indexes.json`](../firestore.indexes.json) (empty indexes array) | Same — deploy with rules if changed |
| **Tenant flag** | `securityMode` absent or `legacy` | `users/{ownerUid}.securityMode = 'hardened'` **last** in sequence |

### 2.4 Cloud Functions

| Item | Production today (per project docs) | This repo |
|------|-------------------------------------|-----------|
| **Deployed** | Historically **not** deployed with activation bundle; web relied on client Firestore | **`functions/index.js`** — 22 HTTPS callables (orders, shifts, financial, auth helpers) |
| **Node** | — | `engines.node: 20` in `functions/package.json` |
| **Deploy script** | — | Local `functions/package.json` `deploy` script still echoes Phase 1 disable — use **`firebase deploy --only functions`** from repo root when approved |

**Callable surface (all `europe-west1`):**  
`bootstrapAdminClaim`, `verifyEmployeePin`, `refreshAdminSession`, `verifyVaultPin`, `resetSalesAndCustomerLedgers`, `completeOrder`, `openCashShift`, `closeCashShift`, `recordCashShiftMovement`, `cancelOrder`, `partialOrderReturn`, payroll (4), checks (3), `recordSupplierOpeningBalance`, test-data helpers (4).

### 2.5 Environment variables (names only — no values in this doc)

**Vercel / production SPA (build-time):**

| Variable | Role |
|----------|------|
| `REACT_APP_DEMO_MODE` | Must be `false` for café |
| `REACT_APP_FIREBASE_*` (6 keys) | Must match **`layaly-cafe-13c2b`** |
| `REACT_APP_ADMIN_EMAIL` | Must match Firebase Auth **manager** user email |
| `REACT_APP_EMPLOYEE_PASSWORD` | Employee tab gate (build validated — non-default) |
| `REACT_APP_VAULT_PIN` | Vault UI gate (build validated — non-default) |
| `REACT_APP_FUNCTIONS_REGION` | Optional; default `europe-west1` |
| **`REACT_APP_TRUSTED_ORDERS`** | **`true`** required before hardened rules (POS checkout/cancel) |
| **`REACT_APP_TRUSTED_CASH_SHIFTS`** | **`true`** required before hardened rules (open/close/movements) |
| **`REACT_APP_VERIFY_EMPLOYEE_PIN_ON_SERVER`** | **`true`** recommended for JWT `cashier` vs UI-only employee mode |
| `REACT_APP_USE_FINANCIAL_CALLABLES` | Optional if using `securityMode: 'hardened'` (gateway auto-enables callables when hardened) |

**Cloud Functions (runtime — set in Firebase, not in repo):**

| Secret / env | Purpose |
|--------------|---------|
| **`EMPLOYEE_PIN`** | Server validation in `verifyEmployeePin` (must align operationally with staff login policy — **do not** commit values) |
| **`VAULT_PIN`** | Server validation in `verifyVaultPin` (align with vault UI policy) |

Emulator-only defaults in `firebase.json` **must not** be copied to production.

### 2.6 Custom claims & accounts

| Actor | Auth | Claims (target model) | Data preserved |
|-------|------|------------------------|----------------|
| **Manager** | Email/password (`REACT_APP_ADMIN_EMAIL`) | `role: 'admin'` via `refreshAdminSession` after login and/or one-time `bootstrapAdminClaim` | Same Firebase **UID** = tenant `users/{uid}` — **no** user deletion |
| **Employee (device)** | Same Firebase user on paired device after manager sign-in once | `role: 'cashier'` via `verifyEmployeePin` + custom token when server PIN enabled | **`staffMembers`** and all subcollections **unchanged** by deploy |
| **Legacy UX** | `localStorage` role (`admin` / `employee`) | **Not authoritative** when hardened; used for navigation only | — |

**Pre-cutover checks (Console / Admin SDK script — manual):**

1. Confirm at least one Auth user exists for manager email.  
2. Note owner **UID** (`users/{uid}` document).  
3. If custom claims already set, `bootstrapAdminClaim` will refuse — use `refreshAdminSession` instead.  
4. Document which devices use employee PIN vs manager password (operational, not in git).

---

## 3. Backup — full snapshot & restore proof

### 3.1 What to back up

| Asset | Method | Suggested storage (operator-owned) |
|-------|--------|-------------------------------------|
| **Firestore data** | [Export](https://firebase.google.com/docs/firestore/manage-data/export-import) to GCS | `gs://<YOUR_BACKUP_BUCKET>/layali/firestore-YYYYMMDD-HHMM/` |
| **Auth users** | Console export or documented recovery procedure for manager account | Encrypted offline store (not git) |
| **Rules / indexes snapshot** | Copy from release tree: `firestore.rules`, `firestore.rules.hardened`, `firestore.indexes.json`, `firebase.json` | Same backup folder + git tag at release commit |
| **Functions code** | Git commit hash + optional `firebase functions:log` baseline | Document deployed version after cutover |
| **Hosting** | Vercel → Deployments → **Promote/Rollback** target ID; optional download of last good `build/` artifact | Vercel retention + local encrypted copy |
| **Env configuration** | Secure export of **variable names and values** from Vercel + Firebase Functions config | Password manager / vault — **never** this markdown file |

**Plan requirement:** Firebase project must be on **Blaze** for scheduled/large exports and for Cloud Functions.

### 3.2 Restore verification (mandatory before cutover)

> **Export success ≠ restore success.**

| Step | Action | Pass criterion |
|------|--------|----------------|
| 1 | Run Firestore **export** to GCS | Operation completes in Console / `gcloud` |
| 2 | Record export path + timestamp | Written in operator log |
| 3 | **Test import** into a **separate** Firebase project **or** a dedicated restore test database | Import completes without error |
| 4 | Spot-check documents | `users/{uid}`, sample `orders`, `cashShifts`, `staffMembers`, `products` counts match expectations |
| 5 | Optional PITR | If Blaze PITR enabled, note retention window for faster rollback |

**Backup readiness for this runbook:** **Prepared procedure only** — **not confirmed** until you complete steps 1–4 above and sign off in your operator log.

---

## 4. Compatibility review (hardened cutover)

### 4.1 Rules vs client writes

When `securityMode === 'hardened'`, [`firestore.rules.hardened`](../firestore.rules.hardened) **denies** client writes to financial subpaths (including `orders`, `cashShifts`, `openBills`, `vault`, `employeeBenefits`, payroll, checks, returns, idempotency, etc.).

**Gateway-covered flows** (client → callables when hardened or `REACT_APP_USE_FINANCIAL_CALLABLES=true`):

- Partial returns, payroll/advances, checks, supplier opening balance — [`financialGateway.js`](../src/services/financialGateway.js).

**Requires SPA flags before hardened rules:**

| Flow | Flag | Callable |
|------|------|----------|
| Checkout / edit order (trusted path) | `REACT_APP_TRUSTED_ORDERS=true` | `completeOrder` |
| Cancel order | same | `cancelOrder` |
| Open / close shift, shift movements | `REACT_APP_TRUSTED_CASH_SHIFTS=true` | `openCashShift`, `closeCashShift`, `recordCashShiftMovement` |

**Do not publish hardened rules until** production hosting build has **both** trusted flags enabled **and** Functions are deployed and smoke-tested.

### 4.2 Known gaps after hardened (no server callable yet)

These still use **direct Firestore writes** in code and will **fail** under hardened rules until a future callable migration:

| Feature | Client module | Rules impact |
|---------|---------------|--------------|
| **Open bills** (tabs) | `openBillsService.js` | `openBills` is financial — **write denied** |
| **Employee benefits** | `employeeBenefitService.js` | `employeeBenefits` — **write denied** |
| **Vault deposits / capital** | `vaultService.js` | `vault` / movements — **write denied** (read admin-only) |

**Mitigation options (choose before cutover):**

- **A — Accept restriction:** Disable or avoid these flows until callables exist; train staff.  
- **B — Delay hardened:** Deploy Functions + trusted orders/shifts + financial callables first; keep **`securityMode: legacy`** and legacy rules until gaps closed.  
- **C — Partial hardened:** Not supported by current rules design — do not set `securityMode: hardened` without addressing gaps.

Purchases, normal expenses (non-payroll fields), products, customers (non-order paths), suppliers catalog — remain **client-writable** for cashier/admin under hardened rules.

### 4.3 Admin permissions

- Admin callables require JWT **`role: 'admin'`** (`requireAdminClaim`).  
- After deploy: manager must **`refreshAdminSession`** (or bootstrap once) so payroll/checks/register opening balance work.  
- **`staffMembers`** documents are **not** deleted by deploy; on-duty and employee UI data remain.

### 4.4 Direct financial writes audit (hardened)

| Path | Bypasses gateway? | Safe at hardened? |
|------|-------------------|-------------------|
| Payroll / returns / checks / opening balance | No — gateway → callables | Yes (if Functions up) |
| POS sale / cancel | Uses callables only if `TRUSTED_ORDERS` | Yes when flag on |
| Shifts | Uses callables only if `TRUSTED_CASH_SHIFTS` | Yes when flag on |
| Legacy `payrollService` / `orderReturnService` | Used only when **not** hardened | Blocked once hardened |
| Purchases / expenses | Client transactions | Allowed (except sensitive expense fields) |

---

## 5. Safe deployment order (production)

Execute **only after backup restore verification** and **explicit approval**.

| Phase | Action | Rationale |
|-------|--------|-----------|
| **0** | Maintenance window announced; re-run emulator gate locally | Last automated check |
| **1** | Set Functions secrets **`EMPLOYEE_PIN`**, **`VAULT_PIN`** in Firebase (production) | Server PIN checks |
| **2** | `firebase use layaly-cafe-13c2b` → **`firebase deploy --only functions`** | All callables live before rules tighten |
| **3** | Manager login → **`bootstrapAdminClaim`** (once if no claim) → **`refreshAdminSession`** → re-login | Admin JWT for callables |
| **4** | Smoke **legacy rules**: call `completeOrder` / `openCashShift` from app with **new** Vercel env flags **before** rules swap (see phase 5–6) | Validates Functions + flags |
| **5** | Vercel: set trusted + verify PIN env vars → **Redeploy production** (`npm run build` on Vercel) | Build-time flags required |
| **6** | Post-deploy smoke with **legacy rules** still active: sale, shift open, one financial callable | Catches misconfig before lockdown |
| **7** | Publish **hardened** rules (see §6 commands) | **Point of no return** for client financial writes |
| **8** | Firestore: `users/{ownerUid}` → `securityMode: 'hardened'` (admin Auth only) | Enables gateway + rules alignment |
| **9** | Run **§8 post-deploy tests** on live café (manager + employee devices) | Human verification |

**Never:** Phase 7 or 8 before Phase 2 + 5 + 6.

---

## 6. Exact deploy commands (do not run until approved)

Working directory: project root (use `subst L:` on Windows if rules paths fail in emulators; deploy uses repo paths normally).

```powershell
# ── Context ──
firebase login
firebase use layaly-cafe-13c2b

# ── Phase 1: Functions secrets (example — use Firebase Console or Secret Manager UI) ──
# Set EMPLOYEE_PIN and VAULT_PIN for Cloud Functions runtime (no values in docs).

# ── Phase 2: Functions ──
cd functions
npm ci
cd ..
firebase deploy --only functions

# ── Phase 3: Admin claims (from signed-in manager app or Firebase shell / script) ──
# Callable: bootstrapAdminClaim (once) then refreshAdminSession after each manager password login.

# ── Phase 5: Frontend (local build check; production via Vercel) ──
npm ci
npm run build
# Vercel production redeploy (linked project layaly-pos):
#   vercel --prod
# Or: Vercel Dashboard → Deployments → Redeploy with updated env.

# ── Phase 7: Hardened Firestore rules ──
# Backup current rules file first:
Copy-Item firestore.rules firestore.rules.legacy.backup-YYYYMMDD
Copy-Item firestore.rules.hardened firestore.rules
firebase deploy --only firestore:rules
# Keep firestore.rules.hardened in repo in sync if you maintain both files.

# Optional indexes (if ever populated):
# firebase deploy --only firestore:indexes

# ── Phase 8: Tenant flag (Admin SDK / Console — single doc update) ──
# users/{ownerUid}  securityMode: "hardened"
# Do NOT run during business service without maintenance window.

# ── Storage (unchanged unless you edit storage.rules):
# firebase deploy --only storage
```

**Rollback commands (summary — detail in §7):**

```powershell
Copy-Item firestore.rules.legacy.backup-YYYYMMDD firestore.rules
firebase deploy --only firestore:rules
# Vercel: rollback to previous deployment
# Functions: redeploy previous git revision or firebase functions:delete (last resort)
```

---

## 7. Rollback plan

| Failure mode | Rollback | Data risk |
|--------------|----------|-----------|
| Bad SPA / env flags | Vercel **Rollback** to previous deployment | None if no schema change |
| Hardened rules too strict | Restore **`firestore.rules.legacy.backup-*`** → `firebase deploy --only firestore:rules` | None |
| `securityMode: hardened` set too early | Set `securityMode: 'legacy'` on user doc + legacy rules | None |
| Functions regression | Redeploy prior Functions release from known git SHA | In-flight callables may fail until fixed |
| Financial corruption | **Stop operations**; restore Firestore from **verified** GCS export (may lose post-backup writes) | High — requires export timestamp discipline |
| Wrong PIN / lockout | Fix Functions secrets; manager `refreshAdminSession` | None |

**Do not** use in-app **System reset** on production unless intentional data wipe.

---

## 8. Post-deploy test checklist (live production)

Perform on **two devices** (manager + employee) during low traffic. Record pass/fail in operator log.

| # | Test |
|---|------|
| 1 | Manager: email login → dashboard loads; confirm admin-only screens visible |
| 2 | Manager: `refreshAdminSession` path (re-login) — no permission errors on payroll callable |
| 3 | Employee: employee tab PIN → POS access; **cannot** open payroll / employees admin |
| 4 | Open cash shift (on-duty staff if configured) |
| 5 | POS: cash sale → order appears; stock decreases |
| 6 | POS: debt / mixed payment (if used) |
| 7 | Expense (operating, non-payroll) |
| 8 | Purchase / supplier payment (if used) |
| 9 | Employee benefit — **expect failure if hardened without callable**; skip or use legacy mode only |
| 10 | Partial return (cash then debt if applicable) |
| 11 | Payroll accrual + partial payment + final payment |
| 12 | Advance + repayment |
| 13 | Check in: register → collect → return |
| 14 | Check out: register → pay → return |
| 15 | Supplier opening balance (once per supplier) |
| 16 | Close shift + cash count reconciliation |
| 17 | Reports/dashboard spot-check vs shift |
| 18 | **Negative test:** employee device cannot write `payrollAccruals` via app (permission denied) |

---

## 9. Services & files that will change on deploy

| Layer | Changes |
|-------|---------|
| **Firebase Functions** | New/updated code under `functions/` (all callables listed §2.4) |
| **Firestore rules** | Production rules content replaced with hardened policy (via `firestore.rules` deploy artifact) |
| **Firestore data** | One field update: `users/{uid}.securityMode` → `hardened` (Phase 8 only) |
| **Vercel hosting** | New static `build/` with updated `REACT_APP_*` flags |
| **Auth** | Custom claims on existing UID(s) — no mass account recreation |
| **Unchanged by default** | `storage.rules`, empty composite indexes, Firebase Hosting (not used) |

---

## 10. Deployment risks (summary)

| Risk | Severity | Mitigation |
|------|----------|------------|
| Hardened rules before trusted SPA | **Critical** — POS/shift dead | Order in §5 |
| Functions secrets missing | **High** — employee PIN / vault verify fail | Phase 1 + smoke |
| Open bills / benefits / vault under hardened | **High** — feature breakage | §4.2 decision before Phase 8 |
| Admin claim not refreshed | **High** — admin callables denied | bootstrap + refreshAdminSession |
| Employee PIN mismatch (SPA vs Functions) | **Medium** — login failures | Operational alignment of PIN secrets |
| No verified restore | **Critical** — irrecoverable data loss | §3.2 before cutover |
| Shared UID admin/employee model | **Medium** — claim overwrite on PIN login | Train: manager refresh after employee session on same device |

---

## 11. Approval record (operator)

| Field | Value |
|-------|--------|
| Emulator gate | PASS ([FINAL_EMULATOR_RELEASE_GATE.md](./FINAL_EMULATOR_RELEASE_GATE.md)) |
| Backup export completed | ☐ (operator) |
| Restore test completed | ☐ (operator) |
| Open bills / benefits / vault decision | ☐ A / B / C (§4.2) |
| Deploy approved by | __________________ |
| Date / time window | __________________ |

---

## 12. Stop line

**No production deploy has been executed for this runbook.**

Await **your explicit approval** before running any command in §6 or changing production Firestore, Auth claims, Functions, or Vercel production.

# Layali Café POS — Production Deployment Final Report

| Field | Value |
|-------|--------|
| **Report date** | 2026-11-14 (UTC+2) |
| **Operator environment** | Windows, repo via `D:\completed\layali-cafe` junction → `d:\completed\ليالي كافي` |
| **Final status** | **BLOCKED_BEFORE_DEPLOYMENT** |

---

## Executive summary

All **local automated gates** for the **Spark (no Functions)** release pass: **13/13** Firestore rules tests, **206/206** application tests, and **`CI=true` production build**. Security rules include the **supplier wildcard bypass fix** (`subCollection != 'suppliers'` on cashier wildcard writes).

**No production deploy was executed.** Mandatory gates failed:

1. **No verified, restorable Firestore backup** (operator sign-off / restore test not evidenced in this session).
2. **Firebase CLI authentication expired** (`firebase login --reauth` required).
3. **Vercel CLI unavailable** from this environment (TLS certificate error contacting `vercel.com`).
4. **Production Auth / env not verifiable** without Console + Vercel dashboard access (cashier account, `REACT_APP_CASHIER_EMAIL`).

Live production SPA at **https://layaly-pos.vercel.app** still presents the **legacy employee-PIN** login copy (not the new separate cashier Firebase login). Production Firestore rules are assumed to still match **`firestore.rules.legacy.backup-20261103`** (owner-only `auth.uid == userId`) until a rules deploy is performed.

**Do not run** `scripts/production-go-live.ps1` (Blaze / hardened / Functions path). Use **`scripts/spark-production-deploy.ps1`** after gates pass.

---

## 1. Production target verification

| Check | Evidence | Result |
|-------|----------|--------|
| Firebase default project | `.firebaserc` → `layaly-cafe-13c2b` | **PASS** |
| Rules emulator project | `layali-rules-test` (tests only) | **PASS** (not production) |
| Vercel production URL | GET https://layaly-pos.vercel.app/ | **PASS** (loads; Arabic login UI) |
| Blaze / Functions | User constraint: Spark only | **N/A — not deployed** |
| Hosting | `vercel.json` headers only; SPA on Vercel | **CONFIRMED** |

---

## 2. Pre-deployment audit (repository)

### 2.1 Authentication & tenant model (target release)

| Topic | Finding |
|-------|---------|
| Admin | `REACT_APP_ADMIN_EMAIL` + Firebase password; role from `tenants/{tenantId}/members/{uid}` |
| Cashier | `REACT_APP_CASHIER_EMAIL` + separate Firebase password (`signInWithCashierPassword`) |
| Data root | Unchanged: `users/{tenantId}/**` |
| Legacy | `legacyUnmigratedOwner` while `tenants/{tenantId}` absent → preserves current single-UID production until bootstrap |
| localStorage role | Deprecated (`adminAuth.js`); not authoritative |
| Hardened / callables | **Out of scope** for Spark release |

### 2.2 Firestore rules (to deploy)

Active artifact: **`firestore.rules`** (tenant membership + field guards).

| Control | Implementation |
|---------|------------------|
| Cross-tenant | Staff membership required; legacy owner path only when unmigrated |
| Vault | Admin / legacy owner only |
| Supplier balance-only patch | Denied for staff; admin requires audit fields |
| Cashier wildcard overlap | **`subCollection != 'suppliers'`** — fixes OR-bypass |
| Payroll expense shapes | Cashier denied sensitive keys |
| Admin membership forge | Cashier cannot create `members` with `admin` |
| Join requests | Strict field set; forged fields denied |
| Bootstrap intruder | Self-admin on existing tenant denied unless `auth.uid == tenantId` first bootstrap |

Local snapshot before deploy: `firestore.rules.spark.predeploy-20261114`.

### 2.3 Indexes

`firestore.indexes.json` defines **3** composite indexes (`checks`, `expenses`, `supplierId+date`, `orders status+timestamp`). Deploy with rules if not already in Console.

### 2.4 Supplier & financial protection

| Operation | Rules | Gap |
|-----------|-------|-----|
| Supplier create / non-balance update | Cashier allowed via `/suppliers` match | OK for daily ops |
| Supplier balance-only update | Denied (cashier); audited (admin) | **PASS** (emulator) |
| Supplier delete | Cashier **may delete** (`canWriteBusinessData` on delete) | **Limitation:** rules do not block delete with linked ledger; rely on app discipline / future hardening |
| Multi-doc financial invariants | Client batches + rules field guards | **Spark limitation** — no server ledger |

### 2.5 Local-first / reads

- Architecture preserved: Firestore → IndexedDB → local-first stores → React.
- `loadDashboardTodayMetrics`: paginates today’s orders (`PAGE=150`, `HARD_CAP=6000`), 30s in-memory cache; **not** a single 150-order KPI cap for dashboard when pagination completes.
- Session: `clearFirestoreClientSessionState` on logout (reduces cross-account cache risk; shared device still requires sign-out).

---

## 3. Backup & rollback

### 3.1 Backup gate — **FAILED**

| Requirement | Status |
|-------------|--------|
| Verified restorable Firestore export | **NOT EVIDENCED** |
| Spark-compatible method documented | Console export / operator-owned backup; GCS export typically needs Blaze |
| Rules snapshot in repo | `firestore.rules.legacy.backup-20261103`, `firestore.rules.spark.predeploy-20261114` |
| Auth export | **Operator** — not in git |

**Per release policy:** deployment **blocked** until operator completes backup + restore proof (separate test import or signed log).

### 3.2 Rollback procedure (after any partial deploy)

| Layer | Action |
|-------|--------|
| **Rules** | `Copy-Item firestore.rules.legacy.backup-20261103 firestore.rules` → `firebase deploy --only firestore:rules --project layaly-cafe-13c2b` |
| **Frontend** | Vercel → Deployments → **Rollback** to last known-good |
| **Membership docs** | Optional delete via Console; harmless under legacy rules |
| **Do not** | Blindly restore overly permissive rules without understanding; legacy backup is **known** production state pre-cutover |

---

## 4. Automated test evidence (2026-11-14)

| Command | Discovered | Passed | Notes |
|---------|------------|--------|-------|
| `npm run test:rules` | **13** | **13** | Junction path `D:\completed\layali-cafe` |
| `npm test -- --watchAll=false` | **206** (44 suites) | **206** | |
| `CI=true npm run build` | — | **Success** | `prebuild` assert-production-env |

**Rules scenarios included:** legacy owner, POS orders, vault deny, supplier balance deny, supplier non-balance allow, self-role deny, cross-tenant, join request, admin membership deny, forged join, payroll expense deny, bootstrap, intruder self-enroll deny.

**Not run (Spark scope):** `npm run test:functions:financial` — requires Functions / Blaze emulator bundle.

### Financial regression (isolated 100+ orders)

No dedicated automated “100 orders / 150 active orders” emulator suite in repo. Regression coverage is via unit tests (`activeOrdersStore`, `dashboardTodayMetricsStore`, `orderAccounting`, etc.). **Do not run destructive load tests against production.**

---

## 5. Deployment gates checklist

| # | Gate | Result |
|---|------|--------|
| 1 | Verified backup & rollback | **FAIL** |
| 2 | Rules tests | **PASS** (13/13) |
| 3 | Financial regression (automated) | **PARTIAL** (unit coverage only) |
| 4 | Production build | **PASS** |
| 5 | Correct Firebase project | **PASS** (config) |
| 6 | Vercel env (cashier email, Firebase keys) | **NOT VERIFIED** |
| 7 | Admin authentication (production) | **NOT VERIFIED** |
| 8 | Cashier Auth user exists | **NOT VERIFIED** |
| 9 | Indexes ready | **READY** (file in repo; deploy pending) |
| 10 | Critical security defects open | **NONE** in rules tests for Spark model |

---

## 6. Safe Spark deployment order (when unblocked)

Execute **`scripts/spark-production-deploy.ps1`** only after `LAYALI_BACKUP_CONFIRMED=yes`.

| Phase | Action | Rationale |
|-------|--------|-----------|
| 0 | Maintenance window; re-run test matrix | Evidence refresh |
| 1 | Firebase Console: create **cashier** Email/Password user (separate UID) | Required for dual identity |
| 2 | Vercel: set `REACT_APP_CASHIER_EMAIL` (+ existing Firebase/admin env) | CRA bakes at build time |
| 3 | **`firebase deploy --only firestore:rules,firestore:indexes`** | Legacy owner path keeps current admin working until `tenants/{uid}` exists |
| 4 | Vercel production redeploy (`vercel --prod` or Dashboard) | New membership UI + `dataUid` |
| 5 | Admin smoke: login → tenant bootstrap → invite code | Activates membership model |
| 6 | Cashier smoke: join → admin approve → POS | End-to-end auth |
| 7 | 48h Firebase Usage monitoring | Reads/writes/errors |

**Avoid:** `firestore.rules.hardened`, `securityMode: 'hardened'`, Functions deploy on Spark.

---

## 7. Post-deployment verification (not performed — pending deploy)

### 7.1 Read-only smoke (performed 2026-11-14)

| Check | Result |
|-------|--------|
| Website loads | **PASS** |
| Legacy login copy visible | **CONFIRMED** (pre-release frontend) |
| Firebase / login flows | **NOT TESTED** (no credentials in agent session) |

### 7.2 Required live checks (operator, low traffic)

Admin login, dashboard, products, customers, suppliers, shifts, historical orders, permission errors in browser console, index errors in Firebase Console.

**No synthetic financial writes in production** unless approved controlled procedure.

---

## 8. Monitoring procedure (24–48h after deploy)

| Signal | Where | Action |
|--------|-------|--------|
| Firestore reads/writes | Firebase Console → Usage | Compare to 7-day baseline (operator snapshot pre-deploy) |
| Permission denied spikes | Console + browser console | Map to missing index vs rules |
| Auth failures | Authentication → Users | Cashier/admin misconfig |
| Missing indexes | Console error links | Deploy `firestore.indexes.json` |
| In-app reads | Settings → مراقبة قراءات Firestore | Spot-check only; not a billing substitute |

---

## 9. Files changed in release tree (uncommitted / pending deploy)

Representative set from `git status` (Spark + read optimization pass):

- **Rules / tests:** `firestore.rules`, `firestore.indexes.json`, `tests/security/firestore.rules.test.js`
- **Auth / tenant:** `src/services/tenantMembershipService.js`, `src/firebaseClient.js`, `src/config/authSecrets.js`, `src/adminAuth.js`, `src/App.js`
- **Local-first / reads:** `src/services/localFirst/**`, `firestoreViewDataPolicy`, order queries, supplier reads
- **Docs / scripts:** `docs/FIRESTORE_SPARK_SECURITY_RELEASE.md`, `scripts/spark-production-deploy.ps1`, `scripts/patch-app-datauid.js`

**Version:** `package.json` → `0.1.0` (no semver bump in repo).

**Vercel deployment ID / new release hash:** **N/A** — deploy not executed.

---

## 10. Remaining limitations

1. **Spark:** No server-side financial invariants; races rely on client transactions + rules field guards.
2. **Supplier delete:** Cashiers may delete supplier documents per rules; no ledger-based delete block in rules.
3. **Shared device:** IndexedDB is per Firebase app, not per UID — mandatory sign-out between admin/cashier.
4. **Backup on Spark:** Full managed export may require Blaze; operator must use an approved backup method.
5. **Production cutover:** Until frontend + rules deploy, production remains **legacy auth UX** and **legacy rules**.

---

## 11. Operator actions to reach DEPLOYED_AND_VERIFIED

```powershell
# 1. Backup (document path + restore test) then:
$env:LAYALI_BACKUP_CONFIRMED = 'yes'

# 2. Firebase CLI
firebase login --reauth
cd D:\completed\layali-cafe

# 3. Automated deploy script (rules + local snapshot; Vercel steps printed)
.\scripts\spark-production-deploy.ps1

# 4. Vercel Dashboard: REACT_APP_CASHIER_EMAIL + redeploy production

# 5. Live smoke checklist (section 7.2)
```

---

## 12. Final status

| Status | **BLOCKED_BEFORE_DEPLOYMENT** |
|--------|----------------------------------|
| Reason | Backup not verified; Firebase/Vercel CLI not authenticated; production Auth/env/smoke not confirmed |
| Automated quality | Rules **13/13**, app **206/206**, build **OK** |
| Production state | Unchanged — legacy hosting UI; rules deploy not run |

---

*No production data modified. No credentials logged. No deploy commands executed against `layaly-cafe-13c2b` in this session.*
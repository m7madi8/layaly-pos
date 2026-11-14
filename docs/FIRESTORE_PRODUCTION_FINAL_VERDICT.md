# Firestore Production Final Verdict

**Date:** 2026-11-14  
**Final verdict:** **BLOCKED**

---

## 1. Production risks addressed (this pass)

| Risk | Mitigation |
|------|------------|
| Open bills omitted (40-cap) | Unbounded realtime query on `status in [unpaid, partial]` + paginated backfill (`activeOrdersStore`) |
| Dashboard KPIs from 150-order slice | Paginated `loadDashboardTodayMetrics` for authoritative today totals |
| Supplier balance auto-write on reconcile | Read-only preview (prior pass); rules block balance-only cashier patch in **hardened** mode |
| UI role without JWT | Employee login requires server PIN when `securityMode === 'hardened'` |
| Permissive production rules file | `firestore.rules` updated to dual **legacy / hardened** policy (not deployed automatically) |

---

## 2. Files modified (this pass)

```
firestore.rules
firestore.rules.hardened
src/App.js
src/services/firestoreSessionCleanup.js
src/services/localFirst/activeOrdersStore.js          (new)
src/services/localFirst/activeOrdersStore.test.js     (new)
src/services/localFirst/dashboardTodayMetricsStore.js (new)
src/services/localFirst/dashboardTodayMetricsStore.test.js (new)
src/services/localFirst/financialCacheInvalidation.js
src/utils/firestoreOrderQueries.js
src/utils/firestoreOrderQueries.test.js
tests/security/firestore.rules.test.js
docs/FIRESTORE_PRODUCTION_FINAL_VERDICT.md
```

---

## 3. Security architecture and limitations

### How auth works today

| Actor | Firebase Auth | UID | Role in UI | Enforceable in rules? |
|-------|---------------|-----|------------|------------------------|
| **Admin** | Email/password (`admin@layali.cafe`) → optional `refreshAdminSession` custom token `{ role: 'admin' }` | **Business owner UID** (one tenant) | `localStorage` `layali-user-role` = `admin` | **Only if** JWT claim `role` is present |
| **Employee** | Same device: reuses existing Auth session OR `verifyEmployeePin` → custom token `{ role: 'cashier' }` | **Same owner UID** | `localStorage` = `employee` | **Only if** server PIN + custom token used |

**Critical:** Admin and employee are **not separate Firebase users**. They share the **same `auth.uid`** (the café owner’s project user). Role separation in the React app is **`localStorage`**, which Firestore Rules **cannot** read.

**Therefore:** In **`securityMode` absent / `legacy`**, any authenticated client with the owner UID has **full read/write** on all subcollections — employee vs admin is **not** security-enforced.

**When enforceable:**

1. Deploy Cloud Functions (`verifyEmployeePin`, `refreshAdminSession`, financial callables).
2. Deploy updated `firestore.rules` (dual legacy/hardened).
3. Set `users/{ownerUid}.securityMode = 'hardened'` **last** (after smoke on callables + trusted SPA flags).
4. Employees must use **server PIN** → JWT `role: 'cashier'`; admins `role: 'admin'`.

**Hardened rules (in repo):**

- Financial subpaths (orders, shifts, vault, idempotency, returns, payroll, …): **client write denied**; use callables.
- Catalog / CRM (products, customers, suppliers profile fields, ordinary expenses): **cashier + admin** JWT.
- **Suppliers:** cashier cannot `update` **balance-only** patches; admin may apply **audited** correction fields.
- **Vault:** cashier **read denied**; admin read only.
- **Legacy mode:** unchanged full owner access (production default until `securityMode` flipped).

**Cannot fix without architecture change:** Employee on legacy login path (shared session + `localStorage` only) = **same power as admin** at Firestore layer.

---

## 4. Active-order completeness

| Mechanism | Behavior |
|-----------|----------|
| Realtime | `resolveEmployeePosOpenOrdersSpec` — **no `limit`** on `unpaid` / `partial` |
| Backfill | `fetchAllActiveOrders` — pages of 50 until short page or **HARD_CAP 500** (then `complete: false`) |
| Merge | `mergeOrdersById` dedupes today + open streams |
| UX | Amber alert on POS if `activeOrdersMeta.complete === false` |

**Verification (automated):** `activeOrdersStore.test.js` — 55 open bills across 2 pages → `complete: true`.

**Not run:** Live emulator test with 40+ historical unpaid orders.

---

## 5. Dashboard financial accuracy

| Data | Source |
|------|--------|
| Historical closed days | `businessDaySummaries` (unchanged) |
| **Today KPIs** (cash, debt, paid/unpaid totals, order count) | `loadDashboardTodayMetrics` — paginated `getDocs` for all calendar-today orders (page 150) |
| Live list / charts / top products | Still from realtime **≤150** today listener — operational, not authoritative for totals |
| Incomplete state | Banner when metrics loading or `complete: false` |

**Verification (automated):** `dashboardTodayMetricsStore.test.js` — aggregates **200** paid orders → sales 2000.

**Gap:** Payment-method pie still uses `dashboardOrders` slice when >150 orders — may be operationally incomplete until extended to use `authoritativeToday.paymentStats`.

---

## 6. Tests executed and results

| Command | Result |
|---------|--------|
| `npm test -- --watchAll=false` | **PASS** — 43 suites, 205 tests |
| `CI=true npm run build` | **PASS** |
| `npm run test:rules` | **FAIL** — Firestore emulator JAR download blocked (`storage.googleapis.com/.../cloud-firestore-emulator-v1.19.8.jar`) |
| 18-scenario financial regression matrix (emulator / manual) | **NOT EXECUTED** |
| `npm run test:functions:financial` | **NOT RUN** (requires emulators + Blaze) |

### Rules tests (not executed — reproducible locally)

```powershell
# Pre-cache emulator (once, with working network):
firebase setup:emulators:firestore

cd "d:\completed\ليالي كافي"
npm run test:rules
# Expect 12 tests (10 existing + 2 supplier balance tests)
```

---

## 7. Remaining Firestore read risks

- Open-order realtime query reads **all** matching unpaid/partial docs on subscribe (bounded by business open-bill count, not historical completed).
- Dashboard today metrics: **one paginated scan** per dashboard visit (cached 30s); invalidates on order mutations.
- Today POS listener still **80** docs for today’s completed flow (does not affect open bills).

---

## 8. Required indexes

Ensure deployed (includes prior final pass):

```json
{
  "collectionGroup": "orders",
  "fields": [
    { "fieldPath": "status", "order": "ASCENDING" },
    { "fieldPath": "timestamp", "order": "DESCENDING" }
  ]
}
```

Plus existing `expenses` supplierId+date, `checks`, etc. in `firestore.indexes.json`.

---

## 9. Deployment commands (manual approval)

```powershell
# 1) Indexes
firebase deploy --only firestore:indexes --project <PROJECT_ID>

# 2) Rules (dual legacy/hardened — does NOT tighten until securityMode hardened)
firebase deploy --only firestore:rules --project <PROJECT_ID>

# 3) Functions (PIN + admin session + financial engines) — if not already live
cd functions
npm ci
firebase deploy --only functions --project <PROJECT_ID>

# 4) Frontend
cd "d:\completed\ليالي كافي"
npm ci
$env:CI='true'; npm run build
# push to Vercel / vercel --prod

# 5) Hardened cutover ONLY after smoke (runbook) — LAST step:
# Firestore Console: users/{ownerUid} → securityMode: "hardened"
```

---

## 10. Rollback

| Step | Rollback |
|------|----------|
| Frontend | Redeploy previous Vercel deployment |
| Rules | Restore `firestore.rules.legacy.backup-20261103` → `firebase deploy --only firestore:rules` |
| `securityMode` | Set `legacy` or remove field on owner user doc |
| Indexes | Additive — no rollback required |

---

## Why BLOCKED (not READY_FOR_PRODUCTION)

1. **Firestore Security Rules tests did not run** in this environment (emulator download failure).
2. **Production still on legacy rule behavior** until rules deploy + optional hardened cutover — **employee/admin share UID**; legacy path has **no role separation**.
3. **Full financial regression matrix** (100+ sales, concurrent sessions, shift/day close under rules) **not executed**.
4. **Hardened production** requires **Cloud Functions + env flags + ordered cutover** — not verified end-to-end here.

### Path to READY_FOR_PRODUCTION

1. Cache/run `npm run test:rules` (12/12 pass).
2. Run `tests/release/finalEmulatorReleaseGate.test.js` on staging with emulators.
3. Deploy rules (legacy path safe for current prod).
4. Enable Functions + employee server PIN on production devices.
5. Complete hardened cutover per `docs/PRODUCTION_DEPLOYMENT_RUNBOOK.md`.
6. Smoke: >150 orders dashboard KPIs, >40 open bills, employee cannot patch supplier balance in hardened mode.

---

## Production data migration

**None required** for this frontend/rules release. No automatic balance or summary backfill.
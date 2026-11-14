# Firestore Read Audit — Layali POS

**Date:** 2026-11-14  
**Stack:** React SPA → Firestore (Spark ~50k reads/day) · No Cloud Functions in scope  
**Goal:** Map billed read sources; prioritize employee full-day + occasional admin.

---

## Executive summary

Most reads come from **`onSnapshot` initial snapshots** in `src/App.js`, multiplied by **listener churn** when `currentView` changed across views that needed the same collection. Secondary drains: **wide expense queries (800)**, **full collection `getDocs`** (employee sync, profile migration, financial panels), and **employee POS loading global recent orders** instead of today-only.

Instrumentation already exists: `src/services/firestoreReadMetrics.js` + Settings UI (admin).

---

## Top 10 most expensive read patterns

| Rank | Pattern | Where | Typical initial reads | Who pays |
|------|---------|-------|----------------------|----------|
| 1 | **Full `products` collection** per (re)subscribe | `App.js` | N products (~80–200) | Employee + Admin on POS/dashboard |
| 2 | **Expenses `limit(400–800)`** snapshot | `App.js` | 350–800 | Employee (traders/purchases), Admin cash/reports |
| 3 | **Orders dashboard `limit(250)`** → now **150 today-only** | `firestoreOrderQueries.js` | up to limit / day | Admin dashboard |
| 4 | **Employee POS orders** unscoped `limit(80)` → now **today + 80** | `firestoreOrderQueries.js` | min(80, today count) | Employee |
| 5 | **`syncEmployeeBenefitExpenses`**: benefits + **all expenses** `getDocs` | `employeeBenefitService.js` | \|benefits\| + \|expenses\| | Admin expenses (once/day gated) |
| 6 | **`migrateEmployeeProfilesV1`**: staff + benefits + user doc | `migrateEmployeeProfiles.js` | 2 collections + 1 doc | Was every admin login → **employees view only** |
| 7 | **`EmployeesView` finance index**: 3 full collection scans | `EmployeesView.js` | accruals+advances+debts | Admin employees tab |
| 8 | **`ProfilePanel.reloadFinancial`**: **entire expenses** for one staff | `EmployeesView.js` | \|expenses\| → **staff query** | Admin employee detail |
| 9 | **`employeeBenefits` full collection** | `App.js` | all benefits → **limit 250** | Admin/Employee expenses |
| 10 | **Listener re-subscribe on navigation** (products/staff/suppliers) | `App.js` deps included `currentView` | Re-read full collection each hop | Both roles |

**Honorable mentions:** `cashMovements` (200), `vaultMovements` (200), unbounded `externalAssets` → **limit 60**, `customers` on POS+reports, starter product seeding (`ensureStarterProducts` getDocs), payroll one-shots inside operations.

---

## Listener inventory (`App.js`)

| Collection | Active when | Query shape |
|------------|-------------|-------------|
| `users/{uid}` profile | Logged in | single doc |
| products | `needsProductsListener` | full collection |
| orders | view/role spec | scoped + limits |
| expenses | finance views | `orderBy date desc` + limit |
| staffMembers | staff gate views | shared listener |
| employeeBenefits | expenses/settings/employees | limit 250 |
| suppliers | purchases/traders/expenses/cash | shared listener |
| customers | pos/customers/orders/reports | full list |
| openBills | pos/customers | limit 50 |
| cashShifts | operational views | limit 30 |
| cashMovements | cash | limit 200 |
| vault doc | finance views | single doc |
| vaultMovements | vault | limit 200 |
| playstationSessions | pos | limit 80 |
| externalAssets / assetMovements | pos | 60 / 100 |

**Outside App:** `ChecksPanel` checks query; lazy `EmployeesView` getDocs; many services use transactional `get` (writes path — not dominant for Spark reads).

---

## Role analysis

### Employee (full day on POS)

**Must stay live:** products, today orders, open shifts, staff for benefits, suppliers/expenses on finance tabs, vault balance on purchases.  
**Must not load:** dashboard order history, vault movements, ingredients, employees module, reports orders, admin settings scans.

### Admin (occasional)

**Should defer:** migration scans, benefit-expense sync, employees finance index until visiting those modules.  
**Dashboard:** still order-driven for live KPIs; `businessDaySummaries` exist but **not yet wired** to replace live orders (batch 2).

---

## Caching state

| Layer | Status |
|-------|--------|
| IndexedDB persistence | **Enabled by default in production** (`REACT_APP_FIRESTORE_PERSISTENCE=false` to disable) |
| `firestoreQueryCache` | 30s TTL on `cachedGetDocs` |
| `firestoreSharedListeners` | products, staff, suppliers |
| Session cleanup | on sign-out via `clearFirestoreClientSessionState` |

---

## Benchmark methodology

1. **In-app:** Admin → Settings → “مراقبة قراءات Firestore” — record `billableDocumentReads` after scripted journey.
2. **Static model:** `node scripts/estimate-firestore-reads.js employee`
3. **Firebase Console:** Usage → Firestore → Reads (authoritative billing).
4. **Compare** same business day before/after deploy (no data deletion).

### Before / after (static model — batch 1)

| Scenario | Before (approx model) | After (approx model) | Notes |
|----------|----------------------|----------------------|-------|
| Employee day | ~2.4k–3.5k initial + 100 deltas | ~1.5k–2.2k initial + 100 deltas | Fewer re-subs; today orders; smaller cash expenses if visited |
| Admin dashboard 15m | ~300+ | ~280 | Dashboard limit 150 |

**Cannot claim 80–90% reduction yet** without Console measurements; batch 1 targets listener churn + fat queries. Batch 2 (summaries, further deferred loads) needed for highest gains.

---

## Remaining bottlenecks (post batch 1)

1. Dashboard still streams up to 150 order docs for chart/KPI (needs `businessDaySummaries` + today counter doc).
2. Traders/purchases still need **800 expenses** for supplier balances (correctness).
3. Full product catalog on every POS day (~largest single snapshot).
4. Multiple tabs = multiple clients (no shared worker); educate single-tab policy.
5. Transactional multi-doc reads on checkout (unavoidable for integrity).
6. No server-side aggregation without Blaze Functions (out of scope).

---

## Related files

- `src/utils/firestoreViewDataPolicy.js` — role/view gates
- `src/utils/firestoreOrderQueries.js` — order query specs
- `src/services/firestoreReadMetrics.js` — client telemetry
- `docs/FIRESTORE_OPTIMIZATION_PLAN.md` — roadmap
- `docs/FIRESTORE_PRODUCTION_DEPLOY_CHECKLIST.md` — safe rollout
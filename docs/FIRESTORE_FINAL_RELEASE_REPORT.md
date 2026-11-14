# Firestore Final Release Report — Layali POS

**Date:** 2026-11-14  
**Scope:** Final integration pass (not a new optimization batch)  
**Verdict:** **READY_WITH_DOCUMENTED_LIMITATIONS**

---

## 1. Executive summary

The local-first Firestore architecture from prior batches is preserved. This pass closes the highest-risk financial and data-visibility gaps:

| Area | Outcome |
|------|---------|
| Supplier reconciliation | **Read-only preview** by default; balance writes only via explicit admin **apply** with audit fields |
| Employee POS open bills | **Second small listener** (`unpaid`/`partial`, any date) merged with today-scoped POS query |
| Dashboard weekly chart | **MISSING / INCOMPLETE** day states — no silent zero for unclosed days |
| Traders purchase card | **Partial snapshot** labeled (~400 docs max) |
| Tests / build | **41** Jest suites (**203** tests) pass; **`CI=true npm run build`** passes |
| Security rules | **Unchanged** (uid-scoped only); emulator rules test **not executed** (emulator download failed) |

Production deployment is **not automatic**. No production data migration is **required** for this release.

---

## 2. Completed improvements (this pass)

### 2.1 Supplier financial integrity

- `previewSupplierReconciliation` — paginated full ledger read, **no writes**.
- `applySupplierBalanceCorrection` — admin-only explicit write with `balanceCorrectionAtMs`, `balanceCorrectionBy`, `balanceCorrectionReason`.
- `reconcileSupplierBalanceFromFirestore` — deprecated alias to preview (no auto-write).
- `SupplierTraderDetailModal` — removed auto-balance sync on open; shows read-only mismatch banner; optional admin apply.
- `fetchTradersPurchaseTotalSnapshot` — returns `{ total, isPartial, dataState, docCount, cappedAt }`.

### 2.2 Active orders (employee POS)

- `resolveEmployeePosOpenOrdersSpec` — realtime `status in ['unpaid','partial']`, limit 40.
- `mergeOrdersById` — merges today listener + open bills without duplicate IDs.
- New composite index: **orders** `status` + `timestamp` (see `firestore.indexes.json`).

### 2.3 Dashboard semantics

- `buildWeeklySalesChart` emits `summaryState` per day: `VERIFIED_ZERO`, `VERIFIED_SUMMARY`, `MISSING_SUMMARY`, `INCOMPLETE_SUMMARY`, `LIVE_TODAY`.
- Chart UI: dashed bars + tooltips for missing/partial days.

### 2.4 Read estimates

- `scripts/estimate-firestore-reads.js` includes **+40** reads for employee open-order listener (static model only).

---

## 3. Corrected defects

| Defect | Fix |
|--------|-----|
| Opening supplier profile called `updateDoc` on `balance` | Preview-only; apply is explicit |
| Stale unpaid orders hidden (`today + limit 80`) | Supplemental open-order listener |
| Historical chart showed **0** for days without `businessDaySummaries` | `MISSING_SUMMARY` + null sales |
| Traders “إجمالي المشتريات” implied full history from 400 docs | Partial labeling in UI |

---

## 4. Files modified (this pass)

```
firestore.indexes.json
scripts/estimate-firestore-reads.js
src/App.js
src/components/SupplierTraderDetailModal.js
src/services/supplierExpenseReads.js
src/services/supplierExpenseReads.test.js          (new)
src/utils/dashboardSummaries.js
src/utils/dashboardSummaries.test.js
src/utils/firestoreOrderQueries.js
src/utils/firestoreOrderQueries.test.js
docs/FIRESTORE_FINAL_RELEASE_REPORT.md             (this file)
```

**Preserved (prior batches — do not revert):**  
`src/services/localFirst/*`, `firestoreViewDataPolicy.js`, `productCatalogStore.js`, `financialCacheInvalidation.js`, `reportSummaryCache.js`, etc.

---

## 5. Remaining Firestore realtime listeners (by policy)

When a view is active, typical listeners include:

| Collection | When | Notes |
|------------|------|--------|
| `products` | POS, inventory, admin modules | `productCatalogStore` shared subscription |
| `orders` | Dashboard (today 150), employee POS (today 80 + **open 40**), orders/reports scoped | No full-history listener |
| `expenses` | expenses/purchases/cash/reports (not **traders** list) | View-limited counts |
| `suppliers` | purchases/traders/expenses | Directory store + pagination |
| `customers` | pos/customers/orders | Paginated directory |
| `staffMembers` | gated views | Shared |
| `cashShifts` / `cashMovements` | cash/POS | Limited |
| `vault` | finance views | Single doc pattern |
| `employeeBenefits` | expenses/employees | Limited |
| `openBills` | pos/customers | limit 50 |
| PlayStation sessions / assets | when view active | Existing limits |

**Traders screen:** no global expense listener; supplier ledger loaded per modal page (25).

---

## 6. Remaining expensive queries / snapshots

| Query | Cost | Mitigation |
|-------|------|------------|
| Dashboard today orders | up to **150** docs/listener | Amber banner if cap hit; closed days use `businessDaySummaries` |
| Reports orders | up to **400** | Partial coverage helper in reports |
| Expenses on purchases | up to **800** | Only on purchases view (not traders) |
| Traders purchase card | **400** expense snapshot | Marked partial in UI |
| Supplier reconciliation preview | Paginated `getDocs` per open | Read-only; on demand |
| Customer search (uncached) | Additional reads | Paginated store |

---

## 7. Financial & automated test results

| Suite | Result |
|-------|--------|
| `npm test -- --watchAll=false` | **PASS** (41 suites, 203 tests) |
| `CI=true npm run build` | **PASS** |
| `npm run test:rules` | **NOT RUN** — Firestore emulator JAR download failed (network) |
| Final spec 18-scenario manual/emulator matrix | **NOT EXECUTED** in this environment |

Included regression coverage: `supplierExpenseReads.test.js`, `supplierAccounting.test.js`, `dashboardSummaries.test.js`, `firestoreOrderQueries.test.js`, `paginatedDirectoryStore.test.js`, `firestoreSessionCleanup.test.js`.

---

## 8. Security rules audit

Current rules (`firestore.rules`):

- Any authenticated user with `auth.uid == userId` has **full read/write** on `users/{userId}/**`.

**Implications:**

- Employee vs admin separation is **application-only**, not rule-enforced.
- Supplier `balance`, customer debt, cash, and orders can be mutated by the owner uid from any client that knows the SDK.
- **`applySupplierBalanceCorrection`** is gated in UI (admin) only — **not** enforceable without server rules or Cloud Functions.

**Recommendation (post-release):** field-level rules + custom claims for `role`, deny direct `balance` unless via audited path / callable function. **Do not weaken rules to save reads.**

---

## 9. Read consumption estimates

| Source | Notes |
|--------|--------|
| `scripts/estimate-firestore-reads.js` | Static model ~employee day + open orders |
| In-app `firestoreReadMetrics` | SDK activity estimates |
| Firebase Console billed reads | **Not captured** in this pass |

**Do not treat script output as billing truth.** Target &lt;10k reads/day remains aspirational; actual depends on navigation and same-day order volume.

---

## 10. Remaining risks

1. **Security rules** — widest risk; compromises financial integrity if credentials leak.
2. **Dashboard intraday KPIs** — still derived from up to 150 **today** orders (warning shown at cap).
3. **Supplier modal outstanding** — uses loaded ledger pages until “load more” completes (`ledgerHasMore` note shown).
4. **IndexedDB persistence** — shared devices may leak cached admin data between browser profiles; session cleanup on logout mitigates in-app state only.
5. **Composite index** for `orders` status+timestamp must be **built** before employee open-order listener works in production.
6. **Historical summary gaps** — days without close/archive remain `MISSING_SUMMARY` until business-day close pipeline fills `businessDaySummaries` (no auto backfill).

---

## 11. Production data migration

**None required** for deploying this frontend release.

Optional (owner approval only):

- Idempotent **read-only** backfill preview for `businessDaySummaries` (not implemented as a writer in this pass).
- Bulk `applySupplierBalanceCorrection` across suppliers — **do not** run without review.

---

## 12. Deployment readiness checklist

- [x] Code changes complete for final pass  
- [x] Unit tests + production build  
- [ ] Deploy `firestore.indexes.json` and wait until index **Ready**  
- [ ] Run `npm run test:rules` on a machine with emulator cached  
- [ ] Staging / emulator smoke (employee POS pending order from prior day)  
- [ ] Production backup (Firestore export)  
- [ ] Vercel deploy  
- [ ] Monitor Firebase usage 24–48h  

---

## 13. Deployment commands (when approved)

```bash
# 1) Indexes (required for employee open orders)
firebase deploy --only firestore:indexes --project <YOUR_PROJECT_ID>
# Verify in Firebase Console → Firestore → Indexes → orders (status + timestamp)

# 2) Rules — NO CHANGE in this pass (skip unless you intentionally update rules)
# firebase deploy --only firestore:rules --project <YOUR_PROJECT_ID>

# 3) Frontend
cd "d:\completed\ليالي كافي"
npm ci
$env:CI='true'; npm run build
# Git push main → Vercel production, OR:
# vercel --prod

# 4) Post-deploy smoke
# - Employee login → POS → unpaid order from yesterday visible
# - Admin → traders → open supplier → no automatic balance change; preview only
# - Dashboard chart → past days without summary show dashed / "لا ملخص مُغلق"
```

**Rollback:** Redeploy previous Vercel build; indexes are additive (safe to keep). Revert Git commit if needed.

---

## 14. Verdict rationale

**READY_WITH_DOCUMENTED_LIMITATIONS** because:

- Critical financial auto-reconciliation write is removed.
- Employee open-order visibility is addressed with a bounded second listener.
- Automated tests and CI build pass.
- **Blockers to full READY_FOR_PRODUCTION:** permissive security rules, rules emulator test not run, full manual financial matrix not executed, no billed-read baseline from Console.

---

## 15. Client-side integrity disclaimer

Atomic multi-document financial operations depend on existing gateway/services where implemented. Direct Firestore writes from the SPA remain subject to rule gaps above. **Client-side validation alone is not authoritative financial security.**
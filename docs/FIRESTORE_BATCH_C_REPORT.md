# Firestore Optimization — Batch C Report

**Date:** 2026-11-14  
**Status:** Implemented in code — **not deployed** · **no production data migration run**

---

## Phase 1 — Admin dashboard

| Before | After |
|--------|--------|
| Weekly chart from `orders` (today-only listener → past days often **0**) | `businessDaySummaries` (≤14 docs, cached) + **today** from live `dashboardOrders` |
| Close summary: `totalSales`, `orderCount`, `totalExpenses` | Adds `cashSales`, `debtSales`, `paidOrderCount`, `cancelledOrderCount` (no cash-movement mixing) |

**Still realtime (intentional):** today’s orders listener for KPI cards, top products, payment mix, categories.

**Files:** `utils/dashboardSummaries.js`, `services/localFirst/dashboardMetricsStore.js`, `App.js` (close + chart).

---

## Phase 2 — Supplier balances

| Before | After |
|--------|--------|
| `onSnapshot` expenses **800** on traders view | **No** expense listener on `traders` |
| List `due` from full expense array | `supplier.balance` (transaction-maintained) via `resolveSupplierOutstandingBalance(s, null, id)` |
| Total payable from expenses scan | `computeTotalOutstandingFromStoredBalances` on traders |
| Reconcile used in-memory 800 rows | `reconcileSupplierBalanceFromFirestore` → `where supplierId ==` **full** supplier ledger |

**Purchase total card:** one-shot cached snapshot (400 head, client filter) — not a live listener.

**Reconciliation (local / pre-migration):** `reconcileSupplierBalanceFromFirestore` writes `balance` + `balanceReconciledAtMs` only after computing from **all** supplier-scoped expenses. **Do not bulk-run on production without owner approval.**

---

## Phase 3 — Supplier details

- Paginated `fetchSupplierExpensesPage` (25, cursor, per-supplier cache).
- `SupplierTraderDetailModal` loads ledger on open; load-more button.
- Composite index: `expenses` (`supplierId` ASC, `date` DESC) in `firestore.indexes.json` — deploy indexes before prod.

---

## Phase 4 — Financial integrity

- No new authoritative totals on client-only docs without writes.
- Supplier `balance` still updated in existing **transactions** (`supplierPaymentService`, `purchaseService`).
- Reconcile path is opt-in on modal open (aligns stored with full supplier expense query).

---

## Phase 5 — Cache invalidation

`financialCacheInvalidation.js`:

- `invalidateAfterExpenseMutation` — expenses cache, supplier pages, traders purchase snapshot.
- `invalidateAfterOrderMutation` — dashboard week + summary caches.
- `invalidateAfterBusinessDayClose` — dashboard/summary caches.
- Wired from expense save, supplier payment, order complete, shift-2 close.

---

## Phase 6 — Testing

| Suite | Result |
|-------|--------|
| `dashboardSummaries.test.js` | Weekly merge summary + today |
| `supplierAccounting.test.js` | Stored balance path |
| `firestoreViewDataPolicy.test.js` | Traders off expense listener |
| `CI=true npm run build` | Required before deploy |

**Not run in this session:** 100-sale emulator matrix, Firebase Console before/after billing.

---

## Read estimates (static, not billed truth)

| Scenario | Before (approx) | After (approx) |
|----------|-----------------|----------------|
| Admin opens traders (session) | +800 expense snapshot + ongoing | **0** listener; ~25 suppliers page; optional ~400 one-shot snapshot |
| Admin dashboard week chart | Re-read orders on navigation | **≤14** summary docs (cached 2m) |
| Open supplier modal | All expenses in memory | **25** + pages; reconcile = N supplier docs only |

---

## Remaining risks

1. **Legacy days** without `businessDaySummaries` show 0 in weekly chart until days are closed post-upgrade.
2. **Traders purchase total** capped at 400 recent docs — card may understate if >400 purchases without scrolling archive.
3. **Stored balance drift** if pre-transaction legacy data — run scoped reconcile per supplier after approval.
4. **Index propagation** required for supplier expense pagination query.

---

## Production checklist (approval required)

- [ ] Deploy `firestore.indexes.json`
- [ ] `CI=true npm run build` + full Jest
- [ ] Staging: dashboard week chart vs manual spot-check
- [ ] Staging: trader balances vs one supplier full reconcile
- [ ] Optional: owner-approved reconcile sweep (one supplier at a time)
- [ ] Vercel deploy only after sign-off
- [ ] 48h Firebase Usage compare

---

## Files modified (Batch C)

`App.js`, `SupplierTraderDetailModal.js`, `supplierAccounting.js`, `firestoreViewDataPolicy.js`, `firestore.indexes.json`, `firestoreSessionCleanup.js`, `dashboardSummaries.js`, `dashboardMetricsStore.js`, `supplierExpenseReads.js`, `financialCacheInvalidation.js`, tests, this report.
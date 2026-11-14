# Firestore Optimization Plan — Prioritized

## Batch 1 (implemented, low risk)

- [x] Stabilize listener deps with boolean gates (`productsListenerActive`, etc.) — stop resubscribe pos↔expenses.
- [x] `sharedOnSnapshot` for products + suppliers.
- [x] Employee POS orders: today-scoped query (`employee-pos-today`).
- [x] Dashboard order limit 250 → 150 (today-filtered already).
- [x] Cash expenses listener 800 → 350; reports 800 → 500.
- [x] Employee benefits listener: `limit(250)` + `orderBy createdAtMs`.
- [x] Defer `migrateEmployeeProfilesV1` to `employees` view only.
- [x] Benefit expense sync: once per day per uid (`sessionStorage`).
- [x] `EmployeesView`: staff-scoped expenses query; cached finance index getDocs (60s).
- [x] `externalAssets` limit 60.
- [x] Production IndexedDB persistence default on (opt-out via env).

**Verify:** `npm test -- firestoreViewDataPolicy firestoreOrderQueries`; manual employee POS + expense flows; Settings metrics.

## Batch 2 (planned — medium risk)

- [ ] Dashboard KPIs from `businessDaySummaries` + `counters/orders` for totals; keep small live today listener for open edits only.
- [ ] Supplier balance snapshots or rolling subcollections to cut 800-expense dependence.
- [ ] Split `ChecksPanel` to view-only mount.
- [ ] `invalidateFirestoreCache` on payroll/ledger writes.
- [ ] Document “refresh before stock-sensitive sale” UX if persistence serves stale product stock.

## Batch 3 (higher effort)

- [ ] POS product menu cache with explicit `force` refresh on inventory view save.
- [ ] Consolidated “operational snapshot” doc updated on close shift (requires trusted write path).
- [ ] Emulator-based read counter tests per journey.

## Non-goals (per requirements)

- Cloud Functions aggregators on Spark.
- Disabling security rules.
- Polling substitutes for realtime POS.
- Hiding active orders via arbitrary global limits without today/status filters.
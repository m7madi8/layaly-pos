# PHASE 6 — Performance

## Delivered

- Staff listener scoped to admin login (not per-view toggle) — fewer missed snapshots for gate/modal.
- `React.lazy` for `EmployeesView` (code-split).
- Business day summaries written on close to reduce future dashboard full-order reads.

## Baseline / next

- Measure Firestore reads in Firebase console or emulator counters before/after archive adoption.
- Optional: lazy-load reports chunk, defer `syncEmployeeBenefitExpenses` until post-gate.

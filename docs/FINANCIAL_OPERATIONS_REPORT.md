# PHASE 5 — Invoices, Returns, Merchants, Checks

## Delivered

- **Order edits**: `canEditOrders` for admin + employee; audit via existing `orderEdits`.
- **Partial returns**: `orderReturnService.executePartialOrderReturn` (idempotent, caps qty, updates line `returnedQty`).
- **Supplier opening balance**: `supplierOpeningBalanceService.js` (standalone balance, no stock).
- **Checks**: `checkService.js` lifecycle (pending / collected / returned).

## UI

- Returns/checks/opening-balance UI can be wired from traders/orders views incrementally; services are ready.

# Layali Café POS — Project Audit (Phase 0)

**Date:** 2026-11-03  
**Scope:** Existing codebase audit before master enhancement roadmap.  
**Production:** No deploy performed as part of this audit.

---

## 1. Architecture Overview

| Layer | Technology |
|-------|------------|
| Frontend | React 18, Create React App, Tailwind-style tokens in `src/branding.js` |
| Entry | `src/App.js` → `AppCore` monolith (~7.5k lines) |
| State | React `useState` / `useMemo` / `useEffect`; no Redux |
| Auth | Firebase Auth (owner UID) + **session role** in `localStorage` (`admin` \| `employee`) via [`src/adminAuth.js`](../src/adminAuth.js) |
| Database | Firestore `users/{uid}/…` subcollections |
| Backend | Optional Cloud Functions (`functions/`, region `europe-west1`); flags `REACT_APP_TRUSTED_ORDERS`, `REACT_APP_TRUSTED_CASH_SHIFTS` (default off) |
| Hosting | Vercel (`layaly-pos`) |
| Tests | Jest (client), Firebase emulator tests under `tests/functions/` |

### Navigation views (`currentView` / `activeView`)

`dashboard`, `pos`, `orders`, `customers`, `cash`, `vault`, `inventory`, `expenses`, `purchases`, `traders`, `reports`, `settings`.

Employee role: restricted to `EMPLOYEE_VIEWS` = `pos`, `customers`, `cash` only.

### Key services (financial)

| Service | Path |
|---------|------|
| Orders / checkout | `App.js` `completeOrder`, optional `functions/lib/orderEngine.js` |
| Cash shifts | `src/services/cashShiftService.js` |
| Vault | `src/services/vaultService.js` |
| Purchases | `src/services/purchaseService.js` |
| Supplier payments | `src/services/supplierPaymentService.js` |
| Employee benefits | `src/services/employeeBenefitService.js`, `staffMembersService.js` |
| Reset | `resetOperationalData.js`, `resetSalesAndLedgers.js` |

---

## 2. Firestore Database Structure

All operational data under **`users/{uid}/`** (owner = Firebase Auth UID).

| Subcollection | Purpose |
|---------------|---------|
| `products` | Menu items: price, cost, stock, image, recipe, `productType` |
| `ingredients` | Raw materials stock |
| `orders` | Sales records |
| `openBills` | Held POS bills |
| `orderEdits` | Audit rows on order edit |
| `customers` | CRM + `balance`, embedded `transactions[]` |
| `suppliers` | Traders + `balance` |
| `expenses` | Operating, purchase, supplier payment, employee benefit sections |
| `cashShifts` | Shift aggregates (open/closed, period 1/2) |
| `cashMovements` | Ledger lines per shift |
| `vault` / `vaultMovements` | Main vault doc + movements |
| `staffMembers` | Staff names + `benefitLimitILS` |
| `employeeBenefits` | Benefit audit (cash/inventory) |
| `staffBenefitDaily` | Daily quota counters |
| `employeeBenefitIdempotency` | Dedup keys |
| `supplierPaymentIdempotency`, `cashShiftIdempotency`, `idempotency` | Server/client dedup |
| `playstationSessions`, `externalAssets`, `assetMovements` | PS + hookah external |
| `counters/orders` | Order number counter |
| `maintenance/*` | Test data registry |

**Not present today (roadmap):** `businessDays`, `businessDaySummaries`, `inventoryLayers`, `payrollAccruals`, `employeeAdvances`, `checks`, `orderReturns`.

User profile doc: `users/{uid}` — business profile, flags (`starterAssetsV1`, etc.).

---

## 3. Financial Logic

### Cash shift expected balance

`computeExpectedCash` in `src/utils/cashShiftMath.js`:

```
expected = opening + cashSales + cashDeposits − cashWithdrawals − cashRefunds
```

Close: `closingWithdrawal = max(0, expected − actualInDrawer)` → vault credit; `difference = actual − finalExpected`.

### Sales revenue (dashboard)

Derived from in-memory `orders` (up to **500** loaded). Paid orders sum `total`; profit uses line costs stored on order.

### Customers

`balance` updated on debt orders/payments; `legacy_debt` entries in `transactions[]`.

### Suppliers

`balance` from purchases (debt) and payments; `reconcileSupplierBalance` aligns legacy traders from expense history.

### Employee benefits

- **Cash:** withdrawal on open shift + expense row (`section: employee_benefit`).
- **Inventory:** stock/recipe deduction; value from `product.cost` / `costFromWeight`; daily limit via `staffBenefitDaily` + `benefitLimitILS`.

### Purchases

Updates product `stock`; **overwrites** `product.cost` with latest unit cost (`purchaseService.js`) — conflicts with FIFO layers requirement.

---

## 4. Permissions Architecture

| Mechanism | Reality |
|-----------|---------|
| UI | `userRole`, `isEmployee`, `canCreateCustomers`, guards on delete/edit |
| Firestore rules (prod) | [`firestore.rules`](../firestore.rules) — owner UID full read/write on all subcollections |
| Hardened rules | [`firestore.rules.hardened`](../firestore.rules.hardened) — not default deploy |
| Employee PIN | Client/env password; optional callable `verifyEmployeePin` |

**Gap:** Role is not enforced server-side in production rules; sensitive writes are client-trusted unless callables enabled.

---

## 5. Inventory Logic

- **Checkout:** decrements `products.stock` and recipe `ingredients` in Firestore transaction (`App.js`).
- **Edit order:** restores **product stock only** (ingredients not restored — documented in Phase 2 map).
- **Benefits:** same stock paths as sales for inventory lines.
- **Purchases:** increases stock; sets single `cost` field.

No cost layers; no FIFO consumption trail on order lines today.

---

## 6. Shift Logic

- Two shifts per business cycle: period 1 then 2; next period alternates after close.
- [`resolveDailyCashGate`](../src/utils/cashDayGate.js): prompts open after 12:00 for shift 1 if previous day closed; shift 2 immediately after shift 1 close.
- [`DailyCashOpenModal`](../src/components/DailyCashOpenModal.js): operator name + counted cash; pre-fills expected carry-forward.
- **Gap:** Modal overlay only — app remains usable underneath; no `onDutyStaffIds`; no `openingDifference` field; no `businessDayId`.

---

## 7. Performance Findings

### Listeners (view-scoped — improvement already in place)

| View trigger | Collections |
|--------------|-------------|
| Always (logged in) | `products` |
| admin + view | `orders` (500), `expenses` (800), `customers`, `suppliers`, shifts, movements, etc. |
| `expenses` | `employeeBenefits`, `staffMembers` |
| `pos` | `playstationSessions`, assets |

### Risks

- Dashboard/report calculations on full order list in memory.
- `syncEmployeeBenefitExpenses` delayed 8s on expenses view.
- `ensureDefaultStaffMembers` on admin login.
- No daily summary documents — every report scans live data.

### Baseline commands

- `npm run build` — must pass with `CI=true` (ESLint warnings fail).
- `npm test -- --watchAll=false` — client unit tests.
- `npm run test:emulator` — if configured for functions.

---

## 8. Existing Features Inventory

| Feature | Status |
|---------|--------|
| POS + cart + payments | Works |
| Services tab + manual price | Works |
| Customers + debt + PDF | Works |
| Cash shifts + vault close transfer | Works |
| Employee benefits (cash/inventory + limits) | Works; duplicate staff fix added |
| Purchases + trader payments | Works |
| Order edit + orderEdits | Works; employee limited on orders list |
| System reset (preserve products/staff limits) | Works |
| Trusted callables | Optional, off by default |
| Full HR / payroll / checks / FIFO / business day archive | **Not implemented** |

---

## 9. Risks

1. **Schema migrations** on live data require idempotent scripts + emulator tests.
2. **product.cost overwrite** breaks historical COGS if layers added without migration policy.
3. **localStorage role** — UI-only authorization for employees.
4. **Firestore quota** — large limits on orders/expenses listeners.
5. **Monolithic App.js** — regression risk; phased extraction recommended.

---

## 10. Recommended Implementation Plan

See approved roadmap: Phases 1–7 (Employees → Shifts → Reports → Layers → FinOps → Performance → QA).

**User decisions locked in:**

- Extend `staffMembers` in place (same IDs); preserve `benefitLimitILS` and historical `employeeBenefits`.
- On-duty staff only for benefit/consumption paths; enforce in services.
- No production deploy during development.

---

## 11. Phase 0 Verification

| Check | Result |
|-------|--------|
| Audit document | This file |
| Build | Run `npm run build` after changes |
| Unit tests | Run `npm test -- --watchAll=false` |

**Next deliverable:** `docs/EMPLOYEE_MODULE_REPORT.md` (Phase 1).

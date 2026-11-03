# FINAL FULL ACTIVATION REPORT

**Project:** Layali POS  
**Date:** 2026-11-03  
**Scope:** Activate previously restricted financial features + server-side RBAC (no production deploy, no commit/push, no production rules/data changes in this session)

---

## Executive summary

| Area | Status | Notes |
|------|--------|--------|
| Partial returns | **Implemented** (client + Cloud Function) | Audit trail, idempotency, FIFO restore from line consumption, cash/debt refund |
| Payroll & advances | **Implemented** (client + callables) | Accrual, partial pay, cash shift on pay/advance/repay, idempotency keys |
| Checks | **Implemented** | In/out, collect/pay out, return with cash reversal, status history |
| Supplier opening balance | **Implemented** | Atomic tx, duplicate guard, no inventory |
| Server permissions | **Implemented (staging-ready)** | Hardened rules extended; JWT `role` admin/cashier; financial callables |
| Emulator integration tests | **Authored, not executed** | Skipped locally — emulators not running (see §6) |

**Production today:** Still on legacy `firestore.rules` and client-side role in `localStorage` until you approve deploy + `securityMode: 'hardened'` migration.

---

## 1. Partial returns

### Behaviour
- Multiple returns per invoice; cap via `returnedQty` + `validatePartialReturnQuantity`.
- Required **reason**; **item condition** (resellable / damaged); **refund method** (none / cash / debt).
- Updates order: `returnTotal`, `returnCashTotal`, `returnDebtTotal`, line `returnedQty` — **original `total` / timestamp unchanged**.
- Restock uses `inventoryConsumption` on order lines (stored at sale in `App.js`); fallback LIFO.
- Cash refund → open shift `refund` movement; debt refund → customer `balance` + transaction.
- Documents: `orderReturns`, `orderReturnAudits`, `idempotency/return_{key}`.

### Entry points
- UI: `OrderPartialReturnModal`, orders screen in `App.js` → `gatewayPartialOrderReturn`.
- Server: callable **`partialOrderReturn`** (`functions/lib/partialOrderReturnEngine.js`).

---

## 2. Payroll & advances

### Behaviour
- **Accrual:** `payrollAccruals` (due / partial / paid), `amountDue` / `amountPaid`.
- **Payment:** `payrollPayments` + single `expenses` row (`payrollAccrualId`) — no double expense.
- **Advance:** `employeeAdvances` + expense; **repayment:** `advanceRepayments` + expense (or payroll deduct mode on server).
- Cash `paymentMethod === 'Cash'` → shift withdrawal (pay/advance) or deposit (cash repayment).
- Idempotency: `idempotency/payroll_*`, `advance_*`, `advance_repay_*`.

### Entry points
- UI: `EmployeesView` → `financialGateway` callables or legacy `payrollService`.
- Server: **`createPayrollAccrual`**, **`recordPayrollPayment`**, **`recordEmployeeAdvance`**, **`recordAdvanceRepayment`** (admin claim only).

---

## 3. Checks

### Behaviour
- Register: number, bank, amount, issue/due dates, party, direction `in` | `out`, status `pending_collection`.
- Collect: `in` → deposit + `collected`; `out` → withdrawal + `paid_out`.
- Return: reverses cash if already collected/paid out; appends `statusHistory`.
- Pending checks **do not** affect cash balance.

### Entry points
- UI: `ChecksPanel` in `SupplierTraderDetailModal` → gateway.
- Server: **`registerCheck`**, **`collectCheck`**, **`returnCheck`** (admin).

---

## 4. Supplier opening balance

### Behaviour
- One opening entry per supplier (`openingBalanceRecorded` flag).
- Updates `suppliers.balance` only — **no** purchase invoice, **no** stock.
- Audit: `supplierOpeningBalances` in same transaction as balance update.
- Idempotency: `idempotency/opening_bal_{key}`.

### Entry points
- UI: supplier modal → `gatewayRecordSupplierOpeningBalance`.
- Server: **`recordSupplierOpeningBalance`**.

---

## 5. Server permission design

### Authentication & claims
| Role | JWT claim | How obtained |
|------|-----------|--------------|
| Admin | `role: 'admin'` | `refreshAdminSession` after Firebase password login (sets claim + custom token) |
| Cashier (employee) | `role: 'cashier'` | `verifyEmployeePin` when `REACT_APP_VERIFY_EMPLOYEE_PIN_ON_SERVER=true` (sets claim + custom token) |

Legacy UI role (`localStorage`) remains for navigation until hardened mode; **Firestore writes for sensitive collections are blocked in hardened mode** regardless of UI.

### Firestore rules (`firestore.rules.hardened`) — **proposed for production after your approval**
- Extended **`financialSubpath`**: `orderReturns`, `orderReturnAudits`, `checks`, `payrollAccruals`, `payrollPayments`, `employeeAdvances`, `advanceRepayments`, `supplierOpeningBalances`, `employeeBenefits`.
- Client **cannot** create expenses with `payrollAccrualId`, `employeeAdvanceId`, `advanceRepaymentId`, `isAdvanceRepayment` in hardened mode.
- Legacy mode (`securityMode` ≠ `hardened`): unchanged full owner write (`firestore.rules`).

### Cloud Functions (new / updated)
| Callable | Auth |
|----------|------|
| `refreshAdminSession` | signed-in |
| `verifyEmployeePin` | signed-in → cashier token |
| `partialOrderReturn` | `requireOrderCaller` (admin or cashier) |
| Payroll / checks / opening balance | `requireAdminClaim` |

### Client routing
- `src/services/securityMode.js` — `mustUseFinancialCallables(profile)` when `securityMode === 'hardened'` **or** `REACT_APP_USE_FINANCIAL_CALLABLES=true`.
- `src/services/financialGateway.js` — routes to callables vs local services.

---

## 6. Tests — actual results (this session)

| Command | Result |
|---------|--------|
| `npm test -- --watchAll=false` | **22 suites, 136 tests — PASS** |
| `npm run test:functions:unit` | **28 tests — PASS** |
| `npm run build` | **PASS** |
| `npx jest … financialOps.emulator.test.js` (no emulators) | **1 skipped** (placeholder pass — **not** a real integration run) |
| `npm run test:rules` | **NOT RUN** (requires Java + Firestore emulator) |
| `npm run test:functions:financial` | **NOT RUN** (requires emulators + deployed functions in emulator) |

### Before production cutover you must run locally:
```bash
npm run test:rules
npm run test:functions:financial
```
and confirm all scenarios pass (success, permission denied, idempotency duplicate, stock/cash balances).

---

## 7. Files touched (main)

**Client:**  
`orderReturnService.js`, `OrderPartialReturnModal.js`, `payrollService.js` (legacy), `checkService.js`, `supplierOpeningBalanceService.js`, `financialGateway.js`, `securityMode.js`, `secureFunctions.js`, `inventoryLayerService.js`, `partialReturnRefund.js`, `dashboardCashSales.js`, `ChecksPanel.js`, `EmployeesView.js`, `SupplierTraderDetailModal.js`, `App.js`, `firebaseClient.js`

**Functions:**  
`index.js`, `partialOrderReturnEngine.js`, `payrollEngine.js`, `checkEngine.js`, `supplierOpeningBalanceEngine.js`, `inventoryLayerEngine.js`, `orderReturnUtils.js`

**Rules / tests:**  
`firestore.rules.hardened`, `tests/security/firestore.rules.test.js`, `tests/functions/financialOps.emulator.test.js`, `package.json` scripts

---

## 8. Legacy data & migration

| Topic | Action |
|-------|--------|
| Existing orders without `inventoryConsumption` | Partial return restock uses **LIFO** fallback (no data migration required) |
| Existing suppliers | Opening balance once via UI; blocked if `openingBalanceRecorded` already set |
| Hardened cutover | Set `users/{uid}.securityMode = 'hardened'` **after** functions deploy + `bootstrapAdminClaim` / PIN env on Functions |
| Old open shifts | Unchanged; on-duty rules from prior P0 still apply |

No destructive migrations were added.

---

## 9. Remaining risks

1. **Emulator E2E not executed** in this environment — financial correctness on server path must be verified before go-live.
2. **Legacy production** still allows full client writes until hardened rules replace `firestore.rules`.
3. **Employee server PIN** requires `EMPLOYEE_PIN` on Functions + `REACT_APP_VERIFY_EMPLOYEE_PIN_ON_SERVER=true`; otherwise employee JWT may remain `admin` if only admin logged in.
4. **Payroll legacy client path** — enhanced on server; align legacy `payrollService.js` cash/idempotency fully if you stay on legacy mode long term (server path is authoritative in hardened mode).
5. **Supplier ledger UI** — opening balance reflected in `supplier.balance`; dedicated ledger row for opening doc not yet merged into `supplierLedgerEntries` (balance display is correct).

---

## 10. Production deployment requirements (after your approval)

1. **Backup** Firestore (export).
2. Deploy **Functions** (`firebase deploy --only functions`) with env: `EMPLOYEE_PIN`, `VAULT_PIN`.
3. Run **`bootstrapAdminClaim`** once per manager account; re-login.
4. Deploy **`firestore.rules.hardened`** as production rules (replace legacy) when checklist in `docs/SECURITY-REMEDIATION-PLAN.md` is signed off.
5. Set tenant **`securityMode: 'hardened'`** on `users/{uid}`.
6. SPA env: `REACT_APP_VERIFY_EMPLOYEE_PIN_ON_SERVER=true`, optional `REACT_APP_USE_FINANCIAL_CALLABLES=true`, rebuild & redeploy hosting.
7. Manual smoke: partial return, payroll payment, check collect, opening balance (once), cashier SDK write denial test.

---

## 11. Stop line

Per your instructions: **no deploy, no commit, no push, no production rules/data changes** were performed in this session. Review this report and approve the production migration sequence before cutover.

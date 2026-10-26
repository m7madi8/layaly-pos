# Supplier payment workflow (Layali POS)

## Files changed

| Area | Files |
|------|--------|
| Accounting | `src/utils/supplierAccounting.js`, `src/utils/supplierAccounting.test.js`, `src/utils/supplierAccounting.ledger.test.js` |
| Service | `src/services/supplierPaymentService.js` |
| Cash shift | `src/services/cashShiftService.js` (`recordCashWithdrawalInTransaction`, `expenseId` on movements) |
| Config / i18n | `src/expenseConfig.js`, `src/i18n.js` |
| UI | `src/components/SupplierTraderDetailModal.js`, `src/components/SupplierSearchSelect.js`, `src/App.js` |

## Supplier profile workflow

1. **التجار** → click a trader row → detail modal.
2. Shows **الرصيد المستحق** (payable), ledger (purchases vs payments), **دفع للتاجر**.
3. Payment form: amount, method (نقداً / تحويل بنكي), date, notes; confirmation shows balance after payment.
4. Success shows **رقم السند** (`paymentRef`, e.g. `SP-YYYYMMDD-XXXXXX`).
5. Opening the profile runs **balance reconcile** from expense history for legacy suppliers.

## Expense workflow

1. **المصروفات** → إضافة مصروف → نوع **صرف للتاجر**.
2. Searchable supplier dropdown (by `supplierId`), amount, payment method, date, notes.
3. Same atomic payment pipeline as the profile button.

## Accounting behavior

| Event | Expense record | Supplier `balance` | Cash shift | Reports (`totalExpenses`) |
|-------|----------------|----------------------|------------|---------------------------|
| Purchase (`section: purchase`) | Yes | +amount | No | Included (COGS/purchase) |
| Supplier payment (`section: supplier_payment`) | Yes | −amount | Withdrawal if نقداً | **Excluded** (`excludeFromReportTotals`) to avoid double-count with purchases |

Payments are **not** purchases: no stock or inventory updates.

## Duplicate-payment protection

- Client: submit lock + `supplierPaymentIdempotency/{key}` in the same Firestore transaction as the expense.
- Retry with the same key returns the existing `expenseId` without a second write.
- Validation rejects non-positive amounts and missing/unknown suppliers.

## Tests run

```
npx react-scripts test --watchAll=false \
  src/utils/supplierAccounting.test.js \
  src/utils/supplierAccounting.ledger.test.js \
  src/config/validateProductionEnv.test.js
→ 3 suites, 11 tests passed

npm run build → success (prebuild env guard passed)
```

## Limitations

- **No trusted Cloud Function** for supplier payments yet; uses client Firestore transactions (same as existing expenses/purchases). Not suitable for hardened `securityMode` without a callable.
- **Employee role** cannot access التجار/المصروفات (unchanged).
- **Cash movement** requires an open cash shift; payment still saves if shift is closed (user is warned), matching customer payment behavior.
- **Edit** of supplier payments is disabled; delete reverses balance and attempts cash deposit for cash payments.
- `REACT_APP_*` supplier PIN secrets are unrelated to this feature.

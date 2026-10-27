# Employee benefit workflow (استفادة الموظفين)

## Files

| Area | Files |
|------|--------|
| Cash day | `src/utils/cashDayPeriod.js`, `src/utils/cashDayPeriod.test.js` |
| Accounting | `src/utils/employeeBenefitAccounting.js`, `src/utils/employeeBenefitAccounting.test.js` |
| Services | `src/services/staffMembersService.js`, `src/services/employeeBenefitService.js` |
| UI | `src/components/StaffSearchSelect.js`, `src/components/EmployeeBenefitFields.js`, `src/components/EmployeeBenefitsPanel.js` |
| Config | `src/expenseConfig.js`, `src/i18n.js`, `src/App.js` |

## Staff records

- Collection: `users/{uid}/staffMembers`
- Seeded once via `ensureDefaultStaffMembers` (seven cafe staff, limits 20₪ or 5₪)
- Match by normalized name — no duplicates on re-run
- Limits editable in **Settings → حدود استفادة موظفي المقهى**

## Cash day period

- Uses `CASH_DAY_START_HOUR` (12:00) from `cashDayGate.js`
- Key: `getCashDayKey()` — before noon counts as previous cash day
- Usage counter: `users/{uid}/staffBenefitDaily/{staffId}__{cashDayKey}` (`usedTotal`)
- Approved benefits also stored in `employeeBenefits` for audit

## Recording

1. **المصروفات → إضافة مصروف → استفادة الموظفين**
2. Select staff (search), see limit / used / remaining
3. **كاش**: requires open cash shift; one `withdrawal` via `appendCashMovementInTransaction`; expense row `section: employee_benefit`
4. **أصناف**: stock + recipe ingredients deducted; value from `product.cost` / `costFromWeight`; no cash movement; no `orders`

## Limits & override

- `usedTotal` updated atomically in the same Firestore transaction as the benefit
- Over limit: blocked unless `userRole === 'admin'` + mandatory `overrideReason`
- Permission enforced in `validateBenefitInput` / `assertBenefitPermission` (client); Firestore rules remain owner-only (same as rest of POS)

## Cancel

- **سجل استفادة الموظفين → إلغاء** (admin)
- Sets `status: cancelled`, reverses daily usage, restores stock or posts cash `deposit` on open shift
- Expense marked `cancelled: true` (excluded from `sumReportExpenses`)

## Idempotency

- `users/{uid}/employeeBenefitIdempotency/{key}` in transaction (client key `emp_ben_*`)

## Security gap (documented)

- No dedicated Cloud Function yet; same trust model as supplier payments until `REACT_APP_TRUSTED_*` rollout.

## Manual QA

1. Open cash shift
2. Record 5₪ cash for رضا — success
3. Try 1₪ more same cash day — reject
4. Record inventory lines — stock down, no cash withdrawal
5. Cancel — usage restored

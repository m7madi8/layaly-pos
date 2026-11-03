# PHASE 1 — Employees & Financial HR

## Delivered

- Extended `staffMembers` with optional profile fields (`status`, `active`, `profileVersion`, `phone`, `notes`, `baseSalary`, …) via `employeeService.js` and idempotent `migrateEmployeeProfilesV1`.
- Admin UI: **الموظفين** (`EmployeesView`) with profile tabs, benefit history, payroll accruals/advances listing.
- On-duty enforcement in `employeeBenefitService` + `EmployeeBenefitFields` (`filterStaffByOnDuty`).
- Payroll/advances collections and `payrollService.js` (accrual, payment with linked expense `staffMemberId` / `payrollAccrualId`).
- FIFO COGS on inventory benefits (`cogsAmount` on benefit doc).

## Tests

- `tests/shiftOnDuty.unit.test.js`
- Existing benefit/accounting tests remain valid; legacy shifts without `onDutyStaffIds` stay unrestricted.

## Notes

- Personal consumption / employee POS pricing helpers exist (`employeePricing.js`); full POS wiring is incremental.
- Production: no rules deploy; HR writes remain client-side like other modules.
